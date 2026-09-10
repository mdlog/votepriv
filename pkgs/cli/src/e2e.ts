// `pnpm cli e2e` — uji end-to-end tiga pemilih di preview. Skrip tingkat-atas:
// TIDAK mengekspor apa pun, tidak boleh diimpor dari mana pun.
//
// LAMANYA: sekitar 100-110 menit, dan sebagian besarnya adalah MENUNGGU. Dua
// penantian tidak bisa dihindari: sampai voteDeadline lewat (60 menit sejak
// metadata disusun) dan sampai tallyDeadline lewat (95 menit sejak itu).
// Kontrak membandingkan deadline terhadap WAKTU BLOK jaringan, dan waktu blok
// jaringan publik tidak bisa dimajukan dari klien. Simulator bisa menyuntikkan
// waktu; preview tidak. Itulah tepatnya yang membuat uji ini bernilai.
//
// Fix Round 3: MENIT_VOTE/MENIT_TALLY naik +15 menit masing-masing (dari
// 45/80 ke 60/95) dibanding draf sebelumnya, supaya SISA_MINIMAL_VOTE bisa
// disetel >= biaya TERBURUK MUTLAK satu iterasi loop coblos (835 detik),
// bukan sekadar biaya ekspektasinya (~480 detik) — lihat komentar lengkap
// di atas SISA_MINIMAL_VOTE. Jendela pembukaan suara (MENIT_TALLY-MENIT_VOTE)
// tetap 35 menit persis seperti semula; hanya total run yang lebih panjang.
//
// SEBELAS TRANSAKSI, masing-masing dengan proof ZK sungguhan 5-20 detik plus
// finalisasi node dan indexer: deploy registry, deploy ballot, registerVoters,
// register ke registry, 3x castVote, 3x tallyVote, finalize. Setiap await ke
// jaringan dibungkus denganBatasWaktu, jadi jeda panjang berakhir dengan pesan
// dan bukan dengan diam tak berujung.
//
// SATU PEMILIH SATU STORE. Private state VotePriv berbentuk
// Record<alamatBallot, ...>, bukan Record<pemilih, ...> — midnight-js membaca
// SATU blob di BallotPrivateStateId sebelum tiap pemanggilan dan menulis
// balik ke id yang sama, sehingga tiga pemilih pada SATU ballot di satu store
// akan saling menimpa. Setiap pemilih di sini mendapat direktori LevelDB
// sendiri. Itu sekaligus menghindari LEVEL_LOCKED, karena provider
// membuka-menutup seluruh LevelDB pada tiap operasi.
//
// SEMUANYA BERURUTAN, tidak pernah Promise.all: selain lock LevelDB,
// penyeimbangan unshielded tidak memindahkan UTXO ke pending, sehingga dua
// transaksi yang diseimbangkan sebelum yang pertama terlihat di chain bisa
// memilih UTXO yang sama.
//
// SELURUH TUBUH SKRIP (bagian 1-11) dibungkus try/catch (Fix Round 1, FIX 2):
// sebelum ini, hanya tiga blok ulangiSampai yang memanggil hentikanWallet
// pada kegagalan — setiap pastikan(), setiap timeout denganBatasWaktu, dan
// setiap assert kontrak yang lolos sampai ke sini akan berakhir sebagai
// unhandled rejection, dan simpanCacheWallet/wallet.stop() tidak pernah
// berjalan. Lihat komentar di atas hentikanWallet (bootstrap.ts): checkpoint
// yang tidak tersimpan berarti sesi BERIKUTNYA harus menyinkronkan ulang
// sepanjang durasi sesi ini — untuk uji ~90 menit, itu ~90 menit tersinkron
// yang terbuang percuma. catch di bawah menutup wallet dengan tertib pada
// SETIAP jalur kegagalan yang belum menanganinya sendiri, dan tetap
// melaporkan galat aslinya, bukan menelannya.
import crypto from "node:crypto";
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import { Ballot, emptyBallotPrivateState } from "contract";
import {
  buatCredential,
  daunEligibility,
  detikDariSekarang,
  detikSekarang,
  MENIT,
  type MetadataBallot,
} from "shared";
import { bacaArtefak, tulisArtefak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import {
  bacaLedgerBallot,
  catatKeRegistry,
  daftarkanVoter,
  deployBallot,
  deployRegistry,
  kunciAdmin,
  temukanBallot,
  temukanRegistry,
  type HasilDeployRegistry,
} from "./deploy.ts";
import type { BallotC } from "./kontrak.ts";
import { periksaFaseTerfinalisasi, periksaHasilTallyAkhir, periksaTallyKosongSelamaVoting } from "./periksa.ts";
import { rakitProvidersBallot, rakitProvidersRegistry, type ProvidersBallot } from "./providers.ts";
import {
  cobaSampaiWaktuBlokCocok,
  pastikan,
  POLA_BELUM_WAKTUNYA,
  ringkasTallies,
  tungguSampaiDetik,
  ulangiSampai,
} from "./tunggu.ts";
import { acak32, bukaSuara, finalisasi, pilih, siapkanPemilih, siapkanPembukaan } from "./vote.ts";

const PILIHAN = [0n, 2n, 0n] as const; // hasil yang diharapkan: opsi0=2, opsi1=0, opsi2=1
const JUMLAH_PEMILIH = PILIHAN.length;

// Lihat tabel anggaran waktu di rencana (Task 6 Step 5). Jangan menurunkan
// angka-angka ini tanpa menghitung ulang tabel itu — dan lihat komentar di
// atas SISA_MINIMAL_VOTE di bawah: sejak Fix Round 3, MENIT_VOTE/MENIT_TALLY
// dan kedua guard SISA_MINIMAL_* terikat satu invarian bersama, bukan lagi
// angka independen.
const MENIT_VOTE = 60;
const MENIT_TALLY = 95;
/**
 * Cukup untuk SATU iterasi loop coblos: pembacaan eligibility path (dengan
 * retry, lihat bagian 5) + temukanBallot + castVote.
 *
 * INVARIAN (Fix Round 3): guard ini HARUS >= biaya TERBURUK MUTLAK satu
 * iterasi, bukan biaya ekspektasi. Round 1 (240->540) dan Round 2 (analisis
 * kejujuran tabel) sama-sama memakai biaya EKSPEKTASI retry (~30 detik) dan
 * mendokumentasikan selisihnya ke biaya terburuk mutlak (385 detik) sebagai
 * "risiko residual" alih-alih menghilangkannya. Review menolak itu: rantai
 * akibatnya lebih penting daripada probabilitasnya — guard lolos di 540,
 * iterasi berjalan sampai 835, castVote tereksekusi MELEWATI voteDeadline,
 * dan itu throw KERAS (pesan "Batas waktu pemungutan suara sudah lewat"
 * sengaja tidak ada di POLA_BELUM_WAKTUNYA, `pilih` tidak dibungkus
 * cobaSampaiWaktuBlokCocok) yang mematikan run dengan DUA dari TIGA suara
 * masuk, pada ballot yang sudah dibayar tDUST sungguhan, setelah operator
 * menunggu hampir satu jam. Persis kegagalan yang FIX 1 (Ronde 1) coba
 * cegah, satu ronde sebelumnya — mendokumentasikan tidak mencegahnya, hanya
 * mempercepat post-mortem-nya.
 *
 * KOMPONEN BIAYA TERBURUK MUTLAK satu iterasi:
 *   - retry eligibility path (ulangiSampai, bagian 5, maks 6 x jeda 5 detik,
 *     tiap percobaan dibatasi BATAS_MS.bacaIndexer = 60 detik bila indexer
 *     benar-benar tidak menjawab): 6 x 60 + 5 x 5 = 385 detik
 *   - temukanBallot (batas mutlak BATAS_MS.temukan)               : 300 detik
 *   - castVote (biaya TERUKUR, bukan batas mutlak BATAS_MS.panggilBerat
 *     yang 15 menit — proof+finalisasi sungguhan terukur ~2,5 menit di
 *     preview; lihat catatan bawah untuk kenapa castVote TIDAK ikut
 *     ditabelkan mutlak)                                          : 150 detik
 *   TOTAL                                                          = 835 detik
 *
 * DUA JALAN JUJUR dipertimbangkan (bukan mendokumentasikan celahnya):
 *   (a) Persempit retry supaya batas terburuknya <= 540-300-150=90 detik.
 *       DITOLAK: memerlukan timeout per-percobaan jauh lebih ketat daripada
 *       BATAS_MS.bacaIndexer KHUSUS pemanggilan ini — menduplikasi logika
 *       bacaLedgerBallot di sini, atau menambah parameter opsional ke
 *       fungsi bersama itu di deploy.ts (berkas Task 4/5 yang sudah diuji
 *       tuntas, 22 uji, risiko perubahan tidak sepadan). Lebih penting:
 *       retry yang diperketat SEKADAR SUPAYA ARITMETIKANYA MUAT, tapi
 *       terlalu pendek untuk menampung keterlambatan indexer sungguhan
 *       (alasan retry ini ada), akan mengubah kegagalan pathological langka
 *       menjadi kegagalan UMUM — lebih buruk daripada keadaan sekarang.
 *   (b) Besarkan jendela supaya guard bisa disetel >= 835 detik TANPA
 *       mengorbankan cakupan retry. DIPILIH.
 *
 * MENIT_VOTE dinaikkan 45 -> 60 (+15 menit), dan MENIT_TALLY 80 -> 95
 * (+15 menit juga, MENJAGA jendela pembukaan suara MENIT_TALLY-MENIT_VOTE
 * tetap 35 menit persis seperti semula — lihat catatan di atas
 * SISA_MINIMAL_TALLY untuk pembuktian sisi itu tidak terganggu). Konsekuensi
 * pada run yang sudah ~85-95 menit: +15 menit menjadi ~100-110 menit —
 * dinyatakan eksplisit di komentar kepala berkas, bukan sesuatu yang
 * ditemukan sendiri oleh operator di tengah jalan.
 *
 * Guard disetel 900 detik: 835 dibulatkan ke atas + margin 65 detik (gaya
 * yang sama seperti Ronde 1: hitung komponen, bulatkan ke atas dengan
 * margin eksplisit, bukan angka bulat yang ditebak).
 *
 * VERIFIKASI jendela 60 menit (3600 detik) MUAT untuk KASUS TERBURUK MUTLAK
 * dirantai PENUH di ketiga iterasi berturut-turut (bukan kasus ekspektasi):
 *   pra-loop (deployBallot 150 + daftarkanVoter 150 + temukanRegistry-
 *     opsional 300 + catatKeRegistry 150)              = 750 detik
 *   jendela = MENIT_VOTE x 60 = 60 x 60                = 3600 detik
 *   iterasi ke-0: sisa 3600-750=2850 > 900 (margin 1950); konsumsi
 *     terburuk 835 -> sisa 2015
 *   iterasi ke-1: sisa 2015 > 900 (margin 1115); konsumsi terburuk 835 ->
 *     sisa 1180
 *   iterasi ke-2: sisa 1180 > 900 (margin 280); konsumsi terburuk 835 ->
 *     sisa AKHIR 345 detik (~5,75 menit) — bahkan bila SEMUA TIGA pemilih
 *     sama-sama mengalami kasus terburuk mutlak berturut-turut.
 * Guard 900 >= biaya terburuk 835 di SETIAP titik pemeriksaan: invarian
 * terpenuhi secara aritmetis pada kasus terburuk, bukan cuma kasus biasa.
 */
const SISA_MINIMAL_VOTE = 900;
/**
 * Cukup untuk satu tallyVote + seluruh anggaran ulang cobaSampaiWaktuBlokCocok.
 *
 * Fix Round 3 — diperiksa ulang setelah MENIT_VOTE/MENIT_TALLY naik (lihat
 * SISA_MINIMAL_VOTE): jendela bagian 8 (MENIT_TALLY - MENIT_VOTE) tetap
 * 35 menit PERSIS seperti semula (95-60=35, sama seperti 80-45=35
 * sebelumnya) — dipilih TIDAK membiarkan jendela ini menyempit, justru
 * MENIT_TALLY dinaikkan bersamaan dengan MENIT_VOTE untuk menjaganya.
 *
 * BERBEDA dari SISA_MINIMAL_VOTE: retry loop di sini (cobaSampaiWaktuBlokCocok,
 * dipandu POLA_BELUM_WAKTUNYA) TIDAK punya kerentanan yang sama. Pesan yang
 * membuatnya mengulang adalah kegagalan ASSERT LOKAL (dibuktikan Step 1:
 * gagal saat eksekusi circuit, sebelum proof, sebelum submitTx) — cepat,
 * tanpa panggilan jaringan sungguhan — bukan pembacaan indexer yang bisa
 * menggantung sampai BATAS_MS.bacaIndexer (60 detik) per percobaan seperti
 * retry eligibility path. Jadi biaya TERUKUR/EKSPEKTASI di sini (bukan
 * biaya terburuk mutlak) tetap basis yang tepat, konsisten dengan bagaimana
 * tabel Step 5 sendiri menabelkan castVote.
 *
 * Biaya terukur satu iterasi (dari tabel Step 5, tidak berubah oleh Fix
 * Round 3): bacaLedgerBallot 12 + tallyVote 150 + jeda-ulang
 * cobaSampaiWaktuBlokCocok (maks 6 x 20 detik, biasanya jauh lebih sedikit)
 * 120 = 282 detik — sudah divalidasi review terhadap guard 300 (margin 18
 * detik pada level KOMPONEN).
 *
 * VERIFIKASI ULANG pada level JENDELA (35 menit = 2100 detik, TIDAK
 * berubah): buffer tungguSampaiDetik (~60 detik) dikonsumsi lebih dulu,
 * sisa 2100-60=2040 detik di awal loop.
 *   iterasi ke-0: sisa 2040 > 300 (margin 1740); konsumsi ~282 -> sisa 1758
 *   iterasi ke-1: sisa 1758 > 300 (margin 1458); konsumsi ~282 -> sisa 1476
 *   iterasi ke-2: sisa 1476 > 300 (margin 1176); konsumsi ~282 -> sisa
 *     AKHIR ~1194 detik (~19,9 menit — cocok dengan "Sisa ~20 menit" di
 *     rencana Task 6 Step 5, tidak terganggu oleh kenaikan MENIT_VOTE).
 * Guard 300 TETAP AMAN: margin terketat (1176 detik sebelum pemilih
 * terakhir) jauh di atas nol dan sama sekali tidak menyempit dibanding
 * sebelum Fix Round 3, karena jendela 35 menitnya sendiri dijaga tetap sama.
 */
const SISA_MINIMAL_TALLY = 300;

const sesi = await siapkanSesi();
const { config, log, ctx, kp } = sesi;

try {
  // ── 1. Registry ───────────────────────────────────────────────────────────
  //
  // Bila registry di-deploy pada proses INI, handle-nya dipakai ulang; bila ia
  // datang dari sesi sebelumnya, barulah temukanRegistry dipanggil. Membuang
  // handle deploy berarti satu watchForDeployTxData + tiga query indexer yang
  // percuma, di dalam jendela waktu yang sudah dihitung ketat.
  const providersRegistry = await rakitProvidersRegistry(kp, "admin");
  const alamatTersimpan = bacaArtefak(config.networkId)?.registry;

  let registryDeploy: HasilDeployRegistry | undefined;
  let alamatRegistry: string;
  if (alamatTersimpan === undefined) {
    registryDeploy = await deployRegistry(providersRegistry, log);
    alamatRegistry = registryDeploy.alamat;
  } else {
    alamatRegistry = alamatTersimpan;
  }
  tulisArtefak(config.networkId, { registry: alamatRegistry });
  log.info({ alamatRegistry, dariSesiIni: registryDeploy !== undefined }, "Registry siap");

  // ── 2. Ballot ─────────────────────────────────────────────────────────────
  const metadata: MetadataBallot = {
    title: "Uji E2E VotePriv",
    description: "Tiga pemilih, tiga opsi, di jaringan preview.",
    community: "Midnight Builders",
    options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
    voteDeadline: detikDariSekarang(MENIT_VOTE * MENIT), // DETIK, bukan milidetik
    tallyDeadline: detikDariSekarang(MENIT_TALLY * MENIT), // > voteDeadline
    quorumPercent: 60, // <= 100
    eligibleCount: JUMLAH_PEMILIH, // 1..1024
    eligibilityPolicy: "Tiga credential uji end-to-end",
  };

  const rahasiaAdmin = kunciAdmin(ctx); // JANGAN PERNAH di-log
  const credentials = Array.from({ length: JUMLAH_PEMILIH }, () => buatCredential());
  const salts = Array.from({ length: JUMLAH_PEMILIH }, () => acak32());

  const providersAdmin = await rakitProvidersBallot(kp, "admin");
  const { alamat: alamatBallot, kontrak: ballotAdmin } = await deployBallot(
    providersAdmin,
    metadata,
    rahasiaAdmin,
    crypto.getRandomValues(new Uint8Array(32)),
    log,
    JUMLAH_PEMILIH,
  );
  tulisArtefak(config.networkId, {
    ballot: alamatBallot,
    voteDeadline: metadata.voteDeadline.toString(),
    tallyDeadline: metadata.tallyDeadline.toString(),
    options: metadata.options,
    credentials: credentials.map((c) => Buffer.from(c).toString("hex")),
  });

  // ── 3. Pendaftaran pemilih (harus SEBELUM suara pertama) ────────────────────
  //
  // `ballotAdmin` datang dari deployContract dan private state awalnya (kunci
  // admin) sudah tertulis. Tidak ada temukanBallot di sini.
  await daftarkanVoter(ballotAdmin, credentials.map(daunEligibility), log);

  // ── 4. Catat ke registry ──────────────────────────────────────────────────
  const registry = registryDeploy?.kontrak ?? (await temukanRegistry(providersRegistry, alamatRegistry));
  await catatKeRegistry(registry, alamatBallot, log);

  // ── 5. Tiga pemilih mencoblos: opsi 0, 2, 0 ──────────────────────────────
  const providersPemilih: ProvidersBallot[] = [];
  for (let i = 0; i < JUMLAH_PEMILIH; i++) {
    providersPemilih.push(await rakitProvidersBallot(kp, `pemilih-${i}`));
  }

  // Handle per pemilih disimpan dan dipakai ULANG di bagian 8. `callTx.*`
  // membaca ulang state publik dan private pada setiap pemanggilan, jadi handle
  // yang lama tidak pernah basi — dan tiga findDeployedContract yang tidak jadi
  // dijalankan adalah tiga kali lima menit anggaran yang kembali ke jendela.
  const kontrakPemilih: FoundContract<BallotC>[] = [];

  for (let i = 0; i < JUMLAH_PEMILIH; i++) {
    const label = `pemilih-${i}`;
    const sisaDetik = Number(metadata.voteDeadline - detikSekarang());
    pastikan(
      sisaDetik > SISA_MINIMAL_VOTE,
      `Anggaran waktu habis: tinggal ${sisaDetik} detik sampai voteDeadline, tidak cukup untuk castVote ${label} (butuh ${SISA_MINIMAL_VOTE} detik). Naikkan MENIT_VOTE dan jalankan ulang.`,
    );

    // Fix Round 1, FIX 3: sebelumnya bacaLedgerBallot telanjang di sini —
    // satu-satunya pembacaan indexer di seluruh berkas yang mengasersi
    // keadaan yang BARU SAJA ditulis (registerVoters, hanya dua transaksi di
    // belakang dan cuma catatKeRegistry sebagai jeda) tanpa lewat
    // ulangiSampai. Keterlambatan indexer di titik ini akan terbaca operator
    // sebagai "pendaftaran gagal" — persis kelas kegagalan palsu yang
    // ulangiSampai memang dibuat untuk dicegah. eligibility adalah
    // HistoricMerkleTree: begitu daunnya terdaftar, path-nya tetap valid
    // selamanya, jadi mengulang pembacaan sampai indexer menyusul aman.
    const {
      nilai: jalur,
      percobaan: percobaanJalur,
      galatTerakhir: galatJalur,
    } = await ulangiSampai(
      async () =>
        (await bacaLedgerBallot(kp.publicDataProvider, alamatBallot)).eligibility.findPathForLeaf(
          daunEligibility(credentials[i]),
        ),
      (j) => j !== undefined,
      log,
      `eligibility path ${label} (menunggu indexer menyusul registerVoters)`,
      6,
      5_000,
    );
    // Fix Round 2, FIX 4: `galatTerakhir` dari ulangiSampai TIDAK dibuang
    // seperti sebelumnya (pola yang sama seperti deploy-ballot.ts:142 —
    // surface galat asli, jangan telan). Dua penyebab "jalur tetap
    // undefined" berbeda maknanya: bila SETIAP pembacaan melempar (galatJalur
    // terisi), yang gagal adalah pembacaan indexer itu sendiri, bukan
    // pendaftarannya — pesan lama ("kemungkinan besar keterlambatan indexer")
    // akan menyesatkan operator ke arah yang salah bila penyebabnya justru
    // koneksi/indexer yang benar-benar tidak menjawab.
    pastikan(
      jalur !== undefined,
      galatJalur !== undefined
        ? `Daun eligibility ${label} tidak terbaca setelah ${percobaanJalur} percobaan — PEMBACAAN INDEXER ITU SENDIRI TERUS GAGAL: ${galatJalur}. Ini soal konektivitas/indexer, bukan (belum tentu) pendaftaran yang gagal — periksa status indexer dan txId registerVoters di log.`
        : `Daun eligibility ${label} tidak ditemukan setelah ${percobaanJalur} percobaan pembacaan indexer (seluruh pembacaan BERHASIL, daunnya saja belum tampak). Ini KEMUNGKINAN BESAR keterlambatan indexer menyusul registerVoters, BUKAN pendaftaran yang gagal — periksa txId registerVoters di log sebelum menyimpulkan pendaftaran benar-benar gagal.`,
    );

    // temukanBallot menimpa private state, jadi ia dipanggil SEBELUM
    // siapkanPemilih — bukan sesudah.
    const ballot = await temukanBallot(
      providersPemilih[i],
      alamatBallot,
      emptyBallotPrivateState(new Uint8Array(32)),
    );
    kontrakPemilih.push(ballot);
    await siapkanPemilih(providersPemilih[i], alamatBallot, credentials[i], PILIHAN[i], salts[i], jalur);
    await pilih(ballot, log, label);
  }

  // ── 6. PEMERIKSAAN TERPENTING DI SELURUH BERKAS INI ────────────────────────
  //
  // Selama pemungutan suara berlangsung, chain memegang nullifier dan commitment
  // dan TIDAK ADA hasil parsial yang bisa bocor — tidak kepada penyelenggara,
  // tidak kepada siapa pun yang membaca chain. Baris-baris di bawah adalah bentuk
  // yang bisa dieksekusi dari janji itu. Kalau salah satunya harus dilonggarkan
  // suatu hari, produknya yang berubah, bukan ujinya. Pemeriksaan sesungguhnya
  // ada di periksaTallyKosongSelamaVoting (periksa.ts) — diekstrak di sana
  // (Fix Round 1, FIX 5) supaya bisa diuji dengan ledger palsu, tanpa jaringan;
  // lihat periksa.test.ts untuk uji per-assert, termasuk assert keenam
  // (tallyNullifiers.isEmpty, FIX 4) yang tidak ada di draf sebelumnya.
  //
  // CAKUPAN BUKTI (Fix Round 1, FIX 6): blok ini membuktikan bahwa TIDAK ADA
  // tally parsial pernah muncul di chain selama voting berlangsung — itu
  // klaim privasi yang nyata dan berharga. Blok ini TIDAK membuktikan bahwa
  // pilihan seorang pemilih tak bisa dikaitkan dengan pemiliknya: uji ini
  // memakai SATU wallet untuk seluruh sebelas transaksi, dan urutan indeks
  // castVote/tallyVote yang identik antar pemilih (pemilih-0..2, berurutan)
  // membuat korelasi indeks-ke-indeks memulihkan pasangan pemilih-opsi
  // dengan mudah. Itu desain sengaja untuk uji sintetis satu-operator ini —
  // BUKAN sesuatu yang dicoba dibuktikan atau disembunyikan di sini.
  //
  // PEMBACAAN DITENANGKAN LEBIH DULU. Indexer menyusul node beberapa detik;
  // membaca tepat setelah castVote ketiga bisa mengembalikan voteCount = 2 dan
  // membuat blok ini gagal dengan pesan yang berbunyi seperti kegagalan privasi
  // padahal hanya keterlambatan. voteCount === 3 dipakai sebagai syarat tenang
  // justru karena ia fakta yang paling belakangan tiba dari empat yang diperiksa.
  {
    const { nilai: lb, cocok, galatTerakhir, percobaan } = await ulangiSampai(
      () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
      (x) => x.voteCount === BigInt(JUMLAH_PEMILIH),
      log,
      `voteCount === ${JUMLAH_PEMILIH} (menunggu indexer menyusul castVote terakhir)`,
    );
    if (!cocok || lb === undefined) {
      log.error(
        { voteCount: lb?.voteCount.toString() ?? "(tidak terbaca)", galatTerakhir, percobaan },
        `voteCount tidak pernah mencapai ${JUMLAH_PEMILIH} setelah ${percobaan} pembacaan. Ini BUKAN pemeriksaan privasi yang gagal — indexer tidak pernah menampilkan ketiga suara. Periksa txId ketiga castVote di log.`,
      );
      await hentikanWallet(ctx, log);
      process.exit(1);
    }

    const tally = ringkasTallies([...lb.tallies], metadata.options.length);

    log.info(
      {
        voteCount: lb.voteCount.toString(),
        talliedCount: lb.talliedCount.toString(),
        tallyKosong: lb.tallies.isEmpty(),
        tally: tally.map(String),
        phase: lb.phase, // dicatat untuk diagnosis, TIDAK di-assert: lihat catatan di bawah
      },
      "Keadaan chain SELAMA pemungutan suara berlangsung",
    );

    periksaTallyKosongSelamaVoting(lb, JUMLAH_PEMILIH, metadata.options.length);

    // SENGAJA TIDAK ADA `pastikan(lb.phase === Ballot.BallotPhase.voting, ...)`
    // di sini, dan jangan menambahkannya. Per ballot.compact, phase hanya
    // berpindah keluar dari `voting` di dalam tallyVote atau finalize — dan
    // keduanya belum pernah dipanggil pada titik ini. Assert itu karena itu
    // tidak bisa gagal, tidak menguji apa pun tentang privasi, dan hanya
    // membuat blok ini terlihat lebih teliti daripada yang sebenarnya. phase
    // di-assert di tempat ia BISA membedakan: bagian 9 (tallying) dan
    // bagian 11 (finalized).
  }

  // ── 7. Menunggu voteDeadline benar-benar lewat ─────────────────────────────
  await tungguSampaiDetik(metadata.voteDeadline, log, "voteDeadline");

  // ── 8. Ketiga pemilih membuka suaranya ─────────────────────────────────────
  //
  // Path commitment dibangun dari state TERBARU tiap kali: `commitments` adalah
  // MerkleTree biasa, checkRoot hanya menerima root saat ini.
  //
  // Hanya siapkanPembukaan yang dipanggil — TIDAK siapkanPemilih. tallyVote
  // membaca get_my_option, get_my_salt, dan commitment_path saja; credential dan
  // eligibility path tidak pernah disentuhnya. Memanggil siapkanPemilih di sini
  // dengan `jalur` (yang adalah path COMMITMENT) akan menuliskannya ke
  // `eligibilityPaths` — lolos tsc karena kedua path bertipe sama, dan tidak
  // terlihat hanya karena tidak ada yang membacanya.
  for (let i = 0; i < JUMLAH_PEMILIH; i++) {
    const label = `pemilih-${i}`;

    // Penjaga anggaran, kembaran dari yang ada di loop coblos. tallyVote
    // menegakkan blockTimeLessThan(tallyDeadline), dan pesannya ("Batas waktu
    // pembukaan suara SUDAH lewat") sengaja tidak ada di POLA_BELUM_WAKTUNYA —
    // jadi melewati batas berarti run mati dengan dua dari tiga suara terbuka
    // dan bagian 9 tidak akan pernah tercapai.
    const sisaDetik = Number(metadata.tallyDeadline - detikSekarang());
    pastikan(
      sisaDetik > SISA_MINIMAL_TALLY,
      `Anggaran waktu habis: tinggal ${sisaDetik} detik sampai tallyDeadline, tidak cukup untuk tallyVote ${label} (butuh ${SISA_MINIMAL_TALLY} detik). Naikkan MENIT_TALLY dan jalankan ulang.`,
    );

    const lb = await bacaLedgerBallot(kp.publicDataProvider, alamatBallot);
    const commitment = Ballot.pureCircuits.vote_commitment(PILIHAN[i], salts[i]);
    const jalur = lb.commitments.findPathForLeaf(commitment);
    pastikan(jalur !== undefined, `Commitment ${label} tidak ditemukan di pohon commitments`);

    await siapkanPembukaan(providersPemilih[i], alamatBallot, PILIHAN[i], salts[i], jalur);

    // Jam lokal boleh sudah lewat sementara waktu blok belum. Ulangi HANYA untuk
    // kegagalan itu — dan hanya sebanyak yang muat di anggaran (6 x 20 detik).
    await cobaSampaiWaktuBlokCocok(
      () => bukaSuara(kontrakPemilih[i], log, label),
      log,
      POLA_BELUM_WAKTUNYA,
      6,
      20_000,
    );
  }

  // ── 9. Hasil akhir: 2 / 0 / 1 ───────────────────────────────────────────────
  {
    const { nilai: lb, cocok, galatTerakhir, percobaan } = await ulangiSampai(
      () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
      (x) => x.talliedCount === BigInt(JUMLAH_PEMILIH),
      log,
      `talliedCount === ${JUMLAH_PEMILIH} (menunggu indexer menyusul tallyVote terakhir)`,
    );
    if (!cocok || lb === undefined) {
      log.error(
        { talliedCount: lb?.talliedCount.toString() ?? "(tidak terbaca)", galatTerakhir, percobaan },
        `talliedCount tidak pernah mencapai ${JUMLAH_PEMILIH}. Periksa txId ketiga tallyVote di log terhadap indexer.`,
      );
      await hentikanWallet(ctx, log);
      process.exit(1);
    }

    // Dihitung dari PILIHAN, bukan literal terpisah: opsiDiharapkan[k] = berapa
    // pemilih yang PILIHAN-nya sama dengan k. Untuk PILIHAN = [0n, 2n, 0n] ini
    // menghasilkan [2n, 0n, 1n] — dua suara opsi0, nol opsi1, satu opsi2.
    const opsiDiharapkan = metadata.options.map((_, k) => BigInt(PILIHAN.filter((p) => p === BigInt(k)).length));

    // Fix Round 2, FIX 5: log DITENANGKAN lebih dulu, SEBELUM pemeriksaan —
    // sebelumnya baris ini ada SESUDAH periksaHasilTallyAkhir, jadi sebuah
    // run yang gagal pada pemeriksaan itu tidak pernah mencatat array tally
    // yang justru paling dibutuhkan untuk mendiagnosis kegagalannya.
    const tally = ringkasTallies([...lb.tallies], metadata.options.length);
    log.info(
      { tally: tally.map(String), talliedCount: lb.talliedCount.toString(), phase: lb.phase },
      "Hasil setelah seluruh suara dibuka",
    );

    periksaHasilTallyAkhir(lb, metadata.options.length, opsiDiharapkan, BigInt(JUMLAH_PEMILIH));
  }

  // ── 10. Menunggu tallyDeadline, lalu finalisasi ────────────────────────────
  await tungguSampaiDetik(metadata.tallyDeadline, log, "tallyDeadline");
  await cobaSampaiWaktuBlokCocok(() => finalisasi(ballotAdmin, log), log, POLA_BELUM_WAKTUNYA, 6, 20_000);

  // ── 11. Bukti akhir ─────────────────────────────────────────────────────────
  {
    const { nilai: lb, cocok, galatTerakhir } = await ulangiSampai(
      () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
      (x) => x.phase === Ballot.BallotPhase.finalized,
      log,
      "phase === finalized (menunggu indexer menyusul finalize)",
    );
    if (!cocok || lb === undefined) {
      log.error({ phase: lb?.phase, galatTerakhir }, "phase tidak pernah terbaca finalized dari indexer.");
      await hentikanWallet(ctx, log);
      process.exit(1);
    }

    periksaFaseTerfinalisasi(lb);
    const tally = ringkasTallies([...lb.tallies], metadata.options.length);
    log.info(
      { alamatBallot, alamatRegistry, tally: tally.map(String), phase: lb.phase },
      "UJI END-TO-END LULUS: tiga suara masuk, tally kosong selama pemungutan suara, hasil akhir 2-0-1, ballot difinalisasi",
    );
    // Fix Round 1, FIX 6: klaim eksplisit, bukan tersirat dari baris di atas.
    log.info(
      "CAKUPAN BUKTI run ini: TERBUKTI — tidak ada tally parsial pernah muncul di chain selama pemungutan suara berlangsung. TIDAK TERBUKTI — bahwa pilihan seorang pemilih tak terkait dengan pemilih itu; satu wallet menandatangani seluruh sebelas transaksi dengan urutan indeks pemilih yang identik di castVote maupun tallyVote, sehingga korelasi indeks-ke-indeks memulihkan pasangan pemilih-opsi.",
    );
  }

  await tutupSesi(sesi, 0);
} catch (e) {
  // Fix Round 1, FIX 2: jaring pengaman generik. Ketiga blok ulangiSampai di
  // atas sudah menangani kegagalannya sendiri (log.error + hentikanWallet +
  // exit(1)) dan tidak pernah sampai ke sini. Semua jalur LAIN — setiap
  // pastikan() (termasuk kedua penjaga anggaran waktu), setiap timeout
  // denganBatasWaktu, dan setiap assert kontrak yang lolos sebagai galat JS —
  // sebelumnya jatuh sebagai unhandled rejection di sini dan TIDAK PERNAH
  // menutup wallet dengan tertib.
  // Fix Round 2, FIX 5: `(e as Error).message` MELEMPAR bila `e` sungguhan
  // `null`/`undefined` (mis. `throw null`) — cast TypeScript tidak mengubah
  // nilai runtime, jadi `.message` pada `null` adalah TypeError yang
  // menimpa galat asli persis di dalam penanganannya sendiri. `instanceof
  // Error` adalah pemeriksaan runtime yang aman untuk SEMUA nilai yang bisa
  // dilempar; `.stack` dipertahankan saat ada (sebelumnya selalu dibuang,
  // padahal ia memuat `.message` plus lokasi lemparan).
  const pesanGalat = e instanceof Error ? (e.stack ?? e.message) : String(e);
  log.error(
    { err: pesanGalat },
    "Uji end-to-end berhenti karena galat tak tertangani (lihat pesan di atas untuk detail). Menutup wallet dengan tertib — menyimpan checkpoint sinkronisasi — sebelum keluar.",
  );
  await hentikanWallet(ctx, log);
  process.exit(1);
}

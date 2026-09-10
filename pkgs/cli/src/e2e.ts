// `pnpm cli e2e` — uji end-to-end tiga pemilih di preview. Skrip tingkat-atas:
// TIDAK mengekspor apa pun, tidak boleh diimpor dari mana pun.
//
// LAMANYA: sekitar 85-95 menit, dan sebagian besarnya adalah MENUNGGU. Dua
// penantian tidak bisa dihindari: sampai voteDeadline lewat (45 menit sejak
// metadata disusun) dan sampai tallyDeadline lewat (80 menit sejak itu).
// Kontrak membandingkan deadline terhadap WAKTU BLOK jaringan, dan waktu blok
// jaringan publik tidak bisa dimajukan dari klien. Simulator bisa menyuntikkan
// waktu; preview tidak. Itulah tepatnya yang membuat uji ini bernilai.
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
// angka-angka ini tanpa menghitung ulang tabel itu.
const MENIT_VOTE = 45;
const MENIT_TALLY = 80;
/**
 * Cukup untuk SATU iterasi loop coblos: pembacaan eligibility path (dengan
 * retry, lihat bagian 5) + temukanBallot + castVote pada kecepatan terukur.
 *
 * Fix Round 1, FIX 1: nilai sebelumnya (240 detik) lebih kecil daripada
 * pekerjaan yang justru diklaim komentar lama bisa ditampungnya. Tabel
 * anggaran Step 5 menyatakan temukanBallot = 5 menit (300 detik) dan
 * castVote = 2,5 menit (150 detik) — jumlahnya SENDIRI sudah 450 detik,
 * hampir dua kali 240. Pada sisa 241 detik, guard lama lolos, temukanBallot
 * saja bisa memakai 300 detik, dan castVote lalu tereksekusi MELEWATI
 * voteDeadline — pesan "Batas waktu pemungutan suara sudah lewat" bukan
 * bagian dari POLA_BELUM_WAKTUNYA (disengaja, lihat tunggu.ts) dan `pilih`
 * tidak dibungkus cobaSampaiWaktuBlokCocok, jadi itu throw keras: run mati
 * dengan satu atau dua dari tiga suara masuk, dan bagian 6 tak pernah
 * tercapai.
 *
 * Aritmetika (kasus EKSPEKTASI — lihat catatan Fix Round 2/FIX 3 di bawah
 * untuk kasus terburuk sungguhan): 300 (temukanBallot) + 150 (castVote) =
 * 450 detik per tabel Step 5, ditambah ~30 detik biaya EKSPEKTASI untuk
 * retry pembacaan eligibility path yang baru (ulangiSampai, maks 6 x jeda
 * 5 detik — Fix Round 1/FIX 3 di bagian 5, menggantikan bacaLedgerBallot
 * telanjang yang sebelumnya ada di titik itu) = 480 detik, dibulatkan ke
 * atas dengan margin 60 detik menjadi 540 detik (9 menit).
 *
 * Fix Round 2, FIX 3 — kejujuran basis biaya: "~30 detik" di atas adalah
 * kasus EKSPEKTASI (indexer biasanya sudah menyusul di titik ini — lihat
 * komentar bagian 5), sejenis dengan castVote sendiri yang ditabelkan pada
 * 2,5 menit measured-worst, BUKAN pada batas mutlaknya (BATAS_MS.panggilBerat
 * = 15 menit). Kasus terburuk SUNGGUHAN retry ini — bila keenam percobaan
 * sama-sama menyentuh batas BATAS_MS.bacaIndexer (60 detik) sebelum
 * ulangiSampai mengulang — adalah 6 x 60 + 5 x 5 (jeda antar percobaan) =
 * 385 detik per pemilih, jauh melampaui 30 detik (~13x). Bila kasus itu
 * ditabelkan pada basis yang sama seperti temukanBallot (batas mutlak,
 * bukan measured-worst) untuk KETIGA pemilih: total tabel Step 5 menjadi
 * 35,6 (asli) - 0,6 (baris bacaLedgerBallot lama yang digantikan) + 19,25
 * menit (3 x 385 detik) = 54,25 menit — melampaui jendela 45 menit sebesar
 * 9,25 menit. Dipilih TIDAK menabelkan ulang pada basis itu (opsi kedua
 * FIX 3, bukan "recost"): basis mutlak membuat jendela 45 menit mustahil
 * dipenuhi, padahal "indexer menjawab persis di detik ke-60, enam kali
 * berturut-turut, untuk satu pemilih" menandakan jaringan yang jauh lebih
 * rusak daripada yang diasumsikan SELURUH baris tabel lain — pada titik itu
 * temukanBallot dan castVote pun kemungkinan besar sudah gagal dengan
 * caranya sendiri. Risiko residual yang jujur harus diakui: guard ini
 * disusun dari biaya EKSPEKTASI satu iterasi (480 detik), bukan biaya
 * terburuk mutlak satu iterasi (385 + 300 + 150 = 835 detik) — bila retry
 * pada SATU pemilih benar-benar mengalami 385 detik itu, iterasi yang
 * SEDANG BERJALAN bisa saja tetap melewati voteDeadline walau guard-nya
 * lolos di awal. Itu bukan regresi baru, melainkan konsekuensi memilih
 * biaya measured-worst (konsisten dengan castVote) untuk baris ini.
 *
 * Jendela 45 menit MASIH MUAT dengan guard 540 pada basis EKSPEKTASI:
 * mengganti baris "bacaLedgerBallot sebelum tiap coblos" (0,6 menit di
 * tabel lama) dengan versi ber-retry menaikkan total tabel dari 35,6 ke
 * ~36,5 menit (3 x ~30 detik dibanding 3 x ~12 detik lama, selisih ~0,9
 * menit). Sisa di akhir loop: ~8,5 menit (510 detik) — ini anggaran TOTAL
 * yang tersisa setelah SELURUH pekerjaan bagian 5 selesai, sebuah angka
 * yang TIDAK dibandingkan terhadap ambang 540 detik (510 < 540 — keduanya
 * memang bukan kuantitas yang sama; draf Ronde 1 keliru menyandingkan
 * keduanya seolah 510 "jauh di atas" 540, dikoreksi di Fix Round 2/FIX 2).
 * Yang benar-benar diperiksa terhadap ambang 540 adalah SISA DETIK SAMPAI
 * voteDeadline di AWAL tiap iterasi (kasus ekspektasi): 1950 detik sebelum
 * pemilih ke-0, 1470 detik sebelum pemilih ke-1, 990 detik sebelum pemilih
 * ke-2 — ketiganya jauh di atas 540.
 */
const SISA_MINIMAL_VOTE = 540;
/** Cukup untuk satu tallyVote + seluruh anggaran ulang cobaSampaiWaktuBlokCocok. */
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

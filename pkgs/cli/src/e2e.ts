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
/** Cukup untuk satu temukanBallot + satu castVote pada kecepatan terukur. */
const SISA_MINIMAL_VOTE = 240;
/** Cukup untuk satu tallyVote + seluruh anggaran ulang cobaSampaiWaktuBlokCocok. */
const SISA_MINIMAL_TALLY = 300;

const sesi = await siapkanSesi();
const { config, log, ctx, kp } = sesi;

// ── 1. Registry ─────────────────────────────────────────────────────────────
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

// ── 2. Ballot ───────────────────────────────────────────────────────────────
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

// ── 4. Catat ke registry ────────────────────────────────────────────────────
const registry = registryDeploy?.kontrak ?? (await temukanRegistry(providersRegistry, alamatRegistry));
await catatKeRegistry(registry, alamatBallot, log);

// ── 5. Tiga pemilih mencoblos: opsi 0, 2, 0 ─────────────────────────────────
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

  const lb = await bacaLedgerBallot(kp.publicDataProvider, alamatBallot);
  const jalur = lb.eligibility.findPathForLeaf(daunEligibility(credentials[i]));
  pastikan(jalur !== undefined, `Daun eligibility ${label} tidak ditemukan di pohon on-chain`);

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

// ── 6. PEMERIKSAAN TERPENTING DI SELURUH BERKAS INI ─────────────────────────
//
// Selama pemungutan suara berlangsung, chain memegang nullifier dan commitment
// dan TIDAK ADA hasil parsial yang bisa bocor — tidak kepada penyelenggara,
// tidak kepada siapa pun yang membaca chain. Baris-baris di bawah adalah bentuk
// yang bisa dieksekusi dari janji itu. Kalau salah satunya harus dilonggarkan
// suatu hari, produknya yang berubah, bukan ujinya.
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

  // Memimpin dengan voteCount adalah yang membuat empat baris berikutnya
  // bermakna: ia membuktikan tiga suara SUDAH ada di chain sebelum kita
  // menyatakan tally-nya kosong. Tanpa itu, "kosong" bisa saja berarti
  // "kosong karena tidak ada yang masuk".
  pastikan(
    lb.voteCount === BigInt(JUMLAH_PEMILIH),
    `voteCount harus ${JUMLAH_PEMILIH}, terbaca ${lb.voteCount}`,
  );
  pastikan(lb.tallies.isEmpty(), "PRIVASI BOCOR: tallies TIDAK kosong selagi pemungutan suara berlangsung");
  pastikan(lb.tallies.size() === 0n, `PRIVASI BOCOR: tallies.size() = ${lb.tallies.size()}, harus 0`);
  pastikan(tally.every((n) => n === 0n), `PRIVASI BOCOR: ada tally bukan nol selama voting: ${tally.map(String)}`);
  pastikan(lb.talliedCount === 0n, `talliedCount harus 0 selama voting, terbaca ${lb.talliedCount}`);

  // SENGAJA TIDAK ADA `pastikan(lb.phase === Ballot.BallotPhase.voting, ...)`
  // di sini, dan jangan menambahkannya. Per ballot.compact, phase hanya
  // berpindah keluar dari `voting` di dalam tallyVote atau finalize — dan
  // keduanya belum pernah dipanggil pada titik ini. Assert itu karena itu
  // tidak bisa gagal, tidak menguji apa pun tentang privasi, dan hanya
  // membuat blok ini terlihat lebih teliti daripada yang sebenarnya. phase
  // di-assert di tempat ia BISA membedakan: bagian 9 (tallying) dan
  // bagian 11 (finalized).
}

// ── 7. Menunggu voteDeadline benar-benar lewat ──────────────────────────────
await tungguSampaiDetik(metadata.voteDeadline, log, "voteDeadline");

// ── 8. Ketiga pemilih membuka suaranya ──────────────────────────────────────
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

  const tally = ringkasTallies([...lb.tallies], metadata.options.length);
  log.info(
    { tally: tally.map(String), talliedCount: lb.talliedCount.toString(), phase: lb.phase },
    "Hasil setelah seluruh suara dibuka",
  );

  pastikan(tally[0] === 2n, `Opsi 0 harus 2 suara, terbaca ${tally[0]}`);
  pastikan(tally[1] === 0n, `Opsi 1 harus 0 suara, terbaca ${tally[1]}`);
  // member(), bukan lookup(): lookup pada kunci yang tidak ada MELEMPAR
  // "expected a cell, received null".
  pastikan(!lb.tallies.member(1n), "Opsi 1 seharusnya tidak punya entri tally sama sekali");
  pastikan(tally[2] === 1n, `Opsi 2 harus 1 suara, terbaca ${tally[2]}`);
  pastikan(lb.talliedCount === 3n, `talliedCount harus 3, terbaca ${lb.talliedCount}`);
  // Di SINI phase membedakan: tallyVote memindahkannya dari voting ke tallying.
  pastikan(lb.phase === Ballot.BallotPhase.tallying, `phase harus tallying (1), terbaca ${lb.phase}`);
}

// ── 10. Menunggu tallyDeadline, lalu finalisasi ─────────────────────────────
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

  pastikan(lb.phase === Ballot.BallotPhase.finalized, `phase harus finalized (2), terbaca ${lb.phase}`);
  const tally = ringkasTallies([...lb.tallies], metadata.options.length);
  log.info(
    { alamatBallot, alamatRegistry, tally: tally.map(String), phase: lb.phase },
    "UJI END-TO-END LULUS: tiga suara masuk, tally kosong selama pemungutan suara, hasil akhir 2-0-1, ballot difinalisasi",
  );
}

await tutupSesi(sesi, 0);

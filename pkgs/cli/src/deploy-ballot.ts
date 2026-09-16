// `pnpm cli deploy-ballot` — menerbitkan satu ballot di preview, mendaftarkan
// tiga credential, dan mencatat alamatnya ke registry. Skrip tingkat-atas:
// tidak mengekspor apa pun.
//
// VOTEPRIV_TANPA_PENDAFTARAN=1 men-deploy ballot dan mencatatnya ke registry
// TANPA membuat credential maupun mendaftarkan leaf apa pun (pola BARU —
// lihat .superpowers/register-leaves-cli.md dan pendaftaran-awal.ts).
// eligibleCount lalu dibaca dari VOTEPRIV_ELIGIBLE_COUNT (bawaan tetap 3).
// TANPA kedua env var itu, perilakunya PERSIS seperti sebelumnya.
//
// Ballot yang di-deploy di sini BERDIRI SENDIRI: `pnpm cli e2e` men-deploy
// ballotnya SENDIRI (lihat e2e.ts bagian 2) dan tidak pernah membaca alamat
// atau deadline ballot ini — keduanya dua ballot berbeda di chain, dicatat
// di dua namespace terpisah di artefak (lihat ArtefakDeploy.e2e di
// artefak.ts). Deadline di bawah karena itu bukan sesuatu yang "harus
// ditunggu" oleh uji end-to-end mana pun; ballot ini ada supaya operator
// punya satu ballot berbayar dengan tiga pemilih terdaftar untuk diperiksa
// atau dicoblos manual di luar `pnpm cli e2e`.
//
// MENIT_VOTE/MENIT_TALLY diimpor dari ./jadwal.ts — SATU sumber yang dipakai
// bersama dengan e2e.ts, supaya kedua skrip tidak lagi bisa diam-diam
// menyimpang seperti sebelum perbaikan ini (lihat komentar di jadwal.ts).
// Nilainya sengaja tidak sesingkat versi awal rencana ini (15/35 menit):
// registerVoters dan tiga castVote harus SELESAI sebelum voteDeadline, dan
// tiga tallyVote harus muat di antara voteDeadline dan tallyDeadline —
// jendela yang kekecilan berarti seluruh rangkaian transaksi berbayar
// terbuang dan harus diulang dari nol.
import crypto from "node:crypto";
import { buatCredential, daunEligibility, detikDariSekarang, MENIT, type MetadataBallot } from "shared";
import { bacaArtefak, tulisArtefak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import {
  bacaLedgerBallot,
  bacaLedgerRegistry,
  catatKeRegistry,
  deployBallot,
  kunciAdmin,
  temukanRegistry,
} from "./deploy.ts";
import { MENIT_TALLY, MENIT_VOTE } from "./jadwal.ts";
import {
  bentukFieldCredentials,
  daftarkanVoterJikaPerlu,
  kebijakanEligibility,
  modeDeployUlangAktif,
  eligibleCountDariEnv,
  modeTanpaPendaftaranAktif,
  siapkanPemilihAwal,
} from "./pendaftaran-awal.ts";
import { rakitProvidersBallot, rakitProvidersRegistry } from "./providers.ts";
import { ulangiSampai } from "./tunggu.ts";
import { bacaDustSaatIni } from "./wallet.ts";

// Pola BARU (lihat .superpowers/register-leaves-cli.md): VOTEPRIV_TANPA_PENDAFTARAN=1
// men-deploy ballot ini TANPA membuat credential dan TANPA memanggil
// daftarkanVoter — pemilih membuat credential sendiri dan mengirim leaf-nya
// lewat `pnpm cli register-leaves`. Bawaan (env TIDAK disetel) adalah
// PERILAKU LAMA yang tidak berubah: tiga credential uji dibuat dan
// didaftarkan langsung di sini, seperti sebelumnya — e2e dan pengujian yang
// ada bergantung padanya.
const tanpaPendaftaran = modeTanpaPendaftaranAktif();
const eligibleCount = eligibleCountDariEnv(); // VOTEPRIV_ELIGIBLE_COUNT, bawaan 3 (batas kontrak 1..1024 — validasiMetadata)

const sesi = await siapkanSesi();
const { config, log, ctx, kp } = sesi;

const alamatRegistry = bacaArtefak(config.networkId)?.registry;
if (alamatRegistry === undefined) {
  log.error("No registry address in the artefact yet. Run `pnpm cli deploy-registry` first.");
  await hentikanWallet(ctx, log);
  // process.exit (bukan tutupSesi) supaya tsc tahu baris di bawah tidak
  // tercapai dan `alamatRegistry` menyempit jadi string setelah blok ini.
  process.exit(1);
}

// Kembaran guard deploy-registry.ts:20 (bentuk dan konvensi env var sama
// persis): tanpa ini, menjalankan ulang `pnpm cli deploy-ballot` men-deploy
// ballot BARU dan menimpa alamat/credential ballot LAMA di artefak — ballot
// lama yang mungkin sudah dibayar dan sebagian pemilihnya sudah mencoblos
// jadi yatim, dengan alasan yang sama persis kenapa Fix 1 memisahkan
// namespace e2e dari deploy-ballot (lihat ArtefakDeploy.e2e).
const ballotSudahAda = bacaArtefak(config.networkId)?.ballot;
if (ballotSudahAda !== undefined && !modeDeployUlangAktif()) {
  log.warn(
    { alamat: ballotSudahAda },
    "A ballot is already recorded in the artefact. Set VOTEPRIV_REDEPLOY=1 to deploy a NEW ballot.",
  );
  await tutupSesi(sesi, 0);
}

// SEMUA STRING DI BAWAH INI MASUK RANTAI (args deployBallot) dan SEALED
// selamanya begitu transaksi mendarat — lihat .superpowers/audit-bahasa-metadata.md.
// HARUS Inggris: digerbang validasiBahasaMetadata (paket shared, dipanggil
// di dalam deployBallot, deploy.ts) sebelum args disusun.
// eligibilityPolicy bercabang dua: cabang tanpaPendaftaran adalah kalimat
// RAMAH PEMILIH, BUKAN instruksi CLI — pemilih membaca ini di kartu ballot,
// dan pemilih tidak menjalankan `pnpm cli register-leaves` (itu perintah
// OPERATOR, lihat register-leaves.ts). Cabang bawaan (credential dibuat CLI)
// memakai kalimat yang SAMA PERSIS dengan e2e.ts (metadata terpisah, pola
// pendaftaran identik pada cabang ini).
const metadata: MetadataBallot = {
  title: "Q4 Community Treasury",
  description: "Choose the treasury's direction of support for Q4.",
  community: "Midnight Builders",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  // DETIK sejak epoch, lewat helper shared — bukan Date.now().
  voteDeadline: detikDariSekarang(MENIT_VOTE * MENIT),
  tallyDeadline: detikDariSekarang(MENIT_TALLY * MENIT),
  quorumPercent: 60, // <= 100. Metadata saja: TIDAK ditegakkan circuit mana pun.
  eligibleCount, // 1..1024, bawaan 3 — lihat VOTEPRIV_ELIGIBLE_COUNT di atas
  eligibilityPolicy: kebijakanEligibility(tanpaPendaftaran, process.env.VOTEPRIV_INBOX_URL),
};

// Credential adalah 32 byte acak CSPRNG; daunnya dihitung circuit kontrak
// sendiri, bukan hash tandingan di TypeScript. TIDAK DIBUAT SAMA SEKALI bila
// tanpaPendaftaran (lihat siapkanPemilihAwal, pendaftaran-awal.ts) — inilah
// inti pola baru: penyelenggara tidak pernah memegang rahasia pemilih.
const { credentials, daun } = siapkanPemilihAwal(tanpaPendaftaran, eligibleCount, buatCredential, daunEligibility);

const rahasiaAdmin = kunciAdmin(ctx); // JANGAN PERNAH di-log
const nonce = crypto.getRandomValues(new Uint8Array(32));

// rakitProvidersBallot dan rakitProvidersRegistry di bawah SAMA-SAMA memakai
// namaStore "admin", jadi keduanya membuka direktori LevelDB private-state
// yang sama (lihat dirPrivateState di providers.ts, dan peringatan
// LEVEL_LOCKED-nya). Itu AMAN di sini hanya karena pemanggilannya berurutan:
// rakitProvidersBallot dipakai habis (deploy + daftarkanVoter) sebelum
// rakitProvidersRegistry dibuat. Bila kelak dipanggil bersamaan (mis.
// Promise.all), keduanya akan bertabrakan di berkas LOCK dan salah satu
// melempar LEVEL_LOCKED — jangan paralelkan pemanggilan ini.
const providersBallot = await rakitProvidersBallot(kp, "admin");
const { alamat: alamatBallot, kontrak: ballot } = await deployBallot(
  providersBallot,
  metadata,
  rahasiaAdmin,
  nonce,
  log,
  tanpaPendaftaran ? undefined : eligibleCount,
  undefined, // deployFn bawaan (deployContract asli) — lihat deploy.test.ts untuk seam ini
  { bacaDust: () => bacaDustSaatIni(ctx.wallet) },
);

// Simpan SEGERA setelah deploy sukses — pola sama seperti
// deploy-registry.ts ("Simpan alamat SEGERA setelah deploy sukses"), dan
// untuk alasan yang lebih tajam di sini: ballot sudah membayar tDUST nyata
// di titik ini, DAN ketiga credential pemilih hidup HANYA di memori proses
// (sengaja tidak pernah di-log — lihat komentar di atas `credentials`).
// Throw apa pun antara sini dan akhir skrip lama (timeout daftarkanVoter,
// temukanRegistry, catatKeRegistry, atau bacaLedgerRegistry) dulu membuat
// proses mati SEBELUM artefak ditulis — ballot yang sudah dibayar itu jadi
// tidak bisa dipakai selamanya karena credential-nya tidak pernah
// tersimpan di mana pun. Menulis di sini, sebelum registrasi apa pun,
// menutup celah itu.
const artefak = tulisArtefak(config.networkId, {
  ballot: alamatBallot,
  voteDeadline: metadata.voteDeadline.toString(),
  tallyDeadline: metadata.tallyDeadline.toString(),
  options: metadata.options,
  ...bentukFieldCredentials(credentials), // TIDAK ADA field `credentials` sama sekali bila tanpaPendaftaran
});
log.info(
  { file: `pkgs/cli/artefak/${config.networkId}.json`, ballot: artefak.ballot, selfRegistration: tanpaPendaftaran },
  tanpaPendaftaran
    ? "Ballot address saved (NO credentials — self-registration mode, VOTEPRIV_SELF_REGISTRATION=1)"
    : "Ballot address and credentials saved (this file is gitignored — the credentials are test material)",
);

// `ballot` datang langsung dari deployContract — private state awal (kunci
// admin) sudah tertulis olehnya. Tidak ada temukanBallot di sini: itu akan
// mengulang lima perjalanan indexer dan menimpa private state yang sudah benar.
//
// publicDataProvider + alamatBallot diwariskan supaya retri putus koneksi
// bisa memeriksa registeredCount (pemeriksaan PASTI, bukan sinyal DUST —
// alamat ballot di sini SUDAH diketahui, beda dari deployBallot di atas).
await daftarkanVoterJikaPerlu(tanpaPendaftaran, ballot, daun, log, {
  publicDataProvider: kp.publicDataProvider,
  alamatBallot,
});

// Sama seperti di atas: berurutan dengan rakitProvidersBallot, tidak boleh
// tumpang tindih dengannya (LEVEL_LOCKED pada direktori "admin" yang sama).
const providersRegistry = await rakitProvidersRegistry(kp, "admin");
const registry = await temukanRegistry(providersRegistry, alamatRegistry);
await catatKeRegistry(registry, alamatBallot, log, { publicDataProvider: kp.publicDataProvider, alamatRegistry });

// registryCount di sini murni kosmetik — hanya mengisi satu field log di
// bawah. Ballot (dan credential, bila ada) SUDAH aman tersimpan (tulisArtefak
// di atas), jadi kegagalan baca ini TIDAK BOLEH menggagalkan proses:
// degradasi baris log, bukan throw yang membunuh sisa skrip.
let registryCount = "(unreadable)";
try {
  const lr = await bacaLedgerRegistry(kp.publicDataProvider, alamatRegistry);
  registryCount = lr.count.toString();
} catch (e) {
  log.warn(
    { err: (e as Error).message },
    "Could not read registry.count for the log (not fatal — the ballot artefact is already saved)",
  );
}

if (tanpaPendaftaran) {
  // TIDAK ADA leaf yang didaftarkan di jalur ini (lihat daftarkanVoterJikaPerlu
  // di atas) — menunggu registeredCount mencapai eligibleCount di sini akan
  // menunggu SELAMANYA. Baca ledger sekali, terbaik-upaya, murni untuk log:
  // kegagalan baca TIDAK BOLEH menggagalkan proses (alamat sudah tersimpan).
  let ringkasanLedger = "(unreadable)";
  try {
    const lb = await bacaLedgerBallot(kp.publicDataProvider, alamatBallot);
    ringkasanLedger = `registeredCount=${lb.registeredCount}, eligibleCount=${lb.eligibleCount}, voteCount=${lb.voteCount}, phase=${lb.phase}`;
  } catch (e) {
    log.warn(
      { err: (e as Error).message },
      "Could not read the ballot ledger for the log (not fatal — the ballot artefact is already saved)",
    );
  }
  log.info(
    { address: alamatBallot, ledger: ringkasanLedger, registryCount },
    "Ballot deployed with NO leaves registered. Voters register through the inbox (`pnpm cli register-inbox`), " +
      "or you register their leaves with `pnpm cli register-leaves`.",
  );
} else {
  // Indexer tertinggal node beberapa detik. Membaca registeredCount tepat setelah
  // registerVoters sukses bisa mengembalikan 0 — itu keterlambatan, bukan
  // kegagalan. Baca ulang sampai tenang, dengan batas.
  const { nilai: lb, cocok, galatTerakhir, percobaan } = await ulangiSampai(
    () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
    (x) => x.registeredCount === BigInt(eligibleCount),
    log,
    `registeredCount === ${eligibleCount}`,
  );

  if (!cocok || lb === undefined) {
    log.error(
      { registeredCount: lb?.registeredCount.toString() ?? "(unreadable)", lastError: galatTerakhir, attempts: percobaan },
      `registeredCount never reached ${eligibleCount} after ${percobaan} reads. The ballot address and credentials ARE already saved in the artefact (written right after the deploy), so this state can still be inspected.`,
    );
    await hentikanWallet(ctx, log);
    process.exit(1);
  }

  log.info(
    {
      registeredCount: lb.registeredCount.toString(),
      eligibleCount: lb.eligibleCount.toString(),
      voteCount: lb.voteCount.toString(),
      phase: lb.phase,
      registryCount,
    },
    "Ballot ready to receive votes",
  );
}

await tutupSesi(sesi, 0);

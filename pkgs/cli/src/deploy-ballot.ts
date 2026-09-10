// `pnpm cli deploy-ballot` — menerbitkan satu ballot di preview, mendaftarkan
// tiga credential, dan mencatat alamatnya ke registry. Skrip tingkat-atas:
// tidak mengekspor apa pun.
//
// Deadline sengaja pendek dibanding ballot sungguhan, tapi TIDAK sependek
// versi awal rencana ini (15/35 menit). Uji end-to-end Task 6 harus
// benar-benar menunggu keduanya lewat: waktu blok di jaringan nyata tidak bisa
// dimajukan, jadi setiap menit di sini adalah menit yang harus ditunggu di
// sana. Terlalu pendek justru lebih mahal: registerVoters dan tiga castVote
// harus SELESAI sebelum voteDeadline, dan tiga tallyVote harus muat di antara
// voteDeadline dan tallyDeadline — jendela yang kekecilan berarti seluruh
// rangkaian transaksi berbayar terbuang dan harus diulang dari nol.
import crypto from "node:crypto";
import { buatCredential, daunEligibility, detikDariSekarang, MENIT, type MetadataBallot } from "shared";
import { bacaArtefak, tulisArtefak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import {
  bacaLedgerBallot,
  bacaLedgerRegistry,
  catatKeRegistry,
  daftarkanVoter,
  deployBallot,
  kunciAdmin,
  temukanRegistry,
} from "./deploy.ts";
import { rakitProvidersBallot, rakitProvidersRegistry } from "./providers.ts";
import { ulangiSampai } from "./tunggu.ts";

const JUMLAH_PEMILIH = 3;
const MENIT_VOTE = 45;
const MENIT_TALLY = 80;

const sesi = await siapkanSesi();
const { config, log, ctx, kp } = sesi;

const alamatRegistry = bacaArtefak(config.networkId)?.registry;
if (alamatRegistry === undefined) {
  log.error("Belum ada alamat registry di artefak. Jalankan `pnpm cli deploy-registry` lebih dulu (Task 4).");
  await hentikanWallet(ctx, log);
  // process.exit (bukan tutupSesi) supaya tsc tahu baris di bawah tidak
  // tercapai dan `alamatRegistry` menyempit jadi string setelah blok ini.
  process.exit(1);
}

const metadata: MetadataBallot = {
  title: "Q4 Community Treasury",
  description: "Pilih arah dukungan treasury pada Q4.",
  community: "Midnight Builders",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  // DETIK sejak epoch, lewat helper shared — bukan Date.now().
  voteDeadline: detikDariSekarang(MENIT_VOTE * MENIT),
  tallyDeadline: detikDariSekarang(MENIT_TALLY * MENIT),
  quorumPercent: 60, // <= 100. Metadata saja: TIDAK ditegakkan circuit mana pun.
  eligibleCount: JUMLAH_PEMILIH, // 1..1024
  eligibilityPolicy: "Tiga credential uji end-to-end",
};

// Credential adalah 32 byte acak CSPRNG; daunnya dihitung circuit kontrak
// sendiri, bukan hash tandingan di TypeScript.
const credentials = Array.from({ length: JUMLAH_PEMILIH }, () => buatCredential());
const daun = credentials.map(daunEligibility);

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
  JUMLAH_PEMILIH,
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
  credentials: credentials.map((c) => Buffer.from(c).toString("hex")),
});
log.info(
  { berkas: `pkgs/cli/artefak/${config.networkId}.json`, ballot: artefak.ballot },
  "Alamat ballot dan credential tersimpan (berkas ini di-gitignore — credential adalah bahan uji)",
);

// `ballot` datang langsung dari deployContract — private state awal (kunci
// admin) sudah tertulis olehnya. Tidak ada temukanBallot di sini: itu akan
// mengulang lima perjalanan indexer dan menimpa private state yang sudah benar.
await daftarkanVoter(ballot, daun, log);

// Sama seperti di atas: berurutan dengan rakitProvidersBallot, tidak boleh
// tumpang tindih dengannya (LEVEL_LOCKED pada direktori "admin" yang sama).
const providersRegistry = await rakitProvidersRegistry(kp, "admin");
const registry = await temukanRegistry(providersRegistry, alamatRegistry);
await catatKeRegistry(registry, alamatBallot, log);

// Indexer tertinggal node beberapa detik. Membaca registeredCount tepat setelah
// registerVoters sukses bisa mengembalikan 0 — itu keterlambatan, bukan
// kegagalan. Baca ulang sampai tenang, dengan batas.
const { nilai: lb, cocok, galatTerakhir, percobaan } = await ulangiSampai(
  () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
  (x) => x.registeredCount === BigInt(JUMLAH_PEMILIH),
  log,
  `registeredCount === ${JUMLAH_PEMILIH}`,
);

if (!cocok || lb === undefined) {
  log.error(
    { registeredCount: lb?.registeredCount.toString() ?? "(tidak terbaca)", galatTerakhir, percobaan },
    `registeredCount tidak pernah mencapai ${JUMLAH_PEMILIH} setelah ${percobaan} pembacaan. Alamat ballot dan credential SUDAH tersimpan di artefak (ditulis segera setelah deploy), jadi keadaan ini tetap bisa diperiksa.`,
  );
  await hentikanWallet(ctx, log);
  process.exit(1);
}

// registryCount di sini murni kosmetik — hanya mengisi satu field log di
// bawah. Ballot dan credential SUDAH aman tersimpan (tulisArtefak di atas),
// jadi kegagalan baca ini TIDAK BOLEH menggagalkan proses: degradasi baris
// log, bukan throw yang membunuh sisa skrip.
let registryCount = "(tidak terbaca)";
try {
  const lr = await bacaLedgerRegistry(kp.publicDataProvider, alamatRegistry);
  registryCount = lr.count.toString();
} catch (e) {
  log.warn(
    { err: (e as Error).message },
    "Gagal membaca registry.count untuk log (tidak fatal — artefak ballot sudah tersimpan)",
  );
}

log.info(
  {
    registeredCount: lb.registeredCount.toString(),
    eligibleCount: lb.eligibleCount.toString(),
    voteCount: lb.voteCount.toString(),
    phase: lb.phase,
    registryCount,
  },
  "Ballot siap menerima suara",
);

await tutupSesi(sesi, 0);

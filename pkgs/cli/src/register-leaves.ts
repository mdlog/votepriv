// `pnpm cli register-leaves <jalur-berkas-leaf>` — mendaftarkan leaf
// eligibility (cred_leaf(credential)) yang DIKIRIM PEMILIH, bukan dibuat di
// sini. Pola BARU: pemilih membuat credential-nya sendiri (di browser, task
// terpisah) dan hanya mengirim leaf-nya — 32 byte publik, karena ia memang
// akan ditulis ke rantai lewat registerVoters. Penyelenggara yang menjalankan
// perintah ini TIDAK PERNAH melihat credential siapa pun. Lihat
// .superpowers/register-leaves-cli.md untuk latar lengkap pola ini, dan
// .superpowers/signdata-determinisme.md untuk kenapa pola LAMA ("credential
// dari tanda tangan wallet") ditinggalkan.
//
// Skrip tingkat-atas: tidak mengekspor apa pun (pola sama dengan
// deploy-ballot.ts/deploy-registry.ts/e2e.ts) — dijalankan sebagai proses,
// bukan diimpor. Seluruh logika yang bisa diuji TANPA jaringan hidup di
// leaf-file.ts (uraiBerkasLeaf, validasiKuotaPendaftaran,
// periksaLeafSudahTerdaftar, pecahLeafMenjadiBatch, daftarkanSemuaBatch) —
// lihat leaf-file.test.ts untuk uji unitnya.
//
// Ballot target: alamat `ballot` dari artefak (pkgs/cli/artefak/<network>.json),
// atau VOTEPRIV_BALLOT=<alamat> bila diberikan (mis. untuk mendaftarkan leaf
// pada ballot yang bukan yang tercatat sebagai "aktif" di artefak).
import { emptyBallotPrivateState } from "contract";
import { bacaArtefak, pastikanAlamatKontrak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import { bacaLedgerBallot, kunciAdmin, temukanBallot } from "./deploy.ts";
import {
  bacaBerkasLeaf,
  daftarkanSemuaBatch,
  jalurBerkasLeafDariArgv,
  periksaLeafSudahTerdaftar,
  validasiKuotaPendaftaran,
  validasiLokalLaluSesi,
} from "./leaf-file.ts";
import { rakitProvidersBallot } from "./providers.ts";
import { ulangiSampai } from "./tunggu.ts";

// Baca dan validasi berkas leaf (jalur dari argv, format hex 64 karakter,
// duplikat internal DI DALAM berkas) DULU, SEBELUM siapkanSesi() (yang
// meminta 24 kata seed dan mensinkronkan wallet — mahal dan interaktif).
//
// Kejadian lapangan: jalur berkas yang salah (ENOENT — lihat komentar
// `bacaBerkasLeaf` di leaf-file.ts untuk sebabnya: skrip ini berjalan dari
// cwd pkgs/cli/, bukan root repo) baru ketahuan SETELAH pengguna mengetik
// seed dan wallet selesai sinkron, padahal membaca/mengurai berkas ini
// sama sekali tidak butuh keduanya. `validasiLokalLaluSesi` (leaf-file.ts)
// menegakkan urutan ini SECARA STRUKTURAL: `siapkanSesi` tidak pernah
// tereksekusi bila `bacaBerkasLeaf` di bawah melempar.
//
// Galat format/duplikat (dari uraiBerkasLeaf, lewat bacaBerkasLeaf) sengaja
// TIDAK ditangkap di sini — pola yang sama dengan validasiMetadata pada
// deploy-ballot.ts: pesan galatnya sendiri (menyebut BARIS yang salah, atau
// cwd+jalur absolut untuk ENOENT) sudah cukup menjelaskan.
const jalurBerkas = jalurBerkasLeafDariArgv();
console.log(`Membaca dan memvalidasi berkas leaf di "${jalurBerkas}" (belum menyentuh rantai, belum ada seed/wallet)...`);
const { daftar, sesi } = await validasiLokalLaluSesi(
  () => bacaBerkasLeaf(jalurBerkas),
  () => siapkanSesi(),
);
const { config, log, ctx, kp } = sesi;
log.info(
  { jalurBerkas, jumlah: daftar.length },
  "Berkas leaf valid secara format (hex 64 karakter, tanpa duplikat internal)",
);

const alamatBallotMentah = process.env.VOTEPRIV_BALLOT ?? bacaArtefak(config.networkId)?.ballot;
if (alamatBallotMentah === undefined) {
  log.error(
    "Tidak ada alamat ballot. Jalankan `pnpm cli deploy-ballot` lebih dulu, atau setel VOTEPRIV_BALLOT=<alamat>.",
  );
  await hentikanWallet(ctx, log);
  process.exit(1);
}
const alamatBallot = pastikanAlamatKontrak(alamatBallotMentah);
log.info({ alamatBallot }, "Ballot target ditentukan — siap memvalidasi terhadap rantai");

const rahasiaAdmin = kunciAdmin(ctx); // JANGAN PERNAH di-log
const providersBallot = await rakitProvidersBallot(kp, "admin");
const ballot = await temukanBallot(providersBallot, alamatBallot, emptyBallotPrivateState(rahasiaAdmin));

const ledgerSebelum = await bacaLedgerBallot(kp.publicDataProvider, alamatBallot);

// Kedua pemeriksaan WAJIB (voteDeadline belum lewat, kuota) — MASIH sebelum menyentuh
// rantai (registerVoters). Kontrak menolak keduanya juga, tapi gagal DI SINI
// jauh lebih murah daripada membakar proof ZK ~10 MB lalu ditolak.
validasiKuotaPendaftaran(ledgerSebelum, daftar.length);

const cekDuplikatRantai = periksaLeafSudahTerdaftar(daftar, ledgerSebelum.eligibility);
if (!cekDuplikatRantai.bisaDiperiksa) {
  log.warn(
    { alasan: cekDuplikatRantai.alasanTidakBisa },
    "Tidak bisa memeriksa leaf yang sudah terdaftar di pohon eligibility satu per satu — mengandalkan pemeriksaan JUMLAH (registeredCount + jumlah <= eligibleCount) saja.",
  );
} else if (cekDuplikatRantai.sudahTerdaftar.length > 0) {
  const daftarBaris = cekDuplikatRantai.sudahTerdaftar.map((e) => `baris ${e.baris} (${e.hex})`).join(", ");
  throw new Error(
    `${cekDuplikatRantai.sudahTerdaftar.length} leaf pada berkas SUDAH terdaftar di rantai: ${daftarBaris}. ` +
      "Hapus baris-baris itu dari berkas, lalu jalankan lagi.",
  );
} else {
  log.info("Tidak ada leaf pada berkas yang sudah terdaftar di rantai.");
}

log.info(
  {
    jumlahBaru: daftar.length,
    registeredCountSebelum: ledgerSebelum.registeredCount.toString(),
    eligibleCount: ledgerSebelum.eligibleCount.toString(),
  },
  "Validasi lolos — mendaftarkan leaf (batch <= 8 per transaksi lewat daftarkanVoter)",
);

await daftarkanSemuaBatch(ballot, daftar.map((e) => e.bytes), log, {
  publicDataProvider: kp.publicDataProvider,
  alamatBallot,
});

// Indexer tertinggal node beberapa detik (pola sama dengan deploy-ballot.ts).
const target = ledgerSebelum.registeredCount + BigInt(daftar.length);
const { nilai: ledgerSesudah, cocok, galatTerakhir, percobaan } = await ulangiSampai(
  () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
  (lb) => lb.registeredCount === target,
  log,
  `registeredCount === ${target}`,
);

if (!cocok || ledgerSesudah === undefined) {
  log.error(
    { registeredCount: ledgerSesudah?.registeredCount.toString() ?? "(tidak terbaca)", galatTerakhir, percobaan },
    `registeredCount tidak pernah mencapai ${target} setelah ${percobaan} pembacaan. Batch mungkin masih ` +
      "tertunda di indexer — periksa manual sebelum mendaftar ulang (leaf yang SUDAH mendarat akan ditolak " +
      "kontrak bila didaftarkan lagi, bukan diam-diam terdaftar dua kali).",
  );
  await hentikanWallet(ctx, log);
  process.exit(1);
}

log.info(
  {
    terdaftar: daftar.length,
    registeredCountSebelum: ledgerSebelum.registeredCount.toString(),
    registeredCountSesudah: ledgerSesudah.registeredCount.toString(),
    eligibleCount: ledgerSesudah.eligibleCount.toString(),
  },
  "Selesai — leaf terdaftar",
);

await tutupSesi(sesi, 0);

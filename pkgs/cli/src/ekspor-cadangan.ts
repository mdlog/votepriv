// `pnpm cli ekspor-cadangan` — jembatan penyerahan credential ke juri (lihat
// .superpowers/alur-juri.md untuk latar lengkap alur ini).
//
// KONTEKS: untuk penjurian, urutan pendaftaran DIBALIK dibanding pola BARU
// (register-leaves.ts/pendaftaran-awal.ts): admin membuat dan mendaftarkan
// credential SEBELUM penjurian — mode LAMA `deploy-ballot` (tanpa
// VOTEPRIV_TANPA_PENDAFTARAN=1) sudah melakukan persis ini — lalu menyerahkan
// tiap credential ke SATU juri lewat kanal privat, di luar repo ini sama
// sekali. Perintah ini adalah jembatan itu: ia membaca `credentials` yang
// sudah tersimpan di artefak (ditulis deploy-ballot.ts) dan menulis SATU
// berkas cadangan per credential, dalam bentuk yang PERSIS bisa diimpor lewat
// tombol "Restore from backup file" di RegisterModal.tsx
// (`uraiCadanganKredensial` — client/src/components/votepriv/RegisterModal.tsx,
// KONTRAK yang tidak diubah oleh berkas ini).
//
// Murni baca artefak + tulis berkas — TIDAK ADA jaringan, TIDAK ADA wallet,
// TIDAK ADA seed. `siapkanSesi` (bootstrap.ts) SENGAJA tidak pernah diimpor
// di sini (lihat guard pengkabelan di ekspor-cadangan.test.ts).
//
// KEAMANAN YANG MENGIKAT: credential adalah rahasia PEMILIH (siapa pun yang
// memegangnya bisa mencoblos atas nama pemilik aslinya sampai suara
// terpakai). Baris ini TIDAK PERNAH boleh dilanggar di berkas ini:
//   - Credential TIDAK PERNAH masuk console.log/console.error atau logger
//     apa pun — hanya NAMA BERKAS dan JUMLAH yang boleh tercetak
//     (`cetakRingkasan` di bawah). Pola larangan-log yang sama berlaku di
//     seluruh CLI ini (mis. `rahasiaAdmin` di deploy-ballot.ts/register-leaves.ts).
//   - Setiap berkas ditulis mode 0600 (chmod eksplisit, lihat `tulisSatuBerkas`
//     — writeFileSync HANYA menerapkan `mode` saat berkas baru dibuat, bukan
//     saat menimpa berkas lama, jadi dijamin ulang lewat chmodSync).
import fs from "node:fs";
import path from "node:path";
import { bacaArtefak, jalurArtefak, type ArtefakDeploy } from "./artefak.ts";
import { currentDir } from "./config.ts";

/**
 * Salinan STRUKTURAL dari `CadanganKredensial` milik
 * `client/src/components/votepriv/RegisterModal.tsx` — BUKAN diimpor, dengan
 * alasan yang sama seperti salinan `HasilRegistrasiMandiri` di berkas itu
 * sendiri (lihat komentarnya): pkgs/cli adalah paket Node murni dan tidak
 * boleh menyeret bundel client (React, WASM onchain-runtime-v3, dst) ke
 * dalam kode PRODUKSI CLI hanya demi satu tipe dua-field. Bentuknya harus
 * tetap PERSIS SAMA (dua field ini, ejaan ini, tidak lebih tidak kurang) —
 * itu bukan sekadar konvensi di sini, tapi dijaga MESIN oleh uji round-trip
 * lintas-paket di client/src/components/votepriv/RegisterModal.test.tsx yang
 * benar-benar mengimpor `uraiCadanganKredensial` ASLI dan menjalankannya atas
 * keluaran nyata `eksporCadangan` di bawah.
 */
export interface CadanganKredensial {
  alamatBallot: string;
  credentialHex: string;
}

export interface HasilEksporCadangan {
  /** Jalur lengkap tiap berkas yang ditulis. TIDAK PERNAH memuat credential. */
  readonly berkas: readonly string[];
  readonly jumlah: number;
  readonly dirTujuan: string;
}

export const DIR_CADANGAN = path.resolve(currentDir, "..", "cadangan");

function pesanBelumAdaArtefak(networkId: string, dir: string | undefined): string {
  return (
    `Belum ada artefak untuk jaringan "${networkId}" (${jalurArtefak(networkId, dir)}). ` +
    "Jalankan `pnpm cli deploy-ballot` lebih dulu."
  );
}

function pesanBelumAdaBallot(): string {
  return "Artefak ini belum memuat alamat ballot. Jalankan `pnpm cli deploy-ballot` lebih dulu.";
}

/**
 * Pesan ini DIPAKU oleh uji (ekspor-cadangan.test.ts) — ketiga fakta di
 * bawah harus tetap ada bila kalimatnya diparafrasekan: (1) ballot memakai
 * pendaftaran MANDIRI, (2) TIDAK ADA credential di sisi admin untuk
 * diekspor, (3) jalan keluarnya `register-leaves`.
 */
function pesanTanpaPendaftaran(): string {
  return (
    "Ballot ini tidak memiliki credential untuk diekspor. Artefaknya tidak memuat field `credentials` — " +
    "tandanya ballot ini di-deploy dalam mode pendaftaran MANDIRI (VOTEPRIV_TANPA_PENDAFTARAN=1 saat " +
    "deploy-ballot), tempat setiap pemilih membuat credential-nya sendiri dan penyelenggara tidak pernah " +
    "memegang satu pun credential untuk dibagikan. Untuk mendaftarkan pemilih pada ballot mode ini, " +
    "kumpulkan leaf publik dari mereka lalu jalankan `pnpm cli register-leaves <berkas-leaf>`."
  );
}

/**
 * Dari artefak yang SUDAH DIBACA (bukan `null`), susun daftar cadangan —
 * murni transformasi data, tanpa I/O. Melempar (pesan dipaku uji) bila
 * ballot atau credentials belum ada, SEBELUM satu berkas pun ditulis.
 */
export function siapkanDaftarCadangan(artefak: ArtefakDeploy): CadanganKredensial[] {
  const { ballot, credentials } = artefak;
  if (ballot === undefined) {
    throw new Error(pesanBelumAdaBallot());
  }
  if (credentials === undefined || credentials.length === 0) {
    throw new Error(pesanTanpaPendaftaran());
  }
  return credentials.map((credentialHex) => ({ alamatBallot: ballot, credentialHex }));
}

/** `votepriv-credential-<8 hex alamat>-<nomor>.json` — SAMA PERSIS pola nama yang RegisterModal.tsx pakai untuk 8-hex-nya (`alamatBallot.slice(0, 8)`), plus akhiran `-<nomor>` karena di sini ada BANYAK berkas per ballot (satu per juri), bukan satu seperti unduhan tunggal dari UI. */
export function namaBerkasCadangan(alamatBallot: string, nomor: number): string {
  return `votepriv-credential-${alamatBallot.slice(0, 8)}-${nomor}.json`;
}

/** `pkgs/cli/cadangan/<8 hex alamat>/` — gitignored (lihat .gitignore), sama alasannya dengan pkgs/cli/artefak/: berisi rahasia pemilih. */
export function direktoriKeluaranBawaan(alamatBallot: string, dirDasar: string = DIR_CADANGAN): string {
  return path.join(dirDasar, alamatBallot.slice(0, 8));
}

/**
 * Menulis SATU berkas cadangan. Mode 0600 dijamin DUA lapis: opsi `mode` di
 * writeFileSync (berlaku bila berkas baru dibuat) DAN chmodSync eksplisit
 * sesudahnya (berlaku juga bila berkas SUDAH ADA dari pemanggilan
 * sebelumnya — dokumentasi Node: opsi `mode` pada writeFileSync/open HANYA
 * diterapkan saat berkas benar-benar baru dibuat, diabaikan begitu saja bila
 * menimpa berkas lama, jadi tanpa chmodSync eksplisit di sini
 * `ekspor-cadangan` yang dijalankan DUA KALI atas ballot yang sama bisa diam-
 * diam mempertahankan mode longgar dari proses/umask sebelumnya).
 *
 * TIDAK ADA satu console.log/console.error pun di fungsi ini maupun yang
 * dipanggilnya — lihat komentar kepala berkas.
 */
function tulisSatuBerkas(dirTujuan: string, nomor: number, cadangan: CadanganKredensial): string {
  const jalur = path.join(dirTujuan, namaBerkasCadangan(cadangan.alamatBallot, nomor));
  fs.writeFileSync(jalur, `${JSON.stringify(cadangan, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(jalur, 0o600);
  return jalur;
}

/**
 * Titik masuk murni-testable: baca artefak, susun daftar cadangan, tulis satu
 * berkas per credential. `opsi.dirArtefak`/`opsi.dirKeluaran` HANYA untuk
 * suntikan uji (tmp dir) — produksi (`main` di bawah) selalu memakai bawaan
 * (`DIR_ARTEFAK` lewat `bacaArtefak`, `direktoriKeluaranBawaan`).
 */
export function eksporCadangan(
  networkId: string,
  opsi: { dirArtefak?: string; dirKeluaran?: string } = {},
): HasilEksporCadangan {
  const artefak = bacaArtefak(networkId, opsi.dirArtefak);
  if (artefak === null) {
    throw new Error(pesanBelumAdaArtefak(networkId, opsi.dirArtefak));
  }

  const daftar = siapkanDaftarCadangan(artefak); // melempar (pesan dipaku) bila ballot/credentials belum ada
  const alamatBallot = daftar[0].alamatBallot; // aman: siapkanDaftarCadangan menjamin daftar.length >= 1
  const dirTujuan = opsi.dirKeluaran ?? direktoriKeluaranBawaan(alamatBallot);

  fs.mkdirSync(dirTujuan, { recursive: true });
  const berkas = daftar.map((cadangan, i) => tulisSatuBerkas(dirTujuan, i + 1, cadangan));

  return { berkas, jumlah: berkas.length, dirTujuan };
}

/**
 * SATU-SATUNYA fungsi di berkas ini yang boleh mencetak — dan HANYA nama
 * berkas (bukan jalur lengkap sekalipun bukan rahasia, cukup nama untuk
 * ditindaklanjuti) serta jumlah. Tidak pernah menerima `CadanganKredensial`
 * sama sekali (hanya `HasilEksporCadangan`, yang strukturnya tidak punya
 * field credential) — pilihan tipe ini sendiri sudah mencegah kesalahan
 * "lupa tidak mencetak credential", bukan hanya disiplin menulis kode.
 */
export function cetakRingkasan(hasil: HasilEksporCadangan): void {
  console.log(`${hasil.jumlah} berkas cadangan credential ditulis ke ${hasil.dirTujuan}:`);
  for (const jalur of hasil.berkas) {
    console.log(`  - ${path.basename(jalur)}`);
  }
  console.log(
    "\nSetiap berkas berisi SATU credential rahasia milik SATU juri. Kirim tiap berkas ke SATU juri lewat " +
      "kanal privat (pesan langsung, berbagi berkas terenkripsi, dst) — JANGAN PERNAH lewat repo ini atau " +
      "tautan publik mana pun. Siapa pun yang memegang berkas itu bisa mencoblos dengan credential di " +
      "dalamnya sampai juri yang bersangkutan memakainya.",
  );
}

function main(): void {
  try {
    const hasil = eksporCadangan("preview");
    cetakRingkasan(hasil);
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}

// Jalankan HANYA saat berkas ini dieksekusi langsung (`pnpm cli ekspor-cadangan`),
// BUKAN saat diimpor oleh uji — lihat komentar `import.meta.main` di doctor.ts
// untuk penjelasan lengkap kenapa properti ini (bukan perbandingan path) yang
// dipakai. Di sini taruhannya lebih tinggi daripada doctor.ts: tanpa penjaga
// ini, sekadar MENGIMPOR modul ini untuk diuji akan membaca artefak
// PRODUKSI sungguhan (pkgs/cli/artefak/preview.json, DILARANG dibaca oleh
// tugas ini) dan menulis berkas cadangan credential SUNGGUHAN ke disk.
if (import.meta.main) {
  main();
}

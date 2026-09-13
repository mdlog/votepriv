// Logika yang dipakai ulang oleh `register-leaves.ts` (lihat berkas itu untuk
// titik masuk CLI-nya): mengurai berkas leaf, memvalidasinya terhadap ledger
// ballot, memecahnya jadi batch <= 8, lalu mengirim tiap batch lewat
// `daftarkanVoter` (deploy.ts) yang sudah ada.
//
// POLA PENDAFTARAN BARU: penyelenggara menerima LEAF (cred_leaf(credential)),
// bukan membuat credential. Leaf BUKAN rahasia — ia memang akan ditulis ke
// rantai publik lewat registerVoters, jadi berkas biasa dan argumen jalur di
// argv aman untuk ini. Ini BERBEDA dari seed wallet, yang HANYA boleh lewat
// `bacaSeed()` (prompt tanpa gema / stdin non-TTY) — lihat seed.ts.
//
// Berkas ini TIDAK PERNAH menyentuh credential, salt, opening, maupun seed:
// hanya leaf (Uint8Array 32 byte publik) dan bilangan (registeredCount dkk,
// juga publik).
import fs from "node:fs";
import path from "node:path";
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import type { Logger } from "pino";
import { daftarkanVoter, type OpsiRetriDaftarkanVoter } from "./deploy.ts";
import type { BallotC } from "./kontrak.ts";

// ─── Bagian 1: mengurai berkas ──────────────────────────────────────────────

export interface LeafEntry {
  /** Nomor baris ASLI di berkas (1-based) — dipakai di SETIAP pesan galat. */
  readonly baris: number;
  /** Bentuk kanonik: 64 karakter heksadesimal huruf kecil, TANPA awalan "0x". */
  readonly hex: string;
  readonly bytes: Uint8Array;
}

const POLA_HEX_LEAF = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Mengurai isi berkas leaf: satu leaf hex per baris. Baris kosong (setelah
 * di-trim) dan baris berawalan `#` diabaikan sepenuhnya — tidak ikut dihitung
 * sebagai leaf maupun mengubah nomor baris entri lain (nomor baris yang
 * dilaporkan SELALU nomor baris ASLI di berkas, termasuk baris kosong/komentar
 * yang dilewati, supaya operator bisa langsung membuka editornya ke baris
 * yang tepat).
 *
 * Aturan, DIPERIKSA SEBELUM MENYENTUH RANTAI (lihat validasiKuotaPendaftaran/
 * periksaLeafSudahTerdaftar di bawah untuk aturan yang BUTUH ledger):
 *   1. Tiap baris yang tersisa harus 64 karakter heksadesimal, dengan atau
 *      tanpa awalan "0x" — dinormalisasi ke huruf kecil tanpa awalan.
 *   2. Tidak ada leaf yang sama muncul dua kali di dalam SATU berkas ini
 *      (dibandingkan pada bentuk KANONIK, sehingga "0xAB.." dan "ab.."
 *      dianggap leaf yang SAMA).
 *
 * Melempar pada pelanggaran PERTAMA yang ditemukan (bukan mengumpulkan semua
 * lalu melempar sekali) — cukup untuk memandu operator memperbaiki berkasnya
 * baris demi baris; kompleksitas melaporkan semua pelanggaran sekaligus tidak
 * diminta rencana ini.
 */
export function uraiBerkasLeaf(isi: string): LeafEntry[] {
  const baris = isi.split(/\r\n|\r|\n/);
  const hasil: LeafEntry[] = [];
  const barisPertamaUntukHex = new Map<string, number>();

  for (let i = 0; i < baris.length; i++) {
    const nomorBaris = i + 1;
    const mentah = baris[i].trim();
    if (mentah === "" || mentah.startsWith("#")) continue;

    if (!POLA_HEX_LEAF.test(mentah)) {
      throw new Error(
        `Baris ${nomorBaris}: bukan leaf hex yang valid (${JSON.stringify(mentah)}). ` +
          `Harus 64 karakter heksadesimal (0-9, a-f, A-F), boleh diawali "0x".`,
      );
    }

    const hex = (mentah.startsWith("0x") ? mentah.slice(2) : mentah).toLowerCase();

    const barisPertama = barisPertamaUntukHex.get(hex);
    if (barisPertama !== undefined) {
      throw new Error(
        `Baris ${nomorBaris}: leaf duplikat dengan baris ${barisPertama} (${hex}). ` +
          `Setiap leaf hanya boleh muncul sekali dalam satu berkas.`,
      );
    }
    barisPertamaUntukHex.set(hex, nomorBaris);

    hasil.push({ baris: nomorBaris, hex, bytes: Uint8Array.from(Buffer.from(hex, "hex")) });
  }

  if (hasil.length === 0) {
    throw new Error("Berkas leaf kosong — tidak ada leaf yang tersisa setelah baris kosong dan komentar (#) disaring.");
  }

  return hasil;
}

/**
 * `uraiBerkasLeaf` dari sebuah jalur berkas. Galat baca berkas dibungkus
 * dengan jalurnya — dan pada ENOENT khususnya, dengan cwd + jalur absolut.
 *
 * Kejadian lapangan: `pnpm cli register-leaves pkgs/cli/leaves/x.txt`
 * gagal ENOENT karena `pnpm --filter cli run` menjalankan skrip dengan cwd
 * `pkgs/cli/`, sehingga jalur relatif (ditulis relatif terhadap ROOT repo,
 * kebiasaan alami) diam-diam diresolusi jadi `pkgs/cli/pkgs/cli/leaves/x.txt`.
 * Pesan LAMA hanya mengulang `jalur` mentah apa adanya — sama sekali tidak
 * membantu menebak KENAPA berkas yang "jelas ada" tidak ditemukan. Pesan ini
 * sengaja hanya MENUNJUKKAN di mana ia mencari (cwd + jalur absolut hasil
 * `path.resolve`), TIDAK menebak-nebak lokasi yang "benar" untuk pengguna.
 */
export function bacaBerkasLeaf(jalur: string): LeafEntry[] {
  let isi: string;
  try {
    isi = fs.readFileSync(jalur, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const petunjukCwd =
      err.code === "ENOENT"
        ? ` Dicari di: ${path.resolve(jalur)} (cwd: ${process.cwd()}). ` +
          "Skrip ini berjalan dari pkgs/cli — pakai jalur absolut, atau relatif terhadap direktori itu."
        : "";
    throw new Error(`Tidak bisa membaca berkas leaf di "${jalur}": ${err.message}.${petunjukCwd}`);
  }
  return uraiBerkasLeaf(isi);
}

/**
 * Jalur berkas leaf dari argv: argumen POSISIONAL pertama yang bukan flag
 * (tidak berawalan "--"). Leaf bukan rahasia (lihat catatan kepala berkas
 * ini), jadi jalurnya boleh lewat argv biasa — beda dari seed, yang HANYA
 * boleh lewat `bacaSeed()`.
 */
export function jalurBerkasLeafDariArgv(argv: readonly string[] = process.argv.slice(2)): string {
  const jalur = argv.find((a) => !a.startsWith("--"));
  if (jalur === undefined) {
    throw new Error(
      "Jalur berkas leaf tidak diberikan. Pakai: pnpm cli register-leaves <jalur-berkas-leaf>",
    );
  }
  return jalur;
}

/**
 * Menjalankan `validasiLokalFn` (SINKRON) DULU, baru memanggil `mulaiSesiFn`
 * — dan HANYA bila `validasiLokalFn` tidak melempar. register-leaves.ts
 * (skrip tingkat-atas) memanggilnya persis begini, DI ATAS baris lain mana
 * pun:
 *
 * ```ts
 * const jalurBerkas = jalurBerkasLeafDariArgv();
 * const { daftar, sesi } = await validasiLokalLaluSesi(
 *   () => bacaBerkasLeaf(jalurBerkas),
 *   () => siapkanSesi(),
 * );
 * ```
 *
 * `bacaBerkasLeaf(jalurBerkas)` di atas TETAP pemanggilan langsung yang
 * sungguhan dijalankan register-leaves.ts sendiri (dibungkus closure murni
 * supaya bisa ditunda) — bukan disalin ulang di sini — jadi uji terhadap
 * fungsi ini adalah uji terhadap PERILAKU SUNGGUHAN skrip itu, bukan
 * reimplementasi paralel. `S` (tipe sesi) generik SUPAYA leaf-file.ts tidak
 * perlu mengimpor `Sesi`/`siapkanSesi` dari bootstrap.ts.
 *
 * KENAPA URUTAN INI PENTING (kejadian lapangan): sebelum perbaikan ini,
 * register-leaves.ts memanggil `siapkanSesi()` (prompt 24 kata seed +
 * sinkronisasi wallet — MAHAL dan interaktif) SEBELUM membaca berkas leaf
 * sama sekali. Jalur berkas yang salah (lihat komentar `bacaBerkasLeaf` di
 * atas) baru ketahuan SETELAH pengguna selesai mengetik seed dan menunggu
 * wallet sinkron — padahal validasi berkas ini sama sekali tidak butuh
 * keduanya. Fungsi ini menegakkan urutan itu secara STRUKTURAL (bukan
 * sekadar konvensi penulisan): `validasiLokalFn` dipanggil DULU, dan
 * `mulaiSesiFn` TIDAK PERNAH tereksekusi bila `validasiLokalFn` melempar —
 * itu semantik `await` biasa, bukan logika tambahan di sini.
 *
 * Validasi yang BUTUH rantai (voteCount, kuota, leaf yang sudah terdaftar —
 * `validasiKuotaPendaftaran`/`periksaLeafSudahTerdaftar`) SENGAJA TIDAK di
 * sini: keduanya baru bisa jalan SETELAH sesi ada (perlu `kp.publicDataProvider`),
 * dan tetap dipanggil register-leaves.ts sesudah fungsi ini kembali.
 *
 * `mulaiSesiFn` (dan `validasiLokalFn`) disuntikkan sebagai closure SUPAYA
 * uji unit bisa membuktikan URUTAN pemanggilan (mock yang mencatat kapan
 * masing-masing dipanggil) tanpa pernah benar-benar meminta seed atau
 * membuka wallet.
 */
export async function validasiLokalLaluSesi<S>(
  validasiLokalFn: () => LeafEntry[],
  mulaiSesiFn: () => Promise<S>,
): Promise<{ daftar: LeafEntry[]; sesi: S }> {
  const daftar = validasiLokalFn();
  const sesi = await mulaiSesiFn();
  return { daftar, sesi };
}

// ─── Bagian 2: validasi terhadap ledger ─────────────────────────────────────

/**
 * Bentuk minimal ledger ballot yang dibutuhkan `validasiKuotaPendaftaran` —
 * BUKAN `LedgerBallot` penuh dari deploy.ts. Tipe struktural sekecil ini
 * berarti uji unit bisa memberi objek literal `{ voteCount, registeredCount,
 * eligibleCount }` apa adanya sebagai argumen, tanpa `as unknown`/`as any`
 * untuk memuaskan bentuk `Ledger` sungguhan (yang punya banyak field lain
 * yang tidak relevan di sini).
 */
export interface LedgerKuota {
  readonly voteCount: bigint;
  readonly registeredCount: bigint;
  readonly eligibleCount: bigint;
}

/**
 * Dua pemeriksaan yang mengikat sebelum registerVoters BOLEH dipanggil sama
 * sekali — kontrak MENOLAK keduanya juga (ballot.compact, `registerVoters`),
 * tapi gagal DI SINI, sebelum proof ZK ~10 MB dibangun, jauh lebih murah
 * daripada gagal setelah rantai menolak transaksi yang sudah dibangun-lengkap.
 *
 *   1. `voteCount == 0` — pendaftaran menutup PERMANEN begitu suara pertama
 *      masuk (spec: "Khusus admin... menutup sendiri begitu suara pertama
 *      masuk"). Tidak ada cara memperbaikinya selain ballot baru.
 *   2. `registeredCount + jumlahBaru <= eligibleCount` — batas yang di-seal
 *      saat deploy, tidak bisa diperbesar.
 */
export function validasiKuotaPendaftaran(ledger: LedgerKuota, jumlahBaru: number): void {
  if (ledger.voteCount !== 0n) {
    throw new Error(
      `Pendaftaran sudah ditutup permanen: voteCount ballot ini = ${ledger.voteCount} (bukan 0). ` +
        `Kontrak menutup registerVoters selamanya begitu suara pertama masuk — tidak ada leaf baru ` +
        `yang bisa didaftarkan lagi pada ballot ini. Deploy ballot baru bila pendaftaran masih diperlukan.`,
    );
  }

  const tersisa = ledger.eligibleCount - ledger.registeredCount;
  if (BigInt(jumlahBaru) > tersisa) {
    throw new Error(
      `Jumlah leaf pada berkas (${jumlahBaru}) melebihi kuota tersisa (${tersisa}): ` +
        `registeredCount (${ledger.registeredCount}) + ${jumlahBaru} akan melebihi eligibleCount ` +
        `(${ledger.eligibleCount}). Kurangi jumlah leaf pada berkas, atau daftarkan sisanya pada ballot lain.`,
    );
  }
}

/**
 * Bentuk minimal `eligibility` ledger yang dibutuhkan `periksaLeafSudahTerdaftar`
 * — satu-satunya anggota `Ledger["eligibility"]` (lihat
 * pkgs/contract/src/managed/ballot/contract/index.d.ts) yang dipakai di sini.
 * Sama seperti `LedgerKuota` di atas: tipe struktural sekecil ini menghindari
 * cast di uji unit.
 */
export interface EligibilityFindPath {
  findPathForLeaf(leaf: Uint8Array): unknown;
}

export interface HasilPeriksaSudahTerdaftar {
  readonly bisaDiperiksa: boolean;
  readonly sudahTerdaftar: readonly LeafEntry[];
  /** Terisi hanya ketika `bisaDiperiksa` false. */
  readonly alasanTidakBisa?: string;
}

/**
 * Memeriksa, PER LEAF, apakah leaf itu sudah pernah didaftarkan (ada di
 * pohon eligibility ballot ini) — `findPathForLeaf` mengembalikan sebuah
 * path (bukan `undefined`) hanya bila leaf itu sudah pernah di-insert oleh
 * registerVoters sebelumnya. ini pembacaan LEDGER SESUNGGUHNYA per leaf,
 * bukan tebakan dari `registeredCount` saja — dan persis metode yang sudah
 * dipakai `client/src/lib/chain/eligibility-tulis.ts` untuk menyusun
 * eligibilityPath pemilih, jadi sudah terbukti bekerja pada ledger nyata.
 *
 * Rencana ini mengantisipasi kemungkinan pohon Merkle TIDAK BISA
 * dienumerasi dari klien sama sekali (mis. bentuk state berubah di versi
 * SDK lain). `findPathForLeaf` per-leaf BUKAN enumerasi pohon (tidak pernah
 * mendaftar SEMUA leaf yang sudah ada) — ia hanya menjawab "apakah LEAF INI
 * ada", yang justru satu-satunya pertanyaan yang relevan di sini. Namun
 * bila pemanggilan itu SENDIRI gagal (mis. bentuk ledger yang tidak
 * terduga), fungsi ini TIDAK melempar: hasilnya `bisaDiperiksa: false`
 * dengan alasannya, dan pemanggil (register-leaves.ts) mundur ke
 * pemeriksaan JUMLAH (`validasiKuotaPendaftaran`) saja, sesuai rencana.
 */
export function periksaLeafSudahTerdaftar(
  daftar: readonly LeafEntry[],
  eligibility: EligibilityFindPath,
): HasilPeriksaSudahTerdaftar {
  try {
    const sudahTerdaftar = daftar.filter((e) => eligibility.findPathForLeaf(e.bytes) !== undefined);
    return { bisaDiperiksa: true, sudahTerdaftar };
  } catch (e) {
    return { bisaDiperiksa: false, sudahTerdaftar: [], alasanTidakBisa: (e as Error).message };
  }
}

// ─── Bagian 3: batch <= 8 lewat daftarkanVoter yang sudah ada ───────────────

/**
 * Memecah leaf jadi kelompok berurutan berukuran maksimal `ukuran` (bawaan
 * 8 — batas `registerVoters`, lihat `assert(n >= 1 && n <= 8)` di
 * ballot.compact). BUKAN `batchDaun` (deploy.ts): itu mem-padding tiap
 * kelompok jadi PERSIS 8 elemen untuk bentuk `Vector<8, Bytes<32>>` yang
 * dituntut runtime kontrak — pemecahan di sini menghasilkan kelompok
 * SEUKURAN ASLINYA (<=8, tanpa padding), karena tiap kelompok diserahkan ke
 * `daftarkanVoter` (yang memanggil `batchDaun` SENDIRI secara internal).
 */
export function pecahLeafMenjadiBatch<T>(daun: readonly T[], ukuran = 8): T[][] {
  if (!Number.isInteger(ukuran) || ukuran < 1) {
    throw new Error(`Ukuran batch harus bilangan bulat >= 1; diberikan ${ukuran}.`);
  }
  const hasil: T[][] = [];
  for (let i = 0; i < daun.length; i += ukuran) {
    hasil.push(daun.slice(i, i + ukuran));
  }
  return hasil;
}

export interface OpsiDaftarkanSemuaBatch {
  /** Diteruskan apa adanya ke tiap pemanggilan `daftarkanVoter` — lihat `OpsiRetriDaftarkanVoter`. */
  readonly publicDataProvider?: PublicDataProvider;
  readonly alamatBallot?: string;
  readonly maksPercobaan?: number;
  readonly jedaMs?: number;
}

/**
 * Bentuk `daftarkanVoter` yang dibutuhkan `daftarkanSemuaBatch` — cukup
 * untuk menyuntikkan pengganti bertipe di uji unit (mencatat pemanggilan,
 * tanpa `FoundContract<BallotC>` sungguhan) tanpa `as unknown`/`as any`.
 */
export type FungsiDaftarkanVoter = (
  ballot: FoundContract<BallotC>,
  daun: readonly Uint8Array[],
  log: Logger,
  opsi?: OpsiRetriDaftarkanVoter,
) => Promise<void>;

/**
 * Mendaftarkan SELURUH leaf yang sudah divalidasi, dalam batch <= 8, lewat
 * `daftarkanVoter` yang sudah ada (deploy.ts) — SATU PANGGILAN
 * `daftarkanVoterFn` PER BATCH, berurutan (`await` sebelum lanjut ke
 * batch berikutnya, tidak pernah `Promise.all`), untuk alasan yang SAMA
 * dengan yang didokumentasikan di `daftarkanVoter` sendiri: private state
 * LevelDB dibuka-tutup per operasi, dan penyeimbangan unshielded dapat
 * memilih UTXO yang sama bila dua transaksi diseimbangkan bersamaan.
 *
 * `daftarkanVoterFn` bisa diganti di uji unit (bawaan: `daftarkanVoter`
 * sungguhan) — parameter inilah yang membuat "urutan pemanggilan
 * daftarkanVoter" bisa diuji tanpa jaringan maupun `FoundContract<BallotC>`
 * sungguhan.
 */
export async function daftarkanSemuaBatch(
  ballot: FoundContract<BallotC>,
  daun: readonly Uint8Array[],
  log: Logger,
  opsi: OpsiDaftarkanSemuaBatch = {},
  daftarkanVoterFn: FungsiDaftarkanVoter = daftarkanVoter,
): Promise<void> {
  const batch = pecahLeafMenjadiBatch(daun, 8);
  for (const [i, kelompok] of batch.entries()) {
    log.info(
      { batch: i + 1, dari: batch.length, n: kelompok.length },
      "Mendaftarkan satu batch leaf eligibility (lewat daftarkanVoter)",
    );
    await daftarkanVoterFn(ballot, kelompok, log, {
      publicDataProvider: opsi.publicDataProvider,
      alamatBallot: opsi.alamatBallot,
      maksPercobaan: opsi.maksPercobaan,
      jedaMs: opsi.jedaMs,
    });
  }
}

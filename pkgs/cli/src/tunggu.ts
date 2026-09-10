import type { Logger } from "pino";

export function pastikan(kondisi: boolean, pesan: string): asserts kondisi {
  if (!kondisi) throw new Error(pesan);
}

/**
 * Anggaran waktu per jenis operasi jaringan, dalam milidetik.
 *
 * Setiap `await` ke midnight-js di rencana ini dibungkus salah satu nilai di
 * bawah. Angkanya dipilih dari waktu terukur terburuk (~2,5 menit per
 * transaksi pada preview) dikalikan margin besar, BUKAN dari tebakan: yang
 * dijaga bukan performa, melainkan perbedaan antara "gagal nyaring setelah N
 * menit" dan "diam selamanya".
 *
 * Perhatikan bahwa `TIMEOUT_PROOF_MS` milik httpClientProofProvider (10 menit,
 * lihat providers.ts) lebih kecil daripada `panggilBerat`/`deploy`. Itu
 * disengaja: bila yang macet adalah proof server, pesan galatnya datang dari
 * proof provider yang tahu circuit mana — jauh lebih informatif daripada
 * pesan generik di sini. Batas di bawah hanya menangkap yang lolos dari itu:
 * penantian node dan indexer yang memang tak berbatas.
 */
export const BATAS_MS = {
  /**
   * buatWalletProvider: menunggu ketiga sub-wallet sinkron ULANG sebelum
   * membaca coin/encryption public key. BUKAN sinkronisasi dingin — di jalur
   * normal siapkanSesi sudah menunggu ringkasSaldo sesaat sebelumnya, jadi
   * emisi pertama dari state() lazimnya sudah sinkron dan await ini selesai
   * seketika. Anggaran ini hanya menangkap kasus WS indexer putus atau
   * re-sync terpicu di antara kedua panggilan itu — jauh lebih murah
   * daripada sinkronisasi awal dari nol, karena itu jauh lebih kecil
   * daripada `deploy`/`panggilBerat` (15 menit).
   */
  sinkron: 2 * 60_000,
  /**
   * deployContract: satu proof ZK + penyeimbangan + finalisasi node +
   * watchForDeployTxData (tak berbatas secara desain). 15 menit ≈ 6× terburuk.
   */
  deploy: 15 * 60_000,
  /**
   * findDeployedContract: TANPA proof — watchForDeployTxData +
   * queryDeployContractState + queryContractState + getVerifierKeys +
   * verifyContractState. Semuanya indexer.
   */
  temukan: 5 * 60_000,
  /**
   * callTx.registerVoters / castVote / tallyVote — prover key 9,97-9,99 MB,
   * proof termahal di repo ini. Sama dengan anggaran deploy.
   */
  panggilBerat: 15 * 60_000,
  /** callTx.register (registry) dan callTx.finalize (ballot): prover kecil. */
  panggilRingan: 10 * 60_000,
  /** Satu queryContractState ke indexer. */
  bacaIndexer: 60_000,
  /** serializeState ketiga sub-wallet + wallet.stop() saat menutup sesi. */
  tutup: 60_000,
} as const;

/**
 * Batas waktu untuk operasi yang secara desain menunggu SELAMANYA.
 * `watchForTxData` dan `watchForDeployTxData` didokumentasikan "will never
 * timeout or reject", dan deployContract/submitCallTx/findDeployedContract
 * semuanya melewatinya — jadi transaksi yang ditolak konsensus membuat CLI
 * diam tanpa batas.
 *
 * PENTING: timeout di sini BUKAN izin untuk mengulang. Transaksi yang sudah
 * dikirim mungkin tetap mendarat; mengirim ulang berisiko memilih UTXO yang
 * sama dan membakar credential yang sama dua kali. Pada timeout, hentikan
 * proses dan periksa keadaan chain lebih dulu.
 *
 * `janji` yang kalah lomba TIDAK dibatalkan — tidak ada pembatalan pada
 * Promise. Operasinya tetap berjalan di latar sampai proses berakhir. Itu
 * sebabnya pemanggil wajib menghentikan proses setelah menangkap galat ini,
 * bukan melanjutkan ke langkah berikutnya.
 */
export const denganBatasWaktu = async <T>(janji: Promise<T>, ms: number, pesan: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      janji,
      new Promise<never>((_, tolak) => {
        timer = setTimeout(() => tolak(new Error(pesan)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export interface HasilUlang<T> {
  /** Nilai terakhir yang berhasil dibaca; undefined bila SETIAP pembacaan melempar. */
  readonly nilai: T | undefined;
  readonly cocok: boolean;
  readonly percobaan: number;
  /** Pesan galat pembacaan terakhir, bila ada. */
  readonly galatTerakhir: string | undefined;
}

/**
 * Membaca ulang sebuah nilai sampai syaratnya terpenuhi, dengan batas
 * percobaan. Ini penanganan KETERLAMBATAN INDEXER, dan ia harus berupa kode,
 * bukan catatan "coba baca lagi beberapa detik kemudian" di dokumen.
 *
 * Node memfinalisasi transaksi lebih dulu; indexer menyusul beberapa detik
 * kemudian. `queryContractState` tepat setelah sebuah transaksi sukses
 * karenanya bisa mengembalikan state lama — atau `null`. Assert yang langsung
 * membandingkan hasil itu akan gagal dengan pesan yang terdengar seperti
 * kegagalan produk ("PRIVASI BOCOR", "registeredCount seharusnya 3") padahal
 * yang terjadi hanya keterlambatan beberapa detik.
 *
 * TIDAK MELEMPAR. Galat pembacaan diperlakukan sebagai "belum siap" dan
 * dicoba lagi; kehabisan percobaan mengembalikan `cocok: false`. Pemanggil
 * yang memutuskan apa artinya — dan pemanggil pula yang menutup sesi dengan
 * benar (lihat `tutupSesi`), yang tidak mungkin dilakukan dari sini.
 */
export async function ulangiSampai<T>(
  baca: () => Promise<T>,
  syarat: (nilai: T) => boolean,
  log: Logger,
  label: string,
  maks = 12,
  jedaMs = 5_000,
): Promise<HasilUlang<T>> {
  let nilai: T | undefined;
  let galatTerakhir: string | undefined;

  for (let i = 1; i <= maks; i++) {
    try {
      nilai = await baca();
      galatTerakhir = undefined;
      if (syarat(nilai)) return { nilai, cocok: true, percobaan: i, galatTerakhir: undefined };
      log.info({ percobaan: i, dari: maks, label }, "Indexer belum menyusul; membaca ulang");
    } catch (e) {
      galatTerakhir = (e as Error).message ?? String(e);
      log.info({ percobaan: i, dari: maks, label, galat: galatTerakhir }, "Pembacaan indexer gagal; mencoba lagi");
    }
    if (i < maks) await new Promise((r) => setTimeout(r, jedaMs));
  }

  return { nilai, cocok: false, percobaan: maks, galatTerakhir };
}

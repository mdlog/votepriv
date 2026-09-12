import type { Logger } from "pino";
import { detikSekarang } from "shared";

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

/**
 * Meratakan isi ledger `tallies` (Map<Uint<8>, Uint<64>>) menjadi array per
 * opsi. Sengaja tidak memakai `tallies.lookup(k)`: lookup pada kunci yang tidak
 * ada MELEMPAR "expected a cell, received null", sedangkan opsi tanpa suara
 * memang tidak punya kunci. Iterasi `[...ledger.tallies]` menghasilkan pasangan
 * [opsi, jumlah] dan menghindari jebakan itu sepenuhnya.
 */
export const ringkasTallies = (
  entri: readonly (readonly [bigint, bigint])[],
  nOpsi: number,
): bigint[] => {
  const hasil = new Array<bigint>(nOpsi).fill(0n);
  for (const [opsi, jumlah] of entri) {
    const i = Number(opsi);
    if (i < 0 || i >= nOpsi) throw new Error(`Tally untuk opsi ${i} di luar rentang 0..${nOpsi - 1}`);
    hasil[i] = jumlah;
  }
  return hasil;
};

/**
 * Menunggu waktu dinding melewati sebuah deadline (DETIK sejak epoch), dengan
 * buffer.
 *
 * Buffer ada karena yang dibandingkan kontrak adalah WAKTU BLOK, bukan jam
 * lokal. Keduanya berjalan bersama tapi tidak identik: blok berikutnya bisa
 * saja masih membawa cap waktu sedikit sebelum deadline walau jam kita sudah
 * lewat. Buffer 60 detik jauh lebih murah daripada satu proof yang terbuang.
 */
export async function tungguSampaiDetik(
  target: bigint,
  log: Logger,
  label: string,
  bufferDetik = 60,
): Promise<void> {
  const sasaran = target + BigInt(bufferDetik);
  while (detikSekarang() < sasaran) {
    const sisa = Number(sasaran - detikSekarang());
    log.info(
      { sisaDetik: sisa, label },
      `Menunggu ${label} benar-benar lewat. Waktu blok jaringan nyata tidak bisa dimajukan — penantian ini tidak bisa dipersingkat.`,
    );
    await new Promise((r) => setTimeout(r, Math.min(30_000, Math.max(1_000, sisa * 1000))));
  }
  log.info({ label }, `${label} sudah lewat menurut jam lokal (+${bufferDetik} detik buffer)`);
}

/**
 * Dua pesan assert yang BOLEH diulang — dan hanya dua.
 *
 *   "Pemungutan suara masih berlangsung"        (tallyVote terlalu cepat)
 *   "Batas waktu pembukaan suara belum lewat"   (finalize terlalu cepat)
 *
 * Keduanya berarti hal yang sama: jam lokal sudah lewat, waktu blok belum.
 * Menunggu lalu mengulang akan berhasil.
 *
 * Yang SENGAJA TIDAK ada di sini: "Batas waktu pembukaan suara **sudah**
 * lewat" — assert ketiga tallyVote. Perbedaannya satu kata (belum/sudah) dan
 * artinya berlawanan: jendelanya sudah tertutup, dan mengulang hanya membakar
 * proof sampai `maks` habis. Ia harus melempar keluar dan menghentikan proses.
 * Itu pula sebabnya kedua loop di e2e.ts punya penjaga anggaran waktu: pesan
 * itu tidak boleh sampai pernah muncul.
 */
export const POLA_BELUM_WAKTUNYA = /Pemungutan suara masih berlangsung|Batas waktu pembukaan suara belum lewat/;

/**
 * Mengulang sebuah pemanggilan selama kegagalannya adalah "waktu blok belum
 * sampai" — bukan kegagalan lain.
 *
 * Aman diulang karena assert deadline dievaluasi saat eksekusi circuit LOKAL
 * (dibuktikan di Step 1): percobaan yang gagal tidak pernah menghasilkan
 * proof, tidak pernah dikirim, dan tidak pernah mengubah keadaan chain.
 *
 * Kegagalan lain diteruskan apa adanya — mengulang assert seperti "Credential
 * ini sudah dipakai memilih" tidak akan pernah berhasil dan hanya membuang
 * waktu di dalam jendela yang berbatas.
 */
export async function cobaSampaiWaktuBlokCocok<T>(
  fn: () => Promise<T>,
  log: Logger,
  pola: RegExp = POLA_BELUM_WAKTUNYA,
  maks = 6,
  jedaMs = 20_000,
): Promise<T> {
  let terakhir: unknown;
  for (let i = 1; i <= maks; i++) {
    try {
      return await fn();
    } catch (e) {
      terakhir = e;
      const pesan = (e as Error).message ?? String(e);
      if (!pola.test(pesan)) throw e;
      log.warn({ percobaan: i, dari: maks, pesan }, "Waktu blok belum melewati deadline; menunggu lalu mencoba lagi");
      if (i < maks) await new Promise((r) => setTimeout(r, jedaMs));
    }
  }
  throw terakhir;
}

// ─── Retry berbatas untuk pengiriman transaksi (jalur deploy) ──────────────
//
// Lihat .superpowers/retry-submit-cli.md untuk investigasi lengkap (gejala,
// bukti, dan kutipan kode SDK). Ringkasnya: `@midnight-ntwrk/wallet-sdk-node-
// client@1.1.2` (dist/effect/PolkadotNodeClient.js) memegang SATU objek `api`
// (koneksi WS ke node) per sesi wallet, dipakai bersama oleh SETIAP panggilan
// `submitTransaction`. `sendMidnightTransaction` (baris 78-96) dan `getGenesis`
// (baris 97-109) SAMA-SAMA memutus `this.api` yang sama itu lewat
// `Stream.ensuring`/`Effect.ensuring` setelah tiap pemakaian, dan
// `ensureConnection()` (baris 56-77) menyambungnya kembali TANPA kunci apa
// pun. Galat yang teramati di lapangan (`SubmissionError: Transaction
// submission failed`, cause `disconnected from ...: 1000:: Normal Closure`)
// persis bentuk yang dilempar ketika `.send()` pada koneksi itu gagal SEBELUM
// node sempat menjawab (PolkadotNodeClient.js baris 84-92) — bukan penolakan
// konsensus.
//
// Prinsipnya SAMA dengan jalur-tulis.ts di C-2b: pengiriman yang berhasil
// tapi jawabannya hilang TIDAK BOLEH dibedakan dari pengiriman yang gagal,
// kecuali dengan memeriksa rantai. `kirimDenganRetri` di bawah menegakkan itu
// sebagai KODE: sebelum SETIAP percobaan ulang, ia memanggil `sudahMendarat()`
// milik pemanggil — bukan menebak dari bentuk galat lokal.

/**
 * Pola galat yang berarti "koneksi putus sebelum sempat dijawab node",
 * diambil verbatim dari sumbernya:
 *  - `PolkadotNodeClient.js` baris 84-92: `.send(...).catch(...)` membungkus
 *    galat apa pun (termasuk WS putus) jadi `SubmissionError` bertuliskan
 *    persis "Transaction submission failed"; `submissionService.js` di
 *    wallet-sdk-capabilities membungkusnya SEKALI LAGI dengan pesan
 *    "Transaction submission error" (tag `_tag`/`name` yang sama:
 *    `SubmissionError`, kelas berbeda) — keduanya dicek di sini.
 *  - `ws/index.js` (@polkadot/rpc-provider) baris 371: pesan penutupan
 *    socket berbentuk persis "disconnected from <endpoint>: <kode>::
 *    <alasan>".
 *  - `PolkadotNodeClient.js` baris 73-76: `ensureConnection()` sendiri gagal
 *    dengan `ConnectionError` bertuliskan "Could not connect within
 *    specified time range (5s)".
 *
 * SENGAJA berbentuk allowlist (pola yang harus COCOK), bukan blocklist (pola
 * yang harus TIDAK ada): penolakan kontrak (assert gagal, mis. "Hanya admin
 * yang boleh mendaftarkan pemilih") punya pesannya sendiri yang tidak
 * menyerupai salah satu di atas, sehingga allowlist otomatis mengeluarkannya
 * tanpa perlu didaftar satu per satu — dan galat BARU yang belum pernah
 * dilihat (kelas kegagalan lain, dari versi SDK mana pun) juga otomatis
 * TIDAK diulang, bukan diulang secara default. Itu arah yang lebih aman untuk
 * kelas kegagalan yang taruhannya membakar biaya nyata.
 */
export const POLA_PUTUS_KONEKSI =
  /disconnected from |WebSocket is not connected|Could not connect within specified time range|SubmissionError.*Transaction submission (failed|error)|(^|[^a-zA-Z])ConnectionError($|[^a-zA-Z])/;

/** Menyusun `name`/`message` di sepanjang rantai `cause`, sedalam `maksKedalaman`. */
function rantaiGalat(e: unknown, maksKedalaman = 6): string {
  const bagian: string[] = [];
  let saatIni: unknown = e;
  for (let i = 0; i < maksKedalaman && saatIni !== undefined && saatIni !== null; i++) {
    if (saatIni instanceof Error) {
      bagian.push(saatIni.name, saatIni.message);
      saatIni = (saatIni as { cause?: unknown }).cause;
    } else {
      bagian.push(String(saatIni));
      break;
    }
  }
  return bagian.join(" | ");
}

/**
 * Klasifikasi bawaan `kirimDenganRetri`: aman diulang HANYA bila galat (atau
 * salah satu `cause`-nya) menyerupai putus koneksi — lihat `POLA_PUTUS_KONEKSI`.
 */
export function putusKoneksiAmanDiulang(e: unknown): boolean {
  return POLA_PUTUS_KONEKSI.test(rantaiGalat(e));
}

/**
 * Hasil pemeriksaan "sudahkah percobaan sebelumnya mendarat", dibaca dari
 * rantai — BUKAN ditebak dari bentuk galat lokal.
 *
 *  - `"mendarat"`: sudah dikonfirmasi di chain; `nilai` dipakai apa adanya
 *    sebagai hasil akhir. TIDAK boleh mengirim ulang.
 *  - `"belum"`: dikonfirmasi BELUM mendarat (mis. registeredCount masih sama
 *    seperti sebelum percobaan). Aman mengirim ulang.
 *  - `"tidakPasti"`: tidak bisa dipastikan (pembacaan chain sendiri gagal,
 *    atau hanya sinyal lemah yang tersedia — lihat pemakaiannya di
 *    `deployBallot`/`deployRegistry`, yang tidak punya alamat kontrak untuk
 *    diperiksa sebelum percobaan pertama berhasil). Untuk keputusan retry,
 *    `"tidakPasti"` DIPERLAKUKAN SAMA seperti "jangan mengulang": berhenti,
 *    jangan mengirim ulang membabi buta.
 */
export type StatusMendarat<T> =
  | { readonly status: "mendarat"; readonly nilai: T }
  | { readonly status: "belum" }
  | { readonly status: "tidakPasti"; readonly alasan: string };

export interface OpsiKirimDenganRetri<T> {
  /** Satu kali percobaan pengiriman (proof + balance + submit, sesuai kasus). */
  readonly kirim: () => Promise<T>;
  /** WAJIB membaca chain, dipanggil sebelum SETIAP percobaan ulang — lihat `StatusMendarat`. */
  readonly sudahMendarat: () => Promise<StatusMendarat<T>>;
  /** Klasifikasi galat "aman diulang". Bawaan: `putusKoneksiAmanDiulang`. */
  readonly bolehDiulang?: (e: unknown) => boolean;
  readonly log: Logger;
  /** Label untuk log, mis. `"deployContract(ballot)"` atau `"registerVoters batch 1/2"`. */
  readonly label: string;
  /**
   * Total percobaan (1 percobaan awal + N ulang). Bawaan 3: satu percobaan
   * awal, dua kesempatan mengulang. Angka ini SENGAJA kecil — setiap
   * percobaan pada panggilan berat (registerVoters/deploy) menghidupkan
   * ulang proof ZK 5-20 detik (lihat komentar `BATAS_MS.panggilBerat` di
   * atas), jadi mengulang tanpa batas membakar waktu (dan berpotensi biaya,
   * bila ternyata mendarat tanpa terdeteksi) jauh lebih cepat daripada
   * menunggu. Dua kali cukup untuk race koneksi yang BERGANTUNG WAKTU (lihat
   * laporan): jeda di antara percobaan mengubah offset waktu percobaan
   * berikutnya relatif terhadap siklus connect/disconnect yang
   * menyebabkannya, sehingga TIDAK dijamin mengulang race yang sama persis.
   * Bila galat penyebabnya SISTEMIK (bukan bergantung waktu), seluruh
   * percobaan akan gagal identik dan pemanggil melihat pesan "jatah
   * percobaan habis" yang jelas — bukan diam selamanya.
   */
  readonly maksPercobaan?: number;
  /**
   * Jeda antar percobaan, ms. Bawaan 5000 — sama dengan bawaan `ulangiSampai`
   * di atas, dan untuk alasan yang mirip: cukup lama untuk siklus reconnect
   * internal `PolkadotNodeClient` (reconnectionDelay 1 detik + timeout 5
   * detik, lihat `DEFAULT_CONFIG` di `PolkadotNodeClient.js`) selesai dengan
   * sendirinya sebelum kita menumpuk satu siklus connect/disconnect lagi di
   * atasnya.
   */
  readonly jedaMs?: number;
}

/**
 * Mengirim dengan retri berbatas, dan TIDAK PERNAH mengulang membabi buta:
 * sebelum SETIAP percobaan ulang, `sudahMendarat()` milik pemanggil WAJIB
 * dipanggil dan hasilnya WAJIB menentukan langkah berikutnya (lihat
 * `StatusMendarat`). Menghapus pemeriksaan ini — mis. langsung menunggu lalu
 * mengulang tanpa membaca `sudahMendarat()` dulu — adalah TEPAT mutasi yang
 * harus MERAH pada uji unit berkas ini.
 *
 * Urutan pemeriksaan pada tiap kegagalan, dan kenapa urutan itu penting:
 *   1. `bolehDiulang(e)` — bila false (penolakan rantai/assert), lempar
 *      SEKARANG. Tidak ada gunanya memeriksa "sudah mendarat" untuk galat
 *      yang MEMANG berarti "ditolak", dan mengulang assert yang gagal hanya
 *      membakar proof sampai jatah habis.
 *   2. Jatah percobaan habis — lempar galat asli, bukan galat generik, supaya
 *      pesan galat SDK (yang sering menyebut sebab spesifik) tidak hilang.
 *   3. `sudahMendarat()` — SATU-SATUNYA sumber kebenaran soal status chain.
 *      "mendarat" memakai hasilnya; "tidakPasti" berhenti dengan galat baru
 *      yang jelas; hanya "belum" yang lanjut ke langkah 4.
 *   4. Jeda, lalu ulangi dari langkah 1 pada percobaan berikutnya.
 */
export async function kirimDenganRetri<T>(opsi: OpsiKirimDenganRetri<T>): Promise<T> {
  const bolehDiulang = opsi.bolehDiulang ?? putusKoneksiAmanDiulang;
  const maks = opsi.maksPercobaan ?? 3;
  const jeda = opsi.jedaMs ?? 5_000;
  pastikan(maks >= 1, `maksPercobaan harus >= 1 (label: ${opsi.label})`);

  for (let percobaan = 1; ; percobaan++) {
    try {
      return await opsi.kirim();
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);

      if (!bolehDiulang(e)) {
        opsi.log.error(
          { percobaan, label: opsi.label, pesan },
          "Galat BUKAN putus koneksi (kemungkinan ditolak rantai) — TIDAK diulang",
        );
        throw e;
      }
      if (percobaan >= maks) {
        opsi.log.error(
          { percobaan, dari: maks, label: opsi.label, pesan },
          "Putus koneksi berulang; jatah percobaan habis",
        );
        throw e;
      }

      opsi.log.warn(
        { percobaan, dari: maks, label: opsi.label, pesan },
        "Putus koneksi saat mengirim; memeriksa rantai sebelum mengulang (TIDAK menebak dari bentuk galat)",
      );
      const status = await opsi.sudahMendarat();

      if (status.status === "mendarat") {
        opsi.log.info(
          { percobaan, label: opsi.label },
          "Percobaan sebelumnya SUDAH mendarat di chain — memakai hasil itu, TIDAK mengirim ulang",
        );
        return status.nilai;
      }
      if (status.status === "tidakPasti") {
        opsi.log.error(
          { percobaan, label: opsi.label, alasan: status.alasan },
          "Tidak bisa dipastikan sudah mendarat atau belum — BERHENTI, tidak aman mengulang secara buta",
        );
        throw new Error(
          `${opsi.label}: putus koneksi, dan status mendarat tidak bisa dipastikan (${status.alasan}). ` +
            `JANGAN menjalankan ulang otomatis — periksa keadaan chain secara manual dulu.`,
        );
      }

      opsi.log.info(
        { percobaan, dari: maks, label: opsi.label, jedaMs: jeda },
        "Dikonfirmasi BELUM mendarat; menunggu lalu mengirim ulang",
      );
      await new Promise((r) => setTimeout(r, jeda));
    }
  }
}

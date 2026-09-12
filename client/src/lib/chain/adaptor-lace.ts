/**
 * AdaptorWallet di atas `api: unknown` yang dikembalikan connectMidnightWallet()
 * (client/src/lib/midnight-wallet.ts). PENEMUAN KONEKTOR SUDAH BENAR di sana —
 * berkas ini TIDAK mengulanginya. Lihat komentar berkas itu (baris 1-9) untuk
 * kenapa mengindeks kunci bernama (mis. `window.midnight.mnLace`) SALAH: Lace
 * yang beredar sekarang mendaftar di bawah kunci UUID acak, diverifikasi lewat
 * spike langsung terhadap Lace nyata tanpa memanggil connect().
 *
 * FAKTA BARU, DARI LACE SUNGGUHAN (bukan dugaan): pengguna menekan vote dan
 * Lace menolak dengan
 *
 *   Unexpected error submitting scoped transaction '<unnamed>':
 *   TypeError: The first argument must be one of type string, Buffer,
 *   ArrayBuffer, Array, or Array-like Object. Received type object
 *
 * "submitting scoped transaction" adalah teks dari KODE LACE, dan bentuk
 * galatnya persis `Buffer.from(x)` menolak masukan bukan-array-like. Itu
 * berarti kita mengoper OBJEK `Transaction` ke Lace, padahal Lace menuntut
 * bentuk TERSERIALISASI: objek `Transaction` bukan array-like, `Uint8Array`
 * diterima `Buffer.from`. Diperbaiki di sini: `tx.serialize()` (tanpa
 * argumen, `Transaction.serialize(): Uint8Array`) dipanggil SEBELUM setiap
 * pemanggilan ke `api`, baik untuk balance maupun submit — keduanya menerima
 * objek Transaction mentah sebelum perbaikan ini, dan keduanya berada persis
 * di jalur yang memicu galat di atas (submitTx paling langsung, balanceTx
 * dipanggil tepat sebelumnya dengan pola argumen yang sama).
 *
 * Nilai balik dari Lace pada balance*Transaction diperlakukan sebagai SALAH
 * SATU dari tiga bentuk (objek transaksi, bytes — Uint8Array/ArrayBuffer/
 * Array, atau string heksadesimal) — TIDAK DIKETAHUI yang mana sampai diuji
 * terhadap ekstensi sungguhan, jadi ketiganya ditangani lewat
 * normalisasiHasilBalance() di bawah, dengan log dev yang menyebut BENTUK
 * (tipe + panjang SAJA, tidak pernah isinya) yang benar-benar kembali —
 * itulah yang akan menunjukkan kebenaran berikutnya bila masih gagal. Pola
 * deserialize (`Transaction.deserialize("signature", "proof", "binding",
 * bytes)`) BUKAN tebakan: dikutip PERSIS dari
 * @midnight-ntwrk/midnight-js-indexer-public-data-provider@4.0.4
 * dist/index.mjs:462 (fungsi internal `deserializeTransaction`), paket yang
 * SUDAH terpasang di pohon ini, dan markernya cocok dengan
 * `FinalizedTransaction` (ledger-v8.d.ts:3248) yang dibutuhkan balanceTx.
 *
 * TIGA hal TIDAK DAPAT DIPASTIKAN dari paket yang terpasang
 * (@midnight-ntwrk/dapp-connector-api nol hasil di pnpm-lock.yaml pohon ini):
 *
 *  1. balanceSealedTransaction vs balanceUnsealedTransaction — TIDAK DIVERIFIKASI
 *     terhadap Lace sungguhan. "Sealed" dicoba LEBIH DULU karena cocok secara
 *     semantik dengan transaksi yang SUDAH dibuktikan (proveTx sudah berjalan
 *     di proof server kita sebelum balanceTx dipanggil di jalur tulis — lihat
 *     midnight-js-contracts 4.0.4 submitTxCore, dikutip di adaptor-wallet.ts),
 *     fallback ke `balanceUnsealedTransaction` bila yang pertama tidak ada,
 *     log dev menyebut mana yang benar-benar dipakai supaya bisa dikoreksi
 *     begitu diuji terhadap ekstensi sungguhan.
 *  2. submitTransaction mengembalikan id atau `void` — TIDAK DIVERIFIKASI.
 *     Ditangani tanpa menebak: Transaction.identifiers(): TransactionId[]
 *     (ledger-v8 8.1.0, ledger-v8.d.ts:2405-2410, diverifikasi ulang di
 *     task-5-report.md) dihitung LOKAL dari transaksi yang sudah kita susun
 *     sendiri, dipakai sebagai fallback. Bila submitTransaction ternyata
 *     mengembalikan string id yang valid, nilai ITU yang dipakai (diperlakukan
 *     sebagai konfirmasi wallet, bukan satu-satunya sumber kebenaran).
 *  3. Bentuk nilai balik balance*Transaction — objek transaksi, bytes, atau
 *     string hex — TIDAK DIVERIFIKASI terhadap Lace sungguhan (baru ditemukan
 *     lewat error di atas bahwa masukannya HARUS bytes; keluarannya belum
 *     pernah diamati). normalisasiHasilBalance() menangani ketiganya tanpa
 *     berasumsi satu bentuk saja.
 *
 * Tidak ada `as any`/`as unknown as X`: setiap metode pada `api` dijaga
 * runtime lewat panggilWajib()/cariMetode(), pola yang sama dengan tryCall()
 * di midnight-wallet.ts:235-244 — gagal dengan pesan yang menyebut nama
 * metode yang hilang, bukan `TypeError: x is not a function`.
 */
import {
  Transaction,
  type Binding,
  type FinalizedTransaction,
  type Proof,
  type SignatureEnabled,
  type TransactionId,
} from "@midnight-ntwrk/ledger-v8";
import type { UnboundTransaction } from "@midnight-ntwrk/midnight-js-types";
import type { WalletConnection } from "@/lib/midnight-wallet";
import type { AdaptorWallet } from "./adaptor-wallet";

/** Nama metode saja, untuk pesan galat — bukan nilai jawabannya (lihat larangan log kredensial). */
function namaMetodeApi(api: unknown): string[] {
  return api && typeof api === "object" ? Object.keys(api as object) : [];
}

/** Metode wajib: melempar galat yang menyebut nama metode yang hilang, bukan TypeError buta. */
function panggilWajib(api: unknown, method: string): (...args: unknown[]) => Promise<unknown> {
  const fn = (api as Record<string, unknown> | null)?.[method];
  if (typeof fn !== "function") {
    throw new Error(
      `Wallet tidak menyediakan metode "${method}" yang dibutuhkan jalur tulis. Metode tersedia: ${namaMetodeApi(api).join(", ") || "(tidak terdeteksi)"}.`,
    );
  }
  return (fn as (...args: unknown[]) => Promise<unknown>).bind(api);
}

/** Metode opsional dengan beberapa nama kandidat yang mungkin: kembalikan yang PERTAMA cocok. */
function cariMetode(
  api: unknown,
  kandidat: readonly string[],
): { nama: string; fn: (...args: unknown[]) => Promise<unknown> } | null {
  for (const nama of kandidat) {
    const fn = (api as Record<string, unknown> | null)?.[nama];
    if (typeof fn === "function") return { nama, fn: (fn as (...args: unknown[]) => Promise<unknown>).bind(api) };
  }
  return null;
}

// Urutan ini ADALAH bagian dari kontrak — "sealed" dicoba lebih dulu (lihat
// alasan di komentar berkas). Menukar urutan array ini mengubah perilaku.
const KANDIDAT_BALANCE = ["balanceSealedTransaction", "balanceUnsealedTransaction"] as const;

/**
 * bytes -> Transaction, dengan marker TIPE yang sama persis dengan
 * `deserializeTransaction` di @midnight-ntwrk/midnight-js-indexer-public-data-provider
 * (dikutip di blok komentar kepala berkas). Markernya menghasilkan
 * `Transaction<SignatureEnabled, Proof, Binding>` — SAMA dengan alias
 * `FinalizedTransaction` (ledger-v8.d.ts:3248), jadi tidak butuh cast apa pun.
 */
function transaksiDariBytes(bytes: Uint8Array): FinalizedTransaction {
  return Transaction.deserialize<SignatureEnabled, Proof, Binding>("signature", "proof", "binding", bytes);
}

/** String hex (opsional prefiks "0x") -> bytes. Pola sama dengan `toByteArray`
 * di midnight-js-indexer-public-data-provider dist/index.mjs:459
 * (`Buffer.from(s, "hex")`), ditulis ulang tanpa Buffer supaya tidak
 * menambah polyfill Node ke bundel browser. */
function bytesDariHex(hex: string): Uint8Array {
  const bersih = hex.trim().replace(/^0x/i, "");
  if (bersih.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(bersih)) {
    throw new Error("Wallet mengembalikan string yang bukan heksadesimal transaksi yang valid.");
  }
  const keluar = new Uint8Array(bersih.length / 2);
  for (let i = 0; i < keluar.length; i++) keluar[i] = Number.parseInt(bersih.slice(i * 2, i * 2 + 2), 16);
  return keluar;
}

/**
 * Nilai balik balance*Transaction dari Lace BELUM DIVERIFIKASI bentuknya
 * (lihat item 3 di blok komentar kepala berkas). Menebak satu bentuk saja
 * adalah persis kesalahan yang baru saja memicu perbaikan ini (mengoper
 * objek ke `Buffer.from`) — hanya diterapkan pada ARAH SEBALIKNYA. Fungsi ini
 * MEMERIKSA bentuk yang sungguh datang alih-alih menebaknya.
 */
function normalisasiHasilBalance(hasil: unknown): FinalizedTransaction {
  if (typeof hasil === "string") {
    if (import.meta.env.DEV) {
      console.log(`[votepriv:tulis] balanceTx <- wallet: string hex, panjang ${hasil.length}`);
    }
    return transaksiDariBytes(bytesDariHex(hasil));
  }
  if (hasil instanceof Uint8Array) {
    if (import.meta.env.DEV) {
      console.log(`[votepriv:tulis] balanceTx <- wallet: Uint8Array, panjang ${hasil.length}`);
    }
    return transaksiDariBytes(hasil);
  }
  if (hasil instanceof ArrayBuffer) {
    const bytes = new Uint8Array(hasil);
    if (import.meta.env.DEV) {
      console.log(`[votepriv:tulis] balanceTx <- wallet: ArrayBuffer, panjang ${bytes.length}`);
    }
    return transaksiDariBytes(bytes);
  }
  if (Array.isArray(hasil)) {
    const bytes = Uint8Array.from(hasil as number[]);
    if (import.meta.env.DEV) {
      console.log(`[votepriv:tulis] balanceTx <- wallet: Array, panjang ${bytes.length}`);
    }
    return transaksiDariBytes(bytes);
  }
  if (hasil && typeof hasil === "object") {
    if (import.meta.env.DEV) {
      console.log(`[votepriv:tulis] balanceTx <- wallet: objek transaksi apa adanya, ${Object.keys(hasil).length} kunci`);
    }
    return hasil as FinalizedTransaction;
  }
  throw new Error(`balanceTx: wallet mengembalikan bentuk yang tidak dikenali (typeof "${typeof hasil}").`);
}

export function buatAdaptorLace(wallet: WalletConnection): AdaptorWallet {
  if (!wallet.coinPublicKey || !wallet.encryptionPublicKey) {
    throw new Error(
      "Wallet tersambung tapi tidak melaporkan coinPublicKey/encryptionPublicKey — dibutuhkan jalur tulis.",
    );
  }
  const api = wallet.api;
  const coinPublicKey = wallet.coinPublicKey;
  const encryptionPublicKey = wallet.encryptionPublicKey;

  return {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,

    async balanceTx(tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction> {
      const ditemukan = cariMetode(api, KANDIDAT_BALANCE);
      if (!ditemukan) {
        throw new Error(
          `Wallet tidak menyediakan balanceSealedTransaction maupun balanceUnsealedTransaction. Metode tersedia: ${namaMetodeApi(api).join(", ") || "(tidak terdeteksi)"}.`,
        );
      }
      if (import.meta.env.DEV) console.log(`[votepriv:tulis] balanceTx via ${ditemukan.nama}`);
      // Lace menuntut bentuk TERSERIALISASI, bukan objek Transaction — lihat
      // blok komentar kepala berkas untuk galat sungguhan yang membuktikannya.
      const hasil = await ditemukan.fn(tx.serialize(), ttl);
      return normalisasiHasilBalance(hasil);
    },

    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      const kirim = panggilWajib(api, "submitTransaction");
      // Sama seperti balanceTx, dan ini PERSIS titik yang melempar
      // "Unexpected error submitting scoped transaction" pada Lace sungguhan:
      // kirim bytes, bukan objek Transaction mentah.
      const hasil = await kirim(tx.serialize());
      if (import.meta.env.DEV) {
        console.log(
          `[votepriv:tulis] submitTransaction <- wallet: ${typeof hasil}${typeof hasil === "string" ? `, panjang ${hasil.length}` : ""}`,
        );
      }
      // Hanya string TIDAK KOSONG yang dipercaya sebagai id dari wallet — spec
      // yang beredar mengklaim submitTransaction mengembalikan void (klaim itu
      // dari paket yang tidak terpasang di pohon ini, jadi tidak dipercaya
      // buta), sehingga string kosong diperlakukan sama dengan "tidak ada".
      if (typeof hasil === "string" && hasil.length > 0) return hasil;
      const ids = tx.identifiers();
      if (ids.length === 0) {
        throw new Error(
          "submitTransaction tidak mengembalikan id transaksi, dan transaksi yang dikirim tidak punya identifier apa pun untuk diawasi indexer.",
        );
      }
      if (import.meta.env.DEV) {
        console.warn("[votepriv:tulis] submitTransaction tidak mengembalikan id — memakai identifiers() lokal");
      }
      return ids[0];
    },
  };
}

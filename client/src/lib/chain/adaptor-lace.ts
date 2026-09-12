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
 * PENYEBAB GALAT HEADER TAG BERIKUTNYA — dibaca VERBATIM dari bundel
 * ekstensi Lace 2.3.2 terpasang di mesin ini
 * (`~/.config/BraveSoftware/Brave-Browser/Default/Extensions/
 * gafhhkghbfjjkeiendhlofajokpaflmk/2.3.2_0/js/119.js`), bukan dugaan:
 *
 *   deserializeSealedTransaction   -> deserialize("signature","proof","binding",     Buffer.from(e,"hex"))
 *   deserializeUnsealedTransaction -> deserialize("signature","proof","pre-binding", Buffer.from(e,"hex"))
 *
 * "sealed"/"unsealed" menunjuk status BINDING, BUKAN status proof — KEDUANYA
 * sama-sama menuntut transaksi yang SUDAH dibuktikan (proveTx sudah berjalan
 * di proof server kita sebelum balanceTx dipanggil di jalur tulis — lihat
 * midnight-js-contracts 4.0.4 submitTxCore, dikutip di adaptor-wallet.ts).
 * Transaksi yang KITA kirim ke balanceTx adalah
 * `UnboundTransaction = Transaction<SignatureEnabled, Proof, PreBinding>`
 * (@midnight-ntwrk/midnight-js-types@4.0.4 dist/proof-provider.d.ts:2) —
 * yaitu PRE-BINDING. Markernya cocok dengan `deserializeUnsealedTransaction`
 * ("pre-binding"), BUKAN `deserializeSealedTransaction` ("binding"). Jadi
 * METODE YANG BENAR adalah `balanceUnsealedTransaction`.
 *
 * Sebelumnya berkas ini mencoba `balanceSealedTransaction` LEBIH DULU dengan
 * alasan bahwa "sealed" cocok secara semantik dengan transaksi yang SUDAH
 * dibuktikan — PENAFSIRAN ITU KELIRU (dikoreksi di sini): kedua metode
 * menuntut transaksi yang sudah dibuktikan, yang membedakan keduanya adalah
 * BINDING, bukan proof. Lace 2.3.2 mendaftarkan KEDUA metode sekaligus, jadi
 * urutan array `KANDIDAT_BALANCE` (dicari via cariMetode(), yang mengembalikan
 * kandidat PERTAMA yang cocok) adalah SATU-SATUNYA hal yang menentukan mana
 * yang benar-benar dipanggil — itulah seluruh penyebab galat header tag di
 * atas. (Wasm ledger-v8 yang menegakkan pencocokan tag ini terpasang di
 * pohon ini dengan sha256 `88ff7c7c47c30138ee8f3a0c8bcbf12dbdcdeba591edebfb
 * 955c30d732ea7638`, IDENTIK — diverifikasi sha256sum kedua berkas — dengan
 * `.wasm` yang dibundel Lace 2.3.2 sendiri, jadi bukan spekulasi versi:
 * ledger di kedua sisi adalah build yang SAMA PERSIS. Pesan galat wasm untuk
 * tag yang salah berbentuk `expected header tag '<X>', got '<Y>'` — dikutip
 * dari `strings` atas `.wasm` itu, dipakai di uji sebagai bentuk pesan yang
 * realistis, bukan diklaim sebagai teks PERSIS yang dilihat pengguna.)
 *
 * BUG KEDUA, yang menggigit tepat setelah perbaikan pertama: kedua jalur
 * balance di `js/119.js` Lace 2.3.2 berakhir IDENTIK —
 *
 *   return [2, Promise.resolve({ tx: Buffer.from(w.serialize()).toString("hex") })]
 *
 * — SETELAH `signRecipe`+`finalizeRecipe` (`w` sudah BOUND saat itu). Nilai
 * baliknya adalah objek berkunci tunggal `tx` berisi string hex dari
 * transaksi yang sudah bound. Ditangani di normalisasiHasilBalance(): bentuk
 * `{ tx: string }` di-unwrap lalu dideserialisasi dengan marker
 * "signature","proof","binding" (BUKAN "pre-binding" — hasilnya BEDA status
 * binding dari transaksi yang KITA kirim ke balanceTx).
 *
 * PRIVASI (menjawab kekhawatiran yang sebelumnya ditandai belum terverifikasi
 * di berkas ini): jalur unsealed TIDAK mengorbankan privasi. Dari wallet SDK
 * di bundel Lace yang sama (`js/5842.js`):
 *
 *   case "UNBOUND_TRANSACTION": {
 *     const t = e.balancingTransaction ? await this.finalizeTransaction(e.balancingTransaction) : void 0;
 *     const n = e.baseTransaction.bind();          // transaksi KITA hanya di-bind()
 *     return t ? n.merge(t) : n
 *   }
 *
 * `finalizeTransaction` (memanggil `this.provingService.prove(e)` lalu
 * `.bind()`) HANYA dikenakan pada `balancingTransaction` — transaksi biaya
 * yang dibuat WALLET sendiri. `baseTransaction` (transaksi dApp KITA) hanya
 * di-`bind()`, TIDAK PERNAH lewat `provingService.prove` — witness kita
 * tidak pernah masuk proof server Lace. Jalur yang memang menyerahkan witness
 * (`case "UNPROVEN_TRANSACTION"` -> `finalizeTransaction(e.transaction)`,
 * proof BENAR-BENAR dibuat wallet) TIDAK TERJANGKAU dari dApp: diverifikasi
 * lewat grep atas `js/119.js` (kelas yang diekspos konektor ke dApp) — hanya
 * `balanceSealedTransaction`, `balanceUnsealedTransaction`, dan
 * `submitTransaction` terdaftar di sana; `balanceUnprovenTransaction` NIHIL.
 *
 * Pola deserialize (`Transaction.deserialize("signature", "proof", "binding",
 * bytes)`) juga cocok, secara independen, dengan
 * @midnight-ntwrk/midnight-js-indexer-public-data-provider@4.0.4
 * dist/index.mjs:462 (fungsi internal `deserializeTransaction`), paket yang
 * SUDAH terpasang di pohon ini, dan markernya menghasilkan
 * `FinalizedTransaction` (ledger-v8.d.ts:3248) yang dibutuhkan balanceTx.
 *
 * Tidak ada `as any`/`as unknown as X`: setiap metode pada `api` dijaga
 * runtime lewat panggilWajib()/cariMetode(), pola yang sama dengan tryCall()
 * di midnight-wallet.ts:235-244 — gagal dengan pesan yang menyebut nama
 * metode yang hilang, bukan `TypeError: x is not a function`.
 *
 * Sisa yang BELUM diverifikasi lewat submit sungguhan (bukan lagi lewat
 * dugaan — bundel Lace 2.3.2 sudah dibaca, hanya belum diuji ujung-ke-ujung):
 * nilai balik `submitTransaction` — `js/119.js` berakhir `return [2]` tanpa
 * nilai (void), SELARAS dengan fallback `tx.identifiers()` lokal yang sudah
 * ada di sini, tapi kode itu ada di jalur yang belum pernah kita picu
 * sungguhan. Bentuk balance selain `{ tx: hex }` (string/bytes/objek mentah)
 * tetap ditangani secara umum di normalisasiHasilBalance() karena bisa
 * muncul di versi Lace lain atau wallet lain yang memakai adaptor ini.
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

// Urutan ini ADALAH bagian dari kontrak. "unsealed" LEBIH DULU karena tx yang
// kita kirim ke balanceTx adalah UnboundTransaction = pre-binding, dan marker
// deserialize Lace untuk "unsealed" PERSIS "pre-binding" (lihat blok komentar
// kepala berkas, dikutip dari js/119.js Lace 2.3.2) — bukan sekadar tebakan
// urutan. "sealed" dipertahankan sebagai fallback nama metode (Lace nyata
// mendaftarkan keduanya sekaligus, jadi fallback ini tidak pernah tereksekusi
// pada Lace, tapi menjaga adaptor tetap jalan bila wallet lain hanya
// mengekspos salah satu nama). Menukar urutan array ini mengembalikan bug
// aslinya — lihat gerbang mutasi di adaptor-lace.test.ts.
const KANDIDAT_BALANCE = ["balanceUnsealedTransaction", "balanceSealedTransaction"] as const;

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
 * Nilai balik balance*Transaction dari Lace SUNGGUHAN (js/119.js Lace 2.3.2,
 * kedua jalur balance sekaligus, lihat blok komentar kepala berkas) adalah
 * `{ tx: string }` — string hex dari transaksi yang SUDAH bound (dibuat
 * setelah signRecipe+finalizeRecipe). Cabang `{ tx: string }` di bawah
 * menangani bentuk itu SPESIFIK, sebelum passthrough objek generik, dan
 * dideserialisasi dengan marker "binding" (bukan "pre-binding" — beda status
 * binding dari transaksi yang KITA kirim). Bentuk lain (string hex telanjang,
 * bytes — Uint8Array/ArrayBuffer/Array, atau objek Transaction apa adanya)
 * belum pernah teramati dari Lace, tapi tetap ditangani untuk wallet lain
 * yang mungkin memakai adaptor ini — menebak satu bentuk saja adalah persis
 * kesalahan yang memicu perbaikan serialisasi-masuk di berkas ini (mengoper
 * objek ke `Buffer.from`), hanya pada ARAH SEBALIKNYA. Fungsi ini MEMERIKSA
 * bentuk yang sungguh datang alih-alih menebaknya.
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
  if (hasil && typeof hasil === "object" && typeof (hasil as { tx?: unknown }).tx === "string") {
    const hex = (hasil as { tx: string }).tx;
    if (import.meta.env.DEV) {
      console.log(`[votepriv:tulis] balanceTx <- wallet: objek { tx: hex }, panjang hex ${hex.length}`);
    }
    // Sudah BOUND (js/119.js: signRecipe+finalizeRecipe sebelum serialize) —
    // marker "binding", BUKAN "pre-binding". transaksiDariBytes() sudah
    // hardcode "binding", jadi dipakai apa adanya di sini.
    return transaksiDariBytes(bytesDariHex(hex));
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
      // Hanya string TIDAK KOSONG yang dipercaya sebagai id dari wallet —
      // js/119.js Lace 2.3.2 (lihat blok komentar kepala berkas) berakhir
      // `return [2]` TANPA nilai untuk submitTransaction (void, belum diuji
      // lewat submit sungguhan), sehingga string kosong diperlakukan sama
      // dengan "tidak ada" dan fallback ke identifiers() lokal di bawah.
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

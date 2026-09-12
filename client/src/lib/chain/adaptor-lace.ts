/**
 * AdaptorWallet di atas `api: unknown` yang dikembalikan connectMidnightWallet()
 * (client/src/lib/midnight-wallet.ts). PENEMUAN KONEKTOR SUDAH BENAR di sana —
 * berkas ini TIDAK mengulanginya. Lihat komentar berkas itu (baris 1-9) untuk
 * kenapa mengindeks kunci bernama (mis. `window.midnight.mnLace`) SALAH: Lace
 * yang beredar sekarang mendaftar di bawah kunci UUID acak, diverifikasi lewat
 * spike langsung terhadap Lace nyata tanpa memanggil connect().
 *
 * DUA hal TIDAK DAPAT DIPASTIKAN dari paket yang terpasang
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
 *
 * Tidak ada `as any`/`as unknown as X`: setiap metode pada `api` dijaga
 * runtime lewat panggilWajib()/cariMetode(), pola yang sama dengan tryCall()
 * di midnight-wallet.ts:235-244 — gagal dengan pesan yang menyebut nama
 * metode yang hilang, bukan `TypeError: x is not a function`.
 */
import type { FinalizedTransaction, TransactionId } from "@midnight-ntwrk/ledger-v8";
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
      return (await ditemukan.fn(tx, ttl)) as FinalizedTransaction;
    },

    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      const kirim = panggilWajib(api, "submitTransaction");
      const hasil = await kirim(tx);
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

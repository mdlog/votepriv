// Jembatan antara WalletFacade headless (wallet.ts) dan dua antarmuka yang
// diminta midnight-js: WalletProvider (menyeimbangkan + kunci publik) dan
// MidnightProvider (mengirim transaksi).
//
// CATATAN VERSI: berkas ini ditulis terhadap @midnight-ntwrk/wallet-sdk-facade
// 4.0.1 (yang benar-benar terpasang; lihat pnpm-lock.yaml), BUKAN 3.0.0 yang
// dipakai repo rujukan. Salinan 3.0.0 memang ada di pnpm store tapi yatim —
// tidak ada paket di workspace ini yang menunjuknya.
//
// SENGAJA TIDAK ADA penandatanganan intent manual di sini. Rujukan memakai
// helper `signTransactionIntents` untuk mengakali "Failed to clone intent".
// Pada versi yang terpasang, string galat itu tidak ada di paket mana pun
// maupun di wasm ledger-v8 8.1.0, jalur `signRecipe` untuk resep UNBOUND tidak
// menyentuh ProofMarker.preProof sama sekali, dan helper rujukan itu sendiri
// tidak berefek (getter `tx.intents` mengembalikan Map BARU setiap dipanggil,
// sehingga `tx.intents.set(...)` tanpa penugasan balik hilang begitu saja).
// Jangan porting helper itu ke sini.
import type { FinalizedTransaction, TransactionId } from "@midnight-ntwrk/ledger-v8";
import type { MidnightProvider, UnboundTransaction, WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import * as Rx from "rxjs";
import type { KonteksWallet } from "./wallet.ts";

/**
 * midnight-js memanggil `balanceTx(provenTx)` TANPA argumen ttl —
 * midnight-js-contracts 4.0.4 dist/index.mjs:199 persis begitu — padahal
 * `balanceUnboundTransaction` mewajibkan `options.ttl`. Jadi nilai bawaan
 * harus datang dari sini, atau setiap deploy dan setiap pemanggilan circuit
 * gagal. Satu jam adalah nilai yang sama dengan DEFAULT_TTL_MS milik facade
 * (private, tidak bisa diimpor) dan sama dengan `ttlOneHour()` milik
 * midnight-js-utils.
 */
const TTL_BAWAAN_MS = 60 * 60 * 1000;

export const buatWalletProvider = async (
  ctx: KonteksWallet,
): Promise<WalletProvider & MidnightProvider> => {
  // Pola sinkronisasi yang sama dengan ringkasSaldo: menuntut ketiga
  // sub-wallet sinkron SERENTAK. `waitForSyncedState()` memakai Promise.all
  // per sub-wallet sehingga momen "sinkron"-nya boleh tidak berimpitan —
  // bentuk Rx inilah yang benar.
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));

  return {
    // HEX, bukan bech32m. midnight-js menormalkan coin public key lewat
    // parseCoinPublicKeyToHex, tapi encryption key diteruskan MENTAH ke
    // pembuatan transaksi — `state.shielded.address.toString()` (bech32m) di
    // sini akan merusaknya tanpa pesan yang menunjuk ke sini.
    getCoinPublicKey: (): string => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: (): string => state.shielded.encryptionPublicKey.toHexString(),

    async balanceTx(tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction> {
      const resep = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + TTL_BAWAAN_MS) },
      );
      // Untuk transaksi deploy biasanya no-op (biaya dibayar DUST, tidak ada
      // ketidakseimbangan unshielded yang perlu ditandatangani). Tetap
      // dipanggil karena begitu ada penyeimbangan NIGHT, ia wajib.
      const ditandatangani = await ctx.wallet.signRecipe(resep, (data: Uint8Array) =>
        ctx.unshieldedKeystore.signData(data),
      );
      return ctx.wallet.finalizeRecipe(ditandatangani);
    },

    // Tidak perlu `as any`: TransactionIdentifier dan TransactionId sama-sama
    // string. Perhatikan bahwa submitTransaction MENUNGGU finalisasi node
    // (wait-level 'Finalized'), lalu midnight-js masih menunggu indexer lewat
    // watchForTxData — hitung menit per transaksi, bukan detik.
    submitTx: (tx: FinalizedTransaction): Promise<TransactionId> => ctx.wallet.submitTransaction(tx),
  };
};

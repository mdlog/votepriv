/**
 * Antarmuka wallet MILIK SENDIRI, di belakang mana adaptor Lace (Task 5)
 * hidup. ContractProviders<BallotC> butuh WalletProvider & MidnightProvider
 * (midnight-js-types) sekaligus — antarmuka ini menggabungkan keduanya persis
 * (wallet-provider.d.ts, midnight-provider.d.ts), memakai `string` untuk
 * CoinPublicKey/EncPublicKey (keduanya type alias string di ledger-v8, sama
 * seperti TransactionId) supaya Task 4 tidak bergantung pada nama tipe
 * bernomina yang belum diverifikasi ekspornya.
 *
 * Bentuknya diturunkan dari APA YANG MIDNIGHT-JS BENAR-BENAR PANGGIL, bukan
 * dari apa yang Lace tawarkan (bentuk Lace tidak diketahui dari pohon ini —
 * lihat brief Task 4). Dua bukti langsung:
 *
 *  1. midnight-js-contracts 4.0.4 dist/index.mjs, submitTxCore (baris
 *     197-200): `providers.walletProvider.balanceTx(provenTx)` (TANPA
 *     argumen ttl, walau balanceTx menerimanya opsional) lalu
 *     `providers.midnightProvider.submitTx(toSubmit)`.
 *  2. pkgs/cli/src/wallet-provider.ts — implementasi yang SUDAH TERBUKTI
 *     melakukan vote sungguhan di testnet — mengembalikan SATU objek yang
 *     memenuhi kedua peran sekaligus (getCoinPublicKey, getEncryptionPublicKey,
 *     balanceTx, submitTx).
 */
import type { FinalizedTransaction, TransactionId } from "@midnight-ntwrk/ledger-v8";
import type { UnboundTransaction } from "@midnight-ntwrk/midnight-js-types";

export interface AdaptorWallet {
  getCoinPublicKey(): string;
  getEncryptionPublicKey(): string;
  balanceTx(tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction>;
  submitTx(tx: FinalizedTransaction): Promise<TransactionId>;
}

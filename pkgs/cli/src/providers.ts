import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ContractProviders } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type {
  MidnightProvider,
  PublicDataProvider,
  WalletProvider,
  ZKConfigProvider,
} from "@midnight-ntwrk/midnight-js-types";
import {
  BallotPrivateStateId,
  RegistryPrivateStateId,
  type BallotPrivateState,
  type RegistryPrivateState,
} from "contract";
import type { Logger } from "pino";
import { currentDir, type Config } from "./config.ts";
import {
  SIRKUIT_BALLOT,
  SIRKUIT_REGISTRY,
  zkDir,
  type BallotC,
  type RegistryC,
  type SirkuitBallot,
  type SirkuitRegistry,
} from "./kontrak.ts";
import { buatWalletProvider } from "./wallet-provider.ts";
import type { KonteksWallet } from "./wallet.ts";

export type ProvidersBallot = ContractProviders<BallotC>;
export type ProvidersRegistry = ContractProviders<RegistryC>;

// ─── Password store private state ───────────────────────────────────────────
//
// levelPrivateStateProvider 4.0.4 mengenkripsi private state di disk dengan
// AES-256-GCM dan MEMVALIDASI password pada SETIAP operasi baca/tulis, bukan
// sekali saat dibuka. Aturannya (diverifikasi dengan memicu tiap pesannya):
//   1. wajib ada
//   2. panjang >= 16
//   3. maksimal 3 karakter identik beruntun
//   4. minimal 3 dari 4 kelas: huruf kecil, huruf besar, angka, simbol
//   5. tidak boleh ada 4 charCode berurutan naik ATAU turun, dicek pada string
//      yang SUDAH di-lowercase — jadi "abcd", "1234", "dcba", bahkan "()*+"
//      semuanya ditolak
//
// Aturan 5 itulah alasan pendekatan naif (base64 dari kunci publik + akhiran)
// berbahaya: alfabet base64 punya banyak rentang berurutan, sehingga password
// akan lolos untuk hampir semua wallet dan gagal PERMANEN untuk sebagian kecil.
// Di sini password dibangun dari empat alfabet yang setiap anggotanya berjarak
// >= 2 charCode dari anggota mana pun (juga setelah di-lowercase), dan posisi
// bergilir antar kelas — sehingga aturan 3, 4 dan 5 dipenuhi SECARA KONSTRUKSI,
// bukan secara kebetulan.
const ALFABET: readonly string[] = [
  "acegikmoqsuwy", // huruf kecil, berjarak 2
  "ACEGIKMOQSUWY", // huruf besar; setelah lowercase tetap berjarak 2 dari yang di atas
  "13579", // angka, berjarak 2
  "#%+", // simbol, berjarak >= 2, jauh dari angka dan huruf
];

const PANJANG_PASSWORD = 24;

/**
 * PERINGATAN KEAMANAN YANG JUJUR: password ini diturunkan dari `accountId`,
 * yang adalah coin public key wallet — data PUBLIK. Enkripsi store karenanya
 * melindungi dari pembacaan disk yang tidak sengaja (backup, indexer berkas,
 * mata yang lewat), BUKAN dari penyerang yang tahu kunci publik wallet dan
 * memegang berkas LevelDB-nya. Untuk pemakaian sungguhan, setel
 * VOTEPRIV_PRIVATE_STATE_PASSWORD dan password itulah yang dipakai.
 */
export function passwordStore(accountId: string): string {
  const dariEnv = process.env.VOTEPRIV_PRIVATE_STATE_PASSWORD;
  if (dariEnv !== undefined && dariEnv.length > 0) return dariEnv;

  const benih = crypto.createHash("sha256").update(`votepriv:private-state:v1:${accountId}`).digest();
  let pw = "";
  for (let i = 0; i < PANJANG_PASSWORD; i++) {
    const alfabet = ALFABET[i % ALFABET.length];
    pw += alfabet[benih[i % benih.length] % alfabet.length];
  }
  return pw;
}

// ─── Konteks bersama ────────────────────────────────────────────────────────

export interface KonteksProvider {
  readonly config: Config;
  readonly publicDataProvider: PublicDataProvider;
  readonly dompet: WalletProvider & MidnightProvider;
  readonly accountId: string;
  readonly log: Logger;
}

/**
 * publicDataProvider dan jembatan wallet dibuat SEKALI dan dipakai bersama
 * seluruh objek providers. Yang TIDAK bisa dipakai bersama adalah
 * zkConfigProvider dan privateStateProvider: MidnightProviders menaruh id
 * circuit di ZKConfigProvider<PCK> dan tipe private state di
 * PrivateStateProvider<PSI, PS>, keduanya di posisi tipe kembalian, sehingga
 * tidak ada pelebaran tipe yang bisa membuat satu objek melayani kedua
 * kontrak (sudah dicoba: `MidnightProviders<string, ...>` dan gabungan union
 * keduanya sama-sama galat kompilasi). Direktori ZK-nya memang berbeda juga.
 *
 * Tiga parameter, bukan dua: `log` disimpan di konteks supaya setiap perakit
 * provider dan setiap pemanggil punya logger yang sama tanpa variabel global.
 */
export async function buatKonteksProvider(
  ctx: KonteksWallet,
  config: Config,
  log: Logger,
): Promise<KonteksProvider> {
  const dompet = await buatWalletProvider(ctx);
  return {
    config,
    log,
    dompet,
    accountId: dompet.getCoinPublicKey(),
    // Skema URL divalidasi saat konstruksi: query wajib http/https,
    // subscription wajib ws/wss. Tertukar = InvalidProtocolSchemeError.
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
  };
}

/**
 * Direktori LevelDB private state. SATU direktori per identitas (admin,
 * pemilih-0, ...) — bukan kemewahan: levelPrivateStateProvider MEMBUKA dan
 * MENUTUP seluruh LevelDB pada setiap operasi, sehingga dua operasi yang
 * tumpang tindih pada direktori yang sama bertabrakan di berkas LOCK dan
 * melempar NotOpenError / LEVEL_LOCKED. Itu sudah diukur pada build terpasang.
 */
const dirPrivateState = (networkId: string, namaStore: string): string => {
  const dir = path.resolve(currentDir, "..", "private-state", networkId, namaStore);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * httpClientProofProvider MENELAN galat konfigurasi ZK diam-diam: bila
 * `zkConfigProvider.get(circuitId)` melempar (jalur salah, berkas hilang, id
 * tidak cocok), ia menangkapnya dan mengirim permintaan ke proof server tanpa
 * key material — gagalnya jauh kemudian, dengan pesan proof server yang tidak
 * menunjuk ke mana-mana. Karena itu kunci verifier dibaca paksa lebih dulu di
 * sini, supaya jalur yang salah gagal SEKARANG dengan ENOENT yang menyebut
 * nama berkasnya.
 */
async function pastikanArtefakZk<K extends string>(
  zk: ZKConfigProvider<K>,
  sirkuit: readonly K[],
  dir: string,
): Promise<void> {
  try {
    await zk.getVerifierKeys([...sirkuit]);
  } catch (e) {
    throw new Error(
      `Artefak ZK tidak terbaca di ${dir} (butuh keys/<circuit>.prover, keys/<circuit>.verifier, zkir/<circuit>.bzkir untuk ${sirkuit.join(", ")}). Penyebab: ${(e as Error).message}`,
    );
  }
}

/**
 * 10 menit. Sengaja LEBIH KECIL daripada BATAS_MS.deploy dan
 * BATAS_MS.panggilBerat (15 menit) di tunggu.ts: bila yang macet adalah proof
 * server, pesan galat dari proof provider menyebut circuit-nya, sedangkan
 * pembungkus batas waktu generik tidak.
 */
const TIMEOUT_PROOF_MS = 600_000;

export async function rakitProvidersRegistry(kp: KonteksProvider, namaStore: string): Promise<ProvidersRegistry> {
  const dir = zkDir("registry");
  const zkConfigProvider = new NodeZkConfigProvider<SirkuitRegistry>(dir);
  await pastikanArtefakZk(zkConfigProvider, SIRKUIT_REGISTRY, dir);

  return {
    privateStateProvider: levelPrivateStateProvider<typeof RegistryPrivateStateId, RegistryPrivateState>({
      midnightDbName: dirPrivateState(kp.config.networkId, namaStore),
      accountId: kp.accountId,
      privateStoragePasswordProvider: () => passwordStore(kp.accountId),
    }),
    publicDataProvider: kp.publicDataProvider,
    zkConfigProvider,
    // Satu proof provider per kontrak: ia terikat pada zkConfigProvider-nya.
    // Memakai ulang proof provider registry untuk ballot akan menabrak
    // penelanan galat di atas dan gagal senyap.
    proofProvider: httpClientProofProvider(kp.config.proofServer, zkConfigProvider, {
      // Timeout HANYA berlaku bila diberikan di sini. ProveTxConfig yang
      // diteruskan ke proveTx() diabaikan (parameternya berawalan underscore
      // dan tidak dipakai). Bawaannya 300_000 ms; prover key castVote dan
      // registerVoters ~10 MB, jadi dinaikkan.
      timeout: TIMEOUT_PROOF_MS,
    }),
    walletProvider: kp.dompet,
    midnightProvider: kp.dompet,
  };
}

export async function rakitProvidersBallot(kp: KonteksProvider, namaStore: string): Promise<ProvidersBallot> {
  const dir = zkDir("ballot");
  const zkConfigProvider = new NodeZkConfigProvider<SirkuitBallot>(dir);
  await pastikanArtefakZk(zkConfigProvider, SIRKUIT_BALLOT, dir);

  return {
    privateStateProvider: levelPrivateStateProvider<typeof BallotPrivateStateId, BallotPrivateState>({
      midnightDbName: dirPrivateState(kp.config.networkId, namaStore),
      accountId: kp.accountId,
      privateStoragePasswordProvider: () => passwordStore(kp.accountId),
    }),
    publicDataProvider: kp.publicDataProvider,
    zkConfigProvider,
    proofProvider: httpClientProofProvider(kp.config.proofServer, zkConfigProvider, { timeout: TIMEOUT_PROOF_MS }),
    walletProvider: kp.dompet,
    midnightProvider: kp.dompet,
  };
}

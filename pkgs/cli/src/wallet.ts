// Bentuk API di berkas ini diturunkan langsung dari rujukan
// midnight-rps-sample-app (pkgs/cli/src/api.ts, commit yang diacu di
// task-3-brief.md), dicek ulang satu-per-satu terhadap definisi tipe paket
// yang benar-benar terpasang di node_modules (versi persis sama dengan
// rujukan: wallet-sdk-facade 3.0.0, wallet-sdk-hd 3.0.2, wallet-sdk-shielded
// 2.1.0, wallet-sdk-unshielded-wallet 2.1.0, wallet-sdk-dust-wallet 3.0.0,
// ledger-v8 8.1.0). Lihat task-3-report.md untuk rincian penurunannya.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NoOpTransactionHistoryStorage } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  createKeystore,
  PublicKey,
  type UnshieldedKeystore,
  UnshieldedWallet,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import type { Logger } from "pino";
import * as Rx from "rxjs";
import { faucetUrlFor } from "shared";
import WebSocket from "ws";
import { currentDir, type Config } from "./config.ts";

// Wallet SDK mengharapkan WebSocket global seperti di browser (dipakai untuk
// langganan GraphQL sinkronisasi terhadap indexer). Pola persis rujukan.
globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

export interface KonteksWallet {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
  /**
   * Direktori cache lokal untuk sesi wallet ini. Bukan bagian dari sketsa
   * brief — ditambahkan supaya `ringkasSaldo` bisa menulis checkpoint
   * sinkronisasi tanpa perlu menerima ulang seed (lihat catatan "Deviasi"
   * di task-3-report.md, temuan C).
   */
  cacheDir: string;
}

// ─── Konfigurasi sub-wallet ─────────────────────────────────────────────────
// Bentuk field (indexerClientConnection, batchSize, provingServerUrl,
// relayURL, txHistoryStorage, costParameters) disalin apa adanya dari
// rujukan — tidak didokumentasikan di .d.ts paket (builder generik),
// dikonfirmasi benar lewat eksekusi sungguhan terhadap preprod (lihat
// laporan).

const buildShieldedConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
    keepAlive: 0,
  },
  // wallet-sdk-shielded@2.x menerima batchSize:number datar. @3.0.1 mengganti
  // bentuknya jadi batchUpdates:{size,timeout,spacing} (lihat dist/v1/Sync.js:
  // `config.batchUpdates?.size ?? 10`, `?.timeout ?? 1`, `?.spacing ?? 4`) —
  // field batchSize lama sudah TIDAK dibaca sama sekali oleh engine baru,
  // sehingga diam-diam jatuh ke default size=10/spacing=4ms (persis skenario
  // "~80 menit overhead" yang disebut komentar lama). size besar + spacing 0
  // meniru maksud rujukan aslinya pada engine sync berbasis stream yang baru.
  batchUpdates: { size: 1000, timeout: 50, spacing: 0 },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, "ws")),
});

const buildUnshieldedConfig = ({ indexer, indexerWS }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
    keepAlive: 0,
  },
  // wallet-sdk-unshielded-wallet@3.x memindahkan storage ke wallet-sdk-abstractions
  // dan mengubah InMemoryTransactionHistoryStorage jadi butuh Schema eksplisit.
  // Kita tidak pernah membaca riwayat transaksi (hanya saldo), jadi NoOp cukup
  // dan tetap memenuhi interface TransactionHistoryStorage yang diwajibkan config.
  txHistoryStorage: new NoOpTransactionHistoryStorage(),
});

const buildDustConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  costParameters: {
    additionalFeeOverhead: 300_000_000_000_000n,
    feeBlocksMargin: 5,
  },
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
    keepAlive: 0,
  },
  // wallet-sdk-dust-wallet@4.1.0 memakai bentuk batchUpdates yang sama dengan
  // wallet-sdk-shielded@3.0.1 (lihat komentar di buildShieldedConfig).
  batchUpdates: { size: 1000, timeout: 50, spacing: 0 },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, "ws")),
});

// ─── Cache status wallet ────────────────────────────────────────────────────
//
// BUKAN optimasi birthday-offset yang dilarang brief. Ini menyimpan
// (lewat serializeState/restore yang didukung resmi oleh SDK) titik
// checkpoint sinkronisasi TERAKHIR yang sudah tervalidasi penuh secara
// berurutan dari genesis, supaya proses berikutnya melanjutkan dari situ,
// bukan menambal indeks awal. Sinkronisasi pertama tetap penuh dari genesis
// tanpa perkecualian.
//
// Deviasi dari rujukan: nama direktori cache TIDAK memakai 16 karakter
// pertama seed mentah (seperti rujukan `seed.slice(0, 16)`). Walau direktori
// itu di-gitignore, 16 karakter hex mentah yang duduk di nama direktori pada
// disk adalah sebagian entropi seed yang bisa terbaca `ls` siapa pun yang
// mengakses mesin/backup — pelanggaran terhadap semangat "seed tidak pernah
// direpresentasikan lewat nilainya" (lihat task-2-report.md). Diganti hash
// SHA-256 dari seed: deterministik per-seed, tidak bisa dibalik ke seed.

const direktoriCacheWallet = (networkId: string, seed: string): string => {
  const kunci = crypto.createHash("sha256").update(seed, "utf8").digest("hex").slice(0, 32);
  return path.resolve(currentDir, "..", "wallet-cache", networkId, kunci);
};

const bacaCache = (dir: string, nama: string): string | null => {
  const p = path.join(dir, `${nama}.json`);
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  } catch {
    return null;
  }
};

/** Terbaik-upaya: gagal menyimpan cache tidak boleh menggagalkan alur utama. */
const simpanCacheWallet = async (wallet: WalletFacade, cacheDir: string, log: Logger): Promise<void> => {
  try {
    const [shielded, unshielded, dust] = await Promise.all([
      wallet.shielded.serializeState(),
      wallet.unshielded.serializeState(),
      wallet.dust.serializeState(),
    ]);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "shielded.json"), shielded, "utf8");
    fs.writeFileSync(path.join(cacheDir, "unshielded.json"), unshielded, "utf8");
    fs.writeFileSync(path.join(cacheDir, "dust.json"), dust, "utf8");
    log.info("Status wallet disimpan ke cache lokal untuk mempercepat sesi berikutnya");
  } catch (e) {
    log.warn({ err: (e as Error).message }, "Gagal menyimpan cache wallet (tidak fatal, dilanjutkan)");
  }
};

// ─── Turunan kunci HD ───────────────────────────────────────────────────────

/**
 * Menurunkan kunci HD untuk ketiga peran (Zswap, NightExternal, Dust) dari
 * seed hex, pada account 0 index 0. Pola persis rujukan
 * `deriveKeysFromSeed`. Pesan galat di sini TIDAK BOLEH pernah menyertakan
 * `seed` — hanya menyebut kegagalan, tidak pernah nilainya.
 */
const turunkanKunciHD = (seed: string) => {
  const hd = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hd.type !== "seedOk") {
    throw new Error("Gagal menginisialisasi HDWallet dari seed.");
  }

  const hasil = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (hasil.type !== "keysDerived") {
    throw new Error("Gagal menurunkan kunci HD dari seed.");
  }

  hd.hdWallet.clear();
  return hasil.keys;
};

// ─── Membangun wallet ───────────────────────────────────────────────────────

/**
 * Membangun (atau memulihkan dari cache lokal) wallet headless dari seed hex,
 * lalu memulai ketiga sub-wallet (shielded/zswap, unshielded/night, dust).
 * TIDAK menunggu sinkronisasi — itu tanggung jawab `ringkasSaldo`.
 *
 * Deviasi dari sketsa brief: menerima parameter `log` tambahan. Brief hanya
 * menulis `bangunWallet(config, seed): Promise<KonteksWallet>`, tapi temuan
 * review C (task-3-brief.md) melarang `process.stdout.write` untuk progres
 * karena `seed.ts` membungkam `process.stdout` selama prompt mungkin masih
 * terbuka. Progres sinkronisasi wallet nyata (Task 3+) bisa berjalan lama,
 * dan satu-satunya saluran aman untuk melaporkannya adalah logger pino —
 * yang berarti fungsi ini butuh logger itu diteruskan, bukan diasumsikan
 * lewat stdout global.
 */
export async function bangunWallet(config: Config, seed: string, log: Logger): Promise<KonteksWallet> {
  const networkId = getNetworkId();
  const cacheDir = direktoriCacheWallet(networkId, seed);

  const kunciHD = turunkanKunciHD(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(kunciHD[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(kunciHD[Roles.Dust]);
  const unshieldedKeystore = createKeystore(kunciHD[Roles.NightExternal], networkId);

  const walletConfig = {
    ...buildShieldedConfig(config),
    ...buildUnshieldedConfig(config),
    ...buildDustConfig(config),
  };

  const shieldedCache = bacaCache(cacheDir, "shielded");
  const unshieldedCache = bacaCache(cacheDir, "unshielded");
  const dustCache = bacaCache(cacheDir, "dust");
  const dariCache = Boolean(shieldedCache && unshieldedCache && dustCache);

  log.info(
    {
      dariCache,
      alamatUnshielded: unshieldedKeystore.getBech32Address().toString(),
    },
    dariCache
      ? "Memulihkan wallet dari cache lokal (melanjutkan sinkronisasi)"
      : "Membangun wallet baru — sinkronisasi PERTAMA dari genesis, bisa memakan waktu lama",
  );

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (cfg) =>
      dariCache
        ? ShieldedWallet(cfg).restore(shieldedCache as string)
        : ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      dariCache
        ? UnshieldedWallet(cfg).restore(unshieldedCache as string)
        : UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) =>
      dariCache
        ? DustWallet(cfg).restore(dustCache as string)
        : DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, cacheDir };
}

// ─── Saldo ──────────────────────────────────────────────────────────────────

/**
 * Menunggu sinkronisasi selesai lalu melaporkan saldo NIGHT dan DUST beserta
 * alamat unshielded. Pola sinkronisasi persis brief:
 * `Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)))`.
 *
 * Deviasi: menerima `log` (lihat catatan di `bangunWallet`) dan memakai
 * langganan kedua yang di-throttle untuk melaporkan progres — SELALU lewat
 * pino, tidak pernah `process.stdout.write` — supaya sinkronisasi pertama
 * yang lama tidak terlihat seperti proses yang macet.
 */
export async function ringkasSaldo(
  ctx: KonteksWallet,
  log: Logger,
): Promise<{ night: bigint; dust: bigint; alamatUnshielded: string }> {
  const mulai = Date.now();
  log.info(
    `Menunggu sinkronisasi wallet dengan jaringan ${getNetworkId()} (sinkronisasi pertama memindai dari genesis dan bisa memakan waktu lama; jangan diinterupsi)`,
  );

  const heartbeat = ctx.wallet.state().pipe(Rx.throttleTime(15_000)).subscribe((s) => {
    const p = s.shielded.progress;
    log.info(
      {
        appliedIndex: p.appliedIndex.toString(),
        highestIndex: p.highestIndex.toString(),
        isSynced: s.isSynced,
      },
      "Progres sinkronisasi wallet (zswap)",
    );
  });

  let state: Awaited<ReturnType<typeof ambilStateSinkron>>;
  try {
    state = await ambilStateSinkron(ctx.wallet);
  } finally {
    heartbeat.unsubscribe();
  }

  const detikSinkron = ((Date.now() - mulai) / 1000).toFixed(1);
  log.info({ detikSinkron }, "Wallet tersinkronisasi dengan jaringan");

  await simpanCacheWallet(ctx.wallet, ctx.cacheDir, log);

  const night = state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
  const dust = state.dust.balance(new Date());
  const alamatUnshielded = ctx.unshieldedKeystore.getBech32Address().toString();

  const networkId = getNetworkId();
  if (night === 0n) {
    log.warn(`Saldo NIGHT nol. Isi wallet dengan tNight lewat faucet: ${faucetUrlFor(networkId)}`);
  }
  if (dust === 0n) {
    log.warn(
      "Saldo DUST nol. DUST diperlukan untuk membayar biaya transaksi dan digenerasi dari NIGHT UTXO yang terdaftar.",
    );
    log.warn(`Isi wallet dengan tNight lewat faucet: ${faucetUrlFor(networkId)}`);
  }

  return { night, dust, alamatUnshielded };
}

const ambilStateSinkron = (wallet: WalletFacade) =>
  Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));

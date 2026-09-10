// Catatan runner: dijalankan lewat `node --experimental-strip-types`, yang HANYA
// menghapus sintaks tipe — ia tidak meniru resolusi ".js" -> ".ts" milik tsc/ts-node
// (dikonfirmasi di dokumentasi Node: ekstensi harus eksplisit). Karena itu impor lokal
// di sini memakai ".ts", bukan ".js" seperti draf awal brief. Vitest (seed.test.ts)
// tidak terkena masalah ini karena resolver Vite-nya memang memetakan ".js" -> ".ts".
import { faucetUrlFor } from "shared";
import { caraTurunanDariArgv } from "./args.ts";
import { PreprodConfig } from "./config.ts";
import { buatLogger } from "./logger.ts";
import { bacaSeed } from "./seed.ts";
import { bangunWallet, ringkasSaldo } from "./wallet.ts";

const config = new PreprodConfig();
const log = buatLogger(config.logDir);

log.info(
  { networkId: config.networkId, indexer: config.indexer, node: config.node, proofServer: config.proofServer },
  "Konfigurasi jaringan",
);

const caraTurunan = caraTurunanDariArgv();
const seed = await bacaSeed(caraTurunan);
log.info(`Seed diterima (${seed.length} byte, metode turunan: ${caraTurunan}).`);

const ctx = await bangunWallet(config, seed, log);
const saldo = await ringkasSaldo(ctx, log);
log.info(
  { alamat: saldo.alamatUnshielded, night: saldo.night.toString(), dust: saldo.dust.toString() },
  "Wallet tersinkronisasi",
);

if (saldo.dust === 0n) {
  log.error("Saldo DUST nol. DUST diperlukan untuk membayar biaya transaksi dan digenerasi dari NIGHT UTXO yang terdaftar.");
  log.error(`Isi wallet dengan tNight lewat faucet: ${faucetUrlFor(config.networkId)}`);
  process.exit(1);
}

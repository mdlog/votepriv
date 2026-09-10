// Catatan runner: dijalankan lewat `node --experimental-strip-types`, yang HANYA
// menghapus sintaks tipe — ia tidak meniru resolusi ".js" -> ".ts" milik tsc/ts-node
// (dikonfirmasi di dokumentasi Node: ekstensi harus eksplisit). Karena itu impor lokal
// di sini memakai ".ts", bukan ".js" seperti draf awal brief. Vitest (seed.test.ts)
// tidak terkena masalah ini karena resolver Vite-nya memang memetakan ".js" -> ".ts".
import { PreprodConfig } from "./config.ts";
import { buatLogger } from "./logger.ts";
import { bacaSeed } from "./seed.ts";

const config = new PreprodConfig();
const log = buatLogger(config.logDir);

log.info(
  { networkId: config.networkId, indexer: config.indexer, node: config.node, proofServer: config.proofServer },
  "Konfigurasi jaringan",
);

const seed = await bacaSeed();
log.info(`Seed diterima (${seed.length} karakter). Wallet dibangun pada Task 3.`);

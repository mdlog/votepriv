// Alat diagnostik spike Task 3 — BUKAN bagian dari lingkup Task 3 yang diminta
// brief (yang menargetkan preprod). Dipakai untuk membedakan hazard sinkronisasi
// zswap yang spesifik-preprod dari hazard yang ada di semua jaringan publik
// Midnight dengan SDK versi yang sama. Lihat task-3-report.md, bagian
// "Uji jaringan preview", untuk hasil dan konteksnya. Struktur identik dengan
// preprod.ts.
import { faucetUrlFor } from "shared";
import { caraTurunanDariArgv } from "./args.ts";
import { PreviewConfig } from "./config.ts";
import { buatLogger } from "./logger.ts";
import { bacaSeed } from "./seed.ts";
import { bangunWallet, ringkasSaldo } from "./wallet.ts";

const config = new PreviewConfig();
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

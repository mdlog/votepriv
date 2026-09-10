// Skrip diagnostik untuk menguji hipotesis "indexer preprod alternatif"
// dari koordinator (lihat task-3-report.md, ADDENDUM KEDUA).
//
// HASIL: NEGATIF. Sinkronisasi terhadap blockfrost.lw.iog.io mandek di
// indeks komitmen zswap ~1.500.189 — posisi yang sama (selisih puluhan dari
// 1,5 juta) dengan kemacetan di indexer.preprod.midnight.network yang
// dilaporkan sebelumnya di berkas ini. Kemacetan bukan disebabkan instance
// indexer — ada di data chain preprod itu sendiri (atau di node RPC yang
// dipakai kedua indexer, keduanya belum dibedakan). KARENA ITU
// MIDNIGHT_NETWORK_ENDPOINTS.preprod di shared TIDAK diubah.
//
// TIDAK menyentuh MIDNIGHT_NETWORK_ENDPOINTS.preprod di shared — Config
// dibangun manual di sini dengan endpoint yang dilaporkan Lace 4.0.1
// (getConfiguration(), Plan A), supaya perbandingan terhadap konstanta
// rujukan (indexer.preprod.midnight.network) adil. Dipertahankan di repo
// (bukan dihapus) sebagai alat reproduksi untuk siapa pun yang ingin
// menguji ulang setelah ada pembaruan dari tim Midnight.
import path from "node:path";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { DEFAULT_PROOF_SERVER_URL } from "shared";
import { caraTurunanDariArgv } from "./args.ts";
import { hentikanWallet } from "./bootstrap.ts";
import { currentDir, type Config } from "./config.ts";
import { buatLogger } from "./logger.ts";
import { bacaSeed } from "./seed.ts";
import { bangunWallet, ringkasSaldo } from "./wallet.ts";

setNetworkId("preprod");

const config: Config = {
  networkId: "preprod",
  logDir: path.resolve(currentDir, "..", "logs", "preprod-blockfrost", `${new Date().toISOString()}.log`),
  // Endpoint yang benar-benar dilaporkan Lace 4.0.1 lewat getConfiguration()
  // di mesin ini selama Plan A — BUKAN dugaan.
  indexer: "https://blockfrost.lw.iog.io/midnight-preprod/",
  indexerWS: "wss://blockfrost.lw.iog.io/midnight-preprod/ws",
  node: "https://blockfrost.lw.iog.io/midnight-preprod-rpc/",
  proofServer: DEFAULT_PROOF_SERVER_URL,
};

const log = buatLogger(config.logDir);

log.info(
  { networkId: config.networkId, indexer: config.indexer, node: config.node, proofServer: config.proofServer },
  "Konfigurasi jaringan (diagnostik: indexer preprod alternatif blockfrost.lw.iog.io)",
);

const caraTurunan = caraTurunanDariArgv();
const seed = await bacaSeed(caraTurunan);
log.info(`Seed diterima (${seed.length} byte, metode turunan: ${caraTurunan}).`);

const ctx = await bangunWallet(config, seed, log);
const saldo = await ringkasSaldo(ctx, log);
log.info(
  { alamat: saldo.alamatUnshielded, night: saldo.night.toString(), dust: saldo.dust.toString() },
  "Wallet tersinkronisasi (diagnostik blockfrost)",
);

// Fix seam Task 6/7: sebelumnya berkas ini exit(0) langsung tanpa menutup
// wallet — ketiga sub-wallet dan WebSocket-nya ke blockfrost.lw.iog.io
// dibiarkan terbuka, dan checkpoint sinkronisasi (yang mahal untuk diagnostik
// preprod ini — lihat catatan kemacetan di kepala berkas) tidak pernah
// tersimpan ulang di akhir sesi. Sama seperti preview.ts/preprod.ts
// (./cek-jaringan.ts), tutup dengan tertib sebelum keluar.
await hentikanWallet(ctx, log);
process.exit(0);

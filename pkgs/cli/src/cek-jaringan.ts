// Alur bersama untuk `pnpm cli preview` dan `pnpm cli preprod`: bangun &
// sinkronkan wallet headless terhadap jaringan yang diberikan, laporkan
// saldo, lalu TUTUP wallet dengan tertib sebelum keluar — pada KEDUA jalur
// keluar, sukses maupun DUST nol.
//
// Sebelum berkas ini ada, preview.ts dan preprod.ts byte-identical (selain
// kelas Config yang dipakai) dan KEDUANYA jatuh dari akhir skrip tanpa
// memanggil `hentikanWallet`/`tutupSesi` (yang sudah ada sejak Task 4):
// ketiga sub-wallet dan WebSocket-nya ke indexer dibiarkan terbuka, checkpoint
// sinkronisasi TERBARU tidak pernah tersimpan (`ringkasSaldo` menyimpan cache
// SEKALI, di AWAL sinkronisasi, bukan di akhir — lihat catatan di
// `hentikanWallet`, bootstrap.ts), dan proses berakhir tanpa exit code yang
// eksplisit pada jalur sukses. `pnpm cli preview` adalah prasyarat rencana
// ini sendiri sebelum deploy pertama, jadi ini hal PERTAMA yang dijalankan
// operator — dan yang membuat sesi BERIKUTNYA (termasuk `deploy-registry`)
// menyinkronkan ulang lebih jauh dari yang perlu.
//
// Byte-identical berarti satu implementasi bersama lebih sederhana daripada
// dua salinan yang harus diperbaiki dan dijaga tetap sinkron berdua-dua —
// persis kelas masalah yang sama dengan MENIT_VOTE/MENIT_TALLY di jadwal.ts.
// diag-blockfrost.ts TIDAK dipindah ke sini: berkas itu punya Config manual
// (bukan PreviewConfig/PreprodConfig), pesan log yang berbeda, dan semantik
// keluar yang berbeda (selalu exit 0, tanpa cabang galat DUST) — memaksakannya
// ke bentuk yang sama hanya akan menambah percabangan tanpa mengurangi
// duplikasi yang berarti.
import { faucetUrlFor } from "shared";
import { caraTurunanDariArgv } from "./args.ts";
import { hentikanWallet } from "./bootstrap.ts";
import type { Config } from "./config.ts";
import { buatLogger } from "./logger.ts";
import { bacaSeed } from "./seed.ts";
import { bangunWallet, ringkasSaldo } from "./wallet.ts";

export async function jalankanCekJaringan(config: Config): Promise<void> {
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
    log.error(
      "Saldo DUST nol. DUST diperlukan untuk membayar biaya transaksi dan digenerasi dari NIGHT UTXO yang terdaftar.",
    );
    log.error(`Isi wallet dengan tNight lewat faucet: ${faucetUrlFor(config.networkId)}`);
    await hentikanWallet(ctx, log);
    process.exit(1);
  }

  // Jalur sukses: tutup dengan tertib (checkpoint sinkronisasi TERBARU +
  // wallet.stop()) sebelum keluar — lihat catatan berkas di atas.
  // process.exit eksplisit (pola sama seperti tutupSesi di bootstrap.ts):
  // wallet.stop() SEHARUSNYA menutup WebSocket ke indexer sendiri, tapi
  // menunggu proses berakhir "secara alami" bergantung pada TIDAK ADA
  // handle lain yang masih terbuka (mis. transport pino) — lebih aman
  // menyatakan exit code sukses secara eksplisit daripada berharap begitu.
  log.info({ kode: 0 }, "Sesi ditutup");
  process.exit(0);
}

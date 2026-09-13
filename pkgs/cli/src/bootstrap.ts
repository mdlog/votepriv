// Bootstrap bersama untuk seluruh titik masuk yang menyentuh jaringan
// (deploy-registry, deploy-ballot, e2e). Menargetkan PREVIEW: sinkronisasi
// zswap preprod macet di indeks commitment ~1,5 juta (direproduksi enam kali,
// dua indexer, dua generasi SDK — lihat laporan Task 3). PreprodConfig tetap
// ada dan tetap tidak dipakai di Rencana B.
import type { Logger } from "pino";
import { faucetUrlFor } from "shared";
import { caraTurunanDariArgv } from "./args.ts";
import { PreviewConfig, type Config } from "./config.ts";
import { buatLogger } from "./logger.ts";
import { buatKonteksProvider, type KonteksProvider } from "./providers.ts";
import { bacaSeed } from "./seed.ts";
import { BATAS_MS, denganBatasWaktu } from "./tunggu.ts";
import { bangunWallet, ringkasSaldo, simpanCacheWallet, type KonteksWallet } from "./wallet.ts";

export interface Sesi {
  readonly config: Config;
  readonly log: Logger;
  readonly ctx: KonteksWallet;
  readonly kp: KonteksProvider;
}

/**
 * Menutup wallet dengan tertib: menyimpan checkpoint sinkronisasi TERBARU lalu
 * menghentikan ketiga sub-wallet.
 *
 * Kenapa ini perlu ada: `ringkasSaldo` menyimpan cache SEKALI, di awal sesi.
 * Sesi e2e berjalan ~90 menit; tanpa penyimpanan kedua di sini, cache-nya
 * berumur 90 menit dan sesi berikutnya harus menyusul 90 menit blok sebelum
 * bisa bekerja — padahal ia sudah melihat blok-blok itu. `wallet.stop()` juga
 * menutup langganan WebSocket ke indexer; tanpa itu proses hanya berakhir
 * karena `process.exit`, bukan karena selesai.
 *
 * Keduanya terbaik-upaya dan berbatas waktu: kegagalan menutup tidak boleh
 * mengubah kode keluar yang sudah ditentukan alur utama, dan tidak boleh
 * menggantung setelah pekerjaan sebenarnya selesai.
 */
export async function hentikanWallet(ctx: KonteksWallet, log: Logger): Promise<void> {
  try {
    await denganBatasWaktu(
      simpanCacheWallet(ctx.wallet, ctx.cacheDir, log),
      BATAS_MS.tutup,
      "Penyimpanan cache wallet melewati batas waktu",
    );
  } catch (e) {
    log.warn({ err: (e as Error).message }, "Gagal menyimpan cache wallet saat menutup (tidak fatal)");
  }
  try {
    await denganBatasWaktu(ctx.wallet.stop(), BATAS_MS.tutup, "wallet.stop() melewati batas waktu");
  } catch (e) {
    log.warn({ err: (e as Error).message }, "Gagal menghentikan wallet dengan tertib (tidak fatal)");
  }
}

/**
 * Menutup sesi lalu keluar. Jalan keluar untuk jalur SUKSES.
 *
 * Cabang galat memakai `await hentikanWallet(...)` diikuti `process.exit(1)`
 * secara terpisah, bukan fungsi ini — dan itu bukan gaya penulisan melainkan
 * keharusan tipe: `process.exit` dideklarasikan mengembalikan `never`, sehingga
 * tsc tahu kode setelahnya tidak tercapai dan penyempitan tipe (`nilai !==
 * undefined`) tetap berlaku di baris-baris berikutnya. `await tutupSesi(...)`
 * tidak memberi tsc informasi itu, dan setiap cabang galat yang memakainya akan
 * menghasilkan galat "possibly undefined" beberapa baris kemudian.
 */
export async function tutupSesi(sesi: Sesi, kode = 0): Promise<never> {
  await hentikanWallet(sesi.ctx, sesi.log);
  sesi.log.info({ kode }, "Sesi ditutup");
  process.exit(kode);
}

/**
 * Jeda terbaik-upaya SETELAH log "Konfigurasi jaringan" dan SEBELUM prompt
 * seed ditulis — memperbaiki cacat yang sudah dilaporkan pengguna: log itu
 * bisa muncul di stdout TEPAT SETELAH teks prompt, membuat prompt yang
 * masih menunggu input terlihat seperti sudah lewat.
 *
 * PENYEBAB (dibuktikan lewat skrip percobaan terpisah, bukan ditebak):
 * `buatLogger` (logger.ts) memakai `pino.transport({ target: "pino-pretty" })`
 * — worker thread TERPISAH yang baru di-spawn PERSIS pada pemanggilan
 * `buatLogger` di atas. `log.info(...)` di bawah SUDAH dipanggil sebelum
 * `bacaSeed(...)` (urutan SUMBER sudah benar), tapi penulisan pretty-print
 * yang sesungguhnya ke stdout terjadi DI DALAM worker thread itu secara
 * asinkron — sedangkan prompt seed (`bacaSeed` -> `tanyaTanpaGema`) menulis
 * teksnya lewat `process.stdout.write` LANGSUNG dan SINKRON tak lama
 * sesudahnya. Dua penulis independen ke stdout yang sama; tanpa jeda ini,
 * prompt SELALU menang (diukur 0/10 percobaan) karena worker pino-pretty
 * baru dimuat dari nol (cold start) setiap kali CLI dijalankan.
 *
 * `logger.flush(cb)` TERBUKTI TIDAK cukup untuk menunggu ini: `pino.multistream`
 * (dipakai `buatLogger`) hanya meneruskan `flushSync`, bukan `flush` async, ke
 * stream anggotanya, sehingga `logger.flush(cb)` memanggil `cb()` SEKETIKA
 * tanpa pernah menunggu worker thread selesai. Mengubah konstruksi transport
 * di logger.ts di luar lingkup perbaikan ini (lihat
 * .superpowers/register-leaves-cli.md) — jeda berbatas di bawah karena itu
 * adalah mitigasi PALING DAPAT DIANDALKAN yang tersisa di jalur siapkanSesi
 * saja. Nilainya diukur empiris (lihat percobaan di atas): cold start worker
 * pino-pretty butuh ~150-300ms sebelum pesan PERTAMANYA benar-benar
 * tercetak (10/10 percobaan pada 150ms dan 300ms; 6/10 pada 50ms; 0/10 pada
 * setImmediate/process.nextTick/10ms — ketiganya murni mengurutkan giliran
 * di event loop UTAMA, bukan menunggu thread worker TERPISAH yang sedang
 * memuat modul pino-pretty). Nilai di bawah memberi margin 2x dari ambang
 * yang sudah reliable pada mesin uji, untuk mesin yang lebih lambat/sibuk
 * (mis. CI). Ini best-effort, BUKAN jaminan matematis — tapi jauh lebih baik
 * daripada race yang SELALU kalah.
 */
export const JEDA_TRANSPORT_PRETTY_MS = 300;

export async function siapkanSesi(): Promise<Sesi> {
  const config = new PreviewConfig(); // memanggil setNetworkId("preview")
  const log = buatLogger(config.logDir);

  log.info(
    { networkId: config.networkId, indexer: config.indexer, node: config.node, proofServer: config.proofServer },
    "Konfigurasi jaringan",
  );
  await new Promise((selesai) => setTimeout(selesai, JEDA_TRANSPORT_PRETTY_MS));

  const caraTurunan = caraTurunanDariArgv();
  const seed = await bacaSeed(caraTurunan);
  log.info(`Seed diterima (${seed.length} byte, metode turunan: ${caraTurunan}).`);

  const ctx = await bangunWallet(config, seed, log);
  const saldo = await ringkasSaldo(ctx, log);
  log.info(
    { alamat: saldo.alamatUnshielded, night: saldo.night.toString(), dust: saldo.dust.toString() },
    "Wallet tersinkronisasi",
  );

  // DUST membayar biaya setiap transaksi. Tanpa DUST tidak ada satu pun
  // langkah berikutnya yang bisa jalan, jadi berhenti di sini dengan pesan
  // yang benar, bukan di tengah pembuatan proof dengan pesan yang tidak.
  if (saldo.dust === 0n) {
    log.error("Saldo DUST nol. DUST diperlukan untuk membayar biaya transaksi dan digenerasi dari NIGHT UTXO terdaftar.");
    log.error(`Isi wallet dengan tNight lewat faucet: ${faucetUrlFor(config.networkId)}`);
    await hentikanWallet(ctx, log);
    process.exit(1);
  }

  const kp = await buatKonteksProvider(ctx, config, log);
  return { config, log, ctx, kp };
}

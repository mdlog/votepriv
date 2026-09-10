// `pnpm cli preprod` — bangun & sinkronkan wallet headless terhadap testnet
// preprod, laporkan saldo, lalu tutup wallet dengan tertib. Skrip tingkat-
// atas: tidak mengekspor apa pun.
//
// TIDAK dipakai jalur deploy CLI ini (Rencana B menargetkan preview — lihat
// bootstrap.ts: sinkronisasi zswap preprod macet di indeks commitment
// ~1,5 juta, direproduksi enam kali, dua indexer, dua generasi SDK, lihat
// laporan Task 3). Dipertahankan sebagai titik masuk yang tetap berfungsi
// untuk siapa pun yang ingin menguji ulang preprod setelah ada pembaruan
// dari tim Midnight.
//
// Seluruh alur ada di ./cek-jaringan.ts, dipakai bersama preview.ts — satu-
// satunya perbedaan preview vs preprod adalah kelas Config yang diteruskan.
import { jalankanCekJaringan } from "./cek-jaringan.ts";
import { PreprodConfig } from "./config.ts";

await jalankanCekJaringan(new PreprodConfig());

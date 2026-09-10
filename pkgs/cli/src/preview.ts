// `pnpm cli preview` — bangun & sinkronkan wallet headless terhadap testnet
// preview, laporkan saldo, lalu tutup wallet dengan tertib. Skrip tingkat-
// atas: tidak mengekspor apa pun.
//
// Alat diagnostik spike Task 3 — BUKAN bagian dari lingkup Task 3 yang diminta
// brief (yang menargetkan preprod). Dipakai untuk membedakan hazard sinkronisasi
// zswap yang spesifik-preprod dari hazard yang ada di semua jaringan publik
// Midnight dengan SDK versi yang sama. Lihat task-3-report.md, bagian
// "Uji jaringan preview", untuk hasil dan konteksnya. `pnpm cli preview`
// sekaligus menjadi prasyarat rencana Task 4+: seluruh alur deploy menargetkan
// preview (lihat bootstrap.ts).
//
// Seluruh alur ada di ./cek-jaringan.ts, dipakai bersama preprod.ts — satu-
// satunya perbedaan preview vs preprod adalah kelas Config yang diteruskan.
import { jalankanCekJaringan } from "./cek-jaringan.ts";
import { PreviewConfig } from "./config.ts";

await jalankanCekJaringan(new PreviewConfig());

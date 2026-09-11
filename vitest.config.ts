import path from "node:path";
import { defineConfig } from "vitest/config";
import wasm from "vite-plugin-wasm";

/**
 * Konfigurasi uji terpisah dari vite.config.ts dengan sengaja.
 *
 * vite.config.ts memuat root `client/`, plugin React, dan beberapa plugin runtime
 * yang tidak ada hubungannya dengan uji unit di sini. Memuatnya hanya menambah
 * permukaan yang bisa gagal tanpa menguji apa pun.
 *
 * DUA HAL YANG DITAMBAHKAN RENCANA C-1, dan alasannya:
 *
 * 1. `environment` tetap "node", jsdom dipetakan HANYA untuk *.test.tsx.
 *    Uji `.ts` yang ada (proof-server.test.ts, 19 uji) hijau di bawah node dan
 *    memakai vi.stubGlobal("location", …). Memindahkan semuanya ke jsdom
 *    mengubah kondisi jalannya uji yang sama sekali tidak berhubungan dengan
 *    pemecahan Home.tsx. Uji render butuh DOM; uji murni tidak, dan tidak boleh
 *    dipaksa menanggung risikonya.
 *
 * 2. `esbuild.jsx` dipaksa "automatic".
 *    tsconfig.json menetapkan "jsx": "preserve" karena Vite-lah yang mengurus
 *    transform di jalur aplikasi. Di jalur uji, esbuild membaca tsconfig itu,
 *    membiarkan JSX apa adanya, dan Node menolak berkasnya. Nilai di sini
 *    menimpanya hanya untuk uji, tanpa menyentuh tsconfig yang dipakai build.
 *
 * URL jsdom dipatok supaya `location.host` deterministik: indikator privasi di
 * sidebar menyusun kalimatnya dari nilai itu, dan kalimat itu ikut dibandingkan
 * uji paritas.
 */
export default defineConfig({
  // Asuransi bila Vitest memilih kondisi resolve "browser" untuk
  // onchain-runtime-v3: entri browser mengimpor .wasm sebagai modul ESM.
  // Pada kondisi "node" plugin ini tidak pernah terpakai, dan itu hasil yang baik.
  plugins: [wasm()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      // Harus sama persis dengan vite.config.ts; kalau berbeda, uji menguji
      // modul yang berbeda dari yang dikirim ke browser.
      "@pkgs": path.resolve(import.meta.dirname, "pkgs"),
    },
    // Sama seperti vite.config.ts: satu modul onchain-runtime-v3, bukan dua.
    // Hanya compact-runtime yang didedupe di sini, BUKAN onchain-runtime-v3 —
    // lihat komentar dedupe di vite.config.ts untuk alasannya (diverifikasi di
    // Task 2 Step 10: mendedupe onchain-runtime-v3 langsung membuat `vite build`
    // gagal resolve karena paket itu tidak di-hoist ke node_modules akar).
    dedupe: ["@midnight-ntwrk/compact-runtime"],
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    // Deadline ballot adalah DETIK SEJAK EPOCH UTC dan diformat dengan
    // timeZone: "UTC" di jalur aplikasi. Mematok TZ di sini menjaga uji tetap
    // sah di mesin mana pun, bukan hanya di mesin yang merekam fixture-nya.
    env: { TZ: "UTC" },
    environment: "node",
    environmentMatchGlobs: [["client/src/**/*.test.tsx", "jsdom"]],
    environmentOptions: {
      jsdom: { url: "http://localhost:3000/" },
    },
    include: ["client/src/**/*.test.{ts,tsx}"],
  },
});

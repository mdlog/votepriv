import path from "node:path";
import { defineConfig } from "vitest/config";

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
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "client", "src") },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["client/src/**/*.test.tsx", "jsdom"]],
    environmentOptions: {
      jsdom: { url: "http://localhost:3000/" },
    },
    include: ["client/src/**/*.test.{ts,tsx}"],
  },
});

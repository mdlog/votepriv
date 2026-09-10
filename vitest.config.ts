import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Konfigurasi uji terpisah dari vite.config.ts dengan sengaja.
 *
 * vite.config.ts memuat root `client/`, plugin React, dan beberapa plugin runtime
 * yang tidak ada hubungannya dengan uji unit di sini. Memuatnya hanya menambah
 * permukaan yang bisa gagal tanpa menguji apa pun.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "client", "src") },
  },
  test: {
    environment: "node",
    include: ["client/src/**/*.test.ts"],
  },
});

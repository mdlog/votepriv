import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gerbang: dep jalur tulis WAJIB dipra-bundel saat dev server START, bukan
 * ditemukan belakangan.
 *
 * Latar: menekan "generate proof" di browser dev memicu `await import("./tulis")`
 * (jalur-tulis.ts) — satu-satunya pintu masuk tulis.ts di seluruh aplikasi (lihat
 * batas-bundel.test.ts, yang menegakkan bahwa tulis.ts TIDAK terjangkau statis dari
 * client/src/main.tsx). Karena itu, scanner esbuild bawaan Vite (yang membangun
 * daftar optimizeDeps AWAL dari entri statis) tidak selalu menjangkau paket-paket
 * yang HANYA dipakai tulis.ts — dan sebelum perbaikan ini, `_metadata.json` yang
 * dihasilkan hanya memuat react/react-dom/jsx-runtime, nihil satu pun paket
 * midnight-js-*, compact-*, atau ledger-v8. Vite baru menemukannya secara MALAS pada
 * dynamic-import PERTAMA, memicu re-optimize DI TENGAH permintaan itu sendiri —
 * race yang membuat permintaan itu mati dengan 504 "Outdated Optimize Dep"
 * (`/@fs/.../node_modules/.vite/deps/@midnight-ntwrk_midnight-js-contracts.js`
 * mengembalikan 504 karena berkasnya belum ada di disk).
 *
 * Uji di sini murni STATIS (membaca teks vite.config.ts, tidak menjalankan dev
 * server) — dipilih begini, bukan menyalakan dev server sungguhan lalu meng-crawl
 * seluruh graf impor tulis.ts, karena race di atas TERBUKTI TIDAK deterministik
 * untuk dijadikan uji rutin: pada Vite 7.1.9 di sandbox verifikasi perbaikan ini,
 * scanner kadang sudah menemukan dep-dep ini sendiri dalam ~1 detik setelah
 * "ready" walau optimizeDeps kosong (lihat .superpowers/dev-optimizedeps-jalur-tulis.md
 * untuk detail) — window race-nya sendiri yang membuat kegagalan ini pernah lolos
 * ke pengguna. Menjadikannya uji otomatis rutin berarti uji yang flaky (kadang
 * hijau kadang merah tergantung timing scan vs. request, kondisi mesin CI, dan
 * cache dep yang sudah ada), plus biaya start dev server sungguhan tiap `pnpm test`.
 * Bukti empiris "graf bersih, nihil 404/504" untuk hasil PILIHAN (`include`) sudah
 * diverifikasi manual dan didokumentasikan verbatim di laporan itu; uji di bawah ini
 * menjaga PENYEBABNYA — deklarasi eksplisit di optimizeDeps — tidak diam-diam
 * hilang lagi, dengan biaya nol dan tanpa flakiness.
 */

const AKAR = path.resolve(new URL("../../../..", import.meta.url).pathname);
const VITE_CONFIG_PATH = path.join(AKAR, "vite.config.ts");

// Paket RUNTIME (bukan `import type`, yang dihapus esbuild dan tidak pernah
// memicu request modul) yang terjangkau dari tulis.ts dan turunannya
// (providers-tulis.ts, kontrak-tulis.ts) — dikonfirmasi lewat crawl graf
// sungguhan (dev server + fetch tiap URL impor tulis.ts secara rekursif,
// lihat .superpowers/dev-optimizedeps-jalur-tulis.md).
const PAKET_JALUR_TULIS = [
  "@midnight-ntwrk/midnight-js-contracts",
  "@midnight-ntwrk/midnight-js-network-id",
  "@midnight-ntwrk/midnight-js-types",
  "@midnight-ntwrk/midnight-js-http-client-proof-provider",
  "@midnight-ntwrk/midnight-js-indexer-public-data-provider",
  "@midnight-ntwrk/midnight-js-utils",
  "@midnight-ntwrk/compact-js",
  "@midnight-ntwrk/compact-runtime",
  "@midnight-ntwrk/ledger-v8",
] as const;

/** Ambil blok `optimizeDeps: { … }` (kurung kurawal seimbang) dari teks vite.config.ts. */
function ambilBlokOptimizeDeps(teks: string): string {
  const label = "optimizeDeps:";
  const posLabel = teks.indexOf(label);
  if (posLabel === -1) return "";
  const posBuka = teks.indexOf("{", posLabel);
  if (posBuka === -1) return "";
  let depth = 0;
  for (let i = posBuka; i < teks.length; i++) {
    if (teks[i] === "{") depth++;
    else if (teks[i] === "}") {
      depth--;
      if (depth === 0) return teks.slice(posBuka, i + 1);
    }
  }
  return "";
}

function ambilDaftar(blok: string, kunci: "include" | "exclude"): string {
  const cocok = blok.match(new RegExp(`\\b${kunci}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  return cocok ? cocok[1] : "";
}

describe("vite.config.ts optimizeDeps — jalur tulis (C-2b)", () => {
  const teksConfig = readFileSync(VITE_CONFIG_PATH, "utf-8");
  const blokOptimizeDeps = ambilBlokOptimizeDeps(teksConfig);

  it("mendeklarasikan blok optimizeDeps di vite.config.ts", () => {
    expect(blokOptimizeDeps).not.toBe("");
  });

  const daftarInclude = ambilDaftar(blokOptimizeDeps, "include");
  const daftarExclude = ambilDaftar(blokOptimizeDeps, "exclude");

  it.each(PAKET_JALUR_TULIS)(
    "%s ada di optimizeDeps.include (dipra-bundel saat server start, bukan ditemukan belakangan)",
    (paket) => {
      expect(daftarInclude).toContain(`"${paket}"`);
    },
  );

  it.each(PAKET_JALUR_TULIS)(
    "%s TIDAK ada di optimizeDeps.exclude (exclude terbukti 3,8x lebih lambat start dan tidak dipilih)",
    (paket) => {
      expect(daftarExclude).not.toContain(`"${paket}"`);
    },
  );
});

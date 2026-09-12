#!/usr/bin/env node
/**
 * Gerbang batas bundel — jalur KELUARAN (Task 9, menggantikan Step 6/7 brief).
 *
 * MENGAPA berkas ini ada dan bukan sekadar node --input-type=module -e '...'
 * satu kali pakai seperti draf brief: RULING penutup Task 9 menemukan brief
 * asli menjumlahkan SELURUH dist/public/assets secara tekstual — invarian
 * terhadap CHUNK mana yang benar-benar memuat .wasm. Skrip ini memakai
 * ATRIBUSI PER-CHUNK lewat dist/public/.vite/manifest.json (diaktifkan lewat
 * build.manifest di vite.config.ts), dan menjaga SATU hal:
 *
 *   Chunk yang terjangkau STATIS dari entri (index.html) tidak boleh
 *   mereferensi .wasm milik jalur TULIS.
 *
 * Dan melaporkan DUA angka terpisah, karena keduanya BUKAN hal yang sama:
 *   1. byte chunk JS jalur tulis   — kode ./tulis.ts itu sendiri
 *   2. byte aset .wasm yang dipicu — ledger-v8 (10.143.782 B) yang ./tulis.ts
 *      seret masuk. WASM keluar sebagai ASET BER-URL (di atas
 *      assetsInlineLimit Vite 4096 B), bukan byte di dalam chunk JS — gerbang
 *      yang hanya menjumlahkan .js akan melaporkan jalur tulis "setengah
 *      megabyte" padahal ia memicu berbelas megabyte WASM.
 *
 * Jalankan SETELAH `pnpm build`:
 *   node scripts/ukur-batas-bundel.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const AKAR = path.resolve(import.meta.dirname, "..");
const DIST = path.join(AKAR, "dist", "public");
const MANIFEST_PATH = path.join(DIST, ".vite", "manifest.json");
const SRC_TULIS_KEY = "src/lib/chain/tulis.ts"; // relatif ke root Vite (client/)
const TULIS_DI_SUMBER = path.join(AKAR, "client", "src", "lib", "chain", "tulis.ts");

let gagal = false;
function galat(pesan) {
  gagal = true;
  console.error(`GAGAL: ${pesan}`);
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(`Tidak ada ${path.relative(AKAR, MANIFEST_PATH)}. Jalankan "pnpm build" dulu.`);
  process.exit(1);
}

/** @type {Record<string, {file:string, src?:string, isEntry?:boolean, isDynamicEntry?:boolean, imports?:string[], dynamicImports?:string[], css?:string[], assets?:string[]}>} */
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

const entriKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
if (!entriKey) {
  console.error("Tidak ada entri (isEntry) di manifest.json — build rusak atau konfigurasi berubah.");
  process.exit(1);
}

function ukuranBerkas(relFile) {
  return statSync(path.join(DIST, relFile)).size;
}

function namaWasm(relFile) {
  return path.basename(relFile);
}

/**
 * BFS lewat `imports` (chunk-ke-chunk STATIS) SAJA — `dynamicImports` SENGAJA
 * tidak diikuti. Itulah batas chunk yang gerbang ini menjaganya, bukan
 * sesuatu yang harus ditembusnya. Manifest Vite memakai `imports` untuk
 * hubungan statis dan `dynamicImports` untuk target `await import()`.
 */
function terjangkauStatisDariEntri() {
  const terjangkau = new Set();
  const antrian = [entriKey];
  while (antrian.length > 0) {
    const k = antrian.pop();
    if (terjangkau.has(k)) continue;
    terjangkau.add(k);
    for (const imp of manifest[k]?.imports ?? []) antrian.push(imp);
  }
  return terjangkau;
}

const entriReachable = terjangkauStatisDariEntri();

// ---------------------------------------------------------------------------
// 1) Chunk entri tidak boleh mereferensi .wasm jalur tulis.
// ---------------------------------------------------------------------------
// Nama wasm baca yang SAH ditentukan lewat resolusi paket sungguhan (bukan
// ditulis literal) — sama seperti draf brief Step 6, supaya tetap benar kalau
// versi onchain-runtime-v3 berubah dan nama berkasnya ikut berubah.
const reqAkarContract = createRequire(path.join(AKAR, "pkgs", "contract", "package.json"));
const reqCompactRuntime = createRequire(reqAkarContract.resolve("@midnight-ntwrk/compact-runtime"));
const wasmBacaPath = path.join(
  path.dirname(reqCompactRuntime.resolve("@midnight-ntwrk/onchain-runtime-v3")),
  "midnight_onchain_runtime_wasm_bg.wasm",
);
const wasmBacaTerpasang = statSync(wasmBacaPath).size;
const NAMA_WASM_BACA_SAH = "midnight_onchain_runtime_wasm_bg";

const wasmDiEntri = new Set();
for (const k of entriReachable) {
  for (const a of manifest[k]?.assets ?? []) if (a.endsWith(".wasm")) wasmDiEntri.add(a);
}

const wasmTakDikenalDiEntri = [...wasmDiEntri].filter(
  (a) => !namaWasm(a).startsWith(NAMA_WASM_BACA_SAH),
);
if (wasmTakDikenalDiEntri.length > 0) {
  galat(
    `chunk ENTRI mereferensi .wasm yang bukan milik jalur baca: ${wasmTakDikenalDiEntri.join(", ")}. ` +
      `Ini persis kebocoran jalur tulis ke chunk entri yang gerbang ini ada untuk mencegahnya.`,
  );
}
if (wasmDiEntri.size === 0) {
  galat("chunk entri TIDAK mereferensi wasm baca sama sekali — jalur baca sendiri diduga rusak (periksa dekode.ts).");
}

// ---------------------------------------------------------------------------
// 2) DUA angka jalur tulis: byte chunk JS, dan byte .wasm yang ia picu.
// ---------------------------------------------------------------------------
let byteChunkJsJalurTulis = 0;
let byteWasmJalurTulis = 0;
let catatanJalurTulis;

const entriTulis = manifest[SRC_TULIS_KEY];
if (entriTulis) {
  if (entriReachable.has(SRC_TULIS_KEY)) {
    galat(
      `client/src/lib/chain/tulis.ts TERGABUNG ke dalam chunk yang terjangkau STATIS dari entri — ` +
        `pintu (jalur-tulis.ts) diduga sudah tidak lagi memuatnya lewat "await import()". ` +
        `Ini persis "C-2b mengganti pintu dengan impor statis" yang gerbang ini ada untuk menangkapnya.`,
    );
  } else {
    byteChunkJsJalurTulis = ukuranBerkas(entriTulis.file);
    const wasmTulis = new Set();
    const antrian = [SRC_TULIS_KEY];
    const dikunjungi = new Set();
    while (antrian.length > 0) {
      const k = antrian.pop();
      if (dikunjungi.has(k)) continue;
      dikunjungi.add(k);
      for (const a of manifest[k]?.assets ?? []) if (a.endsWith(".wasm")) wasmTulis.add(a);
      for (const imp of manifest[k]?.imports ?? []) antrian.push(imp);
    }
    byteWasmJalurTulis = [...wasmTulis].reduce((s, a) => s + ukuranBerkas(a), 0);
    catatanJalurTulis = `chunk jalur tulis ditemukan sebagai entri dinamis manifest (${entriTulis.file}), TIDAK terjangkau statis dari entri — seperti seharusnya.`;
  }
} else if (existsSync(TULIS_DI_SUMBER)) {
  galat(
    "client/src/lib/chain/tulis.ts ADA di sumber tapi TIDAK muncul sebagai entri dinamis di manifest.json — " +
      "kemungkinan besar sudah tergabung statis ke chunk lain (Rollup tidak lagi memberinya chunk terpisah). " +
      "Periksa apakah jalur-tulis.ts (atau pemakainya) masih memuatnya lewat await import(), bukan import statis.",
  );
} else {
  catatanJalurTulis =
    "client/src/lib/chain/tulis.ts belum ada di pohon ini — seam belum dipakai (C-2b belum dikerjakan). " +
    "Kedua angka di bawah karena itu 0, dan itu angka yang JUJUR untuk keadaan hari ini, bukan 'belum diukur'.";
}

// ---------------------------------------------------------------------------
// 3) Safety net tambahan: grep konten dist untuk tanda tangan literal paket
//    jalur tulis. Tidak diperbaiki dari brief karena praperiksa TIDAK
//    menandainya cacat — dipertahankan sebagai lapis kedua yang independen
//    dari cara Rollup menyusun chunk.
// ---------------------------------------------------------------------------
const assetsDir = path.join(DIST, "assets");
const semuaJs = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith(".js")) : [];
const POLA_JALUR_TULIS = /ledger-v8|midnight-js-indexer-public-data-provider|midnight_ledger_wasm/;
const jsTercemar = semuaJs.filter((f) => POLA_JALUR_TULIS.test(readFileSync(path.join(assetsDir, f), "utf8")));
if (jsTercemar.length > 0) {
  galat(`tanda tangan paket jalur tulis ditemukan di keluaran build: ${jsTercemar.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Laporan
// ---------------------------------------------------------------------------
const jsEntriBytes = [...entriReachable].reduce((s, k) => s + ukuranBerkas(manifest[k].file), 0);

console.log("=== gerbang batas bundel (atribusi per-chunk, manifest.json) ===");
console.log("wasm baca terpasang (onchain-runtime-v3) :", wasmBacaTerpasang, "B");
console.log("wasm terjangkau dari chunk ENTRI          :", [...wasmDiEntri].join(", ") || "(tidak ada)");
console.log("js chunk terjangkau statis dari entri     :", jsEntriBytes, "B  (", entriReachable.size, "chunk )");
console.log("byte chunk JS jalur tulis                 :", byteChunkJsJalurTulis, "B");
console.log("byte aset .wasm yang chunk itu picu        :", byteWasmJalurTulis, "B");
if (catatanJalurTulis) console.log("catatan                                    :", catatanJalurTulis);

if (gagal) {
  console.log("GAGAL");
  process.exit(1);
} else {
  console.log("LULUS");
}

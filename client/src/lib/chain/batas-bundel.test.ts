import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gerbang batas bundel — jalur SUMBER.
 *
 * Brief awal Task 9 menulis tiga uji lewat cocok-teks (regex atas ISI berkas
 * apa adanya, disapukan ke SELURUH client/src). Praperiksa task-9 menemukan
 * ketiganya cacat, dan RULING penutup menegaskan predikat yang benar:
 *
 *   BUKAN "tidak ada di mana pun di client/src"
 *   MELAINKAN "tidak terjangkau secara statis dari entri baca"
 *
 * Berkas ini karena itu membangun GRAF impor STATIS sungguhan, mulai dari
 * client/src/main.tsx (entri nyata aplikasi), dan hanya menilai apa yang ADA
 * di graf itu. `await import(...)` SENGAJA tidak pernah diikuti — itulah
 * batas chunk yang gerbang ini ada untuk menegakkan, bukan sesuatu yang harus
 * ditembusnya.
 *
 * Tiga cacat yang diperbaiki di sini:
 *
 *  P1 [TINGGI] Uji pertama brief melarang @midnight-ntwrk/midnight-js-* di
 *     SELURUH client/src tanpa pengecualian, sehingga begitu C-2b menaruh
 *     ./tulis.ts (yang WAJIB memakai paket itu) di client/src/lib/chain/,
 *     gerbang ini mustahil lolos tanpa dilemahkan sendiri. Diperbaiki:
 *     larangan hanya berlaku atas himpunan yang TERJANGKAU STATIS dari
 *     entri. ./tulis.ts yang hanya dijangkau lewat `await import()` di dalam
 *     jalur-tulis.ts tidak pernah masuk himpunan itu, sehingga ia bebas
 *     memakai midnight-js-* tanpa memerahkan gerbang ini — persis yang
 *     dibutuhkan C-2b.
 *
 *  P2 [TINGGI] Uji ketiga brief mencocokkan literal "chain/tulis" pada TEKS
 *     specifier (`/from ["'].*chain\/tulis["']/`), padahal tetangga
 *     sedirektori menulis `from "./tulis"` — yang TIDAK memuat substring itu
 *     sama sekali. Diperbaiki: specifier diRESOLUSI ke path absolut
 *     (menghormati alias @/, @pkgs/, dan relatif ./ ../) SEBELUM
 *     dibandingkan, sehingga bentuk penulisannya tidak relevan — "./tulis"
 *     dari dalam client/src/lib/chain/ dan "../chain/tulis" dari tempat lain
 *     dua-duanya diresolusi ke path yang sama dan sama-sama tertangkap.
 *     Pengecualian brief `!p.endsWith("jalur-tulis.ts")` juga dibuang: ia
 *     tidak diperlukan (jalur-tulis.ts tidak pernah punya specifier STATIS
 *     ke "./tulis" — ia memakai `await import`, yang memang tidak pernah
 *     masuk daftar specifier statis) dan sebelumnya membebaskan justru
 *     berkas yang seharusnya paling dijaga.
 *
 *  P6 [RENDAH] Uji pertama sampai ketiga brief mencocokkan TEKS MENTAH,
 *     sehingga satu baris KOMENTAR yang menyebut nama paket (persis seperti
 *     komentar di graphql.ts baris 4-8, yang menjelaskan MENGAPA paket itu
 *     TIDAK dipakai) bisa memerahkan gerbang atau — pada nama tanpa awalan
 *     skope — lolos secara kebetulan. Diperbaiki: seluruh ekstraksi
 *     specifier di sini bekerja atas teks yang KOMENTARNYA SUDAH DIBUANG
 *     (teknik yang sama yang uji keempat brief sendiri pakai untuk index.ts),
 *     dan lebih jauh, ia mengekstrak specifier IMPOR SUNGGUHAN lewat regex
 *     `import`/`export ... from`, bukan mencocokkan teks bebas — komentar
 *     yang menyebut nama paket tanpa benar-benar mengimpornya tidak pernah
 *     dilihat sebagai specifier sama sekali.
 */

const AKAR = path.resolve(new URL("../../../..", import.meta.url).pathname);
const SRC = path.join(AKAR, "client", "src");
const ENTRI = path.join(SRC, "main.tsx");

function tanpaKomentar(teks: string): string {
  return teks
    .replace(/\/\*[\s\S]*?\*\//g, " ") // blok /* … */ termasuk JSDoc
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // baris // …, tanpa memakan "https://"
}

// import/export … from "spec";  DAN  import "spec"; (side-effect, mis. "./index.css")
// Dibatasi tanda kutip/titik-koma di kedua sisi supaya tidak pernah melompat
// ke pernyataan lain, walau daftar nama yang diimpor terbentang banyak baris.
const RE_DARI = /\b(?:import|export)\b[^'";]*?\bfrom\s*["']([^"']+)["']/g;
const RE_SISI = /\bimport\s*["']([^"']+)["']\s*;/g;

type Modul = { fileAbs: string; spesifierStatis: string[] };

const cacheModul = new Map<string, Modul>();
const EKSTENSI = [".ts", ".tsx", ".js", ".mjs"];

function berkasAda(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

function cariBerkas(basis: string): string | null {
  if (berkasAda(basis)) return basis;
  for (const ext of EKSTENSI) if (berkasAda(basis + ext)) return basis + ext;
  for (const ext of EKSTENSI) {
    const idx = path.join(basis, `index${ext}`);
    if (berkasAda(idx)) return idx;
  }
  return null;
}

/**
 * Meresolusi SATU specifier statis ke path BASIS (sebelum ekstensi dicoba),
 * menghormati alias vite/tsconfig @/ dan @pkgs/. Specifier paket npm (tidak
 * diawali "." atau salah satu alias) mengembalikan null: ia daun graf, dan
 * TIDAK direkursi — lihat komentar pada terjangkauStatisDariEntri perihal
 * mengapa pkgs/ juga diperlakukan sebagai daun.
 */
function resolusiBasis(spesifier: string, dariFileAbs: string): string | null {
  if (spesifier.startsWith("@/")) return path.join(SRC, spesifier.slice(2));
  if (spesifier.startsWith("@pkgs/")) return path.join(AKAR, "pkgs", spesifier.slice("@pkgs/".length));
  if (spesifier.startsWith(".")) return path.join(path.dirname(dariFileAbs), spesifier);
  return null;
}

function muatModul(fileAbs: string): Modul {
  const ada = cacheModul.get(fileAbs);
  if (ada) return ada;
  const isi = tanpaKomentar(readFileSync(fileAbs, "utf8"));
  const spesifierStatis: string[] = [];
  for (const m of isi.matchAll(RE_DARI)) spesifierStatis.push(m[1]);
  for (const m of isi.matchAll(RE_SISI)) spesifierStatis.push(m[1]);
  const modul: Modul = { fileAbs, spesifierStatis };
  cacheModul.set(fileAbs, modul);
  return modul;
}

/**
 * BFS murni STATIS dari client/src/main.tsx — entri sungguhan aplikasi
 * (bukan client/src/lib/chain/index.ts; itu cuma satu barrel di tengah graf).
 *
 * Rekursi BERHENTI begitu sebuah specifier menunjuk ke luar client/src
 * (paket npm APA PUN, termasuk seluruh isi pkgs/ lewat alias @pkgs/). Itu
 * batas kepercayaan yang disengaja: pkgs/contract adalah kode TERGENERASI
 * yang sudah diverifikasi jalur lain (instance-tunggal.test.ts, gerbang
 * Task 2), dan tugas gerbang ini adalah graf milik client/src sendiri —
 * bukan membaca ulang kode generated yang sudah dipercaya sebagai kotak
 * hitam pada titik ia diimpor (persis seperti dekode.ts sendiri
 * mendokumentasikan dirinya sebagai satu-satunya titik masuk WASM).
 */
function terjangkauStatisDariEntri(): Map<string, Modul> {
  const terjangkau = new Map<string, Modul>();
  const antrian = [ENTRI];
  while (antrian.length > 0) {
    const fileAbs = antrian.pop()!;
    if (terjangkau.has(fileAbs)) continue;
    const modul = muatModul(fileAbs);
    terjangkau.set(fileAbs, modul);
    for (const spesifier of modul.spesifierStatis) {
      const basis = resolusiBasis(spesifier, fileAbs);
      if (basis === null || !basis.startsWith(SRC)) continue;
      const resolusi = cariBerkas(basis);
      if (resolusi && !terjangkau.has(resolusi)) antrian.push(resolusi);
    }
  }
  return terjangkau;
}

const TARGET_TULIS = path.join(SRC, "lib", "chain", "tulis");

describe("batas bundel C-2a — jalur SUMBER (terjangkau statis dari entri)", () => {
  it("TIDAK ada impor ledger-v8 atau midnight-js-* yang terjangkau statis dari entri baca", () => {
    // Keduanya milik jalur TULIS. ledger-v8 sendiri 10.143.782 B (diukur
    // langsung dari node_modules/.pnpm di pohon ini), dan memakai
    // midnight-js-indexer-public-data-provider untuk MEMBACA membengkakkan
    // bundel jadi 12.383.609 B (8,5x) tanpa menambah kemampuan apa pun.
    //
    // TIDAK disapukan ke seluruh client/src (praperiksa P1): ./tulis.ts milik
    // C-2b WAJIB memakai paket ini, dan ia hanya boleh dijangkau lewat
    // `await import()` di jalur-tulis.ts — yang berarti ia TIDAK PERNAH masuk
    // himpunan terjangkauStatisDariEntri(), dan gerbang ini tidak pernah
    // melihatnya.
    const terjangkau = terjangkauStatisDariEntri();
    const RE_TERLARANG = /^@midnight-ntwrk\/(ledger-v8|midnight-js-)/;
    const pelanggar: string[] = [];
    for (const [fileAbs, modul] of terjangkau) {
      for (const spesifier of modul.spesifierStatis) {
        if (RE_TERLARANG.test(spesifier)) {
          pelanggar.push(`${path.relative(AKAR, fileAbs)} -> "${spesifier}"`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("HANYA dekode.ts, di antara yang terjangkau statis dari entri, yang mengimpor runtime WASM", () => {
    const terjangkau = terjangkauStatisDariEntri();
    const RE_WASM = /^@midnight-ntwrk\/compact-runtime$|managed\/(ballot|registry)\/contract/;
    const pengimpor: string[] = [];
    for (const [fileAbs, modul] of terjangkau) {
      if (modul.spesifierStatis.some((s) => RE_WASM.test(s))) {
        pengimpor.push(path.relative(AKAR, fileAbs));
      }
    }
    expect(pengimpor).toEqual(["client/src/lib/chain/dekode.ts"]);
  });

  it("modul jalur tulis (chain/tulis) tidak diimpor secara statis oleh apa pun yang terjangkau entri", () => {
    // Resolusi PATH, bukan cocok-teks pada specifier (praperiksa P2): "./tulis"
    // dari dalam client/src/lib/chain/ dan bentuk relatif apa pun dari tempat
    // lain di client/src dua-duanya diresolusi ke path absolut yang sama
    // sebelum dibandingkan terhadap TARGET_TULIS.
    //
    // Tidak ada pengecualian untuk jalur-tulis.ts: `await import("./tulis")`
    // di dalam badan muatJalurTulis() adalah specifier DINAMIS, dan RE_DARI /
    // RE_SISI di atas memang hanya menangkap bentuk `import`/`export … from`
    // dan `import "spec";` — keduanya bentuk STATIS. Specifier dinamis tidak
    // pernah masuk spesifierStatis sama sekali, jadi tidak butuh pengecualian
    // eksplisit apa pun (berbeda dari brief awal, yang menambah
    // `!p.endsWith("jalur-tulis.ts")` untuk masalah yang sebenarnya tidak ada).
    const terjangkau = terjangkauStatisDariEntri();
    const pelanggar: string[] = [];
    for (const [fileAbs, modul] of terjangkau) {
      for (const spesifier of modul.spesifierStatis) {
        const basis = resolusiBasis(spesifier, fileAbs);
        if (basis !== null && basis.replace(/\.tsx?$/, "") === TARGET_TULIS) {
          pelanggar.push(`${path.relative(AKAR, fileAbs)} -> "${spesifier}"`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("permukaan publik lapis rantai tidak mengekspor satu pun operasi tulis", () => {
    // Diassert pada PERNYATAAN EKSPOR (komentar dibuang lebih dulu, teknik
    // yang sama dipakai di tanpaKomentar() atas), BUKAN pada teks mentah.
    //
    // Versi pertama uji ini (sebelum diperbaiki, praperiksa P6) memeriksa
    // teks mentah dan karena itu akan memerah karena DOCSTRING index.ts
    // sendiri — yang menjelaskan bahwa castVote/tallyVote/createBallot/
    // finalize BUKAN bagian permukaan ini. Sebuah gerbang yang dipicu oleh
    // kalimat yang menerangkan kepatuhannya bukan gerbang; ia mendorong orang
    // menghapus penjelasan alih-alih memperbaiki kode.
    const mentah = readFileSync(path.join(SRC, "lib", "chain", "index.ts"), "utf8");
    const kodeSaja = tanpaKomentar(mentah);
    for (const nama of ["castVote", "tallyVote", "createBallot", "finalize", "submitTransaction", "balanceUnsealed"]) {
      expect(kodeSaja, `index.ts menyebut ${nama} di luar komentar`).not.toContain(nama);
    }
    // Dan pastikan pembuang komentar tidak membuang KODE-nya juga: kalau
    // keduanya ikut terhapus, uji di atas akan hijau apa pun isi berkasnya.
    expect(kodeSaja).toContain("export { bacaRantai }");
    expect(kodeSaja).toContain("export { GalatRantai }");
  });
});

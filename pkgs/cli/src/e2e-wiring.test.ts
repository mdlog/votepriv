import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// PENJAGA PENGKABELAN (wiring guard) — bukan uji perilaku.
//
// e2e.ts adalah skrip tingkat-atas yang TIDAK mengekspor apa pun (lihat
// komentar di kepala berkas itu): ia dijalankan sebagai proses, bukan
// diimpor. Itu berarti tidak ada cara untuk menguji "apakah e2e.ts benar-
// benar memanggil pemeriksaan privasinya" dari DALAM e2e.ts sendiri — dan
// sengaja tidak dijadikan cara dengan mengekspor sebuah fungsi
// `jalankanE2E` segala macam hanya supaya bisa diimpor uji ini; draf
// rencana sebelumnya sudah dikritik karena mendeklarasikan fungsi begitu
// yang tidak pernah benar-benar ada.
//
// Jalan yang tersisa: baca e2e.ts sebagai TEKS, dan pastikan (a) ketiga
// fungsi pemeriksaan diimpor dari ./periksa.ts, dan (b) masing-masing
// benar-benar DIPANGGIL (bukan hanya disebut di komentar atau string).
// Ini uji SUMBER, bukan uji PERILAKU: assertion body-nya sendiri sudah
// diuji tuntas di periksa.test.ts (16 uji: 1 ledger sehat + 1 pelanggaran
// per assert). Yang masih berisiko dan BELUM dijaga apa pun sebelum berkas
// ini — Fix Round 1 menutup celah itu, Fix Round 2 FIX 1 — hanyalah
// seseorang menghapus atau mengomentari SATU baris pemanggilan di e2e.ts:
// typecheck tetap exit 0 (return value yang tidak dipakai bukan galat tipe)
// dan vitest tetap hijau (e2e.ts bukan *.test.ts, tidak pernah dijalankan
// vitest, dan tsconfig.json tidak menyalakan noUnusedLocals) — persis
// seperti yang ditemukan review sebelum perbaikan ini ada.
const e2ePath = path.resolve(fileURLToPath(import.meta.url), "..", "e2e.ts");
const sumberAsli = fs.readFileSync(e2ePath, "utf8");

/**
 * Melucuti komentar (// dan /* *\/) dan literal string/template dari kode
 * sumber, kasar tapi cukup untuk tujuan uji ini: supaya nama fungsi yang
 * disebut di KOMENTAR (dan e2e.ts banyak menyebutnya, mis. "Pemeriksaan
 * sesungguhnya ada di periksaTallyKosongSelamaVoting (periksa.ts)") tidak
 * bisa lolos sebagai bukti "dipanggil". Setelah dilucuti, satu-satunya cara
 * nama fungsi diikuti "(" tersisa di teks adalah pemanggilan sungguhan.
 */
function lucutiKomentarDanString(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

const sumberTanpaKomentar = lucutiKomentarDanString(sumberAsli);

describe("e2e.ts memanggil ketiga pemeriksaan privasi dari periksa.ts (penjaga pengkabelan)", () => {
  it.each([
    "periksaTallyKosongSelamaVoting",
    "periksaHasilTallyAkhir",
    "periksaFaseTerfinalisasi",
  ] as const)("%s diimpor dari ./periksa.ts DAN benar-benar dipanggil", (nama) => {
    const polaImpor = new RegExp(`import\\s*\\{[^}]*\\b${nama}\\b[^}]*\\}\\s*from\\s*["']\\./periksa\\.ts["']`);
    expect(sumberAsli, `${nama} harus diimpor dari "./periksa.ts"`).toMatch(polaImpor);

    // "(" langsung setelah nama, pada teks yang komentar/string-nya sudah
    // dilucuti — menyaring nama yang hanya disebut di prosa penjelasan.
    const polaPanggilan = new RegExp(`\\b${nama}\\s*\\(`);
    expect(sumberTanpaKomentar, `${nama} harus dipanggil (bukan hanya disebut di komentar/string)`).toMatch(
      polaPanggilan,
    );
  });
});

// Fix Round 6, FIX A — penjaga pengkabelan untuk bagian 8 (pembukaan suara):
// bacaLedgerBallot di sana dulu dipanggil TELANJANG (tanpa ulangiSampai)
// tepat sebelum mengasersi bahwa commitment path ditemukan, kelas kegagalan
// yang sama yang Fix Round 1 FIX 3 sudah tutup di bagian 5. Uji di bawah
// mengisolasi teks bagian 8 SAJA (antara penanda komentar "── 8." dan
// "── 9.") supaya tidak diam-diam lolos hanya karena bagian 5 sudah benar
// sejak Fix Round 1 — bagian 5 dan bagian 8 sama-sama punya
// `for (let i = 0; i < JUMLAH_PEMILIH; i++) {` dan sama-sama memanggil
// ulangiSampai di berkas yang sudah diperbaiki.
describe("Fix Round 6, FIX A: bagian 8 membaca commitment path lewat ulangiSampai, bukan bacaLedgerBallot telanjang", () => {
  const mulaiBagian8 = sumberAsli.indexOf("── 8.");
  const mulaiBagian9 = sumberAsli.indexOf("── 9.");

  it('penanda komentar "── 8." dan "── 9." harus ada, dengan urutan yang benar', () => {
    expect(mulaiBagian8, 'penanda komentar "── 8." harus ada').toBeGreaterThan(-1);
    expect(mulaiBagian9, 'penanda komentar "── 9." harus ada SETELAH "── 8."').toBeGreaterThan(mulaiBagian8);
  });

  const bagian8 = sumberAsli.slice(mulaiBagian8, mulaiBagian9 === -1 ? undefined : mulaiBagian9);
  const bagian8TanpaKomentar = lucutiKomentarDanString(bagian8);

  it("ulangiSampai benar-benar DIPANGGIL di bagian 8 (bukan hanya disebut di komentar)", () => {
    expect(bagian8TanpaKomentar, "ulangiSampai harus dipanggil di bagian 8").toMatch(/\bulangiSampai\s*\(/);
  });

  it("commitments.findPathForLeaf dipanggil DI DALAM pemanggilan ulangiSampai itu, bukan sebelum/di luar", () => {
    const idxRetry = bagian8TanpaKomentar.search(/\bulangiSampai\s*\(/);
    const idxFind = bagian8TanpaKomentar.search(/\.commitments\.findPathForLeaf\s*\(/);
    expect(idxRetry, "ulangiSampai harus ditemukan di bagian 8").toBeGreaterThan(-1);
    expect(idxFind, "commitments.findPathForLeaf harus ditemukan di bagian 8").toBeGreaterThan(-1);
    expect(
      idxFind,
      "commitments.findPathForLeaf harus muncul SETELAH ulangiSampai( — yaitu di dalam callback-nya, " +
        "bukan pembacaan telanjang sebelum ulangiSampai (pola lama sebelum Fix Round 6 FIX A)",
    ).toBeGreaterThan(idxRetry);

    // Tidak boleh ada `pastikan(jalur` di ANTARA ulangiSampai( dan
    // findPathForLeaf( — itu berarti assert lama masih membaca sebuah
    // `jalur` yang dihitung SEBELUM retry, bukan hasil retry-nya.
    const antara = bagian8TanpaKomentar.slice(idxRetry, idxFind);
    expect(antara, "tidak boleh ada pastikan(jalur di antara ulangiSampai( dan findPathForLeaf(").not.toMatch(
      /pastikan\(\s*jalur/,
    );
  });

  it("pesan galat retry commitment path membedakan 'pembacaan indexer gagal sendiri' dari 'path belum ditemukan', seperti bagian 5", () => {
    expect(bagian8, "harus ada pesan untuk pembacaan indexer yang gagal sendiri (galatTerakhir terisi)").toMatch(
      /PEMBACAAN INDEXER ITU SENDIRI TERUS GAGAL/,
    );
    expect(
      bagian8,
      "harus ada pesan untuk path belum ditemukan meski seluruh pembacaan berhasil (galatTerakhir kosong)",
    ).toMatch(/KEMUNGKINAN BESAR keterlambatan indexer/);
  });
});

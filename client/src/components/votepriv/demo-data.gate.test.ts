import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BERKAS_INI = fileURLToPath(import.meta.url);
const DEMO_DATA = fileURLToPath(new URL("./demo-data.ts", import.meta.url));
const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url)); // client/src

function seluruhBerkasSumber(dir: string, keluar: string[] = []): string[] {
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    if (entri.name === "node_modules") continue;
    const p = path.join(dir, entri.name);
    if (entri.isDirectory()) seluruhBerkasSumber(p, keluar);
    else if (/\.(ts|tsx)$/.test(entri.name)) keluar.push(p);
  }
  return keluar;
}

/**
 * GERBANG T5 — bukan gerbang kompiler, gerbang UJI.
 *
 * Review menemukan bahwa Step 6 Task 6 menambal demo-data.ts dan
 * CreateBallotModal.tsx dengan field placeholder supaya `pnpm check` lolos —
 * dan sejak tambalan itu terpasang, KEDUANYA typecheck bersih. Brief Task 8
 * menyebut "ketidakmampuan typecheck keduanya" sebagai SATU-SATUNYA pemaksa
 * penghapusan demo-data.ts di Step 10. Tanpa pemaksa lain, Step 10 bisa
 * dilewati diam-diam: `pnpm check` tetap hijau, `pnpm test` tetap hijau,
 * tidak ada yang menegur siapa pun.
 *
 * Gerbang ini menggantikan pemaksa kompiler yang hilang itu — TANPA merusak
 * ulang tipe demo-data.ts/CreateBallotModal.tsx (dilarang oleh batasan
 * tugas). Bentuknya sengaja DIBALIK lewat `it.fails`:
 *
 *   - Badan uji di bawah menegaskan keadaan yang BENAR secara jangka panjang
 *     (demo-data.ts sudah tidak ada dan tidak diimpor berkas sumber mana
 *     pun). Keadaan itu SALAH hari ini (Task 6/7), jadi badan uji GAGAL hari
 *     ini — dan `it.fails` membalikkan kegagalan itu jadi LOLOS (hijau) di
 *     `pnpm test`. Gerbang ini TIDAK menghambat pekerjaan Task 6/7.
 *   - Begitu Task 8 Step 10 benar-benar menghapus demo-data.ts dan seluruh
 *     impornya, badan uji ini akan BERHASIL tanpa disengaja — dan `it.fails`
 *     membalikkan keberhasilan tak disengaja itu jadi GAGAL (merah). Itu
 *     BUKAN bug: itu SINYAL yang sengaja dipasang.
 *
 * Begitu gerbang ini merah, tindakan yang benar BUKAN memperbaiki assert di
 * bawah — melainkan MENGHAPUS BERKAS UJI INI bersama demo-data.ts, sebagai
 * bagian dari commit Step 10 yang sama. Jangan dipertahankan setelah itu.
 */
describe("GERBANG T5 — demo-data.ts harus ikut terhapus di Task 8 Step 10", () => {
  it.fails(
    "demo-data.ts sudah dihapus dan tidak diimpor berkas sumber mana pun (SENGAJA gagal sampai Task 8 Step 10 selesai — lihat komentar modul)",
    () => {
      expect(existsSync(DEMO_DATA), "demo-data.ts masih ada di client/src/components/votepriv/").toBe(false);

      const pengimpor = seluruhBerkasSumber(SRC_ROOT).filter(f => {
        if (f === BERKAS_INI || f === DEMO_DATA) return false;
        return /\bdemo-data(\.ts)?["']/.test(readFileSync(f, "utf8"));
      });
      expect(pengimpor, `masih diimpor oleh: ${pengimpor.join(", ") || "(tidak ada)"}`).toEqual([]);
    },
  );
});

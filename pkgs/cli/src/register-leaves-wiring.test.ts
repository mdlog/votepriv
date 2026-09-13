import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// PENJAGA PENGKABELAN (wiring guard) — bukan uji perilaku, alasan yang sama
// persis dengan e2e-wiring.test.ts/jadwal-artefak-wiring.test.ts:
// register-leaves.ts adalah skrip tingkat-atas yang tidak mengekspor apa pun
// (dijalankan sebagai proses, bukan diimpor — lihat komentar kepala
// berkasnya), jadi satu-satunya cara menguji "apakah skrip ini benar-benar
// memakai leaf-file.ts, dan benar-benar terdaftar sebagai perintah CLI"
// adalah membaca sumbernya (dan package.json) sebagai TEKS.
const registerLeavesPath = path.resolve(fileURLToPath(import.meta.url), "..", "register-leaves.ts");
const sumberAsli = fs.readFileSync(registerLeavesPath, "utf8");

/** Sama persis dengan helper di e2e-wiring.test.ts — lihat komentar di sana. */
function lucutiKomentarDanString(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

const sumberTanpaKomentar = lucutiKomentarDanString(sumberAsli);

describe("perintah `register-leaves` terdaftar di pkgs/cli/package.json", () => {
  it('scripts["register-leaves"] menjalankan src/register-leaves.ts lewat node --experimental-strip-types (pola sama dengan deploy-ballot)', () => {
    const pkgPath = path.resolve(fileURLToPath(import.meta.url), "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["register-leaves"]).toBeDefined();
    expect(pkg.scripts?.["register-leaves"]).toMatch(/--experimental-strip-types src\/register-leaves\.ts/);
  });
});

describe("register-leaves.ts memakai leaf-file.ts untuk SELURUH validasi+pendaftaran (penjaga pengkabelan)", () => {
  it.each([
    "bacaBerkasLeaf",
    "validasiKuotaPendaftaran",
    "periksaLeafSudahTerdaftar",
    "daftarkanSemuaBatch",
  ] as const)("%s diimpor dari ./leaf-file.ts DAN benar-benar dipanggil", (nama) => {
    const polaImpor = new RegExp(`import\\s*\\{[^}]*\\b${nama}\\b[^}]*\\}\\s*from\\s*["']\\./leaf-file\\.ts["']`);
    expect(sumberAsli, `${nama} harus diimpor dari "./leaf-file.ts"`).toMatch(polaImpor);

    const polaPanggilan = new RegExp(`\\b${nama}\\s*\\(`);
    expect(sumberTanpaKomentar, `${nama} harus dipanggil (bukan hanya disebut di komentar/string)`).toMatch(
      polaPanggilan,
    );
  });
});

describe("register-leaves.ts TIDAK PERNAH menyentuh credential (keamanan yang mengikat)", () => {
  it("tidak mengimpor buatCredential maupun daunEligibility dari shared", () => {
    expect(sumberAsli).not.toMatch(/\bbuatCredential\b/);
    expect(sumberAsli).not.toMatch(/\bdaunEligibility\b/);
  });

  it("tidak pernah membaca field `credentials` dari artefak atau objek apa pun", () => {
    expect(sumberAsli).not.toMatch(/\.credentials\b/);
  });
});

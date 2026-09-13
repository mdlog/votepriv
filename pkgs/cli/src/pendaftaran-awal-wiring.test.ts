import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// PENJAGA PENGKABELAN — alasan sama persis dengan e2e-wiring.test.ts/
// jadwal-artefak-wiring.test.ts/register-leaves-wiring.test.ts:
// deploy-ballot.ts adalah skrip tingkat-atas tanpa ekspor, jadi "apakah mode
// VOTEPRIV_TANPA_PENDAFTARAN benar-benar dipakai (bukan cuma ada di
// pendaftaran-awal.ts tapi tidak dipanggil)" hanya bisa diuji lewat sumbernya
// sebagai teks. Perilaku pendaftaran-awal.ts SENDIRI (siapkanPemilihAwal,
// bentukFieldCredentials, daftarkanVoterJikaPerlu, dst) sudah diuji tuntas
// di pendaftaran-awal.test.ts — uji di sini murni pengkabelan.
const deployBallotPath = path.resolve(fileURLToPath(import.meta.url), "..", "deploy-ballot.ts");
const sumberAsli = fs.readFileSync(deployBallotPath, "utf8");

/** Sama persis dengan helper di e2e-wiring.test.ts. */
function lucutiKomentarDanString(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

const sumberTanpaKomentar = lucutiKomentarDanString(sumberAsli);

describe("deploy-ballot.ts memakai pendaftaran-awal.ts untuk keputusan VOTEPRIV_TANPA_PENDAFTARAN (penjaga pengkabelan)", () => {
  it.each([
    "modeTanpaPendaftaranAktif",
    "eligibleCountDariEnv",
    "siapkanPemilihAwal",
    "bentukFieldCredentials",
    "daftarkanVoterJikaPerlu",
  ] as const)("%s diimpor dari ./pendaftaran-awal.ts DAN benar-benar dipanggil", (nama) => {
    const polaImpor = new RegExp(`import\\s*\\{[^}]*\\b${nama}\\b[^}]*\\}\\s*from\\s*["']\\./pendaftaran-awal\\.ts["']`);
    expect(sumberAsli, `${nama} harus diimpor dari "./pendaftaran-awal.ts"`).toMatch(polaImpor);

    const polaPanggilan = new RegExp(`\\b${nama}\\s*\\(`);
    expect(sumberTanpaKomentar, `${nama} harus dipanggil (bukan hanya disebut di komentar/string)`).toMatch(
      polaPanggilan,
    );
  });

  // Guard NEGATIF: tanpa ini, seseorang bisa menambah pemanggilan
  // `daftarkanVoter(...)` LANGSUNG (melewati daftarkanVoterJikaPerlu) di
  // suatu tempat lain pada berkas ini, dan mode VOTEPRIV_TANPA_PENDAFTARAN
  // akan tetap lolos guard test "dipanggil" DI ATAS (karena
  // daftarkanVoterJikaPerlu tetap ada) padahal pendaftaran GANDA sudah
  // terjadi lewat jalur lain.
  it("TIDAK mengimpor daftarkanVoter langsung dari deploy.ts (harus lewat daftarkanVoterJikaPerlu)", () => {
    const polaImporLangsung = /import\s*\{[^}]*\bdaftarkanVoter\b[^}]*\}\s*from\s*["']\.\/deploy\.ts["']/;
    expect(sumberAsli).not.toMatch(polaImporLangsung);
  });

  // Guard NEGATIF serupa untuk pembuatan credential: harus SELALU lewat
  // siapkanPemilihAwal, tidak pernah dipanggil langsung di deploy-ballot.ts.
  it("TIDAK memanggil buatCredential()/daunEligibility(...) langsung (harus lewat siapkanPemilihAwal)", () => {
    expect(sumberTanpaKomentar).not.toMatch(/\bbuatCredential\s*\(\s*\)/);
    expect(sumberTanpaKomentar).not.toMatch(/\bdaunEligibility\s*\(/);
  });
});

describe("deploy-ballot.ts tetap menulis artefak lewat objek literal `{ ballot: alamatBallot, ...}` (invarian jadwal-artefak-wiring.test.ts)", () => {
  // Re-pastikan invarian yang SUDAH dijaga jadwal-artefak-wiring.test.ts tetap
  // utuh setelah perubahan berkas ini: field credentials sekarang dibentuk
  // lewat spread `...bentukFieldCredentials(...)`, BUKAN properti literal —
  // dan objek literalnya harus tetap DIMULAI `{ ballot: alamatBallot, ...}`.
  it("tulisArtefak dipanggil dengan objek yang dimulai `{ ballot: alamatBallot,` dan menyertakan spread bentukFieldCredentials", () => {
    const polaTulis = /tulisArtefak\(config\.networkId,\s*\{\s*ballot:\s*alamatBallot,[\s\S]*?\.\.\.bentukFieldCredentials\(/;
    expect(sumberAsli).toMatch(polaTulis);
  });
});

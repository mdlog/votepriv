import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// PENJAGA PENGKABELAN (wiring guard) — bukan uji perilaku, dengan alasan yang
// sama seperti e2e-wiring.test.ts: deploy-ballot.ts dan e2e.ts adalah skrip
// tingkat-atas yang tidak mengekspor apa pun, jadi satu-satunya cara menguji
// "apakah skrip ini benar-benar menulis/mengimpor yang seharusnya" adalah
// membaca sumbernya sebagai teks.
//
// Uji ini menjaga DUA regresi seam yang ditemukan review cabang penuh
// (bukan pada satu Task tunggal):
//   FIX 1 — e2e.ts menulis field ballot-nya sendiri ke TOP-LEVEL artefak,
//     field yang sama yang dipakai deploy-ballot.ts, sehingga menjalankan
//     `pnpm cli e2e` setelah `pnpm cli deploy-ballot` menimpa ballot yang
//     sudah dibayar dan didaftarkan tiga pemilihnya. Lihat artefak.test.ts
//     untuk uji PERILAKU pasangan ini (tulisArtefak/bacaArtefak); uji di
//     sini menjaga PENGKABELANNYA — bahwa kedua skrip benar-benar memanggil
//     tulisArtefak dengan bentuk yang benar, bukan hanya bahwa artefak.ts
//     MENDUKUNG bentuk yang benar.
//   FIX 2 — deploy-ballot.ts dan e2e.ts masing-masing mendefinisikan salinan
//     MENIT_VOTE/MENIT_TALLY sendiri, dan keduanya diam-diam menyimpang
//     (45/80 vs 60/95). Uji di sini memastikan KEDUANYA mengimpor dari satu
//     modul (./jadwal.ts) dan TIDAK ADA salinan lokal di kedua berkas.

const bacaSumber = (nama: string): string =>
  fs.readFileSync(path.resolve(fileURLToPath(import.meta.url), "..", nama), "utf8");

const e2eSrc = bacaSumber("e2e.ts");
const deployBallotSrc = bacaSumber("deploy-ballot.ts");

describe("FIX 2: MENIT_VOTE/MENIT_TALLY satu sumber (./jadwal.ts), tanpa salinan lokal", () => {
  const polaImporJadwal = /import\s*\{\s*MENIT_TALLY,\s*MENIT_VOTE\s*\}\s*from\s*["']\.\/jadwal\.ts["']/;
  // Deklarasi lokal (bukan impor) yang harus TIDAK ADA di kedua berkas.
  const polaDeklarasiLokal = /\bconst\s+MENIT_(VOTE|TALLY)\s*=\s*\d+/;

  it.each([
    ["e2e.ts", e2eSrc],
    ["deploy-ballot.ts", deployBallotSrc],
  ] as const)("%s mengimpor MENIT_VOTE dan MENIT_TALLY dari ./jadwal.ts, bukan mendefinisikan sendiri", (_nama, src) => {
    expect(src, "harus mengimpor { MENIT_TALLY, MENIT_VOTE } dari \"./jadwal.ts\"").toMatch(polaImporJadwal);
    expect(src, "tidak boleh ada `const MENIT_VOTE = ...` / `const MENIT_TALLY = ...` lokal").not.toMatch(
      polaDeklarasiLokal,
    );
  });
});

describe("FIX 1: e2e.ts dan deploy-ballot.ts tidak boleh menulis field ballot artefak yang sama", () => {
  it("e2e.ts menulis data ballotnya di bawah kunci `e2e:`, bukan langsung `ballot:` top-level", () => {
    // Panggilan tulisArtefak untuk ballot e2e (setelah deployBallot, bagian 2)
    // harus membungkus kelima field di dalam `e2e: { ... }`.
    const polaTulisE2E = /tulisArtefak\(config\.networkId,\s*\{\s*e2e:\s*\{\s*ballot:\s*alamatBallot,/;
    expect(e2eSrc, "tulisArtefak untuk ballot e2e harus menulis di bawah kunci `e2e:`").toMatch(polaTulisE2E);
  });

  it("deploy-ballot.ts tetap satu-satunya penulis top-level ballot/voteDeadline/tallyDeadline/options/credentials", () => {
    const polaTulisDeployBallot = /tulisArtefak\(config\.networkId,\s*\{\s*ballot:\s*alamatBallot,/;
    expect(deployBallotSrc, "deploy-ballot.ts harus tetap menulis ballot di top level").toMatch(
      polaTulisDeployBallot,
    );
  });

  it("deploy-ballot.ts menolak redeploy ballot tanpa VOTEPRIV_DEPLOY_ULANG=1 (kembaran guard deploy-registry.ts)", () => {
    expect(deployBallotSrc).toMatch(/bacaArtefak\(config\.networkId\)\?\.ballot/);
    expect(deployBallotSrc).toMatch(/process\.env\.VOTEPRIV_DEPLOY_ULANG\s*!==\s*["']1["']/);
  });
});

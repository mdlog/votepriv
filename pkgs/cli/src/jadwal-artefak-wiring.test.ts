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
//
// Ronde re-review (setelah ronde perbaikan di atas) menemukan TIGA kelemahan
// pada guard-guard ini SENDIRI, diperbaiki di sini:
//   (a) Guard artefak HANYA positif: ia memastikan tulisArtefak `e2e: {...}`
//       ADA, tapi tidak memeriksa bahwa tulisArtefak top-level KEDUA (yang
//       menulis `ballot:` LANGSUNG di luar kunci `e2e:`) TIDAK ADA. Menambah
//       tulisArtefak kedua semacam itu ke e2e.ts tadinya tetap lolos.
//   (b) Guard redeploy hanya memastikan DUA regex ada di suatu tempat di
//       berkas, tanpa memeriksa keduanya TERHUBUNG di satu `if` yang sama
//       maupun bahwa cabang itu BENAR-BENAR keluar (`tutupSesi`). Menghapus
//       `await tutupSesi(sesi, 0)` dari dalam guard tadinya tetap lolos.
//   (c) Guard impor jadwal mengunci URUTAN spesifier persis `{ MENIT_TALLY,
//       MENIT_VOTE }` (gagal bila diurutkan ulang atau ditambah ekspor
//       ketiga di jadwal.ts), dan guard deklarasi lokal hanya mengenali
//       `const NAME = <digit>` (lolos untuk `let` atau salinan lokal
//       non-literal).

const bacaSumber = (nama: string): string =>
  fs.readFileSync(path.resolve(fileURLToPath(import.meta.url), "..", nama), "utf8");

const e2eSrc = bacaSumber("e2e.ts");
const deployBallotSrc = bacaSumber("deploy-ballot.ts");

/**
 * Daftar spesifier bernama dari `import { ... } from "./jadwal.ts"`, tanpa
 * peduli urutan maupun berapa banyak spesifier lain yang ikut diimpor —
 * kembaran (c) di atas: guard lama mengunci urutan persis.
 */
function spesifierImporJadwal(src: string): string[] | undefined {
  const m = src.match(/import\s*\{([^}]*)\}\s*from\s*["']\.\/jadwal\.ts["']/);
  if (m === null) return undefined;
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe("FIX 2: MENIT_VOTE/MENIT_TALLY satu sumber (./jadwal.ts), tanpa salinan lokal", () => {
  // (c) Deklarasi lokal yang harus TIDAK ADA di kedua berkas: `const` ATAU
  // `let`, dengan literal digit ATAUPUN ekspresi apa pun sebagai nilainya —
  // bukan hanya `const NAME = <digit>` seperti guard lama.
  const polaDeklarasiLokal = /\b(?:const|let)\s+MENIT_(?:VOTE|TALLY)\b\s*=/;

  it.each([
    ["e2e.ts", e2eSrc],
    ["deploy-ballot.ts", deployBallotSrc],
  ] as const)(
    "%s mengimpor MENIT_VOTE dan MENIT_TALLY dari ./jadwal.ts (urutan/ekspor lain bebas), bukan mendefinisikan sendiri",
    (_nama, src) => {
      const spesifier = spesifierImporJadwal(src);
      expect(spesifier, 'harus ada `import { ... } from "./jadwal.ts"`').not.toBeUndefined();
      expect(spesifier ?? [], "daftar impor ./jadwal.ts harus memuat MENIT_VOTE").toContain("MENIT_VOTE");
      expect(spesifier ?? [], "daftar impor ./jadwal.ts harus memuat MENIT_TALLY").toContain("MENIT_TALLY");
      expect(src, "tidak boleh ada `const`/`let MENIT_VOTE = ...` atau `MENIT_TALLY = ...` lokal").not.toMatch(
        polaDeklarasiLokal,
      );
    },
  );
});

describe("FIX 1: e2e.ts dan deploy-ballot.ts tidak boleh menulis field ballot artefak yang sama", () => {
  it("e2e.ts menulis data ballotnya di bawah kunci `e2e:`, bukan langsung `ballot:` top-level", () => {
    // Panggilan tulisArtefak untuk ballot e2e (setelah deployBallot, bagian 2)
    // harus membungkus kelima field di dalam `e2e: { ... }`.
    const polaTulisE2E = /tulisArtefak\(config\.networkId,\s*\{\s*e2e:\s*\{\s*ballot:\s*alamatBallot,/;
    expect(e2eSrc, "tulisArtefak untuk ballot e2e harus menulis di bawah kunci `e2e:`").toMatch(polaTulisE2E);
  });

  // (a) Guard NEGATIF: uji di atas hanya memastikan tulisArtefak `e2e: {...}`
  // ADA. Menambah tulisArtefak KEDUA yang menulis `ballot:` langsung ke
  // top-level (di LUAR kunci `e2e:`) tetap lolos uji itu sendirian — pola
  // yang sama dengan yang diharapkan ADA di deploy-ballot.ts (uji di bawah)
  // harus TIDAK ADA di e2e.ts.
  it("e2e.ts TIDAK boleh punya tulisArtefak top-level `ballot:` KEDUA di luar kunci `e2e:`", () => {
    const polaTulisTopLevelBallot = /tulisArtefak\(config\.networkId,\s*\{\s*ballot:\s*alamatBallot,/;
    expect(
      e2eSrc,
      "e2e.ts tidak boleh menulis `ballot:` langsung ke top-level artefak — itu field milik deploy-ballot.ts",
    ).not.toMatch(polaTulisTopLevelBallot);
  });

  it("deploy-ballot.ts tetap satu-satunya penulis top-level ballot/voteDeadline/tallyDeadline/options/credentials", () => {
    const polaTulisDeployBallot = /tulisArtefak\(config\.networkId,\s*\{\s*ballot:\s*alamatBallot,/;
    expect(deployBallotSrc, "deploy-ballot.ts harus tetap menulis ballot di top level").toMatch(
      polaTulisDeployBallot,
    );
  });

  it("deploy-ballot.ts menolak redeploy ballot tanpa VOTEPRIV_DEPLOY_ULANG=1, DENGAN kedua kondisi terhubung DAN cabang itu benar-benar keluar", () => {
    // (b) Guard lama hanya memeriksa DUA regex ada di suatu tempat di
    // berkas, tanpa memeriksa keduanya berada di satu `if` yang sama maupun
    // bahwa cabangnya benar-benar keluar. Menghapus `await tutupSesi(sesi,
    // 0)` dari dalam guard tadinya tetap lolos uji lama.
    const polaKondisiGuard =
      /if\s*\(\s*ballotSudahAda\s*!==\s*undefined\s*&&\s*process\.env\.VOTEPRIV_DEPLOY_ULANG\s*!==\s*["']1["']\s*\)/;
    expect(
      deployBallotSrc,
      "kedua kondisi (ballot sudah tercatat, env bukan '1') harus terhubung dengan && di SATU `if` yang sama",
    ).toMatch(polaKondisiGuard);

    const cocok = deployBallotSrc.match(polaKondisiGuard);
    const mulai = (cocok?.index ?? 0) + (cocok?.[0].length ?? 0);
    const setelahIf = deployBallotSrc.slice(mulai);
    const akhirBlok = setelahIf.indexOf("const metadata");
    const badanBlok = akhirBlok === -1 ? setelahIf : setelahIf.slice(0, akhirBlok);
    expect(
      badanBlok,
      "cabang guard redeploy harus BENAR-BENAR keluar lewat `await tutupSesi(sesi, 0)`, bukan sekadar log lalu lanjut ke deploy baru",
    ).toMatch(/await\s+tutupSesi\(\s*sesi\s*,\s*0\s*\)/);
  });
});

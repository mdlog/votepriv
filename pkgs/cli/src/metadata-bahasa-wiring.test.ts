import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cariKataTerlarang, validasiBahasaMetadata } from "shared";
import type { MetadataBallot } from "shared";

// PENJAGA PENGKABELAN (wiring guard) — pola yang sama dengan
// jadwal-artefak-wiring.test.ts dan e2e-wiring.test.ts: deploy-ballot.ts dan
// e2e.ts adalah skrip tingkat-atas yang menjalankan efek samping saat
// diimpor (siapkanSesi, dst. — lihat komentar kepala masing-masing) dan
// TIDAK mengekspor apa pun, jadi satu-satunya cara menguji "apakah metadata
// BAWAAN kedua skrip ini masih berbahasa Inggris" tanpa menjalankan skrip
// itu sendiri (yang menuntut seed/wallet — dilarang tugas audit-bahasa-metadata)
// adalah membaca sumbernya sebagai TEKS dan mengekstrak literal string
// metadata-nya — BUKAN mengimpor kedua skrip itu.
//
// TANPA berkas ini: menerjemahkan deploy-ballot.ts/e2e.ts (task ini) tidak
// dijaga apa pun setelahnya — validasiBahasaMetadata (pkgs/shared) hanya
// diuji dengan data SINTETIS di bahasa-metadata.test.ts, bukan data NYATA
// kedua skrip ini. Seseorang bisa mengembalikan eligibilityPolicy ke kalimat
// Indonesia asli enam bulan lagi dan tidak ada satu uji pun merah. Berkas
// inilah yang menutup celah itu.
const bacaSumber = (nama: string): string =>
  fs.readFileSync(path.resolve(fileURLToPath(import.meta.url), "..", nama), "utf8");

const deployBallotSrc = bacaSumber("deploy-ballot.ts");
const e2eSrc = bacaSumber("e2e.ts");

/**
 * Isi blok `const metadata: MetadataBallot = { ... };` — melempar bila tidak
 * ditemukan, supaya regresi FORMAT (bukan regresi bahasa) tidak membuat uji
 * ini diam-diam vakum. Toleran indentasi pada baris penutup: deploy-ballot.ts
 * top-level (`};`), e2e.ts di dalam try (`  };`).
 */
function blokMetadata(src: string, namaBerkas: string): string {
  const m = src.match(/const metadata: MetadataBallot = \{([\s\S]*?)\n\s*\};/);
  if (m === null) {
    throw new Error(
      `${namaBerkas}: blok "const metadata: MetadataBallot = {...}" tidak ditemukan — format berkas berubah, perbarui regex ekstraksi di metadata-bahasa-wiring.test.ts.`,
    );
  }
  return m[1];
}

function ambil(blok: string, pola: RegExp, label: string, namaBerkas: string): string {
  const m = blok.match(pola);
  if (m === null) {
    throw new Error(`${namaBerkas}: field "${label}" tidak ditemukan di blok metadata — perbarui regex ekstraksi.`);
  }
  return m[1];
}

function ambilOptions(blok: string, namaBerkas: string): string[] {
  const m = blok.match(/options:\s*\[([^\]]*)\]/);
  if (m === null) throw new Error(`${namaBerkas}: array "options" tidak ditemukan di blok metadata.`);
  const options = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  if (options.length < 2) throw new Error(`${namaBerkas}: options terekstrak kurang dari 2 — regex diduga salah.`);
  return options;
}

/** Bukti "ADA teks yang diharapkan" (prinsip yang sama dengan audit-bahasa-ui.test.tsx bagian B): tanpa ini, blok yang gagal terekstrak total bisa lolos "tidak ada kata Indonesia" begitu saja karena tidak ada teks sama sekali yang diperiksa. */
function semuaStringDiBlok(blok: string): string[] {
  return [...blok.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

describe("metadata bawaan deploy-ballot.ts — Inggris, lolos gerbang validasiBahasaMetadata", () => {
  const blok = blokMetadata(deployBallotSrc, "deploy-ballot.ts");
  const semuaString = semuaStringDiBlok(blok);

  it("blok metadata benar-benar terekstrak (bukti anti-vakum: teks Inggris yang diharapkan ADA)", () => {
    expect(semuaString).toContain("Q4 Community Treasury");
    expect(semuaString).toContain("Midnight Builders");
    expect(semuaString.length).toBeGreaterThanOrEqual(7); // title, description, community, 3 options, eligibilityPolicy x2 cabang
  });

  it("title, description, community tidak mengandung kata Indonesia terlarang", () => {
    expect(cariKataTerlarang(ambil(blok, /title:\s*"([^"]*)"/, "title", "deploy-ballot.ts"))).toBeUndefined();
    expect(
      cariKataTerlarang(ambil(blok, /description:\s*"([^"]*)"/, "description", "deploy-ballot.ts")),
    ).toBeUndefined();
    expect(cariKataTerlarang(ambil(blok, /community:\s*"([^"]*)"/, "community", "deploy-ballot.ts"))).toBeUndefined();
  });

  it("options[] tidak mengandung kata Indonesia terlarang", () => {
    for (const opsi of ambilOptions(blok, "deploy-ballot.ts")) {
      expect(cariKataTerlarang(opsi), opsi).toBeUndefined();
    }
  });

  it("eligibilityPolicy — KEDUA cabang ternary (tanpaPendaftaran ? ... : ...) bersih DAN persis nilai yang diharapkan", () => {
    const m = blok.match(/eligibilityPolicy:\s*tanpaPendaftaran\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/);
    expect(m, "pola ternary eligibilityPolicy tidak ditemukan — perbarui regex ini").not.toBeNull();
    const [, cabangTanpaPendaftaran, cabangBawaan] = m as RegExpMatchArray;
    expect(cariKataTerlarang(cabangTanpaPendaftaran)).toBeUndefined();
    expect(cariKataTerlarang(cabangBawaan)).toBeUndefined();
    // Pin nilai PERSIS — MUTASI WAJIB audit-bahasa-metadata (kembalikan ke
    // kalimat Indonesia asli) harus membuat baris ini merah secara langsung,
    // bukan hanya bergantung pada cariKataTerlarang.
    expect(cabangTanpaPendaftaran).toBe(
      "Voters register their own credential leaf; the organiser only ever holds the hash.",
    );
    expect(cabangBawaan).toBe("Three test credentials issued by the organiser.");
  });

  it("metadata bawaan LENGKAP (kedua cabang eligibilityPolicy) lolos validasiBahasaMetadata", () => {
    const options = ambilOptions(blok, "deploy-ballot.ts");
    const m = blok.match(/eligibilityPolicy:\s*tanpaPendaftaran\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/) as RegExpMatchArray;
    for (const eligibilityPolicy of [m[1], m[2]]) {
      const meta: MetadataBallot = {
        title: ambil(blok, /title:\s*"([^"]*)"/, "title", "deploy-ballot.ts"),
        description: ambil(blok, /description:\s*"([^"]*)"/, "description", "deploy-ballot.ts"),
        community: ambil(blok, /community:\s*"([^"]*)"/, "community", "deploy-ballot.ts"),
        options,
        voteDeadline: 1_800_000_000n,
        tallyDeadline: 1_800_001_200n,
        quorumPercent: 60,
        eligibleCount: 3,
        eligibilityPolicy,
      };
      expect(() => validasiBahasaMetadata(meta)).not.toThrow();
    }
  });
});

describe("metadata bawaan e2e.ts — Inggris, lolos gerbang validasiBahasaMetadata", () => {
  const blok = blokMetadata(e2eSrc, "e2e.ts");
  const semuaString = semuaStringDiBlok(blok);

  it("blok metadata benar-benar terekstrak (bukti anti-vakum: teks Inggris yang diharapkan ADA)", () => {
    expect(semuaString).toContain("VotePriv End-to-End Test");
    expect(semuaString).toContain("Three voters, three options, on the preview network.");
    expect(semuaString.length).toBeGreaterThanOrEqual(6); // title, description, community, 3 options, eligibilityPolicy
  });

  it("title, description, community, eligibilityPolicy tidak mengandung kata Indonesia terlarang, dan eligibilityPolicy persis nilai yang diharapkan", () => {
    expect(cariKataTerlarang(ambil(blok, /title:\s*"([^"]*)"/, "title", "e2e.ts"))).toBeUndefined();
    expect(cariKataTerlarang(ambil(blok, /description:\s*"([^"]*)"/, "description", "e2e.ts"))).toBeUndefined();
    expect(cariKataTerlarang(ambil(blok, /community:\s*"([^"]*)"/, "community", "e2e.ts"))).toBeUndefined();
    const elig = ambil(blok, /eligibilityPolicy:\s*"([^"]*)"/, "eligibilityPolicy", "e2e.ts");
    expect(cariKataTerlarang(elig)).toBeUndefined();
    // Pin nilai PERSIS — kembaran mutasi wajib deploy-ballot.ts di atas.
    expect(elig).toBe("Three test credentials issued by the organiser.");
  });

  it("options[] tidak mengandung kata Indonesia terlarang", () => {
    for (const opsi of ambilOptions(blok, "e2e.ts")) {
      expect(cariKataTerlarang(opsi), opsi).toBeUndefined();
    }
  });

  it("metadata bawaan lengkap lolos validasiBahasaMetadata", () => {
    const meta: MetadataBallot = {
      title: ambil(blok, /title:\s*"([^"]*)"/, "title", "e2e.ts"),
      description: ambil(blok, /description:\s*"([^"]*)"/, "description", "e2e.ts"),
      community: ambil(blok, /community:\s*"([^"]*)"/, "community", "e2e.ts"),
      options: ambilOptions(blok, "e2e.ts"),
      voteDeadline: 1_800_000_000n,
      tallyDeadline: 1_800_001_200n,
      quorumPercent: 60,
      eligibleCount: 3,
      eligibilityPolicy: ambil(blok, /eligibilityPolicy:\s*"([^"]*)"/, "eligibilityPolicy", "e2e.ts"),
    };
    expect(() => validasiBahasaMetadata(meta)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { cariKataTerlarang, KATA_TERLARANG, validasiBahasaMetadata } from "./bahasa-metadata.js";
import type { MetadataBallot } from "./votepriv-types.js";

const metaInggris = (): MetadataBallot => ({
  title: "Q4 Community Treasury",
  description: "Choose the treasury's direction of support for Q4.",
  community: "Midnight Builders",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  voteDeadline: 1_800_000_000n,
  tallyDeadline: 1_800_001_200n,
  quorumPercent: 60,
  eligibleCount: 3,
  eligibilityPolicy: "Three test credentials issued by the organiser.",
});

describe("KATA_TERLARANG", () => {
  it("memuat persis 44 kata/frasa, tanpa duplikat — jumlah yang sama dipakai audit-bahasa-ui.test.tsx", () => {
    expect(KATA_TERLARANG).toHaveLength(44);
    expect(new Set(KATA_TERLARANG).size).toBe(44);
  });
});

describe("cariKataTerlarang", () => {
  it("undefined untuk teks Inggris bersih", () => {
    expect(cariKataTerlarang("Choose the treasury's direction of support for Q4.")).toBeUndefined();
  });

  it("menemukan kata Indonesia yang berdiri sendiri", () => {
    expect(cariKataTerlarang("Pilih arah dukungan treasury pada Q4.")).toBe("pada");
  });

  it("tidak salah tangkap substring kebetulan di kata Inggris (mis. 'dari' di dalam 'mandarin')", () => {
    expect(cariKataTerlarang("This is a mandarin orange.")).toBeUndefined();
  });

  it("case-insensitive, dan melaporkan kemunculan APA ADANYA (bukan dipaksa ke huruf kecil)", () => {
    expect(cariKataTerlarang("Sudah selesai.")).toBe("Sudah");
  });
});

describe("validasiBahasaMetadata", () => {
  it("metadata Inggris penuh lolos tanpa melempar", () => {
    expect(() => validasiBahasaMetadata(metaInggris())).not.toThrow();
  });

  it('title dengan satu kata terlarang ditolak, pesan menyebut field "title" dan kata "yang"', () => {
    expect(() => validasiBahasaMetadata({ ...metaInggris(), title: "Treasury yang matters" })).toThrow(
      /field "title".+"yang"/,
    );
  });

  it('description dengan satu kata terlarang ditolak, pesan menyebut field "description" dan kata "yang"', () => {
    expect(() =>
      validasiBahasaMetadata({ ...metaInggris(), description: "A description yang has one Indonesian word." }),
    ).toThrow(/field "description".+"yang"/);
  });

  it('community dengan satu kata terlarang ditolak, pesan menyebut field "community" dan kata "yang"', () => {
    expect(() => validasiBahasaMetadata({ ...metaInggris(), community: "Midnight yang Builders" })).toThrow(
      /field "community".+"yang"/,
    );
  });

  it('options[i] dengan satu kata terlarang ditolak, pesan menyebut field "options[N]" dan kata "yang" — SETIAP indeks', () => {
    const dasar = metaInggris();
    for (let i = 0; i < dasar.options.length; i++) {
      const options = [...dasar.options];
      options[i] = `${options[i]} yang`;
      expect(() => validasiBahasaMetadata({ ...dasar, options }), `options[${i}]`).toThrow(
        new RegExp(`field "options\\[${i}\\]".+"yang"`),
      );
    }
  });

  it('eligibilityPolicy dengan satu kata terlarang ditolak, pesan menyebut field "eligibilityPolicy" dan kata "yang"', () => {
    expect(() =>
      validasiBahasaMetadata({ ...metaInggris(), eligibilityPolicy: "A policy yang has one Indonesian word." }),
    ).toThrow(/field "eligibilityPolicy".+"yang"/);
  });

  it("pesan galat spesifik pada SATU field yang kotor — field lain yang bersih tidak ikut disebut", () => {
    expect.assertions(2);
    try {
      validasiBahasaMetadata({ ...metaInggris(), community: "Midnight yang Builders" });
    } catch (e) {
      expect((e as Error).message).toContain('"community"');
      expect((e as Error).message).not.toContain("eligibilityPolicy");
    }
  });
});

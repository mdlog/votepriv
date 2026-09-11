import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bacaRantai } from "./baca-rantai";
import type { JaringanAktif } from "./endpoint";

const meta = JSON.parse(
  readFileSync(new URL("../../test/fixture-rantai/meta.json", import.meta.url), "utf8"),
);

const JARINGAN: JaringanAktif = {
  networkId: meta.jaringan,
  indexer: meta.endpoint,
  indexerWS: "",
  alamatRegistry: meta.alamatRegistry,
};

/**
 * Menyentuh indexer SUNGGUHAN. Dilewati kecuali diminta:
 *
 *   VOTEPRIV_UJI_JARINGAN=1 pnpm test client/src/lib/chain/jaringan-nyata.test.ts
 *
 * Tidak satu pun assert di sini menyebut NILAI. Data nyata berubah — tinggi
 * blok naik tiap 6 detik, ballot bisa bertambah, fase bergerak — jadi uji
 * bernilai adalah uji yang merah menurut hari, bukan menurut kode.
 *
 * Yang diassert: bentuk, invarian kontrak, dan MONOTONISITAS terhadap rekaman.
 * Tinggi blok tidak pernah mundur; kalau ia mundur, yang salah bukan uji ini.
 */
describe.skipIf(!process.env.VOTEPRIV_UJI_JARINGAN)("rantai sungguhan", () => {
  it("membaca registry dan ballot dari indexer yang hidup", { timeout: 30_000 }, async () => {
    const h = await bacaRantai({ jaringan: JARINGAN });

    // Monotonisitas: tinggi blok tidak pernah mundur dari saat fixture direkam.
    expect(h.blok.height).toBeGreaterThanOrEqual(meta.tinggiBlok);

    // Registry tidak pernah menyusut: register() hanya pushFront dan increment.
    expect(h.registry.count).toBeGreaterThanOrEqual(meta.jumlahBallot);

    // Setiap ballot yang berhasil dibaca memenuhi invarian constructor kontrak.
    for (const b of h.ballot) {
      expect(b.keadaan.optionCount).toBeGreaterThanOrEqual(2);
      expect(b.keadaan.optionCount).toBeLessThanOrEqual(4);
      expect(b.keadaan.tallyDeadlineDetik).toBeGreaterThan(b.keadaan.voteDeadlineDetik);
      expect(b.keadaan.talliedCount).toBeLessThanOrEqual(b.keadaan.voteCount);
      expect(b.keadaan.registeredCount).toBeLessThanOrEqual(b.keadaan.eligibleCount);
      expect(b.deployHeight).toBeGreaterThan(0);
    }

    // Setiap kegagalan sebagian punya sebab yang dikenal — tidak ada kategori
    // "lain-lain" yang menyembunyikan bentuk kegagalan baru.
    for (const g of h.gagal) {
      expect(["alamat-tak-sah", "alias-hilang", "kontrak-null", "alamat-tak-cocok", "dekode"]).toContain(g.sebab);
    }
  });
});

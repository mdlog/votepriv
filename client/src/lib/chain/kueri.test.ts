import { describe, expect, it } from "vitest";
import { FRAGMEN_PENUH, FRAGMEN_RINGKAS, susunKueriBallot } from "./kueri";

/**
 * Uji murni untuk susunKueriBallot — tanpa fetch, tanpa dekode, tanpa fixture.
 *
 * Ini pelengkap, bukan pengganti, cakupan lintas-dokumen di
 * baca-rantai.registry-sintetis.test.ts (praperiksa P1): berkas itu membuktikan
 * bahwa `bacaRantai()` benar-benar MEMANGGIL fungsi ini dengan angka yang
 * benar lintas keping; berkas ini membuktikan bahwa fungsi ini sendiri
 * menyusun STRING dokumen yang benar untuk kombinasi jumlah/jumlahBerAksi apa
 * pun, termasuk batas yang jarang dilalui orkestrasi (jumlahBerAksi 0 atau
 * sama dengan jumlah).
 */
describe("susunKueriBallot", () => {
  it("melempar pada jumlah < 1", () => {
    expect(() => susunKueriBallot(0, 0)).toThrow(/jumlah < 1/);
    expect(() => susunKueriBallot(-1, 0)).toThrow(/jumlah < 1/);
  });

  it("melempar ketika jumlahBerAksi di luar rentang 0..jumlah", () => {
    expect(() => susunKueriBallot(3, -1)).toThrow(/jumlahBerAksi/);
    expect(() => susunKueriBallot(3, 4)).toThrow(/jumlahBerAksi/);
  });

  it("alias b0..bN-1 dan variabel a0..aN-1, satu per alamat", () => {
    const q = susunKueriBallot(3, 0);
    expect(q).toContain("$a0: HexEncoded!");
    expect(q).toContain("$a1: HexEncoded!");
    expect(q).toContain("$a2: HexEncoded!");
    expect(q).toContain("b0: contract(address: $a0)");
    expect(q).toContain("b1: contract(address: $a1)");
    expect(q).toContain("b2: contract(address: $a2)");
  });

  it("jumlahBerAksi menentukan PERSIS alias mana yang memakai ...Penuh vs ...Ringkas", () => {
    const q = susunKueriBallot(5, 2);
    expect(q).toContain("b0: contract(address: $a0) { ...Penuh }");
    expect(q).toContain("b1: contract(address: $a1) { ...Penuh }");
    expect(q).toContain("b2: contract(address: $a2) { ...Ringkas }");
    expect(q).toContain("b3: contract(address: $a3) { ...Ringkas }");
    expect(q).toContain("b4: contract(address: $a4) { ...Ringkas }");
    // Dipaku, bukan hanya "mengandung": persis dua Penuh, persis tiga Ringkas.
    expect((q.match(/\.\.\.Penuh \}/g) ?? []).length).toBe(2);
    expect((q.match(/\.\.\.Ringkas \}/g) ?? []).length).toBe(3);
  });

  it("menyertakan HANYA fragmen yang benar-benar dipakai — fragmen deklarasi tak terpakai adalah galat validasi GraphQL", () => {
    const semuaPenuh = susunKueriBallot(4, 4);
    expect(semuaPenuh).toContain(FRAGMEN_PENUH);
    expect(semuaPenuh).not.toContain(FRAGMEN_RINGKAS);

    const semuaRingkas = susunKueriBallot(4, 0);
    expect(semuaRingkas).not.toContain(FRAGMEN_PENUH);
    expect(semuaRingkas).toContain(FRAGMEN_RINGKAS);

    const campuran = susunKueriBallot(4, 2);
    expect(campuran).toContain(FRAGMEN_PENUH);
    expect(campuran).toContain(FRAGMEN_RINGKAS);
  });
});

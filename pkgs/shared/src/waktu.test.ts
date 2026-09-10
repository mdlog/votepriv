import { describe, expect, it } from "vitest";
import { detikDariSekarang, detikSekarang } from "./waktu.js";

describe("waktu", () => {
  it("detikSekarang mengembalikan DETIK, bukan milidetik", () => {
    const t = detikSekarang();
    const ms = BigInt(Date.now());
    // Detik selalu kira-kira seperseribu milidetik. Perbandingan ini akan
    // gagal seketika bila seseorang mengembalikan Date.now() apa adanya —
    // kekeliruan yang di jaringan nyata membuat deadline tidak pernah tercapai.
    expect(t).toBeLessThan(ms / 100n);
    expect(t).toBeGreaterThan(ms / 10000n);
  });

  it("detikDariSekarang menambah tepat sejumlah detik", () => {
    const dasar = detikSekarang();
    const nanti = detikDariSekarang(300);
    expect(nanti - dasar).toBeGreaterThanOrEqual(299n);
    expect(nanti - dasar).toBeLessThanOrEqual(301n);
  });

  it("menolak durasi yang sudah lewat", () => {
    expect(() => detikDariSekarang(-1)).toThrow(/tidak boleh negatif/);
  });
});

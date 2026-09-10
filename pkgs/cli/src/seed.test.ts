import { describe, expect, it } from "vitest";
import { validasiSeed } from "./seed.js";

describe("validasiSeed", () => {
  const sah = "a".repeat(64);

  it("menerima hex 64 karakter", () => {
    expect(() => validasiSeed(sah)).not.toThrow();
  });

  it("menerima huruf besar dan spasi di tepi", () => {
    expect(() => validasiSeed(`  ${"A".repeat(64)}  `)).not.toThrow();
  });

  it("menolak panjang yang salah", () => {
    expect(() => validasiSeed("a".repeat(63))).toThrow(/64 karakter/);
  });

  it("menolak karakter non-hex", () => {
    expect(() => validasiSeed("z".repeat(64))).toThrow(/heksadesimal/);
  });

  it("pesan galat tidak pernah memuat seed-nya", () => {
    const rahasia = "deadbeef".repeat(7); // 56 karakter, panjangnya salah
    try {
      validasiSeed(rahasia);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).not.toContain("deadbeef");
    }
  });
});

import { describe, expect, it } from "vitest";
import { caraTurunanDariArgv } from "./args.ts";

describe("caraTurunanDariArgv — bentuk yang didukung", () => {
  it("default ke pbkdf2 saat flag tidak ada", () => {
    expect(caraTurunanDariArgv([])).toBe("pbkdf2");
    expect(caraTurunanDariArgv(["preprod"])).toBe("pbkdf2");
  });

  it("membaca bentuk --seed-derivation=<metode>", () => {
    expect(caraTurunanDariArgv(["--seed-derivation=pbkdf2-32"])).toBe("pbkdf2-32");
    expect(caraTurunanDariArgv(["--seed-derivation=entropy"])).toBe("entropy");
  });

  it("membaca bentuk --seed-derivation <metode> (dipisah spasi) — I1", () => {
    // Regresi langsung dari fix round 1, I1: bentuk ini sebelumnya diam-diam
    // diabaikan sepenuhnya, tepat untuk pengguna yang butuh pbkdf2-32.
    expect(caraTurunanDariArgv(["--seed-derivation", "pbkdf2-32"])).toBe("pbkdf2-32");
    expect(caraTurunanDariArgv(["--seed-derivation", "entropy"])).toBe("entropy");
  });

  it("membaca flag di antara argumen lain, kedua bentuk", () => {
    expect(caraTurunanDariArgv(["--foo", "--seed-derivation=entropy", "--bar"])).toBe("entropy");
    expect(caraTurunanDariArgv(["--foo", "--seed-derivation", "entropy", "--bar"])).toBe("entropy");
  });
});

describe("caraTurunanDariArgv — penolakan keras (I1: silence adalah cacatnya)", () => {
  it("menolak nilai yang tidak dikenal pada bentuk =", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation=raksasa"])).toThrow(/seed-derivation/);
  });

  it("menolak nilai yang tidak dikenal pada bentuk spasi", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation", "raksasa"])).toThrow(/seed-derivation/);
  });

  it("menolak --seed-derivation tanpa nilai sama sekali (argumen terakhir)", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation"])).toThrow(/seed-derivation/);
  });

  it("menolak --seed-derivation diikuti flag lain, bukan nilai", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation", "--verbose"])).toThrow(/seed-derivation/);
  });

  it("menolak ejaan jamak --seed-derivations=<metode> (typo umum), bukan diam-diam diabaikan", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivations=pbkdf2-32"])).toThrow(/menyerupai/);
  });

  it("menolak ejaan jamak --seed-derivations <metode> (typo umum)", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivations", "pbkdf2-32"])).toThrow(/menyerupai/);
  });

  it("menolak --seed-derivation= kosong (bentuk = tanpa nilai)", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation="])).toThrow(/seed-derivation/);
  });

  it("pesan galat tidak pernah mengutip nilai mentah yang diberikan (M1)", () => {
    const rahasiaPalsu = "kata-rahasia-pengguna-yang-salah-ketik";
    try {
      caraTurunanDariArgv(["--seed-derivation", rahasiaPalsu]);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).not.toContain(rahasiaPalsu);
    }
    try {
      caraTurunanDariArgv([`--seed-derivations=${rahasiaPalsu}`]);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).not.toContain(rahasiaPalsu);
    }
  });

  it("TIDAK menolak flag lain yang tidak mirip --seed-derivation sama sekali", () => {
    expect(caraTurunanDariArgv(["--seed-derivationX-tidak-nyambung"])).toBe("pbkdf2");
    expect(caraTurunanDariArgv(["--lain-lain=pbkdf2-32"])).toBe("pbkdf2");
  });
});

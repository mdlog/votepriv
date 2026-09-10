import { describe, expect, it } from "vitest";
import { caraTurunanDariArgv } from "./args.ts";

describe("caraTurunanDariArgv", () => {
  it("default ke pbkdf2 saat flag tidak ada", () => {
    expect(caraTurunanDariArgv([])).toBe("pbkdf2");
    expect(caraTurunanDariArgv(["preprod"])).toBe("pbkdf2");
  });

  it("membaca --seed-derivation=pbkdf2-32", () => {
    expect(caraTurunanDariArgv(["--seed-derivation=pbkdf2-32"])).toBe("pbkdf2-32");
  });

  it("membaca --seed-derivation=entropy di antara argumen lain", () => {
    expect(caraTurunanDariArgv(["--foo", "--seed-derivation=entropy", "--bar"])).toBe("entropy");
  });

  it("menolak nilai yang tidak dikenal", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation=raksasa"])).toThrow(/seed-derivation/);
  });
});

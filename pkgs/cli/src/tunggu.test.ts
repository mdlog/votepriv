import type { Logger } from "pino";
import { describe, expect, it } from "vitest";
import { denganBatasWaktu, pastikan, ulangiSampai } from "./tunggu.ts";

// Logger palsu: uji ini tidak boleh menulis apa pun ke berkas log.
const logPalsu = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;

describe("pastikan", () => {
  it("diam bila benar, melempar pesan apa adanya bila salah", () => {
    expect(() => pastikan(true, "tidak akan terjadi")).not.toThrow();
    expect(() => pastikan(false, "tally harus kosong")).toThrow("tally harus kosong");
  });
});

describe("denganBatasWaktu", () => {
  it("meneruskan hasil bila selesai tepat waktu", async () => {
    await expect(denganBatasWaktu(Promise.resolve(42), 1000, "kelamaan")).resolves.toBe(42);
  });

  it("melempar pesan yang diberikan bila lewat batas", async () => {
    const menggantung = new Promise<never>(() => {});
    await expect(denganBatasWaktu(menggantung, 20, "kelamaan")).rejects.toThrow("kelamaan");
  });
});

describe("ulangiSampai", () => {
  it("mengembalikan nilai pertama bila syarat sudah terpenuhi", async () => {
    const hasil = await ulangiSampai(async () => 3n, (n) => n === 3n, logPalsu, "n === 3", 5, 1);
    expect(hasil.cocok).toBe(true);
    expect(hasil.nilai).toBe(3n);
    expect(hasil.percobaan).toBe(1);
  });

  it("mengulang sampai indexer menyusul", async () => {
    let ke = 0;
    const hasil = await ulangiSampai(
      async () => {
        ke += 1;
        return ke < 3 ? 0n : 3n;
      },
      (n) => n === 3n,
      logPalsu,
      "n === 3",
      10,
      1,
    );
    expect(hasil.cocok).toBe(true);
    expect(hasil.nilai).toBe(3n);
    expect(hasil.percobaan).toBe(3);
  });

  it("menyerah setelah maks percobaan tanpa melempar, membawa nilai terakhir", async () => {
    const hasil = await ulangiSampai(async () => 0n, (n) => n === 3n, logPalsu, "n === 3", 3, 1);
    expect(hasil.cocok).toBe(false);
    expect(hasil.nilai).toBe(0n);
    expect(hasil.percobaan).toBe(3);
    expect(hasil.galatTerakhir).toBeUndefined();
  });

  it("memperlakukan galat pembacaan sebagai 'belum siap' dan menyimpan pesannya", async () => {
    const hasil = await ulangiSampai<bigint>(
      async () => {
        throw new Error("Registry belum terlihat di indexer");
      },
      (n) => n === 3n,
      logPalsu,
      "n === 3",
      2,
      1,
    );
    expect(hasil.cocok).toBe(false);
    expect(hasil.nilai).toBeUndefined();
    expect(hasil.galatTerakhir).toMatch(/belum terlihat di indexer/);
  });
});

import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
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

  it("membersihkan timer setelah selesai tepat waktu (tidak membiarkan handle tergantung)", async () => {
    // finally { clearTimeout } tidak pernah menentukan hasil sebuah uji lain
    // — dua uji di atas sama-sama lolos walau clearTimeout dihapus, karena
    // proses uji selalu berakhir lewat process.exit di produksi. vi.getTimerCount()
    // di bawah fake timers adalah satu-satunya cara memeriksa handle-nya
    // langsung dibersihkan.
    vi.useFakeTimers();
    try {
      await denganBatasWaktu(Promise.resolve(42), 1000, "kelamaan");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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

  it("mereset galatTerakhir setelah pembacaan gagal lalu berhasil menyusul (walau syarat belum terpenuhi)", async () => {
    // Jalur "syarat langsung terpenuhi" mengembalikan literal
    // `galatTerakhir: undefined` di tempat, jadi tidak menguji resetnya.
    // Baris `galatTerakhir = undefined;` sesudah pembacaan sukses hanya
    // kelihatan pengaruhnya pada hasil AKHIR bila pembacaan terakhir
    // berhasil tapi syaratnya tidak pernah terpenuhi sampai percobaan
    // habis. Di sini percobaan pertama melempar, sisanya berhasil dibaca
    // tapi tidak pernah cocok.
    let ke = 0;
    const hasil = await ulangiSampai<bigint>(
      async () => {
        ke += 1;
        if (ke === 1) throw new Error("Registry belum terlihat di indexer");
        return 0n; // berhasil dibaca, tapi tidak pernah memenuhi syarat n === 3n
      },
      (n) => n === 3n,
      logPalsu,
      "n === 3",
      4,
      1,
    );
    expect(hasil.cocok).toBe(false);
    expect(hasil.nilai).toBe(0n);
    expect(hasil.percobaan).toBe(4);
    expect(hasil.galatTerakhir).toBeUndefined();
  });
});

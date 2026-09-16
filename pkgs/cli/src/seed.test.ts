import { afterEach, describe, expect, it } from "vitest";
import { bacaFrasaPemulihan, bacaSeed, validasiSeed, validasiSeedHex } from "./seed.ts";

const MNEMONIC_PUBLIK = `${"abandon ".repeat(23)}art`.trim();

afterEach(() => {
  delete process.env.MIDNIGHT_WALLET_SEED;
});

describe("validasiSeedHex", () => {
  const sah = "a".repeat(64);

  it("menerima hex 64 karakter", () => {
    expect(() => validasiSeedHex(sah)).not.toThrow();
  });

  it("menerima huruf besar dan spasi di tepi", () => {
    expect(() => validasiSeedHex(`  ${"A".repeat(64)}  `)).not.toThrow();
  });

  it("menolak panjang yang salah", () => {
    expect(() => validasiSeedHex("a".repeat(63))).toThrow(/64 (lowercase )?hexadecimal characters/);
  });

  it("menolak karakter non-hex", () => {
    expect(() => validasiSeedHex("z".repeat(64))).toThrow(/hexadecimal/);
  });

  it("pesan galat tidak pernah memuat seed-nya (cabang panjang salah)", () => {
    const rahasia = "deadbeef".repeat(7); // 56 karakter, panjangnya salah
    try {
      validasiSeedHex(rahasia);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).not.toContain("deadbeef");
    }
  });

  it("pesan galat tidak pernah memuat seed-nya (cabang non-hex)", () => {
    // 64 karakter tepat (lolos pemeriksaan panjang) tapi memuat karakter non-hex,
    // sehingga jatuh ke cabang pesan kedua. Mutation testing membuktikan cabang
    // ini tidak terjaga oleh uji "panjang salah" di atas: menyuntikkan kebocoran
    // seed hanya ke cabang non-hex membuat uji itu tetap lolos.
    const rahasia = `zzzzzzzz${"deadbeef".repeat(7)}`; // 64 karakter, non-hex
    try {
      validasiSeedHex(rahasia);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).not.toContain("deadbeef");
      expect((e as Error).message).not.toContain("zzzzzzzz");
    }
  });
});

describe("validasiSeed — deteksi bentuk (hex vs frasa pemulihan)", () => {
  it("satu token 64-hex dirutekan ke jalur hex dan mengembalikan 32 byte", () => {
    const sah = "a".repeat(64);
    const seed = validasiSeed(sah);
    expect(seed.length).toBe(32);
    expect(Buffer.from(seed).toString("hex")).toBe(sah);
  });

  it("satu token dengan panjang salah tetap melempar galat hex (bukan galat frasa)", () => {
    expect(() => validasiSeed("a".repeat(63))).toThrow(/64 (lowercase )?hexadecimal characters/);
  });

  it("frasa 24 kata TIDAK PERNAH mengenai validator hex — jawaban yang benar tidak lagi ditolak", () => {
    // Regresi langsung dari gap yang dilaporkan pengguna: frasa 24 kata
    // (>160 karakter setelah digabung spasi) dulu ditolak dengan pesan
    // "yang diberikan 160 karakter" dari validator hex. Sekarang harus
    // lolos dan menghasilkan 64 byte (pbkdf2, default).
    const seed = validasiSeed(MNEMONIC_PUBLIK);
    expect(seed.length).toBe(64);
  });

  it("cara diteruskan ke jalur frasa, diabaikan di jalur hex", () => {
    expect(validasiSeed(MNEMONIC_PUBLIK, "pbkdf2-32").length).toBe(32);
    expect(validasiSeed(MNEMONIC_PUBLIK, "entropy").length).toBe(32);
    // Jalur hex: satu token, panjang argumen tetap 32 byte apa pun `cara`-nya.
    expect(validasiSeed("a".repeat(64), "entropy").length).toBe(32);
  });

  it("frasa dengan jumlah kata salah melempar galat BENTUK, bukan galat hex, dan tidak memuat isi frasa", () => {
    const kurang = Array(5).fill("abandon").join(" ");
    try {
      validasiSeed(kurang);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).toMatch(/24 kata/);
      expect((e as Error).message).not.toContain("abandon");
      expect((e as Error).message).not.toMatch(/hexadecimal/);
    }
  });
});

describe("bacaSeed / bacaFrasaPemulihan — jalur env var", () => {
  it("bacaSeed menerima seed hex dari MIDNIGHT_WALLET_SEED", async () => {
    process.env.MIDNIGHT_WALLET_SEED = "b".repeat(64);
    const seed = await bacaSeed();
    expect(seed.length).toBe(32);
  });

  it("bacaSeed menerima frasa pemulihan dari MIDNIGHT_WALLET_SEED", async () => {
    process.env.MIDNIGHT_WALLET_SEED = MNEMONIC_PUBLIK;
    const seed = await bacaSeed();
    expect(seed.length).toBe(64); // default pbkdf2
  });

  it("bacaSeed meneruskan `cara` ke turunan frasa", async () => {
    process.env.MIDNIGHT_WALLET_SEED = MNEMONIC_PUBLIK;
    const seed = await bacaSeed("entropy");
    expect(seed.length).toBe(32);
  });

  it("bacaFrasaPemulihan mengembalikan frasa ternormalisasi, tidak divalidasi sebagai hex", async () => {
    process.env.MIDNIGHT_WALLET_SEED = `  ${MNEMONIC_PUBLIK.toUpperCase()}  `;
    const frasa = await bacaFrasaPemulihan();
    expect(frasa).toBe(MNEMONIC_PUBLIK);
  });
});

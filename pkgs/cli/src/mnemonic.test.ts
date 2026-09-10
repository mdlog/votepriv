import { describe, expect, it } from "vitest";
// Fix round 1, I2: dulu berkas ini punya `alamatDari` — salinan tangan dari
// logika turunan alamat doctor.ts. Reviewer menemukan salinan itu BISA
// menyimpang diam-diam dari kode yang sungguhan dikirim (urutan clear() vs
// perhitungan alamat berbeda), dan mutation test membuktikan salinan itu
// tidak mengikat ke kode aslinya. Diperbaiki dengan menghapus salinannya:
// jangkar regresi di bawah sekarang memanggil `alamatUntukSemuaJaringan`
// yang diekspor doctor.ts — jalur uji dan jalur yang dikirim SAMA PERSIS.
import { alamatUntukSemuaJaringan } from "./doctor.ts";
import { normalisasiMnemonic, seedDariMnemonic } from "./mnemonic.ts";

// Vektor uji PUBLIK BIP-39 ("abandon" x23 + "art"), entropi nol, tidak
// memegang dana apa pun — aman dipakai sebagai fixture. Lihat progress.md,
// "Riset derivasi mnemonic", untuk bagaimana ketiga alamat jangkar di bawah
// diperoleh (pembedahan biner Lace 2.2.3 sungguhan).
const MNEMONIC_PUBLIK = `${"abandon ".repeat(23)}art`.trim();

/** Alamat unshielded bech32 (NightExternal, account 0, index 0) — thin wrapper atas kode doctor.ts sungguhan. */
function alamatDari(seed: Uint8Array, networkId: string): string {
  return alamatUntukSemuaJaringan(seed, [networkId])[networkId];
}

describe("normalisasiMnemonic", () => {
  it("merapikan huruf besar dan spasi tepi", () => {
    expect(normalisasiMnemonic(`  ${MNEMONIC_PUBLIK.toUpperCase()}  `)).toBe(MNEMONIC_PUBLIK);
  });

  it("merapatkan spasi ganda di tengah", () => {
    const berantakan = MNEMONIC_PUBLIK.split(" ").join("   ");
    expect(normalisasiMnemonic(berantakan)).toBe(MNEMONIC_PUBLIK);
  });
});

describe("seedDariMnemonic — validasi bentuk", () => {
  it("menolak jumlah kata yang salah, pesan hanya menyebut jumlah", () => {
    const kurang = Array(23).fill("abandon").join(" ");
    try {
      seedDariMnemonic(kurang);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).toMatch(/24 kata/);
      expect((e as Error).message).toContain("23 kata");
      expect((e as Error).message).not.toContain("abandon");
    }
  });

  it("menolak frasa kosong sebagai 0 kata", () => {
    expect(() => seedDariMnemonic("")).toThrow(/diberikan 0 kata/);
  });

  it("menolak checksum BIP-39 yang gagal, pesan tidak memuat frasa", () => {
    // 24 kata valid dalam wordlist, jumlah kata benar, tapi checksum salah
    // ("abandon" x24 BUKAN vektor uji yang sah — checksum-nya menuntut "art"
    // sebagai kata terakhir untuk entropi nol).
    const checksumSalah = Array(24).fill("abandon").join(" ");
    try {
      seedDariMnemonic(checksumSalah);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).toMatch(/checksum/);
      expect((e as Error).message).not.toContain("abandon");
    }
  });
});

describe("seedDariMnemonic — panjang seed per cara", () => {
  it("pbkdf2 (default) menghasilkan 64 byte", () => {
    expect(seedDariMnemonic(MNEMONIC_PUBLIK).length).toBe(64);
    expect(seedDariMnemonic(MNEMONIC_PUBLIK, "pbkdf2").length).toBe(64);
  });

  it("pbkdf2-32 menghasilkan 32 byte, prefiks sama dengan pbkdf2 penuh", () => {
    const penuh = seedDariMnemonic(MNEMONIC_PUBLIK, "pbkdf2");
    const potong = seedDariMnemonic(MNEMONIC_PUBLIK, "pbkdf2-32");
    expect(potong.length).toBe(32);
    expect(Buffer.from(potong).toString("hex")).toBe(Buffer.from(penuh.subarray(0, 32)).toString("hex"));
  });

  it("entropy menghasilkan 32 byte, seluruhnya nol untuk vektor 'abandon x23 + art'", () => {
    const entropi = seedDariMnemonic(MNEMONIC_PUBLIK, "entropy");
    expect(entropi.length).toBe(32);
    expect(Buffer.from(entropi).toString("hex")).toBe("00".repeat(32));
  });
});

describe("JANGKAR REGRESI WAJIB — vektor publik abandon x23 + art, akun 0, NightExternal, indeks 0, preview", () => {
  // Sumber kebenaran: doctor-proto.mjs (prototipe yang sudah terverifikasi
  // menghasilkan ketiga alamat ini) dan progress.md. Tes ini mengunci
  // derivasi TERHADAP PRIMITIF SDK SUNGGUHAN (HDWallet.fromSeed +
  // createKeystore), bukan terhadap nilai seed antara — supaya bump
  // dependensi yang diam-diam mengubah derivasi tertangkap di sini, bukan
  // setelah dana pengguna dikirim ke alamat yang salah.

  it("pbkdf2 (PENUH 64 byte) — DEFAULT CLI, jawaban yang settled oleh riset", () => {
    const seed = seedDariMnemonic(MNEMONIC_PUBLIK, "pbkdf2");
    expect(alamatDari(seed, "preview")).toBe(
      "mn_addr_preview19kxg8sxrsty37elmm6yd68tuy7prryjst2r48eapf2fdtd8z4gpq8xczf2",
    );
  });

  it("pbkdf2-32 (32 byte pertama) — kandidat beta Lace Jan-2026, hanya lewat --seed-derivation", () => {
    const seed = seedDariMnemonic(MNEMONIC_PUBLIK, "pbkdf2-32");
    expect(alamatDari(seed, "preview")).toBe(
      "mn_addr_preview15jlkezafp4mju3v7cdh3ywre2y2s3szgpqrkw8p4tzxjqhuaqhlshsa9pv",
    );
  });

  it("entropy (32 byte mentah BIP-39) — kandidat ketiga, hanya lewat --seed-derivation", () => {
    const seed = seedDariMnemonic(MNEMONIC_PUBLIK, "entropy");
    expect(alamatDari(seed, "preview")).toBe(
      "mn_addr_preview13h0e3c2m7rcfem6wvjljnyjmxy5rkg9kkwcldzt73ya5pv7c4p8svcvwv7",
    );
  });

  it("ketiga kandidat menghasilkan tiga alamat yang BERBEDA (metode salah = wallet salah, bukan galat nyaring)", () => {
    const alamat = (["pbkdf2", "pbkdf2-32", "entropy"] as const).map((cara) =>
      alamatDari(seedDariMnemonic(MNEMONIC_PUBLIK, cara), "preview"),
    );
    expect(new Set(alamat).size).toBe(3);
  });
});

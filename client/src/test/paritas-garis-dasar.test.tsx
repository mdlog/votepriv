/**
 * Penerus uji paritas, dan sisa yang bertahan setelah salinan beku dihapus.
 *
 * Rekaman yang dibandingkan di sini dibuat pada Task 2 dari render salinan beku
 * Home.tsx — sebelum satu komponen pun dipecah. Ia karena itu tetap merupakan
 * nilai "sebelum" yang sah meski berkas bekunya sudah tidak ada.
 *
 * Uji ini berlaku sampai C-2 menyentuh spec §9.2. Jalur regenerasinya
 * (scripts/pindah-komponen.mjs) dan salinan beku sumbernya sudah dibongkar di
 * C-1 — garis dasar ini sekarang bukti yang TIDAK BISA dibuat ulang dari
 * pohon ini. Saat C-2 sengaja mengubah tampilan dan uji ini merah, penerus
 * harus memilih SADAR, di AWAL C-2 dan bukan saat merah pertama, antara:
 * (a) menghapus uji ini, atau (b) menulis ulang garis-dasar-tampilan.json
 * dari Home hidup pasca-perubahan — sadar bahwa hasilnya bukan lagi nilai
 * "sebelum" yang independen, melainkan turunan dari kode yang sedang
 * diujinya sendiri.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import {
  KONEKSI_PALSU,
  STATUS_LOKAL,
  rekamPermukaan,
  rekamPrivasi,
  type Rekaman,
  type StatusFixture,
} from "./cap-tampilan";
import Home from "@/pages/Home";

// import.meta.url DIPISAH ke variabel dengan sengaja. Vite mengenali pola
// literal persis `new URL("...", import.meta.url)` sebagai sintaksis "asset
// URL" bawaannya dan menulis ulang base-nya menjadi origin server uji
// (http://localhost:3000/ dari vitest.config.ts), bukan file://<berkas ini>.
// Memisahkan import.meta.url ke variabel lebih dulu membuat pola literalnya
// tidak lagi cocok.
const URL_BERKAS_INI = import.meta.url;

// Dibaca lewat readFileSync, bukan `import … from "*.json"`, karena tsconfig.json
// tidak menyalakan resolveJsonModule dan C-1 tidak punya urusan mengubahnya.
const rekaman = JSON.parse(
  readFileSync(new URL("./garis-dasar-tampilan.json", URL_BERKAS_INI), "utf8"),
) as Rekaman;

const kendali = vi.hoisted(() => ({ status: "menggantung" as StatusFixture }));

vi.mock("@/lib/proof-server", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/proof-server")>();
  return {
    ...asli,
    checkProofServer: () =>
      kendali.status === "menggantung"
        ? new Promise(() => {})
        : Promise.resolve(kendali.status),
  };
});

vi.mock("@/lib/midnight-wallet", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/midnight-wallet")>();
  return { ...asli, connectMidnightWallet: async () => KONEKSI_PALSU };
});

beforeEach(() => {
  kendali.status = STATUS_LOKAL;
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("Home hidup terhadap rekaman garis dasar pra-pemecahan", () => {
  it("cocok pada kelas, garis besar DOM beserta atributnya, dan teks di ketiga belas permukaan", async () => {
    const sesudah = await rekamPermukaan(Home);
    expect(Object.keys(sesudah)).toEqual(Object.keys(rekaman.permukaan));
    for (const nama of Object.keys(rekaman.permukaan)) {
      expect(sesudah[nama].kelas, `himpunan kelas berbeda di permukaan "${nama}"`).toEqual(
        rekaman.permukaan[nama].kelas,
      );
      expect(sesudah[nama].garisBesar, `garis besar atau atribut DOM berbeda di permukaan "${nama}"`).toEqual(
        rekaman.permukaan[nama].garisBesar,
      );
      expect(sesudah[nama].teks, `teks berbeda di permukaan "${nama}"`).toEqual(
        rekaman.permukaan[nama].teks,
      );
    }
  });

  it("cocok pada keenam fixture panel privasi", async () => {
    const atur = (s: StatusFixture) => {
      kendali.status = s;
    };
    const sesudah = await rekamPrivasi(Home, atur);
    expect(sesudah).toEqual(rekaman.privasi);
  });
});

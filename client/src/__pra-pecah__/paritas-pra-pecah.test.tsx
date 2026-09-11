/**
 * Gerbang utama Rencana C-1.
 *
 * Merender DUA komponen di proses uji yang sama — salinan beku Home.tsx
 * pra-pemecahan dan Home.tsx hidup — menjalankan skrip interaksi yang identik
 * pada keduanya, lalu membandingkan kelas, garis besar DOM beserta seluruh
 * atribut non-class, dan teksnya.
 *
 * Nilai "sebelum" di sini adalah HASIL MENGEKSEKUSI KODE ASLI, bukan nilai yang
 * diturunkan dari kode yang sedang disunting. Itu bedanya uji yang menjaga
 * sesuatu dan uji yang membandingkan kode dengan dirinya sendiri: yang kedua
 * tetap hijau ketika satu kelas hilang, karena kelas itu hilang di kedua sisi.
 *
 * Berkas ini dihapus di Task 8, setelah rekamannya dibekukan ke
 * client/src/test/garis-dasar-tampilan.json dan uji penerusnya hijau.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import {
  KONEKSI_PALSU,
  STATUS_LOKAL,
  rekamPermukaan,
  rekamPrivasi,
  type Rekaman,
  type StatusFixture,
} from "@/test/cap-tampilan";
import HomePraPecah from "./HomePraPecah";
import Home from "@/pages/Home";

/** sha256 Home.tsx pada saat garis dasar dibekukan (Task 1 Step 1). */
const SHA_BEKU = "bdb0d2d6d16759988a7423b4ae2c76ed27d957a21ff955c06f083a62ff3af812";
const JALUR_HOME = "client/src/pages/Home.tsx";
// import.meta.url DIPISAH ke variabel dengan sengaja — bukan gaya penulisan.
// Vite mengenali pola literal persis `new URL("...", import.meta.url)` sebagai
// sintaksis "asset URL" bawaannya dan menulis ulang base-nya menjadi origin
// server uji (http://localhost:3000/ dari vitest.config.ts) alih-alih
// file://<berkas ini>. Hasilnya JALUR_REKAMAN menjadi URL http, dan
// writeFileSync melempar "The URL must be of scheme file". Memisahkan
// import.meta.url ke variabel lebih dulu membuat pola literalnya tidak lagi
// cocok, sehingga Vite membiarkannya sebagai import.meta.url ESM biasa.
const URL_BERKAS_INI = import.meta.url;
const JALUR_REKAMAN = new URL("../test/garis-dasar-tampilan.json", URL_BERKAS_INI);

/**
 * Ketiga belas permukaan yang dijelajah rekamPermukaan(), dalam urutan
 * pencatatannya. Ditulis LITERAL, bukan sebagai angka.
 *
 * Sebuah harapan berbentuk `.length).toBe(13)` hanya memberi tahu bahwa
 * jumlahnya berubah; ia tidak memberi tahu permukaan mana yang lahir atau mati,
 * dan ia mengundang siapa pun yang melihatnya merah untuk sekadar menambal
 * angkanya. Daftar literal memaksa penambahan permukaan menjadi suntingan yang
 * disengaja di dua tempat sekaligus — skrip interaksinya dan daftar ini.
 */
const PERMUKAAN: string[] = [
  "overview-terputus",
  "overview-tersambung",
  "live-ballots",
  "live-ballots-kosong",
  "results-tanpa-tanda-terima",
  "docs",
  "vote-pilih",
  "vote-terpilih",
  "vote-proving",
  "vote-sukses",
  "results-dengan-tanda-terima",
  "create-ballot",
  "sidebar-mobile",
];

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

describe("paritas tampilan Home sebelum dan sesudah pemecahan", () => {
  it("menghasilkan kelas, garis besar, atribut, dan teks yang identik di setiap permukaan", async () => {
    const sebelum = await rekamPermukaan(HomePraPecah);
    const sesudah = await rekamPermukaan(Home);

    expect(Object.keys(sebelum)).toEqual(PERMUKAAN);
    expect(Object.keys(sesudah)).toEqual(PERMUKAAN);
    for (const nama of Object.keys(sebelum)) {
      expect(sesudah[nama].kelas, `himpunan kelas berbeda di permukaan "${nama}"`).toEqual(
        sebelum[nama].kelas,
      );
      expect(sesudah[nama].garisBesar, `garis besar atau atribut DOM berbeda di permukaan "${nama}"`).toEqual(
        sebelum[nama].garisBesar,
      );
      expect(sesudah[nama].teks, `teks berbeda di permukaan "${nama}"`).toEqual(sebelum[nama].teks);
    }

    // Angka inventaris dari rencana, ditulis literal supaya bukan turunan kode.
    // 146 token className statis unik, 12 template literal, dan 1 ternary.
    expect(sebelum["overview-terputus"].kelas.length).toBeGreaterThan(40);
    expect(sebelum["vote-terpilih"].kelas).toContain("selected");
    expect(sebelum["overview-terputus"].kelas).toContain("accent-mint");
    expect(sebelum["sidebar-mobile"].kelas).toContain("mobile-open");
    expect(sebelum["sidebar-mobile"].kelas).toContain("visible");
    expect(sebelum["live-ballots-kosong"].kelas).toContain("empty-state");
    expect(sebelum["results-dengan-tanda-terima"].kelas).toContain("receipt-panel");
    expect(sebelum["overview-tersambung"].kelas).toContain("connected");
  });

  it("menghasilkan panel privasi yang identik di kelima cabang", async () => {
    const atur = (s: StatusFixture) => {
      kendali.status = s;
    };
    const sebelum = await rekamPrivasi(HomePraPecah, atur);
    const sesudah = await rekamPrivasi(Home, atur);

    expect(Object.keys(sesudah)).toEqual(Object.keys(sebelum));
    for (const nama of Object.keys(sebelum)) {
      expect(sesudah[nama], `panel privasi berbeda pada fixture "${nama}"`).toEqual(sebelum[nama]);
    }
    expect(sebelum.lokal.label).toBe("Always on");
    expect(sebelum.remote.label).toBe("Proof server remote");
    expect(sebelum.menunggu.label).toBe("Checking…");
  });

  it("membekukan rekaman garis dasar hanya selama Home.tsx belum tersentuh", async () => {
    if (process.env.TULIS_GARIS_DASAR !== "1") {
      expect(true).toBe(true);
      return;
    }
    const sha = createHash("sha256").update(readFileSync(JALUR_HOME)).digest("hex");
    if (sha !== SHA_BEKU) {
      throw new Error(
        `Home.tsx sudah berubah (sha256 ${sha}). Rekaman garis dasar TIDAK boleh dibuat ` +
          `ulang setelah pemecahan dimulai — kalau ia dibuat dari kode yang sudah dipecah, ` +
          `ia berhenti menjadi nilai "sebelum" dan mulai menjadi cermin.`,
      );
    }
    const atur = (s: StatusFixture) => {
      kendali.status = s;
    };
    const rekaman: Rekaman = {
      permukaan: await rekamPermukaan(HomePraPecah),
      privasi: await rekamPrivasi(HomePraPecah, atur),
    };

    // Diperiksa SEBELUM writeFileSync, dengan sengaja. Kalau daftar permukaannya
    // tidak lagi sama, rekaman yang akan ditulis bukan rekaman yang dijanjikan
    // rencana ini — dan menuliskannya lebih dulu lalu melempar berarti meninggalkan
    // garis dasar yang salah di disk untuk dipakai seluruh task berikutnya.
    expect(Object.keys(rekaman.permukaan)).toEqual(PERMUKAAN);
    expect(Object.keys(rekaman.privasi)).toEqual([
      "menunggu",
      "remote",
      "lewat-host-halaman",
      "mati",
      "target-belum-terverifikasi",
      "lokal",
    ]);

    writeFileSync(JALUR_REKAMAN, `${JSON.stringify(rekaman, null, 2)}\n`);
  });
});

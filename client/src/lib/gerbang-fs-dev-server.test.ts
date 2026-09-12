import path from "node:path";
import { type ViteDevServer, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Gerbang server.fs.allow/deny — dev server Vite TIDAK BOLEH menyajikan
 * pohon rahasia lewat /@fs/.
 *
 * Latar: vite.config.ts sebelumnya mengisi `allow` dengan SELURUH akar repo
 * (`[path.resolve(import.meta.dirname)]`) supaya modul kontrak tergenerasi di
 * pkgs/contract dapat di-resolve dari root client/. `deny: ["**\/.*"]` yang
 * menyertainya hanya menutup jalur yang SEGMEN TERAKHIRNYA mulai dengan titik
 * (diverifikasi lewat isFileLoadingAllowed+fsDenyGlob di
 * node_modules/vite/dist/node/chunks — pola itu tidak menembus ke DALAM
 * direktori titik seperti .manus-logs/, apalagi direktori bukan-titik seperti
 * pkgs/cli/). Akibatnya siapa pun yang menjangkau dev server ini — termasuk
 * lewat tunnel publik — bisa membaca pkgs/cli/wallet-cache/ (kredensial
 * dompet), pkgs/cli/private-state/ (credential+salt+opening pemilih),
 * pkgs/cli/logs/, pkgs/cli/artefak/, dan .manus-logs/ (rekaman interaksi
 * debug collector) lewat /@fs/<jalur apa pun>.
 *
 * Perbaikannya (lihat vite.config.ts, blok server.fs): `allow` dipersempit ke
 * HANYA client/, pkgs/contract/, pkgs/shared/, shared/, attached_assets/, dan
 * node_modules/ — subpohon yang benar-benar terjangkau dari impor statis
 * client/src (diverifikasi lewat grep @pkgs/@shared, lihat
 * .superpowers/kebocoran-fs-allow.md) — ditambah `deny` eksplisit untuk
 * pkgs/cli/** dan .manus-logs/** sebagai lapis kedua yang independen dari isi
 * `allow`.
 *
 * Uji ini WAJIB dua arah, bukan cuma "sesuatu ditolak": uji yang hanya
 * memeriksa penolakan tetap hijau ketika server GAGAL MENYALA SAMA SEKALI,
 * karena fetch() ke server yang mati juga "gagal" — terlihat sama seperti
 * ditolak kalau tidak ada assertion yang memaksa resolusi POSITIF benar-benar
 * terjadi. Karena itu ada uji index.html root DAN uji modul kontrak
 * tergenerasi yang harus 200 dengan ISI yang dikenali, bukan cuma status.
 *
 * TIDAK ADA isi berkas sensitif yang pernah dibaca atau dicetak di sini —
 * hanya path (nama+ukuran sudah diverifikasi manual di luar uji ini) dan kode
 * status HTTP yang dinilai.
 */

const AKAR = path.resolve(new URL("../../..", import.meta.url).pathname);

// >= 5262 sesuai aturan proyek ini: BUKAN 5250 (dev server operator), 5180
// (dev server yang disajikan lewat tunnel publik), 5173/3000/6300 (dev
// server/proof-server bawaan lain). Port ini HANYA dipakai proses vitest ini
// sendiri dan ditutup lagi di afterAll.
const PORT = 5299;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let server: ViteDevServer;

beforeAll(async () => {
  server = await createServer({
    configFile: path.join(AKAR, "vite.config.ts"),
    logLevel: "silent",
    server: {
      port: PORT,
      strictPort: true,
      host: "127.0.0.1",
    },
    // Uji ini menilai gerbang fs.allow/fs.deny lewat request /@fs/ mentah,
    // BUKAN merender aplikasi React sungguhan — jadi pra-bundling dependency
    // (react, dst.) tidak diperlukan. Mematikan crawler otomatisnya supaya
    // server.close() di afterAll tidak menunggu proses esbuild latar
    // belakang yang tidak relevan dengan yang diuji di sini.
    optimizeDeps: { noDiscovery: true, entries: [] },
  });
  await server.listen();
}, 30_000);

afterAll(async () => {
  await server?.close();
}, 30_000);

/** GET lewat jalur mentah /@fs/<path absolut> — persis yang dipakai laporan kebocoran. */
async function ambilLewatFs(jalurAbsolut: string): Promise<Response> {
  return fetch(`${BASE_URL}/@fs${encodeURI(jalurAbsolut)}`);
}

describe("gerbang fs.allow/fs.deny dev server (server.fs di vite.config.ts)", () => {
  describe("arah POSITIF — resolusi yang WAJIB tetap jalan", () => {
    it("root client/ tersaji (bukti server benar-benar hidup, bukan cuma 'gagal = ditolak')", async () => {
      const res = await fetch(`${BASE_URL}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('id="root"');
    });

    it("modul kontrak tergenerasi @pkgs/contract/src/managed/ballot/contract/index.js bisa di-fetch (200)", async () => {
      const target = path.join(AKAR, "pkgs/contract/src/managed/ballot/contract/index.js");
      const res = await ambilLewatFs(target);
      expect(res.status).toBe(200);
      // Isi berkas ini BUKAN rahasia — ini kode kontrak tergenerasi yang sudah
      // dibundel ke produksi. Memastikan resolusi sungguhan terjadi (bukan
      // fallback SPA 200 kosong) dengan mencocokkan penanda kode yang sudah
      // dibaca terbuka di awal tugas ini.
      const body = await res.text();
      expect(body).toContain("compact-runtime");
    });

    it("modul kontrak tergenerasi @pkgs/contract/src/managed/registry/contract/index.js bisa di-fetch (200)", async () => {
      const target = path.join(AKAR, "pkgs/contract/src/managed/registry/contract/index.js");
      const res = await ambilLewatFs(target);
      expect(res.status).toBe(200);
    });

    it("@pkgs/shared/src/network-config.ts bisa di-fetch (200)", async () => {
      const target = path.join(AKAR, "pkgs/shared/src/network-config.ts");
      const res = await ambilLewatFs(target);
      expect(res.status).toBe(200);
    });

    it("shared/const.ts (alias @shared) bisa di-fetch (200)", async () => {
      const target = path.join(AKAR, "shared/const.ts");
      const res = await ambilLewatFs(target);
      expect(res.status).toBe(200);
    });
  });

  describe("arah NEGATIF — jalur rahasia WAJIB ditolak", () => {
    const jalurRahasia: Array<[nama: string, relatif: string]> = [
      ["kredensial dompet CLI (wallet-cache)", "pkgs/cli/wallet-cache/preview/90f8b8776f18666c0b87479a46599469/shielded.json"],
      ["private-state pemilih (credential/salt/opening)", "pkgs/cli/private-state/preview/pemilih-0/CURRENT"],
      ["log CLI", "pkgs/cli/logs/preview/2026-09-11T03:12:19.064Z.log"],
      ["artefak deploy CLI", "pkgs/cli/artefak/preview.json"],
      ["rekaman debug collector (.manus-logs)", ".manus-logs/browserConsole.log"],
    ];

    it.each(jalurRahasia)("%s → ditolak, TIDAK PERNAH 200 (%s)", async (_nama, relatif) => {
      const target = path.join(AKAR, relatif);
      const res = await ambilLewatFs(target);
      // Berkas-berkas ini ADA di disk (diverifikasi lewat `ls`/`find` di luar
      // uji ini, tanpa membaca isinya) — jadi hasil yang benar adalah 403
      // (ditolak fs.allow/fs.deny), bukan 404 (tidak ada berkasnya sama
      // sekali). Assertion tetap menerima keduanya sesuai tugas, tapi 200
      // TIDAK PERNAH boleh lolos.
      expect(res.status).not.toBe(200);
      expect([403, 404]).toContain(res.status);
    });

    it("kode sumber CLI (pkgs/cli/src/args.ts, bukan cuma sub-folder rahasianya) tidak lolos lewat /@fs/", async () => {
      // pkgs/cli/ SELURUHNYA di luar `allow` (bukan hanya empat sub-folder
      // yang di-deny eksplisit) — client/src tidak pernah mengimpor apa pun
      // dari pkgs/cli, jadi tidak ada alasan menyajikannya lewat dev server.
      const target = path.join(AKAR, "pkgs/cli/src/args.ts");
      const res = await ambilLewatFs(target);
      expect(res.status).not.toBe(200);
      expect([403, 404]).toContain(res.status);
    });
  });
});

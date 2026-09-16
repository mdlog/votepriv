/**
 * Uji proxy /proof-server (server/proxy.ts) terhadap hulu SUNGGUHAN (server
 * TCP/HTTP mentah di port acak), bukan mock http.request — yang diuji justru
 * perilaku socket: koneksi baru per permintaan, galat hulu jadi 502 yang
 * bisa didiagnosis, dan pemutusan browser melepaskan koneksi hulu.
 *
 * LATAR: pemilih di laptop mendapat `code=502 status="Bad Gateway"` dari
 * /proof-server/prove pada percobaan pertama, sukses pada percobaan kedua,
 * dan proof server tidak pernah restart. Proxy lama memakai http.globalAgent
 * (keep-alive 5 detik sejak Node 19) sementara proof server menutup koneksi
 * idle setelah ~4,6 detik — dan tidak mencatat apa pun saat hulu gagal, jadi
 * penyebabnya tidak bisa dibaca dari log mana pun. Uji ini memaku kedua
 * perbaikan itu.
 */
import express from "express";
import http from "http";
import net from "net";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proofServerProxy } from "../../../server/proxy.ts";

type Hulu = { port: number; koneksi: number; tutup: () => Promise<void> };

/** Hulu HTTP normal yang menghitung KONEKSI TCP (bukan permintaan). */
function huluNormal(): Promise<Hulu> {
  const hasil = { koneksi: 0 };
  const srv = http.createServer((req, res) => {
    let badan = "";
    req.on("data", (c) => (badan += c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json", "x-hulu": "ok" });
      res.end(JSON.stringify({ path: req.url, panjangBadan: badan.length }));
    });
  });
  srv.on("connection", () => hasil.koneksi++);
  return new Promise((selesai) =>
    srv.listen(0, "127.0.0.1", () =>
      selesai({
        port: (srv.address() as AddressInfo).port,
        get koneksi() {
          return hasil.koneksi;
        },
        tutup: () => new Promise((r) => srv.close(() => r())),
      }),
    ),
  );
}

/** Hulu yang MEMUTUS koneksi begitu menerima byte pertama (ECONNRESET/hang up). */
function huluMemutus(): Promise<Hulu> {
  const hasil = { koneksi: 0 };
  const srv = net.createServer((sock) => {
    hasil.koneksi++;
    sock.once("data", () => sock.destroy());
  });
  return new Promise((selesai) =>
    srv.listen(0, "127.0.0.1", () =>
      selesai({
        port: (srv.address() as AddressInfo).port,
        get koneksi() {
          return hasil.koneksi;
        },
        tutup: () => new Promise((r) => srv.close(() => r())),
      }),
    ),
  );
}

async function appDenganProxy(targetHulu: string): Promise<{ url: string; tutup: () => Promise<void> }> {
  const app = express();
  app.use("/proof-server", proofServerProxy(targetHulu));
  const srv = http.createServer(app);
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  return {
    url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`,
    tutup: () => new Promise((r) => srv.close(() => r())),
  };
}

const pembersih: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (pembersih.length) await pembersih.pop()!();
  vi.restoreAllMocks();
});

describe("proxy /proof-server (server/proxy.ts)", () => {
  it("meneruskan permintaan dan jawaban hulu apa adanya (status, header, badan)", async () => {
    const hulu = await huluNormal();
    const app = await appDenganProxy(`http://127.0.0.1:${hulu.port}`);
    pembersih.push(app.tutup, hulu.tutup);

    const badan = "x".repeat(200_000);
    const res = await fetch(`${app.url}/proof-server/prove`, { method: "POST", body: badan });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-hulu")).toBe("ok");
    expect(await res.json()).toEqual({ path: "/prove", panjangBadan: badan.length });
  });

  it("membuka koneksi hulu BARU untuk setiap permintaan — tidak ada socket keep-alive yang dipakai ulang", async () => {
    const hulu = await huluNormal();
    const app = await appDenganProxy(`http://127.0.0.1:${hulu.port}`);
    pembersih.push(app.tutup, hulu.tutup);

    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${app.url}/proof-server/version`);
      expect(res.status).toBe(200);
      await res.text();
    }
    // Dengan http.globalAgent (keep-alive), keempat permintaan berbagi SATU
    // koneksi dan angka ini 1 — persis kondisi yang membuat /prove bisa jatuh
    // di socket yang baru ditutup proof server.
    expect(hulu.koneksi).toBe(4);
  });

  it("hulu memutus koneksi -> 502 berbahasa Inggris, kode galat di reason phrase dan badan, dan DICATAT ke log", async () => {
    const hulu = await huluMemutus();
    const app = await appDenganProxy(`http://127.0.0.1:${hulu.port}`);
    pembersih.push(app.tutup, hulu.tutup);
    const catat = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await fetch(`${app.url}/proof-server/prove`, { method: "POST", body: "witness" });
    expect(res.status).toBe(502);
    // midnight-js menampilkan statusText sebagai `status=` pada pesan galatnya.
    expect(res.statusText).toMatch(/^Bad Gateway \((ECONNRESET|EPIPE|ECONNREFUSED)\)$/);
    const teks = await res.text();
    expect(teks).toMatch(/^The proof server at http:\/\/127\.0\.0\.1:\d+ could not be reached: (ECONNRESET|EPIPE|ECONNREFUSED) /);
    expect(teks).not.toMatch(/tidak|dihubungi/);

    expect(catat).toHaveBeenCalledTimes(1);
    expect(String(catat.mock.calls[0][0])).toMatch(/^\[proof-server proxy\] POST \/prove: upstream http:\/\/127\.0\.0\.1:\d+ failed: (ECONNRESET|EPIPE|ECONNREFUSED) /);
  });

  it("hulu tidak ada sama sekali (ECONNREFUSED) -> 502 dengan kode yang sama di reason phrase", async () => {
    // Port yang baru saja dilepas: tidak ada yang mendengarkan.
    const sementara = await huluNormal();
    const port = sementara.port;
    await sementara.tutup();
    const app = await appDenganProxy(`http://127.0.0.1:${port}`);
    pembersih.push(app.tutup);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await fetch(`${app.url}/proof-server/version`);
    expect(res.status).toBe(502);
    expect(res.statusText).toBe("Bad Gateway (ECONNREFUSED)");
    await res.text();
  });

  it("browser memutus sebelum jawaban -> koneksi hulu dilepaskan (tidak ada permintaan yatim)", async () => {
    // Hulu yang TIDAK PERNAH menjawab, tapi mencatat saat kliennya pergi.
    let huluDitutupOlehKlien = false;
    const lambat = net.createServer((sock) => {
      sock.on("close", () => (huluDitutupOlehKlien = true));
      sock.on("data", () => {}); // terima badan, jangan jawab
    });
    await new Promise<void>((r) => lambat.listen(0, "127.0.0.1", () => r()));
    const port = (lambat.address() as AddressInfo).port;
    const app = await appDenganProxy(`http://127.0.0.1:${port}`);
    pembersih.push(app.tutup, () => new Promise((r) => lambat.close(() => r())));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const pengendali = new AbortController();
    const janji = fetch(`${app.url}/proof-server/prove`, { method: "POST", body: "witness", signal: pengendali.signal }).catch((e) => e);
    await new Promise((r) => setTimeout(r, 150));
    pengendali.abort();
    await janji;
    await vi.waitFor(() => expect(huluDitutupOlehKlien).toBe(true), { timeout: 2000 });
  });
});

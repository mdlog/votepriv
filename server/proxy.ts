import type express from "express";
import http from "http";
import https from "https";

/**
 * Proxy same-origin ke proof server.
 *
 * `server.proxy` di vite.config.ts adalah opsi DEV SERVER — ia tidak berlaku
 * sama sekali pada `pnpm build && pnpm start`. Tanpa rute ini, permintaan
 * /proof-server/version jatuh ke fallback SPA dan dijawab dengan index.html
 * berstatus HTTP 200, sehingga klien menyimpulkan proof server "terjangkau"
 * pada deployment yang tidak punya proof server sama sekali.
 *
 * Browser tidak boleh memanggil proof server secara langsung: service worker
 * Lace memotong seluruh fetch tingkat halaman, dan Chrome memblokir permintaan
 * ke 127.0.0.1 dari konteks itu.
 *
 * Badannya di-pipe, tidak di-buffer: permintaan proving membawa witness
 * berukuran besar, dan menampungnya di memori hanya menambah satu salinan
 * witness tanpa alasan.
 *
 * SATU KONEKSI BARU PER PERMINTAAN (keepAlive: false), bukan agen global Node.
 * Sejak Node 19 `http.globalAgent` memakai keep-alive dengan socket bebas
 * ditahan 5 detik, sedangkan proof server (actix) menutup koneksi idle
 * setelah ~4,6 detik (diukur pada image 8.1.0). Permintaan /prove yang jatuh
 * di celah itu ditulis ke socket yang baru saja ditutup pihak sana dan gagal
 * sebagai ECONNRESET/"socket hang up" — yang oleh handler galat di bawah
 * dijawab 502, padahal proof server sehat. Koneksi baru per permintaan
 * menghapus kelas kegagalan itu; biayanya satu handshake TCP lokal per
 * permintaan, tak berarti dibanding pembuatan proof yang memakan puluhan detik.
 *
 * Galat hulu DICATAT ke log server (kode + pesan) dan kodenya disisipkan ke
 * reason phrase 502 — midnight-js menampilkan `status=` dari statusText,
 * jadi pemilih melihat "Bad Gateway (ECONNRESET)" alih-alih "Bad Gateway"
 * yang tidak bisa didiagnosis siapa pun.
 */
export function proofServerProxy(proofServerTarget: string): express.RequestHandler {
  const agenHttp = new http.Agent({ keepAlive: false });
  const agenHttps = new https.Agent({ keepAlive: false });

  return (req, res) => {
    let target: URL;
    try {
      target = new URL(proofServerTarget);
    } catch {
      res
        .status(500)
        .type("text/plain")
        .send(`VITE_PROOF_SERVER_URL is not a valid URL: ${proofServerTarget}`);
      return;
    }

    const aman = target.protocol === "https:";
    const transport = aman ? https : http;
    const awalan = target.pathname.replace(/\/$/, "");
    // Header hop-by-hop milik koneksi browser↔app, bukan app↔proof server.
    const { connection: _c, "keep-alive": _k, "proxy-connection": _p, ...headerDiteruskan } = req.headers;

    const hulu = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (aman ? 443 : 80),
        method: req.method,
        // req.url sudah tidak memuat awalan mount /proof-server.
        path: awalan + (req.url || "/"),
        // Padanan changeOrigin: true pada proxy dev server Vite.
        headers: { ...headerDiteruskan, host: target.host },
        agent: aman ? agenHttps : agenHttp,
      },
      (jawab) => {
        res.writeHead(jawab.statusCode ?? 502, jawab.headers);
        jawab.pipe(res);
      },
    );

    hulu.on("error", (error: NodeJS.ErrnoException) => {
      const kode = error.code ?? error.name;
      console.error(`[proof-server proxy] ${req.method} ${req.url}: upstream ${proofServerTarget} failed: ${kode} ${error.message}`);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.statusMessage = `Bad Gateway (${kode})`;
      res
        .status(502)
        .type("text/plain")
        .send(`The proof server at ${proofServerTarget} could not be reached: ${kode} ${error.message}`);
    });

    // Browser pergi sebelum jawaban selesai: lepaskan koneksi hulu supaya
    // tidak ada permintaan yatim yang menggantung di proof server.
    res.on("close", () => {
      if (!res.writableFinished) hulu.destroy();
    });

    req.pipe(hulu);
  };
}

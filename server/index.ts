import express from "express";
import http, { createServer } from "http";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Target proof server untuk build produksi.
 *
 * Variabelnya sengaja SAMA dengan yang dibaca bundle browser
 * (`import.meta.env.VITE_PROOF_SERVER_URL`), supaya indikator privasi di UI
 * menyebut host yang benar-benar dihubungi proxy ini. Bila keduanya berbeda,
 * UI akan menamai host yang salah — persis jenis kekeliruan yang membuat
 * indikator itu tidak layak dipercaya.
 */
const proofServerTarget = process.env.VITE_PROOF_SERVER_URL || "http://127.0.0.1:6300";

/**
 * Proxy same-origin ke proof server.
 *
 * `server.proxy` di vite.config.ts adalah opsi DEV SERVER — ia tidak berlaku
 * sama sekali pada `pnpm build && pnpm start`. Tanpa rute ini, permintaan
 * /proof-server/version jatuh ke fallback SPA di bawah dan dijawab dengan
 * index.html berstatus HTTP 200, sehingga klien menyimpulkan proof server
 * "terjangkau" pada deployment yang tidak punya proof server sama sekali.
 *
 * Browser tidak boleh memanggil proof server secara langsung: service worker
 * Lace memotong seluruh fetch tingkat halaman, dan Chrome memblokir permintaan
 * ke 127.0.0.1 dari konteks itu.
 *
 * Badannya di-pipe, tidak di-buffer: permintaan proving membawa witness
 * berukuran besar, dan menampungnya di memori hanya menambah satu salinan
 * witness tanpa alasan.
 */
function proofServerProxy(): express.RequestHandler {
  return (req, res) => {
    let target: URL;
    try {
      target = new URL(proofServerTarget);
    } catch {
      res
        .status(500)
        .type("text/plain")
        .send(`VITE_PROOF_SERVER_URL bukan URL yang sah: ${proofServerTarget}`);
      return;
    }

    const agen = target.protocol === "https:" ? https : http;
    const awalan = target.pathname.replace(/\/$/, "");
    const hulu = agen.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        method: req.method,
        // req.url sudah tidak memuat awalan mount /proof-server.
        path: awalan + (req.url || "/"),
        // Padanan changeOrigin: true pada proxy dev server Vite.
        headers: { ...req.headers, host: target.host },
      },
      (jawab) => {
        res.writeHead(jawab.statusCode ?? 502, jawab.headers);
        jawab.pipe(res);
      },
    );

    hulu.on("error", (error: Error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res
        .status(502)
        .type("text/plain")
        .send(`Proof server tidak dapat dihubungi di ${proofServerTarget}: ${error.message}`);
    });

    req.pipe(hulu);
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // WAJIB sebelum express.static dan fallback SPA di bawah: fallback `app.get("*")`
  // akan menjawab /proof-server/... dengan index.html bila diberi kesempatan.
  app.use("/proof-server", proofServerProxy());

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Dicetak supaya deployment yang salah konfigurasi terlihat di log, bukan
    // baru ketahuan saat suara pertama gagal dibuat proof-nya.
    console.log(`Proxy /proof-server → ${proofServerTarget}`);
  });
}

startServer().catch(console.error);

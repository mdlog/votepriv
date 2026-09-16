import express from "express";
import { createServer } from "http";
import { proofServerProxy } from "./proxy.ts";
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
const inboxTarget = (process.env.VOTEPRIV_INBOX_URL || "").trim();

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
  app.use("/proof-server", proofServerProxy(proofServerTarget));

  // Inbox pendaftaran penyelenggara (pkgs/cli/src/register-inbox.ts) —
  // HANYA pada deployment yang menjalankannya (env VOTEPRIV_INBOX_URL, mis.
  // http://127.0.0.1:5390). Paket pemilih Docker TIDAK menyetelnya: app di
  // sana tidak pernah menjadi inbox, dan browser pemilih memanggil URL inbox
  // yang tertulis di kebijakan ballot (on-chain) secara langsung. Proxy yang
  // sama dengan proof server: badan di-pipe, galat hulu dicatat dan diberi kode.
  if (inboxTarget) {
    app.use("/register", proofServerProxy(inboxTarget));
  } else {
    app.use("/register", (_req, res) => {
      res.status(404).json({ error: "This deployment does not run a registration inbox." });
    });
  }

  // Laporan konfigurasi runtime — lihat komentar panjang di client/src/lib/proof-server.ts.
  //
  // Bundel browser memanggang VITE_PROOF_SERVER_URL SAAT BUILD, sedangkan proxy di
  // atas membacanya SAAT START. Keduanya bisa berbeda, dan ketika berbeda, indikator
  // privasi menamai host yang salah. Rute ini membuat proses yang benar-benar
  // memegang proxy menjadi satu-satunya otoritas atas pertanyaan "ke mana witness
  // pergi", sehingga UI tidak perlu mempercayai nilai yang dipanggang.
  //
  // no-store: nilainya berubah setiap kali server di-start ulang dengan env berbeda,
  // dan jawaban basi di sini berarti kalimat privasi yang basi pula.
  app.get("/__votepriv/runtime-config.json", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ proofServerTarget });
  });

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
    console.log(inboxTarget ? `Proxy /register → ${inboxTarget}` : "No registration inbox on this deployment (/register answers 404)");
  });
}

startServer().catch(console.error);

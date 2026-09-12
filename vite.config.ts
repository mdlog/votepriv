import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import wasm from "vite-plugin-wasm";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

// Berkas skrip collector TIDAK boleh tinggal di client/public/: Vite menyalin
// SELURUH isi publicDir apa adanya ke dist/public/, jadi apa pun di sana ikut
// ke paket produksi walau tidak pernah disuntik oleh transformIndexHtml di
// bawah. Disimpan di luar client/ sepenuhnya (tools/manus/) dan disajikan
// lewat middleware dev di bawah, hanya saat plugin ini aktif.
const DEBUG_COLLECTOR_SCRIPT_PATH = path.join(PROJECT_ROOT, "tools", "manus", "debug-collector.js");

/**
 * Vite plugin to collect browser debug logs
 * - GET /__manus__/debug-collector.js: serves the collector script itself
 *   (from tools/manus/, not client/public/ — see comment on the constant above)
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // GET /__manus__/debug-collector.js: sajikan skrip dari tools/manus/.
      // Middleware ini hanya terpasang saat plugin ini disertakan di array
      // `plugins`, yaitu hanya ketika modePengembangan && collectorDiminta
      // (lihat definisi `plugins` di bawah) — jadi tanpa
      // VOTEPRIV_DEBUG_COLLECTOR=1, jalur ini tidak pernah terdaftar sama
      // sekali dan tetap 404.
      server.middlewares.use("/__manus__/debug-collector.js", (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          return next();
        }
        fs.readFile(DEBUG_COLLECTOR_SCRIPT_PATH, (err, data) => {
          if (err) {
            return next();
          }
          res.writeHead(200, {
            "Content-Type": "application/javascript; charset=utf-8",
            "Content-Length": data.length,
            "Cache-Control": "no-store",
          });
          res.end(req.method === "HEAD" ? undefined : data);
        });
      });

      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * Saat VOTEPRIV_DEBUG_COLLECTOR TIDAK diset, vitePluginManusDebugCollector() di
 * atas tidak disertakan sama sekali — jadi tidak ada middleware yang menangani
 * /__manus__/debug-collector.js. Tanpa plugin ini, permintaan itu jatuh ke
 * fallback SPA bawaan Vite (yang menyajikan index.html dengan status 200 untuk
 * jalur apa pun yang tidak dikenal), bukan 404 — sebelum berkasnya dipindah
 * keluar dari client/public/, jalur ini memang selalu 200 (menyajikan berkas
 * statis apa adanya) sehingga celah itu tidak pernah terlihat.
 *
 * Plugin kecil ini murni menegaskan "tidak ada" itu: ia hanya aktif ketika
 * collector TIDAK diminta, dan hanya men-404-kan satu jalur ini. Ia tidak
 * menyentuh perilaku vitePluginManusDebugCollector() di atas sama sekali.
 */
function vitePluginManusDebugCollectorNotFound(): Plugin {
  return {
    name: "manus-debug-collector-not-found",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/__manus__/debug-collector.js", (_req, res) => {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      });
    },
  };
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL("v1/storage/presign/get", forgeBaseUrl + "/");
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

/**
 * Menyajikan /__votepriv/runtime-config.json di DEV SERVER.
 *
 * Padanannya di produksi ada di server/index.ts. Keduanya ada supaya klien punya
 * SATU jalur kode untuk mengetahui target proof server, dan jalur itu ikut
 * terpakai setiap hari saat pengembangan — bukan hanya di produksi, tempat cacat
 * baru ketahuan setelah dipakai orang.
 *
 * Di dev, nilai ini memang sama dengan yang dipanggang ke bundel karena keduanya
 * berasal dari proses yang sama. Itu bukan alasan melewatkannya: yang diuji di
 * sini adalah jalur kodenya, bukan nilainya.
 */
function vitePluginRuntimeConfig(proofServerTarget: string): Plugin {
  return {
    name: "votepriv-runtime-config",
    configureServer(server) {
      server.middlewares.use("/__votepriv/runtime-config.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ proofServerTarget }));
      });
    },
  };
}

/**
 * Task 2 (C-2b) — KEPUTUSAN SADAR soal bagaimana ~15 MB artefak ZK ballot
 * (castVote.prover 9.990.205 B, tallyVote.prover 5.223.586 B, plus
 * .verifier/.bzkir masing-masing — diukur sendiri lewat `stat`, lihat
 * task-2-report.md) sampai ke browser, DI DEV maupun DI PRODUKSI, TANPA
 * menyentuh server/index.ts.
 *
 * DUA opsi dipertimbangkan:
 *
 * 1. Salin ke client/public/zk/ballot/ (opsi yang DITOLAK). client/public/
 *    disalin Vite APA ADANYA ke dist/public/ — persis alasan yang membuat
 *    e2fb2d0 mengeluarkan debug-collector.js dari sana ("Berkas skrip
 *    collector TIDAK boleh tinggal di client/public/: Vite menyalin SELURUH
 *    isi publicDir apa adanya ke dist/public/, jadi apa pun di sana ikut ke
 *    paket produksi", lihat komentar DEBUG_COLLECTOR_SCRIPT_PATH di atas).
 *    Menaruh binary 15+ MB di client/public/ berarti MENGGANDAKANNYA secara
 *    PERMANEN di git di samping salinan yang sudah ada di
 *    pkgs/contract/src/managed/ballot — dua salinan yang bisa diam-diam
 *    berbeda (versi basi) adalah PERSIS kelas cacat yang bagian "Dan satu hal
 *    yang menentukan kebenaran" di brief task ini memperingatkan: prover key
 *    yang salah/basi baru ketahuan jauh kemudian sebagai proof yang ditolak.
 *
 * 2. Middleware baru di server/index.ts yang menyajikan LANGSUNG dari
 *    pkgs/contract/src/managed/ballot tanpa menyalin (opsi draf awal task
 *    brief, Step 5). DITOLAK di sini: instruksi tugas ini melarang menyentuh
 *    server/ sama sekali, dan mewajibkan berhenti+lapor bila produksi
 *    menuntutnya — bukan mengerjakannya diam-diam.
 *
 * OPSI YANG DIPILIH: dev dan produksi ditangani BERBEDA, keduanya tanpa
 * menyentuh server/ maupun client/public/:
 *
 * - DEV (`vitePluginZkArtifacts`, `apply: "serve"`): middleware dev server
 *   menyajikan LANGSUNG dari pkgs/contract/src/managed/ballot — tidak ada
 *   penyalinan sama sekali, artefak selalu segar mengikuti pohon kerja.
 *
 * - PRODUKSI (`vitePluginZkArtifactsBuild`, `apply: "build"`): hook
 *   `writeBundle` (jalan SETELAH Rollup selesai menulis dist/public/, sama
 *   seperti pola vite-plugin-static-copy) menyalin
 *   pkgs/contract/src/managed/ballot/{keys,zkir} ke
 *   dist/public/zk/ballot/{keys,zkir}. dist/ ada di .gitignore (baris 7),
 *   jadi salinan ini TIDAK PERNAH masuk git — ia lahir ulang setiap build
 *   dari SATU sumber kebenaran (pkgs/contract/src/managed/ballot), tidak
 *   pernah bisa basi ketinggalan sumbernya. Karena berkasnya berakhir di
 *   DALAM staticPath (dist/public) yang SUDAH disajikan
 *   `app.use(express.static(staticPath))` yang sudah ada di server/index.ts
 *   (baris 114, TIDAK diubah), produksi bekerja tanpa satu baris pun berubah
 *   di server/.
 *
 * Layout URL (`/zk/ballot/keys/*`, `/zk/ballot/zkir/*`) SENGAJA sama persis
 * di dev dan produksi — meniru tata letak disk NodeZkConfigProvider — supaya
 * FetchZkConfigProvider (client/src/lib/chain/zk-config-fetch.ts) memakai
 * SATU baseUrl yang sama di kedua lingkungan.
 */
function vitePluginZkArtifacts(): Plugin {
  const dirBallotManaged = path.resolve(import.meta.dirname, "pkgs", "contract", "src", "managed", "ballot");
  return {
    name: "votepriv-zk-artifacts",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/zk/ballot/keys", express.static(path.join(dirBallotManaged, "keys")));
      server.middlewares.use("/zk/ballot/zkir", express.static(path.join(dirBallotManaged, "zkir")));
    },
  };
}

// Task 9 (C-2b) — KEPUTUSAN SADAR #2 soal berkas MANA yang disalin, dibawa
// dari catatan jujur Task 2 (task-2-report.md): salinan sebelumnya menyalin
// SELURUH direktori keys/ dan zkir/ apa adanya lewat fs.cpSync recursive,
// termasuk registerVoters.prover (9.973.749 B — 40% dari total 25 MB
// dist/public/zk) dan finalize.prover (22.970 B) yang TIDAK PERNAH dipakai
// browser: lingkup jalur tulis C-2b hanya castVote+tallyVote (Keputusan #1
// rencana C-2b) — registerVoters/finalize tetap lewat CLI (pkgs/cli),
// yang membaca LANGSUNG dari pkgs/contract/src/managed/ballot, tidak pernah
// dari dist/public/zk sama sekali.
//
// TIDAK bisa disederhanakan jadi "salin hanya castVote+tallyVote" untuk
// KETIGA subfolder: findDeployedContract (midnight-js-contracts 4.0.4,
// dist/index.mjs:1725, dipanggil kirimSuara/bukaSuara di tulis.ts) memanggil
// zkConfigProvider.getVerifierKeys(getProvableCircuitIds()) — VERIFIER KEY
// SELURUH sirkuit yang dideklarasikan kontrak (keempatnya: castVote,
// tallyVote, finalize, registerVoters), untuk mencocokkan verifier key lokal
// terhadap verifierKey on-chain (verifyContractState, dist/index.mjs:1690).
// Bila salah satu verifier key hilang, findDeployedContract — dan karena itu
// SELURUH castVote/tallyVote — gagal dengan ContractTypeError, sebelum satu
// baris pun jalur tulis sungguhan berjalan. Verifier key kecil (2.119 B per
// sirkuit, ~8,5 KB untuk keempatnya) sehingga menyalin semuanya di sini AMAN
// dan tahan terhadap sirkuit baru di masa depan (dibaca dari isi direktori,
// bukan daftar nama sirkuit yang di-hardcode).
//
// PROVER KEY dan ZKIR (.bzkir) sebaliknya HANYA dibutuhkan untuk sirkuit yang
// BENAR-BENAR dipanggil (createUnprovenCallTxFromInitialStates memanggil
// zkConfigProvider dengan `options.circuitId` TUNGGAL, dist/index.mjs:917-925)
// — karena browser hanya pernah memanggil ballot.callTx.castVote()/tallyVote()
// (tulis.ts:207,345), prover key + zkir registerVoters/finalize TIDAK PERNAH
// diminta oleh kode ini. Berkas .zkir polos (non-.bzkir) tidak disalin sama
// sekali, sirkuit apa pun: zk-config-fetch.ts::getZKIR() hanya pernah meminta
// `${circuitId}.bzkir` (ZKIR_EXT), tidak ada satu titik kode pun yang meminta
// ekstensi .zkir dari dist/public/zk.
const SIRKUIT_TULIS_ZK = ["castVote", "tallyVote"] as const;

/** Separuh produksi dari keputusan di atas — lihat komentar `vitePluginZkArtifacts`. */
function vitePluginZkArtifactsBuild(): Plugin {
  const dirBallotManaged = path.resolve(import.meta.dirname, "pkgs", "contract", "src", "managed", "ballot");
  const outDirPublic = path.resolve(import.meta.dirname, "dist", "public");
  return {
    name: "votepriv-zk-artifacts-build",
    apply: "build",
    writeBundle() {
      const tujuanKeys = path.join(outDirPublic, "zk", "ballot", "keys");
      const tujuanZkir = path.join(outDirPublic, "zk", "ballot", "zkir");
      fs.mkdirSync(tujuanKeys, { recursive: true });
      fs.mkdirSync(tujuanZkir, { recursive: true });

      // Verifier key: SEMUA sirkuit yang benar-benar ada di sumber, apa pun
      // namanya — lihat blok komentar di atas untuk alasan findDeployedContract
      // butuh keempatnya, bukan hanya castVote/tallyVote.
      for (const berkas of fs.readdirSync(path.join(dirBallotManaged, "keys"))) {
        if (berkas.endsWith(".verifier")) {
          fs.copyFileSync(path.join(dirBallotManaged, "keys", berkas), path.join(tujuanKeys, berkas));
        }
      }

      // Prover key + zkir: HANYA sirkuit jalur tulis (castVote, tallyVote).
      // registerVoters.prover (9.973.749 B) dan finalize.prover sengaja TIDAK
      // ikut — lihat blok komentar di atas.
      for (const sirkuit of SIRKUIT_TULIS_ZK) {
        fs.copyFileSync(
          path.join(dirBallotManaged, "keys", `${sirkuit}.prover`),
          path.join(tujuanKeys, `${sirkuit}.prover`),
        );
        fs.copyFileSync(
          path.join(dirBallotManaged, "zkir", `${sirkuit}.bzkir`),
          path.join(tujuanZkir, `${sirkuit}.bzkir`),
        );
      }
    },
  };
}

/**
 * Perkakas scaffolding Manus: HANYA untuk pengembangan, dan debug collector
 * hanya bila diminta eksplisit.
 *
 * Ini bukan kerapian, ini kebocoran yang terukur. Dua hal yang diverifikasi di
 * repo ini:
 *
 * 1. `vitePluginManusRuntime()` menyisipkan skrip INLINE 366.824 byte ke dalam
 *    build PRODUKSI (`<script id="manus-runtime">` di dist/public/index.html,
 *    total berkas 367.838 byte — jadi 99,7% halaman yang dikirim ke pemilih
 *    adalah skrip itu). Ia tidak terlihat di client/index.html karena
 *    disisipkan dengan enforce:"post". Akibatnya tiga-tiganya nyata: skrip
 *    inline MUSTAHIL ditutupi Subresource Integrity; setiap skema verifikasi
 *    kode web yang benar-benar ada menolak halaman yang mengizinkan
 *    'unsafe-inline'; dan ia membawa postMessage ber-origin lebar ke dalam
 *    halaman pemungutan suara.
 *
 * 2. `vitePluginManusDebugCollector()` merekam interaksi ke .manus-logs/ —
 *    diperiksa isinya: 291 kemunculan field "text" (teks elemen yang diklik),
 *    76 "value" (isi input), dan 2 "body" (badan permintaan jaringan). Selama
 *    dev server dipakai MENYAJIKAN halaman ke orang lain (mis. lewat tunnel),
 *    itu berarti penyelenggara menerima rekaman apa yang diklik pemilih —
 *    jalur kebocoran yang sama sekali tidak berkaitan dengan proof server, dan
 *    yang membatalkan klaim "tidak ada infrastruktur penyelenggara yang
 *    menyentuh pilihan Anda".
 *
 * Karena itu: runtime dan storage proxy hanya di dev, dan collector harus
 * dinyalakan sengaja lewat VOTEPRIV_DEBUG_COLLECTOR=1. Nilai bawaannya mati.
 */
const modePengembangan = process.env.NODE_ENV !== "production";
const collectorDiminta = process.env.VOTEPRIV_DEBUG_COLLECTOR === "1";

const plugins = [
  wasm(),
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  ...(modePengembangan
    ? [vitePluginManusRuntime(), vitePluginStorageProxy()]
    : []),
  ...(modePengembangan && collectorDiminta ? [vitePluginManusDebugCollector()] : []),
  ...(modePengembangan && !collectorDiminta ? [vitePluginManusDebugCollectorNotFound()] : []),
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname), "");

  // Proof server menerima witness — yaitu credential dan pilihan suara. Karena itu
  // default-nya lokal, dan mengarahkannya ke remote harus merupakan tindakan sadar:
  // operator server itu akan dapat melihat setiap suara.
  const proofServerTarget = env.VITE_PROOF_SERVER_URL || "http://127.0.0.1:6300";

  // Vite menolak host yang tidak dikenal sebagai perlindungan DNS-rebinding, jadi
  // setiap tunnel atau domain kustom harus disebutkan. Awalan titik mencakup seluruh
  // subdomain. Daftar tambahan lewat env supaya tunnel berikutnya tidak menuntut
  // perubahan kode.
  const extraHosts = (env.VITE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  return {
  plugins: [
    ...plugins,
    vitePluginRuntimeConfig(proofServerTarget),
    vitePluginZkArtifacts(),
    vitePluginZkArtifactsBuild(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      // Satu-satunya jalan klien ke ledger() kontrak dan ke endpoint jaringan
      // tanpa memindahkan client/ ke pkgs/app (lihat "Penyimpangan sadar dari
      // spec §14.7" di rencana C-2a). Menunjuk src/, BUKAN dist/: dist ada di
      // .gitignore dan membangunnya berarti menyentuh pkgs/.
      "@pkgs": path.resolve(import.meta.dirname, "pkgs"),
    },
    // Sabuk kedua terhadap instance GANDA onchain-runtime-v3. Dua instance
    // memberi pesan MENYESATKAN ("expected instance of ChargedState") padahal
    // datanya benar, dan risikonya hidup di repo ini karena compact-runtime
    // 0.15.0 (pkgs/cli lewat compact-js) dan 0.16.0 (pkgs/contract) dua-duanya
    // ada di pohon pnpm. Gerbang mekaniknya ada di rencana C-2a Task 2 Step 2.
    //
    // HANYA compact-runtime yang didaftar di sini, BUKAN onchain-runtime-v3
    // juga (menyimpang dari draf awal rencana C-2a Task 2 Step 4). Diverifikasi
    // di Step 10: mendaftarkan onchain-runtime-v3 di sini membuat `vite build`
    // gagal dengan "Rollup failed to resolve import
    // '@midnight-ntwrk/onchain-runtime-v3'" — karena paket itu TIDAK di-hoist
    // ke node_modules akar workspace di pohon pnpm repo ini (ia hanya ada
    // sebagai symlink nested di dalam node_modules milik compact-runtime;
    // lihat Task 2 Step 2), sementara dedupe Vite memaksa resolusi paket yang
    // didaftar SELALU dicari mulai dari akar. Mendedupe compact-runtime saja
    // sudah cukup: compact-runtime dedupe ke satu instance, dan onchain-runtime-v3
    // hanya terjangkau LEWAT compact-runtime (tidak pernah langsung dari akar
    // atau dari pkgs/contract — diverifikasi di Step 2), sehingga instance
    // onchain-runtime-v3 ikut tunggal secara transitif tanpa perlu didedupe
    // eksplisit.
    dedupe: ["@midnight-ntwrk/compact-runtime"],
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Task 9: gerbang batas bundel butuh ATRIBUSI PER-CHUNK yang sebenarnya,
    // bukan penjumlahan tekstual atas seluruh dist/public/assets — lihat
    // scripts/ukur-batas-bundel.mjs. manifest.json memetakan setiap modul
    // entri/chunk-dinamis ke berkas keluarannya dan aset yang ia picu.
    manifest: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      ".mdloglabs.org",
      "localhost",
      "127.0.0.1",
      ...extraHosts,
    ],
    fs: {
      strict: true,
      // root Vite adalah client/. Modul kontrak tergenerasi dan network-config
      // berada di pkgs/, di luar root, sehingga akar repo harus diizinkan
      // eksplisit. deny tetap menutup seluruh berkas titik.
      allow: [path.resolve(import.meta.dirname)],
      deny: ["**/.*"],
    },
    proxy: {
      // Browser tidak boleh memanggil proof server secara langsung: service worker
      // Lace memotong seluruh fetch tingkat halaman, dan Chrome memblokir permintaan
      // ke 127.0.0.1 dari konteks itu. Jalur same-origin diteruskan Node di sisi
      // server, sehingga pola yang sama berlaku untuk target lokal maupun remote.
      "/proof-server": {
        target: proofServerTarget,
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/proof-server/, ""),
      },
    },
  },
  };
});

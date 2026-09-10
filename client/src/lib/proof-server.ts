/**
 * Konfigurasi proof server.
 *
 * Proof server menerima witness — untuk VotePriv itu berarti credential pemilih dan
 * pilihan suaranya — karena dialah yang membangun ZK proof. Server remote yang
 * dioperasikan pihak lain karenanya DAPAT MELIHAT SETIAP SUARA, dan klaim privasi
 * aplikasi ini tidak lagi berlaku terhadap operator tersebut.
 *
 * Karena itu default-nya lokal, dan beralih ke remote harus terlihat oleh pengguna,
 * bukan tersembunyi di berkas konfigurasi.
 *
 * SATU HAL YANG MUDAH KELIRU, dan pernah keliru di sini: "target proxy bersifat
 * lokal" TIDAK sama dengan "witness tidak meninggalkan perangkat pengguna".
 * VITE_PROOF_SERVER_URL diselesaikan oleh proses Node yang menjalankan dev
 * server, bukan oleh browser. `http://127.0.0.1:6300` karenanya berarti loopback
 * MESIN DEV. Bila halaman ini dibuka lewat tunnel (mis. https://x.mdloglabs.org),
 * witness menempuh browser → internet → tunnel → mesin dev → :6300 miliknya, dan
 * setiap suara terlihat oleh siapa pun yang mengoperasikan mesin itu. Klaim
 * "tidak pernah meninggalkan perangkat ini" hanya benar bila ASAL HALAMAN juga
 * lokal — itulah sebabnya proofServerReach() memeriksa keduanya.
 */

/** Browser selalu memanggil jalur same-origin ini; hanya target proxy yang berbeda. */
export const PROOF_SERVER_PATH = "/proof-server";

/** Target yang diteruskan proxy. Diatur lewat VITE_PROOF_SERVER_URL di .env */
export const proofServerTarget: string =
  (import.meta.env.VITE_PROOF_SERVER_URL as string | undefined) || "http://127.0.0.1:6300";

const HOST_LOKAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** Benar bila hostname menunjuk mesin yang sedang menjalankan browser ini. */
export function isLocalHostname(hostname: string): boolean {
  return HOST_LOKAL.has(hostname) || hostname.endsWith(".localhost");
}

/**
 * Benar bila target proxy berada di mesin lain.
 *
 * Perhatikan batasnya: ini hanya berbicara tentang TARGET. Untuk pertanyaan
 * "apakah witness meninggalkan perangkat pengguna", pakai proofServerReach().
 */
export function isRemoteProofServer(target: string = proofServerTarget): boolean {
  try {
    return !isLocalHostname(new URL(target).hostname);
  } catch {
    // Target tidak terbaca — perlakukan sebagai remote. Salah menebak ke arah
    // "aman" di sini berarti menampilkan peringatan yang tidak perlu; menebak ke
    // arah sebaliknya berarti diam saat suara benar-benar bocor.
    return true;
  }
}

/** Benar bila halaman ini sendiri disajikan dari mesin pengguna. */
export function isLocalPageOrigin(): boolean {
  if (typeof location === "undefined") return false;
  return isLocalHostname(location.hostname);
}

/**
 * Ke mana witness sebenarnya pergi.
 *
 * - `lokal` — halaman dan target sama-sama di perangkat ini. HANYA pada keadaan
 *   ini klaim "witness tidak pernah meninggalkan perangkat ini" benar.
 * - `lewat-host-halaman` — target lokal, tapi halaman disajikan dari mesin lain
 *   (tunnel, LAN, deployment). Witness menyeberang jaringan menuju loopback
 *   MESIN ITU.
 * - `remote` — target proof server berada di mesin lain.
 */
export type ProofServerReach = "lokal" | "lewat-host-halaman" | "remote";

export function proofServerReach(target: string = proofServerTarget): ProofServerReach {
  // Target remote diperiksa lebih dulu: itu pernyataan yang lebih kuat, dan
  // berlaku ke mana pun halaman ini disajikan.
  if (isRemoteProofServer(target)) return "remote";
  if (!isLocalPageOrigin()) return "lewat-host-halaman";
  return "lokal";
}

/** Rangkaian hop yang benar-benar dilalui witness, untuk ditampilkan apa adanya. */
export function proofServerHop(target: string = proofServerTarget): string {
  if (proofServerReach(target) === "lewat-host-halaman") {
    const halaman = typeof location === "undefined" ? "host halaman ini" : location.host;
    return `browser → ${halaman} → ${target} (loopback mesin itu, bukan perangkat Anda)`;
  }
  return `browser → ${target}`;
}

export type ProofServerStatus =
  | { reachable: true; version: string; reach: ProofServerReach; hop: string }
  | { reachable: false; error: string; reach: ProofServerReach; hop: string };

/**
 * Proof server menjawab /version dengan string versi. Bila yang kembali justru
 * HTML, yang menjawab adalah fallback SPA — bukan proof server. Ini persis yang
 * terjadi pada build produksi sebelum rute /proof-server ditambahkan ke
 * server/index.ts: `server.proxy` adalah opsi DEV SERVER Vite, sehingga
 * `pnpm start` menjawab /proof-server/version dengan index.html dan HTTP 200.
 * `res.ok` bernilai true, dan tanpa pemeriksaan ini indikator akan melaporkan
 * proof server "terjangkau" pada deployment yang tidak punya proof server sama
 * sekali.
 */
function balasanHtml(contentType: string | null, body: string): boolean {
  return (
    (contentType ?? "").toLowerCase().includes("text/html") ||
    /^\s*<(!doctype html|html)\b/i.test(body)
  );
}

/** Menanyakan /version lewat proxy. Dipakai UI untuk menunjukkan kesiapan sebelum memilih. */
export async function checkProofServer(): Promise<ProofServerStatus> {
  const jalur = { reach: proofServerReach(), hop: proofServerHop() };
  try {
    const res = await fetch(`${PROOF_SERVER_PATH}/version`);
    if (!res.ok) {
      return { reachable: false, error: `HTTP ${res.status}`, ...jalur };
    }
    const body = (await res.text()).trim();
    if (balasanHtml(res.headers.get("content-type"), body)) {
      return {
        reachable: false,
        error: "/version menjawab HTML, bukan versi — proxy /proof-server tidak terpasang",
        ...jalur,
      };
    }
    if (body === "") {
      return { reachable: false, error: "/version menjawab kosong", ...jalur };
    }
    return { reachable: true, version: body, ...jalur };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : "tidak dapat dihubungi",
      ...jalur,
    };
  }
}

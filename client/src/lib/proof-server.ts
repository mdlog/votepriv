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
 * Target proxy diselesaikan oleh proses Node, bukan oleh browser.
 * `http://127.0.0.1:6300` karenanya berarti loopback MESIN ITU. Bila halaman ini
 * dibuka lewat tunnel (mis. https://x.mdloglabs.org), witness menempuh browser →
 * internet → tunnel → mesin itu → :6300 miliknya, dan setiap suara terlihat oleh
 * siapa pun yang mengoperasikannya. Klaim "tidak pernah meninggalkan perangkat ini"
 * hanya benar bila ASAL HALAMAN juga lokal — itulah sebabnya proofServerReach()
 * memeriksa keduanya.
 *
 * HAL KEDUA YANG PERNAH KELIRU: dari mana target itu diketahui. `import.meta.env`
 * DIPANGGANG KE DALAM BUNDEL SAAT BUILD, sedangkan proxy yang benar-benar
 * meneruskan witness membaca lingkungannya SAAT START. `pnpm build` tanpa .env lalu
 * `VITE_PROOF_SERVER_URL=https://proof.pihak-lain.example pnpm start` menghasilkan
 * bundel yang menyebut 127.0.0.1:6300 sementara witness benar-benar dikirim ke
 * pihak ketiga — indikator akan berkata "witness tidak pernah meninggalkan
 * perangkat ini" tepat ketika pernyataan itu paling salah.
 *
 * Karena itu nilai build BUKAN otoritas. Otoritasnya adalah proses yang memegang
 * proxy, dan ia melaporkan targetnya lewat RUNTIME_CONFIG_PATH. Bila laporan itu
 * tidak dapat dibaca, target tetap dipakai sebagai perkiraan tetapi ditandai
 * `terverifikasi: false`, dan UI tidak boleh membuat klaim kuat di atasnya.
 */

/** Browser selalu memanggil jalur same-origin ini; hanya target proxy yang berbeda. */
export const PROOF_SERVER_PATH = "/proof-server";

/**
 * Jalur tempat proses yang memegang proxy melaporkan target sebenarnya.
 *
 * Disajikan oleh server produksi (server/index.ts) DAN oleh dev server
 * (vite.config.ts), supaya jalur kode ini sama di kedua lingkungan dan tidak
 * membusuk karena hanya dipakai di produksi.
 */
export const RUNTIME_CONFIG_PATH = "/__votepriv/runtime-config.json";

/**
 * Nilai yang dipanggang ke dalam bundel saat build. HANYA cadangan.
 *
 * Jangan pakai nilai ini untuk menyusun kalimat yang menjanjikan sesuatu kepada
 * pengguna. Pakai `target` dari ProofServerStatus, yang menyertakan apakah nilai
 * itu berhasil dikonfirmasi ke server.
 */
export const TARGET_BAWAAN: string =
  (import.meta.env.VITE_PROOF_SERVER_URL as string | undefined) || "http://127.0.0.1:6300";

const HOST_LOKAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** Benar bila hostname menunjuk mesin yang sedang menjalankan browser ini. */
export function isLocalHostname(hostname: string): boolean {
  return HOST_LOKAL.has(hostname) || hostname.endsWith(".localhost");
}

/**
 * Asal halaman, dipisahkan dari `location` global supaya dapat diuji.
 *
 * `hostname` tanpa port dipakai untuk memutuskan lokal/tidak; `host` dengan port
 * dipakai saat menampilkan rangkaian hop apa adanya kepada pengguna.
 */
export type AsalHalaman = { hostname: string; host: string };

export function asalHalamanSaatIni(): AsalHalaman | null {
  if (typeof location === "undefined") return null;
  return { hostname: location.hostname, host: location.host };
}

/**
 * Benar bila target proxy berada di mesin lain.
 *
 * Perhatikan batasnya: ini hanya berbicara tentang TARGET. Untuk pertanyaan
 * "apakah witness meninggalkan perangkat pengguna", pakai proofServerReach().
 */
export function isRemoteProofServer(target: string): boolean {
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
export function isLocalPageOrigin(asal: AsalHalaman | null = asalHalamanSaatIni()): boolean {
  if (asal === null) return false;
  return isLocalHostname(asal.hostname);
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

/**
 * `target` wajib dioper, tidak punya nilai bawaan.
 *
 * Ini disengaja. Nilai bawaan yang membaca TARGET_BAWAAN akan membuat pemanggil
 * yang lupa mengoper target runtime tetap mendapat jawaban yang kelihatan masuk
 * akal — jawaban yang dihitung dari nilai build yang mungkin sudah usang. Bentuk
 * kegagalan itu diam. Parameter wajib membuatnya jadi galat kompilasi.
 */
export function proofServerReach(
  target: string,
  asal: AsalHalaman | null = asalHalamanSaatIni(),
): ProofServerReach {
  // Target remote diperiksa lebih dulu: itu pernyataan yang lebih kuat, dan
  // berlaku ke mana pun halaman ini disajikan.
  if (isRemoteProofServer(target)) return "remote";
  if (!isLocalPageOrigin(asal)) return "lewat-host-halaman";
  return "lokal";
}

/** Rangkaian hop yang benar-benar dilalui witness, untuk ditampilkan apa adanya. */
export function proofServerHop(
  target: string,
  asal: AsalHalaman | null = asalHalamanSaatIni(),
): string {
  if (proofServerReach(target, asal) === "lewat-host-halaman") {
    const halaman = asal === null ? "this page's host" : asal.host;
    return `browser → ${halaman} → ${target} (that machine's loopback, not your device)`;
  }
  return `browser → ${target}`;
}

/**
 * Proof server menjawab /version dengan string versi. Bila yang kembali justru
 * HTML, yang menjawab adalah fallback SPA — bukan proof server. Ini persis yang
 * terjadi pada build produksi sebelum rute /proof-server ditambahkan ke
 * server/index.ts: `server.proxy` adalah opsi DEV SERVER Vite, sehingga
 * `pnpm start` menjawab /proof-server/version dengan index.html dan HTTP 200.
 * `res.ok` bernilai true, dan tanpa pemeriksaan ini indikator akan melaporkan
 * proof server "terjangkau" pada deployment yang tidak punya proof server sama
 * sekali. Alasan yang sama berlaku untuk RUNTIME_CONFIG_PATH.
 */
function balasanHtml(contentType: string | null, body: string): boolean {
  return (
    (contentType ?? "").toLowerCase().includes("text/html") ||
    /^\s*<(!doctype html|html)\b/i.test(body)
  );
}

export type TargetRuntime = {
  target: string;
  /** Benar hanya bila server yang menyajikan halaman ini yang menyebutkan target. */
  terverifikasi: boolean;
};

/**
 * Menanyakan kepada server ke mana ia benar-benar meneruskan /proof-server.
 *
 * Setiap kegagalan — jaringan, status non-200, fallback SPA, JSON rusak, field
 * hilang — jatuh ke nilai build dengan terverifikasi: false. Tidak ada kegagalan
 * yang boleh menghasilkan terverifikasi: true.
 */
export async function muatTargetRuntime(ambil: typeof fetch = fetch): Promise<TargetRuntime> {
  const cadangan: TargetRuntime = { target: TARGET_BAWAAN, terverifikasi: false };
  try {
    const res = await ambil(RUNTIME_CONFIG_PATH, { cache: "no-store" });
    if (!res.ok) return cadangan;
    const teks = (await res.text()).trim();
    if (balasanHtml(res.headers.get("content-type"), teks)) return cadangan;
    const data = JSON.parse(teks) as { proofServerTarget?: unknown };
    if (typeof data.proofServerTarget !== "string" || data.proofServerTarget.trim() === "") {
      return cadangan;
    }
    return { target: data.proofServerTarget, terverifikasi: true };
  } catch {
    return cadangan;
  }
}

export type JalurWitness = {
  /** Target yang dipakai menyusun seluruh kalimat di UI. */
  target: string;
  /** Bila false, UI tidak boleh menjanjikan apa pun di atas `target`. */
  targetTerverifikasi: boolean;
  reach: ProofServerReach;
  hop: string;
};

export type ProofServerStatus =
  | ({ reachable: true; version: string } & JalurWitness)
  | ({ reachable: false; error: string } & JalurWitness);

/**
 * Menanyakan /version lewat proxy. Dipakai UI untuk menunjukkan kesiapan sebelum memilih.
 *
 * Target runtime diselesaikan LEBIH DULU, dan seluruh jalur witness ikut dalam
 * nilai balik. UI karenanya tidak perlu — dan tidak boleh — membaca nilai build
 * sendiri; semua yang ia butuhkan ada di objek ini.
 */
export async function checkProofServer(ambil: typeof fetch = fetch): Promise<ProofServerStatus> {
  const { target, terverifikasi } = await muatTargetRuntime(ambil);
  const jalur: JalurWitness = {
    target,
    targetTerverifikasi: terverifikasi,
    reach: proofServerReach(target),
    hop: proofServerHop(target),
  };
  try {
    const res = await ambil(`${PROOF_SERVER_PATH}/version`);
    if (!res.ok) {
      return { reachable: false, error: `HTTP ${res.status}`, ...jalur };
    }
    const body = (await res.text()).trim();
    if (balasanHtml(res.headers.get("content-type"), body)) {
      return {
        reachable: false,
        error: "/version answered with HTML, not a version — the /proof-server proxy is not set up",
        ...jalur,
      };
    }
    if (body === "") {
      return { reachable: false, error: "/version answered empty", ...jalur };
    }
    return { reachable: true, version: body, ...jalur };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : "could not be reached",
      ...jalur,
    };
  }
}

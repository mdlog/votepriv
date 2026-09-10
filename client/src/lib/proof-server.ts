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
 */

/** Browser selalu memanggil jalur same-origin ini; hanya target proxy yang berbeda. */
export const PROOF_SERVER_PATH = "/proof-server";

/** Target yang diteruskan proxy. Diatur lewat VITE_PROOF_SERVER_URL di .env */
export const proofServerTarget: string =
  (import.meta.env.VITE_PROOF_SERVER_URL as string | undefined) || "http://127.0.0.1:6300";

const HOST_LOKAL = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** Benar bila proof server berjalan di mesin lain, sehingga suara meninggalkan perangkat ini. */
export function isRemoteProofServer(target: string = proofServerTarget): boolean {
  try {
    return !HOST_LOKAL.has(new URL(target).hostname);
  } catch {
    // Target tidak terbaca — perlakukan sebagai remote. Salah menebak ke arah
    // "aman" di sini berarti menampilkan peringatan yang tidak perlu; menebak ke
    // arah sebaliknya berarti diam saat suara benar-benar bocor.
    return true;
  }
}

export type ProofServerStatus =
  | { reachable: true; version: string; remote: boolean }
  | { reachable: false; error: string; remote: boolean };

/** Menanyakan /version lewat proxy. Dipakai UI untuk menunjukkan kesiapan sebelum memilih. */
export async function checkProofServer(): Promise<ProofServerStatus> {
  const remote = isRemoteProofServer();
  try {
    const res = await fetch(`${PROOF_SERVER_PATH}/version`);
    if (!res.ok) {
      return { reachable: false, error: `HTTP ${res.status}`, remote };
    }
    return { reachable: true, version: (await res.text()).trim(), remote };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : "tidak dapat dihubungi",
      remote,
    };
  }
}

// Keputusan "daftarkan pemilih saat deploy, atau tidak" untuk deploy-ballot.ts
// — diekstrak jadi fungsi murni/bertipe supaya bisa diuji tanpa jaringan dan
// tanpa wallet (deploy-ballot.ts sendiri adalah skrip tingkat-atas yang
// menjalankan efek samping saat diimpor, lihat komentar kepala berkas itu).
//
// LATAR: pola pendaftaran BARU (lihat .superpowers/register-leaves-cli.md)
// membiarkan pemilih membuat credential-nya sendiri dan hanya mengirim leaf
// (lewat `pnpm cli register-leaves`, task terpisah). `deploy-ballot.ts` tetap
// punya jalur LAMA (membuat tiga credential uji sendiri) sebagai bawaan —
// e2e dan pengujian yang ada bergantung padanya — tapi menerima
// VOTEPRIV_TANPA_PENDAFTARAN=1 untuk men-deploy ballot TANPA menyentuh
// credential sama sekali.
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { Logger } from "pino";
import { daftarkanVoter, type OpsiRetriDaftarkanVoter } from "./deploy.ts";
import type { BallotC } from "./kontrak.ts";

/** `VOTEPRIV_TANPA_PENDAFTARAN=1` — satu-satunya nilai yang mengaktifkan mode ini (persis "1", bukan "true"/"yes"/dst, konsisten dengan VOTEPRIV_DEPLOY_ULANG). */
export function modeTanpaPendaftaranAktif(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOTEPRIV_TANPA_PENDAFTARAN === "1";
}

/**
 * `eligibleCount` efektif untuk deploy-ballot.ts: dari `VOTEPRIV_ELIGIBLE_COUNT`
 * bila diberikan (dan berupa bilangan bulat), kalau tidak bawaan 3 (perilaku
 * LAMA, tidak berubah). Batas kontrak 1..1024 SENGAJA TIDAK diperiksa ulang
 * di sini — itu sudah ditegakkan `validasiMetadata` (deploy.ts) dengan pesan
 * yang sudah diuji; mengulanginya di sini hanya membuka peluang dua pesan
 * berbeda untuk pelanggaran yang sama.
 */
export function eligibleCountDariEnv(env: NodeJS.ProcessEnv = process.env, bawaan = 3): number {
  const mentah = env.VOTEPRIV_ELIGIBLE_COUNT;
  if (mentah === undefined || mentah.trim() === "") return bawaan;
  const n = Number(mentah);
  if (!Number.isInteger(n)) {
    throw new Error(
      `VOTEPRIV_ELIGIBLE_COUNT harus bilangan bulat; diberikan "${mentah}". Batas kontrak: 1..1024 (diperiksa validasiMetadata saat deploy).`,
    );
  }
  return n;
}

export interface HasilPersiapanPemilihAwal {
  /** `undefined` bila `tanpaPendaftaran` — TIDAK ADA credential yang dibuat sama sekali. */
  readonly credentials?: readonly Uint8Array[];
  /** Kosong bila `tanpaPendaftaran`. */
  readonly daun: readonly Uint8Array[];
}

/**
 * Menyiapkan credential+daun awal — atau TIDAK SAMA SEKALI bila
 * `tanpaPendaftaran`. `buatCredentialFn`/`daunEligibilityFn` disuntikkan
 * (bawaan produksi: `buatCredential`/`daunEligibility` dari paket shared)
 * murni supaya uji unit bisa memeriksa BERAPA KALI keduanya dipanggil tanpa
 * bergantung pada CSPRNG maupun circuit kontrak sungguhan.
 */
export function siapkanPemilihAwal(
  tanpaPendaftaran: boolean,
  jumlahEligible: number,
  buatCredentialFn: () => Uint8Array,
  daunEligibilityFn: (credential: Uint8Array) => Uint8Array,
): HasilPersiapanPemilihAwal {
  if (tanpaPendaftaran) return { daun: [] };
  const credentials = Array.from({ length: jumlahEligible }, () => buatCredentialFn());
  return { credentials, daun: credentials.map(daunEligibilityFn) };
}

/**
 * Bentuk field `credentials` untuk artefak — objek KOSONG (bukan
 * `{ credentials: undefined }`) ketika argumennya `undefined`, sehingga
 * `"credentials" in artefak` bernilai `false`, bukan sekadar `undefined`
 * (yang JSON.stringify pun sebenarnya sudah menghilangkan — tapi field ini
 * dibuat eksplisit SUPAYA tidak ada jalur yang tidak sengaja membaca
 * `artefak.credentials` sebagai array kosong atau semacamnya pada ballot
 * yang di-deploy lewat VOTEPRIV_TANPA_PENDAFTARAN=1).
 *
 * Dipakai lewat SPREAD (`...bentukFieldCredentials(...)`) tepat di titik
 * `tulisArtefak` pada deploy-ballot.ts, supaya bentuk objek literal
 * `{ ballot: alamatBallot, ... }` di sana tetap utuh untuk penjaga
 * pengkabelan yang sudah ada (jadwal-artefak-wiring.test.ts).
 */
export function bentukFieldCredentials(
  credentials: readonly Uint8Array[] | undefined,
): { credentials?: string[] } {
  if (credentials === undefined) return {};
  return { credentials: credentials.map((c) => Buffer.from(c).toString("hex")) };
}

/**
 * Mendaftarkan pemilih awal — atau TIDAK SAMA SEKALI bila `tanpaPendaftaran`.
 * `daftarkanVoterFn` disuntikkan (bawaan: `daftarkanVoter` sungguhan) supaya
 * uji unit bisa memeriksa "TIDAK dipanggil" tanpa `FoundContract<BallotC>`
 * maupun jaringan sungguhan.
 */
export async function daftarkanVoterJikaPerlu(
  tanpaPendaftaran: boolean,
  ballot: FoundContract<BallotC>,
  daun: readonly Uint8Array[],
  log: Logger,
  opsi: OpsiRetriDaftarkanVoter,
  daftarkanVoterFn: typeof daftarkanVoter = daftarkanVoter,
): Promise<void> {
  if (tanpaPendaftaran) {
    log.info(
      "VOTEPRIV_TANPA_PENDAFTARAN=1 — melewati pendaftaran leaf saat deploy. " +
        "Pemilih membuat credential sendiri dan mengirim leaf-nya lewat `pnpm cli register-leaves`.",
    );
    return;
  }
  await daftarkanVoterFn(ballot, daun, log, opsi);
}

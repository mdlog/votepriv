import fs from "node:fs";
import path from "node:path";
import { currentDir } from "./config.ts";

export const DIR_ARTEFAK = path.resolve(currentDir, "..", "artefak");

/**
 * Alamat kontrak Midnight: 64 karakter heksadesimal huruf kecil, TANPA awalan
 * "0x". midnight-js memvalidasinya dengan assertIsContractAddress
 * (CONTRACT_ADDRESS_BYTE_LENGTH = 32) yang MELEMPAR TypeError bila ada awalan
 * "0x". Apa pun yang kita simpan harus mempertahankan bentuk itu persis —
 * jangan pernah mengubah huruf besar/kecilnya, memberi awalan, atau
 * meng-encode bech32.
 */
export function pastikanAlamatKontrak(s: string): string {
  if (!/^[0-9a-f]{64}$/.test(s)) {
    throw new Error(
      `A contract address must be 64 lowercase hexadecimal characters without the "0x" prefix; got length ${s.length}.`,
    );
  }
  return s;
}

/**
 * Bentuk ballot: satu deploy ballot beserta deadline, opsi, dan credential
 * pemilihnya. Sama untuk `deploy-ballot.ts` (top-level, lihat `ArtefakDeploy`)
 * maupun `e2e.ts` (di bawah kunci `e2e`, lihat catatan di `ArtefakDeploy.e2e`).
 */
export interface ArtefakBallot {
  ballot?: string;
  voteDeadline?: string;
  tallyDeadline?: string;
  options?: string[];
  /**
   * Credential pemilih dalam hex. INI BAHAN UJI, bukan pola produksi: pada
   * pemakaian sungguhan credential diserahkan ke masing-masing pemilih di luar
   * jalur ini dan tidak pernah berkumpul di satu berkas. Direktori artefak
   * masuk .gitignore.
   */
  credentials?: string[];
}

/** Deadline disimpan sebagai string: JSON tidak punya bigint. */
export interface ArtefakDeploy extends ArtefakBallot {
  networkId: string;
  /**
   * Alamat registry. DIMILIKI BERSAMA oleh `deploy-registry.ts` dan
   * `e2e.ts` (yang memakai ulang registry dari sesi sebelumnya bila sudah
   * ada) — keduanya menunjuk SATU registry sungguhan yang sama di chain,
   * jadi menulis field ini dari kedua tempat itu bukan tabrakan, melainkan
   * dua penulis yang mencatat fakta yang sama.
   */
  registry?: string;
  /**
   * Ballot milik `pnpm cli e2e`, TERPISAH TOTAL dari field ballot/
   * voteDeadline/tallyDeadline/options/credentials di atas (yang dimiliki
   * SOLELY oleh `deploy-ballot.ts`).
   *
   * Sebelum field ini ada, `e2e.ts` menulis kelima field itu langsung ke
   * top-level lewat `tulisArtefak` yang MERGE, bukan timpa — tapi merge per
   * FIELD berarti field yang sama (mis. `ballot`) tetap saling menimpa.
   * Menjalankan `pnpm cli e2e` setelah `pnpm cli deploy-ballot` diam-diam
   * menghancurkan ballot yang sudah dibayar dan didaftarkan tiga pemilih
   * oleh deploy-ballot: alamat dan credential-nya tertimpa alamat/credential
   * ballot e2e, dan satu-satunya salinan credential lama (yang HANYA hidup
   * di berkas ini) hilang selamanya — ballot lama jadi tidak bisa dipakai
   * lagi oleh siapa pun. Namespace ini menutup celah itu: e2e menulis di
   * sini, deploy-ballot menulis di top-level, dan tidak satu pun boleh
   * membaca field milik yang lain.
   */
  e2e?: ArtefakBallot;
  diperbarui?: string;
}

export const jalurArtefak = (networkId: string, dir: string = DIR_ARTEFAK): string =>
  path.join(dir, `${networkId}.json`);

export function bacaArtefak(networkId: string, dir: string = DIR_ARTEFAK): ArtefakDeploy | null {
  const p = jalurArtefak(networkId, dir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as ArtefakDeploy;
}

/**
 * Field yang DIMILIKI SATU ballot (lihat komentar `ArtefakDeploy.e2e` di
 * atas, yang sudah menyebutnya). Begitu `ballot` berganti, keempat field ini
 * TIDAK BOLEH ikut bertahan dari ballot lama — kalau tidak, credential/
 * deadline/opsi milik ballot LAMA menempel ke ballot BARU yang belum tentu
 * (atau belum pernah, mis. VOTEPRIV_TANPA_PENDAFTARAN=1) punya field itu
 * sama sekali. `ballot` sendiri sengaja TIDAK masuk daftar ini: field itu
 * diganti begitu saja oleh `tambahan.ballot` lewat spread di `tulisArtefak`,
 * tidak perlu "dibuang" dulu dari yang lama.
 */
type FieldMilikBallot = "credentials" | "voteDeadline" | "tallyDeadline" | "options";

/** Buang field milik-ballot (`FieldMilikBallot`) dari sebuah artefak; sisakan field yang memang boleh bertahan lintas-ganti-ballot (`networkId`, `ballot`, `registry`, `e2e`, `diperbarui`). */
function tanpaFieldMilikBallot(a: ArtefakDeploy): Omit<ArtefakDeploy, FieldMilikBallot> {
  const { credentials, voteDeadline, tallyDeadline, options, ...sisanya } = a;
  return sisanya;
}

/**
 * Merge, bukan timpa: deploy ballot tidak boleh menghapus alamat registry.
 * Itu sebabnya `registry` dan namespace `e2e` selalu bertahan lintas
 * pemanggilan — persis alasan merge ini ada.
 *
 * TAPI field milik-ballot (`FieldMilikBallot`) BUKAN bagian dari alasan itu.
 * Begitu `tambahan.ballot` ada dan BEDA dari `ballot` yang sudah tersimpan
 * (artinya: ballot baru saja berganti/redeploy), field-field itu dibuang
 * dulu dari artefak lama sebelum di-merge — supaya ballot baru yang tidak
 * menyebutkannya (mis. tidak pernah membuat credential) tidak diam-diam
 * mewarisi credential/deadline/opsi milik ballot lama. Ballot yang SAMA,
 * atau pemanggilan yang sama sekali tidak menyebut `ballot` (mis.
 * deploy-registry.ts, atau tulisArtefak di bawah kunci `e2e`), tetap
 * memakai merge polos seperti biasa.
 */
export function tulisArtefak(
  networkId: string,
  tambahan: Partial<ArtefakDeploy>,
  dir: string = DIR_ARTEFAK,
): ArtefakDeploy {
  fs.mkdirSync(dir, { recursive: true });
  const lama = bacaArtefak(networkId, dir) ?? { networkId };
  const ballotBerganti = tambahan.ballot !== undefined && tambahan.ballot !== lama.ballot;
  const dasar = ballotBerganti ? tanpaFieldMilikBallot(lama) : lama;
  const baru: ArtefakDeploy = { ...dasar, ...tambahan, networkId, diperbarui: new Date().toISOString() };
  fs.writeFileSync(jalurArtefak(networkId, dir), `${JSON.stringify(baru, null, 2)}\n`, "utf8");
  return baru;
}

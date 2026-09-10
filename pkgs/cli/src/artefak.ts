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
      `Alamat kontrak harus 64 karakter heksadesimal huruf kecil tanpa awalan "0x"; yang diberikan panjang ${s.length}.`,
    );
  }
  return s;
}

/** Deadline disimpan sebagai string: JSON tidak punya bigint. */
export interface ArtefakDeploy {
  networkId: string;
  registry?: string;
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
  diperbarui?: string;
}

export const jalurArtefak = (networkId: string, dir: string = DIR_ARTEFAK): string =>
  path.join(dir, `${networkId}.json`);

export function bacaArtefak(networkId: string, dir: string = DIR_ARTEFAK): ArtefakDeploy | null {
  const p = jalurArtefak(networkId, dir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as ArtefakDeploy;
}

/** Merge, bukan timpa: deploy ballot tidak boleh menghapus alamat registry. */
export function tulisArtefak(
  networkId: string,
  tambahan: Partial<ArtefakDeploy>,
  dir: string = DIR_ARTEFAK,
): ArtefakDeploy {
  fs.mkdirSync(dir, { recursive: true });
  const lama = bacaArtefak(networkId, dir) ?? { networkId };
  const baru: ArtefakDeploy = { ...lama, ...tambahan, networkId, diperbarui: new Date().toISOString() };
  fs.writeFileSync(jalurArtefak(networkId, dir), `${JSON.stringify(baru, null, 2)}\n`, "utf8");
  return baru;
}

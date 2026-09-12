/**
 * Pembacaan eligibility/commitment path untuk jalur tulis, DENGAN retry.
 *
 * Keputusan #4 (mengikat): path dibangun dari root TERBARU, bukan root saat
 * pendaftaran — castVote MENGUNGKAP root eligibility ke transkrip publik
 * (pkgs/contract/src/ballot.compact:257-258), dan registerVoters menerima
 * maksimum 8 daun per transaksi (ballot.compact:205) sedangkan eligibleCount
 * bisa sampai 1024; root lama memetakan tiap suara ke batch <=8 pendaftar,
 * menjatuhkan anonimitas dari eligibleCount ke 8. Setiap percobaan di bawah
 * membaca ledger ULANG — "root terbaru" adalah bawaan struktural, bukan
 * parameter yang bisa lupa disetel.
 *
 * PERINGATAN yang sengaja ditulis di sini: pkgs/cli/src/vote.ts:66-69 punya
 * komentar "eligibility sebaliknya Historic, jadi path eligibility aman
 * dibangun sejak pemilih terdaftar." Itu benar soal kontrak MENERIMA root
 * lama (HistoricMerkleTree), tapi salah soal anonimitasnya — persis alasan
 * paragraf di atas. Berkas ini TIDAK menyalin pola itu: bacaLedgerBallotTulis
 * dipanggil ulang di SETIAP percobaan retry, bukan sekali di awal lalu
 * di-cache.
 *
 * commitments BUKAN HistoricMerkleTree — path commitment (dipakai Task 7)
 * HARUS fresh tepat sebelum tallyVote, tidak boleh disimpan lama.
 */
import type { MerkleTreePath } from "@midnight-ntwrk/compact-runtime";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import { ledger as ledgerBallot } from "@pkgs/contract/src/managed/ballot/contract/index.js";

export type LedgerBallotTulis = ReturnType<typeof ledgerBallot>;

export class GalatEligibility extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GalatEligibility";
  }
}

export async function bacaLedgerBallotTulis(
  publicDataProvider: Pick<PublicDataProvider, "queryContractState">,
  alamat: string,
): Promise<LedgerBallotTulis> {
  const st = await publicDataProvider.queryContractState(alamat);
  if (st === null) {
    throw new GalatEligibility(`Ballot ${alamat} belum terlihat di indexer.`);
  }
  return ledgerBallot(st.data);
}

export interface OpsiRetryPath {
  tunda?: (ms: number) => Promise<void>;
  percobaan?: number;
  jedaMs?: number;
}

const tundaBawaan = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry di sini menutupi PERLOMBAAN antara pembacaan dan pengiriman, bukan
 * jaringan yang buruk — karenanya dua kelas kegagalan dibedakan secara
 * eksplisit di pesan galat akhir (lihat `galatTerakhir` di bawah), pola yang
 * sama seperti pkgs/cli/src/e2e.ts:466-469: bila SETIAP pembacaan melempar
 * (pembacaan indexer itu sendiri gagal, mis. jaringan/indexer mati), pesannya
 * bilang begitu; bila SELURUH pembacaan berhasil tapi daun/commitment-nya
 * saja tak kunjung tampak (kalah balapan dengan pendaftaran/suara baru),
 * pesannya bilang itu, bukan "jaringan gagal".
 */
async function ambilPathDenganRetry(
  publicDataProvider: Pick<PublicDataProvider, "queryContractState">,
  alamat: string,
  ambilPath: (lb: LedgerBallotTulis) => MerkleTreePath<Uint8Array> | undefined,
  namaUntukGalat: string,
  opsi: OpsiRetryPath,
): Promise<MerkleTreePath<Uint8Array>> {
  const { tunda = tundaBawaan, percobaan = 6, jedaMs = 5_000 } = opsi;
  let galatTerakhir: unknown;
  for (let i = 0; i < percobaan; i++) {
    try {
      const lb = await bacaLedgerBallotTulis(publicDataProvider, alamat);
      const jalur = ambilPath(lb);
      if (jalur !== undefined) return jalur;
      galatTerakhir = undefined; // pembacaan ini BERHASIL; jangan bawa galat pembacaan lama ke pesan akhir
    } catch (e) {
      galatTerakhir = e;
    }
    if (i < percobaan - 1) await tunda(jedaMs);
  }
  throw new GalatEligibility(
    `${namaUntukGalat} tidak ditemukan setelah ${percobaan} percobaan.` +
      (galatTerakhir
        ? ` Pembacaan indexer itu sendiri gagal: ${String(galatTerakhir)}. Ini soal konektivitas/indexer, bukan (belum tentu) data yang hilang.`
        : " Seluruh pembacaan indexer BERHASIL, daun/commitment-nya saja belum tampak — kemungkinan besar kalah balapan dengan pendaftaran/suara baru yang menggeser root; bukan kegagalan jaringan."),
  );
}

export function ambilJalurEligibility(
  publicDataProvider: Pick<PublicDataProvider, "queryContractState">,
  alamat: string,
  daun: Uint8Array,
  opsi: OpsiRetryPath = {},
): Promise<MerkleTreePath<Uint8Array>> {
  return ambilPathDenganRetry(
    publicDataProvider,
    alamat,
    (lb) => lb.eligibility.findPathForLeaf(daun),
    "Eligibility path",
    opsi,
  );
}

export function ambilJalurCommitment(
  publicDataProvider: Pick<PublicDataProvider, "queryContractState">,
  alamat: string,
  commitment: Uint8Array,
  opsi: OpsiRetryPath = {},
): Promise<MerkleTreePath<Uint8Array>> {
  return ambilPathDenganRetry(
    publicDataProvider,
    alamat,
    (lb) => lb.commitments.findPathForLeaf(commitment),
    "Commitment path",
    opsi,
  );
}

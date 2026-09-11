/**
 * Tipe domain VotePriv, dipakai bersama oleh shell dan ketujuh komponen di
 * direktori ini. Dipindah apa adanya dari Home.tsx oleh Rencana C-1; tidak ada
 * field yang ditambah, dihapus, maupun diubah tipenya.
 */

export type Section = "Overview" | "Live ballots" | "Results" | "Docs";
export type BallotStatus = "live" | "closing-soon" | "finalized";

export type Ballot = {
  id: string;
  title: string;
  description: string;
  community: string;
  votes: number;
  eligible: number;
  quorum: number;
  deadline: string;
  status: BallotStatus;
  options: string[];
  accent: string;
  tag: string;
};

/**
 * Tanda terima suara.
 *
 * `"simulated"` / `"not-consumed"` / `txRef: null` adalah keadaan MockAdapter —
 * alur UI tanpa kontrak. `"verified"` / `"consumed"` dengan txRef berupa id
 * transaksi sungguhan baru mungkin setelah MidnightAdapter terpasang (spec §8).
 * Keduanya sengaja dibedakan di TIPE, bukan hanya di teks, supaya layar sukses
 * tidak bisa lagi menampilkan tanda terima yang tidak pernah ada.
 */
export type Receipt = {
  ballotId: string;
  proofStatus: "verified" | "simulated";
  nullifierStatus: "consumed" | "not-consumed";
  txRef: string | null;
};

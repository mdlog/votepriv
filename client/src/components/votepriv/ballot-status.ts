import type { BallotStatus } from "./types";

/**
 * Label status ballot untuk mata manusia.
 *
 * Dipakai TIGA komponen — VoteModal, BallotCard, dan Results — dan itulah
 * alasan ia jadi modul tersendiri: kalau ia tinggal di salah satu dari ketiganya,
 * dua yang lain harus mengimpor komponen hanya untuk mendapat satu string.
 *
 * Teksnya Inggris karena ia teks UI. Jangan diterjemahkan.
 */
export function statusLabel(status: BallotStatus) {
  if (status === "closing-soon") return "Closing soon";
  if (status === "finalized") return "Finalized";
  return "Live now";
}

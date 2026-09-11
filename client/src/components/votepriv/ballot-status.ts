import type { BallotStatus, KeadaanHasil } from "./types";

/**
 * Status, label, tone, dan tag ballot.
 *
 * Dipakai lima komponen — VoteModal, BallotCard, LiveBallots, Results, dan
 * Overview — dan itulah alasan ia jadi modul tersendiri. Berkas ini TIDAK
 * mengimpor apa pun selain tipe, sehingga lapis rantai boleh mengimpornya tanpa
 * membuat siklus.
 *
 * Teks yang dikembalikan statusLabel() dan statusTag() adalah TEKS UI berbahasa
 * Inggris. Jangan diterjemahkan.
 */

/**
 * Batas ATAS ambang "Closing soon". Bukan ambangnya sendiri.
 *
 * Ambang sesungguhnya diturunkan per ballot oleh ambangTutupSegeraMs(); nilai
 * ini hanya menahannya agar tidak menjadi berbulan-bulan pada ballot bertempo
 * panjang.
 */
export const BATAS_ATAS_TUTUP_SEGERA_MS = 24 * 60 * 60 * 1000;

/**
 * Seberapa dekat ke voteDeadline sebelum sebuah ballot disebut "Closing soon",
 * DITURUNKAN dari ballot itu sendiri.
 *
 * MENGAPA BUKAN KONSTANTA. Ambang tetap 24 jam membuat anggota `live` praktis
 * mustahil tercapai pada data yang benar-benar ada: kedua ballot di preview
 * hari ini punya jendela voting ≈60 menit (diukur: 3.593 dan 3.597 detik dari
 * blok deploy ke voteDeadline). Seluruh umur ballot lebih pendek daripada 1/24
 * ambang itu, sehingga setiap ballot berbunyi "Closing soon" sejak detik
 * pertama dan label "Live now" tidak pernah muncul sekali pun.
 *
 * Yang dipakai adalah jendela tally — tallyDeadline − voteDeadline — karena ia
 * satu-satunya rentang yang PEMBUAT BALLOT SENDIRI nyatakan dan yang tersedia
 * bagi fungsi murni ini tanpa pembacaan tambahan. Jendela voting sesungguhnya
 * (deploy → voteDeadline) menuntut tinggi blok deploy, yang tidak ada di ledger.
 *
 * Pada ballot 60 menit hari ini: 35 menit, sehingga "Live now" tampil ≈25 menit
 * pertama dan "Closing soon" 35 menit terakhir. Pada ballot bertempo bulanan ia
 * jatuh ke batas atas 24 jam.
 *
 * Diekspor supaya uji MENURUNKAN batas-batasnya sendiri alih-alih mengetik ulang
 * angka yang akan berpisah dari nilai di sini.
 */
export function ambangTutupSegeraMs(k: {
  voteDeadlineMs: number;
  tallyDeadlineMs: number;
}): number {
  const jendelaTally = k.tallyDeadlineMs - k.voteDeadlineMs;
  // Kontrak menjamin tallyDeadline > voteDeadline (assert di constructor), jadi
  // jendelaTally selalu positif. Math.max(0, …) tetap dipasang supaya data yang
  // melanggar jaminan itu menghasilkan ambang nol — bukan ambang negatif, yang
  // akan membuat setiap ballot berbunyi "Live now" sampai detik terakhir.
  return Math.min(BATAS_ATAS_TUTUP_SEGERA_MS, Math.max(0, jendelaTally));
}

/**
 * Menurunkan status dari fase ledger DIGABUNG waktu dinding.
 *
 * MEMBACA `phase` SAJA TIDAK CUKUP, dan ini bukan kehati-hatian berlebihan —
 * ia keadaan yang benar-benar ada di rantai hari ini. Transisi fase bersifat
 * MALAS: ballot.compact tidak punya circuit closeVoting, sehingga phase tetap
 * `voting` setelah voteDeadline lewat sampai ada orang pertama yang memanggil
 * tallyVote(). Ballot yang tidak pernah dibuka satu suara pun tinggal di
 * `voting` selamanya, sementara kontraknya menolak SEMUA hal: castVote ditolak
 * (blockTimeLessThan(voteDeadline)) dan tallyVote juga ditolak
 * (blockTimeLessThan(tallyDeadline)).
 *
 * `sekarangMs` WAJIB dioper, tanpa nilai bawaan. Nilai bawaan yang membaca
 * Date.now() akan membuat fungsi ini mustahil diuji secara deterministik, dan
 * akan diam-diam memakai jam PERANGKAT — padahal kontrak memutuskan terhadap
 * waktu BLOK. Pemanggil di aplikasi mengoper HasilRantai.sekarangMs, yang
 * berasal dari stempel waktu blok.
 *
 * Urutan pemeriksaan menentukan kebenaran:
 *   1. finalized lebih dulu — satu-satunya penanda finalitas yang eksplisit
 *      di on-chain, dan ia tidak pernah mundur.
 *   2. lalu tallyDeadline, lalu voteDeadline — dari yang terjauh ke terdekat.
 */
export function turunkanStatus(
  k: { phase: 0 | 1 | 2; voteDeadlineMs: number; tallyDeadlineMs: number },
  sekarangMs: number,
): BallotStatus {
  if (k.phase === 2) return "finalized";
  if (sekarangMs >= k.tallyDeadlineMs) return "awaiting-finalize";
  if (sekarangMs >= k.voteDeadlineMs) return "tally-open";
  if (k.voteDeadlineMs - sekarangMs <= ambangTutupSegeraMs(k)) return "closing-soon";
  return "live";
}

/**
 * Keadaan HASIL sebuah ballot. EMPAT nilai, dan keempatnya benar-benar terjadi.
 *
 * Ini menutup konflasi yang paling mudah terlewat di seluruh rencana ini:
 * `talliedCount === 0` TIDAK berarti "hasil masih tersegel". Ia berarti belum
 * ada satu suara pun yang dibuka — dan itu punya empat sebab yang berbeda
 * artinya bagi pembaca, dua di antaranya sudah ada di rantai hari ini:
 *
 *   - ballot f597222d… berstatus awaiting-finalize dengan voteCount 0 dan
 *     talliedCount 0, dan KEDUA deadline-nya (voteDeadline 1789086147,
 *     tallyDeadline 1789088247) sudah lewat. Berbunyi "Results sealed until the
 *     vote deadline" di sini adalah kebohongan yang dapat diperiksa siapa pun,
 *     dan yang hanya makin salah seiring waktu.
 *   - satu panggilan finalize() pada ballot yang sama membuatnya `finalized`
 *     dengan talliedCount tetap 0. Menampilkan "tersegel" pada ballot yang
 *     SUDAH FINAL adalah kebalikan dari yang benar.
 *
 * Karena itu keadaan hasil digantung pada STATUS TURUNAN, bukan pada hitungan.
 *
 * Tipe KeadaanHasil sendiri tinggal di types.ts bersama BallotStatus, supaya
 * types.ts tetap TIDAK MENGIMPOR APA PUN dan tidak ada siklus yang mungkin.
 */
export function keadaanHasil(b: { status: BallotStatus; tallied: number }): KeadaanHasil {
  if (b.tallied > 0) return "ada-hasil";
  switch (b.status) {
    case "live":
    case "closing-soon":
      return "tersegel";
    case "tally-open":
      return "menunggu-pembukaan";
    case "awaiting-finalize":
    case "finalized":
      return "tidak-ada-yang-dibuka";
  }
}

/** Label status untuk mata manusia. Teks UI Inggris. */
export function statusLabel(status: BallotStatus): string {
  switch (status) {
    case "closing-soon":
      return "Closing soon";
    case "tally-open":
      return "Opening votes";
    case "awaiting-finalize":
      return "Awaiting finalization";
    case "finalized":
      return "Finalized";
    case "live":
      return "Live now";
  }
}

/**
 * Kelas tone CSS untuk badge status.
 *
 * SENGAJA memetakan lima status ke tiga tone, karena client/src/index.css hanya
 * punya tiga: `status-badge` dasar (mint), `.status-badge.closing-soon` (amber),
 * dan `.status-badge.finalized` (biru). Ini bukan kompromi estetis melainkan
 * pemisahan yang benar: STATUS adalah fakta rantai, TONE adalah keputusan visual.
 * Memaksa keduanya berbagi satu string adalah sebab kenapa enum tiga-nilai itu
 * mustahil ditumbuhkan tanpa menyentuh CSS.
 *
 * tally-open dan awaiting-finalize memakai tone amber, bukan biru: keduanya
 * menuntut tindakan (membuka suara, memfinalisasi), sedangkan biru di halaman
 * ini berarti "sudah selesai".
 */
export function statusTone(status: BallotStatus): "" | "closing-soon" | "finalized" {
  switch (status) {
    case "live":
      return "";
    case "finalized":
      return "finalized";
    case "closing-soon":
    case "tally-open":
    case "awaiting-finalize":
      return "closing-soon";
  }
}

/**
 * Tag kecil di pojok kartu ballot. Sebelum C-2a ia field mockup yang diketik
 * tangan; sekarang ia turunan dari status, sehingga tidak bisa lagi berbohong.
 */
export function statusTag(status: BallotStatus): string {
  switch (status) {
    case "live":
      return "Open";
    case "closing-soon":
      return "Closing soon";
    case "tally-open":
      return "Tally window";
    case "awaiting-finalize":
      return "Needs finalizing";
    case "finalized":
      return "Finalized";
  }
}

/** Benar hanya ketika kontrak benar-benar akan MENERIMA castVote. */
export function menerimaSuara(status: BallotStatus): boolean {
  return status === "live" || status === "closing-soon";
}

/**
 * Tipe domain VotePriv, dipakai bersama oleh shell dan ketujuh komponen di
 * direktori ini. Dipindah apa adanya dari Home.tsx oleh Rencana C-1; tidak ada
 * field yang ditambah, dihapus, maupun diubah tipenya lewat C-1.
 *
 * Rencana C-2a Task 6 menumbuhkan `BallotStatus` dan `Ballot` untuk memetakan
 * keadaan on-chain sungguhan — lihat komentar di masing-masing tipe.
 */

export type Section = "Overview" | "Live ballots" | "Results" | "Docs";

/**
 * Status ballot: LIMA anggota, bukan tiga.
 *
 * Tiga anggota lama ("live" | "closing-soon" | "finalized") tidak punya nilai
 * yang cocok untuk keadaan yang BENAR-BENAR ADA di rantai: sebuah ballot dapat
 * berada di phase = voting sementara KEDUA deadline-nya sudah lewat. UI lama
 * akan berbunyi "Live now" padahal castVote PASTI ditolak kontrak
 * (assert(kernel.blockTimeLessThan(voteDeadline))), dan chip filter akan
 * berbunyi "Live 1" yang BOHONG.
 *
 * Akarnya ada di kontrak dan tidak akan berubah: TRANSISI FASE BERSIFAT MALAS.
 * ballot.compact tidak punya circuit closeVoting; phase berpindah ke tallying
 * hanya ketika pembuka suara PERTAMA memanggil tallyVote(), dan ke finalized
 * hanya ketika seseorang memanggil finalize(). Ballot yang tidak pernah dibuka
 * satu suara pun tinggal di phase = voting SELAMANYA.
 *
 * Karena itu status WAJIB diturunkan dari phase DIGABUNG waktu dinding terhadap
 * voteDeadline/tallyDeadline. Lihat turunkanStatus() di ballot-status.ts.
 */
export type BallotStatus =
  /** Menerima suara. phase = voting DAN belum melewati voteDeadline. */
  | "live"
  /** live, tetapi voteDeadline tinggal sebentar lagi. */
  | "closing-soon"
  /** Pemungutan ditutup, jendela pembukaan suara terbuka: voteDeadline < now < tallyDeadline. */
  | "tally-open"
  /** Kedua deadline lewat tetapi finalize() belum pernah dipanggil. */
  | "awaiting-finalize"
  /** phase = finalized. Satu-satunya penanda finalitas yang eksplisit di on-chain. */
  | "finalized";

/**
 * Keadaan HASIL sebuah ballot. EMPAT nilai, dan keempatnya benar-benar terjadi.
 *
 * `talliedCount === 0` TIDAK berarti "hasil masih tersegel" — ia punya empat
 * sebab yang berbeda artinya bagi pembaca. Dua di antaranya sudah ada di rantai
 * hari ini, jadi ini bukan kehati-hatian teoretis:
 *
 *   - `f597222d…` berstatus awaiting-finalize dengan voteCount 0 dan
 *     talliedCount 0, dan KEDUA deadline-nya (voteDeadline 1789086147,
 *     tallyDeadline 1789088247) sudah lewat. Menampilkan "Results sealed until
 *     the vote deadline" di sana adalah kebohongan yang dapat diperiksa siapa
 *     pun — dan yang hanya makin salah seiring waktu, karena deadline itu tidak
 *     bergerak sementara "sekarang" terus maju.
 *   - satu panggilan finalize() pada ballot yang sama membuatnya `finalized`
 *     dengan talliedCount tetap 0. Menampilkan "tersegel" pada ballot yang
 *     SUDAH FINAL adalah kebalikan dari yang benar.
 *
 * Karena itu keadaan hasil digantung pada STATUS TURUNAN, bukan pada hitungan.
 * Turunannya ada di keadaanHasil() di ballot-status.ts.
 */
export type KeadaanHasil =
  /** Ada suara yang sudah dibuka. Persentase boleh, dan harus, ditampilkan. */
  | "ada-hasil"
  /** Masih menerima suara. Tallies memang belum boleh ada isinya (spec 9.4). */
  | "tersegel"
  /** Pemungutan tutup, jendela pembukaan masih terbuka, belum ada yang membuka. */
  | "menunggu-pembukaan"
  /** Jendela pembukaan tutup (atau sudah final) tanpa satu suara pun dibuka. */
  | "tidak-ada-yang-dibuka";

export type Ballot = {
  /**
   * Alamat kontrak, hex. SATU-SATUNYA identitas yang benar-benar ada di rantai.
   *
   * Spec 14.6 mencatat bahwa Ballot.id tidak punya sumber on-chain; alamatnyalah
   * sumber itu. Dipakai sebagai key React dan sebagai pengenal di mana pun sebuah
   * ballot perlu disebut secara unik.
   */
  id: string;
  /**
   * Nomor urut TAMPILAN, diturunkan dari tinggi blok ContractDeploy (urut naik).
   *
   * BUKAN dari indeks registry: registry.compact memakai ballots.pushFront, jadi
   * indeks 0 adalah yang TERBARU, dan menomori dari indeks akan MENOMORI ULANG
   * ballot lama setiap ada pendaftaran baru.
   *
   * Batas kejujurannya: stabil pada alur normal deploy-lalu-daftar, karena tinggi
   * blok tidak pernah mundur. TIDAK stabil bila seseorang mendaftarkan ballot yang
   * di-deploy jauh sebelumnya. Karena itu nomor ini hanya boleh dipakai sebagai
   * TEKS TAMPILAN — tidak pernah sebagai key, tidak pernah di URL.
   */
  nomor: number;
  title: string;
  description: string;
  community: string;
  /** voteCount: jumlah suara yang diterima kontrak. */
  votes: number;
  /** eligibleCount: batas yang di-seal saat deploy. */
  eligible: number;
  /** registeredCount: credential yang benar-benar sudah diterbitkan admin. */
  registered: number;
  /** talliedCount: suara yang sudah dibuka pemiliknya. voteCount - talliedCount = yang belum. */
  tallied: number;
  /**
   * quorumPercent — INFORMATIF, BUKAN ambang yang ditegakkan kontrak.
   *
   * ballot.compact menyatakannya sendiri: nilai ini ditulis sekali di constructor
   * dan tidak pernah dibaca circuit mana pun. finalize() berhasil pada partisipasi
   * 0% persis seperti pada 100%. UI WAJIB menyebutnya sebagai niat yang dinyatakan
   * pembuat ballot (spec 9.4).
   */
  quorum: number;
  /** eligibilityPolicy: keterangan siapa yang berhak, ditulis pembuat ballot. */
  eligibilityPolicy: string;
  /** Teks tampilan dari voteDeadline, diformat UTC. */
  deadline: string;
  /** voteDeadline dalam MILIDETIK. Ledger menyimpannya dalam DETIK; konversinya di ke-ballot.ts. */
  voteDeadlineMs: number;
  tallyDeadlineMs: number;
  /** phase MENTAH dari ledger. Dipertahankan supaya UI dapat menjelaskan selisihnya dengan status. */
  phase: 0 | 1 | 2;
  status: BallotStatus;
  options: string[];
  /**
   * Tallies yang SUDAH DIPADATKAN, panjangnya SELALU sama dengan options.
   *
   * TIDAK pernah `null`. Bentuk `number[] | null` yang sempat dipakai
   * mengkonflasikan empat keadaan yang berbeda artinya menjadi satu nilai —
   * lihat KeadaanHasil. Yang memutuskan apa yang dirender adalah `keadaanHasil`
   * di bawah, bukan bentuk larik ini.
   *
   * Ketika belum ada suara yang dibuka, isinya larik nol sepanjang options. Itu
   * BUKAN izin menampilkan bar 0% — komponen wajib bercabang pada `keadaanHasil`
   * lebih dulu, dan uji di Task 8 menjaganya.
   */
  tallies: number[];
  /**
   * Keadaan hasil, diturunkan dari `status` DIGABUNG `tallied`.
   *
   * Spec 9.4 menuntut Results membedakan "tersegel" dari "ada hasil"; rantai
   * hari ini menuntut dua lagi, karena ada ballot yang jendela pembukaannya
   * sudah tutup tanpa satu suara pun dibuka. Menyimpannya sebagai field, bukan
   * menghitungnya ulang di tiap komponen, membuat keempat keadaan itu punya
   * satu turunan yang dapat diuji sendiri.
   */
  keadaanHasil: KeadaanHasil;
  accent: string;
  tag: string;
  /** Tinggi blok ContractDeploy. Dipertahankan supaya nomor urut dapat diaudit dari UI. */
  deployHeight: number;
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

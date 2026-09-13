/**
 * Menerjemahkan pesan galat KONTRAK — yang lahir Indonesia di sumbernya dan
 * TIDAK BOLEH diubah di sana — menjadi Inggris yang ramah pemilih sebelum
 * dirender ke layar.
 *
 * LATAR (audit bahasa UI #2, lanjutan cbbee8b): audit pertama menyisir setiap
 * KOMPONEN dan fungsi `lib/` yang mengembalikan string UI, tapi tidak
 * membaca isi `e.message` yang mengalir UTUH dari `pkgs/contract/src/ballot.compact`
 * lewat `CallTxFailedError` (midnight-js) ke `VoteModal`/`RegisterModal`.
 * Ke-23 string `assert(...)` di ballot.compact SEMUANYA Indonesia — itu tidak
 * bisa diubah tanpa membangun ulang artefak ZK (circuit dikompilasi memuat
 * pesan assert-nya) dan deploy ulang; lihat keputusan tugas ini. Berkas ini
 * karena itu menutup kebocoran itu di KLIEN, bukan di sumbernya.
 *
 * PENCOCOKAN SUBSTRING, bukan kesetaraan (`===`): `CallTxFailedError`
 * membungkus pesan assert circuit dengan JSON status transaksi lain
 * (`TxFailedError` men-JSON.stringify `{circuitId, ...finalizedTxData}` —
 * lihat @midnight-ntwrk/midnight-js-contracts dist/index.mjs, `TxFailedError`
 * constructor). String assert-nya ADA di dalam `e.message`, tapi tidak PERSIS
 * SAMA DENGANNYA. `pesan.includes(indonesia)` menangkap itu tanpa perlu tahu
 * bentuk pembungkusnya persis.
 *
 * Pesan yang TIDAK dikenali dikembalikan APA ADANYA — fungsi ini sengaja
 * tidak "menelan" galat yang tidak terduga di balik teks generik; pemilih yang
 * melihat pesan asing setidaknya melihat SESUATU yang bisa disalin ke laporan
 * bug, bukan "Something went wrong" kosong.
 *
 * TERJEMAHAN, bukan terjemahan harfiah teknis: kalimat Inggris di sini ditulis
 * untuk PEMILIH yang tidak tahu apa itu Merkle path atau nullifier, sejauh itu
 * bisa dilakukan tanpa berbohong soal apa yang sebenarnya terjadi.
 */

/**
 * Ke-23 string `assert(...)` di pkgs/contract/src/ballot.compact, PERSIS —
 * disalin lewat baca berkas itu sendiri (grep `assert(`), bukan ditulis ulang
 * dari ingatan. Dikelompokkan per circuit dan diberi rujukan baris supaya
 * perubahan di ballot.compact (yang TIDAK BOLEH terjadi tanpa proses build
 * ulang penuh) mudah disilangkan kembali ke sini bila itu pernah terjadi.
 *
 * Urutan array TIDAK signifikan untuk kebenaran (lihat penjelasan di
 * `terjemahkanGalatRantai`): kedua-puluh-tiga string ini terverifikasi TIDAK
 * ada yang menjadi substring dari yang lain (mis. "Batas waktu pembukaan
 * suara sudah lewat" vs "...belum lewat" vs "...harus setelah..." berbeda
 * sejak kata setelah frasa bersama), jadi pencocokan pertama yang berhasil
 * SELALU pencocokan yang benar.
 */
const PETA_PESAN_ASSERT_KONTRAK: ReadonlyArray<readonly [indonesia: string, inggris: string]> = [
  // ── constructor (deploy ballot) — ballot.compact:155-179 ──────────────────
  ["Jumlah opsi harus 2 sampai 4", "This ballot must have between 2 and 4 options."],
  [
    "Batas waktu pembukaan suara harus setelah batas waktu pemungutan suara",
    "The vote-opening deadline must come after the voting deadline.",
  ],
  ["Jumlah pemilih yang berhak minimal 1", "This ballot needs at least 1 eligible voter."],
  [
    "Jumlah pemilih yang berhak melebihi kapasitas pohon (1024)",
    "This ballot allows more eligible voters than the maximum of 1,024.",
  ],
  ["Persentase kuorum tidak boleh melebihi 100", "The quorum percentage cannot be more than 100."],

  // ── registerVoters (admin) — ballot.compact:202-210 ───────────────────────
  ["Hanya admin yang boleh mendaftarkan pemilih", "Only this ballot's admin can register voters."],
  ["Ballot sudah tidak dalam fase pemungutan suara", "This ballot is no longer in its voting phase."],
  ["Pendaftaran ditutup setelah suara pertama masuk", "Registration closed as soon as the first vote was cast."],
  ["Jumlah pendaftaran harus 1 sampai 8", "You can register between 1 and 8 voters at a time."],
  [
    "Melebihi eligibleCount yang ditetapkan ballot",
    "This would exceed the number of eligible voters set for this ballot.",
  ],

  // ── castVote (voter) — ballot.compact:235-266 ─────────────────────────────
  ["Batas waktu pemungutan suara sudah lewat", "The voting deadline for this ballot has passed."],
  ["Ballot tidak sedang menerima suara", "This ballot is not currently accepting votes."],
  ["Merkle path bukan untuk credential ini", "The submitted proof path does not match this credential."],
  // Diberikan APA ADANYA oleh brief tugas ini — dipertahankan verbatim.
  ["Anda tidak terdaftar sebagai pemilih pada ballot ini", "This credential is not registered for this ballot."],
  ["Pilihan di luar opsi yang tersedia", "That option is not available on this ballot."],
  // Diberikan APA ADANYA oleh brief tugas ini — dipertahankan verbatim.
  ["Credential ini sudah dipakai memilih", "This credential has already voted on this ballot."],

  // ── tallyVote (voter, buka suara) — ballot.compact:312-330 ────────────────
  // "Ballot sudah difinalisasi" dipakai ULANG persis di finalize() (compact:364)
  // — SATU entri di sini sudah menutup kedua titik assert, karena keduanya
  // memakai string YANG SAMA PERSIS.
  ["Ballot sudah difinalisasi", "This ballot has already been finalized."],
  ["Pemungutan suara masih berlangsung", "Voting is still open — votes can't be opened yet."],
  ["Batas waktu pembukaan suara sudah lewat", "The deadline to open votes on this ballot has passed."],
  ["Merkle path bukan untuk commitment ini", "The submitted proof path does not match this sealed vote."],
  ["Commitment tidak ditemukan pada ballot ini", "This sealed vote was not found on this ballot."],
  ["Suara ini sudah pernah dibuka", "This vote has already been opened."],

  // ── finalize (siapa saja) — ballot.compact:364-365 ────────────────────────
  ["Batas waktu pembukaan suara belum lewat", "This ballot can't be finalized yet — the vote-opening deadline hasn't passed."],
];

/**
 * KE-24, di luar 23 assert ballot.compact — sengaja tidak dihitung sebagai
 * bagian dari "23 string assert" yang diminta brief, dicatat terpisah supaya
 * jujur soal itu.
 *
 * Sumbernya BUKAN ballot.compact (jadi bukan assert circuit yang dikompilasi
 * ke ZK), melainkan `need()` di pkgs/contract/src/ballot-witnesses.ts:152-157
 * — pagar pemeriksaan witness (`voter_credential`/`get_my_option`/
 * `get_my_salt`/`eligibility_path`/`commitment_path`) yang melempar `Error`
 * biasa berbentuk `` `${nama} untuk ballot ${ballot} belum diisi di private
 * state` `` bila field yang dibutuhkan belum tersimpan saat witness itu
 * dipanggil compactc-generated code selama pembuatan proof.
 *
 * Ini SECARA STRUKTUR sama seperti Kelas 1 (sumbernya di `pkgs/`, dilarang
 * disentuh oleh batasan tugas ini — lihat catatan "Jangan menyentuh pkgs/"),
 * BUKAN Kelas 2 (yang sumbernya di `client/src/lib/chain/*.ts` dan diperbaiki
 * LANGSUNG di sana, lihat eligibility-tulis.ts). String ini ditemukan lewat
 * grep atas dist/public/assets/tulis-*.js sungguhan (dibangun dari HEAD tugas
 * ini) dan dikutip dari sana, bukan ditebak — ia terbawa ke chunk tulis
 * karena tulis.ts mengimpor ballot-witnesses.ts secara transitif lewat
 * ballot-witnesses.js (@pkgs/contract/src/ballot-witnesses.js).
 *
 * Jalur nyatanya ke layar: witness dipanggil DI DALAM `ballot.callTx.castVote()`
 * / `tallyVote()` (tulis.ts), yang jika melempar berakhir di `catch (e)` umum
 * masing-masing fungsi itu dan dibungkus `new GalatCastVote(e.message, ...)`
 * TANPA mengubah pesannya (lihat tulis.ts baris ~233 dan ~369) — persis pola
 * yang sama dengan bagaimana pesan assert Kelas 1 mengalir ke `setGalat`.
 *
 * Satu entri generik (bukan 4 entri per nama field) sudah cukup: keempat
 * variannya berbagi akhiran "belum diisi di private state" yang sama persis,
 * dan pemilih tidak diuntungkan oleh pembedaan teknis field mana yang kosong
 * — tindakan yang disarankan (pulihkan dari cadangan / ulangi) sama untuk
 * semuanya.
 */
const PESAN_WITNESS_BELUM_DIISI: readonly [indonesia: string, inggris: string] = [
  "belum diisi di private state",
  "This device is missing required local vote data for this ballot — try restoring your credential or vote backup file, then try again.",
];

const PETA_PESAN_RANTAI: ReadonlyArray<readonly [indonesia: string, inggris: string]> = [
  ...PETA_PESAN_ASSERT_KONTRAK,
  PESAN_WITNESS_BELUM_DIISI,
];

/**
 * Menerjemahkan pesan galat rantai (assert kontrak yang dibungkus
 * `CallTxFailedError`, atau invarian witness pkgs/contract) ke Inggris ramah
 * pemilih, lewat pencocokan SUBSTRING atas ke-24 frasa Indonesia sumber di
 * atas.
 *
 * Pencocokan PERTAMA yang berhasil dipakai. Ini aman (bukan asal ambil
 * pertama yang kebetulan cocok) karena ke-24 frasa sumber sudah diverifikasi
 * TIDAK ADA yang menjadi substring dari frasa lain dalam daftar — lihat
 * komentar di PETA_PESAN_ASSERT_KONTRAK.
 *
 * Pesan yang tidak cocok satu pun (galat yang tidak terduga, atau yang sudah
 * Inggris) dikembalikan APA ADANYA — lihat blok komentar kepala berkas soal
 * mengapa ini bukan cacat.
 */
export function terjemahkanGalatRantai(pesan: string): string {
  for (const [indonesia, inggris] of PETA_PESAN_RANTAI) {
    if (pesan.includes(indonesia)) return inggris;
  }
  return pesan;
}

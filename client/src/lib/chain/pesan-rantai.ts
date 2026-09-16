/**
 * Mengubah pesan galat KONTRAK menjadi kalimat Inggris yang ramah pemilih
 * sebelum dirender ke layar.
 *
 * LATAR (audit bahasa UI #2, lanjutan cbbee8b): audit pertama menyisir setiap
 * KOMPONEN dan fungsi `lib/` yang mengembalikan string UI, tapi tidak
 * membaca isi `e.message` yang mengalir UTUH dari `pkgs/contract/src/ballot.compact`
 * lewat `CallTxFailedError` (midnight-js) ke `VoteModal`/`RegisterModal`.
 * Saat itu ke-23 string `assert(...)` di ballot.compact SEMUANYA Indonesia,
 * dan berkas ini lahir sebagai penerjemah di sisi klien.
 *
 * SEKARANG ballot.compact sudah berbahasa Inggris seluruhnya (komentar, pesan
 * assert, nama lokal) — dibuktikan aman: kunci prover/verifier dan zkir hasil
 * kompilasi ulang identik byte demi byte dengan yang sudah ter-deploy, karena
 * pesan assert hanya hidup di JS hasil compactc, bukan di circuit. Berkas ini
 * TETAP ADA karena dua alasan yang tidak hilang bersama bahasanya:
 *
 *   1. PEMBUNGKUS. `CallTxFailedError` membungkus pesan assert circuit dengan
 *      JSON status transaksi lain (`TxFailedError` men-JSON.stringify
 *      `{circuitId, ...finalizedTxData}` — lihat
 *      @midnight-ntwrk/midnight-js-contracts dist/index.mjs, constructor
 *      `TxFailedError`). String assert-nya ADA di dalam `e.message`, tapi tidak
 *      PERSIS SAMA DENGANNYA. Tanpa lapis ini pemilih melihat JSON mentah.
 *   2. NADA. Pesan kontrak sengaja ringkas dan teknis ("Credential has already
 *      voted") — itu pesan untuk pembaca kontrak. Kalimat di sini ditulis
 *      untuk PEMILIH yang tidak tahu apa itu Merkle path atau nullifier,
 *      sejauh itu bisa dilakukan tanpa berbohong soal apa yang terjadi.
 *
 * PENCOCOKAN SUBSTRING, bukan kesetaraan (`===`): `pesan.includes(kontrak)`
 * menangkap pesan assert di dalam pembungkus apa pun tanpa perlu tahu bentuk
 * pembungkusnya persis.
 *
 * Pesan yang TIDAK dikenali dikembalikan APA ADANYA — fungsi ini sengaja
 * tidak "menelan" galat yang tidak terduga di balik teks generik; pemilih yang
 * melihat pesan asing setidaknya melihat SESUATU yang bisa disalin ke laporan
 * bug, bukan "Something went wrong" kosong.
 */

/**
 * Ke-23 string `assert(...)` di pkgs/contract/src/ballot.compact, PERSIS —
 * disalin lewat baca berkas itu sendiri (grep `assert(`), bukan ditulis ulang
 * dari ingatan. Dikelompokkan per circuit supaya perubahan di ballot.compact
 * mudah disilangkan kembali ke sini. Mengubah pesan assert di kontrak TIDAK
 * mengubah artefak ZK (lihat kepala berkas), tapi WAJIB diikuti pembaruan
 * kunci di peta ini — uji audit-bahasa-ui.test.tsx memaku ke-23 kunci ini
 * terhadap sumber kontrak.
 *
 * Urutan array TIDAK signifikan untuk kebenaran (lihat penjelasan di
 * `terjemahkanGalatRantai`): kedua-puluh-tiga string ini terverifikasi TIDAK
 * ada yang menjadi substring dari yang lain (mis. "Tally deadline has passed"
 * vs "Tally deadline has not passed yet" berbeda sejak kata "not"), jadi
 * pencocokan pertama yang berhasil SELALU pencocokan yang benar. Uji
 * audit-bahasa-ui.test.tsx menegakkan sifat ini secara eksplisit.
 */
const PETA_PESAN_ASSERT_KONTRAK: ReadonlyArray<readonly [kontrak: string, ramah: string]> = [
  // ── constructor (deploy ballot) ────────────────────────────────────────────
  ["Option count must be between 2 and 4", "This ballot must have between 2 and 4 options."],
  ["Tally deadline must be after the vote deadline", "The vote-opening deadline must come after the voting deadline."],
  ["Eligible voter count must be at least 1", "This ballot needs at least 1 eligible voter."],
  [
    "Eligible voter count exceeds the tree capacity (1024)",
    "This ballot allows more eligible voters than the maximum of 1,024.",
  ],
  ["Quorum percent cannot exceed 100", "The quorum percentage cannot be more than 100."],

  // ── registerVoters (admin) ─────────────────────────────────────────────────
  ["Only the admin can register voters", "Only this ballot's admin can register voters."],
  ["Ballot is no longer in the voting phase", "This ballot is no longer in its voting phase."],
  ["Registration is closed: the vote deadline has passed", "Registration for this ballot closed when its voting deadline passed."],
  ["Batch size must be between 1 and 8", "You can register between 1 and 8 voters at a time."],
  [
    "Registration would exceed the ballot's eligibleCount",
    "This would exceed the number of eligible voters set for this ballot.",
  ],

  // ── castVote (voter) ───────────────────────────────────────────────────────
  ["Vote deadline has passed", "The voting deadline for this ballot has passed."],
  ["Ballot is not accepting votes", "This ballot is not currently accepting votes."],
  ["Merkle path does not belong to this credential", "The submitted proof path does not match this credential."],
  ["Credential is not registered on this ballot", "This credential is not registered for this ballot."],
  ["Option is out of range", "That option is not available on this ballot."],
  ["Credential has already voted", "This credential has already voted on this ballot."],

  // ── tallyVote (voter, buka suara) ──────────────────────────────────────────
  // "Ballot is already finalized" dipakai ULANG persis di finalize() — SATU
  // entri di sini sudah menutup kedua titik assert, karena keduanya memakai
  // string YANG SAMA PERSIS.
  ["Ballot is already finalized", "This ballot has already been finalized."],
  ["Voting is still open", "Voting is still open — votes can't be opened yet."],
  ["Tally deadline has passed", "The deadline to open votes on this ballot has passed."],
  ["Merkle path does not belong to this commitment", "The submitted proof path does not match this sealed vote."],
  ["Commitment not found on this ballot", "This sealed vote was not found on this ballot."],
  ["Vote has already been opened", "This vote has already been opened."],

  // ── finalize (siapa saja) ──────────────────────────────────────────────────
  ["Tally deadline has not passed yet", "This ballot can't be finalized yet — the vote-opening deadline hasn't passed."],
];

/**
 * KE-24, di luar 23 assert ballot.compact — sengaja tidak dihitung sebagai
 * bagian dari "23 string assert", dicatat terpisah supaya jujur soal itu.
 *
 * Sumbernya BUKAN ballot.compact (jadi bukan assert circuit), melainkan
 * `need()` di pkgs/contract/src/ballot-witnesses.ts — pagar pemeriksaan
 * witness (`voter_credential`/`get_my_option`/`get_my_salt`/`eligibility_path`/
 * `commitment_path`) yang melempar `Error` biasa berbentuk
 * `` `${name} for ballot ${ballot} is not set in private state` `` bila field
 * yang dibutuhkan belum tersimpan saat witness itu dipanggil kode hasil
 * compactc selama pembuatan proof. Ia terbawa ke chunk tulis karena tulis.ts
 * mengimpor ballot-witnesses.ts secara transitif.
 *
 * Jalur nyatanya ke layar: witness dipanggil DI DALAM `ballot.callTx.castVote()`
 * / `tallyVote()` (tulis.ts), yang jika melempar berakhir di `catch (e)` umum
 * masing-masing fungsi itu dan dibungkus `new GalatCastVote(e.message, ...)`
 * TANPA mengubah pesannya — persis pola yang sama dengan bagaimana pesan
 * assert kontrak mengalir ke `setGalat`.
 *
 * Satu entri generik (bukan 4 entri per nama field) sudah cukup: keempat
 * variannya berbagi akhiran "is not set in private state" yang sama persis,
 * dan pemilih tidak diuntungkan oleh pembedaan teknis field mana yang kosong
 * — tindakan yang disarankan (pulihkan dari cadangan / ulangi) sama untuk
 * semuanya.
 */
const PESAN_WITNESS_BELUM_DIISI: readonly [kontrak: string, ramah: string] = [
  "is not set in private state",
  "This device is missing required local vote data for this ballot — try restoring your credential or vote backup file, then try again.",
];

const PETA_PESAN_RANTAI: ReadonlyArray<readonly [kontrak: string, ramah: string]> = [
  ...PETA_PESAN_ASSERT_KONTRAK,
  PESAN_WITNESS_BELUM_DIISI,
];

/**
 * Mengubah pesan galat rantai (assert kontrak yang dibungkus
 * `CallTxFailedError`, atau invarian witness pkgs/contract) menjadi kalimat
 * ramah pemilih, lewat pencocokan SUBSTRING atas ke-24 frasa sumber di atas.
 *
 * Pencocokan PERTAMA yang berhasil dipakai. Ini aman (bukan asal ambil
 * pertama yang kebetulan cocok) karena ke-24 frasa sumber sudah diverifikasi
 * TIDAK ADA yang menjadi substring dari frasa lain dalam daftar — lihat
 * komentar di PETA_PESAN_ASSERT_KONTRAK.
 *
 * Pesan yang tidak cocok satu pun (galat yang tidak terduga) dikembalikan
 * APA ADANYA — lihat blok komentar kepala berkas soal mengapa ini bukan cacat.
 */
export function terjemahkanGalatRantai(pesan: string): string {
  for (const [kontrak, ramah] of PETA_PESAN_RANTAI) {
    if (pesan.includes(kontrak)) return ramah;
  }
  return pesan;
}

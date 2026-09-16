// Jendela deadline BERSAMA untuk `deploy-ballot.ts` dan `e2e.ts` — SATU-
// SATUNYA definisi MENIT_VOTE/MENIT_TALLY di seluruh CLI.
//
// Sebelum berkas ini ada, kedua skrip mendefinisikan salinan masing-masing
// (45/80 di deploy-ballot.ts, 60/95 di e2e.ts) dan keduanya diam-diam
// menyimpang: commit e545d61 menaikkan angka e2e.ts supaya
// SISA_MINIMAL_VOTE di sana bisa disetel >= biaya terburuk satu iterasi
// loop coblos (lihat komentar di atas SISA_MINIMAL_VOTE di e2e.ts), tapi
// tidak pernah menyentuh deploy-ballot.ts — dua konstanta yang HARUS sama
// nilainya (keduanya menghitung deadline dengan cara yang identik) berubah
// jadi dua angka berbeda tanpa ada yang memutuskan itu dengan sengaja.
//
// Duplikasi itu sendirilah cacatnya, bukan hanya penyimpangan nilainya:
// bahkan bila kedua salinan tadi disamakan manual sekali lagi, tidak ada
// yang mencegahnya menyimpang lagi pada perubahan berikutnya. Menyatukan
// definisinya di sini membuat penyimpangan itu tidak mungkin lagi terjadi
// tanpa disadari — mengubah nilainya mengubah KEDUA skrip sekaligus.
//
// Nilai 60/95 dipertahankan (bukan dikembalikan ke 45/80): itu nilai yang
// sudah dibuktikan cukup untuk invarian SISA_MINIMAL_VOTE/SISA_MINIMAL_TALLY
// e2e.ts (lihat verifikasi lengkap di atas kedua konstanta itu di e2e.ts).
// Menurunkannya ke 45/80 akan membuat jendela e2e.ts (2700 detik) lebih
// kecil dari biaya terburuk satu iterasi loop coblos (835 detik x 3 +
// pra-loop 750 detik = 3255 detik) — regresi yang sama persis yang Fix
// Round 3 perbaiki.
//
// 2026-09-13: dinaikkan 60/95 -> 120/180. Dua ballot berturut-turut kalah
// balapan dengan sesi pengujian dari browser: jendela tally 35 menit habis
// selagi perbaikan jalur tulis masih dikerjakan, dan satu suara sah tidak
// pernah sempat dibuka. Arah naik AMAN terhadap invarian e2e di atas — batas
// yang dijaga adalah batas BAWAH ("cukup waktu"), dan jendela pembukaan
// suara (MENIT_TALLY - MENIT_VOTE) justru melebar dari 35 ke 60 menit.
//
// 2026-09-14: ditambah override VOTEPRIV_MENIT_VOTE/VOTEPRIV_MENIT_TALLY —
// alur JURI (lihat .superpowers/alur-juri.md). Juri menguji ballot kapan pun
// mereka mau, seringkali berhari-hari setelah admin men-deploy-nya, jauh
// melampaui jendela 120/180 menit (2/3 jam) yang cukup untuk uji end-to-end
// CLI. BAWAAN 120/180 TIDAK BERUBAH — jadwal-artefak-wiring.test.ts mengunci
// bahwa e2e.ts dan deploy-ballot.ts tetap mengimpor KEDUA nama di bawah dari
// SATU modul ini, bukan mendefinisikan salinan sendiri; uji itu membaca
// SUMBER kedua berkas itu sebagai teks dan tidak peduli bagaimana modul INI
// menghitung nilainya, jadi menambah logika di sini tidak menyentuhnya sama
// sekali. Override hanya aktif ketika env var yang bersangkutan disetel
// (string kosong/whitespace diperlakukan sama seperti tidak disetel).
// Validasi (bilangan bulat positif, TALLY > VOTE) WAJIB lolos di sini,
// SEBELUM deploy-ballot.ts/e2e.ts membangun metadata apa pun:
// `tallyDeadline > voteDeadline` dituntut kontrak (constructor
// ballot.compact) — gagal DI SINI (sebelum wallet/seed disentuh sama
// sekali, lihat urutan impor di deploy-ballot.ts) jauh lebih murah daripada
// gagal setelah membayar deploy. Dipakai admin mis. untuk penjurian:
// `VOTEPRIV_MENIT_VOTE=10080 VOTEPRIV_MENIT_TALLY=12960 pnpm cli deploy-ballot`
// (7 hari voting + 2 hari tambahan sebelum tally ditutup).
const MENIT_VOTE_BAWAAN = 120;
const MENIT_TALLY_BAWAAN = 180;

/**
 * Satu env var jadwal sebagai bilangan bulat POSITIF, atau `undefined` bila
 * tidak disetel (atau hanya whitespace). Melempar bila disetel tapi BUKAN
 * bilangan bulat positif — silent fallback ke bawaan pada nilai yang jelas
 * salah ketik ("10080x", "-5", "0", "10.5") lebih berbahaya daripada gagal
 * keras: penyelenggara mengira sudah memperpanjang jendela penjurian padahal
 * proses baru saja diam-diam memakai 120/180 menit yang lama.
 */
function menitPositifDariEnv(namaEnv: string, mentah: string | undefined): number | undefined {
  if (mentah === undefined || mentah.trim() === "") return undefined;
  const n = Number(mentah);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${namaEnv} must be a positive integer (minutes); got "${mentah}".`);
  }
  return n;
}

/**
 * Dipisah dari kedua `export const` di bawah supaya bisa diuji dengan `env`
 * palsu (jadwal.test.ts) tanpa memutasi `process.env` global — pola sama
 * dengan `modeTanpaPendaftaranAktif`/`eligibleCountDariEnv` (pendaftaran-awal.ts).
 */
export function hitungJadwal(
  env: NodeJS.ProcessEnv = process.env,
  bawaanVote = MENIT_VOTE_BAWAAN,
  bawaanTally = MENIT_TALLY_BAWAAN,
): { menitVote: number; menitTally: number } {
  // Nama publik (Inggris) didahulukan; nama Indonesia lama tetap diterima
  // sebagai alias supaya skrip yang sudah ada tidak putus.
  const menitVote =
    menitPositifDariEnv("VOTEPRIV_VOTE_MINUTES", env.VOTEPRIV_VOTE_MINUTES) ??
    menitPositifDariEnv("VOTEPRIV_MENIT_VOTE", env.VOTEPRIV_MENIT_VOTE) ??
    bawaanVote;
  const menitTally =
    menitPositifDariEnv("VOTEPRIV_TALLY_MINUTES", env.VOTEPRIV_TALLY_MINUTES) ??
    menitPositifDariEnv("VOTEPRIV_MENIT_TALLY", env.VOTEPRIV_MENIT_TALLY) ??
    bawaanTally;

  // Kontrak menuntut tallyDeadline > voteDeadline (constructor ballot.compact) —
  // ditegakkan DI SINI juga, bukan hanya diserahkan ke kontrak, supaya deploy
  // yang pasti akan ditolak gagal sebelum membayar transaksi apa pun.
  if (menitTally <= menitVote) {
    throw new Error(
      `VOTEPRIV_TALLY_MINUTES (${menitTally} min) must be greater than VOTEPRIV_VOTE_MINUTES (${menitVote} min) — ` +
        "the contract requires tallyDeadline > voteDeadline.",
    );
  }

  if (menitVote !== bawaanVote || menitTally !== bawaanTally) {
    // Tidak ada logger pino di sini (modul ini dimuat SEBELUM siapkanSesi
    // membangunnya) — console.log satu baris, pola sama dengan doctor.ts.
    console.log(
      `Ballot schedule overridden from env: VOTEPRIV_VOTE_MINUTES=${menitVote} VOTEPRIV_TALLY_MINUTES=${menitTally} ` +
        `(defaults ${bawaanVote}/${bawaanTally}).`,
    );
  }

  return { menitVote, menitTally };
}

const jadwalEfektif = hitungJadwal();

export const MENIT_VOTE = jadwalEfektif.menitVote;
export const MENIT_TALLY = jadwalEfektif.menitTally;

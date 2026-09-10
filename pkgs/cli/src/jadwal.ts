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
export const MENIT_VOTE = 60;
export const MENIT_TALLY = 95;

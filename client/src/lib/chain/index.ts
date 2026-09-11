/**
 * Permukaan publik lapis rantai — BACA-SAJA.
 *
 * Tidak ada satu pun ekspor di sini yang menandatangani, mengirim transaksi,
 * menyusun witness, atau menyentuh wallet. Jalur TULIS adalah C-2b dan
 * RENCANANYA masuk lewat SATU pintu yang terpisah:
 * client/src/lib/chain/jalur-tulis.ts, di balik dynamic import. Berkas itu
 * BELUM ADA di pohon ini — C-2b belum dikerjakan — jadi ini niat, bukan
 * struktur yang sudah berdiri.
 *
 * Batas itu bukan dokumentasi belaka, tapi juga BUKAN sesuatu yang sudah
 * dibuktikan angka di berkas ini: jalur tulis akan menyeret ledger-v8
 * (10.143.782 B) lewat paket midnight-js-*, dan rencana C-2a Task 9
 * dimaksudkan untuk menggerbangi itu lewat gerbang ukuran bundel — TAPI Task
 * 9 belum dijalankan dan jalur-tulis.ts belum ada untuk diukur. Sebelumnya
 * paragraf ini mengklaim "TERBUKTI: muat awal tetap 1.451.420 B, dan
 * 10.932.682 B baru turun saat jalur tulis dipicu" — klaim itu tidak punya
 * dasar pengukuran atas berkas yang tidak ada, dan dihapus di sini. Gerbang
 * ukuran bundel sungguhan, atas pemisahan yang sungguhan, adalah pekerjaan
 * Task 9.
 */
export { jaringanAktif, alamatKontrakValid, ALAMAT_REGISTRY_BAWAAN, JARINGAN_BAWAAN } from "./endpoint";
export type { JaringanAktif } from "./endpoint";
export { GalatRantai } from "./graphql";
export type { SebabGalatRantai } from "./graphql";
export { bacaRantai } from "./baca-rantai";
export type { HasilRantai, BallotTerbaca, BallotGagal, AksiTerbaca, PerubahanAksi } from "./baca-rantai";
export type { BlokAksi } from "./kueri";

/**
 * KEPUTUSAN SADAR: tidak satu pun NILAI dari ./dekode diekspor ulang di sini —
 * termasuk `padatkanTallies`, walau ia sendiri murni (tidak menyentuh
 * ContractState atau ledger() sama sekali).
 *
 * JUJUR SOAL APA YANG ABSTENSI INI BELI, dan apa yang TIDAK: `export {
 * bacaRantai }` sepuluh baris di atas SUDAH menarik dekode.ts secara
 * transitif (bacaRantai() memanggil dekodeBallot/dekodeRegistry langsung),
 * dan dekode.ts itulah satu-satunya berkas yang mengimpor WASM
 * (onchain-runtime-v3, 1.321.366 B) di tingkat MODUL. Barrel ini karena itu
 * SUDAH menyeret WASM lewat bacaRantai, hari ini, terlepas dari apa pun yang
 * terjadi pada padatkanTallies. Tidak meng-ekspor-ulang padatkanTallies TIDAK
 * mengubah itu — ia tidak "menjaga barrel ini bebas WASM", karena barrel ini
 * sudah tidak bebas WASM sejak baris `export { bacaRantai }`. Yang benar-benar
 * dibeli abstensi ini sempit: mencegah pengimpor yang HANYA butuh
 * padatkanTallies (tanpa bacaRantai sama sekali) menariknya lewat barrel ini
 * alih-alih lewat "./dekode" langsung — sinyal kecil untuk pembaca kode, bukan
 * gerbang ukuran bundel.
 *
 * Klaim "TERBUKTI" yang sebelumnya ada di sini soal pemisahan kode sudah
 * dihapus: tidak ada pengukuran bundel apa pun di pohon ini hari ini yang
 * mengukur "padatkanTallies diekspor lewat sini" vs "tidak", dan
 * batas-bundel.test.ts (Task 9) belum ada. Gerbang UKURAN BUNDEL SUNGGUHAN
 * yang membuktikan pemisahan jalur baca/tulis (bukan pertanyaan
 * padatkanTallies ini) baru dipasang Task 9, lewat atribusi per-chunk yang
 * benar-benar dibangun — bukan lewat asumsi tree-shaking di sini.
 *
 * Konsekuensinya eksplisit: siapa pun yang benar-benar memanggil
 * padatkanTallies (Task 6, untuk menampilkan hasil tally) mengimpornya
 * LANGSUNG dari "./dekode", bukan dari barrel ini.
 *
 * Hanya TIPE dari dekode.ts yang diekspor ulang: `export type` terhapus total
 * saat kompilasi TypeScript, jadi ia tidak pernah menarik WASM apa pun, berapa
 * pun banyaknya pengimpor barrel ini.
 */
export type { KeadaanBallot, FaseBallot } from "./dekode";

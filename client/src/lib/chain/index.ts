/**
 * Permukaan publik lapis rantai — BACA-SAJA.
 *
 * Tidak ada satu pun ekspor di sini yang menandatangani, mengirim transaksi,
 * menyusun witness, atau menyentuh wallet. Jalur TULIS adalah C-2b dan masuk
 * lewat SATU pintu yang terpisah: client/src/lib/chain/jalur-tulis.ts, di balik
 * dynamic import. Nama keempat operasinya sengaja TIDAK ditulis di berkas ini —
 * lihat catatan di bawah blok ekspor.
 *
 * Batas itu bukan dokumentasi. Ia dijaga gerbang ukuran bundel: jalur tulis
 * menyeret ledger-v8 (10.143.782 B) lewat paket midnight-js-*, dan gerbang di
 * rencana C-2a Task 9 gagal bila satu bita pun dari paket itu masuk ke chunk
 * masuk. Pemisahan kodenya TERBUKTI: muat awal tetap 1.451.420 B, dan
 * 10.932.682 B baru turun saat jalur tulis dipicu.
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
 * Alasannya bukan tentang padatkanTallies, melainkan tentang BERKAS tempat ia
 * hidup: dekode.ts mengimpor WASM (onchain-runtime-v3, 1.321.366 B) di tingkat
 * MODUL, lewat ContractState dan dua accessor ledger() tergenerasi. Re-ekspor
 * NILAI apa pun dari sana lewat barrel ini berarti SETIAP pengimpor barrel —
 * termasuk yang hanya ingin GalatRantai untuk merender pesan galat, atau
 * jaringanAktif() untuk baris status — berisiko menarik WASM itu, bergantung
 * seberapa agresif bundler menyusutkan rantai re-ekspor. Task 9 menggerbangi
 * ini lewat UKURAN BUNDEL SUNGGUHAN yang benar-benar dibangun, bukan lewat
 * asumsi bahwa tree-shaking pasti bekerja — jadi kepastian STRUKTURAL (barrel
 * ini secara tekstual tidak pernah menyentuh nilai dekode.ts) lebih aman
 * daripada berharap.
 *
 * Konsekuensinya eksplisit: siapa pun yang benar-benar memanggil
 * padatkanTallies (Task 6, untuk menampilkan hasil tally) mengimpornya
 * LANGSUNG dari "./dekode", bukan dari barrel ini. Impor langsung itu memang
 * SENGAJA terlihat di titik pemanggilannya — ia mengakui secara eksplisit
 * bahwa WASM ikut termuat di sana, alih-alih menyembunyikannya di balik
 * fasad "baca-saja tanpa WASM" yang barrel ini coba jaga untuk pengimpor lain.
 *
 * Hanya TIPE dari dekode.ts yang diekspor ulang: `export type` terhapus total
 * saat kompilasi TypeScript, jadi ia tidak pernah menarik WASM apa pun, berapa
 * pun banyaknya pengimpor barrel ini.
 */
export type { KeadaanBallot, FaseBallot } from "./dekode";

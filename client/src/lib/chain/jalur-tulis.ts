/**
 * SATU-SATUNYA pintu ke jalur TULIS (C-2b): castVote, tallyVote, createBallot,
 * finalize.
 *
 * Jalur tulis akan menyeret ledger-v8 (10.143.782 B, diukur langsung dari
 * node_modules/.pnpm di pohon ini — lihat task-9-report.md) lewat paket
 * midnight-js-*, plus wallet, proof server, dan artefak ZK. Membuatnya masuk
 * lewat impor STATIS berarti setiap pembaca yang hanya ingin melihat hasil
 * ballot mengunduh belasan megabyte untuk sesuatu yang tidak pernah ia pakai.
 *
 * ATURAN UNTUK C-2b, dan ia dijaga mesin oleh batas-bundel.test.ts (jalur
 * SUMBER, lewat keterjangkauan statis dari entri) dan
 * scripts/ukur-batas-bundel.mjs (jalur KELUARAN, lewat atribusi per-chunk atas
 * dist/public/.vite/manifest.json):
 *
 *   1. Modul ./tulis TIDAK BOLEH diimpor secara statis dari mana pun,
 *      termasuk dari berkas ini sendiri.
 *   2. Satu-satunya cara memuatnya adalah `await muatJalurTulis()` di bawah,
 *      lewat `await import("./tulis")` di dalam BADAN fungsi.
 *   3. Tanda tangan publik berkas ini hanya memakai tipe milik sendiri.
 *      Tidak boleh ada satu pun `import type` dari ledger-v8/midnight-js di
 *      jalur statis dari entri — satu yang tak sengaja menjadi impor NILAI
 *      membatalkan seluruh pemisahan.
 *   4. Pemanggilnya harus menampilkan keadaan memuat: unduhan belasan
 *      megabyte di jaringan biasa memakan waktu yang terasa, dan tombol yang
 *      diam selama itu terbaca sebagai tombol yang rusak.
 *
 * CATATAN JUJUR (Task 9, praperiksa & ruling penutup): rencana C-2a di
 * beberapa tempat menyebut "batas dynamic import yang sudah terpasang dan
 * sudah dijaga mesin" seolah itu sudah lama berdiri. Itu TIDAK AKURAT
 * terhadap pohon sebelum task ini: sampai Task 9 dikerjakan, tidak ada satu
 * pun dynamic import di client/src dan tidak ada satu pun gerbang ukuran
 * bundel sama sekali — index.ts sendiri mendokumentasikan ini sebagai niat,
 * bukan struktur. Berkas inilah pintu itu yang PERTAMA KALI benar-benar ada,
 * dan batas-bundel.test.ts serta scripts/ukur-batas-bundel.mjs adalah
 * gerbang mesin yang PERTAMA KALI benar-benar berdiri. C-2b karena itu
 * mewarisi NIAT yang sudah benar, bukan struktur yang sudah lama teruji.
 *
 * STATUS (Task 6, C-2b): `./tulis.ts` kini ADA dan mengisi `kirimSuara`
 * (castVote ujung ke ujung). Keempat aturan di atas berlaku SELAMANYA untuk
 * pintu ini — bukan hanya sampai C-2b selesai: tugas berkas ini adalah
 * menjaga batas bundel baca/tulis, dan itu tetap relevan sepanjang tallyVote,
 * createBallot, dan finalize (Task 7 dst.) menyusul masuk ke ./tulis.ts lewat
 * pintu yang sama. Menghapus dynamic import ini demi kenyamanan "toh sudah
 * ada pemakainya sekarang" akan mengembalikan belasan megabyte ledger-v8 ke
 * setiap pembaca yang hanya ingin melihat hasil ballot.
 */

/** true — C-2b sudah mengisi ./tulis.ts. */
export const JALUR_TULIS_SIAP = true;

export async function muatJalurTulis(): Promise<typeof import("./tulis")> {
  return import("./tulis");
}

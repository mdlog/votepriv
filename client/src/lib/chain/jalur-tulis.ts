/**
 * SATU-SATUNYA pintu ke jalur TULIS: castVote, tallyVote (createBallot dan
 * finalize tetap lewat CLI — lihat Keputusan #1 rencana C-2b, dan lihat
 * kirimSuara/bukaSuara di ./tulis.ts untuk implementasinya).
 *
 * Jalur tulis menyeret ledger-v8 (10.143.782 B, diukur langsung dari
 * node_modules/.pnpm di pohon ini) lewat paket midnight-js-*, plus wallet,
 * proof server, dan artefak ZK. Membuatnya masuk lewat impor STATIS berarti
 * setiap pembaca yang hanya ingin melihat hasil ballot mengunduh belasan
 * megabyte untuk sesuatu yang tidak pernah ia pakai.
 *
 * ATURAN INI BERLAKU SELAMANYA untuk pintu ini — bukan hanya sampai C-2b
 * selesai — dan dijaga MESIN oleh batas-bundel.test.ts (jalur SUMBER, lewat
 * keterjangkauan statis dari entri) dan scripts/ukur-batas-bundel.mjs (jalur
 * KELUARAN, lewat atribusi per-chunk atas dist/public/.vite/manifest.json):
 *
 *   1. Modul ./tulis TIDAK BOLEH diimpor secara statis dari mana pun,
 *      termasuk dari berkas ini sendiri.
 *   2. Satu-satunya cara memuatnya adalah `await muatJalurTulis()` di bawah,
 *      lewat `await import("./tulis")` di dalam BADAN fungsi.
 *   3. Tanda tangan publik berkas ini hanya memakai tipe milik ./tulis
 *      sendiri lewat `typeof import(...)` — tidak pernah `import type` dari
 *      ledger-v8/midnight-js secara statis, sebab satu yang tak sengaja
 *      menjadi impor NILAI membatalkan seluruh pemisahan.
 *   4. Pemanggilnya (VoteModal.tsx) HARUS menampilkan keadaan memuat:
 *      unduhan belasan megabyte di jaringan biasa memakan waktu yang terasa,
 *      dan tombol yang diam selama itu terbaca sebagai tombol yang rusak.
 *
 * CATATAN JUJUR (asal-usul gerbang ini, ditulis Task 9): rencana C-2a di
 * beberapa tempat menyebut "batas dynamic import yang sudah terpasang dan
 * sudah dijaga mesin" seolah itu sudah lama berdiri. Itu TIDAK AKURAT
 * terhadap pohon sebelum C-2b: sampai berkas ini ditulis (Task 3), tidak ada
 * satu pun dynamic import di client/src dan tidak ada satu pun gerbang ukuran
 * bundel sama sekali — index.ts sendiri mendokumentasikan ini sebagai niat,
 * bukan struktur. Berkas inilah pintu itu yang PERTAMA KALI benar-benar ada.
 * `./tulis.ts` sendiri mengisi kirimSuara (castVote, Task 6) dan bukaSuara
 * (tallyVote, Task 7) — keduanya, dan HANYA keduanya, sesuai lingkup
 * Keputusan #1: createBallot/finalize tidak pernah masuk sini.
 */
export const JALUR_TULIS_SIAP = true;

export async function muatJalurTulis(): Promise<typeof import("./tulis")> {
  return import("./tulis");
}

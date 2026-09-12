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
 * Berkas ini BELUM memanggil apa pun yang nyata: tidak ada pemakai di pohon
 * C-2a. `muatJalurTulis()` sengaja melempar (lihat di bawah), dan
 * `JALUR_TULIS_SIAP` sengaja `false`. Mengisinya adalah pekerjaan C-2b.
 */

/** false sampai C-2b menaruh ./tulis.ts di sebelah berkas ini dan mengisi fungsi di bawah. */
export const JALUR_TULIS_SIAP = false;

/**
 * Tipe kembaliannya `Promise<never>` dan BUKAN `Promise<typeof import("./tulis")>`:
 * modul `./tulis` belum ada, dan menuliskan tipe yang menunjuk berkas yang
 * tidak ada membuat `pnpm check` merah. C-2b yang mengganti tanda tangannya
 * ketika modulnya lahir — pada saat itulah `await import("./tulis")`
 * sungguhan masuk ke sini, bukan sebelumnya.
 */
export async function muatJalurTulis(): Promise<never> {
  // Sengaja melempar, bukan mengembalikan modul palsu: modul palsu yang
  // "berhasil" akan membuat UI menampilkan tanda terima untuk transaksi yang
  // tidak pernah ada — tepat kesalahan yang C-1 buang dari VoteModal.
  throw new Error(
    "Jalur tulis belum ada. Ia dibangun di Rencana C-2b (castVote, tallyVote, createBallot, finalize) " +
      "dan masuk lewat dynamic import di berkas ini, bukan lewat impor statis.",
  );
}

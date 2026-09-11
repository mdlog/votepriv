# Garis dasar pra-pemecahan — JANGAN SUNTING

`HomePraPecah.tsx` adalah salinan bita-per-bita `client/src/pages/Home.tsx`
sebelum Rencana C-1 menyentuhnya.

| | |
|---|---|
| Sumber | `client/src/pages/Home.tsx` |
| Commit | f9a38b311ae19a8e851c0133d7bd3547687a679f |
| Cabang | feat/fondasi-kontrak |
| Tanggal beku | 2026-09-11T15:53:10+08:00 |
| sha256 | bdb0d2d6d16759988a7423b4ae2c76ed27d957a21ff955c06f083a62ff3af812 |
| Ukuran | 391 baris, 33.441 bita |

Berkas ini punya dua tugas, dan keduanya rusak bila ia disunting:

1. **Nilai "sebelum" pada uji paritas.** Uji merender berkas ini dan `Home.tsx`
   hidup di proses yang sama, lalu membandingkan kelas, garis besar DOM, dan
   teksnya. Menyunting berkas ini berarti menggerakkan garis dasarnya sendiri,
   dan ujinya berhenti menjaga apa pun.
2. **Sumber potongan.** `scripts/pindah-komponen.mjs` memotong blok komponen
   dari berkas ini, bukan dari `Home.tsx` — nomor baris di `Home.tsx` bergeser
   setiap kali satu blok diangkat, nomor baris di sini tidak pernah.

Berkas ini dihapus pada Task 8 C-1, setelah rekamannya dibekukan ke
`client/src/test/garis-dasar-tampilan.json`.

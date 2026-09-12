# Perbaikan: `balanceUnsealedTransaction` yang benar, dan bentuk balik `{ tx: hex }`

## Fakta pemicu, dibaca verbatim dari bundel ekstensi Lace 2.3.2 terpasang

`~/.config/BraveSoftware/Brave-Browser/Default/Extensions/gafhhkghbfjjkeiendhlofajokpaflmk/2.3.2_0/js/119.js`:

```js
deserializeSealedTransaction   -> deserialize("signature","proof","binding",     Buffer.from(e,"hex"))
deserializeUnsealedTransaction -> deserialize("signature","proof","pre-binding", Buffer.from(e,"hex"))
```

"sealed"/"unsealed" menunjuk status BINDING, bukan proof — keduanya menuntut transaksi
yang sudah dibuktikan. Transaksi yang kita kirim ke `balanceTx` adalah
`UnboundTransaction = Transaction<SignatureEnabled, Proof, PreBinding>`
(`midnight-js-types@4.0.4 dist/proof-provider.d.ts:2`, diverifikasi langsung) — pre-binding.
Jadi metode yang benar adalah `balanceUnsealedTransaction`. `adaptor-lace.ts:159`
sebelumnya mencoba `balanceSealedTransaction` lebih dulu — satu pilihan urutan array
yang salah, dan itu seluruh penyebab galat header tag.

Bug kedua: kedua jalur balance di `js/119.js` berakhir identik —
`Promise.resolve({ tx: Buffer.from(w.serialize()).toString("hex") })` — SETELAH
signRecipe+finalizeRecipe (sudah bound). Kode lama memperlakukan objek itu sebagai
transaksi jadi dan mengembalikannya apa adanya; salah, karena `{ tx: hex }` harus
di-unwrap dan dideserialisasi dengan marker `"binding"`.

Privasi (js/5842.js, `case "UNBOUND_TRANSACTION"`): `finalizeTransaction` (memanggil
`provingService.prove`) hanya dikenakan pada `balancingTransaction` milik wallet;
`baseTransaction` (tx dApp kita) hanya `.bind()`. Witness kita tidak pernah masuk
proof server Lace. `balanceUnprovenTransaction` (jalur yang benar-benar minta witness)
tidak ada di kelas yang diekspos konektor (`js/119.js`) — tidak terjangkau dari dApp.

Versi ledger: sha256 `midnight_ledger_wasm_bg.wasm` kita == sha256 `.wasm` Lace 2.3.2
(`88ff7c7c47c30138ee8f3a0c8bcbf12dbdcdeba591edebfb955c30d732ea7638`, dua-duanya) —
build identik, bukan spekulasi versi. Tidak ditemukan komentar/catatan lama di repo
yang berspekulasi soal ketidakcocokan versi ledger, jadi tidak ada yang perlu dikoreksi
pada titik itu.

## Bentuk perbaikan

`client/src/lib/chain/adaptor-lace.ts`:

1. `KANDIDAT_BALANCE`: urutan dibalik ke `["balanceUnsealedTransaction", "balanceSealedTransaction"]`,
   dengan alasan dikutip dari marker Lace di komentar (bukan sekadar tukar urutan).
   "sealed" dipertahankan sebagai fallback nama metode saja — Lace nyata selalu
   mendaftarkan keduanya, jadi fallback ini tidak pernah tereksekusi pada Lace.
2. `normalisasiHasilBalance`: cabang baru `{ tx: string }` — di-unwrap via `bytesDariHex`
   lalu `transaksiDariBytes` (marker `"binding"`, BUKAN `"pre-binding"`), ditempatkan
   SEBELUM passthrough objek generik.
3. Komentar kepala berkas ditulis ulang: mengoreksi penafsiran keliru "sealed cocok
   dengan tx yang sudah dibuktikan", menambahkan kutipan verbatim bundel Lace, catatan
   privasi dengan sumber, dan konfirmasi sha256 ledger identik.
4. Dipertahankan tanpa perubahan perilaku: serialisasi saat masuk, `TransactionId` via
   `identifiers()` lokal, `panggilWajib`/`cariMetode`, tidak ada `as any`/`as unknown as X`.

## Gerbang mutasi

Metode: mutasi manual satu per satu di atas fix yang sudah lolos seluruh uji,
`vitest run client/src/lib/chain/adaptor-lace.test.ts` dijalankan tiap kali, file
dipulihkan ke versi FIX (bukan ke HEAD lama — fix belum di-commit) di antara tiap mutasi.

### Tabel 1 — Mutasi WAJIB (diminta eksplisit)

| # | Mutasi | Hasil |
|---|---|---|
| a | Kembalikan urutan `KANDIDAT_BALANCE` ke sealed-dulu | **MERAH** (1 uji gagal) |
| b | `{ tx: hex }` diperlakukan sebagai transaksi jadi (hapus cabang unwrap) | **MERAH** (1 uji gagal) |

### Tabel 2 — Guard lain, diturunkan dari kode yang berubah

| # | Mutasi | Lokasi | Hasil |
|---|---|---|---|
| M3 | Marker `"binding"` → `"pre-binding"` di `transaksiDariBytes` | `transaksiDariBytes` | **MERAH** (2 uji gagal) |
| M4 | Urutan cabang `{ tx }` dipindah ke SETELAH passthrough objek generik | `normalisasiHasilBalance` | **MERAH** (1 uji gagal) |
| M5 | `KANDIDAT_BALANCE` dipersempit ke `["balanceUnsealedTransaction"]` (fallback dihapus) | `KANDIDAT_BALANCE` | **MERAH** (6 uji gagal) |
| M6 | Guard `typeof tx === "string"` dibalik jadi `!== "string"` | `normalisasiHasilBalance` | **MERAH** (5 uji gagal) |

Keenam mutasi MERAH. File dipulihkan persis ke versi fix setelah tiap mutasi
(diverifikasi `diff` kosong).

## Uji

`adaptor-lace.test.ts`: 17 uji (dari 16), termasuk mock `deserializeSepertiWasm` yang
menolak marker binding yang salah dengan pesan `expected header tag '<X>', got '<Y>'`
(bentuk pesan dikutip dari `strings` atas `midnight_ledger_wasm_bg.wasm` terpasang —
byte-identik dengan wasm Lace, sha256 di atas), dan uji bentuk `{ tx: hex }` nyata.
Uji "mencoba sealed lebih dulu" yang lama (mengasumsikan perilaku SALAH) diganti
menjadi "mencoba unsealed lebih dulu".

Seluruh klien: **37 berkas, 478 lolos + 2 dilewati** (naik dari 477+2, netto +1).
CLI: **10 berkas, 153 lolos** (tidak berubah — di luar cakupan perbaikan ini).
`tsc --noEmit` (root + `tsconfig.uji.json`): bersih, exit 0.

## Gerbang bundel (verbatim)

```
 RUN  v2.1.9 /home/mdlog/Project-MDlabs/Akindo/votepriv

 ✓ client/src/lib/chain/batas-bundel.test.ts (4 tests) 9ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## `pnpm build`

Selesai, exit 0, `dist/` dimutakhirkan (`vite build` + esbuild server). Peringatan
yang muncul (chunk WASM >500kB, modul Node dieksternalisasi untuk browser) sudah ada
sebelum perbaikan ini dan tidak terkait.

## SHA commit

Lihat `git log -1` setelah commit perbaikan ini dibuat di branch `feat/fondasi-kontrak`.

## Belum terverifikasi

Nilai balik `submitTransaction` sungguhan (kode `js/119.js` menunjukkan `return [2]`
tanpa nilai/void, selaras dengan fallback `identifiers()` yang sudah ada, tapi belum
dipicu lewat submit sungguhan ke Lace). Bentuk balance selain `{ tx: hex }` (string
hex telanjang, bytes, objek `Transaction` mentah) belum pernah teramati dari Lace,
tetap ditangani secara umum untuk wallet lain yang mungkin memakai adaptor ini.
Teks pesan galat wasm untuk tag yang salah dikutip dari `strings` atas `.wasm`
terpasang (format `expected header tag '<X>', got '<Y>'`), bukan diklaim sebagai
teks persis yang dilihat pengguna (representasi tag internal tidak diekstrak).

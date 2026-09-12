# Dev server gagal memuat jalur tulis (C-2b) — optimizeDeps

## Penyebab terkonfirmasi

Jalur tulis (`tulis.ts`) hanya pernah dijangkau lewat `await import("./tulis")` di
`jalur-tulis.ts` saat pengguna menekan "generate proof" — tidak pernah lewat impor
statis dari `client/src/main.tsx` (`batas-bundel.test.ts` menegakkan ini secara
eksplisit). Karena itu paket-paket yang HANYA dipakai `tulis.ts` dan turunannya
tidak selalu ikut daftar `optimizeDeps` awal yang dibangun scanner esbuild bawaan
Vite dari entri statis. Sebelum perbaikan ini, `vite.config.ts` sama sekali tidak
mendeklarasikan `optimizeDeps` — jadi Vite baru menemukan paket-paket itu secara
MALAS saat dynamic-import pertama, memicu re-optimize DI TENGAH permintaan itu
sendiri. Race itulah yang membuat permintaan mati dengan 504 "Outdated Optimize
Dep" (`/@fs/.../node_modules/.vite/deps/@midnight-ntwrk_midnight-js-contracts.js`
mengembalikan 504 karena berkasnya belum ada di disk) — persis gejala yang
dilaporkan.

## Perbaikan

`vite.config.ts` — tambah `optimizeDeps.include` untuk sembilan paket RUNTIME
(bukan `import type`, yang dihapus esbuild dan tidak pernah memicu request modul)
yang terjangkau dari `tulis.ts` dan turunannya (`providers-tulis.ts`,
`kontrak-tulis.ts`):

```
@midnight-ntwrk/midnight-js-contracts
@midnight-ntwrk/midnight-js-network-id
@midnight-ntwrk/midnight-js-types
@midnight-ntwrk/midnight-js-http-client-proof-provider
@midnight-ntwrk/midnight-js-indexer-public-data-provider
@midnight-ntwrk/midnight-js-utils
@midnight-ntwrk/compact-js
@midnight-ntwrk/compact-runtime
@midnight-ntwrk/ledger-v8
```

Daftar ini dipetakan dari `package.json` tiap paket (bukan tebakan): `ledger-v8`
dan `compact-runtime` (pembawa WASM) masuk daftar karena keduanya dependency
langsung `compact-js`, yang diimpor langsung (`CompiledContract`, bukan `import
type`) oleh `kontrak-tulis.ts`. `onchain-runtime-v3`/`zkir-v2` (juga WASM, dependency
`compact-runtime`) SENGAJA tidak didaftar: keduanya tidak di-hoist ke
`node_modules` akar workspace di pohon pnpm repo ini (persis alasan yang sama
yang membuat `resolve.dedupe` di file yang sama juga tidak menyertakan
`onchain-runtime-v3` — lihat komentar `dedupe` di `vite.config.ts`), jadi
mendaftarkannya sebagai bare specifier di `optimizeDeps` akan gagal resolve.

## Kedua percobaan — bukti empiris

Metodologi: dev server sungguhan di port percobaan (5273-5275, bukan 5180),
`cacheDir` terisolasi (tidak pernah menyentuh `node_modules/.vite` milik server
lain), lalu crawler Node (`fetch` bawaan, tanpa dependency) yang:
1. mengambil `tulis.ts` di URL nyata (`/src/lib/chain/tulis.ts`),
2. mengurai SEMUA specifier impor (statis + `import()`) dari teks yang
   dikembalikan,
3. me-resolve tiap specifier relatif terhadap URL saat ini (menghormati
   `/@fs/...`, `/@id/...`, `./`, `../`),
4. mengambil URL itu, mengulangi rekursif ke seluruh graf yang tercapai,
5. mengassert nihil status 404/504 (atau error koneksi) di URL manapun.

Server dinyalakan SATU per SATU (tidak pernah dua sekaligus), dimatikan lewat
PID yang dicatat sebelum percobaan berikutnya. Port 5180 (server produksi
operator — `node dist/index.js`, bukan Vite dev server, jadi tidak pernah
memakai `node_modules/.vite/deps` sama sekali) tidak pernah disentuh.

### Percobaan 1 — `optimizeDeps.include`

```
200      38836B  /src/lib/chain/tulis.ts
200      48229B  /@fs/.../node_modules/.vite-exp-include/deps/@midnight-ntwrk_midnight-js-contracts.js?v=...
200       1710B  .../deps/@midnight-ntwrk_midnight-js-network-id.js?v=...
200       7408B  .../deps/@midnight-ntwrk_midnight-js-types.js?v=...
200      16810B  /@fs/.../pkgs/contract/src/ballot-witnesses.ts
200     323606B  /@fs/.../pkgs/contract/src/managed/ballot/contract/index.js
200       4573B  /@fs/.../pkgs/shared/src/network-config.ts
200      20299B  /src/lib/proof-server.ts
200      12464B  /src/lib/chain/adaptor-lace.ts
200      10578B  /src/lib/chain/eligibility-tulis.ts
200       3457B  /src/lib/chain/kontrak-tulis.ts
200      19158B  /src/lib/chain/private-state-idb.ts
200       5007B  /src/lib/chain/providers-tulis.ts
200      11976B  /src/lib/chain/zk-config-fetch.ts
... (13 chunk/dep .vite-exp-include tambahan, semuanya 200)

Total modul dikunjungi: 27
BERSIH: nihil 404/504 di seluruh graf yang dikunjungi.
```

WASM `ledger-v8` (transitif lewat `compact-js`) ikut ter-bundel esbuild TANPA
masalah: `chunk-QWI22IB3.js` (13.898.127 B — dekat dengan 10.143.782 B WASM
ledger dikali ~4/3 overhead base64) diperiksa manual dan berisi marker
`vite-plugin-wasm-namespace:`, panggilan `WebAssembly.instantiate`/
`instantiateStreaming`, dan literal `data:application/wasm;base64,...` —
WASM disisipkan LANGSUNG di dalam chunk, TIDAK ADA permintaan aset `.wasm`
terpisah yang bisa 404 di runtime. Kekhawatiran teori "pra-bundel merusak
pemuatan aset WASM" TIDAK terbukti untuk `vite-plugin-wasm` + Vite 7.1.9 di
sini.

Cold-cache timing (crawl penuh, cache baru dihapus sebelum start): **0,913 detik**.

### Percobaan 2 — `optimizeDeps.exclude`

Juga bersih (nihil 404/504), tapi jauh lebih berat: **1.059 modul dikunjungi**
(setiap berkas ESM tiap paket disajikan satu-satu lewat `/@fs/`, termasuk paket
yang sama sekali tidak relevan seperti `fast-check`/`pure-rand` yang ikut
terseret transitif lewat `effect`, dependency `compact-js`). WASM ledger-v8/
onchain-runtime-v3 disajikan sebagai aset `.wasm` sungguhan lewat
`?import`/`?import&url` — juga bersih, tapi lewat mekanisme berbeda (fetch
network nyata ke berkas `.wasm`, bukan base64 inline).

Cold-cache timing (crawl penuh, cache baru dihapus sebelum start): **3,481 detik**
— 3,8x lebih lambat dan 39x lebih banyak request daripada `include`.

### Keputusan

`include` **menang di kedua kriteria**: sama-sama berhasil (nihil 404/504), dan
jauh lebih cepat (0,91s vs 3,48s) dengan permukaan jauh lebih kecil (27 vs 1.059
modul — tidak menyeret dependency test-only tak relevan ke sesi dev). `exclude`
tidak dipakai sama sekali.

### Verifikasi ulang di `vite.config.ts` SUNGGUHAN (bukan salinan percobaan)

Setelah menambahkan `optimizeDeps.include` ke `vite.config.ts` asli, cache
`node_modules/.vite` dihapus, dev server dinyalakan di port percobaan (5273),
dan crawl yang sama diulang — hasil identik: **27 modul, nihil 404/504**.

## Gerbang bundel produksi — bukti `optimizeDeps` tidak memengaruhi build

`optimizeDeps` hanya berlaku untuk dev server per arsitektur Vite (esbuild
pre-bundle dep untuk dev, Rollup yang membangun bundel produksi tidak pernah
membacanya) — dibuktikan, bukan diasumsikan: `pnpm build` dijalankan ulang dari
nol dengan `vite.config.ts` yang SUDAH memuat `optimizeDeps.include`, lalu
gerbang dijalankan atas hasilnya:

```
=== gerbang batas bundel (atribusi per-chunk, manifest.json) ===
wasm baca terpasang (onchain-runtime-v3) : 1321366 B
wasm terjangkau dari chunk ENTRI          : assets/midnight_onchain_runtime_wasm_bg-DLDy-U1U.wasm
js chunk terjangkau statis dari entri     : 555957 B  ( 1 chunk )
byte chunk JS jalur tulis                 : 911389 B
byte aset .wasm yang chunk itu picu        : 11465148 B
catatan                                    : chunk jalur tulis ditemukan sebagai entri dinamis manifest (assets/tulis-DfJWJAVB.js), TIDAK terjangkau statis dari entri — seperti seharusnya.
LULUS
```

Angka WASM ledger (10.143,78 kB) dan urutan besaran chunk jalur tulis (~910 kB)
cocok dengan baseline yang sudah diverifikasi sebelumnya di diagnosis awal;
selisih kecil pada byte chunk jalur tulis (910.614 B -> 911.389 B) berasal dari
perubahan TIDAK TERKAIT yang sedang berjalan bersamaan di `adaptor-lace.ts`
(commit lain, di luar lingkup perbaikan ini), bukan dari `optimizeDeps`.

## Penjagaan

Ditambahkan `client/src/lib/chain/optimize-deps-jalur-tulis.test.ts` — uji
STATIS (membaca teks `vite.config.ts`, tidak menjalankan dev server) yang
mengassert kesembilan paket jalur tulis ada di `optimizeDeps.include` dan TIDAK
ada di `optimizeDeps.exclude`. Terkonfirmasi merah terhadap `vite.config.ts`
lama: `git show f164ccc:vite.config.ts | grep -c optimizeDeps` = 0, jadi uji ini
pasti gagal di HEAD sebelum perbaikan (tidak ada blok `optimizeDeps` sama
sekali) dan hijau sesudahnya (diverifikasi: `npx vitest run
optimize-deps-jalur-tulis` -> 19/19 lolos).

**Uji live-server crawl SENGAJA TIDAK dijadikan uji otomatis rutin.** Alasannya
konkret, bukan malas: pada Vite 7.1.9 di sandbox verifikasi ini, scanner
bawaan Vite kadang sudah menemukan sendiri kesembilan dep ini dalam ~1 detik
setelah "ready" WALAU `optimizeDeps` kosong (lihat metadata baseline pada
percobaan di atas) — window race yang membuat kegagalan asli lolos ke pengguna
justru terletak PADA ketidakpastian timing itu sendiri (dan kemungkinan
diperparah kondisi mesin operator saat itu — dua dev server yang berebut cache,
sudah dihilangkan sebelum sesi ini). Menjadikan crawl-server-sungguhan sebagai
uji `pnpm test` rutin berarti:
- uji yang **flaky** (bisa hijau/merah bergantung timing scan vs. request, alih-alih bergantung pada kode yang diuji),
- **biaya nyata**: perlu menyalakan proses dev server sungguhan (colokan port, penulisan cache) tiap `pnpm test`, jauh dari filosofi 452 uji lain di suite ini yang murni node/jsdom.

Sebagai gantinya, penyebab STRUKTURAL-nya (deklarasi eksplisit di
`optimizeDeps`) yang dijaga lewat uji statis biaya-nol di atas, dan bukti
empiris graf-bersih untuk pilihan `include` didokumentasikan verbatim di
laporan ini alih-alih diam-diam dilewatkan.

## Ringkasan uji

- `pnpm check`: bersih.
- `pnpm check:uji`: bersih.
- `pnpm test` (klien): 37 berkas lolos, 2 dilewati (39) — 477 lolos, 2 dilewati (479). (Sebelum sesi ini: 36 berkas/452 lolos+2 dilewati; kenaikan berasal dari `optimize-deps-jalur-tulis.test.ts` baru di sini (19 uji) ditambah pekerjaan `adaptor-lace.test.ts` yang berjalan bersamaan, di luar lingkup perbaikan ini.)
- CLI: 10 berkas/153 lolos — tidak berubah.
- Gerbang bundel: LULUS (lihat keluaran verbatim di atas).

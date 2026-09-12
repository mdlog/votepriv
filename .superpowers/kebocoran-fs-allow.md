# Kebocoran fs.allow dev server Vite — perbaikan

Status: SELESAI, terverifikasi lewat tunnel publik. HEAD sebelum perbaikan: `a0b21ea`.

## Penyebab

`vite.config.ts` (`server.fs`) sebelumnya:

```js
fs: {
  strict: true,
  allow: [path.resolve(import.meta.dirname)], // SELURUH akar repo
  deny: ["**/.*"],
}
```

`allow` diisi eksplisit dengan seluruh akar repo, supaya modul kontrak
tergenerasi di `pkgs/contract` (di luar root Vite, yaitu `client/`) bisa
diresolusi. Ini alasan yang sah, tapi caranya salah: begitu `allow` diisi
eksplisit, Vite **mengganti** (bukan menggabung) nilai bawaan
`[searchForWorkspaceRoot(root)]` (lihat
`node_modules/vite/dist/node/chunks/dep-Chhhsdoe.js`, fungsi
`resolveServerOptions`) — jadi seluruh akar repo (termasuk `pkgs/cli/`,
`.manus-logs/`, `dist/`, dst.) ikut ter-allow.

`deny: ["**/.*"]` yang menyertainya TIDAK menutup ini. Diverifikasi langsung
di source Vite (`isFileLoadingAllowed` + `fsDenyGlob`, dikompilasi lewat
`picomatch(pattern, { dot: true })`): pola `"**/.*"` hanya cocok bila **segmen
TERAKHIR** suatu jalur mulai dengan titik. Ia tidak menembus ke DALAM
direktori titik — `.manus-logs/browserConsole.log` punya segmen terakhir
`browserConsole.log` (tidak diawali titik) sehingga ikut lolos juga — dan
sama sekali tidak menyentuh direktori bukan-titik seperti `pkgs/cli/`.

Akibatnya siapa pun yang menjangkau dev server ini — termasuk lewat tunnel
publik `https://votepriv.mdloglabs.org` (yang menyajikan Vite dev server di
port 5180) — bisa membaca APA SAJA di repo lewat `/@fs/<akar>/<jalur apa
pun>`, termasuk kredensial dompet CLI dan credential/salt/opening pemilih.

## Jalur yang diverifikasi (nama + ukuran, isi TIDAK pernah dibaca/dicetak)

Diverifikasi lewat `ls`/`find` (bukan `cat`), dan lewat status HTTP saja pada
pengujian dev server:

| Jalur | Ukuran | Isi |
|---|---|---|
| `pkgs/cli/wallet-cache/` | 96K (3 berkas di `preview/<hash>/`: `shielded.json` 4101B, `unshielded.json` 735B, `dust.json` 70780B) | kredensial dompet CLI |
| `pkgs/cli/private-state/` | 288K (LevelDB per pemilih: `preview/pemilih-0`, `pemilih-1`, `pemilih-2`, `admin`) | credential + salt + opening pemilih |
| `pkgs/cli/logs/` | 200K (log run CLI, `preview/`, `preprod/`, `preprod-blockfrost/`) | bisa memuat apa saja |
| `pkgs/cli/artefak/` | 8K (`preview.json`) | artefak deploy |
| `dist/` | 28M | build output, tidak sensitif tapi tidak untuk dev-serve |
| `client/public/__manus__/version.json` | 4K | metadata build, sudah memang berada di publicDir (disengaja, bukan kebocoran) |
| **`.manus-logs/`** (temuan tambahan, TIDAK ada di daftar awal karena namanya sendiri berawalan titik) | `browserConsole.log` 520630B, `sessionReplay.log` 147386B, `networkRequests.log` 47713B | rekaman interaksi debug collector: teks elemen yang diklik, isi input, badan permintaan jaringan (lihat komentar di `vite.config.ts` sekitar `vitePluginManusDebugCollector`) |

`.manus-logs/` gitignored TAPI namanya sendiri berawalan titik, jadi heuristik
"gitignored dan BUKAN berkas titik" di brief tugas ini melewatkannya. Ia tetap
bocor di bawah config lama karena alasan yang sama persis (deny hanya menguji
segmen TERAKHIR, bukan direktori leluhur) — ditambahkan ke daftar tertutup.

`.git/` juga rentan dengan pola yang sama (`deny: ["**/.*"]` tidak menutup
`.git/config`, `.git/HEAD`, dst. karena segmen terakhirnya tidak diawali
titik) — tertutup otomatis oleh penyempitan `allow` di bawah karena `.git/`
tidak pernah masuk daftar allow.

## Perbaikan yang dipilih: persempit `allow`, PLUS `deny` eksplisit sebagai lapis kedua

Opsi "persempit allow" (bukan "deny lebih banyak") dipilih sesuai prioritas
tugas — allow-list lebih tahan karena tidak menuntut menebak semua yang
buruk lebih dulu. Diverifikasi lewat grep setiap impor `@pkgs/`/`@shared` di
`client/src` (lihat `git grep -n "@pkgs\|@shared" client/src`) bahwa
resolusi modul HANYA pernah menyentuh:

- `client/` — root Vite (index.html, src/, public/)
- `pkgs/contract/src/managed/{ballot,registry}/contract/index.js` (+
  `ballot-witnesses.ts`) — lewat `@pkgs/contract/...`
- `pkgs/shared/src/network-config.ts` — lewat `@pkgs/shared/...`
- `shared/const.ts` — lewat `@shared/const`
- `node_modules/` — seluruh dependency npm/pnpm (symlink `.pnpm` tetap di
  bawah jalur ini)

`pkgs/cli/` **tidak pernah** diimpor client — grep tidak menemukan satu pun
`@pkgs/cli` di `client/src`. Ini yang membuat penyempitan `allow` benar-benar
menutup seluruh kelas kebocoran tanpa merusak apa pun.

`vite.config.ts` sekarang:

```js
allow: [
  path.resolve(import.meta.dirname, "client"),
  path.resolve(import.meta.dirname, "pkgs", "contract"),
  path.resolve(import.meta.dirname, "pkgs", "shared"),
  path.resolve(import.meta.dirname, "shared"),
  path.resolve(import.meta.dirname, "attached_assets"), // alias @assets, belum ada di disk
  path.resolve(import.meta.dirname, "node_modules"),
],
deny: [
  "**/.*",                 // lapis kedua independen — tetap menutup .env dst.
  "**/pkgs/cli/**",         // jaring pengaman eksplisit meski sudah di luar allow
  "**/.manus-logs/**",
],
```

`deny` dipertahankan sebagai LAPIS KEDUA, independen dari isi `allow` —
supaya penghapusan satu baris `allow` di masa depan tidak diam-diam membuka
lagi salah satu jalur yang sudah terverifikasi bocor.

Catatan teknis penting yang memengaruhi bentuk perbaikan: begitu `allow`
diisi eksplisit, root `client/` **tidak lagi** otomatis ikut diizinkan (lihat
`resolveServerOptions` di atas) — beda dari sebelumnya, di mana satu entri
akar repo otomatis mencakup semuanya. `client/` karena itu HARUS disebut
eksplisit di `allow`, dan memang disebut di baris pertama array di atas.

## Bukti gerbang MERAH → HIJAU

Uji baru: `client/src/lib/gerbang-fs-dev-server.test.ts`. Menyalakan dev
server Vite sungguhan (via `createServer` dari paket `vite`, memuat
`vite.config.ts` yang sama) di port **5299** (>= 5262 sesuai aturan proyek,
bukan 5250/5180/5173/3000/6300), lalu memeriksa DUA ARAH lewat `/@fs/`:

- **Positif** (wajib 200, dengan isi yang dicocokkan supaya bukan fallback
  SPA kosong): root `client/`, `@pkgs/contract/src/managed/ballot/contract/index.js`,
  `@pkgs/contract/src/managed/registry/contract/index.js`,
  `@pkgs/shared/src/network-config.ts`, `shared/const.ts`.
- **Negatif** (wajib bukan 200, harus 403/404): kelima jalur di tabel di atas
  (wallet-cache, private-state, logs, artefak, `.manus-logs`) plus
  `pkgs/cli/src/args.ts` (kode sumber CLI, bukan cuma sub-folder rahasianya).

Server ditutup lewat `server.close()` di `afterAll` milik proses vitest itu
sendiri — tidak ada proses lain yang disentuh.

### MERAH (vite.config.ts distash sementara ke versi lama via `git stash push -- vite.config.ts`, lalu di-`pop` lagi setelah uji)

```
❯ client/src/lib/gerbang-fs-dev-server.test.ts (11 tests | 6 failed) 1910ms
   ✓ ... > @pkgs/shared/src/network-config.ts bisa di-fetch (200)
   ✓ ... > shared/const.ts (alias @shared) bisa di-fetch (200)
   × ... > kredensial dompet CLI (wallet-cache) → ditolak, TIDAK PERNAH 200 (...)
     → expected 200 not to be 200 // Object.is equality
   × ... > private-state pemilih (credential/salt/opening) → ditolak, TIDAK PERNAH 200 (...)
     → expected 200 not to be 200 // Object.is equality
   × ... > log CLI → ditolak, TIDAK PERNAH 200 (...)
     → expected 200 not to be 200 // Object.is equality
   × ... > artefak deploy CLI → ditolak, TIDAK PERNAH 200 (...)
     → expected 200 not to be 200 // Object.is equality
   × ... > rekaman debug collector (.manus-logs) → ditolak, TIDAK PERNAH 200 (...)
     → expected 200 not to be 200 // Object.is equality
   × ... > kode sumber CLI (pkgs/cli/src/args.ts, ...) tidak lolos lewat /@fs/
     → expected 200 not to be 200 // Object.is equality

 Test Files  1 failed (1)
      Tests  6 failed | 5 passed (11)
```

Catatan: 5 uji POSITIF tetap hijau selama MERAH — membuktikan gerbang ini
benar-benar membedakan "ditolak" dari "server mati", bukan cuma kebetulan
merah karena server gagal menyala.

### HIJAU (vite.config.ts dikembalikan lewat `git stash pop`)

```
✓ client/src/lib/gerbang-fs-dev-server.test.ts (11 tests) 1668ms
   ✓ ... > modul kontrak tergenerasi @pkgs/contract/src/managed/registry/contract/index.js bisa di-fetch (200)
   ✓ ... > @pkgs/shared/src/network-config.ts bisa di-fetch (200)

 Test Files  1 passed (1)
      Tests  11 passed (11)
```

Catatan operasional jujur: metode MERAH di atas memakai `git stash` langsung
atas `vite.config.ts` — berkas yang SAMA yang diawasi (watch) oleh dev server
5180 yang menyajikan tunnel publik. ini berarti selama jendela singkat
(order detik) di antara `stash push` dan `stash pop`, dev server 5180
kemungkinan sempat me-restart dirinya dengan config LAMA (rentan) sebelum
`stash pop` mengembalikannya. Tidak ada permintaan/exfiltrasi eksternal yang
dilakukan selama jendela itu, dan verifikasi tunnel di bawah — dijalankan
SETELAH `stash pop` dan setelah gerbang lokal hijau — menunjukkan config LIVE
saat ini sudah benar. Untuk perbaikan serupa di masa depan, metode yang lebih
aman adalah menguji atas SALINAN config di jalur terpisah, bukan men-stash
berkas asli yang sedang diawasi proses lain.

## Verifikasi lewat tunnel publik (`https://votepriv.mdloglabs.org`)

Dijalankan SETELAH Vite me-restart sendiri akibat penyuntingan
`vite.config.ts` (tidak ada proses yang saya matikan/restart manual). Request
dibentuk dengan `encodeURI` (persis seperti `fetch()` browser sungguhan
membentuk URL `/@fs/<path>` — BUKAN `encodeURIComponent`/`urllib.quote`, yang
meng-encode `:` dan salah merepresentasikan cara request nyata dibentuk).
Hanya status HTTP dan ukuran unduhan yang dinilai, isi TIDAK pernah dibaca:

```
=== JALUR SENSITIF (harapan: BUKAN 200) ===
403       825B pkgs/cli/wallet-cache/preview/90f8b8776f18666c0b87479a46599469/shielded.json
403       827B pkgs/cli/wallet-cache/preview/90f8b8776f18666c0b87479a46599469/unshielded.json
403       821B pkgs/cli/wallet-cache/preview/90f8b8776f18666c0b87479a46599469/dust.json
403       797B pkgs/cli/private-state/preview/pemilih-0/CURRENT
403       799B pkgs/cli/logs/preview/2026-09-11T03:12:19.064Z.log
403       778B pkgs/cli/artefak/preview.json
403       779B .manus-logs/browserConsole.log
403       769B pkgs/cli/src/args.ts

=== JALUR LEGITIMATE (harapan: 200) ===
200    323594B pkgs/contract/src/managed/ballot/contract/index.js
200     26986B pkgs/contract/src/managed/registry/contract/index.js
200      4573B pkgs/shared/src/network-config.ts
200       465B shared/const.ts
```

Root `https://votepriv.mdloglabs.org/` juga dicek terpisah: `200` (halaman
tetap termuat).

Catatan verifikasi tambahan (bukan celah, murni catatan teknis): pengujian
awal saya sendiri sempat memakai `urllib.parse.quote()` Python untuk
membentuk URL, yang meng-encode `:` menjadi `%3A`. Karena `decodeURI` (dipakai
Vite secara internal untuk request `/@fs/`) SENGAJA tidak mendekode karakter
reserved seperti `:`, jalur dengan encoding itu jatuh ke fallback SPA
(`index.html`, 200, ~368KB — BUKAN isi berkas rahasia) alih-alih 403 — perilaku
Vite yang sudah ada sejak sebelum perbaikan ini, tidak berkaitan dengan
`allow`/`deny`, dan tidak pernah menyingkap isi berkas apa pun (dikonfirmasi
lewat `file` atas responsnya: dokumen HTML, bukan log). Encoding yang benar
(`encodeURI`, dipakai konsisten di uji vitest dan di verifikasi akhir di atas)
menunjukkan hasil yang benar: 403 untuk kedelapan jalur sensitif.

## Hasil akhir

- `pnpm test`: **36 berkas lolos + 2 dilewati (38), 452 lolos + 2 dilewati
  (454 total)** — naik dari baseline 35/441+2 karena satu berkas uji baru
  (`gerbang-fs-dev-server.test.ts`, 11 uji).
- `pnpm check`: bersih.
- `pnpm check:uji`: bersih.
- `node scripts/ukur-batas-bundel.mjs`: **LULUS**.
- CLI (`pkgs/cli`, tidak disentuh sama sekali): baseline 10 berkas/121 tidak
  berubah — tidak ada perubahan di `pkgs/`.

## Berkas yang diubah

- `vite.config.ts` — blok `server.fs` (allow dipersempit + deny eksplisit).
- `client/src/lib/gerbang-fs-dev-server.test.ts` — baru, gerbang dua arah.

# Pendaftaran mandiri di browser — pemilih membuat credential-nya sendiri

HEAD dasar: `7981887`. Cabang: `feat/fondasi-kontrak`. Belum ter-commit saat
laporan ini ditulis (lihat catatan gerbang mutasi soal metode pemulihan).

## 1. Mengapa (ringkas)

Kontrak `registerVoters` hanya menerima **leaf** (`cred_leaf(cred)`), bukan
credential. Sisi CLI (`455f7b6`, `pnpm cli register-leaves`) sudah menerima
leaf dari pemilih. Yang hilang: cara pemilih membuat credential-nya sendiri
dan mendapatkan leaf-nya, di browser, tanpa penyelenggara pernah melihat
credential siapa pun. Pola "credential dari tanda tangan wallet" TIDAK
diusulkan ulang (`.superpowers/signdata-determinisme.md`: BIP-340 Schnorr
nonce acak, 9/9 tanda tangan berbeda).

## 2. Bentuk alur yang dibangun

1. **Register** — tombol baru di `BallotCard` (`Register to vote`), tampil
   hanya ketika `menerimaPendaftaran(ballot)` benar (`votes===0 &&
   registered<eligible`) DAN `onRegister` diberikan. Klik membuka
   `RegisterModal`, yang segera memanggil `muatJalurTulis()` lalu
   `daftarkanDiriSendiri(ballot.id)` — fungsi BARU di `tulis.ts` yang: bila
   sudah ada credential tersimpan untuk ballot ini, memakainya ulang
   (TIDAK membuat baru); bila belum, memanggil `buatCredential()` apa adanya,
   menyimpannya, lalu menghitung leaf lewat `daunEligibility()`. Modal
   menampilkan leaf hex 64 karakter + tombol salin, penjelasan leaf
   publik/credential rahasia, dan tombol unduh cadangan credential dengan
   peringatan bahwa berkas itu adalah kunci suara.
2. **VoteModal** — efek baru (statis, TANPA `muatJalurTulis()`) membaca
   `kredensial-idb.ts` langsung saat modal dibuka; bila ada credential
   tersimpan untuk ballot ini, kolom credential terisi otomatis dan diberi
   penanda "found on this device". Tempel manual TETAP tersedia dan
   mengetik apa pun menghapus penanda itu.
3. **Pemulihan** — tombol unggah "Restore from backup file" di
   `RegisterModal`, memakai bentuk berkas identik dengan yang diunduh
   (`{alamatBallot, credentialHex}`), lewat `pulihkanKredensialDariCadangan`
   (tulis.ts, BARU, pola sama dengan `pulihkanOpeningDariCadangan` yang sudah
   ada untuk opening suara).

## 3. Berkas baru

- `client/src/lib/chain/kredensial-idb.ts` — store IndexedDB TERPISAH
  ("votepriv-credentials", BUKAN "votepriv-private-state"), pola
  get/put + Promise-menolak-dengan-Error identik `private-state-idb.ts`.
  TIDAK mengimpor apa pun dari `@midnight-ntwrk/*` — statis reachable dari
  entri (dipakai VoteModal.tsx & RegisterModal.tsx) tanpa menyeret WASM.
- `client/src/lib/chain/kredensial-idb.test.ts` — 8 uji.
- `client/src/components/votepriv/RegisterModal.tsx` — modal baru + fungsi
  murni `uraiCadanganKredensial`/`unduhCadanganKredensial` (bentuk cadangan).
- `client/src/components/votepriv/RegisterModal.test.tsx` — 14 uji.

## 4. Berkas diubah

- `client/src/lib/chain/tulis.ts` — ditambah `daftarkanDiriSendiri`,
  `pulihkanKredensialDariCadangan`, `HasilRegistrasiMandiri`,
  `CadanganKredensial` (semua di balik `muatJalurTulis()`, sesuai Keputusan
  #2 — leaf butuh WASM lewat `Ballot.pureCircuits.cred_leaf`).
- `client/src/lib/chain/tulis.test.ts` — +8 uji (real WASM, real
  fake-indexeddb, pola identik uji `kirimSuara`/`bukaSuara` yang sudah ada).
- `client/src/components/votepriv/ballot-status.ts` — `menerimaPendaftaran`.
- `client/src/components/votepriv/BallotCard.tsx` — tombol Register + prop
  `onRegister?` (opsional, supaya SELURUH uji lama tetap lolos tanpa disuntik).
- `client/src/components/votepriv/VoteModal.tsx` — efek auto-isi + ref
  `dieditManualRef` + badge "found on this device".
- `client/src/components/votepriv/LiveBallots.tsx`, `Overview.tsx` —
  meneruskan `onRegister` ke `BallotCard`.
- `client/src/pages/Home.tsx` — state `registerBallot` + render
  `RegisterModal` (tanpa wallet/jaringan — pendaftaran 100% lokal).
- `client/src/components/votepriv/Docs.tsx` — SATU kalimat toast diperbaiki
  (lihat §7, sudah basi sejak fitur ini ada: sebelumnya berbunyi "voter
  registration alone still runs through the CLI", padahal sekarang credential
  dibuat pemilih sendiri di browser; hanya `registerVoters` on-chain yang
  masih lewat CLI). `docs/` di ATURAN BATASAN merujuk direktori TOP-LEVEL
  (ARCHITECTURE.md), bukan komponen `Docs.tsx` ini — pola yang sama dengan
  commit `3ed2ae1` di riwayat cabang ini.
- `client/src/index.css` — 4 kelas kecil (`.ballot-footer-actions`,
  `.leaf-row`, `.restore-panel`, `.restore-error`, `.found-badge`), semua
  memakai token warna/border yang sudah ada.

Semua di dalam `client/`. `pkgs/`, `server/`, `docs/` (top-level), fixture
JSON: TIDAK disentuh.

## 5. GERBANG MUTASI — Tabel 1: penjaga diturunkan dari kode

| # | Berkas:baris | Penjaga |
|---|---|---|
| G1 | `tulis.ts:430` | `if (tersimpan) return hasilRegistrasiDari(tersimpan, false);` — jangan buat credential baru bila sudah ada |
| G2 | `tulis.ts:458` | `if (cadangan.alamatBallot !== alamatBallotDiminta) throw` — tolak cadangan ballot lain (lapis tulis.ts) |
| G3 | `ballot-status.ts:262` | `ballot.votes===0 && ballot.registered<ballot.eligible` — dua syarat pendaftaran terbuka |
| G4 | `BallotCard.tsx:66` | `onRegister && menerimaPendaftaran(ballot)` — dua syarat render tombol |
| G5 | `RegisterModal.tsx:40-44,53,57` | `cadanganValid` (bentuk JSON) + regex hex 64 — validasi baca cadangan |
| G6 | `RegisterModal.tsx:150` | `if (cadangan.alamatBallot !== ballot.id) throw` — tolak cadangan ballot lain (lapis UI, short-circuit sebelum `muatJalurTulis()`) |
| G7 | `RegisterModal.tsx:224` | `!hasil.kredensialBaru` — tampilkan callout "sudah ada" |
| G8 | `VoteModal.tsx:288` | `dibatalkan \|\| !kredensial \|\| dieditManualRef.current` — tiga syarat auto-isi |
| G9 | `kredensial-idb.ts:86` | `dbPromise === null` — buka IndexedDB sekali |
| G10 | `kredensial-idb.ts:41` | `!db.objectStoreNames.contains(...)` — idempotensi `createObjectStore` |
| G11 | `RegisterModal.tsx:106,110,116` | `dibatalkan` — pembatalan efek saat unmount |
| G12 | `RegisterModal.tsx:121,133` | `if (!hasil) return;` di `salinLeaf`/`unduh` |

G11/G12 TIDAK dimutasi: keduanya secara struktural tidak terjangkau lewat UI
nyata (tombol yang memanggilnya hanya dirender di dalam `stage==="siap" &&
hasil`, dan `dibatalkan` adalah mekanisme lifecycle React, bukan logika
domain) — mutasinya tidak akan mengubah perilaku yang bisa diamati uji
mana pun tanpa memaksa keadaan yang mustahil dicapai dari render.

## 6. GERBANG MUTASI — Tabel 2: hasil, satu per satu, `git checkout --` diganti `cp` backup

Catatan metode: **belum ada commit** untuk berkas-berkas ini (baru vs.
diubah, semuanya di working tree) — persis situasi yang dicatat
`register-leaves-cli.md`. `git checkout -- <file>` akan mengembalikan ke
HEAD `7981887` (SEBELUM tugas ini ada), bukan ke versi sebelum satu mutasi.
Pemulihan memakai `cp` dari salinan cadangan per berkas, dijalankan SATU
mutasi pada satu waktu, tidak pernah ditumpuk.

| # | Mutasi | Titik panggil diserang | `pnpm test` | Uji yang jatuh |
|---|---|---|---|---|
| **WAJIB #1** | `daftarkanDiriSendiri`: `if (false && tersimpan)` (selalu buat baru) | `RegisterModal` (nyata) via `daftarkanDiriSendiri` | **MERAH** | `tulis.test.ts` × 2 (`daftarkanDiriSendiri` panggilan kedua; `pulihkanKredensialDariCadangan` lalu daftar lagi) |
| **WAJIB #2** | `VoteModal.tsx` auto-isi: `if (true) return;` (tidak pernah isi) | `VoteModal` (nyata, dipakai `Home.tsx`) | **MERAH** | `VoteModal.test.tsx` × 3 |
| **WAJIB #3** | `RegisterModal.tsx`: regex hex `[0-9a-f]` → `[0-9A-F]` (bersih sudah lowercase → selalu gagal) | `uraiCadanganKredensial` (parser unggah, dipakai `RegisterModal`) | **MERAH** | `RegisterModal.test.tsx` × 4, termasuk uji round-trip khusus |
| G2 | Hapus blok `throw` alamat-lain di `tulis.ts` | `pulihkanKredensialDariCadangan` (nyata) | **MERAH** | `tulis.test.ts` × 1 |
| G3a | `votes===0` → `true` | `menerimaPendaftaran` (nyata, dipakai `BallotCard`) | **MERAH** | `ballot-status.test.ts` × 1, `BallotCard.test.tsx` × 1 |
| G3b | `registered<eligible` → `true` | sama | **MERAH** | `ballot-status.test.ts` × 1, `BallotCard.test.tsx` × 1, **+ `Home.vote-toast.test.tsx` × 1** (lihat catatan) |
| G4a | Hapus `menerimaPendaftaran(ballot)` dari render guard | `BallotCard` (nyata) | **MERAH** | `BallotCard.test.tsx` × 2, `Home.vote-toast.test.tsx` × 1, `paritas-permukaan-rantai.test.tsx` × 1 |
| G4b | Hapus `onRegister &&` dari render guard | `BallotCard` (nyata) | **MERAH** | `BallotCard.test.tsx` × 1 |
| G6 | Hapus blok `throw` alamat-lain di `RegisterModal.tsx` | `RegisterModal` (nyata) — pemulihan berkas | **MERAH** | `RegisterModal.test.tsx` × 1 (persis satu — lihat §7) |
| G7 | `{!hasil.kredensialBaru && (...)}` → `{false && (...)}` | `RegisterModal` (nyata) | **MERAH** | `RegisterModal.test.tsx` × 1 |
| G9 | `if (dbPromise===null) dbPromise=...` → selalu `dbPromise = bukaDb(...)` | `buatKredensialStoreIdb` (nyata) | **MERAH** | `kredensial-idb.test.ts` × 1 |
| G10 | `if (!contains(...)) createObjectStore(...)` → selalu `createObjectStore(...)` | `bukaDb` (nyata) | **HIJAU** | tidak ada — lihat §8 |
| G8-sub | Hapus HANYA `dieditManualRef.current` dari kondisi (sisakan `dibatalkan\|\|!kredensial`) | efek auto-isi `VoteModal` | **HIJAU** | tidak ada — lihat §8 |

Catatan G3b/G4a: mutasi pada `ballot-status.ts`/`BallotCard.tsx` juga
merahkan `Home.vote-toast.test.tsx` dan `paritas-permukaan-rantai.test.tsx`
lewat efek SAMPING yang JUJUR, bukan kebetulan uji rusak: kedua uji itu
mengklik `.ballot-card .text-button`/`.text-button` pertama untuk MEMBUKA
VoteModal, dan begitu tombol Register (juga ber-kelas `.text-button`, sengaja
sama demi konsistensi visual) ikut memenuhi syarat render pada fixture
default (`votes:0`), ia menjadi match PERTAMA dan klik jatuh ke tombol yang
salah. Pada kode ASLI (tak-dimutasi) ini tidak terjadi karena fixture
`ballotUji()` bawaan punya `registered===eligible` (kuota penuh) sehingga
tombol Register tidak pernah render di uji-uji itu — dikonfirmasi dengan
menjalankan ulang kedua uji itu di pohon bersih (lolos). Bukan bug, bukan uji
yang diperlemah; TIDAK diubah.

## 7. Hasil ketiga mutasi wajib (ringkas eksplisit)

1. Buat credential baru meski sudah ada untuk ballot itu → **MERAH** (2 uji `tulis.test.ts`).
2. `VoteModal` tidak mengisi otomatis dari store → **MERAH** (3 uji `VoteModal.test.tsx`).
3. Berkas cadangan yang diunggah tidak terbaca kembali oleh format unduhnya sendiri (round-trip) → **MERAH** (4 uji `RegisterModal.test.tsx`, termasuk uji round-trip yang secara harfiah memanggil `unduhCadanganKredensial` lalu memasukkan TEKS YANG SAMA PERSIS ke `uraiCadanganKredensial`).

Ketiganya dipulihkan (`cp` dari cadangan) segera setelah dicatat; tidak ada
yang dibiarkan di pohon.

## 8. Mutasi HIJAU — perbaikan atau alasan

- **G10 (idempotensi `createObjectStore`)**: HIJAU. `onupgradeneeded` pada
  IndexedDB hanya pernah terpanggil SEKALI per siklus hidup database baru
  (DB_VERSION dipatok 1, tidak pernah dinaikkan); tidak ada jalur di aplikasi
  ini yang membuka DB yang sama dua kali dalam keadaan upgrade bersamaan.
  Guard ini murni jaring pengaman ke depan (mis. bila suatu hari store kedua
  ditambahkan dan versi dinaikkan) — pola IDENTIK dan SUDAH ADA, sama-sama
  tidak diuji langsung, di `private-state-idb.ts` (STORE_STATE/STORE_SIGNING).
  Dipertahankan apa adanya, tidak "diperbaiki" dengan menghapusnya (itu
  hanya memindahkan risiko real meski kecil), TIDAK dianggap kegagalan
  laporan karena mengikuti pola yang sudah diterima repo ini.
- **G8-sub (`dieditManualRef.current` sendirian)**: HIJAU. Guard ini menutup
  jendela BALAPAN sempit (pemilih mengetik SEBELUM pembacaan IndexedDB
  selesai — beberapa microtask, bukan detik) yang uji `VoteModal.test.tsx`
  yang ada tidak menekan (uji "mengetik manual menghapus badge" menunggu
  auto-isi SELESAI lebih dulu via `waitFor`, baru mengetik — sehingga promise
  auto-isi sudah selesai dan tidak bisa lagi menimpa apa pun). Menutup celah
  ini dengan benar butuh mem-mock `kredensial-idb.ts` agar resolusinya bisa
  ditunda manual (pola sama dengan `daftarkanDiriSendiriMock` yang
  dikontrol lewat Promise belum-selesai di `RegisterModal.test.tsx`) —
  berkas ini belum melakukannya karena SELURUH uji lain di dalamnya sengaja
  memakai IndexedDB SUNGGUHAN (fake-indexeddb), bukan mock. Konsekuensi
  nyata bila guard ini hilang: pengetik sangat cepat bisa kehilangan
  beberapa karakter pertama ketikannya bila kebetulan ada credential
  tersimpan — cacat UX kecil, bukan kehilangan dana/suara (nilai final tetap
  yang pemilih ketik setelah render, bukan sebelum), dan TIDAK ditutup di
  sesi ini secara sadar (dicatat, bukan diam-diam dilewatkan).

## 9. Batasan mock — dipatuhi

Mock IndexedDB memakai `fake-indexeddb/auto`, persis pola
`private-state-idb.test.ts`. Tidak ada `as any`/`as unknown`/
`@ts-expect-error` di kode produksi maupun uji baru (`cadanganValid` memakai
type predicate `data is CadanganKredensial` dengan SATU `as CadanganKredensial`
di dalam fungsi guard itu sendiri — pola standar TypeScript untuk menyempitkan
`unknown`, bukan salah satu dari tiga bentuk terlarang). Tidak ada uji yang
menyentuh jaringan/wallet/rantai; tidak ada `connect()`; tidak ada transaksi
dikirim.

## 10. Seluruh kalimat UI baru, apa adanya

**RegisterModal.tsx**
- Kicker: "Voter registration"
- Memuat: "Preparing" / "Setting up your credential" / "This loads the same
  components used to vote — around a dozen megabytes on a first visit, so it
  can take a moment on a slow connection."
- "Registering creates a private credential that stays on this device. Only
  its public "leaf" is ever shared — with the organizer, so they can add it
  to this ballot's eligibility list."
- Callout sudah-ada: "You already generated a credential for this ballot on
  this device — shown again below. Generating a new one now would not match
  a leaf you may have already sent the organizer, so nothing new was
  created."
- Label leaf: "Your public leaf — safe to send to the organizer"
- Callout leaf publik: "This leaf is public: sending it to the ballot
  organizer reveals nothing about you or how you will vote. The credential
  it was derived from — the actual secret — never leaves this device."
- Callout kunci suara: "Your credential is your voting key. Anyone who holds
  it can vote in your place, so keep the backup file as secret as a
  password. If you lose both this device's storage and that backup file,
  this vote is permanently lost — there is no way to recover or reissue a
  credential."
- Tombol: "Close", "Download credential backup", "Try again", "Restore from
  backup file" / "Restoring…"
- Gagal: "Registration not ready" / "Something went wrong"
- Pemulihan: "Registering from a new device?" / "If you already have a
  backup credential file for this ballot, restore it here instead of
  generating a new one — a fresh credential will not match a leaf you may
  have already sent the organizer."
- Toast salin: "Leaf copied" / "Safe to paste anywhere — send it to the
  ballot organizer."; gagal salin: "Could not copy" / "Select and copy the
  leaf text manually instead."
- Toast pulih: "Credential restored" / "Showing the leaf for the restored
  credential below."
- Galat berkas: "This backup file is for a different ballot (…), not this
  one (…)."; "This file is not valid JSON — it does not look like a
  VotePriv credential backup."; "This file is missing "alamatBallot" or
  "credentialHex" — it does not look like a VotePriv credential backup.";
  "The credential in this file is not a 64-character hex value."; "Could
  not read the selected file."

**BallotCard.tsx**: "Register to vote"

**VoteModal.tsx**: " · found on this device" (ditambahkan ke label "Your
voting credential" yang sudah ada; placeholder tempel manual TIDAK diubah).

**Docs.tsx** (toast "View adapter notes", diperbaiki): "Reads come from a
real Midnight contract over the indexer. Casting and tallying votes go
through a real wallet connection (Lace) and a real proof server. Voters
generate their own credential in the browser and hand the organizer only
its public leaf — the organizer still submits registerVoters through the
CLI, but never sees or holds anyone's credential."

## 11. Keluaran gerbang bundel, verbatim (`node scripts/ukur-batas-bundel.mjs`, setelah `pnpm build`)

```
=== gerbang batas bundel (atribusi per-chunk, manifest.json) ===
wasm baca terpasang (onchain-runtime-v3) : 1321366 B
wasm terjangkau dari chunk ENTRI          : assets/midnight_onchain_runtime_wasm_bg-DLDy-U1U.wasm
js chunk terjangkau statis dari entri     : 570227 B  ( 1 chunk )
byte chunk JS jalur tulis                 : 985447 B
byte aset .wasm yang chunk itu picu        : 11465148 B
catatan                                    : chunk jalur tulis ditemukan sebagai entri dinamis manifest (assets/tulis-BcNLvmPm.js), TIDAK terjangkau statis dari entri — seperti seharusnya.
LULUS
```

Catatan jujur atas angka "byte chunk JS jalur tulis" (985.447 B): naik dari
sebelum tugas ini karena `tulis.ts` sekarang mengimpor
`pkgs/shared/src/credentials.ts`, yang mengimpor `{ Ballot } from "contract"`
— specifier PAKET (bukan `@pkgs/contract/src/managed/ballot/contract/index.js`
yang sudah dipakai `tulis.ts` sendiri), yang resolve ke
`pkgs/contract/dist/index.js`. Barrel itu me-re-export BALLOT **dan**
REGISTRY sekaligus, jadi modul contract ballot ikut TERBAWA DUA KALI (sekali
lewat jalur src langsung yang sudah ada, sekali lagi lewat dist via
credentials.ts) dan modul registry ikut terbawa untuk pertama kalinya di
jalur tulis. Ini SESUAI instruksi (Keputusan #3: `buatCredential()` dipakai
apa adanya dari `pkgs/shared/src/credentials.ts`, bukan ditulis ulang) dan
TIDAK melanggar gerbang: seluruhnya tetap di dalam chunk DINAMIS (`tulis.ts`),
tidak pernah menyentuh chunk entri — dibuktikan baris "js chunk terjangkau
statis dari entri: 570227 B (1 chunk)" tidak berubah sifatnya (tetap hanya
memuat WASM baca) dan baris "catatan" mengonfirmasi jalur tulis tetap
dinamis. Tidak diperbaiki lebih lanjut karena memperbaikinya berarti menulis
ulang cara `credentials.ts` mengimpor `contract` — di luar wewenang tugas
ini (`pkgs/` tidak boleh disentuh) dan bertentangan dengan Keputusan #3.

## 12. Grep credential-di-log (sebelum commit)

```
$ grep -n "console\." <seluruh berkas baru/diubah>
client/src/pages/Home.tsx:218:      console.error("[votepriv:wallet] connect gagal", error);
client/src/pages/Home.tsx:251:      console.error("[votepriv:wallet] connect (buka suara) gagal", error);
```

Keduanya SUDAH ADA sebelum tugas ini (log galat koneksi wallet, mengoper
objek `error` generik — tidak pernah credential), tidak diubah sesi ini.

```
$ grep -in "credential" <berkas yang sama> | grep -i "console\.\|\.log(\|log\.info\|log\.warn\|log\.error"
(kosong)
```

Tidak ada satu pun kemunculan `credential`/`kredensial` yang bersanding
dengan pemanggilan log apa pun.

## 13. Uji, typecheck, build

- `pnpm test` (klien): **39 berkas lolos + 2 dilewati (41), 523 lolos + 2
  dilewati (525)** — dari baseline 37/478+2 menjadi 39/523+2 (net +2 berkas,
  +45 uji: 8 kredensial-idb + 8 tulis.ts + 4 ballot-status + 5 BallotCard +
  1 LiveBallots + 1 Overview + 4 VoteModal + 14 RegisterModal).
- CLI (`pkgs/cli`, tidak disentuh): **15 berkas/219 lolos**, dikonfirmasi
  ulang — tidak berubah.
- `pnpm check` — bersih. `pnpm check:uji` — bersih.
- `pnpm build` — sukses (`vite build` + esbuild server), dijalankan
  TERAKHIR setelah seluruh kode final dipulihkan dari mutasi. `dist/`
  mutakhir.
- Gerbang bundel jalur SUMBER (`batas-bundel.test.ts`, 4 uji) dan jalur
  KELUARAN (`ukur-batas-bundel.mjs`, §11) — keduanya LULUS.
- Pohon: hanya berkas yang didaftar §3-4 berubah; `pkgs/`, `server/`,
  `docs/` (top-level), fixture JSON tidak tersentuh.

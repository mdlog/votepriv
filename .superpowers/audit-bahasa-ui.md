# Audit bahasa UI — VotePriv frontend

Audit atas **seluruh teks yang dirender ke pengguna** di `client/src/`, memisahkan
string UI (harus Inggris) dari komentar/nama variabel Indonesia (konvensi repo,
tidak disentuh). Dipicu oleh bug nyata di `proof-server.ts:139`
(`proofServerHop()`) yang menyisipkan frasa Indonesia ke kalimat privasi
Inggris yang dirender `VoteModal`.

Metode: dibaca satu per satu setiap komponen di `components/votepriv/`,
`pages/`, `hooks/`, lalu ditelusuri mundur setiap fungsi `lib/` yang
mengembalikan string yang berakhir di JSX/toast/`title=` (bukan grep kasar —
grep kasar atas kata kunci Indonesia mengembalikan >100 baris, mayoritas
komentar/nama variabel yang MEMANG boleh Indonesia).

## A. Perbaikan — tabel berkas:baris, lama → baru, kondisi tampil

| Berkas:baris | Teks lama (Indonesia) | Teks baru (Inggris) | Kondisi yang menampilkannya |
|---|---|---|---|
| `lib/proof-server.ts:138-139` | `"host halaman ini"` / `(loopback mesin itu, bukan perangkat Anda)` | `"this page's host"` / `(that machine's loopback, not your device)` | Bug asli — proof server lokal diakses lewat tunnel/LAN. Muncul di `VoteModal` (pesan privasi) DAN di `Home.tsx` sidebar `title=` (lewat `proofStatus.hop`). |
| `lib/proof-server.ts:228` | `"/version menjawab HTML, bukan versi — proxy /proof-server tidak terpasang"` | `"/version answered with HTML, not a version — the /proof-server proxy is not set up"` | `checkProofServer()`, proxy `/proof-server` belum dipasang di server. Nilainya masuk ke `Home.tsx` sidebar `title=`. |
| `lib/proof-server.ts:233` | `"/version menjawab kosong"` | `"/version answered empty"` | Proof server menjawab 200 dengan badan kosong. Sama, masuk ke sidebar `title=`. |
| `lib/proof-server.ts:239` | `"tidak dapat dihubungi"` (fallback non-Error) | `"could not be reached"` | Proof server unreachable dan galatnya bukan instance `Error`. Sama. |
| `pages/Home.tsx:133` | `"Memeriksa proof server."` | `"Checking the proof server."` | Sidebar, sebelum `checkProofServer()` pertama selesai. |
| `pages/Home.tsx:138-139` | `Proof server menjawab v…` / `…juga tidak dapat dihubungi (…)` | `The proof server answered v…` / `…could not be reached either (…)` | Klausa keterjangkauan, disematkan ke SEMUA cabang remote/tunnel. |
| `pages/Home.tsx:144` | `" Target ini berasal dari nilai build dan belum dikonfirmasi…"` | `" This target comes from the build value and has not been confirmed…"` | Ditambahkan saat `targetTerverifikasi === false`. |
| `pages/Home.tsx:149` | `Witness Anda — credential dan pilihan suara — dikirim ke…operatornya dapat melihat pilihan suara Anda.` | `Your witness — your credential and vote choice — is sent to…its operator can see your vote choice.` | Sidebar `title=`, proof server **remote**. Klaim "operator dapat melihat" DIPERTAHANKAN. |
| `pages/Home.tsx:152-155` | label `"Witness lewat jaringan"`; title `Halaman ini disajikan dari…loopback MESIN ITU — bukan loopback Anda…siapa pun yang mengoperasikan mesin itu dapat melihat pilihan suara Anda.` | label `"Witness crosses the network"`; title `This page is served from…THAT MACHINE's loopback — not yours…whoever operates that machine can see your vote choice.` | Sidebar, topologi **tunnel** (target lokal, halaman disajikan dari mesin lain) — kondisi bukti nyata pengguna. Klaim "operator dapat melihat" DIPERTAHANKAN. |
| `pages/Home.tsx:161` | `Proof server lokal tidak dapat dihubungi (…). Jalankan: docker compose…` | `The local proof server could not be reached (…). Run: docker compose…` | Proof server lokal mati. |
| `pages/Home.tsx:169,171` | label `"Target belum terverifikasi"`; title `…klaim "witness tidak pernah meninggalkan perangkat ini" tidak dibuat di sini.` | label `"Target not verified"`; title `…the claim "the witness never leaves this device" is not made here.` | Lokal + hidup, tapi server tidak melaporkan target. Kalimat TETAP menahan diri dari klaim kuat. |
| `pages/Home.tsx:176` | `Proof server lokal v… — witness tidak pernah meninggalkan perangkat ini.` | `Local proof server v… — the witness never leaves this device.` | Satu-satunya kondisi "Always on" — lokal, hidup, terverifikasi. |
| `pages/Home.tsx:204,242` (×2) | toast `"Menunggu wallet"` / `"Buka Lace dari toolbar Chrome…"` | `"Waiting on wallet"` / `"Open Lace from the Chrome toolbar…"` | Connect wallet (mencoblos DAN membuka suara) lambat merespons. |
| `lib/midnight-wallet.ts:153` | `"Tidak ada wallet Midnight yang terdeteksi. Pasang ekstensi Lace…"` | `"No Midnight wallet detected. Install the Lace extension…"` | **Wallet tidak ada** — `window.midnight` kosong/tidak ada. |
| `lib/midnight-wallet.ts:168` | `Konektor "…" tidak menyediakan metode connect()…` | `Connector "…" does not provide the connect() method it needs.` | Konektor tersuntik tapi cacat (tanpa `connect()`). |
| `lib/midnight-wallet.ts:227` | `Wallet tidak menjawab dalam … detik…` | `The wallet did not respond within … seconds…` | Wallet lambat/tidak merespons popup persetujuan (timeout). |
| `lib/midnight-wallet.ts:307` | `Wallet tersambung ke X, padahal yang diminta Y.` | `The wallet is connected to X, but Y was requested.` | Silang-periksa jaringan setelah connect gagal. |
| `lib/midnight-wallet.ts:323` | `Ekstensi wallet sempat restart…` | `The wallet extension restarted…` | Handle ekstensi basi (service worker restart). |
| `lib/midnight-wallet.ts:329` | `"Wallet menolak permintaan koneksi."` (fallback) | `"The wallet rejected the connection request."` | Penolakan koneksi tanpa pesan dari wallet. |
| `lib/midnight-wallet.ts:336` | `Wallet tidak berada di satu pun jaringan yang didukung…` | `The wallet is not on any supported network…` | Semua `PROBE_NETWORKS` ditolak sebagai jaringan keliru. |
| `lib/midnight-wallet.ts:389` | `Wallet tersambung tapi tidak mengembalikan alamat…` | `The wallet connected but did not return an address…` | Connect sukses tapi tanpa alamat shielded/unshielded. |
| `lib/midnight-wallet.ts:421` | `"Gagal menyambung ke wallet."` (fallback) | `"Could not connect to the wallet."` | `describeWalletError()` menerima nilai bukan `Error`. |
| `lib/chain/adaptor-lace.ts:139,272` | `Wallet tidak menyediakan metode "…"/balanceSealedTransaction…` | `The wallet does not provide the "…"/balanceSealedTransaction…` | Wallet tersambung tidak mengimplementasikan metode jalur tulis yang dibutuhkan. |
| `lib/chain/adaptor-lace.ts:186` | `Wallet mengembalikan string yang bukan heksadesimal…` | `The wallet returned a string that is not valid transaction hexadecimal.` | Wallet mengembalikan hex rusak dari `balanceTx`. |
| `lib/chain/adaptor-lace.ts:251` | `balanceTx: wallet mengembalikan bentuk yang tidak dikenali…` | `balanceTx: the wallet returned an unrecognized shape…` | Bentuk balikan wallet tak dikenal (bukan string/bytes/objek). |
| `lib/chain/adaptor-lace.ts:257` | `Wallet tersambung tapi tidak melaporkan coinPublicKey/…` | `The wallet is connected but did not report coinPublicKey/…` | Wallet tersambung tanpa kunci publik yang dibutuhkan jalur tulis. |
| `lib/chain/adaptor-lace.ts:302` | `submitTransaction tidak mengembalikan id transaksi…` | `submitTransaction did not return a transaction id…` | `submitTransaction` tidak mengembalikan id DAN tx tanpa identifier. |
| `lib/chain/tulis.ts:115` | `Credential harus 64 karakter heksadesimal (32 byte).` | `The credential must be 64 hexadecimal characters (32 bytes).` | Format credential tidak sah (jaring pengaman kedua setelah validasi VoteModal). |
| `lib/chain/tulis.ts:168,298` | `Artefak ZK untuk castVote/tallyVote tidak terbaca…` | `The ZK artifacts for castVote/tallyVote could not be read…` | Berkas artefak ZK gagal diambil dari `/zk/ballot/keys/`. |
| `lib/chain/tulis.ts:214,352` | `castVote/tallyVote difinalisasi dengan status X, bukan Y.` | `castVote/tallyVote finalized with status X, not Y.` | Transaksi difinalisasi TAPI bukan `SucceedEntirely`. |
| `lib/chain/tulis.ts:251-253` | `Tidak ada opening tersimpan untuk ballot X di perangkat ini…pulihkan dari berkas cadangan…` | `No opening is stored for ballot X on this device…restore it from the backup file…` | **Credential/opening tidak ditemukan** saat membuka suara dari perangkat/browser lain. |
| `lib/chain/tulis.ts:460` | `Berkas cadangan ini untuk ballot X, bukan ballot yang sedang didaftarkan (Y).` | `This backup file is for ballot X, not the ballot currently being registered (Y).` | Mengunggah berkas cadangan credential milik ballot lain. |
| `lib/chain/kredensial-idb.ts:44,53,62` | `Gagal membuka IndexedDB "…"` / `menulis/membaca credential untuk "…"` | `Could not open IndexedDB "…"` / `write/read the credential for "…"` | IndexedDB gagal (mode privat, kuota, situs diblokir) saat pendaftaran mandiri/auto-isi credential. |
| `lib/chain/private-state-idb.ts:72,81,90` | `Gagal membuka IndexedDB "…"` / `menulis/membaca "…" ke/dari …` | `Could not open IndexedDB "…"` / `write/read "…" to/from …` | IndexedDB gagal saat `set`/`get`/`setSigningKey`/`getSigningKey` (dipakai `findDeployedContract`, jalur tulis). |

**51 baris/string diubah** (git diff, `+51 -51`) di **7 berkas produksi**
(`proof-server.ts`, `Home.tsx`, `midnight-wallet.ts`, `adaptor-lace.ts`,
`tulis.ts`, `kredensial-idb.ts`, `private-state-idb.ts`) — tabel di atas
memuat 34 baris, beberapa baris tabel merangkum 2-3 string sejenis (mis. tiga
pesan IndexedDB, atau dua kutipan toast identik). Plus **5 berkas uji** yang
memaku teks lama sebagai pin (`proof-server.test.ts`, `VoteModal.test.tsx`,
`midnight-wallet.test.ts`, `adaptor-lace.test.ts`, `tulis.test.ts` — pin
diperbarui ke kalimat baru, tidak satu assert pun dihapus).

Kalimat privasi (VoteModal `pesanPrivasiSuara`/`pesanPrivasiBuka`,
`ballot-status.ts`, `KeadaanRantai.ts` pesanGagal kesembilan sebab,
`GalatRantai.rincian` di `graphql.ts`/`dekode.ts`/`baca-rantai.ts`,
`CreateBallotModal`/`RegisterModal`/`Docs`/`Overview`/`Results`/`LiveBallots`/
`BallotCard`) **sudah sepenuhnya Inggris** dari sesi sebelumnya — diverifikasi
dibaca ulang seluruhnya, tidak ada perubahan diperlukan di sana.

## B. Diputuskan TIDAK diubah (bukan teks UI)

| Lokasi | Alasan |
|---|---|
| `lib/chain/kueri.ts:96,98` (`throw new Error("susunKueriBallot dipanggil dengan jumlah < 1")`, dst.) | Invarian argumen fungsi internal. `baca-rantai.ts` hanya memanggilnya di dalam `for (const keping of potong(dipakai, …))` — pada registry kosong, `dipakai=[]` membuat `potong([])` menghasilkan nol iterasi, jadi `susunKueriBallot` TIDAK PERNAH dipanggil dengan `jumlah < 1`. Tidak tercapai dari UI mana pun. |
| `lib/chain/baca-rantai.ts:437-440` (`"Indexer tidak mengembalikan block.height…"`) | Ditangkap oleh `catch` LOKAL di fungsi yang sama (blok "POST 3 … TIDAK PERNAH menggagalkan pembacaan") dan berakhir sebagai fallback diam-diam ke tinggi blok dari aksi kontrak — tidak pernah dibungkus `GalatRantai`, tidak pernah sampai ke panel galat. |
| `lib/chain/baca-rantai.ts` — field `.pesan` pada setiap `BallotGagal` (baris 315, 322, 356, 365, 408) | Dikonstruksi tapi **tidak pernah dibaca** — `SpandukSebagian` (KeadaanRantai.tsx) hanya memakai `gagal.length`, tidak satu pun field lain. Diverifikasi lewat grep: tidak ada `.pesan` lain yang menyentuh `BallotGagal`. |
| `lib/chain/private-state-idb.ts:99,108` (`idbDelete`/`idbClear`) dan `:113-116` (`belumDidukung`, dipakai `export`/`import` ×4) | Komentar berkas ini sendiri mendokumentasikan (dan `private-state-idb.test.ts` memaku lewat `/belum didukung/`) bahwa `remove`/`clear`/`export*`/`import*` **tidak pernah dipanggil** oleh `midnight-js-contracts` versi terpasang (diverifikasi grep terhadap `dist/index.mjs` vendor) di jalur `castVote`/`tallyVote`/`findDeployedContract`. Mengubahnya berisiko memecah pin uji yang ada tanpa menambah cakupan nyata. |
| `lib/chain/zk-config-fetch.ts` (`GalatArtefakZk`, dua pesan) | `tulis.ts` membungkus `pastikanArtefakZkMurah()` dan MENIMPA pesan dengan teks Inggrisnya sendiri (`"The ZK artifacts for … could not be read…"`), menyimpan galat asli hanya sebagai `.cause` yang tidak pernah dibaca UI. |
| Semua `console.log`/`console.warn`/`console.error` Indonesia (`midnight-wallet.ts`, `adaptor-lace.ts`, `Home.tsx`) | Log developer/devtools, bukan DOM — tidak pernah masuk `document.body.textContent`. Konsisten dengan "pesan galat internal tetap Indonesia". |
| Nama test (`it("…")`) berbahasa Indonesia, dan fixture arbitrer di uji (`new Error("IndexedDB diblokir")` — RegisterModal.test.tsx:157; `new Error("indexer terputus setelah submit")`/`"wallet buka menolak"` — tulis.test.ts/VoteModal.test.tsx) | Nama test tidak pernah dirender. String fixture itu adalah placeholder ARBITRER untuk menguji *passthrough* pesan galat (isinya sengaja tidak meniru string produksi nyata) — mengubahnya tidak menambah cakupan bahasa. |
| `components/Map.tsx`, `components/ManusDialog.tsx` | Tidak diimpor dari mana pun (`main.tsx → App.tsx → Home.tsx` tidak pernah menyentuhnya) — sisa scaffold generik, tidak bisa dirender lewat rute mana pun hari ini. `ManusDialog.tsx` sudah Inggris; `Map.tsx` adalah dokumentasi Google Maps generik, tidak spesifik VotePriv. |

## C. Penjaga mesin

Berkas baru: `client/src/test/audit-bahasa-ui.test.tsx` (60 uji, semua lolos).

- **Daftar kata terlarang** (44 kata/frasa Indonesia, dicocokkan `\b…\b`
  case-insensitive): yang, dan, atau, tidak, bukan, belum, sudah, akan, juga,
  dengan, untuk, dari, pada, adalah, dapat, kembali, perangkat, mesin,
  pemilih, suara, jaringan, sebab, kesalahan, kegagalan, keberhasilan,
  pilihan, disajikan, dikirim, terverifikasi, terjangkau, konfigurasi,
  tersambung, terhubung, kredensial, menunggu, hilang, silakan, mohon,
  peringatan, menampilkan, memilih, "coba lagi", gagal, berhasil.
- **Dua arah**: `assertHanyaInggris(teks, ekspektasi, label)` meng-assert teks
  Inggris yang diharapkan ADA, DAN kata Indonesia TIDAK ADA — pada setiap
  panggilan, di setiap kondisi.
- **Cakupan kondisi**: kesembilan sebab `GalatRantai` (langsung ke `pesanGagal`
  DAN lewat render `PanelGagalRantai`), kelima cabang `reach` proof server
  (`pesanPrivasiSuara`/`pesanPrivasiBuka` DAN render `VoteModal` penuh),
  keadaan gagal VoteModal (`GalatOpeningHilang` nyata dari `tulis.ts` dan
  kegagalan generik), ballot tally-open/finalized, RegisterModal
  memuat/siap/gagal (pesan IndexedDB **nyata** dari `kredensial-idb.ts`),
  CreateBallotModal (toast validasi & toast info), Overview/LiveBallots/Results
  kosong dan terisi (keempat `keadaanHasil`), keenam cabang `privacy` Home.tsx
  (termasuk atribut `title=` sidebar), dan kegagalan connect wallet
  ("wallet tidak ada", `WalletError` nyata). Assert langsung juga atas
  `proofServerHop`, `checkProofServer` (ketiga pesan galat), `statusLabel`/
  `statusTag`, `pesanSuksesVote`, `rincian` `GalatRantai` NYATA dari
  `graphql.ts`/`dekode.ts`/`baca-rantai.ts`, `WalletError`, `adaptor-lace.ts`,
  `GalatOpeningHilang`.

**Bukti guard bisa MERAH**: `proofServerHop()` dikembalikan sementara ke
`"(loopback mesin itu, bukan perangkat Anda)"`, lalu
`npx vitest run client/src/test/audit-bahasa-ui.test.tsx client/src/lib/proof-server.test.ts`
dijalankan:

```
❯ client/src/lib/proof-server.test.ts (19 tests | 1 failed)
  × proofServerHop > menyebut host halaman sebagai hop perantara pada kasus tunnel
    Expected: "…(that machine's loopback, not your device)"
    Received: "…(loopback mesin itu, bukan perangkat Anda)"
❯ client/src/test/audit-bahasa-ui.test.tsx (60 tests | 2 failed)
  × proofServerHop > hop lewat tunnel: REGRESI YANG DIJAGA BERKAS INI …
  × proofServerHop > target lokal dengan asal halaman null …
Test Files  2 failed (2)
     Tests  3 failed | 76 passed (79)
```

String dikembalikan ke bentuk Inggris; `pnpm test` penuh hijau lagi (lihat di bawah).

## Verifikasi

- `pnpm test`: **40 berkas lolos, 2 dilewati (42) · 583 uji lolos, 2 dilewati
  (585)** — naik dari 39/523+2 karena satu berkas baru (60 uji).
- `pnpm check` dan `pnpm check:uji`: bersih, tanpa galat.
- `pnpm build`: sukses.
- `node scripts/ukur-batas-bundel.mjs`: **LULUS** (verbatim):

```
=== gerbang batas bundel (atribusi per-chunk, manifest.json) ===
wasm baca terpasang (onchain-runtime-v3) : 1321366 B
wasm terjangkau dari chunk ENTRI          : assets/midnight_onchain_runtime_wasm_bg-DLDy-U1U.wasm
js chunk terjangkau statis dari entri     : 570140 B  ( 1 chunk )
byte chunk JS jalur tulis                 : 985428 B
byte aset .wasm yang chunk itu picu        : 11465148 B
catatan                                    : chunk jalur tulis ditemukan sebagai entri dinamis manifest (assets/tulis-IYs4c7B4.js), TIDAK terjangkau statis dari entri — seperti seharusnya.
LULUS
```

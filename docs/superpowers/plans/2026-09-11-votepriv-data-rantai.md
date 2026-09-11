# VotePriv — Rencana Implementasi C-2a: Data On-Chain Nyata, Baca-Saja

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: gunakan `superpowers:subagent-driven-development` (disarankan) atau `superpowers:executing-plans` untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`).

**Goal:** Mengganti seluruh data mockup di UI VotePriv dengan keadaan kontrak yang benar-benar dibaca dari indexer Midnight, **tanpa wallet, tanpa proof server, tanpa artefak ZK, tanpa private state, tanpa penandatanganan** — dan menumbuhkan keadaan MEMUAT serta keadaan GAGAL yang sampai hari ini belum ada sama sekali, karena data mockup selalu ada seketika sementara data jaringan tidak.

**Architecture:** Satu lapis baca baru di `client/src/lib/chain/`, dipisah empat berkas menurut apa yang boleh disentuhnya: transport GraphQL murni (tanpa WASM), dekoder ledger (SATU-SATUNYA yang menyentuh WASM), orkestrasi tiga POST, dan pemetaan §9.4 ke tipe `Ballot`. Di atasnya satu hook mesin-keadaan dan satu berkas komponen berisi ENAM permukaan (memuat, indexer tak terjangkau, kueri ditolak, registry tidak ditemukan, state gagal didekode, salah konfigurasi) plus spanduk kegagalan sebagian dan permukaan registry kosong. Ketujuh komponen hasil C-1 tetap di tempatnya; yang berubah adalah dari mana `Ballot[]` berasal dan status apa saja yang bisa dibawanya.

**Tech Stack:** React 19.2.1, TypeScript 5.6.3, Vite 7.1.x + `vite-plugin-wasm`, Vitest 2.1.x, `@testing-library/react` 16.x, jsdom, `@midnight-ntwrk/compact-runtime@0.16.0` (yang membawa `@midnight-ntwrk/onchain-runtime-v3@3.1.1`), modul kontrak tergenerasi dari `pkgs/contract/src/managed/`, pnpm 10.4.1.

**Spec:** [`docs/superpowers/specs/2026-09-10-votepriv-midnight-design.md`](../specs/2026-09-10-votepriv-midnight-design.md) — §2.3, §2.4, §6.3, §8, §9.2, §9.4, §14.6, §14.7, §14.8.

**Rencana pendahulu:** [`2026-09-11-votepriv-pecah-home.md`](2026-09-11-votepriv-pecah-home.md) — Rencana C-1, sudah selesai. C-2a **bergantung penuh** padanya: tujuh komponen di `client/src/components/votepriv/` adalah tempat data nyata mendarat.

**Rencana penerus:** C-2b — jalur TULIS (`castVote`, `tallyVote`, `createBallot`, `finalize`). **Bukan bagian rencana ini.** Kewajiban C-2a terhadapnya hanya satu: meninggalkan bentuk yang memudahkannya, khususnya batas dynamic import yang sudah terpasang dan sudah dijaga mesin.

---

## Lingkup: apa yang C-2a kerjakan, dan apa yang TIDAK

C-2a **mengerjakan**: pembacaan registry dan seluruh ballot dari indexer, dekode ledger di browser, pemetaan 15 baris tabel §9.4, keadaan memuat dan keadaan gagal, serta uji terhadap fixture data nyata yang direkam.

C-2a **tidak menyentuh**, sama sekali:

| Tidak disentuh | Alasan |
|---|---|
| Wallet / Lace / DApp Connector | NOL baris pemetaan §9.4 membutuhkannya. Seluruh isinya didapat dengan tiga POST HTTP tanpa identitas |
| Proof server, artefak ZK (`keys/`, `zkir/`) | Jalur bukti hanya dibutuhkan jalur TULIS |
| Private state / IndexedDB / `midnight-js-level-private-state-provider` | Tidak ada witness yang disusun di C-2a |
| `castVote`, `tallyVote`, `createBallot`, `finalize` | C-2b |
| `pkgs/**` apa pun | Dibaca lewat alias, **tidak diubah satu bita pun**. Jangan jalankan `pnpm cli` maupun `pnpm contract` |
| `client/src/index.css` | Status baru dipetakan ke kelas tone yang **sudah ada**; lihat "Jebakan 1" |
| `client/src/lib/proof-server.ts`, `client/src/lib/midnight-wallet.ts` | Dibaca sebagai ketergantungan. 19 uji `proof-server.test.ts` wajib tetap hijau |
| Migrasi `client/` → `pkgs/app` | Lihat "Penyimpangan sadar dari §14.7" di bawah |

### Penyimpangan sadar dari spec §14.7

Spec §14.7 menulis: *"C-2 — integrasi nyata, dimulai dengan memindahkan `client/` ke `pkgs/app` karena tanpa itu klien tidak bisa mengimpor `pkgs/shared` sama sekali."*

**C-2a tidak melakukan pemindahan itu, dan alasannya diturunkan, bukan diselerakan.** Yang benar-benar dibutuhkan jalur baca hanya tiga berkas di dalam `pkgs/`:

```
pkgs/contract/src/managed/ballot/contract/index.js     fungsi ledger() untuk ballot
pkgs/contract/src/managed/registry/contract/index.js   fungsi ledger() untuk registry
pkgs/shared/src/network-config.ts                      URL indexer per jaringan
```

Ketiganya dapat dijangkau dengan **satu** entri alias (`@pkgs/*` → `./pkgs/*`) di `vite.config.ts`, `vitest.config.ts`, dan `tsconfig.json`. Memindahkan `client/` berarti mengubah jalur setiap berkas yang disebut rencana C-1, membatalkan setiap perintah di rencana ini sebelum dijalankan, dan menuntut `pnpm --filter contract build` (menyentuh `pkgs/`, yang dilarang) karena `pkgs/contract` mengekspor `dist/` sementara `dist/` ada di `.gitignore`. Alias menghindari ketiganya sekaligus dan tidak menutup pintu: pemindahan tetap tersedia untuk C-2b, di mana ia benar-benar berbayar karena jalur tulis butuh `pkgs/shared` seutuhnya.

---

## Temuan investigasi yang mengikat

Seluruhnya diverifikasi lewat percobaan yang **dijalankan**, bukan dokumentasi. **Jangan menurunkannya ulang, dan jangan membantahnya tanpa bukti baru.**

### Biaya: satu WASM, bukan dua

Membaca keadaan kontrak hanya menuntut WASM `onchain-runtime-v3` (**1.321.366 B**). Ia **BUKAN** `ledger-v8` (**10.143.782 B**) — `ledger-v8` milik jalur TULIS dan hanya masuk lewat paket `midnight-js-*`. Bundel Vite nyata yang dibangun dan dijalankan di Chromium: **1.450.943 B mentah / 413.803 B gzip / 306.578 B brotli**, dan ia benar-benar mendekode ballot di browser.

### Tiga syarat jalur browser, sudah teruji

1. **`vite-plugin-wasm` WAJIB.** Vite 7 menolak ESM-wasm secara eksplisit. `onchain-runtime-v3` mengekspor `midnight_onchain_runtime_wasm.js` pada kondisi `browser`, dan berkas itu mengimpor `.wasm` sebagai modul ESM.
2. **JANGAN memakai `midnight-js-indexer-public-data-provider` untuk MEMBACA.** Ia menyeret `ledger-v8` dan membengkakkan bundel jadi **12.383.609 B (8,5×)** tanpa menambah apa pun untuk pembacaan. Pakai `fetch` GraphQL biasa.
3. **Jalur tulis (C-2b) di belakang dynamic import.** Pemisahan kode TERBUKTI: muat awal tetap **1.451.420 B**, dan **10.932.682 B** baru turun saat jalur tulis dipicu.

### Bahaya yang sudah tercatat: instance GANDA `onchain-runtime-v3`

Dua instance memberi pesan **MENYESATKAN** — `"expected instance of ChargedState"` padahal datanya benar. Risikonya hidup di workspace ini karena `compact-runtime` **0.15.0 DAN 0.16.0** dua-duanya ada di pohon pnpm (`pkgs/cli` lewat `compact-js@2.5.0` memakai 0.15.0; `pkgs/contract` memakai 0.16.0). Task 2 memasang gerbang mekanis untuk ini, bukan catatan kaki.

### Lingkup pembacaan

15 baris tabel pemetaan spec §9.4; **NOL** butuh wallet. Seluruh isinya didapat dengan **TIGA POST HTTP** ke indexer.

Satu baris hanya terisi sebagian: kartu network status — block height **ADA**, tetapi **"waktu finality" TIDAK PUNYA FIELD di skema**. Padanan terdekat: `currentEpochInfo { durationSeconds, elapsedSeconds }`. Perintah penurunan ulang bila suatu saat diragukan ada di Task 5 Step 2; ia menghitung sendiri kecocokan `/final/i` atas seluruh tipe dan field skema, dan jawabannya hari ini nol.

---

## Global Constraints

- **Bahasa Indonesia untuk seluruh prosa, komentar kode, pesan galat internal, dan pesan commit.** Teks UI aplikasi tetap **Inggris**. Ini berlaku juga untuk teks baru yang lahir di rencana ini — kelima permukaan gagal, label status baru, dan setiap kalimat di kartu metrik. **Satu pengecualian yang dinyatakan eksplisit:** `GalatRantai.rincian` dirender ke pengguna di dalam panel galat, sehingga ia teks UI dan ditulis **Inggris** meski namanya terdengar seperti pesan internal.
- **Conventional Commits** di setiap langkah commit (`feat:`, `fix:`, `test:`, `build:`, `chore:`, `refactor:`, `docs:`).
- **Jangan commit apa pun yang belum lulus `pnpm check` DAN `pnpm test`.**
- **Port**: dev server operator SEDANG HIDUP di 5180. Setiap perintah di rencana ini yang menyalakan server memakai **`--port 5273`** eksplisit. **Jangan pernah** memakai 5180, 5173, 3000, atau 6300. `vite.config.ts` menyimpan `server.port: 3000` sebagai bawaan; nilai itu tidak diubah, tetapi tidak pernah dipakai apa adanya oleh rencana ini.
- **Jangan menjalankan `pnpm cli …` maupun `pnpm contract …`**, dan jangan mengubah satu bita pun di dalam `pkgs/`. Seluruh akses ke `pkgs/` bersifat baca, lewat alias.
- **Jangan menulis angka literal yang bisa basi ke dalam "Diharapkan".** Data nyata berubah: tinggi blok naik tiap 6 detik, ballot bisa bertambah, fase bergerak. Setiap harapan numerik di rencana ini **menurunkan nilainya sendiri** lewat perintah, atau bersifat kualitatif.
- **Uji TIDAK BOLEH bergantung pada nilai hidup.** Fixture direkam sekali (Task 4) dan uji berjalan terhadapnya. Satu pemeriksaan terpisah menyentuh jaringan sungguhan dan **boleh dilewati** (`VOTEPRIV_UJI_JARINGAN=1`); ia hanya mengassert bentuk dan monotonisitas, tidak pernah nilai.
- **Waktu selalu disuntikkan, tidak pernah dibaca dari `Date.now()` di dalam fungsi murni.** `turunkanStatus(ledger, sekarangMs)` menerima `sekarangMs` sebagai parameter wajib. Ini yang membuat J1 dapat diuji sama sekali.
- **Zona waktu dipatok UTC pada setiap pemformatan tanggal.** `Intl.DateTimeFormat("en-US", { timeZone: "UTC", … })`, dan UI menulis "UTC" apa adanya. Tanpa patokan ini, uji tampilan hanya sah di mesin yang membuatnya, dan deadline kontrak — yang dalam **detik sejak epoch UTC** — akan tampil digeser oleh zona waktu pembaca.
- **`quorumPercent` wajib disebut sebagai niat yang dinyatakan pembuat ballot, bukan ambang yang ditegakkan.** `ballot.compact` menyatakannya sendiri di komentar deklarasinya: nilai itu ditulis sekali di constructor dan **tidak pernah dibaca circuit mana pun**; `finalize()` berhasil pada partisipasi 0% persis seperti pada 100%. UI yang menampilkannya seolah mengikat adalah kebohongan yang dapat diperiksa siapa pun yang membaca kontrak.
- **Jangan pernah membiarkan kegagalan indexer terlihat seperti "tidak ada ballot".** `empty-state` ("No ballots found") hanya boleh dirender ketika pembacaan **berhasil** dan registry memang kosong. Ini dijaga uji, bukan disiplin.

---

## Enam keadaan yang lahir di rencana ini

Data mockup selalu ada seketika; data jaringan tidak. Fetch indexer terukur **1.047–1.279 ms** dan berasal dari layanan publik yang tidak kita kendalikan. Keempat keadaan di bawah dirancang sebagai permukaan yang nyata, masing-masing dengan kalimat yang menyebut apa yang dicoba dan alamat/host yang dituju — bukan "Something went wrong".

| Keadaan | Sebab (`GalatRantai.sebab`) | Pemicu yang diverifikasi | Permukaan |
|---|---|---|---|
| **memuat** | — | belum ada jawaban dari ketiga POST | kerangka kartu di grid ballot, angka metrik jadi `—`, kartu network status jadi `…`. Tombol yang akan berubah artinya (Vote) dinonaktifkan |
| **indexer-tak-terjangkau** | `jaringan`, `http`, `bukan-json`, `balasan-html` | `fetch` menolak, HTTP ≠ 200, `content-type` HTML, JSON rusak | panel galat penuh: nama host indexer, jaringan, rincian teknis, tombol **Retry** |
| **kueri-ditolak** | `graphql-fatal` | `data === null` di tingkat atas — kueri tidak dieksekusi, biasanya karena skema indexer berubah | panel galat penuh yang mengatakan bahwa ini **bukan** alamat atau jaringan yang salah, melainkan butuh perubahan kode. **Tidak** menyuruh memeriksa `VITE_MIDNIGHT_NETWORK` |
| **registry-tidak-ditemukan** | `registry-hilang` | `contract(address: REGISTRY)` mengembalikan `null` | panel galat penuh yang menyebut **alamat registry dan jaringan** — ini hampir selalu berarti alamat benar tapi jaringannya salah |
| **state-gagal-didekode** | `dekode` | `ContractState.deserialize()` atau `ledger()` melempar (`CompactError`) | panel galat penuh yang menyebut alamat kontrak dan kelas galatnya |
| **salah-konfigurasi** | `konfigurasi` | `VITE_MIDNIGHT_NETWORK` salah ketik, atau `VITE_VOTEPRIV_REGISTRY` bukan alamat sah — terjadi **sebelum** ada jaringan yang dituju | panel galat penuh yang menyebut nilai yang **diminta operator** apa adanya, dan **tidak menyebut jaringan mana pun**. `jaringan` bernilai `null`, bukan objek rekaan |
| *(bukan kegagalan)* **sebagian** | — | registry terbaca, tetapi *k* dari *n* ballot null / hilang aliasnya / gagal didekode | **spanduk di atas daftar yang tetap tampil**, menyebut *k* dan alamatnya. Daftar yang berhasil tidak disembunyikan |
| *(bukan kegagalan)* **registry kosong** | — | pembacaan **berhasil** dan `registry.ballots` memang kosong | permukaan `empty-state` yang menyebut bahwa registry **terbaca dengan sukses** dan tinggi bloknya. Tanpa `role="alert"`, karena ia bukan galat |

Dua keadaan di atas lahir dari kritik terhadap versi pertama rencana ini, dan keduanya menutup lubang yang sama: **sebab yang dikonflasikan menghasilkan saran yang salah.** "Registry not found on this network — check VITE_MIDNIGHT_NETWORK" pada indexer yang skemanya berubah mengirim orang memeriksa variabel yang sudah benar; dan melaporkan salah ketik env sebagai kegagalan jaringan *preview* menuntut UI mengarang objek konfigurasi yang menyebut jaringan yang justru **tidak** diminta.

Dua fakta empiris yang membentuk baris terakhir, dan yang tidak boleh ditebak ulang:

1. **Alamat yang bukan hex membunuh hanya aliasnya sendiri, bukan seluruh batch.** Diverifikasi: kueri dengan dua alias, satu alamat sah dan satu `"bukan-hex"`, mengembalikan `data.b0` terisi, `b1` **tidak muncul sebagai kunci sama sekali**, dan satu entri di `errors`. Pembaca karena itu wajib memeriksa `"b1" in data`, bukan `data.b1 === null`.
2. **`errors` yang tidak kosong BUKAN kegagalan total.** Memperlakukannya sebagai kegagalan total berarti satu entri sampah di registry — yang permissionless, dan yang `registry.compact` sendiri sebut harus "disaring di sisi klien" — menghapus seluruh ballot dari layar. Itu persis bentuk "kegagalan indexer terlihat seperti tidak ada ballot" yang dilarang di atas.

---

## Empat jebakan, dan bagaimana rencana ini menutupnya

### Jebakan 1 — `BallotStatus` tiga-nilai TIDAK CUKUP

`BallotStatus = "live" | "closing-soon" | "finalized"` tidak punya anggota yang cocok untuk keadaan yang **benar-benar ada di rantai hari ini**: ballot `f597222d…` berada di `phase = voting` sementara **kedua** deadline-nya sudah lewat. UI akan berbunyi "Live now" padahal `castVote` **PASTI** ditolak kontrak (`assert(kernel.blockTimeLessThan(voteDeadline))`), dan chip filter akan berbunyi "Live 1" yang **BOHONG**.

Akarnya ada di kontrak dan tidak akan berubah: **transisi fase bersifat MALAS.** `ballot.compact` tidak punya circuit `closeVoting`; `phase` berpindah dari `voting` ke `tallying` hanya ketika pembuka suara **pertama** memanggil `tallyVote()`, dan ke `finalized` hanya ketika seseorang memanggil `finalize()`. Ballot yang tidak pernah dibuka satu suara pun tinggal di `phase = voting` **selamanya**.

**Penutupnya.** Turunan status WAJIB membandingkan waktu dinding terhadap `voteDeadline`/`tallyDeadline`, bukan membaca `phase` saja. `BallotStatus` tumbuh menjadi **lima** anggota:

| Anggota | Kondisi | Label Inggris | Tone CSS yang dipakai |
|---|---|---|---|
| `live` | `phase = voting` **dan** `now < voteDeadline` | `Live now` | *(kelas dasar `status-badge`)* |
| `closing-soon` | `live` **dan** `voteDeadline - now ≤ ambangTutupSegeraMs(ballot)` | `Closing soon` | `closing-soon` |
| `tally-open` | `now ≥ voteDeadline` **dan** `now < tallyDeadline` **dan** `phase ≠ finalized` | `Opening votes` | `closing-soon` |
| `awaiting-finalize` | `now ≥ tallyDeadline` **dan** `phase ≠ finalized` | `Awaiting finalization` | `closing-soon` |
| `finalized` | `phase = finalized` | `Finalized` | `finalized` |

`phase = finalized` diperiksa **paling dulu**, karena ia satu-satunya penanda finalitas yang eksplisit di on-chain dan tidak pernah mundur.

**Ambang "closing soon" DITURUNKAN dari ballot itu sendiri, bukan dipatok 24 jam.** Ini bukan penghalusan; ambang tetap 24 jam membuat anggota `live` **praktis mustahil tercapai** pada data yang benar-benar ada. Diukur terhadap kedua ballot di preview hari ini:

| Ballot | deploy → `voteDeadline` | `tallyDeadline − voteDeadline` |
|---|---|---|
| `f597222d…` | **3.597 detik (≈ 60 menit)** | 2.100 detik (35 menit) |
| `f26827a7…` | **3.593 detik (≈ 60 menit)** | 2.100 detik (35 menit) |

Seluruh umur sebuah ballot lebih pendek daripada 1/24 ambang 24 jam. Dengan ambang tetap, setiap ballot yang baru saja di-deploy langsung berbunyi `Closing soon` sejak detik pertama, `Live now` tidak pernah muncul sekali pun, dan chip `Open` menghitung sesuatu yang labelnya tidak pernah terlihat.

Yang dipakai:

```
ambangTutupSegeraMs(ballot) = min(BATAS_ATAS_TUTUP_SEGERA_MS, tallyDeadlineMs − voteDeadlineMs)
```

`tallyDeadline − voteDeadline` adalah satu-satunya rentang yang **pembuat ballot sendiri nyatakan** dan yang tersedia bagi fungsi murni `turunkanStatus` tanpa pembacaan tambahan (`deploy → voteDeadline` menuntut tinggi blok deploy, yang tidak ada di ledger). Pada ballot 60 menit hari ini ia memberi 35 menit: `Live now` selama ≈25 menit pertama, `Closing soon` selama 35 menit terakhir. Pada ballot bertempo bulanan ia jatuh ke batas atas 24 jam, yang memang perilaku yang diinginkan di sana.

Batas kejujurannya, dinyatakan apa adanya: kontrak hanya menuntut `tallyDeadline > voteDeadline`, jadi seorang pembuat ballot boleh menetapkan jendela tally satu detik — dan pada ballot semacam itu `Closing soon` hanya tampil satu detik. Itu konsekuensi yang benar dari menurunkan ambang dari niat pembuatnya, bukan cacat; menambahkan lantai tetap akan mengembalikan konstanta ajaib yang baru saja dibuang.

**`client/src/index.css` TIDAK disentuh.** Kelas tone yang ada hanya tiga (`status-badge` dasar, `.status-badge.closing-soon`, `.status-badge.finalized`), dan lima status baru dipetakan ke ketiganya lewat `statusTone()`. Ini bukan kompromi estetis melainkan pemisahan yang benar: **status adalah fakta rantai, tone adalah keputusan visual**, dan memaksa keduanya berbagi satu string adalah sebab kenapa enum tiga-nilai itu mustahil ditumbuhkan tanpa menyentuh CSS.

### Jebakan 2 — INDEKS REGISTRY BUKAN NOMOR SERI

`registry.compact` memakai `ballots.pushFront(…)`, jadi **terbaru di depan**. Diverifikasi hari ini:

| Alamat | Blok `ContractDeploy` | Blok `register` di registry | Indeks di `registry.ballots` |
|---|---|---|---|
| `f597222d…` | lebih rendah | lebih rendah | **1** |
| `f26827a7…` | lebih tinggi | lebih tinggi | **0** |

Yang **lebih dulu** didaftarkan duduk di indeks **1**. Menurunkan `"ballot-001"` dari indeks karena itu akan **MENOMORI ULANG ballot lama setiap ada pendaftaran baru** — nomor yang orang kutip di forum berubah arti tanpa satu pun transaksi menyentuh ballot itu.

**Penutupnya, dua lapis:**

1. **`Ballot.id` adalah alamat kontrak 64-hex, titik.** Ia satu-satunya identitas yang benar-benar ada di rantai (§14.6 menyebut `Ballot.id` tidak punya sumber on-chain; alamatnyalah sumber itu). Ia yang dipakai sebagai `key` React dan sebagai pengenal di modal.
2. **Nomor urut tampilan `Ballot.nomor` diturunkan dari tinggi blok `ContractDeploy`, urut naik** — bukan dari indeks registry. Diambil dengan `actions(limit: 1, type: DEPLOY)`, yang mengembalikan deploy langsung tanpa harus menyusuri seluruh riwayat aksi.

**Batas kejujurannya, dinyatakan apa adanya:** nomor urut ini stabil pada alur normal *deploy lalu daftar*, karena tinggi blok tidak pernah mundur sehingga ballot baru selalu mendapat nomor tertinggi. Ia **tidak** stabil bila seseorang mendaftarkan ballot yang di-deploy jauh sebelumnya — nomor itu menyisip di tengah dan menggeser yang di atasnya. Karena itu nomor urut **hanya boleh dipakai sebagai teks tampilan**, tidak pernah sebagai `key`, tidak pernah di URL, dan tidak pernah sebagai pengenal yang dikirim ke mana pun.

### Jebakan 3 — Map `tallies` JARANG

Ballot `f26827a7…` memegang `tallies = [[2, 1], [0, 2]]`. **Kunci `1` TIDAK ADA — bukan bernilai 0.** Pengindeksan naif (`tallies[i]`) akan salah baca, dan `lookup()` pada kunci yang tidak ada **melempar** `"expected a cell, received null"`; `periksa.ts` di `pkgs/cli` sudah mencatat perilaku ini.

**Penutupnya:** satu fungsi pemadat yang mengiterasi map dan mengisi lubangnya, dengan `member()` sebagai penjaga, bukan `lookup()`:

```ts
export function padatkanTallies(pasangan: Iterable<readonly [bigint, bigint]>, jumlahOpsi: number): number[]
```

Bentuk padat `[2, 0, 1]` → 67% / 0% / 33%. Uji fixture Task 6 mengassert justru posisi yang lubangnya: indeks 1 harus `0`, dan harus datang dari pemadatan, bukan dari `lookup()` yang kebetulan tidak dipanggil.

### Jebakan 4 — `talliedCount === 0` BUKAN "hasil masih tersegel"

Godaannya sangat besar, karena pemetaannya terlihat benar: kalau belum ada suara yang dibuka, jangan tampilkan persentase, tampilkan "Results sealed until the vote deadline". Kalimat itu **salah pada tiga dari lima status**, dan salah pada ballot yang benar-benar ada di rantai hari ini.

Diverifikasi hari ini di preview:

Nilai di bawah adalah **detik epoch yang tersimpan di ledger**, bukan selisih terhadap "sekarang". Itu disengaja: deadline tidak pernah bergerak, sementara selisih terhadap jam dinding basi setiap menit — dan tabel yang basi adalah persis kesalahan yang rencana ini larang di tempat lain.

| Ballot | `phase` | `voteCount` | `talliedCount` | `voteDeadline` | `tallyDeadline` |
|---|---|---|---|---|---|
| `f597222d…` | 0 (`voting`) | 0 | **0** | `1789086147` (2026-09-11T00:22:27Z) | `1789088247` (2026-09-11T00:57:27Z) |
| `f26827a7…` | 2 (`finalized`) | 3 | 3 | `1789101131` (2026-09-11T04:32:11Z) | `1789103231` (2026-09-11T05:07:11Z) |

Keduanya sudah melewati **kedua** deadline-nya saat rencana ini ditulis, dan — karena tinggi blok tidak pernah mundur — akan **tetap** begitu selamanya. `f597222d…` karena itu berstatus turunan `awaiting-finalize` tanpa satu suara pun dibuka.

Aturan `tallies === null → "tersegel"` membuat halaman Results berbunyi *"Results sealed until the vote deadline"* pada ballot yang vote deadline-nya **sudah lewat**. Itu bukan penyederhanaan; itu pernyataan yang dapat dibantah siapa pun yang membuka indexer, dan ia hanya akan makin salah seiring waktu.

Dan ballot itu berjarak **satu panggilan `finalize()`** dari keadaan kedua yang sama buruknya: `phase = finalized`, `talliedCount = 0`. Sebuah ballot yang **sudah final** akan berbunyi "tersegel".

**Penutupnya: keadaan hasil digantung pada STATUS TURUNAN, bukan pada hitungan**, dan ia punya **empat** nilai, bukan dua:

| `KeadaanHasil` | Kapan | Yang dirender Results |
|---|---|---|
| `ada-hasil` | `tallied > 0` | bar + persentase; bila `tallied < votes`, tambahkan "N of M opened" |
| `tersegel` | `tallied = 0` dan status `live`/`closing-soon` | "Results stay sealed until the vote deadline" — **benar**, deadline memang belum lewat |
| `menunggu-pembukaan` | `tallied = 0` dan status `tally-open` | "Voting closed. No sealed vote has been opened yet." |
| `tidak-ada-yang-dibuka` | `tallied = 0` dan status `awaiting-finalize`/`finalized` | "No sealed vote was opened before the tally deadline." Bila `votes = 0` juga: "No votes were cast." |

`Ballot.tallies` karena itu berhenti menjadi `number[] | null` dan menjadi `number[]` yang **selalu** padat. Bentuk `| null` adalah tempat konflasi itu bersembunyi: satu nilai dipakai memikul empat arti, dan tidak ada satu pun komponen yang dapat membedakannya lagi setelahnya.

---

## Keputusan atas uji paritas warisan C-1

`client/src/test/paritas-garis-dasar.test.tsx` membandingkan render `Home` terhadap `garis-dasar-tampilan.json`, yang merekam tampilan **MOCK**. C-2a sengaja mengubah tampilan itu, jadi uji tersebut **PASTI merah**. Garis dasarnya **TIDAK DAPAT diregenerasi**: jalur penulisnya (`scripts/pindah-komponen.mjs`) dan salinan beku sumbernya (`client/src/__pra-pecah__/`) sudah dibongkar di C-1 Task 8.

**Keputusan diambil di Task 1, bukan saat merah pertama, dan dieksekusi di sana.** Isinya, alasannya, dan penggantinya ada di Task 1. Ringkasnya: uji itu **dihapus secara sadar dan tercatat**, `cap-tampilan.tsx` **dipertahankan tanpa perubahan dan tanpa pengimpor**, dan penggantinya adalah uji yang mengassert perilaku **BARU** terhadap fixture data nyata yang direkam — tanpa memakai `cap-tampilan.tsx` sama sekali.

---

## Peta berkas

| Berkas | Tanggung jawab | Nasib |
|---|---|---|
| `client/src/lib/chain/endpoint.ts` | Jaringan aktif, URL indexer, alamat registry. Murni, tanpa I/O | baru (T2) |
| `client/src/lib/chain/graphql.ts` | `postGraphQL()`, penjaga HTML-200, taksonomi `GalatRantai`. **Tanpa WASM** | baru (T3) |
| `client/src/lib/chain/kueri.ts` | Tiga dokumen GraphQL, **dua fragmen** (`...Penuh` dengan riwayat aksi, `...Ringkas` tanpa), + tipe respons. Murni string & tipe | baru (T5) |
| `client/src/lib/chain/dekode.ts` | **SATU-SATUNYA modul yang mengimpor WASM.** `dekodeRegistry`, `dekodeBallot` | baru (T4) |
| `client/src/lib/chain/baca-rantai.ts` | Orkestrasi tiga POST, batching, kegagalan sebagian, **dekode + selisih snapshot aksi** | baru (T5) |
| `client/src/lib/chain/ke-ballot.ts` | Pemetaan 15 baris §9.4 → `Ballot`; `padatkanTallies` | baru (T6) |
| `client/src/lib/chain/jalur-tulis.ts` | Seam dynamic import untuk C-2b, dijaga mesin | baru (T9) |
| `client/src/lib/chain/index.ts` | Permukaan publik baca-saja | baru (T5) |
| `client/src/hooks/useDataRantai.ts` | Mesin keadaan `memuat \| siap \| gagal` + refresh | baru (T7) |
| `client/src/components/votepriv/KeadaanRantai.tsx` | Lima permukaan gagal + kerangka memuat + spanduk sebagian | baru (T7) |
| `client/src/test/fixture-rantai/*.json` | Rekaman respons indexer sungguhan | baru (T4) |
| `client/src/test/paritas-permukaan-rantai.test.tsx` | Assert tulis-tangan + pemeriksaan himpunan kelas CSS terhadap fixture — pengganti uji paritas warisan. **Tidak** memakai `cap-tampilan.tsx` | baru (T8) |
| `client/src/test/fixture-ballot.ts` | Satu pembuat `Ballot` untuk seluruh uji komponen | baru (T8) |
| `client/src/components/votepriv/Overview.test.tsx` | Gerbang registry KOSONG — `ballots[0]` yang `undefined` | baru (T8) |
| `client/src/pages/Home.smoke.test.tsx` | Stub `fetch`; tanpa itu `pnpm test` mulai menembak indexer publik | diubah (T8) |
| `client/src/components/votepriv/types.ts` | `BallotStatus` lima nilai, `KeadaanHasil` empat nilai, `Ballot` bertambah field rantai (`tallies` jadi `number[]`, bukan nullable) | diubah (T6) |
| `client/src/components/votepriv/ballot-status.ts` | `turunkanStatus`, `ambangTutupSegeraMs`, `statusLabel`, `statusTone`, `statusTag`, `menerimaSuara`, `keadaanHasil` | diubah (T6) |
| `client/src/components/votepriv/BallotCard.tsx` | Tone, kebijakan eligibility, kuorum sebagai niat | diubah (T8) |
| `client/src/components/votepriv/LiveBallots.tsx` | Chip filter jujur, keadaan kosong vs gagal | diubah (T8) |
| `client/src/components/votepriv/Overview.tsx` | Metrik, network status, recent activity **berselisih ledger**, gerbang registry kosong | diubah (T8) |
| `client/src/components/votepriv/Results.tsx` | Persentase nyata, **empat** keadaan hasil, provenans menggantikan `Demo data below`, tombol baca-ulang yang benar-benar bekerja | diubah (T8) |
| `client/src/components/votepriv/VoteModal.tsx` | Gerbang: tidak menawarkan vote ketika kontrak pasti menolak | diubah (T8) |
| `client/src/pages/Home.tsx` | Memakai `useDataRantai`, bukan `initialBallots` | diubah (T8) |
| `client/src/components/votepriv/Docs.tsx` | Teks §6.3 dan batas klaim | diubah (T9) |
| `client/src/components/votepriv/CreateBallotModal.tsx` | Prop `onCreate` dicabut; deploy sungguhan adalah C-2b | diubah (T8) |
| `client/src/components/votepriv/demo-data.ts` | — | **dihapus (T8)** |
| `client/src/test/paritas-garis-dasar.test.tsx` | — | **dihapus (T1)** |
| `client/src/test/garis-dasar-tampilan.json` | — | **dihapus (T1)** |
| `client/src/test/cap-tampilan.tsx` | Ekstraktor empat lapis warisan C-1. **TIDAK dipakai** uji pengganti dan tidak punya pengimpor setelah T1 — dipertahankan sebagai modal, bukan sebagai bagian yang aktif. Lihat Task 1 | **tetap, tidak diubah** |
| `vite.config.ts` | `vite-plugin-wasm`, alias `@pkgs`, `fs.allow`, `dedupe` | diubah (T2) |
| `vitest.config.ts` | Alias `@pkgs`, `dedupe`, `vite-plugin-wasm`, TZ dipatok UTC | diubah (T2) |
| `tsconfig.json` | `paths` untuk `@pkgs/*` **dan `"target": "ES2022"`** — tanpa target, TS memakai ES5 dan setiap spread atas tipe ledger melempar TS2802 | diubah (T2) |
| `tsconfig.uji.json` | Salinan konfigurasi **tanpa** `exclude: **/*.test.ts`, supaya delapan berkas uji `.test.ts` yang lahir di rencana ini benar-benar ditypecheck | baru (T2) |
| `package.json` | `@midnight-ntwrk/compact-runtime` (`--save-exact`), `vite-plugin-wasm`, skrip `check:uji` | diubah (T2) |
| `.env.example` | `VITE_MIDNIGHT_NETWORK`, `VITE_VOTEPRIV_REGISTRY` | diubah (T2) |

---

## Urutan yang dipaksa ketergantungan

Urutan di bawah bukan selera. Mengubahnya berarti menulis uji terhadap modul yang belum bisa di-build, atau memetakan ledger yang belum bisa didekode.

```
Task 1  keputusan atas uji paritas warisan + penggantinya disebut namanya
Task 2  fondasi build browser: vite-plugin-wasm, alias, gerbang instance tunggal
           └── tanpa ini tidak ada satu pun modul berikutnya yang bisa di-import
Task 3  transport GraphQL + taksonomi galat            (murni, tanpa WASM)
Task 4  dekoder ledger + REKAMAN FIXTURE               (butuh Task 2)
           └── fixture direkam di sini karena seluruh uji sesudahnya memakainya
Task 5  tiga kueri + orkestrasi baca-rantai            (butuh Task 3 dan Task 4)
Task 6  pemetaan §9.4 → Ballot, status lima nilai       (butuh Task 4, fixture)
Task 7  hook mesin-keadaan + permukaan memuat/gagal      (butuh Task 5 dan Task 6)
Task 8  pemasangan ke tujuh komponen + uji pengganti    (butuh Task 7)
Task 9  pembersihan, seam C-2b, gerbang bundel, penutupan
```

---

### Task 1: Nasib uji paritas warisan — keputusan, eksekusi, dan penggantinya

Uji ini dijadwalkan **pertama** justru karena ia akan merah. Membiarkannya merah sampai Task 8 berarti setiap task di antaranya berjalan dengan gerbang yang sudah rusak, dan `pnpm test` berhenti bermakna sebagai gerbang commit. Yang lebih buruk: keputusan yang diambil saat merah pertama selalu diambil di bawah tekanan untuk menghijaukan, dan keputusan seperti itu hampir selalu berupa pelonggaran diam-diam.

**KEPUTUSAN: `client/src/test/paritas-garis-dasar.test.tsx` dan `client/src/test/garis-dasar-tampilan.json` DIHAPUS. `client/src/test/cap-tampilan.tsx` DIPERTAHANKAN.**

Empat alasan, masing-masing berdiri sendiri:

1. **Ia mengassert "tampilan tidak pernah berubah" sementara seluruh tujuan C-2a adalah mengubah tampilan itu.** Mempertahankan uji semacam ini sambil sengaja melanggar isinya bukan kehati-hatian, melainkan inkoherensi: ia akan dilonggarkan berulang kali sampai tidak mengassert apa pun, dan setiap pelonggaran menghapus jejak apa yang sebenarnya dijaga.
2. **Garis dasarnya tidak dapat diregenerasi.** Salinan beku `client/src/__pra-pecah__/HomePraPecah.tsx` dan `scripts/pindah-komponen.mjs` sudah dibongkar di C-1 Task 8. Pilihan yang benar-benar tersedia hanya dua — hapus, atau tulis ulang dari `Home` hidup pasca-perubahan. Komentar di kepala berkas uji itu sendiri sudah menyebut keduanya, dan sudah menyebut cacat pilihan kedua.
3. **Pilihan kedua menghasilkan bukti palsu.** Garis dasar yang ditulis dari `Home` yang sedang diubah bukan lagi nilai "sebelum" yang independen; ia turunan dari kode yang sedang diujinya sendiri. Rencana C-1 menuliskan kaidah ini apa adanya: *"Sebuah uji yang menghitung 'sebelum' dari kode yang sedang diubah tidak menjaga apa pun: ia hanya membandingkan kode dengan dirinya sendiri dan akan tetap hijau ketika satu kelas hilang, karena kelas itu hilang di kedua sisi."* Menulis ulang JSON-nya di sini berarti melanggar kaidah yang ditulis rencana sebelumnya untuk melindungi pekerjaan ini.
4. **Ia sudah MENUNAIKAN tugasnya.** Ia membuktikan C-1 tidak mengubah apa pun. Pembuktian itu sudah terjadi, tercatat di riwayat git, dan tetap benar setelah berkasnya hilang. Menghapus uji tidak membatalkan bukti yang sudah ia hasilkan.

**Yang menggantikannya, disebut namanya sekarang dan dibangun di Task 8:** `client/src/test/paritas-permukaan-rantai.test.tsx`. Ia merender `Home` di atas **fixture data on-chain yang direkam** (Task 4), dengan waktu dinding yang disuntikkan, dan membandingkan dua hal yang berbeda sifatnya:

- **Assert literal yang ditulis tangan** untuk yang menanggung beban: label status kelima anggota, kelima teks chip filter, persentase hasil dari tallies jarang, nomor urut dari tinggi blok deploy, dan kalimat setiap permukaan gagal. Inilah bukti kebenarannya, dan nilainya **tidak** diturunkan dari kode yang diuji.
- **Pemeriksaan himpunan kelas CSS** atas sisanya, sebagai **detektor perubahan**, bukan bukti kebenaran. Ia menjaga janji C-2a bahwa tidak satu baris `index.css` pun ditambah.

**Nasib `cap-tampilan.tsx`, dinyatakan apa adanya dan bukan dengan klaim yang enak dibaca.**

Uji pengganti **TIDAK mengimpor satu pun simbol** dari `cap-tampilan.tsx`. Ia mengumpulkan kelas CSS sendiri dengan `container.querySelectorAll("*")`, yang satu lapis, bukan empat. Mengatakan bahwa ia "memakai ekstraktor empat lapis yang sama" akan menjadi klaim yang salah — dan justru kelas klaim yang rencana ini ada untuk membuang.

Karena itu:

1. `cap-tampilan.tsx` **tetap dipertahankan**, tetapi alasannya **bukan** "dipakai ulang uji pengganti". Alasannya: ia memuat empat ekstraktor (`tokenKelas`, `normalkanTeks`, `atributLain`, `capDari`) plus `rekamPermukaan()` yang menjelajah tiga belas permukaan, dan menulis ulangnya dari nol jauh lebih mahal daripada membiarkannya menunggu pemakai berikutnya. Ia **modal yang disimpan**, bukan modal yang sedang dipakai.
2. Setelah Task 1, berkas itu **tidak punya satu pun pengimpor**. Itu dinyatakan di sini supaya tidak ditemukan sebagai kejutan, dan supaya tidak ada yang menyimpulkan dari ketiadaan pengimpor bahwa ia aman dihapus tanpa keputusan tersendiri.
3. Task 8 **tidak** menumbuhkan skrip interaksinya. Menambah permukaan ke `rekamPermukaan()` yang tidak dipanggil siapa pun adalah pekerjaan yang hasilnya tidak pernah dijalankan — dan pekerjaan semacam itu selalu busuk tanpa ada yang tahu.

**Files:**
- Delete: `client/src/test/paritas-garis-dasar.test.tsx`, `client/src/test/garis-dasar-tampilan.json`
- Modify: tidak ada
- Test: tidak ada berkas uji baru di task ini; penggantinya lahir di Task 8

**Interfaces:**
- Consumes: tidak ada.
- Produces: tidak ada simbol baru. Yang dihasilkan task ini adalah **catatan keputusan** di pesan commit, beserta sha256 kedua berkas yang dihapus, sehingga penghapusannya dapat diaudit tanpa menggali diff 271 KB.

- [ ] **Step 1: Rekam bukti keberadaan kedua berkas sebelum dihapus**

Angka-angka ini masuk ke pesan commit di Step 4. Ia yang mengubah "penghapusan diam-diam" menjadi "keputusan tercatat": siapa pun bisa membuktikan berkas mana yang hilang dan seberapa besar, tanpa memuat JSON 271 KB dari riwayat.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
sha256sum client/src/test/paritas-garis-dasar.test.tsx client/src/test/garis-dasar-tampilan.json \
  | tee /tmp/votepriv-c2a-paritas-warisan.txt
wc -c client/src/test/paritas-garis-dasar.test.tsx client/src/test/garis-dasar-tampilan.json
```

Diharapkan: dua baris sha256 dan tiga baris `wc -c` (dua berkas + total). Simpan keluarannya; ia dipakai di Step 4.

- [ ] **Step 2: Buktikan bahwa jalur regenerasinya memang sudah tidak ada**

Ini bukan formalitas. Alasan nomor 2 di atas berdiri atau jatuh di atas fakta ini, dan fakta itu diperiksa, bukan diingat.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
for p in client/src/__pra-pecah__ scripts/pindah-komponen.mjs; do
  if [ -e "$p" ]; then echo "MASIH ADA: $p — HENTIKAN, alasan penghapusan tidak berlaku"; else echo "sudah tidak ada: $p"; fi
done
```

Diharapkan: dua baris `sudah tidak ada:`. Bila salah satu berbunyi `MASIH ADA`, **hentikan task ini** — regenerasi ternyata masih mungkin, dan keputusan di atas harus ditinjau ulang sebelum satu berkas pun dihapus.

- [ ] **Step 3: Hapus kedua berkas**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git rm client/src/test/paritas-garis-dasar.test.tsx client/src/test/garis-dasar-tampilan.json
ls client/src/test/
```

Diharapkan: `ls` hanya menyisakan `cap-tampilan.tsx`.

- [ ] **Step 4: Jalankan uji dan typecheck, lalu commit dengan alasannya**

Alasan ditulis di badan commit, bukan di judul, dan sha256 dari Step 1 ikut — supaya keputusan ini terbaca sebagai keputusan.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm test 2>&1 | tail -12
```

Diharapkan: `pnpm check` tanpa keluaran. `pnpm test` hijau, dengan jumlah berkas uji berkurang satu dibanding sebelum Step 3 — turunkan pembandingnya sendiri dengan `git stash` bila ragu; jangan bandingkan terhadap angka yang diketik di rencana ini.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git commit -F - <<'EOF'
test(app): hapus uji paritas garis dasar warisan C-1 secara sadar

C-2a mengganti data mockup dengan data on-chain nyata, sehingga tampilan
memang berubah. Uji paritas warisan mengassert kebalikannya — bahwa tampilan
tidak pernah berubah — dan karena itu tidak dapat dipertahankan bersama
perubahan yang disengaja ini tanpa dilonggarkan sampai tidak mengassert apa pun.

Garis dasarnya TIDAK DAPAT diregenerasi: salinan beku HomePraPecah.tsx dan
scripts/pindah-komponen.mjs sudah dibongkar di C-1 Task 8 (diperiksa ulang
sebelum penghapusan ini). Menulis ulang JSON-nya dari Home hidup pasca-perubahan
akan menghasilkan garis dasar yang diturunkan dari kode yang sedang diujinya
sendiri — cacat yang rencana C-1 tuliskan sendiri sebagai alasan memakai salinan
beku yang dieksekusi, bukan nilai turunan.

Uji ini SUDAH menunaikan tugasnya: ia membuktikan C-1 tidak mengubah apa pun,
dan pembuktian itu tetap benar setelah berkasnya hilang.

Penggantinya, dibangun di C-2a Task 8:
client/src/test/paritas-permukaan-rantai.test.tsx — mengassert perilaku BARU
terhadap fixture data on-chain yang direkam, dengan waktu dinding disuntikkan.
Assert yang menanggung beban ditulis tangan; pemeriksaan himpunan kelas CSS
dipakai sebagai detektor perubahan dan disebut demikian.

client/src/test/cap-tampilan.tsx DIPERTAHANKAN, tetapi TIDAK dipakai uji
pengganti dan tidak punya pengimpor setelah commit ini. Ia disimpan sebagai
modal: empat ekstraktornya dan penjelajah tiga belas permukaannya mahal untuk
ditulis ulang. Menyebutnya "dipakai ulang" akan menjadi klaim yang salah.

Berkas yang dihapus, beserta sha256-nya saat dihapus:
(salin dua baris keluaran Step 1 ke sini)
EOF
git log -1 --stat
```

Diharapkan: `git log -1 --stat` menampilkan dua berkas terhapus dengan jumlah baris yang dibuang sesuai `wc` di Step 1.

**Deliverable:** uji paritas warisan hilang sebagai **keputusan tercatat**, bukan sebagai penghapusan diam-diam; `cap-tampilan.tsx` tetap ada, dengan status sebenarnya — modal tanpa pengimpor — dinyatakan apa adanya alih-alih dibungkus klaim "dipakai ulang"; `pnpm test` kembali menjadi gerbang yang bermakna untuk delapan task berikutnya.

---

### Task 2: Fondasi build browser — `vite-plugin-wasm`, alias `@pkgs`, gerbang instance tunggal

Tidak satu pun modul di task berikutnya dapat di-import tanpa task ini. Empat hal dipasang sekaligus karena semuanya gagal bersama-sama kalau salah satu hilang:

1. `vite-plugin-wasm` — Vite 7 menolak ESM-wasm secara eksplisit, dan `onchain-runtime-v3` memakainya pada kondisi `browser`.
2. Alias `@pkgs/*` — satu-satunya jalan ke `ledger()` tanpa memindahkan `client/` ke `pkgs/app` dan tanpa menjalankan build di `pkgs/`.
3. **`"target": "ES2022"` di `tsconfig.json`** — repo ini tidak punya `target` sama sekali, jadi TypeScript memakai bawaannya (**ES5**), dan pada ES5 setiap iterasi atas tipe ledger tergenerasi melempar **TS2802**. Tanpa langkah ini, empat gerbang "`pnpm check` tanpa keluaran" di Task 4, 6, 8, dan 9 mustahil dilewati. Lihat Step 3.
4. Gerbang instance tunggal — pohon pnpm repo ini memuat `compact-runtime` **0.15.0 dan 0.16.0**, dan pesan galat dari instance ganda (`"expected instance of ChargedState"`) menyesatkan justru ketika datanya benar.

**Files:**
- Create: `client/src/lib/chain/endpoint.ts`, `client/src/lib/chain/endpoint.test.ts`, `client/src/lib/chain/instance-tunggal.test.ts`, `tsconfig.uji.json`
- Modify: `package.json` (dua ketergantungan + skrip `check:uji`), `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `.env.example`
- Test: `client/src/lib/chain/endpoint.test.ts`, `client/src/lib/chain/instance-tunggal.test.ts`

**Interfaces:**
- Consumes:
  - `@pkgs/shared/src/network-config` → `MIDNIGHT_NETWORK_ENDPOINTS: Record<MidnightNetworkId, MidnightNetworkEndpoints>`, `type MidnightNetworkId = "preprod" | "preview" | "undeployed"`
  - `@pkgs/contract/src/managed/ballot/contract/index.js` → `ledger(state: StateValue | ChargedState): Ledger`
  - `@pkgs/contract/src/managed/registry/contract/index.js` → `ledger(state: StateValue | ChargedState): Ledger`
  - `@midnight-ntwrk/compact-runtime` → `ContractState`, `ChargedState`, `StateValue`, `CompactError`
- Produces:
  - `type JaringanAktif = { networkId: MidnightNetworkId; indexer: string; indexerWS: string; alamatRegistry: string }`
  - `jaringanAktif(env?: Record<string, string | undefined>): JaringanAktif`
  - `ALAMAT_REGISTRY_BAWAAN: string`
  - `JARINGAN_BAWAAN: MidnightNetworkId`
  - `alamatKontrakValid(alamat: string): boolean`

- [ ] **Step 1: Pasang kedua ketergantungan, dengan versi `compact-runtime` dipatok dari pohon yang sudah ada**

Versinya **tidak diketik dari ingatan**; ia dibaca dari `pkgs/contract/package.json`, yang merupakan satu-satunya pihak yang sudah berhasil memanggil `ledger()`. Modul tergenerasi memanggil `checkRuntimeVersion('0.16.0')` pada saat import dan **melempar** pada runtime mayor/minor yang tidak cocok, jadi versi yang salah gagal nyaring — tetapi gagal nyaring di tengah Task 4 jauh lebih mahal daripada memilih benar di sini.

**`--save-exact` WAJIB pada `compact-runtime`.** Tanpanya `pnpm add` menyimpan dengan prefiks `^` (bawaan pnpm; repo ini tidak punya `.npmrc` yang mengubahnya — diperiksa), sehingga `package.json` akan berbunyi `^0.16.0` sementara `pkgs/contract` berbunyi `0.16.0`. Dua string itu **tidak identik**, jadi harapan "identik" akan terbaca gagal padahal instalasinya benar — dan lebih buruk, `^` membiarkan `pnpm install` berikutnya menaikkan minor ke versi yang `checkRuntimeVersion('0.16.0')` **tolak saat import**, yaitu persis kegagalan yang Step 1 ada untuk mencegah. `vite-plugin-wasm` dibiarkan memakai rentang: ia perkakas build, bukan pasangan versi runtime.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
VERSI_CR=$(node -p "require('./pkgs/contract/package.json').dependencies['@midnight-ntwrk/compact-runtime']")
echo "versi compact-runtime yang dipakai pkgs/contract: $VERSI_CR"
pnpm add -w --save-exact "@midnight-ntwrk/compact-runtime@$VERSI_CR"
pnpm add -w -D vite-plugin-wasm
node -e '
const p = require("./package.json");
const kontrak = require("./pkgs/contract/package.json");
const akar = p.dependencies["@midnight-ntwrk/compact-runtime"];
const ref  = kontrak.dependencies["@midnight-ntwrk/compact-runtime"];
console.log("akar          :", akar);
console.log("pkgs/contract :", ref);
console.log("vite-plugin-wasm:", p.devDependencies["vite-plugin-wasm"]);
if (akar !== ref) {
  throw new Error(`versi compact-runtime di akar (${akar}) TIDAK identik dengan pkgs/contract (${ref}). Pakai --save-exact; modul tergenerasi memanggil checkRuntimeVersion() saat import dan MELEMPAR pada minor yang tidak cocok.`);
}
console.log("LULUS");
'
```

Diharapkan: baris terakhir `LULUS`, dengan `akar` dan `pkgs/contract` mencetak string yang **sama persis** (tanpa `^`). Nilai `vite-plugin-wasm` hanya dicetak, tidak digerbangi — ia boleh berupa rentang. **Bukan** `pnpm cli`, **bukan** `--filter`; `-w` menargetkan akar workspace, yang memang paket aplikasi ini.

- [ ] **Step 2: Gerbang instance tunggal `onchain-runtime-v3` — sebelum satu baris kode pun ditulis**

Ini gerbang, bukan diagnosa setelah gagal. Ia menghitung **realpath** (bukan nama versi) dari setiap salinan `onchain-runtime-v3` yang dapat dijangkau akar workspace dan `pkgs/contract`. Kalau ada lebih dari satu, dekode akan gagal dengan pesan menyesatkan di Task 4, dan penyebabnya tidak akan terlihat di pesan itu.

**JANGAN me-resolve subpath `"@midnight-ntwrk/onchain-runtime-v3/package.json"`.** Paket itu **tidak mengekspor** subpath tersebut — `exports`-nya persis `{ types, browser, node }` — dan resolve-nya melempar `ERR_PACKAGE_PATH_NOT_EXPORTED`. Diverifikasi dengan perintah yang dijalankan terhadap pohon `node_modules` repo ini hari ini. Yang di-resolve adalah **entri paketnya**, lalu `path.dirname()` dari hasilnya:

```
require.resolve("@midnight-ntwrk/onchain-runtime-v3")
  → …/@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_fs.js
path.dirname(...)            → direktori paket
path.join(dir, "midnight_onchain_runtime_wasm_bg.wasm")  → 1.321.366 B
```

Satu fakta kedua yang membentuk bentuk skrip di bawah, dan yang juga diverifikasi: dari `package.json` akar **maupun** dari `pkgs/contract/package.json`, `onchain-runtime-v3` **tidak terjangkau sama sekali** (`MODULE_NOT_FOUND`) — pnpm memasangnya hanya sebagai ketergantungan `compact-runtime`. Karena itu lompatan lewat `compact-runtime` **bukan** cadangan yang jarang terpakai; ia jalur normalnya. Skrip di bawah mencoba jalur langsung lebih dulu hanya supaya ia tetap benar bila suatu saat paket itu terpasang datar.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { createRequire } from "node:module";
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const NAMA_WASM = "midnight_onchain_runtime_wasm_bg.wasm";

/** Direktori paket onchain-runtime-v3 yang terlihat dari satu titik resolve. */
function dirRuntime(titikResolve) {
  const req = createRequire(titikResolve);
  // Entri paket, BUKAN subpath ./package.json: paket ini hanya mengekspor
  // { types, browser, node }, sehingga subpath package.json melempar
  // ERR_PACKAGE_PATH_NOT_EXPORTED.
  try {
    return path.dirname(req.resolve("@midnight-ntwrk/onchain-runtime-v3"));
  } catch (e) {
    if (e.code !== "MODULE_NOT_FOUND") throw e;
  }
  // Jalur normal di pohon pnpm repo ini: lewat compact-runtime.
  let crEntri;
  try {
    crEntri = req.resolve("@midnight-ntwrk/compact-runtime");
  } catch (e) {
    if (e.code !== "MODULE_NOT_FOUND") throw e;
    // Diverifikasi: dari package.json akar, compact-runtime memang TIDAK
    // terjangkau sebelum Step 1 memasangnya. Pesan yang jelas di sini jauh lebih
    // murah daripada MODULE_NOT_FOUND mentah yang tidak menyebut sebabnya.
    throw new Error(`@midnight-ntwrk/compact-runtime tidak terjangkau dari ${titikResolve}. Jalankan Task 2 Step 1 lebih dulu.`);
  }
  const req2 = createRequire(crEntri);
  return path.dirname(req2.resolve("@midnight-ntwrk/onchain-runtime-v3"));
}

const akar = process.cwd();
const titik = [
  path.join(akar, "package.json"),
  path.join(akar, "pkgs", "contract", "package.json"),
];
const jalur = new Set();
for (const t of titik) jalur.add(realpathSync(dirRuntime(t)));

console.log("realpath onchain-runtime-v3 yang terjangkau:", jalur.size);
for (const j of jalur) {
  const w = path.join(j, NAMA_WASM);
  console.log(" ", j, existsSync(w) ? `(wasm ${statSync(w).size} B)` : "(WASM TIDAK DITEMUKAN)");
}
if (jalur.size !== 1) {
  throw new Error("INSTANCE GANDA onchain-runtime-v3 — dekode akan gagal dengan pesan MENYESATKAN (\"expected instance of ChargedState\"). Samakan versi compact-runtime lebih dulu.");
}
'
```

Diharapkan: `realpath onchain-runtime-v3 yang terjangkau: 1` diikuti satu jalur, dan jalur itu berbuntut `(wasm <angka> B)` — **bukan** `(WASM TIDAK DITEMUKAN)`. Angkanya tidak dibandingkan terhadap apa pun di sini; ia yang **menjadi** ambang di Step 11 dan seterusnya. Bila jumlah jalurnya lebih dari 1, perintah melempar — **jangan lanjut**, samakan versi `compact-runtime` di akar dengan yang dipakai `pkgs/contract` (Step 1) lebih dulu.

Bila perintah ini mati dengan `ERR_PACKAGE_PATH_NOT_EXPORTED`, berarti seseorang mengembalikan resolve subpath `/package.json`. Itu bukan tanda instance ganda; itu tanda skripnya salah. Kembalikan ke bentuk di atas.

- [ ] **Step 3: Tambahkan alias `@pkgs/*` DAN `"target": "ES2022"` ke `tsconfig.json`**

Dua suntingan, dan yang kedua adalah gerbang yang mematikan empat task berikutnya kalau dilewat.

**`tsconfig.json` repo ini TIDAK punya `target`.** Tanpa `target`, TypeScript memakai bawaannya, **ES5**, dan pada ES5 tanpa `downlevelIteration` setiap iterasi atas sesuatu yang bukan larik **melempar TS2802**. Tipe ledger tergenerasi justru berbentuk begitu: `Ledger.tallies` dan `Ledger.ballots` adalah objek yang hanya punya `[Symbol.iterator]()`, bukan larik. Yang kena, seluruhnya kode yang ditulis rencana ini:

| Baris | Berkas | Task |
|---|---|---|
| `[...l.tallies]` | `dekode.ts` | Task 4 |
| `[...l.ballots]` | `dekode.ts` | Task 4 |
| `for (const [k, v] of pasangan)` atas `Iterable<…>` | `padatkanTallies` di `dekode.ts` | Task 4 |
| `[...dipakai]` atas sebuah `Set` | uji pengganti | Task 8 |

Diverifikasi, bukan diduga. Garis dasar repo hijau (`tsc --noEmit`, exit 0). Probe dengan alias dan tipe tergenerasi yang **sama** merah persis pada ketiga bentuk di atas:

```
error TS2802: Type '{ isEmpty(): boolean; size(): bigint; member(key_0: bigint): boolean;
  lookup(key_0: bigint): bigint; [Symbol.iterator](): Iterator<[bigint, bigint], any, any>; }'
  can only be iterated through when using the '--downlevelIteration' flag or with a
  '--target' of 'es2015' or higher.
```

Probe yang sama dengan `--target ES2022`: exit 0. Dan `tsc -p tsconfig.json --noEmit --target ES2022` atas repo apa adanya: **exit 0** — menaikkan target tidak memerahkan satu berkas pun yang sudah ada.

Menaikkannya aman karena `noEmit: true`: `tsc` di repo ini **tidak pernah menghasilkan JavaScript**. Yang mentranspilasi adalah Vite/esbuild (jalur aplikasi) dan esbuild (`server/`), dan keduanya memakai target mereka sendiri. `target` di sini hanya menentukan *lib* dan aturan *downlevel* yang dipakai pemeriksa tipe.

Gerbang mati yang ditutup langkah ini: **Task 4 Step 8, Task 6 Step 6, Task 8 Step 15, dan Task 9 Step 8 — keempatnya menuntut "`pnpm check` tanpa keluaran".**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "tsconfig.json";
let isi = readFileSync(p, "utf8");

// 1. alias @pkgs/*
const jPaths = `      "@shared/*": ["./shared/*"]`;
if (!isi.includes(jPaths)) throw new Error("jangkar paths @shared/* tidak ditemukan di tsconfig.json");
if (isi.includes(`"@pkgs/*"`)) console.log("alias @pkgs/* sudah ada, tidak diubah");
else isi = isi.replace(jPaths, jPaths + `,\n      "@pkgs/*": ["./pkgs/*"]`);

// 2. target ES2022 — TANPA ini, setiap spread atas tipe ledger melempar TS2802,
//    karena tanpa target TypeScript memakai bawaannya: ES5.
const jTarget = `    "noEmit": true,`;
if (!isi.includes(jTarget)) throw new Error("jangkar compilerOptions.noEmit tidak ditemukan di tsconfig.json");
if (/"target"\s*:/.test(isi)) console.log("target sudah ada, tidak diubah");
else isi = isi.replace(jTarget, `    "target": "ES2022",\n` + jTarget);

writeFileSync(p, isi);
console.log("tsconfig.json diperbarui");
'
node -e '
const fs = require("node:fs");
const co = JSON.parse(fs.readFileSync("tsconfig.json","utf8").replace(/^\s*\/\/.*$/gm,"")).compilerOptions;
console.log("target:", co.target);
console.log("paths :", JSON.stringify(co.paths));
if (co.target !== "ES2022") throw new Error("target belum ES2022 — setiap spread atas tipe ledger akan melempar TS2802");
if (!co.paths["@pkgs/*"]) throw new Error("alias @pkgs/* belum ada");
console.log("LULUS");
'
```

Diharapkan: `target: ES2022`, objek `paths` memuat `@/*`, `@shared/*`, dan `@pkgs/*`, lalu `LULUS`.

Lalu buktikan repo masih hijau **sebelum** satu baris kode yang bergantung padanya ditulis:

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
echo "exit=$?"
```

Diharapkan: tanpa keluaran, `exit=0`. Bila ia merah di sini, penyebabnya adalah kenaikan target dan **bukan** kode C-2a — perbaiki sekarang, selagi diff-nya masih satu berkas konfigurasi.

**Bagian ketiga: `pnpm check` TIDAK memeriksa berkas `*.test.ts`, dan C-2a menulis delapan di antaranya.**

`tsconfig.json` memuat `"exclude": [… , "**/*.test.ts"]`. Pola itu **tidak** mencocokkan `.test.tsx`, sehingga uji `.tsx` memang ikut diperiksa — diverifikasi dengan `tsc --listFiles`: tujuh berkas `.test.tsx` masuk program, sementara `ballot-status.test.ts` tidak. Delapan berkas uji yang lahir di rencana ini berakhiran `.test.ts` (`endpoint`, `instance-tunggal`, `graphql`, `dekode`, `baca-rantai`, `jaringan-nyata`, `ke-ballot`, `batas-bundel`), jadi tanpa langkah ini semuanya **tidak pernah ditypecheck** — dan gerbang "`pnpm check` tanpa keluaran" akan hijau sambil membiarkan tanda tangan yang salah lolos sampai runtime.

Ditutup dengan konfigurasi kedua, bukan dengan catatan kaki. `exclude` bawaan dipertahankan apa adanya supaya `pnpm check` tetap cepat pada alur sunting-sering; `pnpm check:uji` adalah gerbang yang lebih lebar dan dijalankan bersama gerbang commit.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
cat > tsconfig.uji.json <<'EOF'
{
  // tsconfig.json meng-exclude "**/*.test.ts", sehingga `pnpm check` tidak pernah
  // memeriksa berkas uji berakhiran .test.ts — dan C-2a menulis DELAPAN di
  // antaranya. Berkas ini memakai konfigurasi yang sama TANPA exclude itu.
  //
  // tsBuildInfoFile dipisah supaya ia tidak menimpa cache incremental milik
  // `pnpm check`; dua program dengan himpunan berkas berbeda berbagi satu cache
  // akan saling membatalkan dan membuat keduanya lambat.
  "extends": "./tsconfig.json",
  "include": ["client/src/**/*", "shared/**/*", "server/**/*"],
  "exclude": ["node_modules", "build", "dist"],
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/typescript/tsbuildinfo-uji"
  }
}
EOF
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "package.json";
const isi = readFileSync(p, "utf8");
const jangkar = `    "check": "tsc --noEmit",`;
if (!isi.includes(jangkar)) throw new Error("jangkar skrip check tidak ditemukan di package.json");
if (isi.includes(`"check:uji"`)) { console.log("sudah ada, tidak diubah"); process.exit(0); }
writeFileSync(p, isi.replace(jangkar, jangkar + `\n    "check:uji": "tsc -p tsconfig.uji.json --noEmit",`));
console.log("skrip check:uji ditambahkan");
'
pnpm check:uji
echo "exit=$?"
```

Diharapkan: tanpa keluaran, `exit=0`. Diverifikasi bahwa ia hijau terhadap repo apa adanya: kedua berkas `*.test.ts` yang sudah ada (`ballot-status.test.ts` dan `lib/proof-server.test.ts`) masuk program dan tidak menghasilkan satu galat pun.

Mulai titik ini, **setiap gerbang yang berbunyi "`pnpm check` tanpa keluaran" berarti `pnpm check` DAN `pnpm check:uji`, dua-duanya tanpa keluaran.**

- [ ] **Step 4: Pasang `vite-plugin-wasm`, alias, `fs.allow`, dan `dedupe` di `vite.config.ts`**

Empat perubahan, dan masing-masing menutup satu kegagalan yang berbeda. `fs.allow` dibutuhkan karena `root` Vite adalah `client/` sementara modul kontrak berada di `pkgs/` — di luar root, dan `server.fs.strict` sudah `true`. `dedupe` adalah sabuk kedua di samping gerbang Step 2: ia memaksa Vite menyelesaikan kedua paket runtime ke satu modul walaupun dijangkau lewat dua jalur import yang berbeda.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "vite.config.ts";
let isi = readFileSync(p, "utf8");

// 1. impor plugin
const jImpor = `import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";`;
if (!isi.includes(jImpor)) throw new Error("jangkar impor vite-plugin-manus-runtime tidak ditemukan");
isi = isi.replace(jImpor, jImpor + `\nimport wasm from "vite-plugin-wasm";`);

// 2. daftarkan plugin paling depan: transformasi ESM-wasm harus terjadi sebelum
//    plugin lain menyentuh modul onchain-runtime-v3.
const jPlugin = `const plugins = [\n  react(),`;
if (!isi.includes(jPlugin)) throw new Error("jangkar daftar plugins tidak ditemukan");
isi = isi.replace(jPlugin, `const plugins = [\n  wasm(),\n  react(),`);

// 3. alias @pkgs + dedupe
const jAlias = `      "@assets": path.resolve(import.meta.dirname, "attached_assets"),\n    },\n  },`;
if (!isi.includes(jAlias)) throw new Error("jangkar resolve.alias tidak ditemukan");
isi = isi.replace(
  jAlias,
  `      "@assets": path.resolve(import.meta.dirname, "attached_assets"),\n` +
  `      // Satu-satunya jalan klien ke ledger() kontrak dan ke endpoint jaringan\n` +
  `      // tanpa memindahkan client/ ke pkgs/app (lihat "Penyimpangan sadar dari\n` +
  `      // spec §14.7" di rencana C-2a). Menunjuk src/, BUKAN dist/: dist ada di\n` +
  `      // .gitignore dan membangunnya berarti menyentuh pkgs/.\n` +
  `      "@pkgs": path.resolve(import.meta.dirname, "pkgs"),\n` +
  `    },\n` +
  `    // Sabuk kedua terhadap instance GANDA onchain-runtime-v3. Dua instance\n` +
  `    // memberi pesan MENYESATKAN ("expected instance of ChargedState") padahal\n` +
  `    // datanya benar, dan risikonya hidup di repo ini karena compact-runtime\n` +
  `    // 0.15.0 (pkgs/cli lewat compact-js) dan 0.16.0 (pkgs/contract) dua-duanya\n` +
  `    // ada di pohon pnpm. Gerbang mekaniknya ada di rencana C-2a Task 2 Step 2.\n` +
  `    dedupe: ["@midnight-ntwrk/compact-runtime", "@midnight-ntwrk/onchain-runtime-v3"],\n` +
  `  },`,
);

// 4. fs.allow — root Vite adalah client/, modul kontrak ada di luar root.
const jFs = `    fs: {\n      strict: true,\n      deny: ["**/.*"],\n    },`;
if (!isi.includes(jFs)) throw new Error("jangkar server.fs tidak ditemukan");
isi = isi.replace(
  jFs,
  `    fs: {\n` +
  `      strict: true,\n` +
  `      // root Vite adalah client/. Modul kontrak tergenerasi dan network-config\n` +
  `      // berada di pkgs/, di luar root, sehingga akar repo harus diizinkan\n` +
  `      // eksplisit. deny tetap menutup seluruh berkas titik.\n` +
  `      allow: [path.resolve(import.meta.dirname)],\n` +
  `      deny: ["**/.*"],\n` +
  `    },`,
);

writeFileSync(p, isi);
console.log("vite.config.ts diperbarui");
'
grep -n "vite-plugin-wasm\|wasm()\|@pkgs\|dedupe\|allow:" vite.config.ts
```

Diharapkan: kelima penanda muncul — baris impor `vite-plugin-wasm`, `wasm(),` sebagai anggota pertama daftar plugin, alias `"@pkgs"`, `dedupe:`, dan `allow:`. Bila salah satunya hilang, skrip di atas seharusnya sudah melempar pada jangkarnya; periksa apakah `vite.config.ts` sudah pernah disunting tangan.

- [ ] **Step 5: Samakan alias, pasang `vite-plugin-wasm`, dan patok zona waktu di `vitest.config.ts`**

Tiga hal, masing-masing menutup satu kegagalan yang berbeda.

Alias `@pkgs` wajib ada di sini juga, kalau tidak uji di Task 4 tidak dapat mengimpor modul kontrak. `vitest.config.ts` **tidak mewarisi apa pun** dari `vite.config.ts` — berkasnya sendiri menuliskan alasan pemisahan itu.

TZ dipatok UTC karena deadline kontrak adalah **detik sejak epoch UTC**, dan pemformatannya ikut dibandingkan uji tampilan di Task 8 — tanpa patokan, uji hanya sah di mesin yang membuatnya.

`wasm()` dipasang **sebagai asuransi, dan diakui sebagai asuransi**: `onchain-runtime-v3` mengekspor dua entri berbeda menurut kondisi resolve — `midnight_onchain_runtime_wasm_fs.js` (kondisi `node`, membaca `.wasm` lewat `fs`, berjalan apa adanya) dan `midnight_onchain_runtime_wasm.js` (kondisi `browser`, mengimpor `.wasm` sebagai **modul ESM**, yang tidak dapat dimuat tanpa plugin). Vitest memilih kondisi `node` pada konfigurasi ini, sehingga plugin itu **seharusnya** tidak pernah terpakai — tetapi `vitest.config.ts` juga memetakan `*.test.tsx` ke jsdom, dan salah satu uji di Task 8 mengimpor `dekode.ts` secara dinamis dari dalam berkas jsdom. Plugin yang tidak terpakai tidak berbiaya; kegagalan di tengah Task 8 berbiaya. Bila ia memang tidak pernah terpakai, itu hasil yang baik dan bukan alasan membuangnya.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "vitest.config.ts";
let isi = readFileSync(p, "utf8");

// 0. impor + daftarkan vite-plugin-wasm (asuransi kondisi browser; lihat prosa)
const jImpor = `import { defineConfig } from "vitest/config";`;
if (!isi.includes(jImpor)) throw new Error("jangkar impor defineConfig tidak ditemukan di vitest.config.ts");
if (!isi.includes(`vite-plugin-wasm`)) {
  isi = isi.replace(jImpor, jImpor + `\nimport wasm from "vite-plugin-wasm";`);
  isi = isi.replace(`export default defineConfig({\n`, `export default defineConfig({\n  // Asuransi bila Vitest memilih kondisi resolve "browser" untuk\n  // onchain-runtime-v3: entri browser mengimpor .wasm sebagai modul ESM.\n  // Pada kondisi "node" plugin ini tidak pernah terpakai, dan itu hasil yang baik.\n  plugins: [wasm()],\n`);
}

const jAlias = `    alias: { "@": path.resolve(import.meta.dirname, "client", "src") },`;
if (!isi.includes(jAlias)) throw new Error("jangkar alias vitest tidak ditemukan");
isi = isi.replace(
  jAlias,
  `    alias: {\n` +
  `      "@": path.resolve(import.meta.dirname, "client", "src"),\n` +
  `      // Harus sama persis dengan vite.config.ts; kalau berbeda, uji menguji\n` +
  `      // modul yang berbeda dari yang dikirim ke browser.\n` +
  `      "@pkgs": path.resolve(import.meta.dirname, "pkgs"),\n` +
  `    },\n` +
  `    // Sama seperti vite.config.ts: satu modul onchain-runtime-v3, bukan dua.\n` +
  `    dedupe: ["@midnight-ntwrk/compact-runtime", "@midnight-ntwrk/onchain-runtime-v3"],`,
);
const jTest = `  test: {\n    environment: "node",`;
if (!isi.includes(jTest)) throw new Error("jangkar blok test tidak ditemukan");
isi = isi.replace(
  jTest,
  `  test: {\n` +
  `    // Deadline ballot adalah DETIK SEJAK EPOCH UTC dan diformat dengan\n` +
  `    // timeZone: "UTC" di jalur aplikasi. Mematok TZ di sini menjaga uji tetap\n` +
  `    // sah di mesin mana pun, bukan hanya di mesin yang merekam fixture-nya.\n` +
  `    env: { TZ: "UTC" },\n` +
  `    environment: "node",`,
);
writeFileSync(p, isi);
console.log("vitest.config.ts diperbarui");
'
grep -n "@pkgs\|dedupe\|TZ\|vite-plugin-wasm\|plugins:" vitest.config.ts
```

Diharapkan: alias `"@pkgs"`, `dedupe:`, `env: { TZ: "UTC" }`, baris impor `vite-plugin-wasm`, dan `plugins: [wasm()]` — kelimanya muncul. Jumlah barisnya tidak penting — komentar penjelas ikut tercocokkan; yang diperiksa adalah keberadaan kelima potongan itu.

- [ ] **Step 6: Tulis `client/src/lib/chain/endpoint.ts`**

Modul ini **murni** dan tidak mengimpor WASM. Ia memisahkan "jaringan mana" dari "bagaimana membacanya", supaya seluruh lapis transport dapat diuji tanpa menyalakan WASM sama sekali.

`client/src/lib/chain/endpoint.ts`:

```typescript
import {
  MIDNIGHT_NETWORK_ENDPOINTS,
  type MidnightNetworkId,
} from "@pkgs/shared/src/network-config";

/**
 * Jaringan mana yang dibaca, dan dari mana.
 *
 * Berkas ini MURNI: tidak ada fetch, tidak ada WASM, tidak ada state global. Itu
 * disengaja — seluruh lapis transport di graphql.ts dapat diuji tanpa pernah
 * menyalakan onchain-runtime.
 *
 * Endpoint TIDAK disalin ke sini. Ia diimpor dari pkgs/shared/src/network-config.ts,
 * yang sudah menjadi satu-satunya tempat endpoint jaringan didefinisikan di repo
 * ini. Menyalinnya akan melahirkan dua sumber kebenaran yang pasti berpisah, dan
 * berpisahnya tidak akan terlihat sampai seseorang membaca jaringan yang salah.
 *
 * PERHATIAN pada jalur wallet, yang BUKAN urusan C-2a tetapi mudah tertukar:
 * client/src/lib/midnight-wallet.ts memakai getConfiguration() milik ekstensi
 * untuk endpoint-nya sendiri, dan nilai itu terbukti berbeda (Lace 4.0.1 di
 * preprod melaporkan host blockfrost.lw.iog.io). Jalur BACA di berkas ini tidak
 * pernah menanyakan wallet apa pun — memang tidak ada wallet yang terlibat.
 */

/**
 * Jaringan tempat registry VotePriv benar-benar berada hari ini.
 *
 * Diverifikasi, bukan diasumsikan: kueri contractAction untuk alamat registry
 * mengembalikan null di preprod dan objek terisi di preview.
 */
export const JARINGAN_BAWAAN: MidnightNetworkId = "preview";

/**
 * Alamat kontrak registry. Satu-satunya titik masuk penemuan ballot (spec §2.3):
 * seluruh daftar ballot lahir dari `registry.ballots`.
 */
export const ALAMAT_REGISTRY_BAWAAN =
  "b9d127d83f1436488e2cc808d9732d51f4f5befe2711362c7d669759db2a298a";

export type JaringanAktif = {
  networkId: MidnightNetworkId;
  indexer: string;
  indexerWS: string;
  alamatRegistry: string;
};

const JARINGAN_SAH: readonly MidnightNetworkId[] = ["preprod", "preview", "undeployed"];

function bacaJaringan(nilai: string | undefined): MidnightNetworkId {
  if (nilai === undefined || nilai.trim() === "") return JARINGAN_BAWAAN;
  const rapi = nilai.trim() as MidnightNetworkId;
  if (!JARINGAN_SAH.includes(rapi)) {
    // Menjatuhkan diri ke jaringan bawaan di sini akan membuat salah ketik
    // ("previewe") membaca jaringan yang BERBEDA dari yang diminta operator,
    // secara diam-diam. Lebih baik gagal saat modul dimuat.
    throw new Error(
      // Teks ini sampai ke layar lewat permukaan "konfigurasi", jadi Inggris.
      `Unknown VITE_MIDNIGHT_NETWORK: ${JSON.stringify(nilai)}. Valid values: ${JARINGAN_SAH.join(", ")}`,
    );
  }
  return rapi;
}

/**
 * Bentuk alamat kontrak yang dapat dikirim ke indexer.
 *
 * `registry.register()` bersifat permissionless dan menerima Opaque<"string">
 * apa pun, jadi isi `registry.ballots` TIDAK dijamin berupa alamat. Diverifikasi:
 * alamat yang bukan hex membuat indexer menjawab errors untuk alias itu dan
 * MENGHILANGKAN kuncinya dari `data` — bukan mengembalikan null. Menyaringnya di
 * sini lebih murah daripada menangani kunci yang hilang di lapis atas, dan
 * membuat spanduk "sebagian" menyebut sebab yang tepat.
 *
 * Batas panjang 512 nibble bukan aturan protokol melainkan rem: entri sampah
 * sepanjang megabyte akan ikut masuk dokumen GraphQL kalau tidak direm.
 */
export function alamatKontrakValid(alamat: string): boolean {
  return /^[0-9a-fA-F]+$/.test(alamat) && alamat.length % 2 === 0 && alamat.length >= 2 && alamat.length <= 512;
}

export function jaringanAktif(
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<string, string | undefined>,
): JaringanAktif {
  const networkId = bacaJaringan(env.VITE_MIDNIGHT_NETWORK);
  const endpoint = MIDNIGHT_NETWORK_ENDPOINTS[networkId];
  const alamatRegistry = (env.VITE_VOTEPRIV_REGISTRY ?? "").trim() || ALAMAT_REGISTRY_BAWAAN;
  if (!alamatKontrakValid(alamatRegistry)) {
    throw new Error(
      `VITE_VOTEPRIV_REGISTRY is not a valid contract address: ${JSON.stringify(alamatRegistry)}`,
    );
  }
  return {
    networkId,
    indexer: endpoint.indexer,
    indexerWS: endpoint.indexerWS,
    alamatRegistry,
  };
}
```

- [ ] **Step 7: Tulis uji `endpoint.test.ts`**

`client/src/lib/chain/endpoint.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { MIDNIGHT_NETWORK_ENDPOINTS } from "@pkgs/shared/src/network-config";
import {
  ALAMAT_REGISTRY_BAWAAN,
  JARINGAN_BAWAAN,
  alamatKontrakValid,
  jaringanAktif,
} from "./endpoint";

describe("jaringanAktif", () => {
  it("memakai jaringan dan registry bawaan ketika env kosong", () => {
    const j = jaringanAktif({});
    expect(j.networkId).toBe(JARINGAN_BAWAAN);
    expect(j.alamatRegistry).toBe(ALAMAT_REGISTRY_BAWAAN);
    // Nilai endpoint TIDAK diketik ulang di sini. Ia diturunkan dari satu-satunya
    // sumber kebenaran, sehingga uji ini tetap benar bila URL indexer berubah,
    // dan tetap gagal bila berkas ini diam-diam menyalin URL-nya sendiri.
    expect(j.indexer).toBe(MIDNIGHT_NETWORK_ENDPOINTS[JARINGAN_BAWAAN].indexer);
    expect(j.indexerWS).toBe(MIDNIGHT_NETWORK_ENDPOINTS[JARINGAN_BAWAAN].indexerWS);
  });

  it("menghormati jaringan yang diminta env", () => {
    const j = jaringanAktif({ VITE_MIDNIGHT_NETWORK: "preprod" });
    expect(j.networkId).toBe("preprod");
    expect(j.indexer).toBe(MIDNIGHT_NETWORK_ENDPOINTS.preprod.indexer);
  });

  it("MELEMPAR pada nama jaringan yang tidak dikenal, bukan diam-diam jatuh ke bawaan", () => {
    expect(() => jaringanAktif({ VITE_MIDNIGHT_NETWORK: "previewe" })).toThrow(/Unknown VITE_MIDNIGHT_NETWORK/);
  });

  it("MELEMPAR pada alamat registry yang bukan hex", () => {
    expect(() => jaringanAktif({ VITE_VOTEPRIV_REGISTRY: "bukan-hex" })).toThrow(/not a valid contract address/);
  });
});

describe("alamatKontrakValid", () => {
  it("menerima alamat registry bawaan", () => {
    expect(alamatKontrakValid(ALAMAT_REGISTRY_BAWAAN)).toBe(true);
  });

  it("menolak bentuk yang terbukti membuat indexer menghapus kunci aliasnya", () => {
    // registry.register() permissionless: isi registry.ballots tidak dijamin
    // berupa alamat sama sekali.
    expect(alamatKontrakValid("bukan-hex")).toBe(false);
    expect(alamatKontrakValid("abc")).toBe(false); // nibble ganjil
    expect(alamatKontrakValid("")).toBe(false);
    expect(alamatKontrakValid("ab".repeat(300))).toBe(false); // melebihi rem panjang
  });
});
```

- [ ] **Step 8: Tulis uji gerbang instance tunggal sebagai uji, bukan hanya sebagai perintah**

Step 2 memeriksa pohon paket. Uji ini memeriksa hal yang berbeda dan lebih dekat ke kegagalan sesungguhnya: bahwa objek yang dikembalikan `ContractState.deserialize()` **diterima** oleh `ledger()` milik modul kontrak. Kalau ada dua instance, inilah baris yang melempar `"expected instance of ChargedState"` — dan uji ini membuat pesan menyesatkan itu muncul di sini, di task fondasi, bukan di tengah Task 4.

`client/src/lib/chain/instance-tunggal.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { ledger as ledgerRegistry } from "@pkgs/contract/src/managed/registry/contract/index.js";

/**
 * Gerbang instance tunggal onchain-runtime-v3.
 *
 * Dua instance memberi pesan MENYESATKAN: "expected instance of ChargedState",
 * padahal datanya benar. Risikonya hidup di workspace ini karena compact-runtime
 * 0.15.0 (pkgs/cli lewat compact-js@2.5.0) DAN 0.16.0 (pkgs/contract) dua-duanya
 * ada di pohon pnpm.
 *
 * Uji ini memakai state registry yang KOSONG — dibangun di memori, bukan diambil
 * dari jaringan — supaya ia tidak pernah gagal karena alasan lain: tidak ada
 * fixture, tidak ada fetch, tidak ada ketergantungan pada isi rantai hari ini.
 * Yang diuji semata-mata: apakah ChargedType yang satu dikenali modul yang lain.
 */
describe("instance onchain-runtime-v3", () => {
  it("menerima ChargedState dari compact-runtime akar di ledger() modul kontrak", () => {
    const kosong = new ContractState();
    const bolak = ContractState.deserialize(kosong.serialize());
    expect(() => ledgerRegistry(bolak.data)).not.toThrow(/instance of ChargedState/);
  });

  it("membulatkan versi runtime yang sama dengan yang diharapkan modul tergenerasi", async () => {
    // Modul tergenerasi memanggil checkRuntimeVersion() saat diimpor dan MELEMPAR
    // pada mayor/minor yang tidak cocok. Import yang berhasil di baris atas sudah
    // membuktikannya; assert ini menuliskan fakta itu supaya tidak hilang ketika
    // seseorang menaikkan versi tanpa membaca komentar.
    const modul = await import("@pkgs/contract/src/managed/registry/contract/index.js");
    expect(typeof modul.ledger).toBe("function");
  });
});
```

- [ ] **Step 9: Dokumentasikan kedua variabel lingkungan baru di `.env.example`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
cat >> .env.example <<'EOF'

# Jaringan Midnight yang DIBACA aplikasi. Nilai yang sah: preprod, preview,
# undeployed. Kosongkan untuk memakai bawaan (preview).
#
# Ini bukan preferensi: registry VotePriv hanya ada di SATU jaringan, dan
# membaca jaringan yang salah menghasilkan "registry tidak ditemukan" — bukan
# daftar kosong. Diverifikasi: alamat registry mengembalikan null di preprod dan
# objek terisi di preview.
#
# VITE_MIDNIGHT_NETWORK=preview

# Alamat kontrak registry, hex tanpa awalan 0x. Kosongkan untuk memakai registry
# bawaan yang sudah ter-deploy. Seluruh daftar ballot lahir dari registry.ballots
# (spec §2.3), jadi alamat yang salah berarti aplikasi tidak melihat satu ballot pun.
#
# VITE_VOTEPRIV_REGISTRY=b9d127d83f1436488e2cc808d9732d51f4f5befe2711362c7d669759db2a298a
EOF
tail -20 .env.example
```

Diharapkan: kedua blok muncul di akhir berkas, dan tidak ada nilai yang aktif (semuanya masih berupa komentar).

- [ ] **Step 10: Buktikan bahwa bundel browser benar-benar terbangun dengan WASM**

Ini gerbang sebenarnya dari task ini. Sebuah berkas umpan sementara memaksa Vite benar-benar menarik modul kontrak dan WASM-nya ke dalam bundel; tanpa umpan, `pnpm build` akan lulus tanpa membuktikan apa pun karena belum ada yang mengimpornya.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
cat > client/src/lib/chain/__umpan-build.ts <<'EOF'
// UMPAN SEMENTARA — dihapus di Step 12 pada task ini juga.
// Memaksa Vite menarik modul kontrak + onchain-runtime-v3 ke dalam bundel,
// supaya `pnpm build` benar-benar menguji jalur WASM dan bukan sekadar lulus
// karena belum ada yang mengimpornya.
import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { ledger as ledgerBallot } from "@pkgs/contract/src/managed/ballot/contract/index.js";
import { ledger as ledgerRegistry } from "@pkgs/contract/src/managed/registry/contract/index.js";
export const umpan = { ContractState, ledgerBallot, ledgerRegistry };
EOF
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "client/src/main.tsx";
const isi = readFileSync(p, "utf8");
writeFileSync(p, `import "./lib/chain/__umpan-build";\n` + isi);
'
pnpm build 2>&1 | tail -20
```

Diharapkan: build **berhasil**. Bila ia gagal dengan pesan yang menyebut `ESM integration proposal for Wasm`, `vite-plugin-wasm` belum aktif — periksa Step 4. Bila gagal dengan `Failed to resolve import "@pkgs/..."`, alias atau `fs.allow` belum benar.

- [ ] **Step 11: Ukur bundel, dan bandingkan dengan ambang yang DITURUNKAN, bukan yang diketik**

Ambangnya bukan angka rencana: ia adalah ukuran WASM `onchain-runtime-v3` yang benar-benar terpasang, ditambah kelonggaran. Yang dijaga bukan satu angka melainkan satu **fakta**: bundel memuat satu WASM baca (jutaan bita, satuan), bukan `ledger-v8` (belasan juta).

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readdirSync, statSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
// Entri paket, BUKAN subpath ./package.json — paket itu hanya mengekspor
// { types, browser, node }, dan subpath package.json melempar
// ERR_PACKAGE_PATH_NOT_EXPORTED. Lihat Task 2 Step 2.
const req = createRequire(path.join(process.cwd(), "pkgs", "contract", "package.json"));
const req2 = createRequire(req.resolve("@midnight-ntwrk/compact-runtime"));
const wasmDir = path.dirname(req2.resolve("@midnight-ntwrk/onchain-runtime-v3"));
const wasmB = statSync(path.join(wasmDir, "midnight_onchain_runtime_wasm_bg.wasm")).size;
const dir = "dist/public/assets";
const berkas = readdirSync(dir).map(f => [f, statSync(path.join(dir, f)).size]);
const totalJs = berkas.filter(([f]) => f.endsWith(".js")).reduce((s, [, n]) => s + n, 0);
const totalWasm = berkas.filter(([f]) => f.endsWith(".wasm")).reduce((s, [, n]) => s + n, 0);
console.log("wasm onchain-runtime-v3 terpasang :", wasmB, "B");
console.log("total .wasm di bundel             :", totalWasm, "B");
console.log("total .js di bundel               :", totalJs, "B");
const ambang = wasmB * 4; // kelonggaran lebar; yang dijaga ordenya, bukan digitnya
console.log("ambang js (4x wasm)               :", ambang, "B");
if (totalWasm > wasmB * 1.2) throw new Error("ada WASM lain selain onchain-runtime-v3 di bundel");
if (totalJs > ambang) throw new Error("bundel JS melampaui ambang — periksa apakah ledger-v8 atau midnight-js-* ikut masuk");
console.log("LULUS");
'
```

Diharapkan: baris terakhir `LULUS`. Bila `total .js` melampaui ambang, jalankan `grep -rl "ledger-v8\|midnight-js-" dist/public/assets` — syarat kedua investigasi dilanggar.

- [ ] **Step 12: Buang umpan dan pulihkan `main.tsx`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
rm client/src/lib/chain/__umpan-build.ts
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "client/src/main.tsx";
const isi = readFileSync(p, "utf8");
const baris = `import "./lib/chain/__umpan-build";\n`;
if (!isi.startsWith(baris)) throw new Error("baris umpan tidak ditemukan di awal main.tsx");
writeFileSync(p, isi.slice(baris.length));
'
git diff --stat client/src/main.tsx
```

Diharapkan: `git diff --stat` untuk `main.tsx` **kosong** — berkas kembali persis seperti sebelum Step 10.

- [ ] **Step 13: Jalankan uji dan typecheck, lalu commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm check:uji
pnpm test 2>&1 | tail -12
```

Diharapkan: `pnpm check` tanpa keluaran; seluruh uji hijau, termasuk kedua berkas uji baru di `client/src/lib/chain/`.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add package.json pnpm-lock.yaml vite.config.ts vitest.config.ts tsconfig.json tsconfig.uji.json .env.example client/src/lib/chain
git commit -m "build(app): jalur WASM baca di browser lewat vite-plugin-wasm dan alias @pkgs

Membaca keadaan kontrak hanya menuntut onchain-runtime-v3, BUKAN ledger-v8.
vite-plugin-wasm wajib karena Vite 7 menolak ESM-wasm secara eksplisit.

tsconfig.json mendapat target ES2022. Repo ini sebelumnya tidak punya target
sama sekali, jadi TypeScript memakai bawaannya (ES5), dan pada ES5 setiap
iterasi atas tipe ledger tergenerasi melempar TS2802 — Ledger.tallies dan
Ledger.ballots bukan larik, melainkan objek ber-[Symbol.iterator]. Aman karena
noEmit: true; yang mentranspilasi adalah Vite/esbuild.

tsconfig.uji.json baru: tsconfig.json meng-exclude **/*.test.ts, sehingga
delapan berkas uji .test.ts yang lahir di C-2a tidak akan pernah ditypecheck.
pnpm check:uji menutup lubang itu tanpa memperlambat pnpm check.

Alias @pkgs dipakai sebagai ganti pemindahan client/ ke pkgs/app (spec 14.7):
hanya tiga berkas di pkgs/ yang dibutuhkan jalur baca, dan pemindahan akan
menuntut build di pkgs/ yang dist-nya ada di .gitignore.

Instance GANDA onchain-runtime-v3 memberi pesan MENYESATKAN. Dijaga dua lapis:
resolve.dedupe di vite dan vitest, plus uji instance-tunggal.test.ts yang
memaksa pesan itu muncul di task fondasi alih-alih di tengah task dekode."
```

**Deliverable:** bundel browser yang benar-benar memuat `onchain-runtime-v3` dan **tidak** memuat `ledger-v8`, dibuktikan dengan ambang yang diturunkan dari paket terpasang; alias `@pkgs` hidup di ketiga konfigurasi; gerbang instance tunggal berdiri sebagai uji, bukan sebagai harapan.

---

### Task 3: Transport GraphQL dan taksonomi galat

Syarat kedua investigasi: **jangan memakai `midnight-js-indexer-public-data-provider` untuk membaca.** Ia menyeret `ledger-v8` dan membengkakkan bundel 8,5× tanpa menambah apa pun untuk pembacaan. Yang dipakai adalah `fetch` GraphQL biasa — dan karena begitu, seluruh penanganan kegagalan menjadi tanggung jawab kita, bukan tanggung jawab pustaka yang tidak kita pasang.

Taksonomi galat di sini yang membuat kelima permukaan gagal di Task 7 bisa mengatakan sesuatu yang berguna. Sebuah `catch` yang meratakan segalanya menjadi "gagal memuat" membuat permukaan itu mustahil ditulis dengan jujur.

Satu kelas cacat diwarisi apa adanya dari `client/src/lib/proof-server.ts`: **fallback SPA menjawab dengan HTTP 200 dan `text/html`.** Spec §14.4 menyebutnya sebagai kegagalan senyap yang wajib dijaga, dan `proof-server.ts` sudah menutupnya untuk `/proof-server/version`. Penjagaan yang sama dipasang di sini — bukan karena indexer kita adalah SPA, melainkan karena setiap proxy, portal wifi, atau reverse proxy di depan pengguna bisa menjadi SPA itu.

**Files:**
- Create: `client/src/lib/chain/graphql.ts`
- Test: `client/src/lib/chain/graphql.test.ts`

**Interfaces:**
- Consumes: tidak ada dari repo. Hanya `fetch` global, yang disuntikkan sebagai parameter.
- Produces — **sama persis dengan tanda tangan implementasinya:**
  - `type SebabGalatRantai = "jaringan" | "http" | "bukan-json" | "balasan-html" | "graphql-fatal" | "registry-hilang" | "dekode" | "konfigurasi"` — DELAPAN sebab. `registry-hilang` dilempar `baca-rantai.ts` (Task 5), `dekode` dilempar `dekode.ts` (Task 4), `konfigurasi` dilempar `useDataRantai` (Task 7); transport ini hanya melempar lima yang pertama
  - `class GalatRantai extends Error { readonly sebab: SebabGalatRantai; readonly rincian: string; readonly host: string }` — konstruktornya `(sebab, rincian, host)`, ketiganya wajib. `rincian` adalah **teks UI berbahasa Inggris**, karena ia dirender ke pengguna
  - `type JawabanGraphQL<T> = { data: T; errors: readonly { message: string }[] }` — `data` **tidak nullable** pada nilai yang dikembalikan: `data === null` di tingkat atas sudah dilempar sebagai `graphql-fatal` sebelum fungsi kembali, jadi pemanggil tidak pernah perlu memeriksanya lagi
  - `postGraphQL<T>(input: { url: string; query: string; variables?: Record<string, unknown>; signal?: AbortSignal; ambil?: typeof fetch }): Promise<JawabanGraphQL<T>>`

- [ ] **Step 1: Tulis `client/src/lib/chain/graphql.ts`**

```typescript
/**
 * Transport GraphQL ke indexer Midnight.
 *
 * MENGAPA fetch mentah dan BUKAN midnight-js-indexer-public-data-provider:
 * provider itu menyeret ledger-v8 (10.143.782 B) ke dalam bundel dan membuatnya
 * 12.383.609 B — 8,5x lipat — tanpa menambah satu pun kemampuan untuk MEMBACA.
 * ledger-v8 adalah milik jalur TULIS. Diverifikasi lewat build yang dijalankan,
 * bukan dibaca dari dokumentasi.
 *
 * Konsekuensinya jujur: karena tidak ada pustaka yang menangani kegagalan untuk
 * kita, seluruh taksonomi kegagalan ada di berkas ini. Itu bukan beban tambahan
 * melainkan syarat — UI tidak bisa mengatakan "indexer tak terjangkau" berbeda
 * dari "kontrak tidak ditemukan" kalau lapis ini meratakan keduanya jadi satu
 * catch.
 *
 * Berkas ini TIDAK mengimpor WASM. Ia bisa diuji, dan diuji, tanpa menyalakan
 * onchain-runtime sama sekali.
 */

/**
 * Sebab kegagalan. DELAPAN, dan tiap-tiapnya punya kalimat sendiri di UI.
 *
 * Dua di antaranya ada justru karena meratakannya menghasilkan pesan yang SALAH,
 * bukan sekadar pesan yang kurang tepat:
 *
 *   - `registry-hilang` dipisah dari `graphql-fatal`. `graphql-fatal` dilempar
 *     oleh transport ini pada `data: null` di tingkat atas — yang sebabnya
 *     biasanya galat validasi skema, misalnya `Unknown field "applyStage"` saat
 *     indexer berubah. Melaporkan itu sebagai "Registry not found on this
 *     network" mengirim pembaca memeriksa VITE_MIDNIGHT_NETWORK padahal yang
 *     berubah adalah skema indexer.
 *   - `konfigurasi` dipisah dari semuanya. Salah ketik VITE_MIDNIGHT_NETWORK
 *     terjadi SEBELUM ada jaringan yang dituju sama sekali; melaporkannya
 *     sebagai kegagalan jaringan menuntut UI mengarang objek JaringanAktif
 *     untuk ditampilkan, dan objek karangan itu akan menyebut jaringan yang
 *     TIDAK diminta operator.
 */
export type SebabGalatRantai =
  /** fetch menolak: DNS, offline, CORS, dibatalkan */
  | "jaringan"
  /** HTTP status bukan 2xx */
  | "http"
  /** badan balasan bukan JSON yang sah */
  | "bukan-json"
  /** balasan berupa HTML — fallback SPA, portal wifi, reverse proxy nyasar */
  | "balasan-html"
  /** GraphQL menjawab data: null di tingkat atas — kueri tidak dieksekusi sama sekali (validasi/skema) */
  | "graphql-fatal"
  /** Kueri berhasil, tetapi tidak ada kontrak pada alamat registry. Dilempar baca-rantai.ts. */
  | "registry-hilang"
  /** ContractState/ledger melempar; dilempar oleh dekode.ts, bukan berkas ini */
  | "dekode"
  /** env salah ketik atau alamat registry tidak sah. Terjadi SEBELUM ada jaringan yang dituju. */
  | "konfigurasi";

export class GalatRantai extends Error {
  readonly sebab: SebabGalatRantai;
  /**
   * Rincian teknis, apa adanya. DITAMPILKAN KE PENGGUNA di dalam panel galat —
   * menyembunyikannya membuat laporan galat dari pengguna tidak berguna.
   *
   * Karena ia berakhir di layar, `rincian` adalah TEKS UI dan ditulis dalam
   * BAHASA INGGRIS, bukan Indonesia. Ini satu-satunya pengecualian terhadap
   * aturan "pesan galat internal berbahasa Indonesia" di rencana C-2a, dan
   * alasannya sederhana: pesan yang dirender ke pengguna adalah teks UI, apa pun
   * namanya di kode. Komentar dan prosa di sekitarnya tetap Indonesia.
   */
  readonly rincian: string;
  /** Host yang dihubungi. Dipakai permukaan gagal untuk menyebut APA yang dicoba. */
  readonly host: string;

  constructor(sebab: SebabGalatRantai, rincian: string, host: string) {
    super(`[${sebab}] ${rincian}`);
    this.name = "GalatRantai";
    this.sebab = sebab;
    this.rincian = rincian;
    this.host = host;
  }
}

export type JawabanGraphQL<T> = {
  /**
   * TIDAK nullable pada nilai yang BENAR-BENAR dikembalikan: `data === null` di
   * tingkat atas sudah dilempar sebagai `graphql-fatal` di bawah, sebelum fungsi
   * ini kembali. Pemanggil karena itu tidak perlu memeriksanya lagi — dan
   * pemeriksaan yang tidak perlu adalah tempat cabang mati tumbuh.
   *
   * Bisa terisi SEBAGIAN bersamaan dengan errors yang tidak kosong.
   *
   * Ini bukan teori. Diverifikasi terhadap indexer sungguhan: kueri dua alias
   * dengan satu alamat sah dan satu alamat bukan-hex mengembalikan data.b0
   * terisi, kunci b1 TIDAK MUNCUL sama sekali, dan satu entri di errors.
   *
   * Karena itu pemanggil WAJIB memeriksa keberadaan kunci (`"b1" in data`),
   * bukan nilainya (`data.b1 === null`), dan TIDAK BOLEH memperlakukan errors
   * yang tidak kosong sebagai kegagalan total. Memperlakukannya begitu berarti
   * satu entri sampah di registry — yang permissionless — menghapus seluruh
   * ballot dari layar, yaitu persis bentuk "kegagalan indexer terlihat seperti
   * tidak ada ballot" yang dilarang rencana ini.
   */
  data: T;
  errors: readonly { message: string }[];
};

/**
 * Penjaga balasan HTML.
 *
 * Disalin sebagai pola dari client/src/lib/proof-server.ts, dan alasannya sama:
 * fallback SPA menjawab HTTP 200 dengan text/html, sehingga res.ok bernilai true
 * dan JSON.parse gagal dengan pesan yang menyesatkan ("Unexpected token '<'").
 * Spec 14.4 menyebut kelas cacat ini eksplisit. Indexer publik bukan SPA, tetapi
 * setiap proxy, portal wifi, dan reverse proxy antara pengguna dan indexer bisa
 * menjadi SPA itu.
 */
function balasanHtml(contentType: string | null, body: string): boolean {
  return (
    (contentType ?? "").toLowerCase().includes("text/html") ||
    /^\s*<(!doctype html|html)\b/i.test(body)
  );
}

function hostDari(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function postGraphQL<T>(input: {
  url: string;
  query: string;
  variables?: Record<string, unknown>;
  signal?: AbortSignal;
  ambil?: typeof fetch;
}): Promise<JawabanGraphQL<T>> {
  const { url, query, variables, signal, ambil = fetch } = input;
  const host = hostDari(url);

  let res: Response;
  try {
    res = await ambil(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal,
      cache: "no-store",
    });
  } catch (e) {
    // AbortError dibiarkan naik apa adanya: ia BUKAN kegagalan, melainkan
    // pembatalan yang diminta pemanggil (komponen di-unmount, refresh baru
    // menyusul). Membungkusnya jadi GalatRantai akan memunculkan panel galat
    // setiap kali pengguna berpindah section.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new GalatRantai("jaringan", e instanceof Error ? e.message : String(e), host);
  }

  const teks = await res.text();

  if (balasanHtml(res.headers.get("content-type"), teks)) {
    throw new GalatRantai(
      "balasan-html",
      `${host} menjawab HTML, bukan JSON GraphQL (HTTP ${res.status}). Biasanya ini proxy, portal jaringan, atau fallback SPA yang berdiri di depan indexer.`,
      host,
    );
  }

  if (!res.ok) {
    throw new GalatRantai("http", `HTTP ${res.status} ${res.statusText}: ${teks.slice(0, 200)}`, host);
  }

  let json: { data?: T | null; errors?: readonly { message: string }[] };
  try {
    json = JSON.parse(teks) as typeof json;
  } catch (e) {
    throw new GalatRantai("bukan-json", e instanceof Error ? e.message : String(e), host);
  }

  const errors = json.errors ?? [];
  const data = json.data ?? null;

  // data === null di tingkat atas berarti kueri tidak dieksekusi sama sekali —
  // galat validasi atau koersi argumen. Itu kegagalan total dan BERBEDA dari
  // kegagalan sebagian, yang justru punya data terisi bersama errors.
  if (data === null) {
    const pesan = errors.length > 0 ? errors.map(e => e.message).join("; ") : "indexer menjawab data: null tanpa errors";
    throw new GalatRantai("graphql-fatal", pesan, host);
  }

  return { data, errors };
}
```

- [ ] **Step 2: Tulis `client/src/lib/chain/graphql.test.ts`**

Setiap kasus memakai `fetch` palsu. Tidak satu pun menyentuh jaringan: uji transport yang butuh jaringan adalah uji yang merah ketika wifi mati.

```typescript
import { describe, expect, it, vi } from "vitest";
import { GalatRantai, postGraphQL } from "./graphql";

const URL_UJI = "https://indexer.contoh.test/api/v3/graphql";

function jawab(body: string, init: { status?: number; contentType?: string } = {}): typeof fetch {
  return vi.fn(async () =>
    new Response(body, {
      status: init.status ?? 200,
      headers: { "content-type": init.contentType ?? "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("postGraphQL", () => {
  it("mengembalikan data pada jawaban sehat", async () => {
    const hasil = await postGraphQL<{ block: { height: number } }>({
      url: URL_UJI,
      query: "{ block { height } }",
      ambil: jawab(JSON.stringify({ data: { block: { height: 7 } } })),
    });
    expect(hasil.data).toEqual({ block: { height: 7 } });
    expect(hasil.errors).toEqual([]);
  });

  it("MEMPERTAHANKAN data ketika errors tidak kosong — kegagalan sebagian bukan kegagalan total", async () => {
    // Bentuk ini diverifikasi terhadap indexer sungguhan: satu alias sah, satu
    // alamat bukan-hex. Kunci alias yang gagal HILANG dari data; ia tidak null.
    const badan = JSON.stringify({
      data: { b0: { address: "aa", state: "00" } },
      errors: [{ message: "invalid address: cannot hex-decode: odd number of digits" }],
    });
    const hasil = await postGraphQL<Record<string, unknown>>({
      url: URL_UJI,
      query: "{ b0: contract { address } b1: contract { address } }",
      ambil: jawab(badan),
    });
    expect(hasil.data).not.toBeNull();
    expect("b0" in (hasil.data as object)).toBe(true);
    expect("b1" in (hasil.data as object)).toBe(false);
    expect(hasil.errors).toHaveLength(1);
  });

  it("melempar graphql-fatal ketika data null di tingkat atas", async () => {
    const badan = JSON.stringify({ data: null, errors: [{ message: 'Unknown field "applyStage"' }] });
    await expect(
      postGraphQL({ url: URL_UJI, query: "{ x }", ambil: jawab(badan) }),
    ).rejects.toMatchObject({ sebab: "graphql-fatal" });
  });

  it("melempar balasan-html pada HTTP 200 bertipe text/html — fallback SPA", async () => {
    const ambil = jawab("<!doctype html><html><body>ok</body></html>", { contentType: "text/html" });
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toMatchObject({
      sebab: "balasan-html",
    });
  });

  it("melempar balasan-html walau content-type berbohong", async () => {
    const ambil = jawab("<html><body>portal</body></html>", { contentType: "application/json" });
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toMatchObject({
      sebab: "balasan-html",
    });
  });

  it("melempar http pada status non-2xx", async () => {
    const ambil = jawab(JSON.stringify({ data: null }), { status: 502 });
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toMatchObject({
      sebab: "http",
    });
  });

  it("melempar bukan-json pada badan yang bukan JSON dan bukan HTML", async () => {
    const ambil = jawab("upstream timeout", { contentType: "text/plain" });
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toMatchObject({
      sebab: "bukan-json",
    });
  });

  it("melempar jaringan ketika fetch menolak, dan menyertakan host", async () => {
    const ambil = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    try {
      await postGraphQL({ url: URL_UJI, query: "{ x }", ambil });
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect(e).toBeInstanceOf(GalatRantai);
      expect((e as GalatRantai).sebab).toBe("jaringan");
      expect((e as GalatRantai).host).toBe("indexer.contoh.test");
    }
  });

  it("MENERUSKAN AbortError apa adanya — pembatalan bukan kegagalan", async () => {
    const ambil = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch;
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toThrow(DOMException);
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.not.toBeInstanceOf(
      GalatRantai,
    );
  });
});
```

- [ ] **Step 3: Jalankan uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm check:uji
pnpm test client/src/lib/chain/graphql.test.ts 2>&1 | tail -12
```

Diharapkan: `pnpm check` tanpa keluaran; seluruh uji di berkas itu hijau. Bila `rejects.not.toBeInstanceOf` tidak tersedia pada versi Vitest terpasang, ganti dengan blok `try/catch` yang mengassert `e instanceof GalatRantai === false` — jangan menghapus assert-nya; ia yang menjaga agar pembatalan tidak berubah jadi panel galat.

- [ ] **Step 4: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/lib/chain/graphql.ts client/src/lib/chain/graphql.test.ts
git commit -m "feat(chain): transport GraphQL indexer dengan taksonomi galat enam sebab

Memakai fetch biasa, BUKAN midnight-js-indexer-public-data-provider: provider
itu menyeret ledger-v8 dan membuat bundel 8,5x lebih besar tanpa menambah
kemampuan baca apa pun.

Dua perilaku yang diverifikasi terhadap indexer sungguhan dan dikodekan sebagai
uji: errors yang tidak kosong TIDAK berarti kegagalan total, dan alias yang
gagal HILANG dari data alih-alih bernilai null.

Penjaga balasan HTML mengikuti pola yang sudah ada di lib/proof-server.ts
(spec 14.4): HTTP 200 bertipe text/html adalah fallback SPA, bukan jawaban."
```

**Deliverable:** satu transport yang membedakan enam sebab kegagalan, mempertahankan jawaban sebagian, dan meneruskan pembatalan apa adanya — seluruhnya diuji tanpa menyentuh jaringan.

---

### Task 4: Dekoder ledger, dan perekaman fixture

Task ini memegang **satu-satunya** modul yang mengimpor WASM di seluruh aplikasi. Pemusatan itu disengaja: ia membuat pertanyaan "apa yang menarik 1,3 MB WASM ke bundel" punya satu jawaban yang dapat diperiksa dengan satu `grep`, dan ia yang membuat gerbang bundel di Task 9 bisa berdiri.

Fixture direkam di sini, bukan nanti, karena setiap task sesudahnya mengujinya.

**Files:**
- Create: `client/src/lib/chain/dekode.ts`, `client/src/test/fixture-rantai/README.md`, `scripts/rekam-fixture-rantai.mjs`
- Create (hasil rekaman): `client/src/test/fixture-rantai/registry.json`, `client/src/test/fixture-rantai/ballots.json`, `client/src/test/fixture-rantai/jaringan.json`, `client/src/test/fixture-rantai/meta.json`
- Test: `client/src/lib/chain/dekode.test.ts`

**Interfaces:**
- Consumes:
  - `@midnight-ntwrk/compact-runtime` → `ContractState`, `CompactError`
  - `@pkgs/contract/src/managed/ballot/contract/index.js` → `ledger`, `BallotPhase`, `type Ledger as LedgerBallot`
  - `@pkgs/contract/src/managed/registry/contract/index.js` → `ledger`, `type Ledger as LedgerRegistry`
  - `./graphql` → `GalatRantai`
- Produces:
  - `type FaseBallot = 0 | 1 | 2`
  - `type KeadaanRegistry = { count: number; alamat: string[] }`
  - `type KeadaanBallot = { title: string; description: string; community: string; opsi: string[]; optionCount: number; voteDeadlineDetik: number; tallyDeadlineDetik: number; quorumPercent: number; eligibleCount: number; registeredCount: number; eligibilityPolicy: string; phase: FaseBallot; voteCount: number; talliedCount: number; tallies: [number, number][] }`
  - `dekodeRegistry(stateHex: string, alamat: string): KeadaanRegistry`
  - `dekodeBallot(stateHex: string, alamat: string): KeadaanBallot`
  - `padatkanTallies(pasangan: Iterable<readonly [bigint, bigint] | readonly [number, number]>, jumlahOpsi: number): number[]` — menerima **kedua** bentuk pasangan: `bigint` karena itu yang keluar dari `ledger().tallies`, dan `number` karena itu yang tersimpan di `KeadaanBallot.tallies` setelah dikonversi di batas dekode. Kalau parameternya hanya `bigint`, `keBallot()` di Task 6 tidak dapat memanggilnya tanpa mengonversi balik

- [ ] **Step 1: Tulis `client/src/lib/chain/dekode.ts`**

Tiga keputusan bentuk yang perlu dinyatakan sebelum kodenya dibaca:

1. **Seluruh field dibaca EAGER di dalam satu `try`.** `ledger()` mengembalikan objek bergetter; kalau dekode ditunda sampai pembacaan field, `CompactError` akan meledak di tengah render React, jauh dari `try` mana pun. Membaca semuanya di sini memindahkan kegagalan ke tempat yang punya penanganannya.
2. **`bigint` dikonversi ke `number` di batas ini, bukan di UI.** Seluruh besaran yang dikonversi berbatas: `eligibleCount ≤ 1024` (dijaga constructor kontrak), `optionCount ≤ 4`, `quorumPercent ≤ 100`, dan deadline berupa detik epoch. Deadline diperiksa eksplisit terhadap `Number.MAX_SAFE_INTEGER` sebelum dikonversi.
3. **`opsi` dipotong menurut `optionCount`.** Ledger selalu punya `option0..option3`; yang di atas `optionCount` berisi string kosong. Menampilkannya berarti menawarkan pilihan yang `castVote` pasti tolak (`assert(opsi < optionCount)`).

```typescript
import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { ledger as ledgerBallotMentah } from "@pkgs/contract/src/managed/ballot/contract/index.js";
import { ledger as ledgerRegistryMentah } from "@pkgs/contract/src/managed/registry/contract/index.js";
import { GalatRantai } from "./graphql";

/**
 * SATU-SATUNYA modul di aplikasi ini yang mengimpor WASM.
 *
 * Pemusatan ini disengaja dan dijaga mesin di Task 9: pertanyaan "apa yang
 * menarik onchain-runtime-v3 (1.321.366 B) ke dalam bundel" harus punya satu
 * jawaban yang dapat diperiksa dengan satu grep. Begitu dua berkas mengimpornya,
 * gerbang ukuran bundel berhenti bisa menunjuk penyebabnya.
 *
 * Yang TIDAK ada di sini, dan tidak boleh masuk: ledger-v8, paket midnight-js-*
 * apa pun, wallet, proof server, artefak ZK. Seluruhnya milik jalur TULIS (C-2b).
 */

export type FaseBallot = 0 | 1 | 2;

export type KeadaanRegistry = {
  count: number;
  /** Urutan APA ADANYA dari List: pushFront, jadi TERBARU DI DEPAN. Bukan nomor seri. */
  alamat: string[];
};

export type KeadaanBallot = {
  title: string;
  description: string;
  community: string;
  /** Sudah dipotong menurut optionCount. option3 yang kosong tidak pernah ikut. */
  opsi: string[];
  optionCount: number;
  /** DETIK sejak epoch, bukan milidetik. Satuan ini ditegakkan ballot.compact. */
  voteDeadlineDetik: number;
  tallyDeadlineDetik: number;
  /** Informatif. TIDAK ditegakkan circuit mana pun — lihat komentar di ballot.compact. */
  quorumPercent: number;
  eligibleCount: number;
  registeredCount: number;
  eligibilityPolicy: string;
  phase: FaseBallot;
  voteCount: number;
  talliedCount: number;
  /** Pasangan MENTAH dari map jarang. Pemadatannya dilakukan padatkanTallies(). */
  tallies: [number, number][];
};

function keNomor(nilai: bigint, nama: string, alamat: string): number {
  if (nilai > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new GalatRantai(
      "dekode",
      `${nama} on contract ${alamat} exceeds Number.MAX_SAFE_INTEGER (${nilai})`,
      alamat,
    );
  }
  return Number(nilai);
}

function keChargedState(stateHex: string, alamat: string) {
  const rapi = stateHex.startsWith("0x") ? stateHex.slice(2) : stateHex;
  if (!/^[0-9a-fA-F]*$/.test(rapi) || rapi.length % 2 !== 0) {
    // rincian adalah TEKS UI — ditulis Inggris; lihat komentar di GalatRantai.
    throw new GalatRantai("dekode", `Contract state for ${alamat} is not valid hex.`, alamat);
  }
  const bita = new Uint8Array(rapi.length / 2);
  for (let i = 0; i < bita.length; i++) bita[i] = parseInt(rapi.slice(i * 2, i * 2 + 2), 16);
  try {
    return ContractState.deserialize(bita).data;
  } catch (e) {
    // Bentuk galat yang diverifikasi pada bita sampah:
    // "expected header tag 'midnight:contract-state[v6]:'"
    throw new GalatRantai(
      "dekode",
      `ContractState.deserialize failed for ${alamat}: ${e instanceof Error ? e.message : String(e)}`,
      alamat,
    );
  }
}

export function dekodeRegistry(stateHex: string, alamat: string): KeadaanRegistry {
  const charged = keChargedState(stateHex, alamat);
  try {
    const l = ledgerRegistryMentah(charged);
    // Dibaca EAGER. ledger() mengembalikan objek bergetter; menunda pembacaan
    // berarti CompactError meledak di tengah render React, jauh dari try ini.
    return { count: keNomor(l.count, "count", alamat), alamat: [...l.ballots] };
  } catch (e) {
    if (e instanceof GalatRantai) throw e;
    throw new GalatRantai(
      "dekode",
      `${alamat} could not be read as a registry contract: ${e instanceof Error ? e.message : String(e)}`,
      alamat,
    );
  }
}

export function dekodeBallot(stateHex: string, alamat: string): KeadaanBallot {
  const charged = keChargedState(stateHex, alamat);
  try {
    const l = ledgerBallotMentah(charged);
    const optionCount = keNomor(l.optionCount, "optionCount", alamat);
    // Ledger selalu punya option0..option3; yang di atas optionCount berisi
    // string kosong. Menampilkannya berarti menawarkan pilihan yang castVote
    // PASTI tolak: assert(opsi < optionCount).
    const semuaOpsi = [l.option0, l.option1, l.option2, l.option3];
    return {
      title: l.title,
      description: l.description,
      community: l.community,
      opsi: semuaOpsi.slice(0, optionCount),
      optionCount,
      voteDeadlineDetik: keNomor(l.voteDeadline, "voteDeadline", alamat),
      tallyDeadlineDetik: keNomor(l.tallyDeadline, "tallyDeadline", alamat),
      quorumPercent: keNomor(l.quorumPercent, "quorumPercent", alamat),
      eligibleCount: keNomor(l.eligibleCount, "eligibleCount", alamat),
      registeredCount: keNomor(l.registeredCount, "registeredCount", alamat),
      eligibilityPolicy: l.eligibilityPolicy,
      phase: l.phase as FaseBallot,
      voteCount: keNomor(l.voteCount, "voteCount", alamat),
      talliedCount: keNomor(l.talliedCount, "talliedCount", alamat),
      // [...map] memberi pasangan yang BENAR-BENAR ADA. Kunci yang tidak pernah
      // menerima suara TIDAK muncul di sini sama sekali — lihat padatkanTallies.
      tallies: [...l.tallies].map(([k, v]) => [
        keNomor(k, "kunci tallies", alamat),
        keNomor(v, "nilai tallies", alamat),
      ]),
    };
  } catch (e) {
    if (e instanceof GalatRantai) throw e;
    // Bentuk yang diverifikasi ketika state registry didekode sebagai ballot:
    // CompactError "invalid operation for type: tried to idx, only map, array,
    // and bmt are supported". Inilah saringan untuk entri sampah di registry,
    // yang registry.compact sendiri sebut harus disaring di sisi klien.
    throw new GalatRantai(
      "dekode",
      `${alamat} could not be read as a ballot contract: ${e instanceof Error ? e.message : String(e)}`,
      alamat,
    );
  }
}

/**
 * Map tallies JARANG: kunci yang tidak pernah menerima suara TIDAK ADA,
 * bukan bernilai 0.
 *
 * Diverifikasi pada ballot yang benar-benar final: tallies = [[2,1],[0,2]].
 * Kunci 1 tidak ada. Pengindeksan naif `tallies[i]` salah baca, dan `lookup()`
 * pada kunci yang tidak ada MELEMPAR "expected a cell, received null" —
 * perilaku yang sudah dicatat pkgs/cli/src/periksa.ts.
 *
 * Fungsi ini memadatkan ke larik sepanjang jumlahOpsi, mengisi lubangnya dengan
 * nol, dan MENGABAIKAN kunci di luar rentang opsi alih-alih membuangnya
 * diam-diam ke indeks yang salah.
 */
export function padatkanTallies(
  pasangan: Iterable<readonly [bigint, bigint] | readonly [number, number]>,
  jumlahOpsi: number,
): number[] {
  const padat = new Array<number>(jumlahOpsi).fill(0);
  for (const [k, v] of pasangan) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= jumlahOpsi) continue;
    padat[i] = Number(v);
  }
  return padat;
}
```

- [ ] **Step 2: Buat direktori `scripts/`, lalu tulis skrip perekam fixture**

**`scripts/` TIDAK ADA di repo ini** — ia dibongkar di C-1 Task 8 bersama `scripts/pindah-komponen.mjs`, dan Task 1 Step 2 rencana ini justru membuktikan ketiadaannya. Menulis ke dalamnya tanpa membuatnya lebih dulu gagal dengan `ENOENT`.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
mkdir -p scripts
ls -d scripts
```

Diharapkan: `scripts`.

Skrip ini **satu-satunya** tempat di seluruh rencana yang menyentuh jaringan sungguhan dalam alur normal. Ia dijalankan sekali, hasilnya di-commit, dan seluruh uji berikutnya berjalan terhadap hasilnya.

`scripts/rekam-fixture-rantai.mjs`:

```javascript
/**
 * Merekam respons indexer sungguhan menjadi fixture uji.
 *
 * Dijalankan MANUAL, hasilnya di-commit, dan seluruh uji berjalan terhadapnya.
 * Alasannya bukan kecepatan melainkan determinisme: data nyata berubah — tinggi
 * blok naik tiap 6 detik, ballot bisa bertambah, fase bergerak — sehingga uji
 * yang menyentuh jaringan adalah uji yang hijau atau merah menurut hari.
 *
 * meta.json merekam KAPAN rekaman dibuat beserta stempel waktu blok pada saat
 * itu. Uji yang butuh "waktu sekarang" menyuntikkan nilai dari meta.json,
 * BUKAN Date.now(). Itulah yang membuat turunan status (J1) dapat diuji sama
 * sekali: sebuah ballot yang "sudah lewat deadline" harus tetap sudah lewat
 * deadline ketika uji dijalankan tahun depan.
 *
 * Jalankan:  node scripts/rekam-fixture-rantai.mjs
 * Env opsional: VITE_MIDNIGHT_NETWORK, VITE_VOTEPRIV_REGISTRY
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const JARINGAN = process.env.VITE_MIDNIGHT_NETWORK ?? "preview";
const REGISTRY =
  process.env.VITE_VOTEPRIV_REGISTRY ??
  "b9d127d83f1436488e2cc808d9732d51f4f5befe2711362c7d669759db2a298a";

const ENDPOINT = {
  preprod: "https://indexer.preprod.midnight.network/api/v3/graphql",
  preview: "https://indexer.preview.midnight.network/api/v3/graphql",
  undeployed: "http://127.0.0.1:8088/api/v3/graphql",
}[JARINGAN];
if (!ENDPOINT) throw new Error(`jaringan tidak dikenal: ${JARINGAN}`);

const DIR = path.resolve(process.cwd(), "client/src/test/fixture-rantai");
mkdirSync(DIR, { recursive: true });

async function post(query, variables) {
  const t0 = performance.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  return { json, ms: Math.round(performance.now() - t0) };
}

/**
 * Fragmen ini SENGAJA merekam SUPERSET: `terbaru` diambil untuk SETIAP ballot,
 * bukan hanya untuk MAKS_BALLOT_BERAKSI yang pertama seperti yang dikirim
 * aplikasi.
 *
 * Alasannya: fixture yang superset tetap sah ketika MAKS_BALLOT_BERAKSI di
 * baca-rantai.ts dinaikkan atau diturunkan, sehingga menyetel angka itu tidak
 * menuntut rekam ulang dan perjalanan ke jaringan. Uji yang perlu melihat
 * perilaku jendela MEMANGKAS jawaban ini sendiri menurut dokumen yang benar-
 * benar dikirim — lihat `ambilPalsu()` di baca-rantai.test.ts.
 *
 * `limit: 5`, bukan 4: selisih antar-aksi menuntut pendahulu, dan jendela lima
 * memberi empat selisih. Nilainya harus SAMA dengan yang ada di kueri.ts;
 * berbeda berarti fixture merekam lebih sedikit riwayat daripada yang diminta
 * aplikasi, dan uji selisih akan hijau untuk alasan yang salah.
 */
const FRAGMEN = `fragment Isi on Contract {
  address
  state
  deploy: actions(limit: 1, type: DEPLOY) { transaction { hash block { height timestamp } } }
  terbaru: actions(limit: 5) {
    __typename
    ... on ContractCall { entryPoint }
    state
    transaction { hash block { height timestamp } }
  }
}`;

// ── POST 1: registry ──────────────────────────────────────────────────────
const q1 = `query Registry($a: HexEncoded!) { r: contract(address: $a) { ...Isi } }\n${FRAGMEN}`;
const r1 = await post(q1, { a: REGISTRY });
if (!r1.json.data?.r) throw new Error(`registry ${REGISTRY} tidak ditemukan di ${JARINGAN}`);
writeFileSync(path.join(DIR, "registry.json"), JSON.stringify(r1.json, null, 1) + "\n");

// Alamat ballot dibaca dari state registry lewat dekoder yang SAMA dengan yang
// dipakai aplikasi — supaya fixture tidak pernah lahir dari jalur kode kedua.
const { ContractState } = await import("@midnight-ntwrk/compact-runtime");
const { ledger: ledgerRegistry } = await import(
  "../pkgs/contract/src/managed/registry/contract/index.js"
);
const hexKeBita = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));
const reg = ledgerRegistry(ContractState.deserialize(hexKeBita(r1.json.data.r.state)).data);
const alamat = [...reg.ballots];

// ── POST 2: seluruh ballot, satu dokumen, alias per alamat ────────────────
const params = alamat.map((_, i) => `$a${i}: HexEncoded!`).join(", ");
const bidang = alamat.map((_, i) => `  b${i}: contract(address: $a${i}) { ...Isi }`).join("\n");
const q2 = `query Ballots(${params}) {\n${bidang}\n}\n${FRAGMEN}`;
const vars = Object.fromEntries(alamat.map((a, i) => [`a${i}`, a]));
const r2 = await post(q2, vars);
writeFileSync(
  path.join(DIR, "ballots.json"),
  JSON.stringify({ alamat, jawaban: r2.json }, null, 1) + "\n",
);

// ── POST 3: keadaan jaringan ──────────────────────────────────────────────
const q3 = `query Jaringan { block { height timestamp hash } currentEpochInfo { epochNo durationSeconds elapsedSeconds } }`;
const r3 = await post(q3, {});
writeFileSync(path.join(DIR, "jaringan.json"), JSON.stringify(r3.json, null, 1) + "\n");

// ── meta: waktu rekam, dipakai sebagai "sekarang" oleh seluruh uji ────────
const meta = {
  jaringan: JARINGAN,
  endpoint: ENDPOINT,
  alamatRegistry: REGISTRY,
  direkamPada: new Date().toISOString(),
  /**
   * Stempel waktu blok saat rekaman, dalam MILIDETIK — indexer mengembalikan
   * Block.timestamp dalam milidetik sementara deadline ledger dalam DETIK.
   * Uji menyuntikkan nilai ini sebagai "sekarang".
   */
  sekarangMs: r3.json.data.block.timestamp,
  tinggiBlok: r3.json.data.block.height,
  msPerPost: [r1.ms, r2.ms, r3.ms],
  jumlahBallot: alamat.length,
};
writeFileSync(path.join(DIR, "meta.json"), JSON.stringify(meta, null, 1) + "\n");

console.log("fixture direkam ke", DIR);
console.log(JSON.stringify(meta, null, 1));
```

- [ ] **Step 3: Rekam fixture**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node scripts/rekam-fixture-rantai.mjs
ls -la client/src/test/fixture-rantai/
```

Diharapkan: empat berkas JSON. `meta.json` yang tercetak memuat `jumlahBallot` ≥ 1 dan `msPerPost` berisi tiga angka — bandingkan ketiganya dengan rentang terukur investigasi (1.047–1.279 ms) hanya sebagai **orientasi**, bukan sebagai gerbang; jaringan publik berhak lebih lambat hari ini.

**Bila `jumlahBallot` bernilai 0**, registry kosong di jaringan itu, dan seluruh uji yang mengandalkan ballot nyata tidak dapat ditulis. **Hentikan** dan periksa `VITE_MIDNIGHT_NETWORK` sebelum melanjutkan.

- [ ] **Step 4: Tulis `client/src/test/fixture-rantai/README.md`**

Fixture tanpa provenans adalah data ajaib. Berkas ini yang mencegahnya.

````markdown
# Fixture rantai — rekaman respons indexer sungguhan

Direkam oleh `scripts/rekam-fixture-rantai.mjs`. **Jangan disunting tangan.**

| Berkas | Isi |
|---|---|
| `registry.json` | jawaban POST 1: state registry + aksi deploy + 4 aksi terbaru |
| `ballots.json` | jawaban POST 2: `{ alamat, jawaban }` — `alamat` adalah urutan APA ADANYA dari `registry.ballots` (pushFront, terbaru di depan) |
| `jaringan.json` | jawaban POST 3: `block` dan `currentEpochInfo` |
| `meta.json` | jaringan, endpoint, alamat registry, waktu rekam, `sekarangMs`, tinggi blok, ms per POST |

## Mengapa fixture, dan bukan jaringan langsung

Data nyata berubah: tinggi blok naik tiap 6 detik, ballot bisa bertambah, fase
bergerak secara malas ketika ada yang memicunya. Uji yang menyentuh jaringan
adalah uji yang hijau atau merah menurut hari, dan uji semacam itu berhenti
menjadi gerbang.

## `meta.sekarangMs` adalah "sekarang" bagi seluruh uji

Turunan status membandingkan waktu dinding terhadap `voteDeadline`/`tallyDeadline`.
Kalau uji memakai `Date.now()`, sebuah ballot yang hari ini "sudah lewat deadline"
akan tetap begitu — tetapi sebuah ballot yang hari ini "masih live" berubah status
diam-diam besok, dan ujinya merah tanpa ada kode yang berubah. Menyuntikkan
`meta.sekarangMs` membekukan waktu bersama datanya.

Perhatikan satuannya: `Block.timestamp` dari indexer dalam **milidetik**;
`voteDeadline`/`tallyDeadline` di ledger dalam **detik**. `ballot.compact` menulis
peringatan panjang tentang satuan ini karena ballot yang di-deploy dalam milidetik
tidak pernah dapat mencapai deadline-nya.

## Merekam ulang

```bash
node scripts/rekam-fixture-rantai.mjs
```

Rekaman ulang **mengubah nilai** yang diassert uji fixture. Itu bukan alasan
menghindarinya — itu alasan membaca diff-nya. Bila sebuah assert berubah tanpa
ada kode yang berubah, yang berubah adalah rantainya, dan itu informasi.

Satu pemeriksaan terpisah menyentuh jaringan sungguhan dan boleh dilewati:

```bash
VOTEPRIV_UJI_JARINGAN=1 pnpm test client/src/lib/chain/jaringan-nyata.test.ts
```
````

- [ ] **Step 5: Tulis `client/src/lib/chain/dekode.test.ts`**

Perhatikan bentuk assert-nya: nilai yang bisa basi **diturunkan dari fixture**, sementara yang diassert literal adalah **invarian** — hal yang benar apa pun isi rantainya.

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GalatRantai } from "./graphql";
import { dekodeBallot, dekodeRegistry, padatkanTallies } from "./dekode";

const DIR = new URL("../../test/fixture-rantai/", import.meta.url);
const baca = (nama: string) => JSON.parse(readFileSync(new URL(nama, DIR), "utf8"));

const registry = baca("registry.json");
const ballots = baca("ballots.json");
const meta = baca("meta.json");

describe("dekodeRegistry", () => {
  it("mendekode state registry yang direkam", () => {
    const r = dekodeRegistry(registry.data.r.state, meta.alamatRegistry);
    // Nilainya DITURUNKAN dari fixture, bukan diketik: jumlah ballot berubah
    // setiap ada yang mendaftar.
    expect(r.alamat).toEqual(ballots.alamat);
    expect(r.count).toBe(ballots.alamat.length);
  });

  it("MELEMPAR GalatRantai bersebab dekode pada bita yang bukan ContractState", () => {
    // Bentuk pesan yang diverifikasi: "expected header tag 'midnight:contract-state[v6]:'"
    expect(() => dekodeRegistry("01020304", "sampah")).toThrow(GalatRantai);
    try {
      dekodeRegistry("01020304", "sampah");
    } catch (e) {
      expect((e as GalatRantai).sebab).toBe("dekode");
    }
  });

  it("MELEMPAR pada hex yang panjangnya ganjil", () => {
    expect(() => dekodeRegistry("abc", "sampah")).toThrow(/is not valid hex/);
  });
});

describe("dekodeBallot", () => {
  const alamat: string[] = ballots.alamat;

  it("mendekode SETIAP ballot yang direkam", () => {
    for (let i = 0; i < alamat.length; i++) {
      const k = dekodeBallot(ballots.jawaban.data[`b${i}`].state, alamat[i]);
      // Invarian kontrak, benar apa pun isi rantainya:
      expect(k.optionCount).toBeGreaterThanOrEqual(2);   // assert(nOptions >= 2)
      expect(k.optionCount).toBeLessThanOrEqual(4);      // assert(nOptions <= 4)
      expect(k.opsi).toHaveLength(k.optionCount);        // dipotong, option3 kosong tidak ikut
      expect(k.tallyDeadlineDetik).toBeGreaterThan(k.voteDeadlineDetik); // assert(tallyDl > voteDl)
      expect(k.eligibleCount).toBeGreaterThanOrEqual(1); // assert(eligible >= 1)
      expect(k.eligibleCount).toBeLessThanOrEqual(1024); // kapasitas pohon Merkle depth 10
      expect(k.quorumPercent).toBeLessThanOrEqual(100);  // assert(quorum <= 100)
      expect([0, 1, 2]).toContain(k.phase);
      expect(k.registeredCount).toBeLessThanOrEqual(k.eligibleCount);
      expect(k.talliedCount).toBeLessThanOrEqual(k.voteCount);
    }
  });

  it("membaca deadline dalam DETIK, bukan milidetik", () => {
    // ballot.compact menulis peringatan panjang tentang ini: deadline dalam
    // milidetik (~1000x lebih besar) tidak pernah tercapai dalam rentang waktu
    // manusia, dan simulator tidak akan pernah menangkapnya.
    const k = dekodeBallot(ballots.jawaban.data.b0.state, alamat[0]);
    const sekarangDetik = Math.floor(meta.sekarangMs / 1000);
    // Deadline yang masuk akal berada dalam beberapa tahun dari waktu rekam.
    const setahun = 365 * 24 * 3600;
    expect(Math.abs(k.voteDeadlineDetik - sekarangDetik)).toBeLessThan(10 * setahun);
  });

  it("MELEMPAR ketika state registry didekode sebagai ballot — inilah saringan entri sampah", () => {
    // registry.compact menyebut sendiri: "Entri yang tidak resolve ke kontrak
    // ballot yang sah disaring di sisi klien." Inilah saringannya.
    // Bentuk yang diverifikasi: CompactError "invalid operation for type:
    // tried to idx, only map, array, and bmt are supported".
    expect(() => dekodeBallot(registry.data.r.state, meta.alamatRegistry)).toThrow(
      /could not be read as a ballot contract/,
    );
  });
});

describe("padatkanTallies", () => {
  it("mengisi lubang pada map JARANG — kunci yang hilang jadi 0, bukan undefined", () => {
    // Bentuk yang diverifikasi pada ballot final: [[2,1],[0,2]]. Kunci 1 TIDAK ADA.
    expect(padatkanTallies([[2n, 1n], [0n, 2n]], 3)).toEqual([2, 0, 1]);
  });

  it("mengembalikan larik nol ketika map kosong — fase voting, hasil tersegel", () => {
    expect(padatkanTallies([], 3)).toEqual([0, 0, 0]);
  });

  it("MENGABAIKAN kunci di luar rentang opsi alih-alih menaruhnya di indeks yang salah", () => {
    expect(padatkanTallies([[0n, 5n], [7n, 9n]], 2)).toEqual([5, 0]);
  });

  it("memadatkan tallies dari setiap ballot yang direkam ke panjang yang benar", () => {
    const alamat: string[] = ballots.alamat;
    for (let i = 0; i < alamat.length; i++) {
      const k = dekodeBallot(ballots.jawaban.data[`b${i}`].state, alamat[i]);
      const padat = padatkanTallies(k.tallies, k.optionCount);
      expect(padat).toHaveLength(k.optionCount);
      // Jumlah seluruh tally SELALU sama dengan talliedCount: tallyVote menambah
      // keduanya di transaksi yang sama, dan tidak ada circuit lain yang menyentuh
      // salah satunya.
      expect(padat.reduce((s, n) => s + n, 0)).toBe(k.talliedCount);
    }
  });
});
```

- [ ] **Step 6: Jalankan uji dekode**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm test client/src/lib/chain/dekode.test.ts 2>&1 | tail -20
```

Diharapkan: seluruh uji hijau. Bila muncul `expected instance of ChargedState`, **bukan** datanya yang salah — itu instance GANDA `onchain-runtime-v3`; kembali ke Task 2 Step 2 dan jalankan gerbangnya.

- [ ] **Step 7: Buktikan bahwa hanya SATU berkas yang mengimpor WASM**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -rln "compact-runtime\|managed/ballot/contract\|managed/registry/contract" client/src --include=*.ts --include=*.tsx \
  | grep -v '\.test\.' | sort
```

Diharapkan: **tepat satu** baris, `client/src/lib/chain/dekode.ts`. Berkas uji sengaja dikecualikan — `instance-tunggal.test.ts` memang harus mengimpornya, dan berkas uji tidak pernah masuk bundel.

- [ ] **Step 8: Typecheck dan commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm check:uji
pnpm test 2>&1 | tail -12
git add client/src/lib/chain/dekode.ts client/src/lib/chain/dekode.test.ts \
        client/src/test/fixture-rantai scripts/rekam-fixture-rantai.mjs
git commit -m "feat(chain): dekoder ledger ballot dan registry, plus fixture rantai terekam

dekode.ts adalah SATU-SATUNYA modul di aplikasi yang mengimpor WASM. Pemusatan
itu yang membuat gerbang ukuran bundel bisa menunjuk penyebabnya dengan satu grep.

Tiga perilaku yang dikodekan sebagai uji, semuanya diverifikasi terhadap rantai
sungguhan: map tallies JARANG (kunci tanpa suara tidak ada, bukan bernilai 0);
state registry yang didekode sebagai ballot MELEMPAR CompactError, dan itulah
saringan entri sampah yang registry.compact minta dilakukan di sisi klien; dan
deadline ledger dalam DETIK sementara Block.timestamp indexer dalam milidetik.

Fixture direkam sekali dan di-commit. meta.sekarangMs membekukan waktu bersama
datanya, supaya turunan status dapat diuji tanpa bergantung pada hari."
```

**Deliverable:** dekoder yang gagal di batasnya sendiri dan bukan di tengah render; fixture data nyata yang membekukan waktu bersama datanya; bukti mekanis bahwa WASM hanya masuk lewat satu pintu.

---

### Task 5: Tiga kueri dan orkestrasi `bacaRantai()`

Seluruh 15 baris tabel §9.4 didapat dengan **tiga POST**, dan pembagiannya bukan selera:

| POST | Dokumen | Baris §9.4 yang dipenuhi |
|---|---|---|
| 1 | `contract(address: REGISTRY) { ...Penuh }` | daftar alamat ballot, dan **selisih `registry.count`** antar-aksi untuk Recent activity |
| 2 | `bN: contract(address: $aN) { ...Penuh atau ...Ringkas }` untuk setiap alamat | 11 baris metadata + hitungan + tallies + `deployHeight` (J2), plus selisih `voteCount`/`talliedCount` untuk `MAKS_BALLOT_BERAKSI` ballot terbaru |
| 3 | `block { height timestamp }` + `currentEpochInfo { … }` | kartu network status |

POST 2 memakai **alias per alamat dalam satu dokumen**, bukan satu POST per ballot. Alasannya terukur: gzip menyusutkan jawaban 12 state menjadi sekitar sepersebelas ukuran mentahnya, sehingga biaya bandwidth-nya kecil, sementara *round-trip* terhadap layanan publik yang terukur 1.047–1.279 ms per POST adalah biaya yang berlipat langsung dengan jumlah ballot.

**`actions(limit: 1, type: DEPLOY)` dipakai untuk nomor urut**, bukan menyusuri seluruh riwayat: sebuah ballot dengan ratusan suara akan mendorong `ContractDeploy` keluar dari `limit` berapa pun yang wajar. Enum `ContractActionType` punya tiga anggota (`DEPLOY`, `CALL`, `UPDATE`); yang dipakai hanya `DEPLOY`.

**`terbaru: actions(limit: 5)` membawa `state` per aksi, dan `state` itu BENAR-BENAR DIDEKODE.** Ini bukan formalitas, dan ia sengaja dinyatakan sekeras ini karena bentuk sebelumnya adalah cacat yang paling mahal di rencana ini: mengambil `state`, membayar bandwidth-nya, **membuangnya**, lalu tetap mengklaim "Recent activity dibaca dari snapshot ledger". Label yang lahir dari `entryPoint` saja adalah **kesimpulan dari nama fungsi**, bukan pembacaan — dan "castVote dipanggil" tidak sama dengan "voteCount naik dari 2 ke 3".

Spec §9.4 menuntut yang kedua apa adanya: *"Recent activity — perubahan terbaru pada `voteCount`, `talliedCount`, dan `registry.count`."* Itu **selisih antar-aksi**, dan selisih menuntut dua snapshot.

Diverifikasi hari ini bahwa snapshot per aksi memang dapat didekode dan memang bergerak — `ledger()` yang sama, atas `state` milik `Contract.actions`, pada ballot `f26827a7…`:

| Aksi | blok | `voteCount` | `talliedCount` |
|---|---|---|---|
| `registerVoters` | 813334 | 0 | 0 |
| `castVote` | 813341 | **1** | 0 |
| `castVote` | 813345 | **2** | 0 |
| `castVote` | 813349 | **3** | 0 |
| `tallyVote` | 813940 | 3 | **1** |
| `tallyVote` | 813944 | 3 | **2** |
| `tallyVote` | 813948 | 3 | **3** |
| `finalize` | 814290 | 3 | 3 (`phase` 1 → **2**) |

dan pada registry: `ContractDeploy` → `count 0`, `register` → `count 1`, `register` → `count 2`.

`limit` naik dari 4 ke **5** karena selisih menuntut pendahulu: dengan jendela lima aksi, empat di antaranya punya pendahulu di dalam jendela yang sama dan karena itu punya selisih; yang paling tua tidak punya, dan itu **dinyatakan** (`pendahuluTerbaca: false`) alih-alih dikarang.

**Bukan setiap ballot membawa aksi.** `state` per aksi berukuran ~11,5 KB dan harus didekode WASM satu per satu, jadi mengambilnya untuk 48 ballot berarti 240 dekode untuk panel yang menampilkan tiga baris. POST 2 karena itu memakai **dua fragmen**: `...Penuh` (dengan `terbaru`) untuk `MAKS_BALLOT_BERAKSI` alamat pertama — yaitu yang **paling baru didaftarkan**, karena `pushFront` — dan `...Ringkas` (tanpa `terbaru`) untuk sisanya. Diverifikasi terhadap indexer sungguhan bahwa satu dokumen boleh memakai dua fragmen berbeda pada alias yang berbeda: alias yang memakai `...Ringkas` mengembalikan objek **tanpa kunci `terbaru` sama sekali**.

Biayanya diukur, bukan ditebak, di Step 7 — dan `MAKS_BALLOT_BERAKSI` diturunkan bila ukurannya melampaui anggaran yang perintah itu hitung sendiri.

**Files:**
- Create: `client/src/lib/chain/kueri.ts`, `client/src/lib/chain/baca-rantai.ts`, `client/src/lib/chain/index.ts`
- Test: `client/src/lib/chain/baca-rantai.test.ts`, `client/src/lib/chain/jaringan-nyata.test.ts`

**Interfaces:**
- Consumes: `./endpoint` (`JaringanAktif`, `alamatKontrakValid`), `./graphql` (`postGraphQL`, `GalatRantai`), `./dekode` (`dekodeRegistry`, `dekodeBallot`, `KeadaanBallot`)
- Produces — **daftar ini adalah kontrak yang dibaca Task 6, 7, dan 8 sebelum kodenya ada; ia sama persis dengan tanda tangan implementasinya:**

  Dari `client/src/lib/chain/kueri.ts`:
  - `const FRAGMEN_PENUH: string`, `FRAGMEN_RINGKAS: string`, `KUERI_REGISTRY: string`, `KUERI_JARINGAN: string`
  - `susunKueriBallot(jumlah: number, jumlahBerAksi: number): string`
  - `type BlokAksi = { height: number; timestamp: number }`
  - `type AksiKontrak = { __typename: "ContractDeploy" | "ContractCall" | "ContractUpdate"; entryPoint?: string; state: string; transaction: { hash: string; block: BlokAksi } }` — bentuk **mentah** dari indexer, dengan `state` yang belum didekode; tidak pernah keluar dari `baca-rantai.ts`
  - `type KontrakTerbaca = { address: string; state: string; deploy: { transaction: { hash: string; block: BlokAksi } }[]; terbaru?: AksiKontrak[] }` — `terbaru` **opsional**: alias `...Ringkas` tidak mengembalikan kuncinya sama sekali
  - `type JawabanJaringan = { block: { height: number; timestamp: number; hash: string }; currentEpochInfo: { epochNo: number; durationSeconds: number; elapsedSeconds: number } | null }`

  Dari `client/src/lib/chain/baca-rantai.ts`:
  - `type PerubahanAksi = { bidang: "voteCount" | "talliedCount" | "registeredCount" | "phase" | "count"; dari: number; ke: number }`
  - `type AksiTerbaca = { jenis: "ContractDeploy" | "ContractCall" | "ContractUpdate"; entryPoint: string | null; txHash: string; height: number; timestampMs: number; sumber: string; perubahan: PerubahanAksi[]; pendahuluTerbaca: boolean; cuplikanTerbaca: boolean }` — **tidak** membawa `state`
  - `type BallotGagal = { alamat: string; sebab: "alamat-tak-sah" | "alias-hilang" | "kontrak-null" | "dekode"; pesan: string }`
  - `type BallotTerbaca = { alamat: string; keadaan: KeadaanBallot; deployHeight: number; aksi: AksiTerbaca[] }`
  - `type HasilRantai = { jaringan: JaringanAktif; registry: { count: number; alamat: string[]; aksi: AksiTerbaca[] }; ballot: BallotTerbaca[]; gagal: BallotGagal[]; blok: { height: number; timestampMs: number }; epoch: { epochNo: number; durationSeconds: number; elapsedSeconds: number } | null; sekarangMs: number }`
  - `bacaRantai(opsi?: { jaringan?: JaringanAktif; signal?: AbortSignal; ambil?: typeof fetch }): Promise<HasilRantai>`

- [ ] **Step 1: Tulis `client/src/lib/chain/kueri.ts`**

```typescript
/**
 * Tiga dokumen GraphQL. Murni string dan tipe; tidak ada I/O di berkas ini.
 *
 * Dipisahkan supaya dokumennya dapat dibaca dan di-diff tanpa membaca logika
 * orkestrasi, dan supaya perubahan skema indexer punya satu tempat untuk diperiksa.
 */

/**
 * DUA fragmen, bukan satu, dan pembagiannya adalah keputusan biaya.
 *
 * Yang sama di keduanya:
 *
 * `deploy: actions(limit: 1, type: DEPLOY)` — tinggi blok ContractDeploy, sumber
 * NOMOR URUT yang stabil. Ia TIDAK boleh diganti dengan "elemen terakhir dari
 * daftar aksi": ballot dengan banyak suara mendorong ContractDeploy keluar dari
 * limit berapa pun yang wajar, dan nomor urutnya lalu hilang diam-diam.
 *
 * Yang HANYA ada di ...Penuh:
 *
 * `terbaru: actions(limit: 5)` beserta `state` per aksi. `state` itu BENAR-BENAR
 * DIDEKODE di baca-rantai.ts menjadi cuplikan ledger, lalu diselisihkan terhadap
 * aksi sebelumnya — itulah yang spec 9.4 minta ("perubahan terbaru pada
 * voteCount, talliedCount, dan registry.count"). Mengambil `state` lalu hanya
 * memakai nama entry point berarti membayar bandwidth untuk sesuatu yang dibuang,
 * sambil mengklaim manfaat yang tidak diambil.
 *
 * Angka 5, bukan 4: selisih menuntut pendahulu. Dengan jendela lima aksi, empat
 * di antaranya punya pendahulu di dalam jendela dan karena itu punya selisih.
 *
 * ...Ringkas dipakai untuk ballot yang tidak masuk jendela Recent activity.
 * `state` per aksi berukuran ~11,5 KB dan menuntut satu dekode WASM masing-
 * masing; mengambilnya untuk setiap ballot berarti ratusan dekode untuk panel
 * tiga baris. Diverifikasi terhadap indexer sungguhan bahwa satu dokumen boleh
 * memakai dua fragmen berbeda pada alias yang berbeda, dan alias ...Ringkas
 * mengembalikan objek TANPA kunci `terbaru` sama sekali.
 *
 * `__typename` WAJIB: `entryPoint` hanya ada pada ContractCall, dan tanpa
 * diskriminan, ContractDeploy dan ContractUpdate tidak dapat dibedakan.
 */
const BIDANG_DASAR = `  address
  state
  deploy: actions(limit: 1, type: DEPLOY) { transaction { hash block { height timestamp } } }`;

export const FRAGMEN_PENUH = `fragment Penuh on Contract {
${BIDANG_DASAR}
  terbaru: actions(limit: 5) {
    __typename
    ... on ContractCall { entryPoint }
    state
    transaction { hash block { height timestamp } }
  }
}`;

export const FRAGMEN_RINGKAS = `fragment Ringkas on Contract {
${BIDANG_DASAR}
}`;

/** Registry SELALU memakai fragmen penuh: registry.count adalah satu dari tiga angka yang spec 9.4 minta diselisihkan. */
export const KUERI_REGISTRY = `query Registry($a: HexEncoded!) { r: contract(address: $a) { ...Penuh } }
${FRAGMEN_PENUH}`;

/**
 * `block` tanpa argumen mengembalikan blok terbaru.
 *
 * `currentEpochInfo` adalah PADANAN TERDEKAT untuk "waktu finality" pada kartu
 * network status. Waktu finality TIDAK PUNYA FIELD di skema ini: introspeksi
 * seluruh tipe dan field terhadap /final/i mengembalikan NOL hasil (perintah
 * penurunannya ada di rencana C-2a Task 5 Step 2). UI karena itu menampilkan
 * posisi epoch apa adanya dan TIDAK mengarang angka finality.
 */
export const KUERI_JARINGAN = `query Jaringan {
  block { height timestamp hash }
  currentEpochInfo { epochNo durationSeconds elapsedSeconds }
}`;

/**
 * Menyusun dokumen ballot dengan satu alias per alamat.
 *
 * Satu dokumen, bukan satu POST per ballot: round-trip ke layanan publik terukur
 * 1.047-1.279 ms dan berlipat langsung dengan jumlah ballot, sementara jawaban
 * yang besar menyusut sekitar sepersebelas di kawat lewat gzip.
 *
 * Alias b0..bN-1 mengikuti URUTAN registry.ballots APA ADANYA (pushFront, terbaru
 * di depan). Ia BUKAN nomor seri — lihat J2 di rencana C-2a.
 *
 * `jumlahBerAksi` alias PERTAMA memakai ...Penuh (dengan riwayat aksi), sisanya
 * ...Ringkas. Karena urutannya pushFront, yang mendapat riwayat adalah yang
 * PALING BARU didaftarkan — yang memang isi panel Recent activity.
 */
export function susunKueriBallot(jumlah: number, jumlahBerAksi: number): string {
  if (jumlah < 1) throw new Error("susunKueriBallot dipanggil dengan jumlah < 1");
  if (jumlahBerAksi < 0 || jumlahBerAksi > jumlah) {
    throw new Error(`jumlahBerAksi (${jumlahBerAksi}) harus antara 0 dan jumlah (${jumlah})`);
  }
  const params = Array.from({ length: jumlah }, (_, i) => `$a${i}: HexEncoded!`).join(", ");
  const bidang = Array.from(
    { length: jumlah },
    (_, i) => `  b${i}: contract(address: $a${i}) { ...${i < jumlahBerAksi ? "Penuh" : "Ringkas"} }`,
  ).join("\n");
  // Fragmen yang dideklarasikan tetapi tidak dipakai adalah galat validasi
  // GraphQL, jadi keduanya hanya disertakan ketika benar-benar terpakai.
  const fragmen = [
    jumlahBerAksi > 0 ? FRAGMEN_PENUH : "",
    jumlahBerAksi < jumlah ? FRAGMEN_RINGKAS : "",
  ].filter(Boolean).join("\n");
  return `query Ballots(${params}) {\n${bidang}\n}\n${fragmen}`;
}

export type BlokAksi = { height: number; timestamp: number };

/** Aksi APA ADANYA dari indexer, dengan `state` mentah yang belum didekode. */
export type AksiKontrak = {
  __typename: "ContractDeploy" | "ContractCall" | "ContractUpdate";
  /** Hanya ada pada ContractCall. */
  entryPoint?: string;
  state: string;
  transaction: { hash: string; block: BlokAksi };
};

export type KontrakTerbaca = {
  address: string;
  state: string;
  deploy: { transaction: { hash: string; block: BlokAksi } }[];
  /** TIDAK ADA pada alias yang memakai ...Ringkas — diverifikasi: kuncinya hilang, bukan larik kosong. */
  terbaru?: AksiKontrak[];
};

export type JawabanJaringan = {
  block: { height: number; timestamp: number; hash: string };
  currentEpochInfo: { epochNo: number; durationSeconds: number; elapsedSeconds: number } | null;
};
```

- [ ] **Step 2: Turunkan ulang klaim "tidak ada field finality" — sekali, dengan perintah**

Klaim ini ditulis ke dalam komentar `kueri.ts` dan ke dalam teks UI. Ia karena itu diperiksa, bukan dipercaya. Perintah ini **tidak** dijalankan oleh uji; ia dijalankan sekali di sini untuk memastikan komentar yang baru ditulis benar.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
const url = process.env.INDEXER ?? "https://indexer.preview.midnight.network/api/v3/graphql";
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "{ __schema { types { name fields { name } } } }" }),
});
const { data } = await res.json();
const cocok = [];
for (const t of data.__schema.types) {
  if (/final/i.test(t.name ?? "")) cocok.push(["TIPE", t.name]);
  for (const f of t.fields ?? []) if (/final/i.test(f.name)) cocok.push([t.name, f.name]);
}
console.log("total tipe di skema :", data.__schema.types.length);
console.log("kecocokan /final/i  :", cocok.length, JSON.stringify(cocok.slice(0, 10)));
const epoch = data.__schema.types.find(t => t.name === "EpochInfo");
console.log("EpochInfo           :", (epoch?.fields ?? []).map(f => f.name).join(", ") || "TIDAK ADA");
'
```

Diharapkan: `kecocokan /final/i : 0 []`, dan `EpochInfo` memuat `epochNo`, `durationSeconds`, `elapsedSeconds`. Bila kecocokannya **bukan** nol, skema sudah berubah — perbarui komentar `kueri.ts` dan kartu network status di Task 8 sebelum melanjutkan, karena UI sedang mengklaim sesuatu yang tidak lagi benar.

- [ ] **Step 3: Tulis `client/src/lib/chain/baca-rantai.ts`**

Empat keputusan yang perlu dinyatakan sebelum kodenya dibaca:

1. **Kegagalan per-ballot TIDAK menaikkan pengecualian.** Ia masuk ke `gagal[]`. Hanya kegagalan registry dan kegagalan transport yang menghentikan seluruh pembacaan — karena tanpa registry tidak ada apa pun untuk ditampilkan, sementara tanpa satu ballot masih ada sisanya.
2. **Alias yang HILANG dan alias yang `null` dibedakan.** Diverifikasi: alamat bukan-hex membuat kuncinya hilang dari `data` (bukan null), sedangkan alamat hex yang tidak menunjuk kontrak apa pun mengembalikan `null`. Keduanya masuk `gagal[]` dengan sebab yang berbeda, sehingga spanduk "sebagian" dapat menyebut sebab yang tepat.
3. **Alamat disaring sebelum dikirim.** `alamatKontrakValid()` menahan entri sampah dari dokumen GraphQL sama sekali, sehingga satu entri sampah tidak pernah menghasilkan entri `errors` yang harus ditafsirkan ulang.
4. **POST 3 tidak pernah menggagalkan pembacaan.** Kartu network status adalah hiasan yang berguna; daftar ballot adalah isinya. Kalau POST 3 gagal, `blok` diisi dari tinggi blok tertinggi yang terlihat di aksi kontrak — nilai yang **benar-benar dibaca dari rantai**, bukan tebakan — dan `epoch` menjadi `null`.

```typescript
import { jaringanAktif, alamatKontrakValid, type JaringanAktif } from "./endpoint";
import { GalatRantai, postGraphQL } from "./graphql";
import { dekodeBallot, dekodeRegistry, type KeadaanBallot } from "./dekode";
import {
  KUERI_JARINGAN,
  KUERI_REGISTRY,
  susunKueriBallot,
  type AksiKontrak,
  type JawabanJaringan,
  type KontrakTerbaca,
} from "./kueri";

export type BallotGagal = {
  alamat: string;
  sebab: "alamat-tak-sah" | "alias-hilang" | "kontrak-null" | "dekode";
  pesan: string;
};

/**
 * Satu bidang ledger yang BERUBAH di antara dua aksi berurutan.
 *
 * Inilah isi Recent activity menurut spec 9.4 — "perubahan terbaru pada
 * voteCount, talliedCount, dan registry.count" — dan ia hanya bisa ada kalau
 * `state` per aksi benar-benar didekode, bukan dibuang.
 */
export type PerubahanAksi = {
  bidang: "voteCount" | "talliedCount" | "registeredCount" | "phase" | "count";
  dari: number;
  ke: number;
};

export type AksiTerbaca = {
  jenis: "ContractDeploy" | "ContractCall" | "ContractUpdate";
  /** null pada ContractDeploy dan ContractUpdate. */
  entryPoint: string | null;
  txHash: string;
  height: number;
  timestampMs: number;
  /** Nama yang ditampilkan sebagai asal aksi: judul ballot, atau "Registry". */
  sumber: string;
  /**
   * Bidang yang berubah dibanding aksi SEBELUMNYA di kontrak yang sama.
   *
   * Kosong berarti salah satu dari dua hal, dan keduanya dibedakan oleh
   * `pendahuluTerbaca`: tidak ada yang berubah, atau pendahulunya berada di luar
   * jendela `actions(limit: 5)` sehingga selisihnya TIDAK DIKETAHUI. UI wajib
   * mengatakan "unknown", bukan "no change", pada kasus kedua.
   */
  perubahan: PerubahanAksi[];
  pendahuluTerbaca: boolean;
  /** false bila `state` aksi ini gagal didekode; `perubahan` lalu selalu kosong. */
  cuplikanTerbaca: boolean;
};

export type BallotTerbaca = {
  alamat: string;
  keadaan: KeadaanBallot;
  /** Tinggi blok ContractDeploy. Sumber NOMOR URUT yang stabil (J2). */
  deployHeight: number;
  /**
   * Aksi terbaru yang SUDAH DIDEKODE dan diselisihkan, untuk Recent activity.
   *
   * KOSONG untuk ballot di luar jendela MAKS_BALLOT_BERAKSI — bagi mereka,
   * `terbaru` memang tidak pernah diminta dari indexer. Larik kosong di sini
   * berarti "tidak diambil", bukan "tidak ada aksi", dan tidak ada tempat di UI
   * yang menafsirkannya sebagai yang kedua.
   */
  aksi: AksiTerbaca[];
};

export type HasilRantai = {
  jaringan: JaringanAktif;
  registry: { count: number; alamat: string[]; aksi: AksiTerbaca[] };
  ballot: BallotTerbaca[];
  /** Tidak kosong berarti SEBAGIAN — bukan kegagalan. Daftar yang berhasil tetap tampil. */
  gagal: BallotGagal[];
  blok: { height: number; timestampMs: number };
  /** null bila POST 3 gagal; kartu network status menahan klaimnya, bukan mengarang. */
  epoch: { epochNo: number; durationSeconds: number; elapsedSeconds: number } | null;
  /**
   * Waktu dinding yang dipakai SELURUH turunan status.
   *
   * Diambil dari stempel waktu blok terbaru, BUKAN dari jam perangkat pembaca.
   * Alasannya bukan kerapian: kontrak memutuskan sah-tidaknya castVote dengan
   * kernel.blockTimeLessThan(), yaitu terhadap waktu BLOK. Jam perangkat yang
   * melenceng beberapa menit akan membuat UI berkata "Live now" pada ballot
   * yang kontraknya sudah menolak, atau sebaliknya. Bila POST 3 gagal, nilai
   * ini jatuh ke stempel waktu blok tertinggi yang terlihat di aksi kontrak —
   * masih dibaca dari rantai, bukan dari perangkat.
   */
  sekarangMs: number;
};

/** Batas jumlah alamat per dokumen GraphQL. */
const MAKS_ALAMAT_PER_DOKUMEN = 24;

/**
 * Batas jumlah ballot yang dibaca sama sekali.
 *
 * registry.register() permissionless dan registry.ballots tak berbatas panjang.
 * Spec 14.6 sudah menandai ini: alamat sampah yang tidak resolve akan
 * memperlambat Overview bila tidak dibatasi. Yang dipotong adalah EKOR daftar,
 * yaitu yang PALING LAMA karena List memakai pushFront — jadi ballot terbaru
 * selalu terbaca.
 */
const MAKS_BALLOT = 48;

/**
 * Berapa ballot yang riwayat aksinya benar-benar diambil DAN didekode.
 *
 * Setiap aksi membawa `state` ~11,5 KB dan menuntut satu dekode WASM. Mengambil
 * lima aksi untuk 48 ballot berarti 240 dekode untuk panel yang menampilkan tiga
 * baris. Yang dipilih adalah alamat PALING DEPAN di registry.ballots — yaitu yang
 * PALING BARU didaftarkan, karena List memakai pushFront — sehingga panel Recent
 * activity memang berisi yang terbaru.
 *
 * Biayanya digerbangi Task 5 Step 7 dengan anggaran yang perintah itu hitung
 * sendiri dari ukuran WASM terpasang.
 */
const MAKS_BALLOT_BERAKSI = 6;

function potong<T>(arr: T[], n: number): T[][] {
  const keping: T[][] = [];
  for (let i = 0; i < arr.length; i += n) keping.push(arr.slice(i, i + n));
  return keping;
}

/** Cuplikan ledger pada satu aksi. Hanya bidang yang spec 9.4 minta diselisihkan. */
type Cuplikan = Partial<Record<PerubahanAksi["bidang"], number>>;

function cuplikanBallot(stateHex: string, alamat: string): Cuplikan | null {
  try {
    const k = dekodeBallot(stateHex, alamat);
    return {
      voteCount: k.voteCount,
      talliedCount: k.talliedCount,
      registeredCount: k.registeredCount,
      phase: k.phase,
    };
  } catch {
    // State satu aksi boleh saja tidak terbaca tanpa membuat aksinya hilang:
    // barisnya tetap tampil, hanya tanpa selisih.
    return null;
  }
}

function cuplikanRegistry(stateHex: string, alamat: string): Cuplikan | null {
  try {
    return { count: dekodeRegistry(stateHex, alamat).count };
  } catch {
    return null;
  }
}

/**
 * Mengubah daftar aksi mentah menjadi aksi yang SUDAH DIDEKODE dan diselisihkan.
 *
 * `mentah` datang dari indexer dengan urutan TERBARU DI DEPAN. Selisih untuk
 * aksi ke-i dihitung terhadap aksi ke-(i+1), yaitu pendahulunya. Aksi paling tua
 * di dalam jendela tidak punya pendahulu yang terbaca, dan itu DINYATAKAN lewat
 * `pendahuluTerbaca: false` alih-alih dilaporkan sebagai "tidak ada perubahan".
 */
function keAksiTerbaca(
  mentah: AksiKontrak[],
  alamat: string,
  sumber: string,
  ambilCuplikan: (stateHex: string, alamat: string) => Cuplikan | null,
): AksiTerbaca[] {
  const cuplikan = mentah.map(a => ambilCuplikan(a.state, alamat));
  return mentah.map((a, i) => {
    const kini = cuplikan[i];
    const lalu = cuplikan[i + 1] ?? null;
    const perubahan: PerubahanAksi[] = [];
    if (kini && lalu) {
      for (const bidang of Object.keys(kini) as PerubahanAksi["bidang"][]) {
        const dari = lalu[bidang];
        const ke = kini[bidang];
        if (dari !== undefined && ke !== undefined && dari !== ke) perubahan.push({ bidang, dari, ke });
      }
    }
    return {
      jenis: a.__typename,
      entryPoint: a.entryPoint ?? null,
      txHash: a.transaction.hash,
      height: a.transaction.block.height,
      timestampMs: a.transaction.block.timestamp,
      sumber,
      perubahan,
      pendahuluTerbaca: kini !== null && lalu !== null,
      cuplikanTerbaca: kini !== null,
      // `state` mentah TIDAK diteruskan. Ia sudah dipakai habis di sini; membawanya
      // lebih jauh berarti ~11,5 KB per aksi menggantung di memori React tanpa
      // satu pun pembaca.
    };
  });
}

export async function bacaRantai(opsi: {
  jaringan?: JaringanAktif;
  signal?: AbortSignal;
  ambil?: typeof fetch;
} = {}): Promise<HasilRantai> {
  const jaringan = opsi.jaringan ?? jaringanAktif();
  const { signal, ambil } = opsi;
  const url = jaringan.indexer;

  // ── POST 1: registry ────────────────────────────────────────────────────
  const j1 = await postGraphQL<{ r: KontrakTerbaca | null }>({
    url,
    query: KUERI_REGISTRY,
    variables: { a: jaringan.alamatRegistry },
    signal,
    ambil,
  });
  if (j1.data.r === null) {
    // BUKAN "tidak ada ballot". Hampir selalu berarti alamat benar tetapi
    // jaringannya salah — diverifikasi: alamat registry mengembalikan null di
    // preprod dan objek terisi di preview.
    //
    // Sebabnya "registry-hilang", BUKAN "graphql-fatal". Keduanya sempat sama,
    // dan akibatnya setiap kegagalan GraphQL apa pun — termasuk galat skema
    // seperti `Unknown field` — dilaporkan ke pengguna sebagai "Registry not
    // found on this network", mengirimnya memeriksa variabel lingkungan yang
    // sebenarnya benar.
    throw new GalatRantai(
      "registry-hilang",
      // rincian adalah TEKS UI — ditulis Inggris; lihat komentar di GalatRantai.
      `No contract exists at registry address ${jaringan.alamatRegistry} on the ${jaringan.networkId} network.`,
      new URL(url).host,
    );
  }
  const registryTerbaca = j1.data.r;
  const reg = dekodeRegistry(registryTerbaca.state, jaringan.alamatRegistry);
  // Registry SELALU memakai fragmen penuh, jadi `terbaru` pasti ada. `?? []`
  // hanya menjaga tipe; kalau ia pernah benar-benar kosong, panel Recent
  // activity kehilangan baris registry dan tidak ada yang lain yang rusak.
  const aksiRegistry = keAksiTerbaca(
    registryTerbaca.terbaru ?? [],
    jaringan.alamatRegistry,
    "Registry",
    cuplikanRegistry,
  );

  // ── Saring alamat sebelum dikirim ───────────────────────────────────────
  const gagal: BallotGagal[] = [];
  const dipakai: string[] = [];
  for (const a of reg.alamat.slice(0, MAKS_BALLOT)) {
    if (alamatKontrakValid(a)) dipakai.push(a);
    else
      gagal.push({
        alamat: a,
        sebab: "alamat-tak-sah",
        pesan: "Entri registry ini bukan alamat kontrak yang sah, jadi tidak pernah dikirim ke indexer.",
      });
  }
  if (reg.alamat.length > MAKS_BALLOT) {
    gagal.push({
      alamat: `+${reg.alamat.length - MAKS_BALLOT}`,
      sebab: "alamat-tak-sah",
      pesan: `Registry memuat ${reg.alamat.length} entri; hanya ${MAKS_BALLOT} terbaru yang dibaca.`,
    });
  }

  // ── POST 2: seluruh ballot, dipotong bila perlu ─────────────────────────
  const ballot: BallotTerbaca[] = [];
  // Berapa alamat yang sudah mendapat riwayat aksi, dihitung LINTAS keping:
  // jendela MAKS_BALLOT_BERAKSI adalah jendela global atas `dipakai`, bukan
  // jendela per keping. Tanpa hitungan ini, registry dengan 30 ballot akan
  // mengambil riwayat dua kali lipat.
  let sudahBerAksi = 0;
  for (const keping of potong(dipakai, MAKS_ALAMAT_PER_DOKUMEN)) {
    const berAksiDiKeping = Math.max(0, Math.min(keping.length, MAKS_BALLOT_BERAKSI - sudahBerAksi));
    sudahBerAksi += berAksiDiKeping;
    const variables = Object.fromEntries(keping.map((a, i) => [`a${i}`, a]));
    const j2 = await postGraphQL<Record<string, KontrakTerbaca | null>>({
      url,
      query: susunKueriBallot(keping.length, berAksiDiKeping),
      variables,
      signal,
      ambil,
    });
    for (let i = 0; i < keping.length; i++) {
      const alamat = keping[i];
      const kunci = `b${i}`;
      // Kunci yang HILANG dan kunci yang null adalah dua hal berbeda, dan
      // keduanya diverifikasi terhadap indexer sungguhan.
      if (!(kunci in j2.data)) {
        gagal.push({
          alamat,
          sebab: "alias-hilang",
          pesan:
            j2.errors.map(e => e.message).join("; ") ||
            "Indexer tidak mengembalikan bidang untuk alamat ini.",
        });
        continue;
      }
      const k = j2.data[kunci];
      if (k === null) {
        gagal.push({
          alamat,
          sebab: "kontrak-null",
          pesan: `Tidak ada kontrak pada alamat ini di jaringan ${jaringan.networkId}.`,
        });
        continue;
      }
      try {
        const keadaan = dekodeBallot(k.state, alamat);
        ballot.push({
          alamat,
          keadaan,
          // Registry permissionless: entri yang terdaftar tapi bukan ballot bisa
          // saja tidak punya ContractDeploy yang terbaca. 0 adalah penanda
          // "tidak diketahui", dan penomoran di ke-ballot.ts menaruhnya di belakang.
          deployHeight: k.deploy[0]?.transaction.block.height ?? 0,
          // `k.terbaru` HANYA ada pada alias yang memakai ...Penuh. Untuk sisanya
          // kuncinya tidak muncul sama sekali, dan larik kosong di sini berarti
          // "tidak diambil" — bukan "tidak ada aksi".
          aksi: k.terbaru
            ? keAksiTerbaca(k.terbaru, alamat, keadaan.title, cuplikanBallot)
            : [],
        });
      } catch (e) {
        // Inilah saringan yang registry.compact minta dilakukan di sisi klien.
        gagal.push({
          alamat,
          sebab: "dekode",
          pesan: e instanceof GalatRantai ? e.rincian : String(e),
        });
      }
    }
  }

  // ── POST 3: keadaan jaringan. TIDAK PERNAH menggagalkan pembacaan ──────
  let blok = { height: 0, timestampMs: 0 };
  let epoch: HasilRantai["epoch"] = null;
  try {
    const j3 = await postGraphQL<JawabanJaringan>({ url, query: KUERI_JARINGAN, signal, ambil });
    blok = { height: j3.data.block.height, timestampMs: j3.data.block.timestamp };
    epoch = j3.data.currentEpochInfo;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    // Kartu network status adalah hiasan yang berguna; daftar ballot adalah
    // isinya. Jatuh ke tinggi blok tertinggi yang terlihat di aksi kontrak —
    // masih dibaca dari rantai, bukan ditebak.
    const semuaAksi = [...aksiRegistry, ...ballot.flatMap(b => b.aksi)];
    for (const a of semuaAksi) {
      if (a.height > blok.height) blok = { height: a.height, timestampMs: a.timestampMs };
    }
  }

  return {
    jaringan,
    registry: { count: reg.count, alamat: reg.alamat, aksi: aksiRegistry },
    ballot,
    gagal,
    blok,
    epoch,
    // Jam RANTAI, bukan jam perangkat — lihat komentar pada tipe HasilRantai.
    // Bila keduanya tidak tersedia sama sekali (registry tanpa satu aksi pun),
    // barulah jam perangkat dipakai, dan itu dicatat sebagai keadaan terburuk.
    sekarangMs: blok.timestampMs > 0 ? blok.timestampMs : Date.now(),
  };
}
```

- [ ] **Step 4: Tulis `client/src/lib/chain/index.ts`**

```typescript
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
export { padatkanTallies } from "./dekode";
export type { KeadaanBallot, FaseBallot } from "./dekode";
export { bacaRantai } from "./baca-rantai";
export type { HasilRantai, BallotTerbaca, BallotGagal, AksiTerbaca, PerubahanAksi } from "./baca-rantai";
export type { BlokAksi } from "./kueri";
```

**Catatan yang mengikat, dan yang mudah dilanggar tanpa sadar:** docstring di kepala berkas ini **tidak boleh menyebut nama operasi tulis**. Gerbang `batas-bundel.test.ts` di Task 9 mengassert bahwa `index.ts` — setelah komentarnya dibuang — tidak memuat `castVote`, `tallyVote`, `createBallot`, maupun `finalize`. Versi pertama docstring di atas menyebut keempatnya dan karena itu **memerahkan gerbangnya sendiri**. Kalimat "Jalur TULIS … adalah C-2b" sengaja ditulis tanpa mendaftar nama-nama itu; daftarnya hidup di `jalur-tulis.ts`, yang memang bukan permukaan publik baca.

- [ ] **Step 5: Tulis `client/src/lib/chain/baca-rantai.test.ts`**

`fetch` palsu diberi makan fixture yang direkam Task 4, lalu **dimodifikasi** untuk membentuk kegagalan yang tidak bisa dipesan dari rantai sungguhan.

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GalatRantai } from "./graphql";
import { bacaRantai } from "./baca-rantai";
import type { JaringanAktif } from "./endpoint";

const DIR = new URL("../../test/fixture-rantai/", import.meta.url);
const baca = (n: string) => JSON.parse(readFileSync(new URL(n, DIR), "utf8"));
const fxRegistry = baca("registry.json");
const fxBallots = baca("ballots.json");
const fxJaringan = baca("jaringan.json");
const meta = baca("meta.json");

const JARINGAN: JaringanAktif = {
  networkId: meta.jaringan,
  indexer: meta.endpoint,
  indexerWS: "wss://contoh.test/ws",
  alamatRegistry: meta.alamatRegistry,
};

/**
 * fetch palsu yang memilih jawaban menurut nama operasi di dokumen.
 * `ubah` memungkinkan tiap uji merusak satu jawaban tanpa menyalin fixture.
 *
 * Ia juga MEMANGKAS jawaban agar sesuai dokumen yang benar-benar dikirim.
 * Fixture merekam SUPERSET — `terbaru` ada pada setiap ballot — supaya menyetel
 * MAKS_BALLOT_BERAKSI tidak menuntut rekam ulang. Tanpa pemangkasan ini, uji
 * akan melihat riwayat aksi pada ballot yang aplikasinya TIDAK MEMINTANYA, dan
 * gerbang jendela biaya berhenti menggigit.
 */
function pangkasMenurutDokumen(query: string, jawaban: any): any {
  if (!/query Ballots/.test(query) || !jawaban?.data) return jawaban;
  for (const [alias, isi] of Object.entries(jawaban.data as Record<string, any>)) {
    if (!isi) continue;
    // Indexer menghilangkan kunci `terbaru` sepenuhnya pada alias ...Ringkas —
    // diverifikasi terhadap indexer sungguhan. Ditiru apa adanya di sini.
    const memakaiPenuh = new RegExp(`\\b${alias}:\\s*contract\\([^)]*\\)\\s*\\{\\s*\\.\\.\\.Penuh\\s*\\}`).test(query);
    if (!memakaiPenuh) delete isi.terbaru;
  }
  return jawaban;
}

function ambilPalsu(ubah: (nama: string, jawaban: any) => any = (_n, j) => j): typeof fetch {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
    const asli =
      nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
    const jawaban = ubah(nama, pangkasMenurutDokumen(body.query, structuredClone(asli)));
    return new Response(JSON.stringify(jawaban), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("bacaRantai — jalur sehat", () => {
  it("membaca registry, seluruh ballot, dan keadaan jaringan dalam tiga POST", async () => {
    const ambil = ambilPalsu();
    const h = await bacaRantai({ jaringan: JARINGAN, ambil });
    // Nilai DITURUNKAN dari fixture; tidak ada angka yang diketik di sini.
    expect(h.registry.alamat).toEqual(fxBallots.alamat);
    expect(h.ballot).toHaveLength(fxBallots.alamat.length);
    expect(h.gagal).toEqual([]);
    expect(h.blok.height).toBe(fxJaringan.data.block.height);
    expect(h.sekarangMs).toBe(fxJaringan.data.block.timestamp);
    expect(h.epoch?.epochNo).toBe(fxJaringan.data.currentEpochInfo.epochNo);
    // Tepat tiga POST: satu registry, satu ballot (fixture di bawah batas keping), satu jaringan.
    expect((ambil as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(3);
  });

  it("memakai jam RANTAI sebagai sekarangMs, bukan jam perangkat", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    expect(h.sekarangMs).toBe(fxJaringan.data.block.timestamp);
    expect(h.sekarangMs).not.toBe(Date.now());
  });

  it("membawa deployHeight untuk setiap ballot — sumber nomor urut yang stabil", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    for (const b of h.ballot) expect(b.deployHeight).toBeGreaterThan(0);
  });

  it("MENDEKODE state setiap aksi dan menghasilkan selisih — Recent activity DIBACA, bukan disimpulkan", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    const semua = [...h.registry.aksi, ...h.ballot.flatMap(b => b.aksi)];
    expect(semua.length).toBeGreaterThan(0);

    // Bentuknya: state MENTAH tidak pernah sampai ke sini. Kalau ia masih ada,
    // berarti ~11,5 KB per aksi dibawa tanpa pembaca — dan klaim "dibaca" palsu.
    for (const a of semua) {
      expect(a).not.toHaveProperty("state");
      expect(typeof a.height).toBe("number");
      expect(typeof a.cuplikanTerbaca).toBe("boolean");
    }

    // Isinya: SEKURANG-KURANGNYA satu aksi punya selisih yang benar-benar
    // dihitung. Tanpa assert ini, seluruh jalur dekode boleh gagal diam-diam dan
    // panelnya kembali jadi label dari entryPoint.
    const berselisih = semua.filter(a => a.perubahan.length > 0);
    expect(berselisih.length).toBeGreaterThan(0);

    // Dan setiap selisih benar-benar selisih: dari ≠ ke, pada bidang yang dikenal.
    for (const a of berselisih) {
      for (const p of a.perubahan) {
        expect(["voteCount", "talliedCount", "registeredCount", "phase", "count"]).toContain(p.bidang);
        expect(p.dari).not.toBe(p.ke);
      }
    }
  });

  it("menyatakan pendahulu yang TIDAK terbaca alih-alih melaporkannya sebagai tanpa perubahan", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    for (const daftar of [h.registry.aksi, ...h.ballot.map(b => b.aksi)]) {
      if (daftar.length === 0) continue;
      // Aksi paling tua di dalam jendela actions(limit: 5) tidak punya pendahulu
      // di dalam jendela itu. Ia WAJIB mengaku, bukan berbunyi "no change".
      const palingTua = daftar[daftar.length - 1];
      expect(palingTua.pendahuluTerbaca).toBe(false);
      expect(palingTua.perubahan).toEqual([]);
    }
  });

  it("HANYA mengambil riwayat aksi untuk ballot di dalam jendela, dan tidak berpura-pura untuk sisanya", async () => {
    const ambil = ambilPalsu();
    const h = await bacaRantai({ jaringan: JARINGAN, ambil });
    // Dokumen Ballots memakai ...Penuh hanya untuk alias terdepan. Diturunkan
    // dari dokumen yang benar-benar dikirim, bukan dari konstanta yang diketik.
    const panggilan = (ambil as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const dok = panggilan.map(([, init]) => JSON.parse(String(init.body))).find(b => /query Ballots/.test(b.query));
    const nPenuh = (String(dok.query).match(/\.\.\.Penuh/g) ?? []).length;
    // Ballot yang memakai ...Ringkas tidak punya aksi sama sekali — dan itu
    // "tidak diambil", bukan "tidak ada aksi".
    const nBerAksi = h.ballot.filter(b => b.aksi.length > 0).length;
    expect(nBerAksi).toBeLessThanOrEqual(nPenuh);
  });
});

describe("bacaRantai — kegagalan SEBAGIAN tetap menampilkan sisanya", () => {
  it("mencatat alias yang HILANG tanpa menghapus ballot lain", async () => {
    const h = await bacaRantai({
      jaringan: JARINGAN,
      ambil: ambilPalsu((nama, j) => {
        if (nama !== "Ballots") return j;
        // Bentuk yang diverifikasi terhadap indexer sungguhan: kunci alias yang
        // gagal HILANG dari data, dan errors terisi. Ia tidak bernilai null.
        delete j.data.b0;
        j.errors = [{ message: "invalid address: cannot hex-decode: odd number of digits" }];
        return j;
      }),
    });
    expect(h.ballot).toHaveLength(fxBallots.alamat.length - 1);
    expect(h.gagal.map(g => g.sebab)).toContain("alias-hilang");
  });

  it("membedakan kontrak-null dari alias-hilang", async () => {
    const h = await bacaRantai({
      jaringan: JARINGAN,
      ambil: ambilPalsu((nama, j) => {
        if (nama !== "Ballots") return j;
        j.data.b0 = null;
        return j;
      }),
    });
    expect(h.gagal.map(g => g.sebab)).toContain("kontrak-null");
  });

  it("mencatat state yang gagal didekode tanpa menjatuhkan pembacaan", async () => {
    const h = await bacaRantai({
      jaringan: JARINGAN,
      ambil: ambilPalsu((nama, j) => {
        if (nama !== "Ballots") return j;
        // State registry yang dipaksa masuk sebagai ballot: bentuk kegagalan yang
        // PERSIS dialami entri sampah di registry.
        j.data.b0.state = fxRegistry.data.r.state;
        return j;
      }),
    });
    expect(h.ballot).toHaveLength(fxBallots.alamat.length - 1);
    expect(h.gagal.find(g => g.sebab === "dekode")).toBeDefined();
  });

  it("TIDAK pernah mengirim alamat yang bukan hex ke indexer", async () => {
    const ambil = ambilPalsu((nama, j) => {
      if (nama !== "Registry") return j;
      // Sisipkan entri sampah ke state registry mustahil tanpa menulis ulang
      // ledger, jadi yang diuji di sini adalah saringannya lewat jalur lain:
      // lihat endpoint.test.ts untuk alamatKontrakValid. Di sini dipastikan
      // dokumen Ballots tidak pernah memuat string non-hex.
      return j;
    });
    await bacaRantai({ jaringan: JARINGAN, ambil });
    const panggilan = (ambil as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const dokBallot = panggilan.map(([, init]) => JSON.parse(String(init.body))).find(b => /query Ballots/.test(b.query));
    for (const nilai of Object.values(dokBallot.variables as Record<string, string>)) {
      expect(nilai).toMatch(/^[0-9a-fA-F]+$/);
    }
  });
});

describe("bacaRantai — kegagalan TOTAL", () => {
  it("melempar ketika registry tidak ditemukan, dengan pesan yang menyebut jaringan", async () => {
    const ambil = ambilPalsu((nama, j) => (nama === "Registry" ? { data: { r: null }, errors: [] } : j));
    await expect(bacaRantai({ jaringan: JARINGAN, ambil })).rejects.toThrow(
      new RegExp(`No contract exists at registry address .* on the ${JARINGAN.networkId} network`),
    );
  });

  it("melempar GalatRantai bersebab jaringan ketika fetch menolak", async () => {
    const ambil = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(bacaRantai({ jaringan: JARINGAN, ambil })).rejects.toMatchObject({
      sebab: "jaringan",
    });
  });
});

describe("bacaRantai — POST 3 TIDAK PERNAH menjatuhkan pembacaan", () => {
  it("tetap mengembalikan ballot ketika kueri jaringan gagal, dengan epoch null", async () => {
    const ambil = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
      if (nama === "Jaringan") return new Response("upstream down", { status: 502, headers: { "content-type": "text/plain" } });
      const asli = nama === "Registry" ? fxRegistry : fxBallots.jawaban;
      return new Response(JSON.stringify(asli), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const h = await bacaRantai({ jaringan: JARINGAN, ambil });
    expect(h.ballot).toHaveLength(fxBallots.alamat.length);
    expect(h.epoch).toBeNull();
    // Tinggi blok jatuh ke yang tertinggi di antara aksi kontrak — DIBACA dari
    // rantai, bukan ditebak, dan bukan nol.
    expect(h.blok.height).toBeGreaterThan(0);
    expect(h.sekarangMs).toBe(h.blok.timestampMs);
  });
});
```

- [ ] **Step 6: Tulis pemeriksaan jaringan sungguhan yang BOLEH dilewati**

Ia mengassert **bentuk dan monotonisitas**, tidak pernah nilai. Itu yang membuatnya tetap benar besok.

`client/src/lib/chain/jaringan-nyata.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bacaRantai } from "./baca-rantai";
import type { JaringanAktif } from "./endpoint";

const meta = JSON.parse(
  readFileSync(new URL("../../test/fixture-rantai/meta.json", import.meta.url), "utf8"),
);

const JARINGAN: JaringanAktif = {
  networkId: meta.jaringan,
  indexer: meta.endpoint,
  indexerWS: "",
  alamatRegistry: meta.alamatRegistry,
};

/**
 * Menyentuh indexer SUNGGUHAN. Dilewati kecuali diminta:
 *
 *   VOTEPRIV_UJI_JARINGAN=1 pnpm test client/src/lib/chain/jaringan-nyata.test.ts
 *
 * Tidak satu pun assert di sini menyebut NILAI. Data nyata berubah — tinggi
 * blok naik tiap 6 detik, ballot bisa bertambah, fase bergerak — jadi uji
 * bernilai adalah uji yang merah menurut hari, bukan menurut kode.
 *
 * Yang diassert: bentuk, invarian kontrak, dan MONOTONISITAS terhadap rekaman.
 * Tinggi blok tidak pernah mundur; kalau ia mundur, yang salah bukan uji ini.
 */
describe.skipIf(!process.env.VOTEPRIV_UJI_JARINGAN)("rantai sungguhan", () => {
  it("membaca registry dan ballot dari indexer yang hidup", { timeout: 30_000 }, async () => {
    const h = await bacaRantai({ jaringan: JARINGAN });

    // Monotonisitas: tinggi blok tidak pernah mundur dari saat fixture direkam.
    expect(h.blok.height).toBeGreaterThanOrEqual(meta.tinggiBlok);

    // Registry tidak pernah menyusut: register() hanya pushFront dan increment.
    expect(h.registry.count).toBeGreaterThanOrEqual(meta.jumlahBallot);

    // Setiap ballot yang berhasil dibaca memenuhi invarian constructor kontrak.
    for (const b of h.ballot) {
      expect(b.keadaan.optionCount).toBeGreaterThanOrEqual(2);
      expect(b.keadaan.optionCount).toBeLessThanOrEqual(4);
      expect(b.keadaan.tallyDeadlineDetik).toBeGreaterThan(b.keadaan.voteDeadlineDetik);
      expect(b.keadaan.talliedCount).toBeLessThanOrEqual(b.keadaan.voteCount);
      expect(b.keadaan.registeredCount).toBeLessThanOrEqual(b.keadaan.eligibleCount);
      expect(b.deployHeight).toBeGreaterThan(0);
    }

    // Setiap kegagalan sebagian punya sebab yang dikenal — tidak ada kategori
    // "lain-lain" yang menyembunyikan bentuk kegagalan baru.
    for (const g of h.gagal) {
      expect(["alamat-tak-sah", "alias-hilang", "kontrak-null", "dekode"]).toContain(g.sebab);
    }
  });
});
```

- [ ] **Step 7: Ukur biaya `terbaru: actions(limit: 5)` dan `MAKS_BALLOT_BERAKSI` terhadap anggaran yang dihitung sendiri**

Angka `5` di `FRAGMEN_PENUH` dan `MAKS_BALLOT_BERAKSI` di `baca-rantai.ts` adalah keputusan biaya, dan keputusan biaya diperiksa dengan pengukuran. Perintah ini menghitung anggarannya sendiri dari ukuran state satu kontrak, sehingga tidak ada angka yang bisa basi.

Dua biaya yang berbeda diukur, dan keduanya diturunkan dari fixture yang sama: **bandwidth** (jawaban POST 2 di kawat) dan **dekode** (berapa banyak `state` aksi yang harus melewati WASM).

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
const DIR = "client/src/test/fixture-rantai";
const b = JSON.parse(readFileSync(`${DIR}/ballots.json`, "utf8"));
const mentahB = Buffer.byteLength(JSON.stringify(b.jawaban));
const gz = gzipSync(Buffer.from(JSON.stringify(b.jawaban))).length;
const satuState = b.jawaban.data.b0.state.length / 2;
// `terbaru` HANYA ada pada alias yang memakai ...Penuh; untuk sisanya kuncinya
// tidak muncul sama sekali. Dihitung defensif supaya perintah ini tidak mati
// pada fixture yang direkam dengan MAKS_BALLOT_BERAKSI lebih kecil.
const jumlahAksi = Object.values(b.jawaban.data).reduce((s, k) => s + (k?.terbaru?.length ?? 0), 0);
const jumlahBerAksi = Object.values(b.jawaban.data).filter(k => k?.terbaru).length;
console.log("jumlah ballot            :", b.alamat.length);
console.log("ballot dengan riwayat    :", jumlahBerAksi);
console.log("jumlah aksi ber-state    :", jumlahAksi);
console.log("dekode WASM per muat     :", jumlahAksi + b.alamat.length + 1, "(aksi + state kini + registry)");
console.log("satu state kontrak (B)   :", satuState);
console.log("jawaban POST 2 mentah (B):", mentahB);
console.log("jawaban POST 2 gzip (B)  :", gz);
console.log("rasio gzip               :", (mentahB / gz).toFixed(1) + "x");
// Anggaran DITURUNKAN: di kawat, POST 2 tidak boleh melampaui ukuran satu WASM
// baca. Bila ia melampauinya, turunkan MAKS_BALLOT_BERAKSI di baca-rantai.ts
// atau limit pada terbaru: di kueri.ts.
// Entri paket, BUKAN subpath ./package.json — lihat Task 2 Step 2.
const { createRequire } = await import("node:module");
const path = (await import("node:path")).default;
const req = createRequire(process.cwd() + "/pkgs/contract/package.json");
const req2 = createRequire(req.resolve("@midnight-ntwrk/compact-runtime"));
const wasmDir = path.dirname(req2.resolve("@midnight-ntwrk/onchain-runtime-v3"));
const wasmB = statSync(path.join(wasmDir, "midnight_onchain_runtime_wasm_bg.wasm")).size;
console.log("anggaran (ukuran wasm, B):", wasmB);
if (gz > wasmB) throw new Error("POST 2 di kawat melampaui anggaran — turunkan MAKS_BALLOT_BERAKSI atau limit pada terbaru: actions(limit: N) di kueri.ts");
console.log("LULUS");
'
```

Diharapkan: baris terakhir `LULUS`, dan `rasio gzip` jauh di atas 1 — itulah alasan satu dokumen beralias lebih murah daripada satu POST per ballot.

Bila gagal, turunkan **`MAKS_BALLOT_BERAKSI`** di `baca-rantai.ts`, atau `limit` pada `terbaru:` di `kueri.ts`, lalu jalankan ulang.

**Jangan menghapus `state` dari aksi.** Itu bukan penghematan melainkan pencabutan fitur: tanpa `state`, tidak ada cuplikan ledger, tanpa cuplikan tidak ada selisih, dan tanpa selisih panel Recent activity kembali menjadi label yang disimpulkan dari nama entry point — yang bukan yang §9.4 minta. Kalau biayanya benar-benar tidak terjangkau, yang benar adalah **menurunkan jumlah ballot yang punya riwayat sampai nol dan hanya menyisakan registry** — panel lalu menampilkan lebih sedikit baris, tetapi setiap baris yang ditampilkan tetap benar-benar dibaca.

Perhatikan juga baris `dekode WASM per muat`: itu berapa kali `ledger()` dipanggil pada satu kali muat halaman. Nilai wajar berada di bawah beberapa puluh; kalau ia sudah mencapai ratusan, `MAKS_BALLOT_BERAKSI` terlalu besar, apa pun kata gerbang bandwidth.

- [ ] **Step 8: Jalankan seluruh uji, lalu pemeriksaan jaringan sekali secara manual**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm check:uji
pnpm test 2>&1 | tail -12
VOTEPRIV_UJI_JARINGAN=1 pnpm test client/src/lib/chain/jaringan-nyata.test.ts 2>&1 | tail -12
```

Diharapkan: `pnpm test` hijau dengan `jaringan-nyata.test.ts` **dilewati**; perintah kedua menjalankannya dan hijau. Bila perintah kedua merah karena jaringan sedang tidak sehat, itu **bukan** alasan mengubah kode — jalankan ulang nanti; ia memang uji yang boleh dilewati.

- [ ] **Step 9: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/lib/chain
git commit -m "feat(chain): tiga POST indexer dan orkestrasi bacaRantai baca-saja

Seluruh 15 baris pemetaan spec 9.4 didapat dengan tiga POST dan NOL wallet.

Kegagalan per-ballot masuk ke gagal[] dan TIDAK menjatuhkan pembacaan: alamat
tak sah disaring sebelum dikirim, alias yang hilang dibedakan dari kontrak null,
dan state yang gagal didekode dicatat per alamat. Yang menghentikan pembacaan
hanya registry yang tidak ditemukan dan kegagalan transport — karena tanpa
registry memang tidak ada apa pun untuk ditampilkan.

sekarangMs diambil dari stempel waktu BLOK, bukan jam perangkat: kontrak
memutuskan sah-tidaknya castVote terhadap waktu blok, sehingga jam perangkat
yang melenceng akan membuat UI berkata Live now pada ballot yang kontraknya
sudah menolak.

Nomor urut stabil bersandar pada actions(limit: 1, type: DEPLOY), bukan pada
elemen terakhir daftar aksi: ballot ramai mendorong ContractDeploy keluar dari
limit berapa pun yang wajar.

Recent activity: state per aksi BENAR-BENAR didekode dan diselisihkan, bukan
diambil lalu dibuang. Versi pertama rancangan ini membayar bandwidth untuk
field state, memakai hanya entryPoint, dan tetap mengklaim dibaca dari
snapshot ledger. Sekarang setiap baris membawa selisih nyata
(voteCount 2 -> 3) atau MENGAKU bahwa pendahulunya di luar jendela yang
dibaca. Biayanya dibatasi MAKS_BALLOT_BERAKSI dan dua fragmen GraphQL,
sehingga ballot yang riwayatnya tidak ditampilkan juga tidak diambil.

Sebab registry-hilang dipisah dari graphql-fatal. Keduanya sempat sama, dan
akibatnya setiap galat skema indexer dilaporkan sebagai registry yang salah
jaringan — menyuruh pembaca memeriksa VITE_MIDNIGHT_NETWORK yang benar."
```

**Deliverable:** satu fungsi yang mengubah tiga POST menjadi satu `HasilRantai` dengan kegagalan sebagian yang eksplisit; pemeriksaan jaringan sungguhan yang boleh dilewati dan tidak pernah mengassert nilai; anggaran biaya kueri yang dihitung sendiri.

---

### Task 6: Pemetaan §9.4 ke `Ballot`, dan status lima nilai

Task ini menutup **keempat jebakan sekaligus**, karena keempatnya bertemu di satu fungsi pemetaan.

Tabel §9.4 dipenuhi baris demi baris di sini, dan dua baris yang §14.6 tandai sebagai "tidak punya sumber" ditutup secara eksplisit:

| Baris §9.4 | Sumber |
|---|---|
| Daftar ballot | `registry.ballots`, tiap alamat di-query state kontraknya |
| Judul, deskripsi, komunitas, opsi | field `sealed`, opsi dipotong menurut `optionCount` |
| `votes` | `voteCount` |
| `eligible` | `eligibleCount` |
| `quorum` | `quorumPercent` — **niat yang dinyatakan, bukan ambang** |
| Keterangan siapa yang berhak | `eligibilityPolicy` |
| `deadline` | `voteDeadline`, diformat UTC |
| `status` | `phase` **digabung waktu dinding** terhadap kedua deadline (J1) |
| `accent`, `tag` | diturunkan di klien dari hash alamat dan status |
| Metrik "Active ballots" | dihitung dari **status turunan**, bukan dari `phase` |
| Metrik "Verified votes" | jumlah `voteCount` seluruh ballot |
| Metrik "Privacy score" | tetap — pernyataan desain, bukan hasil pengukuran |
| Kartu network status | `block.height` + `currentEpochInfo`; finality **tidak dikarang** |
| Recent activity | aksi kontrak beserta snapshot `state`-nya |
| Persentase di Results | `tallies` **yang sudah dipadatkan** (J3) |
| *§14.6:* `Ballot.id` | alamat kontrak — satu-satunya identitas on-chain |
| *§14.6:* nomor urut tampilan | tinggi blok `ContractDeploy`, urut naik (J2) |

**Files:**
- Create: `client/src/lib/chain/ke-ballot.ts`
- Modify: `client/src/components/votepriv/types.ts`, `client/src/components/votepriv/ballot-status.ts`, `client/src/components/votepriv/ballot-status.test.ts`
- Test: `client/src/lib/chain/ke-ballot.test.ts`, `client/src/components/votepriv/ballot-status.test.ts`

**Interfaces:**
- Consumes: `./baca-rantai` (`HasilRantai`, `BallotTerbaca`), `./dekode` (`padatkanTallies`), `@/components/votepriv/types` (`Ballot`, `BallotStatus`), `@/components/votepriv/ballot-status` (`turunkanStatus`, `statusTag`)
- Produces — **daftar ini adalah kontrak yang dibaca Task 7 dan Task 8 sebelum kodenya ada; ia sama persis dengan tanda tangan implementasinya, tanpa satu pun yang hilang:**

  Dari `client/src/components/votepriv/types.ts`:
  - `type BallotStatus = "live" | "closing-soon" | "tally-open" | "awaiting-finalize" | "finalized"`
  - `type KeadaanHasil = "ada-hasil" | "tersegel" | "menunggu-pembukaan" | "tidak-ada-yang-dibuka"`
  - `type Ballot` — bertambah `nomor`, `registered`, `tallied`, `eligibilityPolicy`, `voteDeadlineMs`, `tallyDeadlineMs`, `phase`, `deployHeight`, `keadaanHasil`; `tallies` berubah dari `number[] | null` menjadi `number[]`

  Dari `client/src/components/votepriv/ballot-status.ts`:
  - `BATAS_ATAS_TUTUP_SEGERA_MS: number` — batas atas, **bukan** ambangnya sendiri
  - `ambangTutupSegeraMs(k: { voteDeadlineMs: number; tallyDeadlineMs: number }): number`
  - `turunkanStatus(k: { phase: 0|1|2; voteDeadlineMs: number; tallyDeadlineMs: number }, sekarangMs: number): BallotStatus`
  - `statusLabel(status: BallotStatus): string`
  - `statusTone(status: BallotStatus): "" | "closing-soon" | "finalized"`
  - `statusTag(status: BallotStatus): string`
  - `menerimaSuara(status: BallotStatus): boolean` — dipakai `BallotCard`, `LiveBallots`, `Overview`, dan `VoteModal` di Task 8
  - `keadaanHasil(b: { status: BallotStatus; tallied: number }): KeadaanHasil` — dipakai `Results` di Task 8

  Dari `client/src/lib/chain/ke-ballot.ts`:
  - `keBallot(b: BallotTerbaca, konteks: { nomor: number; sekarangMs: number }): Ballot`
  - `keDaftarBallot(hasil: HasilRantai): Ballot[]`
  - `formatDeadlineUtc(ms: number): string`
  - `accentDariAlamat(alamat: string): "mint" | "violet" | "blue"`
  - `labelNomor(nomor: number): string` — dipakai `BallotCard`, `Overview`, dan `VoteModal` di Task 8

**Catatan arah impor.** `client/src/lib/chain/ke-ballot.ts` mengimpor dari `client/src/components/votepriv/`. Arah itu memang tidak lazim untuk `lib/ → components/`, dan dipilih sadar: `types.ts` dan `ballot-status.ts` **tidak mengimpor apa pun** (C-1 membuatnya begitu dengan sengaja), sehingga tidak ada siklus yang mungkin terbentuk, dan `Ballot` adalah tipe domain **UI** — memindahkannya ke `lib/` akan memaksa ketujuh komponen hasil C-1 mengubah impornya untuk keuntungan estetis semata.

- [ ] **Step 1: Tumbuhkan `BallotStatus` dan `Ballot` di `types.ts`**

`client/src/components/votepriv/types.ts` — ganti `type BallotStatus` dan `type Ballot`, biarkan `Section` dan `Receipt` apa adanya:

```typescript
/**
 * Status ballot: LIMA anggota, bukan tiga.
 *
 * Tiga anggota lama ("live" | "closing-soon" | "finalized") tidak punya nilai
 * yang cocok untuk keadaan yang BENAR-BENAR ADA di rantai: sebuah ballot dapat
 * berada di phase = voting sementara KEDUA deadline-nya sudah lewat. UI lama
 * akan berbunyi "Live now" padahal castVote PASTI ditolak kontrak
 * (assert(kernel.blockTimeLessThan(voteDeadline))), dan chip filter akan
 * berbunyi "Live 1" yang BOHONG.
 *
 * Akarnya ada di kontrak dan tidak akan berubah: TRANSISI FASE BERSIFAT MALAS.
 * ballot.compact tidak punya circuit closeVoting; phase berpindah ke tallying
 * hanya ketika pembuka suara PERTAMA memanggil tallyVote(), dan ke finalized
 * hanya ketika seseorang memanggil finalize(). Ballot yang tidak pernah dibuka
 * satu suara pun tinggal di phase = voting SELAMANYA.
 *
 * Karena itu status WAJIB diturunkan dari phase DIGABUNG waktu dinding terhadap
 * voteDeadline/tallyDeadline. Lihat turunkanStatus() di ballot-status.ts.
 */
export type BallotStatus =
  /** Menerima suara. phase = voting DAN belum melewati voteDeadline. */
  | "live"
  /** live, tetapi voteDeadline tinggal sebentar lagi. */
  | "closing-soon"
  /** Pemungutan ditutup, jendela pembukaan suara terbuka: voteDeadline < now < tallyDeadline. */
  | "tally-open"
  /** Kedua deadline lewat tetapi finalize() belum pernah dipanggil. */
  | "awaiting-finalize"
  /** phase = finalized. Satu-satunya penanda finalitas yang eksplisit di on-chain. */
  | "finalized";

/**
 * Keadaan HASIL sebuah ballot. EMPAT nilai, dan keempatnya benar-benar terjadi.
 *
 * `talliedCount === 0` TIDAK berarti "hasil masih tersegel" — ia punya empat
 * sebab yang berbeda artinya bagi pembaca. Dua di antaranya sudah ada di rantai
 * hari ini, jadi ini bukan kehati-hatian teoretis:
 *
 *   - `f597222d…` berstatus awaiting-finalize dengan voteCount 0 dan
 *     talliedCount 0, dan KEDUA deadline-nya (voteDeadline 1789086147,
 *     tallyDeadline 1789088247) sudah lewat. Menampilkan "Results sealed until
 *     the vote deadline" di sana adalah kebohongan yang dapat diperiksa siapa
 *     pun — dan yang hanya makin salah seiring waktu, karena deadline itu tidak
 *     bergerak sementara "sekarang" terus maju.
 *   - satu panggilan finalize() pada ballot yang sama membuatnya `finalized`
 *     dengan talliedCount tetap 0. Menampilkan "tersegel" pada ballot yang
 *     SUDAH FINAL adalah kebalikan dari yang benar.
 *
 * Karena itu keadaan hasil digantung pada STATUS TURUNAN, bukan pada hitungan.
 * Turunannya ada di keadaanHasil() di ballot-status.ts.
 */
export type KeadaanHasil =
  /** Ada suara yang sudah dibuka. Persentase boleh, dan harus, ditampilkan. */
  | "ada-hasil"
  /** Masih menerima suara. Tallies memang belum boleh ada isinya (spec 9.4). */
  | "tersegel"
  /** Pemungutan tutup, jendela pembukaan masih terbuka, belum ada yang membuka. */
  | "menunggu-pembukaan"
  /** Jendela pembukaan tutup (atau sudah final) tanpa satu suara pun dibuka. */
  | "tidak-ada-yang-dibuka";

export type Ballot = {
  /**
   * Alamat kontrak, hex. SATU-SATUNYA identitas yang benar-benar ada di rantai.
   *
   * Spec 14.6 mencatat bahwa Ballot.id tidak punya sumber on-chain; alamatnyalah
   * sumber itu. Dipakai sebagai key React dan sebagai pengenal di mana pun sebuah
   * ballot perlu disebut secara unik.
   */
  id: string;
  /**
   * Nomor urut TAMPILAN, diturunkan dari tinggi blok ContractDeploy (urut naik).
   *
   * BUKAN dari indeks registry: registry.compact memakai ballots.pushFront, jadi
   * indeks 0 adalah yang TERBARU, dan menomori dari indeks akan MENOMORI ULANG
   * ballot lama setiap ada pendaftaran baru.
   *
   * Batas kejujurannya: stabil pada alur normal deploy-lalu-daftar, karena tinggi
   * blok tidak pernah mundur. TIDAK stabil bila seseorang mendaftarkan ballot yang
   * di-deploy jauh sebelumnya. Karena itu nomor ini hanya boleh dipakai sebagai
   * TEKS TAMPILAN — tidak pernah sebagai key, tidak pernah di URL.
   */
  nomor: number;
  title: string;
  description: string;
  community: string;
  /** voteCount: jumlah suara yang diterima kontrak. */
  votes: number;
  /** eligibleCount: batas yang di-seal saat deploy. */
  eligible: number;
  /** registeredCount: credential yang benar-benar sudah diterbitkan admin. */
  registered: number;
  /** talliedCount: suara yang sudah dibuka pemiliknya. voteCount - talliedCount = yang belum. */
  tallied: number;
  /**
   * quorumPercent — INFORMATIF, BUKAN ambang yang ditegakkan kontrak.
   *
   * ballot.compact menyatakannya sendiri: nilai ini ditulis sekali di constructor
   * dan tidak pernah dibaca circuit mana pun. finalize() berhasil pada partisipasi
   * 0% persis seperti pada 100%. UI WAJIB menyebutnya sebagai niat yang dinyatakan
   * pembuat ballot (spec 9.4).
   */
  quorum: number;
  /** eligibilityPolicy: keterangan siapa yang berhak, ditulis pembuat ballot. */
  eligibilityPolicy: string;
  /** Teks tampilan dari voteDeadline, diformat UTC. */
  deadline: string;
  /** voteDeadline dalam MILIDETIK. Ledger menyimpannya dalam DETIK; konversinya di ke-ballot.ts. */
  voteDeadlineMs: number;
  tallyDeadlineMs: number;
  /** phase MENTAH dari ledger. Dipertahankan supaya UI dapat menjelaskan selisihnya dengan status. */
  phase: 0 | 1 | 2;
  status: BallotStatus;
  options: string[];
  /**
   * Tallies yang SUDAH DIPADATKAN, panjangnya SELALU sama dengan options.
   *
   * TIDAK pernah `null`. Bentuk `number[] | null` yang sempat dipakai
   * mengkonflasikan empat keadaan yang berbeda artinya menjadi satu nilai —
   * lihat KeadaanHasil. Yang memutuskan apa yang dirender adalah `keadaanHasil`
   * di bawah, bukan bentuk larik ini.
   *
   * Ketika belum ada suara yang dibuka, isinya larik nol sepanjang options. Itu
   * BUKAN izin menampilkan bar 0% — komponen wajib bercabang pada `keadaanHasil`
   * lebih dulu, dan uji di Task 8 menjaganya.
   */
  tallies: number[];
  /**
   * Keadaan hasil, diturunkan dari `status` DIGABUNG `tallied`.
   *
   * Spec 9.4 menuntut Results membedakan "tersegel" dari "ada hasil"; rantai
   * hari ini menuntut dua lagi, karena ada ballot yang jendela pembukaannya
   * sudah tutup tanpa satu suara pun dibuka. Menyimpannya sebagai field, bukan
   * menghitungnya ulang di tiap komponen, membuat keempat keadaan itu punya
   * satu turunan yang dapat diuji sendiri.
   */
  keadaanHasil: KeadaanHasil;
  accent: string;
  tag: string;
  /** Tinggi blok ContractDeploy. Dipertahankan supaya nomor urut dapat diaudit dari UI. */
  deployHeight: number;
};
```

- [ ] **Step 2: Tulis turunan status di `ballot-status.ts`**

`client/src/components/votepriv/ballot-status.ts` — ganti seluruh isinya:

```typescript
import type { BallotStatus, KeadaanHasil } from "./types";

/**
 * Status, label, tone, dan tag ballot.
 *
 * Dipakai lima komponen — VoteModal, BallotCard, LiveBallots, Results, dan
 * Overview — dan itulah alasan ia jadi modul tersendiri. Berkas ini TIDAK
 * mengimpor apa pun selain tipe, sehingga lapis rantai boleh mengimpornya tanpa
 * membuat siklus.
 *
 * Teks yang dikembalikan statusLabel() dan statusTag() adalah TEKS UI berbahasa
 * Inggris. Jangan diterjemahkan.
 */

/**
 * Batas ATAS ambang "Closing soon". Bukan ambangnya sendiri.
 *
 * Ambang sesungguhnya diturunkan per ballot oleh ambangTutupSegeraMs(); nilai
 * ini hanya menahannya agar tidak menjadi berbulan-bulan pada ballot bertempo
 * panjang.
 */
export const BATAS_ATAS_TUTUP_SEGERA_MS = 24 * 60 * 60 * 1000;

/**
 * Seberapa dekat ke voteDeadline sebelum sebuah ballot disebut "Closing soon",
 * DITURUNKAN dari ballot itu sendiri.
 *
 * MENGAPA BUKAN KONSTANTA. Ambang tetap 24 jam membuat anggota `live` praktis
 * mustahil tercapai pada data yang benar-benar ada: kedua ballot di preview
 * hari ini punya jendela voting ≈60 menit (diukur: 3.593 dan 3.597 detik dari
 * blok deploy ke voteDeadline). Seluruh umur ballot lebih pendek daripada 1/24
 * ambang itu, sehingga setiap ballot berbunyi "Closing soon" sejak detik
 * pertama dan label "Live now" tidak pernah muncul sekali pun.
 *
 * Yang dipakai adalah jendela tally — tallyDeadline − voteDeadline — karena ia
 * satu-satunya rentang yang PEMBUAT BALLOT SENDIRI nyatakan dan yang tersedia
 * bagi fungsi murni ini tanpa pembacaan tambahan. Jendela voting sesungguhnya
 * (deploy → voteDeadline) menuntut tinggi blok deploy, yang tidak ada di ledger.
 *
 * Pada ballot 60 menit hari ini: 35 menit, sehingga "Live now" tampil ≈25 menit
 * pertama dan "Closing soon" 35 menit terakhir. Pada ballot bertempo bulanan ia
 * jatuh ke batas atas 24 jam.
 *
 * Diekspor supaya uji MENURUNKAN batas-batasnya sendiri alih-alih mengetik ulang
 * angka yang akan berpisah dari nilai di sini.
 */
export function ambangTutupSegeraMs(k: {
  voteDeadlineMs: number;
  tallyDeadlineMs: number;
}): number {
  const jendelaTally = k.tallyDeadlineMs - k.voteDeadlineMs;
  // Kontrak menjamin tallyDeadline > voteDeadline (assert di constructor), jadi
  // jendelaTally selalu positif. Math.max(0, …) tetap dipasang supaya data yang
  // melanggar jaminan itu menghasilkan ambang nol — bukan ambang negatif, yang
  // akan membuat setiap ballot berbunyi "Live now" sampai detik terakhir.
  return Math.min(BATAS_ATAS_TUTUP_SEGERA_MS, Math.max(0, jendelaTally));
}

/**
 * Menurunkan status dari fase ledger DIGABUNG waktu dinding.
 *
 * MEMBACA `phase` SAJA TIDAK CUKUP, dan ini bukan kehati-hatian berlebihan —
 * ia keadaan yang benar-benar ada di rantai hari ini. Transisi fase bersifat
 * MALAS: ballot.compact tidak punya circuit closeVoting, sehingga phase tetap
 * `voting` setelah voteDeadline lewat sampai ada orang pertama yang memanggil
 * tallyVote(). Ballot yang tidak pernah dibuka satu suara pun tinggal di
 * `voting` selamanya, sementara kontraknya menolak SEMUA hal: castVote ditolak
 * (blockTimeLessThan(voteDeadline)) dan tallyVote juga ditolak
 * (blockTimeLessThan(tallyDeadline)).
 *
 * `sekarangMs` WAJIB dioper, tanpa nilai bawaan. Nilai bawaan yang membaca
 * Date.now() akan membuat fungsi ini mustahil diuji secara deterministik, dan
 * akan diam-diam memakai jam PERANGKAT — padahal kontrak memutuskan terhadap
 * waktu BLOK. Pemanggil di aplikasi mengoper HasilRantai.sekarangMs, yang
 * berasal dari stempel waktu blok.
 *
 * Urutan pemeriksaan menentukan kebenaran:
 *   1. finalized lebih dulu — satu-satunya penanda finalitas yang eksplisit
 *      di on-chain, dan ia tidak pernah mundur.
 *   2. lalu tallyDeadline, lalu voteDeadline — dari yang terjauh ke terdekat.
 */
export function turunkanStatus(
  k: { phase: 0 | 1 | 2; voteDeadlineMs: number; tallyDeadlineMs: number },
  sekarangMs: number,
): BallotStatus {
  if (k.phase === 2) return "finalized";
  if (sekarangMs >= k.tallyDeadlineMs) return "awaiting-finalize";
  if (sekarangMs >= k.voteDeadlineMs) return "tally-open";
  if (k.voteDeadlineMs - sekarangMs <= ambangTutupSegeraMs(k)) return "closing-soon";
  return "live";
}

/**
 * Keadaan HASIL sebuah ballot. EMPAT nilai, dan keempatnya benar-benar terjadi.
 *
 * Ini menutup konflasi yang paling mudah terlewat di seluruh rencana ini:
 * `talliedCount === 0` TIDAK berarti "hasil masih tersegel". Ia berarti belum
 * ada satu suara pun yang dibuka — dan itu punya empat sebab yang berbeda
 * artinya bagi pembaca, dua di antaranya sudah ada di rantai hari ini:
 *
 *   - ballot f597222d… berstatus awaiting-finalize dengan voteCount 0 dan
 *     talliedCount 0, dan KEDUA deadline-nya (voteDeadline 1789086147,
 *     tallyDeadline 1789088247) sudah lewat. Berbunyi "Results sealed until the
 *     vote deadline" di sini adalah kebohongan yang dapat diperiksa siapa pun,
 *     dan yang hanya makin salah seiring waktu.
 *   - satu panggilan finalize() pada ballot yang sama membuatnya `finalized`
 *     dengan talliedCount tetap 0. Menampilkan "tersegel" pada ballot yang
 *     SUDAH FINAL adalah kebalikan dari yang benar.
 *
 * Karena itu keadaan hasil digantung pada STATUS TURUNAN, bukan pada hitungan.
 *
 * Tipe KeadaanHasil sendiri tinggal di types.ts bersama BallotStatus, supaya
 * types.ts tetap TIDAK MENGIMPOR APA PUN dan tidak ada siklus yang mungkin.
 */
export function keadaanHasil(b: { status: BallotStatus; tallied: number }): KeadaanHasil {
  if (b.tallied > 0) return "ada-hasil";
  switch (b.status) {
    case "live":
    case "closing-soon":
      return "tersegel";
    case "tally-open":
      return "menunggu-pembukaan";
    case "awaiting-finalize":
    case "finalized":
      return "tidak-ada-yang-dibuka";
  }
}

/** Label status untuk mata manusia. Teks UI Inggris. */
export function statusLabel(status: BallotStatus): string {
  switch (status) {
    case "closing-soon":
      return "Closing soon";
    case "tally-open":
      return "Opening votes";
    case "awaiting-finalize":
      return "Awaiting finalization";
    case "finalized":
      return "Finalized";
    case "live":
      return "Live now";
  }
}

/**
 * Kelas tone CSS untuk badge status.
 *
 * SENGAJA memetakan lima status ke tiga tone, karena client/src/index.css hanya
 * punya tiga: `status-badge` dasar (mint), `.status-badge.closing-soon` (amber),
 * dan `.status-badge.finalized` (biru). Ini bukan kompromi estetis melainkan
 * pemisahan yang benar: STATUS adalah fakta rantai, TONE adalah keputusan visual.
 * Memaksa keduanya berbagi satu string adalah sebab kenapa enum tiga-nilai itu
 * mustahil ditumbuhkan tanpa menyentuh CSS.
 *
 * tally-open dan awaiting-finalize memakai tone amber, bukan biru: keduanya
 * menuntut tindakan (membuka suara, memfinalisasi), sedangkan biru di halaman
 * ini berarti "sudah selesai".
 */
export function statusTone(status: BallotStatus): "" | "closing-soon" | "finalized" {
  switch (status) {
    case "live":
      return "";
    case "finalized":
      return "finalized";
    case "closing-soon":
    case "tally-open":
    case "awaiting-finalize":
      return "closing-soon";
  }
}

/**
 * Tag kecil di pojok kartu ballot. Sebelum C-2a ia field mockup yang diketik
 * tangan; sekarang ia turunan dari status, sehingga tidak bisa lagi berbohong.
 */
export function statusTag(status: BallotStatus): string {
  switch (status) {
    case "live":
      return "Open";
    case "closing-soon":
      return "Closing soon";
    case "tally-open":
      return "Tally window";
    case "awaiting-finalize":
      return "Needs finalizing";
    case "finalized":
      return "Finalized";
  }
}

/** Benar hanya ketika kontrak benar-benar akan MENERIMA castVote. */
export function menerimaSuara(status: BallotStatus): boolean {
  return status === "live" || status === "closing-soon";
}
```

- [ ] **Step 3: Tulis ulang `ballot-status.test.ts`**

Assert batas **diturunkan dari `ambangTutupSegeraMs()`**, bukan diketik, supaya mengubah aturan ambang tidak menuntut mengedit angka di dua tempat. Satu uji ditulis khusus terhadap **bentuk ballot yang benar-benar ada di rantai** (jendela voting ≈60 menit, jendela tally 35 menit), karena itulah bentuk yang membuat ambang 24 jam gagal.

```typescript
import { describe, expect, it } from "vitest";
import {
  BATAS_ATAS_TUTUP_SEGERA_MS,
  ambangTutupSegeraMs,
  keadaanHasil,
  menerimaSuara,
  statusLabel,
  statusTag,
  statusTone,
  turunkanStatus,
} from "./ballot-status";
import type { BallotStatus, KeadaanHasil } from "./types";

const SEMUA: BallotStatus[] = ["live", "closing-soon", "tally-open", "awaiting-finalize", "finalized"];

const T0 = 1_000_000_000_000; // titik acuan sembarang; seluruh assert relatif terhadapnya
const seminggu = 7 * 24 * 3600 * 1000;
const menit = 60 * 1000;

/**
 * Bentuk ballot yang BENAR-BENAR ADA di preview hari ini: jendela voting ≈60
 * menit, jendela tally 35 menit. Bentuk inilah yang membunuh ambang tetap 24 jam.
 */
function ballotNyata(sisaMenitKeVoteDeadline: number) {
  const voteDeadlineMs = T0 + sisaMenitKeVoteDeadline * menit;
  return { phase: 0 as const, voteDeadlineMs, tallyDeadlineMs: voteDeadlineMs + 35 * menit };
}

describe("ambangTutupSegeraMs", () => {
  it("MENURUNKAN ambang dari jendela tally, bukan memakai 24 jam", () => {
    // Kalau ini pernah berbunyi BATAS_ATAS pada ballot 60 menit, label
    // "Live now" berhenti dapat dicapai sama sekali.
    expect(ambangTutupSegeraMs(ballotNyata(60))).toBe(35 * menit);
    expect(ambangTutupSegeraMs(ballotNyata(60))).toBeLessThan(BATAS_ATAS_TUTUP_SEGERA_MS);
  });

  it("jatuh ke batas atas pada ballot bertempo panjang", () => {
    const panjang = { voteDeadlineMs: T0 + 30 * seminggu, tallyDeadlineMs: T0 + 31 * seminggu };
    expect(ambangTutupSegeraMs(panjang)).toBe(BATAS_ATAS_TUTUP_SEGERA_MS);
  });

  it("tidak pernah negatif walau data melanggar jaminan tallyDl > voteDl", () => {
    expect(ambangTutupSegeraMs({ voteDeadlineMs: T0, tallyDeadlineMs: T0 - 1000 })).toBe(0);
  });
});

describe("turunkanStatus", () => {
  it("live ketika phase voting dan voteDeadline masih jauh", () => {
    expect(
      turunkanStatus({ phase: 0, voteDeadlineMs: T0 + seminggu, tallyDeadlineMs: T0 + 2 * seminggu }, T0),
    ).toBe("live");
  });

  it("live BENAR-BENAR TERCAPAI pada ballot 60 menit yang nyata", () => {
    // Inilah assert yang ambang tetap 24 jam gagalkan. Pada ballot dengan
    // jendela voting 60 menit dan jendela tally 35 menit, 40 menit sebelum
    // voteDeadline masih "Live now" — dengan ambang 24 jam ia "Closing soon".
    expect(turunkanStatus(ballotNyata(40), T0)).toBe("live");
    expect(turunkanStatus(ballotNyata(36), T0)).toBe("live");
  });

  it("closing-soon tepat di dalam ambang yang DITURUNKAN, live tepat di luarnya", () => {
    // Ambang diturunkan, bukan diketik: setiap ballotNyata punya jendela tally
    // 35 menit, jadi ambangnya 35 menit — dan nilai itu DIBACA dari fungsinya.
    const ambangMenit = ambangTutupSegeraMs(ballotNyata(0)) / menit;
    expect(turunkanStatus(ballotNyata(ambangMenit), T0)).toBe("closing-soon");
    expect(turunkanStatus(ballotNyata(ambangMenit + 1), T0)).toBe("live");
  });

  it("JEBAKAN 1: phase voting DENGAN voteDeadline lewat BUKAN live", () => {
    // Inilah keadaan yang benar-benar ada di rantai. UI lama akan berbunyi
    // "Live now" padahal castVote PASTI ditolak kontrak.
    const s = turunkanStatus(
      { phase: 0, voteDeadlineMs: T0 - 1000, tallyDeadlineMs: T0 + seminggu },
      T0,
    );
    expect(s).toBe("tally-open");
    expect(s).not.toBe("live");
    expect(menerimaSuara(s)).toBe(false);
  });

  it("JEBAKAN 1: phase voting DENGAN KEDUA deadline lewat menjadi awaiting-finalize", () => {
    const s = turunkanStatus({ phase: 0, voteDeadlineMs: T0 - 2000, tallyDeadlineMs: T0 - 1000 }, T0);
    expect(s).toBe("awaiting-finalize");
    expect(menerimaSuara(s)).toBe(false);
  });

  it("phase finalized menang atas waktu apa pun", () => {
    // finalize() hanya berhasil setelah tallyDeadline lewat, jadi kombinasi ini
    // tidak seharusnya ada di rantai; kalau toh muncul, finalitas eksplisit
    // adalah jawaban yang benar karena ia tidak pernah mundur.
    expect(
      turunkanStatus({ phase: 2, voteDeadlineMs: T0 + seminggu, tallyDeadlineMs: T0 + 2 * seminggu }, T0),
    ).toBe("finalized");
  });

  it("phase tallying di dalam jendela tally tetap tally-open", () => {
    expect(
      turunkanStatus({ phase: 1, voteDeadlineMs: T0 - 1000, tallyDeadlineMs: T0 + 1000 }, T0),
    ).toBe("tally-open");
  });

  it("phase tallying setelah tallyDeadline menjadi awaiting-finalize", () => {
    expect(
      turunkanStatus({ phase: 1, voteDeadlineMs: T0 - 2000, tallyDeadlineMs: T0 - 1000 }, T0),
    ).toBe("awaiting-finalize");
  });
});

describe("statusLabel / statusTone / statusTag", () => {
  it("memberi label berbeda untuk kelima status", () => {
    expect(new Set(SEMUA.map(statusLabel)).size).toBe(SEMUA.length);
  });

  it("memakai HANYA tone yang benar-benar ada di index.css", () => {
    const tone = new Set(SEMUA.map(statusTone));
    for (const t of tone) expect(["", "closing-soon", "finalized"]).toContain(t);
  });

  it("mempertahankan ketiga label warisan apa adanya", () => {
    // Disalin dengan mata dari Home.tsx pra-pemecahan baris 131-133 lewat C-1.
    // Ketiganya teks UI Inggris dan tidak boleh berubah tanpa alasan produk.
    expect(statusLabel("live")).toBe("Live now");
    expect(statusLabel("closing-soon")).toBe("Closing soon");
    expect(statusLabel("finalized")).toBe("Finalized");
  });

  it("memberi tag berbeda untuk kelima status", () => {
    expect(new Set(SEMUA.map(statusTag)).size).toBe(SEMUA.length);
  });

  it("menerimaSuara hanya benar pada dua status yang kontraknya memang menerima", () => {
    expect(SEMUA.filter(menerimaSuara)).toEqual(["live", "closing-soon"]);
  });
});

describe("keadaanHasil — JEBAKAN 4", () => {
  it("selalu ada-hasil begitu ada satu suara yang dibuka, apa pun statusnya", () => {
    for (const s of SEMUA) expect(keadaanHasil({ status: s, tallied: 1 })).toBe("ada-hasil");
  });

  it("MEMBEDAKAN keempat sebab talliedCount nol", () => {
    // Kalau keempatnya pernah runtuh jadi satu nilai, halaman Results kembali
    // berbunyi "tersegel sampai deadline" pada ballot yang deadline-nya sudah
    // sudah lewat — persis keadaan f597222d… sejak rencana ini ditulis.
    const nol = (status: BallotStatus) => keadaanHasil({ status, tallied: 0 });
    expect(nol("live")).toBe("tersegel");
    expect(nol("closing-soon")).toBe("tersegel");
    expect(nol("tally-open")).toBe("menunggu-pembukaan");
    expect(nol("awaiting-finalize")).toBe("tidak-ada-yang-dibuka");
    expect(nol("finalized")).toBe("tidak-ada-yang-dibuka");
  });

  it("TIDAK PERNAH berbunyi tersegel pada status yang voteDeadline-nya pasti sudah lewat", () => {
    // tally-open, awaiting-finalize, dan finalized semuanya hanya tercapai
    // setelah voteDeadline lewat. "Tersegel sampai vote deadline" pada ketiganya
    // adalah kalimat yang salah secara faktual, bukan sekadar kurang tepat.
    for (const s of ["tally-open", "awaiting-finalize", "finalized"] as const) {
      expect(keadaanHasil({ status: s, tallied: 0 })).not.toBe("tersegel");
    }
  });

  it("memberi keempat nilai yang mungkin, tidak ada yang tak terjangkau", () => {
    const terlihat = new Set<KeadaanHasil>();
    for (const s of SEMUA) {
      terlihat.add(keadaanHasil({ status: s, tallied: 0 }));
      terlihat.add(keadaanHasil({ status: s, tallied: 1 }));
    }
    expect(terlihat).toEqual(
      new Set<KeadaanHasil>(["ada-hasil", "tersegel", "menunggu-pembukaan", "tidak-ada-yang-dibuka"]),
    );
  });
});
```

- [ ] **Step 4: Tulis `client/src/lib/chain/ke-ballot.ts`**

```typescript
import type { Ballot } from "@/components/votepriv/types";
import { keadaanHasil, statusTag, turunkanStatus } from "@/components/votepriv/ballot-status";
import { padatkanTallies } from "./dekode";
import type { BallotTerbaca, HasilRantai } from "./baca-rantai";

/**
 * Pemetaan tabel spec 9.4 menjadi tipe Ballot yang dipakai UI.
 *
 * Berkas ini TIDAK mengimpor WASM. Ia bekerja atas hasil dekode, sehingga
 * seluruh pemetaan — termasuk keempat jebakan — dapat diuji tanpa menyalakan
 * onchain-runtime sama sekali.
 */

/**
 * Deadline SELALU diformat pada zona UTC, dan kata "UTC" ikut ditulis.
 *
 * Bukan kerapian: voteDeadline dan tallyDeadline adalah DETIK SEJAK EPOCH UTC
 * yang dibandingkan kontrak secara mentah lewat kernel.blockTimeLessThan().
 * Menampilkannya pada zona lokal pembaca menghasilkan tanggal yang tampak
 * berbeda dari yang ditegakkan kontrak, dan pada pergantian hari ia menggeser
 * TANGGAL — persis pada momen paling mahal, yaitu saat pemilih memutuskan
 * apakah masih sempat.
 */
const FORMAT_DEADLINE = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDeadlineUtc(ms: number): string {
  return `${FORMAT_DEADLINE.format(new Date(ms))} UTC`;
}

/**
 * accent diturunkan dari alamat kontrak (spec 9.4), bukan diketik tangan.
 *
 * Jumlah sederhana atas seluruh nibble, bukan hash kriptografis: yang dibutuhkan
 * hanya penyebaran warna yang stabil per alamat, dan alamat yang sama harus
 * selalu memberi warna yang sama supaya kartu tidak berganti warna tiap muat.
 */
export function accentDariAlamat(alamat: string): "mint" | "violet" | "blue" {
  let jumlah = 0;
  for (let i = 0; i < alamat.length; i++) jumlah = (jumlah + alamat.charCodeAt(i)) % 3;
  return (["mint", "violet", "blue"] as const)[jumlah];
}

export function keBallot(
  b: BallotTerbaca,
  konteks: { nomor: number; sekarangMs: number },
): Ballot {
  const k = b.keadaan;
  // Ledger menyimpan deadline dalam DETIK; seluruh lapis di atas berbicara
  // dalam MILIDETIK karena Date dan Block.timestamp memakai milidetik.
  const voteDeadlineMs = k.voteDeadlineDetik * 1000;
  const tallyDeadlineMs = k.tallyDeadlineDetik * 1000;
  const status = turunkanStatus(
    { phase: k.phase, voteDeadlineMs, tallyDeadlineMs },
    konteks.sekarangMs,
  );
  // Map tallies JARANG: kunci tanpa suara TIDAK ADA. Dipadatkan sekali di sini
  // supaya tidak ada satu pun komponen yang tergoda mengindeksnya mentah-mentah.
  const padat = padatkanTallies(k.tallies, k.optionCount);
  // Keadaan hasil digantung pada STATUS TURUNAN, bukan pada talliedCount.
  // talliedCount === 0 punya EMPAT sebab yang berbeda artinya — lihat
  // KeadaanHasil di types.ts, dan ballot f597222d… yang hari ini berada di
  // salah satu sebab yang paling mudah salah dibaca.
  const hasil = keadaanHasil({ status, tallied: k.talliedCount });
  return {
    id: b.alamat,
    nomor: konteks.nomor,
    title: k.title,
    description: k.description,
    community: k.community,
    votes: k.voteCount,
    eligible: k.eligibleCount,
    registered: k.registeredCount,
    tallied: k.talliedCount,
    quorum: k.quorumPercent,
    eligibilityPolicy: k.eligibilityPolicy,
    deadline: formatDeadlineUtc(voteDeadlineMs),
    voteDeadlineMs,
    tallyDeadlineMs,
    phase: k.phase,
    status,
    options: k.opsi,
    // SELALU larik padat sepanjang options — tidak pernah null. Yang membedakan
    // "tersegel" dari "final tanpa satu pun dibuka" adalah keadaanHasil, bukan
    // bentuk larik ini.
    tallies: padat,
    keadaanHasil: hasil,
    accent: accentDariAlamat(b.alamat),
    tag: statusTag(status),
    deployHeight: b.deployHeight,
  };
}

/**
 * Mengubah seluruh hasil pembacaan menjadi daftar Ballot.
 *
 * URUTAN TAMPILAN mengikuti registry.ballots apa adanya — pushFront, jadi
 * terbaru di depan. NOMOR URUT diturunkan terpisah dari tinggi blok
 * ContractDeploy, urut naik. Keduanya sengaja tidak sama:
 *
 *   urutan tampil  = yang paling relevan lebih dulu
 *   nomor urut     = pengenal yang tidak berubah arti saat ada pendaftaran baru
 *
 * Menyatukan keduanya adalah persis kesalahan yang J2 tutup: menomori dari
 * indeks registry akan MENOMORI ULANG ballot lama setiap ada ballot baru.
 *
 * deployHeight = 0 berarti ContractDeploy tidak terbaca (entri registry yang
 * bukan ballot sungguhan). Ia ditaruh di BELAKANG, bukan di depan, supaya
 * anomali tidak mengambil nomor 001.
 */
export function keDaftarBallot(hasil: HasilRantai): Ballot[] {
  const urutDeploy = [...hasil.ballot].sort((a, b) => {
    if (a.deployHeight === 0 && b.deployHeight === 0) return a.alamat.localeCompare(b.alamat);
    if (a.deployHeight === 0) return 1;
    if (b.deployHeight === 0) return -1;
    if (a.deployHeight !== b.deployHeight) return a.deployHeight - b.deployHeight;
    // Dua deploy pada blok yang sama: alamat sebagai pemutus, supaya nomornya
    // tetap sama antar muat.
    return a.alamat.localeCompare(b.alamat);
  });
  const nomorUntuk = new Map(urutDeploy.map((b, i) => [b.alamat, i + 1]));
  return hasil.ballot.map(b =>
    keBallot(b, { nomor: nomorUntuk.get(b.alamat) ?? 0, sekarangMs: hasil.sekarangMs }),
  );
}

/** Teks nomor urut untuk ditampilkan. Tidak pernah dipakai sebagai pengenal. */
export function labelNomor(nomor: number): string {
  return `Ballot ${String(nomor).padStart(3, "0")}`;
}
```

- [ ] **Step 5: Tulis `client/src/lib/chain/ke-ballot.test.ts`**

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bacaRantai } from "./baca-rantai";
import { accentDariAlamat, formatDeadlineUtc, keDaftarBallot, labelNomor } from "./ke-ballot";
import type { JaringanAktif } from "./endpoint";
import { keadaanHasil, menerimaSuara } from "@/components/votepriv/ballot-status";

const DIR = new URL("../../test/fixture-rantai/", import.meta.url);
const baca = (n: string) => JSON.parse(readFileSync(new URL(n, DIR), "utf8"));
const fxRegistry = baca("registry.json");
const fxBallots = baca("ballots.json");
const fxJaringan = baca("jaringan.json");
const meta = baca("meta.json");

const JARINGAN: JaringanAktif = {
  networkId: meta.jaringan,
  indexer: meta.endpoint,
  indexerWS: "",
  alamatRegistry: meta.alamatRegistry,
};

function ambilPalsu(): typeof fetch {
  return (async (_u: string, init: RequestInit) => {
    const nama = /query\s+(\w+)/.exec(JSON.parse(String(init.body)).query)?.[1] ?? "?";
    const j = nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
    return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const hasil = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
const daftar = keDaftarBallot(hasil);

describe("keDaftarBallot — pemetaan spec 9.4", () => {
  it("memetakan setiap ballot yang berhasil dibaca", () => {
    expect(daftar).toHaveLength(hasil.ballot.length);
  });

  it("memakai ALAMAT sebagai id, bukan nomor urut", () => {
    for (const b of daftar) {
      expect(b.id).toMatch(/^[0-9a-fA-F]+$/);
      expect(hasil.ballot.map(x => x.alamat)).toContain(b.id);
    }
  });

  it("JEBAKAN 2: nomor urut mengikuti tinggi blok DEPLOY, bukan indeks registry", () => {
    const urutRegistry = hasil.registry.alamat.filter(a => daftar.some(b => b.id === a));
    const urutNomor = [...daftar].sort((a, b) => a.nomor - b.nomor).map(b => b.id);
    const urutDeploy = [...daftar]
      .sort((a, b) => a.deployHeight - b.deployHeight)
      .map(b => b.id);
    expect(urutNomor).toEqual(urutDeploy);
    // Bila fixture memuat lebih dari satu ballot, urutan registry (pushFront,
    // terbaru di depan) harus KEBALIKAN dari urutan deploy. Assert ini yang
    // membuktikan nomor tidak diambil dari indeks.
    if (daftar.length > 1) {
      expect(urutNomor).not.toEqual(urutRegistry);
      expect(urutNomor).toEqual([...urutRegistry].reverse());
    }
  });

  it("memberi nomor yang rapat mulai dari 1", () => {
    const nomor = daftar.map(b => b.nomor).sort((a, b) => a - b);
    expect(nomor).toEqual(Array.from({ length: daftar.length }, (_, i) => i + 1));
  });

  it("memakai jam RANTAI untuk seluruh turunan status", () => {
    // Bila fungsi ini diam-diam memakai Date.now(), assert di bawah akan berubah
    // seiring waktu dan uji ini jadi rapuh menurut hari. Menyuntikkan sekarangMs
    // dari fixture membekukan waktu bersama datanya.
    expect(hasil.sekarangMs).toBe(fxJaringan.data.block.timestamp);
  });

  it("JEBAKAN 1: tidak ada ballot yang berstatus live sementara voteDeadline-nya sudah lewat", () => {
    for (const b of daftar) {
      if (b.voteDeadlineMs <= hasil.sekarangMs) {
        expect(b.status).not.toBe("live");
        expect(b.status).not.toBe("closing-soon");
        expect(menerimaSuara(b.status)).toBe(false);
      }
    }
  });

  it("JEBAKAN 1: setiap ballot yang phase-nya voting dengan kedua deadline lewat jadi awaiting-finalize", () => {
    for (const b of daftar) {
      if (b.phase !== 2 && b.tallyDeadlineMs <= hasil.sekarangMs) {
        expect(b.status).toBe("awaiting-finalize");
      }
    }
  });

  it("JEBAKAN 3: tallies dipadatkan dan jumlahnya sama dengan talliedCount", () => {
    for (const b of daftar) {
      // SELALU larik, tidak pernah null — panjangnya selalu sama dengan options.
      expect(Array.isArray(b.tallies)).toBe(true);
      expect(b.tallies).toHaveLength(b.options.length);
      expect(b.tallies.reduce((s, n) => s + n, 0)).toBe(b.tallied);
      // Lubang pada map jarang hadir sebagai 0, bukan undefined.
      for (const n of b.tallies) expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("JEBAKAN 4: keadaanHasil digantung pada STATUS, bukan pada talliedCount", () => {
    // Inilah konflasi yang bentuk `number[] | null` sembunyikan: talliedCount
    // nol punya EMPAT sebab, dan dua di antaranya ada di rantai hari ini.
    for (const b of daftar) {
      if (b.tallied > 0) {
        expect(b.keadaanHasil).toBe("ada-hasil");
        continue;
      }
      // tallied === 0: yang menentukan adalah statusnya, bukan angkanya.
      const diharap = {
        live: "tersegel",
        "closing-soon": "tersegel",
        "tally-open": "menunggu-pembukaan",
        "awaiting-finalize": "tidak-ada-yang-dibuka",
        finalized: "tidak-ada-yang-dibuka",
      } as const;
      expect(b.keadaanHasil).toBe(diharap[b.status]);
      // Dan yang paling penting: sebuah ballot yang deadline-nya SUDAH LEWAT
      // tidak pernah boleh berbunyi "tersegel sampai deadline".
      if (b.voteDeadlineMs <= hasil.sekarangMs) {
        expect(b.keadaanHasil).not.toBe("tersegel");
      }
    }
  });

  it("JEBAKAN 4: ballot yang difinalisasi tanpa satu suara dibuka BUKAN tersegel", () => {
    // Ballot f597222d… hari ini berada satu panggilan finalize() dari keadaan
    // ini. Diuji secara sintetis karena rantai belum sampai ke sana — dan uji
    // inilah yang membuat keadaan itu tidak dapat diam-diam menjadi "tersegel".
    expect(keadaanHasil({ status: "finalized", tallied: 0 })).toBe("tidak-ada-yang-dibuka");
    expect(keadaanHasil({ status: "finalized", tallied: 0 })).not.toBe("tersegel");
  });

  it("memotong opsi menurut optionCount — tidak menawarkan pilihan yang pasti ditolak", () => {
    for (const b of daftar) {
      expect(b.options.length).toBeGreaterThanOrEqual(2);
      expect(b.options.length).toBeLessThanOrEqual(4);
      for (const o of b.options) expect(o).not.toBe("");
    }
  });

  it("membawa eligibilityPolicy dan quorum apa adanya dari ledger", () => {
    for (const b of daftar) {
      expect(typeof b.eligibilityPolicy).toBe("string");
      expect(b.quorum).toBeLessThanOrEqual(100);
    }
  });
});

describe("formatDeadlineUtc", () => {
  it("memformat pada UTC dan menuliskannya, apa pun TZ mesin", () => {
    const teks = formatDeadlineUtc(0);
    expect(teks).toMatch(/UTC$/);
    expect(teks).toContain("1970");
  });

  it("memberi hasil yang sama untuk ms yang sama pada dua pemanggilan", () => {
    const b = daftar[0];
    expect(formatDeadlineUtc(b.voteDeadlineMs)).toBe(b.deadline);
  });
});

describe("accentDariAlamat", () => {
  it("stabil untuk alamat yang sama", () => {
    for (const b of daftar) expect(accentDariAlamat(b.id)).toBe(b.accent);
  });

  it("hanya menghasilkan accent yang punya kelas di index.css", () => {
    for (const b of daftar) expect(["mint", "violet", "blue"]).toContain(b.accent);
  });
});

describe("labelNomor", () => {
  it("memberi tiga digit", () => {
    expect(labelNomor(1)).toBe("Ballot 001");
    expect(labelNomor(42)).toBe("Ballot 042");
  });
});
```

- [ ] **Step 6: Jalankan uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check 2>&1 | head -30
pnpm check:uji 2>&1 | head -30
```

Diharapkan: sejumlah galat tipe di `BallotCard.tsx`, `LiveBallots.tsx`, `Results.tsx`, `VoteModal.tsx`, `Overview.tsx`, `CreateBallotModal.tsx`, dan `demo-data.ts` — karena `Ballot` bertambah field wajib dan `BallotStatus` bertambah anggota. **Itu memang tujuannya**: kompiler sekarang menunjuk setiap tempat yang harus disesuaikan di Task 8, alih-alih membiarkannya lolos diam-diam. Catat daftarnya; ia menjadi daftar kerja Task 8.

`pnpm check:uji` menambahkan berkas uji ke daftar itu; tanpa perintah kedua, `*.test.ts` tidak ikut diperiksa sama sekali dan daftar kerjanya kurang.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm test client/src/lib/chain client/src/components/votepriv/ballot-status.test.ts 2>&1 | tail -15
```

Diharapkan: seluruh uji di lapis rantai dan `ballot-status.test.ts` hijau. Uji komponen lain **boleh merah di titik ini** — mereka masih memakai bentuk `Ballot` lama dan diperbaiki di Task 8.

- [ ] **Step 7: Commit dengan catatan bahwa pohon sedang merah di sisi komponen**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/lib/chain client/src/components/votepriv/types.ts \
        client/src/components/votepriv/ballot-status.ts client/src/components/votepriv/ballot-status.test.ts
git commit -m "feat(chain): pemetaan spec 9.4 ke Ballot dan status LIMA nilai

BallotStatus tiga-nilai tidak punya anggota untuk keadaan yang BENAR-BENAR ADA
di rantai: phase = voting dengan kedua deadline sudah lewat. UI lama berbunyi
Live now padahal castVote pasti ditolak kontrak, dan chip filter berbunyi Live 1
yang bohong. Transisi fase bersifat MALAS — tidak ada circuit closeVoting —
sehingga status WAJIB diturunkan dari phase digabung waktu dinding.

Kelima status dipetakan ke TIGA tone yang sudah ada di index.css lewat
statusTone(), sehingga tidak satu nama kelas CSS pun ditambah.

Nomor urut tampilan diturunkan dari tinggi blok ContractDeploy, BUKAN dari
indeks registry: registry.compact memakai pushFront, jadi menomori dari indeks
akan menomori ulang ballot lama setiap ada pendaftaran baru. Ballot.id tetap
alamat kontrak, satu-satunya identitas yang ada di rantai.

tallies dipadatkan sekali di batas pemetaan: map-nya JARANG, kunci tanpa suara
TIDAK ADA dan lookup() padanya melempar.

Ambang Closing soon DITURUNKAN dari jendela tally ballot itu sendiri, bukan
dipatok 24 jam. Kedua ballot di preview punya jendela voting sekitar 60 menit
(diukur: 3.593 dan 3.597 detik), jadi ambang 24 jam membuat anggota live tidak
pernah tercapai sama sekali dan chip Open menghitung label yang tidak pernah
terlihat.

Ballot.tallies berhenti menjadi number[] | null. Bentuk itu memikul EMPAT arti
sekaligus: hasil tersegel, menunggu pembukaan, jendela pembukaan tutup tanpa
satu suara dibuka, dan sudah final tanpa satu suara dibuka. Ballot f597222d
hari ini berada di keadaan ketiga — kedua deadline-nya sudah lewat, dan tidak
akan pernah kembali —
sehingga Results yang lama akan berbunyi tersegel sampai vote deadline pada
ballot yang deadline-nya sudah lewat. Digantikan keadaanHasil, yang diturunkan
dari status dan bukan dari hitungan.

CATATAN: pnpm check sengaja merah di sisi komponen setelah commit ini. Field
Ballot bertambah dan BallotStatus bertambah anggota, sehingga kompiler menunjuk
setiap tempat yang harus disesuaikan. Task 8 yang menutupnya."
```

**Deliverable:** keempat jebakan tertutup di satu tempat dan diuji terhadap data nyata yang direkam; kompiler memegang daftar kerja Task 8.

---

### Task 7: Mesin keadaan `useDataRantai` dan permukaan memuat/gagal

Ini bagian yang **belum ada sama sekali** sebelum rencana ini. Data mockup selalu ada seketika; data jaringan tidak. Fetch indexer terukur 1.047–1.279 ms dan berasal dari layanan publik yang tidak kita kendalikan.

Aturan yang mengikat seluruh task ini, dan yang dijaga uji: **kegagalan indexer tidak boleh terlihat seperti "tidak ada ballot".** `empty-state` ("No ballots found") hanya boleh dirender ketika pembacaan **berhasil** dan registry memang kosong.

**Files:**
- Create: `client/src/hooks/useDataRantai.ts`, `client/src/components/votepriv/KeadaanRantai.tsx`
- Test: `client/src/hooks/useDataRantai.test.tsx`, `client/src/components/votepriv/KeadaanRantai.test.tsx`

**Interfaces:**
- Consumes: `@/lib/chain` (`bacaRantai`, `GalatRantai`, `HasilRantai`, `jaringanAktif`), `@/lib/chain/ke-ballot` (`keDaftarBallot`), `@/components/votepriv/types` (`Ballot`)
- Produces — **daftar ini adalah kontrak yang dibaca Task 8 sebelum kodenya ada; ia sama persis dengan tanda tangan implementasinya, `percobaan` dan `jaringan` termasuk:**
  - `type KeadaanData = { fase: "memuat"; percobaan: number } | { fase: "siap"; hasil: HasilRantai; ballots: Ballot[] } | { fase: "gagal"; galat: GalatRantai; percobaan: number }`
  - `type DataRantai = KeadaanData & { jaringan: JaringanAktif | null; muatUlang: () => void }`
  - `useDataRantai(opsi?: { ambil?: typeof fetch; otomatis?: boolean }): DataRantai`
  - `<KartuBallotMemuat />`
  - `<GridBallotMemuat count?: number />`
  - `<PanelGagalRantai galat={GalatRantai} jaringan={JaringanAktif | null} percobaan={number} onCoba={() => void} />` — `percobaan` **wajib**, dan Task 8 Step 8 benar-benar mengopernya
  - `<SpandukSebagian gagal={BallotGagal[]} />`
  - `pesanGagal(galat: GalatRantai, jaringan: JaringanAktif | null): { judul: string; kalimat: string; saran: string }`

- [ ] **Step 1: Tulis `client/src/hooks/useDataRantai.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { GalatRantai, bacaRantai, jaringanAktif, type HasilRantai, type JaringanAktif } from "@/lib/chain";
import { keDaftarBallot } from "@/lib/chain/ke-ballot";
import type { Ballot } from "@/components/votepriv/types";

/**
 * Mesin keadaan pembacaan rantai.
 *
 * TIGA fase, dan ketiganya harus dapat dibedakan komponen di atasnya. Sebuah
 * hook yang hanya mengembalikan `ballots: Ballot[]` memaksa UI menampilkan
 * daftar kosong pada fase memuat DAN pada fase gagal — dan itulah bagaimana
 * kegagalan indexer berubah menjadi "tidak ada ballot", yang dilarang keras
 * oleh rencana ini.
 *
 * `percobaan` naik pada setiap muatUlang(). Ia dipakai permukaan gagal untuk
 * mengatakan "dicoba ke-N", supaya pengguna tahu tombolnya benar-benar bekerja
 * ketika kegagalannya berulang dengan pesan yang sama.
 */
export type KeadaanData =
  | { fase: "memuat"; percobaan: number }
  | { fase: "siap"; hasil: HasilRantai; ballots: Ballot[] }
  | { fase: "gagal"; galat: GalatRantai; percobaan: number };

export type DataRantai = KeadaanData & {
  /**
   * NULL ketika konfigurasi sendiri yang gagal — salah ketik
   * VITE_MIDNIGHT_NETWORK, atau alamat registry yang bukan hex.
   *
   * Nilainya TIDAK boleh dikarang. Versi sebelumnya mengembalikan objek rekaan
   * `{ networkId: "preview", indexer: "", indexerWS: "", alamatRegistry: "" }`,
   * sehingga salah ketik `previewe` muncul di layar sebagai kegagalan jaringan
   * **preview** — jaringan yang justru TIDAK diminta operator. Sebuah objek
   * konfigurasi yang dikarang adalah bentuk kebohongan yang paling sulit
   * ditemukan, karena ia terlihat seperti data.
   */
  jaringan: JaringanAktif | null;
  muatUlang: () => void;
};

export function useDataRantai(opsi: { ambil?: typeof fetch; otomatis?: boolean } = {}): DataRantai {
  const { ambil, otomatis = true } = opsi;
  // jaringanAktif() dapat MELEMPAR pada env yang salah ketik. Dievaluasi sekali
  // dan hasilnya disimpan: melemparnya di dalam render akan meledak di
  // ErrorBoundary alih-alih di panel galat yang punya tombol Retry.
  const [jaringan] = useState<JaringanAktif | GalatRantai>(() => {
    try {
      return jaringanAktif();
    } catch (e) {
      // Sebabnya "konfigurasi", BUKAN "graphql-fatal": tidak ada GraphQL yang
      // pernah dijalankan, tidak ada host yang pernah dihubungi, dan tidak ada
      // jaringan yang pernah dipilih. host diisi string kosong karena memang
      // tidak ada host — bukan "konfigurasi" yang menyamar sebagai nama host.
      return new GalatRantai("konfigurasi", e instanceof Error ? e.message : String(e), "");
    }
  });
  const [percobaan, setPercobaan] = useState(0);
  const [keadaan, setKeadaan] = useState<KeadaanData>({ fase: "memuat", percobaan: 0 });
  const batalRef = useRef<AbortController | null>(null);

  const muatUlang = useCallback(() => setPercobaan(n => n + 1), []);

  useEffect(() => {
    if (!otomatis) return;
    if (jaringan instanceof GalatRantai) {
      setKeadaan({ fase: "gagal", galat: jaringan, percobaan });
      return;
    }
    // Permintaan sebelumnya dibatalkan sebelum yang baru berangkat: tanpa ini,
    // dua muatUlang beruntun bisa mendarat terbalik dan menampilkan data lama.
    batalRef.current?.abort();
    const ac = new AbortController();
    batalRef.current = ac;
    setKeadaan({ fase: "memuat", percobaan });
    bacaRantai({ jaringan, signal: ac.signal, ambil })
      .then(hasil => {
        if (ac.signal.aborted) return;
        setKeadaan({ fase: "siap", hasil, ballots: keDaftarBallot(hasil) });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        // AbortError bukan kegagalan; ia pembatalan yang kita minta sendiri.
        if (e instanceof DOMException && e.name === "AbortError") return;
        const galat =
          e instanceof GalatRantai
            ? e
            : new GalatRantai("jaringan", e instanceof Error ? e.message : String(e), "tidak diketahui");
        setKeadaan({ fase: "gagal", galat, percobaan });
      });
    return () => ac.abort();
  }, [jaringan, percobaan, otomatis, ambil]);

  return {
    ...keadaan,
    // null, BUKAN objek rekaan. Permukaan gagal untuk sebab "konfigurasi" tidak
    // menyebut jaringan sama sekali, karena belum ada jaringan yang dipilih.
    jaringan: jaringan instanceof GalatRantai ? null : jaringan,
    muatUlang,
  };
}
```

- [ ] **Step 2: Tulis `client/src/components/votepriv/KeadaanRantai.tsx`**

Teks UI berbahasa **Inggris**; komentar Indonesia. Seluruh markup memakai nama kelas yang **sudah ada** di `index.css` — `empty-state`, `side-panel`, `ballot-card`, `progress-track`, `primary-button`, `ballot-tag` — supaya tidak satu baris CSS pun ditambah.

```typescript
import { AlertTriangle, RefreshCcw, ServerCrash, Unplug } from "lucide-react";
import type { GalatRantai } from "@/lib/chain";
import type { BallotGagal, JaringanAktif } from "@/lib/chain";

/**
 * Permukaan yang lahir bersama data jaringan: satu kerangka memuat, LIMA panel
 * gagal yang masing-masing punya kalimatnya sendiri, dan satu spanduk sebagian.
 *
 * Data mockup selalu ada seketika; data indexer tidak — terukur 1.047-1.279 ms,
 * dan berasal dari layanan publik yang tidak kita kendalikan. Sebelum C-2a,
 * tidak satu pun dari keempat keadaan ini punya tempat di UI.
 *
 * Seluruh nama kelas di berkas ini SUDAH ADA di client/src/index.css. Tidak ada
 * satu baris CSS pun yang ditambah C-2a.
 */

/** Satu kartu kerangka. Memakai bentuk kartu yang sama supaya tata letak tidak melompat saat data mendarat. */
export function KartuBallotMemuat() {
  return (
    <article className="ballot-card" aria-busy="true">
      <div className="card-topline">
        <span className="status-badge">
          <span /> Loading
        </span>
        <span className="ballot-tag">Reading chain</span>
      </div>
      <div className="ballot-title-row">
        <div>
          <h3>&nbsp;</h3>
          <p>Reading contract state from the indexer.</p>
        </div>
      </div>
      <div className="ballot-progress-label">
        <span>Participation</span>
        <strong>—</strong>
      </div>
      <div className="progress-track slim">
        <span style={{ width: "0%" }} />
      </div>
    </article>
  );
}

export function GridBallotMemuat({ count = 2 }: { count?: number }) {
  return (
    <div className="ballots-grid">
      {Array.from({ length: count }, (_, i) => (
        <KartuBallotMemuat key={i} />
      ))}
    </div>
  );
}

/**
 * Kalimat untuk tiap sebab kegagalan.
 *
 * Dipisah dari komponennya supaya dapat diuji sebagai fungsi murni, dan supaya
 * setiap kalimat dapat dibaca berdampingan tanpa JSX di antaranya. Tidak ada
 * cabang "lain-lain" yang berbunyi "Something went wrong": pesan semacam itu
 * membuat laporan galat dari pengguna tidak berguna, dan membuat perbedaan
 * antara "indexer mati" dan "jaringan salah" hilang tepat ketika ia paling
 * dibutuhkan.
 */
export function pesanGagal(
  galat: GalatRantai,
  /** null ketika konfigurasi sendiri yang gagal — tidak ada jaringan yang dipilih. */
  jaringan: JaringanAktif | null,
): { judul: string; kalimat: string; saran: string } {
  // Sebab "konfigurasi" ditangani lebih dulu: ia SATU-SATUNYA yang boleh muncul
  // dengan jaringan null, dan seluruh cabang di bawahnya boleh menganggap
  // jaringan sudah ada.
  if (galat.sebab === "konfigurasi" || jaringan === null) {
    return {
      judul: "VotePriv is misconfigured",
      kalimat: `VotePriv could not work out which network to read before it contacted anything: ${galat.rincian}`,
      saran: "Fix VITE_MIDNIGHT_NETWORK or VITE_VOTEPRIV_REGISTRY in your environment, then reload.",
    };
  }
  switch (galat.sebab) {
    case "jaringan":
      return {
        judul: "Can't reach the indexer",
        kalimat: `VotePriv could not connect to ${galat.host}. Nothing was read from the chain, so no ballots can be shown — this is not an empty registry.`,
        saran: "Check your connection, then try again.",
      };
    case "http":
      return {
        judul: "The indexer returned an error",
        kalimat: `${galat.host} answered with an error instead of data: ${galat.rincian}`,
        saran: "This is usually temporary. Try again in a moment.",
      };
    case "balasan-html":
      return {
        judul: "Something is standing in front of the indexer",
        kalimat: `${galat.host} answered with a web page instead of GraphQL data. A proxy, captive portal, or sign-in page is intercepting the request.`,
        saran: "Open a normal page in this browser first, then try again.",
      };
    case "bukan-json":
      return {
        judul: "The indexer sent an unreadable answer",
        kalimat: `${galat.host} answered with something that is not valid JSON: ${galat.rincian}`,
        saran: "Try again. If it keeps happening, the indexer is likely unhealthy.",
      };
    case "graphql-fatal":
      // BUKAN "registry tidak ditemukan". Ini kegagalan di tingkat KUERI —
      // biasanya skema indexer berubah dan sebuah field tidak dikenal lagi.
      // Menyebutnya sebagai registry yang salah jaringan mengirim pembaca
      // memeriksa variabel lingkungan yang sebenarnya benar.
      return {
        judul: "The indexer rejected the query",
        kalimat: `${galat.host} accepted the request but did not run the query, so nothing was read. This usually means the indexer schema changed. Details: ${galat.rincian}`,
        saran: "This is not a wrong address or a wrong network. It needs a code change to match the new schema.",
      };
    case "registry-hilang":
      return {
        judul: "Registry not found on this network",
        kalimat: `No contract was found at ${jaringan.alamatRegistry} on the ${jaringan.networkId} network. Every ballot is discovered through the registry, so nothing can be listed. Details: ${galat.rincian}`,
        saran: "The address is probably right but the network is wrong. Check VITE_MIDNIGHT_NETWORK.",
      };
    case "dekode":
      return {
        judul: "Contract state could not be decoded",
        kalimat: `A contract answered, but its state does not match the VotePriv contract layout: ${galat.rincian}`,
        saran: "This usually means the address points at a different contract than expected.",
      };
    case "konfigurasi":
      // Tidak ada host, tidak ada jaringan, dan TIDAK ADA objek JaringanAktif
      // yang dikarang — kegagalan ini terjadi sebelum ada jaringan yang dituju.
      // Versi sebelumnya melaporkannya sebagai kegagalan jaringan "preview"
      // dengan objek konfigurasi rekaan, sehingga salah ketik
      // VITE_MIDNIGHT_NETWORK=previewe muncul sebagai masalah di preview.
      return {
        judul: "VotePriv is misconfigured",
        kalimat: `VotePriv could not work out which network to read before it contacted anything: ${galat.rincian}`,
        saran: "Fix VITE_MIDNIGHT_NETWORK or VITE_VOTEPRIV_REGISTRY in your environment, then reload.",
      };
  }
}

export function PanelGagalRantai({
  galat,
  jaringan,
  percobaan,
  onCoba,
}: {
  galat: GalatRantai;
  /** null ketika konfigurasi sendiri yang gagal. TIDAK PERNAH diisi objek rekaan. */
  jaringan: JaringanAktif | null;
  percobaan: number;
  onCoba: () => void;
}) {
  const { judul, kalimat, saran } = pesanGagal(galat, jaringan);
  const Ikon =
    galat.sebab === "jaringan" ? Unplug
    : galat.sebab === "dekode" || galat.sebab === "konfigurasi" ? AlertTriangle
    : ServerCrash;
  return (
    <div className="empty-state" role="alert" data-sebab={galat.sebab}>
      <Ikon size={22} />
      <h3>{judul}</h3>
      <p>{kalimat}</p>
      <p>{saran}</p>
      <button className="primary-button" onClick={onCoba}>
        <RefreshCcw size={15} /> Retry
      </button>
      {percobaan > 0 && <p className="ballot-tag">Attempt {percobaan + 1}</p>}
    </div>
  );
}

/**
 * Spanduk kegagalan SEBAGIAN.
 *
 * BUKAN permukaan gagal: daftar ballot yang berhasil dibaca tetap tampil di
 * bawahnya. registry.register() bersifat permissionless dan registry.compact
 * sendiri menyebut entri yang tidak resolve harus disaring di sisi klien —
 * menyembunyikan seluruh daftar karena satu entri sampah berarti siapa pun
 * dapat mematikan halaman ini dengan satu transaksi.
 */
export function SpandukSebagian({ gagal }: { gagal: BallotGagal[] }) {
  if (gagal.length === 0) return null;
  return (
    <div className="privacy-callout" role="status">
      <AlertTriangle size={17} />
      <span>
        <strong>
          {gagal.length} registry {gagal.length === 1 ? "entry" : "entries"} could not be read.
        </strong>{" "}
        The registry is permissionless, so anyone can add an entry that is not a VotePriv ballot. The
        ballots below were read successfully.
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Tulis `client/src/components/votepriv/KeadaanRantai.test.tsx`**

```typescript
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GalatRantai } from "@/lib/chain";
import type { JaringanAktif, SebabGalatRantai } from "@/lib/chain";
import { GridBallotMemuat, PanelGagalRantai, SpandukSebagian, pesanGagal } from "./KeadaanRantai";

afterEach(() => cleanup());

const JARINGAN: JaringanAktif = {
  networkId: "preview",
  indexer: "https://indexer.contoh.test/api/v3/graphql",
  indexerWS: "",
  alamatRegistry: "aabbcc",
};

const SEMUA_SEBAB: SebabGalatRantai[] = [
  "jaringan",
  "http",
  "bukan-json",
  "balasan-html",
  "graphql-fatal",
  "registry-hilang",
  "dekode",
  "konfigurasi",
];

describe("pesanGagal", () => {
  it("punya kalimat untuk SETIAP sebab — tidak ada cabang lain-lain", () => {
    for (const sebab of SEMUA_SEBAB) {
      const p = pesanGagal(new GalatRantai(sebab, "rincian", "indexer.contoh.test"), JARINGAN);
      expect(p.judul.length).toBeGreaterThan(0);
      expect(p.kalimat.length).toBeGreaterThan(0);
      expect(p.saran.length).toBeGreaterThan(0);
    }
  });

  it("memberi judul yang BERBEDA untuk setiap sebab", () => {
    const judul = SEMUA_SEBAB.map(s => pesanGagal(new GalatRantai(s, "r", "h"), JARINGAN).judul);
    expect(new Set(judul).size).toBe(SEMUA_SEBAB.length);
  });

  it("TIDAK PERNAH berbunyi seperti daftar kosong", () => {
    for (const sebab of SEMUA_SEBAB) {
      const p = pesanGagal(new GalatRantai(sebab, "r", "h"), JARINGAN);
      const teks = `${p.judul} ${p.kalimat} ${p.saran}`.toLowerCase();
      expect(teks).not.toContain("no ballots found");
    }
  });

  it("menyebut HOST pada kegagalan transport", () => {
    const p = pesanGagal(new GalatRantai("jaringan", "Failed to fetch", "indexer.contoh.test"), JARINGAN);
    expect(p.kalimat).toContain("indexer.contoh.test");
  });

  it("menyebut ALAMAT REGISTRY dan JARINGAN pada registry yang tidak ditemukan", () => {
    const p = pesanGagal(new GalatRantai("registry-hilang", "not found", "h"), JARINGAN);
    expect(p.kalimat).toContain(JARINGAN.alamatRegistry);
    expect(p.kalimat).toContain(JARINGAN.networkId);
  });

  it("TIDAK mengkonflasikan kegagalan kueri dengan registry yang salah jaringan", () => {
    // Keduanya sempat memakai sebab yang sama, sehingga setiap galat GraphQL —
    // termasuk skema indexer yang berubah — dilaporkan sebagai "Registry not
    // found on this network" dan mengirim pembaca memeriksa VITE_MIDNIGHT_NETWORK
    // yang sebenarnya benar.
    const skema = pesanGagal(new GalatRantai("graphql-fatal", 'Unknown field "applyStage"', "h"), JARINGAN);
    const hilang = pesanGagal(new GalatRantai("registry-hilang", "not found", "h"), JARINGAN);
    expect(skema.judul).not.toBe(hilang.judul);
    expect(skema.judul).not.toMatch(/registry/i);
    expect(skema.saran).not.toMatch(/VITE_MIDNIGHT_NETWORK/);
    expect(hilang.saran).toMatch(/VITE_MIDNIGHT_NETWORK/);
  });

  it("TIDAK menyebut jaringan apa pun pada kegagalan konfigurasi", () => {
    // Salah ketik VITE_MIDNIGHT_NETWORK=previewe terjadi SEBELUM ada jaringan
    // yang dituju. Melaporkannya sebagai kegagalan "preview" — jaringan yang
    // justru tidak diminta — menuntut objek konfigurasi yang dikarang, dan uji
    // ini yang melarangnya.
    const p = pesanGagal(
      new GalatRantai("konfigurasi", 'Unknown VITE_MIDNIGHT_NETWORK: "previewe". Valid values: preprod, preview, undeployed', ""),
      null,
    );
    // Nilai yang DIMINTA operator ikut ditampilkan apa adanya…
    expect(p.kalimat).toContain("previewe");
    // …tetapi kalimatnya TIDAK menyatakan bahwa sebuah jaringan gagal dibaca.
    // (Daftar nilai yang sah di dalam rincian memang menyebut "preview"; yang
    //  dilarang adalah MENGKLAIM jaringan itu sebagai jaringan yang dituju.)
    expect(p.kalimat).not.toMatch(/on the \w+ network/);
    expect(p.kalimat).not.toMatch(/could not connect to/);
    expect(p.judul).toMatch(/misconfigured/i);
    expect(p.judul).not.toMatch(/indexer/i);
  });

  it("tetap memberi kalimat konfigurasi walau jaringan kebetulan ada", () => {
    const p = pesanGagal(new GalatRantai("konfigurasi", "bad registry address", ""), JARINGAN);
    expect(p.judul).toMatch(/misconfigured/i);
  });
});

describe("PanelGagalRantai", () => {
  it("memberi tombol Retry yang benar-benar memanggil balik", () => {
    const onCoba = vi.fn();
    const { container } = render(
      <PanelGagalRantai
        galat={new GalatRantai("jaringan", "Failed to fetch", "indexer.contoh.test")}
        jaringan={JARINGAN}
        percobaan={0}
        onCoba={onCoba}
      />,
    );
    container.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(onCoba).toHaveBeenCalledTimes(1);
  });

  it("membawa sebabnya ke DOM supaya dapat diperiksa uji dan laporan galat", () => {
    const { container } = render(
      <PanelGagalRantai
        galat={new GalatRantai("balasan-html", "portal", "h")}
        jaringan={JARINGAN}
        percobaan={2}
        onCoba={() => {}}
      />,
    );
    expect(container.querySelector("[data-sebab]")!.getAttribute("data-sebab")).toBe("balasan-html");
    expect(container.textContent).toContain("Attempt 3");
  });

  it("memakai role alert supaya pembaca layar mengumumkannya", () => {
    const { container } = render(
      <PanelGagalRantai
        galat={new GalatRantai("http", "502", "h")}
        jaringan={JARINGAN}
        percobaan={0}
        onCoba={() => {}}
      />,
    );
    expect(container.querySelector("[role='alert']")).not.toBeNull();
  });
});

describe("GridBallotMemuat", () => {
  it("merender kartu kerangka yang menandai dirinya sedang sibuk", () => {
    const { container } = render(<GridBallotMemuat count={3} />);
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(3);
    expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(3);
  });

  it("TIDAK pernah memakai teks keadaan kosong", () => {
    const { container } = render(<GridBallotMemuat />);
    expect(container.textContent).not.toContain("No ballots found");
  });
});

describe("SpandukSebagian", () => {
  it("tidak merender apa pun ketika tidak ada kegagalan", () => {
    const { container } = render(<SpandukSebagian gagal={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("menyebut jumlah entri yang gagal dibaca", () => {
    const { container } = render(
      <SpandukSebagian
        gagal={[
          { alamat: "aa", sebab: "dekode", pesan: "bukan ballot" },
          { alamat: "bb", sebab: "kontrak-null", pesan: "tidak ada kontrak" },
        ]}
      />,
    );
    expect(container.textContent).toContain("2 registry entries");
  });
});
```

- [ ] **Step 4: Tulis `client/src/hooks/useDataRantai.test.tsx`**

```typescript
import { readFileSync } from "node:fs";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDataRantai } from "./useDataRantai";

afterEach(() => cleanup());

const DIR = new URL("../test/fixture-rantai/", import.meta.url);
const baca = (n: string) => JSON.parse(readFileSync(new URL(n, DIR), "utf8"));
const fxRegistry = baca("registry.json");
const fxBallots = baca("ballots.json");
const fxJaringan = baca("jaringan.json");

function ambilSehat(): typeof fetch {
  return (async (_u: string, init: RequestInit) => {
    const nama = /query\s+(\w+)/.exec(JSON.parse(String(init.body)).query)?.[1] ?? "?";
    const j = nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
    return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function Probe({ ambil }: { ambil: typeof fetch }) {
  const d = useDataRantai({ ambil });
  return (
    <div>
      <span data-testid="fase">{d.fase}</span>
      <span data-testid="jumlah">{d.fase === "siap" ? d.ballots.length : -1}</span>
      <span data-testid="sebab">{d.fase === "gagal" ? d.galat.sebab : ""}</span>
      {/* "null" apa adanya, supaya uji dapat membuktikan bahwa hook TIDAK
          mengarang objek jaringan ketika konfigurasinya sendiri gagal. */}
      <span data-testid="jaringan">{d.jaringan === null ? "null" : d.jaringan.networkId}</span>
      <button onClick={d.muatUlang}>ulang</button>
    </div>
  );
}

describe("useDataRantai", () => {
  it("mulai dari memuat, lalu siap dengan daftar ballot", async () => {
    const { getByTestId } = render(<Probe ambil={ambilSehat()} />);
    expect(getByTestId("fase").textContent).toBe("memuat");
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("siap"));
    expect(Number(getByTestId("jumlah").textContent)).toBe(fxBallots.alamat.length);
  });

  it("jatuh ke gagal — BUKAN ke siap dengan daftar kosong — ketika indexer tak terjangkau", async () => {
    // Inilah aturan paling penting di seluruh task ini: kegagalan indexer TIDAK
    // BOLEH terlihat seperti "tidak ada ballot".
    const ambil = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const { getByTestId } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("gagal"));
    expect(getByTestId("sebab").textContent).toBe("jaringan");
    expect(Number(getByTestId("jumlah").textContent)).toBe(-1);
  });

  it("jatuh ke gagal bersebab registry-hilang — BUKAN graphql-fatal — ketika registry tidak ditemukan", async () => {
    const ambil = (async (_u: string, init: RequestInit) => {
      const nama = /query\s+(\w+)/.exec(JSON.parse(String(init.body)).query)?.[1] ?? "?";
      const j = nama === "Registry" ? { data: { r: null }, errors: [] } : fxJaringan;
      return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const { getByTestId } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("gagal"));
    // Sebab yang tepat penting: permukaannya menyuruh pembaca memeriksa
    // VITE_MIDNIGHT_NETWORK, dan saran itu SALAH untuk graphql-fatal.
    expect(getByTestId("sebab").textContent).toBe("registry-hilang");
  });

  it("muatUlang memicu pembacaan baru", async () => {
    const ambil = vi.fn(ambilSehat()) as unknown as typeof fetch;
    const { getByTestId, getByText } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("siap"));
    const sebelum = (ambil as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await act(async () => {
      getByText("ulang").click();
    });
    await waitFor(() =>
      expect((ambil as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(sebelum),
    );
  });

  it("jatuh ke gagal bersebab konfigurasi TANPA mengarang jaringan", async () => {
    // Salah ketik env terjadi sebelum ada jaringan yang dituju. Hook TIDAK BOLEH
    // mengembalikan objek JaringanAktif rekaan, karena objek rekaan akan menyebut
    // jaringan yang justru tidak diminta operator.
    vi.stubEnv("VITE_MIDNIGHT_NETWORK", "previewe");
    const ambil = vi.fn() as unknown as typeof fetch;
    const { getByTestId } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("gagal"));
    expect(getByTestId("sebab").textContent).toBe("konfigurasi");
    expect(getByTestId("jaringan").textContent).toBe("null");
    // Dan tidak satu pun permintaan pernah berangkat.
    expect((ambil as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("tidak memperbarui keadaan setelah komponen dilepas", async () => {
    // Tanpa AbortController, unmount di tengah fetch menghasilkan setState pada
    // komponen yang sudah hilang — peringatan React yang membanjiri konsol dan
    // menyembunyikan galat sungguhan.
    const spion = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<Probe ambil={ambilSehat()} />);
    unmount();
    await new Promise(r => setTimeout(r, 50));
    expect(spion).not.toHaveBeenCalled();
    spion.mockRestore();
  });
});
```

- [ ] **Step 5: Jalankan uji baru**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm test client/src/hooks/useDataRantai.test.tsx client/src/components/votepriv/KeadaanRantai.test.tsx 2>&1 | tail -15
```

Diharapkan: seluruh uji di kedua berkas hijau. `pnpm check` masih merah di sisi komponen lama — itu masih daftar kerja Task 8.

- [ ] **Step 6: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/hooks/useDataRantai.ts client/src/hooks/useDataRantai.test.tsx \
        client/src/components/votepriv/KeadaanRantai.tsx client/src/components/votepriv/KeadaanRantai.test.tsx
git commit -m "feat(ui): mesin keadaan pembacaan rantai dan permukaan memuat/gagal

Data mockup selalu ada seketika; data indexer tidak — terukur 1.047-1.279 ms
dari layanan publik yang tidak kita kendalikan. Sebelum ini, tidak satu pun dari
keadaan memuat, indexer tak terjangkau, registry tidak ditemukan, dan state
gagal didekode punya tempat di UI.

Hook mengembalikan TIGA fase yang dapat dibedakan, bukan sekadar Ballot[]. Hook
yang hanya mengembalikan larik memaksa UI menampilkan daftar kosong pada fase
memuat DAN pada fase gagal, dan itulah bagaimana kegagalan indexer berubah jadi
tidak ada ballot. Dijaga uji, bukan disiplin.

Kegagalan SEBAGIAN bukan kegagalan: registry permissionless, jadi menyembunyikan
seluruh daftar karena satu entri sampah berarti siapa pun dapat mematikan
halaman ini dengan satu transaksi.

Seluruh nama kelas memakai yang sudah ada di index.css. Tidak satu baris CSS
pun ditambah."
```

**Deliverable:** tiga fase yang dapat dibedakan komponen; enam kalimat galat yang masing-masing menyebut apa yang dicoba; spanduk sebagian yang tidak menyembunyikan yang berhasil; uji yang melarang kegagalan menyamar sebagai daftar kosong.

---

### Task 8: Pemasangan ke tujuh komponen, dan uji pengganti

Daftar kerja task ini **bukan ditebak** — ia adalah keluaran `pnpm check` dari Task 6 Step 6. Kompiler sudah menunjuk setiap tempat yang harus disesuaikan.

**Files:**
- Modify: `client/src/pages/Home.tsx`, `client/src/components/votepriv/BallotCard.tsx`, `client/src/components/votepriv/LiveBallots.tsx`, `client/src/components/votepriv/Overview.tsx`, `client/src/components/votepriv/Results.tsx`, `client/src/components/votepriv/VoteModal.tsx`, `client/src/components/votepriv/CreateBallotModal.tsx`
- Modify: `client/src/components/votepriv/BallotCard.test.tsx`, `client/src/components/votepriv/LiveBallots.test.tsx`, `client/src/components/votepriv/Results.test.tsx`, `client/src/components/votepriv/VoteModal.test.tsx`, `client/src/components/votepriv/CreateBallotModal.test.tsx`, `client/src/pages/Home.smoke.test.tsx`
- **Tidak** disentuh: `client/src/test/cap-tampilan.tsx` — lihat Step 13
- Delete: `client/src/components/votepriv/demo-data.ts` (Step 10 — **pindah dari Task 9**, karena Step 15 menuntut `pnpm check` bersih)
- Create: `client/src/test/paritas-permukaan-rantai.test.tsx`, `client/src/test/fixture-ballot.ts`, `client/src/components/votepriv/Overview.test.tsx`

**Interfaces:**
- Consumes: `@/hooks/useDataRantai`, `@/components/votepriv/KeadaanRantai`, `@/lib/chain/ke-ballot` (`labelNomor`), `@/components/votepriv/ballot-status` (`statusLabel`, `statusTone`, `menerimaSuara`)
- Produces:
  - `ballotUji(ubah?: Partial<Ballot>): Ballot` di `client/src/test/fixture-ballot.ts` — satu pembuat `Ballot` lengkap yang dipakai seluruh uji komponen, sehingga penambahan field berikutnya menyentuh **satu** berkas, bukan lima
  - Tanda tangan komponen yang berubah, seluruhnya karena data rantai membawa konteks yang sebelumnya tidak ada:

| Komponen | Sebelum | Sesudah |
|---|---|---|
| `Overview` | `{ ballots, onVote, onCreate, onSection }` | `{ hasil: HasilRantai, ballots, onVote, onCreate, onSection }` — `hasil` membawa `blok`, `epoch`, dan aksi kontrak untuk Recent activity |
| `LiveBallots` | `{ ballots, onVote, onCreate }` | `{ ballots, onVote, onCreate, atas?: React.ReactNode }` — `atas` adalah tempat shell menyuntikkan spanduk sebagian |
| `Results` | `{ ballots, receipt }` | `{ ballots, receipt, jaringan: JaringanAktif, blokHeight: number, onMuatUlang: () => void }` — cap provenans menyebut jaringan dan tinggi blok, menggantikan badge `Demo data`; `onMuatUlang` membuat tombol "Verify all" yang selama ini inert benar-benar melakukan sesuatu |
| `CreateBallotModal` | `{ onClose, onCreate }` | `{ onClose }` — `onCreate` hilang; deploy sungguhan adalah C-2b; dicabut di **Task 8 Step 9** |
| `BallotCard`, `VoteModal`, `Docs` | — | tanda tangan tidak berubah; isinya yang berubah |

- [ ] **Step 1: Ambil daftar kerja dari kompiler, bukan dari ingatan**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
{ pnpm check 2>&1; pnpm check:uji 2>&1; } | grep -oE '^[^(]+\.tsx?' | sort -u
```

Diharapkan: daftar berkas yang harus disentuh. **Itulah daftar kerja task ini.** `check:uji` ikut dijalankan karena `pnpm check` sendiri tidak memeriksa berkas `*.test.ts` — tanpa keduanya, daftar kerja ini bohong dengan cara yang tidak terlihat. Bila sebuah berkas yang Anda kira perlu diubah tidak muncul, periksa apakah ia memang tidak memakai field yang berubah — jangan menyentuhnya "untuk berjaga-jaga".

Daftar itu akan memuat sekurang-kurangnya `Overview.tsx`, `LiveBallots.tsx`, `Results.tsx`, `BallotCard.tsx`, `VoteModal.tsx`, `CreateBallotModal.tsx`, `demo-data.ts`, `Home.tsx`, dan kelima berkas `*.test.tsx` di `components/votepriv/`. Dua di antaranya — `demo-data.ts` dan `CreateBallotModal.create()` — **tidak dapat diperbaiki dengan menyesuaikan tipe**: keduanya menyusun objek `Ballot` lengkap di tempat, dan nilai-nilai baru (`nomor`, `deployHeight`, `keadaanHasil`, …) hanya ada setelah kontrak benar-benar ter-deploy. Keduanya dicabut di **Step 9 dan Step 10** task ini, bukan di Task 9.

- [ ] **Step 2: Buat satu pembuat fixture `Ballot` untuk seluruh uji komponen**

Sebelum C-2a, lima berkas uji masing-masing menuliskan objek `Ballot` sendiri. Dengan field yang bertambah, itu berarti setiap penambahan field berikutnya menyentuh lima berkas. Satu pembuat menutupnya.

`client/src/test/fixture-ballot.ts`:

```typescript
import type { Ballot } from "@/components/votepriv/types";

/**
 * Satu pembuat Ballot untuk seluruh uji komponen.
 *
 * Sebelumnya lima berkas uji masing-masing menuliskan objek Ballot sendiri,
 * sehingga setiap field baru menuntut lima suntingan. Nilai bawaan di sini
 * meniru ballot yang BENAR-BENAR ADA di rantai — termasuk kuorum yang tidak
 * ditegakkan dan kebijakan eligibility yang berbunyi seperti aslinya — supaya
 * uji tidak diam-diam menguji bentuk data yang tidak pernah muncul.
 */
export function ballotUji(ubah: Partial<Ballot> = {}): Ballot {
  const voteDeadlineMs = Date.UTC(2026, 9, 18, 12, 0, 0);
  return {
    id: "f597222dde4be5b8f13944bed3cd3d7a9fe0223c9c9cefafec98cdf42d1ebec8",
    nomor: 1,
    title: "Q4 Community Treasury",
    description: "Choose how the community treasury supports public goods in Q4.",
    community: "Midnight Builders",
    votes: 0,
    eligible: 3,
    registered: 3,
    tallied: 0,
    quorum: 60,
    eligibilityPolicy: "Tiga credential uji end-to-end",
    deadline: "Oct 18, 2026, 12:00 UTC",
    voteDeadlineMs,
    tallyDeadlineMs: voteDeadlineMs + 35 * 60 * 1000,
    phase: 0,
    status: "live",
    options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
    // SELALU larik padat sepanjang options — tidak pernah null. Yang membedakan
    // "tersegel" dari "final tanpa satu pun dibuka" adalah keadaanHasil.
    tallies: [0, 0, 0],
    keadaanHasil: "tersegel",
    accent: "mint",
    tag: "Open",
    deployHeight: 810_832,
    ...ubah,
  };
}
```

- [ ] **Step 3: Sesuaikan `BallotCard.tsx`**

Tiga perubahan, masing-masing menutup satu kebohongan yang mungkin:

1. `statusTone()` menggantikan `ballot.status` sebagai kelas badge — kelima status dipetakan ke tiga tone yang sudah ada.
2. Kuorum disebut sebagai **niat**, bukan ambang.
3. `eligibilityPolicy` ditampilkan (baris §9.4 yang sebelumnya tidak punya tempat).

```typescript
import { ArrowUpRight, ChevronRight, Clock3, Globe2, ShieldCheck, Vote } from "lucide-react";
import { menerimaSuara, statusLabel, statusTone } from "./ballot-status";
import { labelNomor } from "@/lib/chain/ke-ballot";
import type { Ballot } from "./types";

export function BallotCard({ ballot, onVote }: { ballot: Ballot; onVote: (ballot: Ballot) => void }) {
  const percentage = Math.min(100, Math.round((ballot.votes / Math.max(ballot.eligible, 1)) * 100));
  return (
    <article className={`ballot-card accent-${ballot.accent}`}>
      <div className="card-topline">
        {/* statusTone, BUKAN status: kelima status dipetakan ke tiga tone yang
            memang ada di index.css. Memakai status langsung akan menghasilkan
            kelas tally-open dan awaiting-finalize yang tidak punya aturan CSS. */}
        <span className={`status-badge ${statusTone(ballot.status)}`}>
          <span /> {statusLabel(ballot.status)}
        </span>
        <span className="ballot-tag">{labelNomor(ballot.nomor)} · {ballot.tag}</span>
      </div>
      <div className="ballot-title-row">
        <div>
          <h3>{ballot.title}</h3>
          <p>{ballot.description}</p>
        </div>
        <div className="ballot-symbol"><Vote size={19} /></div>
      </div>
      <div className="ballot-meta">
        <span><Globe2 size={14} /> {ballot.community}</span>
        <span><Clock3 size={14} /> {ballot.deadline}</span>
        {/* Baris spec 9.4 yang sebelumnya tidak punya tempat di UI. */}
        {ballot.eligibilityPolicy !== "" && (
          <span><ShieldCheck size={14} /> {ballot.eligibilityPolicy}</span>
        )}
      </div>
      <div className="ballot-progress-label"><span>Participation</span><strong>{percentage}%</strong></div>
      <div className="progress-track slim"><span style={{ width: `${percentage}%` }} /></div>
      <div className="ballot-footer">
        {/* "intended quorum", bukan "quorum": ballot.compact menulis sendiri bahwa
            quorumPercent tidak pernah dibaca circuit mana pun dan finalize()
            berhasil pada partisipasi 0% persis seperti pada 100%. */}
        <span>
          {ballot.votes.toLocaleString()} of {ballot.eligible.toLocaleString()} votes <i>·</i>{" "}
          {ballot.quorum}% intended quorum
        </span>
        {menerimaSuara(ballot.status) ? (
          <button className="text-button" onClick={() => onVote(ballot)}>Vote privately <ChevronRight size={14} /></button>
        ) : (
          <button className="text-button" onClick={() => onVote(ballot)}>View result <ArrowUpRight size={14} /></button>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Sesuaikan `LiveBallots.tsx` — chip filter yang tidak bisa berbohong**

Chip lama berbunyi `Live <jumlah status === "live">`. Dengan status turunan, angka itu menjadi jujur dengan sendirinya — tetapi dua chip saja tidak cukup menggambarkan lima status, dan chip yang menghitung nol harus tetap tampil, karena "Live 0" adalah informasi sementara chip yang hilang adalah kebingungan.

```typescript
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { BallotCard } from "./BallotCard";
import { menerimaSuara } from "./ballot-status";
import type { Ballot } from "./types";

export function LiveBallots({
  ballots,
  onVote,
  onCreate,
  atas,
}: {
  ballots: Ballot[];
  onVote: (ballot: Ballot) => void;
  onCreate: () => void;
  /** Permukaan memuat / gagal / spanduk sebagian, disuntikkan shell. */
  atas?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const filtered = ballots.filter(b =>
    `${b.title} ${b.community}`.toLowerCase().includes(query.toLowerCase()),
  );
  // Dihitung dari STATUS TURUNAN, bukan dari phase. Sebelum C-2a, chip "Live"
  // menghitung phase === voting dan karena itu menghitung ballot yang kontraknya
  // sudah menolak semua suara. Angka itu bohong, dan sekarang tidak bisa lagi.
  const nLive = ballots.filter(b => menerimaSuara(b.status)).length;
  const nTally = ballots.filter(b => b.status === "tally-open").length;
  const nMenunggu = ballots.filter(b => b.status === "awaiting-finalize").length;
  const nFinal = ballots.filter(b => b.status === "finalized").length;
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow"><span className="eyebrow-mark" /> Community governance</p>
          <h1>Live ballots</h1>
          <p>Private decisions, open verification. Find a ballot and make your voice count.</p>
        </div>
        <button className="primary-button" onClick={onCreate}><Plus size={16} /> Create ballot</button>
      </div>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ballots or communities" />
        </div>
        <div className="filter-chip active">All <span>{ballots.length}</span></div>
        <div className="filter-chip">Open <span>{nLive}</span></div>
        <div className="filter-chip">Tally <span>{nTally}</span></div>
        <div className="filter-chip">Needs finalizing <span>{nMenunggu}</span></div>
        <div className="filter-chip">Finalized <span>{nFinal}</span></div>
      </div>
      {atas}
      <div className="ballots-grid">
        {filtered.map(b => <BallotCard key={b.id} ballot={b} onVote={onVote} />)}
      </div>
      {/* Keadaan kosong HANYA muncul ketika daftar memang kosong setelah
          pembacaan BERHASIL. Shell tidak pernah merender komponen ini pada fase
          memuat maupun gagal — lihat Home.tsx dan uji paritas-permukaan-rantai. */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <Search size={22} />
          <h3>No ballots found</h3>
          <p>{ballots.length === 0 ? "The registry has no ballots yet." : "Try a different community or title."}</p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Sesuaikan `Overview.tsx` — metrik, network status, dan recent activity**

Empat perubahan, masing-masing mengganti angka karangan dengan angka terbaca — dan satu gerbang terhadap registry kosong:

1. **"Active ballots 12"** → dihitung dari status turunan, dengan label yang jujur. Membacanya sebagai `phase != finalized` memberi angka yang menghitung ballot yang kontraknya sudah menolak semua suara; yang benar adalah `menerimaSuara(status)`.
2. **"Last block 1,928,441 · Demo data"** → `blok.height` sungguhan; baris finality diganti posisi epoch, karena **finality tidak punya field di skema**.
3. **Recent activity** → tiga baris yang diketik tangan diganti **selisih ledger yang benar-benar dihitung** dari snapshot per aksi. Ini bagian yang JSX-nya ditulis lengkap di bawah, bukan disinggung.
4. **`const featured = ballots[0]`** → registry yang kosong membuat `featured` `undefined`, dan baris berikutnya membaca `featured.votes`. **Itu crash**, dan ia persis lubang yang rencana ini janjikan tutup. Digerbangi permukaan kosong.

**Pembantu, di kepala `Overview.tsx`:**

```typescript
// (potongan yang berubah; sisa berkas tetap)
import { labelNomor } from "@/lib/chain/ke-ballot";
import { menerimaSuara, statusLabel, statusTone } from "./ballot-status";
import type { AksiTerbaca, HasilRantai, PerubahanAksi } from "@/lib/chain";

/**
 * Recent activity, BENAR-BENAR DIBACA dari rantai.
 *
 * Yang membuat kalimat itu benar bukan pengambilan `state`-nya, melainkan
 * PEMAKAIANNYA: baca-rantai.ts mendekode snapshot ledger pada setiap aksi dan
 * menyelisihkannya terhadap aksi sebelumnya, sehingga `a.perubahan` memuat
 * "voteCount 2 → 3" dan bukan sekadar "castVote dipanggil". Spec 9.4 meminta
 * persis itu: "perubahan terbaru pada voteCount, talliedCount, dan
 * registry.count".
 *
 * Nama entry point tetap dipakai untuk JUDUL baris, karena ia memang nama
 * tindakannya. Yang tidak boleh terjadi adalah judul itu berpura-pura sebagai
 * pembacaan ketika tidak ada angka di belakangnya — lihat `detailAksi`.
 */
function labelAksi(a: AksiTerbaca): string {
  if (a.jenis === "ContractDeploy") return "Contract deployed";
  if (a.jenis === "ContractUpdate") return "Contract updated";
  switch (a.entryPoint) {
    case "castVote": return "Vote sealed";
    case "tallyVote": return "Vote opened";
    case "registerVoters": return "Voters registered";
    case "finalize": return "Ballot finalized";
    case "register": return "Ballot registered";
    default: return a.entryPoint ?? "Contract call";
  }
}

/** Nama bidang ledger untuk mata manusia. Teks UI Inggris. */
const NAMA_BIDANG: Record<PerubahanAksi["bidang"], string> = {
  voteCount: "sealed votes",
  talliedCount: "opened votes",
  registeredCount: "registered voters",
  phase: "phase",
  count: "registered ballots",
};

/**
 * Baris kedua setiap entri aktivitas — dan satu-satunya tempat klaim
 * "dibaca dari ledger" ditunaikan atau ditarik.
 *
 * TIGA kemungkinan, dan ketiganya jujur:
 *   - ada selisih         → "sealed votes 2 → 3"
 *   - pendahulu terbaca, tidak ada yang berubah → "no ledger change"
 *   - pendahulu di luar jendela actions()       → "earlier state not read"
 *
 * Kalimat ketiga itu yang membedakan rencana ini dari yang sebelumnya: ia
 * mengaku tidak tahu alih-alih melaporkan nol perubahan.
 */
function detailAksi(a: AksiTerbaca): string {
  if (a.perubahan.length > 0) {
    return a.perubahan.map(p => `${NAMA_BIDANG[p.bidang]} ${p.dari} → ${p.ke}`).join(" · ");
  }
  if (!a.cuplikanTerbaca) return "ledger state could not be read";
  if (!a.pendahuluTerbaca) return "earlier state not read";
  return "no ledger change";
}

/** Blok waktu aksi, diformat UTC seperti seluruh waktu lain di aplikasi ini. */
const FORMAT_AKSI = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

/**
 * Warna ikon diturunkan dari JENIS perubahan, bukan diputar menurut indeks.
 * Ketiga kelas sudah ada di index.css: .activity-icon.mint/.violet/.blue.
 */
function toneAksi(a: AksiTerbaca): "mint" | "violet" | "blue" {
  if (a.perubahan.some(p => p.bidang === "talliedCount" || p.bidang === "phase")) return "blue";
  if (a.perubahan.some(p => p.bidang === "voteCount")) return "mint";
  return "violet";
}

export function aktivitasTerbaru(hasil: HasilRantai, batas = 3): AksiTerbaca[] {
  return [...hasil.registry.aksi, ...hasil.ballot.flatMap(b => b.aksi)]
    .sort((x, y) => y.height - x.height)
    .slice(0, batas);
}
```

**Panel Recent activity, JSX lengkap.** Ia menggantikan larik `recent` yang diketik tangan dan seluruh `.activity-list` yang merendernya. Seluruh nama kelas sudah ada di `index.css`:

```typescript
<div className="side-panel">
  <div className="panel-heading">
    <div>
      <p className="eyebrow">A quiet audit trail</p>
      <h2>Recent activity</h2>
    </div>
    <button className="icon-button" aria-label="View activity"><ArrowUpRight size={16} /></button>
  </div>
  <div className="activity-list">
    {aktivitasTerbaru(hasil).map((a) => (
      /* txHash + height unik per aksi; alamat kontrak tidak, karena satu
         kontrak menyumbang beberapa baris. */
      <div className="activity-item" key={`${a.txHash}-${a.height}`}>
        <div className={`activity-icon ${toneAksi(a)}`}>
          {a.jenis === "ContractDeploy" ? <Plus size={16} />
            : a.entryPoint === "tallyVote" || a.entryPoint === "finalize" ? <BarChart3 size={16} />
            : <ShieldCheck size={16} />}
        </div>
        <div>
          <strong>{labelAksi(a)}</strong>
          {/* Sumber, selisih ledger, blok, dan waktu. Keempatnya fakta rantai;
              tidak satu pun diturunkan dari jam perangkat atau dikarang. */}
          <span>
            {a.sumber} · {detailAksi(a)} · block {a.height.toLocaleString()} ·{" "}
            {FORMAT_AKSI.format(new Date(a.timestampMs))} UTC
          </span>
        </div>
        {/* Centang HANYA ketika ada angka ledger yang benar-benar terbaca.
            Mencentang baris yang selisihnya tidak diketahui berarti memberi
            tanda "terverifikasi" pada sesuatu yang tidak diperiksa. */}
        {a.cuplikanTerbaca && (
          <span className="activity-check"><Check size={12} /></span>
        )}
      </div>
    ))}
    {aktivitasTerbaru(hasil).length === 0 && (
      <div className="activity-item">
        <div className="activity-icon violet"><CircleHelp size={16} /></div>
        <div>
          <strong>No contract activity read</strong>
          <span>The registry and its ballots reported no recent actions.</span>
        </div>
      </div>
    )}
  </div>
  <button className="panel-link" onClick={() => onSection("Results")}>Open audit log <ArrowUpRight size={14} /></button>
</div>
```

**Gerbang registry kosong.** Diletakkan **paling atas** di badan `Overview`, sebelum `featured` dipakai sama sekali:

```typescript
export function Overview({ hasil, ballots, onVote, onCreate, onSection }: {
  hasil: HasilRantai;
  ballots: Ballot[];
  onVote: (ballot: Ballot) => void;
  onCreate: () => void;
  onSection: (section: Section) => void;
}) {
  // ballots[0] pada registry KOSONG bernilai undefined, dan baris berikutnya
  // membaca featured.votes. Itu crash — dan ia persis lubang yang rencana ini
  // janjikan tutup, karena registry yang benar-benar kosong adalah keadaan yang
  // SAH: pembacaan berhasil, hanya tidak ada ballot yang terdaftar.
  //
  // Ini BUKAN permukaan gagal. Home hanya merender Overview pada fase `siap`,
  // jadi sampai di sini pembacaan sudah pasti berhasil.
  if (ballots.length === 0) {
    return (
      <section className="page-section">
        <div className="page-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-mark" /> Midnight {hasil.jaringan.networkId}</p>
            <h1>No ballots yet.</h1>
            <p>
              The registry at {hasil.jaringan.alamatRegistry.slice(0, 12)}… was read successfully
              and holds no ballots. Block {hasil.blok.height.toLocaleString()}.
            </p>
          </div>
          <button className="primary-button" onClick={onCreate}><Plus size={16} /> Create ballot</button>
        </div>
        <div className="empty-state">
          <Vote size={22} />
          <h3>The registry is empty</h3>
          <p>Every ballot is discovered through the registry. Once one is registered, it appears here.</p>
        </div>
      </section>
    );
  }

  const featured = ballots[0];
  // … sisa Overview …
}
```

**Kartu hero `hero-proof-card`, yang mengklaim lapis bukti yang tidak ada.**

Kartu itu berbunyi `LIVE PROOF LAYER` dengan lencana `Testnet`, dan di kakinya `zk-verified / without revealing the vote`. Pada build C-2a **tidak ada jalur bukti sama sekali** — tidak ada proof server yang dipakai, tidak ada artefak ZK, tidak ada satu proof pun yang dibuat atau diperiksa. "LIVE" di sana adalah klaim tentang aplikasi ini, dan klaim itu salah.

Yang benar, dan yang tetap dapat dikatakan: **kontraknya** memang dirancang begitu, dan halaman ini menampilkan keadaan kontrak itu. Jadi kalimatnya diarahkan ke kontrak, bukan ke aplikasi:

```typescript
<div className="proof-card-top">
  {/* "LIVE PROOF LAYER" -> pernyataan tentang MODEL kontraknya. C-2a tidak
      membuat maupun memverifikasi satu proof pun; jalur bukti adalah C-2b.
      Lencana jaringan memakai jaringan yang benar-benar dibaca. */}
  <span className="mini-label">PRIVACY MODEL</span>
  <span className="network-dot"><span /> {hasil.jaringan.networkId}</span>
</div>
…
<div className="proof-card-bottom">
  <div>
    <strong>Proofs verified on-chain</strong>
    <span>by the contract, not by this page</span>
  </div>
  <ArrowUpRight size={17} />
</div>
```

Ini bukan pelunakan yang sia-sia. Ia yang memisahkan dua kalimat yang mudah tertukar: *"kontrak ini memverifikasi bukti"* — benar, dan dapat diperiksa siapa pun yang membaca `ballot.compact` — dari *"halaman ini memverifikasi bukti"*, yang hari ini tidak benar dan tidak akan benar sampai C-2b.

Blok metrik dan kartu network status di dalam `Overview` menjadi:

```typescript
<section className="metric-grid">
  <div className="metric-card">
    <div className="metric-icon mint"><Activity size={18} /></div>
    {/* "Open for voting", bukan "Active ballots": dihitung dari status turunan,
        sehingga ballot yang phase-nya masih voting tetapi deadline-nya sudah
        lewat TIDAK ikut dihitung. Kontraknya menolak suara; menghitungnya
        sebagai aktif adalah angka yang bohong. */}
    <span>Open for voting</span>
    <strong>{ballots.filter(b => menerimaSuara(b.status)).length}</strong>
    <small>of {ballots.length} on the registry</small>
  </div>
  <div className="metric-card">
    <div className="metric-icon violet"><ShieldCheck size={18} /></div>
    <span>Verified votes</span>
    <strong>{ballots.reduce((s, b) => s + b.votes, 0).toLocaleString()}</strong>
    <small>{ballots.reduce((s, b) => s + b.tallied, 0).toLocaleString()} opened so far</small>
  </div>
  <div className="metric-card">
    <div className="metric-icon blue"><LockKeyhole size={18} /></div>
    <span>Tally during voting</span>
    <strong>Sealed</strong>
    <small>Enforced by the contract</small>
  </div>
  <div className="metric-card network-card">
    <div className="metric-network-line">
      <span className="pulse-dot" /> Midnight {hasil.jaringan.networkId}
      <span className="network-live">Operational</span>
    </div>
    <div className="network-bar"><span /><span /><span /><span /><span /><span /><span /><span /></div>
    {/* Finality TIDAK PUNYA FIELD di skema indexer — introspeksi seluruh tipe
        dan field terhadap /final/i mengembalikan NOL hasil. Yang ditampilkan
        adalah padanan terdekat yang benar-benar ada: posisi di dalam epoch.
        Mengarang "2.4s finality" adalah angka tanpa sumber, dan spec 14.6
        sudah menandainya sebagai salah satu dari empat angka semacam itu. */}
    <small>
      Last block <strong>{hasil.blok.height.toLocaleString()}</strong>
      {hasil.epoch
        ? <> · epoch {hasil.epoch.epochNo}, {hasil.epoch.elapsedSeconds}s of {hasil.epoch.durationSeconds}s</>
        : <> · epoch position unavailable</>}
    </small>
  </div>
</section>
```

- [ ] **Step 6: Sesuaikan `Results.tsx` — tersegel, parsial, final**

**EMPAT keadaan yang harus dapat dibedakan** — spec §9.4 menuntut dua, dan rantai hari ini menuntut dua lagi. Lihat **Jebakan 4**: `tallied === 0` bukan sinonim dari "tersegel", dan kalimat "Results sealed until the vote deadline" **salah secara faktual** pada ballot yang vote deadline-nya sudah lewat — keadaan yang `f597222d…` tempati hari ini.

Yang memutuskan adalah `ballot.keadaanHasil`, **bukan** bentuk `ballot.tallies`, dan bukan `ballot.tallied === 0`.

```typescript
// (potongan yang berubah)
{ballots.map((ballot, index) => {
  // tallies SELALU larik padat sepanjang options. Persentase hanya dihitung
  // ketika keadaanHasil mengizinkannya — lihat cabang di bawah.
  const adaHasil = ballot.keadaanHasil === "ada-hasil";
  const memimpin = adaHasil ? Math.max(...ballot.tallies) : 0;
  const pct = adaHasil ? Math.round((memimpin / ballot.tallied) * 100) : 0;
  const parsial = adaHasil && ballot.tallied < ballot.votes;
  return (
    <div className="result-row" key={ballot.id}>
      <div className={`result-number result-${index % 3}`}>{String(ballot.nomor).padStart(2, "0")}</div>
      <div className="result-main">
        <div className="result-row-top">
          <strong>{ballot.title}</strong>
          <span className={`status-badge ${statusTone(ballot.status)}`}>
            <span /> {statusLabel(ballot.status)}
          </span>
        </div>
        {adaHasil ? (
          <div className="result-bar"><span style={{ width: `${pct}%` }} /></div>
        ) : (
          /* Bukan bar nol. Bar 0% terbaca sebagai "tidak ada yang memilih opsi
             ini" — kebalikan dari yang benar pada ketiga keadaan tanpa hasil. */
          <div className="result-bar" aria-hidden="true" />
        )}
        <div className="result-row-bottom">
          <span>{ballot.votes.toLocaleString()} sealed votes</span>
          {/* SATU cabang per keadaan, tanpa cabang lain-lain. Menambah anggota
              KeadaanHasil tanpa menambah cabangnya adalah galat tipe, dan itu
              memang yang diinginkan. */}
          {ballot.keadaanHasil === "ada-hasil" ? (
            parsial ? (
              /* Spec 6.3 butir pertama: suara yang tidak dibuka tidak terhitung,
                 dan selisihnya terlihat publik sebagai voteCount - talliedCount.
                 Menampilkannya adalah bagian dari klaim auditabilitas, bukan
                 catatan kaki. */
              <span>{pct}% leading · {ballot.tallied} of {ballot.votes} opened</span>
            ) : (
              <span>{pct}% leading option</span>
            )
          ) : ballot.keadaanHasil === "tersegel" ? (
            /* BENAR di sini, dan hanya di sini: deadline memang belum lewat. */
            <span>Results stay sealed until {ballot.deadline}</span>
          ) : ballot.keadaanHasil === "menunggu-pembukaan" ? (
            <span>Voting closed · no sealed vote has been opened yet</span>
          ) : (
            /* tidak-ada-yang-dibuka: jendela tally sudah tutup, atau ballot sudah
               final, tanpa satu suara pun dibuka. Kalimat "tersegel sampai
               deadline" di sini adalah kebohongan yang dapat diperiksa siapa pun. */
            <span>
              {ballot.votes === 0
                ? "No votes were cast"
                : `No sealed vote was opened before the tally deadline · ${ballot.votes} sealed, 0 opened`}
            </span>
          )}
        </div>
      </div>
      <ArrowUpRight size={16} className="muted-arrow" />
    </div>
  );
})}
```

Cap `verified-stamp` di kepala halaman berganti dari `Demo data / Not yet read from the chain` menjadi provenans yang sebenarnya:

```typescript
<div className="verified-stamp">
  <ShieldCheck size={18} />
  <span>
    <strong>Read from chain</strong>
    <small>Midnight {jaringan.networkId} · block {blokHeight.toLocaleString()}</small>
  </span>
</div>
```

**Dan satu baris ketiga yang lolos setiap gerbang sampai sekarang.** Panel `privacy-result` di kolom kanan memuat:

```typescript
<div className="privacy-stat"><span>Demo data below</span><strong>Yes</strong></div>
```

Ia berada di `.privacy-stat`, bukan di `.verified-stamp`, sehingga uji yang hanya memeriksa cap provenans tidak pernah menyentuhnya — dan pada halaman yang kini benar-benar membaca rantai, ia berbunyi **salah**. Diganti dengan provenans yang sama sifatnya dengan dua baris di atasnya:

```typescript
<div className="privacy-stat"><span>Choice on the ledger</span><strong>Never</strong></div>
<div className="privacy-stat"><span>Tally during voting</span><strong>Sealed</strong></div>
{/* Menggantikan "Demo data below / Yes". Dua baris di atas adalah pernyataan
    tentang kontrak; baris ini pernyataan tentang ASAL angka di halaman ini,
    dan sekarang ia dapat menyebut sumbernya. */}
<div className="privacy-stat">
  <span>Source</span>
  <strong>Midnight {jaringan.networkId} · block {blokHeight.toLocaleString()}</strong>
</div>
```

**Dan tombol "Verify all", yang tidak memverifikasi apa pun.**

`<button className="secondary-button compact"><ClipboardCheck size={15} /> Verify all</button>` di kepala panel hasil **tidak punya `onClick` sama sekali** — ia inert sejak C-1. Selama halaman ini berisi data mockup, ia sekadar hiasan yang tidak berbuat apa-apa. Pada halaman yang **kini benar-benar membaca rantai**, sebuah tombol berlabel "Verify all" yang tidak melakukan apa pun adalah klaim yang UI tidak tunaikan — kelas cacat yang sama dengan "Demo data below".

Dua jalan keluar, dan yang dipilih adalah yang membuat labelnya benar, bukan yang membuat labelnya kabur: **sambungkan ke pembacaan ulang yang sungguhan.** Di konteks baca-saja, "memverifikasi" memang berarti "ambil ulang keadaan kontrak dari indexer dan hitung ulang" — dan itu persis `muatUlang()` milik `useDataRantai`.

`Results` karena itu menerima satu prop lagi:

```typescript
export function Results({ ballots, receipt, jaringan, blokHeight, onMuatUlang }: {
  ballots: Ballot[];
  receipt: Receipt | null;
  jaringan: JaringanAktif;
  blokHeight: number;
  /** Membaca ULANG seluruh keadaan dari indexer. Inilah arti "verify" di jalur baca-saja. */
  onMuatUlang: () => void;
}) {
```

dan tombolnya menjadi:

```typescript
{/* Label diubah dari "Verify all" menjadi apa yang benar-benar terjadi.
    "Verify" pada jalur BACA berarti: ambil ulang state kontrak dari indexer dan
    hitung ulang persentasenya. Tombol inert berlabel "Verify all" pada halaman
    yang membaca rantai adalah klaim yang tidak ditunaikan — kelas cacat yang
    sama dengan badge "Demo data". */}
<button className="secondary-button compact" onClick={onMuatUlang}>
  <ClipboardCheck size={15} /> Re-read from chain
</button>
```

Ujinya, di `Results.test.tsx`:

```typescript
it("tombol pembacaan ulang benar-benar memanggil balik", () => {
  const onMuatUlang = vi.fn();
  const { container } = render(
    <Results ballots={[ballotUji()]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={onMuatUlang} />,
  );
  container.querySelector<HTMLButtonElement>(".secondary-button")!.click();
  expect(onMuatUlang).toHaveBeenCalledTimes(1);
});

it("tidak ada tombol yang menjanjikan verifikasi tanpa melakukannya", () => {
  const { container } = render(
    <Results ballots={[ballotUji()]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
  );
  for (const b of Array.from(container.querySelectorAll("button"))) {
    // Setiap tombol di halaman ini punya perilaku. Yang tidak punya tidak boleh
    // berlabel seperti sedang melakukan sesuatu.
    expect(b.textContent).not.toMatch(/verify/i);
  }
});
```

- [ ] **Step 7: Gerbangkan `VoteModal` terhadap status yang kontraknya tolak**

Ini konsekuensi langsung J1, dan tanpanya UI menawarkan tindakan yang **pasti gagal**. Alur simulasi tetap simulasi — jalur tulis adalah C-2b — tetapi menawarkannya pada ballot yang sudah lewat deadline adalah kebohongan yang lebih besar daripada simulasinya sendiri.

**`eligibilityPolicy` juga masuk ke modal ini, bukan hanya ke kartu.** Spec §9.4 menulis barisnya apa adanya: *"Keterangan siapa yang berhak — `eligibilityPolicy`, tampil **di kartu ballot dan modal vote**."* Modal vote justru tempat yang lebih penting dari keduanya: di sanalah seseorang memutuskan apakah ia berhak memilih, dan `castVote` akan menolak siapa pun yang credential-nya tidak diterbitkan admin. Menyembunyikan syaratnya tepat di layar keputusan adalah kebalikan dari yang berguna.

```typescript
// (potongan yang berubah pada tahap "select")
{stage === "select" && (
  <>
    <div className="modal-kicker"><LockKeyhole size={14} /> Private ballot</div>
    <div className="modal-heading-row">
      <div>
        {/* Nomor urut sebagai TEKS, alamat sebagai identitas. Alamat dipendekkan
            karena 64 hex tidak terbaca mata, tetapi ia yang benar. */}
        <p className="eyebrow">{ballot.community} · {labelNomor(ballot.nomor)} · {ballot.id.slice(0, 8)}…</p>
        <h2 id="vote-title">{ballot.title}</h2>
      </div>
      <span className="live-pill"><span /> {statusLabel(ballot.status)}</span>
    </div>
    {/* Baris spec 9.4 yang menuntut eligibilityPolicy tampil di KARTU DAN MODAL.
        Di sinilah ia paling berguna: layar tempat seseorang memutuskan apakah
        ia berhak memilih. castVote menolak siapa pun yang credential-nya tidak
        diterbitkan admin, jadi syaratnya harus terbaca sebelum tombolnya, bukan
        sesudah penolakannya. Dirender sebelum kedua cabang di bawah supaya ia
        tampil baik pada ballot yang menerima suara maupun yang sudah tutup. */}
    {ballot.eligibilityPolicy !== "" && (
      <div className="privacy-callout">
        <ShieldCheck size={17} />
        <span>
          <strong>Who can vote:</strong> {ballot.eligibilityPolicy}
          {" "}({ballot.registered.toLocaleString()} of {ballot.eligible.toLocaleString()} credentials issued.)
        </span>
      </div>
    )}
    {menerimaSuara(ballot.status) ? (
      <p className="modal-description">
        Choose one option. Your selection will be sealed into a zero-knowledge proof and never exposed
        as a public wallet action.
      </p>
    ) : (
      /* Kontrak akan MENOLAK castVote pada status ini —
         assert(kernel.blockTimeLessThan(voteDeadline)). Menawarkan tombolnya
         berarti menjanjikan sesuatu yang pasti gagal. */
      <div className="privacy-callout">
        <ShieldCheck size={17} />
        <span>
          <strong>Voting is closed for this ballot.</strong> The contract stops accepting votes after{" "}
          {ballot.deadline}, so no proof can be submitted. {ballot.status === "tally-open"
            ? "Voters can still open their sealed votes until the tally deadline."
            : "This ballot is waiting to be finalized."}
        </span>
      </div>
    )}
    {menerimaSuara(ballot.status) && (
      <div className="choice-list">{/* … daftar opsi apa adanya … */}</div>
    )}
    <div className="modal-actions">
      <button className="ghost-button" onClick={onClose}>Close</button>
      {menerimaSuara(ballot.status) && (
        <button className="primary-button" onClick={submit}><Sparkles size={16} /> Generate proof & vote</button>
      )}
    </div>
  </>
)}
```

- [ ] **Step 8: Sambungkan `Home.tsx` ke `useDataRantai`**

Aturan pemasangan, dan ia yang menutup larangan terpenting rencana ini: **`LiveBallots`, `Overview`, dan `Results` hanya dirender pada fase `siap`.** Pada fase `memuat` dan `gagal`, shell merender permukaannya sendiri. Tidak ada jalur yang dapat menghasilkan `empty-state` tanpa pembacaan yang berhasil.

```typescript
// (potongan yang berubah pada Home)
const data = useDataRantai();
const ballots = data.fase === "siap" ? data.ballots : [];

// …di dalam .page-container:
{data.fase === "memuat" && (
  <section className="page-section">
    <div className="page-heading">
      <div>
        {/* data.jaringan bernilai null ketika konfigurasi sendiri yang gagal.
            Itu tidak boleh dikarang menjadi "preview" — lihat DataRantai. Pada
            fase memuat ia praktis selalu ada, tetapi cabangnya ditulis eksplisit
            supaya tidak ada `data.jaringan!` yang menunggu meledak. */}
        <p className="eyebrow">
          <span className="eyebrow-mark" />{" "}
          {data.jaringan ? `Midnight ${data.jaringan.networkId}` : "Starting up"}
        </p>
        <h1>Reading the chain…</h1>
        <p>VotePriv is fetching registry and ballot state from the indexer.</p>
      </div>
    </div>
    <GridBallotMemuat />
  </section>
)}
{data.fase === "gagal" && (
  <section className="page-section">
    <PanelGagalRantai
      galat={data.galat}
      jaringan={data.jaringan}
      percobaan={data.percobaan}
      onCoba={data.muatUlang}
    />
  </section>
)}
{data.fase === "siap" && (
  <>
    {section === "Overview" && (
      <Overview hasil={data.hasil} ballots={ballots} onVote={setVoteBallot} onCreate={() => setCreateOpen(true)} onSection={setSection} />
    )}
    {section === "Live ballots" && (
      <LiveBallots
        ballots={ballots}
        onVote={setVoteBallot}
        onCreate={() => setCreateOpen(true)}
        atas={<SpandukSebagian gagal={data.hasil.gagal} />}
      />
    )}
    {section === "Results" && (
      // data.hasil.jaringan, BUKAN data.jaringan: pada fase `siap` keduanya
      // sama, tetapi yang pertama bertipe JaringanAktif (tidak nullable) karena
      // ia jaringan yang pembacaan ini BENAR-BENAR pakai. Results karena itu
      // tidak perlu menangani null yang tidak mungkin terjadi di sana.
      <Results
        ballots={ballots}
        receipt={receipt}
        jaringan={data.hasil.jaringan}
        blokHeight={data.hasil.blok.height}
        onMuatUlang={data.muatUlang}
      />
    )}
    {section === "Docs" && <Docs />}
  </>
)}
```

Lencana jumlah di sidebar (`{label === "Live ballots" && <b>12</b>}`) menjadi turunan, bukan angka:

```typescript
{label === "Live ballots" && data.fase === "siap" && <b>{ballots.length}</b>}
```

**Tiga kata `testnet` yang sekarang punya jawaban yang benar.**

Shell menyebut jaringan di tiga tempat, dan ketiganya hari ini memakai kata umum `testnet` karena C-1 memang belum tahu jaringan mana yang dibaca. Sesudah task ini ia tahu, dan membiarkan kata umum itu berarti UI menolak memberitahu sesuatu yang sudah dipegangnya — pada aplikasi yang seluruh isinya bergantung pada jaringan mana yang dibaca:

```typescript
// 1. topbar .network-status — ini status JARINGAN YANG DIBACA, bukan wallet.
//    Sebelumnya ia menampilkan jaringan wallet bila tersambung dan "Midnight
//    testnet" bila tidak. Keduanya bisa BERBEDA, dan yang menentukan isi halaman
//    adalah yang dibaca — jadi yang dibaca yang ditampilkan, dan jaringan wallet
//    disebut terpisah hanya ketika ia berselisih.
<div className="network-status">
  <span className="pulse-dot" />{" "}
  {data.jaringan ? `Midnight ${data.jaringan.networkId}` : "Midnight —"}
  {connected && network && data.jaringan && network !== data.jaringan.networkId && (
    <> · wallet on {network}</>
  )}
  <ChevronRight size={14} />
</div>

// 2. .sidebar-footer — kata umum diganti jaringan sebenarnya.
<div className="sidebar-footer">
  <span>VotePriv v0.1</span><span>·</span>
  <span>{data.jaringan ? data.jaringan.networkId : "no network"}</span>
</div>
```

**Empat hal di `Home.tsx` mati bersamaan dengan perubahan ini, dan semuanya harus benar-benar dibuang — bukan disisakan sebagai kode tak terpakai:**

```typescript
// DIBUANG dari Home.tsx:
import { initialBallots } from "@/components/votepriv/demo-data";   // modulnya dihapus di Step 10
const [ballots, setBallots] = useState<Ballot[]>(initialBallots);   // diganti data.ballots
const createBallot = (ballot: Ballot) => setBallots(...)            // deploy sungguhan adalah C-2b
<CreateBallotModal onClose={…} onCreate={createBallot} />           // prop onCreate hilang (Step 9)
```

Menjadi:

```typescript
{createOpen && <CreateBallotModal onClose={() => setCreateOpen(false)} />}
```

`useState` tetap diimpor — `section`, `voteBallot`, `createOpen`, `mobileNav`, `receipt`, dan seluruh state wallet masih memakainya. Yang hilang hanya state `ballots`.

- [ ] **Step 9: Cabut `onCreate` dari `CreateBallotModal` — di task ini, bukan nanti**

Langkah ini **wajib berada sebelum Step 15**, yang menuntut `pnpm check` bersih. `CreateBallotModal.create()` hari ini menyusun objek `Ballot` lengkap di tempat; dengan `Ballot` bertambah delapan field wajib (`nomor`, `registered`, `tallied`, `eligibilityPolicy`, `voteDeadlineMs`, `tallyDeadlineMs`, `phase`, `deployHeight`, `keadaanHasil`), konstruksi itu **tidak dapat ditypecheck** dan tidak ada cara menambalnya yang jujur — nilai-nilai itu hanya ada setelah kontrak benar-benar ter-deploy.

Alasannya bukan sekadar tipe. Dengan daftar yang dibaca dari registry, ballot buatan lokal akan **hilang pada muat ulang berikutnya**, dan itu lebih membingungkan daripada tombol yang jujur mengatakan belum tersambung.

```typescript
// client/src/components/votepriv/CreateBallotModal.tsx — tanda tangan dan create()

export function CreateBallotModal({ onClose }: { onClose: () => void }) {
  // … state formulir tetap apa adanya …

  const create = () => {
    if (!title.trim() || !optionOne.trim() || !optionTwo.trim()) {
      toast.error("Complete the ballot details", { description: "A title and two options are required." });
      return;
    }
    // Deploy sungguhan adalah C-2b (spec 9.2 butir 3): ia menuntut wallet,
    // proof server, artefak ZK, dan constructor 14 argumen. Membuat Ballot lokal
    // di sini akan menampilkan ballot yang HILANG pada muat ulang berikutnya,
    // karena daftar sekarang dibaca dari registry on-chain.
    toast.info("Creating ballots needs a wallet", {
      description:
        "Deploying a ballot writes to the chain: it needs a wallet, a proof server, and the ZK artifacts. VotePriv reads the chain today; writing arrives next.",
    });
    onClose();
  };

  // … markup tetap apa adanya; impor `type Ballot` dibuang karena tidak lagi dipakai …
}
```

Formulirnya **dipertahankan**: ia tetap berguna sebagai bentuk yang C-2b isi, dan menghapusnya berarti menulis ulang markupnya nanti.

`CreateBallotModal.test.tsx` menyesuaikan: uji yang mengassert `onCreate` terpanggil diganti uji yang mengassert `onClose` terpanggil dan **tidak ada** ballot yang lahir.

- [ ] **Step 10: Buktikan `demo-data.ts` sudah tidak punya pemakai, lalu hapus — juga di task ini**

Sama alasannya: `demo-data.ts` menyusun tiga objek `Ballot` bentuk lama dan **tidak dapat ditypecheck** setelah Step 1 Task 6. Ia harus hilang sebelum Step 15, bukan di Task 9.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -rn "demo-data\|initialBallots" client/src --include=*.ts --include=*.tsx || echo "tidak ada pemakai"
```

Diharapkan: `tidak ada pemakai`. Bila masih ada, **jangan hapus** — selesaikan pemakainya lebih dulu; sebuah `grep` yang tidak kosong di sini berarti ada permukaan yang masih menampilkan angka mockup.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git rm client/src/components/votepriv/demo-data.ts
```

- [ ] **Step 11: Perbaiki `Home.smoke.test.tsx`, yang sekarang menyentuh jaringan sungguhan**

Berkas ini **tidak pernah disebut** rencana ini sampai baris ini, dan itulah persis bahayanya: ia merender `<Home />` tanpa mem-stub `fetch`. Sebelum Task 8 itu tidak berarti apa-apa; sesudahnya, `Home` memanggil `useDataRantai()` → `bacaRantai()` → `fetch` global, sehingga **`pnpm test` mulai menembak indexer publik** pada setiap jalannya. Itu melanggar batasan global rencana ini apa adanya: *"Uji TIDAK BOLEH bergantung pada nilai hidup."*

Yang diassert berkas itu (`.app-shell`, `.sidebar`, keempat label navigasi) semuanya milik **shell**, yang dirender pada ketiga fase — jadi isinya tidak perlu berubah. Yang ditambahkan hanya stub `fetch` yang menggantung selamanya, sehingga uji berjalan pada fase `memuat` dan tidak pernah menyentuh jaringan:

```typescript
// tambahan di client/src/pages/Home.smoke.test.tsx

// Home sekarang membaca rantai lewat useDataRantai(). Tanpa stub, uji ini akan
// menembak indexer publik pada setiap `pnpm test` — uji yang hijau atau merah
// menurut jaringan, bukan menurut kode. fetch yang MENGGANTUNG dipakai, bukan
// yang menolak, supaya uji ini tetap menguji apa yang memang ia uji: bahwa
// shell terpasang. Fase yang aktif selama uji adalah "memuat".
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});
```

Dan satu assert ditambahkan, karena sekarang ada sesuatu yang layak dijaga di sini:

```typescript
it("tidak pernah menyentuh jaringan sungguhan", () => {
  // Bila seseorang kelak membuang stub di atas, assert ini yang berbunyi lebih
  // dulu — sebelum uji berubah jadi rapuh menurut hari tanpa ada yang sadar.
  expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
});
```

- [ ] **Step 12: Perbarui kelima berkas uji komponen agar memakai `ballotUji()`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -ln "const BALLOT\|const dasar\|const BALLOTS" client/src/components/votepriv/*.test.tsx
```

Diharapkan: daftar berkas yang masih menuliskan objek `Ballot` sendiri. Ganti masing-masing dengan `ballotUji({ … })`, mempertahankan **nilai yang diassert** apa adanya dan hanya mengganti cara objeknya dibangun. Nilai assert yang menyentuh bentuk baru — chip filter, label status, kuorum, `keadaanHasil`, dan `tallies` yang kini selalu larik — memang harus berubah; itu perubahan yang disengaja dan ditulis tangan, bukan diturunkan dari kode.

Empat berkas menuntut perubahan yang lebih dari sekadar bentuk objek, dan semuanya disebut namanya supaya tidak terlewat:

| Berkas | Yang berubah, dan mengapa |
|---|---|
| `Results.test.tsx` | Tanda tangan `Results` bertambah `jaringan`, `blokHeight`, dan `onMuatUlang`, jadi setiap `render()` harus mengopernya. Uji lama `expect(container.querySelector(".verified-stamp strong")!.textContent).toBe("Demo data")` **dibalik**: sekarang ia harus berbunyi `"Read from chain"`. Tambahkan pula kedua uji tombol baca-ulang dari Step 6 |
| `CreateBallotModal.test.tsx` | Prop `onCreate` sudah tidak ada (Step 9). Uji yang mengassert `onCreate` terpanggil diganti uji yang mengassert `onClose` terpanggil dan **tidak ada** ballot yang lahir |
| `LiveBallots.test.tsx` | Chip tumbuh dari tiga menjadi lima; hitungannya ditulis tangan seperti contoh di atas |
| `VoteModal.test.tsx` | Modal kini menggerbangi status dan menampilkan `eligibilityPolicy`. Tambahkan satu uji bahwa pada status `awaiting-finalize` **tidak ada** tombol "Generate proof & vote" |

Konstanta `JARINGAN` yang dipakai uji `Results` adalah objek `JaringanAktif` yang sama bentuknya dengan yang ada di `KeadaanRantai.test.tsx`; salin, jangan impor dari berkas uji lain.

Contoh untuk `LiveBallots.test.tsx`, chip filter:

```typescript
import { ballotUji } from "@/test/fixture-ballot";

const BALLOTS = [
  ballotUji({ id: "b1", title: "Q4 Community Treasury", status: "live", keadaanHasil: "tersegel" }),
  ballotUji({ id: "b2", title: "Protocol Grants Round 03", status: "tally-open", keadaanHasil: "menunggu-pembukaan" }),
  ballotUji({ id: "b3", title: "Network Upgrade 7B", status: "finalized", tallied: 3, tallies: [2, 0, 1], keadaanHasil: "ada-hasil" }),
];

it("menghitung chip filter dari STATUS TURUNAN, bukan dari phase", () => {
  const { container } = render(<LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />);
  const chip = Array.from(container.querySelectorAll(".filter-chip")).map(el => el.textContent);
  // Ditulis TANGAN. "Open 1" adalah pernyataan yang dapat salah, dan itulah
  // gunanya: sebelum C-2a, chip ini menghitung phase dan berbunyi "Live 2"
  // untuk kumpulan yang sama.
  expect(chip).toEqual(["All 3", "Open 1", "Tally 1", "Needs finalizing 0", "Finalized 1"]);
});

it("menampilkan chip yang menghitung NOL, bukan menyembunyikannya", () => {
  const { container } = render(<LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />);
  expect(container.textContent).toContain("Needs finalizing 0");
});
```

**Dan satu berkas uji BARU, `client/src/components/votepriv/Overview.test.tsx`.**

`Overview` belum punya uji sama sekali di C-1, dan justru di sanalah sebuah crash menunggu: `const featured = ballots[0]` lalu `featured.votes`. Registry yang kosong adalah keadaan yang **sah** — pembacaan berhasil, hanya belum ada ballot terdaftar — dan ia menghasilkan `undefined`. Uji ini yang membuat crash itu mustahil kembali diam-diam.

```typescript
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Overview } from "./Overview";
import { ballotUji } from "@/test/fixture-ballot";
import type { HasilRantai } from "@/lib/chain";

afterEach(() => cleanup());

/** HasilRantai minimal untuk merender Overview tanpa menyentuh jaringan. */
function hasilUji(ubah: Partial<HasilRantai> = {}): HasilRantai {
  return {
    jaringan: {
      networkId: "preview",
      indexer: "https://indexer.contoh.test/api/v3/graphql",
      indexerWS: "",
      alamatRegistry: "b9d127d83f1436488e2cc808d9732d51f4f5befe2711362c7d669759db2a298a",
    },
    registry: { count: 0, alamat: [], aksi: [] },
    ballot: [],
    gagal: [],
    blok: { height: 817_778, timestampMs: 1_789_124_322_000 },
    epoch: { epochNo: 993_958, durationSeconds: 1800, elapsedSeconds: 1737 },
    sekarangMs: 1_789_124_322_000,
    ...ubah,
  };
}

describe("Overview pada registry KOSONG", () => {
  it("TIDAK crash ketika tidak ada satu ballot pun", () => {
    // Sebelum gerbang ini, ballots[0] bernilai undefined dan baris berikutnya
    // membaca featured.votes. Uji ini gagal dengan TypeError, bukan dengan
    // assert — dan itulah bentuk kegagalan yang ingin dicegah.
    expect(() =>
      render(
        <Overview hasil={hasilUji()} ballots={[]} onVote={() => {}} onCreate={() => {}} onSection={() => {}} />,
      ),
    ).not.toThrow();
  });

  it("merender permukaan kosong yang menyebut pembacaan BERHASIL", () => {
    const { container } = render(
      <Overview hasil={hasilUji()} ballots={[]} onVote={() => {}} onCreate={() => {}} onSection={() => {}} />,
    );
    expect(container.querySelector(".empty-state")).not.toBeNull();
    expect(container.textContent).toContain("The registry is empty");
    // Registry kosong BUKAN kegagalan: kalimatnya wajib menyebut bahwa
    // pembacaannya berhasil, kalau tidak ia tidak dapat dibedakan dari indexer
    // yang mati — larangan paling keras di rencana ini.
    expect(container.textContent).toMatch(/read successfully/i);
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("tidak menawarkan ballot unggulan yang tidak ada", () => {
    const { container } = render(
      <Overview hasil={hasilUji()} ballots={[]} onVote={() => {}} onCreate={() => {}} onSection={() => {}} />,
    );
    expect(container.textContent).not.toContain("Vote on featured ballot");
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(0);
  });

  it("tetap merender ballot unggulan ketika registry TIDAK kosong", () => {
    // Penjaga terhadap gerbang yang terlalu rakus: kalau cabang kosong pernah
    // ikut menelan kasus normal, seluruh Overview hilang tanpa satu uji memerah.
    const { container } = render(
      <Overview
        hasil={hasilUji({ registry: { count: 1, alamat: ["aa"], aksi: [] } })}
        ballots={[ballotUji()]}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    expect(container.querySelector(".empty-state")).toBeNull();
    expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 13: Pastikan `cap-tampilan.tsx` masih ditypecheck, dan JANGAN menumbuhkannya**

Task 1 sudah memutuskan nasib berkas ini, dan keputusannya berbeda dari yang mungkin Anda harapkan: **ia dipertahankan tetapi TIDAK ditumbuhkan.**

Alasannya: uji pengganti (`paritas-permukaan-rantai.test.tsx`) **tidak mengimpor satu pun simbol** darinya. Ia mengumpulkan kelas CSS sendiri dalam satu lapis. Menambahkan permukaan C-2a ke `rekamPermukaan()` berarti menulis kode yang **tidak pernah dijalankan siapa pun** — pekerjaan yang pasti busuk tanpa ada yang tahu, dan yang akan membuat pembaca berikutnya mengira permukaan itu benar-benar dijaga.

Yang dikerjakan di sini hanya satu: pastikan berkas tanpa pengimpor itu tetap sehat, sehingga ia benar-benar modal yang dapat diambil lagi dan bukan bangkai.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -rn "cap-tampilan" client/src --include=*.ts --include=*.tsx || echo "tidak ada pengimpor — sesuai keputusan Task 1"
pnpm check:uji 2>&1 | grep "cap-tampilan" || echo "cap-tampilan.tsx typecheck bersih"
```

Diharapkan: `tidak ada pengimpor — sesuai keputusan Task 1`, lalu `cap-tampilan.tsx typecheck bersih`.

Bila `pnpm check:uji` memerah **di dalam** `cap-tampilan.tsx`, penyebabnya hampir pasti tipe `Ballot` yang berubah di Task 6 — perbaiki tipenya di sana, jangan hapus berkasnya. Menghapusnya adalah keputusan tersendiri yang tidak diambil rencana ini.

- [ ] **Step 14: Tulis uji pengganti `paritas-permukaan-rantai.test.tsx`**

Inilah pengganti yang dijanjikan Task 1. Perhatikan pemisahan yang dinyatakan terang-terangan di kepalanya.

`client/src/test/paritas-permukaan-rantai.test.tsx`:

```typescript
/**
 * Pengganti uji paritas warisan C-1 (dihapus di C-2a Task 1).
 *
 * BEDANYA, dan ini harus dibaca sebelum menaksir kekuatannya:
 *
 * Uji warisan membandingkan render terhadap garis dasar yang direkam dari
 * SALINAN BEKU kode pra-pemecahan. Nilai "sebelum"-nya adalah keluaran dari
 * mengeksekusi kode asli, dan karena itu ia bukti yang independen.
 *
 * Uji ini TIDAK dapat memiliki sifat itu, dan tidak berpura-pura memilikinya.
 * Yang independen di sini adalah DATANYA: fixture di client/src/test/fixture-rantai/
 * adalah bita yang benar-benar dikirim indexer, bukan nilai yang diturunkan dari
 * kode yang diuji. Waktu dinding ikut dibekukan bersamanya lewat meta.sekarangMs.
 *
 * Karena itu berkas ini memisahkan dua hal yang berbeda kekuatannya:
 *
 *   A. ASSERT YANG DITULIS TANGAN — label status, hitungan chip, persentase dari
 *      tallies jarang, nomor urut dari tinggi blok deploy, kalimat permukaan
 *      gagal. Nilainya diketik manusia dan dapat salah; itulah yang membuatnya
 *      bukti.
 *
 *   B. CAP EMPAT LAPIS atas sisanya — DETEKTOR PERUBAHAN, bukan bukti kebenaran.
 *      Ia menangkap kelas CSS yang hilang dan teks yang berubah tanpa sengaja.
 *      Ia TIDAK menyatakan apa pun tentang benar atau salah.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import Home from "@/pages/Home";

const DIR = new URL("./fixture-rantai/", import.meta.url);
const baca = (n: string) => JSON.parse(readFileSync(new URL(n, DIR), "utf8"));
const fxRegistry = baca("registry.json");
const fxBallots = baca("ballots.json");
const fxJaringan = baca("jaringan.json");
const meta = baca("meta.json");

vi.mock("@/lib/proof-server", async asli => {
  const m = await asli<typeof import("@/lib/proof-server")>();
  return { ...m, checkProofServer: () => new Promise(() => {}) };
});

function pasangFetch(mode: "sehat" | "mati" | "registry-hilang") {
  const palsu = vi.fn(async (_u: string, init: RequestInit) => {
    if (mode === "mati") throw new TypeError("Failed to fetch");
    const nama = /query\s+(\w+)/.exec(JSON.parse(String(init.body)).query)?.[1] ?? "?";
    if (mode === "registry-hilang" && nama === "Registry") {
      return new Response(JSON.stringify({ data: { r: null }, errors: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    const j = nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
    return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", palsu);
  return palsu;
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("A. Assert yang ditulis tangan — bukti kebenaran", () => {
  it("menampilkan keadaan MEMUAT lebih dulu, dan bukan keadaan kosong", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    expect(container.querySelectorAll("[aria-busy='true']").length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("No ballots found");
  });

  it("kegagalan indexer TIDAK terlihat seperti tidak ada ballot", async () => {
    pasangFetch("mati");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector("[role='alert']")).not.toBeNull());
    expect(container.textContent).toContain("Can't reach the indexer");
    expect(container.textContent).not.toContain("No ballots found");
  });

  it("registry yang tidak ditemukan menyebut alamat DAN jaringan", async () => {
    pasangFetch("registry-hilang");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector("[role='alert']")).not.toBeNull());
    expect(container.textContent).toContain("Registry not found on this network");
    expect(container.textContent).toContain(meta.jaringan);
  });

  it("JEBAKAN 1: tidak ada badge berbunyi Live now pada ballot yang deadline-nya lewat", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));
    const lewat = fxBallots.alamat.length; // sekadar memastikan fixture terpakai
    expect(lewat).toBeGreaterThan(0);
    // Untuk SETIAP kartu, badge "Live now" hanya boleh muncul bila deadline-nya
    // belum lewat pada meta.sekarangMs. Diperiksa lewat teks kartu, karena itu
    // yang benar-benar dilihat pengguna.
    for (const kartu of Array.from(container.querySelectorAll(".ballot-card"))) {
      const teks = kartu.textContent ?? "";
      if (teks.includes("Live now")) {
        // Kartu yang berbunyi "Live now" harus menawarkan "Vote privately".
        expect(teks).toContain("Vote privately");
      } else {
        expect(teks).toContain("View result");
      }
    }
  });

  it("JEBAKAN 2: nomor 001 melekat pada ballot dengan blok deploy TERENDAH, bukan pada yang pertama di registry", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));

    // Nilai pembanding DITURUNKAN dari fixture, bukan diketik: judul ballot
    // ber-deploy terendah dibaca lewat dekoder yang sama dengan yang dipakai
    // aplikasi, sehingga uji ini tetap benar bila fixture direkam ulang.
    const { dekodeBallot } = await import("@/lib/chain/dekode");
    const per = fxBallots.alamat.map((a: string, i: number) => ({
      alamat: a,
      indeksRegistry: i,
      deployHeight: fxBallots.jawaban.data[`b${i}`].deploy[0].transaction.block.height as number,
      judul: dekodeBallot(fxBallots.jawaban.data[`b${i}`].state, a).title,
    }));
    const terendah = [...per].sort((x, y) => x.deployHeight - y.deployHeight)[0];

    // Kartu yang membawa teks "Ballot 001" harus memuat judul itu.
    const kartu001 = Array.from(container.querySelectorAll(".ballot-card")).find(k =>
      (k.textContent ?? "").includes("Ballot 001"),
    );
    expect(kartu001, "tidak ada kartu ber-nomor 001").toBeDefined();
    expect(kartu001!.textContent).toContain(terendah.judul);

    // Dan inilah yang membedakan uji ini dari uji yang tidak menggigit: bila
    // fixture memuat lebih dari satu ballot, ballot ber-deploy terendah BUKAN
    // yang pertama di registry (List memakai pushFront, terbaru di depan).
    // Sebuah implementasi yang menomori dari indeks registry akan lolos assert
    // di atas hanya kalau kedua urutan kebetulan sama — dan assert ini menolak
    // kebetulan itu.
    if (per.length > 1) {
      expect(terendah.indeksRegistry).not.toBe(0);
    }
  });

  it("chip filter memakai KELIMA teks yang benar, dalam urutan yang benar", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));
    // Navigasi ke Live ballots dilakukan lewat sidebar, bukan lewat state internal.
    const nav = Array.from(container.querySelectorAll("nav button")).find(b =>
      (b.textContent ?? "").includes("Live ballots"),
    ) as HTMLButtonElement;
    await act(async () => { nav.click(); });
    await waitFor(() => expect(container.querySelectorAll(".filter-chip").length).toBe(5));

    // KELIMA teksnya ditulis tangan dan diassert apa adanya. Ini janji Task 1
    // yang sebelumnya hanya ditunaikan separuh: dua `some()` membiarkan tiga chip
    // berganti nama tanpa ada yang memerah.
    //
    // Yang diassert adalah LABEL-nya, bukan angkanya, dan itu disengaja: label
    // tidak pernah basi, sementara angkanya berubah setiap kali fixture direkam
    // ulang. Angkanya diassert di LiveBallots.test.tsx terhadap ballot yang
    // dibuat tangan, tempat nilai yang diharapkan memang dapat salah.
    const chip = Array.from(container.querySelectorAll(".filter-chip")).map(e => e.textContent ?? "");
    const label = chip.map(c => c.replace(/\s*\d[\d,]*\s*$/, "").trim());
    expect(label).toEqual(["All", "Open", "Tally", "Needs finalizing", "Finalized"]);

    // Setiap chip menampilkan angkanya, termasuk yang bernilai nol — chip yang
    // hilang lebih membingungkan daripada angka nol.
    for (const c of chip) expect(c).toMatch(/\d/);
    // Dan jumlah keempat chip status sama dengan "All": setiap ballot masuk
    // tepat satu ember. Diturunkan dari yang dirender, bukan diketik.
    const angka = chip.map(c => Number((c.match(/(\d[\d,]*)\s*$/)?.[1] ?? "0").replace(/,/g, "")));
    expect(angka[1] + angka[2] + angka[3] + angka[4]).toBe(angka[0]);
  });

  it("persentase hasil DITURUNKAN dari tallies JARANG, bukan dari indeks baris", async () => {
    // Janji Task 1 yang kedua, yang sebelumnya tidak ditunaikan sama sekali.
    //
    // Nilai pembandingnya dihitung di sini dari fixture yang DIREKAM — bukan
    // dari jaringan hidup, dan bukan dari kode yang diuji. Yang dipakai adalah
    // padatkanTallies, fungsi yang JEBAKAN 3 tutup; kalau Results kembali
    // memakai `index === 0 ? 62 : …` seperti sebelum C-2a, angka ini berpisah.
    const { padatkanTallies } = await import("@/lib/chain/dekode");
    const { dekodeBallot } = await import("@/lib/chain/dekode");

    // Cari ballot terekam yang memang punya suara terbuka. Bila fixture direkam
    // ulang dan tidak ada satu pun, uji ini MEMERAH alih-alih diam — karena
    // "tidak ada hasil untuk diperiksa" adalah kehilangan cakupan, bukan sukses.
    const berhasil = fxBallots.alamat
      .map((a: string, i: number) => ({ a, k: dekodeBallot(fxBallots.jawaban.data[`b${i}`].state, a) }))
      .filter(({ k }: any) => k.talliedCount > 0);
    expect(berhasil.length, "fixture tidak memuat satu pun ballot dengan suara terbuka — rekam ulang").toBeGreaterThan(0);

    const { k } = berhasil[0];
    const padat = padatkanTallies(k.tallies, k.optionCount);
    const pct = Math.round((Math.max(...padat) / k.talliedCount) * 100);

    // Map tallies memang JARANG: jumlah pasangan yang ada lebih sedikit daripada
    // optionCount. Kalau tidak, uji ini tidak menguji jebakannya.
    expect(k.tallies.length).toBeLessThan(k.optionCount);
    expect(padat).toHaveLength(k.optionCount);

    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));
    const nav = Array.from(container.querySelectorAll("nav button")).find(b =>
      (b.textContent ?? "").includes("Results"),
    ) as HTMLButtonElement;
    await act(async () => { nav.click(); });
    await waitFor(() => expect(container.querySelectorAll(".result-row").length).toBeGreaterThan(0));

    const baris = Array.from(container.querySelectorAll(".result-row")).find(r =>
      (r.textContent ?? "").includes(k.title),
    );
    expect(baris, `tidak ada baris hasil untuk "${k.title}"`).toBeDefined();
    expect(baris!.textContent).toContain(`${pct}%`);
  });

  it("JEBAKAN 4: hasil yang tidak ada TIDAK berbunyi tersegel ketika deadline sudah lewat", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));
    const nav = Array.from(container.querySelectorAll("nav button")).find(b =>
      (b.textContent ?? "").includes("Results"),
    ) as HTMLButtonElement;
    await act(async () => { nav.click(); });
    await waitFor(() => expect(container.querySelectorAll(".result-row").length).toBeGreaterThan(0));

    // Kalimat "stay sealed until <deadline>" hanya boleh muncul pada baris yang
    // statusnya memang masih menerima suara. Pada fixture hari ini TIDAK ADA
    // baris seperti itu — kedua ballot sudah lewat kedua deadline-nya — jadi
    // kalimat itu tidak boleh muncul sama sekali.
    for (const baris of Array.from(container.querySelectorAll(".result-row"))) {
      const teks = baris.textContent ?? "";
      if (teks.includes("stay sealed until")) {
        expect(teks).toMatch(/Live now|Closing soon/);
      }
    }
  });

  it("Recent activity menampilkan SELISIH ledger, bukan sekadar nama entry point", async () => {
    // Ini yang membedakan "dibaca dari snapshot ledger" dari klaim kosong.
    // `state` per aksi dibayar bandwidth-nya; assert ini yang memastikan ia
    // benar-benar dipakai. Nama bidangnya ditulis tangan; angkanya tidak.
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".activity-item").length).toBeGreaterThan(0));
    const teks = container.querySelector(".activity-list")!.textContent ?? "";
    // Sekurang-kurangnya satu baris memuat panah selisih dengan dua angka.
    expect(teks).toMatch(/(sealed votes|opened votes|registered ballots|registered voters|phase) \d+ → \d+/);
    // Dan tidak satu baris pun mengaku "no ledger change" sambil sebenarnya
    // tidak punya pendahulu — kalimat itu dipisah menjadi "earlier state not read".
    expect(teks).not.toContain("Demo data");
  });

  it("kuorum disebut sebagai NIAT, bukan sebagai ambang", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));
    expect(container.textContent).toContain("intended quorum");
  });

  it("kartu network status memakai tinggi blok nyata dan TIDAK mengarang angka finality", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.textContent).toContain("Last block"));
    expect(container.textContent).toContain(fxJaringan.data.block.height.toLocaleString());
    expect(container.textContent).not.toMatch(/finality/i);
  });

  it("menyebut jaringan yang BENAR-BENAR dibaca, bukan kata umum testnet", async () => {
    // Sebelum C-2a, shell berbunyi "Midnight testnet" karena ia memang belum
    // tahu. Sesudahnya ia tahu, dan kata umum menjadi penolakan memberitahu.
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));
    // Nilainya DITURUNKAN dari fixture; tidak ada nama jaringan yang diketik.
    expect(container.querySelector(".network-status")!.textContent).toContain(meta.jaringan);
    expect(container.textContent).not.toMatch(/Midnight testnet/);
  });

  it("TIDAK mengklaim lapis bukti yang C-2a tidak punya", async () => {
    // C-2a tidak membuat maupun memverifikasi satu proof pun. Klaim "LIVE PROOF
    // LAYER" adalah pernyataan tentang aplikasi ini, dan pada build ini ia salah.
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));
    expect(container.textContent).not.toMatch(/live proof layer/i);
  });

  it("tidak ada lagi teks Demo data DI MANA PUN, di keempat section", async () => {
    // Diperkuat, dan alasannya konkret: versi sebelumnya hanya memeriksa section
    // yang kebetulan terbuka (Overview), sehingga baris
    // `<span>Demo data below</span><strong>Yes</strong>` di panel privacy-result
    // halaman Results LOLOS setiap gerbang — ia tidak berada di .verified-stamp
    // yang diperiksa uji provenans, dan halamannya tidak pernah dibuka.
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));

    const nav = Array.from(container.querySelectorAll("nav button")) as HTMLButtonElement[];
    for (const section of ["Overview", "Live ballots", "Results", "Docs"]) {
      const tombol = nav.find(b => (b.textContent ?? "").includes(section))!;
      await act(async () => { tombol.click(); });
      const teks = container.textContent ?? "";
      // Pencocokan longgar dan tidak peka huruf besar: "Demo data", "Demo data
      // below", "demo data" — semuanya sama salahnya pada halaman yang membaca
      // rantai sungguhan.
      expect(teks, `"demo data" masih muncul di section ${section}`).not.toMatch(/demo\s+data/i);
      expect(teks, `"Not yet read from the chain" masih muncul di ${section}`).not.toMatch(/not yet read from the chain/i);
    }
  });

  it("modal vote menyebut eligibilityPolicy, bukan hanya kartunya", async () => {
    // Spec 9.4 menuntut keduanya: "tampil di kartu ballot DAN modal vote".
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));

    const { dekodeBallot } = await import("@/lib/chain/dekode");
    const kebijakan = dekodeBallot(fxBallots.jawaban.data.b0.state, fxBallots.alamat[0]).eligibilityPolicy;
    expect(kebijakan.length, "fixture tidak punya eligibilityPolicy untuk diuji").toBeGreaterThan(0);

    const tombol = Array.from(container.querySelectorAll(".ballot-card .text-button"))[0] as HTMLButtonElement;
    await act(async () => { tombol.click(); });
    await waitFor(() => expect(container.querySelector(".vote-modal")).not.toBeNull());
    expect(container.querySelector(".vote-modal")!.textContent).toContain(kebijakan);
  });
});

describe("B. Himpunan kelas CSS — DETEKTOR PERUBAHAN, bukan bukti kebenaran", () => {
  it("menjaga himpunan kelas CSS pada permukaan siap tetap berada di dalam index.css", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0));
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    const dipakai = new Set<string>();
    for (const el of Array.from(container.querySelectorAll("*"))) {
      for (const t of (el.getAttribute("class") ?? "").split(/\s+/)) if (t) dipakai.add(t);
    }

    /**
     * Token kelas yang SENGAJA tidak punya aturan sendiri di index.css.
     * Setiap entri wajib punya alasan; daftar tanpa alasan adalah daftar yang
     * tumbuh sampai assert-nya tidak menjaga apa pun.
     *
     *  - `lucide*`   : milik lucide-react, bukan desain halaman ini.
     *  - `sr-only`   : utilitas Tailwind.
     *  - `accent-mint`: DIPERIKSA — index.css hanya punya `.accent-violet:before`
     *    dan `.accent-blue:before`. Mint bukan kelas; ia GAYA BAWAAN
     *    `.ballot-card:before`, yang memakai `background: var(--mint)`. Jadi
     *    `accent-mint` memang sengaja tidak beraturan, dan menambahkannya ke
     *    index.css justru melanggar janji C-2a untuk tidak menyentuh berkas itu.
     *    accentDariAlamat() tetap boleh mengembalikan "mint"; yang dihasilkannya
     *    adalah kelas tanpa efek, dan efek yang benar datang dari kelas dasarnya.
     */
    const abai = new Set(["sr-only", "accent-mint"]);
    const hilang = [...dipakai].filter(
      t => !/^lucide/.test(t) && !abai.has(t) && !css.includes(`.${t}`),
    );
    // C-2a berjanji TIDAK menambah satu baris CSS pun. Assert ini yang menjaganya.
    expect(hilang).toEqual([]);

    // Dan penjaga terhadap daftar abai yang membusuk: kalau suatu saat
    // .accent-mint BENAR-BENAR ditambahkan ke index.css, baris ini memerah dan
    // memaksa alasannya dibaca ulang alih-alih dibiarkan menumpuk.
    expect(css.includes(".accent-mint")).toBe(false);
  });
});
```

- [ ] **Step 15: Jalankan seluruh uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm check:uji
pnpm test 2>&1 | tail -15
```

Diharapkan: `pnpm check` **dan** `pnpm check:uji` dua-duanya tanpa keluaran — daftar kerja dari Step 1 habis; seluruh uji hijau.

Bila `pnpm check` bersih tetapi `pnpm check:uji` merah, yang tersisa adalah berkas `*.test.ts` — `tsconfig.json` meng-exclude pola itu, jadi perintah pertama memang tidak pernah melihatnya. Itu bukan alasan melewatkannya.

- [ ] **Step 16: Lihat dengan mata, sekali, pada dua lebar**

jsdom tidak memuat `index.css`, jadi tidak satu uji pun di atas melihat tata letak yang sebenarnya. Satu kali melihat adalah satu-satunya cara.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm dev --port 5273
```

Buka `http://localhost:5273` pada lebar **1280px** dan **375px**, lalu periksa lima hal:

1. Keadaan **memuat** muncul lebih dulu dan tata letaknya tidak melompat saat data mendarat.
2. Badge status memakai warna yang benar: mint untuk yang menerima suara, amber untuk jendela tally dan menunggu finalisasi, biru untuk final.
3. Chip filter muat pada 375px — ada **lima** sekarang, bukan tiga; `.toolbar` sudah `flex-wrap: wrap` pada `max-width: 560px`, jadi seharusnya membungkus.
4. Panel gagal terlihat benar: matikan jaringan sebentar, muat ulang, dan pastikan tombol **Retry** bekerja setelah jaringan kembali.
5. Halaman Results menampilkan keadaan **tersegel** tanpa bar, bukan bar 0%.

**Port 5273, bukan 5180/5173/3000/6300** — dev server operator sedang hidup di 5180.

- [ ] **Step 17: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add -A client/src
git commit -m "feat(ui): pasang data on-chain nyata ke tujuh komponen, plus uji pengganti

Home merender Overview/LiveBallots/Results HANYA pada fase siap. Pada fase
memuat dan gagal, shell merender permukaannya sendiri — sehingga tidak ada satu
jalur pun yang dapat menghasilkan empty-state tanpa pembacaan yang berhasil.

Metrik Active ballots menjadi Open for voting dan dihitung dari status turunan:
membacanya dari phase akan menghitung ballot yang kontraknya sudah menolak
semua suara. Chip filter tumbuh jadi lima dan ikut menampilkan yang bernilai
nol, karena chip yang hilang lebih membingungkan daripada angka nol.

Kartu network status memakai tinggi blok nyata dan posisi epoch. Angka finality
TIDAK dikarang: ia tidak punya field di skema indexer sama sekali.

Recent activity mendapat JSX-nya sendiri, bukan hanya fungsi pembantu: setiap
baris menampilkan selisih ledger yang benar-benar dihitung dari snapshot per
aksi (sealed votes 2 -> 3), atau MENGAKU bahwa pendahulunya di luar jendela
yang dibaca. Centang hanya muncul ketika ada angka yang benar-benar terbaca.

Overview digerbangi terhadap registry KOSONG. ballots[0] pada registry kosong
bernilai undefined dan baris berikutnya membaca featured.votes — crash, pada
keadaan yang sepenuhnya sah. Permukaan kosongnya menyebut bahwa pembacaan
BERHASIL, sehingga ia tidak dapat tertukar dengan indexer yang mati.

Results membedakan EMPAT keadaan hasil, bukan dua. Baris ketiga Demo data di
panel privacy-result ikut dibuang: ia bukan di verified-stamp, jadi ia lolos
setiap gerbang sebelumnya.

VoteModal tidak lagi menawarkan vote pada status yang kontraknya pasti tolak,
dan sekarang menampilkan eligibilityPolicy — spec 9.4 menuntutnya di kartu DAN
di modal, dan modal adalah tempat keputusannya diambil.

demo-data.ts dihapus dan prop onCreate dicabut DI SINI, bukan di task
berikutnya: keduanya menyusun objek Ballot bentuk lama dan tidak dapat
ditypecheck setelah Ballot bertambah field wajib.

paritas-permukaan-rantai.test.tsx menggantikan uji paritas warisan, dan
memisahkan secara eksplisit assert yang ditulis tangan (bukti) dari pemeriksaan
himpunan kelas CSS (detektor perubahan). Ia TIDAK memakai cap-tampilan.tsx;
mengklaim sebaliknya akan menjadi klaim yang salah."
```

**Deliverable:** seluruh UI membaca rantai; tidak ada angka mockup yang tersisa; kegagalan punya permukaannya sendiri; uji pengganti berdiri dengan kekuatan yang dinyatakan apa adanya.

---

### Task 9: Pembersihan, seam C-2b, dan gerbang penutup

Tiga pekerjaan yang hanya bisa dilakukan setelah semuanya terpasang: membuang yang sudah tidak punya pemakai, memasang batas yang dibutuhkan C-2b beserta penjaganya, dan mengunci klaim-klaim yang C-2a buat supaya tidak bisa membusuk diam-diam.

**Files:**
- Create: `client/src/lib/chain/jalur-tulis.ts`, `client/src/lib/chain/batas-bundel.test.ts`
- Modify: `client/src/components/votepriv/Docs.tsx`

> **Sudah dikerjakan di Task 8, jangan diulang di sini.** Penghapusan `demo-data.ts` (Task 8 Step 10) dan pencabutan prop `onCreate` dari `CreateBallotModal` (Task 8 Step 9) **pindah ke Task 8** karena keduanya harus terjadi **sebelum** Task 8 Step 15 menuntut `pnpm check` bersih: `demo-data.ts` dan `CreateBallotModal.create()` sama-sama menyusun objek `Ballot` bentuk lama, yang tidak dapat ditypecheck setelah `Ballot` bertambah field wajib di Task 6. Meninggalkannya di Task 9 membuat gerbang Task 8 mustahil dilewati.

**Interfaces:**
- Consumes: tidak ada yang baru.
- Produces:
  - `JALUR_TULIS_SIAP: boolean` — `false` sampai C-2b
  - `muatJalurTulis(): Promise<never>` — satu-satunya pintu jalur tulis, di balik `await import()`. Tipe kembaliannya `never` **dan bukan** `Promise<typeof import("./tulis")>`: modul `./tulis` belum ada, dan menuliskan tipe yang menunjuk berkas yang tidak ada membuat `pnpm check` merah. C-2b yang mengganti tanda tangannya ketika modulnya lahir.

- [ ] **Step 1: Pastikan pencabutan Task 8 benar-benar sudah terjadi**

Ini pemeriksaan, bukan pengulangan. Kalau salah satunya terlewat, Task 8 Step 15 seharusnya sudah merah — tetapi memeriksanya di sini lebih murah daripada menemukannya lewat gerbang bundel.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
test -e client/src/components/votepriv/demo-data.ts \
  && echo "MASIH ADA demo-data.ts — kerjakan Task 8 Step 10" \
  || echo "sudah tidak ada: demo-data.ts"
grep -rn "demo-data\|initialBallots\|onCreate" client/src --include=*.ts --include=*.tsx | grep -v '\.test\.' || echo "tidak ada pemakai"
```

Diharapkan: `sudah tidak ada: demo-data.ts` dan `tidak ada pemakai`. `onCreate` ikut dicari karena ia prop yang dicabut Task 8 Step 9; ia masih boleh muncul sebagai nama prop `LiveBallots`/`Overview` (`onCreate: () => void`, yang membuka modal) — periksa bahwa yang tersisa **hanya** itu, dan bukan `onCreate` milik `CreateBallotModal`.

- [ ] **Step 2: Buktikan tidak ada angka mockup yang tersisa**

Tiga angka yang §14.6 tandai sebagai "tidak punya sumber" (`+18% this month`, `+24.6% participation`, `2.4s finality`) **tidak ada di sumber hari ini** — diperiksa; C-1 tidak pernah membawanya. Ketiganya tetap ikut dalam pola di bawah sebagai penjaga terhadap pemunculan kembali, bukan sebagai bukti bahwa mereka pernah dibuang. Yang benar-benar ada dan harus hilang adalah isi `demo-data.ts` dan angka karangan di `Overview.tsx`.

**Lingkupnya dipersempit ke direktori milik VotePriv, bukan seluruh `client/src`.** Alasannya diperiksa, bukan kehati-hatian: `client/src/components/ui/sheet.tsx`, `client/src/components/Map.tsx`, dan `client/src/pages/NotFound.tsx` semuanya memuat angka `500` secara sah, dan pola berbasis digit yang disapukan ke seluruh pohon akan memerah karena berkas yang tidak ada hubungannya dengan rencana ini. Angka dicocokkan dengan batas kata (`\b`) untuk alasan yang sama.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
POLA='Demo data|1,928,441|4,286|ballot-04|ballot-03|2\.4s|\+18%|\+24\.6%|\b(842|1200|1108|1500|316)\b|Protocol Grants Round 03|Network Upgrade 7B|ZK Commons|Midnight Core'
grep -rnE "$POLA" \
  client/src/components/votepriv client/src/pages/Home.tsx client/src/hooks client/src/lib/chain \
  --include=*.ts --include=*.tsx | grep -v '\.test\.' || echo "bersih"
```

Diharapkan: `bersih`. Berkas uji dikecualikan dengan sengaja — `fixture-ballot.ts` memang meniru bentuk data nyata, dan judul ballot boleh muncul di sana sebagai fixture.

Bila `Midnight Builders` masih muncul sebagai **nama workspace yang dipatok** di sidebar (`.workspace-card`), itu adalah salah satu dari empat angka §14.6 yang "keputusan produk, bukan keputusan kode". **C-2a tidak memutuskannya**; ia hanya menolak menampilkannya sebagai fakta rantai. Bila ia dipertahankan, biarkan sebagai nama workspace dan jangan menyebutnya berasal dari ballot mana pun.

- [ ] **Step 3: Pasang seam jalur tulis C-2b**

Pemisahan kode **sudah terbukti** di investigasi: muat awal tetap 1.451.420 B dan 10.932.682 B baru turun ketika jalur tulis dipicu. Yang dipasang di sini adalah pintunya, beserta penjaga supaya seseorang tidak diam-diam menggantinya dengan impor statis di C-2b.

`client/src/lib/chain/jalur-tulis.ts`:

```typescript
/**
 * SATU-SATUNYA pintu ke jalur TULIS (C-2b): castVote, tallyVote, createBallot,
 * finalize.
 *
 * Jalur tulis menyeret ledger-v8 (10.143.782 B) lewat paket midnight-js-*, plus
 * wallet, proof server, dan artefak ZK. Membuatnya masuk lewat impor STATIS
 * berarti setiap pembaca yang hanya ingin melihat hasil ballot mengunduh belasan
 * megabyte untuk sesuatu yang tidak pernah ia pakai.
 *
 * Pemisahan kodenya TERBUKTI, bukan diharapkan: muat awal tetap 1.451.420 B, dan
 * 10.932.682 B baru turun saat jalur tulis dipicu.
 *
 * ATURAN UNTUK C-2b, dan ia dijaga mesin oleh batas-bundel.test.ts:
 *
 *   1. Modul ./tulis TIDAK BOLEH diimpor secara statis dari mana pun.
 *   2. Satu-satunya cara memuatnya adalah `await muatJalurTulis()` di bawah.
 *   3. Pemanggilnya harus menampilkan keadaan memuat: unduhan belasan megabyte
 *      di jaringan biasa memakan waktu yang terasa, dan tombol yang diam selama
 *      itu terbaca sebagai tombol yang rusak.
 */

/** false sampai C-2b menaruh ./tulis.ts di sebelah berkas ini. */
export const JALUR_TULIS_SIAP = false;

export async function muatJalurTulis(): Promise<never> {
  // Sengaja melempar, bukan mengembalikan modul palsu: modul palsu yang
  // "berhasil" akan membuat UI menampilkan tanda terima untuk transaksi yang
  // tidak pernah ada — tepat kesalahan yang C-1 buang dari VoteModal.
  throw new Error(
    "Jalur tulis belum ada. Ia dibangun di Rencana C-2b (castVote, tallyVote, createBallot, finalize) " +
      "dan masuk lewat dynamic import di berkas ini, bukan lewat impor statis.",
  );
}
```

- [ ] **Step 4: Tulis gerbang batas bundel sebagai uji**

```typescript
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const AKAR = path.resolve(new URL("../../../..", import.meta.url).pathname);
const SRC = path.join(AKAR, "client", "src");

function berkasSumber(dir: string): string[] {
  const keluar: string[] = [];
  for (const nama of readdirSync(dir)) {
    const p = path.join(dir, nama);
    if (statSync(p).isDirectory()) keluar.push(...berkasSumber(p));
    else if (/\.tsx?$/.test(nama) && !/\.test\.tsx?$/.test(nama)) keluar.push(p);
  }
  return keluar;
}

const sumber = berkasSumber(SRC).map(p => [p, readFileSync(p, "utf8")] as const);

describe("batas bundel C-2a", () => {
  it("TIDAK ada satu pun impor ledger-v8 atau midnight-js-* di jalur aplikasi", () => {
    // Keduanya milik jalur TULIS. ledger-v8 sendiri 10.143.782 B, dan memakai
    // midnight-js-indexer-public-data-provider untuk MEMBACA membengkakkan
    // bundel jadi 12.383.609 B (8,5x) tanpa menambah kemampuan apa pun.
    const pelanggar = sumber
      .filter(([, isi]) => /@midnight-ntwrk\/(ledger-v8|midnight-js-)/.test(isi))
      .map(([p]) => path.relative(AKAR, p));
    expect(pelanggar).toEqual([]);
  });

  it("HANYA satu berkas yang mengimpor runtime WASM", () => {
    const pengimpor = sumber
      .filter(([, isi]) => /@midnight-ntwrk\/compact-runtime|managed\/(ballot|registry)\/contract/.test(isi))
      .map(([p]) => path.relative(AKAR, p));
    expect(pengimpor).toEqual(["client/src/lib/chain/dekode.ts"]);
  });

  it("modul jalur tulis TIDAK diimpor secara statis dari mana pun", () => {
    const statis = sumber
      .filter(([p, isi]) => !p.endsWith("jalur-tulis.ts") && /from ["'].*chain\/tulis["']/.test(isi))
      .map(([p]) => path.relative(AKAR, p));
    expect(statis).toEqual([]);
  });

  it("permukaan publik lapis rantai tidak mengekspor satu pun operasi tulis", () => {
    // Diassert pada PERNYATAAN EKSPOR, bukan pada teks mentah.
    //
    // Versi pertama uji ini memeriksa teks mentah dan karena itu memerah karena
    // DOCSTRING index.ts sendiri — yang menjelaskan bahwa castVote/tallyVote/
    // createBallot/finalize BUKAN bagian permukaan ini. Sebuah gerbang yang
    // dipicu oleh kalimat yang menerangkan kepatuhannya bukan gerbang; ia
    // mendorong orang menghapus penjelasan alih-alih memperbaiki kode.
    const mentah = readFileSync(path.join(SRC, "lib", "chain", "index.ts"), "utf8");
    const tanpaKomentar = mentah
      .replace(/\/\*[\s\S]*?\*\//g, " ")   // blok /* … */ termasuk JSDoc
      .replace(/(^|[^:])\/\/.*$/gm, "$1"); // baris // …, tanpa memakan "https://"
    for (const nama of ["castVote", "tallyVote", "createBallot", "finalize", "submitTransaction", "balanceUnsealed"]) {
      expect(tanpaKomentar, `index.ts menyebut ${nama} di luar komentar`).not.toContain(nama);
    }
    // Dan pastikan pembuang komentar tidak membuang KODE-nya juga: kalau
    // keduanya ikut terhapus, uji di atas akan hijau apa pun isi berkasnya.
    expect(tanpaKomentar).toContain("export { bacaRantai }");
    expect(tanpaKomentar).toContain("export { GalatRantai }");
  });
});
```

- [ ] **Step 5: Perbarui `Docs.tsx` dengan batasan §6.3 yang benar-benar berlaku**

Spec §6.3 menulis: *"Ini harus disebut apa adanya di halaman Docs aplikasi, bukan disembunyikan."* Dua di antaranya sudah dapat diperiksa siapa pun dari data yang sekarang ditampilkan UI, jadi menyebutnya bukan lagi janji melainkan keterangan atas angka yang terlihat.

Blok `code-note` yang sekarang memuat `generateProof` / `submitVote` — dua nama yang **tidak ada** di batas `PrivacyAdapter` menurut spec §8, karena keduanya sudah dilebur menjadi `castVote` — diganti dengan bentuk baca-saja yang benar-benar dipakai C-2a:

```typescript
<div className="code-note">
  <div className="code-note-top"><Code2 size={15} /> Read path, today <span>TypeScript</span></div>
  <pre>{`bacaRantai()
  → registry.ballots          (contract discovery)
  → per-ballot contract state (title, counts, tallies)
  → block height + epoch      (network status)

No wallet. No proof server. No signing.
Three HTTP requests, all public.`}</pre>
</div>
```

Dan satu panel baru di `docs-sidebar` yang menyebut batasan §6.3 apa adanya:

```typescript
<div className="side-panel">
  <p className="eyebrow mint-text">Known limits</p>
  <h2>What this design costs.</h2>
  <p>
    <strong>Unopened votes do not count.</strong> Voters must return after the deadline to open
    their sealed vote. The gap is public as sealed minus opened, so it stays auditable — but it is
    a real cost of the two-phase design.
  </p>
  <p>
    <strong>Quorum is a stated intention, not a rule.</strong> The contract records the quorum the
    ballot creator asked for, and never checks it. A ballot finalizes at 0% turnout exactly as it
    does at 100%.
  </p>
  <p>
    <strong>Losing local state loses the vote.</strong> If browser storage is cleared before the
    tally, the opening is gone and the sealed vote can never be counted.
  </p>
</div>
```

- [ ] **Step 6: Bangun ulang dan kunci ukuran bundel terhadap ambang yang diturunkan**

Ini pengulangan Task 2 Step 11 tanpa berkas umpan — sekarang yang menarik WASM adalah kode sungguhan.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm build 2>&1 | tail -8
node --input-type=module -e '
import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
// Entri paket, BUKAN subpath ./package.json — lihat Task 2 Step 2.
const req = createRequire(path.join(process.cwd(), "pkgs", "contract", "package.json"));
const req2 = createRequire(req.resolve("@midnight-ntwrk/compact-runtime"));
const wasmPath = path.join(path.dirname(req2.resolve("@midnight-ntwrk/onchain-runtime-v3")), "midnight_onchain_runtime_wasm_bg.wasm");
const wasmB = statSync(wasmPath).size;
const dir = "dist/public/assets";
const f = readdirSync(dir);
const js = f.filter(x => x.endsWith(".js"));
const wasm = f.filter(x => x.endsWith(".wasm"));
const totalJs = js.reduce((s, x) => s + statSync(path.join(dir, x)).size, 0);
const totalWasm = wasm.reduce((s, x) => s + statSync(path.join(dir, x)).size, 0);
const gab = Buffer.concat(js.map(x => readFileSync(path.join(dir, x))));
console.log("wasm terpasang        :", wasmB, "B");
console.log("wasm di bundel        :", totalWasm, "B  (", wasm.length, "berkas )");
console.log("js mentah             :", totalJs, "B  (", js.length, "berkas )");
console.log("js gzip               :", gzipSync(gab).length, "B");
console.log("js brotli             :", brotliCompressSync(gab).length, "B");
if (wasm.length !== 1) throw new Error("jumlah berkas WASM bukan satu — instance ganda atau WASM tak terduga");
if (totalWasm > wasmB * 1.2) throw new Error("ukuran WASM di bundel melampaui satu salinan onchain-runtime-v3");
if (totalJs > wasmB * 4) throw new Error("bundel JS melampaui ambang — periksa apakah ledger-v8 atau midnight-js-* ikut masuk");
console.log("LULUS");
'
```

Diharapkan: baris terakhir `LULUS`, **tepat satu** berkas `.wasm`, dan angka gzip/brotli yang sebanding dengan yang diukur investigasi (413.803 B gzip / 306.578 B brotli). Ketiga angka investigasi itu **orientasi**, bukan gerbang — gerbangnya adalah ambang yang perintah ini turunkan sendiri.

- [ ] **Step 7: Buktikan `ledger-v8` benar-benar tidak ada di keluaran build**

Uji di Step 4 memeriksa sumber. Ini memeriksa **keluaran**, yang bisa berbeda kalau sebuah ketergantungan transitif menyeretnya.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -rl "ledger-v8\|midnight-js-indexer-public-data-provider\|midnight_ledger_wasm" dist/public/assets 2>/dev/null \
  && echo "PELANGGARAN: paket jalur tulis ikut terbundel" \
  || echo "bersih: tidak ada jejak ledger-v8 maupun indexer-public-data-provider"
```

Diharapkan: baris `bersih:`.

- [ ] **Step 8: Jalankan seluruh gerbang sekali lagi**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm check:uji
pnpm test 2>&1 | tail -15
VOTEPRIV_UJI_JARINGAN=1 pnpm test client/src/lib/chain/jaringan-nyata.test.ts 2>&1 | tail -8
```

Diharapkan: `pnpm check` tanpa keluaran; seluruh uji hijau dengan `jaringan-nyata` dilewati; perintah ketiga menjalankan pemeriksaan jaringan dan hijau.

- [ ] **Step 9: Commit penutup**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add -A client/src scripts
git commit -m "chore(app): buang data mockup, pasang seam jalur tulis C-2b, kunci batas bundel

Tidak ada angka mockup yang tersisa di jalur aplikasi. demo-data.ts dan prop
onCreate sudah dicabut di Task 8, karena keduanya menghalangi gerbang pnpm
check di sana; commit ini hanya memverifikasinya.

jalur-tulis.ts adalah satu-satunya pintu ke castVote/tallyVote/createBallot/
finalize, dan ia MELEMPAR alih-alih mengembalikan modul palsu: modul palsu yang
berhasil akan menampilkan tanda terima untuk transaksi yang tidak pernah ada.

batas-bundel.test.ts menjaga tiga hal yang mudah rusak diam-diam: tidak ada
impor ledger-v8 maupun midnight-js-* di jalur aplikasi, HANYA satu berkas yang
mengimpor runtime WASM, dan permukaan publik lapis rantai tidak mengekspor satu
pun operasi tulis. Yang terakhir diassert pada pernyataan ekspor setelah
komentar dibuang, bukan pada teks mentah: versi pertamanya memerah karena
DOCSTRING index.ts sendiri, yaitu kalimat yang menerangkan kepatuhannya.

Docs menyebut ketiga batasan spec 6.3 apa adanya, termasuk bahwa kuorum adalah
niat yang dinyatakan dan bukan aturan yang ditegakkan."
```

**Deliverable:** tidak ada data mockup yang tersisa; batas C-2b terpasang dan dijaga mesin; ukuran bundel dikunci terhadap ambang yang diturunkan sendiri; halaman Docs menyebut batasannya apa adanya.

---

## Selesai bila

Seluruh pernyataan di bawah dapat diperiksa dengan perintah, bukan dengan ingatan.

1. `pnpm check` **dan** `pnpm check:uji` dua-duanya tanpa keluaran, `pnpm test` hijau seluruhnya. Perintah kedua ada karena `tsconfig.json` meng-exclude `**/*.test.ts`, sehingga delapan berkas uji baru berakhiran `.test.ts` **tidak pernah** diperiksa `pnpm check`.
2. `node -e "console.log(JSON.parse(require('node:fs').readFileSync('tsconfig.json','utf8').replace(/^\s*\/\/.*$/gm,'')).compilerOptions.target)"` mencetak `ES2022`. Tanpa ini setiap spread atas tipe ledger melempar TS2802 dan keempat gerbang di butir 1 mustahil dilewati.
3. `VOTEPRIV_UJI_JARINGAN=1 pnpm test client/src/lib/chain/jaringan-nyata.test.ts` hijau terhadap indexer sungguhan.
4. Gerbang bundel Task 9 Step 6 berbunyi `LULUS`, dengan **tepat satu** berkas `.wasm`.
5. `grep -rl "ledger-v8\|midnight-js-" dist/public/assets` tidak menemukan apa pun.
6. `grep -rniE "demo\s+data|initialBallots" client/src/components/votepriv client/src/pages/Home.tsx client/src/hooks client/src/lib/chain --include=*.ts --include=*.tsx | grep -v '\.test\.'` tidak menemukan apa pun. Pencocokannya **tidak peka huruf besar dan longgar terhadap spasi**, karena baris yang lolos gerbang sebelumnya berbunyi `Demo data below`, bukan `Demo data`.
7. Uji `batas-bundel.test.ts` membuktikan hanya `dekode.ts` yang mengimpor runtime WASM, dan bahwa `index.ts` — **setelah komentarnya dibuang** — tidak menyebut satu pun operasi tulis.
8. Uji `paritas-permukaan-rantai.test.tsx` membuktikan kegagalan indexer **tidak** terlihat seperti "tidak ada ballot"; bahwa kelima teks chip filter benar; bahwa persentase hasil diturunkan dari tallies **jarang**; bahwa Recent activity menampilkan **selisih ledger** dan bukan nama entry point; dan bahwa tidak ada kelas CSS baru yang dipakai.
9. Uji `Overview.test.tsx` membuktikan registry **kosong** tidak membuat `Overview` crash, dan permukaannya menyebut bahwa pembacaan berhasil.
10. `pnpm test` **tidak menyentuh jaringan sama sekali**: `Home.smoke.test.tsx` mem-stub `fetch`, dan `jaringan-nyata.test.ts` dilewati tanpa `VOTEPRIV_UJI_JARINGAN=1`.
11. Melihat dengan mata pada 1280px dan 375px sudah dilakukan sekali (Task 8 Step 16), karena jsdom tidak memuat `index.css`.
12. Uji paritas warisan hilang sebagai **keputusan tercatat** di pesan commit Task 1, lengkap dengan sha256 berkas yang dihapus dan nama penggantinya.

---

## Apa yang C-2a TIDAK buktikan — dinyatakan apa adanya

Klaim yang dibeli rencana ini persis sebesar ini: *UI VotePriv menampilkan keadaan kontrak yang benar-benar dibaca dari indexer Midnight, dengan status yang diturunkan dari fase ledger digabung waktu blok, dan dengan keempat keadaan kegagalan yang punya permukaannya sendiri.* Yang **tidak** dijangkaunya:

| Tidak terverifikasi | Mengapa, dan apa penggantinya |
|---|---|
| Bahwa data yang dibaca **benar** menurut kontrak | Yang diuji adalah pemetaan dan dekode. Kebenaran ledger itu sendiri dijamin kontrak dan sudah diuji simulator di `pkgs/contract`, bukan di sini |
| Tampilan sesungguhnya | jsdom tidak memuat `index.css`. Penggantinya satu kali melihat dengan mata di Task 8 Step 16, dan itu memang satu-satunya cara |
| Perilaku pada registry dengan puluhan ballot | Fixture memuat ballot sebanyak yang ada di rantai hari ini. `MAKS_BALLOT` dan `MAKS_ALAMAT_PER_DOKUMEN` adalah rem yang dirancang, bukan rem yang diukur |
| Perilaku saat indexer **lambat** (bukan mati) | Tidak ada uji timeout. `bacaRantai` menghormati `AbortSignal`, tetapi tidak ada batas waktu yang dipasang sendiri — pemanggil yang menentukannya. Ini lubang yang disebut namanya, bukan yang disembunyikan |
| Bahwa nomor urut stabil pada **setiap** urutan pendaftaran | Stabil pada alur normal deploy-lalu-daftar. Tidak stabil bila ballot lama didaftarkan belakangan; batas itu tertulis di komentar tipenya |
| Apa pun tentang jalur TULIS | Nol baris jalur tulis di C-2a. Seam-nya ada dan dijaga; isinya C-2b |
| Bahwa `Closing soon` tampil cukup lama pada **setiap** ballot | Ambangnya diturunkan dari `tallyDeadline − voteDeadline`, dan kontrak hanya menjamin selisih itu **positif**. Pembuat ballot yang menetapkan jendela tally satu detik mendapat `Closing soon` selama satu detik. Itu konsekuensi yang benar dari menurunkan ambang dari niat pembuatnya; menambahkan lantai tetap akan mengembalikan konstanta ajaib yang baru saja dibuang |
| Bahwa Recent activity menampilkan **seluruh** riwayat | Ia menampilkan jendela `actions(limit: 5)` untuk registry dan `MAKS_BALLOT_BERAKSI` ballot terbaru. Aksi paling tua di dalam jendela tidak punya pendahulu yang terbaca, dan barisnya **mengaku** (`earlier state not read`) alih-alih melaporkan nol perubahan. Ballot di luar jendela tidak punya baris sama sekali — dan riwayatnya juga tidak pernah diambil, sehingga tidak ada bandwidth yang dibayar untuk sesuatu yang dibuang |
| Bahwa seluruh berkas uji lolos pemeriksa tipe **pada `pnpm check`** | Tidak, dan itu bawaan `tsconfig.json` yang meng-exclude `**/*.test.ts`. Ditutup dengan konfigurasi kedua (`tsconfig.uji.json`) dan perintah kedua (`pnpm check:uji`), bukan dengan catatan kaki — tetapi keduanya memang **dua** perintah, dan siapa pun yang hanya menjalankan yang pertama tidak memeriksa delapan berkas |
| Perilaku pada indexer yang menjawab **sebagian benar** | Alias yang hilang, kontrak null, dan state yang gagal didekode diuji. Jawaban yang *terlihat* benar tetapi isinya salah — misalnya `state` milik kontrak lain pada alamat yang benar — tidak dapat dibedakan dari luar, dan C-2a tidak berpura-pura bisa |

---

## Risiko dan jalur mundur

| Risiko | Tanda awalnya | Jalur mundur |
|---|---|---|
| **Instance ganda `onchain-runtime-v3`** | `"expected instance of ChargedState"` padahal datanya benar | Gerbang Task 2 Step 2 dan uji `instance-tunggal.test.ts` memaksa kegagalan muncul di task fondasi. Perbaikannya: samakan versi `compact-runtime` akar dengan `pkgs/contract` |
| **`vite-plugin-wasm` tidak aktif** | build gagal menyebut `ESM integration proposal for Wasm` | Periksa urutan plugin: `wasm()` harus paling depan, sebelum `react()` |
| **Alias `@pkgs` tidak terselesaikan di uji** | `Failed to resolve import "@pkgs/..."` hanya di vitest | `vitest.config.ts` punya `resolve.alias` sendiri dan tidak mewarisi dari `vite.config.ts`. Task 2 Step 5 |
| **Fixture menjadi usang** | sebuah assert berubah tanpa ada kode yang berubah | Itu **informasi**, bukan kegagalan: rantainya yang berubah. Rekam ulang dengan `node scripts/rekam-fixture-rantai.mjs`, baca diff-nya, lalu perbarui assert yang ditulis tangan dengan sadar |
| **Registry bertambah sampai ratusan entri** | Overview melambat | `MAKS_BALLOT` memotong **ekor** daftar (yang paling lama, karena `pushFront`), sehingga ballot terbaru selalu terbaca. Bila itu tidak cukup, paginasi adalah pekerjaan terpisah |
| **Indexer publik mati saat demo** | permukaan `indexer-tak-terjangkau` | Itu justru hasil yang benar: kalimatnya menyebut host dan menawarkan Retry. Jalur mundur demo: jalankan indexer lokal dan set `VITE_MIDNIGHT_NETWORK=undeployed` |
| **Skema indexer berubah** | `graphql-fatal` dengan pesan `Unknown field` | Perintah introspeksi di Task 5 Step 2 menunjuk perubahannya. Bidang yang paling mungkin berubah: `Contract.actions(limit:, type:)`, yang **tidak ada** di preprod hari ini dan hanya ada di preview |

**Satu perbedaan jaringan yang sudah ditemukan dan wajib diingat:** skema **preprod** hari ini **tidak punya** field root `contract(address:)` sama sekali — hanya `contractAction(address:, offset:)`. Seluruh jalur baca C-2a bersandar pada `contract { state actions }`, jadi berpindah ke preprod **bukan** sekadar mengganti satu variabel lingkungan. Bila itu suatu saat dibutuhkan, ia pekerjaan tersendiri, dan Task 5 Step 2 adalah perintah yang memberitahu seberapa besar.

---

## Rencana berikutnya — C-2b, jalur TULIS

Bukan bagian rencana ini. Yang C-2a tinggalkan untuknya:

- `client/src/lib/chain/jalur-tulis.ts` — pintunya sudah ada, di balik `await import()`, dengan aturannya tertulis dan dijaga `batas-bundel.test.ts`.
- `client/src/components/votepriv/CreateBallotModal.tsx` — formulirnya utuh, tinggal menumbuhkan empat field yang dituntut constructor (`tallyDeadline`, `eligibleCount`, `quorumPercent`, `eligibilityPolicy`) dan menyambungkannya.
- `VoteModal` tahap `proving` — tiga langkahnya sudah berdiri, dan spec §9.1 sudah memetakan ketiganya ke operasi nyata.
- `Ballot.phase`, `voteDeadlineMs`, `tallyDeadlineMs`, `tallied` — sudah dibawa sampai ke UI, sehingga aksi "Buka suara Anda" (§9.2 butir 4) punya seluruh bahan yang ia butuhkan tanpa pembacaan tambahan.
- Urutan yang §14.5 wajibkan tetap berlaku dan **tidak boleh dibalik**: buktikan rantainya lebih dulu dengan sirkuit `register` milik registry (prover key 24 KB), baru `castVote` (9,99 MB). Bila `castVote` gagal setelah `register` lolos, kegagalannya pasti soal ukuran dan bukan soal API.
- Dan yang paling mudah terlupa: §14.8 — begitu jalur tulis hidup, **topologi menentukan klaim privasi yang boleh dibuat**, dan indikator yang sudah ada di sidebar tidak boleh dilunakkan.

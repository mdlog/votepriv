# `register-leaves`: penyelenggara menerima leaf, bukan membuat credential

SHA commit: `455f7b635dc12959b0b53421aca5a1dc707620ec` (feat(cli): register-leaves — penyelenggara menerima leaf, bukan membuat credential).

## 1. Mengapa (ringkas)

Sebelum perbaikan ini, `pkgs/cli/src/deploy-ballot.ts` memanggil `buatCredential()`
tiga kali lalu menyimpan credential mentahnya ke artefak untuk dibagikan
manual — penyelenggara memegang rahasia SETIAP pemilih dan bisa memilih atas
nama siapa pun. Kontrak tidak menuntut itu: `registerVoters(leaves, n)` hanya
menerima **hash** (`cred_leaf(cred)`). Pola baru: pemilih membuat credential
sendiri (task browser terpisah) dan hanya mengirim leaf publiknya; CLI ini
menerimanya lewat berkas dan mendaftarkannya tanpa pernah menyentuh
credential. Pola "credential dari tanda tangan wallet" TIDAK diusulkan
ulang — lihat `.superpowers/signdata-determinisme.md` (Schnorr nonce acak,
9/9 tanda tangan berbeda).

## 2. Yang dibangun

### 2.1 `pkgs/cli/src/leaf-file.ts` (baru)

Seluruh logika yang bisa diuji tanpa jaringan untuk perintah `register-leaves`:

- `uraiBerkasLeaf(isi)` / `bacaBerkasLeaf(jalur)` — parser berkas leaf: satu
  hex 64 karakter per baris (dengan/tanpa `0x`, dinormalisasi huruf kecil),
  baris kosong dan `#komentar` diabaikan, duplikat DI DALAM berkas ditolak
  (dibandingkan pada bentuk kanonik). Melempar dengan nomor BARIS ASLI di
  setiap pesan galat.
- `jalurBerkasLeafDariArgv(argv)` — argumen posisional pertama yang bukan
  flag; leaf bukan rahasia (akan ditulis ke rantai publik lewat
  `registerVoters`), jadi jalur berkas di argv aman.
- `validasiKuotaPendaftaran(ledger, jumlahBaru)` — dua pemeriksaan WAJIB
  sebelum menyentuh rantai: `voteCount == 0` (pendaftaran menutup permanen
  begitu suara pertama masuk) dan `registeredCount + jumlahBaru <=
  eligibleCount`.
- `periksaLeafSudahTerdaftar(daftar, eligibility)` — mengecek PER LEAF
  apakah sudah ada di pohon eligibility lewat `eligibility.findPathForLeaf(leaf)`
  (path ada = sudah terdaftar). Ini BUKAN enumerasi pohon (tidak pernah
  mendaftar SEMUA leaf yang ada) — ia menjawab persis satu pertanyaan yang
  relevan ("apakah LEAF INI sudah ada"), dan merupakan metode yang SAMA
  yang sudah dipakai `client/src/lib/chain/eligibility-tulis.ts` untuk
  menyusun eligibilityPath pemilih (jadi terbukti bekerja pada ledger
  nyata). Bila pemanggilannya sendiri gagal, hasilnya `bisaDiperiksa: false`
  dengan alasan — register-leaves.ts lalu mundur ke pemeriksaan JUMLAH saja
  dan mencatat WARN, alih-alih menggagalkan seluruh perintah.
- `pecahLeafMenjadiBatch(daun, ukuran=8)` — memecah array jadi kelompok
  <=8 TANPA padding (beda dari `batchDaun` di deploy.ts, yang mem-padding
  PERSIS 8 untuk bentuk `Vector<8,...>` yang dituntut runtime kontrak).
- `daftarkanSemuaBatch(ballot, daun, log, opsi, daftarkanVoterFn=daftarkanVoter)`
  — memanggil `daftarkanVoter` (deploy.ts, SUDAH ADA — retry + pemeriksaan
  "sudah mendarat" lewat `registeredCount`) SATU KALI PER BATCH, berurutan.

### 2.2 `pkgs/cli/src/register-leaves.ts` (baru) — perintah CLI

`pnpm cli register-leaves <jalur-berkas-leaf>`. Skrip tingkat-atas (pola
sama dengan `deploy-ballot.ts`): baca sesi lewat `siapkanSesi()`, tentukan
ballot (`VOTEPRIV_BALLOT=<alamat>` atau artefak), `bacaBerkasLeaf` (validasi
format+duplikat — GAGAL DI SINI sebelum apa pun lain), baca ledger sekali,
`validasiKuotaPendaftaran` + `periksaLeafSudahTerdaftar` (GAGAL SEBELUM
proof ZK ~10 MB dibangun), lalu `daftarkanSemuaBatch`, lalu cetak ringkasan
(`registeredCount` sebelum/sesudah, `terdaftar`). Terdaftar di
`pkgs/cli/package.json` `scripts["register-leaves"]`.

**Keamanan yang mengikat, dipenuhi secara struktural**: `register-leaves.ts`
tidak mengimpor `buatCredential`/`daunEligibility` sama sekali, dan tidak
pernah membaca `.credentials` dari objek apa pun (dijaga guard negatif di
`register-leaves-wiring.test.ts`).

### 2.3 `pkgs/cli/src/pendaftaran-awal.ts` (baru) — mode `VOTEPRIV_TANPA_PENDAFTARAN`

`VOTEPRIV_TANPA_PENDAFTARAN=1 pnpm cli deploy-ballot` men-deploy ballot dan
mencatatnya ke registry TANPA membuat credential maupun mendaftarkan leaf:

- `modeTanpaPendaftaranAktif(env)` — aktif hanya pada `env` persis `"1"`.
- `eligibleCountDariEnv(env, bawaan=3)` — dari `VOTEPRIV_ELIGIBLE_COUNT`,
  bawaan 3 (perilaku LAMA). Batas 1..1024 SENGAJA tidak diulang di sini —
  sudah ditegakkan `validasiMetadata` (deploy.ts).
- `siapkanPemilihAwal(tanpaPendaftaran, n, buatCredentialFn, daunEligibilityFn)`
  — TIDAK memanggil `buatCredentialFn`/`daunEligibilityFn` SAMA SEKALI bila
  `tanpaPendaftaran`.
- `bentukFieldCredentials(credentials)` — objek KOSONG (bukan
  `{credentials: undefined}`) bila argumennya `undefined`, dipakai lewat
  SPREAD di titik `tulisArtefak` sehingga bentuk objek literal
  `{ ballot: alamatBallot, ... }` yang sudah dijaga
  `jadwal-artefak-wiring.test.ts` tetap utuh.
- `daftarkanVoterJikaPerlu(tanpaPendaftaran, ...)` — TIDAK memanggil
  `daftarkanVoterFn` SAMA SEKALI bila `tanpaPendaftaran`.

`deploy-ballot.ts` diperbarui memakai keempatnya; TANPA env var, perilakunya
**tidak berubah** (masih membuat & mendaftarkan tiga credential uji seperti
sebelumnya — dijaga `pendaftaran-awal-wiring.test.ts` + seluruh uji lama
tetap hijau tanpa diubah).

### 2.4 `pkgs/cli/src/bootstrap.ts` — urutan log/prompt seed

**Root cause dibuktikan empiris** (skrip percobaan terpisah, bukan tebakan):
`buatLogger` memakai `pino.transport({ target: "pino-pretty" })` — worker
thread yang baru di-spawn (cold start) setiap kali CLI dijalankan. `log.info`
"Konfigurasi jaringan" SUDAH dipanggil sebelum prompt seed di source (urutan
benar), tapi penulisan pretty-print sesungguhnya ke stdout terjadi ASINKRON
di worker thread, sedangkan prompt seed menulis LANGSUNG+SINKRON tak lama
sesudahnya — race yang, tanpa mitigasi, SELALU dimenangkan prompt (diukur
0/10 lewat child-process nyata, byte stdout gabungan). `logger.flush(cb)`
TERBUKTI TIDAK cukup (`pino.multistream` hanya meneruskan `flushSync`, bukan
`flush` async, ke stream anggotanya — `cb()` terpanggil SEKETIKA tanpa
menunggu worker). Karena mengubah konstruksi transport di `logger.ts` di
luar lingkup, `siapkanSesi` sekarang `await` jeda 300ms
(`JEDA_TRANSPORT_PRETTY_MS`, diekspor) tepat setelah log konfigurasi dan
sebelum prompt — diukur 10/10 andal pada 150ms dan 300ms, 6/10 pada 50ms,
0/10 pada setImmediate/process.nextTick/10ms (margin 2x). Best-effort,
BUKAN jaminan matematis, didokumentasikan apa adanya di komentar konstanta.
Dijaga `siapkan-sesi-urutan-log.test.ts` (penjaga pengkabelan — sumber TEKS,
karena `siapkanSesi` tidak bisa dijalankan sungguhan tanpa wallet/jaringan).

## 3. Gerbang mutasi

Kedua berkas baru (`leaf-file.ts`, `pendaftaran-awal.ts`) **belum ter-commit**
saat gerbang ini dijalankan, sehingga pemulihan antar-mutasi memakai `cp`
dari salinan backup — **bukan** `git checkout --`, yang akan mengembalikan
ke HEAD lama (sebelum task ini ada sama sekali), bukan ke versi
sebelum-mutasi. Preseden sama persis ada di `.superpowers/retry-submit-cli.md`
§3.

### Tabel A — Penjaga diturunkan dari kode (dengan nomor baris)

| # | Berkas:baris | Penjaga |
|---|---|---|
| G1 | leaf-file.ts:65 | `uraiBerkasLeaf`: format hex 64 karakter valid |
| G2 (**WAJIB**) | leaf-file.ts:75 | `uraiBerkasLeaf`: deteksi duplikat DI DALAM berkas |
| G3 | leaf-file.ts:86 | `uraiBerkasLeaf`: tolak berkas kosong setelah penyaringan |
| G4 (**WAJIB**) | leaf-file.ts:149 | `validasiKuotaPendaftaran`: `voteCount == 0` |
| G5 (**WAJIB**) | leaf-file.ts:158 | `validasiKuotaPendaftaran`: `registeredCount + n <= eligibleCount` |
| G6 | leaf-file.ts:209 | `periksaLeafSudahTerdaftar`: `findPathForLeaf(...) !== undefined` |
| G7 | leaf-file.ts:212 | `periksaLeafSudahTerdaftar`: degradasi `catch` -> `bisaDiperiksa:false` (bukan lempar ulang) |
| G8 | leaf-file.ts:228 | `pecahLeafMenjadiBatch`: `ukuran` bilangan bulat `>= 1` |
| G9 | leaf-file.ts:279 | `daftarkanSemuaBatch`: batas batch 8 (kontrak) |
| G10 | pendaftaran-awal.ts:103 | `daftarkanVoterJikaPerlu`: guard `tanpaPendaftaran` -> TIDAK panggil daftarkanVoter |
| G11 | pendaftaran-awal.ts:85 | `bentukFieldCredentials`: `undefined` -> objek TANPA field `credentials` |
| G12 | pendaftaran-awal.ts:63 | `siapkanPemilihAwal`: guard `tanpaPendaftaran` -> TIDAK buat credential |
| G13 | pendaftaran-awal.ts:20 | `modeTanpaPendaftaranAktif`: `=== "1"` (bukan truthy longgar) |
| G14 | pendaftaran-awal.ts:35 | `eligibleCountDariEnv`: `Number.isInteger` |

### Tabel B — Hasil mutasi (satu per satu, `cp` pulih di antaranya)

| # | Mutasi | Hasil | Catatan |
|---|---|---|---|
| G1 | `if (!POLA_HEX_LEAF.test(mentah))` -> `if (false && ...)` | **MERAH** (2 gagal) | Leaf non-hex/panjang salah lolos tanpa galat |
| G2 (**WAJIB**) | `if (barisPertama !== undefined)` -> `if (false && ...)` | **MERAH** (2 gagal) | Duplikat identik MAUPUN duplikat berbentuk-beda (0x+besar) lolos |
| G3 | `if (hasil.length === 0)` -> `if (false && ...)` | **MERAH** (1 gagal) | Berkas kosong mengembalikan array kosong, bukan galat |
| G4 (**WAJIB**) | `if (ledger.voteCount !== 0n)` -> `if (false && ...)` | **MERAH** (1 gagal) | Pendaftaran setelah suara pertama tidak lagi ditolak |
| G5 (**WAJIB**) | `if (BigInt(jumlahBaru) > tersisa)` -> `if (false && ...)` | **MERAH** (1 gagal) | Leaf melebihi eligibleCount lolos validasi |
| G6 | `!== undefined` -> `=== undefined` | **MERAH** (2 gagal) | Leaf yang SUDAH terdaftar dianggap belum, dan sebaliknya |
| G7 | `return {bisaDiperiksa:false,...}` -> `throw e` | **MERAH** (1 gagal) | Kegagalan pemeriksaan eligibility menggagalkan SELURUH perintah, bukan mundur ke pemeriksaan jumlah |
| G8 | `if (!Number.isInteger(ukuran) \|\| ukuran < 1)` -> `if (false)` | **MERAH — CRASH OOM**, bukan sekadar gagal uji | `ukuran=0` membuat `i += ukuran` di loop `pecahLeafMenjadiBatch` tidak pernah maju -> loop tak berhingga -> worker vitest kehabisan heap (`JavaScript heap out of memory`), 28 uji `leaf-file.test.ts` gagal terkumpul sama sekali. Guard ini mencegah crash nyata, bukan hanya kesalahan logis. |
| G9 | `pecahLeafMenjadiBatch(daun, 8)` -> `(daun, 9)` | **MERAH** (1 gagal) | 17 leaf jadi batch 9+8 (bukan 8+8+1), melanggar batas 8 kontrak |
| G10 | `if (tanpaPendaftaran)` -> `if (false)` (daftarkanVoterJikaPerlu) | **MERAH** (1 gagal) | `daftarkanVoter` tetap terpanggil pada mode tanpa-pendaftaran |
| G11 | `if (credentials === undefined) return {}` -> `if (false) return {}` | **MERAH** (1 gagal) | Field `credentials` tidak pernah hilang dari artefak |
| G12 | `if (tanpaPendaftaran) return {daun:[]}` -> `if (false) return {daun:[]}` | **MERAH** (1 gagal) | Credential tetap dibuat pada mode tanpa-pendaftaran |
| G13 | `=== "1"` -> `!== "1"` | **MERAH** (8 gagal) | Mode aktif untuk SEMUA nilai env KECUALI "1" (terbalik total) |
| G14 | `if (!Number.isInteger(n))` -> `if (false)` | **MERAH** (1 gagal) | `VOTEPRIV_ELIGIBLE_COUNT` non-angka lolos jadi `NaN` |

**Ketiga mutasi WAJIB (G2, G4, G5) mengembalikan MERAH persis seperti
disyaratkan.** Total 14/14 mutasi gagal bertahan (semuanya MERAH — tidak ada
yang perlu diperbaiki sebelum commit). Setelah seluruh mutasi, kedua berkas
diverifikasi **identik byte-demi-byte** dengan versi sebelum-mutasi
(`diff -q`), dan `pnpm --filter cli test` kembali **219/219 hijau**.

## 4. Yang TIDAK dilindungi / batasan yang disadari

1. **`periksaLeafSudahTerdaftar` bukan jaminan atomik.** Ada jendela waktu
   antara pembacaan ledger di `register-leaves.ts` dan `registerVoters`
   benar-benar mendarat; leaf yang didaftarkan proses LAIN tepat di jendela
   itu tidak akan terdeteksi oleh pemeriksaan ini (baru terlihat sebagai
   penolakan kontrak, bila memang tabrakan — kontrak sendiri tidak menolak
   leaf duplikat secara eksplisit, hanya `registeredCount`/kapasitas pohon).
2. **`JEDA_TRANSPORT_PRETTY_MS` (300ms) adalah mitigasi empiris, bukan
   jaminan matematis** — mesin yang jauh lebih lambat/sibuk dari mesin uji
   secara teoretis masih bisa memperlihatkan urutan yang salah. Diberi
   margin 2x dari ambang yang sudah andal (150ms) pada mesin uji.
3. **`register-leaves.ts` tidak menuliskan apa pun ke artefak** — leaf
   sengaja tidak dicatat di `pkgs/cli/artefak/<network>.json` (leaf memang
   sudah publik di rantai; menambah field baru di sana bukan bagian dari
   rencana ini dan berisiko membuka jalur baru yang tidak sengaja
   bersinggungan dengan field `credentials` yang sudah ada).
4. **Kegagalan validasi (`bacaBerkasLeaf`, `validasiKuotaPendaftaran`)
   tidak menutup wallet dengan tertib** (tidak ada `hentikanWallet` di
   jalurnya) — pola yang SAMA persis dengan `validasiMetadata` pada
   `deployBallot`/`deploy-ballot.ts` yang sudah ada; konsisten, bukan
   regresi baru.

## 5. Perintah yang dijalankan

```
pnpm --filter cli typecheck   # bersih
pnpm --filter cli test        # 15 berkas / 219 lolos (10/153 lama + 5 berkas baru/66 uji baru)
pnpm check                    # bersih
pnpm check:uji                # bersih
pnpm test                     # klien 37 berkas/478 lolos + 2 dilewati (tidak berubah)
```

`pnpm cli` (apa pun) **tidak pernah dijalankan** — seluruh uji berjalan
tanpa wallet dan tanpa jaringan, sesuai batasan tugas.

## 6. Cara pakai untuk ballot berikutnya

1. Deploy ballot tanpa pendaftaran otomatis:
   ```
   VOTEPRIV_TANPA_PENDAFTARAN=1 VOTEPRIV_ELIGIBLE_COUNT=100 pnpm cli deploy-ballot
   ```
   Artefak mendapat `ballot`/`voteDeadline`/`tallyDeadline`/`options` seperti
   biasa, TANPA field `credentials`.
2. Setiap pemilih membuat credential di browser (task terpisah) dan
   mengirimkan HANYA leaf-nya (hex 64 karakter, `cred_leaf(credential)`)
   kepada penyelenggara lewat kanal apa pun (leaf bukan rahasia).
3. Penyelenggara mengumpulkan leaf ke satu berkas teks (satu leaf per baris,
   `#` untuk komentar), lalu:
   ```
   pnpm cli register-leaves leaves.txt
   # atau, untuk ballot selain yang tercatat di artefak:
   VOTEPRIV_BALLOT=<alamat> pnpm cli register-leaves leaves.txt
   ```
   Perintah ini memvalidasi SEBELUM menyentuh rantai (format, duplikat,
   kuota, `voteCount==0`, leaf sudah terdaftar), lalu mendaftarkan dalam
   batch <=8, mencetak `registeredCount` sebelum/sesudah dan txId tiap
   batch (lewat log `daftarkanVoter` yang sudah ada).
4. Ulangi langkah 3 kapan pun ada leaf baru, SELAMA `voteCount` ballot
   masih 0 — begitu suara pertama masuk, `register-leaves` akan menolak
   dengan pesan yang jelas SEBELUM membangun proof apa pun.

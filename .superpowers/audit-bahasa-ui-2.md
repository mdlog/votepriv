# Audit bahasa UI #2 — VotePriv frontend

Lanjutan `cbbee8b` (`fix(client): teks UI yang tersisa diterjemahkan ke Bahasa
Inggris`). Audit #1 menyisir setiap komponen dan fungsi `lib/` yang
mengembalikan STRING TETAP di kode. Ia melewatkan dua kelas teks Indonesia
yang lahir bukan sebagai string tetap, melainkan sebagai `e.message` galat
RUNTIME yang dirender apa adanya oleh `setGalat`/`setOpenGalat`/`setPesanGalat`
di `VoteModal.tsx`/`RegisterModal.tsx` — dibuktikan dari bundel produksi
TERSAJI (`dist/public/assets/*.js`), bukan dari sumber.

## A. Kelas 1 — ke-23 pesan assert `ballot.compact`, dipetakan ke Inggris

Sumber: `pkgs/contract/src/ballot.compact` (TIDAK diubah — mengubahnya menuntut
membangun ulang artefak ZK 50 MB, deploy ulang, dan mengubah CLI yang sudah
terbukti). Ditutup di klien: `client/src/lib/chain/pesan-rantai.ts`, fungsi
`terjemahkanGalatRantai(pesan: string): string`, pencocokan SUBSTRING (karena
`CallTxFailedError` membungkus pesan assert dengan JSON status transaksi lain
— `TxFailedError` men-`JSON.stringify({circuitId, ...finalizedTxData})`).
Pesan tak dikenal dikembalikan apa adanya.

| # | Circuit | Indonesia (ballot.compact) | Inggris (pesan-rantai.ts) |
|---|---|---|---|
| 1 | constructor | Jumlah opsi harus 2 sampai 4 | This ballot must have between 2 and 4 options. |
| 2 | constructor | Batas waktu pembukaan suara harus setelah batas waktu pemungutan suara | The vote-opening deadline must come after the voting deadline. |
| 3 | constructor | Jumlah pemilih yang berhak minimal 1 | This ballot needs at least 1 eligible voter. |
| 4 | constructor | Jumlah pemilih yang berhak melebihi kapasitas pohon (1024) | This ballot allows more eligible voters than the maximum of 1,024. |
| 5 | constructor | Persentase kuorum tidak boleh melebihi 100 | The quorum percentage cannot be more than 100. |
| 6 | registerVoters | Hanya admin yang boleh mendaftarkan pemilih | Only this ballot's admin can register voters. |
| 7 | registerVoters | Ballot sudah tidak dalam fase pemungutan suara | This ballot is no longer in its voting phase. |
| 8 | registerVoters | Pendaftaran ditutup setelah suara pertama masuk | Registration closed as soon as the first vote was cast. |
| 9 | registerVoters | Jumlah pendaftaran harus 1 sampai 8 | You can register between 1 and 8 voters at a time. |
| 10 | registerVoters | Melebihi eligibleCount yang ditetapkan ballot | This would exceed the number of eligible voters set for this ballot. |
| 11 | castVote | Batas waktu pemungutan suara sudah lewat | The voting deadline for this ballot has passed. |
| 12 | castVote | Ballot tidak sedang menerima suara | This ballot is not currently accepting votes. |
| 13 | castVote | Merkle path bukan untuk credential ini | The submitted proof path does not match this credential. |
| 14 | castVote | Anda tidak terdaftar sebagai pemilih pada ballot ini | This credential is not registered for this ballot. *(diberikan brief)* |
| 15 | castVote | Pilihan di luar opsi yang tersedia | That option is not available on this ballot. |
| 16 | castVote | Credential ini sudah dipakai memilih | This credential has already voted on this ballot. *(diberikan brief)* |
| 17 | tallyVote + finalize | Ballot sudah difinalisasi | This ballot has already been finalized. |
| 18 | tallyVote | Pemungutan suara masih berlangsung | Voting is still open — votes can't be opened yet. |
| 19 | tallyVote | Batas waktu pembukaan suara sudah lewat | The deadline to open votes on this ballot has passed. |
| 20 | tallyVote | Merkle path bukan untuk commitment ini | The submitted proof path does not match this sealed vote. |
| 21 | tallyVote | Commitment tidak ditemukan pada ballot ini | This sealed vote was not found on this ballot. |
| 22 | tallyVote | Suara ini sudah pernah dibuka | This vote has already been opened. |
| 23 | finalize | Batas waktu pembukaan suara belum lewat | This ballot can't be finalized yet — the vote-opening deadline hasn't passed. |

Baris 17 menutup DUA titik assert (`tallyVote` dan `finalize` memakai string
Indonesia yang SAMA PERSIS) — satu entri peta sudah cukup untuk keduanya.

Dipasang di **empat** titik render, bukan dua: `VoteModal.tsx` `setGalat`
(submit castVote) dan `setOpenGalat` (submitOpen/bukaSuara) seperti diminta,
PLUS `RegisterModal.tsx` `setPesanGalat` dan `setGalatPulih` — keduanya
membaca `e.message` dari `jalur.daftarkanDiriSendiri`/
`jalur.pulihkanKredensialDariCadangan` (fungsi jalur tulis yang sama,
`tulis.ts`, lewat `muatJalurTulis()`), jadi berpotensi sama rentannya
walau jalur nyatanya hari ini murni lokal (IndexedDB, tidak pernah
menyentuh rantai).

### Entri ke-24, di luar 23 — dicatat jujur, bukan disembunyikan

`pkgs/contract/src/ballot-witnesses.ts` (`need()`, baris 152-157) melempar
`Error` biasa `` `${nama} untuk ballot ${ballot} belum diisi di private
state` `` (4 varian: credential/opening/eligibilityPath/commitmentPath) dari
witness yang dipanggil compactc-generated code SAAT proof dibuat. Sumbernya
**pkgs/**, bukan `ballot.compact`, dan bukan pula `client/src/lib/chain/` —
tapi sama-sama di luar batas edit (`pkgs/` dilarang disentuh oleh brief ini).
Ditemukan lewat grep bundel sungguhan (`tulis-*.js`), ditutup dengan mekanisme
YANG SAMA dengan Kelas 1 (substring match di `pesan-rantai.ts`, satu entri
generik untuk keempat varian karena akhiran pesannya identik dan tindakan yang
disarankan sama untuk semuanya):

> "This device is missing required local vote data for this ballot — try
> restoring your credential or vote backup file, then try again."

## B. Kelas 2 — galat `Error`/`GalatEligibility` biasa di `client/src/lib/chain/`

Grep lengkap `throw new Error(`, `new Galat[A-Za-z]*(`, dan `reject(...new
Error(`, atas SEMUA `.ts` non-test di `client/src/lib/chain/` (18 berkas),
setiap pesan diperiksa untuk keterjangkauan nyata dari UI.

### Diperbaiki (Indonesia DAN terjangkau layar) — `eligibility-tulis.ts`

| Fungsi:baris | Lama (Indonesia) | Baru (Inggris) |
|---|---|---|
| `bacaLedgerBallotTulis` | `` `Ballot ${alamat} belum terlihat di indexer.` `` | `` `Ballot ${alamat} is not visible on the indexer yet.` `` |
| `ambilPathDenganRetry` (cabang galat baca) | `` `${nama} tidak ditemukan setelah ${n} percobaan. Pembacaan indexer itu sendiri gagal: ${e}. Ini soal konektivitas/indexer, bukan (belum tentu) data yang hilang.` `` | `` `${nama} was not found after ${n} attempts. The indexer read itself failed: ${e}. This points to connectivity/indexer trouble, not (necessarily) missing data.` `` |
| `ambilPathDenganRetry` (cabang kalah balapan) | `…kemungkinan besar kalah balapan dengan pendaftaran/suara baru yang menggeser root; bukan kegagalan jaringan.` | `…most likely it lost a race against a newer registration/vote that moved the root; this is not a network failure.` |

Reachability: `bacaLedgerBallotTulis` dipanggil TANPA try/catch lokal di akhir
`kirimSuara` (baca nullifier pasca-castVote) dan di dalam retry loop
`ambilJalurEligibility`/`ambilJalurCommitment`, keduanya juga dipanggil TANPA
try/catch lokal di `kirimSuara`/`bukaSuara` — keduanya propagasi ke `catch`
umum yang membungkus sebagai `GalatCastVote(e.message, …)` **tanpa mengubah
pesan**, lalu ke `setGalat`/`setOpenGalat`. Komentar Indonesia di sekitarnya
TIDAK diubah. Tiga pin di `eligibility-tulis.test.ts` diperbarui ke teks baru
(`/3 percobaan/` → `/3 attempts/`, `/Pembacaan indexer itu sendiri gagal/` →
`/The indexer read itself failed/`, `/kalah balapan/` → `/lost a race/`) —
tidak ada assert yang dihapus.

### Diperiksa, Indonesia, TAPI dibiarkan — dengan alasan diverifikasi ulang

| Lokasi | Alasan tidak diubah |
|---|---|
| `baca-rantai.ts` (~437-440), `` `Indexer tidak mengembalikan block.height…` `` | Ditangkap `catch` LOKAL di fungsi yang sama (POST 3); jatuh diam-diam ke fallback tinggi blok dari aksi kontrak. Tidak pernah dibungkus `GalatRantai`, tidak pernah sampai panel galat. (Determinasi audit #1, dibaca ulang — masih benar.) |
| `kueri.ts:96,98`, invarian `susunKueriBallot` (`jumlah < 1`, dst.) | `baca-rantai.ts` hanya memanggilnya di dalam `for (const keping of potong(dipakai, …))`; `potong([], n)` mengembalikan `[]` (loop `for (i=0;i<0;…)` nol iterasi) sehingga `jumlah>=1` selalu benar saat dipanggil. Diverifikasi ulang langsung pada `potong()`, bukan hanya dipercaya dari audit #1. |
| `private-state-idb.ts`, `idbDelete`/`idbClear` (`"Gagal menghapus…"`/`"Gagal mengosongkan…"`) dan `belumDidukung` (4× export/import) | `remove`/`clear`/`removeSigningKey`/`clearSigningKeys`/`export*`/`import*` tidak pernah dipanggil oleh `@midnight-ntwrk/midnight-js-contracts@4.0.4` TERPASANG di jalur `castVote`/`tallyVote`/`findDeployedContract` — diverifikasi ULANG lewat grep langsung atas `node_modules/.pnpm/…/dist/index.mjs` (nol hasil untuk `privateStateProvider.(remove|clear|export|import)`), bukan hanya dipercaya dari audit #1. |
| `zk-config-fetch.ts`, `GalatArtefakZk` (2 pesan: `"…mengembalikan text/html…"`, dan implisit HTTP) | `tulis.ts` (baris ~167, ~298) membungkus `pastikanArtefakZkMurah()` dan MENIMPA `message` dengan teks Inggris tetap sebelum melempar `GalatCastVote`; galat asli disimpan HANYA sebagai `.cause`. Diverifikasi ulang: `grep -rn "\.cause\b"` di `client/src` menunjukkan `.cause` hanya pernah DITERUSKAN (tulis.ts:231), tidak pernah DIBACA/dirender. |

Berkas yang sudah 100% Inggris, tidak perlu perubahan (diverifikasi ulang,
bukan diasumsikan): `endpoint.ts`, `adaptor-lace.ts`, `kredensial-idb.ts`,
`graphql.ts`/`dekode.ts`/`baca-rantai.ts` (`GalatRantai.rincian`, DUA titik
lain), `tulis.ts` (6 titik lain, termasuk `GalatOpeningHilang` dan pesan
cadangan-salah-ballot yang sudah diperbaiki audit #1).

## Bukti MERAH

**#1 — hapus satu entri peta (`"Credential ini sudah dipakai memilih"` dari
`PETA_PESAN_ASSERT_KONTRAK`), jalankan uji ke-23:**

```
 ❯ client/src/test/audit-bahasa-ui.test.tsx (89 tests | 1 failed | 63 skipped)
   × terjemahkanGalatRantai … > Credential ini sudah dipakai memilih -> dipaku ke Inggris, walau dibungkus ala CallTxFailedError
     → expected 'Credential ini sudah dipakai memilih' to be 'This credential has already voted on …'

AssertionError: expected 'Credential ini sudah dipakai memilih' to be 'This credential has already voted on this ballot.'
Expected: "This credential has already voted on this ballot."
Received: "Credential ini sudah dipakai memilih"

 Test Files  1 failed (1)
      Tests  1 failed | 25 passed | 63 skipped (89)
```

Entri dikembalikan; uji hijau lagi.

**#2 — lewati `terjemahkanGalatRantai(...)` di `setGalat` (VoteModal.tsx,
kembali ke `e instanceof Error ? e.message : String(e)` polos), jalankan uji
VoteModal "kegagalan KONTRAK":**

```
 ❯ client/src/test/audit-bahasa-ui.test.tsx (89 tests | 1 failed | 88 skipped)
   × VoteModal … > kegagalan KONTRAK (CallTxFailedError membungkus assert Indonesia) dirender Inggris — audit #2 Kelas 1
     → [VoteModal galat kontrak (assert Indonesia terbungkus)] teks Inggris yang diharapkan tidak ditemukan

AssertionError: expected 'Vote not sentSomething went wrong{...}' to match /This credential has already voted on this ballot\./
- Expected: /This credential has already voted on this ballot\./
+ Received: "Vote not sentSomething went wrong{
	\"circuitId\": \"castVote\",
	\"status\": \"FailFallible\",
	\"description\": \"assert failed: 'Credential ini sudah dipakai memilih'\"
}Close"

 Test Files  1 failed (1)
      Tests  1 failed | 88 skipped (89)
```

Baris dikembalikan; uji hijau lagi. Kedua eksperimen dijalankan lalu
dikembalikan sebelum commit — pohon tidak pernah di-commit merah.

## Gerbang bundel bahasa (bagian D, `audit-bahasa-ui.test.tsx`)

Batasan dinyatakan jujur di komentar uji: ke-23 string Indonesia MEMANG ada di
`dist/public/assets/*.js` (kontrak tergenerasi memuatnya, bukan bug), jadi
gerbang ini TIDAK mengassert ketiadaannya — ia mengassert kehadiran ke-23
PADANAN INGGRIS (plus entri ke-24) sebagai bukti `terjemahkanGalatRantai`
sungguh ikut ter-bundle, bukan di-tree-shake. Lewati bersih bila `dist/` tidak
ada (`describe.skipIf`), sama seperti pola `batas-bundel.test.ts` untuk jalur
SUMBER. `AKAR` dihitung lewat `process.cwd()`, BUKAN `new URL(…,
import.meta.url)` — berkas ini `.tsx` (pool jsdom), dan resolusi URL relatif
dari `import.meta.url` di sana terbukti empiris menghasilkan path `/@fs/...`
yang salah (masalah yang sama yang sudah didokumentasikan
`paritas-permukaan-rantai.test.tsx`).

```
=== gerbang batas bundel (atribusi per-chunk, manifest.json) ===
wasm baca terpasang (onchain-runtime-v3) : 1321366 B
wasm terjangkau dari chunk ENTRI          : assets/midnight_onchain_runtime_wasm_bg-DLDy-U1U.wasm
js chunk terjangkau statis dari entri     : 572715 B  ( 1 chunk )
byte chunk JS jalur tulis                 : 985440 B
byte aset .wasm yang chunk itu picu        : 11465148 B
catatan                                    : chunk jalur tulis ditemukan sebagai entri dinamis manifest (assets/tulis-Bg5bW7eQ.js), TIDAK terjangkau statis dari entri — seperti seharusnya.
LULUS
```

(js chunk entri naik dari 570.140 B ke 572.715 B — +2.575 B, konsisten dengan
~200 baris string literal baru di `pesan-rantai.ts`; jalur tulis tetap
terisolasi sebagai entri dinamis, tidak terjangkau statis dari entri.)

## Verifikasi

- `pnpm check`: bersih, tanpa galat.
- `pnpm check:uji`: bersih, tanpa galat.
- `pnpm test`: **40 berkas lolos, 2 dilewati (42) · 612 uji lolos, 2 dilewati
  (614)** — naik dari 40/583+2 (audit #1) karena 29 uji baru di
  `audit-bahasa-ui.test.tsx` (60 → 89): 23 pesan dipaku + 1 cakupan-persis-23
  + 1 pesan tak dikenal + 1 VoteModal terbungkus + 1 cakupan-persis-23
  (salinan independen gerbang bundel) + 2 gerbang bundel (kehadiran ke-23 dan
  ke-24 padanan). `eligibility-tulis.test.ts` tetap 8 uji (3 pin diperbarui,
  0 dihapus).
- `pnpm build`: **sukses** (`vite build` lalu `esbuild server/index.ts`).
  Chunk baru: `index-nhcwC2dl.js` (572.715 B), `tulis-Bg5bW7eQ.js` (985.440 B).
  Peringatan pra-ada yang tidak berhubungan dengan perubahan ini (modul Node
  yang di-externalize dari paket vendor, ukuran chunk >500 kB) tetap muncul,
  tidak baru.
- `node scripts/ukur-batas-bundel.mjs`: **LULUS** (lihat di atas).
- CLI (`pkgs/cli/`): TIDAK disentuh sama sekali oleh audit ini (`pkgs/`
  dilarang oleh batasan tugas) — baseline 15/226 diasumsikan tetap berlaku,
  tidak dijalankan ulang di sini (di luar cakupan perubahan, dan `pnpm cli`
  dilarang oleh batasan tugas).
- Pohon: HANYA berkas yang relevan dengan audit ini yang diubah/ditambah
  (lihat `git diff --stat` / `git status` sebelum commit); untracked
  pra-ada (`.superpowers/lace-serialisasi.md`, `riset-c2b.md`,
  `signdata-determinisme.md`, `spike-c2b-build.md`, `pkgs/cli/leaves/`) BUKAN
  bagian dari audit ini dan tidak ikut di-commit.

## Berkas yang diubah/ditambah

- **Baru**: `client/src/lib/chain/pesan-rantai.ts` (`terjemahkanGalatRantai`, 24 entri: 23 assert `ballot.compact` + 1 invarian witness `ballot-witnesses.ts`).
- `client/src/components/votepriv/VoteModal.tsx`: `terjemahkanGalatRantai` dipasang di `setGalat` (submit) dan `setOpenGalat` (submitOpen).
- `client/src/components/votepriv/RegisterModal.tsx`: `terjemahkanGalatRantai` dipasang di `setPesanGalat` dan `setGalatPulih`.
- `client/src/lib/chain/eligibility-tulis.ts`: 2 pesan `GalatEligibility` diterjemahkan langsung di sumbernya (komentar Indonesia tidak diubah).
- `client/src/lib/chain/eligibility-tulis.test.ts`: 3 pin diperbarui ke teks Inggris baru.
- `client/src/test/audit-bahasa-ui.test.tsx`: header diperbarui + 3 blok uji baru (terjemahkanGalatRantai ke-23, VoteModal terbungkus, gerbang bundel bahasa bagian D) — 60 → 89 uji.

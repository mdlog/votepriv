# Fixture rantai — rekaman respons indexer sungguhan

Direkam oleh `scripts/rekam-fixture-rantai.mjs`. **Jangan disunting tangan.**

| Berkas | Isi |
|---|---|
| `registry.json` | jawaban POST 1: state registry + aksi deploy + 3 aksi terbaru (skrip minta `limit: 5`; rantai baru punya 3 riwayat hari ini) |
| `ballots.json` | jawaban POST 2: `{ alamat, jawaban }` — `alamat` adalah urutan APA ADANYA dari `registry.ballots` (pushFront, terbaru di depan) |
| `jaringan.json` | jawaban POST 3: `block` dan `currentEpochInfo` |
| `meta.json` | jaringan, endpoint, alamat registry, waktu rekam, `sekarangMs`, tinggi blok, ms per POST |
| `tx-mentah-tulis.json` | jawaban POST 2b: byte **MENTAH** (`raw`, hex apa adanya) transaksi castVote/tallyVote yang ditemukan di `ballots.json` — lihat bagian tersendiri di bawah |

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

Dua pemeriksaan terpisah menyentuh jaringan sungguhan dan boleh dilewati:

```bash
VOTEPRIV_UJI_JARINGAN=1 pnpm test client/src/lib/chain/jaringan-nyata.test.ts
VOTEPRIV_UJI_JARINGAN=1 pnpm test client/src/lib/chain/privasi-pembayar.jaringan-nyata.test.ts
```

## `tx-mentah-tulis.json` — byte mentah untuk invarian privasi pembayar

**Provenans, field per field:**

| Field | Isi | Sumber |
|---|---|---|
| `jaringan`, `endpoint` | jaringan dan URL indexer saat rekam | sama seperti `meta.json` |
| `direkamPada` | waktu POST 2b dijalankan | `new Date().toISOString()` saat rekam |
| `transaksi[].entryPoint` | `"castVote"` atau `"tallyVote"` | `ContractCall.entryPoint` dari aksi `terbaru` di `ballots.json` (POST 2), DICOCOKKAN ULANG terhadap `contractActions[].entryPoint` yang dikembalikan `transactions(offset:{hash})` — skrip BERHENTI (throw) bila keduanya tidak sama |
| `transaksi[].hash` | hash transaksi | `transaction.hash` dari aksi yang sama di `ballots.json` |
| `transaksi[].blockHeight` | tinggi blok transaksi | `transaction.block.height` di `ballots.json`, DICOCOKKAN ULANG terhadap `block.height` balasan `transactions(offset:{hash})` |
| `transaksi[].ballotAddress` | alamat kontrak ballot yang dipanggil | `address` kontrak tempat aksi itu ditemukan |
| `transaksi[].raw` | byte transaksi **APA ADANYA**, hex, tanpa diproses | field `raw: HexEncoded!` pada tipe `RegularTransaction`, diambil lewat kueri `transactions(offset:{hash:$h})` — field ini TIDAK ADA di `FRAGMEN` yang dipakai `registry.json`/`ballots.json`, sengaja dikueri terpisah supaya kedua fixture itu tidak ikut membengkak dengan byte transaksi yang tidak mereka butuhkan |
| `transaksi[].rawByteLength` | panjang `raw` dalam BYTE (bukan karakter hex) | `Buffer.from(raw, "hex").length`, dihitung saat rekam sebagai jangkar sanity — uji memverifikasi ulang `raw.length === rawByteLength * 2` |

Skema `raw: HexEncoded!` pada `RegularTransaction` diverifikasi lewat introspeksi
GraphQL langsung terhadap indexer preview (2026-09-12) — bukan diasumsikan dari
dokumentasi mana pun.

**Kenapa BUKAN bagian dari `FRAGMEN` yang sama dengan `ballots.json`:** menambah
`raw` ke `FRAGMEN` akan mengambilnya untuk SETIAP aksi di jendela `terbaru`
(termasuk `deploy`, `finalize`, `registerVoters` — bukan jalur tulis yang
diuji), membengkakkan `registry.json`/`ballots.json` dengan byte yang tidak
diminta pengujian yang memakainya. Sebagai gantinya, aksi castVote/tallyVote
disaring lebih dulu dari jawaban `ballots.json` yang BARU direkam pada
pemanggilan yang sama, lalu `raw` masing-masing diambil lewat satu kueri
`transactions(offset:{hash})` terpisah per hash.

**Kenapa transaksi ini, bukan yang lain:** SEMUA aksi `castVote`/`tallyVote`
yang ada di jendela `terbaru` (limit 5) hari fixture ini direkam — bukan satu
sampel yang dipilih tangan. Hari ini itu 1 castVote + 3 tallyVote, semuanya di
ballot b0 (b1 belum pernah ditally). Kalau lain kali direkam ulang dan
ballot punya lebih banyak riwayat, jendela `limit: 5` di `FRAGMEN` yang
membatasi berapa banyak yang muncul di sini — sama seperti `ballots.json`.

**Dipakai oleh** `client/src/lib/chain/privasi-pembayar.test.ts` (OFFLINE,
lewat `client/src/test/privasi-pembayar-fakta.ts`, yang men-deserialisasi
`raw` dengan `@midnight-ntwrk/ledger-v8` 8.1.0 SUNGGUHAN — bukan tiruan) dan,
untuk varian yang menyentuh jaringan hidup,
`client/src/lib/chain/privasi-pembayar.jaringan-nyata.test.ts`
(`VOTEPRIV_UJI_JARINGAN=1`, mengambil ulang `raw` dari indexer dan
membandingkannya BYTE-PER-BYTE terhadap yang direkam di sini — transaksi lama
bersifat abadi di rantai, jadi ketidakcocokan berarti sesuatu yang lain
berubah, bukan invarian privasinya). Rincian bentuk uji, bukti dua arah bisa
merah, dan batas invarian ini ada di
`.superpowers/sdd/2026-09-12-votepriv-jalur-tulis-c2b/invarian-privasi-report.md`.

## Yang TIDAK dapat diuji fixture ini, dan mengapa

Fixture ini adalah rekaman APA ADANYA dari dua ballot yang ada di jaringan
preview hari ini. Enum fase sungguhan (`pkgs/contract/src/ballot.compact`,
tergenerasi ke `managed/ballot/contract/index.d.ts`):

```
export enum BallotPhase { voting = 0, tallying = 1, finalized = 2 }
```

Tiga sifat berikut TIDAK ADA pada kedua ballot fixture:

- **Ballot berfase TALLYING (1).** b0 ada di fase 2 (finalized), b1 ada di
  fase 0 (voting — voting b1 SUDAH ada di fixture, bukan "tidak ada").
  Fase 1 (tallying) sendiri tidak pernah terekam.
- **`voteCount != talliedCount` pada ballot yang sama.** b0 punya 3/3
  (dihitung habis), b1 punya 0/0 (belum disuarakan) — keduanya kebetulan
  kembar.
- **Deadline di MASA DEPAN relatif terhadap `meta.sekarangMs`.** Keempat
  deadline (voteDeadline/tallyDeadline pada b0 dan b1) sudah lewat pada
  `sekarangMs` yang sama direkamnya.

**Ketiganya TERCAKUP uji** di `dekode.ledger-sintetis.test.ts` lewat ledger
SINTETIS (memalsukan accessor `ledger()` tergenerasi, bukan fixture ini, dan
diikat ke tipe `Ledger` sungguhan supaya tidak diam-diam basi kalau bentuk
kontrak berubah) — bukan deploy testnet baru seperti sempat ditulis di sini
sebelumnya. Yang benar-benar TIDAK bisa dilakukan tanpa deploy jauh lebih
sempit: **tidak ada rekaman rantai sungguhan yang memperlihatkan ketiga
keadaan ini**, jadi uji sintetis membuktikan dekoder memetakan field dengan
benar untuk keadaan itu, tetapi TIDAK membuktikan indexer benar-benar
menyajikannya seperti yang kita duga di jaringan nyata — itu baru bisa
dikonfirmasi lewat rekaman ulang (lihat "Merekam ulang" di atas) begitu ada
ballot dengan fase/waktu yang berbeda di jaringan.

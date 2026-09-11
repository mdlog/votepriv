# Fixture rantai — rekaman respons indexer sungguhan

Direkam oleh `scripts/rekam-fixture-rantai.mjs`. **Jangan disunting tangan.**

| Berkas | Isi |
|---|---|
| `registry.json` | jawaban POST 1: state registry + aksi deploy + 3 aksi terbaru (skrip minta `limit: 5`; rantai baru punya 3 riwayat hari ini) |
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

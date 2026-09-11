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

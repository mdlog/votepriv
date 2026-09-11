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
preview hari ini. Tiga sifat berikut TIDAK ADA pada keduanya, dan tidak bisa
diadakan tanpa deploy ballot baru ke testnet memakai seed milik pengguna —
di luar jangkauan uji otomatis ini:

- **Ballot berfase 1 (voting terbuka).** b0 sudah di fase 2 (tallied), b1
  masih di fase 0 (registration). Fase 1 tidak pernah terekam. Uji apa pun
  atas perilaku KHUSUS fase 1 (mis. "opsi masih bisa disuarakan") tidak
  didukung fixture ini.
- **`voteCount != talliedCount` pada ballot yang sama.** b0 punya 3/3
  (dihitung habis), b1 punya 0/0 (belum disuarakan) — keduanya kebetulan
  kembar. Fixture ini TIDAK punya ballot "sudah disuarakan sebagian tapi
  belum ditally". Uji `dekode.ledger-sintetis.test.ts` menutup lubang
  pemetaannya (voteCount vs talliedCount tidak tertukar) lewat ledger
  SINTETIS, bukan lewat fixture ini — itu tidak sama dengan membuktikan
  rantai sungguhan pernah punya keadaan ini.
- **Deadline di MASA DEPAN relatif terhadap `meta.sekarangMs`.** Keempat
  deadline (voteDeadline/tallyDeadline pada b0 dan b1) sudah lewat pada
  `sekarangMs` yang sama direkamnya. Cabang "voting masih terbuka" atau
  "jendela tally masih terbuka" pada turunan status apa pun yang dibangun di
  atas modul ini tidak punya data fixture yang menguji jalur "belum lewat".

Menutup ketiganya lewat fixture menuntut ballot baru dengan fase/waktu yang
berbeda direkam ulang dari jaringan sungguhan (lihat "Merekam ulang" di
atas) — bukan menyunting `ballots.json`/`meta.json` dengan tangan, yang akan
membuat fixture ini berhenti menjadi rekaman rantai sungguhan.

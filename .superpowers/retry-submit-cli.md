# Retry berbatas untuk pengiriman transaksi (deploy-ballot)

## 1. Dugaan Anda: terkonfirmasi sebagian, dipertajam satu tingkat

Klaim struktural Anda **benar dan terbukti tepat di baris yang Anda tunjuk**.
`node_modules/.pnpm/@midnight-ntwrk+wallet-sdk-node-client@1.1.2/.../PolkadotNodeClient.js`:

```js
// baris 50-55
class PolkadotNodeClient {
    ...
    api;                       // SATU objek dipegang seumur hidup client
    constructor(config, api) { this.config = config; this.api = api; }

// baris 56-77 — ensureConnection() menyambung ULANG objek yang SAMA, tanpa kunci
ensureConnection() {
    return pipe(Effect.promise(async () => {
        if (!this.api.isConnected) { await this.api.connect(); }
    }), ...);
}

// baris 78-96 — sendMidnightTransaction MEMUTUS objek yang SAMA setelah dipakai
sendMidnightTransaction(serializedTransaction) {
    ...
    return pipe(Stream.fromEffect(this.ensureConnection()), Stream.flatMap(() => outputStream),
      Stream.ensuring(Effect.promise(() => this.api.disconnect())));   // <-- baris 95
}

// baris 97-109 — getGenesis JUGA memutus objek yang SAMA
getGenesis() {
    return pipe(this.ensureConnection(), ..., Effect.ensuring(Effect.promise(() => this.api.disconnect())));  // <-- baris 108
}
```

Ditelusuri lebih jauh (`@midnight-ntwrk/wallet-sdk-capabilities/dist/submission/submissionService.js`):

```js
export const makeDefaultSubmissionServiceEffect = (config) => {
    const scopeAndClientDeferred = Deferred.make().pipe(Effect.runSync);
    const makeScopeAndClient = Effect.gen(function* () {
        const scope = yield* Scope.make();
        const client = yield* PolkadotNodeClient.make({ nodeURL: config.relayURL }).pipe(...);
        return { scope, client };
    });
    void pipe(scopeAndClientDeferred, Deferred.complete(makeScopeAndClient), Effect.runPromise);
    const submit = (transaction, waitForStatus = 'InBlock') => {
        return pipe(NodeClient.sendMidnightTransactionAndWait(...),
          Effect.provideServiceEffect(NodeClient.NodeClient, pipe(scopeAndClientDeferred, Deferred.await, Effect.map(({ client }) => client))), ...);
    };
    return { submitTransaction: submit, close() { ... } };
};
```

dan `@midnight-ntwrk/wallet-sdk-facade/dist/index.js`: `WalletFacade` membuat **SATU**
`submissionService` (`makeDefaultSubmissionService(initParams.configuration)`) untuk
seluruh masa hidup wallet, dipakai oleh `wallet.submitTransaction(tx)`
(baris 297: `await this.submissionService.submitTransaction(tx, 'Finalized')`) — satu-satunya
tempat `submitTransaction` dipanggil di seluruh facade (dicek dengan grep; tidak ada
pemanggilan tersembunyi lain).

**Yang terbukti benar**: rancangan SDK ini memang membagi SATU `api` (koneksi WS node)
tanpa kunci apa pun antara `ensureConnection()` (menyambung) dan
`sendMidnightTransaction`/`getGenesis` (memutus setelah pakai) — persis klaim Anda.

**Yang saya BANTAH pada bagian sempit**: untuk kegagalan pertama `deploy-ballot`
(transaksi PERTAMA di proses itu), tidak ada "operasi sebelumnya" lain yang memanggil
`submitTransaction`/`getGenesis` untuk direbutkan — `submitTxCore` di
`midnight-js-contracts@4.0.4/dist/index.mjs` baris 195-197 memanggil
`providers.midnightProvider.submitTx(toSubmit)` **tepat sekali** per operasi, dan
`getGenesis` tidak dipanggil sama sekali di jalur CLI ini (dicek: tidak ada caller di
`wallet-sdk-facade`/`wallet-sdk-*`/CLI). Race "disconnect operasi SEBELUMNYA menabrak
ensureConnection operasi INI" jadi tidak bisa saya buktikan sebagai penyebab presisi
untuk percobaan pertama — kecuali "operasi sebelumnya" itu adalah bootstrap client
sendiri (`PolkadotNodeClient.make`, baris 33-45: connect → disconnect sekali untuk
memuat metadata), yang menurut kode SELALU selesai (disconnect di-`await`) sebelum
`Deferred` client diserahkan ke `submit()` — jadi secara desain seharusnya tidak
tumpang tindih juga.

**Petunjuk tambahan yang menopang "putus itu nyata, bukan gejala palsu"**: log
`disconnected from ...: 1000:: Normal Closure` di `@polkadot/rpc-provider`
(`ws/index.js` baris 370-374) hanya dicetak lewat `l.error` ketika
`#autoConnectMs > 0` — dan `WsProvider.disconnect()` men-nol-kan `#autoConnectMs`
**sebelum** menutup socket (baris 208-210). Artinya penutupan kode 1000 yang
terlihat di log **tidak konsisten dengan pemanggilan `.disconnect()` yang disengaja**
oleh `PolkadotNodeClient` sendiri pada urutan normal — lebih cocok dengan sesuatu di
luar urutan itu (server/proxy menutup lebih dulu, atau dua siklus connect/disconnect
yang tumpang tindih di level lain yang belum saya identifikasi persis).

**Kesimpulan jujur**: mekanisme berbagi-tanpa-kunci yang Anda tunjuk itu NYATA dan
berbahaya secara umum (saya konfirmasi dengan kutipan tepat), tapi saya tidak bisa
membuktikan secara pasti bahwa itulah pemicu presisi kegagalan PERTAMA yang Anda
reproduksi — hanya bahwa hasil pengamatan Anda (putus ~1 detik, tidak pernah
mendarat, dua kali identik) konsisten dengan sebuah race koneksi yang
BERGANTUNG WAKTU, bukan dengan penolakan rantai atau kegagalan jaringan permanen.
Karena saya tidak bisa menjalankan `pnpm cli` (dilarang) atau menyentuh jaringan
sungguhan untuk membuktikan lebih jauh, saya merancang retry di bawah supaya BEKERJA
terlepas dari yang mana persisnya penyebabnya (race SDK vs sebab lain yang belum
diketahui) — asalkan kegagalannya berbentuk "putus sebelum node sempat menjawab".

## 2. Bentuk retry yang dibangun

Satu primitif generik, `kirimDenganRetri` (`pkgs/cli/src/tunggu.ts`), dipakai di
empat titik pengiriman (`deployRegistry`, `deployBallot`, `daftarkanVoter`,
`catatKeRegistry` — `pkgs/cli/src/deploy.ts`). Alur pada tiap kegagalan:

1. **Klasifikasi (`bolehDiulang`, bawaan `putusKoneksiAmanDiulang`)** — ALLOWLIST,
   bukan blocklist: hanya pola persis yang muncul di lapangan (`disconnected from `,
   `WebSocket is not connected`, `Could not connect within specified time range`,
   `SubmissionError: Transaction submission (failed|error)`, `ConnectionError`) yang
   dianggap aman diulang. Galat APA PUN yang lain (assert kontrak, timeout
   `denganBatasWaktu`, dll.) langsung dilempar ulang tanpa retry — tidak pernah
   ditebak dari heuristik longgar.
2. **Batas percobaan** — jatah habis → lempar galat ASLI (bukan pesan generik).
3. **WAJIB, sebelum SETIAP percobaan ulang: `sudahMendarat()`** — membaca chain,
   bukan menebak. Tiga hasil: `"mendarat"` (pakai hasilnya, JANGAN kirim ulang),
   `"tidakPasti"` (BERHENTI dengan galat baru — diperlakukan SAMA seperti
   "mendarat" untuk keputusan retry: tidak pernah dianggap "aman lanjut"), `"belum"`
   (baru boleh menunggu lalu mengirim ulang).

### Angka yang dipilih, dan alasannya

| Konstanta | Nilai | Alasan |
|---|---|---|
| `maksPercobaan` | 3 (1 awal + 2 ulang) | Setiap percobaan pada `registerVoters`/deploy menghidupkan ulang proof ZK 5–20 detik (lihat `BATAS_MS.panggilBerat`); tanpa batas kecil, mengulang membakar waktu (dan berpotensi biaya) lebih cepat daripada menunggu. Dua kali cukup untuk race BERGANTUNG WAKTU: jeda mengubah offset percobaan berikutnya relatif terhadap siklus connect/disconnect penyebabnya, sehingga TIDAK dijamin mengulang race yang sama persis dua kali berturut-turut — persis pola yang Anda laporkan (identik dua kali FISIK, belum tentu identik pada percobaan yang diberi jeda). Bila penyebabnya SISTEMIK, ketiga percobaan gagal identik dan operator melihat pesan "jatah percobaan habis" yang jelas — bukan diam selamanya. |
| `jedaMs` | 5000 | Sama dengan bawaan `ulangiSampai` yang sudah ada di berkas ini (konsistensi konvensi proyek) — cukup lama untuk siklus reconnect internal `PolkadotNodeClient` (reconnectionDelay 1 detik + timeout `ensureConnection` 5 detik, lihat `DEFAULT_CONFIG` di `PolkadotNodeClient.js`) selesai sendiri sebelum kita menumpuk satu siklus connect/disconnect baru di atasnya. |

### "Sudah mendarat" per titik — tiga kekuatan berbeda, didokumentasikan apa adanya

- **`daftarkanVoter`** (alamat ballot SUDAH diketahui): PASTI — baca
  `registeredCount` ballot sebelum & sesudah; `registerVotersMendarat(sebelum, n,
  sekarang) = sekarang >= sebelum + n`.
- **`catatKeRegistry`** (alamat registry SUDAH diketahui): PASTI — baca
  **keanggotaan** `alamatBallot` di `registry.ballots` (`ballotSudahTercatat`),
  BUKAN `count` (registry permissionless; `count` naik juga oleh entri duplikat
  siapa pun — lihat `registry.compact`, jadi count sendirian tidak membuktikan
  entri KITA yang mendarat).
- **`deployBallot`/`deployRegistry`** (alamat kontrak BARU, belum diketahui
  sebelum `deployFn` berhasil kembali): TIDAK ADA pemeriksaan ledger yang pasti.
  Satu-satunya sinyal yang tersedia adalah **DUST**: DUST hanya bertambah lewat
  akrual waktu dan hanya berkurang lewat biaya transaksi yang benar-benar
  mendarat. Turun → `"tidakPasti"` (berhenti, bukan mengulang — mencegah deploy
  KEDUA yang membakar biaya dua kali dan meninggalkan yang pertama yatim). Tetap/
  naik → `"belum"` (aman diulang). Tanpa `bacaDust` sama sekali → `"tidakPasti"`
  tanpa syarat.

## 3. Gerbang mutasi

Penjaga diturunkan dari kode (bukan ditebak), lalu tiap penjaga dimutasi SATU per
SATU, diuji, dipulihkan (backup salinan berkas + `cp` — bukan `git checkout`, karena
perbaikan ini belum ter-commit saat gerbang dijalankan dan `git checkout -- <file>`
akan mengembalikan ke HEAD lama, bukan ke perbaikan ini).

### Tabel A — Penjaga yang diturunkan dari kode

| # | Berkas:baris (kira-kira) | Penjaga |
|---|---|---|
| G1 | tunggu.ts, `kirimDenganRetri` | `pastikan(maksPercobaan >= 1, ...)` |
| G2 | tunggu.ts, `kirimDenganRetri` | `if (!bolehDiulang(e)) throw e` — penolakan rantai TIDAK diulang |
| G3 | tunggu.ts, `kirimDenganRetri` | `if (percobaan >= maks) throw e` — batas percobaan |
| G4 | tunggu.ts, `kirimDenganRetri` | **WAJIB**: panggil `sudahMendarat()` sebelum retry sama sekali |
| G4b | tunggu.ts, `kirimDenganRetri` | `status === "mendarat"` → pakai hasil, JANGAN kirim ulang |
| G5 | tunggu.ts, `kirimDenganRetri` | `status === "tidakPasti"` → berhenti, JANGAN dianggap "belum" |
| G6 | tunggu.ts, `putusKoneksiAmanDiulang` | Klasifikasi bawaan benar-benar memakai `POLA_PUTUS_KONEKSI` |
| G7 | deploy.ts, `registerVotersMendarat` | `>=`, bukan `>` (batas pas) |
| G8 | deploy.ts, `ballotSudahTercatat` | Keanggotaan alamat, BUKAN `count` |
| G9 | deploy.ts, `sudahMendaratDeploy` | Arah pembanding DUST (`sekarang < awal` → tidakPasti) |
| G10 | deploy.ts, `daftarkanVoter` | Guard `opsi tidak diberikan` → tidakPasti |
| G11 | deploy.ts, `catatKeRegistry` | Guard `opsi tidak diberikan` → tidakPasti |

### Tabel B — Hasil mutasi (satu per satu, `cp` pulih di antaranya)

| # | Mutasi | Hasil | Catatan |
|---|---|---|---|
| G1 | Hapus `pastikan(maks >= 1, ...)` | **MERAH** (1 gagal) | `maksPercobaan: 0` diam-diam sukses, bukan melempar |
| G2 | `if (!bolehDiulang(e))` → `if (false && ...)` | **MERAH** (10 gagal) | Penolakan rantai ikut diulang di semua titik pemanggil |
| G3 | `if (percobaan >= maks)` → `if (false && ...)` | **MERAH** (timeout uji 5 detik) | Retry tak berhingga pada putus koneksi persisten |
| G4 (**WAJIB**) | Hapus SELURUH blok panggil `sudahMendarat()` + cabangnya, ganti tunggu-lalu-ulang langsung | **MERAH** (10 gagal) | Sesuai syarat tugas: pemeriksaan "sudah mendarat" dihapus → merah |
| G4b | `status.status === "mendarat"` → `false && ...` | **MERAH** (1 gagal) | Hasil lama yang sudah mendarat tertimpa kiriman baru |
| G5 | `status.status === "tidakPasti"` → `false && ...` | **MERAH** (7 gagal) | Status ambigu diperlakukan seolah aman lanjut |
| G6 | `putusKoneksiAmanDiulang` → selalu `false` | **MERAH** (14 gagal) | Putus koneksi yang genuinely aman ikut tidak diulang |
| G7 | `registerVotersMendarat`: `>=` → `>` | **MERAH** (1 gagal) | Kenaikan pas sebesar batch tidak lagi dianggap mendarat |
| G8 | `ballotSudahTercatat`: keanggotaan → `count > 0` | **MERAH** (2 gagal) | Entri ballot LAIN di registry keliru dianggap "punya kita" |
| G9 | `sudahMendaratDeploy`: `<` → `>` | **MERAH** (2 gagal) | DUST turun (biaya terpakai) keliru dianggap aman diulang |
| G10 | `daftarkanVoter`: hapus kondisi guard, ganti `if (false)` | **DITOLAK TSC** (`pnpm check` gagal, TS2345) | Penghapusan guard membuat `PublicDataProvider \| undefined` tak valid dipakai — tertangkap kompilasi, bukan hanya uji runtime |
| G11 | `catatKeRegistry`: sama seperti G10 | **DITOLAK TSC** (TS2345) | Sama seperti G10 |

**Semua 11 mutasi GAGAL bertahan** (baik lewat uji unit maupun lewat `tsc`) —
tidak ada yang perlu diperbaiki sebelum commit. Mutasi WAJIB (G4) mengembalikan
**MERAH** persis seperti disyaratkan.

## 4. Apa yang retry ini TIDAK lindungi

1. **`deployBallot`/`deployRegistry` tidak punya pemeriksaan mendarat yang
   PASTI.** Sinyal DUST adalah proksi, bukan bukti langsung: secara teori, bila
   biaya transaksi yang mendarat KEBETULAN lebih kecil dari akrual DUST alami
   pada jendela beberapa detik antara pembacaan "sebelum" dan "sesudah", retry
   bisa saja tetap dianggap aman padahal sebenarnya sudah mendarat dengan alamat
   yang tidak diketahui. Saya menilai risiko ini kecil (akrual DUST dirancang
   lambat relatif terhadap satu biaya transaksi) tapi TIDAK NOL, dan saya tidak
   memverifikasinya secara empiris (dilarang menyentuh jaringan).
2. **Retry ini tidak mencoba MEMBUKTIKAN dugaan root-cause** — ia bekerja
   berdasarkan bentuk galat (putus koneksi vs penolakan rantai), bukan
   berdasarkan pemahaman pasti tentang MENGAPA koneksi putus. Bila penyebabnya
   sistemik (mis. setiap koneksi ke endpoint ini memang ditutup paksa setelah
   ~1 detik oleh sesuatu di luar kendali kita — load balancer, dsb.), ketiga
   percobaan akan gagal identik dan operator tetap terblokir, hanya dengan pesan
   yang lebih informatif.
3. **`e2e.ts` dan `deploy-registry.ts`'s pemanggilan LAMA belum diperbarui
   memakai opsi retri ini untuk SEMUA titik** — `deploy-registry.ts` sudah
   diperbarui penuh (retry + `bacaDust`). `e2e.ts` SENGAJA TIDAK disentuh:
   skripnya besar, punya anggaran waktu yang sudah dihitung ketat
   (`jadwal.ts`), dan bukan bagian dari bug yang dilaporkan — memanggil
   `deployBallot`/`daftarkanVoter`/`catatKeRegistry` tanpa argumen opsi baru
   di sana tetap AMAN (default `{}` → berhenti cepat pada putus koneksi tanpa
   retry buta), hanya belum mendapat manfaat retry-nya.
4. **`castVote`/`tallyVote` TIDAK disentuh sama sekali** oleh perubahan ini —
   sesuai instruksi, nullifier yang sudah terpakai membuat risiko jauh lebih
   tinggi (pemilih ditolak permanen bila retry salah), dan saya tidak
   membangun pemeriksaan pra-ulang untuk jalur itu. `kirimDenganRetri` SIAP
   dipakai di sana kelak, tapi "sudahMendarat" untuk `castVote` (mis. memeriksa
   keanggotaan nullifier di `nullifiers`) belum ditulis maupun diuji.
5. **Bootstrap client** (`PolkadotNodeClient.make`, sambung-lalu-putus sekali
   untuk memuat metadata) sepenuhnya di luar kendali kita — bila SDK ini sendiri
   punya bug pada siklus itu, retry di sisi CLI tidak menyentuhnya sama sekali.

## 5. Perintah yang harus dijalankan berikutnya

```
pnpm check
pnpm check:uji
pnpm test               # klien
pnpm --filter cli test  # CLI
```

Semua sudah dijalankan dan hijau (klien 36 berkas/452 lolos + 2 dilewati, tidak
berubah; CLI 10 berkas/153 lolos — 121 lama + 32 baru).

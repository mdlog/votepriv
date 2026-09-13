# Audit bahasa metadata — VotePriv CLI → rantai

Kelas ketiga kebocoran bahasa: bukan UI (audit #1, `audit-bahasa-ui.md`) atau
`e.message` runtime (audit #2, `audit-bahasa-ui-2.md`), tapi **metadata ballot
yang ditulis CLI dan disegel ke rantai saat deploy** — `title`, `description`,
`community`, `options[]`, `eligibilityPolicy`. Dua audit sebelumnya tidak bisa
menangkap ini: teksnya lahir di `pkgs/cli`, bukan di `client/`.

Bukti (ledger ballot `4c82e7d0`, sudah ter-deploy, tidak bisa diubah):
`description: "Pilih arah dukungan treasury pada Q4."`,
`eligibilityPolicy: "Pemilih mendaftarkan leaf-nya sendiri lewat \`pnpm cli register-leaves\`"`.

## A. Terjemahan (`pkgs/cli/src/deploy-ballot.ts`, `pkgs/cli/src/e2e.ts`)

| Berkas:field | Lama (Indonesia) | Baru (Inggris) |
|---|---|---|
| `deploy-ballot.ts` `description` | `"Pilih arah dukungan treasury pada Q4."` | `"Choose the treasury's direction of support for Q4."` |
| `deploy-ballot.ts` `eligibilityPolicy` (tanpaPendaftaran) | `"Pemilih mendaftarkan leaf-nya sendiri lewat \`pnpm cli register-leaves\`"` | `"Voters register their own credential leaf; the organiser only ever holds the hash."` |
| `deploy-ballot.ts` `eligibilityPolicy` (bawaan) | `"Tiga credential uji end-to-end"` | `"Three test credentials issued by the organiser."` |
| `e2e.ts` `title` | `"Uji E2E VotePriv"` | `"VotePriv End-to-End Test"` |
| `e2e.ts` `description` | `"Tiga pemilih, tiga opsi, di jaringan preview."` | `"Three voters, three options, on the preview network."` |
| `e2e.ts` `eligibilityPolicy` | `"Tiga credential uji end-to-end"` | `"Three test credentials issued by the organiser."` |

`title`/`community`/`options[]` sudah Inggris di kedua skrip — tidak diubah.
Bahasa "ramah pemilih" untuk cabang tanpa-pendaftaran dipilih sengaja: pemilih
membaca kalimat itu di kartu ballot, dan pemilih tidak menjalankan `pnpm`.
Fixture `metaSah()` di `deploy.test.ts` (Indonesia sebelumnya, hanya data uji,
tidak pernah ter-deploy) ikut diterjemahkan — sejak `deployBallot` menggerbang
bahasa, fixture lama akan tertolak sebelum sempat menguji perilaku yang
sesungguhnya ditarget tiap `it`.

## B. Gerbang di batas rantai

**Lokasi baru daftar kata terlarang: `pkgs/shared/src/bahasa-metadata.ts`**
(dipindah dari salinan lokal di `client/src/test/audit-bahasa-ui.test.tsx`).
Alasan `pkgs/shared`: paket ini tidak bergantung pada `pkgs/cli` sama sekali
(hanya `contract`), jadi `client/` bisa mengimpornya tanpa menarik kode
wallet/deploy/seed CLI; dan `pkgs/cli` sudah mengimpor `shared` untuk
`MetadataBallot`/`detikDariSekarang`. Modul mengekspor:

- `KATA_TERLARANG` — **44 kata/frasa yang sama persis**, diimpor ulang oleh
  `audit-bahasa-ui.test.tsx` (`import { KATA_TERLARANG } from "shared"`),
  bukan disalin — satu sumber, tidak bisa menyimpang.
- `cariKataTerlarang(teks)` — kata terlarang pertama yang cocok, atau `undefined`.
- `validasiBahasaMetadata(meta: MetadataBallot)` — memeriksa `title`,
  `description`, `community`, tiap `options[i]`, `eligibilityPolicy`; melempar
  `Error` yang menyebut field + kata persis.

Dipanggil di `pkgs/cli/src/deploy.ts`, baris pertama `deployBallot(...)`, tepat
setelah `validasiMetadata(meta, jumlahCredential)` dan **sebelum** `args`
disusun untuk `deployContract` — satu-satunya jalan metadata mencapai rantai,
dipakai bersama oleh `deploy-ballot.ts` dan `e2e.ts` maupun skrip mana pun di
masa depan yang memanggil `deployBallot`.

Root `package.json` menambah `"shared": "workspace:*"` (devDependency) supaya
`client/` bisa mengimpor paket ini; `pnpm install` menautkannya
(`node_modules/shared -> ../pkgs/shared`).

## C. Uji

- `pkgs/shared/src/bahasa-metadata.test.ts` (12 uji, baru): tiap field
  (`title`/`description`/`community`/tiap `options[i]`/`eligibilityPolicy`)
  dengan satu kata terlarang → ditolak, pesan menyebut field + kata; metadata
  Inggris penuh → lolos; `cariKataTerlarang` tidak salah tangkap substring
  ("dari" di "mandarin").
- `pkgs/cli/src/metadata-bahasa-wiring.test.ts` (9 uji, baru): membaca
  `deploy-ballot.ts`/`e2e.ts` sebagai **teks** (kedua skrip tidak boleh
  diimpor — efek samping `siapkanSesi()`, butuh seed), mengekstrak literal
  metadata bawaan, memaku nilai persisnya, dan menjalankannya lewat
  `validasiBahasaMetadata`.
- `pkgs/cli/src/deploy.test.ts` (+1 uji): membuktikan `deployBallot` SUNGGUH
  memanggil gerbang (bukan cuma didefinisikan) — metadata Indonesia ditolak
  sebelum providers tersentuh.

**Temuan sampingan jujur**: `cariKataTerlarang` SENDIRI tidak menangkap
`"Tiga credential uji end-to-end"` maupun `"Uji E2E VotePriv"` — tak satu pun
dari 44 kata cocok di situ ("tiga"/"uji" bukan anggota daftar). Yang menutup
celah ini adalah pin nilai-persis di `metadata-bahasa-wiring.test.ts`, bukan
gerbang kata terlarang saja — dua lapis, bukan satu.

### Mutasi wajib

1. **`eligibilityPolicy` deploy-ballot.ts dikembalikan ke `"Tiga credential uji end-to-end"`** → `pnpm --filter cli test`: **MERAH** di
   `metadata-bahasa-wiring.test.ts` (`expected 'Tiga credential uji end-to-end' to be 'Three test credentials issued by the organiser.'`). Dikembalikan; hijau lagi.
2. **Panggilan `validasiBahasaMetadata(meta)` dihapus dari `deployBallot`** → **MERAH** di `deploy.test.ts` ("menolak metadata berbahasa Indonesia sebelum menyentuh providers": error berubah jadi `Cannot read properties of undefined ('getCoinPublicKey')` — proses lanjut menyentuh providers palsu, bukti gerbang benar-benar hilang). Dikembalikan; hijau lagi.

## D. Verifikasi

`pnpm --filter cli test`: **16 file lolos, 236 uji** (baseline 15/226 + 10 baru).
`pnpm --filter cli run typecheck`: bersih. `pnpm --filter shared test`: **3
file, 19 uji** (+12 baru), `typecheck` bersih. `pnpm check` / `pnpm check:uji`:
bersih. `pnpm test` (akar): **40 file lolos + 2 dilewati (612 lolos + 2
dilewati)** — identik baseline (perubahan `audit-bahasa-ui.test.tsx` hanya
mengganti sumber daftar kata, jumlah uji tidak berubah).

Gerbang bundel (`node scripts/ukur-batas-bundel.mjs`, setelah `pnpm build`), verbatim:

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

## E. Berkas yang disentuh

Baru: `pkgs/shared/src/bahasa-metadata.ts`, `pkgs/shared/src/bahasa-metadata.test.ts`,
`pkgs/cli/src/metadata-bahasa-wiring.test.ts`.
Diubah: `pkgs/shared/src/index.ts` (ekspor modul baru), `pkgs/cli/src/deploy.ts`
(panggil gerbang), `pkgs/cli/src/deploy-ballot.ts`, `pkgs/cli/src/e2e.ts`
(terjemahan), `pkgs/cli/src/deploy.test.ts` (fixture + 1 uji pengkabelan),
`client/src/test/audit-bahasa-ui.test.tsx` (impor daftar, bukan salinan),
`package.json` + `pnpm-lock.yaml` (dependency `shared` untuk `client/`).
Tidak disentuh: `pkgs/contract/`, `server/`, `docs/`; tidak menjalankan
`pnpm cli`; tidak membaca `wallet-cache/`/`private-state/`/`artefak/`.

SHA commit: lihat `git log -1` setelah commit tugas ini.

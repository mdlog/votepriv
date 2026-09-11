# VotePriv — Rencana Implementasi C-1: Pemecahan Struktural `Home.tsx`

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: gunakan `superpowers:subagent-driven-development` (disarankan) atau `superpowers:executing-plans` untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`).

**Goal:** Memecah `client/src/pages/Home.tsx` (391 baris, 33.441 bita) menjadi tujuh komponen di `client/src/components/votepriv/` sesuai spec §9.3, **tanpa mengubah satu piksel pun**, dan membuktikan klaim itu dengan uji yang membandingkan render sebelum dan sesudah pemecahan.

**Architecture:** Tidak ada arsitektur baru. Markup, nama kelas CSS, teks Inggris, dan seluruh perilaku dipindahkan satu banding satu. Yang bertambah hanyalah batas modul: tipe domain dan `statusLabel()` naik ke modul bersama, tujuh komponen turun ke berkasnya masing-masing, dan `Home.tsx` menyusut menjadi shell (sidebar, topbar, router section, wallet, indikator privasi).

**Tech Stack:** React 19.2.1, TypeScript 5.6.3, Vitest 2.1.9, `@testing-library/react` 16.x, jsdom, lucide-react 0.453, sonner 2.x, pnpm 10.4.1.

**Spec:** [`docs/superpowers/specs/2026-09-10-votepriv-midnight-design.md`](../specs/2026-09-10-votepriv-midnight-design.md) — §2.4, §9.1, §9.2, §9.3, §9.4, §14.7.

**Rencana pendahulu:** [`2026-09-10-votepriv-cli-deploy.md`](2026-09-10-votepriv-cli-deploy.md) — Rencana B. C-1 **tidak** bergantung padanya dan dapat dieksekusi kapan saja (spec §14.7).

---

## Lingkup: apa yang C-1 kerjakan, dan apa yang TIDAK

C-1 **mengerjakan**: pemecahan berkas, modul bersama, dan perkakas uji render yang membuktikan pemecahan itu netral terhadap tampilan.

C-1 **tidak menyentuh**, sama sekali:

| Tidak disentuh | Alasan |
|---|---|
| `pkgs/` apa pun (kontrak, cli, shared) | Bukan lingkup. Jangan jalankan `pnpm cli` maupun `pnpm contract` |
| `client/src/lib/proof-server.ts` | Dibaca sebagai ketergantungan, tidak diubah. 19 ujinya harus tetap hijau |
| `client/src/lib/midnight-wallet.ts` | Sama |
| `client/src/index.css` | Satu nama kelas pun tidak boleh ditambah, dihapus, atau diganti |
| `PrivacyAdapter`, `MockAdapter`, `MidnightAdapter` | Belum ada, dan C-1 tidak membuatnya. Itu C-2 (spec §8, §2.4) |
| Teks UI berbahasa Inggris | Menerjemahkannya **adalah** perubahan tampilan |
| Migrasi `client/` → `pkgs/app` | Langkah pertama C-2 (spec §14.7) |

**Batas paling penting yang mudah dilanggar — spec §9.2 butir 3.** Constructor kontrak ballot mewajibkan `tallyDeadline`, `eligibleCount`, `quorumPercent`, dan `eligibilityPolicy`, sehingga `CreateBallotModal` **harus** menumbuhkan empat field baru. Itu C-2. Bila field itu ikut ditambahkan di sini, klaim "murni struktural" tidak lagi dapat diperiksa — karena garis dasar render tidak punya field itu, uji paritas akan merah, dan satu-satunya cara membuatnya hijau lagi adalah melonggarkan uji yang justru menjadi seluruh nilai rencana ini. Task 8 memasang pemeriksaan mekanis untuk ini.

---

## Definisi operasional "murni struktural"

Spec §14.7 menuliskannya begini: *"render tiap section sebelum dan sesudah, lalu bandingkan himpunan nama kelasnya — harus identik."* Rencana ini menjalankannya apa adanya, dan menambahkan tiga lapis karena himpunan saja tidak cukup menggigit.

**Empat lapis yang dibandingkan untuk setiap permukaan:**

1. **`kelas`** — himpunan token `class` unik, terurut. Ini yang diminta spec. Menangkap kelas yang hilang atau lahir.
2. **`garisBesar` (struktur)** — daftar berurut `kedalaman:tag.kelas1.kelas2` untuk setiap elemen dalam urutan dokumen. Himpunan tidak dapat membedakan `<div class="a"><span class="b">` dari `<span class="b"><div class="a">`; keduanya punya himpunan `{a, b}` yang sama. Pemecahan 391 baris dengan empat baris JSX 2.000+ karakter adalah tempat elemen berpindah induk tanpa ada yang sadar. Lapis ini yang menangkapnya.
3. **`garisBesar` (atribut)** — setiap entri garis besar diakhiri `[nama=nilai|nama=nilai]` berisi **seluruh atribut DOM selain `class`**, terurut menurut nama. Tanpa lapis ini, tiga lapis pertama buta terhadap `style`, `title`, `aria-*`, `role`, `placeholder`, `value`, `id`, dan `disabled` — dan `Home.tsx` memuat dua `style={{ width: … }}` yang keduanya ikut pindah:

   | Baris garis dasar | Atribut | Ikut pindah ke |
   |---|---|---|
   | 239 | `` style={{ width: `${percentage}%` }} `` | `BallotCard.tsx` (Task 4) |
   | 259 | `` style={{ width: `${pct}%` }} `` | `Results.tsx` (Task 7) |

   Keduanya adalah lebar bar progres yang dihitung dari `votes`/`eligible`. Satu salah pindah dan bar-nya membeku di lebar yang salah tanpa satu token kelas pun berubah. Perintah penurunannya: `grep -o '[a-zA-Z-]*=["{]' client/src/pages/Home.tsx | sed 's/=["{]$//' | sort | uniq -c | sort -rn` — 202 `className`, 61 `size`, 24 `onClick`, lalu `style` 2, `role` 4, `aria-label` 5, `title` 1, `placeholder` 2, `value` 5, `id` 1, `disabled` 1.
4. **`teks`** — `textContent` ternormalisasi. Menangkap teks Inggris yang hilang, tertukar, atau kehilangan satu spasi saat baris raksasa diformat ulang.

**Apa yang keempat lapis itu TIDAK buktikan — dinyatakan apa adanya, bukan dikaburkan.**

Klaim yang dibeli rencana ini persis sebesar ini: *pada ketiga belas permukaan yang dijelajah skrip interaksi, DOM yang dihasilkan `Home.tsx` sesudah pemecahan identik dengan DOM yang dihasilkan kode pra-pemecahan pada kelas, struktur, atribut, dan teks.* Yang **tidak** dijangkaunya:

| Tidak terverifikasi | Mengapa, dan apa penggantinya |
|---|---|
| Permukaan yang tidak dijelajah — chip filter `Live` dan `Finalized` di LiveBallots (hanya `All` yang tercap), pengiriman formulir `CreateBallotModal`, cabang `txRef` bukan `null` di Results, tombol toast di Docs | Skrip interaksi punya 13 permukaan, bukan seluruh ruang keadaan. Sebagian ditutup uji unit per komponen (`LiveBallots.test.tsx` untuk chip, `Results.test.tsx` untuk cabang `txRef`), tetapi uji unit itu **bukan** perbandingan sebelum/sesudah — ia harapan literal yang disalin dengan mata dari garis dasar |
| Prop fungsi: `onClick`, `onChange`, `onMouseDown`, `onVote`, `onCreate`, `onSection`, `onClose` | React tidak menaruhnya di DOM, jadi tidak ada atribut untuk dibandingkan. Yang terbukti hanyalah handler yang benar-benar diklik skrip interaksi; sisanya bersandar pada pemindahan mekanis oleh `scripts/pindah-komponen.mjs` yang memotong bita, bukan mengetik ulang |
| `key` pada daftar | Tidak observable dari DOM sama sekali |
| CSS yang sesungguhnya | jsdom tidak memuat `client/src/index.css`. Task 8 Step 10 menggantinya dengan satu kali melihat dengan mata, dan itu memang satu-satunya cara |

**Dari mana nilai "sebelum" berasal — ini pertanyaan yang menentukan apakah uji ini menjaga sesuatu.**

Sebuah uji yang menghitung "sebelum" dari kode yang sedang diubah tidak menjaga apa pun: ia hanya membandingkan kode dengan dirinya sendiri dan akan tetap hijau ketika satu kelas hilang, karena kelas itu hilang di kedua sisi. Karena itu nilai pembanding di rencana ini berasal dari **salinan beku `Home.tsx` yang dieksekusi**, bukan dari nilai yang diturunkan dari `Home.tsx` yang sedang disunting:

- **Task 1 Step 1**, sebelum satu bita pun berubah, `client/src/pages/Home.tsx` disalin bita-per-bita ke `client/src/__pra-pecah__/HomePraPecah.tsx`. Salinan itu **tidak pernah disunting** selama C-1. sha256 sumbernya (`bdb0d2d6d16759988a7423b4ae2c76ed27d957a21ff955c06f083a62ff3af812`) dicatat dan diperiksa ulang di setiap task.
- Uji paritas merender **kedua** komponen — yang beku dan yang hidup — dalam satu proses uji yang sama, menjalankan skrip interaksi yang identik pada keduanya, lalu membandingkan hasilnya. Nilai "sebelum" karena itu adalah keluaran dari **mengeksekusi kode asli**, dan bukan turunan dari kode baru dalam bentuk apa pun.
- Bonusnya: berkas beku itu juga menjadi **sumber potongan**. Setiap blok dipotong dari berkas beku, bukan dari `Home.tsx` yang nomor barisnya bergeser setiap kali satu blok diangkat. Alat pemindah menolak bekerja bila blok di `Home.tsx` sudah tidak identik dengan blok di berkas beku.

**Sisa yang bertahan setelah berkas beku dihapus.** Berkas beku dihapus di Task 8 — ia duplikat 33 KB dari kode yang tidak ada lagi di tempat lain, dan membiarkannya mengundang orang mengimpornya. Sebelum dihapus, rekaman garis dasarnya dibekukan sebagai `client/src/test/garis-dasar-tampilan.json`, dibuat di Task 2 dari render berkas beku, **sebelum satu komponen pun dipecah**. Uji `client/src/test/paritas-garis-dasar.test.tsx` membandingkan `Home` hidup terhadap berkas itu dan tetap ada setelah C-1 selesai. Penulisan ulang berkas itu dijaga oleh sha256: skripnya menolak menulis bila `Home.tsx` sudah berbeda dari garis dasar.

---

## Global Constraints

- **Bahasa Indonesia untuk seluruh prosa, komentar kode, pesan galat internal, dan pesan commit.** Teks UI aplikasi tetap **Inggris** dan dipindahkan verbatim. Menerjemahkan `"Vote privately"` menjadi `"Pilih secara privat"` adalah perubahan tampilan, bukan pemecahan struktural.
- **Jangan pernah menjalankan `pnpm format`** selama C-1. `.prettierrc` menetapkan `printWidth: 80`, sementara empat baris JSX di `Home.tsx` panjangnya 2.222–2.979 karakter. Prettier akan memecah keempatnya menjadi ratusan baris dan mengubah diff pemecahan ini dari "blok dipindah" menjadi "seluruh berkas ditulis ulang", yang membuat review mustahil. Pemformatan ulang adalah pekerjaan terpisah, sesudah C-1.
- **Markup dipindahkan lewat pemotongan mekanis, bukan diketik ulang.** Empat baris JSX raksasa (garis dasar baris 248, 259, 263, 390) tidak boleh disentuh manusia maupun agen. `scripts/pindah-komponen.mjs` memotongnya dari berkas beku dan menulisnya apa adanya.
- **Template literal di `className` adalah permukaan paling rapuh.** Ada 12 di berkas ini. Satu spasi yang hilang pada `` `ballot-card accent-${ballot.accent}` `` menghasilkan `ballot-cardaccent-mint` — kelas yang tidak ada di CSS, tidak menggagalkan build, tidak menggagalkan typecheck, dan hanya terlihat sebagai kartu yang kehilangan warnanya. Lapis `kelas` pada uji paritas dirancang khusus untuk ini.
- **146 token `className` statis unik + 12 `className` template literal + 1 `className` ternary harus bertahan seluruhnya.** Angka ini diverifikasi hari ini; jangan diturunkan ulang dari sumber lain. Task 8 Step 9 menurunkan nilai "sebelum"-nya dari salinan beku dan membandingkannya, sehingga angka di atas tidak perlu dipercaya — ia hanya catatan untuk manusia.
- **`noUnusedLocals` mati di `tsconfig.json`.** Impor yang menganggur tidak akan menggagalkan `pnpm check`. Blok impor lucide-react di `Home.tsx` karena itu dibiarkan utuh sampai Task 8, lalu dipangkas sekali dengan detektor, bukan tujuh kali dengan mata.
- **19 uji di `client/src/lib/proof-server.test.ts` wajib tetap hijau di setiap task.** `pnpm test` adalah gerbangnya.
- **Conventional Commits** di setiap langkah commit (`test:`, `refactor:`, `chore:`, `build:`).
- Jangan commit apa pun yang belum lulus `pnpm check` **dan** `pnpm test`.

---

## Inventaris `Home.tsx` per hari ini — terverifikasi, jangan diturunkan ulang

391 baris, 33.441 bita, sha256 `bdb0d2d6d16759988a7423b4ae2c76ed27d957a21ff955c06f083a62ff3af812`.

| Baris | Isi | Tujuan di C-1 |
|---|---|---|
| 1–33 | blok impor (lucide-react besar) | ditulis ulang di Task 8 |
| 35–36 | `type Section`, `type BallotStatus` | → `votepriv/types.ts` |
| 38–51 | `type Ballot` | → `votepriv/types.ts` |
| 53–67 | komentar dokumentasi + `type Receipt` | → `votepriv/types.ts` **verbatim, komentarnya ikut** |
| 69–112 | `const initialBallots` (3 ballot mockup) | → `votepriv/demo-data.ts` |
| 114–119 | `const navItems` | **tetap di `Home.tsx`** |
| 121–128 | `function shortAddress` | **tetap di `Home.tsx`** |
| 130–134 | `function statusLabel` | → `votepriv/ballot-status.ts` — dipakai TIGA komponen |
| 136–216 | `function VoteModal` | → `votepriv/VoteModal.tsx` |
| 218–235 | `function CreateBallotModal` | → `votepriv/CreateBallotModal.tsx` |
| 237–240 | `function BallotCard` | → `votepriv/BallotCard.tsx` — dipakai Overview DAN LiveBallots |
| 242–250 | `function Overview` | → `votepriv/Overview.tsx` |
| 252–256 | `function LiveBallots` | → `votepriv/LiveBallots.tsx` |
| 258–260 | `function Results` | → `votepriv/Results.tsx` |
| 262–264 | `function Docs` | → `votepriv/Docs.tsx` |
| 266–391 | `export default function Home` | **tetap di `Home.tsx`, tak tersentuh** |

**Empat baris JSX raksasa** — risiko utama rencana ini:

| Baris garis dasar | Panjang | Di dalam |
|---|---|---|
| 248 | 2.222 karakter | `Overview` |
| 259 | 2.479 karakter | `Results` |
| 263 | 2.267 karakter | `Docs` |
| 390 | 2.979 karakter | shell `Home` |

Baris 390 tidak dipindah ke mana pun — ia tetap di tempatnya, dan Task 8 membuktikan ia tidak tersentuh dengan `diff` bita-per-bita.

**Tiga bentuk `className`, bukan dua.** Menghitung dua bentuk pertama saja membuat bentuk ketiga tidak punya penjaga sama sekali:

| Bentuk | Jumlah | Perintah penurunan | Contoh |
|---|---|---|---|
| statis `className="…"` | **146** token unik | `grep -o 'className="[^"]*"' … \| sed 's/className="//;s/"$//' \| tr ' ' '\n' \| grep -v '^$' \| sort -u \| wc -l` | `className="ballot-footer"` |
| template literal `` className={`…`} `` | **12** | `grep -o 'className={`[^`]*`}' … \| wc -l` | `` className={`ballot-card accent-${ballot.accent}`} `` |
| ternary tanpa template `className={… ? "…" : "…"}` | **1**, di baris 390 | `grep -o 'className={[^\`"][^}]*}' …` | `className={section === label ? "active" : ""}` |

Bentuk ketiga ada persis sekali, di baris 390, dan ia yang memberi kelas `active` pada tombol navigasi sidebar. Ia tidak tertangkap pola template literal (tidak ada backtick) maupun pola statis (tidak ada tanda kutip pembuka tepat setelah `className=`). Task 8 Step 9 memeriksa ketiga bentuk itu, bukan dua.

**Setiap blok tingkat-atas ditutup `}` di kolom 0**, dan tidak ada `}` kolom 0 lain di dalam blok mana pun. Diverifikasi: `awk '/^}$/{print NR}'` menghasilkan tepat `128 134 216 235 240 250 256 260 264 391`. Alat pemindah bersandar pada fakta ini.

---

## Urutan yang dipaksa ketergantungan

Urutan di bawah bukan selera. Mengubahnya berarti menulis impor ke berkas yang belum ada.

```
Task 1  perkakas uji + pembekuan garis dasar
Task 2  cap tampilan, garis dasar terkunci, alat pindah
Task 3  types.ts, ballot-status.ts, demo-data.ts
           └── statusLabel dipakai VoteModal, BallotCard, DAN Results,
               jadi ia harus keluar ke modul bersama LEBIH DULU daripada ketiganya
Task 4  BallotCard.tsx
           └── dipakai Overview DAN LiveBallots,
               jadi ia harus dipecah SEBELUM keduanya
Task 5  VoteModal.tsx, CreateBallotModal.tsx        (butuh Task 3)
Task 6  Overview.tsx, LiveBallots.tsx               (butuh Task 3 dan Task 4)
Task 7  Results.tsx, Docs.tsx                       (butuh Task 3)
Task 8  Home.tsx menjadi shell, penguncian, pembersihan
```

---

## Peta berkas

| Berkas | Tanggung jawab | Nasib |
|---|---|---|
| `client/src/__pra-pecah__/HomePraPecah.tsx` | Salinan beku bita-per-bita `Home.tsx` pra-pemecahan. Sumber nilai "sebelum" **dan** sumber potongan | dihapus Task 8 |
| `client/src/__pra-pecah__/SUMBER.md` | Provenans: commit, sha256, tanggal, larangan menyunting | dihapus Task 8 |
| `client/src/__pra-pecah__/paritas-pra-pecah.test.tsx` | Membandingkan render `Home` hidup terhadap render berkas beku | dihapus Task 8 |
| `scripts/pindah-komponen.mjs` | Memotong satu blok dari berkas beku, menulis komponen, membuang blok dari `Home.tsx` | dihapus Task 8 |
| `client/src/test/cap-tampilan.tsx` | Ekstraktor empat lapis (kelas, struktur, atribut, teks) + skrip interaksi yang menjelajah tiga belas permukaan | tetap |
| `client/src/test/garis-dasar-tampilan.json` | Rekaman garis dasar, dibuat Task 2 dari berkas beku | tetap |
| `client/src/test/paritas-garis-dasar.test.tsx` | Membandingkan `Home` hidup terhadap rekaman garis dasar | tetap |
| `client/src/pages/Home.smoke.test.tsx` | Uji render sederhana — bukti perkakas jsdom hidup | tetap |
| `client/src/components/votepriv/types.ts` | `Section`, `BallotStatus`, `Ballot`, `Receipt` | baru |
| `client/src/components/votepriv/ballot-status.ts` | `statusLabel()` | baru |
| `client/src/components/votepriv/demo-data.ts` | `initialBallots` | baru |
| `client/src/components/votepriv/BallotCard.tsx` | Kartu ballot | baru |
| `client/src/components/votepriv/VoteModal.tsx` | Modal vote tiga tahap | baru |
| `client/src/components/votepriv/CreateBallotModal.tsx` | Modal create | baru |
| `client/src/components/votepriv/Overview.tsx` | Section Overview | baru |
| `client/src/components/votepriv/LiveBallots.tsx` | Section Live ballots | baru |
| `client/src/components/votepriv/Results.tsx` | Section Results | baru |
| `client/src/components/votepriv/Docs.tsx` | Section Docs | baru |
| `client/src/pages/Home.tsx` | Shell: sidebar, topbar, router section, wallet, indikator privasi | menyusut |
| `vitest.config.ts` | Include diperlebar ke `.test.tsx`, pemetaan environment jsdom | diubah Task 1 |

Mengapa `demo-data.ts` ada padahal `initialBallots` hanya punya satu pemakai (`Home`): ia adalah **satu-satunya tempat** yang ditukar §2.4 di C-2 ketika `MockAdapter` masuk, dan ia tidak memuat satu pun JSX maupun `className`, sehingga pemindahannya tidak bisa memengaruhi perbandingan kelas. `navItems` dan `shortAddress` **tidak** dipindah: keduanya hanya dipakai shell, dan memindahkannya berarti membelah sidebar — markup yang menurut §9.3 memang milik `Home`.

---

## Tiga jebakan, dan bagaimana rencana ini menutupnya

### Jebakan 1 — `useMemo` privasi TIDAK boleh ikut pindah

Garis dasar baris 279–342: satu blok komentar 17 baris ditambah `useMemo` lima cabang yang menghasilkan `{ label, tone, title }` untuk panel "Privacy mode" di sidebar. **Seluruh isinya adalah klaim privasi yang mengikat** — kalimat seperti *"operatornya dapat melihat pilihan suara Anda"* dan *"witness tidak pernah meninggalkan perangkat ini"* adalah pernyataan yang benar atau salah tergantung topologi (spec §14.8), bukan hiasan.

Blok itu **tidak punya komponen sasaran di spec §9.3**. Ketujuh komponen di §9.3 adalah empat section dan tiga potongan ballot; tidak satu pun merender sidebar. Godaannya nyata: ketika `Home.tsx` menyusut dari 391 baris menjadi sekitar 150, 47 baris `useMemo` menjadi bagian terbesar yang tersisa dan tampak seperti "yang berikutnya dipecah".

**Larangannya:** `useMemo` privasi tetap di `Home.tsx`, utuh, tak tersunting. Alasannya bukan kerapian:

- Ia bergantung pada `proofStatus`, yang lahir dari `useEffect` di shell dan tidak dioper ke komponen mana pun.
- Keluarannya dirender **hanya** di sidebar — `privacy.tone` menjadi kelas pada `.privacy-mode` dan `.status-dot`, `privacy.label` menjadi teksnya, `privacy.title` menjadi atribut `title`. Sidebar adalah milik shell.
- Memindahkannya ke `components/votepriv/` akan menaruh klaim privasi terkuat aplikasi ini di direktori yang isinya komponen tampilan, dan C-2 akan menyambungkan adapter ke direktori itu. Itu cara termurah membuat klaim privasi ikut bergerak tanpa ada yang meninjaunya.

**Penguncian mekanis (Task 8):** satu `diff` yang membuktikan seluruh `export default function Home()` byte-identik dengan garis dasar **setelah kedua `connected={connected}` yang sengaja dibuang di Task 6 diterapkan pada garis dasarnya** (Task 8 Step 1), plus `grep` sempit di `client/src/components/votepriv/` (Task 8 Step 3), plus enam fixture `proofStatus` di rekaman garis dasar yang memeriksa `label`, kelas, dan atribut `title` untuk kelima cabang.

**Gerbang `grep` itu harus sempit, dan inilah alasannya.** Pola lebar seperti `proofStatus|privacy|ProofServerStatus|checkProofServer|targetTerverifikasi` **pasti** merah pada pemecahan yang seratus persen benar. Dijalankan hari ini terhadap blok yang memang pindah, ia menghasilkan enam baris yang seluruhnya SAH:

| Cocok | Di mana | Mengapa sah |
|---|---|---|
| `proofStatus: "simulated"` | `VoteModal` (garis dasar 168) | nama field `Receipt`, bukan state shell |
| `className="privacy-callout"` | `VoteModal` (garis dasar 196) | nama kelas CSS |
| `privacy-first defaults` | `Overview` (garis dasar 248) | teks UI Inggris |
| `Read the privacy model` | `Results` (garis dasar 259) | teks UI Inggris |
| `privacy-result` / `privacy-stat` | `Results` (garis dasar 259) | nama kelas CSS |
| `The privacy model` | `Docs` (garis dasar 263) | teks UI Inggris |

Ditambah `types.ts`, yang **wajib** memuat `proofStatus:` karena itu nama field `Receipt` (garis dasar baris 64), dan fixture `Receipt` di `VoteModal.test.tsx` serta `Results.test.tsx`. Perintah yang selalu merah pada pekerjaan yang benar bukan gerbang — ia kebisingan, dan instruksi rencana lama ("Kembalikan ke Home.tsx") berarti **membatalkan pemecahan yang benar**.

Pola yang dipakai sekarang hanya menyebut hal yang tidak mungkin lahir dari nama field domain atau nama kelas CSS:

```
checkProofServer|ProofServerStatus|setProofStatus|targetTerverifikasi|const privacy = useMemo|privacy\.(tone|label|title)|privacy-mode|witness tidak pernah meninggalkan perangkat ini
```

`checkProofServer`, `ProofServerStatus`, dan `setProofStatus` hanya ada di shell. `targetTerverifikasi` adalah field `ProofServerStatus`, bukan field `Ballot` maupun `Receipt`, dan tidak ada kelas CSS bernama itu. `privacy.tone`/`privacy.label`/`privacy.title` adalah akses properti pada hasil `useMemo` — titiknya literal, sementara seluruh kelas CSS privasi memakai tanda hubung (`privacy-callout`, `privacy-result`, `privacy-stat`). `privacy-mode` adalah satu-satunya kelas privasi yang eksklusif milik panel sidebar. Kalimat klaim terkuatnya ikut disebut supaya markup panel yang pindah tanpa `useMemo`-nya pun tetap tertangkap.

Diverifikasi terhadap pohon simulasi hari ini: pola sempit menghasilkan **nol** baris pada ketujuh komponen + `types.ts` + `demo-data.ts` + `ballot-status.ts` + fixture uji, dan **menyala** pada dua skenario bocor — `useMemo` utuh yang dipindah, dan markup panel saja yang dipindah.

### Jebakan 2 — prop `connected` pada `Overview` dan `LiveBallots`

**Bukti, bukan asumsi.** Perintah ini dijalankan terhadap berkas hari ini:

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
awk 'NR>=242 && NR<=250 {printf "%d:%s\n", NR, $0}' client/src/pages/Home.tsx | grep -c connected
awk 'NR>=243 && NR<=249 {printf "%d:%s\n", NR, $0}' client/src/pages/Home.tsx | grep -c connected
awk 'NR>=252 && NR<=256 {printf "%d:%s\n", NR, $0}' client/src/pages/Home.tsx | grep -c connected
awk 'NR>=253 && NR<=255 {printf "%d:%s\n", NR, $0}' client/src/pages/Home.tsx | grep -c connected
```

Keluarannya `1`, `0`, `1`, `0`. Artinya: pada **`Overview`**, `connected` muncul persis sekali — di baris 242, yaitu baris tanda tangan (pola destructuring dan tipe propsnya). Badan komponen (243–249) tidak menyebutnya sama sekali. Pada **`LiveBallots`**, identik: sekali di baris 252 (tanda tangan), nol kali di badan (253–255).

**Keputusan: prop `connected` DIBUANG dari `Overview` dan `LiveBallots`**, berikut `connected={connected}` di kedua tempat pemanggilannya pada baris 390. Alasannya:

- Ia tidak dirender. React tidak menaruh prop komponen ke DOM, sehingga pembuangannya tidak mengubah satu token kelas, satu elemen, maupun satu karakter teks. Uji paritas membuktikan ini, bukan mengasumsikannya — kalau ternyata ada efek, uji paritas merah dan keputusan ini dibatalkan.
- Di dalam satu berkas 391 baris, prop menganggur hanyalah baris mati. Setelah dipindah melewati batas modul, ia menjadi bagian dari **antarmuka publik** `Overview.tsx`, dan pembaca berikutnya akan menyambungkan perilaku ke sana karena tanda tangannya menjanjikan ada sesuatu di baliknya. C-1 adalah tugas yang membuat jahitan terlihat; mengekspor jahitan palsu bertentangan dengan itu.
- `tsconfig.json` tidak menyalakan `noUnusedLocals` maupun `noUnusedParameters`, sehingga tidak ada perkakas yang akan menemukannya nanti. Sekaranglah satu-satunya saat ia akan terlihat.

**Yang TIDAK dibuang:** prop `connected` pada `VoteModal` benar-benar dipakai — baris 151, `if (!connected) { toast.error("Connect your wallet first", …); return; }`. Ia dipindah apa adanya.

**Catatan untuk C-2:** §9.4 menuntut `eligibilityPolicy` tampil di kartu ballot **dan** modal vote, dan §9.2 butir 2 menambahkan field credential. Saat itu `Overview`/`LiveBallots` mungkin memang butuh tahu keadaan wallet. Prop itu ditambahkan kembali di C-2 ketika ada badan komponen yang membacanya — bukan sekarang, untuk berjaga-jaga.

### Jebakan 3 — `CreateBallotModal` tidak boleh tumbuh di sini

Spec §9.2 butir 3 menuntut modal create menumbuhkan `tallyDeadline`, `eligibleCount`, `quorumPercent`, dan `eligibilityPolicy`, karena constructor kontrak mewajibkan keempatnya. Spec §14.7 menyatakan alasan pemisahan C-1/C-2 justru ini: *"mencampurnya membuat klaim 'tidak menyentuh tampilan' tidak lagi dapat diperiksa."*

**Di C-1, `CreateBallotModal` dipindah dengan empat `useState` yang sama persis** (`title`, `community`, `optionOne`, `optionTwo`) dan markup yang sama persis. Tidak ada input baru, tidak ada label baru, tidak ada validasi baru. Task 8 memasang `grep` yang menuntut nol kecocokan untuk keempat nama field itu di `client/src/components/votepriv/`.

---

### Task 1: Perkakas uji render jsdom, dan pembekuan garis dasar

Tanpa perkakas render, klaim "murni struktural" hanyalah kalimat. Task ini memasang perkakasnya dan — sebelum apa pun disentuh — memotong garis dasar yang menjadi nilai pembanding untuk seluruh sisa rencana.

`vitest.config.ts` sekarang memakai `include: ["client/src/**/*.test.ts"]` (perhatikan `.ts`, bukan `.tsx`) dan `environment: "node"`. Keduanya berubah di sini, tetapi **tidak** dengan membalik environment global menjadi jsdom.

**Files:**
- Create: `client/src/__pra-pecah__/HomePraPecah.tsx`, `client/src/__pra-pecah__/SUMBER.md`
- Modify: `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`
- Test: `client/src/pages/Home.smoke.test.tsx`

**Interfaces:**
- Consumes: `Home` (default export dari `client/src/pages/Home.tsx`); `checkProofServer(): Promise<ProofServerStatus>` dan tipe `ProofServerStatus` dari `@/lib/proof-server`.
- Produces: environment uji `jsdom` untuk berkas `*.test.tsx`; transform JSX aktif di jalur uji; perintah `pnpm test` yang menjalankan 19 uji lama **dan** uji render baru.

- [ ] **Step 1: Bekukan `Home.tsx` sebelum satu bita pun berubah**

Ini langkah pertama rencana, sebelum instalasi, sebelum konfigurasi. Salinannya harus dipotong dari pohon kerja yang belum tersentuh.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
mkdir -p client/src/__pra-pecah__
cp client/src/pages/Home.tsx client/src/__pra-pecah__/HomePraPecah.tsx
cmp client/src/pages/Home.tsx client/src/__pra-pecah__/HomePraPecah.tsx && echo "IDENTIK"
sha256sum client/src/__pra-pecah__/HomePraPecah.tsx
wc -l -c client/src/__pra-pecah__/HomePraPecah.tsx
```

Keluaran yang diharapkan, persis:

```
IDENTIK
bdb0d2d6d16759988a7423b4ae2c76ed27d957a21ff955c06f083a62ff3af812  client/src/__pra-pecah__/HomePraPecah.tsx
  391 33441 client/src/__pra-pecah__/HomePraPecah.tsx
```

Bila sha256 berbeda, **hentikan rencana ini**. Artinya `Home.tsx` sudah berubah sejak inventaris di atas dibuat, dan seluruh nomor baris di rencana ini basi. Turunkan ulang inventarisnya lebih dulu.

- [ ] **Step 2: Catat provenans salinan beku**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
cat > client/src/__pra-pecah__/SUMBER.md <<EOF
# Garis dasar pra-pemecahan — JANGAN SUNTING

\`HomePraPecah.tsx\` adalah salinan bita-per-bita \`client/src/pages/Home.tsx\`
sebelum Rencana C-1 menyentuhnya.

| | |
|---|---|
| Sumber | \`client/src/pages/Home.tsx\` |
| Commit | $(git rev-parse HEAD) |
| Cabang | $(git branch --show-current) |
| Tanggal beku | $(date -Iseconds) |
| sha256 | $(sha256sum client/src/pages/Home.tsx | cut -d' ' -f1) |
| Ukuran | 391 baris, 33.441 bita |

Berkas ini punya dua tugas, dan keduanya rusak bila ia disunting:

1. **Nilai "sebelum" pada uji paritas.** Uji merender berkas ini dan \`Home.tsx\`
   hidup di proses yang sama, lalu membandingkan kelas, garis besar DOM, dan
   teksnya. Menyunting berkas ini berarti menggerakkan garis dasarnya sendiri,
   dan ujinya berhenti menjaga apa pun.
2. **Sumber potongan.** \`scripts/pindah-komponen.mjs\` memotong blok komponen
   dari berkas ini, bukan dari \`Home.tsx\` — nomor baris di \`Home.tsx\` bergeser
   setiap kali satu blok diangkat, nomor baris di sini tidak pernah.

Berkas ini dihapus pada Task 8 C-1, setelah rekamannya dibekukan ke
\`client/src/test/garis-dasar-tampilan.json\`.
EOF
head -12 client/src/__pra-pecah__/SUMBER.md
```

Diharapkan: berkas tercetak dengan commit, cabang, tanggal, dan sha256 terisi (bukan string kosong).

- [ ] **Step 3: Pasang `@testing-library/react`, `@testing-library/dom`, dan `jsdom`**

`@testing-library/react` 16.x adalah baris pertama yang mendukung React 19, dan sejak 16.0 ia memindahkan `@testing-library/dom` menjadi peer dependency — jadi paket itu harus disebut eksplisit, tidak ikut terbawa.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm add -D -w "@testing-library/react@^16" "@testing-library/dom@^10" "jsdom@^25"
node -e "for (const p of ['@testing-library/react','@testing-library/dom','jsdom']) console.log(p, require(p + '/package.json').version)"
```

Diharapkan: tiga baris, versinya `16.x`, `10.x`, `25.x`. Bila pnpm memasang mayor lain, catat dan lanjutkan — Step 8 adalah gerbang sebenarnya.

`@testing-library/jest-dom` dan `@testing-library/user-event` **tidak** dipasang. Yang pertama hanya menambah matcher yang tidak dipakai rencana ini; yang kedua tidak diperlukan karena seluruh interaksi di `Home.tsx` adalah `onClick` dan `onChange` pada elemen asli, yang dilayani `fireEvent`. Setiap dependensi uji tambahan adalah permukaan yang bisa gagal tanpa menguji apa pun.

- [ ] **Step 4: Tulis uji render sederhana**

`client/src/pages/Home.smoke.test.tsx`:

```tsx
/**
 * Uji render paling sederhana yang mungkin: buktikan perkakas jsdom + React
 * Testing Library benar-benar hidup terhadap komponen yang sebenarnya.
 *
 * Uji ini sengaja tidak menyatakan apa pun tentang tampilan — itu tugas uji
 * paritas di Task 2. Yang dijaga di sini hanya satu: kalau berkas ini merah,
 * setiap uji render lain di C-1 tidak bisa dipercaya, karena masalahnya ada di
 * perkakasnya, bukan di kodenya.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProofServerStatus } from "@/lib/proof-server";
import Home from "./Home";

const STATUS_LOKAL: ProofServerStatus = {
  reachable: true,
  version: "8.1.0",
  target: "http://127.0.0.1:6300",
  targetTerverifikasi: true,
  reach: "lokal",
  hop: "browser → http://127.0.0.1:6300",
};

// checkProofServer() memanggil jaringan lewat useEffect. Dibiarkan asli, ia akan
// menembak /proof-server/version dari jsdom, gagal, dan membuat hasil uji
// bergantung pada apakah proof server kebetulan hidup di mesin yang menjalankan.
vi.mock("@/lib/proof-server", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/proof-server")>();
  return { ...asli, checkProofServer: async () => STATUS_LOKAL };
});

afterEach(() => cleanup());

describe("render Home di jsdom", () => {
  it("memasang shell aplikasi beserta keempat item navigasi", async () => {
    let container!: HTMLElement;
    // render() dibungkus act async supaya promise checkProofServer sempat
    // terselesaikan di dalam act — kalau tidak, setProofStatus jatuh di luar act
    // dan React memuntahkan peringatan yang menutupi kegagalan sebenarnya.
    await act(async () => {
      ({ container } = render(<Home />));
    });

    expect(container.querySelector(".app-shell")).not.toBeNull();
    expect(container.querySelector(".sidebar")).not.toBeNull();

    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    const label = Array.from(nav!.querySelectorAll("button > span")).map(el => el.textContent);
    expect(label).toEqual(["Overview", "Live ballots", "Results", "Docs"]);
  });
});
```

- [ ] **Step 5: Jalankan uji, pastikan berkas barunya BELUM terkumpul**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm test 2>&1 | tail -8
```

Diharapkan: `Test Files  1 passed (1)` dan `Tests  19 passed (19)`. Berkas `.test.tsx` tidak terkumpul sama sekali, karena `include` masih `["client/src/**/*.test.ts"]`. Inilah kegagalan pertama yang harus dilihat: uji yang tidak pernah dijalankan tidak pernah merah, dan itu bentuk kegagalan paling berbahaya di rencana ini.

- [ ] **Step 6: Kumpulkan bukti tentang environment sebelum memutuskan pemetaannya**

Mengubah `environment` global dari `"node"` menjadi `"jsdom"` akan menjalankan ke-19 uji `proof-server.test.ts` di bawah kondisi yang berbeda. Uji itu memakai `vi.stubGlobal("location", …)` di empat tempat; di jsdom, `location` adalah properti `window` yang deskriptornya bisa saja tidak `configurable`. Jangan menebak — ukur.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node -e "
const { JSDOM } = require('jsdom');
const d = new JSDOM('', { url: 'http://localhost:3000/' });
const desc = Object.getOwnPropertyDescriptor(d.window, 'location');
console.log('configurable:', desc && desc.configurable);
"
cp vitest.config.ts /tmp/vitest.config.ts.asli
sed -i 's/environment: "node"/environment: "jsdom"/' vitest.config.ts
pnpm test 2>&1 | tail -12
cp /tmp/vitest.config.ts.asli vitest.config.ts
cmp vitest.config.ts /tmp/vitest.config.ts.asli && echo "KONFIG DIPULIHKAN"
```

Catat dua hal: nilai `configurable`, dan apakah ke-19 uji tetap hijau di bawah jsdom global.

**Keputusan, dan ia sama apa pun hasilnya:** environment global tetap `"node"`, dan jsdom dipetakan hanya untuk `*.test.tsx`. Bila ke-19 uji itu merah, pemetaan adalah satu-satunya jalan. Bila hijau, pemetaan tetap dipilih — C-1 tidak punya alasan mengubah kondisi jalannya uji yang sudah hijau dan tidak ada hubungannya dengan pemecahan `Home.tsx`. Perbedaan `location`, `fetch`, `Response`, dan timer antara kedua environment adalah perubahan yang tidak diminta siapa pun dan tidak dapat dibenarkan oleh tujuan rencana ini. Ukurannya tetap dijalankan supaya keputusan itu punya bukti, bukan hanya niat.

- [ ] **Step 7: Perlebar `include` dan petakan environment**

Ganti seluruh isi `vitest.config.ts`:

```typescript
import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Konfigurasi uji terpisah dari vite.config.ts dengan sengaja.
 *
 * vite.config.ts memuat root `client/`, plugin React, dan beberapa plugin runtime
 * yang tidak ada hubungannya dengan uji unit di sini. Memuatnya hanya menambah
 * permukaan yang bisa gagal tanpa menguji apa pun.
 *
 * DUA HAL YANG DITAMBAHKAN RENCANA C-1, dan alasannya:
 *
 * 1. `environment` tetap "node", jsdom dipetakan HANYA untuk *.test.tsx.
 *    Uji `.ts` yang ada (proof-server.test.ts, 19 uji) hijau di bawah node dan
 *    memakai vi.stubGlobal("location", …). Memindahkan semuanya ke jsdom
 *    mengubah kondisi jalannya uji yang sama sekali tidak berhubungan dengan
 *    pemecahan Home.tsx. Uji render butuh DOM; uji murni tidak, dan tidak boleh
 *    dipaksa menanggung risikonya.
 *
 * 2. `esbuild.jsx` dipaksa "automatic".
 *    tsconfig.json menetapkan "jsx": "preserve" karena Vite-lah yang mengurus
 *    transform di jalur aplikasi. Di jalur uji, esbuild membaca tsconfig itu,
 *    membiarkan JSX apa adanya, dan Node menolak berkasnya. Nilai di sini
 *    menimpanya hanya untuk uji, tanpa menyentuh tsconfig yang dipakai build.
 *
 * URL jsdom dipatok supaya `location.host` deterministik: indikator privasi di
 * sidebar menyusun kalimatnya dari nilai itu, dan kalimat itu ikut dibandingkan
 * uji paritas.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "client", "src") },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["client/src/**/*.test.tsx", "jsdom"]],
    environmentOptions: {
      jsdom: { url: "http://localhost:3000/" },
    },
    include: ["client/src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 8: Jalankan uji dan buktikan render sederhana itu hijau**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm test 2>&1 | tail -12
```

Diharapkan: `Test Files  2 passed (2)`, `Tests  20 passed (20)`.

Bila gagal dengan galat yang menyebut JSX atau `Unexpected token '<'`, `esbuild.jsx` tidak terpakai. Jalur mundurnya, dan hanya bila itu yang terjadi: tambahkan `@vitejs/plugin-react` (sudah terpasang, 5.0.4) ke konfigurasi.

```typescript
import react from "@vitejs/plugin-react";
// …
export default defineConfig({
  plugins: [react()],
  // sisa konfigurasi sama
});
```

Bila gagal dengan `document is not defined`, pemetaan environment tidak cocok — periksa berkas uji benar-benar berakhiran `.test.tsx` dan berada di bawah `client/src/`.

- [ ] **Step 9: Typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
```

Diharapkan: keluar tanpa keluaran. `tsconfig.json` mengecualikan `**/*.test.ts` tetapi **tidak** `**/*.test.tsx`, jadi berkas uji baru ikut ditypecheck — itu diinginkan.

- [ ] **Step 10: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add vitest.config.ts package.json pnpm-lock.yaml client/src/pages/Home.smoke.test.tsx client/src/__pra-pecah__
git commit -m "test(app): perkakas uji render jsdom dan pembekuan garis dasar Home.tsx pra-pemecahan"
```

**Deliverable:** `pnpm test` menjalankan 20 uji di 2 berkas; salinan beku `Home.tsx` ada di repo dengan sha256 tercatat.

---

### Task 2: Cap tampilan empat lapis, garis dasar terkunci, dan alat pindah

Task ini membangun tiga hal yang seluruh sisa rencana bersandar padanya: ekstraktor yang mengubah satu render menjadi cap yang dapat dibandingkan, skrip interaksi yang menjelajah **seluruh** permukaan `Home.tsx` (termasuk cabang yang hanya muncul setelah wallet tersambung atau setelah suara dikirim), dan alat pemotong yang memindahkan blok tanpa ada manusia yang mengetik ulang JSX 2.000 karakter.

**Files:**
- Create: `client/src/test/cap-tampilan.tsx`
- Create: `client/src/__pra-pecah__/paritas-pra-pecah.test.tsx`
- Create: `client/src/test/paritas-garis-dasar.test.tsx`
- Create: `client/src/test/garis-dasar-tampilan.json` (dihasilkan, bukan diketik)
- Create: `scripts/pindah-komponen.mjs`

**Interfaces:**
- Consumes: `Home` dari `@/pages/Home`; `HomePraPecah` dari `@/__pra-pecah__/HomePraPecah`; `ProofServerStatus` dari `@/lib/proof-server`; `WalletConnection` dari `@/lib/midnight-wallet`.
- Produces:
  - `type Cap = { kelas: string[]; garisBesar: string[]; teks: string }` — `garisBesar` memuat dua lapis sekaligus: `kedalaman:tag.kelas…` diikuti `[atribut=nilai|…]` untuk seluruh atribut selain `class`
  - `type CapPrivasi = { kelas: string[]; label: string; judul: string }`
  - `type StatusFixture = ProofServerStatus | "menggantung"`
  - `type Rekaman = { permukaan: Record<string, Cap>; privasi: Record<string, CapPrivasi> }`
  - `capDari(akar: HTMLElement): Cap`
  - `normalkanTeks(teks: string): string`
  - `rekamPermukaan(Komponen: ComponentType): Promise<Record<string, Cap>>` — **tiga belas** permukaan
  - `rekamPrivasi(Komponen: ComponentType, atur: (s: StatusFixture) => void): Promise<Record<string, CapPrivasi>>` — tanda tangan ini sama persis dengan implementasinya, jadi tidak ada pemanggil yang perlu `as never` maupun `as unknown`
  - `STATUS_LOKAL`, `FIXTURE_PRIVASI`, `KONEKSI_PALSU`
  - `scripts/pindah-komponen.mjs <Nama> <dari> <sampai> <tujuan.tsx> <kepala.txt>`

- [ ] **Step 1: Tulis ekstraktor dan skrip interaksi**

`client/src/test/cap-tampilan.tsx`:

```tsx
/**
 * Cap tampilan: mengubah satu render menjadi nilai yang bisa dibandingkan.
 *
 * Definisi "murni struktural" di spec §14.7 adalah: render tiap section sebelum
 * dan sesudah pemecahan, lalu bandingkan himpunan nama kelasnya. Berkas ini
 * menjalankan itu, dan menambah tiga lapis karena himpunan saja tidak menggigit:
 *
 *   kelas       himpunan token class unik, terurut. Yang diminta spec.
 *   garisBesar  daftar berurut "kedalaman:tag.kelas[atribut]" per elemen.
 *               Struktur: himpunan tidak bisa membedakan elemen yang berpindah
 *               induk — dua struktur yang sama sekali berbeda punya himpunan
 *               yang identik. Pada pemecahan dengan empat baris JSX 2.000+
 *               karakter, perpindahan induk justru kegagalan yang paling
 *               mungkin terjadi.
 *               Atribut: SELURUH atribut DOM selain class, terurut menurut
 *               nama. Tanpa ini, cap buta terhadap style, title, aria-*, role,
 *               placeholder, value, id, dan disabled. Home.tsx memuat dua
 *               style={{ width: … }} — garis dasar baris 239 (ikut BallotCard)
 *               dan 259 (ikut Results) — yang keduanya adalah lebar bar progres.
 *               Satu salah pindah dan bar-nya membeku di lebar yang salah tanpa
 *               satu token kelas pun berubah.
 *   teks        textContent ternormalisasi. Menangkap teks Inggris yang hilang
 *               atau kehilangan satu spasi saat baris raksasa disentuh.
 *
 * Yang TIDAK dijangkau berkas ini: prop fungsi (React tidak menaruhnya di DOM),
 * key, CSS yang sesungguhnya, dan permukaan di luar ketiga belas yang dijelajah
 * rekamPermukaan(). Lihat bagian "Apa yang keempat lapis itu TIDAK buktikan" di
 * rencana C-1.
 */
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { createElement, type ComponentType } from "react";
import { vi } from "vitest";
import type { ProofServerStatus } from "@/lib/proof-server";
import type { WalletConnection } from "@/lib/midnight-wallet";

export type Cap = { kelas: string[]; garisBesar: string[]; teks: string };
export type CapPrivasi = { kelas: string[]; label: string; judul: string };
export type Rekaman = { permukaan: Record<string, Cap>; privasi: Record<string, CapPrivasi> };

/**
 * Satu nilai fixture untuk panel privasi: status proof server yang sudah dijawab,
 * atau "menggantung" untuk keadaan checkProofServer() yang belum selesai.
 *
 * Diekspor supaya kedua berkas uji paritas dapat mengetik fungsi `atur`-nya
 * dengan tipe yang sama persis dengan yang dituntut rekamPrivasi(). Tanpa alias
 * ini, keduanya terpaksa memakai `as never` untuk menambal ketidakcocokan tipe
 * yang sebetulnya tidak perlu ada.
 */
export type StatusFixture = ProofServerStatus | "menggantung";

/**
 * Token kelas WAJIB dibaca lewat getAttribute("class"), bukan el.className.
 *
 * Pada elemen SVG — dan lucide-react merender SVG di hampir setiap kartu, badge,
 * dan tombol di halaman ini — `className` bukan string melainkan SVGAnimatedString,
 * sehingga `.split()` melempar. Ini bukan detail gaya: ikon membawa kelas
 * (`lucide`, `lucide-arrow-up-right`, dan pada satu tempat `muted-arrow` yang
 * dioper eksplisit di baris 259 garis dasar). Melewatkan SVG berarti melewatkan
 * justru bagian yang paling mudah hilang saat JSX dipindah.
 */
function tokenKelas(el: Element): string[] {
  const mentah = el.getAttribute("class");
  if (mentah === null) return [];
  return mentah.trim().split(/\s+/).filter(t => t !== "");
}

/**
 * Angka diratakan menjadi "#".
 *
 * `ballot.votes.toLocaleString()` menghasilkan "1,200" pada locale en-US dan
 * "1.200" pada de-DE. Tanpa perataan ini, rekaman garis dasar hanya sah di mesin
 * yang membuatnya. Yang tetap terjaga adalah yang memang penting di sini: spasi,
 * urutan kata, dan tanda baca — "# of # votes" tetap berbeda dari "#of # votes".
 */
export function normalkanTeks(teks: string): string {
  return teks
    .replace(/\d[\d.,\u00a0\u202f]*/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lapis keempat: SELURUH atribut selain `class`, terurut menurut nama.
 *
 * Tiga lapis pertama buta terhadap segala sesuatu yang bukan kelas, tag, atau
 * teks. Yang paling mahal di antaranya ada dua di berkas ini:
 *
 *   garis dasar 239  style={{ width: `${percentage}%` }}  → pindah ke BallotCard
 *   garis dasar 259  style={{ width: `${pct}%` }}         → pindah ke Results
 *
 * Keduanya lebar bar progres. Satu salah pindah dan bar-nya membeku tanpa satu
 * token kelas pun berubah — persis bentuk kegagalan yang rencana ini klaim tidak
 * mungkin lolos. Ikut terjaga di sini: title, aria-label, aria-modal,
 * aria-labelledby, role, placeholder, value, id, dan disabled.
 *
 * Nilainya TIDAK dinormalkan seperti teks. Tidak ada atribut di berkas ini yang
 * lahir dari toLocaleString(); persentase bar dihitung dengan aritmetika biasa,
 * dan satu-satunya `title` menyusun kalimatnya dari fixture plus location.host
 * yang dipatok di vitest.config.ts. Perbandingan apa adanya karena itu aman, dan
 * lebih menggigit daripada yang diratakan.
 */
function atributLain(el: Element): string {
  const pasangan = Array.from(el.attributes)
    .filter(a => a.name !== "class")
    .map(a => `${a.name}=${a.value}`)
    .sort();
  return pasangan.length === 0 ? "" : `[${pasangan.join("|")}]`;
}

export function capDari(akar: HTMLElement): Cap {
  const kelas = new Set<string>();
  const garisBesar: string[] = [];
  for (const el of Array.from(akar.querySelectorAll("*"))) {
    const token = tokenKelas(el);
    for (const t of token) kelas.add(t);
    let kedalaman = 0;
    for (let p = el.parentElement; p !== null && p !== akar; p = p.parentElement) kedalaman += 1;
    garisBesar.push(
      `${kedalaman}:${el.tagName.toLowerCase()}${token.map(t => `.${t}`).join("")}${atributLain(el)}`,
    );
  }
  return {
    kelas: [...kelas].sort(),
    garisBesar,
    teks: normalkanTeks(akar.textContent ?? ""),
  };
}

export const STATUS_LOKAL: ProofServerStatus = {
  reachable: true,
  version: "8.1.0",
  target: "http://127.0.0.1:6300",
  targetTerverifikasi: true,
  reach: "lokal",
  hop: "browser → http://127.0.0.1:6300",
};

/**
 * Kelima cabang useMemo privasi di shell, ditambah keadaan "belum dijawab".
 *
 * Blok itu TIDAK dipindah ke mana pun di C-1 (lihat Jebakan 1 di rencana), dan
 * fixture ini yang membuktikannya: label, kelas, dan atribut title-nya harus
 * sama persis sebelum dan sesudah pemecahan. Seluruh teks di dalamnya adalah
 * klaim privasi yang mengikat, bukan salinan tampilan.
 */
export const FIXTURE_PRIVASI: Record<string, StatusFixture> = {
  menunggu: "menggantung",
  remote: {
    reachable: true,
    version: "8.1.0",
    target: "https://proof-server.preprod.midnight.network",
    targetTerverifikasi: true,
    reach: "remote",
    hop: "browser → https://proof-server.preprod.midnight.network",
  },
  "lewat-host-halaman": {
    reachable: true,
    version: "8.1.0",
    target: "http://127.0.0.1:6300",
    targetTerverifikasi: true,
    reach: "lewat-host-halaman",
    hop: "browser → votepriv.mdloglabs.org → http://127.0.0.1:6300 (loopback mesin itu, bukan perangkat Anda)",
  },
  mati: {
    reachable: false,
    error: "Failed to fetch",
    target: "http://127.0.0.1:6300",
    targetTerverifikasi: true,
    reach: "lokal",
    hop: "browser → http://127.0.0.1:6300",
  },
  "target-belum-terverifikasi": {
    reachable: true,
    version: "8.1.0",
    target: "http://127.0.0.1:6300",
    targetTerverifikasi: false,
    reach: "lokal",
    hop: "browser → http://127.0.0.1:6300",
  },
  lokal: STATUS_LOKAL,
};

export const KONEKSI_PALSU: WalletConnection = {
  address: "mn_shield-addr_test1qqxyzw9r4k2m7v0abcdefghijklmnopqrstu",
  networkId: "preview",
  connectorName: "Lace",
  apiVersion: "4.0.1",
  api: null,
};

/** Menunggu satu putaran microtask di dalam act, supaya efek async selesai. */
async function tenang(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Menjelajah permukaan Home dan mengecap setiap keadaan.
 *
 * Skrip yang sama persis dijalankan terhadap komponen beku dan komponen hidup.
 * Kalau satu selector gagal pada komponen hidup, itu sendiri sudah sinyal:
 * struktur yang dicarinya tidak lagi ada.
 *
 * TIGA BELAS permukaan, bukan dua belas. Nama dan urutannya dikunci sebagai
 * daftar literal di paritas-pra-pecah.test.tsx, supaya menambah permukaan kelak
 * terlihat sebagai perubahan yang disengaja — bukan sebagai angka yang perlu
 * ditambal. Kalau Anda menambah satu baris `hasil[...]` di bawah, daftar literal
 * itu HARUS ikut bertambah, dan ujinya memang akan merah sampai Anda melakukannya.
 */
export async function rekamPermukaan(Komponen: ComponentType): Promise<Record<string, Cap>> {
  const hasil: Record<string, Cap> = {};
  let container!: HTMLElement;
  await act(async () => {
    ({ container } = render(createElement(Komponen)));
  });
  const akar = () => container.querySelector<HTMLElement>(".app-shell")!;
  const teks = (t: string) => within(container).getByText(t);

  const kePanel = async (label: string) => {
    const nav = container.querySelector<HTMLElement>("nav")!;
    await act(async () => {
      fireEvent.click(within(nav).getByText(label));
    });
  };

  hasil["overview-terputus"] = capDari(akar());

  // Sambungkan wallet: membuka kelas `wallet-button connected`, teks
  // shortAddress(), dan label jaringan di topbar.
  await act(async () => {
    fireEvent.click(teks("Connect wallet"));
  });
  await tenang();
  hasil["overview-tersambung"] = capDari(akar());

  await kePanel("Live ballots");
  hasil["live-ballots"] = capDari(akar());

  // Keadaan kosong hanya lahir kalau filter tidak menemukan apa pun — satu-satunya
  // jalan menuju kelas `empty-state`.
  const cari = container.querySelector<HTMLInputElement>(".search-field input")!;
  await act(async () => {
    fireEvent.change(cari, { target: { value: "tidak-ada-ballot-begini" } });
  });
  hasil["live-ballots-kosong"] = capDari(akar());
  await act(async () => {
    fireEvent.change(cari, { target: { value: "" } });
  });

  await kePanel("Results");
  hasil["results-tanpa-tanda-terima"] = capDari(akar());

  await kePanel("Docs");
  hasil["docs"] = capDari(akar());

  await kePanel("Overview");
  await act(async () => {
    fireEvent.click(teks("Vote on featured ballot"));
  });
  hasil["vote-pilih"] = capDari(akar());

  await act(async () => {
    fireEvent.click(teks("Fund developer grants"));
  });
  hasil["vote-terpilih"] = capDari(akar());

  // Tahap proving muncul seketika; tahap success dijadwalkan 1350 ms, dan onVote
  // 1750 ms. Timer palsu supaya dua tahap terakhir dapat dicapai tanpa menunggu.
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(teks("Generate proof & vote"));
  });
  hasil["vote-proving"] = capDari(akar());
  await act(async () => {
    vi.advanceTimersByTime(1400);
  });
  hasil["vote-sukses"] = capDari(akar());
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  vi.useRealTimers();

  await act(async () => {
    fireEvent.click(teks("Back to dashboard"));
  });

  // Panel receipt di Results hanya ada setelah suara dikirim — cabang yang tidak
  // pernah terlihat kalau Results dicap sebelum vote.
  await kePanel("Results");
  hasil["results-dengan-tanda-terima"] = capDari(akar());

  await kePanel("Overview");
  await act(async () => {
    fireEvent.click(teks("Create ballot"));
  });
  hasil["create-ballot"] = capDari(akar());
  await act(async () => {
    fireEvent.click(teks("Cancel"));
  });

  // Sidebar mobile: kelas `mobile-open` dan `mobile-overlay visible` adalah dua
  // template literal yang tidak akan pernah terlihat pada render diam.
  await act(async () => {
    fireEvent.click(container.querySelector<HTMLElement>(".menu-button")!);
  });
  hasil["sidebar-mobile"] = capDari(akar());
  await act(async () => {
    fireEvent.click(container.querySelector<HTMLElement>(".mobile-close")!);
  });

  cleanup();
  return hasil;
}

/**
 * Mengecap panel privasi di sidebar untuk keenam fixture.
 *
 * `judul` (atribut title) sengaja TIDAK dinormalkan: ia adalah kalimat klaim
 * privasi, dan setiap kata di dalamnya harus sama persis. Angka di dalamnya
 * seluruhnya berasal dari fixture dan dari URL jsdom yang dipatok di
 * vitest.config.ts, sehingga deterministik apa adanya.
 */
export async function rekamPrivasi(
  Komponen: ComponentType,
  atur: (s: StatusFixture) => void,
): Promise<Record<string, CapPrivasi>> {
  const hasil: Record<string, CapPrivasi> = {};
  for (const [nama, fixture] of Object.entries(FIXTURE_PRIVASI)) {
    atur(fixture);
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(createElement(Komponen)));
    });
    await tenang();
    const panel = container.querySelector<HTMLElement>(".privacy-mode")!;
    const titik = container.querySelector<HTMLElement>(".sidebar-bottom .status-dot")!;
    hasil[nama] = {
      kelas: [...tokenKelas(panel), ...tokenKelas(titik)],
      label: panel.querySelector("strong")!.textContent ?? "",
      judul: panel.getAttribute("title") ?? "",
    };
    cleanup();
  }
  return hasil;
}
```

Blok impor di atas sudah memuat `import { vi } from "vitest";` — `vi.useFakeTimers()`, `vi.advanceTimersByTime()`, dan `vi.useRealTimers()` dipakai di `rekamPermukaan`. Salin blok kode itu apa adanya; tidak ada baris impor yang harus ditambahkan dari prosa.

- [ ] **Step 2: Tulis uji paritas pra-pecah, sekaligus penghasil rekaman garis dasar**

`client/src/__pra-pecah__/paritas-pra-pecah.test.tsx`:

```tsx
/**
 * Gerbang utama Rencana C-1.
 *
 * Merender DUA komponen di proses uji yang sama — salinan beku Home.tsx
 * pra-pemecahan dan Home.tsx hidup — menjalankan skrip interaksi yang identik
 * pada keduanya, lalu membandingkan kelas, garis besar DOM beserta seluruh
 * atribut non-class, dan teksnya.
 *
 * Nilai "sebelum" di sini adalah HASIL MENGEKSEKUSI KODE ASLI, bukan nilai yang
 * diturunkan dari kode yang sedang disunting. Itu bedanya uji yang menjaga
 * sesuatu dan uji yang membandingkan kode dengan dirinya sendiri: yang kedua
 * tetap hijau ketika satu kelas hilang, karena kelas itu hilang di kedua sisi.
 *
 * Berkas ini dihapus di Task 8, setelah rekamannya dibekukan ke
 * client/src/test/garis-dasar-tampilan.json dan uji penerusnya hijau.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import {
  KONEKSI_PALSU,
  STATUS_LOKAL,
  rekamPermukaan,
  rekamPrivasi,
  type Rekaman,
  type StatusFixture,
} from "@/test/cap-tampilan";
import HomePraPecah from "./HomePraPecah";
import Home from "@/pages/Home";

/** sha256 Home.tsx pada saat garis dasar dibekukan (Task 1 Step 1). */
const SHA_BEKU = "bdb0d2d6d16759988a7423b4ae2c76ed27d957a21ff955c06f083a62ff3af812";
const JALUR_HOME = "client/src/pages/Home.tsx";
const JALUR_REKAMAN = new URL("../test/garis-dasar-tampilan.json", import.meta.url);

/**
 * Ketiga belas permukaan yang dijelajah rekamPermukaan(), dalam urutan
 * pencatatannya. Ditulis LITERAL, bukan sebagai angka.
 *
 * Sebuah harapan berbentuk `.length).toBe(13)` hanya memberi tahu bahwa
 * jumlahnya berubah; ia tidak memberi tahu permukaan mana yang lahir atau mati,
 * dan ia mengundang siapa pun yang melihatnya merah untuk sekadar menambal
 * angkanya. Daftar literal memaksa penambahan permukaan menjadi suntingan yang
 * disengaja di dua tempat sekaligus — skrip interaksinya dan daftar ini.
 */
const PERMUKAAN: string[] = [
  "overview-terputus",
  "overview-tersambung",
  "live-ballots",
  "live-ballots-kosong",
  "results-tanpa-tanda-terima",
  "docs",
  "vote-pilih",
  "vote-terpilih",
  "vote-proving",
  "vote-sukses",
  "results-dengan-tanda-terima",
  "create-ballot",
  "sidebar-mobile",
];

const kendali = vi.hoisted(() => ({ status: "menggantung" as StatusFixture }));

vi.mock("@/lib/proof-server", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/proof-server")>();
  return {
    ...asli,
    checkProofServer: () =>
      kendali.status === "menggantung"
        ? new Promise(() => {})
        : Promise.resolve(kendali.status),
  };
});

vi.mock("@/lib/midnight-wallet", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/midnight-wallet")>();
  return { ...asli, connectMidnightWallet: async () => KONEKSI_PALSU };
});

beforeEach(() => {
  kendali.status = STATUS_LOKAL;
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("paritas tampilan Home sebelum dan sesudah pemecahan", () => {
  it("menghasilkan kelas, garis besar, atribut, dan teks yang identik di setiap permukaan", async () => {
    const sebelum = await rekamPermukaan(HomePraPecah);
    const sesudah = await rekamPermukaan(Home);

    expect(Object.keys(sebelum)).toEqual(PERMUKAAN);
    expect(Object.keys(sesudah)).toEqual(PERMUKAAN);
    for (const nama of Object.keys(sebelum)) {
      expect(sesudah[nama].kelas, `himpunan kelas berbeda di permukaan "${nama}"`).toEqual(
        sebelum[nama].kelas,
      );
      expect(sesudah[nama].garisBesar, `garis besar atau atribut DOM berbeda di permukaan "${nama}"`).toEqual(
        sebelum[nama].garisBesar,
      );
      expect(sesudah[nama].teks, `teks berbeda di permukaan "${nama}"`).toEqual(sebelum[nama].teks);
    }

    // Angka inventaris dari rencana, ditulis literal supaya bukan turunan kode.
    // 146 token className statis unik, 12 template literal, dan 1 ternary.
    expect(sebelum["overview-terputus"].kelas.length).toBeGreaterThan(40);
    expect(sebelum["vote-terpilih"].kelas).toContain("selected");
    expect(sebelum["overview-terputus"].kelas).toContain("accent-mint");
    expect(sebelum["sidebar-mobile"].kelas).toContain("mobile-open");
    expect(sebelum["sidebar-mobile"].kelas).toContain("visible");
    expect(sebelum["live-ballots-kosong"].kelas).toContain("empty-state");
    expect(sebelum["results-dengan-tanda-terima"].kelas).toContain("receipt-panel");
    expect(sebelum["overview-tersambung"].kelas).toContain("connected");
  });

  it("menghasilkan panel privasi yang identik di kelima cabang", async () => {
    const atur = (s: StatusFixture) => {
      kendali.status = s;
    };
    const sebelum = await rekamPrivasi(HomePraPecah, atur);
    const sesudah = await rekamPrivasi(Home, atur);

    expect(Object.keys(sesudah)).toEqual(Object.keys(sebelum));
    for (const nama of Object.keys(sebelum)) {
      expect(sesudah[nama], `panel privasi berbeda pada fixture "${nama}"`).toEqual(sebelum[nama]);
    }
    expect(sebelum.lokal.label).toBe("Always on");
    expect(sebelum.remote.label).toBe("Proof server remote");
    expect(sebelum.menunggu.label).toBe("Checking…");
  });

  it("membekukan rekaman garis dasar hanya selama Home.tsx belum tersentuh", async () => {
    if (process.env.TULIS_GARIS_DASAR !== "1") {
      expect(true).toBe(true);
      return;
    }
    const sha = createHash("sha256").update(readFileSync(JALUR_HOME)).digest("hex");
    if (sha !== SHA_BEKU) {
      throw new Error(
        `Home.tsx sudah berubah (sha256 ${sha}). Rekaman garis dasar TIDAK boleh dibuat ` +
          `ulang setelah pemecahan dimulai — kalau ia dibuat dari kode yang sudah dipecah, ` +
          `ia berhenti menjadi nilai "sebelum" dan mulai menjadi cermin.`,
      );
    }
    const atur = (s: StatusFixture) => {
      kendali.status = s;
    };
    const rekaman: Rekaman = {
      permukaan: await rekamPermukaan(HomePraPecah),
      privasi: await rekamPrivasi(HomePraPecah, atur),
    };

    // Diperiksa SEBELUM writeFileSync, dengan sengaja. Kalau daftar permukaannya
    // tidak lagi sama, rekaman yang akan ditulis bukan rekaman yang dijanjikan
    // rencana ini — dan menuliskannya lebih dulu lalu melempar berarti meninggalkan
    // garis dasar yang salah di disk untuk dipakai seluruh task berikutnya.
    expect(Object.keys(rekaman.permukaan)).toEqual(PERMUKAAN);
    expect(Object.keys(rekaman.privasi)).toEqual([
      "menunggu",
      "remote",
      "lewat-host-halaman",
      "mati",
      "target-belum-terverifikasi",
      "lokal",
    ]);

    writeFileSync(JALUR_REKAMAN, `${JSON.stringify(rekaman, null, 2)}\n`);
  });
});
```

- [ ] **Step 3: Jalankan, pastikan paritas hijau sebelum apa pun dipecah**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm vitest run client/src/__pra-pecah__/paritas-pra-pecah.test.tsx 2>&1 | tail -20
```

Diharapkan: 3 uji hijau. Ini keadaan trivial — `Home.tsx` masih identik dengan berkas beku, sehingga kedua render memang sama. Yang dibuktikan di sini bukan paritas, melainkan bahwa **skrip interaksinya benar-benar menjelajah ketiga belas permukaan tanpa selector yang meleset**. Bila ada selector yang gagal sekarang, ia akan gagal nanti dan tidak bisa dibedakan dari regresi sungguhan.

Bila `teks("Create ballot")` melempar "found multiple elements", periksa modal vote benar-benar tertutup sebelum baris itu.

- [ ] **Step 4: Bekukan rekaman garis dasar**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
TULIS_GARIS_DASAR=1 pnpm vitest run client/src/__pra-pecah__/paritas-pra-pecah.test.tsx 2>&1 | tail -8
wc -c client/src/test/garis-dasar-tampilan.json
node --input-type=module -e '
import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync("client/src/test/garis-dasar-tampilan.json", "utf8"));

// Tidak ada angka yang diketik di sini. Jumlah permukaan diturunkan dari DUA
// sumber yang berbeda dan dibandingkan: rekaman yang baru saja ditulis, dan
// berapa kali skrip interaksi menulis hasil[...]. Kalau keduanya berbeda, yang
// ditulis bukan yang dijelajah.
const skrip = readFileSync("client/src/test/cap-tampilan.tsx", "utf8");
const dariSkrip = (skrip.match(/hasil\["[^"]+"\]\s*=/g) || []).length;
console.log("permukaan di rekaman :", Object.keys(r.permukaan).length);
console.log("permukaan di skrip   :", dariSkrip);
console.log("cocok                :", Object.keys(r.permukaan).length === dariSkrip);
console.log("privasi di rekaman   :", Object.keys(r.privasi).length);

// Angka 146 juga tidak diketik: ia diturunkan dari salinan beku, yang masih ada
// di pohon kerja pada titik ini dan baru dihapus di Task 8.
const beku = readFileSync("client/src/__pra-pecah__/HomePraPecah.tsx", "utf8");
const statis = new Set();
for (const m of beku.match(/className="[^"]*"/g) || [])
  for (const t of m.slice(11, -1).split(/\s+/)) if (t) statis.add(t);
const semua = new Set();
for (const c of Object.values(r.permukaan)) for (const k of c.kelas) semua.add(k);
console.log("token className statis unik di salinan beku:", statis.size);
console.log("token kelas unik di seluruh rekaman        :", semua.size);
const takTerjangkau = [...statis].filter(t => !semua.has(t)).sort();
console.log("statis yang TIDAK muncul di rekaman       :", takTerjangkau.join(", ") || "(tidak ada)");
'
```

Diharapkan:

- `permukaan di rekaman` sama dengan `permukaan di skrip`, dan `cocok: true`. Keduanya diturunkan; tidak ada angka yang perlu dipercaya. Untuk mata manusia, nilainya **13** — sama dengan panjang daftar literal `PERMUKAAN` di uji paritas, yang ujinya sendiri sudah memeriksanya di Step 3.
- `privasi di rekaman: 6`, dan nama keenamnya sudah dikunci literal oleh uji di Step 2.
- `token className statis unik di salinan beku` adalah asal-usul angka **146** di inventaris. Kalau ia bukan 146, inventaris rencana ini basi dan seluruh nomor barisnya perlu diturunkan ulang — **hentikan**.
- `token kelas unik di seluruh rekaman` lebih besar dari itu, karena template literal dan kelas `lucide-*` menambah di atasnya. Catat angkanya; Task 8 Step 9 menurunkannya lagi dan membandingkan.
- **`statis yang TIDAK muncul di rekaman` adalah daftar kelas yang tidak dijangkau ketiga belas permukaan, dan karena itu TIDAK dijaga uji paritas.** Catat daftarnya apa adanya di catatan task; jangan menambalnya dan jangan memperlakukannya sebagai kegagalan. Ia adalah ukuran jujur atas lubang yang tersisa — lihat bagian "Apa yang keempat lapis itu TIDAK buktikan".

Setelah langkah ini, perintah yang sama **tidak akan pernah berhasil lagi**: begitu Task 3 menyentuh `Home.tsx`, sha256-nya berubah dan uji ketiga melempar. Itu disengaja.

- [ ] **Step 5: Tulis uji penerus yang membandingkan terhadap rekaman**

`client/src/test/paritas-garis-dasar.test.tsx`:

```tsx
/**
 * Penerus uji paritas, dan sisa yang bertahan setelah salinan beku dihapus.
 *
 * Rekaman yang dibandingkan di sini dibuat pada Task 2 dari render salinan beku
 * Home.tsx — sebelum satu komponen pun dipecah. Ia karena itu tetap merupakan
 * nilai "sebelum" yang sah meski berkas bekunya sudah tidak ada.
 *
 * Uji ini berlaku sampai C-2 menyentuh spec §9.2. Perubahan tampilan yang
 * disengaja di sana akan membuatnya merah, dan itu benar: rekaman ini harus
 * dibuat ulang secara sadar pada saat itu, bukan diam-diam sekarang.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import {
  KONEKSI_PALSU,
  STATUS_LOKAL,
  rekamPermukaan,
  rekamPrivasi,
  type Rekaman,
  type StatusFixture,
} from "./cap-tampilan";
import Home from "@/pages/Home";

// Dibaca lewat readFileSync, bukan `import … from "*.json"`, karena tsconfig.json
// tidak menyalakan resolveJsonModule dan C-1 tidak punya urusan mengubahnya.
const rekaman = JSON.parse(
  readFileSync(new URL("./garis-dasar-tampilan.json", import.meta.url), "utf8"),
) as Rekaman;

const kendali = vi.hoisted(() => ({ status: "menggantung" as StatusFixture }));

vi.mock("@/lib/proof-server", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/proof-server")>();
  return {
    ...asli,
    checkProofServer: () =>
      kendali.status === "menggantung"
        ? new Promise(() => {})
        : Promise.resolve(kendali.status),
  };
});

vi.mock("@/lib/midnight-wallet", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/midnight-wallet")>();
  return { ...asli, connectMidnightWallet: async () => KONEKSI_PALSU };
});

beforeEach(() => {
  kendali.status = STATUS_LOKAL;
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("Home hidup terhadap rekaman garis dasar pra-pemecahan", () => {
  it("cocok pada kelas, garis besar DOM beserta atributnya, dan teks di ketiga belas permukaan", async () => {
    const sesudah = await rekamPermukaan(Home);
    expect(Object.keys(sesudah)).toEqual(Object.keys(rekaman.permukaan));
    for (const nama of Object.keys(rekaman.permukaan)) {
      expect(sesudah[nama].kelas, `himpunan kelas berbeda di permukaan "${nama}"`).toEqual(
        rekaman.permukaan[nama].kelas,
      );
      expect(sesudah[nama].garisBesar, `garis besar atau atribut DOM berbeda di permukaan "${nama}"`).toEqual(
        rekaman.permukaan[nama].garisBesar,
      );
      expect(sesudah[nama].teks, `teks berbeda di permukaan "${nama}"`).toEqual(
        rekaman.permukaan[nama].teks,
      );
    }
  });

  it("cocok pada keenam fixture panel privasi", async () => {
    const atur = (s: StatusFixture) => {
      kendali.status = s;
    };
    const sesudah = await rekamPrivasi(Home, atur);
    expect(sesudah).toEqual(rekaman.privasi);
  });
});
```

- [ ] **Step 6: Tulis alat pemindah blok**

`scripts/pindah-komponen.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Memindahkan satu blok fungsi tingkat-atas dari Home.tsx ke berkas komponen baru.
 *
 * MENGAPA ALAT, BUKAN TANGAN. Empat baris JSX di berkas ini panjangnya 2.222,
 * 2.479, 2.267, dan 2.979 karakter. Memformat ulang saat memindahkan nyaris tak
 * terhindarkan kalau dikerjakan dengan editor, dan satu spasi yang hilang di
 * dalam template literal seperti `ballot-card accent-${ballot.accent}` akan
 * menghasilkan kelas `ballot-cardaccent-mint`: tidak ada di CSS, tidak
 * menggagalkan build, tidak menggagalkan typecheck, hanya kartu yang kehilangan
 * warnanya. Alat ini memotong bita, bukan mengetik ulang.
 *
 * MENGAPA MEMOTONG DARI BERKAS BEKU. Nomor baris di Home.tsx bergeser setiap
 * kali satu blok diangkat. Nomor baris di client/src/__pra-pecah__/HomePraPecah.tsx
 * tidak pernah bergeser, sehingga angka di rencana tetap sah sampai task terakhir.
 *
 * Pemakaian:
 *   node scripts/pindah-komponen.mjs <Nama> <dari> <sampai> <tujuan.tsx> <kepala.txt>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

const BEKU = "client/src/__pra-pecah__/HomePraPecah.tsx";
const HOME = "client/src/pages/Home.tsx";

const [nama, dariArg, sampaiArg, tujuan, kepalaPath] = process.argv.slice(2);
if (!nama || !dariArg || !sampaiArg || !tujuan || !kepalaPath) {
  console.error("pakai: node scripts/pindah-komponen.mjs <Nama> <dari> <sampai> <tujuan.tsx> <kepala.txt>");
  process.exit(2);
}
const dari = Number(dariArg);
const sampai = Number(sampaiArg);

const bekuBaris = readFileSync(BEKU, "utf8").split("\n");
const potongan = bekuBaris.slice(dari - 1, sampai).join("\n");

if (!potongan.startsWith(`function ${nama}(`)) {
  throw new Error(`baris ${dari} di ${BEKU} bukan awal "function ${nama}("`);
}
if (bekuBaris[sampai - 1] !== "}") {
  throw new Error(`baris ${sampai} di ${BEKU} bukan "}" di kolom 0`);
}

const homeBaris = readFileSync(HOME, "utf8").split("\n");
const mulai = homeBaris.findIndex(b => b.startsWith(`function ${nama}(`));
if (mulai < 0) throw new Error(`"function ${nama}(" tidak ditemukan di ${HOME}`);
let akhir = mulai;
while (akhir < homeBaris.length && homeBaris[akhir] !== "}") akhir += 1;
if (akhir >= homeBaris.length) throw new Error(`penutup "}" untuk ${nama} tidak ditemukan di ${HOME}`);

// Gerbang yang membuat seluruh alat ini aman: blok di Home.tsx harus masih
// identik bita-per-bita dengan blok di berkas beku. Kalau tidak, ada yang sudah
// menyunting Home.tsx, dan memindahkan potongan beku akan MEMBATALKAN suntingan
// itu tanpa jejak.
const diHome = homeBaris.slice(mulai, akhir + 1).join("\n");
if (diHome !== potongan) {
  throw new Error(
    `blok ${nama} di ${HOME} tidak identik dengan garis dasar baris ${dari}-${sampai}. ` +
      `Home.tsx sudah tersunting. Hentikan dan periksa sebelum memindahkan apa pun.`,
  );
}

mkdirSync(dirname(tujuan), { recursive: true });
writeFileSync(tujuan, `${readFileSync(kepalaPath, "utf8")}export ${potongan}\n`);

const sampaiBuang = homeBaris[akhir + 1] === "" ? akhir + 2 : akhir + 1;
homeBaris.splice(mulai, sampaiBuang - mulai);
writeFileSync(HOME, homeBaris.join("\n"));

const sha = createHash("sha256").update(potongan).digest("hex").slice(0, 16);
console.log(`${nama}: ${potongan.length} bita, sha256 ${sha} -> ${tujuan}`);
console.log(`Home.tsx sekarang ${homeBaris.length - 1} baris`);
```

- [ ] **Step 7: Jalankan seluruh uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm test 2>&1 | tail -10
pnpm check
```

Diharapkan: `Test Files  4 passed (4)`, `Tests  25 passed (25)` — 19 lama, 1 smoke, 3 pra-pecah, 2 garis dasar. `pnpm check` tanpa keluaran.

- [ ] **Step 8: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/test client/src/__pra-pecah__ scripts/pindah-komponen.mjs
git commit -m "test(app): cap tampilan empat lapis, rekaman garis dasar terkunci sha256, dan alat pindah blok"
```

**Deliverable:** `pnpm test` hijau dengan 25 uji; `client/src/test/garis-dasar-tampilan.json` berisi **13** permukaan (nama dan urutannya dikunci literal, bukan dihitung) dan 6 fixture privasi, dibuat dari kode pra-pemecahan dan terkunci terhadap pembuatan ulang.

---

### Task 3: Modul bersama — `types.ts`, `ballot-status.ts`, `demo-data.ts`

`statusLabel()` dipakai **tiga** komponen: `VoteModal` (garis dasar baris 184), `BallotCard` (239), dan `Results` (259). Selama ia masih di `Home.tsx`, ketiga komponen itu tidak bisa dipindah ke mana pun tanpa mengimpor dari halaman — arah impor yang terbalik. Karena itu ia keluar lebih dulu, dan karena itu task ini mendahului seluruh pemecahan komponen.

Tipe domain ikut di sini karena ketujuh komponen menyebut `Ballot`, dan tiga di antaranya menyebut `Receipt` atau `Section`.

**Files:**
- Create: `client/src/components/votepriv/types.ts`, `client/src/components/votepriv/ballot-status.ts`, `client/src/components/votepriv/demo-data.ts`
- Modify: `client/src/pages/Home.tsx`
- Test: `client/src/components/votepriv/ballot-status.test.ts`

**Interfaces:**
- Consumes: tidak ada. Ketiga modul ini murni dan tidak mengimpor apa pun dari repo.
- Produces:
  - `type Section = "Overview" | "Live ballots" | "Results" | "Docs"`
  - `type BallotStatus = "live" | "closing-soon" | "finalized"`
  - `type Ballot = { id: string; title: string; description: string; community: string; votes: number; eligible: number; quorum: number; deadline: string; status: BallotStatus; options: string[]; accent: string; tag: string }`
  - `type Receipt = { ballotId: string; proofStatus: "verified" | "simulated"; nullifierStatus: "consumed" | "not-consumed"; txRef: string | null }`
  - `statusLabel(status: BallotStatus): string`
  - `initialBallots: Ballot[]`

- [ ] **Step 1: Potong tipe domain ke `types.ts`**

Potongan diambil dari berkas beku supaya komentar dokumentasi `Receipt` (garis dasar baris 53–61) ikut apa adanya. Komentar itu menjelaskan mengapa `"simulated"` dan `"verified"` dibedakan di tipe, bukan hanya di teks — itu keputusan desain, bukan catatan gaya.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
mkdir -p client/src/components/votepriv
{
  cat <<'EOF'
/**
 * Tipe domain VotePriv, dipakai bersama oleh shell dan ketujuh komponen di
 * direktori ini. Dipindah apa adanya dari Home.tsx oleh Rencana C-1; tidak ada
 * field yang ditambah, dihapus, maupun diubah tipenya.
 */

EOF
  sed -n '35,36p' client/src/__pra-pecah__/HomePraPecah.tsx | sed 's/^type /export type /'
  echo
  sed -n '38,51p' client/src/__pra-pecah__/HomePraPecah.tsx | sed 's/^type Ballot = {/export type Ballot = {/'
  echo
  sed -n '53,61p' client/src/__pra-pecah__/HomePraPecah.tsx
  sed -n '62,67p' client/src/__pra-pecah__/HomePraPecah.tsx | sed 's/^type Receipt = {/export type Receipt = {/'
} > client/src/components/votepriv/types.ts
cat client/src/components/votepriv/types.ts
```

Diharapkan: berkas memuat `export type Section`, `export type BallotStatus`, `export type Ballot` dengan 12 field, blok komentar 9 baris tentang MockAdapter, dan `export type Receipt` dengan 4 field.

- [ ] **Step 2: Potong `statusLabel` ke `ballot-status.ts`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
{
  cat <<'EOF'
import type { BallotStatus } from "./types";

/**
 * Label status ballot untuk mata manusia.
 *
 * Dipakai TIGA komponen — VoteModal, BallotCard, dan Results — dan itulah
 * alasan ia jadi modul tersendiri: kalau ia tinggal di salah satu dari ketiganya,
 * dua yang lain harus mengimpor komponen hanya untuk mendapat satu string.
 *
 * Teksnya Inggris karena ia teks UI. Jangan diterjemahkan.
 */
EOF
  sed -n '130,134p' client/src/__pra-pecah__/HomePraPecah.tsx | sed 's/^function statusLabel/export function statusLabel/'
} > client/src/components/votepriv/ballot-status.ts
cat client/src/components/votepriv/ballot-status.ts
```

- [ ] **Step 3: Potong `initialBallots` ke `demo-data.ts`**

Spec §2.4 menetapkan angka mockup ini tampil apa adanya dengan badge `Demo data` selama `MockAdapter` aktif. C-1 tidak membangun adapter itu; ia hanya menaruh datanya di tempat yang akan ditukar C-2, dan berkas ini tidak memuat satu pun JSX maupun `className`.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
{
  cat <<'EOF'
import type { Ballot } from "./types";

/**
 * Tiga ballot mockup yang mengisi UI sebelum ada kontrak.
 *
 * Spec §2.4: selama wallet belum tersambung, UI dijalankan MockAdapter dan
 * angka mockup ditampilkan apa adanya dengan badge "Demo data" yang jelas.
 * MockAdapter itu sendiri dibangun di Rencana C-2; C-1 hanya memindahkan
 * datanya ke tempat yang akan ditukar, tanpa mengubah satu angka pun.
 */
EOF
  sed -n '69,112p' client/src/__pra-pecah__/HomePraPecah.tsx | sed 's/^const initialBallots/export const initialBallots/'
} > client/src/components/votepriv/demo-data.ts
node -e "
const s = require('node:fs').readFileSync('client/src/components/votepriv/demo-data.ts','utf8');
for (const id of ['ballot-042','ballot-041','ballot-039']) console.log(id, s.includes(id));
for (const n of ['842','1200','316','500','1108','1500']) console.log(n, s.includes(n));
"
```

Diharapkan: sembilan baris `true`.

- [ ] **Step 4: Buang keenam blok itu dari `Home.tsx`**

Dibuang dari bawah ke atas supaya nomor baris di atasnya belum bergeser saat dipakai.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const HOME = "client/src/pages/Home.tsx";
const BEKU = "client/src/__pra-pecah__/HomePraPecah.tsx";
const beku = readFileSync(BEKU, "utf8").split("\n");
const baris = readFileSync(HOME, "utf8").split("\n");
// [dari, sampai] pada nomor baris garis dasar; blank line sesudahnya ikut dibuang.
const blok = [[130, 134], [69, 112], [53, 67], [38, 51], [35, 36]];
for (const [dari, sampai] of blok) {
  const tinggi = sampai - dari + 1;
  const potongan = beku.slice(dari - 1, sampai).join("\n");
  // Penjagaan HARUS ada pada `awal`, dan indexOf() tidak boleh menggantikannya.
  // indexOf() mencari di dalam berkas yang sudah digabung, jadi ia juga cocok
  // pada kecocokan yang MULAI DI TENGAH BARIS — sementara splice() hanya dapat
  // bekerja pada batas baris. Kalau hanya indexOf() yang dijaga, kecocokan
  // tengah-baris lolos penjagaan, findIndex() mengembalikan -1, lalu
  // splice(-1, n) diam-diam membuang baris TERAKHIR berkas dan membiarkan blok
  // yang seharusnya dibuang tetap di tempatnya. Diverifikasi: dengan
  // baris = ["const a = 1;", "xxconst b = 2;", "const c = 3;"] dan potongan
  // "const b = 2;", indexOf() mengembalikan 15 (lolos) sementara findIndex()
  // mengembalikan -1, dan splice(-1, 1) menghapus "const c = 3;".
  const awal = baris.findIndex((b, i) => baris.slice(i, i + tinggi).join("\n") === potongan);
  if (awal < 0)
    throw new Error(
      `blok garis dasar ${dari}-${sampai} tidak ditemukan utuh pada batas baris di ${HOME}`,
    );
  const habis = awal + tinggi;
  const sampaiBuang = baris[habis] === "" ? habis + 1 : habis;
  baris.splice(awal, sampaiBuang - awal);
}
writeFileSync(HOME, baris.join("\n"));
console.log("Home.tsx sekarang", baris.length - 1, "baris");
'
```

Diharapkan: satu baris `Home.tsx sekarang <n> baris`. **Jangan bandingkan `<n>` dengan angka yang diketik** — turunkan harapannya dari salinan beku:

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync } from "node:fs";
const beku = readFileSync("client/src/__pra-pecah__/HomePraPecah.tsx", "utf8").split("\n");
let dibuang = 0;
for (const [dari, sampai] of [[35, 36], [38, 51], [53, 67], [69, 112], [130, 134]]) {
  dibuang += sampai - dari + 1;
  if (beku[sampai] === "") dibuang += 1; // baris kosong pengikut ikut dibuang
}
const semula = beku.length - 1;
console.log(`garis dasar ${semula} baris, dibuang ${dibuang}, seharusnya sisa ${semula - dibuang}`);
'
wc -l client/src/pages/Home.tsx
```

Diharapkan: angka `seharusnya sisa` sama dengan keluaran `wc -l`. Pada inventaris hari ini keduanya **306** — 80 baris blok ditambah 5 baris kosong pengikut, dari 391. (Versi rencana sebelumnya menuliskan 315 dengan rentang toleransi 308–316; nilai sebenarnya 306 jatuh di luar rentang itu, yaitu contoh persis dari angka yang diketik tangan lalu basi.) Kalau kedua angka tidak sama, ada blok yang gagal dibuang — **hentikan** dan periksa `git diff` sebelum melanjutkan; gerbang sesungguhnya tetap Step 6 dan Step 7.

- [ ] **Step 5: Sambungkan impor di `Home.tsx`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "client/src/pages/Home.tsx";
const isi = readFileSync(p, "utf8");
const jangkar = "} from \"lucide-react\";\n";
if (!isi.includes(jangkar)) throw new Error("jangkar impor lucide-react tidak ditemukan");
const tambahan =
  "import { statusLabel } from \"@/components/votepriv/ballot-status\";\n" +
  "import { initialBallots } from \"@/components/votepriv/demo-data\";\n" +
  "import type { Ballot, Receipt, Section } from \"@/components/votepriv/types\";\n";
writeFileSync(p, isi.replace(jangkar, jangkar + tambahan));
'
sed -n '30,40p' client/src/pages/Home.tsx
```

Diharapkan: ketiga baris impor muncul persis setelah `} from "lucide-react";`.

- [ ] **Step 6: Tulis uji unit untuk `statusLabel`**

Nilai yang diharapkan ditulis **literal**, disalin dari garis dasar baris 131–133 dengan mata, bukan dihitung dari kode baru. Uji yang menurunkan harapannya dari kode yang diujinya tidak menjaga apa pun.

`client/src/components/votepriv/ballot-status.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { statusLabel } from "./ballot-status";
import type { BallotStatus } from "./types";

describe("statusLabel", () => {
  // Ketiga string ini disalin dari Home.tsx pra-pemecahan baris 131-133.
  // Ia teks UI berbahasa Inggris dan tidak boleh diterjemahkan.
  it("memetakan ketiga status ke label yang sama persis dengan sebelum pemecahan", () => {
    expect(statusLabel("live")).toBe("Live now");
    expect(statusLabel("closing-soon")).toBe("Closing soon");
    expect(statusLabel("finalized")).toBe("Finalized");
  });

  it("tidak punya status keempat", () => {
    const semua: BallotStatus[] = ["live", "closing-soon", "finalized"];
    expect(new Set(semua.map(statusLabel)).size).toBe(3);
  });
});
```

- [ ] **Step 7: Jalankan seluruh uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm test 2>&1 | tail -10
```

Diharapkan: `pnpm check` tanpa keluaran; `Test Files  5 passed (5)`, `Tests  27 passed (27)`.

Uji paritas hijau di sini adalah pernyataan yang sudah punya isi: tipe dan data pindah berkas, dan render-nya tetap identik bita-per-bita dengan render pra-pemecahan.

- [ ] **Step 8: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/components/votepriv client/src/pages/Home.tsx
git commit -m "refactor(app): pisahkan tipe domain, statusLabel, dan data demo dari Home.tsx"
```

**Deliverable:** tiga modul bersama ada dan berujian sendiri; 27 uji hijau; paritas render terhadap garis dasar tetap utuh.

---

### Task 4: `BallotCard.tsx`

`BallotCard` dipakai `Overview` (garis dasar baris 248, dua kali: satu kartu unggulan dan satu daftar mini) **dan** `LiveBallots` (255). Ia harus keluar sebelum keduanya, kalau tidak kedua berkas komponen itu akan mengimpor satu sama lain atau mengimpor dari halaman.

Baris 239 memuat template literal paling rapuh di seluruh berkas: `` className={`ballot-card accent-${ballot.accent}`} `` dan `` className={`status-badge ${ballot.status}`} ``.

**Files:**
- Create: `client/src/components/votepriv/BallotCard.tsx`
- Modify: `client/src/pages/Home.tsx`
- Test: `client/src/components/votepriv/BallotCard.test.tsx`

**Interfaces:**
- Consumes: `statusLabel(status: BallotStatus): string` dari `./ballot-status`; `type Ballot` dari `./types`; ikon `ArrowUpRight`, `ChevronRight`, `Clock3`, `Globe2`, `Vote` dari `lucide-react`.
- Produces: `BallotCard(props: { ballot: Ballot; onVote: (ballot: Ballot) => void }): JSX.Element`

- [ ] **Step 1: Siapkan kepala impor**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
cat > /tmp/kepala-ballotcard.txt <<'EOF'
import { ArrowUpRight, ChevronRight, Clock3, Globe2, Vote } from "lucide-react";
import { statusLabel } from "./ballot-status";
import type { Ballot } from "./types";

EOF
cat /tmp/kepala-ballotcard.txt
```

- [ ] **Step 2: Pindahkan blok**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node scripts/pindah-komponen.mjs BallotCard 237 240 \
  client/src/components/votepriv/BallotCard.tsx /tmp/kepala-ballotcard.txt
```

Alat mencetak satu baris `BallotCard: <n> bita, sha256 <16 heksadesimal> -> …` diikuti hitungan baris `Home.tsx` yang baru.

**Jangan bandingkan `<n>` dengan angka yang diketik di rencana.** Angka bita yang diketik tangan pasti basi begitu satu karakter di `Home.tsx` berubah, dan lebih buruk: ia diturunkan dari sumber yang sama dengan yang dicetak alat, sehingga ia tidak pernah bisa tidak cocok karena alasan yang berarti. Gerbang yang sebenarnya menurunkan nilainya sendiri dari salinan beku dan menuntut kesamaan bita-per-bita:

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
diff <(cat /tmp/kepala-ballotcard.txt; printf 'export '; sed -n '237,240p' client/src/__pra-pecah__/HomePraPecah.tsx) \
     client/src/components/votepriv/BallotCard.tsx \
  && echo "BallotCard BYTE-IDENTIK dengan kepala impor + potongan garis dasar 237-240"
echo "kode keluar: $?"
```

Diharapkan: `BallotCard BYTE-IDENTIK …` dan `kode keluar: 0`, tanpa satu baris `diff` pun.

Gerbang ini menggantikan setiap harapan berbentuk "sekian bita" atau "sekian karakter" di task ini: ia membuktikan hal yang sama dan lebih banyak (isi, bukan hanya panjang), dan ia tidak pernah basi karena kedua sisinya diturunkan saat dijalankan.

Bila alat melempar `blok BallotCard di client/src/pages/Home.tsx tidak identik dengan garis dasar`, **berhenti**: ada yang menyunting `Home.tsx` di luar rencana ini, dan memaksakan pemindahan akan membatalkan suntingan itu tanpa jejak.

- [ ] **Step 3: Periksa template literal selamat**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -c 'accent-${ballot.accent}' client/src/components/votepriv/BallotCard.tsx
grep -c 'ballot-card accent-' client/src/components/votepriv/BallotCard.tsx
grep -c 'status-badge ${ballot.status}' client/src/components/votepriv/BallotCard.tsx
grep -o 'className={`[^`]*`}' client/src/components/votepriv/BallotCard.tsx
```

Diharapkan: `1`, `1`, `1`, lalu dua baris:

```
className={`ballot-card accent-${ballot.accent}`}
className={`status-badge ${ballot.status}`}
```

Perhatikan spasi sebelum `accent-` dan sebelum `${ballot.status}`. Bila salah satu hilang, kartu kehilangan warnanya tanpa satu perkakas pun mengeluh.

- [ ] **Step 4: Sambungkan impor di `Home.tsx`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "client/src/pages/Home.tsx";
const isi = readFileSync(p, "utf8");
const jangkar = "} from \"lucide-react\";\n";
const tambahan = "import { BallotCard } from \"@/components/votepriv/BallotCard\";\n";
if (!isi.includes(jangkar)) throw new Error("jangkar impor lucide-react tidak ditemukan");
writeFileSync(p, isi.replace(jangkar, jangkar + tambahan));
'
grep -n "votepriv/BallotCard" client/src/pages/Home.tsx
```

- [ ] **Step 5: Tulis uji unit dengan harapan literal**

Kelas yang diharapkan disalin dari garis dasar baris 239 dengan mata. Menurunkannya dari `BallotCard.tsx` yang baru akan membuat uji ini membandingkan kode dengan dirinya sendiri.

`client/src/components/votepriv/BallotCard.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BallotCard } from "./BallotCard";
import type { Ballot } from "./types";

afterEach(() => cleanup());

/** Salinan ballot-041 dari data demo, dengan angka bulat supaya persentasenya pasti. */
const BALLOT: Ballot = {
  id: "ballot-041",
  title: "Protocol Grants Round 03",
  description: "Prioritise the next cohort of privacy tooling grants.",
  community: "ZK Commons",
  votes: 250,
  eligible: 500,
  quorum: 55,
  deadline: "Oct 16, 2026",
  status: "closing-soon",
  options: ["Identity primitives", "Developer education", "Audit funding"],
  accent: "violet",
  tag: "Closing soon",
};

describe("BallotCard", () => {
  it("menyusun kelas accent dari template literal tanpa kehilangan spasinya", () => {
    const { container } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    const kartu = container.querySelector("article")!;
    // Disalin dari Home.tsx pra-pemecahan baris 239.
    expect(kartu.getAttribute("class")).toBe("ballot-card accent-violet");
    expect(container.querySelector(".status-badge")!.getAttribute("class")).toBe(
      "status-badge closing-soon",
    );
    expect(container.querySelector(".progress-track")!.getAttribute("class")).toBe(
      "progress-track slim",
    );
  });

  it("menampilkan label status dan persentase partisipasi apa adanya", () => {
    const { container } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    expect(container.querySelector(".status-badge")!.textContent).toContain("Closing soon");
    expect(container.querySelector(".ballot-progress-label strong")!.textContent).toBe("50%");
    expect(container.querySelector(".ballot-tag")!.textContent).toBe("Closing soon");
  });

  it("memberi tombol 'View result' pada ballot finalized dan 'Vote privately' pada yang lain", () => {
    const { container, rerender } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    expect(container.querySelector(".text-button")!.textContent).toContain("Vote privately");
    rerender(<BallotCard ballot={{ ...BALLOT, status: "finalized" }} onVote={() => {}} />);
    expect(container.querySelector(".text-button")!.textContent).toContain("View result");
  });

  it("mengoper ballot yang sama ke onVote", () => {
    const onVote = vi.fn();
    const { container } = render(<BallotCard ballot={BALLOT} onVote={onVote} />);
    container.querySelector<HTMLButtonElement>(".text-button")!.click();
    expect(onVote).toHaveBeenCalledWith(BALLOT);
  });
});
```

- [ ] **Step 6: Jalankan seluruh uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm test 2>&1 | tail -10
```

Diharapkan: `Test Files  6 passed (6)`, `Tests  31 passed (31)`.

- [ ] **Step 7: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/components/votepriv client/src/pages/Home.tsx
git commit -m "refactor(app): pisahkan BallotCard ke komponennya sendiri"
```

**Deliverable:** `BallotCard.tsx` berdiri sendiri dengan 4 uji unit; paritas render terhadap garis dasar tetap utuh.

---

### Task 5: `VoteModal.tsx` dan `CreateBallotModal.tsx`

Dua modal. `VoteModal` adalah komponen ber-state paling rumit di berkas ini (dua `useState`, tiga tahap, dua `setTimeout`) dan satu-satunya yang benar-benar **memakai** prop `connected`. `CreateBallotModal` punya empat `useState` dan satu baris JSX yang memuat seluruh formulirnya.

**Batas yang tidak boleh dilanggar di task ini:** `CreateBallotModal` tetap empat field. `tallyDeadline`, `eligibleCount`, `quorumPercent`, dan `eligibilityPolicy` adalah C-2 (spec §9.2 butir 3). Lihat Jebakan 3.

**Files:**
- Create: `client/src/components/votepriv/VoteModal.tsx`, `client/src/components/votepriv/CreateBallotModal.tsx`
- Modify: `client/src/pages/Home.tsx`
- Test: `client/src/components/votepriv/VoteModal.test.tsx`

**Interfaces:**
- Consumes: `statusLabel` dari `./ballot-status`; `type Ballot`, `type Receipt` dari `./types`; `toast` dari `sonner`; `useState` dari `react`.
- Produces:
  - `VoteModal(props: { ballot: Ballot; connected: boolean; onClose: () => void; onVote: (receipt: Receipt) => void }): JSX.Element`
  - `CreateBallotModal(props: { onClose: () => void; onCreate: (ballot: Ballot) => void }): JSX.Element`

- [ ] **Step 1: Siapkan kedua kepala impor**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
cat > /tmp/kepala-votemodal.txt <<'EOF'
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  Clock3,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { statusLabel } from "./ballot-status";
import type { Ballot, Receipt } from "./types";

EOF
cat > /tmp/kepala-createmodal.txt <<'EOF'
import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import type { Ballot } from "./types";

EOF
wc -l /tmp/kepala-votemodal.txt /tmp/kepala-createmodal.txt
```

- [ ] **Step 2: Pindahkan `VoteModal`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node scripts/pindah-komponen.mjs VoteModal 136 216 \
  client/src/components/votepriv/VoteModal.tsx /tmp/kepala-votemodal.txt
```

Alat mencetak `VoteModal: <n> bita, sha256 … -> client/src/components/votepriv/VoteModal.tsx` diikuti hitungan baris `Home.tsx` yang baru. **Jangan bandingkan `<n>` dengan angka apa pun yang diketik di rencana** — gerbangnya ada di Step 3b, dan ia menurunkan nilainya sendiri.

- [ ] **Step 3: Pindahkan `CreateBallotModal`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node scripts/pindah-komponen.mjs CreateBallotModal 218 235 \
  client/src/components/votepriv/CreateBallotModal.tsx /tmp/kepala-createmodal.txt
```

- [ ] **Step 3b: Gerbang bita-per-bita untuk kedua modal**

Harapannya diturunkan dari salinan beku saat perintah dijalankan, bukan diketik. Ia membuktikan lebih banyak daripada "sekian bita": isi berkas komponen harus persis kepala impor ditambah potongan garis dasar, tanpa satu karakter pun bergeser.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
diff <(cat /tmp/kepala-votemodal.txt; printf 'export '; sed -n '136,216p' client/src/__pra-pecah__/HomePraPecah.tsx) \
     client/src/components/votepriv/VoteModal.tsx \
  && echo "VoteModal BYTE-IDENTIK dengan kepala + potongan 136-216"
diff <(cat /tmp/kepala-createmodal.txt; printf 'export '; sed -n '218,235p' client/src/__pra-pecah__/HomePraPecah.tsx) \
     client/src/components/votepriv/CreateBallotModal.tsx \
  && echo "CreateBallotModal BYTE-IDENTIK dengan kepala + potongan 218-235"
```

Diharapkan: dua baris `… BYTE-IDENTIK …` dan tidak ada keluaran `diff` sama sekali.

- [ ] **Step 4: Periksa komentar simulasi ikut pindah verbatim**

Komentar di garis dasar baris 162–167 mencatat bahwa alur vote **belum menyentuh kontrak** dan mengapa `txRef` sengaja `null` — sebelumnya di tempat itu ada hash palsu yang ditampilkan berdampingan dengan kalimat "The network accepted your proof". Komentar itu adalah bagian dari alasan `Receipt` punya bentuknya sekarang, dan hilangnya akan membuat C-2 tidak tahu apa yang dijanjikan kepada siapa.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
diff <(sed -n '162,167p' client/src/__pra-pecah__/HomePraPecah.tsx) \
     <(grep -A5 -F '// SIMULASI. Alur ini belum menyentuh kontrak' client/src/components/votepriv/VoteModal.tsx) \
  && echo "KOMENTAR SIMULASI UTUH"
grep -c 'proofStatus: "simulated"' client/src/components/votepriv/VoteModal.tsx
grep -c 'txRef: null' client/src/components/votepriv/VoteModal.tsx
```

Diharapkan: `KOMENTAR SIMULASI UTUH`, lalu `1` dan `1`.

- [ ] **Step 5: Buktikan `CreateBallotModal` tidak tumbuh (Jebakan 3)**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -E -c "tallyDeadline|eligibleCount|quorumPercent|eligibilityPolicy" \
  client/src/components/votepriv/CreateBallotModal.tsx || echo "0 — benar, keempat field itu C-2"
grep -c 'useState(' client/src/components/votepriv/CreateBallotModal.tsx
grep -o "<label>[^<]*" client/src/components/votepriv/CreateBallotModal.tsx
```

Diharapkan: `0 — benar, keempat field itu C-2`; `4` (empat `useState`); dan tepat empat label — `Ballot title`, `Community`, `Option one`, `Option two`.

**Perhatikan `useState(` dengan kurung buka, bukan `useState` telanjang.** `grep -c` menghitung BARIS yang cocok, bukan kemunculan, dan kepala impor berkas ini memuat `import { useState } from "react";` — satu baris penuh yang cocok. `grep -c "useState"` karena itu menghasilkan **5**, bukan 4, pada pemecahan yang seratus persen benar: empat pemanggilan ditambah satu baris impor. Kurung bukanya yang memisahkan pemanggilan dari impor. Diverifikasi terhadap berkas hasil simulasi hari ini: `grep -c "useState"` → 5, `grep -c 'useState('` → 4.

- [ ] **Step 6: Sambungkan impor di `Home.tsx`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "client/src/pages/Home.tsx";
const isi = readFileSync(p, "utf8");
const jangkar = "} from \"lucide-react\";\n";
const tambahan =
  "import { CreateBallotModal } from \"@/components/votepriv/CreateBallotModal\";\n" +
  "import { VoteModal } from \"@/components/votepriv/VoteModal\";\n";
if (!isi.includes(jangkar)) throw new Error("jangkar impor lucide-react tidak ditemukan");
writeFileSync(p, isi.replace(jangkar, jangkar + tambahan));
'
grep -n "votepriv/" client/src/pages/Home.tsx
```

- [ ] **Step 7: Tulis uji unit `VoteModal`**

`client/src/components/votepriv/VoteModal.test.tsx`:

```tsx
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoteModal } from "./VoteModal";
import type { Ballot } from "./types";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const BALLOT: Ballot = {
  id: "ballot-042",
  title: "Q4 Community Treasury",
  description: "Choose how the community treasury supports public goods in Q4.",
  community: "Midnight Builders",
  votes: 842,
  eligible: 1200,
  quorum: 60,
  deadline: "Oct 18, 2026",
  status: "live",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  accent: "mint",
  tag: "Featured",
};

describe("VoteModal", () => {
  it("menyusun kelas choice-row terpilih dari template literal", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected onClose={() => {}} onVote={() => {}} />,
    );
    const baris = container.querySelectorAll<HTMLElement>(".choice-row");
    // Disalin dari Home.tsx pra-pemecahan baris 189-190.
    expect(baris[0].getAttribute("class")).toBe("choice-row ");
    fireEvent.click(baris[0]);
    expect(container.querySelector(".choice-row")!.getAttribute("class")).toBe(
      "choice-row selected",
    );
    expect(container.querySelector(".choice-index")!.getAttribute("class")).toBe(
      "choice-index choice-0",
    );
  });

  it("menolak mengirim tanpa wallet dan tetap di tahap select", () => {
    const onVote = vi.fn();
    const { container } = render(
      <VoteModal ballot={BALLOT} connected={false} onClose={() => {}} onVote={onVote} />,
    );
    fireEvent.click(container.querySelectorAll<HTMLElement>(".choice-row")[0]);
    fireEvent.click(within(container).getByText("Generate proof & vote"));
    expect(onVote).not.toHaveBeenCalled();
    expect(container.querySelector(".choice-list")).not.toBeNull();
  });

  it("melewati proving lalu success, dan mengirim tanda terima simulasi", () => {
    vi.useFakeTimers();
    const onVote = vi.fn();
    const { container } = render(
      <VoteModal ballot={BALLOT} connected onClose={() => {}} onVote={onVote} />,
    );
    fireEvent.click(container.querySelectorAll<HTMLElement>(".choice-row")[0]);
    fireEvent.click(within(container).getByText("Generate proof & vote"));
    expect(container.querySelector(".proof-orbit")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(container.querySelector(".success-state")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Bentuk ini disalin dari Home.tsx pra-pemecahan baris 168. Tanda terima
    // simulasi TIDAK boleh membawa txRef: alur ini belum menyentuh kontrak.
    expect(onVote).toHaveBeenCalledWith({
      ballotId: "ballot-042",
      proofStatus: "simulated",
      nullifierStatus: "not-consumed",
      txRef: null,
    });
  });
});
```

Catatan tentang `"choice-row "` dengan spasi di ujung: itu memang yang dihasilkan `` `choice-row ${selected === option ? "selected" : ""}` `` ketika tidak terpilih. Harapan ditulis apa adanya, bukan dirapikan — merapikannya di uji akan menyembunyikan perubahan template literal-nya nanti.

- [ ] **Step 8: Jalankan seluruh uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm test 2>&1 | tail -10
```

Diharapkan: `Test Files  7 passed (7)`, `Tests  34 passed (34)`.

- [ ] **Step 9: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/components/votepriv client/src/pages/Home.tsx
git commit -m "refactor(app): pisahkan VoteModal dan CreateBallotModal ke komponennya sendiri"
```

**Deliverable:** kedua modal berdiri sendiri; `CreateBallotModal` terbukti masih empat field; 34 uji hijau.

---

### Task 6: `Overview.tsx` dan `LiveBallots.tsx`

Keduanya memakai `BallotCard`, yang sudah berdiri sendiri sejak Task 4. `Overview` memuat baris 248 — 2.222 karakter, yang terbesar kedua di berkas ini.

Di sinilah prop `connected` dibuang dari kedua komponen. Buktinya sudah dikumpulkan di bagian Jebakan 2; langkah pertama task ini menurunkannya ulang supaya keputusan tidak diambil dari ingatan.

**Files:**
- Create: `client/src/components/votepriv/Overview.tsx`, `client/src/components/votepriv/LiveBallots.tsx`
- Modify: `client/src/pages/Home.tsx`
- Test: `client/src/components/votepriv/LiveBallots.test.tsx`

**Interfaces:**
- Consumes: `BallotCard` dari `./BallotCard`; `type Ballot`, `type Section` dari `./types`.
- Produces:
  - `Overview(props: { ballots: Ballot[]; onVote: (ballot: Ballot) => void; onCreate: () => void; onSection: (section: Section) => void }): JSX.Element`
  - `LiveBallots(props: { ballots: Ballot[]; onVote: (ballot: Ballot) => void; onCreate: () => void }): JSX.Element`

Perhatikan: **tidak ada `connected` pada keduanya.**

- [ ] **Step 1: Turunkan ulang bukti tentang prop `connected`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
echo "Overview tanda tangan (242):"; awk 'NR==242' client/src/__pra-pecah__/HomePraPecah.tsx | grep -o connected | wc -l
echo "Overview badan (243-249):";    awk 'NR>=243 && NR<=249' client/src/__pra-pecah__/HomePraPecah.tsx | grep -c connected
echo "LiveBallots tanda tangan (252):"; awk 'NR==252' client/src/__pra-pecah__/HomePraPecah.tsx | grep -o connected | wc -l
echo "LiveBallots badan (253-255):";  awk 'NR>=253 && NR<=255' client/src/__pra-pecah__/HomePraPecah.tsx | grep -c connected
echo "VoteModal badan (147-215):";    awk 'NR>=147 && NR<=215' client/src/__pra-pecah__/HomePraPecah.tsx | grep -c connected
```

Diharapkan: `1`, `0`, `1`, `0`, `1`.

Kesimpulan yang ditegakkan angka itu: pada `Overview` dan `LiveBallots`, `connected` hanya ada di tanda tangan dan tidak pernah dibaca badan komponennya; pada `VoteModal` ia benar-benar dipakai. Prop itu dibuang dari dua yang pertama dan dipertahankan pada yang ketiga. Bila angka yang keluar berbeda dari di atas, **jangan buang prop apa pun** — turunkan ulang inventarisnya lebih dulu.

- [ ] **Step 2: Siapkan kedua kepala impor**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
cat > /tmp/kepala-overview.txt <<'EOF'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleHelp,
  Fingerprint,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { BallotCard } from "./BallotCard";
import type { Ballot, Section } from "./types";

EOF
cat > /tmp/kepala-liveballots.txt <<'EOF'
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { BallotCard } from "./BallotCard";
import type { Ballot } from "./types";

EOF
wc -l /tmp/kepala-overview.txt /tmp/kepala-liveballots.txt
```

- [ ] **Step 3: Pindahkan `Overview`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node scripts/pindah-komponen.mjs Overview 242 250 \
  client/src/components/votepriv/Overview.tsx /tmp/kepala-overview.txt

# Gerbang bita-per-bita. Harapannya diturunkan dari salinan beku saat perintah
# dijalankan; tidak ada angka yang diketik dan karena itu tidak ada yang bisa basi.
diff <(cat /tmp/kepala-overview.txt; printf 'export '; sed -n '242,250p' client/src/__pra-pecah__/HomePraPecah.tsx) \
     client/src/components/votepriv/Overview.tsx \
  && echo "Overview BYTE-IDENTIK dengan kepala + potongan 242-250"

# Panjang baris raksasa juga diturunkan dari kedua sisi, bukan dibandingkan
# dengan angka yang diketik di rencana.
node --input-type=module -e '
import { readFileSync } from "node:fs";
const panjang = f => readFileSync(f, "utf8").split("\n").map(b => b.length);
const dasar = panjang("client/src/__pra-pecah__/HomePraPecah.tsx")[247]; // garis dasar baris 248
const raksasa = panjang("client/src/components/votepriv/Overview.tsx").filter(n => n > 2000);
console.log("garis dasar baris 248   :", dasar, "karakter");
console.log("baris >2000 di Overview :", raksasa.join(", ") || "(tidak ada)");
console.log("cocok:", raksasa.length === 1 && raksasa[0] === dasar);
'
```

Diharapkan: `Overview BYTE-IDENTIK …`, tidak ada keluaran `diff`, dan `cocok: true`. Kalau `cocok: false`, baris raksasa itu tersunting saat dipindah — kembalikan dan ulangi dengan alat, bukan dengan editor.

- [ ] **Step 4: Pindahkan `LiveBallots`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node scripts/pindah-komponen.mjs LiveBallots 252 256 \
  client/src/components/votepriv/LiveBallots.tsx /tmp/kepala-liveballots.txt
diff <(cat /tmp/kepala-liveballots.txt; printf 'export '; sed -n '252,256p' client/src/__pra-pecah__/HomePraPecah.tsx) \
     client/src/components/votepriv/LiveBallots.tsx \
  && echo "LiveBallots BYTE-IDENTIK dengan kepala + potongan 252-256"
```

Diharapkan: `LiveBallots BYTE-IDENTIK …` tanpa keluaran `diff`.

Kedua gerbang di atas **harus** dijalankan sebelum Step 5, karena Step 5 sengaja menyunting satu baris di masing-masing berkas dan setelah itu kesamaan bita-per-bita tidak lagi berlaku.

- [ ] **Step 5: Buang prop `connected` dari kedua tanda tangan**

Hanya tanda tangannya yang disentuh. JSX kedua berkas tidak boleh tersentuh sama sekali.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const sunting = [
  [
    "client/src/components/votepriv/Overview.tsx",
    "export function Overview({ ballots, connected, onVote, onCreate, onSection }: { ballots: Ballot[]; connected: boolean; onVote: (ballot: Ballot) => void; onCreate: () => void; onSection: (section: Section) => void }) {",
    "export function Overview({ ballots, onVote, onCreate, onSection }: { ballots: Ballot[]; onVote: (ballot: Ballot) => void; onCreate: () => void; onSection: (section: Section) => void }) {",
  ],
  [
    "client/src/components/votepriv/LiveBallots.tsx",
    "export function LiveBallots({ ballots, connected, onVote, onCreate }: { ballots: Ballot[]; connected: boolean; onVote: (ballot: Ballot) => void; onCreate: () => void }) {",
    "export function LiveBallots({ ballots, onVote, onCreate }: { ballots: Ballot[]; onVote: (ballot: Ballot) => void; onCreate: () => void }) {",
  ],
];
for (const [p, dari, ke] of sunting) {
  const isi = readFileSync(p, "utf8");
  if (!isi.includes(dari)) throw new Error(`tanda tangan tidak cocok di ${p} — jangan lanjut`);
  writeFileSync(p, isi.replace(dari, ke));
  console.log(`${p}: prop connected dibuang dari tanda tangan`);
}
'
grep -c connected client/src/components/votepriv/Overview.tsx client/src/components/votepriv/LiveBallots.tsx

# Gerbang: SELAIN baris tanda tangan, tidak ada satu bita pun yang berubah.
# Harapannya diturunkan — potongan garis dasar disunting dengan substitusi yang
# setara, lalu dibandingkan bita-per-bita dengan berkas hasil. Kalau JSX ikut
# tersentuh, diff ini merah dan menunjukkan persis baris mana.
SUNTING='s/, connected,/,/; s/ connected: boolean;//'
BEKU=client/src/__pra-pecah__/HomePraPecah.tsx
diff <(cat /tmp/kepala-overview.txt; printf 'export '; sed -n '242,250p' "$BEKU" | sed "$SUNTING") \
     client/src/components/votepriv/Overview.tsx \
  && echo "Overview: HANYA tanda tangan yang berubah"
diff <(cat /tmp/kepala-liveballots.txt; printf 'export '; sed -n '252,256p' "$BEKU" | sed "$SUNTING") \
     client/src/components/votepriv/LiveBallots.tsx \
  && echo "LiveBallots: HANYA tanda tangan yang berubah"
```

Diharapkan: dua baris konfirmasi `prop connected dibuang dari tanda tangan`, lalu `client/src/components/votepriv/Overview.tsx:0` dan `client/src/components/votepriv/LiveBallots.tsx:0`, lalu dua baris `… HANYA tanda tangan yang berubah` tanpa satu baris `diff` pun.

Diverifikasi hari ini: substitusi `s/, connected,/,/; s/ connected: boolean;//` yang diterapkan pada garis dasar baris 242 dan 252 menghasilkan tanda tangan yang **byte-identik** dengan target yang dituliskan skrip Node di atas, dan menyisakan nol kemunculan `connected` di kedua blok.

- [ ] **Step 6: Buang `connected={connected}` di kedua tempat pemanggilan pada shell**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "client/src/pages/Home.tsx";
let isi = readFileSync(p, "utf8");
const sunting = [
  [
    "<Overview ballots={ballots} connected={connected} onVote={setVoteBallot}",
    "<Overview ballots={ballots} onVote={setVoteBallot}",
  ],
  [
    "<LiveBallots ballots={ballots} connected={connected} onVote={setVoteBallot}",
    "<LiveBallots ballots={ballots} onVote={setVoteBallot}",
  ],
];
for (const [dari, ke] of sunting) {
  if (!isi.includes(dari)) throw new Error(`tempat pemanggilan tidak cocok: ${dari}`);
  isi = isi.replace(dari, ke);
}
writeFileSync(p, isi);
console.log("dua tempat pemanggilan disunting");
'
grep -o 'connected={connected}' client/src/pages/Home.tsx | wc -l
```

Diharapkan: `dua tempat pemanggilan disunting`, lalu `1` — hanya `<VoteModal connected={connected}` yang tersisa, dan ia memang memakainya.

**`grep -o … | wc -l`, BUKAN `grep -c`.** Ketiga `connected={connected}` berada di baris yang sama — baris 390, yang panjangnya 2.979 karakter dan memuat seluruh JSX shell. `grep -c` menghitung BARIS yang cocok, sehingga ia mengembalikan `1` baik sebelum maupun sesudah penyuntingan: gerbang yang hijau apa pun yang terjadi, yaitu bukan gerbang sama sekali. Diverifikasi hari ini terhadap `Home.tsx` yang belum tersentuh: `grep -c` → `1`, `grep -o … | wc -l` → `3`. Hanya bentuk kedua yang benar-benar turun menjadi `1` setelah kedua atribut dibuang.

**Tidak ada harapan berupa "hitungan `connected` turun menjadi sekian" di sini, dengan sengaja.** Kata `connected` juga hidup di dalam dua string UI berbahasa Inggris — `toast.info("Wallet disconnected")` dan `toast.success("Wallet connected", …)` — dan di dalam nama kelas `wallet-button ${connected ? "connected" : ""}`, sehingga setiap angka total yang diketik di rencana lebih mungkin salah daripada benar, dan ketika ia salah ia menyuruh orang mencari masalah yang tidak ada. `grep -o 'connected={connected}' | wc -l` menanyakan hal yang benar-benar dimaksud: **berapa komponen yang masih dioper prop itu**. Jawabannya harus `1`, dan angka itu diturunkan dari berkas, bukan dari ingatan.

Gerbang pendampingnya ada di Task 8 Step 4 (`grep -c connected` pada `Overview.tsx` dan `LiveBallots.tsx` harus `0`) dan Task 8 Step 1 (`diff` yang menuntut tidak ada perubahan lain di shell selain kedua atribut ini).

- [ ] **Step 7: Sambungkan impor di `Home.tsx`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "client/src/pages/Home.tsx";
const isi = readFileSync(p, "utf8");
const jangkar = "} from \"lucide-react\";\n";
const tambahan =
  "import { LiveBallots } from \"@/components/votepriv/LiveBallots\";\n" +
  "import { Overview } from \"@/components/votepriv/Overview\";\n";
if (!isi.includes(jangkar)) throw new Error("jangkar impor lucide-react tidak ditemukan");
writeFileSync(p, isi.replace(jangkar, jangkar + tambahan));
'
grep -n "votepriv/" client/src/pages/Home.tsx
```

- [ ] **Step 8: Tulis uji unit `LiveBallots`**

`client/src/components/votepriv/LiveBallots.test.tsx`:

```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LiveBallots } from "./LiveBallots";
import type { Ballot } from "./types";

afterEach(() => cleanup());

const dasar: Ballot = {
  id: "ballot-001",
  title: "",
  description: "",
  community: "",
  votes: 10,
  eligible: 20,
  quorum: 50,
  deadline: "Oct 18, 2026",
  status: "live",
  options: ["A", "B"],
  accent: "mint",
  tag: "Featured",
};

const BALLOTS: Ballot[] = [
  { ...dasar, id: "b1", title: "Q4 Community Treasury", community: "Midnight Builders" },
  { ...dasar, id: "b2", title: "Protocol Grants Round 03", community: "ZK Commons", status: "closing-soon" },
  { ...dasar, id: "b3", title: "Network Upgrade 7B", community: "Midnight Core", status: "finalized" },
];

describe("LiveBallots", () => {
  it("menghitung chip filter dari status, bukan dari panjang daftar", () => {
    const { container } = render(
      <LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />,
    );
    const chip = Array.from(container.querySelectorAll(".filter-chip")).map(
      el => el.textContent,
    );
    // Disalin dari Home.tsx pra-pemecahan baris 255: All, Live, Finalized.
    expect(chip).toEqual(["All 3", "Live 1", "Finalized 1"]);
    expect(container.querySelector(".filter-chip")!.getAttribute("class")).toBe(
      "filter-chip active",
    );
  });

  it("menyaring berdasarkan judul maupun komunitas", () => {
    const { container } = render(
      <LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />,
    );
    const input = container.querySelector<HTMLInputElement>(".search-field input")!;
    fireEvent.change(input, { target: { value: "zk commons" } });
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "upgrade" } });
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(1);
  });

  it("menampilkan keadaan kosong ketika tidak ada yang cocok", () => {
    const { container } = render(
      <LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />,
    );
    fireEvent.change(container.querySelector<HTMLInputElement>(".search-field input")!, {
      target: { value: "tidak-ada-ballot-begini" },
    });
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(0);
    expect(container.querySelector(".empty-state h3")!.textContent).toBe("No ballots found");
  });
});
```

- [ ] **Step 9: Jalankan seluruh uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm test 2>&1 | tail -10
```

Diharapkan: `Test Files  8 passed (8)`, `Tests  37 passed (37)`.

Uji paritas hijau di sini adalah bukti langsung bahwa pembuangan prop `connected` tidak mengubah satu token kelas, satu elemen, maupun satu karakter teks. Kalau ia merah, keputusan Jebakan 2 salah dan prop itu harus dikembalikan.

- [ ] **Step 10: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/components/votepriv client/src/pages/Home.tsx
git commit -m "refactor(app): pisahkan Overview dan LiveBallots, buang prop connected yang tidak pernah dibaca"
```

**Deliverable:** kedua section berdiri sendiri; baris JSX 2.222 karakter terbukti utuh; 37 uji hijau.

---

### Task 7: `Results.tsx` dan `Docs.tsx`

Dua section terakhir, masing-masing satu baris JSX raksasa: 2.479 dan 2.267 karakter. `Results` memakai `statusLabel` (pemakai ketiga dan terakhir) dan merender panel receipt bercabang pada `receipt.txRef === null`. `Docs` memakai `toast` dan tidak menerima prop apa pun.

**Files:**
- Create: `client/src/components/votepriv/Results.tsx`, `client/src/components/votepriv/Docs.tsx`
- Modify: `client/src/pages/Home.tsx`
- Test: `client/src/components/votepriv/Results.test.tsx`

**Interfaces:**
- Consumes: `statusLabel` dari `./ballot-status`; `type Ballot`, `type Receipt` dari `./types`; `toast` dari `sonner`.
- Produces:
  - `Results(props: { ballots: Ballot[]; receipt: Receipt | null }): JSX.Element`
  - `Docs(): JSX.Element`

- [ ] **Step 1: Siapkan kedua kepala impor**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
cat > /tmp/kepala-results.txt <<'EOF'
import { ArrowUpRight, ClipboardCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import { statusLabel } from "./ballot-status";
import type { Ballot, Receipt } from "./types";

EOF
cat > /tmp/kepala-docs.txt <<'EOF'
import { toast } from "sonner";
import {
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Code2,
  Fingerprint,
  Github,
  Globe2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

EOF
wc -l /tmp/kepala-results.txt /tmp/kepala-docs.txt
```

- [ ] **Step 2: Pindahkan `Results`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node scripts/pindah-komponen.mjs Results 258 260 \
  client/src/components/votepriv/Results.tsx /tmp/kepala-results.txt
diff <(cat /tmp/kepala-results.txt; printf 'export '; sed -n '258,260p' client/src/__pra-pecah__/HomePraPecah.tsx) \
     client/src/components/votepriv/Results.tsx \
  && echo "Results BYTE-IDENTIK dengan kepala + potongan 258-260"
```

Diharapkan: `Results BYTE-IDENTIK …` tanpa satu baris `diff` pun.

Gerbang ini menggantikan harapan "sekian karakter" yang dulu diketik di sini. Kedua sisinya diturunkan saat perintah dijalankan, dan ia membuktikan lebih banyak: bukan hanya panjang baris raksasa yang sama, melainkan seluruh isinya.

- [ ] **Step 3: Pindahkan `Docs`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node scripts/pindah-komponen.mjs Docs 262 264 \
  client/src/components/votepriv/Docs.tsx /tmp/kepala-docs.txt
diff <(cat /tmp/kepala-docs.txt; printf 'export '; sed -n '262,264p' client/src/__pra-pecah__/HomePraPecah.tsx) \
     client/src/components/votepriv/Docs.tsx \
  && echo "Docs BYTE-IDENTIK dengan kepala + potongan 262-264"

# Panjang ketiga baris raksasa yang dipindah, kedua sisinya diturunkan.
node --input-type=module -e '
import { readFileSync } from "node:fs";
const panjang = f => readFileSync(f, "utf8").split("\n").map(b => b.length);
const beku = panjang("client/src/__pra-pecah__/HomePraPecah.tsx");
for (const [nomor, berkas] of [[248, "Overview"], [259, "Results"], [263, "Docs"]]) {
  const raksasa = panjang(`client/src/components/votepriv/${berkas}.tsx`).filter(n => n > 2000);
  console.log(
    `garis dasar ${nomor} = ${beku[nomor - 1]} karakter | ${berkas}.tsx >2000: ${raksasa.join(", ") || "(tidak ada)"} | cocok: ${raksasa.length === 1 && raksasa[0] === beku[nomor - 1]}`,
  );
}
'
```

Diharapkan: `Docs BYTE-IDENTIK …` tanpa keluaran `diff`, lalu tiga baris yang seluruhnya berakhir `cocok: true`.

- [ ] **Step 4: Periksa blok `<pre>` di `Docs` tidak tersentuh**

Baris 263 memuat template literal berisi `\n` literal di dalam blok `<pre>`. Satu saja yang berubah menjadi baris baru sungguhan dan blok kode di halaman Docs berantakan.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -o 'generateProof({ ballotId, optionId })[^`]*' client/src/components/votepriv/Docs.tsx
grep -c 'submitVote({ commitment, proof })' client/src/components/votepriv/Docs.tsx
```

Diharapkan: satu baris tunggal yang memuat rangkaian `\n` sebagai dua karakter (garis miring terbalik lalu huruf n), bukan sebagai baris baru; lalu `1`.

- [ ] **Step 5: Sambungkan impor di `Home.tsx`**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "client/src/pages/Home.tsx";
const isi = readFileSync(p, "utf8");
const jangkar = "} from \"lucide-react\";\n";
const tambahan =
  "import { Docs } from \"@/components/votepriv/Docs\";\n" +
  "import { Results } from \"@/components/votepriv/Results\";\n";
if (!isi.includes(jangkar)) throw new Error("jangkar impor lucide-react tidak ditemukan");
writeFileSync(p, isi.replace(jangkar, jangkar + tambahan));
'
grep -c "votepriv/" client/src/pages/Home.tsx
```

Diharapkan: `10` — tujuh komponen ditambah `ballot-status`, `demo-data`, dan `types`.

- [ ] **Step 6: Tulis uji unit `Results`**

`client/src/components/votepriv/Results.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Results } from "./Results";
import type { Ballot, Receipt } from "./types";

afterEach(() => cleanup());

const dasar: Ballot = {
  id: "b1",
  title: "Q4 Community Treasury",
  description: "",
  community: "",
  votes: 842,
  eligible: 1200,
  quorum: 60,
  deadline: "Oct 18, 2026",
  status: "live",
  options: ["A"],
  accent: "mint",
  tag: "Featured",
};
const BALLOTS: Ballot[] = [
  dasar,
  { ...dasar, id: "b2", title: "Protocol Grants Round 03", status: "closing-soon" },
  { ...dasar, id: "b3", title: "Network Upgrade 7B", status: "finalized" },
];

describe("Results", () => {
  it("tidak menampilkan panel tanda terima selama belum ada suara", () => {
    const { container } = render(<Results ballots={BALLOTS} receipt={null} />);
    expect(container.querySelector(".receipt-panel")).toBeNull();
    expect(container.querySelector(".verified-stamp strong")!.textContent).toBe("Demo data");
  });

  it("menyebut suara simulasi sebagai simulasi, tanpa transaksi", () => {
    const receipt: Receipt = {
      ballotId: "b1",
      proofStatus: "simulated",
      nullifierStatus: "not-consumed",
      txRef: null,
    };
    const { container } = render(<Results ballots={BALLOTS} receipt={receipt} />);
    // Disalin dari Home.tsx pra-pemecahan baris 259. Cabang txRef === null harus
    // tetap menolak menampilkan hash apa pun.
    expect(container.querySelector(".receipt-line")!.textContent).toBe(
      "Simulated — no transaction was submitted",
    );
    expect(container.querySelector(".receipt-line .status-dot")).toBeNull();
  });

  it("menampilkan referensi transaksi hanya ketika txRef benar-benar ada", () => {
    const receipt: Receipt = {
      ballotId: "b1",
      proofStatus: "verified",
      nullifierStatus: "consumed",
      txRef: "0000000000000000000000000000000000000000000000000000000000000001",
    };
    const { container } = render(<Results ballots={BALLOTS} receipt={receipt} />);
    expect(container.querySelector(".receipt-line .status-dot")).not.toBeNull();
    expect(container.querySelector(".receipt-line strong")!.textContent).toBe(receipt.txRef);
  });

  it("memakai statusLabel yang sama dengan kartu ballot", () => {
    const { container } = render(<Results ballots={BALLOTS} receipt={null} />);
    const badge = Array.from(container.querySelectorAll(".status-badge")).map(
      el => el.textContent?.trim(),
    );
    expect(badge).toEqual(["Live now", "Closing soon", "Finalized"]);
    expect(container.querySelectorAll(".result-number")[0].getAttribute("class")).toBe(
      "result-number result-0",
    );
  });
});
```

- [ ] **Step 7: Jalankan seluruh uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm test 2>&1 | tail -10
```

Diharapkan: `Test Files  9 passed (9)`, `Tests  41 passed (41)`.

- [ ] **Step 8: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add client/src/components/votepriv client/src/pages/Home.tsx
git commit -m "refactor(app): pisahkan Results dan Docs, melengkapi tujuh komponen spec 9.3"
```

**Deliverable:** ketujuh komponen §9.3 ada; ketiga baris JSX raksasa yang dipindah terbukti utuh panjangnya; 41 uji hijau.

---

### Task 8: `Home.tsx` menjadi shell, penguncian jebakan, dan pembersihan

Ketujuh komponen sudah keluar. Yang tersisa di `Home.tsx` seharusnya persis: blok impor, `navItems`, `shortAddress`, dan `export default function Home()` — termasuk `useMemo` privasi dan baris JSX 2.979 karakter, keduanya tak tersentuh.

Task ini membuktikan itu dengan dua `diff` yang menentukan, memasang penguncian untuk ketiga jebakan, memangkas impor yang menganggur, lalu menghapus perancah pra-pemecahan.

**Files:**
- Modify: `client/src/pages/Home.tsx`
- Delete: `client/src/__pra-pecah__/` (tiga berkas), `scripts/pindah-komponen.mjs`
- Test: seluruh suite

**Interfaces:**
- Consumes: ketujuh komponen dari `@/components/votepriv/*`; `statusLabel`, `initialBallots`, tipe domain; `connectMidnightWallet`, `describeWalletError`; `checkProofServer`, `ProofServerStatus`.
- Produces: `Home(): JSX.Element` sebagai default export — shell, tanpa perubahan perilaku.

- [ ] **Step 1: Buktikan shell `Home` byte-identik dengan garis dasar**

Satu perintah yang sekaligus membuktikan `useMemo` privasi tidak pindah, baris 390 tidak tersentuh selain oleh suntingan yang disengaja, dan seluruh handler wallet utuh.

**Shell TIDAK byte-identik dengan garis dasar, dan tidak boleh dituntut begitu.** Task 6 Step 6 wajib membuang `connected={connected}` dari dua tempat pemanggilan di baris 390. `diff` mentah karena itu **dijamin** keluar dengan kode 1 pada pekerjaan yang seratus persen benar — sebuah gerbang yang merah setiap kali bukan gerbang. Diverifikasi hari ini: `diff` mentah menghasilkan tepat satu hunk, `125c125`, dan kode keluar 1.

Yang benar adalah menerapkan suntingan yang disengaja itu pada **sisi garis dasar**, lalu menuntut kesamaan bita-per-bita. Perubahan lain apa pun — termasuk pada `connected={connected}` milik `VoteModal`, yang harus tetap ada — tetap merah:

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
BEKU=client/src/__pra-pecah__/HomePraPecah.tsx
HIDUP=client/src/pages/Home.tsx

diff <(sed -n '266,391p' "$BEKU" | sed \
        's/<Overview ballots={ballots} connected={connected} /<Overview ballots={ballots} /; s/<LiveBallots ballots={ballots} connected={connected} /<LiveBallots ballots={ballots} /') \
     <(sed -n '/^export default function Home() {$/,$p' "$HIDUP")
echo "kode keluar: $?"
```

Diharapkan: **tidak ada keluaran `diff` sama sekali**, dan `kode keluar: 0`. Diverifikasi hari ini terhadap shell hasil simulasi: gerbang ini keluar dengan 0.

Kalau ia merah, jangan menambal harapannya. Baca hunk-nya: ia menyebutkan persis baris mana di shell yang tersunting di luar rencana.

Sebagai konfirmasi untuk mata manusia — bukan gerbang, dan angkanya diturunkan, bukan diketik:

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
BEKU=client/src/__pra-pecah__/HomePraPecah.tsx
HIDUP=client/src/pages/Home.tsx
diff <(sed -n '266,391p' "$BEKU") <(sed -n '/^export default function Home() {$/,$p' "$HIDUP") > /tmp/diff-shell.txt
echo "jumlah hunk        : $(grep -c '^[0-9]' /tmp/diff-shell.txt)"
echo "header hunk        : $(grep '^[0-9]' /tmp/diff-shell.txt)"
echo "offset baris 390   : $((390 - 266 + 1))"
echo "connected={connected} di hunk : $(grep -o 'connected={connected}' /tmp/diff-shell.txt | wc -l)"
```

Diharapkan: `jumlah hunk: 1`; `header hunk` menyebut nomor yang sama dengan `offset baris 390` di kedua sisinya (yaitu `125c125`); dan `connected={connected} di hunk : 4` — baris 390 muncul sekali di tiap sisi `diff`; sisi garis dasar memuat tiga kemunculan (Overview, LiveBallots, VoteModal) dan sisi hidup memuat satu (VoteModal saja). Perhatikan `grep -o … | wc -l`, bukan `grep -c`: ketiganya berada di baris yang sama, jadi `grep -c` akan selalu mengembalikan `2` tanpa memberi tahu apa pun. Lebih dari satu hunk berarti ada suntingan lain di shell.

- [ ] **Step 2: Buktikan `navItems` dan `shortAddress` byte-identik**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
diff <(sed -n '114,128p' client/src/__pra-pecah__/HomePraPecah.tsx) \
     <(sed -n '/^const navItems:/,/^}$/p' client/src/pages/Home.tsx)
echo "kode keluar: $?"
```

Diharapkan: `kode keluar: 0` tanpa keluaran lain.

- [ ] **Step 3: Kunci Jebakan 1 — `useMemo` privasi tidak boleh ada di `components/votepriv/`**

**Polanya sempit, dan itu disengaja.** Pola lebar `proofStatus|privacy|…` yang tampak lebih aman justru **pasti** merah pada pemecahan yang benar: dijalankan hari ini ia menghasilkan enam baris di komponen — `proofStatus: "simulated"` (nama field `Receipt`), kelas `privacy-callout`, `privacy-result`, `privacy-stat`, dan teks UI Inggris `privacy-first defaults`, `Read the privacy model`, `The privacy model` — ditambah `types.ts` yang **wajib** memuat `proofStatus:` dan fixture `Receipt` di dua berkas uji. Semuanya sah. Gerbang yang merah pada pekerjaan yang benar akan dimatikan oleh orang pertama yang melihatnya, dan instruksi "kembalikan ke Home.tsx" pada kasus itu berarti membatalkan pemecahan yang benar.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv

# Hanya hal yang tidak mungkin lahir dari nama field domain maupun nama kelas CSS.
grep -rn -E 'checkProofServer|ProofServerStatus|setProofStatus|targetTerverifikasi|const privacy = useMemo|privacy\.(tone|label|title)|privacy-mode|witness tidak pernah meninggalkan perangkat ini' \
  client/src/components/votepriv/ ; echo "kecocokan: $?"

# Ketiga kalimat klaim privasi masih di Home.tsx. Jumlahnya TIDAK diketik di sini
# — ia diturunkan dari salinan beku, yang masih ada sampai Step 11.
for pola in "const privacy = useMemo" "Witness Anda — credential dan pilihan suara" "witness tidak pernah meninggalkan perangkat ini"; do
  a=$(grep -c -F "$pola" client/src/__pra-pecah__/HomePraPecah.tsx)
  b=$(grep -c -F "$pola" client/src/pages/Home.tsx)
  printf 'garis dasar %s | Home.tsx %s | cocok %s | %s\n' \
    "$a" "$b" "$([ "$a" = "$b" ] && echo ya || echo TIDAK)" "$pola"
done
```

Diharapkan:

- `grep -rn` tidak mencetak satu baris pun dan berakhir `kecocokan: 1` (kode keluar 1 = tidak ada kecocokan, itu yang benar).
- Tiga baris berikutnya seluruhnya berakhir `cocok ya`. **Jangan membandingkannya dengan angka yang diketik.** Rencana versi sebelumnya menuntut `1`, `1`, `1`; kalimat ketiga sebenarnya muncul **tiga** kali di `Home.tsx` (garis dasar baris 283 di komentar, 335, dan 340 di dua cabang `title`), sehingga harapan yang diketik itu merah pada berkas yang tidak tersentuh sama sekali. Bentuk turunan di atas tidak bisa basi.

Bila `grep -rn` menemukan sesuatu, `useMemo` privasi atau turunannya sudah bocor ke direktori komponen. Kembalikan ke `Home.tsx`. Blok itu tidak punya komponen sasaran di spec §9.3, ia bergantung pada `proofStatus` yang tidak dioper ke komponen mana pun, dan ia dirender hanya di sidebar.

Diverifikasi hari ini terhadap pohon simulasi berisi ketujuh komponen, `types.ts`, `ballot-status.ts`, `demo-data.ts`, dan fixture `Receipt`: pola sempit menghasilkan nol baris. Diverifikasi juga bahwa ia **menyala** pada dua skenario bocor — `useMemo` utuh yang dipindah ke komponen, dan markup panel privasi saja yang dipindah tanpa `useMemo`-nya.

- [ ] **Step 4: Kunci Jebakan 2 — tidak ada prop menganggur yang terekspor**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -c connected client/src/components/votepriv/Overview.tsx
grep -c connected client/src/components/votepriv/LiveBallots.tsx
grep -c connected client/src/components/votepriv/VoteModal.tsx
```

Diharapkan: `0`, `0`, lalu angka positif — `VoteModal` memang memakainya di baris `if (!connected)`.

- [ ] **Step 5: Kunci Jebakan 3 — `CreateBallotModal` tidak tumbuh**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
grep -rn -E "tallyDeadline|eligibleCount|quorumPercent|eligibilityPolicy" \
  client/src/components/votepriv/ client/src/pages/Home.tsx ; echo "kecocokan: $?"

# Daftar labelnya diturunkan dari salinan beku, bukan dihitung dengan angka yang
# diketik. Sebuah harapan "4" hanya melihat jumlah; diff ini juga melihat teksnya,
# sehingga label yang ditukar atau diterjemahkan pun tertangkap.
diff <(sed -n '218,235p' client/src/__pra-pecah__/HomePraPecah.tsx | grep -o "<label>[^<]*") \
     <(grep -o "<label>[^<]*" client/src/components/votepriv/CreateBallotModal.tsx) \
  && echo "label CreateBallotModal IDENTIK dengan garis dasar"
```

Diharapkan: tidak ada baris tercetak dari `grep -rn`, `kecocokan: 1`, lalu `label CreateBallotModal IDENTIK dengan garis dasar` tanpa keluaran `diff`. Untuk mata manusia, keempat labelnya adalah `Ballot title`, `Community`, `Option one`, `Option two`.

Keempat field itu diwajibkan constructor kontrak dan **harus** ditambahkan — di C-2, bukan di sini. Spec §14.7 menyebut ini persis sebagai alasan C dipecah dua: mencampurnya membuat klaim "tidak menyentuh tampilan" tidak lagi dapat diperiksa, karena rekaman garis dasar tidak punya field itu dan satu-satunya cara membuat uji hijau lagi adalah melonggarkan uji yang menjadi seluruh nilai rencana ini.

- [ ] **Step 6: Cari impor lucide-react yang menganggur di sembilan berkas**

**Jangkar regexnya `[^}]`, bukan `[\s\S]`, dan itu menentukan.** `/import \{([\s\S]*?)\} from "lucide-react";/` mendarat pada `import {` **PERTAMA** di berkas, lalu `[\s\S]*?` melahap lintas-impor sampai menemukan `} from "lucide-react";`. Pada berkas yang blok lucide-nya bukan impor pertama — dan itu lima dari delapan berkas di sini — hasil tangkapannya memuat sisa impor lain, sehingga daftar "nama"-nya berisi sampah dan `NGANGGUR` yang dilaporkannya tidak berarti apa-apa. `[^}]` tidak bisa melintasi `}`, sehingga setiap percobaan yang mulai pada impor yang salah gagal dan mesin regex terpaksa maju sampai mendarat pada blok lucide yang benar.

Diverifikasi hari ini terhadap kedelapan berkas hasil simulasi: `[\s\S]*?` rusak di **lima** — `VoteModal.tsx`, `CreateBallotModal.tsx`, `LiveBallots.tsx`, `Docs.tsx`, dan `Home.tsx` (yang melaporkan 31 "nama" alih-alih 27); `[^}]*?` menghasilkan daftar yang seluruhnya identifier di kedelapannya.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync } from "node:fs";
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
for (const p of process.argv.slice(1)) {
  const isi = readFileSync(p, "utf8");
  // [^}] TIDAK BOLEH diganti [\s\S]: lihat penjelasan di atas langkah ini.
  const blok = isi.match(/import \{([^}]*?)\} from "lucide-react";/);
  if (!blok) { console.log(p, "(tanpa impor lucide-react)"); continue; }
  const nama = blok[1].split(",").map(x => x.trim()).filter(Boolean);
  // Penjagaan: kalau satu saja entri bukan identifier, jangkarnya meleset dan
  // seluruh keluaran berikutnya sampah. Berhenti keras, jangan lapor "bersih".
  const bukanIdentifier = nama.filter(n => !IDENTIFIER.test(n));
  if (bukanIdentifier.length > 0) {
    throw new Error(
      `${p}: detektor menangkap entri yang bukan identifier — ${JSON.stringify(bukanIdentifier)}. ` +
        "Jangkar regex meleset. JANGAN pangkas impor apa pun berdasarkan keluaran ini.",
    );
  }
  const sisa = isi.slice(blok.index + blok[0].length);
  const nganggur = nama.filter(n => !new RegExp(`\\b${n}\\b`).test(sisa));
  console.log(p, `(${nama.length} nama)`, nganggur.length === 0 ? "bersih" : "NGANGGUR: " + nganggur.join(", "));
}
' client/src/pages/Home.tsx client/src/components/votepriv/*.tsx
```

Diharapkan:

- Skripnya **tidak melempar**. Kalau ia melempar `bukan identifier`, jangkarnya meleset dan tidak satu pun impor boleh dipangkas berdasarkan keluarannya.
- Setiap berkas komponen di `components/votepriv/` melaporkan `bersih` — kepala impornya disusun tepat di Task 4–7.
- Berkas `*.test.tsx` di direktori yang sama melaporkan `(tanpa impor lucide-react)`. Itu benar; uji unit tidak merender ikon sendiri.
- `client/src/pages/Home.tsx` melaporkan `(27 nama)` dan `NGANGGUR:` dengan daftar panjang — blok impornya masih blok asli 33 baris yang melayani ketujuh komponen. Empat di antaranya (`Copy`, `FileCheck2`, `Info`, `Radio`) sudah menganggur **sebelum** C-1 dimulai; `noUnusedLocals` mati, jadi tidak ada yang pernah menemukannya. Step 7 membuang semuanya sekaligus.

- [ ] **Step 7: Tulis ulang blok impor `Home.tsx` — lewat skrip, bukan editor**

Ini satu-satunya langkah penyuntingan `Home.tsx` yang tersisa, dan Global Constraints rencana ini menuntut setiap pemindahan dilakukan lewat pemotongan terskrip. Langkah ini tunduk pada aturan yang sama: blok impor lama dibuang oleh skrip yang menolak bekerja kalau yang akan dibuangnya ternyata bukan impor.

**Blok impor barunya tidak memuat `BallotCard`.** Buktinya diturunkan, bukan diasumsikan: setelah Task 6 memindahkan `Overview` dan `LiveBallots` — dua-duanya satu-satunya pemakai `BallotCard` — shell tidak lagi menyebut nama itu sama sekali. Diverifikasi hari ini terhadap gabungan `navItems` (garis dasar 114–119), `shortAddress` (121–128), dan `export default function Home()` (266–391): `BallotCard` muncul **0** kali, `statusLabel` **0** kali. Mengimpor keduanya berarti menulis impor mati ke dalam berkas yang seluruh task ini justru sedang membersihkan impor matinya. Step 7b memverifikasinya lagi setelah penulisan.

Nama lucide yang tersisa juga diturunkan dari sumber yang sama: dari 27 nama di blok impor asli, tepat **10** yang masih disebut shell — `BarChart3`, `ChevronRight`, `CircleHelp`, `Code2`, `LayoutDashboard`, `LockKeyhole`, `Menu`, `Vote`, `Wallet`, `X`. (`LayoutDashboard` dipakai dua kali: sebagai nilai di `navItems` dan sebagai tipe `typeof LayoutDashboard` pada anotasinya.)

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
cat > /tmp/impor-home.txt <<'EOF'
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  ChevronRight,
  CircleHelp,
  Code2,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import { connectMidnightWallet, describeWalletError } from "@/lib/midnight-wallet";
import { checkProofServer, type ProofServerStatus } from "@/lib/proof-server";
import { CreateBallotModal } from "@/components/votepriv/CreateBallotModal";
import { Docs } from "@/components/votepriv/Docs";
import { LiveBallots } from "@/components/votepriv/LiveBallots";
import { Overview } from "@/components/votepriv/Overview";
import { Results } from "@/components/votepriv/Results";
import { VoteModal } from "@/components/votepriv/VoteModal";
import { initialBallots } from "@/components/votepriv/demo-data";
import type { Ballot, Receipt, Section } from "@/components/votepriv/types";

EOF

node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const p = "client/src/pages/Home.tsx";
const baris = readFileSync(p, "utf8").split("\n");

// Jangkar: deklarasi pertama sesudah blok impor. Seluruh baris di atasnya adalah
// blok impor lama — blok lucide 33 baris ditambah sepuluh baris votepriv yang
// disisipkan Task 3-7 — dan seluruhnya diganti sekaligus.
const jangkar = baris.findIndex(b => b.startsWith("const navItems:"));
if (jangkar < 0) throw new Error("jangkar `const navItems:` tidak ditemukan — hentikan, jangan tulis apa pun");

// Penjagaan yang membuat langkah ini aman: yang dibuang HARUS hanya impor.
// Baris impor satu-baris mulai dengan "import ", lanjutan blok multi-baris mulai
// dengan spasi, penutupnya mulai dengan "} from ", dan baris kosong diizinkan.
// Apa pun di luar itu berarti ada kode di atas navItems, dan skrip ini akan
// menghapus kode alih-alih impor.
const bukanImpor = baris.slice(0, jangkar).filter(b => b !== "" && !/^(import |\s|\} from )/.test(b));
if (bukanImpor.length > 0) {
  throw new Error("ada baris yang BUKAN impor sebelum navItems: " + JSON.stringify(bukanImpor));
}

const impor = readFileSync("/tmp/impor-home.txt", "utf8");
writeFileSync(p, impor + baris.slice(jangkar).join("\n"));
console.log(`blok impor lama ${jangkar} baris diganti dengan ${impor.split("\n").length - 1} baris`);
'
sed -n '1,26p' client/src/pages/Home.tsx
```

Diharapkan: satu baris `blok impor lama <n> baris diganti dengan 25 baris`, lalu blok impor baru tercetak dengan `const navItems:` **tidak** ikut terpotong di dalamnya.

Kalau skripnya melempar `ada baris yang BUKAN impor sebelum navItems`, **jangan paksa**. Artinya ada deklarasi yang tertinggal di atas `navItems` — kemungkinan besar satu blok yang gagal dibuang di Task 3–7 — dan memaksakan penulisan akan menghapusnya tanpa jejak.

- [ ] **Step 7b: Buktikan tidak ada impor mati yang tersisa**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
node --input-type=module -e '
import { readFileSync } from "node:fs";
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const p = "client/src/pages/Home.tsx";
const isi = readFileSync(p, "utf8");
// [^}] TIDAK BOLEH diganti [\s\S]: blok lucide di sini BUKAN impor pertama, dan
// [\s\S]*? akan mendarat pada `import { useEffect…` lalu melahap lintas-impor.
const blok = isi.match(/import \{([^}]*?)\} from "lucide-react";/);
if (!blok) throw new Error("blok impor lucide-react tidak ditemukan");
const nama = blok[1].split(",").map(x => x.trim()).filter(Boolean);
const bukanIdentifier = nama.filter(n => !IDENTIFIER.test(n));
if (bukanIdentifier.length > 0) {
  throw new Error("detektor menangkap entri yang bukan identifier: " + JSON.stringify(bukanIdentifier));
}
const sisa = isi.slice(blok.index + blok[0].length);
const nganggur = nama.filter(n => !new RegExp(`\\b${n}\\b`).test(sisa));
console.log(`lucide: ${nama.length} nama,`, nganggur.length === 0 ? "bersih" : "NGANGGUR: " + nganggur.join(", "));
'
echo "BallotCard di Home.tsx : $(grep -o BallotCard client/src/pages/Home.tsx | wc -l)"
echo "statusLabel di Home.tsx: $(grep -o statusLabel client/src/pages/Home.tsx | wc -l)"
echo "impor votepriv         : $(grep -c '@/components/votepriv/' client/src/pages/Home.tsx)"
```

Diharapkan: `lucide: 10 nama, bersih`; `BallotCard di Home.tsx : 0`; `statusLabel di Home.tsx: 0`; `impor votepriv : 8` — enam komponen yang benar-benar dirender shell, ditambah `demo-data` dan `types`. `BallotCard` tidak ada di antaranya, dan itu benar: pemakainya adalah `Overview` dan `LiveBallots`, bukan shell.

- [ ] **Step 8: Jalankan seluruh uji dan typecheck**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm check
pnpm test 2>&1 | tail -10
```

Diharapkan: `pnpm check` tanpa keluaran; `Test Files  9 passed (9)`, `Tests  41 passed (41)`.

- [ ] **Step 9: Ukur hasilnya**

Tidak ada angka `className` yang diketik di langkah ini. Nilai "sebelum" diturunkan dari salinan beku — yang masih ada sampai Step 11 — dan nilai "sesudah" diturunkan dari pohon hasil, lalu keduanya dibandingkan. Ketiga bentuk `className` diperiksa, bukan dua: bentuk ternary di baris 390 tidak tertangkap pola statis maupun pola template literal, dan tanpa barisnya sendiri ia tidak punya penjaga sama sekali.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
wc -l -c client/src/pages/Home.tsx
wc -l -c client/src/components/votepriv/*.ts client/src/components/votepriv/*.tsx | tail -1

node --input-type=module -e '
import { readFileSync, readdirSync } from "node:fs";
const DIR = "client/src/components/votepriv";
// Berkas uji dikecualikan dengan sengaja: ia memuat selector, bukan markup.
const komponen = readdirSync(DIR)
  .filter(f => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes(".test."))
  .map(f => `${DIR}/${f}`);
const sesudah = ["client/src/pages/Home.tsx", ...komponen].map(f => readFileSync(f, "utf8")).join("\n");
const sebelum = readFileSync("client/src/__pra-pecah__/HomePraPecah.tsx", "utf8");

const statis = isi => {
  const t = new Set();
  for (const m of isi.match(/className="[^"]*"/g) || [])
    for (const x of m.slice(11, -1).split(/\s+/)) if (x) t.add(x);
  return t;
};
const template = isi => (isi.match(/className=\{`[^`]*`\}/g) || []).length;
const ternary = isi => (isi.match(/className=\{[^`"][^}]*\}/g) || []).length;

const a = statis(sebelum), b = statis(sesudah);
console.log("berkas komponen yang dihitung:", komponen.map(f => f.split("/").pop()).join(", "));
console.log("className statis unik   sebelum:", a.size, "sesudah:", b.size, "cocok:", a.size === b.size);
console.log("  hilang:", [...a].filter(x => !b.has(x)).sort().join(", ") || "(tidak ada)");
console.log("  lahir :", [...b].filter(x => !a.has(x)).sort().join(", ") || "(tidak ada)");
console.log("className template lit. sebelum:", template(sebelum), "sesudah:", template(sesudah), "cocok:", template(sebelum) === template(sesudah));
console.log("className ternary       sebelum:", ternary(sebelum), "sesudah:", ternary(sesudah), "cocok:", ternary(sebelum) === ternary(sesudah));
'
```

Diharapkan: ketiga baris `cocok:` bernilai `true`, dan `hilang`/`lahir` keduanya `(tidak ada)`. Untuk mata manusia, angkanya adalah **146**, **12**, dan **1** — sama dengan inventaris — tetapi gerbangnya adalah kata `true`, bukan angka itu.

Kalau `hilang` memuat sesuatu, satu kelas lenyap saat dipindah. Uji paritas seharusnya sudah merah lebih dulu; kalau ia hijau sementara ini merah, yang bocor adalah ujinya — kelas itu berada di permukaan yang tidak dijelajah skrip interaksi. Lihat daftar `statis yang TIDAK muncul di rekaman` yang dicatat di Task 2 Step 4.

`Home.tsx` yang tersisa berkisar **165–170 baris** (diverifikasi pada simulasi hari ini: 167 baris, 11.266 bita, turun dari 391 baris / 33.441 bita). Angka ini **bukan gerbang** — ia bergantung pada baris kosong. Gerbangnya adalah Step 1, Step 7b, dan perbandingan `className` di atas.

- [ ] **Step 10: Jalankan aplikasi sungguhan sekali**

Uji jsdom tidak melihat CSS. Sekali melihat dengan mata masih murah.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm build 2>&1 | tail -5
```

Diharapkan: build berhasil. Lalu jalankan `pnpm dev`, buka halamannya, dan periksa empat hal yang uji tidak bisa lihat: kartu ballot berwarna (mint, violet, blue), badge status berwarna, blok kode di halaman Docs berbaris rapi, dan sidebar mobile membuka dengan animasi pada lebar 375px. Tutup dev server setelahnya.

- [ ] **Step 11: Hapus perancah pra-pemecahan**

`client/src/test/garis-dasar-tampilan.json` dan `client/src/test/paritas-garis-dasar.test.tsx` **tetap**. Rekaman itu dibuat dari kode pra-pemecahan dan tetap menjadi nilai "sebelum" yang sah meski salinan bekunya tidak ada lagi.

Salinan beku sendiri dihapus: ia duplikat 33 KB dari kode yang tidak ada lagi di tempat lain, dan membiarkannya di `client/src/` mengundang orang mengimpornya dari aplikasi.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git rm -r client/src/__pra-pecah__ scripts/pindah-komponen.mjs
rmdir scripts 2>/dev/null || true
pnpm check
pnpm test 2>&1 | tail -10
```

Diharapkan: `Test Files  8 passed (8)`, `Tests  38 passed (38)` — tiga uji pra-pecah hilang bersama berkasnya, dan `paritas-garis-dasar.test.tsx` yang tersisa tetap hijau. Itu poin pentingnya: penjaganya tidak ikut mati.

- [ ] **Step 12: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add -A client/src scripts vitest.config.ts
git commit -m "refactor(app): tuntaskan pemecahan Home.tsx menjadi shell dan tujuh komponen votepriv"
```

**Deliverable:** `Home.tsx` tinggal shell (165–170 baris); ketujuh komponen §9.3 berdiri sendiri; ketiga bentuk `className` terbukti utuh lewat perbandingan yang diturunkan dari salinan beku, bukan dari angka yang diketik; 38 uji hijau dengan penjaga garis dasar yang bertahan setelah perancahnya dibuang.

---

## Selesai bila

- `client/src/components/votepriv/` memuat tujuh komponen sesuai spec §9.3: `Overview`, `LiveBallots`, `Results`, `Docs`, `BallotCard`, `VoteModal`, `CreateBallotModal`, ditambah tiga modul bersama `types.ts`, `ballot-status.ts`, `demo-data.ts`.
- `client/src/pages/Home.tsx` tinggal shell (165–170 baris) dan blok `export default function Home()` di dalamnya **byte-identik** dengan garis dasar setelah kedua atribut `connected={connected}` yang sengaja dibuang di Task 6 diterapkan pada sisi garis dasar. Gerbangnya adalah Task 8 Step 1, yang keluar dengan kode 0 — bukan `diff` mentah, yang dijamin keluar dengan kode 1 pada pekerjaan yang benar.
- `pnpm test` hijau dengan 38 uji: 19 uji `proof-server` yang sudah ada **tidak satu pun rusak**, ditambah smoke render, paritas garis dasar, dan uji unit per komponen.
- `client/src/test/paritas-garis-dasar.test.tsx` hijau — render `Home` hidup cocok pada kelas, garis besar DOM, **seluruh atribut selain `class`**, dan teks di ketiga belas permukaan yang namanya dikunci literal, serta pada keenam fixture panel privasi, terhadap rekaman yang dibuat dari kode pra-pemecahan.
- Ketiga bentuk `className` masih ada seluruhnya — 146 token statis unik, 12 template literal, dan 1 ternary di baris 390 — dibuktikan dengan perbandingan yang menurunkan kedua sisinya (salinan beku vs pohon hasil) di Task 8 Step 9, bukan dengan angka yang diketik.
- `useMemo` privasi masih di `Home.tsx`, utuh; `grep` **sempit** Task 8 Step 3 (`checkProofServer|ProofServerStatus|setProofStatus|targetTerverifikasi|const privacy = useMemo|privacy\.(tone|label|title)|privacy-mode|witness tidak pernah meninggalkan perangkat ini`) di `components/votepriv/` kosong. Pola lebar `proofStatus|privacy` TIDAK dipakai: ia cocok pada nama field `Receipt`, pada kelas CSS `privacy-callout`/`privacy-result`/`privacy-stat`, dan pada teks UI Inggris — enam baris yang seluruhnya sah.
- `CreateBallotModal` masih empat field; `grep` untuk `tallyDeadline|eligibleCount|quorumPercent|eligibilityPolicy` di seluruh klien kosong.
- `client/src/index.css` tidak tersentuh: `git diff <commit-awal> -- client/src/index.css` kosong.
- `pkgs/` tidak tersentuh: `git diff <commit-awal> -- pkgs/` kosong.
- Tidak ada teks UI berbahasa Inggris yang diterjemahkan.

## Risiko dan jalur mundur

| Risiko | Jalur mundur |
|---|---|
| Uji paritas merah setelah satu pemindahan | Jangan longgarkan ujinya. `git checkout -- client/src/pages/Home.tsx` lalu ulangi pemindahan dengan alat, bukan dengan editor. Pesan galat menyebutkan nama permukaan dan lapis mana yang berbeda |
| Uji paritas merah karena urutan token kelas saja | Tetap kegagalan yang sah: urutan hanya berubah kalau atribut `className` diketik ulang. Kembalikan markup ke bentuk potongan, jangan longgarkan uji |
| `pnpm test` melaporkan 19 uji lama merah | Environment jsdom bocor ke berkas `.ts`. Periksa `environmentMatchGlobs` hanya menyebut `*.test.tsx` dan `environment` global masih `"node"` |
| Galat transform JSX di berkas `.test.tsx` | `esbuild.jsx: "automatic"` tidak terpakai. Tambahkan `plugins: [react()]` dengan `@vitejs/plugin-react` yang sudah terpasang (Task 1 Step 8) |
| `scripts/pindah-komponen.mjs` melempar "tidak identik dengan garis dasar" | **Ini gerbang, bukan gangguan.** `Home.tsx` sudah tersunting di luar rencana. Periksa `git diff` sebelum memaksa apa pun — memaksakan pemindahan akan membatalkan suntingan itu tanpa jejak |
| Rekaman garis dasar tidak bisa dibuat ulang | Itu perilaku yang diinginkan. Rekaman dibuat sekali di Task 2 dari kode pra-pemecahan; membuatnya ulang dari kode yang sudah dipecah mengubahnya dari nilai "sebelum" menjadi cermin |
| Angka `toLocaleString()` berbeda antar mesin | Sudah diratakan menjadi `#` oleh `normalkanTeks()`. Kalau tetap berbeda, penyebabnya bukan locale — periksa data demonya |
| `location.host` berbeda sehingga fixture privasi merah | URL jsdom dipatok `http://localhost:3000/` di `vitest.config.ts`. Jangan mengubahnya |
| Tergoda menjalankan `pnpm format` | Jangan. `printWidth: 80` akan memecah empat baris JSX 2.000+ karakter dan mengubah diff pemecahan ini menjadi tulis-ulang total |
| Tergoda memindahkan `useMemo` privasi karena `Home.tsx` terasa masih gemuk | Jangan. Lihat Jebakan 1. Ia bergantung pada `proofStatus`, dirender hanya di sidebar, dan tidak punya komponen sasaran di §9.3 |

## Rencana berikutnya

**Rencana C-2 — integrasi nyata** (spec §9.2 dan §9.4). Dimulai dengan memindahkan `client/` ke `pkgs/app`, karena tanpa itu klien tidak bisa mengimpor `pkgs/shared` sama sekali (spec §14.7). Lalu: `PrivacyAdapter` dengan `MockAdapter` dan `MidnightAdapter` (§8), field credential di modal vote (§9.2 butir 2), empat field baru di `CreateBallotModal` (§9.2 butir 3), aksi "Buka suara Anda" di Results (§9.2 butir 4), block height asli (§9.2 butir 5), badge `Demo data` yang digerakkan adapter (§9.2 butir 6 dan §2.4), dan pembaruan teks halaman Docs (§9.2 butir 7).

Pada saat itu `client/src/test/garis-dasar-tampilan.json` akan menjadi merah, dan itu benar: perubahan tampilan di C-2 disengaja, dan rekaman garis dasarnya harus dibuat ulang secara sadar dengan satu commit yang menyatakan apa yang berubah — bukan diam-diam di tengah pemecahan struktural.

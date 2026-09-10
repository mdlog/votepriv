// `pnpm cli e2e` — uji end-to-end tiga pemilih di preview. Skrip tingkat-atas:
// TIDAK mengekspor apa pun, tidak boleh diimpor dari mana pun.
//
// LAMANYA: sekitar 100-110 menit, dan sebagian besarnya adalah MENUNGGU. Dua
// penantian tidak bisa dihindari: sampai voteDeadline lewat (60 menit sejak
// metadata disusun) dan sampai tallyDeadline lewat (95 menit sejak itu).
// Kontrak membandingkan deadline terhadap WAKTU BLOK jaringan, dan waktu blok
// jaringan publik tidak bisa dimajukan dari klien. Simulator bisa menyuntikkan
// waktu; preview tidak. Itulah tepatnya yang membuat uji ini bernilai.
//
// Fix Round 3: MENIT_VOTE/MENIT_TALLY naik +15 menit masing-masing (dari
// 45/80 ke 60/95) dibanding draf sebelumnya, supaya SISA_MINIMAL_VOTE bisa
// disetel >= biaya terburuk satu iterasi loop coblos PADA KOMPONEN
// PEMBACAAN indexer (835 detik) — lihat komentar lengkap di atas
// SISA_MINIMAL_VOTE untuk basis biaya per komponen, dan untuk kenapa
// castVote (proof+transaksi) sengaja TIDAK ditabelkan pada batas timeout-nya
// sendiri. Jendela pembukaan suara (MENIT_TALLY-MENIT_VOTE) tetap 35 menit
// persis seperti semula; hanya total run yang lebih panjang.
//
// SEPULUH ATAU SEBELAS TRANSAKSI, masing-masing dengan proof ZK sungguhan
// 5-20 detik plus finalisasi node dan indexer: deploy ballot, registerVoters,
// register ke registry, 3x castVote, 3x tallyVote, finalize — SEPULUH
// transaksi bila registry sudah tercatat di artefak dari sesi sebelumnya
// (bagian 1 memakai ulang, TIDAK men-deploy lagi), SEBELAS bila belum (bagian
// 1 turut men-deploy registry BARU). Pada urutan yang didokumentasikan di
// rencana ini — `deploy-registry` dijalankan lebih dulu — registry sudah ada,
// jadi run ini menandatangani SEPULUH. HAMPIR SETIAP await ke jaringan di
// bagian 1-11 (deploy, registerVoters, castVote, tallyVote, finalize, dan
// setiap pembacaan indexer lewat bacaLedgerBallot/temukanBallot/
// findDeployedContract) dibungkus denganBatasWaktu (BATAS_MS, tunggu.ts),
// jadi jeda panjang di sana berakhir dengan pesan dan bukan dengan diam tak
// berujung. PENGECUALIANNYA: jalur setup sesi — siapkanSesi -> bangunWallet
// -> WalletFacade.init/wallet.start (wallet.ts:255-271) dan siapkanSesi ->
// ringkasSaldo -> ambilStateSinkron (wallet.ts:311, definisi di :339) —
// adalah await jaringan TANPA pembungkus timeout. wallet.ts adalah kode
// Task 3 dan sengaja TIDAK disentuh di sini. Yang menjaganya dalam praktik
// BUKAN kode, melainkan urutan operasional: operator menjalankan
// `pnpm cli preview` lebih dulu, yang menghangatkan cache wallet sehingga
// saat e2e berjalan sinkronisasi ini selesai dalam ~1,4 detik (terukur,
// lihat pkgs/cli/logs/preview/2026-09-10T23:22:18.809Z.log:
// "detikSinkron":"1.4"), bukan sinkronisasi dingin dari genesis yang bisa
// menggantung lama.
//
// SATU PEMILIH SATU STORE. Private state VotePriv berbentuk
// Record<alamatBallot, ...>, bukan Record<pemilih, ...> — midnight-js membaca
// SATU blob di BallotPrivateStateId sebelum tiap pemanggilan dan menulis
// balik ke id yang sama, sehingga tiga pemilih pada SATU ballot di satu store
// akan saling menimpa. Setiap pemilih di sini mendapat direktori LevelDB
// sendiri. Itu sekaligus menghindari LEVEL_LOCKED, karena provider
// membuka-menutup seluruh LevelDB pada tiap operasi.
//
// SEMUANYA BERURUTAN, tidak pernah Promise.all: selain lock LevelDB,
// penyeimbangan unshielded tidak memindahkan UTXO ke pending, sehingga dua
// transaksi yang diseimbangkan sebelum yang pertama terlihat di chain bisa
// memilih UTXO yang sama.
//
// SELURUH TUBUH SKRIP (bagian 1-11) dibungkus try/catch (Fix Round 1, FIX 2):
// sebelum ini, hanya tiga blok ulangiSampai yang memanggil hentikanWallet
// pada kegagalan — setiap pastikan(), setiap timeout denganBatasWaktu, dan
// setiap assert kontrak yang lolos sampai ke sini akan berakhir sebagai
// unhandled rejection, dan simpanCacheWallet/wallet.stop() tidak pernah
// berjalan. Lihat komentar di atas hentikanWallet (bootstrap.ts): checkpoint
// yang tidak tersimpan berarti sesi BERIKUTNYA harus menyinkronkan ulang
// sepanjang durasi sesi ini — untuk uji ~90 menit, itu ~90 menit tersinkron
// yang terbuang percuma. catch di bawah menutup wallet dengan tertib pada
// SETIAP jalur kegagalan yang belum menanganinya sendiri, dan tetap
// melaporkan galat aslinya, bukan menelannya.
//
// try/catch DI ATAS itu membungkus bagian 1-11 SAJA — `siapkanSesi()`
// (bacaSeed/bangunWallet/buatKonteksProvider) berjalan lewat try/catch
// KEDUA yang terpisah, tepat sebelumnya (Fix Round 6, FIX C): sebelum sesi
// berhasil dibuat belum ada `ctx`/`log` untuk dipakai hentikanWallet, jadi
// cabang itu console.error + process.exit(1) tanpa menutup wallet apa pun
// (tidak ada yang perlu ditutup). Dengan dua try/catch berurutan ini,
// SETIAP await jaringan di seluruh berkas — bukan cuma bagian 1-11 —
// berakhir dengan pesan yang tertangkap, bukan unhandled rejection.
import crypto from "node:crypto";
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import { Ballot, emptyBallotPrivateState } from "contract";
import {
  buatCredential,
  daunEligibility,
  detikDariSekarang,
  detikSekarang,
  MENIT,
  type MetadataBallot,
} from "shared";
import { bacaArtefak, tulisArtefak } from "./artefak.ts";
import { hentikanWallet, type Sesi, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import {
  bacaLedgerBallot,
  catatKeRegistry,
  daftarkanVoter,
  deployBallot,
  deployRegistry,
  kunciAdmin,
  temukanBallot,
  temukanRegistry,
  type HasilDeployRegistry,
} from "./deploy.ts";
import { MENIT_TALLY, MENIT_VOTE } from "./jadwal.ts";
import type { BallotC } from "./kontrak.ts";
import { periksaFaseTerfinalisasi, periksaHasilTallyAkhir, periksaTallyKosongSelamaVoting } from "./periksa.ts";
import { rakitProvidersBallot, rakitProvidersRegistry, type ProvidersBallot } from "./providers.ts";
import {
  cobaSampaiWaktuBlokCocok,
  pastikan,
  POLA_BELUM_WAKTUNYA,
  ringkasTallies,
  tungguSampaiDetik,
  ulangiSampai,
} from "./tunggu.ts";
import { acak32, bukaSuara, finalisasi, pilih, siapkanPemilih, siapkanPembukaan } from "./vote.ts";

const PILIHAN = [0n, 2n, 0n] as const; // hasil yang diharapkan: opsi0=2, opsi1=0, opsi2=1
const JUMLAH_PEMILIH = PILIHAN.length;

// Lihat tabel anggaran waktu di rencana (Task 6 Step 5). Jangan menurunkan
// angka-angka ini tanpa menghitung ulang tabel itu — dan lihat komentar di
// atas SISA_MINIMAL_VOTE di bawah: sejak Fix Round 3, MENIT_VOTE/MENIT_TALLY
// dan kedua guard SISA_MINIMAL_* terikat satu invarian bersama, bukan lagi
// angka independen. MENIT_VOTE/MENIT_TALLY sendiri sekarang diimpor dari
// ./jadwal.ts (fix seam Task 6/7): sebelumnya berkas ini punya salinan
// sendiri yang diam-diam menyimpang dari salinan deploy-ballot.ts (45/80 di
// sana, 60/95 di sini) sejak commit e545d61 menaikkan angka DI SINI SAJA.
// Menyatukannya membuat penyimpangan itu tidak mungkin lagi terjadi.
/**
 * Cukup untuk SATU iterasi loop coblos: pembacaan eligibility path (dengan
 * retry, lihat bagian 5) + temukanBallot + castVote.
 *
 * INVARIAN: guard >= jumlah biaya terburuk satu iterasi, dihitung dari DUA
 * BASIS BIAYA yang dipakai SENGAJA — bukan satu basis seragam, dan bukan
 * alpa. (Fix Round 4 mengoreksi label "TERBURUK MUTLAK" yang dipakai Fix
 * Round 3 untuk invarian ini: label itu salah untuk castVote — lihat di
 * bawah — dan review menemukannya benar.)
 *
 *   - Komponen PEMBACAAN indexer (queryContractState, lewat temukanBallot
 *     maupun retry eligibility path) ditabelkan pada BATAS TIMEOUT-nya
 *     (BATAS_MS.temukan, BATAS_MS.bacaIndexer). Sengaja: keterlambatan
 *     indexer itu UMUM dan BISA PULIH — makin lama guard mengizinkan
 *     menunggu/mengulang, makin besar peluang membaca data yang akhirnya
 *     menyusul. Menghitung kasus ini pada batas timeout-nya melindungi run
 *     yang SUNGGUHAN masih bisa berhasil.
 *   - Komponen PROOF+TRANSAKSI (castVote) ditabelkan pada biaya TERUKUR
 *     (~2,5 menit di preview), BUKAN pada batas timeout-nya
 *     (BATAS_MS.panggilBerat, 900 detik/15 menit). Sengaja juga, dengan
 *     alasan berlawanan: mencapai batas TIMEOUT proof/transaksi berarti
 *     proof server atau node PATOLOGIS rusak — kegagalan yang TIDAK bisa
 *     dipulihkan dengan menunggu lebih lama, dan yang membuat SISA proses
 *     (pemilih-pemilih berikutnya, bahkan pra-loop bagian 1-4 yang juga
 *     berisi transaksi berproof) kemungkinan besar ikut gagal dengan
 *     caranya sendiri. Menabelkan SETIAP komponen berproof pada batas
 *     timeout-nya masing-masing (castVote 900 detik, plus deployBallot 900,
 *     daftarkanVoter 900, catatKeRegistry 600 di pra-loop) akan mendorong
 *     jendela ke ORDE JAM — bukan jadwal yang bisa dijalankan siapa pun,
 *     melainkan pengakuan bahwa timeout itu batas KATASTROFIK, bukan
 *     estimasi biaya. Guard yang disusun dari angka semacam itu tidak lagi
 *     melindungi apa pun: pada saat tercapai, run sudah hilang terlepas
 *     dari nilai guard.
 *
 * KOMPONEN yang dijumlahkan ke guard (basis di atas):
 *   - retry eligibility path (ulangiSampai, bagian 5, maks 6 x jeda 5 detik,
 *     tiap percobaan dibatasi BATAS_MS.bacaIndexer = 60 detik bila indexer
 *     benar-benar tidak menjawab): 6 x 60 + 5 x 5 = 385 detik
 *   - temukanBallot (batas timeout BATAS_MS.temukan)                : 300 detik
 *   - castVote (biaya TERUKUR, BUKAN batas timeout 900 detik
 *     BATAS_MS.panggilBerat — lihat basis di atas)                  : 150 detik
 *   TOTAL                                                            = 835 detik
 *
 * Bila castVote DIPAKSA memakai basis timeout yang sama seperti kedua baris
 * pembacaan (900, bukan 150), jumlahnya menjadi 385+300+900=1585 detik —
 * MELEBIHI guard 900 detik di bawah. Itu BUKAN celah yang perlu ditutup
 * dengan menaikkan guard (dan jendela) lagi: mengejar invarian itu berarti
 * mengejar invarian yang SALAH — lihat paragraf basis biaya di atas untuk
 * kenapa castVote memang tidak seharusnya dihitung pada basis itu di sini.
 *
 * DUA JALAN JUJUR dipertimbangkan (bukan mendokumentasikan celahnya) untuk
 * menutup kesenjangan RETRY (385 detik pada basis timeout, bukan biaya
 * ekspektasi ~30 detik yang dipakai Fix Round 1/2):
 *   (a) Persempit retry supaya batas terburuknya <= 540-300-150=90 detik
 *       (540 = guard sebelum Fix Round 3). DITOLAK: memerlukan timeout
 *       per-percobaan jauh lebih ketat daripada BATAS_MS.bacaIndexer KHUSUS
 *       pemanggilan ini — menduplikasi logika bacaLedgerBallot di sini,
 *       atau menambah parameter opsional ke fungsi bersama itu di
 *       deploy.ts (berkas Task 4/5 yang sudah diuji tuntas, 22 uji, risiko
 *       perubahan tidak sepadan). Lebih penting: retry yang diperketat
 *       SEKADAR SUPAYA ARITMETIKANYA MUAT, tapi terlalu pendek untuk
 *       menampung keterlambatan indexer sungguhan (alasan retry ini ada),
 *       akan mengubah kegagalan pathological langka menjadi kegagalan
 *       UMUM — lebih buruk daripada keadaan sekarang.
 *   (b) Besarkan jendela supaya guard bisa disetel >= 835 detik (jumlah
 *       KEDUA baris pembacaan pada basis timeout, PLUS castVote pada basis
 *       TERUKUR — basis timeout castVote tidak pernah jadi target invarian
 *       ini, lihat di atas). DIPILIH.
 *
 * MENIT_VOTE dinaikkan 45 -> 60 (+15 menit), dan MENIT_TALLY 80 -> 95
 * (+15 menit juga, MENJAGA jendela pembukaan suara MENIT_TALLY-MENIT_VOTE
 * tetap 35 menit persis seperti semula — lihat catatan di atas
 * SISA_MINIMAL_TALLY untuk pembuktian sisi itu tidak terganggu). Konsekuensi
 * pada run yang sudah ~85-95 menit: +15 menit menjadi ~100-110 menit —
 * dinyatakan eksplisit di komentar kepala berkas, bukan sesuatu yang
 * ditemukan sendiri oleh operator di tengah jalan.
 *
 * Guard disetel 900 detik: 835 dibulatkan ke atas + margin 65 detik (gaya
 * yang sama seperti Ronde 1: hitung komponen, bulatkan ke atas dengan
 * margin eksplisit, bukan angka bulat yang ditebak).
 *
 * VERIFIKASI jendela 60 menit (3600 detik) MUAT untuk komponen di atas
 * dirantai PENUH di ketiga iterasi berturut-turut (retry DAN temukanBallot
 * sama-sama pada basis timeout, castVote pada basis terukur):
 *   pra-loop (deployBallot 150 [terukur] + daftarkanVoter 150 [terukur] +
 *     temukanRegistry-opsional 300 [basis timeout, komponen pembacaan] +
 *     catatKeRegistry 150 [terukur])                     = 750 detik
 *   jendela = MENIT_VOTE x 60 = 60 x 60                  = 3600 detik
 *   iterasi ke-0: sisa 3600-750=2850 > 900 (margin 1950); konsumsi
 *     835 -> sisa 2015
 *   iterasi ke-1: sisa 2015 > 900 (margin 1115); konsumsi 835 -> sisa 1180
 *   iterasi ke-2: sisa 1180 > 900 (margin 280); konsumsi 835 -> sisa
 *     AKHIR 345 detik (~5,75 menit) — bahkan bila SEMUA TIGA pemilih
 *     sama-sama mengalami keterlambatan indexer pada batas timeout-nya.
 * Guard 900 >= 835 di SETIAP titik pemeriksaan, pada basis biaya yang
 * dinyatakan di atas — BUKAN pada seluruh kemungkinan kegagalan. Proof
 * server/node yang benar-benar patologis rusak tetap di luar cakupan guard
 * mana pun, karena tidak ada guard yang bisa menyelamatkan run dari itu
 * (lihat basis biaya PROOF+TRANSAKSI di atas).
 */
const SISA_MINIMAL_VOTE = 900;
/**
 * Cukup untuk satu tallyVote + seluruh anggaran ulang cobaSampaiWaktuBlokCocok.
 *
 * Fix Round 3 — diperiksa ulang setelah MENIT_VOTE/MENIT_TALLY naik (lihat
 * SISA_MINIMAL_VOTE): jendela bagian 8 (MENIT_TALLY - MENIT_VOTE) tetap
 * 35 menit PERSIS seperti semula (95-60=35, sama seperti 80-45=35
 * sebelumnya) — dipilih TIDAK membiarkan jendela ini menyempit, justru
 * MENIT_TALLY dinaikkan bersamaan dengan MENIT_VOTE untuk menjaganya.
 *
 * BERBEDA dari SISA_MINIMAL_VOTE pada SATU hal: retry loop di sini
 * (cobaSampaiWaktuBlokCocok, dipandu POLA_BELUM_WAKTUNYA) TIDAK punya
 * kerentanan yang sama. Pesan yang membuatnya mengulang adalah kegagalan
 * ASSERT LOKAL (dibuktikan Step 1: gagal saat eksekusi circuit, sebelum
 * proof, sebelum submitTx) — cepat, tanpa panggilan jaringan sungguhan.
 * Jeda-ulangnya karena itu TETAP ditabelkan pada biaya EKSPEKTASI (5 x 20
 * detik), bukan pada BATAS_MS apa pun — tidak ada BATAS_MS untuk dilewati,
 * jeda itu literal `setTimeout` di antara percobaan.
 *
 * TAPI (koreksi Fix Round 5 — review cabang penuh menemukan `bacaLedgerBallot`
 * di bagian 8 DILEWATKAN dari penerapan basis biaya yang sama dengan
 * SISA_MINIMAL_VOTE): baris `bacaLedgerBallot` tepat di bawah SEBELUM
 * `cobaSampaiWaktuBlokCocok` ADALAH pembacaan indexer — dipanggil TELANJANG,
 * TANPA ulangiSampai, dan `bacaLedgerBallot` sendiri membungkus queryContractState
 * dengan `denganBatasWaktu(..., BATAS_MS.bacaIndexer, ...)` (deploy.ts).
 * Basis yang dinyatakan Fix Round 4 (indexer dicoba pada batas timeout-nya,
 * proof+transaksi pada biaya terukur) karena itu WAJIB berlaku di sini juga:
 * pembacaan ini ditabelkan pada BATAS_MS.bacaIndexer (60 detik), BUKAN pada
 * biaya terukur khasnya (~12 detik) seperti draf sebelum perbaikan ini.
 *
 * Fix Round 6, FIX A — `bacaLedgerBallot` di atas kini DIULANG lewat
 * ulangiSampai (predikat: commitment path ditemukan), bukan lagi dibaca
 * TELANJANG seperti draf Fix Round 5. Kelas kegagalannya sama persis dengan
 * Fix Round 1 FIX 3 di bagian 5 (lihat komentar di sana): pembacaan indexer
 * telanjang di titik ini mempertaruhkan ENAM transaksi berbayar (deploy
 * ballot, registerVoters, register registry, 3x castVote) dan ~33 menit
 * penantian voteDeadline yang sudah dilalui pada SATU keterlambatan indexer
 * sesaat — dengan fase tally yang tersisa tidak akan pernah tercapai. AMAN
 * diulang dengan alasan serupa eligibility di bagian 5, lewat jalur yang
 * sedikit berbeda: `commitments` BUKAN HistoricMerkleTree (lihat komentar
 * kepala bagian 8: "checkRoot hanya menerima root saat ini") — tapi bagian 8
 * berjalan SETELAH voteDeadline lewat, jadi tidak ada castVote baru yang
 * bisa menambah daun ke pohon ini lagi selama loop bagian 8 berjalan; root
 * commitments sudah tetap pada titik ini. Mengulang di sini karena itu
 * hanya menunggu indexer MENYUSUL keadaan akhir yang sudah tetap, bukan
 * mengejar target yang terus bergerak. Anggaran DIBATASI ke 3 percobaan
 * (bukan default ulangiSampai 12x5 detik): pra-flight mengukur lag indexer
 * preview saat ini 14-17 detik, jadi 3 percobaan x jeda 5 detik sudah jauh
 * lebih dari cukup untuk lag NORMAL, dan tetap menampung dua siklus
 * BATAS_MS.bacaIndexer penuh (60 detik) untuk selamat dari satu "blink"
 * indexer yang jauh lebih buruk dari lag terukur.
 *
 * Komponen satu iterasi, pada basis yang benar (baris pembacaan BUKAN LAGI
 * 60 detik tunggal — sudah jadi retry 3x di atas):
 *   - retry commitment path (ulangiSampai, maks 3 x jeda 5 detik, tiap
 *     percobaan dibatasi BATAS_MS.bacaIndexer = 60 detik bila indexer
 *     benar-benar tidak menjawab): 3 x 60 + 2 x 5                    : 190 detik
 *   - jeda-ulang cobaSampaiWaktuBlokCocok (maks 6 PERCOBAAN — jeda hanya
 *     terjadi SETELAH percobaan yang gagal dan SEBELUM percobaan
 *     berikutnya, jadi 6 percobaan berarti PALING BANYAK 5 jeda: 5 x 20)  : 100 detik
 *   - tallyVote (biaya TERUKUR, bukan BATAS_MS.panggilBerat — alasan sama
 *     seperti castVote di SISA_MINIMAL_VOTE)                          : 150 detik
 *   TOTAL                                                              = 440 detik
 *
 * Guard LAMA (360, dari Fix Round 5) berada DI BAWAH 440 sejak retry ini
 * ditambahkan — WAJIB dihitung ulang di sini, bukan diam-diam diserap:
 * menambah retry tanpa menghitung ulang guard akan mengulangi PERSIS
 * kesalahan yang Fix Round 5 sendiri perbaiki (komponen baru yang lolos dari
 * basis biaya). Guard disetel ulang ke 500 detik: 440 dibulatkan ke atas +
 * margin 60 detik (gaya sama seperti SISA_MINIMAL_VOTE dan Fix Round 5:
 * hitung komponen pada basis yang dinyatakan, bulatkan ke atas dengan margin
 * eksplisit).
 *
 * VERIFIKASI ULANG pada level JENDELA (35 menit = 2100 detik, TIDAK
 * berubah), dirantai PENUH pada basis TERBURUK yang sama seperti komponen di
 * atas: buffer tungguSampaiDetik (~60 detik) dikonsumsi lebih dulu, sisa
 * 2100-60=2040 detik di awal loop.
 *   iterasi ke-0: sisa 2040 > 500 (margin 1540); konsumsi 440 -> sisa 1600
 *   iterasi ke-1: sisa 1600 > 500 (margin 1100); konsumsi 440 -> sisa 1160
 *   iterasi ke-2: sisa 1160 > 500 (margin 660); konsumsi 440 -> sisa
 *     AKHIR 720 detik (~12 menit).
 * Guard 500 AMAN: margin terketat (660 detik sebelum pemilih terakhir) jauh
 * di atas nol — jendela ini masih punya banyak selisih (slack) setelah
 * retry ditambahkan, persis seperti yang diharapkan dari anggaran pra-flight
 * (2040 detik slack terhadap guard lama 360; menambah ~130 detik pada guard
 * jauh dari cukup untuk menghabiskannya).
 */
const SISA_MINIMAL_TALLY = 500;

let sesi: Sesi;
try {
  sesi = await siapkanSesi();
} catch (e) {
  // Fix Round 6, FIX C: sebelumnya `siapkanSesi()` dipanggil DI ATAS try di
  // bawah — kegagalan bacaSeed/bangunWallet/buatKonteksProvider (await
  // jaringan, persis seperti isi try itu) jatuh sebagai unhandled rejection,
  // bertentangan dengan komentar kepala berkas yang mengklaim "SELURUH TUBUH
  // SKRIP dibungkus try/catch". Try/catch KEDUA ini menutup celah itu tanpa
  // menyentuh try/catch bagian 1-11: sebelum sesi berhasil dibuat belum ada
  // `ctx`/`log` yang bisa dipakai memanggil hentikanWallet (siapkanSesi
  // tidak mengekspos wallet parsial pada jalur galat) — memindahkan
  // panggilan ini ke DALAM try bagian 1-11 begitu saja akan membuat catch di
  // bawah menabrak `ctx`/`log` yang belum terisi, sebuah galat BARU yang
  // menimpa galat asli persis di dalam penanganannya sendiri. Jalan yang
  // tersisa di sini: console.error lalu process.exit(1) tanpa hentikanWallet
  // — tidak ada wallet yang berjalan untuk ditutup.
  const pesanGalat = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error(pesanGalat);
  process.exit(1);
}
const { config, log, ctx, kp } = sesi;

try {
  // ── 1. Registry ───────────────────────────────────────────────────────────
  //
  // Bila registry di-deploy pada proses INI, handle-nya dipakai ulang; bila ia
  // datang dari sesi sebelumnya, barulah temukanRegistry dipanggil. Membuang
  // handle deploy berarti satu watchForDeployTxData + tiga query indexer yang
  // percuma, di dalam jendela waktu yang sudah dihitung ketat.
  const providersRegistry = await rakitProvidersRegistry(kp, "admin");
  const alamatTersimpan = bacaArtefak(config.networkId)?.registry;

  let registryDeploy: HasilDeployRegistry | undefined;
  let alamatRegistry: string;
  if (alamatTersimpan === undefined) {
    registryDeploy = await deployRegistry(providersRegistry, log);
    alamatRegistry = registryDeploy.alamat;
  } else {
    alamatRegistry = alamatTersimpan;
  }
  tulisArtefak(config.networkId, { registry: alamatRegistry });
  log.info({ alamatRegistry, dariSesiIni: registryDeploy !== undefined }, "Registry siap");

  // ── 2. Ballot ─────────────────────────────────────────────────────────────
  const metadata: MetadataBallot = {
    title: "Uji E2E VotePriv",
    description: "Tiga pemilih, tiga opsi, di jaringan preview.",
    community: "Midnight Builders",
    options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
    voteDeadline: detikDariSekarang(MENIT_VOTE * MENIT), // DETIK, bukan milidetik
    tallyDeadline: detikDariSekarang(MENIT_TALLY * MENIT), // > voteDeadline
    quorumPercent: 60, // <= 100
    eligibleCount: JUMLAH_PEMILIH, // 1..1024
    eligibilityPolicy: "Tiga credential uji end-to-end",
  };

  const rahasiaAdmin = kunciAdmin(ctx); // JANGAN PERNAH di-log
  const credentials = Array.from({ length: JUMLAH_PEMILIH }, () => buatCredential());
  const salts = Array.from({ length: JUMLAH_PEMILIH }, () => acak32());

  const providersAdmin = await rakitProvidersBallot(kp, "admin");
  const { alamat: alamatBallot, kontrak: ballotAdmin } = await deployBallot(
    providersAdmin,
    metadata,
    rahasiaAdmin,
    crypto.getRandomValues(new Uint8Array(32)),
    log,
    JUMLAH_PEMILIH,
  );
  // Fix seam Task 6/7: DI BAWAH KUNCI `e2e`, bukan di top level. Top-level
  // ballot/voteDeadline/tallyDeadline/options/credentials adalah milik
  // `deploy-ballot.ts` SEPENUHNYA (lihat ArtefakDeploy di artefak.ts) — bila
  // e2e menulis ke sana, ballot yang deploy-ballot sudah bayar dan daftarkan
  // tiga pemilihnya tertimpa dan credential-nya (yang HANYA hidup di berkas
  // ini) hilang selamanya. e2e men-deploy ballotnya SENDIRI (baris di atas),
  // jadi ia mencatat hasilnya di namespace sendiri pula.
  tulisArtefak(config.networkId, {
    e2e: {
      ballot: alamatBallot,
      voteDeadline: metadata.voteDeadline.toString(),
      tallyDeadline: metadata.tallyDeadline.toString(),
      options: metadata.options,
      credentials: credentials.map((c) => Buffer.from(c).toString("hex")),
    },
  });

  // ── 3. Pendaftaran pemilih (harus SEBELUM suara pertama) ────────────────────
  //
  // `ballotAdmin` datang dari deployContract dan private state awalnya (kunci
  // admin) sudah tertulis. Tidak ada temukanBallot di sini.
  await daftarkanVoter(ballotAdmin, credentials.map(daunEligibility), log);

  // ── 4. Catat ke registry ──────────────────────────────────────────────────
  const registry = registryDeploy?.kontrak ?? (await temukanRegistry(providersRegistry, alamatRegistry));
  await catatKeRegistry(registry, alamatBallot, log);

  // ── 5. Tiga pemilih mencoblos: opsi 0, 2, 0 ──────────────────────────────
  const providersPemilih: ProvidersBallot[] = [];
  for (let i = 0; i < JUMLAH_PEMILIH; i++) {
    providersPemilih.push(await rakitProvidersBallot(kp, `pemilih-${i}`));
  }

  // Handle per pemilih disimpan dan dipakai ULANG di bagian 8. `callTx.*`
  // membaca ulang state publik dan private pada setiap pemanggilan, jadi handle
  // yang lama tidak pernah basi — dan tiga findDeployedContract yang tidak jadi
  // dijalankan adalah tiga kali lima menit anggaran yang kembali ke jendela.
  const kontrakPemilih: FoundContract<BallotC>[] = [];

  for (let i = 0; i < JUMLAH_PEMILIH; i++) {
    const label = `pemilih-${i}`;
    const sisaDetik = Number(metadata.voteDeadline - detikSekarang());
    pastikan(
      sisaDetik > SISA_MINIMAL_VOTE,
      `Anggaran waktu habis: tinggal ${sisaDetik} detik sampai voteDeadline, tidak cukup untuk castVote ${label} (butuh ${SISA_MINIMAL_VOTE} detik). Naikkan MENIT_VOTE dan jalankan ulang.`,
    );

    // Fix Round 1, FIX 3: sebelumnya bacaLedgerBallot telanjang di sini —
    // satu-satunya pembacaan indexer di seluruh berkas yang mengasersi
    // keadaan yang BARU SAJA ditulis (registerVoters, hanya dua transaksi di
    // belakang dan cuma catatKeRegistry sebagai jeda) tanpa lewat
    // ulangiSampai. Keterlambatan indexer di titik ini akan terbaca operator
    // sebagai "pendaftaran gagal" — persis kelas kegagalan palsu yang
    // ulangiSampai memang dibuat untuk dicegah. eligibility adalah
    // HistoricMerkleTree: begitu daunnya terdaftar, path-nya tetap valid
    // selamanya, jadi mengulang pembacaan sampai indexer menyusul aman.
    const {
      nilai: jalur,
      percobaan: percobaanJalur,
      galatTerakhir: galatJalur,
    } = await ulangiSampai(
      async () =>
        (await bacaLedgerBallot(kp.publicDataProvider, alamatBallot)).eligibility.findPathForLeaf(
          daunEligibility(credentials[i]),
        ),
      (j) => j !== undefined,
      log,
      `eligibility path ${label} (menunggu indexer menyusul registerVoters)`,
      6,
      5_000,
    );
    // Fix Round 2, FIX 4: `galatTerakhir` dari ulangiSampai TIDAK dibuang
    // seperti sebelumnya (pola yang sama seperti deploy-ballot.ts:142 —
    // surface galat asli, jangan telan). Dua penyebab "jalur tetap
    // undefined" berbeda maknanya: bila SETIAP pembacaan melempar (galatJalur
    // terisi), yang gagal adalah pembacaan indexer itu sendiri, bukan
    // pendaftarannya — pesan lama ("kemungkinan besar keterlambatan indexer")
    // akan menyesatkan operator ke arah yang salah bila penyebabnya justru
    // koneksi/indexer yang benar-benar tidak menjawab.
    pastikan(
      jalur !== undefined,
      galatJalur !== undefined
        ? `Daun eligibility ${label} tidak terbaca setelah ${percobaanJalur} percobaan — PEMBACAAN INDEXER ITU SENDIRI TERUS GAGAL: ${galatJalur}. Ini soal konektivitas/indexer, bukan (belum tentu) pendaftaran yang gagal — periksa status indexer dan txId registerVoters di log.`
        : `Daun eligibility ${label} tidak ditemukan setelah ${percobaanJalur} percobaan pembacaan indexer (seluruh pembacaan BERHASIL, daunnya saja belum tampak). Ini KEMUNGKINAN BESAR keterlambatan indexer menyusul registerVoters, BUKAN pendaftaran yang gagal — periksa txId registerVoters di log sebelum menyimpulkan pendaftaran benar-benar gagal.`,
    );

    // temukanBallot menimpa private state, jadi ia dipanggil SEBELUM
    // siapkanPemilih — bukan sesudah.
    const ballot = await temukanBallot(
      providersPemilih[i],
      alamatBallot,
      emptyBallotPrivateState(new Uint8Array(32)),
    );
    kontrakPemilih.push(ballot);
    await siapkanPemilih(providersPemilih[i], alamatBallot, credentials[i], PILIHAN[i], salts[i], jalur);
    await pilih(ballot, log, label);
  }

  // ── 6. PEMERIKSAAN TERPENTING DI SELURUH BERKAS INI ────────────────────────
  //
  // Selama pemungutan suara berlangsung, chain memegang nullifier dan commitment
  // dan TIDAK ADA hasil parsial yang bisa bocor — tidak kepada penyelenggara,
  // tidak kepada siapa pun yang membaca chain. Baris-baris di bawah adalah bentuk
  // yang bisa dieksekusi dari janji itu. Kalau salah satunya harus dilonggarkan
  // suatu hari, produknya yang berubah, bukan ujinya. Pemeriksaan sesungguhnya
  // ada di periksaTallyKosongSelamaVoting (periksa.ts) — diekstrak di sana
  // (Fix Round 1, FIX 5) supaya bisa diuji dengan ledger palsu, tanpa jaringan;
  // lihat periksa.test.ts untuk uji per-assert, termasuk assert keenam
  // (tallyNullifiers.isEmpty, FIX 4) yang tidak ada di draf sebelumnya.
  //
  // CAKUPAN BUKTI (Fix Round 1, FIX 6): blok ini membuktikan bahwa TIDAK ADA
  // tally parsial pernah muncul di chain selama voting berlangsung — itu
  // klaim privasi yang nyata dan berharga. Blok ini TIDAK membuktikan bahwa
  // pilihan seorang pemilih tak bisa dikaitkan dengan pemiliknya: uji ini
  // memakai SATU wallet untuk seluruh sepuluh atau sebelas transaksi (lihat
  // komentar kepala berkas), dan urutan indeks castVote/tallyVote yang
  // identik antar pemilih (pemilih-0..2, berurutan)
  // membuat korelasi indeks-ke-indeks memulihkan pasangan pemilih-opsi
  // dengan mudah. Itu desain sengaja untuk uji sintetis satu-operator ini —
  // BUKAN sesuatu yang dicoba dibuktikan atau disembunyikan di sini.
  //
  // PEMBACAAN DITENANGKAN LEBIH DULU. Indexer menyusul node beberapa detik;
  // membaca tepat setelah castVote ketiga bisa mengembalikan voteCount = 2 dan
  // membuat blok ini gagal dengan pesan yang berbunyi seperti kegagalan privasi
  // padahal hanya keterlambatan. voteCount === 3 dipakai sebagai syarat tenang
  // justru karena ia fakta yang paling belakangan tiba dari empat yang diperiksa.
  {
    const { nilai: lb, cocok, galatTerakhir, percobaan } = await ulangiSampai(
      () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
      (x) => x.voteCount === BigInt(JUMLAH_PEMILIH),
      log,
      `voteCount === ${JUMLAH_PEMILIH} (menunggu indexer menyusul castVote terakhir)`,
    );
    if (!cocok || lb === undefined) {
      log.error(
        { voteCount: lb?.voteCount.toString() ?? "(tidak terbaca)", galatTerakhir, percobaan },
        `voteCount tidak pernah mencapai ${JUMLAH_PEMILIH} setelah ${percobaan} pembacaan. Ini BUKAN pemeriksaan privasi yang gagal — indexer tidak pernah menampilkan ketiga suara. Periksa txId ketiga castVote di log.`,
      );
      await hentikanWallet(ctx, log);
      process.exit(1);
    }

    const tally = ringkasTallies([...lb.tallies], metadata.options.length);

    log.info(
      {
        voteCount: lb.voteCount.toString(),
        talliedCount: lb.talliedCount.toString(),
        tallyKosong: lb.tallies.isEmpty(),
        tally: tally.map(String),
        phase: lb.phase, // dicatat untuk diagnosis, TIDAK di-assert: lihat catatan di bawah
      },
      "Keadaan chain SELAMA pemungutan suara berlangsung",
    );

    periksaTallyKosongSelamaVoting(lb, JUMLAH_PEMILIH, metadata.options.length);

    // SENGAJA TIDAK ADA `pastikan(lb.phase === Ballot.BallotPhase.voting, ...)`
    // di sini, dan jangan menambahkannya. Per ballot.compact, phase hanya
    // berpindah keluar dari `voting` di dalam tallyVote atau finalize — dan
    // keduanya belum pernah dipanggil pada titik ini. Assert itu karena itu
    // tidak bisa gagal, tidak menguji apa pun tentang privasi, dan hanya
    // membuat blok ini terlihat lebih teliti daripada yang sebenarnya. phase
    // di-assert di tempat ia BISA membedakan: bagian 9 (tallying) dan
    // bagian 11 (finalized).
  }

  // ── 7. Menunggu voteDeadline benar-benar lewat ─────────────────────────────
  await tungguSampaiDetik(metadata.voteDeadline, log, "voteDeadline");

  // ── 8. Ketiga pemilih membuka suaranya ─────────────────────────────────────
  //
  // Path commitment dibangun dari state TERBARU tiap kali: `commitments` adalah
  // MerkleTree biasa, checkRoot hanya menerima root saat ini.
  //
  // Hanya siapkanPembukaan yang dipanggil — TIDAK siapkanPemilih. tallyVote
  // membaca get_my_option, get_my_salt, dan commitment_path saja; credential dan
  // eligibility path tidak pernah disentuhnya. Memanggil siapkanPemilih di sini
  // dengan `jalur` (yang adalah path COMMITMENT) akan menuliskannya ke
  // `eligibilityPaths` — lolos tsc karena kedua path bertipe sama, dan tidak
  // terlihat hanya karena tidak ada yang membacanya.
  for (let i = 0; i < JUMLAH_PEMILIH; i++) {
    const label = `pemilih-${i}`;

    // Penjaga anggaran, kembaran dari yang ada di loop coblos. tallyVote
    // menegakkan blockTimeLessThan(tallyDeadline), dan pesannya ("Batas waktu
    // pembukaan suara SUDAH lewat") sengaja tidak ada di POLA_BELUM_WAKTUNYA —
    // jadi melewati batas berarti run mati dengan dua dari tiga suara terbuka
    // dan bagian 9 tidak akan pernah tercapai.
    const sisaDetik = Number(metadata.tallyDeadline - detikSekarang());
    pastikan(
      sisaDetik > SISA_MINIMAL_TALLY,
      `Anggaran waktu habis: tinggal ${sisaDetik} detik sampai tallyDeadline, tidak cukup untuk tallyVote ${label} (butuh ${SISA_MINIMAL_TALLY} detik). Naikkan MENIT_TALLY dan jalankan ulang.`,
    );

    // Fix Round 6, FIX A: sebelumnya bacaLedgerBallot telanjang di sini —
    // sama persis kelas kegagalan yang Fix Round 1 FIX 3 tutup di bagian 5
    // (lihat komentar di sana dan di atas SISA_MINIMAL_TALLY untuk anggaran
    // retry serta kenapa `commitments` bukan HistoricMerkleTree tidak jadi
    // soal di sini, karena bagian 8 berjalan setelah voteDeadline lewat).
    const {
      nilai: jalur,
      percobaan: percobaanJalur,
      galatTerakhir: galatJalur,
    } = await ulangiSampai(
      async () =>
        (await bacaLedgerBallot(kp.publicDataProvider, alamatBallot)).commitments.findPathForLeaf(
          Ballot.pureCircuits.vote_commitment(PILIHAN[i], salts[i]),
        ),
      (j) => j !== undefined,
      log,
      `commitment path ${label} (menunggu indexer menyusul castVote)`,
      3,
      5_000,
    );
    // Sama seperti Fix Round 2 FIX 4 di bagian 5: `galatJalur` dibedakan dari
    // "path belum tampak" — dua penyebab berbeda maknanya bagi operator.
    pastikan(
      jalur !== undefined,
      galatJalur !== undefined
        ? `Commitment ${label} tidak terbaca setelah ${percobaanJalur} percobaan — PEMBACAAN INDEXER ITU SENDIRI TERUS GAGAL: ${galatJalur}. Ini soal konektivitas/indexer, bukan (belum tentu) commitment yang hilang — periksa status indexer dan txId castVote ${label} di log.`
        : `Commitment ${label} tidak ditemukan setelah ${percobaanJalur} percobaan pembacaan indexer (seluruh pembacaan BERHASIL, commitment-nya saja belum tampak). Ini KEMUNGKINAN BESAR keterlambatan indexer, BUKAN commitment yang hilang — periksa txId castVote ${label} di log sebelum menyimpulkan datanya benar-benar hilang.`,
    );

    await siapkanPembukaan(providersPemilih[i], alamatBallot, PILIHAN[i], salts[i], jalur);

    // Jam lokal boleh sudah lewat sementara waktu blok belum. Ulangi HANYA untuk
    // kegagalan itu — dan hanya sebanyak yang muat di anggaran (maks 6 percobaan,
    // paling banyak 5 jeda x 20 detik = 100 detik; lihat SISA_MINIMAL_TALLY).
    await cobaSampaiWaktuBlokCocok(
      () => bukaSuara(kontrakPemilih[i], log, label),
      log,
      POLA_BELUM_WAKTUNYA,
      6,
      20_000,
    );
  }

  // ── 9. Hasil akhir: 2 / 0 / 1 ───────────────────────────────────────────────
  {
    const { nilai: lb, cocok, galatTerakhir, percobaan } = await ulangiSampai(
      () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
      (x) => x.talliedCount === BigInt(JUMLAH_PEMILIH),
      log,
      `talliedCount === ${JUMLAH_PEMILIH} (menunggu indexer menyusul tallyVote terakhir)`,
    );
    if (!cocok || lb === undefined) {
      log.error(
        { talliedCount: lb?.talliedCount.toString() ?? "(tidak terbaca)", galatTerakhir, percobaan },
        `talliedCount tidak pernah mencapai ${JUMLAH_PEMILIH}. Periksa txId ketiga tallyVote di log terhadap indexer.`,
      );
      await hentikanWallet(ctx, log);
      process.exit(1);
    }

    // Dihitung dari PILIHAN, bukan literal terpisah: opsiDiharapkan[k] = berapa
    // pemilih yang PILIHAN-nya sama dengan k. Untuk PILIHAN = [0n, 2n, 0n] ini
    // menghasilkan [2n, 0n, 1n] — dua suara opsi0, nol opsi1, satu opsi2.
    const opsiDiharapkan = metadata.options.map((_, k) => BigInt(PILIHAN.filter((p) => p === BigInt(k)).length));

    // Fix Round 2, FIX 5: log DITENANGKAN lebih dulu, SEBELUM pemeriksaan —
    // sebelumnya baris ini ada SESUDAH periksaHasilTallyAkhir, jadi sebuah
    // run yang gagal pada pemeriksaan itu tidak pernah mencatat array tally
    // yang justru paling dibutuhkan untuk mendiagnosis kegagalannya.
    const tally = ringkasTallies([...lb.tallies], metadata.options.length);
    log.info(
      { tally: tally.map(String), talliedCount: lb.talliedCount.toString(), phase: lb.phase },
      "Hasil setelah seluruh suara dibuka",
    );

    periksaHasilTallyAkhir(lb, metadata.options.length, opsiDiharapkan, BigInt(JUMLAH_PEMILIH));
  }

  // ── 10. Menunggu tallyDeadline, lalu finalisasi ────────────────────────────
  await tungguSampaiDetik(metadata.tallyDeadline, log, "tallyDeadline");
  await cobaSampaiWaktuBlokCocok(() => finalisasi(ballotAdmin, log), log, POLA_BELUM_WAKTUNYA, 6, 20_000);

  // ── 11. Bukti akhir ─────────────────────────────────────────────────────────
  {
    const { nilai: lb, cocok, galatTerakhir } = await ulangiSampai(
      () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
      (x) => x.phase === Ballot.BallotPhase.finalized,
      log,
      "phase === finalized (menunggu indexer menyusul finalize)",
    );
    if (!cocok || lb === undefined) {
      log.error({ phase: lb?.phase, galatTerakhir }, "phase tidak pernah terbaca finalized dari indexer.");
      await hentikanWallet(ctx, log);
      process.exit(1);
    }

    periksaFaseTerfinalisasi(lb);
    const tally = ringkasTallies([...lb.tallies], metadata.options.length);
    log.info(
      { alamatBallot, alamatRegistry, tally: tally.map(String), phase: lb.phase },
      "UJI END-TO-END LULUS: tiga suara masuk, tally kosong selama pemungutan suara, hasil akhir 2-0-1, ballot difinalisasi",
    );
    // Fix Round 1, FIX 6: klaim eksplisit, bukan tersirat dari baris di atas.
    // Jumlah transaksi DIHITUNG dari `registryDeploy` (bagian 1), bukan
    // literal tetap: registry hanya di-deploy pada run ini bila belum
    // tercatat di artefak (lihat komentar kepala berkas) — sebelas bila
    // begitu, sepuluh bila registry dipakai ulang dari sesi sebelumnya.
    const jumlahTransaksi = registryDeploy !== undefined ? 11 : 10;
    log.info(
      `CAKUPAN BUKTI run ini: TERBUKTI — tidak ada tally parsial pernah muncul di chain selama pemungutan suara berlangsung. TIDAK TERBUKTI — bahwa pilihan seorang pemilih tak terkait dengan pemilih itu; satu wallet menandatangani seluruh ${jumlahTransaksi} transaksi run ini dengan urutan indeks pemilih yang identik di castVote maupun tallyVote, sehingga korelasi indeks-ke-indeks memulihkan pasangan pemilih-opsi.`,
    );
  }

  await tutupSesi(sesi, 0);
} catch (e) {
  // Fix Round 1, FIX 2: jaring pengaman generik. Ketiga blok ulangiSampai di
  // atas sudah menangani kegagalannya sendiri (log.error + hentikanWallet +
  // exit(1)) dan tidak pernah sampai ke sini. Semua jalur LAIN — setiap
  // pastikan() (termasuk kedua penjaga anggaran waktu), setiap timeout
  // denganBatasWaktu, dan setiap assert kontrak yang lolos sebagai galat JS —
  // sebelumnya jatuh sebagai unhandled rejection di sini dan TIDAK PERNAH
  // menutup wallet dengan tertib.
  // Fix Round 2, FIX 5: `(e as Error).message` MELEMPAR bila `e` sungguhan
  // `null`/`undefined` (mis. `throw null`) — cast TypeScript tidak mengubah
  // nilai runtime, jadi `.message` pada `null` adalah TypeError yang
  // menimpa galat asli persis di dalam penanganannya sendiri. `instanceof
  // Error` adalah pemeriksaan runtime yang aman untuk SEMUA nilai yang bisa
  // dilempar; `.stack` dipertahankan saat ada (sebelumnya selalu dibuang,
  // padahal ia memuat `.message` plus lokasi lemparan).
  const pesanGalat = e instanceof Error ? (e.stack ?? e.message) : String(e);
  log.error(
    { err: pesanGalat },
    "Uji end-to-end berhenti karena galat tak tertangani (lihat pesan di atas untuk detail). Menutup wallet dengan tertib — menyimpan checkpoint sinkronisasi — sebelum keluar.",
  );
  await hentikanWallet(ctx, log);
  process.exit(1);
}

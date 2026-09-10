// `pnpm cli doctor` — diagnosa turunan alamat dari frasa pemulihan.
//
// Kenapa ini ADA: seed.ts hanya bisa memakai SATU metode turunan per proses
// (default "pbkdf2" — lihat mnemonic.ts). Kalau wallet pengguna ternyata
// dicetak oleh build Lace lain (mis. beta Januari 2026 di issue #2133 yang
// memotong seed ke 32 byte, tidak pernah dirilis publik), `preprod`/`preview`
// akan tersambung ke alamat yang BENAR SECARA KRIPTOGRAFIS tapi SALAH SECARA
// PRAKTIS — saldo nol yang diam-diam salah alamat, bukan galat yang nyaring.
//
// `doctor` menurunkan KETIGA kandidat sekaligus, untuk KEDUA jaringan
// (preview dan preprod — murah, sama-sama hanya derivasi HD lokal, tidak ada
// sinkronisasi jaringan), dan mencetak HANYA alamatnya. Pengguna mencocokkan
// salah satu alamat di bawah dengan yang ditampilkan Lace, atau mengecek
// faucet/explorer — tanpa CLI ini pernah menyentuh penyimpanan ekstensi Lace
// (lihat progress.md: itu data wallet pribadi, sengaja tidak disentuh).
//
// KONTRAK KERAS: frasa pemulihan, byte seed, dan kunci privat TIDAK PERNAH
// dicetak, dicatat (tidak ada logger di sini sama sekali), atau muncul di
// pesan galat. Hanya alamat bech32 — data publik — yang boleh ke stdout.
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { createKeystore } from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { CARA_TURUNAN_DEFAULT, type CaraTurunan, seedDariMnemonic } from "./mnemonic.ts";
import { bacaFrasaPemulihan } from "./seed.ts";

const KANDIDAT: ReadonlyArray<{ cara: CaraTurunan; label: string }> = [
  { cara: "pbkdf2", label: "PBKDF2 64 byte penuh — default CLI ini, Lace 2.2.3 (kemungkinan besar benar)" },
  { cara: "pbkdf2-32", label: "PBKDF2 32 byte pertama — beta Lace Jan-2026, TIDAK PERNAH dirilis publik" },
  { cara: "entropy", label: "entropi BIP-39 mentah 32 byte" },
];

const JARINGAN: readonly string[] = ["preview", "preprod"];

/**
 * Menurunkan kunci HD NightExternal (account 0, index 0) dari byte seed, lalu
 * alamat bech32 untuk SETIAP `networkIds` yang diminta — DIEKSPOR supaya
 * jalur uji (mnemonic.test.ts, jangkar regresi wajib) memanggil PERSIS
 * fungsi yang dikirim `doctor`, bukan salinan tangan yang bisa diam-diam
 * menyimpang (fix round 1, I2).
 *
 * Urutan operasi SENGAJA: seluruh alamat dihitung DI DALAM blok `try`,
 * SEBELUM `hd.hdWallet.clear()` di `finally` — bukan setelah fungsi
 * mengembalikan kunci ke pemanggil (bug urutan yang ditemukan reviewer di
 * versi sebelumnya: `clear()` bisa saja, pada versi SDK lain, mengosongkan
 * buffer yang sama dengan yang direferensikan `kunci.key`, membuat alamat
 * yang dihitung SETELAH `clear()` berpotensi salah tanpa galat apa pun).
 *
 * PERINGATAN KERAS: `hd`/`hd.hdWallet` (hasil `HDWallet.fromSeed`) memuat
 * kunci privat MASTER sebagai field biasa yang bisa diserialisasi (mis.
 * `rootKey.xpriv`). JANGAN PERNAH mengirim `hd`/`hd.hdWallet` ke
 * `console.log`/logger/`JSON.stringify` — hanya alamat bech32 hasil akhir
 * (data publik) yang boleh keluar dari fungsi ini.
 */
export function alamatUntukSemuaJaringan(seed: Uint8Array, networkIds: readonly string[]): Record<string, string> {
  const hd = HDWallet.fromSeed(seed);
  if (hd.type !== "seedOk") {
    throw new Error("Gagal menginisialisasi HDWallet untuk metode turunan ini.");
  }
  try {
    const kunci = hd.hdWallet.selectAccount(0).selectRole(Roles.NightExternal).deriveKeyAt(0);
    if (kunci.type !== "keyDerived") {
      throw new Error("Gagal menurunkan kunci untuk metode turunan ini.");
    }
    const alamat: Record<string, string> = {};
    for (const networkId of networkIds) {
      alamat[networkId] = createKeystore(kunci.key, networkId).getBech32Address().toString();
    }
    return alamat;
  } finally {
    hd.hdWallet.clear();
  }
}

async function main(): Promise<void> {
  console.log("=== votepriv doctor — diagnosa turunan alamat dari frasa pemulihan ===");
  console.log("Frasa pemulihan TIDAK PERNAH ditampilkan atau dicatat.");
  console.log("Hanya alamat hasil turunan di bawah ini yang dicetak — data publik, aman dibagikan.\n");

  // Fix round 1, M5: hanya CEK KEBERADAAN env var (bukan nilainya) sebelum
  // membacanya lewat jalur yang sama — supaya pengguna diberi tahu bila
  // sumbernya env var yang mungkin basi dari sesi lain, tanpa membuka
  // isinya sama sekali.
  const dariEnv = Boolean(process.env.MIDNIGHT_WALLET_SEED);
  if (dariEnv) {
    console.log(
      "(Frasa dibaca dari variabel lingkungan MIDNIGHT_WALLET_SEED, bukan dari prompt — " +
        "pastikan nilainya masih yang Anda maksud, bukan sisa sesi sebelumnya.)\n",
    );
  }

  const frasa = await bacaFrasaPemulihan();

  const baris: string[] = [];
  let adaYangBerhasil = false;
  for (const { cara, label } of KANDIDAT) {
    let seed: Uint8Array;
    try {
      seed = seedDariMnemonic(frasa, cara);
    } catch (e) {
      baris.push(`[${cara}] GAGAL menurunkan seed — ${(e as Error).message}`);
      continue;
    }

    try {
      const alamat = alamatUntukSemuaJaringan(seed, JARINGAN);
      for (const networkId of JARINGAN) {
        baris.push(`[${cara}] ${networkId.padEnd(7)} ${alamat[networkId]}`);
      }
      baris.push(`          (${label})`);
      adaYangBerhasil = true;
    } catch (e) {
      baris.push(`[${cara}] GAGAL menurunkan kunci/alamat — ${(e as Error).message}`);
    }
  }

  console.log(baris.join("\n"));

  // Fix round 1, M3: jangan menyarankan "cocokkan alamat di atas" ketika
  // tidak ada satu pun alamat untuk dicocokkan, dan jangan keluar dengan
  // kode sukses ketika diagnosanya sendiri gagal total.
  if (!adaYangBerhasil) {
    console.error("\nSemua metode turunan gagal — tidak ada alamat untuk dicocokkan. Lihat pesan galat di atas.");
    process.exitCode = 1;
    return;
  }

  console.log(
    "\nCocokkan salah satu alamat di atas dengan yang ditampilkan Lace untuk wallet Anda, " +
      "atau periksa saldo lewat faucet/explorer jaringan terkait.\n" +
      "Metode yang cocok itulah yang harus dipakai lewat --seed-derivation=<metode> " +
      `saat menjalankan \`pnpm cli preprod\` / \`pnpm cli preview\` (default: ${CARA_TURUNAN_DEFAULT}).`,
  );
}

// Jalankan HANYA saat berkas ini dieksekusi langsung (`pnpm cli doctor`),
// BUKAN saat diimpor (mis. oleh mnemonic.test.ts untuk memakai
// `alamatUntukSemuaJaringan` — lihat fix round 1, I2). Tanpa penjaga ini,
// mengimpor modul ini dari uji akan langsung mencoba membaca stdin.
//
// Fix round 2: penjaga SEBELUMNYA membandingkan
// `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])`.
// `import.meta.url` yang diberikan Node SUDAH di-realpath (symlink
// diselesaikan), sedangkan `path.resolve(argv[1])` HANYA menormalkan jadi
// path absolut — tidak menyelesaikan symlink. Saat `doctor` dijalankan
// lewat direktori atau berkas yang di-symlink, kedua sisi berbeda,
// penjaga gagal cocok, `main()` TIDAK PERNAH berjalan, dan proses keluar
// dengan status 0 TANPA OUTPUT SAMA SEKALI — persis alat yang tugasnya
// mencegah pengguna memilih turunan yang salah malah diam-diam melaporkan
// "sukses" tanpa melakukan apa pun. Diverifikasi reviewer: exit=0, 0 byte
// output pada symlink direktori maupun symlink berkas.
//
// Diganti `import.meta.main` (Node >=20.11 tanpa flag, dites langsung di
// Node 22.23.1 lewat `--experimental-strip-types` pada .ts — lihat catatan
// verifikasi di task-3b-mnemonic-report.md, fix round 2): properti ini
// dihitung oleh loader modul Node sendiri berdasarkan APAKAH modul ini
// modul entri proses, bukan dengan membandingkan dua path yang dibangun
// secara berbeda — sehingga BENAR di kedua kasus symlink (dites: direktori
// symlink DAN berkas symlink, keduanya `true`), dan `false`/`undefined`
// (falsy, jadi tetap aman) saat berkas ini diimpor sebagai modul biasa
// (dites: `undefined` di bawah Vitest). Ini bukan cuma perbaikan bug
// symlink, tapi penghapusan seluruh kelas kerapuhan yang sama: TIDAK ADA
// lagi perbandingan path yang bisa diam-diam berbeda dari yang dimaksud.
if (import.meta.main) {
  await main();
}

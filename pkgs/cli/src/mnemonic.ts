// Turunan seed dari frasa pemulihan BIP-39 (24 kata).
//
// JAWABAN RISET (lihat progress.md, bagian "Riset derivasi mnemonic"): Lace
// 2.2.3 memakai seed BIP-39 PENUH 64 byte lewat PBKDF2, passphrase kosong,
// TANPA pemotongan — `bip39.mnemonicToSeedSync(mnemonic, "")` langsung ke
// `HDWallet.fromSeed`. Dibuktikan lewat pembedahan biner ekstensi Lace
// sungguhan (createBlockchainSpecificWalletData -> joinMnemonicWords ->
// pbkdf2Promise(o, i, 2048, 64, "sha512") dipanggil dengan SATU argumen),
// dan `grep -c 'subarray(0,32)\|slice(0,32)'` atas bundelnya mengembalikan 0.
//
// Dua kandidat lain ("pbkdf2-32": 32 byte pertama dari seed PBKDF2 yang sama;
// "entropy": entropi BIP-39 mentah 32 byte) TIDAK dipakai sebagai default —
// keduanya hanya ada untuk `doctor` (lihat doctor.ts), sebagai jaring
// pengaman bila wallet pengguna ternyata dicetak oleh build Lace lain
// (mis. beta Januari 2026 di issue #2133 yang memotong ke 32 byte, tidak
// pernah dirilis publik, TIDAK mengubah default ini).
import { mnemonicToEntropy, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export type CaraTurunan = "pbkdf2" | "pbkdf2-32" | "entropy";

export const CARA_TURUNAN_VALID: readonly CaraTurunan[] = ["pbkdf2", "pbkdf2-32", "entropy"];

/**
 * SATU-SATUNYA sumber kebenaran untuk default metode turunan. Sebelum fix
 * round 1 (M7), literal `"pbkdf2"` diketik ulang di empat tempat
 * (`seedDariMnemonic`, `validasiSeed`, `bacaSeed`, `caraTurunanDariArgv`) —
 * empat titik yang harus tetap sinkron secara manual supaya default yang
 * BENAR (jawaban settled oleh riset, lihat komentar di atas) tetap default.
 * Sekarang keempatnya mengimpor konstanta ini.
 */
export const CARA_TURUNAN_DEFAULT: CaraTurunan = "pbkdf2";

/**
 * Merapikan frasa pemulihan ke bentuk kanonik: lowercase, spasi tepi
 * dibuang, spasi ganda di tengah dirapatkan jadi satu. TIDAK melakukan
 * normalisasi Unicode manual apa pun di luar itu — `@scure/bip39`
 * menormalisasi NFKD secara internal, jadi memaksa transformasi tambahan di
 * sini justru berisiko mengubah maknanya.
 *
 * Galat di sini menyebut BENTUK, tidak pernah nilainya.
 */
export function normalisasiMnemonic(masukan: string): string {
  return masukan.trim().toLowerCase().split(/\s+/).join(" ");
}

/**
 * Menurunkan seed dari frasa pemulihan 24 kata.
 *
 * Jebakan API, supaya tidak terulang: `mnemonicToSeedSync(mnemonic,
 * passphrase?)` TIDAK menerima argumen wordlist — mengirimkannya diam-diam
 * diabaikan. `validateMnemonic` dan `mnemonicToEntropy` justru MEWAJIBKAN
 * wordlist.
 *
 * @param cara default `CARA_TURUNAN_DEFAULT` — satu-satunya yang dipakai
 *   jalur produksi (`bacaSeed`/`bangunWallet`). `"pbkdf2-32"` dan
 *   `"entropy"` HANYA untuk `doctor`.
 */
export function seedDariMnemonic(masukan: string, cara: CaraTurunan = CARA_TURUNAN_DEFAULT): Uint8Array {
  const frasa = normalisasiMnemonic(masukan);
  const jumlah = frasa === "" ? 0 : frasa.split(" ").length;
  if (jumlah !== 24) {
    throw new Error(`Frasa pemulihan harus 24 kata; diberikan ${jumlah} kata.`);
  }
  if (!validateMnemonic(frasa, wordlist)) {
    // Widened (fix round 1: M2) — validateMnemonic gagal untuk DUA sebab
    // yang berbeda dan kita tidak bisa (dan tidak boleh mencoba) membedakan
    // mana yang terjadi tanpa membuka kata per kata: (a) salah satu kata
    // tidak ada di wordlist BIP-39 (salah ketik), atau (b) semua kata valid
    // tapi checksum 4 bit terakhirnya tidak cocok. Pesan sempit "gagal
    // checksum" membuat pengguna dengan kasus (a) — jauh lebih umum, satu
    // salah ketik — mencari masalah yang salah.
    throw new Error(
      "Frasa pemulihan tidak valid: ada kata yang bukan bagian wordlist BIP-39 (kemungkinan salah ketik), " +
        "atau checksum 24 katanya tidak cocok.",
    );
  }

  // Lace: bip39.mnemonicToSeed(joinMnemonicWords(phrase)) — PBKDF2-HMAC-SHA512,
  // 2048 iterasi, salt "mnemonic", 64 byte, TANPA passphrase, TANPA pemotongan.
  const seed64 = mnemonicToSeedSync(frasa, "");
  if (cara === "pbkdf2") return seed64;
  if (cara === "pbkdf2-32") return seed64.subarray(0, 32); // hanya untuk `doctor`
  return mnemonicToEntropy(frasa, wordlist); // hanya untuk `doctor`
}

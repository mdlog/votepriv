import { CARA_TURUNAN_VALID, type CaraTurunan } from "./mnemonic.ts";

const FLAG = "--seed-derivation=";

/**
 * Membaca `--seed-derivation=pbkdf2|pbkdf2-32|entropy` dari argv, default
 * `"pbkdf2"` (lihat mnemonic.ts). Nilai flag ini BUKAN rahasia (hanya nama
 * metode), jadi boleh muncul apa adanya di pesan galat — berbeda dari seed
 * atau frasa pemulihan.
 */
export function caraTurunanDariArgv(argv: readonly string[] = process.argv.slice(2)): CaraTurunan {
  const flag = argv.find((a) => a.startsWith(FLAG));
  if (!flag) return "pbkdf2";

  const nilai = flag.slice(FLAG.length);
  if (!(CARA_TURUNAN_VALID as readonly string[]).includes(nilai)) {
    throw new Error(`--seed-derivation harus salah satu dari ${CARA_TURUNAN_VALID.join("|")}; diberikan "${nilai}".`);
  }
  return nilai as CaraTurunan;
}

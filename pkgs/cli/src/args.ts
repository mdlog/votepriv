import { CARA_TURUNAN_DEFAULT, CARA_TURUNAN_VALID, type CaraTurunan } from "./mnemonic.ts";

const FLAG_EXACT = "--seed-derivation";
const FLAG_EQ_PREFIX = "--seed-derivation=";

// Cocok dengan ejaan APA PUN yang menyerupai flag ini tapi bukan salah satu
// dari dua bentuk yang benar-benar didukung (`--seed-derivation=<metode>`
// atau `--seed-derivation <metode>`) — termasuk salah ketik umum seperti
// "--seed-derivations" (jamak, ekstra 's') atau "--seed-derivations=...".
// Dipakai untuk MENOLAK KERAS ejaan yang mirip tapi salah, alih-alih
// diam-diam mengabaikannya dan diam-diam jatuh ke default (fix round 1,
// I1) — itulah cacat yang sedang diperbaiki di sini, bukan strictness-nya.
const FLAG_MIRIP = /^--seed-derivations?(=|$)/;

function nilaiValid(nilai: string): nilai is CaraTurunan {
  return (CARA_TURUNAN_VALID as readonly string[]).includes(nilai);
}

/**
 * Fix round 1 (M1): pesan galat di sini TIDAK PERNAH mengutip nilai argv
 * mentah — hanya PANJANGnya. Komentar sebelumnya mengklaim "nilai flag ini
 * bukan rahasia" dan boleh dicetak apa adanya; itu keliru. Yang tidak
 * rahasia hanyalah nilai yang BENAR (nama metode pendek). Argv setelah flag
 * ini bisa saja diisi keliru oleh pengguna yang menyangka ini jalur untuk
 * memasukkan frasa pemulihan atau seed (mis. `--seed-derivation <kata
 * pertama frasa>`), dan pesan galat yang mengutipnya verbatim menjadi
 * permukaan kebocoran BARU — argv sudah terlihat lewat `ps`/riwayat shell,
 * tapi pesan galat ini bisa mendarat di berkas log yang di-redirect,
 * tempat argv mentah biasanya tidak ada.
 */
function galatNilaiTidakDikenal(panjangNilai: number): Error {
  return new Error(
    `--seed-derivation harus salah satu dari ${CARA_TURUNAN_VALID.join("|")}; ` +
      `nilai yang diberikan tidak dikenali (panjang ${panjangNilai} karakter).`,
  );
}

function galatBentukTidakDikenal(): Error {
  return new Error(
    "Argumen menyerupai --seed-derivation tapi bentuknya tidak dikenali. " +
      `Bentuk yang didukung: --seed-derivation=<metode> atau --seed-derivation <metode>, ` +
      `dengan <metode> salah satu dari ${CARA_TURUNAN_VALID.join("|")}.`,
  );
}

/**
 * Membaca metode turunan seed dari argv. Mendukung DUA bentuk yang setara:
 * `--seed-derivation=<metode>` DAN `--seed-derivation <metode>` (dipisah
 * spasi, ejaan yang lebih konvensional — dan sebelum fix round 1 (I1), diam-
 * diam diabaikan sepenuhnya, tepat untuk pengguna yang butuh `pbkdf2-32`,
 * satu-satunya alasan flag ini ada sama sekali). Default
 * `CARA_TURUNAN_DEFAULT` (lihat mnemonic.ts) bila flag tidak ada sama
 * sekali. Ejaan yang MIRIP flag ini tapi salah (typo, bentuk campuran)
 * SELALU ditolak keras, tidak pernah diam-diam diabaikan — lihat
 * `FLAG_MIRIP`.
 */
export function caraTurunanDariArgv(argv: readonly string[] = process.argv.slice(2)): CaraTurunan {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a.startsWith(FLAG_EQ_PREFIX)) {
      const nilai = a.slice(FLAG_EQ_PREFIX.length);
      if (!nilaiValid(nilai)) throw galatNilaiTidakDikenal(nilai.length);
      return nilai;
    }

    if (a === FLAG_EXACT) {
      const nilai = argv[i + 1];
      // Tidak ada argumen berikutnya, atau argumen berikutnya sendiri
      // terlihat seperti flag lain — jangan pernah menelannya sebagai nilai.
      if (nilai === undefined || nilai.startsWith("--") || !nilaiValid(nilai)) {
        throw galatNilaiTidakDikenal(nilai?.length ?? 0);
      }
      return nilai;
    }

    if (FLAG_MIRIP.test(a)) {
      throw galatBentukTidakDikenal();
    }
  }
  return CARA_TURUNAN_DEFAULT;
}

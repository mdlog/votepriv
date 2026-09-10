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
 * Fix round 2: dipakai saat flag ini diberikan LEBIH DARI SEKALI dengan
 * nilai yang berbeda-beda. Aman mengutip nilainya di sini (berbeda dari
 * `galatNilaiTidakDikenal`) — nilai-nilai ini SUDAH lolos `nilaiValid`,
 * jadi berasal dari himpunan `CARA_TURUNAN_VALID` yang tetap dan diketahui
 * publik (nama metode, bukan argv bebas), bukan isi sembarang yang bisa
 * saja rahasia.
 */
function galatKonflik(nilai: readonly CaraTurunan[]): Error {
  const unik = [...new Set(nilai)].join(" vs ");
  return new Error(`--seed-derivation diberikan lebih dari sekali dengan nilai yang berbeda (${unik}); tentukan satu.`);
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
 *
 * Fix round 2: fungsi ini dulu `return` PADA KECOCOKAN VALID PERTAMA —
 * artinya sisa argv setelahnya TIDAK PERNAH diperiksa. Itu membuat
 * penolakan near-miss (I1) BERGANTUNG URUTAN: sebuah near-miss yang duduk
 * SETELAH satu flag valid lolos sama sekali tanpa peringatan
 * (`--seed-derivation=pbkdf2 --seed-derivations=entropy` diam-diam
 * mengembalikan `pbkdf2`), dan flag yang diulang dengan nilai BERBEDA
 * diam-diam memenangkan kemunculan pertama tanpa galat
 * (`--seed-derivation=pbkdf2 --seed-derivation=entropy` diam-diam
 * mengembalikan `pbkdf2`) — dua bentuk dari cacat kelas yang SAMA dengan
 * I1: near-miss atau flag yang bertentangan diam-diam diabaikan. Sekarang
 * SELURUH argv dipindai lebih dulu: kecocokan valid dikumpulkan (bukan
 * langsung dikembalikan), near-miss DI MANA PUN posisinya tetap menolak
 * keras, dan baru di akhir — hanya bila TIDAK ADA near-miss dan TIDAK ADA
 * nilai tidak valid di mana pun — kumpulan nilai valid itu diperiksa: satu
 * nilai unik diterima, lebih dari satu nilai unik (bertentangan) ditolak
 * keras (`galatKonflik`). Flag yang sama diulang dengan nilai yang SAMA
 * PERSIS diterima dengan sengaja (tidak ambigu — tidak ada informasi yang
 * hilang dengan memilih salah satunya).
 */
export function caraTurunanDariArgv(argv: readonly string[] = process.argv.slice(2)): CaraTurunan {
  const ditemukan: CaraTurunan[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a.startsWith(FLAG_EQ_PREFIX)) {
      const nilai = a.slice(FLAG_EQ_PREFIX.length);
      if (!nilaiValid(nilai)) throw galatNilaiTidakDikenal(nilai.length);
      ditemukan.push(nilai);
      continue;
    }

    if (a === FLAG_EXACT) {
      const nilai = argv[i + 1];
      // Tidak ada argumen berikutnya, atau argumen berikutnya sendiri
      // terlihat seperti flag lain — jangan pernah menelannya sebagai nilai.
      if (nilai === undefined || nilai.startsWith("--") || !nilaiValid(nilai)) {
        throw galatNilaiTidakDikenal(nilai?.length ?? 0);
      }
      ditemukan.push(nilai);
      i++; // nilai sudah dikonsumsi sebagai pasangan flag ini; jangan dipindai ulang sebagai argv tersendiri.
      continue;
    }

    if (FLAG_MIRIP.test(a)) {
      throw galatBentukTidakDikenal();
    }
  }

  if (ditemukan.length === 0) return CARA_TURUNAN_DEFAULT;

  const unik = new Set(ditemukan);
  if (unik.size > 1) throw galatKonflik(ditemukan);
  return ditemukan[0];
}

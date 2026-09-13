import type { MetadataBallot } from "./votepriv-types.js";

/**
 * Kata (atau frasa, dipisah spasi) Bahasa Indonesia yang tidak mungkin muncul
 * di metadata ballot yang sudah benar berbahasa Inggris.
 *
 * SATU-SATUNYA daftar di seluruh repo: `client/src/test/audit-bahasa-ui.test.tsx`
 * (gerbang bahasa UI, audit #1/#2) dan `validasiBahasaMetadata` di bawah
 * (gerbang bahasa metadata rantai, audit #3) SAMA-SAMA mengimpor daftar ini
 * dari sini, supaya keduanya tidak bisa diam-diam menyimpang — kembaran
 * persis alasan MENIT_VOTE/MENIT_TALLY disatukan ke jadwal.ts (lihat commit
 * e545d61 dan komentar di pkgs/cli/src/jadwal.ts untuk apa yang terjadi
 * ketika dua salinan yang "harus sama" dibiarkan hidup terpisah).
 *
 * Daftar ini hidup di `pkgs/shared`, BUKAN di `client/` atau `pkgs/cli`:
 * `shared` tidak bergantung pada `pkgs/cli` sama sekali (lihat
 * pkgs/shared/package.json — hanya "contract"), jadi `client/` bisa
 * mengimpornya tanpa ikut menarik kode CLI (wallet, deploy, seed) ke
 * berkas ujinya; dan `pkgs/cli` sudah mengimpor `shared` untuk
 * `MetadataBallot`/`detikDariSekarang`/dst., jadi tidak ada ketergantungan
 * baru yang ditambahkan padanya.
 *
 * Lihat .superpowers/audit-bahasa-metadata.md untuk insiden yang memicu
 * berkas ini.
 */
export const KATA_TERLARANG: readonly string[] = [
  "yang", "dan", "atau", "tidak", "bukan", "belum", "sudah", "akan", "juga",
  "dengan", "untuk", "dari", "pada", "adalah", "dapat", "kembali",
  "perangkat", "mesin", "pemilih", "suara", "jaringan", "sebab", "kesalahan",
  "kegagalan", "keberhasilan", "pilihan", "disajikan", "dikirim",
  "terverifikasi", "terjangkau", "konfigurasi", "tersambung", "terhubung",
  "kredensial", "menunggu", "hilang", "silakan", "mohon", "peringatan",
  "menampilkan", "memilih", "coba lagi", "gagal", "berhasil",
];

/**
 * Dicocokkan dengan batas kata (`\b`), sama seperti POLA_INDONESIA
 * (audit-bahasa-ui.test.tsx) sebelum berkas ini ada: mencegah salah tangkap
 * substring kebetulan di kata Inggris (mis. "dari" adalah substring
 * "mandarin", tapi `\bdari\b` tidak cocok karena tidak ada batas kata sebelum
 * "d" di posisi itu). Frasa berspasi (mis. "coba lagi") memakai `\s+` supaya
 * spasi ganda/line-wrap tidak meloloskannya.
 */
const POLA_KATA_TERLARANG = new RegExp(
  `\\b(${KATA_TERLARANG.map((k) => k.replace(/ /g, "\\s+")).join("|")})\\b`,
  "i",
);

/**
 * Kata Indonesia terlarang PERTAMA yang ditemukan di `teks`, PERSIS seperti
 * kemunculannya di teks (case-insensitive saat mencocokkan, tapi bukan
 * dipaksa ke bentuk kanonik huruf kecil KATA_TERLARANG) — atau `undefined`
 * bila `teks` bersih.
 */
export function cariKataTerlarang(teks: string): string | undefined {
  return teks.match(POLA_KATA_TERLARANG)?.[0];
}

/**
 * Gerbang bahasa di batas rantai: menolak `MetadataBallot` yang salah satu
 * field TEKS-nya (`title`, `description`, `community`, setiap `options[i]`,
 * `eligibilityPolicy`) mengandung kata Indonesia dari `KATA_TERLARANG`.
 *
 * DIPANGGIL DI DALAM `deployBallot` (pkgs/cli/src/deploy.ts), tepat setelah
 * `validasiMetadata` dan SEBELUM args disusun untuk `deployContract` — titik
 * terakhir sebelum metadata SEALED selamanya di rantai. Insiden yang memicu
 * gerbang ini: `deploy-ballot.ts` dan `e2e.ts` menulis `description`/
 * `eligibilityPolicy` Indonesia ke ballot yang sudah ter-deploy dan TIDAK
 * BISA diperbaiki lagi (lihat .superpowers/audit-bahasa-metadata.md) — ini
 * penjaga untuk deploy BERIKUTNYA, bukan yang sudah terlanjur ada.
 *
 * Pesan galat menyebut FIELD dan KATA yang cocok, bukan cuma "metadata
 * mengandung Bahasa Indonesia": orang yang memperbaiki kegagalan ini butuh
 * tahu PERSIS field mana yang salah, bukan menebak di antara lima field.
 */
export function validasiBahasaMetadata(meta: MetadataBallot): void {
  const periksa = (field: string, teks: string): void => {
    const kata = cariKataTerlarang(teks);
    if (kata !== undefined) {
      throw new Error(
        `Metadata ballot field "${field}" mengandung kata Indonesia terlarang "${kata}": ${JSON.stringify(teks)}. ` +
          "Field ini masuk RANTAI dan SEALED selamanya setelah deploy — harus berbahasa Inggris " +
          "(lihat KATA_TERLARANG, pkgs/shared/src/bahasa-metadata.ts).",
      );
    }
  };
  periksa("title", meta.title);
  periksa("description", meta.description);
  periksa("community", meta.community);
  meta.options.forEach((opsi, i) => periksa(`options[${i}]`, opsi));
  periksa("eligibilityPolicy", meta.eligibilityPolicy);
}

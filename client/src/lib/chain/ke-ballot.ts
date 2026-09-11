import type { Ballot } from "@/components/votepriv/types";
import { keadaanHasil, statusTag, turunkanStatus } from "@/components/votepriv/ballot-status";
import { padatkanTallies } from "./dekode";
import type { BallotTerbaca, HasilRantai } from "./baca-rantai";

/**
 * Pemetaan tabel spec 9.4 menjadi tipe Ballot yang dipakai UI.
 *
 * Berkas ini TIDAK mengimpor WASM secara langsung — tapi `padatkanTallies` dari
 * ./dekode transitif menyeretnya, karena dekode.ts adalah satu-satunya modul
 * yang mengimpor onchain-runtime-v3 di tingkat MODUL (lihat komentar di
 * dekode.ts dan index.ts). Seluruh pemetaan di sini — termasuk keempat jebakan
 * — dapat diuji lewat data yang SUDAH didekode, tanpa memanggil ledger() apa pun.
 */

/**
 * Deadline SELALU diformat pada zona UTC, dan kata "UTC" ikut ditulis.
 *
 * Bukan kerapian: voteDeadline dan tallyDeadline adalah DETIK SEJAK EPOCH UTC
 * yang dibandingkan kontrak secara mentah lewat kernel.blockTimeLessThan().
 * Menampilkannya pada zona lokal pembaca menghasilkan tanggal yang tampak
 * berbeda dari yang ditegakkan kontrak, dan pada pergantian hari ia menggeser
 * TANGGAL — persis pada momen paling mahal, yaitu saat pemilih memutuskan
 * apakah masih sempat.
 *
 * `timeZone: "UTC"` WAJIB eksplisit di objek opsi ini. Uji unit di pohon ini
 * mematok TZ proses ke UTC (vitest.config.ts), jadi menghapus baris ini tidak
 * terlihat lewat format keluaran BIASA — lihat praperiksa P2 dan
 * ke-ballot.test.ts describe("formatDeadlineUtc — P2 …") untuk uji yang
 * MEMAKSA TZ proses ke zona lain sebelum memeriksa keluarannya, supaya
 * penghapusan opsi ini benar-benar terlihat merah.
 */
const FORMAT_DEADLINE = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDeadlineUtc(ms: number): string {
  return `${FORMAT_DEADLINE.format(new Date(ms))} UTC`;
}

/**
 * accent diturunkan dari alamat kontrak (spec 9.4), bukan diketik tangan.
 *
 * Jumlah sederhana atas seluruh nibble, bukan hash kriptografis: yang dibutuhkan
 * hanya penyebaran warna yang stabil per alamat, dan alamat yang sama harus
 * selalu memberi warna yang sama supaya kartu tidak berganti warna tiap muat.
 */
export function accentDariAlamat(alamat: string): "mint" | "violet" | "blue" {
  let jumlah = 0;
  for (let i = 0; i < alamat.length; i++) jumlah = (jumlah + alamat.charCodeAt(i)) % 3;
  return (["mint", "violet", "blue"] as const)[jumlah];
}

export function keBallot(
  b: BallotTerbaca,
  konteks: { nomor: number; sekarangMs: number },
): Ballot {
  const k = b.keadaan;
  // Ledger menyimpan deadline dalam DETIK; seluruh lapis di atas berbicara
  // dalam MILIDETIK karena Date dan Block.timestamp memakai milidetik.
  const voteDeadlineMs = k.voteDeadlineDetik * 1000;
  const tallyDeadlineMs = k.tallyDeadlineDetik * 1000;
  const status = turunkanStatus(
    { phase: k.phase, voteDeadlineMs, tallyDeadlineMs },
    konteks.sekarangMs,
  );
  // Map tallies JARANG: kunci tanpa suara TIDAK ADA. Dipadatkan sekali di sini
  // supaya tidak ada satu pun komponen yang tergoda mengindeksnya mentah-mentah.
  const padat = padatkanTallies(k.tallies, k.optionCount);
  // Keadaan hasil digantung pada STATUS TURUNAN, bukan pada talliedCount.
  // talliedCount === 0 punya EMPAT sebab yang berbeda artinya — lihat
  // KeadaanHasil di types.ts, dan ballot f597222d… yang hari ini berada di
  // salah satu sebab yang paling mudah salah dibaca.
  const hasil = keadaanHasil({ status, tallied: k.talliedCount });
  return {
    id: b.alamat,
    nomor: konteks.nomor,
    title: k.title,
    description: k.description,
    community: k.community,
    votes: k.voteCount,
    eligible: k.eligibleCount,
    registered: k.registeredCount,
    tallied: k.talliedCount,
    quorum: k.quorumPercent,
    eligibilityPolicy: k.eligibilityPolicy,
    deadline: formatDeadlineUtc(voteDeadlineMs),
    voteDeadlineMs,
    tallyDeadlineMs,
    phase: k.phase,
    status,
    options: k.opsi,
    // SELALU larik padat sepanjang options — tidak pernah null. Yang membedakan
    // "tersegel" dari "final tanpa satu pun dibuka" adalah keadaanHasil, bukan
    // bentuk larik ini.
    tallies: padat,
    keadaanHasil: hasil,
    accent: accentDariAlamat(b.alamat),
    tag: statusTag(status),
    deployHeight: b.deployHeight,
  };
}

/**
 * Mengubah seluruh hasil pembacaan menjadi daftar Ballot.
 *
 * URUTAN TAMPILAN mengikuti registry.ballots apa adanya — pushFront, jadi
 * terbaru di depan. NOMOR URUT diturunkan terpisah dari tinggi blok
 * ContractDeploy, urut naik. Keduanya sengaja tidak sama:
 *
 *   urutan tampil  = yang paling relevan lebih dulu
 *   nomor urut     = pengenal yang tidak berubah arti saat ada pendaftaran baru
 *
 * Menyatukan keduanya adalah persis kesalahan yang J2 tutup: menomori dari
 * indeks registry akan MENOMORI ULANG ballot lama setiap ada ballot baru.
 *
 * deployHeight = 0 berarti ContractDeploy tidak terbaca (entri registry yang
 * bukan ballot sungguhan). Ia ditaruh di BELAKANG, bukan di depan, supaya
 * anomali tidak mengambil nomor 001. Diuji lewat data SINTETIS di
 * ke-ballot.test.ts — lihat praperiksa P5; fixture rekaman tidak pernah
 * punya deployHeight 0.
 */
export function keDaftarBallot(hasil: HasilRantai): Ballot[] {
  const urutDeploy = [...hasil.ballot].sort((a, b) => {
    if (a.deployHeight === 0 && b.deployHeight === 0) return a.alamat.localeCompare(b.alamat);
    if (a.deployHeight === 0) return 1;
    if (b.deployHeight === 0) return -1;
    if (a.deployHeight !== b.deployHeight) return a.deployHeight - b.deployHeight;
    // Dua deploy pada blok yang sama: alamat sebagai pemutus, supaya nomornya
    // tetap sama antar muat.
    return a.alamat.localeCompare(b.alamat);
  });
  const nomorUntuk = new Map(urutDeploy.map((b, i) => [b.alamat, i + 1]));
  return hasil.ballot.map(b =>
    keBallot(b, { nomor: nomorUntuk.get(b.alamat) ?? 0, sekarangMs: hasil.sekarangMs }),
  );
}

/** Teks nomor urut untuk ditampilkan. Tidak pernah dipakai sebagai pengenal. */
export function labelNomor(nomor: number): string {
  return `Ballot ${String(nomor).padStart(3, "0")}`;
}

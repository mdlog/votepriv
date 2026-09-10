import { createInterface, type Interface } from "node:readline/promises";
import { CARA_TURUNAN_DEFAULT, type CaraTurunan, normalisasiMnemonic, seedDariMnemonic } from "./mnemonic.ts";

/**
 * Baca seluruh stdin sampai EOF, apa adanya.
 *
 * Sengaja tidak memakai `rl.question()` untuk jalur ini: `question()` menunggu
 * event 'line', yang hanya terpicu oleh newline. Input yang dipipa tanpa newline
 * di akhir (mis. `printf '%s' "$SEED" | pnpm cli preprod`, pola umum saat seed
 * datang dari berkas atau secret manager) membuatnya menggantung selamanya —
 * diverifikasi lewat pengujian langsung. Membaca stream mentah sampai 'end'
 * selesai pada EOF, dengan atau tanpa newline.
 */
async function bacaSemuaStdin(): Promise<string> {
  const potongan: Buffer[] = [];
  for await (const potong of process.stdin) {
    potongan.push(typeof potong === "string" ? Buffer.from(potong) : (potong as Buffer));
  }
  return Buffer.concat(potongan).toString("utf8");
}

/**
 * Bentuk masukan: frasa pemulihan BIP-39 (>1 token setelah dipisah spasi)
 * atau seed hex mentah (satu token). Deteksi HANYA berdasarkan bentuk,
 * tidak pernah membuka atau mencatat isinya.
 */
type BentukSeed = "mnemonic" | "hex";

function deteksiBentukSeed(masukan: string): BentukSeed {
  const token = masukan.trim().split(/\s+/).filter(Boolean);
  return token.length > 1 ? "mnemonic" : "hex";
}

/**
 * Seed wallet tidak boleh muncul di repo, log, maupun pesan galat.
 * Karena itu galat di sini menyebut BENTUK yang salah, tidak pernah nilainya.
 *
 * Jalur ini HANYA untuk seed hex mentah (32 byte, dipakai CLI rujukan dan
 * genesis seed standalone) — frasa pemulihan 24 kata tidak pernah mencapai
 * fungsi ini, lihat `validasiSeed`.
 */
export function validasiSeedHex(masukan: string): string {
  const seed = masukan.trim().toLowerCase();
  if (seed.length !== 64) {
    throw new Error(`Seed harus 64 karakter heksadesimal; yang diberikan ${seed.length} karakter.`);
  }
  if (!/^[0-9a-f]{64}$/.test(seed)) {
    throw new Error("Seed harus berupa heksadesimal (0-9, a-f) saja.");
  }
  return seed;
}

/**
 * Menerima DUA bentuk masukan: seed hex 64 karakter (32 byte, rujukan lama)
 * ATAU frasa pemulihan BIP-39 24 kata (kasus nyata pengguna — lihat
 * progress.md, "Masukan pengguna: frasa 24 kata, bukan seed hex"). Bentuk
 * dideteksi lewat jumlah token, lalu masing-masing divalidasi dengan
 * aturannya sendiri — frasa TIDAK PERNAH melewati validator hex 64-karakter
 * (yang akan menolaknya dengan pesan yang menyesatkan), dan seed hex TIDAK
 * PERNAH melewati validator BIP-39.
 *
 * Mengembalikan byte seed siap pakai untuk `HDWallet.fromSeed` — bukan
 * string — supaya pemanggil tidak perlu tahu bentuk aslinya.
 */
export function validasiSeed(masukan: string, cara: CaraTurunan = CARA_TURUNAN_DEFAULT): Uint8Array {
  if (deteksiBentukSeed(masukan) === "mnemonic") {
    return seedDariMnemonic(masukan, cara);
  }
  const hex = validasiSeedHex(masukan);
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

/**
 * readline tidak punya opsi bawaan "sembunyikan input". Pengait yang tampak paling
 * jelas — metode privat `_writeToOutput` — TERBUKTI TIDAK CUKUP saat diuji lewat
 * pty sungguhan: sebagian jalur render internal readline menulis ke `output`
 * lewat pemanggilan lain dan melewati override instance itu, sehingga seed tetap
 * bocor sebagian ke layar. Yang terbukti benar-benar menekan SELURUH gema, pada
 * Node 22.23.1, adalah membungkam method `write` milik stream `output` itu
 * sendiri untuk durasi pertanyaan — satu-satunya titik yang wajib dilalui semua
 * jalur penulisan, apa pun jalur internal readline yang dipakai. Prompt ditulis
 * sendiri SEBELUM dibungkam supaya pengguna tetap melihat instruksinya.
 *
 * Raw mode TIDAK disentuh di sini secara eksplisit: `readline.createInterface`
 * pada TTY sungguhan sudah mengaktifkannya sendiri (dan mengembalikannya saat
 * `rl.close()`), diverifikasi lewat pengujian pty — draf awal fungsi ini malah
 * memaksa `setRawMode(false)` (mode kooked), yang membuat driver terminal
 * sendiri ikut menggemakan tiap karakter. Itu sebabnya draf awal bocor dua kali.
 */
async function tanyaTanpaGema(rl: Interface, teksPrompt: string): Promise<string> {
  process.stdout.write(teksPrompt);

  const target = rl as unknown as { output: NodeJS.WritableStream };
  const tulisAsli = target.output.write.bind(target.output);
  target.output.write = (() => true) as typeof target.output.write;

  try {
    return await rl.question("");
  } finally {
    target.output.write = tulisAsli;
  }
}

/**
 * Membaca rahasia mentah: dari env var `MIDNIGHT_WALLET_SEED` bila ada,
 * kalau tidak lewat prompt interaktif tanpa gema (atau, tanpa TTY, dari
 * stdin mentah sampai EOF). TIDAK memvalidasi atau menginterpretasikan
 * bentuknya — itu tanggung jawab pemanggil (`bacaSeed` atau
 * `bacaFrasaPemulihan`), supaya jalur pembacaan-rahasia yang terbukti aman
 * ini tetap satu-satunya dan tidak diduplikasi.
 */
async function bacaInputRahasia(promptInteraktif: string, promptNonInteraktif: string): Promise<string> {
  const dariEnv = process.env.MIDNIGHT_WALLET_SEED;
  if (dariEnv) return dariEnv;

  const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
  const adaTty = Boolean(stdin.isTTY);

  if (!adaTty) {
    // Tidak ada terminal untuk digemakan dan tidak ada 'line' yang dijamin
    // datang; baca stream mentah sampai EOF (lihat catatan di bacaSemuaStdin).
    process.stdout.write(promptNonInteraktif);
    const jawaban = await bacaSemuaStdin();
    process.stdout.write("\n");
    return jawaban;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    const jawaban = await tanyaTanpaGema(rl, promptInteraktif);
    process.stdout.write("\n");
    return jawaban;
  } finally {
    rl.close();
  }
}

/**
 * Dari env bila ada, kalau tidak diminta interaktif tanpa gema di layar.
 * Menerima seed hex 64 karakter ATAU frasa pemulihan 24 kata (lihat
 * `validasiSeed`). `cara` memilih metode turunan bila masukannya frasa;
 * diabaikan bila masukannya seed hex.
 */
export async function bacaSeed(cara: CaraTurunan = CARA_TURUNAN_DEFAULT): Promise<Uint8Array> {
  const masukan = await bacaInputRahasia(
    "Seed wallet (64 hex atau frasa pemulihan 24 kata, tidak akan ditampilkan): ",
    "Seed wallet (64 hex atau frasa pemulihan 24 kata, dibaca dari input non-interaktif): ",
  );
  return validasiSeed(masukan, cara);
}

/**
 * Untuk `doctor` (lihat doctor.ts): selalu baca sebagai frasa pemulihan,
 * bukan seed hex — `doctor` butuh frasa mentah untuk mencoba ketiga metode
 * turunan sekaligus, bukan satu seed yang sudah diturunkan. Memakai jalur
 * baca-tanpa-gema yang sama persis dengan `bacaSeed`. Mengembalikan frasa
 * ternormalisasi (bukan seed) — pemanggil bertanggung jawab tidak pernah
 * mencetak atau mencatatnya.
 */
export async function bacaFrasaPemulihan(): Promise<string> {
  const masukan = await bacaInputRahasia(
    "Frasa pemulihan wallet (24 kata, tidak akan ditampilkan): ",
    "Frasa pemulihan wallet (24 kata, dibaca dari input non-interaktif): ",
  );
  return normalisasiMnemonic(masukan);
}

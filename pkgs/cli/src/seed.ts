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
    throw new Error(`The seed must be 64 hexadecimal characters; got ${seed.length}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(seed)) {
    throw new Error("The seed must be hexadecimal (0-9, a-f) only.");
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
  // Masukan kosong punya pesannya sendiri. Tanpa ini ia jatuh ke validator hex
  // dan berbunyi "Seed harus 64 karakter heksadesimal; yang diberikan 0
  // karakter" — benar secara harfiah, tapi menyesatkan: ia terdengar seperti
  // frasa pemulihan tidak diterima, padahal yang terjadi adalah Enter ditekan
  // sebelum ada yang diketik. Itu mudah terjadi justru karena prompt-nya
  // sengaja tidak menampilkan apa pun.
  if (masukan.trim() === "") {
    throw new Error(
      "No input received — Enter was pressed before anything was typed. " +
        "This prompt deliberately shows nothing while you type; that is intentional, not a hang. " +
        "Run it again, then type or paste the 64-character hex seed or the 24-word recovery phrase before pressing Enter.",
    );
  }
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
  // Petunjuk SEBELUM prompt. Tanpa ini, prompt tanpa gema tidak dapat dibedakan
  // dari proses yang menggantung: tidak ada kursor bergerak, tidak ada bintang,
  // tidak ada apa pun. Diamati pada pemakaian nyata — operator menekan Enter
  // untuk memastikan prosesnya hidup, lalu mendapat "0 karakter". Pengujian pty
  // memastikan bahwa mengetik, menempel, menempel ber-bracketed-paste, dan
  // mengetik lambat SEMUANYA tertangkap benar; satu-satunya yang menghasilkan
  // nol karakter adalah Enter tanpa masukan. Jadi yang kurang bukan penangkapan
  // input, melainkan kabar kepada manusia bahwa ia sedang bekerja.
  process.stdout.write("  (your typing is deliberately not echoed — type or paste, then press Enter)\n");
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
 * Mengabarkan BENTUK masukan yang diterima, tidak pernah isinya.
 *
 * Ini satu-satunya umpan balik yang didapat operator setelah mengetik ke dalam
 * kegelapan, dan ia sengaja dibatasi pada apa yang sudah tersirat dari prompt:
 * jumlah kata, atau panjang untuk masukan satu token. Jangan pernah menambahkan
 * potongan isi, awalan, maupun akhiran ke sini.
 */
function ringkasBentukMasukan(masukan: string): string {
  const token = masukan.trim().split(/\s+/).filter(Boolean);
  if (token.length === 0) return "empty";
  if (token.length === 1) return `one token, ${token[0].length} characters`;
  return `${token.length} words`;
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
    process.stdout.write(`\n  (diterima: ${ringkasBentukMasukan(jawaban)})\n`);
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
    "Wallet seed (64 hex or 24-word recovery phrase; input is hidden): ",
    "Wallet seed (64 hex or 24-word recovery phrase, read from non-interactive input): ",
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
    "Wallet recovery phrase (24 words; input is hidden): ",
    "Wallet recovery phrase (24 words, read from non-interactive input): ",
  );
  return normalisasiMnemonic(masukan);
}

import { createInterface, type Interface } from "node:readline/promises";

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
 * Seed wallet tidak boleh muncul di repo, log, maupun pesan galat.
 * Karena itu galat di sini menyebut BENTUK yang salah, tidak pernah nilainya.
 */
export function validasiSeed(masukan: string): string {
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

/** Dari env bila ada, kalau tidak diminta interaktif tanpa gema di layar. */
export async function bacaSeed(): Promise<string> {
  const dariEnv = process.env.MIDNIGHT_WALLET_SEED;
  if (dariEnv) return validasiSeed(dariEnv);

  const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
  const adaTty = Boolean(stdin.isTTY);

  if (!adaTty) {
    // Tidak ada terminal untuk digemakan dan tidak ada 'line' yang dijamin
    // datang; baca stream mentah sampai EOF (lihat catatan di bacaSemuaStdin).
    process.stdout.write("Seed wallet (64 hex, dibaca dari input non-interaktif): ");
    const jawaban = await bacaSemuaStdin();
    process.stdout.write("\n");
    return validasiSeed(jawaban);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    const jawaban = await tanyaTanpaGema(rl, "Seed wallet (64 hex, tidak akan ditampilkan): ");
    process.stdout.write("\n");
    return validasiSeed(jawaban);
  } finally {
    rl.close();
  }
}

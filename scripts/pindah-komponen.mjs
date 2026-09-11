#!/usr/bin/env node
/**
 * Memindahkan satu blok fungsi tingkat-atas dari Home.tsx ke berkas komponen baru.
 *
 * MENGAPA ALAT, BUKAN TANGAN. Empat baris JSX di berkas ini panjangnya 2.222,
 * 2.479, 2.267, dan 2.979 karakter. Memformat ulang saat memindahkan nyaris tak
 * terhindarkan kalau dikerjakan dengan editor, dan satu spasi yang hilang di
 * dalam template literal seperti `ballot-card accent-${ballot.accent}` akan
 * menghasilkan kelas `ballot-cardaccent-mint`: tidak ada di CSS, tidak
 * menggagalkan build, tidak menggagalkan typecheck, hanya kartu yang kehilangan
 * warnanya. Alat ini memotong bita, bukan mengetik ulang.
 *
 * MENGAPA MEMOTONG DARI BERKAS BEKU. Nomor baris di Home.tsx bergeser setiap
 * kali satu blok diangkat. Nomor baris di client/src/__pra-pecah__/HomePraPecah.tsx
 * tidak pernah bergeser, sehingga angka di rencana tetap sah sampai task terakhir.
 *
 * Pemakaian:
 *   node scripts/pindah-komponen.mjs <Nama> <dari> <sampai> <tujuan.tsx> <kepala.txt>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

const BEKU = "client/src/__pra-pecah__/HomePraPecah.tsx";
const HOME = "client/src/pages/Home.tsx";

const [nama, dariArg, sampaiArg, tujuan, kepalaPath] = process.argv.slice(2);
if (!nama || !dariArg || !sampaiArg || !tujuan || !kepalaPath) {
  console.error("pakai: node scripts/pindah-komponen.mjs <Nama> <dari> <sampai> <tujuan.tsx> <kepala.txt>");
  process.exit(2);
}
const dari = Number(dariArg);
const sampai = Number(sampaiArg);

const bekuBaris = readFileSync(BEKU, "utf8").split("\n");
const potongan = bekuBaris.slice(dari - 1, sampai).join("\n");

if (!potongan.startsWith(`function ${nama}(`)) {
  throw new Error(`baris ${dari} di ${BEKU} bukan awal "function ${nama}("`);
}
if (bekuBaris[sampai - 1] !== "}") {
  throw new Error(`baris ${sampai} di ${BEKU} bukan "}" di kolom 0`);
}

const homeBaris = readFileSync(HOME, "utf8").split("\n");
const mulai = homeBaris.findIndex(b => b.startsWith(`function ${nama}(`));
if (mulai < 0) throw new Error(`"function ${nama}(" tidak ditemukan di ${HOME}`);
let akhir = mulai;
while (akhir < homeBaris.length && homeBaris[akhir] !== "}") akhir += 1;
if (akhir >= homeBaris.length) throw new Error(`penutup "}" untuk ${nama} tidak ditemukan di ${HOME}`);

// Gerbang yang membuat seluruh alat ini aman: blok di Home.tsx harus masih
// identik bita-per-bita dengan blok di berkas beku. Kalau tidak, ada yang sudah
// menyunting Home.tsx, dan memindahkan potongan beku akan MEMBATALKAN suntingan
// itu tanpa jejak.
const diHome = homeBaris.slice(mulai, akhir + 1).join("\n");
if (diHome !== potongan) {
  throw new Error(
    `blok ${nama} di ${HOME} tidak identik dengan garis dasar baris ${dari}-${sampai}. ` +
      `Home.tsx sudah tersunting. Hentikan dan periksa sebelum memindahkan apa pun.`,
  );
}

mkdirSync(dirname(tujuan), { recursive: true });
writeFileSync(tujuan, `${readFileSync(kepalaPath, "utf8")}export ${potongan}\n`);

const sampaiBuang = homeBaris[akhir + 1] === "" ? akhir + 2 : akhir + 1;
homeBaris.splice(mulai, sampaiBuang - mulai);
writeFileSync(HOME, homeBaris.join("\n"));

const sha = createHash("sha256").update(potongan).digest("hex").slice(0, 16);
console.log(`${nama}: ${potongan.length} bita, sha256 ${sha} -> ${tujuan}`);
console.log(`Home.tsx sekarang ${homeBaris.length - 1} baris`);

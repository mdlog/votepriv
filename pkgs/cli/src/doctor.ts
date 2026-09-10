// `pnpm cli doctor` — diagnosa turunan alamat dari frasa pemulihan.
//
// Kenapa ini ADA: seed.ts hanya bisa memakai SATU metode turunan per proses
// (default "pbkdf2" — lihat mnemonic.ts). Kalau wallet pengguna ternyata
// dicetak oleh build Lace lain (mis. beta Januari 2026 di issue #2133 yang
// memotong seed ke 32 byte, tidak pernah dirilis publik), `preprod`/`preview`
// akan tersambung ke alamat yang BENAR SECARA KRIPTOGRAFIS tapi SALAH SECARA
// PRAKTIS — saldo nol yang diam-diam salah alamat, bukan galat yang nyaring.
//
// `doctor` menurunkan KETIGA kandidat sekaligus, untuk KEDUA jaringan
// (preview dan preprod — murah, sama-sama hanya derivasi HD lokal, tidak ada
// sinkronisasi jaringan), dan mencetak HANYA alamatnya. Pengguna mencocokkan
// salah satu alamat di bawah dengan yang ditampilkan Lace, atau mengecek
// faucet/explorer — tanpa CLI ini pernah menyentuh penyimpanan ekstensi Lace
// (lihat progress.md: itu data wallet pribadi, sengaja tidak disentuh).
//
// KONTRAK KERAS: frasa pemulihan, byte seed, dan kunci privat TIDAK PERNAH
// dicetak, dicatat (tidak ada logger di sini sama sekali), atau muncul di
// pesan galat. Hanya alamat bech32 — data publik — yang boleh ke stdout.
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { createKeystore } from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { type CaraTurunan, seedDariMnemonic } from "./mnemonic.ts";
import { bacaFrasaPemulihan } from "./seed.ts";

const KANDIDAT: ReadonlyArray<{ cara: CaraTurunan; label: string }> = [
  { cara: "pbkdf2", label: "PBKDF2 64 byte penuh — default CLI ini, Lace 2.2.3 (kemungkinan besar benar)" },
  { cara: "pbkdf2-32", label: "PBKDF2 32 byte pertama — beta Lace Jan-2026, TIDAK PERNAH dirilis publik" },
  { cara: "entropy", label: "entropi BIP-39 mentah 32 byte" },
];

const JARINGAN: readonly string[] = ["preview", "preprod"];

/** Menurunkan kunci HD NightExternal (account 0, index 0) dari byte seed. */
function turunkanKunciNightExternal(seed: Uint8Array): Uint8Array {
  const hd = HDWallet.fromSeed(seed);
  if (hd.type !== "seedOk") {
    throw new Error("Gagal menginisialisasi HDWallet untuk metode turunan ini.");
  }
  try {
    const kunci = hd.hdWallet.selectAccount(0).selectRole(Roles.NightExternal).deriveKeyAt(0);
    if (kunci.type !== "keyDerived") {
      throw new Error("Gagal menurunkan kunci untuk metode turunan ini.");
    }
    return kunci.key;
  } finally {
    hd.hdWallet.clear();
  }
}

/** Alamat bech32 unshielded untuk satu kunci pada satu jaringan. Data publik — aman dicetak. */
function alamatUntuk(kunci: Uint8Array, networkId: string): string {
  return createKeystore(kunci, networkId).getBech32Address().toString();
}

async function main(): Promise<void> {
  console.log("=== votepriv doctor — diagnosa turunan alamat dari frasa pemulihan ===");
  console.log("Frasa pemulihan TIDAK PERNAH ditampilkan atau dicatat.");
  console.log("Hanya alamat hasil turunan di bawah ini yang dicetak — data publik, aman dibagikan.\n");

  const frasa = await bacaFrasaPemulihan();

  const baris: string[] = [];
  for (const { cara, label } of KANDIDAT) {
    let seed: Uint8Array;
    try {
      seed = seedDariMnemonic(frasa, cara);
    } catch (e) {
      baris.push(`[${cara}] GAGAL menurunkan seed — ${(e as Error).message}`);
      continue;
    }

    let kunci: Uint8Array;
    try {
      kunci = turunkanKunciNightExternal(seed);
    } catch (e) {
      baris.push(`[${cara}] GAGAL menurunkan kunci — ${(e as Error).message}`);
      continue;
    }

    for (const networkId of JARINGAN) {
      try {
        baris.push(`[${cara}] ${networkId.padEnd(7)} ${alamatUntuk(kunci, networkId)}`);
      } catch (e) {
        baris.push(`[${cara}] ${networkId.padEnd(7)} GAGAL — ${(e as Error).message}`);
      }
    }
    baris.push(`          (${label})`);
  }

  console.log(baris.join("\n"));
  console.log(
    "\nCocokkan salah satu alamat di atas dengan yang ditampilkan Lace untuk wallet Anda, " +
      "atau periksa saldo lewat faucet/explorer jaringan terkait.\n" +
      "Metode yang cocok itulah yang harus dipakai lewat --seed-derivation=<metode> " +
      "saat menjalankan `pnpm cli preprod` / `pnpm cli preview` (default: pbkdf2).",
  );
}

await main();

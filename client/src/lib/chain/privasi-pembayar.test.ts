import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Transaction, type Binding, type Proof, type SignatureEnabled } from "@midnight-ntwrk/ledger-v8";
import { faktaPrivasiPembayar, hexKeBita } from "@/test/privasi-pembayar-fakta";

/**
 * Uji invarian: TIDAK ADA identitas pembayar pada transaksi castVote/tallyVote
 * yang SUNGGUH terkirim ke testnet preview.
 *
 * INI JALUR OFFLINE — jalan di setiap `pnpm test`, tanpa jaringan, tanpa jam
 * dinding. Byte MENTAH direkam sekali oleh scripts/rekam-fixture-rantai.mjs ke
 * client/src/test/fixture-rantai/tx-mentah-tulis.json (lihat README di sana
 * untuk provenansnya) dan di-deserialisasi ULANG di sini dengan
 * @midnight-ntwrk/ledger-v8 8.1.0 — pustaka SUNGGUHAN yang terpasang, bukan
 * tiruan. Varian yang menyentuh indexer HIDUP ada di
 * privasi-pembayar.jaringan-nyata.test.ts (dilewati bawaan).
 *
 * KENAPA uji ini dirancang DUA ARAH, dan mengapa itu bukan gaya melainkan
 * satu-satunya cara uji ini tidak bisa lolos secara palsu:
 *
 * Uji yang HANYA mengassert "field identitas kosong" (mis. `owner` bernilai
 * undefined) punya cacat fatal: bila parsing rusak, ter-stub, atau membaca
 * transaksi yang SALAH, ia akan MENGEMBALIKAN OBJEK KOSONG — dan objek kosong
 * juga "tidak punya" field identitas. Uji akan tetap HIJAU untuk alasan yang
 * salah: "tidak menemukan apa-apa" terlihat identik dengan "memang tidak ada
 * apa-apa".
 *
 * Karena itu SETIAP transaksi di fixture diuji lewat DUA KELOMPOK assert:
 *
 *   KEBERADAAN (membuktikan deserialisasi SUNGGUHAN terjadi dan membaca
 *   transaksi ITU, bukan yang lain) — dipaku ke NILAI, bukan ke "ada":
 *     - hash yang DIHITUNG ULANG dari byte (Transaction.transactionHash())
 *       sama PERSIS dengan hash fixture — satu-satunya cara ini bisa cocok
 *       adalah kalau byte yang didesersialisasi memang milik transaksi itu.
 *     - entryPoint bernilai LITERAL "castVote" atau "tallyVote" sesuai label
 *       fixture — bukan sekadar string non-kosong.
 *     - jumlah intent === 2, jumlah panggilan kontrak === 1, jumlah
 *       dustActions.spends === 1 — tiga ANGKA PASTI, bukan ">0".
 *
 *   KETIADAAN (membuktikan tidak ada kanal identitas pembayar):
 *     - guaranteedUnshieldedOffer & fallibleUnshieldedOffer TIDAK ADA di
 *       intent mana pun (kanal yang membawa UnshieldedOffer.signatures).
 *     - dustActions.registrations === 0 di seluruh intent (kanal yang
 *       membawa DustRegistration.nightKey/.dustAddress).
 *     - Effects.unshieldedInputs/unshieldedOutputs/claimedUnshieldedSpends
 *       kosong (size 0) pada transkrip panggilan kontrak.
 *
 * Sebuah parser yang macet/di-stub jatuh di sisi KEBERADAAN (hash/entryPoint/
 * angka tidak cocok). Sebuah perubahan protokol yang SUNGGUH menambahkan
 * identitas pembayar jatuh di sisi KETIADAAN. Bukti kedua arah bisa merah ada
 * di .superpowers/sdd/2026-09-12-votepriv-jalur-tulis-c2b/invarian-privasi-report.md.
 */

const fixture = JSON.parse(
  readFileSync(new URL("../../test/fixture-rantai/tx-mentah-tulis.json", import.meta.url), "utf8"),
) as {
  jaringan: string;
  transaksi: readonly {
    entryPoint: string;
    hash: string;
    blockHeight: number;
    ballotAddress: string;
    rawByteLength: number;
    raw: string;
  }[];
};

describe("fixture tx-mentah-tulis.json — praperiksa, supaya loop di bawah tidak pernah diam-diam kosong", () => {
  it("memuat SETIDAKNYA satu castVote dan satu tallyVote — nol entri berarti uji di bawah lolos TANPA MENGUJI APA PUN", () => {
    const label = new Set(fixture.transaksi.map((t) => t.entryPoint));
    expect(fixture.transaksi.length).toBeGreaterThanOrEqual(2);
    expect(label.has("castVote")).toBe(true);
    expect(label.has("tallyVote")).toBe(true);
  });

  it("setiap entri fixture punya raw hex yang panjangnya cocok dengan rawByteLength yang direkam", () => {
    for (const tx of fixture.transaksi) {
      expect(hexKeBita(tx.raw).length).toBe(tx.rawByteLength);
      expect(tx.raw.length).toBe(tx.rawByteLength * 2);
    }
  });
});

describe.each(fixture.transaksi.map((tx) => [tx.entryPoint, tx] as const))(
  "privasi pembayar — %s (jalur OFFLINE, dari fixture rekaman)",
  (_label, tx) => {
    const fakta = faktaPrivasiPembayar(hexKeBita(tx.raw));

    // ── KEBERADAAN: dipaku ke NILAI, membuktikan deserialisasi membaca tx INI ──
    it(`hash yang dihitung ulang dari byte === hash fixture (${tx.hash.slice(0, 8)})`, () => {
      expect(fakta.hashTerhitungUlang).toBe(tx.hash);
    });

    it(`entryPoint === "${tx.entryPoint}" (bukan sekadar non-kosong)`, () => {
      expect(fakta.entryPoint).toBe(tx.entryPoint);
    });

    it("jumlah intent === 2 (intent biaya DUST + intent panggilan kontrak)", () => {
      expect(fakta.jumlahIntent).toBe(2);
    });

    it("jumlah panggilan kontrak === 1", () => {
      expect(fakta.jumlahPanggilanKontrak).toBe(1);
    });

    it("jumlah dustActions.spends === 1 — biaya DIBAYAR lewat kanal ini", () => {
      expect(fakta.jumlahDustSpends).toBe(1);
    });

    // ── KETIADAAN: kanal yang bisa membawa identitas pembayar, semuanya kosong ──
    it("TIDAK ADA guaranteedUnshieldedOffer/fallibleUnshieldedOffer (kanal signatures) di intent mana pun", () => {
      expect(fakta.adaUnshieldedOffer).toBe(false);
    });

    it("jumlah dustActions.registrations === 0 (kanal nightKey/dustAddress)", () => {
      expect(fakta.jumlahDustRegistrations).toBe(0);
    });

    it("Effects.unshieldedInputs/unshieldedOutputs/claimedUnshieldedSpends kosong pada transkrip panggilan", () => {
      expect(fakta.unshieldedInputsSize).toBe(0);
      expect(fakta.unshieldedOutputsSize).toBe(0);
      expect(fakta.claimedUnshieldedSpendsSize).toBe(0);
    });
  },
);

/**
 * Cek TEKS tambahan — dijalankan TERPISAH dari faktaPrivasiPembayar() di atas
 * (deserialisasi ULANG, bukan berbagi objek) sehingga ia bukti INDEPENDEN, ATAS
 * DASAR dump toString() Rust-Debug ledger-v8, persis metode yang dipakai
 * penyelidikan manusia (lihat progress.md, "dump 5.879 karakter"). Ini
 * PELENGKAP, bukan pengganti, assert bertipe di atas — sendirian ia rapuh
 * (lihat komentar berkas), tetapi bersama assert bertipe di atas ia menambah
 * lapis: bila SUATU HARI toString() ganti nama field jadi camelCase atau
 * format lain, kegagalan match di sini adalah SINYAL untuk memeriksa ulang,
 * bukan silent pass.
 */
describe("dump toString() ledger-v8 — nol kemunculan istilah identitas pembayar", () => {
  for (const tx of fixture.transaksi) {
    it(`${tx.entryPoint} ${tx.hash.slice(0, 8)}: dump toString() tidak menyebut owner/night_key/dust_address/signatures`, () => {
      const t = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
        "signature",
        "proof",
        "binding",
        hexKeBita(tx.raw),
      );
      const dump = t.toString();
      // Presence pin: dump-nya sendiri harus SUBSTANSIAL (bukan string kosong
      // dari objek yang gagal dideserialisasi) sebelum kita percaya hasil nol
      // di bawah berarti "memang tidak ada", bukan "toString() rusak".
      expect(dump.length).toBeGreaterThan(1000);
      for (const istilah of ["owner", "night_key", "dust_address", "signatures"]) {
        expect(dump, `dump menyebut "${istilah}"`).not.toContain(istilah);
      }
    });
  }
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GalatRantai } from "./graphql";
import { dekodeBallot, dekodeRegistry, padatkanTallies } from "./dekode";

const DIR = new URL("../../test/fixture-rantai/", import.meta.url);
const baca = (nama: string) => JSON.parse(readFileSync(new URL(nama, DIR), "utf8"));

const registry = baca("registry.json");
const ballots = baca("ballots.json");
const meta = baca("meta.json");

describe("dekodeRegistry", () => {
  it("mendekode state registry yang direkam", () => {
    const r = dekodeRegistry(registry.data.r.state, meta.alamatRegistry);
    // Nilainya DITURUNKAN dari fixture, bukan diketik: jumlah ballot berubah
    // setiap ada yang mendaftar.
    expect(r.alamat).toEqual(ballots.alamat);
    expect(r.count).toBe(ballots.alamat.length);
  });

  it("MELEMPAR GalatRantai bersebab dekode pada bita yang bukan ContractState", () => {
    // Bentuk pesan yang diverifikasi: "expected header tag 'midnight:contract-state[v6]:'"
    expect(() => dekodeRegistry("01020304", "sampah")).toThrow(GalatRantai);
    try {
      dekodeRegistry("01020304", "sampah");
    } catch (e) {
      expect((e as GalatRantai).sebab).toBe("dekode");
    }
  });

  it("MELEMPAR pada hex yang panjangnya ganjil", () => {
    expect(() => dekodeRegistry("abc", "sampah")).toThrow(/is not valid hex/);
  });
});

describe("dekodeBallot", () => {
  const alamat: string[] = ballots.alamat;

  it("mendekode SETIAP ballot yang direkam", () => {
    for (let i = 0; i < alamat.length; i++) {
      const k = dekodeBallot(ballots.jawaban.data[`b${i}`].state, alamat[i]);
      // Invarian kontrak, benar apa pun isi rantainya:
      expect(k.optionCount).toBeGreaterThanOrEqual(2);   // assert(nOptions >= 2)
      expect(k.optionCount).toBeLessThanOrEqual(4);      // assert(nOptions <= 4)
      expect(k.opsi).toHaveLength(k.optionCount);        // dipotong, option3 kosong tidak ikut
      expect(k.tallyDeadlineDetik).toBeGreaterThan(k.voteDeadlineDetik); // assert(tallyDl > voteDl)
      expect(k.eligibleCount).toBeGreaterThanOrEqual(1); // assert(eligible >= 1)
      expect(k.eligibleCount).toBeLessThanOrEqual(1024); // kapasitas pohon Merkle depth 10
      expect(k.quorumPercent).toBeLessThanOrEqual(100);  // assert(quorum <= 100)
      expect([0, 1, 2]).toContain(k.phase);
      expect(k.registeredCount).toBeLessThanOrEqual(k.eligibleCount);
      expect(k.talliedCount).toBeLessThanOrEqual(k.voteCount);
    }
  });

  it("membaca deadline dalam DETIK, bukan milidetik", () => {
    // ballot.compact menulis peringatan panjang tentang ini: deadline dalam
    // milidetik (~1000x lebih besar) tidak pernah tercapai dalam rentang waktu
    // manusia, dan simulator tidak akan pernah menangkapnya.
    const k = dekodeBallot(ballots.jawaban.data.b0.state, alamat[0]);
    const sekarangDetik = Math.floor(meta.sekarangMs / 1000);
    // Deadline yang masuk akal berada dalam beberapa tahun dari waktu rekam.
    const setahun = 365 * 24 * 3600;
    expect(Math.abs(k.voteDeadlineDetik - sekarangDetik)).toBeLessThan(10 * setahun);
  });

  it("MELEMPAR ketika state registry didekode sebagai ballot — inilah saringan entri sampah", () => {
    // registry.compact menyebut sendiri: "Entri yang tidak resolve ke kontrak
    // ballot yang sah disaring di sisi klien." Inilah saringannya.
    // Bentuk yang diverifikasi: CompactError "invalid operation for type:
    // tried to idx, only map, array, and bmt are supported".
    expect(() => dekodeBallot(registry.data.r.state, meta.alamatRegistry)).toThrow(
      /could not be read as a ballot contract/,
    );
  });
});

describe("padatkanTallies", () => {
  it("mengisi lubang pada map JARANG — kunci yang hilang jadi 0, bukan undefined", () => {
    // Bentuk yang diverifikasi pada ballot final: [[2,1],[0,2]]. Kunci 1 TIDAK ADA.
    expect(padatkanTallies([[2n, 1n], [0n, 2n]], 3)).toEqual([2, 0, 1]);
  });

  it("mengembalikan larik nol ketika map kosong — fase voting, hasil tersegel", () => {
    expect(padatkanTallies([], 3)).toEqual([0, 0, 0]);
  });

  it("MENGABAIKAN kunci di luar rentang opsi alih-alih menaruhnya di indeks yang salah", () => {
    expect(padatkanTallies([[0n, 5n], [7n, 9n]], 2)).toEqual([5, 0]);
  });

  it("memadatkan tallies dari setiap ballot yang direkam ke panjang yang benar", () => {
    const alamat: string[] = ballots.alamat;
    for (let i = 0; i < alamat.length; i++) {
      const k = dekodeBallot(ballots.jawaban.data[`b${i}`].state, alamat[i]);
      const padat = padatkanTallies(k.tallies, k.optionCount);
      expect(padat).toHaveLength(k.optionCount);
      // Jumlah seluruh tally SELALU sama dengan talliedCount: tallyVote menambah
      // keduanya di transaksi yang sama, dan tidak ada circuit lain yang menyentuh
      // salah satunya.
      expect(padat.reduce((s, n) => s + n, 0)).toBe(k.talliedCount);
    }
  });
});

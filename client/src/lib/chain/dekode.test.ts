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

  it("MELEMPAR pada hex genap tapi berkarakter non-hex — separuh penjaga yang 'abc' tidak pernah menyentuh (M11)", () => {
    // "abc" (uji di atas) jatuh lewat cek PARITAS (panjang ganjil) dan tidak
    // pernah menyentuh cek kelas-karakter. "zzzz" panjangnya genap (4) dan
    // hanya bisa jatuh lewat cek kelas-karakter itu sendiri.
    expect(() => dekodeRegistry("zzzz", "sampah")).toThrow(/is not valid hex/);
  });

  it("menormalisasi prefiks 0x sebelum validasi hex (M14)", () => {
    // "01020304" (tanpa prefiks) sudah dibuktikan di atas: hex SAH, lolos
    // penjaga hex, gagal belakangan di ContractState.deserialize. Kalau
    // normalisasi 0x hilang, "0x01020304" gagal di penjaga hex itu sendiri
    // (karakter 'x' bukan hex) dengan pesan yang BERBEDA — itulah yang
    // dibedakan uji ini.
    expect(() => dekodeRegistry("0x01020304", "sampah")).toThrow(/ContractState.deserialize failed/);
  });
});

describe("dekodeBallot", () => {
  const alamat: string[] = ballots.alamat;

  // Nilai PERSIS terdekode dari fixture (lihat task-4-hasil-mutasi.md), bukan
  // hanya rentang. Invarian kontrak di bawah tidak menangkap field tertukar,
  // opsi terbalik, atau field yang salah baca ketika hasilnya kebetulan tetap
  // valid secara struktural — itulah tepatnya M1/M2/M3/M4/M5/M12/M13.
  const NILAI_BALLOT_DIHARAPKAN = [
    {
      title: "Uji E2E VotePriv",
      description: "Tiga pemilih, tiga opsi, di jaringan preview.",
      community: "Midnight Builders",
      eligibilityPolicy: "Tiga credential uji end-to-end",
      opsi: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
      optionCount: 3,
      quorumPercent: 60,
      phase: 2,
      voteDeadlineDetik: 1789101131,
      tallyDeadlineDetik: 1789103231,
    },
    {
      title: "Q4 Community Treasury",
      description: "Pilih arah dukungan treasury pada Q4.",
      community: "Midnight Builders",
      eligibilityPolicy: "Tiga credential uji end-to-end",
      opsi: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
      optionCount: 3,
      quorumPercent: 60,
      phase: 0,
      voteDeadlineDetik: 1789086147,
      tallyDeadlineDetik: 1789088247,
    },
  ] as const;

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

      // NILAI persis (bukan rentang/keanggotaan himpunan):
      const harap = NILAI_BALLOT_DIHARAPKAN[i];
      expect(k.title).toBe(harap.title);
      expect(k.description).toBe(harap.description);
      expect(k.community).toBe(harap.community);
      expect(k.eligibilityPolicy).toBe(harap.eligibilityPolicy);
      expect(k.opsi).toEqual(harap.opsi);
      expect(k.optionCount).toBe(harap.optionCount);
      expect(k.quorumPercent).toBe(harap.quorumPercent);
      expect(k.phase).toBe(harap.phase);
      expect(k.voteDeadlineDetik).toBe(harap.voteDeadlineDetik);
      expect(k.tallyDeadlineDetik).toBe(harap.tallyDeadlineDetik);
    }
  });

  it("membaca deadline dalam DETIK, bukan milidetik", () => {
    // ballot.compact menulis peringatan panjang tentang ini: deadline dalam
    // milidetik (~1000x lebih besar) tidak pernah tercapai dalam rentang waktu
    // manusia, dan simulator tidak akan pernah menangkapnya.
    const k = dekodeBallot(ballots.jawaban.data.b0.state, alamat[0]);
    const sekarangDetik = Math.floor(meta.sekarangMs / 1000);
    // "sekarang" bagi seluruh uji fixture WAJIB berasal dari meta.sekarangMs
    // yang beku, bukan Date.now() (lihat README fixture-rantai). Memaku nilai
    // ini persis ke meta.sekarangMs/1000 memastikan mengganti sumbernya dengan
    // Date.now() di uji ini sendiri jatuh — Date.now() pada detik uji
    // dijalankan tidak akan pernah persis sama dengan momen fixture direkam.
    expect(sekarangDetik).toBe(Math.floor(meta.sekarangMs / 1000));
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

  it("MENGABAIKAN kunci NEGATIF — dua pertiga penjaga yang kunci 7 di atas tidak pernah menyentuh (M16)", () => {
    // Kunci 7 di uji di atas hanya menyentuh disjungsi `i >= jumlahOpsi`.
    // Kunci -1 hanya bisa jatuh lewat disjungsi `i < 0`. Object.keys dicek
    // eksplisit supaya penugasan ke indeks bertanda TIDAK lolos sebagai
    // properti liar (mis. padat["-1"]) yang toEqual longgar terhadapnya.
    const padat = padatkanTallies([[-1n, 5n], [0n, 2n]], 2);
    expect(padat).toEqual([2, 0]);
    expect(Object.keys(padat)).toEqual(["0", "1"]);
  });

  it("MENGABAIKAN kunci PECAHAN — disjungsi ketiga penjaga yang tidak pernah disentuh uji kunci 7 (M16)", () => {
    const padat = padatkanTallies([[0.5, 5], [1, 3]], 2);
    expect(padat).toEqual([0, 3]);
    expect(Object.keys(padat)).toEqual(["0", "1"]);
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

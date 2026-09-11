import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Ledger as LedgerBallot } from "@pkgs/contract/src/managed/ballot/contract/index.js";
import type { Ledger as LedgerRegistry } from "@pkgs/contract/src/managed/registry/contract/index.js";

/**
 * Uji dengan LEDGER SINTETIS — bukan fixture.
 *
 * Fixture di client/src/test/fixture-rantai/ adalah rekaman rantai sungguhan
 * dan TIDAK boleh dikarang atau ditambal (lihat README di sana). Lima sifat
 * dibutuhkan uji di berkas ini yang fixture itu TIDAK punya:
 *
 *   1. Sebuah bigint di atas Number.MAX_SAFE_INTEGER (M9/M10).
 *   2. voteCount != talliedCount, dan eligibleCount != registeredCount
 *      (M6/M7) — kedua ballot fixture punya angka yang KEBETULAN kembar.
 *   3. count registry != jumlah alamat (M15).
 *   4. phase TALLYING (1) — kedua ballot fixture ada di voting (0) atau
 *      finalized (2), tidak pernah tallying.
 *   5. Deadline di MASA DEPAN relatif terhadap meta.sekarangMs.
 *
 * Berkas ini memalsukan LEDGER — accessor `ledger()` tergenerasi dari
 * pkgs/contract — lewat vi.mock, supaya dekodeRegistry/dekodeBallot yang
 * SUNGGUHAN (bukan tiruan) dijalankan atas nilai yang kita kontrol penuh.
 * Scoped ke berkas ini saja: vitest mengisolasi modul per berkas uji secara
 * default, jadi dekode.test.ts yang memakai fixture asli tidak terpengaruh.
 *
 * PENTING — ikatan tipe: mock TIDAK ditulis sebagai literal bebas. Kedua
 * builder di bawah (`ledgerBallotDasar`, `ledgerRegistryDasar`) mengembalikan
 * nilai bertipe `LedgerBallot`/`LedgerRegistry` — tipe SUNGGUHAN yang
 * diimpor (type-only, jadi TIDAK melewati vi.mock di bawah) dari modul
 * kontrak tergenerasi. Kalau field ganti nama atau tipe di kontrak,
 * `pnpm check:uji` MERAH di berkas ini, bukan diam-diam tetap hijau. Kedua
 * `vi.fn()` juga diberi parameter generik supaya `mockReturnValue()` sendiri
 * dipaksa cocok dengan tipe ini, bukan `any`.
 */

const { ledgerRegistryMock, ledgerBallotMock } = vi.hoisted(() => ({
  ledgerRegistryMock: vi.fn<(charged: unknown) => LedgerRegistry>(),
  ledgerBallotMock: vi.fn<(charged: unknown) => LedgerBallot>(),
}));

vi.mock("@midnight-ntwrk/compact-runtime", () => ({
  // keChargedState hanya butuh .data; isi hex-nya tidak relevan lagi karena
  // deserialize tidak sungguhan dipanggil.
  ContractState: {
    deserialize: () => ({ data: "state-sintetis" }),
  },
}));

vi.mock("@pkgs/contract/src/managed/registry/contract/index.js", () => ({
  ledger: (charged: unknown) => ledgerRegistryMock(charged),
}));

vi.mock("@pkgs/contract/src/managed/ballot/contract/index.js", () => ({
  ledger: (charged: unknown) => ledgerBallotMock(charged),
}));

const { dekodeBallot, dekodeRegistry } = await import("./dekode");
const { GalatRantai } = await import("./graphql");

const DIR = new URL("../../test/fixture-rantai/", import.meta.url);
const meta = JSON.parse(readFileSync(new URL("meta.json", DIR), "utf8"));

// Hex yang valid secara SINTAKS (genap, karakter hex) — isinya tidak dibaca
// sungguhan karena ContractState.deserialize dimock di atas.
const HEX_APA_SAJA = "01020304";

/** Melempar tanpa terkecuali — dipakai untuk metode Ledger yang bentuknya
 * WAJIB ada tapi dekode.ts sendiri tidak pernah memanggilnya (mis. Merkle
 * root/path). `never` assignable ke tanda tangan return apa pun. */
function stub(): never {
  throw new Error("stub Ledger sintetis: metode ini tidak pernah dipanggil dekode.ts");
}

function merkleDasar() {
  return {
    isFull: () => false,
    checkRoot: () => false,
    root: stub,
    firstFree: () => 0n,
    pathForLeaf: stub,
    findPathForLeaf: () => undefined,
  };
}

function setKosong<T>(): {
  isEmpty(): boolean;
  size(): bigint;
  member(elem: T): boolean;
  [Symbol.iterator](): Iterator<T>;
} {
  return {
    isEmpty: () => true,
    size: () => 0n,
    member: () => false,
    [Symbol.iterator]: () => ([] as T[])[Symbol.iterator](),
  };
}

function bungkusTallies(pasangan: [bigint, bigint][] = []): LedgerBallot["tallies"] {
  return {
    isEmpty: () => pasangan.length === 0,
    size: () => BigInt(pasangan.length),
    member: (key) => pasangan.some(([k]) => k === key),
    lookup: (key) => {
      const hit = pasangan.find(([k]) => k === key);
      if (hit === undefined) throw new Error("expected a cell, received null");
      return hit[1];
    },
    [Symbol.iterator]: () => pasangan[Symbol.iterator](),
  };
}

function bungkusBallots(alamat: string[]): LedgerRegistry["ballots"] {
  return {
    isEmpty: () => alamat.length === 0,
    length: () => BigInt(alamat.length),
    head: () => (alamat.length > 0 ? { is_some: true, value: alamat[0] } : { is_some: false, value: "" }),
    [Symbol.iterator]: () => alamat[Symbol.iterator](),
  };
}

/** Ballot minimal tapi LENGKAP menurut tipe Ledger sungguhan — bukan literal
 * bebas. Tiap uji menimpa hanya field yang ia pedulikan. */
function ledgerBallotDasar(overrides: Partial<LedgerBallot> = {}): LedgerBallot {
  const dasar: LedgerBallot = {
    title: "t",
    description: "d",
    community: "c",
    option0: "o0",
    option1: "o1",
    option2: "",
    option3: "",
    optionCount: 2n,
    voteDeadline: 1n,
    tallyDeadline: 2n,
    quorumPercent: 1n,
    eligibleCount: 1n,
    eligibilityPolicy: "e",
    adminKey: new Uint8Array(),
    ballotNonce: new Uint8Array(),
    phase: 0,
    eligibility: { ...merkleDasar(), history: stub },
    voteCount: 0n,
    registeredCount: 1n,
    nullifiers: setKosong<Uint8Array>(),
    commitments: merkleDasar(),
    tallyNullifiers: setKosong<Uint8Array>(),
    tallies: bungkusTallies(),
    talliedCount: 0n,
  };
  return { ...dasar, ...overrides };
}

function ledgerRegistryDasar(overrides: Partial<LedgerRegistry> = {}): LedgerRegistry {
  const dasar: LedgerRegistry = {
    ballots: bungkusBallots([]),
    count: 0n,
  };
  return { ...dasar, ...overrides };
}

describe("keNomor: penjaga overflow dipanggil (M9) dan tidak dibungkus ulang (M10)", () => {
  it("dekodeRegistry MELEMPAR pada count di atas Number.MAX_SAFE_INTEGER, dengan rincian ASLI keNomor", () => {
    ledgerRegistryMock.mockReturnValue(
      ledgerRegistryDasar({ count: BigInt(Number.MAX_SAFE_INTEGER) + 1n, ballots: bungkusBallots(["addr-x"]) }),
    );
    expect.assertions(3);
    try {
      dekodeRegistry(HEX_APA_SAJA, "sampah-overflow-registry");
    } catch (e) {
      expect(e).toBeInstanceOf(GalatRantai);
      const g = e as InstanceType<typeof GalatRantai>;
      // Rincian ASLI dari keNomor (M9 mati -> tidak melempar sama sekali,
      // catch ini tidak pernah tercapai, assertion count di atas gagal).
      expect(g.rincian).toMatch(/exceeds Number\.MAX_SAFE_INTEGER/);
      // TIDAK dibungkus ulang jadi "could not be read as a registry contract"
      // (M10 mati -> guard rethrow hilang -> catch generik membungkusnya).
      expect(g.rincian).not.toMatch(/could not be read as/);
    }
  });

  it("dekodeBallot MELEMPAR pada voteDeadline di atas Number.MAX_SAFE_INTEGER, dengan rincian ASLI keNomor", () => {
    ledgerBallotMock.mockReturnValue(
      ledgerBallotDasar({ voteDeadline: BigInt(Number.MAX_SAFE_INTEGER) + 1n }),
    );
    expect.assertions(3);
    try {
      dekodeBallot(HEX_APA_SAJA, "sampah-overflow-ballot");
    } catch (e) {
      expect(e).toBeInstanceOf(GalatRantai);
      const g = e as InstanceType<typeof GalatRantai>;
      expect(g.rincian).toMatch(/exceeds Number\.MAX_SAFE_INTEGER/);
      expect(g.rincian).not.toMatch(/could not be read as/);
    }
  });
});

describe("pemetaan field: tidak tertukar meski nilainya kembar di fixture (M6/M7)", () => {
  it("voteCount dan talliedCount TIDAK tertukar — ini SEKALIGUS voteCount != talliedCount yang fixture asli tidak punya", () => {
    ledgerBallotMock.mockReturnValue(ledgerBallotDasar({ voteCount: 7n, talliedCount: 5n }));
    const k = dekodeBallot(HEX_APA_SAJA, "sintetis-voteCount");
    expect(k.voteCount).toBe(7);
    expect(k.talliedCount).toBe(5);
  });

  it("eligibleCount dan registeredCount TIDAK tertukar", () => {
    ledgerBallotMock.mockReturnValue(ledgerBallotDasar({ eligibleCount: 9n, registeredCount: 4n }));
    const k = dekodeBallot(HEX_APA_SAJA, "sintetis-eligibleCount");
    expect(k.eligibleCount).toBe(9);
    expect(k.registeredCount).toBe(4);
  });
});

describe("dekodeRegistry.count membaca skalar l.count ledger, bukan panjang l.ballots (M15)", () => {
  it("count berbeda dari jumlah alamat ketika ledger memang berbeda", () => {
    ledgerRegistryMock.mockReturnValue(ledgerRegistryDasar({ count: 99n, ballots: bungkusBallots(["addr-a", "addr-b"]) }));
    const r = dekodeRegistry(HEX_APA_SAJA, "sintetis-registry-count");
    expect(r.count).toBe(99);
    expect(r.alamat).toHaveLength(2);
  });
});

describe("sifat yang TIDAK ADA di fixture asli (lihat README fixture-rantai) — tercakup di sini lewat ledger sintetis", () => {
  it("meneruskan phase TALLYING (1) apa adanya — kedua ballot fixture ada di voting (0) atau finalized (2), tidak pernah tallying", () => {
    ledgerBallotMock.mockReturnValue(ledgerBallotDasar({ phase: 1 }));
    const k = dekodeBallot(HEX_APA_SAJA, "sintetis-phase-tallying");
    expect(k.phase).toBe(1);
  });

  it("meneruskan deadline di MASA DEPAN relatif terhadap meta.sekarangMs yang sama dipakai seluruh uji fixture", () => {
    const sekarangDetik = Math.floor(meta.sekarangMs / 1000);
    const masaDepan = sekarangDetik + 10 * 365 * 24 * 3600; // 10 tahun setelah "sekarang" yang beku
    ledgerBallotMock.mockReturnValue(
      ledgerBallotDasar({ voteDeadline: BigInt(masaDepan), tallyDeadline: BigInt(masaDepan) + 1n }),
    );
    const k = dekodeBallot(HEX_APA_SAJA, "sintetis-deadline-masa-depan");
    expect(k.voteDeadlineDetik).toBe(masaDepan);
    expect(k.voteDeadlineDetik).toBeGreaterThan(sekarangDetik);
  });
});

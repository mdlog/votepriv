import { describe, expect, it, vi } from "vitest";

/**
 * Uji dengan LEDGER SINTETIS — bukan fixture.
 *
 * Fixture di client/src/test/fixture-rantai/ adalah rekaman rantai sungguhan
 * dan TIDAK boleh dikarang atau ditambal (lihat README di sana). Tiga sifat
 * dibutuhkan uji di berkas ini yang fixture itu TIDAK punya dan tidak bisa
 * diadakan tanpa deploy ke testnet:
 *
 *   1. Sebuah bigint di atas Number.MAX_SAFE_INTEGER (M9/M10) — deadline dan
 *      count sungguhan di fixture ini kecil.
 *   2. voteCount != talliedCount, dan eligibleCount != registeredCount
 *      (M6/M7) — kedua ballot fixture punya angka yang KEBETULAN kembar,
 *      jadi memaku NILAI hasil dekodeBallot tidak bisa menangkap dua field
 *      tertukar di lapis pemetaan.
 *   3. count registry != jumlah alamat (M15) — registry fixture kebetulan
 *      punya count == alamat.length juga.
 *
 * Berkas ini TIDAK menyentuh fixture. Ia memalsukan LEDGER — accessor
 * tergenerasi `ledger()` dari pkgs/contract — lewat vi.mock, supaya
 * dekodeRegistry/dekodeBallot yang SUNGGUHAN (bukan tiruan) dijalankan atas
 * nilai yang kita kontrol penuh. Ini scoped ke berkas ini saja: vitest
 * mengisolasi modul per berkas uji secara default, jadi dekode.test.ts yang
 * memakai fixture asli tidak terpengaruh sama sekali.
 */

const { ledgerRegistryMock, ledgerBallotMock } = vi.hoisted(() => ({
  ledgerRegistryMock: vi.fn(),
  ledgerBallotMock: vi.fn(),
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

// Hex yang valid secara SINTAKS (genap, karakter hex) — isinya tidak dibaca
// sungguhan karena ContractState.deserialize dimock di atas.
const HEX_APA_SAJA = "01020304";

function ledgerBallotDasar() {
  return {
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
    registeredCount: 1n,
    eligibilityPolicy: "e",
    phase: 0,
    voteCount: 0n,
    talliedCount: 0n,
    tallies: [] as [bigint, bigint][],
  };
}

describe("keNomor: penjaga overflow dipanggil (M9) dan tidak dibungkus ulang (M10)", () => {
  it("dekodeRegistry MELEMPAR pada count di atas Number.MAX_SAFE_INTEGER, dengan rincian ASLI keNomor", () => {
    ledgerRegistryMock.mockReturnValue({
      count: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      ballots: ["addr-x"],
    });
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
    ledgerBallotMock.mockReturnValue({
      ...ledgerBallotDasar(),
      voteDeadline: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
    });
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
  it("voteCount dan talliedCount TIDAK tertukar", () => {
    ledgerBallotMock.mockReturnValue({
      ...ledgerBallotDasar(),
      voteCount: 7n,
      talliedCount: 5n,
    });
    const k = dekodeBallot(HEX_APA_SAJA, "sintetis-voteCount");
    expect(k.voteCount).toBe(7);
    expect(k.talliedCount).toBe(5);
  });

  it("eligibleCount dan registeredCount TIDAK tertukar", () => {
    ledgerBallotMock.mockReturnValue({
      ...ledgerBallotDasar(),
      eligibleCount: 9n,
      registeredCount: 4n,
    });
    const k = dekodeBallot(HEX_APA_SAJA, "sintetis-eligibleCount");
    expect(k.eligibleCount).toBe(9);
    expect(k.registeredCount).toBe(4);
  });
});

describe("dekodeRegistry.count membaca skalar l.count ledger, bukan panjang l.ballots (M15)", () => {
  it("count berbeda dari jumlah alamat ketika ledger memang berbeda", () => {
    ledgerRegistryMock.mockReturnValue({
      count: 99n,
      ballots: ["addr-a", "addr-b"],
    });
    const r = dekodeRegistry(HEX_APA_SAJA, "sintetis-registry-count");
    expect(r.count).toBe(99);
    expect(r.alamat).toHaveLength(2);
  });
});

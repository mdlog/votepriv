import { describe, expect, it, vi } from "vitest";
import { ContractState } from "@midnight-ntwrk/compact-runtime";
import type { MerkleTreePath } from "@midnight-ntwrk/compact-runtime";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import type { Ledger as LedgerBallot } from "@pkgs/contract/src/managed/ballot/contract/index.js";

const { ledgerMock } = vi.hoisted(() => ({
  ledgerMock: vi.fn<(charged: unknown) => LedgerBallot>(),
}));

vi.mock("@pkgs/contract/src/managed/ballot/contract/index.js", () => ({
  ledger: (charged: unknown) => ledgerMock(charged),
}));

const { ambilJalurEligibility, ambilJalurCommitment, bacaLedgerBallotTulis, GalatEligibility } = await import(
  "./eligibility-tulis"
);

// eligibility-tulis.ts (Step 3) menerima Pick<PublicDataProvider,
// "queryContractState">, BUKAN PublicDataProvider penuh — satu-satunya
// metode yang dipanggil bacaLedgerBallotTulis. Menyempitkan tipe parameter
// produksi menghindari cast tipe di uji (objek literal SATU metode ini
// structural-cocok tanpa `as unknown`).
//
// PENYIMPANGAN dari draf brief: draf memakai literal `{ data: unknown }` untuk
// hasil queryContractState. `pnpm check:uji` MERAH atas itu — ContractState
// (dari @midnight-ntwrk/compact-runtime) adalah class dengan method wajib
// (operations, operation, setOperation, query, ...), dan literal satu-field
// tidak structural-cocok dengannya. Diperbaiki dengan ContractState SUNGGUHAN
// (`new ContractState()`, pola yang sama seperti
// client/src/lib/chain/instance-tunggal.test.ts:20-21, yang membuktikan
// konstruktor ini valid di lingkungan uji) — bukan `as unknown`. Isinya tidak
// relevan: `ledger()` dimock penuh lewat ledgerMock di berkas ini, jadi
// `.data` tidak pernah benar-benar dibaca.
function stateSintetis(): ContractState {
  return new ContractState();
}

function providerDengan(
  hasil: Array<ContractState | null>,
): Pick<PublicDataProvider, "queryContractState"> {
  let i = 0;
  return {
    queryContractState: vi.fn(async () => hasil[Math.min(i++, hasil.length - 1)]),
  };
}

const tundaInstan = async (_ms: number): Promise<void> => {};

/**
 * Ledger sintetis LENGKAP, bukan potongan yang di-cast — pola yang sama
 * dengan client/src/lib/chain/dekode.ledger-sintetis.test.ts. `tidakDipakai`
 * bertipe kembali `never`, yang bisa menempati SETIAP slot metode Ledger
 * (never adalah subtipe segalanya) tanpa satu pun `as unknown`/`as any`.
 */
function ledgerDengan(
  jalur: MerkleTreePath<Uint8Array> | undefined,
  jalurCommitment: MerkleTreePath<Uint8Array> | undefined = jalur,
): LedgerBallot {
  const tidakDipakai = (): never => {
    throw new Error("tidak dipakai di uji ini");
  };
  return {
    title: "", description: "", community: "", option0: "", option1: "", option2: "", option3: "",
    optionCount: 0n, voteDeadline: 0n, tallyDeadline: 0n, quorumPercent: 0n, eligibleCount: 0n,
    eligibilityPolicy: "", adminKey: new Uint8Array(32), ballotNonce: new Uint8Array(32), phase: 0,
    eligibility: {
      isFull: tidakDipakai, checkRoot: tidakDipakai, root: tidakDipakai, firstFree: tidakDipakai,
      pathForLeaf: tidakDipakai, findPathForLeaf: () => jalur, history: tidakDipakai,
    },
    voteCount: 0n, registeredCount: 0n,
    nullifiers: { isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, [Symbol.iterator]: tidakDipakai },
    commitments: {
      isFull: tidakDipakai, checkRoot: tidakDipakai, root: tidakDipakai, firstFree: tidakDipakai,
      pathForLeaf: tidakDipakai, findPathForLeaf: () => jalurCommitment,
    },
    tallyNullifiers: { isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, [Symbol.iterator]: tidakDipakai },
    tallies: {
      isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, lookup: tidakDipakai,
      [Symbol.iterator]: tidakDipakai,
    },
    talliedCount: 0n,
  };
}

describe("bacaLedgerBallotTulis", () => {
  it("melempar GalatEligibility bila indexer belum melihat ballot (null)", async () => {
    const pdp = providerDengan([null]);
    await expect(bacaLedgerBallotTulis(pdp, "alamat-a")).rejects.toThrow(GalatEligibility);
  });
});

describe("ambilJalurEligibility", () => {
  const daun = new Uint8Array(32).fill(1);

  it("mengembalikan path segera bila percobaan pertama sudah ketemu", async () => {
    ledgerMock.mockReturnValue(ledgerDengan({ leaf: daun, path: [] }));
    const pdp = providerDengan([stateSintetis()]);
    await expect(ambilJalurEligibility(pdp, "alamat-a", daun, { tunda: tundaInstan })).resolves.toEqual({
      leaf: daun,
      path: [],
    });
  });

  it("mengulang sampai path ditemukan, TANPA menunggu jam dinding sungguhan", async () => {
    let panggilan = 0;
    ledgerMock.mockImplementation(() => {
      panggilan += 1;
      return ledgerDengan(panggilan < 3 ? undefined : { leaf: daun, path: [] });
    });
    const pdp = providerDengan([stateSintetis(), stateSintetis(), stateSintetis()]);
    const mulai = Date.now();
    await expect(
      ambilJalurEligibility(pdp, "alamat-a", daun, { tunda: tundaInstan, percobaan: 6, jedaMs: 5_000 }),
    ).resolves.toEqual({ leaf: daun, path: [] });
    expect(Date.now() - mulai).toBeLessThan(100); // tunda disuntik instan — bukti tidak bergantung jam dinding
  });

  it("melempar setelah kehabisan percobaan, pesan menyebut jumlah percobaan, TANPA tunda ekstra sesudahnya", async () => {
    const tunda = vi.fn(tundaInstan);
    ledgerMock.mockReturnValue(ledgerDengan(undefined));
    const pdp = providerDengan([stateSintetis()]);
    await expect(
      ambilJalurEligibility(pdp, "alamat-a", daun, { tunda, percobaan: 3, jedaMs: 1 }),
    ).rejects.toThrow(/3 attempts/);
    // 3 percobaan, tunda hanya di ANTARA percobaan (0 dan 1) — bukan setelah yang terakhir.
    expect(tunda).toHaveBeenCalledTimes(2);
  });

  it("membaca ULANG ledger pada setiap percobaan (root selalu terbaru, Keputusan #4)", async () => {
    const pdp = providerDengan([stateSintetis(), stateSintetis(), stateSintetis()]);
    ledgerMock.mockReturnValueOnce(ledgerDengan(undefined));
    ledgerMock.mockReturnValueOnce(ledgerDengan(undefined));
    ledgerMock.mockReturnValueOnce(ledgerDengan({ leaf: daun, path: [] }));
    await ambilJalurEligibility(pdp, "alamat-a", daun, { tunda: tundaInstan, percobaan: 3, jedaMs: 1 });
    expect(pdp.queryContractState).toHaveBeenCalledTimes(3);
  });

  // Dua uji di bawah TIDAK ada di draf brief — ditambahkan karena requirement
  // eksplisit "Perbedaan [galat jaringan vs kalah balapan] harus terlihat di
  // kode DAN DI PESAN GALATNYA". Keenam uji draf brief tidak pernah membuat
  // queryContractState menolak (reject) sama sekali, jadi cabang catch di
  // ambilPathDenganRetry (galatTerakhir) tidak pernah teruji — mutasi di
  // cabang itu akan HIJAU tanpa uji ini.
  function providerYangMenolak(pesan: string): Pick<PublicDataProvider, "queryContractState"> {
    return { queryContractState: vi.fn(async () => Promise.reject(new Error(pesan))) };
  }

  function providerCampuran(
    urutan: Array<"tolak" | ContractState>,
  ): Pick<PublicDataProvider, "queryContractState"> {
    let i = 0;
    return {
      queryContractState: vi.fn(async () => {
        const langkah = urutan[Math.min(i++, urutan.length - 1)];
        if (langkah === "tolak") throw new Error("indexer tidak menjawab");
        return langkah;
      }),
    };
  }

  it("pesan galat menyebut kegagalan PEMBACAAN INDEXER (bukan kalah balapan) bila SETIAP percobaan gagal membaca", async () => {
    const pdp = providerYangMenolak("indexer down");
    await expect(
      ambilJalurEligibility(pdp, "alamat-a", daun, { tunda: tundaInstan, percobaan: 3, jedaMs: 1 }),
    ).rejects.toThrow(/The indexer read itself failed/);
  });

  it("pesan galat menyebut KALAH BALAPAN (bukan galat indexer) bila pembacaan TERAKHIR berhasil walau percobaan sebelumnya sempat gagal", async () => {
    ledgerMock.mockReturnValue(ledgerDengan(undefined));
    const pdp = providerCampuran(["tolak", stateSintetis(), stateSintetis()]);
    await expect(
      ambilJalurEligibility(pdp, "alamat-a", daun, { tunda: tundaInstan, percobaan: 3, jedaMs: 1 }),
    ).rejects.toThrow(/lost a race/);
  });
});

describe("ambilJalurCommitment", () => {
  it("menargetkan commitments, bukan eligibility", async () => {
    const commitment = new Uint8Array(32).fill(9);
    const lb = ledgerDengan({ leaf: commitment, path: [] });
    const spyCommitments = vi.spyOn(lb.commitments, "findPathForLeaf");
    const spyEligibility = vi.spyOn(lb.eligibility, "findPathForLeaf");
    ledgerMock.mockReturnValue(lb);
    const pdp = providerDengan([stateSintetis()]);
    await ambilJalurCommitment(pdp, "alamat-a", commitment, { tunda: tundaInstan });
    expect(spyCommitments).toHaveBeenCalledWith(commitment);
    expect(spyEligibility).not.toHaveBeenCalled();
  });
});

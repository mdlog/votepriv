// providers-tulis (rakitProvidersBallotBrowser) TIDAK di-mock di berkas ini —
// hanya wallet/eligibility/artefak-ZK/findDeployedContract yang di-mock (lihat
// komentar brief di atas). Itu berarti privateStateProvider ASLI (IndexedDB,
// Task 1) benar-benar dipakai kirimSuara(), dan environment "node" (lihat
// vitest.config.ts) tidak punya `indexedDB` bawaan.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BallotPrivateState } from "@pkgs/contract/src/ballot-witnesses.js";
import * as Ballot from "@pkgs/contract/src/managed/ballot/contract/index.js";
import type { Ledger as LedgerBallot } from "@pkgs/contract/src/managed/ballot/contract/index.js";
import type { WalletConnection } from "@/lib/midnight-wallet";

// Dipakai HANYA oleh uji nullifierHex di bawah, untuk membandingkan hasil
// bukaSuara() terhadap tally_nullifier(salt) yang dihitung independen di sini
// — bukan disalin dari implementasi tulis.ts.
function bytesKeHexUji(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

const { setNetworkIdMock } = vi.hoisted(() => ({ setNetworkIdMock: vi.fn() }));
vi.mock("@midnight-ntwrk/midnight-js-network-id", () => ({ setNetworkId: setNetworkIdMock, getNetworkId: () => "preview" }));

const { findDeployedContractMock } = vi.hoisted(() => ({ findDeployedContractMock: vi.fn() }));
vi.mock("@midnight-ntwrk/midnight-js-contracts", async (impor) => {
  const asli = await impor<typeof import("@midnight-ntwrk/midnight-js-contracts")>();
  return { ...asli, findDeployedContract: findDeployedContractMock };
});

const { pastikanArtefakZkMurahMock } = vi.hoisted(() => ({ pastikanArtefakZkMurahMock: vi.fn(async () => {}) }));
vi.mock("./zk-config-fetch", async (impor) => {
  const asli = await impor<typeof import("./zk-config-fetch")>();
  return { ...asli, pastikanArtefakZkMurah: pastikanArtefakZkMurahMock };
});

const { ambilJalurEligibilityMock, ambilJalurCommitmentMock, bacaLedgerBallotTulisMock } = vi.hoisted(() => ({
  ambilJalurEligibilityMock: vi.fn(async () => ({ leaf: new Uint8Array(32), path: [] })),
  ambilJalurCommitmentMock: vi.fn(async () => ({ leaf: new Uint8Array(32), path: [] })),
  bacaLedgerBallotTulisMock: vi.fn<(pdp: unknown, alamat: string) => Promise<LedgerBallot>>(),
}));
vi.mock("./eligibility-tulis", async (impor) => {
  const asli = await impor<typeof import("./eligibility-tulis")>();
  return {
    ...asli,
    ambilJalurEligibility: ambilJalurEligibilityMock,
    ambilJalurCommitment: ambilJalurCommitmentMock,
    bacaLedgerBallotTulis: bacaLedgerBallotTulisMock,
  };
});

const { buatAdaptorLaceMock } = vi.hoisted(() => ({
  buatAdaptorLaceMock: vi.fn(() => ({
    getCoinPublicKey: () => "cpk",
    getEncryptionPublicKey: () => "epk",
    balanceTx: async (tx: unknown) => tx,
    submitTx: async () => "tx-id-sukses",
  })),
}));
vi.mock("./adaptor-lace", () => ({ buatAdaptorLace: buatAdaptorLaceMock }));

const { kirimSuara, GalatCastVote, bukaSuara, pulihkanOpeningDariCadangan, GalatOpeningHilang } =
  await import("./tulis");

/**
 * Ledger sintetis LENGKAP (pola sama dengan eligibility-tulis.test.ts Task 3
 * dan dekode.ledger-sintetis.test.ts) — override hanya dua hal yang uji-uji
 * di bawah benar-benar butuh, `tidakDipakai` mengisi sisanya tanpa satu pun
 * `as unknown`/`as any`.
 */
function ledgerContoh(over: { ballotNonce?: Uint8Array; nullifierAda?: boolean } = {}): LedgerBallot {
  const tidakDipakai = (): never => {
    throw new Error("tidak dipakai di uji ini");
  };
  return {
    title: "", description: "", community: "", option0: "", option1: "", option2: "", option3: "",
    optionCount: 0n, voteDeadline: 0n, tallyDeadline: 0n, quorumPercent: 0n, eligibleCount: 0n,
    eligibilityPolicy: "", adminKey: new Uint8Array(32),
    ballotNonce: over.ballotNonce ?? new Uint8Array(32).fill(4),
    phase: 0,
    eligibility: {
      isFull: tidakDipakai, checkRoot: tidakDipakai, root: tidakDipakai, firstFree: tidakDipakai,
      pathForLeaf: tidakDipakai, findPathForLeaf: tidakDipakai, history: tidakDipakai,
    },
    voteCount: 0n, registeredCount: 0n,
    nullifiers: {
      isEmpty: tidakDipakai, size: tidakDipakai, member: () => over.nullifierAda ?? false,
      [Symbol.iterator]: tidakDipakai,
    },
    commitments: {
      isFull: tidakDipakai, checkRoot: tidakDipakai, root: tidakDipakai, firstFree: tidakDipakai,
      pathForLeaf: tidakDipakai, findPathForLeaf: tidakDipakai,
    },
    tallyNullifiers: { isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, [Symbol.iterator]: tidakDipakai },
    tallies: {
      isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, lookup: tidakDipakai,
      [Symbol.iterator]: tidakDipakai,
    },
    talliedCount: 0n,
  };
}

function walletContoh(): WalletConnection {
  return {
    address: "mn_shield-addr_test1x",
    coinPublicKey: "cpk",
    encryptionPublicKey: "epk",
    networkId: "preview",
    connectorName: "lace",
    apiVersion: "4.0.1",
    api: {},
  };
}

function psTiruan() {
  const isi = new Map<string, unknown>();
  return {
    setContractAddress: vi.fn(),
    get: vi.fn(async (id: string) => (isi.get(id) as BallotPrivateState | undefined) ?? null),
    set: vi.fn(async (id: string, v: BallotPrivateState) => {
      isi.set(id, v);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bacaLedgerBallotTulisMock.mockResolvedValue(ledgerContoh());
  // tulis.ts membaca `location.origin` (pola sama dengan proof-server.ts) —
  // global ini tidak ada di bawah environment "node" (lihat vitest.config.ts),
  // jadi di-stub di sini, bukan dibiarkan ReferenceError.
  vi.stubGlobal("location", { origin: "https://app.example" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kirimSuara", () => {
  const paramDasar = {
    alamatBallot: "a".repeat(64),
    credentialHex: "b".repeat(64),
    opsi: 1,
    jaringan: "preview" as const,
  };

  it("memanggil setNetworkId SEBELUM apa pun yang lain", async () => {
    const psp = psTiruan();
    const ballotCallTx = { castVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) };
    findDeployedContractMock.mockResolvedValue({ callTx: ballotCallTx });
    // Ganti privateStateProvider yang dipakai lewat rakitProvidersBallotBrowser
    // sungguhan (Task 4 tidak di-mock) TIDAK praktis diuji identitasnya di
    // sini — cukup pastikan setNetworkId terpanggil sebelum findDeployedContract.
    findDeployedContractMock.mockImplementationOnce(async () => {
      expect(setNetworkIdMock).toHaveBeenCalledWith("preview");
      return { callTx: ballotCallTx };
    });
    await kirimSuara(paramDasar, walletContoh());
    expect(setNetworkIdMock).toHaveBeenCalledTimes(1);
  });

  it("memeriksa artefak ZK murah SEBELUM findDeployedContract", async () => {
    const urutan: string[] = [];
    pastikanArtefakZkMurahMock.mockImplementation(async () => {
      urutan.push("zk");
    });
    findDeployedContractMock.mockImplementation(async () => {
      urutan.push("find");
      return { callTx: { castVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) } };
    });
    await kirimSuara(paramDasar, walletContoh());
    expect(urutan).toEqual(["zk", "find"]);
  });

  it("melempar GalatCastVote berkode ARTEFAK_ZK bila artefak ZK gagal, TIDAK memanggil findDeployedContract", async () => {
    pastikanArtefakZkMurahMock.mockRejectedValueOnce(new Error("404"));
    // toMatchObject memeriksa DUA field NILAI, bukan cuma keanggotaan "punya
    // properti name": `kode` HARUS "ARTEFAK_ZK", bukan sekadar "sesuatu yang
    // bernama GalatCastVote" — kalau hanya `name` yang diperiksa, mutasi yang
    // membuang try/catch di sekitar pastikanArtefakZkMurah tetap lolos, sebab
    // catch-all di kirimSuara toh membungkus SEMUA galat jadi GalatCastVote
    // (dengan kode "TIDAK_DIKENAL"), dan `name`-nya sama-sama "GalatCastVote".
    await expect(kirimSuara(paramDasar, walletContoh())).rejects.toMatchObject({
      name: "GalatCastVote",
      kode: "ARTEFAK_ZK",
    });
    expect(findDeployedContractMock).not.toHaveBeenCalled();
  });

  it("melempar bila credentialHex bukan 64 hex", async () => {
    await expect(kirimSuara({ ...paramDasar, credentialHex: "bukan-hex" }, walletContoh())).rejects.toThrow(
      /64 karakter heksadesimal/,
    );
  });

  it("sukses: mengembalikan txId dan nullifierHex, memanggil onStatus berurutan", async () => {
    const urutanStatus: string[] = [];
    findDeployedContractMock.mockResolvedValue({
      callTx: { castVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-sukses" } })) },
    });
    const hasil = await kirimSuara({ ...paramDasar, onStatus: (t) => urutanStatus.push(t) }, walletContoh());
    expect(hasil.txId).toBe("tx-sukses");
    expect(hasil.nullifierHex).toHaveLength(64);
    expect(urutanStatus[0]).toBe("menyiapkan-artefak");
    expect(urutanStatus.at(-1)).toBe("menunggu-indexer");
  });

  it("memanggil onOpeningTersimpan TEPAT SEBELUM castVote dipanggil", async () => {
    const castVote = vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } }));
    findDeployedContractMock.mockResolvedValue({ callTx: { castVote } });
    let dipanggilSebelumCastVote = false;
    await kirimSuara(
      {
        ...paramDasar,
        onOpeningTersimpan: () => {
          dipanggilSebelumCastVote = castVote.mock.calls.length === 0;
        },
      },
      walletContoh(),
    );
    expect(dipanggilSebelumCastVote).toBe(true);
  });

  it("status akhir bukan SucceedEntirely melempar GalatCastVote berkode ON_CHAIN", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: { castVote: vi.fn(async () => ({ public: { status: "FailEntirely", txId: "tx-gagal" } })) },
    });
    await expect(kirimSuara(paramDasar, walletContoh())).rejects.toMatchObject({ kode: "ON_CHAIN" });
  });

  it("bila callTx.castVote MELEMPAR tapi nullifier TERNYATA sudah ada di ledger, galat membawa mungkinSudahMasuk", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: {
        castVote: vi.fn(async () => {
          throw new Error("indexer terputus setelah submit");
        }),
      },
    });
    bacaLedgerBallotTulisMock.mockResolvedValue(ledgerContoh({ nullifierAda: true }));
    const galat = await kirimSuara(paramDasar, walletContoh()).catch((e) => e);
    expect(galat).toBeInstanceOf(GalatCastVote);
    expect(galat.mungkinSudahMasuk?.nullifierHex).toHaveLength(64);
  });

  it("bila callTx.castVote MELEMPAR dan nullifier TIDAK ada di ledger, galat TIDAK membawa mungkinSudahMasuk", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: {
        castVote: vi.fn(async () => {
          throw new Error("wallet menolak");
        }),
      },
    });
    bacaLedgerBallotTulisMock.mockResolvedValue(ledgerContoh({ nullifierAda: false }));
    const galat = await kirimSuara(paramDasar, walletContoh()).catch((e) => e);
    expect(galat).toBeInstanceOf(GalatCastVote);
    expect(galat.mungkinSudahMasuk).toBeUndefined();
  });

  it("findDeployedContract dipanggil SEBELUM private state ditulis", async () => {
    const urutan: string[] = [];
    const psp = {
      setContractAddress: vi.fn(),
      get: vi.fn(async () => null),
      set: vi.fn(async () => {
        urutan.push("set");
      }),
    };
    vi.doMock("./providers-tulis", async (impor) => {
      const asli = await impor<typeof import("./providers-tulis")>();
      return {
        ...asli,
        rakitProvidersBallotBrowser: (kp: unknown) => ({
          ...asli.rakitProvidersBallotBrowser(kp as never),
          privateStateProvider: psp,
        }),
      };
    });
    findDeployedContractMock.mockImplementation(async () => {
      urutan.push("find");
      return { callTx: { castVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) } };
    });
    vi.resetModules();
    const { kirimSuara: kirimSuaraSegar } = await import("./tulis");
    await kirimSuaraSegar(paramDasar, walletContoh());
    expect(urutan).toEqual(["find", "set"]);
  });
});

describe("bukaSuara", () => {
  // "b".repeat(64), BUKAN "a".repeat(64): "a".repeat(64) adalah alamatBallot
  // yang dipakai SELURUH describe("kirimSuara", ...) di atas, dan
  // privateStateProvider di berkas ini adalah IndexedDB SUNGGUHAN
  // (fake-indexeddb, tidak di-mock — sama seperti kirimSuara) yang bertahan
  // untuk SELURUH proses uji ini, bukan di-reset per `it`. Memakai alamat yang
  // sama akan mewarisi opening yang sudah ditulis test kirimSuara lain —
  // tepat kebocoran yang ingin dihindari komentar brief Task 7 Step 1.
  const paramDasar = { alamatBallot: "b".repeat(64), jaringan: "preview" as const };

  it("findDeployedContract dipanggil TANPA initialPrivateState (tidak menimpa opening tersimpan)", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: { tallyVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) },
    });
    await expect(bukaSuara(paramDasar, walletContoh())).rejects.toBeInstanceOf(GalatOpeningHilang);
    const opts = findDeployedContractMock.mock.calls.at(-1)?.[1];
    expect(opts).not.toHaveProperty("initialPrivateState");
  });

  it("melempar GalatOpeningHilang (bukan GalatCastVote generik) bila tidak ada opening tersimpan", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: { tallyVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) },
    });
    const galat = await bukaSuara({ alamatBallot: "f".repeat(64), jaringan: "preview" }, walletContoh()).catch(
      (e) => e,
    );
    expect(galat).toBeInstanceOf(GalatOpeningHilang);
    expect(galat.name).toBe("GalatOpeningHilang");
    expect(galat.message).toMatch(/pulihkan dari berkas cadangan/);
  });

  it("pulihkanOpeningDariCadangan menulis opening yang lalu terbaca bukaSuara", async () => {
    await pulihkanOpeningDariCadangan({ alamatBallot: paramDasar.alamatBallot, opsi: 2, saltHex: "c".repeat(64) });
    const tallyVote = vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-tally" } }));
    findDeployedContractMock.mockResolvedValue({ callTx: { tallyVote } });
    const hasil = await bukaSuara(paramDasar, walletContoh());
    expect(hasil.txId).toBe("tx-tally");
    expect(tallyVote).toHaveBeenCalledTimes(1);
  });

  it("jalur commitment dibangun FRESH lewat ambilJalurCommitment, bukan ambilJalurEligibility", async () => {
    await pulihkanOpeningDariCadangan({ alamatBallot: paramDasar.alamatBallot, opsi: 0, saltHex: "d".repeat(64) });
    findDeployedContractMock.mockResolvedValue({
      callTx: { tallyVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-2" } })) },
    });
    await bukaSuara(paramDasar, walletContoh());
    expect(ambilJalurCommitmentMock).toHaveBeenCalled();
    expect(ambilJalurEligibilityMock).not.toHaveBeenCalled();
  });

  it("status akhir bukan SucceedEntirely melempar GalatCastVote berkode ON_CHAIN", async () => {
    await pulihkanOpeningDariCadangan({ alamatBallot: paramDasar.alamatBallot, opsi: 0, saltHex: "e".repeat(64) });
    findDeployedContractMock.mockResolvedValue({
      callTx: { tallyVote: vi.fn(async () => ({ public: { status: "FailFallible", txId: "tx-3" } })) },
    });
    await expect(bukaSuara(paramDasar, walletContoh())).rejects.toMatchObject({ kode: "ON_CHAIN" });
  });

  it("nullifierHex yang dikembalikan adalah tally_nullifier(salt) — BUKAN nullifier ala castVote", async () => {
    // Guard mutasi WAJIB #1 (brief): "pakai nullifier castVote untuk
    // tallyVote (alih-alih yang diturunkan dari salt)". Tidak satu pun uji
    // di atas memeriksa NILAI nullifierHex (hanya txId) — tanpa uji ini,
    // menukar tally_nullifier(salt) dengan vote_nullifier(...) pada baris
    // return bukaSuara() lolos diam-diam.
    const saltHex = "9".repeat(64);
    await pulihkanOpeningDariCadangan({ alamatBallot: paramDasar.alamatBallot, opsi: 1, saltHex });
    findDeployedContractMock.mockResolvedValue({
      callTx: { tallyVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-nf" } })) },
    });
    const hasil = await bukaSuara(paramDasar, walletContoh());
    const salt = new Uint8Array(32).fill(0x99);
    const tnfDiharapkan = bytesKeHexUji(Ballot.pureCircuits.tally_nullifier(salt));
    expect(hasil.nullifierHex).toBe(tnfDiharapkan);
    // Bukti negatif: nullifier ala castVote (vote_nullifier) memakai
    // ballotNonce+credential, bentuknya beda dari tally_nullifier(salt) untuk
    // masukan yang sama — kedua nilai TIDAK BOLEH pernah kebetulan sama.
    const nfCastVoteStyle = bytesKeHexUji(Ballot.pureCircuits.vote_nullifier(salt, salt));
    expect(hasil.nullifierHex).not.toBe(nfCastVoteStyle);
  });
});

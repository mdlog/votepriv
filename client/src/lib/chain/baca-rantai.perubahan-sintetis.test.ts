import { describe, expect, it, vi } from "vitest";
import type { Ledger as LedgerBallot } from "@pkgs/contract/src/managed/ballot/contract/index.js";
import type { Ledger as LedgerRegistry } from "@pkgs/contract/src/managed/registry/contract/index.js";
import type { JaringanAktif } from "./endpoint";
import {
  proyeksikanJawabanJaringan,
  proyeksikanJawabanKontrak,
  type KontrakSuperset,
} from "../../test/proyeksi-kueri-rantai";

/**
 * K2 (temuan KRITIS — lihat task-5-hasil-mutasi.md): di fixture rekaman,
 * voteCount bernilai 3 pada KELIMA aksi b0 dan 0 pada kedua aksi b1 — TIDAK
 * ADA satu pun pasangan aksi berurutan di seluruh fixture yang berselisih
 * voteCount. Data nyata tidak bisa menutup ini: menghapus
 * `voteCount: k.voteCount,` dari cuplikanBallot() di baca-rantai.ts (M1)
 * adalah mutasi TANPA EFEK terhadap baca-rantai.test.ts maupun
 * baca-rantai.registry-sintetis.test.ts sekalipun.
 *
 * Berkas ini memalsukan `ledger()` BALLOT (bukan hanya registry seperti
 * baca-rantai.registry-sintetis.test.ts) DAN `ContractState.deserialize`,
 * dengan pola yang identik dengan dekode.ledger-sintetis.test.ts — terikat ke
 * tipe `Ledger` sungguhan lewat parameter generik `vi.fn()`, bukan objek
 * literal bebas — supaya voteCount bisa BERBEDA antara dua aksi berurutan
 * pada ballot yang sama. Bedanya dengan dekode.ledger-sintetis.test.ts:
 * berkas itu menguji dekodeBallot() SENDIRIAN; berkas ini menjalankan
 * bacaRantai() UTUH (lewat indexer sintetis yang menurunkan jawabannya dari
 * field yang benar-benar diminta, seperti baca-rantai.registry-sintetis.
 * test.ts), supaya perbedaan voteCount itu sungguh-sungguh mengalir sampai
 * ke `PerubahanAksi` yang diproduksi keAksiTerbaca().
 *
 * `state` di berkas ini BUKAN hex ballot sungguhan (beda dari
 * baca-rantai.registry-sintetis.test.ts yang memakai ulang STATE_BALLOT_ASLI
 * dari fixture): ContractState.deserialize dimock di sini juga, jadi hex-nya
 * hanya perlu SATU byte tag yang valid secara SINTAKS, dipetakan ke ledger
 * ballot sintetis lewat ledgerBallotMock.
 */

const { ledgerRegistryMock, ledgerBallotMock } = vi.hoisted(() => ({
  ledgerRegistryMock: vi.fn<(charged: unknown) => LedgerRegistry>(),
  ledgerBallotMock: vi.fn<(charged: Uint8Array) => LedgerBallot>(),
}));

vi.mock("@midnight-ntwrk/compact-runtime", () => ({
  // keChargedState hanya butuh .data; di sini .data adalah BYTES apa adanya
  // (bukan string dekode WASM sungguhan), supaya ledgerBallotMock bisa
  // membedakan "tag" lewat byte pertamanya.
  ContractState: { deserialize: (bita: Uint8Array) => ({ data: bita }) },
}));

vi.mock("@pkgs/contract/src/managed/registry/contract/index.js", () => ({
  ledger: (charged: unknown) => ledgerRegistryMock(charged),
}));

vi.mock("@pkgs/contract/src/managed/ballot/contract/index.js", () => ({
  ledger: (charged: Uint8Array) => ledgerBallotMock(charged),
}));

const { bacaRantai } = await import("./baca-rantai");

/** Melempar tanpa terkecuali — metode Ledger yang WAJIB ada tapi tidak pernah
 * benar-benar dipanggil dekode.ts (mis. Merkle root/path). Pola identik
 * dekode.ledger-sintetis.test.ts. */
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
    member: key => pasangan.some(([k]) => k === key),
    lookup: key => {
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
    eligibleCount: 5n,
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
  const dasar: LedgerRegistry = { ballots: bungkusBallots([]), count: 0n };
  return { ...dasar, ...overrides };
}

function respon(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });
}

const ALAMAT_BALLOT = "6".repeat(64);
const ALAMAT_REGISTRY = "9".repeat(64);
const JARINGAN: JaringanAktif = {
  networkId: "preview",
  indexer: "https://contoh.test/graphql",
  indexerWS: "wss://contoh.test/ws",
  alamatRegistry: ALAMAT_REGISTRY,
};

/** State 1-byte sintetis: tag "01" milik ballot ini SENDIRI (dipakai untuk
 * dekode k.state, yaitu judul/fase ballot); "02" aksi LEBIH TUA (pendahulu,
 * indeks 1 di larik aksi — terbaru di depan); "03" aksi LEBIH BARU (kini,
 * indeks 0). Hanya voteCount yang berbeda antara "02" dan "03" — seluruh
 * bidang lain SAMA — supaya kontribusi voteCount pada `perubahan` terlihat
 * MURNI, tanpa bidang lain yang ikut menutupinya. */
const STATE_BALLOT_SENDIRI = "01";
const STATE_AKSI_LAMA = "02";
const STATE_AKSI_BARU = "03";
const STATE_REGISTRY = "09";

function indexerSintetis(): typeof fetch {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
    if (nama === "Jaringan") {
      const superset = { block: { height: 1, timestamp: 1, hash: "h" }, currentEpochInfo: null };
      return respon({ data: proyeksikanJawabanJaringan(body.query, superset), errors: [] });
    }
    if (nama === "Registry") {
      const superset: KontrakSuperset = {
        address: ALAMAT_REGISTRY,
        state: STATE_REGISTRY,
        deploy: [{ transaction: { hash: "deploy-registry", block: { height: 1, timestamp: 1 } } }],
        // Kosong dengan SENGAJA: uji ini memeriksa selisih voteCount pada
        // aksi BALLOT, bukan aksi registry — lihat baca-rantai.test.ts dan
        // baca-rantai.registry-sintetis.test.ts untuk cakupan aksi registry.
        terbaru: [],
      };
      return respon({ data: proyeksikanJawabanKontrak(body.query, { r: superset }), errors: [] });
    }
    const supersetPerAlias: Record<string, KontrakSuperset> = {};
    for (const kunciVar of Object.keys(body.variables as Record<string, string>)) {
      const alias = `b${kunciVar.slice(1)}`;
      supersetPerAlias[alias] = {
        address: ALAMAT_BALLOT,
        state: STATE_BALLOT_SENDIRI,
        deploy: [{ transaction: { hash: "deploy-ballot", block: { height: 1, timestamp: 1 } } }],
        terbaru: [
          {
            __typename: "ContractCall",
            entryPoint: "castVote",
            state: STATE_AKSI_BARU,
            transaction: { hash: "aksi-baru", block: { height: 2, timestamp: 2 } },
          },
          {
            __typename: "ContractCall",
            entryPoint: "castVote",
            state: STATE_AKSI_LAMA,
            transaction: { hash: "aksi-lama", block: { height: 1, timestamp: 1 } },
          },
        ],
      };
    }
    return respon({ data: proyeksikanJawabanKontrak(body.query, supersetPerAlias), errors: [] });
  }) as unknown as typeof fetch;
}

describe("bacaRantai — voteCount MENGHASILKAN selisih (K2)", () => {
  it("voteCount berbeda (3→5) antara dua aksi berurutan pada ballot yang sama menghasilkan PerubahanAksi bersebab voteCount, dengan bidang lain identik", async () => {
    ledgerRegistryMock.mockReturnValue(
      ledgerRegistryDasar({ count: 1n, ballots: bungkusBallots([ALAMAT_BALLOT]) }),
    );
    ledgerBallotMock.mockImplementation((bytes: Uint8Array) => {
      const tag = bytes[0];
      if (tag === 1) return ledgerBallotDasar({ voteCount: 9n }); // state ballot sendiri, tak relevan untuk diff
      if (tag === 2) return ledgerBallotDasar({ voteCount: 3n, talliedCount: 0n, registeredCount: 1n, phase: 0 });
      if (tag === 3) return ledgerBallotDasar({ voteCount: 5n, talliedCount: 0n, registeredCount: 1n, phase: 0 });
      throw new Error(`tag ballot sintetis tak dikenal: ${tag}`);
    });

    const h = await bacaRantai({ jaringan: JARINGAN, ambil: indexerSintetis() });

    expect(h.gagal).toEqual([]);
    expect(h.ballot).toHaveLength(1);
    const aksi = h.ballot[0].aksi;
    expect(aksi).toHaveLength(2);

    // aksi[0] = kini (state "03", voteCount 5); aksi[1] = pendahulu (state
    // "02", voteCount 3). Ini SATU-SATUNYA bidang yang berbeda di pasangan
    // ini — bila `voteCount: k.voteCount,` dihapus dari cuplikanBallot()
    // (M1), larik ini jadi KOSONG karena tidak ada bidang lain yang berubah.
    expect(aksi[0].cuplikanTerbaca).toBe(true);
    expect(aksi[0].pendahuluTerbaca).toBe(true);
    expect(aksi[0].perubahan).toEqual([{ bidang: "voteCount", dari: 3, ke: 5 }]);
    expect(aksi[1].pendahuluTerbaca).toBe(false);
    expect(aksi[1].perubahan).toEqual([]);
  });
});

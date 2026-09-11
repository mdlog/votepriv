import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Ledger as LedgerRegistry } from "@pkgs/contract/src/managed/registry/contract/index.js";
import type { JaringanAktif } from "./endpoint";

/**
 * Uji dengan REGISTRY SINTETIS — bukan fixture rekaman.
 *
 * Alasan berkas terpisah dari baca-rantai.test.ts, dan pola mock-nya: identik
 * dengan dekode.ledger-sintetis.test.ts (lihat komentarnya). Fixture rekaman di
 * client/src/test/fixture-rantai/ hanya memuat DUA ballot — jauh di bawah
 * MAKS_BALLOT_BERAKSI (6) dan MAKS_ALAMAT_PER_DOKUMEN (24) di baca-rantai.ts.
 * Praperiksa P1 menunjukkan akibatnya: dengan hanya dua ballot, SETIAP alias di
 * dokumen Ballots memakai ...Penuh, sehingga cabang ...Ringkas, penghitungan
 * lintas-dokumen `sudahBerAksi`, dan pemangkas `pangkasMenurutDokumen` di
 * baca-rantai.test.ts TIDAK PERNAH benar-benar menggigit — regresi yang
 * menghapus pembagian dua fragmen seluruhnya akan tetap hijau di sana.
 *
 * Berkas ini memalsukan HANYA `ledger()` registry (lewat vi.mock, terikat ke
 * tipe LedgerRegistry sungguhan seperti pola dekode.ledger-sintetis.test.ts —
 * bukan objek literal bebas), supaya `registry.ballots` bisa berisi puluhan
 * alamat tanpa perlu registry sungguhan sebesar itu di jaringan. `ledger()`
 * BALLOT sengaja TIDAK dipalsukan: setiap alamat sintetis memakai `state`
 * ballot ASLI dari fixture (dipakai ulang untuk banyak alamat sekaligus — isi
 * per-alamatnya tidak relevan untuk uji ini), sehingga dekodeBallot() yang
 * SUNGGUHAN tetap dijalankan lewat WASM sungguhan, persis seperti produksi.
 *
 * Indexer-nya sendiri juga tidak dikalengkan dari fixture: fungsi
 * `indexerSintetis()` di bawah membaca APA YANG SEBENARNYA DIMINTA dari teks
 * kueri yang dikirim (alias mana memakai ...Penuh vs ...Ringkas, ada berapa
 * dokumen) dan menjawab sesuai itu — cara paling jujur untuk memverifikasi
 * bahwa susunKueriBallot() dan bacaRantai() sungguh-sungguh bekerja sama,
 * bukan hanya bahwa jawaban kalengan kebetulan cocok dengan yang diharapkan.
 */

const { ledgerRegistryMock } = vi.hoisted(() => ({
  ledgerRegistryMock: vi.fn<(charged: unknown) => LedgerRegistry>(),
}));

vi.mock("@pkgs/contract/src/managed/registry/contract/index.js", () => ({
  ledger: (charged: unknown) => ledgerRegistryMock(charged),
}));

const { bacaRantai } = await import("./baca-rantai");

const DIR = new URL("../../test/fixture-rantai/", import.meta.url);
const baca = (n: string) => JSON.parse(readFileSync(new URL(n, DIR), "utf8"));
const fxRegistry = baca("registry.json");
const fxBallots = baca("ballots.json");
const fxJaringan = baca("jaringan.json");
const meta = baca("meta.json");

/** State ballot ASLI (hex nyata dari fixture), dipakai ulang untuk setiap
 * alamat sintetis. dekodeBallot() sungguhan mendekode ini lewat WASM
 * sungguhan; isinya sama untuk setiap alamat, tapi itu tidak relevan — uji di
 * berkas ini memeriksa PENGELOMPOKAN alamat (Penuh/Ringkas, lintas dokumen),
 * bukan isi ledger per alamat (itu sudah dicakup baca-rantai.test.ts dan
 * dekode.test.ts). */
const STATE_BALLOT_ASLI: string = fxBallots.jawaban.data.b0.state;

const JARINGAN: JaringanAktif = {
  networkId: meta.jaringan,
  indexer: meta.endpoint,
  indexerWS: "wss://contoh.test/ws",
  alamatRegistry: meta.alamatRegistry,
};

function bungkusBallots(alamat: string[]): LedgerRegistry["ballots"] {
  return {
    isEmpty: () => alamat.length === 0,
    length: () => BigInt(alamat.length),
    head: () => (alamat.length > 0 ? { is_some: true, value: alamat[0] } : { is_some: false, value: "" }),
    [Symbol.iterator]: () => alamat[Symbol.iterator](),
  };
}

function ledgerRegistryDasar(overrides: Partial<LedgerRegistry> = {}): LedgerRegistry {
  const dasar: LedgerRegistry = { ballots: bungkusBallots([]), count: 0n };
  return { ...dasar, ...overrides };
}

function respon(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });
}

function memakaiPenuh(query: string, alias: string): boolean {
  return new RegExp(`\\b${alias}:\\s*contract\\([^)]*\\)\\s*\\{\\s*\\.\\.\\.Penuh\\s*\\}`).test(query);
}

function indexerSintetis(): typeof fetch {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
    if (nama === "Jaringan") return respon(fxJaringan);
    if (nama === "Registry") return respon(fxRegistry);
    const data: Record<string, unknown> = {};
    for (const [kunciVar, alamat] of Object.entries(body.variables as Record<string, string>)) {
      const alias = `b${kunciVar.slice(1)}`;
      const kontrak: Record<string, unknown> = {
        address: alamat,
        state: STATE_BALLOT_ASLI,
        deploy: [{ transaction: { hash: `deploy-${alamat}`, block: { height: 800000, timestamp: 1789100000000 } } }],
      };
      if (memakaiPenuh(body.query, alias)) {
        kontrak.terbaru = [
          {
            __typename: "ContractCall",
            entryPoint: "castVote",
            state: STATE_BALLOT_ASLI,
            transaction: { hash: `aksi-${alamat}`, block: { height: 800001, timestamp: 1789100001000 } },
          },
        ];
      }
      data[alias] = kontrak;
    }
    return respon({ data, errors: [] });
  }) as unknown as typeof fetch;
}

/** N alamat hex 64-nibble, valid dan berbeda satu sama lain. */
function alamatSintetis(n: number, mulai = 0): string[] {
  return Array.from({ length: n }, (_, i) => (500000 + mulai + i).toString(16).padStart(64, "0"));
}

async function panggilanBallots(ambil: typeof fetch) {
  const panggilan = (ambil as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
  return panggilan.map(([, init]) => JSON.parse(String(init.body))).filter(b => /query Ballots/.test(b.query));
}

describe("bacaRantai — jendela Penuh/Ringkas lintas dokumen (praperiksa P1)", () => {
  it("membagi 26 ballot sintetis menjadi 6 Penuh + 20 Ringkas, semuanya di dokumen PERTAMA — dokumen KEDUA tidak dapat jatah sama sekali", async () => {
    const ALAMAT = alamatSintetis(26);
    ledgerRegistryMock.mockReturnValue(ledgerRegistryDasar({ count: BigInt(ALAMAT.length), ballots: bungkusBallots(ALAMAT) }));

    const ambil = indexerSintetis();
    const h = await bacaRantai({ jaringan: JARINGAN, ambil });

    expect(h.ballot).toHaveLength(26);
    expect(h.gagal).toEqual([]);

    // Tepat dua dokumen Ballots: 26 alamat / MAKS_ALAMAT_PER_DOKUMEN (24) = keping 24 + 2.
    const dok = await panggilanBallots(ambil);
    expect(dok).toHaveLength(2);

    // Anggaran (6) habis SELURUHNYA di dokumen pertama (24 alamat >= 6), jadi
    // dokumen kedua tidak boleh memakai ...Penuh sama sekali. Inilah baris yang
    // membuktikan `sudahBerAksi` benar-benar dibawa LINTAS keping, bukan
    // di-reset per keping (yang akan menghasilkan [6, 2] dan bukan [6, 0], dan
    // berarti riwayat diambil DUA KALI untuk anggaran yang sama).
    const nPenuhPerDokumen = dok.map(d => (String(d.query).match(/\.\.\.Penuh/g) ?? []).length);
    expect(nPenuhPerDokumen).toEqual([6, 0]);
    // Dan ...Ringkas benar-benar terpakai di dokumen pertama — gerbang yang
    // fixture dua-ballot di baca-rantai.test.ts tidak pernah bisa membuktikan.
    expect(dok[0].query).toContain("...Ringkas");

    // Persis 6 ballot yang punya riwayat, dan persis yang PERTAMA di urutan
    // registry (pushFront => terbaru duluan) — bukan sembarang 6.
    const berAksi = h.ballot.filter(b => b.aksi.length > 0).map(b => b.alamat);
    expect(berAksi).toEqual(ALAMAT.slice(0, 6));
    for (const b of h.ballot.slice(6)) expect(b.aksi).toEqual([]);
  });
});

describe("bacaRantai — alamat sampah di registry disaring sebelum dikirim (praperiksa P2)", () => {
  it("mengeluarkan entri bukan-hex dari registry.ballots ke gagal[], dan TIDAK PERNAH mengirimkannya ke indexer", async () => {
    const [valid1, valid2] = alamatSintetis(2, 100);
    // Entri sampah sungguhan: registry.register() permissionless, jadi bentuk
    // ini bisa muncul dari kontrak manapun, bukan hanya dikarang uji.
    const SAMPAH = ["bukan-hex-sama-sekali", "", "abc"]; // "abc": nibble ganjil
    const alamat = [valid1, SAMPAH[0], valid2, SAMPAH[1], SAMPAH[2]];
    ledgerRegistryMock.mockReturnValue(ledgerRegistryDasar({ count: BigInt(alamat.length), ballots: bungkusBallots(alamat) }));

    const ambil = indexerSintetis();
    const h = await bacaRantai({ jaringan: JARINGAN, ambil });

    // Hanya yang valid yang berhasil dibaca, dalam urutan APA ADANYA registry.
    expect(h.ballot.map(b => b.alamat)).toEqual([valid1, valid2]);
    // Setiap entri sampah masuk gagal[] dengan sebab yang tepat, dan alamatnya
    // yang tercatat adalah alamat sampah itu sendiri — bukan diam-diam dibuang.
    expect(h.gagal.filter(g => g.sebab === "alamat-tak-sah").map(g => g.alamat)).toEqual(SAMPAH);

    // Baris yang sebelumnya tidak bisa merah (praperiksa P2): dokumen Ballots
    // yang BENAR-BENAR DIKIRIM tidak pernah memuat satu pun entri sampah.
    // Fixture rekaman punya dua alamat sah dan tidak bisa membuktikan ini;
    // registry sintetis di sini SENGAJA memuat sampah supaya baris ini benar-
    // benar bisa gagal kalau saringan alamatKontrakValid() dihapus.
    const dok = await panggilanBallots(ambil);
    expect(dok).toHaveLength(1);
    const nilaiVariabel = Object.values(dok[0].variables as Record<string, string>);
    expect(nilaiVariabel).toHaveLength(2);
    for (const s of SAMPAH) expect(nilaiVariabel).not.toContain(s);
    for (const v of nilaiVariabel) expect(v).toMatch(/^[0-9a-fA-F]+$/);
  });

  it("memotong registry pada MAKS_BALLOT (48) dan mencatat sisanya sebagai satu entri '+N'", async () => {
    const ALAMAT = alamatSintetis(50, 900);
    ledgerRegistryMock.mockReturnValue(ledgerRegistryDasar({ count: BigInt(ALAMAT.length), ballots: bungkusBallots(ALAMAT) }));

    const h = await bacaRantai({ jaringan: JARINGAN, ambil: indexerSintetis() });

    expect(h.ballot).toHaveLength(48);
    expect(h.ballot.map(b => b.alamat)).toEqual(ALAMAT.slice(0, 48));
    expect(h.gagal).toContainEqual(
      expect.objectContaining({ alamat: "+2", sebab: "alamat-tak-sah" }),
    );
  });
});

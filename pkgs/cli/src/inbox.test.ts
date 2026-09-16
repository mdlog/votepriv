// Uji inbox terhadap server HTTP SUNGGUHAN di port acak — bukan mock request:
// yang diuji adalah kontrak HTTP yang dipakai browser (CORS preflight, kode
// status, bentuk JSON) dan perilaku antrean (kirim SEGERA, satu transaksi
// pada satu waktu, leaf yang datang saat pengiriman menunggu putaran
// berikutnya).
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inbox, dengarkanInbox, normalisasiHex64, type LedgerInbox } from "./inbox.ts";

const BALLOT = "a".repeat(64);
const leaf = (n: number) => n.toString(16).padStart(64, "0");

type Kendali = {
  inbox: Inbox;
  url: string;
  tutup: () => Promise<void>;
  panggilan: string[][];
  selesaikan: (i: number, txId?: string, galat?: string) => void;
  ledger: { registeredCount: bigint; eligibleCount: bigint; voteDeadline: bigint; terdaftar: Set<string> };
};

const pembersih: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (pembersih.length) await pembersih.pop()!();
});

/**
 * `daftarkan` yang MENGGANTUNG sampai uji memutuskan (selesaikan(i)) —
 * supaya urutan "antre → submitting → registered" bisa diamati, bukan lewat
 * setTimeout yang menebak-nebak.
 */
async function siapkan(opsi: Partial<{ eligibleCount: bigint; batasPerIpPerJam: number; maksAntrean: number; voteDeadline: bigint }> = {}): Promise<Kendali> {
  const panggilan: string[][] = [];
  const penyelesai: Array<{ ok: (v: { txId: string }) => void; gagal: (e: Error) => void }> = [];
  const ledger = {
    registeredCount: 0n,
    eligibleCount: opsi.eligibleCount ?? 16n,
    voteDeadline: opsi.voteDeadline ?? BigInt(Math.floor(Date.now() / 1000) + 3600),
    terdaftar: new Set<string>(),
  };
  const inbox = new Inbox({
    alamatBallot: BALLOT,
    batasPerIpPerJam: opsi.batasPerIpPerJam,
    maksAntrean: opsi.maksAntrean,
    daftarkan: (leaves) =>
      new Promise((ok, gagal) => {
        panggilan.push([...leaves]);
        penyelesai.push({ ok, gagal });
      }),
    bacaLedger: async (): Promise<LedgerInbox> => ({
      registeredCount: ledger.registeredCount,
      eligibleCount: ledger.eligibleCount,
      voteDeadline: ledger.voteDeadline,
      leafTerdaftar: (l) => ledger.terdaftar.has(l),
    }),
  });
  const { server, port } = await dengarkanInbox(inbox, 0);
  pembersih.push(() => new Promise((r) => server.close(() => r())));
  return {
    inbox,
    url: `http://127.0.0.1:${port}`,
    tutup: () => new Promise((r) => server.close(() => r())),
    panggilan,
    selesaikan: (i, txId = "tx" + i, galat) => (galat ? penyelesai[i].gagal(new Error(galat)) : penyelesai[i].ok({ txId })),
    ledger,
  };
}

const kirim = (url: string, badan: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}/register`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(badan) });

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("normalisasiHex64", () => {
  it("menerima 64 hex (huruf besar, awalan 0x, spasi) dan menolak yang lain", () => {
    expect(normalisasiHex64(" 0x" + "AB".repeat(32) + " ")).toBe("ab".repeat(32));
    expect(normalisasiHex64("ab".repeat(31))).toBeNull();
    expect(normalisasiHex64("zz".repeat(32))).toBeNull();
    expect(normalisasiHex64(42)).toBeNull();
  });
});

describe("inbox — kontrak HTTP", () => {
  it("preflight OPTIONS dijawab 204 dengan header CORS untuk origin mana pun", async () => {
    const k = await siapkan();
    const res = await fetch(`${k.url}/register`, { method: "OPTIONS", headers: { origin: "http://localhost:5300", "access-control-request-method": "POST" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")).toContain("content-type");
  });

  it("POST leaf sah -> 202 queued, lalu GET status memantau sampai registered dengan txId", async () => {
    const k = await siapkan();
    const res = await kirim(k.url, { ballot: BALLOT, leaf: leaf(1) });
    expect(res.status).toBe(202);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    // Worker langsung mengirim SATU leaf — tidak menunggu 8 — bahkan sebelum
    // jawaban POST dikirim: status yang dilaporkan sudah "submitting".
    expect(await res.json()).toEqual({ leaf: leaf(1), status: "submitting" });
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(1));
    expect(k.panggilan[0]).toEqual([leaf(1)]);
    let st = await (await fetch(`${k.url}/register/${BALLOT}/${leaf(1)}`)).json();
    expect(st.status).toBe("submitting");

    k.selesaikan(0, "txabc");
    await vi.waitFor(async () => {
      st = await (await fetch(`${k.url}/register/${BALLOT}/${leaf(1)}`)).json();
      expect(st).toEqual({ leaf: leaf(1), status: "registered", txId: "txabc" });
    });
  });

  it("GET status juga dilayani TANPA awalan /register (akses langsung ke port inbox)", async () => {
    const k = await siapkan();
    await kirim(k.url, { ballot: BALLOT, leaf: leaf(2) });
    const res = await fetch(`${k.url}/${BALLOT}/${leaf(2)}`);
    expect(res.status).toBe(200);
    expect((await res.json()).leaf).toBe(leaf(2));
    k.selesaikan(0);
  });

  it("badan bukan JSON / bukan hex / ballot lain -> 400 dan 404 berbahasa Inggris", async () => {
    const k = await siapkan();
    const r1 = await fetch(`${k.url}/register`, { method: "POST", body: "{bukan json" });
    expect(r1.status).toBe(400);
    const r2 = await kirim(k.url, { ballot: BALLOT, leaf: "xyz" });
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toMatch(/Expected JSON/);
    const r3 = await kirim(k.url, { ballot: "b".repeat(64), leaf: leaf(3) });
    expect(r3.status).toBe(404);
    expect((await r3.json()).error).toMatch(/not b{8}/);
    expect(k.panggilan).toHaveLength(0);
  });

  it("GET status leaf yang belum pernah dikirim -> 404", async () => {
    const k = await siapkan();
    const res = await fetch(`${k.url}/register/${BALLOT}/${leaf(9)}`);
    expect(res.status).toBe(404);
  });

  it("/health melaporkan ballot, kuota dari ledger, dan ringkasan antrean", async () => {
    const k = await siapkan({ eligibleCount: 16n });
    const res = await fetch(`${k.url}/register/health`);
    expect(await res.json()).toEqual({ ballot: BALLOT, registeredCount: "0", eligibleCount: "16", queued: 0, submitting: 0, registered: 0, failed: 0 });
  });
});

describe("inbox — antrean dan pendaftaran", () => {
  it("leaf yang datang SELAGI transaksi berjalan menunggu putaran berikutnya — satu transaksi pada satu waktu, tidak hilang", async () => {
    const k = await siapkan();
    await kirim(k.url, { ballot: BALLOT, leaf: leaf(1) });
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(1));
    // Dua leaf lagi datang saat tx pertama masih dibuat — keduanya ANTRE
    // (worker sibuk), bukan submitting.
    const r2 = await kirim(k.url, { ballot: BALLOT, leaf: leaf(2) });
    expect(r2.status).toBe(202);
    expect((await r2.json()).status).toBe("queued");
    expect((await kirim(k.url, { ballot: BALLOT, leaf: leaf(3) })).status).toBe(202);
    await tunggu(50);
    expect(k.panggilan).toHaveLength(1); // belum ada tx kedua selama tx pertama berjalan
    k.selesaikan(0, "tx1");
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(2));
    expect(k.panggilan[1]).toEqual([leaf(2), leaf(3)]); // digabung jadi satu batch
    k.selesaikan(1, "tx2");
    await vi.waitFor(async () => {
      const st = await (await fetch(`${k.url}/register/${BALLOT}/${leaf(3)}`)).json();
      expect(st).toEqual({ leaf: leaf(3), status: "registered", txId: "tx2" });
    });
  });

  it("batch dipotong pada 8 leaf — sisanya ke transaksi berikutnya", async () => {
    const k = await siapkan({ eligibleCount: 32n });
    await kirim(k.url, { ballot: BALLOT, leaf: leaf(100) });
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(1));
    for (let i = 1; i <= 10; i++) await kirim(k.url, { ballot: BALLOT, leaf: leaf(200 + i) });
    k.selesaikan(0);
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(2));
    expect(k.panggilan[1]).toHaveLength(8);
    k.selesaikan(1);
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(3));
    expect(k.panggilan[2]).toHaveLength(2);
    k.selesaikan(2);
  });

  it("transaksi gagal -> semua leaf di batch itu berstatus failed dengan pesan galatnya; leaf berikutnya tetap diproses", async () => {
    const k = await siapkan();
    await kirim(k.url, { ballot: BALLOT, leaf: leaf(1) });
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(1));
    k.selesaikan(0, undefined, "failed assert: Only the admin can register voters");
    await vi.waitFor(async () => {
      const st = await (await fetch(`${k.url}/register/${BALLOT}/${leaf(1)}`)).json();
      expect(st).toEqual({ leaf: leaf(1), status: "failed", error: "failed assert: Only the admin can register voters" });
    });
    await kirim(k.url, { ballot: BALLOT, leaf: leaf(2) });
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(2));
    k.selesaikan(1);
  });

  it("leaf yang sama dikirim dua kali -> status entri yang ada (200), bukan entri ganda", async () => {
    const k = await siapkan();
    expect((await kirim(k.url, { ballot: BALLOT, leaf: leaf(1) })).status).toBe(202);
    const kedua = await kirim(k.url, { ballot: BALLOT, leaf: leaf(1) });
    expect(kedua.status).toBe(200);
    expect((await kedua.json()).status).toMatch(/queued|submitting/);
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(1));
    k.selesaikan(0);
  });

  it("leaf yang SUDAH ada di pohon on-chain -> langsung registered tanpa transaksi", async () => {
    const k = await siapkan();
    k.ledger.terdaftar.add(leaf(7));
    const res = await kirim(k.url, { ballot: BALLOT, leaf: leaf(7) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ leaf: leaf(7), status: "registered" });
    await tunggu(50);
    expect(k.panggilan).toHaveLength(0);
  });

  it("kuota penuh (registeredCount + antrean >= eligibleCount) -> 409, tanpa transaksi", async () => {
    const k = await siapkan({ eligibleCount: 2n });
    k.ledger.registeredCount = 1n;
    expect((await kirim(k.url, { ballot: BALLOT, leaf: leaf(1) })).status).toBe(202); // kursi terakhir
    const penuh = await kirim(k.url, { ballot: BALLOT, leaf: leaf(2) });
    expect(penuh.status).toBe(409);
    expect((await penuh.json()).error).toMatch(/All 2 seats/);
    await vi.waitFor(() => expect(k.panggilan).toHaveLength(1));
    k.selesaikan(0);
  });

  it("voteDeadline sudah lewat -> 409 Registration is closed, tanpa transaksi", async () => {
    const k = await siapkan({ voteDeadline: BigInt(Math.floor(Date.now() / 1000) - 1) });
    const res = await kirim(k.url, { ballot: BALLOT, leaf: leaf(1) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Registration is closed/);
    expect(k.panggilan).toHaveLength(0);
  });

  it("batas per IP per jam -> 429 setelah batas, IP lain tidak terpengaruh (x-forwarded-for dihormati)", async () => {
    const k = await siapkan({ batasPerIpPerJam: 2 });
    expect((await kirim(k.url, { ballot: BALLOT, leaf: leaf(1) }, { "x-forwarded-for": "10.0.0.1" })).status).toBe(202);
    expect((await kirim(k.url, { ballot: BALLOT, leaf: leaf(2) }, { "x-forwarded-for": "10.0.0.1" })).status).toBe(202);
    const ketiga = await kirim(k.url, { ballot: BALLOT, leaf: leaf(3) }, { "x-forwarded-for": "10.0.0.1" });
    expect(ketiga.status).toBe(429);
    expect((await kirim(k.url, { ballot: BALLOT, leaf: leaf(4) }, { "x-forwarded-for": "10.0.0.2" })).status).toBe(202);
    await vi.waitFor(() => expect(k.panggilan.length).toBeGreaterThanOrEqual(1));
    for (let i = 0; i < k.panggilan.length; i++) k.selesaikan(i);
  });

  it("indexer tidak bisa dibaca -> 502 dengan alasan, tanpa transaksi", async () => {
    const inbox = new Inbox({
      alamatBallot: BALLOT,
      daftarkan: async () => ({ txId: "x" }),
      bacaLedger: async () => {
        throw new Error("indexer timeout");
      },
    });
    const { server, port } = await dengarkanInbox(inbox, 0);
    pembersih.push(() => new Promise((r) => server.close(() => r())));
    const res = await kirim(`http://127.0.0.1:${port}`, { ballot: BALLOT, leaf: leaf(1) });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/indexer timeout/);
  });
});

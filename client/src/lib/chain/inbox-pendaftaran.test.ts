/**
 * Sisi klien inbox diuji terhadap INBOX SUNGGUHAN (pkgs/cli/src/inbox.ts,
 * server HTTP di port acak) — lintas paket dengan sengaja: kalau bentuk JSON
 * atau kode status inbox berubah, uji ini merah, bukan pemilih yang
 * menemukannya. Pendaftar dan ledger di-suntik (tidak ada wallet/rantai).
 */
import { afterEach, describe, expect, it } from "vitest";
import { Inbox, dengarkanInbox } from "../../../../pkgs/cli/src/inbox.ts";
import { GalatInbox, alamatInboxDariKebijakan, kirimLeafKeInbox, statusInbox } from "./inbox-pendaftaran";

const BALLOT = "a".repeat(64);
const LEAF = "5".repeat(64);
const pembersih: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (pembersih.length) await pembersih.pop()!();
});

async function inboxUji(opsi: { gagal?: string; terdaftar?: boolean; penuh?: boolean } = {}) {
  const inbox = new Inbox({
    alamatBallot: BALLOT,
    daftarkan: async () => {
      if (opsi.gagal) throw new Error(opsi.gagal);
      return { txId: "tx-uji-1" };
    },
    bacaLedger: async () => ({
      registeredCount: opsi.penuh ? 16n : 0n,
      eligibleCount: 16n,
      voteDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      leafTerdaftar: () => opsi.terdaftar === true,
    }),
  });
  const { server, port } = await dengarkanInbox(inbox, 0);
  pembersih.push(() => new Promise((r) => server.close(() => r())));
  return { url: `http://127.0.0.1:${port}/register`, inbox };
}

describe("alamatInboxDariKebijakan", () => {
  it("mengambil URL https dari kalimat kebijakan, tanpa tanda baca penutup", () => {
    expect(
      alamatInboxDariKebijakan(
        "Open registration until the vote deadline: the app sends only your public leaf to https://votepriv.mdloglabs.org/register and the organiser registers it on-chain; the organiser only ever holds the hash.",
      ),
    ).toBe("https://votepriv.mdloglabs.org/register");
    expect(alamatInboxDariKebijakan("Send it to https://x.example/register.")).toBe("https://x.example/register");
  });

  it("menerima http://localhost dan 127.0.0.1 (pengembangan), menolak http host lain dan teks tanpa URL", () => {
    expect(alamatInboxDariKebijakan("dev: http://localhost:5390/register")).toBe("http://localhost:5390/register");
    expect(alamatInboxDariKebijakan("dev: http://127.0.0.1:5390/register")).toBe("http://127.0.0.1:5390/register");
    expect(alamatInboxDariKebijakan("http://inbox.example.org/register")).toBeNull();
    expect(alamatInboxDariKebijakan("Voters register their own credential leaf; the organiser only ever holds the hash.")).toBeNull();
  });
});

describe("kirimLeafKeInbox / statusInbox x inbox sungguhan", () => {
  it("kirim -> submitting/queued, lalu status -> registered dengan txId", async () => {
    const { url } = await inboxUji();
    const jawab = await kirimLeafKeInbox({ url, ballot: BALLOT, leaf: LEAF });
    expect(jawab.leaf).toBe(LEAF);
    expect(["queued", "submitting", "registered"]).toContain(jawab.status);
    let st = await statusInbox({ url, ballot: BALLOT, leaf: LEAF });
    for (let i = 0; i < 50 && st.status !== "registered"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      st = await statusInbox({ url, ballot: BALLOT, leaf: LEAF });
    }
    expect(st).toEqual({ leaf: LEAF, status: "registered", txId: "tx-uji-1" });
  });

  it("leaf yang sudah ada di rantai -> langsung registered tanpa txId", async () => {
    const { url } = await inboxUji({ terdaftar: true });
    expect(await kirimLeafKeInbox({ url, ballot: BALLOT, leaf: LEAF })).toEqual({ leaf: LEAF, status: "registered" });
  });

  it("kuota penuh -> GalatInbox dengan pesan Inggris dari server dan kode 409", async () => {
    const { url } = await inboxUji({ penuh: true });
    await expect(kirimLeafKeInbox({ url, ballot: BALLOT, leaf: LEAF })).rejects.toMatchObject({
      name: "GalatInbox",
      kode: 409,
      message: "All 16 seats on this ballot are taken.",
    });
  });

  it("transaksi gagal di sisi penyelenggara -> status failed membawa pesan galatnya (bukan dilempar)", async () => {
    const { url } = await inboxUji({ gagal: 'failed assert: "Only the admin can register voters"' });
    await kirimLeafKeInbox({ url, ballot: BALLOT, leaf: LEAF });
    let st = await statusInbox({ url, ballot: BALLOT, leaf: LEAF });
    for (let i = 0; i < 50 && st.status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      st = await statusInbox({ url, ballot: BALLOT, leaf: LEAF });
    }
    expect(st.status).toBe("failed");
    expect(st.error).toContain("Only the admin can register voters");
  });

  it("inbox tidak terjangkau -> GalatInbox tanpa kode, menyebut host", async () => {
    const { url } = await inboxUji();
    await pembersih.pop()!(); // tutup server-nya
    const janji = kirimLeafKeInbox({ url, ballot: BALLOT, leaf: LEAF });
    await expect(janji).rejects.toBeInstanceOf(GalatInbox);
    await expect(janji).rejects.toMatchObject({ kode: null });
    await expect(janji).rejects.toThrow(/Could not reach the registration inbox at 127\.0\.0\.1:\d+/);
  });

  it("jawaban bukan JSON (proxy/portal nyasar) -> GalatInbox yang menyebutnya, bukan SyntaxError mentah", async () => {
    const ambil = (async () => new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    await expect(kirimLeafKeInbox({ url: "https://x.example/register", ballot: BALLOT, leaf: LEAF, ambil })).rejects.toThrow(/not JSON/);
  });
});

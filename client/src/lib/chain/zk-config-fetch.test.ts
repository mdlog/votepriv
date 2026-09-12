import { describe, expect, it, vi } from "vitest";
import { FetchZkConfigProvider, GalatArtefakZk, pastikanArtefakZkMurah } from "./zk-config-fetch";

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

describe("FetchZkConfigProvider", () => {
  it("getVerifierKey mengambil {baseUrl}/keys/{id}.verifier dan mengembalikan Uint8Array", async () => {
    const isi = new Uint8Array([1, 2, 3]);
    const ambil = vi.fn<FetchFn>(async (url) => {
      expect(url).toBe("https://zk.example/ballot/keys/castVote.verifier");
      return new Response(isi, { status: 200, headers: { "content-type": "application/octet-stream" } });
    });
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await expect(zk.getVerifierKey("castVote")).resolves.toEqual(isi);
  });

  it("getProverKey dan getZKIR menyusun path sesuai tata letak Node (keys/*.prover, zkir/*.bzkir)", async () => {
    const ambil = vi.fn<FetchFn>(
      async () => new Response(new Uint8Array([9]), { status: 200, headers: { "content-type": "application/octet-stream" } }),
    );
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await zk.getProverKey("castVote");
    await zk.getZKIR("castVote");
    expect(ambil).toHaveBeenNthCalledWith(1, "https://zk.example/ballot/keys/castVote.prover", { cache: "no-store" });
    expect(ambil).toHaveBeenNthCalledWith(2, "https://zk.example/ballot/zkir/castVote.bzkir", { cache: "no-store" });
  });

  it("HTTP non-ok melempar GalatArtefakZk, bukan mengembalikan undefined", async () => {
    const ambil = vi.fn<FetchFn>(async () => new Response("", { status: 404 }));
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await expect(zk.getVerifierKey("castVote")).rejects.toThrow(GalatArtefakZk);
  });

  it("fallback SPA (200 text/html) melempar, tidak ditelan sebagai artefak sah", async () => {
    const ambil = vi.fn<FetchFn>(
      async () => new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await expect(zk.getVerifierKey("castVote")).rejects.toThrow(/text\/html/);
  });

  it("fallback SPA TANPA header content-type yang benar tetap melempar (sniff isi badan)", async () => {
    // Pola yang sama dengan balasanHtml di graphql.ts/proof-server.ts: proxy,
    // portal wifi, atau reverse proxy yang salah konfigurasi bisa menjawab
    // HTML tanpa pernah menyetel content-type dengan benar. content-type SAJA
    // tidak cukup — badan balasan disniff juga, sebelum artefak "sah" ini
    // dipercaya menjadi prover key yang dikirim ke proof server.
    //
    // SENGAJA tidak menyetel header content-type sama sekali (beda dari uji
    // di atas): supaya uji ini HANYA bisa lolos lewat jalur sniff badan, tidak
    // pernah lewat jalur content-type — dua jalur penjaga tidak boleh
    // ditagih ke satu uji yang sama (itu cacat balasanHtml versi lama yang
    // brief task ini secara eksplisit minta tidak diulang).
    const html = new TextEncoder().encode("<!doctype html><html></html>");
    const ambil = vi.fn<FetchFn>(async () => new Response(html, { status: 200 }));
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await expect(zk.getVerifierKey("castVote")).rejects.toThrow(/text\/html/);
  });

  it("content-type text/html walau badan BUKAN teks HTML tetap melempar (jalur content-type sendiri)", async () => {
    // Cermin dari uji sebelumnya: di sini badan BUKAN html (byte biner acak),
    // hanya header content-type yang bohong. Kalau jalur sniff badan saja
    // yang dipakai (content-type diabaikan), uji ini TIDAK akan menangkap
    // balasan yang salah — makanya keduanya (content-type DAN sniff) perlu
    // uji yang mengisolasi masing-masing, bukan hanya satu uji yang
    // kebetulan memenuhi keduanya sekaligus (seperti uji text/html di atas).
    const bukanHtml = new Uint8Array([1, 2, 3, 4]);
    const ambil = vi.fn<FetchFn>(
      async () => new Response(bukanHtml, { status: 200, headers: { "content-type": "text/html" } }),
    );
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await expect(zk.getVerifierKey("castVote")).rejects.toThrow(/text\/html/);
  });
});

describe("pastikanArtefakZkMurah", () => {
  it("mengambil HANYA verifier key (bukan prover key)", async () => {
    const ambil = vi.fn<FetchFn>(async () => new Response(new Uint8Array([1]), { status: 200 }));
    await pastikanArtefakZkMurah("https://zk.example/ballot", "castVote", ambil);
    expect(ambil).toHaveBeenCalledTimes(1);
    expect(ambil).toHaveBeenCalledWith("https://zk.example/ballot/keys/castVote.verifier", { cache: "no-store" });
  });

  it("melempar bila verifier key tidak ditemukan (404)", async () => {
    const ambil = vi.fn<FetchFn>(async () => new Response("", { status: 404 }));
    await expect(pastikanArtefakZkMurah("https://zk.example/ballot", "castVote", ambil)).rejects.toThrow(GalatArtefakZk);
  });
});

import { describe, expect, it, vi } from "vitest";
import { GalatRantai, postGraphQL } from "./graphql";

const URL_UJI = "https://indexer.contoh.test/api/v3/graphql";

function jawab(body: string, init: { status?: number; contentType?: string } = {}): typeof fetch {
  return vi.fn(async () =>
    new Response(body, {
      status: init.status ?? 200,
      headers: { "content-type": init.contentType ?? "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("postGraphQL", () => {
  it("mengembalikan data pada jawaban sehat", async () => {
    const hasil = await postGraphQL<{ block: { height: number } }>({
      url: URL_UJI,
      query: "{ block { height } }",
      ambil: jawab(JSON.stringify({ data: { block: { height: 7 } } })),
    });
    expect(hasil.data).toEqual({ block: { height: 7 } });
    expect(hasil.errors).toEqual([]);
  });

  it("MEMPERTAHANKAN data ketika errors tidak kosong — kegagalan sebagian bukan kegagalan total", async () => {
    // Bentuk ini diverifikasi terhadap indexer sungguhan: satu alias sah, satu
    // alamat bukan-hex. Kunci alias yang gagal HILANG dari data; ia tidak null.
    const badan = JSON.stringify({
      data: { b0: { address: "aa", state: "00" } },
      errors: [{ message: "invalid address: cannot hex-decode: odd number of digits" }],
    });
    const hasil = await postGraphQL<Record<string, unknown>>({
      url: URL_UJI,
      query: "{ b0: contract { address } b1: contract { address } }",
      ambil: jawab(badan),
    });
    expect(hasil.data).not.toBeNull();
    expect("b0" in (hasil.data as object)).toBe(true);
    expect("b1" in (hasil.data as object)).toBe(false);
    expect(hasil.errors).toHaveLength(1);
  });

  it("melempar graphql-fatal ketika data null di tingkat atas", async () => {
    const badan = JSON.stringify({ data: null, errors: [{ message: 'Unknown field "applyStage"' }] });
    await expect(
      postGraphQL({ url: URL_UJI, query: "{ x }", ambil: jawab(badan) }),
    ).rejects.toMatchObject({ sebab: "graphql-fatal" });
  });

  it("melempar balasan-html pada HTTP 200 bertipe text/html — fallback SPA", async () => {
    const ambil = jawab("<!doctype html><html><body>ok</body></html>", { contentType: "text/html" });
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toMatchObject({
      sebab: "balasan-html",
    });
  });

  it("melempar balasan-html walau content-type berbohong", async () => {
    const ambil = jawab("<html><body>portal</body></html>", { contentType: "application/json" });
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toMatchObject({
      sebab: "balasan-html",
    });
  });

  it("melempar balasan-html pada header text/html meskipun badan bukan tag — portal wifi atau pesan SPA", async () => {
    // Badan yang TIDAK cocok regex sniffing: cabang .includes("text/html") WAJIB ditangkap
    const ambil = jawab("Welcome to Guestnet Portal. Please log in.", { contentType: "text/html" });
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toMatchObject({
      sebab: "balasan-html",
    });
  });

  it("melempar http pada status non-2xx", async () => {
    const ambil = jawab(JSON.stringify({ data: null }), { status: 502 });
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toMatchObject({
      sebab: "http",
    });
  });

  it("melempar bukan-json pada badan yang bukan JSON dan bukan HTML", async () => {
    const ambil = jawab("upstream timeout", { contentType: "text/plain" });
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toMatchObject({
      sebab: "bukan-json",
    });
  });

  it("melempar jaringan ketika fetch menolak, dan menyertakan host", async () => {
    const ambil = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    try {
      await postGraphQL({ url: URL_UJI, query: "{ x }", ambil });
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect(e).toBeInstanceOf(GalatRantai);
      expect((e as GalatRantai).sebab).toBe("jaringan");
      expect((e as GalatRantai).host).toBe("indexer.contoh.test");
    }
  });

  it("MENERUSKAN AbortError apa adanya — pembatalan bukan kegagalan", async () => {
    const ambil = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch;
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.toThrow(DOMException);
    await expect(postGraphQL({ url: URL_UJI, query: "{ x }", ambil })).rejects.not.toBeInstanceOf(
      GalatRantai,
    );
  });
});

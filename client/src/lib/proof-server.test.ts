import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkProofServer,
  isRemoteProofServer,
  muatTargetRuntime,
  proofServerHop,
  proofServerReach,
  RUNTIME_CONFIG_PATH,
  TARGET_BAWAAN,
  type AsalHalaman,
} from "./proof-server";

const LOKAL: AsalHalaman = { hostname: "localhost", host: "localhost:3000" };
const TUNNEL: AsalHalaman = { hostname: "votepriv.mdloglabs.org", host: "votepriv.mdloglabs.org" };

/** Membangun Response palsu tanpa menyentuh jaringan. */
function jawab(
  body: string,
  { status = 200, contentType = "application/json" }: { status?: number; contentType?: string } = {},
): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

/**
 * fetch palsu yang dipetakan per jalur. Jalur yang tidak terdaftar melempar,
 * meniru kegagalan jaringan — bukan mengembalikan 404 diam-diam.
 */
function fetchPalsu(rute: Record<string, () => Response | Promise<Response>>): typeof fetch {
  return (async (masukan: RequestInfo | URL) => {
    const jalur = typeof masukan === "string" ? masukan : masukan.toString();
    const penjawab = rute[jalur];
    if (!penjawab) throw new TypeError(`Failed to fetch: ${jalur}`);
    return penjawab();
  }) as typeof fetch;
}

const HTML_SPA = "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("muatTargetRuntime", () => {
  it("memakai target yang dilaporkan server dan menandainya terverifikasi", async () => {
    const hasil = await muatTargetRuntime(
      fetchPalsu({
        [RUNTIME_CONFIG_PATH]: () => jawab(JSON.stringify({ proofServerTarget: "https://proof.contoh.example" })),
      }),
    );
    expect(hasil).toEqual({ target: "https://proof.contoh.example", terverifikasi: true });
  });

  // Deployment statis tanpa server kita: fallback SPA menjawab 200 + HTML.
  // Tanpa pemeriksaan ini, JSON.parse melempar dan kita jatuh ke cadangan juga —
  // tapi lewat jalur pengecualian, bukan keputusan. Uji ini mengunci keputusannya.
  it("menolak fallback SPA meski statusnya 200", async () => {
    const hasil = await muatTargetRuntime(
      fetchPalsu({ [RUNTIME_CONFIG_PATH]: () => jawab(HTML_SPA, { contentType: "text/html" }) }),
    );
    expect(hasil).toEqual({ target: TARGET_BAWAAN, terverifikasi: false });
  });

  /**
   * Tanpa uji ini, pemeriksaan content-type di muatTargetRuntime tidak teramati:
   * menghapusnya membuat JSON.parse melempar pada index.html dan hasil akhirnya
   * kebetulan sama. Kasus ini memisahkan keduanya — badan yang SAH sebagai JSON
   * tapi dilabeli text/html hanya ditolak oleh pemeriksaan itu.
   *
   * Keputusannya: jawaban yang mengaku HTML bukan config kita. Rute config kita
   * selalu mengirim application/json, di produksi maupun dev. Menolak di sini
   * hanya pernah MENURUNKAN klaim privasi, tidak pernah menaikkannya — arah salah
   * yang aman.
   */
  it("menolak badan JSON yang sah bila dilabeli text/html", async () => {
    const hasil = await muatTargetRuntime(
      fetchPalsu({
        [RUNTIME_CONFIG_PATH]: () =>
          jawab(JSON.stringify({ proofServerTarget: "https://proof.pihak-lain.example" }), {
            contentType: "text/html",
          }),
      }),
    );
    expect(hasil).toEqual({ target: TARGET_BAWAAN, terverifikasi: false });
  });

  it.each([
    ["status non-200", () => jawab("{}", { status: 404 })],
    ["JSON rusak", () => jawab("{bukan json")],
    ["field hilang", () => jawab(JSON.stringify({ lain: "x" }))],
    ["field kosong", () => jawab(JSON.stringify({ proofServerTarget: "   " }))],
    ["field bukan string", () => jawab(JSON.stringify({ proofServerTarget: 6300 }))],
  ])("jatuh ke nilai build tanpa verifikasi saat %s", async (_nama, penjawab) => {
    const hasil = await muatTargetRuntime(fetchPalsu({ [RUNTIME_CONFIG_PATH]: penjawab }));
    expect(hasil).toEqual({ target: TARGET_BAWAAN, terverifikasi: false });
  });

  it("jatuh ke nilai build tanpa verifikasi saat jaringan gagal", async () => {
    const hasil = await muatTargetRuntime(fetchPalsu({}));
    expect(hasil).toEqual({ target: TARGET_BAWAAN, terverifikasi: false });
  });
});

describe("proofServerReach", () => {
  it("menyebut remote sebagai remote ke mana pun halaman disajikan", () => {
    expect(proofServerReach("https://proof.contoh.example", LOKAL)).toBe("remote");
    expect(proofServerReach("https://proof.contoh.example", TUNNEL)).toBe("remote");
  });

  it("hanya menyebut lokal bila target DAN asal halaman sama-sama lokal", () => {
    expect(proofServerReach("http://127.0.0.1:6300", LOKAL)).toBe("lokal");
  });

  // Inti seluruh berkas ini: target lokal pada halaman tunnel BUKAN privat.
  it("menyebut target lokal pada halaman tunnel sebagai lewat-host-halaman", () => {
    expect(proofServerReach("http://127.0.0.1:6300", TUNNEL)).toBe("lewat-host-halaman");
  });

  it("memperlakukan target tak terbaca sebagai remote, bukan lokal", () => {
    expect(isRemoteProofServer("bukan url")).toBe(true);
    expect(proofServerReach("bukan url", LOKAL)).toBe("remote");
  });
});

describe("proofServerHop", () => {
  it("menyebut host halaman sebagai hop perantara pada kasus tunnel", () => {
    expect(proofServerHop("http://127.0.0.1:6300", TUNNEL)).toBe(
      "browser → votepriv.mdloglabs.org → http://127.0.0.1:6300 (that machine's loopback, not your device)",
    );
  });

  it("tidak menyebut perantara saat jalurnya memang langsung", () => {
    expect(proofServerHop("http://127.0.0.1:6300", LOKAL)).toBe("browser → http://127.0.0.1:6300");
  });
});

describe("checkProofServer", () => {
  /**
   * REGRESI YANG DIJAGA UJI INI.
   *
   * Bundel dibangun tanpa .env sehingga memanggang 127.0.0.1:6300, lalu server
   * di-start dengan VITE_PROOF_SERVER_URL menunjuk pihak ketiga. Sebelum
   * perbaikan, UI membaca nilai panggang dan berkata "witness tidak pernah
   * meninggalkan perangkat ini" tepat saat witness dikirim ke pihak ketiga.
   */
  it("melaporkan target runtime, bukan nilai build, ketika keduanya berbeda", async () => {
    vi.stubGlobal("location", LOKAL);
    const status = await checkProofServer(
      fetchPalsu({
        [RUNTIME_CONFIG_PATH]: () => jawab(JSON.stringify({ proofServerTarget: "https://proof.pihak-lain.example" })),
        "/proof-server/version": () => jawab("4.0.0", { contentType: "text/plain" }),
      }),
    );
    expect(TARGET_BAWAAN).toBe("http://127.0.0.1:6300");
    expect(status.target).toBe("https://proof.pihak-lain.example");
    expect(status.targetTerverifikasi).toBe(true);
    expect(status.reach).toBe("remote");
    expect(status.reachable).toBe(true);
  });

  it("menandai target belum terverifikasi saat server tidak melaporkannya", async () => {
    vi.stubGlobal("location", LOKAL);
    const status = await checkProofServer(
      fetchPalsu({ "/proof-server/version": () => jawab("4.0.0", { contentType: "text/plain" }) }),
    );
    expect(status.target).toBe(TARGET_BAWAAN);
    expect(status.targetTerverifikasi).toBe(false);
    expect(status.reach).toBe("lokal");
    expect(status.reachable).toBe(true);
  });

  it("menyebut proof server tak terjangkau saat /version menjawab HTML", async () => {
    vi.stubGlobal("location", LOKAL);
    const status = await checkProofServer(
      fetchPalsu({
        [RUNTIME_CONFIG_PATH]: () => jawab(JSON.stringify({ proofServerTarget: "http://127.0.0.1:6300" })),
        "/proof-server/version": () => jawab(HTML_SPA, { contentType: "text/html" }),
      }),
    );
    expect(status.reachable).toBe(false);
    if (status.reachable) throw new Error("tidak tercapai");
    expect(status.error).toContain("HTML");
    // Jalur witness tetap dilaporkan meski proof server mati — pengguna perlu tahu
    // keduanya, bukan salah satu.
    expect(status.reach).toBe("lokal");
    expect(status.targetTerverifikasi).toBe(true);
  });

  it("membawa jalur witness lengkap saat jaringan gagal total", async () => {
    vi.stubGlobal("location", TUNNEL);
    const status = await checkProofServer(fetchPalsu({}));
    expect(status.reachable).toBe(false);
    expect(status.targetTerverifikasi).toBe(false);
    expect(status.reach).toBe("lewat-host-halaman");
    expect(status.hop).toContain("votepriv.mdloglabs.org");
  });
});

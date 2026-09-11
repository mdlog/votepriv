/**
 * Uji render paling sederhana yang mungkin: buktikan perkakas jsdom + React
 * Testing Library benar-benar hidup terhadap komponen yang sebenarnya.
 *
 * Uji ini sengaja tidak menyatakan apa pun tentang tampilan — itu tugas uji
 * paritas di Task 2 (kini digantikan paritas-permukaan-rantai.test.tsx, Task
 * 8). Yang dijaga di sini hanya satu: kalau berkas ini merah, setiap uji
 * render lain di C-1/C-2a tidak bisa dipercaya, karena masalahnya ada di
 * perkakasnya, bukan di kodenya.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProofServerStatus } from "@/lib/proof-server";
import Home from "./Home";

const STATUS_LOKAL: ProofServerStatus = {
  reachable: true,
  version: "8.1.0",
  target: "http://127.0.0.1:6300",
  targetTerverifikasi: true,
  reach: "lokal",
  hop: "browser → http://127.0.0.1:6300",
};

// checkProofServer() memanggil jaringan lewat useEffect. Dibiarkan asli, ia akan
// menembak /proof-server/version dari jsdom, gagal, dan membuat hasil uji
// bergantung pada apakah proof server kebetulan hidup di mesin yang menjalankan.
vi.mock("@/lib/proof-server", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/proof-server")>();
  return { ...asli, checkProofServer: async () => STATUS_LOKAL };
});

// Praperiksa P6 + Task 8 Step 11: sejak Home membaca rantai lewat
// useDataRantai(), berkas ini tanpa stub akan menembak INDEXER PUBLIK
// sungguhan pada setiap `pnpm test` — persis larangan global rencana ini
// ("Uji TIDAK BOLEH bergantung pada nilai hidup"). fetch yang MENGGANTUNG
// dipakai, bukan yang menolak, supaya uji ini tetap menguji apa yang memang
// ia uji (bahwa shell terpasang) tanpa pernah menyelesaikan pembacaan rantai
// sama sekali. Fase yang aktif selama SELURUH uji di berkas ini adalah
// "memuat".
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("render Home di jsdom", () => {
  it("memasang shell aplikasi beserta keempat item navigasi", async () => {
    let container!: HTMLElement;
    // render() dibungkus act async supaya promise checkProofServer sempat
    // terselesaikan di dalam act — kalau tidak, setProofStatus jatuh di luar act
    // dan React memuntahkan peringatan yang menutupi kegagalan sebenarnya.
    await act(async () => {
      ({ container } = render(<Home />));
    });

    expect(container.querySelector(".app-shell")).not.toBeNull();
    expect(container.querySelector(".sidebar")).not.toBeNull();

    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    const label = Array.from(nav!.querySelectorAll("button > span")).map(el => el.textContent);
    expect(label).toEqual(["Overview", "Live ballots", "Results", "Docs"]);
  });

  it("tidak pernah menyentuh jaringan sungguhan", async () => {
    // Bila seseorang kelak membuang stub di atas, assert ini yang berbunyi
    // lebih dulu — sebelum uji berubah jadi rapuh menurut hari tanpa ada yang
    // sadar.
    await act(async () => {
      render(<Home />);
    });
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
  });

  it("Docs tetap terjangkau meski pembacaan rantai belum selesai (fase memuat)", async () => {
    // P4: Docs bukan permukaan yang bergantung pada data rantai. Navigasi ke
    // sana harus berhasil bahkan ketika fase masih "memuat" — fetch di berkas
    // ini menggantung selamanya, jadi ini SELALU fase memuat.
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<Home />));
    });
    const tombolDocs = Array.from(container.querySelectorAll("nav button")).find(b =>
      (b.textContent ?? "").includes("Docs"),
    ) as HTMLButtonElement;
    await act(async () => {
      tombolDocs.click();
    });
    expect(container.querySelector(".docs-page")).not.toBeNull();
    expect(container.querySelector("[role='alert']")).toBeNull();
  });
});

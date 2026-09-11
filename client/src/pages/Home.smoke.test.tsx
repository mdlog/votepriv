/**
 * Uji render paling sederhana yang mungkin: buktikan perkakas jsdom + React
 * Testing Library benar-benar hidup terhadap komponen yang sebenarnya.
 *
 * Uji ini sengaja tidak menyatakan apa pun tentang tampilan — itu tugas uji
 * paritas di Task 2. Yang dijaga di sini hanya satu: kalau berkas ini merah,
 * setiap uji render lain di C-1 tidak bisa dipercaya, karena masalahnya ada di
 * perkakasnya, bukan di kodenya.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => cleanup());

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
});

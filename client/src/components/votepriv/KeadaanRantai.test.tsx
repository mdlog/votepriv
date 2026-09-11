import { cleanup, render } from "@testing-library/react";
import { AlertTriangle, ServerCrash, Unplug } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GalatRantai } from "@/lib/chain";
import type { JaringanAktif, SebabGalatRantai } from "@/lib/chain";
import { GridBallotMemuat, PanelGagalRantai, SpandukSebagian, ikonUntukSebab, pesanGagal } from "./KeadaanRantai";

afterEach(() => cleanup());

const JARINGAN: JaringanAktif = {
  networkId: "preview",
  indexer: "https://indexer.contoh.test/api/v3/graphql",
  indexerWS: "",
  alamatRegistry: "aabbcc",
};

/**
 * SEMBILAN sebab, bukan delapan — taksonomi berubah setelah brief Task 7
 * ditulis: `registry-skema` ditambahkan (client/src/lib/chain/graphql.ts).
 * Daftar ini diketik ulang di sini, sengaja, supaya penambahan/penghapusan
 * sebab di graphql.ts membuat SATU dari dua tempat ini (di sana atau di sini)
 * langsung terlihat berbeda — bukan diam-diam basi.
 */
const SEMUA_SEBAB: SebabGalatRantai[] = [
  "jaringan",
  "http",
  "bukan-json",
  "balasan-html",
  "graphql-fatal",
  "registry-hilang",
  "registry-skema",
  "dekode",
  "konfigurasi",
];

describe("pesanGagal", () => {
  it("punya kalimat untuk SETIAP dari SEMBILAN sebab — tidak ada cabang lain-lain", () => {
    expect(SEMUA_SEBAB).toHaveLength(9);
    for (const sebab of SEMUA_SEBAB) {
      const p = pesanGagal(new GalatRantai(sebab, "rincian", "indexer.contoh.test"), JARINGAN);
      expect(p.judul.length).toBeGreaterThan(0);
      expect(p.kalimat.length).toBeGreaterThan(0);
      expect(p.saran.length).toBeGreaterThan(0);
    }
  });

  it("memberi judul yang BERBEDA untuk setiap sebab", () => {
    const judul = SEMUA_SEBAB.map(s => pesanGagal(new GalatRantai(s, "r", "h"), JARINGAN).judul);
    expect(new Set(judul).size).toBe(SEMUA_SEBAB.length);
  });

  it("TIDAK PERNAH berbunyi seperti daftar kosong", () => {
    for (const sebab of SEMUA_SEBAB) {
      const p = pesanGagal(new GalatRantai(sebab, "r", "h"), JARINGAN);
      const teks = `${p.judul} ${p.kalimat} ${p.saran}`.toLowerCase();
      expect(teks).not.toContain("no ballots found");
    }
  });

  it("menyebut HOST pada kegagalan transport", () => {
    const p = pesanGagal(new GalatRantai("jaringan", "Failed to fetch", "indexer.contoh.test"), JARINGAN);
    expect(p.kalimat).toContain("indexer.contoh.test");
  });

  it("kasus 'jaringan' menyebut indexer secara spesifik, bukan sekadar judul acak", () => {
    // Pemeriksaan uniqueness judul (uji lain) tidak menangkap judul yang
    // diganti dengan string ACAK-tapi-tetap-unik. Ini mengunci ISI, bukan
    // hanya keberagamannya.
    const p = pesanGagal(new GalatRantai("jaringan", "r", "h"), JARINGAN);
    expect(p.judul).toMatch(/indexer/i);
  });

  it("kasus 'dekode' menyebut bahwa state tidak dapat didekode", () => {
    const p = pesanGagal(new GalatRantai("dekode", "r", "h"), JARINGAN);
    expect(p.judul).toMatch(/decoded/i);
  });

  it("menyebut ALAMAT REGISTRY dan JARINGAN pada registry yang tidak ditemukan", () => {
    const p = pesanGagal(new GalatRantai("registry-hilang", "not found", "h"), JARINGAN);
    expect(p.kalimat).toContain(JARINGAN.alamatRegistry);
    expect(p.kalimat).toContain(JARINGAN.networkId);
  });

  it("TIDAK mengkonflasikan kegagalan kueri (graphql-fatal) dengan registry yang salah jaringan", () => {
    // Keduanya sempat memakai sebab yang sama, sehingga setiap galat GraphQL —
    // termasuk skema indexer yang berubah — dilaporkan sebagai "Registry not
    // found on this network" dan mengirim pembaca memeriksa VITE_MIDNIGHT_NETWORK
    // yang sebenarnya benar.
    const skema = pesanGagal(new GalatRantai("graphql-fatal", 'Unknown field "applyStage"', "h"), JARINGAN);
    const hilang = pesanGagal(new GalatRantai("registry-hilang", "not found", "h"), JARINGAN);
    expect(skema.judul).not.toBe(hilang.judul);
    expect(skema.judul).not.toMatch(/registry/i);
    expect(skema.saran).not.toMatch(/VITE_MIDNIGHT_NETWORK/);
    expect(hilang.saran).toMatch(/VITE_MIDNIGHT_NETWORK/);
  });

  it("TIDAK mengkonflasikan registry-skema dengan registry-hilang — kunci r hilang BUKAN registry kosong", () => {
    // `registry-skema` (kunci `r` hilang SELURUHNYA dari jawaban) dan
    // `registry-hilang` (`r` bernilai null) lahir dari kueri yang sama tapi
    // berarti dua hal berbeda: satunya galat SKEMA/ALIAS, satunya lagi
    // jawaban SAH yang bilang "tidak ada kontrak di alamat ini". Menyamakan
    // keduanya mengirim pembaca memeriksa jaringan padahal yang salah adalah
    // bentuk kuerinya — persis kesalahan yang dulu terjadi pada graphql-fatal.
    const skema = pesanGagal(
      new GalatRantai("registry-skema", "did not return a `r` field", "indexer.contoh.test"),
      JARINGAN,
    );
    const hilang = pesanGagal(new GalatRantai("registry-hilang", "not found", "h"), JARINGAN);
    expect(skema.judul).not.toBe(hilang.judul);
    expect(skema.judul).not.toMatch(/not found/i);
    // Saran registry-hilang ("periksa VITE_MIDNIGHT_NETWORK") SALAH di sini:
    // registry-skema tidak menyatakan apa pun tentang jaringan yang keliru.
    expect(skema.saran).not.toMatch(/VITE_MIDNIGHT_NETWORK/);
    expect(hilang.saran).toMatch(/VITE_MIDNIGHT_NETWORK/);
  });

  it("registry-skema juga TIDAK mengklaim jaringan salah di dalam kalimatnya", () => {
    // Kalimatnya BOLEH menyangkal ("...not a missing contract or a wrong
    // network") — yang dilarang adalah MENGKLAIM afirmatif bahwa jaringannya
    // salah, seperti gaya registry-hilang ("the network is wrong").
    const p = pesanGagal(new GalatRantai("registry-skema", "did not return a `r` field", "h"), JARINGAN);
    expect(p.kalimat).not.toMatch(/network is wrong/i);
    expect(p.kalimat).not.toMatch(/probably right but the network/i);
  });

  it("TIDAK menyebut jaringan apa pun pada kegagalan konfigurasi", () => {
    // Salah ketik VITE_MIDNIGHT_NETWORK=previewe terjadi SEBELUM ada jaringan
    // yang dituju. Melaporkannya sebagai kegagalan "preview" — jaringan yang
    // justru tidak diminta — menuntut objek konfigurasi yang dikarang, dan uji
    // ini yang melarangnya.
    const p = pesanGagal(
      new GalatRantai("konfigurasi", 'Unknown VITE_MIDNIGHT_NETWORK: "previewe". Valid values: preprod, preview, undeployed', ""),
      null,
    );
    // Nilai yang DIMINTA operator ikut ditampilkan apa adanya…
    expect(p.kalimat).toContain("previewe");
    // …tetapi kalimatnya TIDAK menyatakan bahwa sebuah jaringan gagal dibaca.
    // (Daftar nilai yang sah di dalam rincian memang menyebut "preview"; yang
    //  dilarang adalah MENGKLAIM jaringan itu sebagai jaringan yang dituju.)
    expect(p.kalimat).not.toMatch(/on the \w+ network/);
    expect(p.kalimat).not.toMatch(/could not connect to/);
    expect(p.judul).toMatch(/misconfigured/i);
    expect(p.judul).not.toMatch(/indexer/i);
  });

  it("tetap memberi kalimat konfigurasi walau jaringan kebetulan ada", () => {
    const p = pesanGagal(new GalatRantai("konfigurasi", "bad registry address", ""), JARINGAN);
    expect(p.judul).toMatch(/misconfigured/i);
  });

  it("PENYEMPITAN TIPE P1: sebab LAIN (bukan konfigurasi) dengan jaringan null tetap memberi kalimat konfigurasi, bukan crash", () => {
    // Ini persis skenario yang dilarang praperiksa P1 untuk "diperbaiki" dengan
    // membuang `|| jaringan === null`: sebuah GalatRantai bersebab
    // "registry-hilang" yang (secara hipotetis) dipanggil dengan jaringan
    // null TIDAK BOLEH lolos ke `case "registry-hilang"` dan mendereferensi
    // `jaringan.alamatRegistry` pada null.
    const p = pesanGagal(new GalatRantai("registry-hilang", "not found", "h"), null);
    expect(p.judul).toMatch(/misconfigured/i);
    expect(() => p.kalimat).not.toThrow();
  });
});

describe("ikonUntukSebab", () => {
  it("memetakan SETIAP sebab ke identitas ikon yang benar", () => {
    expect(ikonUntukSebab("jaringan")).toBe(Unplug);
    expect(ikonUntukSebab("dekode")).toBe(AlertTriangle);
    expect(ikonUntukSebab("konfigurasi")).toBe(AlertTriangle);
    for (const sebab of ["http", "bukan-json", "balasan-html", "graphql-fatal", "registry-hilang", "registry-skema"] as const) {
      expect(ikonUntukSebab(sebab)).toBe(ServerCrash);
    }
  });
});

describe("PanelGagalRantai", () => {
  it("TIDAK menampilkan label Attempt pada percobaan pertama (percobaan 0)", () => {
    const { container } = render(
      <PanelGagalRantai
        galat={new GalatRantai("jaringan", "Failed to fetch", "h")}
        jaringan={JARINGAN}
        percobaan={0}
        onCoba={() => {}}
      />,
    );
    expect(container.textContent).not.toMatch(/Attempt/);
  });

  it("memberi tombol Retry yang benar-benar memanggil balik", () => {
    const onCoba = vi.fn();
    const { container } = render(
      <PanelGagalRantai
        galat={new GalatRantai("jaringan", "Failed to fetch", "indexer.contoh.test")}
        jaringan={JARINGAN}
        percobaan={0}
        onCoba={onCoba}
      />,
    );
    container.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(onCoba).toHaveBeenCalledTimes(1);
  });

  it("membawa sebabnya ke DOM supaya dapat diperiksa uji dan laporan galat", () => {
    const { container } = render(
      <PanelGagalRantai
        galat={new GalatRantai("balasan-html", "portal", "h")}
        jaringan={JARINGAN}
        percobaan={2}
        onCoba={() => {}}
      />,
    );
    expect(container.querySelector("[data-sebab]")!.getAttribute("data-sebab")).toBe("balasan-html");
    expect(container.textContent).toContain("Attempt 3");
  });

  it("memakai role alert supaya pembaca layar mengumumkannya", () => {
    const { container } = render(
      <PanelGagalRantai
        galat={new GalatRantai("http", "502", "h")}
        jaringan={JARINGAN}
        percobaan={0}
        onCoba={() => {}}
      />,
    );
    expect(container.querySelector("[role='alert']")).not.toBeNull();
  });

  it("merender panel registry-skema tanpa melempar walau jaringan null", () => {
    const { container } = render(
      <PanelGagalRantai
        galat={new GalatRantai("registry-skema", "did not return a `r` field", "h")}
        jaringan={null}
        percobaan={0}
        onCoba={() => {}}
      />,
    );
    expect(container.querySelector("[data-sebab='registry-skema']")).not.toBeNull();
  });
});

describe("GridBallotMemuat", () => {
  it("merender kartu kerangka yang menandai dirinya sedang sibuk", () => {
    const { container } = render(<GridBallotMemuat count={3} />);
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(3);
    expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(3);
  });

  it("TIDAK pernah memakai teks keadaan kosong", () => {
    const { container } = render(<GridBallotMemuat />);
    expect(container.textContent).not.toContain("No ballots found");
  });

  it("default count adalah TEPAT 2 ketika tidak dioper eksplisit", () => {
    const { container } = render(<GridBallotMemuat />);
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(2);
  });
});

describe("SpandukSebagian", () => {
  it("tidak merender apa pun ketika tidak ada kegagalan", () => {
    const { container } = render(<SpandukSebagian gagal={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("menyebut jumlah entri yang gagal dibaca", () => {
    const { container } = render(
      <SpandukSebagian
        gagal={[
          { alamat: "aa", sebab: "dekode", pesan: "bukan ballot" },
          { alamat: "bb", sebab: "kontrak-null", pesan: "tidak ada kontrak" },
        ]}
      />,
    );
    expect(container.textContent).toContain("2 registry entries");
  });
});

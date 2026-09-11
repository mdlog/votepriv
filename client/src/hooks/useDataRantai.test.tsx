import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keDaftarBallot } from "@/lib/chain/ke-ballot";
import { useDataRantai } from "./useDataRantai";

/**
 * Mock SEBAGIAN — mempertahankan implementasi asli untuk seluruh uji, KECUALI
 * satu uji di bawah ("galat BUKAN GalatRantai …") yang menimpanya sekali lewat
 * mockImplementationOnce untuk mensimulasikan TypeError yang lolos dari
 * keDaftarBallot() di dalam .then() — skenario yang praperiksa P2 sebut nyata
 * dan yang mustahil dipicu lewat fixture sehat biasa (keDaftarBallot tidak
 * pernah melempar pada data yang sudah lolos dekodeBallot).
 */
vi.mock("@/lib/chain/ke-ballot", async importOriginal => {
  const asli = await importOriginal<typeof import("@/lib/chain/ke-ballot")>();
  return { ...asli, keDaftarBallot: vi.fn(asli.keDaftarBallot) };
});

afterEach(() => cleanup());

/**
 * Berkas ini `.test.tsx`, jadi vitest.config.ts memetakannya ke environment
 * jsdom (environmentMatchGlobs). jsdom menimpa `URL` GLOBAL dengan
 * implementasinya sendiri, sehingga pola `new URL(n, import.meta.url)` yang
 * dipakai uji `.test.ts` biasa (mis. baca-rantai.test.ts, yang berjalan di
 * environment "node" dan TIDAK punya masalah ini) gagal di sini dengan
 * "The URL must be of scheme file": objek yang dihasilkan adalah instance
 * URL milik jsdom, bukan milik Node, dan readFileSync menolaknya. Memakai
 * node:path + fileURLToPath alih-alih objek URL menghindari ambiguitas itu
 * sepenuhnya — keduanya modul Node murni yang tidak disentuh jsdom.
 */
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixture-rantai");
const baca = (n: string) => JSON.parse(readFileSync(path.join(DIR, n), "utf8"));
const fxRegistry = baca("registry.json");
const fxBallots = baca("ballots.json");
const fxJaringan = baca("jaringan.json");

function namaOperasi(init: RequestInit): string {
  return /query\s+(\w+)/.exec(JSON.parse(String(init.body)).query)?.[1] ?? "?";
}

function ambilSehat(): typeof fetch {
  return (async (_u: string, init: RequestInit) => {
    const nama = namaOperasi(init);
    const j = nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
    return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function Probe({ ambil }: { ambil: typeof fetch }) {
  const d = useDataRantai({ ambil });
  return (
    <div>
      <span data-testid="fase">{d.fase}</span>
      <span data-testid="jumlah">{d.fase === "siap" ? d.ballots.length : -1}</span>
      <span data-testid="sebab">{d.fase === "gagal" ? d.galat.sebab : ""}</span>
      <span data-testid="host">{d.fase === "gagal" ? d.galat.host : ""}</span>
      {/* "null" apa adanya, supaya uji dapat membuktikan bahwa hook TIDAK
          mengarang objek jaringan ketika konfigurasinya sendiri gagal. */}
      <span data-testid="jaringan">{d.jaringan === null ? "null" : d.jaringan.networkId}</span>
      <button onClick={d.muatUlang}>ulang</button>
    </div>
  );
}

describe("useDataRantai", () => {
  it("mulai dari memuat, lalu siap dengan daftar ballot", async () => {
    const { getByTestId } = render(<Probe ambil={ambilSehat()} />);
    expect(getByTestId("fase").textContent).toBe("memuat");
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("siap"));
    expect(Number(getByTestId("jumlah").textContent)).toBe(fxBallots.alamat.length);
  });

  it("jatuh ke gagal — BUKAN ke siap dengan daftar kosong — ketika indexer tak terjangkau", async () => {
    // Inilah aturan paling penting di seluruh task ini: kegagalan indexer TIDAK
    // BOLEH terlihat seperti "tidak ada ballot".
    const ambil = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const { getByTestId } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("gagal"));
    expect(getByTestId("sebab").textContent).toBe("jaringan");
    expect(Number(getByTestId("jumlah").textContent)).toBe(-1);
  });

  it("galat BUKAN GalatRantai (mis. TypeError dari keDaftarBallot di dalam .then()) dibungkus sebagai sebab jaringan/host unknown (P2)", async () => {
    // keDaftarBallot() tidak pernah melempar pada fixture sehat biasa — untuk
    // benar-benar menembus cabang wrap-generic-error di useDataRantai.ts,
    // implementasinya ditimpa SEKALI di sini lewat mock parsial di atas.
    vi.mocked(keDaftarBallot).mockImplementationOnce(() => {
      throw new TypeError("boom — bukan GalatRantai");
    });
    const { getByTestId } = render(<Probe ambil={ambilSehat()} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("gagal"));
    // host "unknown" — BUKAN "tidak diketahui" — karena galat.host dirender
    // apa adanya ke kalimat UI berbahasa Inggris (praperiksa P2).
    expect(getByTestId("sebab").textContent).toBe("jaringan");
    expect(getByTestId("host").textContent).toBe("unknown");
  });

  it("jatuh ke gagal bersebab registry-hilang — BUKAN graphql-fatal — ketika registry tidak ditemukan", async () => {
    const ambil = (async (_u: string, init: RequestInit) => {
      const nama = namaOperasi(init);
      const j = nama === "Registry" ? { data: { r: null }, errors: [] } : fxJaringan;
      return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const { getByTestId } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("gagal"));
    // Sebab yang tepat penting: permukaannya menyuruh pembaca memeriksa
    // VITE_MIDNIGHT_NETWORK, dan saran itu SALAH untuk graphql-fatal.
    expect(getByTestId("sebab").textContent).toBe("registry-hilang");
  });

  it("jatuh ke gagal bersebab registry-skema — BUKAN registry-hilang — ketika kunci r hilang seluruhnya", async () => {
    // registry-skema (kunci `r` HILANG dari data) BUKAN registry-hilang
    // (`r` bernilai null). Keduanya lahir dari kueri Registry yang sama
    // tapi berarti dua hal berbeda — lihat komentar taksonomi di graphql.ts.
    const ambil = (async (_u: string, init: RequestInit) => {
      const nama = namaOperasi(init);
      const j = nama === "Registry" ? { data: {}, errors: [] } : fxJaringan;
      return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const { getByTestId } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("gagal"));
    expect(getByTestId("sebab").textContent).toBe("registry-skema");
  });

  it("muatUlang memicu pembacaan baru", async () => {
    const ambil = vi.fn(ambilSehat()) as unknown as typeof fetch;
    const { getByTestId, getByText } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("siap"));
    const sebelum = (ambil as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await act(async () => {
      getByText("ulang").click();
    });
    await waitFor(() =>
      expect((ambil as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(sebelum),
    );
  });

  it("jatuh ke gagal bersebab konfigurasi TANPA mengarang jaringan", async () => {
    // Salah ketik env terjadi sebelum ada jaringan yang dituju. Hook TIDAK BOLEH
    // mengembalikan objek JaringanAktif rekaan, karena objek rekaan akan menyebut
    // jaringan yang justru tidak diminta operator.
    vi.stubEnv("VITE_MIDNIGHT_NETWORK", "previewe");
    const ambil = vi.fn() as unknown as typeof fetch;
    const { getByTestId } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("gagal"));
    expect(getByTestId("sebab").textContent).toBe("konfigurasi");
    expect(getByTestId("jaringan").textContent).toBe("null");
    // Dan tidak satu pun permintaan pernah berangkat.
    expect((ambil as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  /**
   * Praperiksa P4: uji brief sebelumnya HANYA mengassert `console.error` tidak
   * terpanggil, bersandar pada peringatan "Can't perform a React state update
   * on an unmounted component" yang React CABUT sejak v18 — pada React 19.2.1
   * (versi terpasang: node_modules/react/package.json), setState pada
   * komponen terlepas adalah no-op SENYAP, bukan peringatan. Premis uji itu
   * tidak berlaku lagi, dan bentuknya ("render lalu periksa tidak ada yang
   * berteriak") tidak menyatakan apa pun tentang PERILAKU hook — membuang
   * AbortController beserta kedua penjaga `if (ac.signal.aborted) return;`
   * akan tetap lolos hijau lewat uji lama itu.
   *
   * Dua uji di bawah menggantinya dengan pemeriksaan PERILAKU sungguhan: yang
   * pertama membuktikan AbortController benar-benar di-abort saat unmount
   * (mekanismenya, bukan efek sampingnya di console), dan yang kedua
   * membuktikan skenario yang komentar Step 1 SEBUT NYATA — "dua muatUlang
   * beruntun bisa mendarat terbalik" — benar-benar TIDAK terjadi.
   */
  it("unmount membatalkan AbortSignal permintaan yang sedang berjalan (P4)", async () => {
    let signalTertangkap: AbortSignal | undefined;
    const ambil = (async (_u: string, init: RequestInit) => {
      signalTertangkap = init.signal as AbortSignal;
      return new Promise<Response>(() => {
        /* tidak pernah selesai — mensimulasikan fetch yang masih di udara saat unmount */
      });
    }) as unknown as typeof fetch;
    const { unmount } = render(<Probe ambil={ambil} />);
    await waitFor(() => expect(signalTertangkap).toBeDefined());
    expect(signalTertangkap!.aborted).toBe(false);
    unmount();
    expect(signalTertangkap!.aborted).toBe(true);
  });

  it("percobaan lama yang mendarat TERLAMBAT tidak menimpa percobaan baru yang sudah siap (P4)", async () => {
    // Permintaan PERTAMA tertahan sampai sengaja dilepaskan oleh uji ini, dan
    // ketika akhirnya dilepaskan, ia GAGAL — mensimulasikan balasan lambat
    // yang akhirnya tiba TERLAMBAT, setelah percobaan kedua sudah lebih dulu
    // sukses. Tanpa penjaga `if (ac.signal.aborted) return;` (digabung dengan
    // pembatalan permintaan lama sebelum yang baru berangkat), galat yang
    // terlambat ini akan menimpa keadaan "siap" yang sudah benar dengan
    // "gagal" — persis kebalikan dari yang ditulis komentar Step 1.
    let sudahDipakai = false;
    let lepaskanPertama!: () => void;
    const gerbangPertama = new Promise<void>(res => {
      lepaskanPertama = res;
    });
    const ambil = (async (_u: string, init: RequestInit) => {
      if (!sudahDipakai) {
        sudahDipakai = true;
        await gerbangPertama;
        throw new TypeError("Failed to fetch (terlambat)");
      }
      const nama = namaOperasi(init);
      const j = nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
      return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const { getByTestId, getByText } = render(<Probe ambil={ambil} />);
    expect(getByTestId("fase").textContent).toBe("memuat");

    await act(async () => {
      getByText("ulang").click();
    });
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("siap"));
    expect(Number(getByTestId("jumlah").textContent)).toBe(fxBallots.alamat.length);

    await act(async () => {
      lepaskanPertama();
      // Beri giliran microtask/timer supaya rantai .then/.catch permintaan
      // pertama yang tertahan sempat benar-benar jalan.
      await new Promise(r => setTimeout(r, 0));
    });

    expect(getByTestId("fase").textContent).toBe("siap");
    expect(Number(getByTestId("jumlah").textContent)).toBe(fxBallots.alamat.length);
  });

  it("percobaan lama yang mendarat TERLAMBAT dengan SUKSES tidak menimpa percobaan baru yang sudah siap (G6)", async () => {
    // Varian G6 dari uji di atas: kali ini permintaan PERTAMA yang tertahan
    // akhirnya SUKSES (bukan gagal) setelah percobaan kedua sudah lebih dulu
    // sukses juga. Untuk membuat penimpaan TERLIHAT bila terjadi, hasil
    // percobaan pertama dipaksa berbeda lewat mock keDaftarBallot (larik
    // sentinel), bukan lewat fixture — dua bacaan sehat dari fixture yang
    // sama akan menghasilkan jumlah ballot yang SAMA, sehingga penimpaan tidak
    // akan pernah terlihat lewat "jumlah" walau penjaga `if (ac.signal.aborted)
    // return;` di jalur SUKSES (.then()) dibuang.
    let sudahDipakai = false;
    let lepaskanPertama!: () => void;
    const gerbangPertama = new Promise<void>(res => {
      lepaskanPertama = res;
    });
    const ambil = (async (_u: string, init: RequestInit) => {
      if (!sudahDipakai) {
        sudahDipakai = true;
        await gerbangPertama;
      }
      const nama = namaOperasi(init);
      const j = nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
      return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const { getByTestId, getByText } = render(<Probe ambil={ambil} />);
    expect(getByTestId("fase").textContent).toBe("memuat");

    await act(async () => {
      getByText("ulang").click();
    });
    await waitFor(() => expect(getByTestId("fase").textContent).toBe("siap"));
    expect(Number(getByTestId("jumlah").textContent)).toBe(fxBallots.alamat.length);

    // BARU SEKARANG antre override sentinel — supaya yang terkena adalah
    // panggilan keDaftarBallot untuk percobaan PERTAMA (yang baru akan
    // mendarat), bukan panggilan untuk percobaan kedua yang sudah lewat.
    vi.mocked(keDaftarBallot).mockImplementationOnce(() => [{ id: "SENTINEL-LAMA" }] as never);

    await act(async () => {
      lepaskanPertama();
      await new Promise(r => setTimeout(r, 0));
    });

    // Kalau penjaga aborted di .then() sukses dibuang, keDaftarBallot untuk
    // percobaan lama TETAP terpanggil dan hasilnya (larik sentinel panjang 1)
    // akan menimpa jumlah yang benar.
    expect(getByTestId("fase").textContent).toBe("siap");
    expect(Number(getByTestId("jumlah").textContent)).toBe(fxBallots.alamat.length);
  });

  it("AbortError yang BUKAN berasal dari AbortSignal kita sendiri tetap tidak dianggap kegagalan (G8)", async () => {
    // Penjaga `if (ac.signal.aborted) return;` mendahului penjaga AbortError,
    // jadi AbortError dari abort() KITA SENDIRI selalu tertangkap penjaga
    // PERTAMA lebih dulu — penjaga AbortError baru relevan pada kasus yang
    // lebih jarang ini: `ambil` melempar DOMException "AbortError" TANPA
    // signal kita sendiri pernah di-abort (mis. perilaku fetch/polyfill yang
    // tidak biasa). Tanpa penjaga ini, kasus itu akan salah dilaporkan
    // sebagai kegagalan jaringan biasa.
    const ambil = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    const { getByTestId } = render(<Probe ambil={ambil} />);
    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });
    expect(getByTestId("fase").textContent).toBe("memuat");
  });
});

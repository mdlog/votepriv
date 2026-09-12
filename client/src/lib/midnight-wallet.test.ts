import { afterEach, describe, expect, it, vi } from "vitest";
import { LACE_RDNS, listConnectors, pickConnector, WalletError } from "./midnight-wallet";

/**
 * Bentuk `window.midnight[<kunci-UUID>]` yang BENAR-BENAR diukur langsung di
 * mesin dengan Lace aktif, TANPA memanggil connect() (lihat task-5-brief.md
 * dan catatan berkas ini, baris 4-8): anggotanya PERSIS apiVersion (string),
 * connect (fungsi arity 1), icon (string), name (string, "lace"), rdns
 * (string) — TIDAK ADA enable/isEnabled/serviceUriConfig.
 *
 * Tipe milik sendiri (bukan mengimpor `RawConnector` dari midnight-wallet.ts)
 * karena @midnight-ntwrk/dapp-connector-api tidak terpasang di pohon ini (nol
 * baris di pnpm-lock.yaml) — ini pernyataan HARAPAN kita atas bentuk Lace,
 * bukan tipe yang diverifikasi paket resminya.
 */
type KonektorUji = {
  apiVersion: string;
  connect: (networkId?: string) => Promise<unknown>;
  icon: string;
  name: string;
  rdns: string;
};

const UUID_LACE = "7de6fefe-48cc-4a8b-9ad3-b26d1cfe4573";

/** connect() TIDAK PERNAH benar-benar dipanggil di uji ini — hanya diteruskan sebagai nilai untuk dicocokkan identitasnya. */
function konektorLace(): KonektorUji {
  return {
    apiVersion: "4.0.1",
    connect: vi.fn(async () => ({})),
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
    name: "lace",
    rdns: LACE_RDNS,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listConnectors — penemuan mentah, dipetakan APA ADANYA", () => {
  it("tidak ada window.midnight → array kosong (bukan melempar)", () => {
    expect(listConnectors()).toEqual([]);
  });

  it("satu konektor di bawah kunci UUID → field dipetakan PERSIS dari nilainya, key = kunci UUID itu sendiri", () => {
    const lace = konektorLace();
    vi.stubGlobal("midnight", { [UUID_LACE]: lace });
    expect(listConnectors()).toEqual([
      { key: UUID_LACE, name: "lace", rdns: LACE_RDNS, icon: lace.icon, apiVersion: "4.0.1" },
    ]);
  });
});

describe("pickConnector — penemuan konektor berbasis UUID (Task 5, fix round 1)", () => {
  it("Kasus 1: satu konektor Lace di bawah kunci UUID → ditemukan, raw PERSIS objek yang sama", () => {
    const lace = konektorLace();
    vi.stubGlobal("midnight", { [UUID_LACE]: lace });

    const { info, raw } = pickConnector();

    expect(info.key).toBe(UUID_LACE);
    expect(info.rdns).toBe(LACE_RDNS);
    expect(info.name).toBe("lace");
    expect(raw).toBe(lace); // identitas objek, bukan sekadar "ada yang balik"
  });

  it("Kasus 2: beberapa konektor sekaligus (Lace + satu konektor lain) → Lace yang dipilih, DIPAKU lewat identitas objek — bukan sekadar 'ada yang terpilih'", () => {
    const lace = konektorLace();
    const konektorLain: KonektorUji = {
      apiVersion: "1.0.0",
      connect: vi.fn(async () => ({})),
      icon: "icon-lain",
      name: "konektor-lain",
      rdns: "io.contoh.lain",
    };
    // Kunci UUID acak untuk KEDUANYA — urutan penyisipan properti tidak boleh
    // jadi alasan Lace terpilih (kalau begitu, mutasi "pakai all[0]" akan lolos
    // uji ini secara kebetulan). Konektor lain disisipkan LEBIH DULU.
    vi.stubGlobal("midnight", {
      "11111111-1111-1111-1111-111111111111": konektorLain,
      [UUID_LACE]: lace,
    });

    const { info, raw } = pickConnector();

    expect(info.key).toBe(UUID_LACE);
    expect(info.rdns).toBe(LACE_RDNS);
    expect(raw).toBe(lace);
    expect(raw).not.toBe(konektorLain);
  });

  it("Kasus 3a: window.midnight TIDAK ADA → WalletError NO_CONNECTOR dengan pesan yang berguna, BUKAN TypeError", () => {
    expect(() => pickConnector()).toThrow(WalletError);
    try {
      pickConnector();
      throw new Error("seharusnya sudah melempar di baris sebelumnya");
    } catch (error) {
      expect(error).toBeInstanceOf(WalletError);
      expect((error as WalletError).code).toBe("NO_CONNECTOR");
      expect((error as Error).message).toMatch(/tidak ada wallet midnight/i);
    }
  });

  it("Kasus 3b: window.midnight ADA tapi KOSONG ({}) → WalletError NO_CONNECTOR yang sama, BUKAN TypeError", () => {
    vi.stubGlobal("midnight", {});
    try {
      pickConnector();
      throw new Error("seharusnya sudah melempar di baris sebelumnya");
    } catch (error) {
      expect(error).toBeInstanceOf(WalletError);
      expect((error as WalletError).code).toBe("NO_CONNECTOR");
      expect((error as Error).message).toMatch(/tidak ada wallet midnight/i);
    }
  });

  it("Kasus 4: konektor ADA tapi TANPA connect() → gagal dengan pesan yang MENYEBUT connect, bukan TypeError buta di titik panggil lain", () => {
    const konektorRusak: Omit<KonektorUji, "connect"> = {
      apiVersion: "4.0.1",
      icon: "icon",
      name: "lace",
      rdns: LACE_RDNS,
    };
    vi.stubGlobal("midnight", { [UUID_LACE]: konektorRusak });

    try {
      pickConnector();
      throw new Error("seharusnya sudah melempar di baris sebelumnya");
    } catch (error) {
      expect(error).toBeInstanceOf(WalletError);
      expect((error as WalletError).code).toBe("NO_CONNECTOR");
      expect((error as Error).message).toMatch(/connect/);
    }
  });
});

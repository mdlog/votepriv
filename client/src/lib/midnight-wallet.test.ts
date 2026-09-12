import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectMidnightWallet,
  handleBasi,
  jaringanKeliru,
  LACE_RDNS,
  listConnectors,
  PROBE_NETWORKS,
  pickConnector,
  WalletError,
} from "./midnight-wallet";

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

/**
 * Bentuk MINIMAL objek `api` yang dikembalikan `raw.connect()` — hanya method
 * yang benar-benar dipanggil lewat tryCall() di dalam connectMidnightWallet.
 * Tipe sendiri (bukan bergantung pada apa pun dari @midnight-ntwrk/dapp-
 * connector-api, yang tidak terpasang — lihat komentar berkas ini baris 11-14)
 * karena `api` sendiri bertipe `unknown` di titik pemakaiannya: TypeScript
 * hanya perlu tahu bentuk NILAI yang dibuat di sini, bukan tipe yang
 * connectMidnightWallet berikan padanya. Tidak ada `as any`/`as unknown`.
 */
type ApiUji = {
  getConnectionStatus?: () => Promise<{ networkId?: string }>;
  getShieldedAddresses?: () => Promise<Record<string, unknown>>;
  getUnshieldedAddress?: () => Promise<Record<string, unknown>>;
  getConfiguration?: () => Promise<Record<string, unknown>>;
};

/**
 * Task 9 — menutup ENAM penjaga di connectMidnightWallet yang dibawa TANPA
 * uji dari Task 5 (lihat task-9-report.md untuk daftar lengkap dengan nomor
 * baris): NETWORK_MISMATCH ×2 (silang-periksa getConnectionStatus, dan
 * seluruh PROBE_NETWORKS habis ditolak), WALLET_STALE, fallback
 * CONNECT_REJECTED, NO_ADDRESS, dan klasifier jaringanKeliru/handleBasi.
 *
 * Fake timers WAJIB di sini (bukan gaya): connectMidnightWallet membungkus
 * SETIAP raw.connect() dengan tungguWallet(), yang menyalakan setTimeout
 * WALLET_LAMBAT_MS (8 detik) dan WALLET_TIMEOUT_MS (120 detik) nyata setiap
 * panggilan. Mock connect() di bawah selalu selesai lewat microtask (resolve/
 * reject langsung), jadi timer itu tidak pernah sungguh menyala — tapi tanpa
 * fake timers, vitest tetap menjadwalkan clearTimeout terhadap timer NYATA di
 * event loop Node, dan gerbang "uji tidak bergantung jam dinding" di brief
 * task ini eksplisit melarang bergantung pada timer nyata sama sekali,
 * disengaja atau tidak.
 */
describe("connectMidnightWallet — enam penjaga (Task 9, dibawa dari Task 5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("jalur bahagia — connect berhasil di jaringan eksplisit, shielded diutamakan atas unshielded, field diteruskan APA ADANYA", async () => {
    const lace = konektorLace();
    const api: ApiUji = {
      getConnectionStatus: vi.fn(async () => ({ networkId: "preview" })),
      getShieldedAddresses: vi.fn(async () => ({
        shieldedAddress: "mn_shield-addr_preview1xyz",
        shieldedCoinPublicKey: "cpk-1",
        shieldedEncryptionPublicKey: "epk-1",
      })),
      getUnshieldedAddress: vi.fn(async () => ({ address: "mn_addr_preview1abc" })),
      getConfiguration: vi.fn(async () => ({ networkId: "preview", indexerUri: "https://indexer.example" })),
    };
    lace.connect = vi.fn(async () => api);
    vi.stubGlobal("midnight", { [UUID_LACE]: lace });

    const hasil = await connectMidnightWallet("preview");

    expect(hasil.address).toBe("mn_shield-addr_preview1xyz");
    expect(hasil.unshieldedAddress).toBe("mn_addr_preview1abc");
    expect(hasil.coinPublicKey).toBe("cpk-1");
    expect(hasil.encryptionPublicKey).toBe("epk-1");
    expect(hasil.networkId).toBe("preview");
    expect(hasil.connectorName).toBe("lace");
    expect(hasil.api).toBe(api); // identitas objek, bukan salinan
  });

  it("Penjaga 1/6 — NETWORK_MISMATCH: connect() menerima networkId eksplisit tapi getConnectionStatus melapor jaringan LAIN", async () => {
    const lace = konektorLace();
    const api: ApiUji = { getConnectionStatus: vi.fn(async () => ({ networkId: "preview" })) };
    lace.connect = vi.fn(async () => api);
    vi.stubGlobal("midnight", { [UUID_LACE]: lace });

    const err = await connectMidnightWallet("preprod").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WalletError);
    expect((err as WalletError).code).toBe("NETWORK_MISMATCH");
    expect((err as Error).message).toMatch(/preview/);
    expect((err as Error).message).toMatch(/preprod/);
  });

  it("Penjaga 2/6 — NETWORK_MISMATCH: SELURUH PROBE_NETWORKS ditolak sebagai jaringan keliru", async () => {
    const lace = konektorLace();
    const dicoba: (string | undefined)[] = [];
    lace.connect = vi.fn(async (net?: string) => {
      dicoba.push(net);
      throw new Error(`Unsupported network ID: ${net}`);
    });
    vi.stubGlobal("midnight", { [UUID_LACE]: lace });

    const err = await connectMidnightWallet().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WalletError);
    expect((err as WalletError).code).toBe("NETWORK_MISMATCH");
    expect((err as Error).message).toMatch(/preprod, preview, undeployed/);
    // Presence pin: SELURUH probe list benar-benar dicoba, urut, bukan berhenti
    // di tengah — bukan sekadar "akhirnya melempar".
    expect(dicoba).toEqual([...PROBE_NETWORKS]);
  });

  it("Penjaga 3/6 — WALLET_STALE: pesan penolakan cocok pola handle basi (context invalidated)", async () => {
    const lace = konektorLace();
    lace.connect = vi.fn(async () => {
      throw new Error("Extension context invalidated.");
    });
    vi.stubGlobal("midnight", { [UUID_LACE]: lace });

    const err = await connectMidnightWallet("preview").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WalletError);
    expect((err as WalletError).code).toBe("WALLET_STALE");
    expect((err as Error).message).toMatch(/muat ulang halaman/i);
    expect((err as WalletError).cause).toBeInstanceOf(Error);
    expect(((err as WalletError).cause as Error).message).toBe("Extension context invalidated.");
  });

  it("Penjaga 4/6 — CONNECT_REJECTED: fallback untuk penolakan yang BUKAN jaringan keliru maupun handle basi, pesan diteruskan APA ADANYA", async () => {
    const lace = konektorLace();
    lace.connect = vi.fn(async () => {
      throw new Error("User rejected the request.");
    });
    vi.stubGlobal("midnight", { [UUID_LACE]: lace });

    const err = await connectMidnightWallet("preview").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WalletError);
    expect((err as WalletError).code).toBe("CONNECT_REJECTED");
    expect((err as Error).message).toBe("User rejected the request.");
  });

  it("Penjaga 4/6 (cabang pesan kosong) — CONNECT_REJECTED jatuh ke pesan bawaan bila error tidak punya pesan", async () => {
    const lace = konektorLace();
    lace.connect = vi.fn(async () => {
      throw new Error("");
    });
    vi.stubGlobal("midnight", { [UUID_LACE]: lace });

    const err = await connectMidnightWallet("preview").catch((e: unknown) => e);
    expect((err as WalletError).code).toBe("CONNECT_REJECTED");
    expect((err as Error).message).toBe("Wallet menolak permintaan koneksi.");
  });

  it("Penjaga 5/6 — NO_ADDRESS: connect berhasil tapi getShieldedAddresses/getUnshieldedAddress sama-sama tidak membawa alamat", async () => {
    const lace = konektorLace();
    const api: ApiUji = {
      getShieldedAddresses: vi.fn(async () => ({})),
      getUnshieldedAddress: vi.fn(async () => ({})),
    };
    lace.connect = vi.fn(async () => api);
    vi.stubGlobal("midnight", { [UUID_LACE]: lace });

    const err = await connectMidnightWallet("preview").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WalletError);
    expect((err as WalletError).code).toBe("NO_ADDRESS");
    expect((err as Error).message).toMatch(/tidak mengembalikan alamat/i);
  });
});

/**
 * Penjaga 6/6 — klasifier jaringanKeliru/handleBasi, diuji LANGSUNG (lihat
 * alasan ekspornya di midnight-wallet.ts, baris 185-192): setiap pola regex
 * dipin ke SATU pesan yang cocok DAN satu yang tidak, bukan sekadar "sesuatu
 * lolos" — mutasi yang mempersempit atau memperlebar salah satu alternasi
 * regex harus membuat salah satu assert di bawah merah.
 */
describe("jaringanKeliru — klasifikasi pesan penolakan jaringan (Penjaga 6/6)", () => {
  it("cocok untuk 'network id mismatch' dan 'unsupported network id', case-insensitive", () => {
    expect(jaringanKeliru("Network ID mismatch: expected preview")).toBe(true);
    expect(jaringanKeliru("UNSUPPORTED NETWORK ID: testnet")).toBe(true);
  });

  it("TIDAK cocok untuk pesan penolakan lain", () => {
    expect(jaringanKeliru("User rejected the request.")).toBe(false);
  });
});

describe("handleBasi — klasifikasi handle wallet basi (Penjaga 6/6)", () => {
  it("cocok untuk KELIMA pola pesan restart ekstensi, case-insensitive", () => {
    expect(handleBasi("Extension was shutdown.")).toBe(true);
    expect(handleBasi("This port can no longer be used.")).toBe(true);
    expect(handleBasi("Extension context invalidated.")).toBe(true);
    expect(handleBasi("The receiving end does not exist.")).toBe(true);
    expect(handleBasi("Could not establish connection.")).toBe(true);
  });

  it("TIDAK cocok untuk pesan penolakan biasa", () => {
    expect(handleBasi("User rejected the request.")).toBe(false);
  });
});

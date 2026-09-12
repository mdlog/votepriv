import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdaptorWallet } from "./adaptor-wallet";
import { rakitProvidersBallotBrowser } from "./providers-tulis";

/**
 * KOREKSI BRIEF: `vi.fn(asli.FetchZkConfigProvider)` gagal saat "wajib" —
 * `FetchZkConfigProvider` adalah `class` ES6 sungguhan, dan tinyspy/vitest
 * (2.1.9, terpasang) memanggil implementasi lewat `.apply()`, bukan lewat
 * `Reflect.construct`. Memanggil sebuah `class` tanpa `new` melempar
 * "Class constructor ... cannot be invoked without 'new'" — diverifikasi
 * lewat reproduksi terisolasi sebelum baris ini ditulis. Diperbaiki dengan
 * membungkus `class` dalam FUNGSI PABRIK biasa yang sendiri memanggil `new`
 * pada kelas asli: pemanggil (`providers-tulis.ts`) tetap memakai `new
 * FetchZkConfigProvider(...)`, dan `new` atas fungsi pabrik ini mewarisi
 * nilai balik objek dari pabrik tersebut (aturan `[[Construct]]` JS: fungsi
 * biasa yang me-return objek eksplisit membuat `new` mengembalikan objek itu,
 * bukan `this` yang baru) — sehingga instance yang dihasilkan tetap instance
 * ASLI `FetchZkConfigProvider`, dan `vi.fn` tetap mencatat panggilan/argumen
 * seperti biasa.
 */
vi.mock("./zk-config-fetch", async (impor) => {
  const asli = await impor<typeof import("./zk-config-fetch")>();
  const FetchZkConfigProviderTiruan = vi.fn(
    (...args: ConstructorParameters<typeof asli.FetchZkConfigProvider>) => new asli.FetchZkConfigProvider(...args),
  );
  // Tanpa ini, `toBeInstanceOf(FetchZkConfigProvider)` di uji ketiga gagal:
  // objek yang dikembalikan MEMANG instance kelas asli (lihat komentar di
  // atas), tapi `instanceof` memeriksa `.prototype` milik NILAI di sisi
  // kanan — dan `.prototype` bawaan fungsi tiruan vi.fn adalah objek polos
  // yang tidak berhubungan sama sekali dengan `asli.FetchZkConfigProvider.prototype`.
  FetchZkConfigProviderTiruan.prototype = asli.FetchZkConfigProvider.prototype;
  return { ...asli, FetchZkConfigProvider: FetchZkConfigProviderTiruan };
});

/**
 * TAMBAHAN di luar brief (temuan sendiri, lihat task-4-report.md G3):
 * `httpClientProofProvider` bukan `class`, jadi tidak butuh trik `.prototype`
 * di atas — `vi.fn(implementasiAsli)` biasa sudah cukup, dan tetap benar-benar
 * MEMANGGIL implementasi asli (bukan menggantinya dengan tiruan bisu), jadi
 * `proofProvider` yang dikembalikan tetap objek ProofProvider sungguhan.
 */
vi.mock("@midnight-ntwrk/midnight-js-http-client-proof-provider", async (impor) => {
  const asli = await impor<typeof import("@midnight-ntwrk/midnight-js-http-client-proof-provider")>();
  return { ...asli, httpClientProofProvider: vi.fn(asli.httpClientProofProvider) };
});

function dompetTiruan(): AdaptorWallet {
  return {
    getCoinPublicKey: () => "cpk",
    getEncryptionPublicKey: () => "epk",
    balanceTx: async (tx) => tx as never,
    submitTx: async () => "txid",
  };
}

describe("rakitProvidersBallotBrowser", () => {
  // Tanpa ini, hitungan panggilan FetchZkConfigProvider terakumulasi lintas
  // `it` (mock modul di-hoist, jadi SATU instance vi.fn dipakai seluruh
  // berkas) — uji "HANYA SATU instance" akan melihat panggilan dari kedua
  // uji sebelumnya juga, bukan hanya panggilannya sendiri.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mengembalikan objek dengan ENAM kunci provider persis", () => {
    const providers = rakitProvidersBallotBrowser({
      indexerUri: "https://indexer.example/api/v3/graphql",
      indexerWsUri: "wss://indexer.example/api/v3/graphql/ws",
      zkBaseUrl: "https://app.example/zk/ballot",
      proofServerUrl: "https://app.example/proof-server",
      dompet: dompetTiruan(),
    });
    expect(Object.keys(providers).sort()).toEqual(
      ["midnightProvider", "privateStateProvider", "proofProvider", "publicDataProvider", "walletProvider", "zkConfigProvider"].sort(),
    );
  });

  it("walletProvider dan midnightProvider adalah OBJEK dompet YANG SAMA (bukan disalin)", () => {
    const dompet = dompetTiruan();
    const providers = rakitProvidersBallotBrowser({
      indexerUri: "https://indexer.example/api/v3/graphql",
      indexerWsUri: "wss://indexer.example/api/v3/graphql/ws",
      zkBaseUrl: "https://app.example/zk/ballot",
      proofServerUrl: "https://app.example/proof-server",
      dompet,
    });
    expect(providers.walletProvider).toBe(dompet);
    expect(providers.midnightProvider).toBe(dompet);
  });

  it("HANYA membuat SATU instance FetchZkConfigProvider, dipakai zkConfigProvider maupun proofProvider", async () => {
    const { FetchZkConfigProvider } = await import("./zk-config-fetch");
    const providers = rakitProvidersBallotBrowser({
      indexerUri: "https://indexer.example/api/v3/graphql",
      indexerWsUri: "wss://indexer.example/api/v3/graphql/ws",
      zkBaseUrl: "https://app.example/zk/ballot",
      proofServerUrl: "https://app.example/proof-server",
      dompet: dompetTiruan(),
    });
    expect(FetchZkConfigProvider).toHaveBeenCalledTimes(1);
    expect(FetchZkConfigProvider).toHaveBeenCalledWith("https://app.example/zk/ballot");
    expect(providers.zkConfigProvider).toBeInstanceOf(FetchZkConfigProvider);
  });

  /**
   * TAMBAHAN di luar brief (G3, lihat task-4-report.md): `zkBaseUrl` dan
   * `proofServerUrl` adalah dua field STRING bertetangga yang masing-masing
   * cuma dipakai SATU KALI, tepat gaya "cacat tertukar-slot" yang brief
   * peringatkan — dan validasi skema URL milik `httpClientProofProvider`
   * TIDAK menangkap penukarannya (keduanya sama-sama https di sini, jadi
   * skemanya identik). Tanpa uji nilai eksplisit ini, menukar keduanya di
   * `rakitProvidersBallotBrowser` akan lolos utuh baik lewat pnpm test
   * MAUPUN lewat `pnpm check`/`check:uji` (dua-duanya string biasa) — proof
   * server browser akan diam-diam bicara ke server ZK, dan sebaliknya.
   */
  it("proofProvider dikonstruksi dengan proofServerUrl (BUKAN zkBaseUrl) dan zkConfigProvider yang sama", async () => {
    const { httpClientProofProvider } = await import("@midnight-ntwrk/midnight-js-http-client-proof-provider");
    const providers = rakitProvidersBallotBrowser({
      indexerUri: "https://indexer.example/api/v3/graphql",
      indexerWsUri: "wss://indexer.example/api/v3/graphql/ws",
      zkBaseUrl: "https://app.example/zk/ballot",
      proofServerUrl: "https://app.example/proof-server",
      dompet: dompetTiruan(),
    });
    expect(httpClientProofProvider).toHaveBeenCalledTimes(1);
    expect(httpClientProofProvider).toHaveBeenCalledWith(
      "https://app.example/proof-server",
      providers.zkConfigProvider,
      { timeout: 600_000 },
    );
  });
});

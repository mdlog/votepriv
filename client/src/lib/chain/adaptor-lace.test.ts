import { describe, expect, it, vi } from "vitest";
import type { WalletConnection } from "@/lib/midnight-wallet";

// `Transaction.deserialize` DIMOCK, bukan dipanggil sungguhan: parsing biner
// wasm sungguhan butuh blob transaksi valid yang tidak murah dibuat di uji
// unit. Yang diverifikasi di sini adalah bahwa ADAPTOR memanggilnya dengan
// marker dan bytes yang BENAR, dan meneruskan hasilnya APA ADANYA — bukan
// bahwa ledger-v8 sendiri bisa mem-parse byte sembarangan (di luar lingkup
// berkas ini).
const { deserializeMock } = vi.hoisted(() => ({ deserializeMock: vi.fn() }));
vi.mock("@midnight-ntwrk/ledger-v8", () => ({
  Transaction: { deserialize: deserializeMock },
}));

const { buatAdaptorLace } = await import("./adaptor-lace");

function walletContoh(api: unknown, override: Partial<WalletConnection> = {}): WalletConnection {
  return {
    address: "mn_shield-addr_test1x",
    coinPublicKey: "cpk-hex",
    encryptionPublicKey: "epk-hex",
    networkId: "preview",
    connectorName: "lace",
    apiVersion: "4.0.1",
    api,
    ...override,
  };
}

/**
 * Meniru PERSIS bagaimana Lace sungguhan menolak masukan. Pesan dan jenis
 * galat di bawah dikutip DARI PENGGUNA yang menekan vote pada ekstensi Lace
 * sungguhan (bukan tebakan):
 *
 *   Unexpected error submitting scoped transaction '<unnamed>':
 *   TypeError: The first argument must be one of type string, Buffer,
 *   ArrayBuffer, Array, or Array-like Object. Received type object
 *
 * — ciri khas `Buffer.from(x)` menolak objek biasa. `hasilBila` HANYA
 * dipanggil bila `x` LOLOS pemeriksaan bentuk itu, sama seperti Buffer.from
 * sungguhan hanya memproses lebih lanjut bila masukannya array-like.
 */
function bufferFromPersis<T>(x: unknown, hasilBila: () => T): T {
  const arrayLike =
    typeof x === "string" ||
    x instanceof Uint8Array ||
    x instanceof ArrayBuffer ||
    Array.isArray(x) ||
    (typeof x === "object" && x !== null && typeof (x as { length?: unknown }).length === "number");
  if (!arrayLike) {
    throw new TypeError(
      "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type object",
    );
  }
  return hasilBila();
}

/**
 * Meniru PERSIS bagaimana ledger-v8 wasm menolak marker binding yang salah:
 * `expected header tag '<X>', got '<Y>'` — bentuk pesan ini dikutip dari
 * `strings` atas `midnight_ledger_wasm_bg.wasm` yang TERPASANG di pohon ini,
 * dan wasm itu BYTE-IDENTIK (sha256 88ff7c7c...ea7638, diverifikasi lewat
 * sha256sum) dengan yang dibundel ekstensi Lace 2.3.2 sungguhan — jadi bukan
 * pesan rekaan, meski teks INI TIDAK diklaim persis sama dengan tag internal
 * sungguhan (yang tidak diekstrak). `deserializeMock` hanya "berhasil" bila
 * marker binding yang dioper cocok dengan status binding SEBENARNYA dari
 * bytes — sama seperti wasm sungguhan menolak marker yang tidak cocok dengan
 * data.
 */
function deserializeSepertiWasm(bindingSebenarnya: "binding" | "pre-binding") {
  return (_sig: string, _proof: string, binding: string, bytes: Uint8Array) => {
    if (binding !== bindingSebenarnya) {
      throw new Error(`expected header tag '${bindingSebenarnya}', got '${binding}'`);
    }
    return { __sentinel: `deserialize-ok:${binding}`, panjangBytes: bytes.length };
  };
}

describe("buatAdaptorLace", () => {
  it("melempar bila wallet tidak melaporkan coinPublicKey/encryptionPublicKey", () => {
    expect(() => buatAdaptorLace(walletContoh({}, { coinPublicKey: undefined }))).toThrow(/coinPublicKey/);
  });

  it("getCoinPublicKey/getEncryptionPublicKey mengembalikan nilai WalletConnection APA ADANYA", () => {
    const dompet = buatAdaptorLace(walletContoh({}));
    expect(dompet.getCoinPublicKey()).toBe("cpk-hex");
    expect(dompet.getEncryptionPublicKey()).toBe("epk-hex");
  });

  describe("balanceTx", () => {
    it("mengoper BENTUK TERSERIALISASI ke wallet, bukan objek Transaction (reproduksi galat Lace sungguhan)", async () => {
      const hasilSeimbang = { __sentinel: "tx-seimbang" };
      const balanceSealedTransaction = vi.fn(async (tx: unknown) => bufferFromPersis(tx, () => hasilSeimbang));
      const dompet = buatAdaptorLace(walletContoh({ balanceSealedTransaction }));
      const bytesTx = new Uint8Array([7, 7, 7]);
      const tx = { serialize: () => bytesTx, identifiers: () => [] };

      await expect(dompet.balanceTx(tx as never)).resolves.toBe(hasilSeimbang);
      expect(balanceSealedTransaction).toHaveBeenCalledWith(bytesTx, undefined);
    });

    it("mencoba balanceUnsealedTransaction LEBIH DULU — tx kita adalah UnboundTransaction (pre-binding), markernya cocok dengan 'unsealed' bukan 'sealed' (lihat komentar kepala berkas)", async () => {
      const hasilSeimbang = { __sentinel: "tx-seimbang" };
      const balanceUnsealedTransaction = vi.fn(async () => hasilSeimbang);
      const balanceSealedTransaction = vi.fn(async () => ({ __sentinel: "tidak-dipakai" }));
      const dompet = buatAdaptorLace(walletContoh({ balanceSealedTransaction, balanceUnsealedTransaction }));
      const tx = { serialize: () => new Uint8Array([1]), identifiers: () => [] };

      await expect(dompet.balanceTx(tx as never)).resolves.toBe(hasilSeimbang);
      expect(balanceUnsealedTransaction).toHaveBeenCalledTimes(1);
      expect(balanceSealedTransaction).not.toHaveBeenCalled();
    });

    it("jatuh ke balanceSealedTransaction bila balanceUnsealedTransaction tidak ada (fallback nama metode, bukan jalur nyata di Lace — Lace selalu mendaftarkan keduanya)", async () => {
      const hasilSeimbang = { __sentinel: "tx-seimbang-2" };
      const balanceSealedTransaction = vi.fn(async () => hasilSeimbang);
      const dompet = buatAdaptorLace(walletContoh({ balanceSealedTransaction }));
      const tx = { serialize: () => new Uint8Array([2]), identifiers: () => [] };

      await expect(dompet.balanceTx(tx as never)).resolves.toBe(hasilSeimbang);
    });

    it("melempar galat yang MENYEBUT NAMA METODE bila keduanya tidak ada", async () => {
      const dompet = buatAdaptorLace(walletContoh({ metodeLain: () => {} }));
      await expect(dompet.balanceTx({} as never)).rejects.toThrow(/balanceSealedTransaction/);
    });

    it("bentuk 'objek': memakai objek transaksi APA ADANYA bila wallet sudah mengembalikan objek", async () => {
      const hasilObjek = { __sentinel: "objek-langsung" };
      const balanceSealedTransaction = vi.fn(async () => hasilObjek);
      const dompet = buatAdaptorLace(walletContoh({ balanceSealedTransaction }));
      const tx = { serialize: () => new Uint8Array([3]), identifiers: () => [] };

      await expect(dompet.balanceTx(tx as never)).resolves.toBe(hasilObjek);
      expect(deserializeMock).not.toHaveBeenCalled();
    });

    it("bentuk 'bytes': mendeserialisasi bila wallet mengembalikan Uint8Array", async () => {
      deserializeMock.mockReset();
      const bytesBalik = new Uint8Array([1, 2, 3]);
      const hasilDeserialize = { __sentinel: "dari-bytes" };
      deserializeMock.mockReturnValueOnce(hasilDeserialize);
      const balanceSealedTransaction = vi.fn(async () => bytesBalik);
      const dompet = buatAdaptorLace(walletContoh({ balanceSealedTransaction }));
      const tx = { serialize: () => new Uint8Array([4]), identifiers: () => [] };

      await expect(dompet.balanceTx(tx as never)).resolves.toBe(hasilDeserialize);
      expect(deserializeMock).toHaveBeenCalledWith("signature", "proof", "binding", bytesBalik);
    });

    it("bentuk 'hex': mendeserialisasi bila wallet mengembalikan string heksadesimal", async () => {
      deserializeMock.mockReset();
      const hasilDeserialize = { __sentinel: "dari-hex" };
      deserializeMock.mockReturnValueOnce(hasilDeserialize);
      const balanceSealedTransaction = vi.fn(async () => "0a0b0c");
      const dompet = buatAdaptorLace(walletContoh({ balanceSealedTransaction }));
      const tx = { serialize: () => new Uint8Array([5]), identifiers: () => [] };

      await expect(dompet.balanceTx(tx as never)).resolves.toBe(hasilDeserialize);
      expect(deserializeMock).toHaveBeenCalledTimes(1);
      const bytesDikirim = deserializeMock.mock.calls[0][3] as Uint8Array;
      expect(Array.from(bytesDikirim)).toEqual([0x0a, 0x0b, 0x0c]);
    });

    it("melempar galat yang jelas bila wallet mengembalikan bentuk yang tidak dikenali", async () => {
      const balanceSealedTransaction = vi.fn(async () => 42);
      const dompet = buatAdaptorLace(walletContoh({ balanceSealedTransaction }));
      const tx = { serialize: () => new Uint8Array([6]), identifiers: () => [] };

      await expect(dompet.balanceTx(tx as never)).rejects.toThrow(/unrecognized shape/);
    });

    it("bentuk '{ tx: hex }' (bentuk NYATA Lace 2.3.2 — kedua jalur balance di js/119.js berakhir identik, lihat komentar kepala berkas): unwrap .tx lalu deserialisasi dengan marker 'binding' (hasil SUDAH bound — signRecipe+finalizeRecipe sudah jalan), BUKAN 'pre-binding', dan BUKAN dikembalikan apa adanya sebagai objek pembungkus", async () => {
      deserializeMock.mockReset();
      deserializeMock.mockImplementation(deserializeSepertiWasm("binding"));
      const balanceUnsealedTransaction = vi.fn(async () => ({ tx: "0a0b0c" }));
      const dompet = buatAdaptorLace(walletContoh({ balanceUnsealedTransaction }));
      const tx = { serialize: () => new Uint8Array([1]), identifiers: () => [] };

      const hasil = await dompet.balanceTx(tx as never);
      // Bila kode memperlakukan { tx: "0a0b0c" } apa adanya (passthrough objek
      // generik, tanpa unwrap+deserialize), hasilnya adalah objek pembungkus
      // itu sendiri — bukan sentinel dari deserializeMock. Kedua assert di
      // bawah MERAH bila cabang unwrap { tx } dihapus (Mutasi wajib b).
      expect(hasil).not.toEqual({ tx: "0a0b0c" });
      expect((hasil as { __sentinel?: string }).__sentinel).toBe("deserialize-ok:binding");
      expect(deserializeMock).toHaveBeenCalledWith("signature", "proof", "binding", expect.any(Uint8Array));
      const bytesDikirim = deserializeMock.mock.calls[0][3] as Uint8Array;
      expect(Array.from(bytesDikirim)).toEqual([0x0a, 0x0b, 0x0c]);
    });
  });

  describe("submitTx", () => {
    it("mengoper BENTUK TERSERIALISASI ke wallet, bukan objek Transaction (reproduksi PERSIS galat Lace sungguhan)", async () => {
      const submitTransaction = vi.fn(async (tx: unknown) => bufferFromPersis(tx, () => "tx-id-dari-bytes"));
      const bytesTx = new Uint8Array([9, 8, 7]);
      const tx = { serialize: () => bytesTx, identifiers: () => [] };
      const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));

      await expect(dompet.submitTx(tx as never)).resolves.toBe("tx-id-dari-bytes");
      expect(submitTransaction).toHaveBeenCalledWith(bytesTx);
    });

    it("memakai nilai submitTransaction bila berupa string", async () => {
      const submitTransaction = vi.fn(async () => "tx-id-dari-wallet");
      const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
      const tx = { identifiers: () => ["tidak-dipakai"], serialize: () => new Uint8Array([10]) };
      await expect(dompet.submitTx(tx as never)).resolves.toBe("tx-id-dari-wallet");
    });

    it("jatuh ke tx.identifiers() bila submitTransaction mengembalikan undefined (Risiko #1)", async () => {
      const submitTransaction = vi.fn(async () => undefined);
      const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
      const tx = { identifiers: () => ["id-lokal-1"], serialize: () => new Uint8Array([11]) };
      await expect(dompet.submitTx(tx as never)).resolves.toBe("id-lokal-1");
    });

    it("melempar bila submitTransaction undefined DAN identifiers() kosong", async () => {
      const submitTransaction = vi.fn(async () => undefined);
      const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
      const tx = { identifiers: () => [], serialize: () => new Uint8Array([12]) };
      await expect(dompet.submitTx(tx as never)).rejects.toThrow(/no identifier/);
    });

    it("melempar galat yang jelas bila wallet tidak punya submitTransaction sama sekali", async () => {
      const dompet = buatAdaptorLace(walletContoh({}));
      await expect(dompet.submitTx({ identifiers: () => [] } as never)).rejects.toThrow(/submitTransaction/);
    });

    it("jatuh ke identifiers() bila submitTransaction mengembalikan string KOSONG", async () => {
      const submitTransaction = vi.fn(async () => "");
      const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
      const tx = { identifiers: () => ["id-lokal-2"], serialize: () => new Uint8Array([13]) };
      await expect(dompet.submitTx(tx as never)).resolves.toBe("id-lokal-2");
    });
  });
});

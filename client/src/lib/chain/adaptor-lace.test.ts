import { describe, expect, it, vi } from "vitest";
import type { WalletConnection } from "@/lib/midnight-wallet";
import { buatAdaptorLace } from "./adaptor-lace";

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

describe("buatAdaptorLace", () => {
  it("melempar bila wallet tidak melaporkan coinPublicKey/encryptionPublicKey", () => {
    expect(() => buatAdaptorLace(walletContoh({}, { coinPublicKey: undefined }))).toThrow(/coinPublicKey/);
  });

  it("getCoinPublicKey/getEncryptionPublicKey mengembalikan nilai WalletConnection APA ADANYA", () => {
    const dompet = buatAdaptorLace(walletContoh({}));
    expect(dompet.getCoinPublicKey()).toBe("cpk-hex");
    expect(dompet.getEncryptionPublicKey()).toBe("epk-hex");
  });

  it("balanceTx mencoba balanceSealedTransaction LEBIH DULU", async () => {
    const balanceSealedTransaction = vi.fn(async () => "tx-seimbang");
    const balanceUnsealedTransaction = vi.fn(async () => "tidak-dipakai");
    const dompet = buatAdaptorLace(walletContoh({ balanceSealedTransaction, balanceUnsealedTransaction }));
    await expect(dompet.balanceTx({} as never)).resolves.toBe("tx-seimbang");
    expect(balanceSealedTransaction).toHaveBeenCalledTimes(1);
    expect(balanceUnsealedTransaction).not.toHaveBeenCalled();
  });

  it("balanceTx jatuh ke balanceUnsealedTransaction bila balanceSealedTransaction tidak ada", async () => {
    const balanceUnsealedTransaction = vi.fn(async () => "tx-seimbang-2");
    const dompet = buatAdaptorLace(walletContoh({ balanceUnsealedTransaction }));
    await expect(dompet.balanceTx({} as never)).resolves.toBe("tx-seimbang-2");
  });

  it("balanceTx melempar galat yang MENYEBUT NAMA METODE bila keduanya tidak ada", async () => {
    const dompet = buatAdaptorLace(walletContoh({ metodeLain: () => {} }));
    await expect(dompet.balanceTx({} as never)).rejects.toThrow(/balanceSealedTransaction/);
  });

  it("submitTx memakai nilai submitTransaction bila berupa string", async () => {
    const submitTransaction = vi.fn(async () => "tx-id-dari-wallet");
    const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
    const tx = { identifiers: () => ["tidak-dipakai"] };
    await expect(dompet.submitTx(tx as never)).resolves.toBe("tx-id-dari-wallet");
  });

  it("submitTx jatuh ke tx.identifiers() bila submitTransaction mengembalikan undefined (Risiko #1)", async () => {
    const submitTransaction = vi.fn(async () => undefined);
    const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
    const tx = { identifiers: () => ["id-lokal-1"] };
    await expect(dompet.submitTx(tx as never)).resolves.toBe("id-lokal-1");
  });

  it("submitTx melempar bila submitTransaction undefined DAN identifiers() kosong", async () => {
    const submitTransaction = vi.fn(async () => undefined);
    const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
    const tx = { identifiers: () => [] };
    await expect(dompet.submitTx(tx as never)).rejects.toThrow(/tidak punya identifier/);
  });

  it("submitTx melempar galat yang jelas bila wallet tidak punya submitTransaction sama sekali", async () => {
    const dompet = buatAdaptorLace(walletContoh({}));
    await expect(dompet.submitTx({ identifiers: () => [] } as never)).rejects.toThrow(/submitTransaction/);
  });

  it("submitTx jatuh ke identifiers() bila submitTransaction mengembalikan string KOSONG", async () => {
    const submitTransaction = vi.fn(async () => "");
    const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
    const tx = { identifiers: () => ["id-lokal-2"] };
    await expect(dompet.submitTx(tx as never)).resolves.toBe("id-lokal-2");
  });
});

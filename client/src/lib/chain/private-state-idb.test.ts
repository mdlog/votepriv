import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerkleTreePath } from "@midnight-ntwrk/compact-runtime";
import type { BallotPrivateState } from "@pkgs/contract/src/ballot-witnesses.js";
import { buatPrivateStateProviderIdb } from "./private-state-idb";

function psContoh(): BallotPrivateState {
  const jalur: MerkleTreePath<Uint8Array> = {
    leaf: new Uint8Array(32).fill(7),
    path: [{ sibling: { field: 123456789012345678901234567890n }, goes_left: true }],
  };
  return {
    secretKey: new Uint8Array(32),
    credentials: { "alamat-a": new Uint8Array(32).fill(1) },
    openings: { "alamat-a": { option: 2n, salt: new Uint8Array(32).fill(2) } },
    eligibilityPaths: { "alamat-a": jalur },
    commitmentPaths: {},
  };
}

describe("buatPrivateStateProviderIdb", () => {
  let namaDb: string;
  beforeEach(() => {
    namaDb = `votepriv-test-${Math.random().toString(36).slice(2)}`;
  });

  it("get() sebelum set() apa pun mengembalikan null, bukan melempar", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    await expect(psp.get("votePrivBallot")).resolves.toBeNull();
  });

  it("set() lalu get() mengembalikan objek SAMA termasuk bigint dan Uint8Array bersarang", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    const nilai = psContoh();
    await psp.set("votePrivBallot", nilai);
    const dibaca = await psp.get("votePrivBallot");
    expect(dibaca).toEqual(nilai);
    expect(dibaca?.eligibilityPaths["alamat-a"].path[0].sibling.field).toBe(123456789012345678901234567890n);
  });

  it("dua alamat kontrak berbeda tidak saling menimpa", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    await psp.set("votePrivBallot", psContoh());
    psp.setContractAddress("alamat-b");
    await expect(psp.get("votePrivBallot")).resolves.toBeNull();
  });

  it("get/set/remove melempar sebelum setContractAddress dipanggil", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    await expect(psp.get("votePrivBallot")).rejects.toThrow(/Contract address not set/);
    await expect(psp.set("votePrivBallot", psContoh())).rejects.toThrow(/Contract address not set/);
    await expect(psp.remove("votePrivBallot")).rejects.toThrow(/Contract address not set/);
  });

  it("setSigningKey/getSigningKey bekerja TANPA setContractAddress (dikunci per-parameter address)", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    await psp.setSigningKey("alamat-a", "kunci-tanda-tangan-hex");
    await expect(psp.getSigningKey("alamat-a")).resolves.toBe("kunci-tanda-tangan-hex");
    await expect(psp.getSigningKey("alamat-lain")).resolves.toBeNull();
  });

  it("removeSigningKey dan clearSigningKeys menghapus", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    await psp.setSigningKey("alamat-a", "k1");
    await psp.removeSigningKey("alamat-a");
    await expect(psp.getSigningKey("alamat-a")).resolves.toBeNull();
    await psp.setSigningKey("alamat-b", "k2");
    await psp.clearSigningKeys();
    await expect(psp.getSigningKey("alamat-b")).resolves.toBeNull();
  });

  it("clear() mengosongkan store private state tanpa menyentuh signing keys", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    await psp.set("votePrivBallot", psContoh());
    await psp.setSigningKey("alamat-a", "k1");
    await psp.clear();
    await expect(psp.get("votePrivBallot")).resolves.toBeNull();
    await expect(psp.getSigningKey("alamat-a")).resolves.toBe("k1");
  });

  it("membuka IndexedDB TEPAT SEKALI untuk banyak operasi pada provider yang sama", async () => {
    const spy = vi.spyOn(indexedDB, "open");
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    await psp.set("votePrivBallot", psContoh());
    await psp.get("votePrivBallot");
    await psp.setSigningKey("alamat-a", "k1");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("export/import PrivateStates dan export/import SigningKeys menolak eksplisit", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    await expect(psp.exportPrivateStates()).rejects.toThrow(/belum didukung/);
    await expect(
      psp.importPrivateStates({ format: "midnight-private-state-export", encryptedPayload: "", salt: "" }),
    ).rejects.toThrow(/belum didukung/);
    await expect(psp.exportSigningKeys()).rejects.toThrow(/belum didukung/);
    await expect(
      psp.importSigningKeys({ format: "midnight-signing-key-export", encryptedPayload: "", salt: "" }),
    ).rejects.toThrow(/belum didukung/);
  });
});

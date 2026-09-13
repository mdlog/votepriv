import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buatKredensialStoreIdb, kredensialKeHex } from "./kredensial-idb";

describe("buatKredensialStoreIdb", () => {
  let namaDb: string;
  beforeEach(() => {
    namaDb = `votepriv-cred-test-${Math.random().toString(36).slice(2)}`;
  });

  it("ambilKredensial sebelum simpanKredensial apa pun mengembalikan null, bukan melempar", async () => {
    const store = buatKredensialStoreIdb(namaDb);
    await expect(store.ambilKredensial("alamat-a")).resolves.toBeNull();
  });

  it("simpanKredensial lalu ambilKredensial mengembalikan BYTE YANG SAMA", async () => {
    const store = buatKredensialStoreIdb(namaDb);
    const kredensial = new Uint8Array(32).fill(9);
    await store.simpanKredensial("alamat-a", kredensial);
    await expect(store.ambilKredensial("alamat-a")).resolves.toEqual(kredensial);
  });

  it("dua alamat ballot berbeda tidak saling menimpa", async () => {
    const store = buatKredensialStoreIdb(namaDb);
    await store.simpanKredensial("alamat-a", new Uint8Array(32).fill(1));
    await store.simpanKredensial("alamat-b", new Uint8Array(32).fill(2));
    await expect(store.ambilKredensial("alamat-a")).resolves.toEqual(new Uint8Array(32).fill(1));
    await expect(store.ambilKredensial("alamat-b")).resolves.toEqual(new Uint8Array(32).fill(2));
  });

  it("menyimpan ulang pada alamat yang sama MENIMPA nilai lama (bukan menumpuk)", async () => {
    const store = buatKredensialStoreIdb(namaDb);
    await store.simpanKredensial("alamat-a", new Uint8Array(32).fill(1));
    await store.simpanKredensial("alamat-a", new Uint8Array(32).fill(7));
    await expect(store.ambilKredensial("alamat-a")).resolves.toEqual(new Uint8Array(32).fill(7));
  });

  it("membuka IndexedDB TEPAT SEKALI untuk banyak operasi pada store yang sama", async () => {
    const spy = vi.spyOn(indexedDB, "open");
    const store = buatKredensialStoreIdb(namaDb);
    await store.simpanKredensial("alamat-a", new Uint8Array(32).fill(3));
    await store.ambilKredensial("alamat-a");
    await store.simpanKredensial("alamat-b", new Uint8Array(32).fill(4));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("dua store dengan nama DB berbeda tidak saling melihat data", async () => {
    const storeA = buatKredensialStoreIdb(namaDb);
    const storeLain = buatKredensialStoreIdb(`${namaDb}-lain`);
    await storeA.simpanKredensial("alamat-a", new Uint8Array(32).fill(5));
    await expect(storeLain.ambilKredensial("alamat-a")).resolves.toBeNull();
  });
});

describe("kredensialKeHex", () => {
  it("menghasilkan 64 karakter heksadesimal huruf kecil untuk 32 byte", () => {
    const hex = kredensialKeHex(new Uint8Array(32).fill(0xab));
    expect(hex).toBe("ab".repeat(32));
    expect(hex).toHaveLength(64);
  });

  it("mempertahankan urutan byte (bukan dibalik)", () => {
    const b = new Uint8Array([0x00, 0x0f, 0xf0, 0xff]);
    expect(kredensialKeHex(b)).toBe("000ff0ff");
  });
});

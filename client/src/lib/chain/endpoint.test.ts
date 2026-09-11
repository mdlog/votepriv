import { describe, expect, it } from "vitest";
import { MIDNIGHT_NETWORK_ENDPOINTS } from "@pkgs/shared/src/network-config";
import {
  ALAMAT_REGISTRY_BAWAAN,
  JARINGAN_BAWAAN,
  alamatKontrakValid,
  jaringanAktif,
} from "./endpoint";

describe("jaringanAktif", () => {
  it("memakai jaringan dan registry bawaan ketika env kosong", () => {
    const j = jaringanAktif({});
    expect(j.networkId).toBe(JARINGAN_BAWAAN);
    expect(j.alamatRegistry).toBe(ALAMAT_REGISTRY_BAWAAN);
    // Nilai endpoint TIDAK diketik ulang di sini. Ia diturunkan dari satu-satunya
    // sumber kebenaran, sehingga uji ini tetap benar bila URL indexer berubah,
    // dan tetap gagal bila berkas ini diam-diam menyalin URL-nya sendiri.
    expect(j.indexer).toBe(MIDNIGHT_NETWORK_ENDPOINTS[JARINGAN_BAWAAN].indexer);
    expect(j.indexerWS).toBe(MIDNIGHT_NETWORK_ENDPOINTS[JARINGAN_BAWAAN].indexerWS);
  });

  it("menghormati jaringan yang diminta env", () => {
    const j = jaringanAktif({ VITE_MIDNIGHT_NETWORK: "preprod" });
    expect(j.networkId).toBe("preprod");
    expect(j.indexer).toBe(MIDNIGHT_NETWORK_ENDPOINTS.preprod.indexer);
  });

  it("MELEMPAR pada nama jaringan yang tidak dikenal, bukan diam-diam jatuh ke bawaan", () => {
    expect(() => jaringanAktif({ VITE_MIDNIGHT_NETWORK: "previewe" })).toThrow(/Unknown VITE_MIDNIGHT_NETWORK/);
  });

  it("MELEMPAR pada alamat registry yang bukan hex", () => {
    expect(() => jaringanAktif({ VITE_VOTEPRIV_REGISTRY: "bukan-hex" })).toThrow(/not a valid contract address/);
  });
});

describe("alamatKontrakValid", () => {
  it("menerima alamat registry bawaan", () => {
    expect(alamatKontrakValid(ALAMAT_REGISTRY_BAWAAN)).toBe(true);
  });

  it("menolak bentuk yang terbukti membuat indexer menghapus kunci aliasnya", () => {
    // registry.register() permissionless: isi registry.ballots tidak dijamin
    // berupa alamat sama sekali.
    expect(alamatKontrakValid("bukan-hex")).toBe(false);
    expect(alamatKontrakValid("abc")).toBe(false); // nibble ganjil
    expect(alamatKontrakValid("")).toBe(false);
    expect(alamatKontrakValid("ab".repeat(300))).toBe(false); // melebihi rem panjang
  });
});

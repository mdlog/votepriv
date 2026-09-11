import { describe, expect, it } from "vitest";
import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { ledger as ledgerRegistry } from "@pkgs/contract/src/managed/registry/contract/index.js";

/**
 * Gerbang instance tunggal onchain-runtime-v3.
 *
 * Dua instance memberi pesan MENYESATKAN: "expected instance of ChargedState",
 * padahal datanya benar. Risikonya hidup di workspace ini karena compact-runtime
 * 0.15.0 (pkgs/cli lewat compact-js@2.5.0) DAN 0.16.0 (pkgs/contract) dua-duanya
 * ada di pohon pnpm.
 *
 * Uji ini memakai state registry yang KOSONG — dibangun di memori, bukan diambil
 * dari jaringan — supaya ia tidak pernah gagal karena alasan lain: tidak ada
 * fixture, tidak ada fetch, tidak ada ketergantungan pada isi rantai hari ini.
 * Yang diuji semata-mata: apakah ChargedType yang satu dikenali modul yang lain.
 */
describe("instance onchain-runtime-v3", () => {
  it("menerima ChargedState dari compact-runtime akar di ledger() modul kontrak", () => {
    const kosong = new ContractState();
    const bolak = ContractState.deserialize(kosong.serialize());
    expect(() => ledgerRegistry(bolak.data)).not.toThrow(/instance of ChargedState/);
  });

  it("membulatkan versi runtime yang sama dengan yang diharapkan modul tergenerasi", async () => {
    // Modul tergenerasi memanggil checkRuntimeVersion() saat diimpor dan MELEMPAR
    // pada mayor/minor yang tidak cocok. Import yang berhasil di baris atas sudah
    // membuktikannya; assert ini menuliskan fakta itu supaya tidak hilang ketika
    // seseorang menaikkan versi tanpa membaca komentar.
    const modul = await import("@pkgs/contract/src/managed/registry/contract/index.js");
    expect(typeof modul.ledger).toBe("function");
  });
});

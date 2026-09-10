import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bacaArtefak, pastikanAlamatKontrak, tulisArtefak } from "./artefak.ts";

const dirSementara = () => fs.mkdtempSync(path.join(os.tmpdir(), "votepriv-artefak-"));

describe("pastikanAlamatKontrak", () => {
  it("menerima 64 hex huruf kecil", () => {
    const a = "ab".repeat(32);
    expect(pastikanAlamatKontrak(a)).toBe(a);
  });

  it("menolak awalan 0x, panjang salah, dan huruf besar", () => {
    expect(() => pastikanAlamatKontrak(`0x${"ab".repeat(32)}`)).toThrow(/64 karakter/);
    expect(() => pastikanAlamatKontrak("ab".repeat(31))).toThrow(/64 karakter/);
    expect(() => pastikanAlamatKontrak("AB".repeat(32))).toThrow(/64 karakter/);
  });
});

describe("tulisArtefak", () => {
  it("menggabungkan, tidak menimpa entri sebelumnya", () => {
    const dir = dirSementara();
    tulisArtefak("preview", { registry: "aa".repeat(32) }, dir);
    tulisArtefak("preview", { ballot: "bb".repeat(32), voteDeadline: "1757000000" }, dir);

    const hasil = bacaArtefak("preview", dir);
    expect(hasil?.registry).toBe("aa".repeat(32));
    expect(hasil?.ballot).toBe("bb".repeat(32));
    expect(hasil?.voteDeadline).toBe("1757000000");
    expect(hasil?.networkId).toBe("preview");
  });

  it("mengembalikan null bila belum ada artefak", () => {
    expect(bacaArtefak("preview", dirSementara())).toBeNull();
  });
});

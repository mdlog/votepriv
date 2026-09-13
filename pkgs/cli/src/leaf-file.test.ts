import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { Logger } from "pino";
import { describe, expect, it } from "vitest";
import {
  bacaBerkasLeaf,
  daftarkanSemuaBatch,
  jalurBerkasLeafDariArgv,
  pecahLeafMenjadiBatch,
  periksaLeafSudahTerdaftar,
  uraiBerkasLeaf,
  validasiKuotaPendaftaran,
  type FungsiDaftarkanVoter,
} from "./leaf-file.ts";
import type { BallotC } from "./kontrak.ts";

// Logger palsu: uji ini tidak boleh menulis apa pun ke berkas log (pola sama dengan deploy.test.ts).
const logPalsu = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;

const hexLeaf = (isi: number) => Buffer.from(new Uint8Array(32).fill(isi)).toString("hex");

describe("uraiBerkasLeaf", () => {
  it("menerima leaf valid dengan dan tanpa awalan 0x, mengabaikan baris kosong dan komentar", () => {
    const isi = [
      "# komentar di awal",
      "",
      hexLeaf(1),
      `0x${hexLeaf(2)}`,
      "   ", // baris berisi spasi saja
      "# komentar di tengah",
      hexLeaf(3),
    ].join("\n");

    const hasil = uraiBerkasLeaf(isi);

    expect(hasil.map((e) => e.hex)).toEqual([hexLeaf(1), hexLeaf(2), hexLeaf(3)]);
    // Nomor baris ASLI (1-based), termasuk baris kosong/komentar yang dilewati.
    expect(hasil.map((e) => e.baris)).toEqual([3, 4, 7]);
    expect(hasil[0].bytes).toHaveLength(32);
  });

  it("menormalisasi huruf besar dan awalan 0x ke bentuk kanonik huruf kecil tanpa awalan", () => {
    const hasil = uraiBerkasLeaf(`0x${hexLeaf(9).toUpperCase()}`);
    expect(hasil[0].hex).toBe(hexLeaf(9));
  });

  // Kasus GAGAL, memaku pesan galat — panjang salah.
  it("menolak leaf yang bukan 64 karakter hex, menyebut nomor barisnya", () => {
    const isi = [hexLeaf(1), "abcd", hexLeaf(2)].join("\n");
    expect(() => uraiBerkasLeaf(isi)).toThrow(/Baris 2:.*bukan leaf hex yang valid/);
  });

  // Kasus GAGAL — karakter non-hex.
  it("menolak leaf yang mengandung karakter non-hex, menyebut nomor barisnya", () => {
    const isi = [hexLeaf(1), "g".repeat(64)].join("\n");
    expect(() => uraiBerkasLeaf(isi)).toThrow(/Baris 2:.*bukan leaf hex yang valid/);
  });

  // Kasus GAGAL — duplikat bentuk IDENTIK.
  it("menolak leaf duplikat persis, menyebut baris pertama DAN baris duplikatnya", () => {
    const isi = [hexLeaf(1), hexLeaf(2), hexLeaf(1)].join("\n");
    expect(() => uraiBerkasLeaf(isi)).toThrow(/Baris 3: leaf duplikat dengan baris 1/);
  });

  // Kasus GAGAL — duplikat pada BENTUK BERBEDA (0x + huruf besar) dari entri pertama.
  it("mendeteksi duplikat walau bentuknya berbeda (0x + huruf besar vs tanpa awalan huruf kecil)", () => {
    const isi = [hexLeaf(7), `0x${hexLeaf(7).toUpperCase()}`].join("\n");
    expect(() => uraiBerkasLeaf(isi)).toThrow(/Baris 2: leaf duplikat dengan baris 1/);
  });

  // Kasus GAGAL — berkas kosong secara efektif.
  it("menolak berkas yang kosong setelah baris kosong/komentar disaring", () => {
    expect(() => uraiBerkasLeaf("\n# hanya komentar\n\n")).toThrow(/kosong/);
  });

  // Kasus LOLOS — satu leaf saja tetap sah.
  it("menerima berkas dengan tepat satu leaf", () => {
    expect(uraiBerkasLeaf(hexLeaf(42))).toHaveLength(1);
  });
});

describe("bacaBerkasLeaf", () => {
  const dirSementara = () => fs.mkdtempSync(path.join(os.tmpdir(), "votepriv-leaf-"));

  it("membaca dan mengurai berkas sungguhan", () => {
    const dir = dirSementara();
    const jalur = path.join(dir, "leaves.txt");
    fs.writeFileSync(jalur, `${hexLeaf(1)}\n${hexLeaf(2)}\n`);

    expect(bacaBerkasLeaf(jalur).map((e) => e.hex)).toEqual([hexLeaf(1), hexLeaf(2)]);
  });

  it("membungkus galat baca dengan jalurnya ketika berkas tidak ada", () => {
    const jalur = path.join(dirSementara(), "tidak-ada.txt");
    expect(() => bacaBerkasLeaf(jalur)).toThrow(new RegExp(jalur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

describe("jalurBerkasLeafDariArgv", () => {
  it("mengambil argumen posisional pertama yang bukan flag", () => {
    expect(jalurBerkasLeafDariArgv(["--seed-derivation=pbkdf2-32", "leaves.txt"])).toBe("leaves.txt");
  });

  it("mengambil argumen tunggal tanpa flag apa pun", () => {
    expect(jalurBerkasLeafDariArgv(["leaves.txt"])).toBe("leaves.txt");
  });

  it("menolak dengan pesan jelas ketika tidak ada argumen posisional", () => {
    expect(() => jalurBerkasLeafDariArgv([])).toThrow(/register-leaves <jalur-berkas-leaf>/);
    expect(() => jalurBerkasLeafDariArgv(["--seed-derivation=pbkdf2-32"])).toThrow(/register-leaves <jalur-berkas-leaf>/);
  });
});

describe("validasiKuotaPendaftaran", () => {
  it("lolos ketika voteCount 0 dan jumlah baru pas sampai eligibleCount", () => {
    expect(() =>
      validasiKuotaPendaftaran({ voteCount: 0n, registeredCount: 5n, eligibleCount: 8n }, 3),
    ).not.toThrow();
  });

  // MUTASI WAJIB 1: guard ini menjaga baris `if (ledger.voteCount !== 0n) throw ...`.
  it("menolak ketika voteCount bukan 0 — pendaftaran sudah ditutup permanen", () => {
    expect(() =>
      validasiKuotaPendaftaran({ voteCount: 1n, registeredCount: 0n, eligibleCount: 8n }, 1),
    ).toThrow(/ditutup permanen.*voteCount/s);
  });

  // MUTASI WAJIB 2: guard ini menjaga baris `if (BigInt(jumlahBaru) > tersisa) throw ...`.
  it("menolak ketika registeredCount + jumlah melebihi eligibleCount", () => {
    expect(() =>
      validasiKuotaPendaftaran({ voteCount: 0n, registeredCount: 6n, eligibleCount: 8n }, 3),
    ).toThrow(/melebihi kuota tersisa \(2\)/);
  });

  it("batas pas (registeredCount + jumlah === eligibleCount) tetap LOLOS, bukan ditolak", () => {
    expect(() =>
      validasiKuotaPendaftaran({ voteCount: 0n, registeredCount: 5n, eligibleCount: 8n }, 3),
    ).not.toThrow();
  });
});

describe("periksaLeafSudahTerdaftar", () => {
  const daftar = uraiBerkasLeaf([hexLeaf(1), hexLeaf(2), hexLeaf(3)].join("\n"));

  it("bisaDiperiksa true dan sudahTerdaftar kosong ketika tidak ada leaf yang ditemukan", () => {
    const hasil = periksaLeafSudahTerdaftar(daftar, { findPathForLeaf: () => undefined });
    expect(hasil).toEqual({ bisaDiperiksa: true, sudahTerdaftar: [] });
  });

  it("melaporkan leaf yang SUDAH terdaftar (findPathForLeaf mengembalikan sesuatu selain undefined)", () => {
    const hasil = periksaLeafSudahTerdaftar(daftar, {
      findPathForLeaf: (leaf) => (Buffer.from(leaf).toString("hex") === hexLeaf(2) ? { leaf } : undefined),
    });
    expect(hasil.bisaDiperiksa).toBe(true);
    expect(hasil.sudahTerdaftar.map((e) => e.hex)).toEqual([hexLeaf(2)]);
  });

  it("mundur ke bisaDiperiksa:false dengan alasan ketika findPathForLeaf sendiri melempar", () => {
    const hasil = periksaLeafSudahTerdaftar(daftar, {
      findPathForLeaf: () => {
        throw new Error("bentuk state tidak terduga");
      },
    });
    expect(hasil).toEqual({ bisaDiperiksa: false, sudahTerdaftar: [], alasanTidakBisa: "bentuk state tidak terduga" });
  });
});

describe("pecahLeafMenjadiBatch", () => {
  const daun = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("memecah 17 elemen jadi batch 8, 8, 1", () => {
    const hasil = pecahLeafMenjadiBatch(daun(17));
    expect(hasil.map((b) => b.length)).toEqual([8, 8, 1]);
    expect(hasil.flat()).toEqual(daun(17)); // urutan & isi utuh, tidak ada yang hilang/tertukar
  });

  it("kelipatan tepat 8 tidak menyisakan batch kosong di akhir", () => {
    expect(pecahLeafMenjadiBatch(daun(16)).map((b) => b.length)).toEqual([8, 8]);
  });

  it("kurang dari 8 menghasilkan satu batch saja", () => {
    expect(pecahLeafMenjadiBatch(daun(3)).map((b) => b.length)).toEqual([3]);
  });

  it("array kosong menghasilkan nol batch", () => {
    expect(pecahLeafMenjadiBatch(daun(0))).toEqual([]);
  });

  it("menolak ukuran batch di bawah 1", () => {
    expect(() => pecahLeafMenjadiBatch(daun(3), 0)).toThrow(/>= 1/);
  });
});

describe("daftarkanSemuaBatch", () => {
  const ballotPalsu = {} as unknown as FoundContract<BallotC>;
  const daunBernomor = (n: number) => Array.from({ length: n }, (_, i) => new Uint8Array(32).fill(i));

  it("memanggil daftarkanVoterFn SEKALI PER BATCH, berurutan, dengan isi batch 8/8/1 untuk 17 leaf", async () => {
    const panggilan: number[][] = [];
    const fnPalsu: FungsiDaftarkanVoter = async (_ballot, daun) => {
      panggilan.push(daun.map((d) => d[0])); // byte pertama tiap leaf = nomor pengenalnya
    };

    await daftarkanSemuaBatch(ballotPalsu, daunBernomor(17), logPalsu, {}, fnPalsu);

    expect(panggilan).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14, 15],
      [16],
    ]);
  });

  it("meneruskan publicDataProvider/alamatBallot/maksPercobaan/jedaMs ke setiap pemanggilan", async () => {
    const opsiDiterima: unknown[] = [];
    const fnPalsu: FungsiDaftarkanVoter = async (_ballot, _daun, _log, opsi) => {
      opsiDiterima.push(opsi);
    };

    await daftarkanSemuaBatch(ballotPalsu, daunBernomor(2), logPalsu, { alamatBallot: "a".repeat(64), maksPercobaan: 5, jedaMs: 10 }, fnPalsu);

    expect(opsiDiterima).toEqual([{ publicDataProvider: undefined, alamatBallot: "a".repeat(64), maksPercobaan: 5, jedaMs: 10 }]);
  });

  it("berhenti pada batch pertama yang gagal — batch berikutnya TIDAK dipanggil", async () => {
    let panggilan = 0;
    const fnPalsu: FungsiDaftarkanVoter = async () => {
      panggilan += 1;
      throw new Error("batch ini sengaja gagal");
    };

    await expect(daftarkanSemuaBatch(ballotPalsu, daunBernomor(17), logPalsu, {}, fnPalsu)).rejects.toThrow(
      /batch ini sengaja gagal/,
    );
    expect(panggilan).toBe(1);
  });
});

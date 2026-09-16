import { describe, expect, it, vi } from "vitest";
import { hitungJadwal } from "./jadwal.ts";

// `hitungJadwal` menerima `env` palsu (bukan `process.env` sungguhan) — seluruh
// uji di sini AMAN dari polusi lintas-berkas dan dari env ambient mesin
// pengembang/CI (pola sama dengan modeTanpaPendaftaranAktif/eligibleCountDariEnv
// di pendaftaran-awal.test.ts). Tidak satu pun uji di sini menyentuh
// `process.env` sungguhan.

describe("hitungJadwal — bawaan (tanpa env)", () => {
  it("120/180 ketika VOTEPRIV_MENIT_VOTE/TALLY tidak disetel sama sekali", () => {
    expect(hitungJadwal({})).toEqual({ menitVote: 120, menitTally: 180 });
  });

  it("120/180 ketika keduanya string kosong/whitespace (diperlakukan sama seperti tidak disetel)", () => {
    expect(hitungJadwal({ VOTEPRIV_MENIT_VOTE: "  ", VOTEPRIV_MENIT_TALLY: "" })).toEqual({
      menitVote: 120,
      menitTally: 180,
    });
  });
});

describe("hitungJadwal — override valid", () => {
  it("memakai nilai env ketika keduanya bilangan bulat positif dan TALLY > VOTE (contoh alur juri: 7 hari + 2 hari)", () => {
    expect(hitungJadwal({ VOTEPRIV_MENIT_VOTE: "10080", VOTEPRIV_MENIT_TALLY: "12960" })).toEqual({
      menitVote: 10080,
      menitTally: 12960,
    });
  });

  it("hanya VOTEPRIV_MENIT_TALLY disetel: VOTE tetap bawaan, TALLY dari env", () => {
    expect(hitungJadwal({ VOTEPRIV_MENIT_TALLY: "300" })).toEqual({ menitVote: 120, menitTally: 300 });
  });

  it("hanya VOTEPRIV_MENIT_VOTE disetel: TALLY tetap bawaan, VOTE dari env (harus < 180 supaya tidak melanggar TALLY > VOTE)", () => {
    expect(hitungJadwal({ VOTEPRIV_MENIT_VOTE: "90" })).toEqual({ menitVote: 90, menitTally: 180 });
  });
});

describe("hitungJadwal — penolakan TALLY > VOTE (MUTASI WAJIB b)", () => {
  it("menolak TALLY sama dengan VOTE", () => {
    expect(() => hitungJadwal({ VOTEPRIV_MENIT_VOTE: "100", VOTEPRIV_MENIT_TALLY: "100" })).toThrow(
      /VOTEPRIV_TALLY_MINUTES.*harus lebih besar dari VOTEPRIV_VOTE_MINUTES/,
    );
  });

  it("menolak TALLY lebih kecil dari VOTE", () => {
    expect(() => hitungJadwal({ VOTEPRIV_MENIT_VOTE: "200", VOTEPRIV_MENIT_TALLY: "100" })).toThrow(
      /harus lebih besar/,
    );
  });

  it("menolak ketika hanya VOTE disetel tapi melebihi bawaan TALLY (180)", () => {
    // VOTE=10080 tanpa TALLY eksplisit berarti TALLY jatuh ke bawaan 180 —
    // 180 <= 10080 tetap harus ditolak, bukan diam-diam dipakai.
    expect(() => hitungJadwal({ VOTEPRIV_MENIT_VOTE: "10080" })).toThrow(/harus lebih besar/);
  });
});

describe("hitungJadwal — penolakan nilai non-integer/non-positif", () => {
  it.each(["10080.5", "abc", "0", "-5"])("menolak VOTEPRIV_MENIT_VOTE=\"%s\"", (nilai) => {
    expect(() => hitungJadwal({ VOTEPRIV_MENIT_VOTE: nilai })).toThrow(
      /VOTEPRIV_MENIT_VOTE harus bilangan bulat positif/,
    );
  });

  it.each(["12960.5", "xyz", "0", "-1"])("menolak VOTEPRIV_MENIT_TALLY=\"%s\"", (nilai) => {
    expect(() => hitungJadwal({ VOTEPRIV_MENIT_VOTE: "50", VOTEPRIV_MENIT_TALLY: nilai })).toThrow(
      /VOTEPRIV_MENIT_TALLY harus bilangan bulat positif/,
    );
  });

  it("pesan galat mengutip nilai mentah yang diberikan (bukan rahasia — angka menit, aman dikutip)", () => {
    expect(() => hitungJadwal({ VOTEPRIV_MENIT_VOTE: "sepuluh" })).toThrow(/"sepuluh"/);
  });
});

describe("hitungJadwal — log satu baris HANYA saat override berbeda dari bawaan", () => {
  it("mencetak satu baris yang menyebut nilai efektif ketika override dipakai", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    hitungJadwal({ VOTEPRIV_MENIT_VOTE: "300", VOTEPRIV_MENIT_TALLY: "400" });

    // Assert SEBELUM mockRestore(): mockRestore() ikut mengosongkan riwayat
    // panggilan (mock.calls) — mengecek sesudahnya selalu melihat 0 panggilan
    // tidak peduli perilaku sungguhannya (vakum).
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toMatch(/300/);
    expect(String(spy.mock.calls[0][0])).toMatch(/400/);
    spy.mockRestore();
  });

  it("TIDAK mencetak apa pun ketika tidak ada override sama sekali (nilai == bawaan)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    hitungJadwal({});

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("nama env publik VOTEPRIV_VOTE_MINUTES/VOTEPRIV_TALLY_MINUTES", () => {
  it("nama Inggris dibaca, dan didahulukan atas alias lama bila keduanya ada", () => {
    expect(hitungJadwal({ VOTEPRIV_VOTE_MINUTES: "30", VOTEPRIV_TALLY_MINUTES: "45" })).toEqual({ menitVote: 30, menitTally: 45 });
    expect(hitungJadwal({ VOTEPRIV_VOTE_MINUTES: "30", VOTEPRIV_MENIT_VOTE: "99", VOTEPRIV_TALLY_MINUTES: "45", VOTEPRIV_MENIT_TALLY: "999" })).toEqual({ menitVote: 30, menitTally: 45 });
  });

  it("alias lama tetap berfungsi tanpa nama Inggris", () => {
    expect(hitungJadwal({ VOTEPRIV_MENIT_VOTE: "30", VOTEPRIV_MENIT_TALLY: "45" })).toEqual({ menitVote: 30, menitTally: 45 });
  });
});

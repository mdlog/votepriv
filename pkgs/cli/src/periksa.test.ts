import { Ballot } from "contract";
import { describe, expect, it } from "vitest";
import {
  periksaFaseTerfinalisasi,
  periksaHasilTallyAkhir,
  periksaTallyKosongSelamaVoting,
  type LedgerFaseTerfinalisasi,
  type LedgerHasilTallyAkhir,
  type LedgerVotingKosong,
} from "./periksa.ts";

/**
 * Ledger PALSU, bukan simulator kontrak: setiap fungsi di bawah membangun
 * objek "map tally" sendiri dari daftar entri yang diberikan, lepas dari
 * `isEmpty`/`size` yang juga dioper terpisah — supaya tiap uji bisa membuat
 * PERSIS SATU pemeriksaan gagal tanpa harus lolos lewat konsistensi internal
 * yang sesungguhnya. Itulah gunanya ledger fabrikasi: menguji logika assert,
 * bukan kontrak.
 */
const buatTalliesPalsu = (entri: readonly (readonly [bigint, bigint])[]) => ({
  isEmpty: () => entri.length === 0,
  size: () => BigInt(entri.length),
  member: (k: bigint) => entri.some(([opsi]) => opsi === k),
  [Symbol.iterator]: () => entri[Symbol.iterator](),
});

describe("periksaTallyKosongSelamaVoting", () => {
  const sehat = (): LedgerVotingKosong => ({
    voteCount: 3n,
    talliedCount: 0n,
    tallies: buatTalliesPalsu([]),
    tallyNullifiers: { isEmpty: () => true },
  });

  it("lolos pada ledger sehat (voting berjalan, tally benar-benar kosong)", () => {
    expect(() => periksaTallyKosongSelamaVoting(sehat(), 3, 3)).not.toThrow();
    expect(periksaTallyKosongSelamaVoting(sehat(), 3, 3)).toEqual([0n, 0n, 0n]);
  });

  it("menolak voteCount yang salah (assert 1)", () => {
    const lb: LedgerVotingKosong = { ...sehat(), voteCount: 2n };
    expect(() => periksaTallyKosongSelamaVoting(lb, 3, 3)).toThrow("voteCount harus 3, terbaca 2");
  });

  it("menolak tallies.isEmpty() === false (assert 2)", () => {
    const lb: LedgerVotingKosong = { ...sehat(), tallies: { ...buatTalliesPalsu([]), isEmpty: () => false } };
    expect(() => periksaTallyKosongSelamaVoting(lb, 3, 3)).toThrow(
      "PRIVASI BOCOR: tallies TIDAK kosong selagi pemungutan suara berlangsung",
    );
  });

  it("menolak tallies.size() !== 0n (assert 3)", () => {
    const lb: LedgerVotingKosong = { ...sehat(), tallies: { ...buatTalliesPalsu([]), size: () => 1n } };
    expect(() => periksaTallyKosongSelamaVoting(lb, 3, 3)).toThrow("PRIVASI BOCOR: tallies.size() = 1, harus 0");
  });

  it("menolak entri tally bukan nol walau isEmpty/size mengaku kosong (assert 4)", () => {
    const lb: LedgerVotingKosong = {
      ...sehat(),
      tallies: { ...buatTalliesPalsu([[0n, 1n]]), isEmpty: () => true, size: () => 0n },
    };
    expect(() => periksaTallyKosongSelamaVoting(lb, 3, 3)).toThrow(
      "PRIVASI BOCOR: ada tally bukan nol selama voting: 1,0,0",
    );
  });

  it("menolak talliedCount !== 0n (assert 5)", () => {
    const lb: LedgerVotingKosong = { ...sehat(), talliedCount: 1n };
    expect(() => periksaTallyKosongSelamaVoting(lb, 3, 3)).toThrow("talliedCount harus 0 selama voting, terbaca 1");
  });

  it("menolak tallyNullifiers tidak kosong — skenario castVote menyisipkan tally_nullifier (assert 6)", () => {
    const lb: LedgerVotingKosong = { ...sehat(), tallyNullifiers: { isEmpty: () => false } };
    expect(() => periksaTallyKosongSelamaVoting(lb, 3, 3)).toThrow(
      "PRIVASI BOCOR: tallyNullifiers TIDAK kosong selagi pemungutan suara berlangsung — castVote seharusnya tidak pernah menyisipkan tally_nullifier(salt), hanya tallyVote yang boleh",
    );
  });
});

describe("periksaHasilTallyAkhir", () => {
  // Hasil skenario e2e.ts: PILIHAN = [0n, 2n, 0n] -> opsi0=2, opsi1=0, opsi2=1.
  const sehat = (): LedgerHasilTallyAkhir => ({
    phase: Ballot.BallotPhase.tallying,
    talliedCount: 3n,
    tallies: buatTalliesPalsu([
      [0n, 2n],
      [2n, 1n],
    ]),
  });

  it("lolos pada ledger sehat (2-0-1, talliedCount 3, phase tallying)", () => {
    expect(periksaHasilTallyAkhir(sehat(), 3, [2n, 0n, 1n], 3n)).toEqual([2n, 0n, 1n]);
  });

  it("menolak opsi 0 yang salah (assert opsi0)", () => {
    const lb: LedgerHasilTallyAkhir = {
      ...sehat(),
      tallies: buatTalliesPalsu([
        [0n, 1n],
        [2n, 1n],
      ]),
    };
    expect(() => periksaHasilTallyAkhir(lb, 3, [2n, 0n, 1n], 3n)).toThrow("Opsi 0 harus 2 suara, terbaca 1");
  });

  it("menolak opsi 1 yang salah (assert opsi1)", () => {
    const lb: LedgerHasilTallyAkhir = {
      ...sehat(),
      tallies: buatTalliesPalsu([
        [0n, 2n],
        [1n, 5n],
        [2n, 1n],
      ]),
    };
    expect(() => periksaHasilTallyAkhir(lb, 3, [2n, 0n, 1n], 3n)).toThrow("Opsi 1 harus 0 suara, terbaca 5");
  });

  it("menolak opsi 2 yang salah (assert opsi2)", () => {
    const lb: LedgerHasilTallyAkhir = { ...sehat(), tallies: buatTalliesPalsu([[0n, 2n], [2n, 4n]]) };
    expect(() => periksaHasilTallyAkhir(lb, 3, [2n, 0n, 1n], 3n)).toThrow("Opsi 2 harus 1 suara, terbaca 4");
  });

  it("menolak entri tally untuk opsi yang seharusnya tanpa suara sama sekali (assert member)", () => {
    // Jumlah tetap benar (2-0-1), tapi member() mengaku opsi1 PUNYA entri —
    // persis skenario yang membuat pemeriksaan ini berbeda dari sekadar
    // memeriksa angkanya nol.
    const lb: LedgerHasilTallyAkhir = { ...sehat(), tallies: { ...sehat().tallies, member: () => true } };
    expect(() => periksaHasilTallyAkhir(lb, 3, [2n, 0n, 1n], 3n)).toThrow(
      "Opsi 1 seharusnya tidak punya entri tally sama sekali",
    );
  });

  it("menolak talliedCount yang salah (assert talliedCount)", () => {
    const lb: LedgerHasilTallyAkhir = { ...sehat(), talliedCount: 4n };
    expect(() => periksaHasilTallyAkhir(lb, 3, [2n, 0n, 1n], 3n)).toThrow("talliedCount harus 3, terbaca 4");
  });

  it("menolak phase yang bukan tallying (assert phase)", () => {
    const lb: LedgerHasilTallyAkhir = { ...sehat(), phase: Ballot.BallotPhase.voting };
    expect(() => periksaHasilTallyAkhir(lb, 3, [2n, 0n, 1n], 3n)).toThrow("phase harus tallying (1), terbaca 0");
  });
});

describe("periksaFaseTerfinalisasi", () => {
  it("lolos bila phase sudah finalized", () => {
    const lb: LedgerFaseTerfinalisasi = { phase: Ballot.BallotPhase.finalized };
    expect(() => periksaFaseTerfinalisasi(lb)).not.toThrow();
  });

  it("menolak phase yang belum finalized", () => {
    const lb: LedgerFaseTerfinalisasi = { phase: Ballot.BallotPhase.tallying };
    expect(() => periksaFaseTerfinalisasi(lb)).toThrow("phase harus finalized (2), terbaca 1");
  });
});

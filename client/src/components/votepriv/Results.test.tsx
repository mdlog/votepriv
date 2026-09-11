import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Results } from "./Results";
import { ballotUji } from "@/test/fixture-ballot";
import type { Receipt } from "./types";
import type { JaringanAktif } from "@/lib/chain";

afterEach(() => cleanup());

// Disalin, BUKAN diimpor dari KeadaanRantai.test.tsx — lihat instruksi Step 12.
const JARINGAN: JaringanAktif = {
  networkId: "preview",
  indexer: "https://indexer.contoh.test/api/v3/graphql",
  indexerWS: "",
  alamatRegistry: "aabbcc",
};

describe("Results — provenans dan pembacaan ulang", () => {
  it("cap kepala halaman menyebut 'Read from chain', jaringan, dan tinggi blok — BUKAN 'Demo data'", () => {
    const { container } = render(
      <Results ballots={[ballotUji()]} receipt={null} jaringan={JARINGAN} blokHeight={817_778} onMuatUlang={() => {}} />,
    );
    expect(container.querySelector(".verified-stamp strong")!.textContent).toBe("Read from chain");
    expect(container.querySelector(".verified-stamp small")!.textContent).toBe("Midnight preview · block 817,778");
  });

  it("panel privacy-result menyebut provenans sungguhan, tidak lagi 'Demo data below'", () => {
    const { container } = render(
      <Results ballots={[ballotUji()]} receipt={null} jaringan={JARINGAN} blokHeight={817_778} onMuatUlang={() => {}} />,
    );
    const baris = Array.from(container.querySelectorAll(".privacy-stat")).map(el => el.textContent);
    expect(baris).toEqual([
      "Choice on the ledgerNever",
      "Tally during votingSealed",
      "SourceMidnight preview · block 817,778",
    ]);
    expect(container.textContent).not.toMatch(/demo\s+data/i);
  });

  it("tombol pembacaan ulang benar-benar memanggil balik", () => {
    const onMuatUlang = vi.fn();
    const { container } = render(
      <Results ballots={[ballotUji()]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={onMuatUlang} />,
    );
    container.querySelector<HTMLButtonElement>(".secondary-button")!.click();
    expect(onMuatUlang).toHaveBeenCalledTimes(1);
  });

  it("tidak ada tombol yang menjanjikan verifikasi tanpa melakukannya", () => {
    const { container } = render(
      <Results ballots={[ballotUji()]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    for (const b of Array.from(container.querySelectorAll("button"))) {
      // Setiap tombol di halaman ini punya perilaku. Yang tidak punya tidak
      // boleh berlabel seperti sedang melakukan sesuatu.
      expect(b.textContent).not.toMatch(/verify/i);
    }
  });
});

describe("Results — status badge memakai statusTone, bukan status mentah", () => {
  it("kelima status memakai label yang sama dengan BallotCard, dipetakan ke TIGA kelas tone", () => {
    const ballots = [
      ballotUji({ id: "a", status: "live" }),
      ballotUji({ id: "b", status: "closing-soon" }),
      ballotUji({ id: "c", status: "tally-open" }),
      ballotUji({ id: "d", status: "awaiting-finalize" }),
      ballotUji({ id: "e", status: "finalized" }),
    ];
    const { container } = render(
      <Results ballots={ballots} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    const badge = Array.from(container.querySelectorAll(".status-badge"));
    expect(badge.map(b => b.textContent?.trim())).toEqual([
      "Live now",
      "Closing soon",
      "Opening votes",
      "Awaiting finalization",
      "Finalized",
    ]);
    // tally-open dan awaiting-finalize BUKAN kelas literalnya sendiri — keduanya
    // dipetakan ke tone "closing-soon" karena index.css hanya punya tiga tone.
    expect(badge.map(b => b.getAttribute("class"))).toEqual([
      "status-badge ",
      "status-badge closing-soon",
      "status-badge closing-soon",
      "status-badge closing-soon",
      "status-badge finalized",
    ]);
  });
});

describe("Results — result-number bersiklus modulo 3", () => {
  it("baris keempat kembali ke result-0, bukan result-3 yang tidak beraturan CSS", () => {
    const ballots = [0, 1, 2, 3].map(i => ballotUji({ id: `b${i}` }));
    const { container } = render(
      <Results ballots={ballots} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    const kelas = Array.from(container.querySelectorAll(".result-number")).map(el => el.getAttribute("class"));
    expect(kelas).toEqual([
      "result-number result-0",
      "result-number result-1",
      "result-number result-2",
      "result-number result-0",
    ]);
  });
});

describe("Results — EMPAT keadaan hasil, dibedakan lewat keadaanHasil (P2)", () => {
  it("ada-hasil TANPA parsial (tallied === votes): pct dari tallies, tanpa cabang 'opened'", () => {
    const ballot = ballotUji({
      votes: 10,
      tallied: 10,
      keadaanHasil: "ada-hasil",
      options: ["A", "B"],
      tallies: [3, 7],
    });
    const { container } = render(
      <Results ballots={[ballot]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    // 7 / 10 * 100 = 70. Ditulis TANGAN, tidak dihitung ulang dengan rumus implementasi.
    expect(container.querySelector(".result-row-bottom span:last-child")!.textContent).toBe("70% leading option");
    expect(container.querySelector(".result-bar span")).not.toBeNull();
    expect(container.querySelector(".result-bar span")!.getAttribute("style")).toContain("width: 70%");
  });

  it("ada-hasil DENGAN parsial (tallied < votes): PENYEBUTNYA tallied, BUKAN votes (P2)", () => {
    // Praperiksa P2: fixture rekaman tidak dapat membedakan tallied vs votes
    // sebagai penyebut karena kebetulan sama (3/3). Kasus tulisan tangan ini
    // membuat keduanya BERBEDA secara sengaja: memimpin=7, tallied=10, votes=20.
    // Penyebut tallied  -> round(7/10*100)  = 70
    // Penyebut votes    -> round(7/20*100)  = 35
    // Nilai pembanding "70" DIKETIK TANGAN, bukan dihitung ulang dari rumus
    // implementasi — kalau implementasi ditukar ke ballot.votes, assert ini
    // akan menuntut "35%" dan MERAH.
    const ballot = ballotUji({
      votes: 20,
      tallied: 10,
      keadaanHasil: "ada-hasil",
      options: ["A", "B"],
      tallies: [3, 7],
    });
    const { container } = render(
      <Results ballots={[ballot]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    expect(container.querySelector(".result-row-bottom span:last-child")!.textContent).toBe(
      "70% leading · 10 of 20 opened",
    );
    expect(container.querySelector(".result-bar span")!.getAttribute("style")).toContain("width: 70%");
  });

  it("tersegel: kalimat sealed-until, dan BUKAN bar nol — tidak ada <span> di dalam .result-bar", () => {
    const ballot = ballotUji({ keadaanHasil: "tersegel", deadline: "Oct 18, 2026, 12:00 UTC", tallied: 0, votes: 0 });
    const { container } = render(
      <Results ballots={[ballot]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    expect(container.querySelector(".result-row-bottom span:last-child")!.textContent).toBe(
      "Results stay sealed until Oct 18, 2026, 12:00 UTC",
    );
    expect(container.querySelector(".result-bar")).not.toBeNull();
    expect(container.querySelector(".result-bar span")).toBeNull();
    expect(container.querySelector(".result-bar")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("menunggu-pembukaan: voting closed, belum ada yang dibuka", () => {
    const ballot = ballotUji({ keadaanHasil: "menunggu-pembukaan", status: "tally-open", tallied: 0, votes: 5 });
    const { container } = render(
      <Results ballots={[ballot]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    expect(container.querySelector(".result-row-bottom span:last-child")!.textContent).toBe(
      "Voting closed · no sealed vote has been opened yet",
    );
    expect(container.querySelector(".result-bar span")).toBeNull();
  });

  it("tidak-ada-yang-dibuka DENGAN votes 0: 'No votes were cast'", () => {
    const ballot = ballotUji({ keadaanHasil: "tidak-ada-yang-dibuka", status: "awaiting-finalize", votes: 0, tallied: 0 });
    const { container } = render(
      <Results ballots={[ballot]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    expect(container.querySelector(".result-row-bottom span:last-child")!.textContent).toBe("No votes were cast");
  });

  it("tidak-ada-yang-dibuka DENGAN votes > 0: menyebut berapa yang tersegel dan nol yang dibuka", () => {
    const ballot = ballotUji({ keadaanHasil: "tidak-ada-yang-dibuka", status: "finalized", votes: 4, tallied: 0 });
    const { container } = render(
      <Results ballots={[ballot]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    expect(container.querySelector(".result-row-bottom span:last-child")!.textContent).toBe(
      "No sealed vote was opened before the tally deadline · 4 sealed, 0 opened",
    );
  });
});

describe("Results — tanda terima", () => {
  it("tidak menampilkan panel tanda terima selama belum ada suara", () => {
    const { container } = render(
      <Results ballots={[ballotUji()]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    expect(container.querySelector(".receipt-panel")).toBeNull();
  });

  it("menyebut suara simulasi sebagai simulasi, tanpa transaksi", () => {
    const receipt: Receipt = {
      ballotId: "b1",
      proofStatus: "simulated",
      nullifierStatus: "not-consumed",
      txRef: null,
    };
    const { container } = render(
      <Results ballots={[ballotUji()]} receipt={receipt} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    expect(container.querySelector(".receipt-line")!.textContent).toBe(
      "Simulated — no transaction was submitted",
    );
    expect(container.querySelector(".receipt-line .status-dot")).toBeNull();
  });

  it("menampilkan referensi transaksi hanya ketika txRef benar-benar ada", () => {
    const receipt: Receipt = {
      ballotId: "b1",
      proofStatus: "verified",
      nullifierStatus: "consumed",
      txRef: "0000000000000000000000000000000000000000000000000000000000000001",
    };
    const { container } = render(
      <Results ballots={[ballotUji()]} receipt={receipt} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    expect(container.querySelector(".receipt-line .status-dot")).not.toBeNull();
    expect(container.querySelector(".receipt-line strong")!.textContent).toBe(receipt.txRef);
  });
});

describe("Results — kuorum tidak muncul di halaman ini", () => {
  it("tidak menyebut kata 'quorum' sama sekali (kuorum hanya pada kartu ballot)", () => {
    const { container } = render(
      <Results ballots={[ballotUji()]} receipt={null} jaringan={JARINGAN} blokHeight={1} onMuatUlang={() => {}} />,
    );
    expect(container.textContent).not.toMatch(/quorum/i);
  });
});

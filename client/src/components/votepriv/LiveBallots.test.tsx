import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LiveBallots } from "./LiveBallots";
import { ballotUji } from "@/test/fixture-ballot";

afterEach(() => cleanup());

const BALLOTS = [
  ballotUji({ id: "b1", title: "Q4 Community Treasury", community: "Midnight Builders", status: "live", keadaanHasil: "tersegel" }),
  ballotUji({ id: "b2", title: "Protocol Grants Round 03", community: "ZK Commons", status: "tally-open", keadaanHasil: "menunggu-pembukaan" }),
  ballotUji({ id: "b3", title: "Network Upgrade 7B", community: "Midnight Core", status: "finalized", tallied: 3, tallies: [2, 0, 1], keadaanHasil: "ada-hasil" }),
];

describe("LiveBallots", () => {
  it("menghitung chip filter dari STATUS TURUNAN, bukan dari phase", () => {
    const { container } = render(<LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />);
    const chip = Array.from(container.querySelectorAll(".filter-chip")).map(el => el.textContent);
    // Ditulis TANGAN. "Open 1" adalah pernyataan yang dapat salah, dan itulah
    // gunanya: sebelum C-2a, chip ini menghitung phase dan berbunyi "Live 2"
    // untuk kumpulan yang sama.
    expect(chip).toEqual(["All 3", "Open 1", "Tally 1", "Needs finalizing 0", "Finalized 1"]);
    expect(container.querySelector(".filter-chip")!.getAttribute("class")).toBe(
      "filter-chip active",
    );
  });

  it("menampilkan chip yang menghitung NOL, bukan menyembunyikannya", () => {
    const { container } = render(<LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />);
    expect(container.textContent).toContain("Needs finalizing 0");
    expect(container.querySelectorAll(".filter-chip")).toHaveLength(5);
  });

  it("chip Open menghitung menerimaSuara (live + closing-soon), bukan hanya live", () => {
    // Kalau nLive kembali dihitung dari `status === "live"` saja, ballot
    // closing-soon di bawah ini tidak akan terhitung, dan "Open" berbunyi 1
    // padahal dua ballot benar-benar masih menerima suara.
    const dua = [
      ballotUji({ id: "c1", status: "live" }),
      ballotUji({ id: "c2", status: "closing-soon" }),
      ballotUji({ id: "c3", status: "finalized" }),
    ];
    const { container } = render(<LiveBallots ballots={dua} onVote={() => {}} onCreate={() => {}} />);
    const chip = Array.from(container.querySelectorAll(".filter-chip")).map(el => el.textContent);
    expect(chip).toEqual(["All 3", "Open 2", "Tally 0", "Needs finalizing 0", "Finalized 1"]);
  });

  it("menyaring berdasarkan judul maupun komunitas", () => {
    const { container } = render(<LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />);
    const input = container.querySelector<HTMLInputElement>(".search-field input")!;
    fireEvent.change(input, { target: { value: "zk commons" } });
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "upgrade" } });
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(1);
  });

  it("menampilkan keadaan kosong dengan pesan 'coba judul lain' ketika PENCARIAN tidak cocok", () => {
    const { container } = render(<LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />);
    fireEvent.change(container.querySelector<HTMLInputElement>(".search-field input")!, {
      target: { value: "tidak-ada-ballot-begini" },
    });
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(0);
    expect(container.querySelector(".empty-state h3")!.textContent).toBe("No ballots found");
    expect(container.querySelector(".empty-state p")!.textContent).toBe("Try a different community or title.");
  });

  it("menampilkan keadaan kosong dengan pesan 'registry kosong' ketika DAFTAR ballot sendiri kosong", () => {
    // Dua pesan berbeda untuk dua sebab berbeda: pencarian yang tidak cocok
    // BUKAN hal yang sama dengan registry yang memang tidak punya ballot.
    const { container } = render(<LiveBallots ballots={[]} onVote={() => {}} onCreate={() => {}} />);
    expect(container.querySelector(".empty-state p")!.textContent).toBe("The registry has no ballots yet.");
  });

  it("menyisipkan konten `atas` di antara toolbar dan grid", () => {
    const { container } = render(
      <LiveBallots
        ballots={BALLOTS}
        onVote={() => {}}
        onCreate={() => {}}
        atas={<div data-testid="spanduk-uji">spanduk</div>}
      />,
    );
    expect(container.querySelector("[data-testid='spanduk-uji']")).not.toBeNull();
  });
});

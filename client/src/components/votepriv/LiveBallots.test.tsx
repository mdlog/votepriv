import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LiveBallots } from "./LiveBallots";
import type { Ballot } from "./types";

afterEach(() => cleanup());

// Field baru C-2a Task 6 diisi placeholder konsisten — LiveBallots.tsx dan
// BallotCard.tsx tidak membacanya, jadi tidak berpengaruh pada perilaku uji
// ini; hanya menutup kontrak tipe Ballot.
const dasar: Ballot = {
  id: "ballot-001",
  nomor: 1,
  title: "",
  description: "",
  community: "",
  votes: 10,
  eligible: 20,
  registered: 20,
  tallied: 0,
  quorum: 50,
  eligibilityPolicy: "e",
  deadline: "Oct 18, 2026",
  voteDeadlineMs: Date.UTC(2026, 9, 18, 12, 0),
  tallyDeadlineMs: Date.UTC(2026, 9, 18, 13, 0),
  phase: 0,
  status: "live",
  options: ["A", "B"],
  tallies: [0, 0],
  keadaanHasil: "tersegel",
  accent: "mint",
  tag: "Featured",
  deployHeight: 1,
};

const BALLOTS: Ballot[] = [
  { ...dasar, id: "b1", title: "Q4 Community Treasury", community: "Midnight Builders" },
  { ...dasar, id: "b2", title: "Protocol Grants Round 03", community: "ZK Commons", status: "closing-soon" },
  { ...dasar, id: "b3", title: "Network Upgrade 7B", community: "Midnight Core", status: "finalized" },
];

describe("LiveBallots", () => {
  it("menghitung chip filter dari status, bukan dari panjang daftar", () => {
    const { container } = render(
      <LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />,
    );
    const chip = Array.from(container.querySelectorAll(".filter-chip")).map(
      el => el.textContent,
    );
    // Disalin dari Home.tsx pra-pemecahan baris 255: All, Live, Finalized.
    expect(chip).toEqual(["All 3", "Live 1", "Finalized 1"]);
    expect(container.querySelector(".filter-chip")!.getAttribute("class")).toBe(
      "filter-chip active",
    );
  });

  it("menyaring berdasarkan judul maupun komunitas", () => {
    const { container } = render(
      <LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />,
    );
    const input = container.querySelector<HTMLInputElement>(".search-field input")!;
    fireEvent.change(input, { target: { value: "zk commons" } });
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "upgrade" } });
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(1);
  });

  it("menampilkan keadaan kosong ketika tidak ada yang cocok", () => {
    const { container } = render(
      <LiveBallots ballots={BALLOTS} onVote={() => {}} onCreate={() => {}} />,
    );
    fireEvent.change(container.querySelector<HTMLInputElement>(".search-field input")!, {
      target: { value: "tidak-ada-ballot-begini" },
    });
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(0);
    expect(container.querySelector(".empty-state h3")!.textContent).toBe("No ballots found");
  });
});

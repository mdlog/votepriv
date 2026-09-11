import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BallotCard } from "./BallotCard";
import type { Ballot } from "./types";

afterEach(() => cleanup());

/**
 * Salinan ballot-041 dari data demo, dengan angka bulat supaya persentasenya
 * pasti. Field baru C-2a Task 6 (nomor, registered, tallied, dst.) diisi
 * placeholder konsisten — BallotCard.tsx tidak membacanya, jadi tidak
 * berpengaruh pada perilaku uji ini; hanya menutup kontrak tipe Ballot.
 */
const BALLOT: Ballot = {
  id: "ballot-041",
  nomor: 41,
  title: "Protocol Grants Round 03",
  description: "Prioritise the next cohort of privacy tooling grants.",
  community: "ZK Commons",
  votes: 250,
  eligible: 500,
  registered: 500,
  tallied: 0,
  quorum: 55,
  eligibilityPolicy: "ZK Commons contributors with an active grant credential",
  deadline: "Oct 16, 2026",
  voteDeadlineMs: Date.UTC(2026, 9, 16, 12, 0),
  tallyDeadlineMs: Date.UTC(2026, 9, 16, 13, 0),
  phase: 0,
  status: "closing-soon",
  options: ["Identity primitives", "Developer education", "Audit funding"],
  tallies: [0, 0, 0],
  keadaanHasil: "tersegel",
  accent: "violet",
  tag: "Closing soon",
  deployHeight: 90,
};

describe("BallotCard", () => {
  it("menyusun kelas accent dari template literal tanpa kehilangan spasinya", () => {
    const { container } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    const kartu = container.querySelector("article")!;
    // Disalin dari Home.tsx pra-pemecahan baris 239.
    expect(kartu.getAttribute("class")).toBe("ballot-card accent-violet");
    expect(container.querySelector(".status-badge")!.getAttribute("class")).toBe(
      "status-badge closing-soon",
    );
    expect(container.querySelector(".progress-track")!.getAttribute("class")).toBe(
      "progress-track slim",
    );
  });

  it("menampilkan label status dan persentase partisipasi apa adanya", () => {
    const { container } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    expect(container.querySelector(".status-badge")!.textContent).toContain("Closing soon");
    expect(container.querySelector(".ballot-progress-label strong")!.textContent).toBe("50%");
    expect(container.querySelector(".ballot-tag")!.textContent).toBe("Closing soon");
  });

  it("memberi tombol 'View result' pada ballot finalized dan 'Vote privately' pada yang lain", () => {
    const { container, rerender } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    expect(container.querySelector(".text-button")!.textContent).toContain("Vote privately");
    rerender(<BallotCard ballot={{ ...BALLOT, status: "finalized" }} onVote={() => {}} />);
    expect(container.querySelector(".text-button")!.textContent).toContain("View result");
  });

  it("mengoper ballot yang sama ke onVote", () => {
    const onVote = vi.fn();
    const { container } = render(<BallotCard ballot={BALLOT} onVote={onVote} />);
    container.querySelector<HTMLButtonElement>(".text-button")!.click();
    expect(onVote).toHaveBeenCalledWith(BALLOT);
  });
});

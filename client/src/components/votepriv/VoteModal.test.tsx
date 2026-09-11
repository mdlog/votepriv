import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoteModal } from "./VoteModal";
import type { Ballot } from "./types";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const BALLOT: Ballot = {
  id: "ballot-042",
  title: "Q4 Community Treasury",
  description: "Choose how the community treasury supports public goods in Q4.",
  community: "Midnight Builders",
  votes: 842,
  eligible: 1200,
  quorum: 60,
  deadline: "Oct 18, 2026",
  status: "live",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  accent: "mint",
  tag: "Featured",
};

describe("VoteModal", () => {
  it("menyusun kelas choice-row terpilih dari template literal", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected onClose={() => {}} onVote={() => {}} />,
    );
    const baris = container.querySelectorAll<HTMLElement>(".choice-row");
    // Disalin dari Home.tsx pra-pemecahan baris 189-190.
    expect(baris[0].getAttribute("class")).toBe("choice-row ");
    fireEvent.click(baris[0]);
    expect(container.querySelector(".choice-row")!.getAttribute("class")).toBe(
      "choice-row selected",
    );
    expect(container.querySelector(".choice-index")!.getAttribute("class")).toBe(
      "choice-index choice-0",
    );
  });

  it("menolak mengirim tanpa wallet dan tetap di tahap select", () => {
    const onVote = vi.fn();
    const { container } = render(
      <VoteModal ballot={BALLOT} connected={false} onClose={() => {}} onVote={onVote} />,
    );
    fireEvent.click(container.querySelectorAll<HTMLElement>(".choice-row")[0]);
    fireEvent.click(within(container).getByText("Generate proof & vote"));
    expect(onVote).not.toHaveBeenCalled();
    expect(container.querySelector(".choice-list")).not.toBeNull();
  });

  it("melewati proving lalu success, dan mengirim tanda terima simulasi", () => {
    vi.useFakeTimers();
    const onVote = vi.fn();
    const { container } = render(
      <VoteModal ballot={BALLOT} connected onClose={() => {}} onVote={onVote} />,
    );
    fireEvent.click(container.querySelectorAll<HTMLElement>(".choice-row")[0]);
    fireEvent.click(within(container).getByText("Generate proof & vote"));
    expect(container.querySelector(".proof-orbit")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(container.querySelector(".success-state")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Bentuk ini disalin dari Home.tsx pra-pemecahan baris 168. Tanda terima
    // simulasi TIDAK boleh membawa txRef: alur ini belum menyentuh kontrak.
    expect(onVote).toHaveBeenCalledWith({
      ballotId: "ballot-042",
      proofStatus: "simulated",
      nullifierStatus: "not-consumed",
      txRef: null,
    });
  });
});

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Results } from "./Results";
import type { Ballot, Receipt } from "./types";

afterEach(() => cleanup());

// Field baru C-2a Task 6 diisi placeholder konsisten — Results.tsx tidak
// membacanya, jadi tidak berpengaruh pada perilaku uji ini; hanya menutup
// kontrak tipe Ballot.
const dasar: Ballot = {
  id: "b1",
  nomor: 1,
  title: "Q4 Community Treasury",
  description: "",
  community: "",
  votes: 842,
  eligible: 1200,
  registered: 1200,
  tallied: 0,
  quorum: 60,
  eligibilityPolicy: "e",
  deadline: "Oct 18, 2026",
  voteDeadlineMs: Date.UTC(2026, 9, 18, 12, 0),
  tallyDeadlineMs: Date.UTC(2026, 9, 18, 13, 0),
  phase: 0,
  status: "live",
  options: ["A"],
  tallies: [0],
  keadaanHasil: "tersegel",
  accent: "mint",
  tag: "Featured",
  deployHeight: 1,
};
const BALLOTS: Ballot[] = [
  dasar,
  { ...dasar, id: "b2", title: "Protocol Grants Round 03", status: "closing-soon" },
  { ...dasar, id: "b3", title: "Network Upgrade 7B", status: "finalized" },
];

describe("Results", () => {
  it("tidak menampilkan panel tanda terima selama belum ada suara", () => {
    const { container } = render(<Results ballots={BALLOTS} receipt={null} />);
    expect(container.querySelector(".receipt-panel")).toBeNull();
    expect(container.querySelector(".verified-stamp strong")!.textContent).toBe("Demo data");
  });

  it("menyebut suara simulasi sebagai simulasi, tanpa transaksi", () => {
    const receipt: Receipt = {
      ballotId: "b1",
      proofStatus: "simulated",
      nullifierStatus: "not-consumed",
      txRef: null,
    };
    const { container } = render(<Results ballots={BALLOTS} receipt={receipt} />);
    // Disalin dari Home.tsx pra-pemecahan baris 259. Cabang txRef === null harus
    // tetap menolak menampilkan hash apa pun.
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
    const { container } = render(<Results ballots={BALLOTS} receipt={receipt} />);
    expect(container.querySelector(".receipt-line .status-dot")).not.toBeNull();
    expect(container.querySelector(".receipt-line strong")!.textContent).toBe(receipt.txRef);
  });

  it("memakai statusLabel yang sama dengan kartu ballot", () => {
    const { container } = render(<Results ballots={BALLOTS} receipt={null} />);
    const badge = Array.from(container.querySelectorAll(".status-badge")).map(
      el => el.textContent?.trim(),
    );
    expect(badge).toEqual(["Live now", "Closing soon", "Finalized"]);
    expect(container.querySelectorAll(".result-number")[0].getAttribute("class")).toBe(
      "result-number result-0",
    );
  });
});

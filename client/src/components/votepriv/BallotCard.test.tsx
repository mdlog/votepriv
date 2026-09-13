import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BallotCard } from "./BallotCard";
import { ballotUji } from "@/test/fixture-ballot";
import { labelNomor } from "@/lib/chain/ke-ballot";
import type { BallotStatus } from "./types";

afterEach(() => cleanup());

const BALLOT = ballotUji({
  id: "ballot-041",
  nomor: 41,
  title: "Protocol Grants Round 03",
  description: "Prioritise the next cohort of privacy tooling grants.",
  community: "ZK Commons",
  votes: 250,
  eligible: 500,
  registered: 500,
  quorum: 55,
  eligibilityPolicy: "ZK Commons contributors with an active grant credential",
  deadline: "Oct 16, 2026",
  status: "closing-soon",
  options: ["Identity primitives", "Developer education", "Audit funding"],
  tallies: [0, 0, 0],
  accent: "violet",
  tag: "Closing soon",
  deployHeight: 90,
});

describe("BallotCard", () => {
  it("menyusun kelas accent dari template literal tanpa kehilangan spasinya", () => {
    const { container } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    const kartu = container.querySelector("article")!;
    // Disalin dari Home.tsx pra-pemecahan baris 239.
    expect(kartu.getAttribute("class")).toBe("ballot-card accent-violet");
    // "closing-soon" muncul di SINI karena statusTone("closing-soon") memang
    // berbunyi "closing-soon" — kebetulan yang sama dengan status mentahnya.
    // Uji "statusTone MENGGANTIKAN status mentah" di bawah membuktikan bahwa
    // ini bukan karena kelas dibaca dari ballot.status langsung.
    expect(container.querySelector(".status-badge")!.getAttribute("class")).toBe(
      "status-badge closing-soon",
    );
    expect(container.querySelector(".progress-track")!.getAttribute("class")).toBe(
      "progress-track slim",
    );
  });

  it("memakai statusTone untuk kelas badge, BUKAN status mentah — kelimanya dipetakan ke tiga tone", () => {
    // Ini penjaga yang sebenarnya: lima status berbeda, tiga kelas tone. Bila
    // BallotCard kembali membaca ballot.status langsung, tally-open dan
    // awaiting-finalize akan menghasilkan kelas tanpa aturan CSS ("status-badge
    // tally-open"), bukan "status-badge closing-soon".
    const kasus: Array<[status: BallotStatus, kelas: string]> = [
      ["live", "status-badge "],
      ["closing-soon", "status-badge closing-soon"],
      ["tally-open", "status-badge closing-soon"],
      ["awaiting-finalize", "status-badge closing-soon"],
      ["finalized", "status-badge finalized"],
    ];
    for (const [status, kelas] of kasus) {
      const { container, unmount } = render(
        <BallotCard ballot={{ ...BALLOT, status }} onVote={() => {}} />,
      );
      expect(container.querySelector(".status-badge")!.getAttribute("class"), status).toBe(kelas);
      unmount();
    }
  });

  it("menampilkan label status dan persentase partisipasi apa adanya", () => {
    const { container } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    expect(container.querySelector(".status-badge")!.textContent).toContain("Closing soon");
    expect(container.querySelector(".ballot-progress-label strong")!.textContent).toBe("50%");
  });

  it("ballot-tag menggabungkan NOMOR URUT dan tag, bukan tag saja (P7)", () => {
    // Sebelum perbaikan ini, .ballot-tag hanya berisi ballot.tag ("Closing
    // soon"). Setelah Step 3 menambahkan labelNomor(ballot.nomor) di depannya,
    // teks itu berubah bentuk — praperiksa P7 menandai bahwa uji lama akan
    // merah kalau tidak diperbarui bersamaan.
    const { container } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    expect(container.querySelector(".ballot-tag")!.textContent).toBe(
      `${labelNomor(41)} · Closing soon`,
    );
  });

  it("menyebut kuorum sebagai NIAT, bukan sebagai ambang", () => {
    const { container } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    expect(container.textContent).toContain("55% intended quorum");
    expect(container.textContent).not.toMatch(/\d+% quorum\b/);
  });

  it("menampilkan eligibilityPolicy ketika ada, dan menyembunyikannya ketika kosong", () => {
    const { container, rerender } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    expect(container.textContent).toContain("ZK Commons contributors with an active grant credential");
    rerender(<BallotCard ballot={{ ...BALLOT, eligibilityPolicy: "" }} onVote={() => {}} />);
    expect(container.textContent).not.toContain("ZK Commons contributors with an active grant credential");
  });

  it("memberi tombol 'View result' pada ballot yang TIDAK menerima suara, dan 'Vote privately' pada yang menerima", () => {
    const { container, rerender } = render(<BallotCard ballot={BALLOT} onVote={() => {}} />);
    // BALLOT berstatus closing-soon — menerimaSuara(true) — jadi harus "Vote privately".
    expect(container.querySelector(".text-button")!.textContent).toContain("Vote privately");
    rerender(<BallotCard ballot={{ ...BALLOT, status: "finalized" }} onVote={() => {}} />);
    expect(container.querySelector(".text-button")!.textContent).toContain("View result");
    rerender(<BallotCard ballot={{ ...BALLOT, status: "tally-open" }} onVote={() => {}} />);
    expect(container.querySelector(".text-button")!.textContent).toContain("View result");
    rerender(<BallotCard ballot={{ ...BALLOT, status: "awaiting-finalize" }} onVote={() => {}} />);
    expect(container.querySelector(".text-button")!.textContent).toContain("View result");
  });

  it("mengoper ballot yang sama ke onVote", () => {
    const onVote = vi.fn();
    const { container } = render(<BallotCard ballot={BALLOT} onVote={onVote} />);
    container.querySelector<HTMLButtonElement>(".text-button")!.click();
    expect(onVote).toHaveBeenCalledWith(BALLOT);
  });

  describe("tombol pendaftaran (Register to vote)", () => {
    // BALLOT dasar (votes: 250) TIDAK menerima pendaftaran — dipakai di semua
    // uji lama di atas TANPA satu pun terpengaruh oleh describe ini.
    const BALLOT_BISA_DAFTAR = { ...BALLOT, votes: 0, registered: 2, eligible: 3 };

    it("TIDAK dirender ketika onRegister tidak diberikan, walau ballot memenuhi syarat", () => {
      const { queryByText } = render(<BallotCard ballot={BALLOT_BISA_DAFTAR} onVote={() => {}} />);
      expect(queryByText(/Register to vote/)).toBeNull();
    });

    it("TIDAK dirender ketika ballot tidak lagi menerima pendaftaran (votes bukan 0)", () => {
      const onRegister = vi.fn();
      const { queryByText } = render(
        <BallotCard ballot={{ ...BALLOT_BISA_DAFTAR, votes: 1 }} onVote={() => {}} onRegister={onRegister} />,
      );
      expect(queryByText(/Register to vote/)).toBeNull();
    });

    it("TIDAK dirender ketika kuota pendaftaran sudah penuh (registered === eligible)", () => {
      const onRegister = vi.fn();
      const { queryByText } = render(
        <BallotCard
          ballot={{ ...BALLOT_BISA_DAFTAR, registered: BALLOT_BISA_DAFTAR.eligible }}
          onVote={() => {}}
          onRegister={onRegister}
        />,
      );
      expect(queryByText(/Register to vote/)).toBeNull();
    });

    it("DIRENDER dan mengoper ballot yang sama ke onRegister ketika keduanya terpenuhi", () => {
      const onRegister = vi.fn();
      const { getByText } = render(
        <BallotCard ballot={BALLOT_BISA_DAFTAR} onVote={() => {}} onRegister={onRegister} />,
      );
      const tombol = getByText(/Register to vote/).closest("button")!;
      tombol.click();
      expect(onRegister).toHaveBeenCalledWith(BALLOT_BISA_DAFTAR);
    });

    it("tampil BERDAMPINGAN dengan 'Vote privately' pada ballot baru (votes 0, status live)", () => {
      const onRegister = vi.fn();
      const { getByText } = render(
        <BallotCard ballot={{ ...BALLOT_BISA_DAFTAR, status: "live" }} onVote={() => {}} onRegister={onRegister} />,
      );
      expect(getByText(/Register to vote/)).toBeTruthy();
      expect(getByText(/Vote privately/)).toBeTruthy();
    });
  });
});

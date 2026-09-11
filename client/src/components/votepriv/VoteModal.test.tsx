import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoteModal, pesanPrivasiSuara } from "./VoteModal";
import { ballotUji } from "@/test/fixture-ballot";
import type { ProofServerStatus } from "@/lib/proof-server";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const BALLOT = ballotUji({
  id: "ballot-042",
  nomor: 42,
  title: "Q4 Community Treasury",
  description: "Choose how the community treasury supports public goods in Q4.",
  community: "Midnight Builders",
  votes: 842,
  eligible: 1200,
  registered: 1200,
  quorum: 60,
  eligibilityPolicy: "Open to Midnight Builders credential holders",
  deadline: "Oct 18, 2026",
  status: "live",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  tallies: [0, 0, 0],
  accent: "mint",
  tag: "Featured",
  deployHeight: 1,
});

const LOKAL_VERIFIED: ProofServerStatus = {
  reachable: true,
  version: "8.1.0",
  target: "http://127.0.0.1:6300",
  targetTerverifikasi: true,
  reach: "lokal",
  hop: "browser → http://127.0.0.1:6300",
};
const LOKAL_TAK_TERVERIFIKASI: ProofServerStatus = {
  ...LOKAL_VERIFIED,
  targetTerverifikasi: false,
};
const LEWAT_HOST: ProofServerStatus = {
  reachable: true,
  version: "8.1.0",
  target: "http://127.0.0.1:6300",
  targetTerverifikasi: true,
  reach: "lewat-host-halaman",
  hop: "browser → votepriv.mdloglabs.org → http://127.0.0.1:6300 (loopback mesin itu, bukan perangkat Anda)",
};
const REMOTE: ProofServerStatus = {
  reachable: true,
  version: "8.1.0",
  target: "https://proof.pihak-lain.example",
  targetTerverifikasi: true,
  reach: "remote",
  hop: "browser → https://proof.pihak-lain.example",
};

describe("pesanPrivasiSuara — satu kalimat berbeda per nilai reach (Task 8 butir B)", () => {
  it("null (belum ada jawaban): tidak mengklaim apa pun, kuat=false", () => {
    const p = pesanPrivasiSuara(null);
    expect(p.kuat).toBe(false);
    expect(p.kalimat).not.toMatch(/stays private/i);
  });

  it("reach lokal DAN targetTerverifikasi: SATU-SATUNYA kondisi kuat=true", () => {
    const p = pesanPrivasiSuara(LOKAL_VERIFIED);
    expect(p.kuat).toBe(true);
    expect(p.kalimat).toBe(
      "Your choice stays private. Only the proof, nullifier status, and aggregate tally are verifiable.",
    );
  });

  it("reach lokal TAPI target belum terverifikasi: kuat=false, menyebut hop, dan memakai kalimat 'belum dikonfirmasi' — BUKAN kalimat remote/tunnel", () => {
    const p = pesanPrivasiSuara(LOKAL_TAK_TERVERIFIKASI);
    expect(p.kuat).toBe(false);
    expect(p.kalimat).not.toMatch(/stays private/i);
    expect(p.kalimat).toContain(LOKAL_TAK_TERVERIFIKASI.hop);
    // Frasa KHAS cabang ini, yang tidak dipakai cabang mana pun yang lain —
    // ditemukan lewat mutation testing: menukar cabang "remote" dan
    // "lewat-host-halaman" satu sama lain lolos HIJAU pada uji yang hanya
    // memeriksa `toContain(hop)`, karena KETIGA cabang non-kuat menyebut hop.
    // Memeriksa frasa yang benar-benar unik menutup celah itu.
    expect(p.kalimat).toContain("has not been confirmed by this page");
    expect(p.kalimat).not.toContain("proof server operator");
    expect(p.kalimat).not.toContain("whoever operates that machine");
  });

  it("reach lewat-host-halaman: kuat=false, menyebut hop APA ADANYA (bukan disusun ulang), dan memakai kalimat KHAS 'whoever operates that machine'", () => {
    const p = pesanPrivasiSuara(LEWAT_HOST);
    expect(p.kuat).toBe(false);
    expect(p.kalimat).toContain(LEWAT_HOST.hop);
    expect(p.kalimat).toContain("whoever operates that machine");
    expect(p.kalimat).not.toContain("proof server operator");
    expect(p.kalimat).not.toContain("has not been confirmed by this page");
  });

  it("reach remote: kuat=false, menyebut hop APA ADANYA, dan memakai kalimat KHAS 'proof server operator'", () => {
    const p = pesanPrivasiSuara(REMOTE);
    expect(p.kuat).toBe(false);
    expect(p.kalimat).toContain(REMOTE.hop);
    expect(p.kalimat).toContain("proof server operator");
    expect(p.kalimat).not.toContain("whoever operates that machine");
    expect(p.kalimat).not.toContain("has not been confirmed by this page");
  });

  it("kelima kalimat (null + 4 kombinasi reach/verifikasi) SEMUANYA berbeda satu sama lain", () => {
    const semua = [
      pesanPrivasiSuara(null).kalimat,
      pesanPrivasiSuara(LOKAL_VERIFIED).kalimat,
      pesanPrivasiSuara(LOKAL_TAK_TERVERIFIKASI).kalimat,
      pesanPrivasiSuara(LEWAT_HOST).kalimat,
      pesanPrivasiSuara(REMOTE).kalimat,
    ];
    expect(new Set(semua).size).toBe(semua.length);
  });
});

describe("VoteModal — klaim privasi dirender sesuai proofStatus", () => {
  it("klaim KUAT ('stays private') HANYA muncul ketika reach lokal DAN terverifikasi", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain("Your choice stays private.");
    // Klaim kuat WAJIB ditebalkan, bukan sekadar disebut di suatu tempat.
    const kuat = Array.from(container.querySelectorAll(".privacy-callout strong")).some(el =>
      (el.textContent ?? "").includes("Your choice stays private."),
    );
    expect(kuat).toBe(true);
  });

  it.each([
    ["lokal tapi belum terverifikasi", LOKAL_TAK_TERVERIFIKASI],
    ["lewat host halaman (tunnel)", LEWAT_HOST],
    ["remote", REMOTE],
    ["proofStatus belum ada", null],
  ] as const)("klaim KUAT tidak pernah muncul saat %s", (_nama, status) => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected proofStatus={status} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).not.toContain("Your choice stays private.");
  });

  it("kalimat privasi TIDAK dirender saat ballot tidak lagi menerima suara (tidak ada proof yang akan dibuat)", () => {
    const { container } = render(
      <VoteModal
        ballot={{ ...BALLOT, status: "awaiting-finalize" }}
        connected
        proofStatus={LOKAL_VERIFIED}
        onClose={() => {}}
        onVote={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("Your choice stays private.");
  });
});

describe("VoteModal — gerbang status yang kontraknya tolak (Step 7)", () => {
  it("status yang menerima suara (live/closing-soon) menampilkan choice-list dan tombol submit", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.querySelector(".choice-list")).not.toBeNull();
    expect(within(container).getByText("Generate proof & vote")).not.toBeNull();
  });

  it.each(["tally-open", "awaiting-finalize", "finalized"] as const)(
    "status %s TIDAK menawarkan tombol 'Generate proof & vote' maupun choice-list",
    status => {
      const { container } = render(
        <VoteModal ballot={{ ...BALLOT, status }} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
      );
      expect(container.querySelector(".choice-list")).toBeNull();
      expect(container.textContent).not.toContain("Generate proof & vote");
      expect(container.querySelector(".modal-actions button:last-child")?.textContent).not.toContain(
        "Generate proof & vote",
      );
    },
  );

  it("status tally-open menyebut jendela pembukaan suara masih terbuka", () => {
    const { container } = render(
      <VoteModal ballot={{ ...BALLOT, status: "tally-open" }} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain("Voters can still open their sealed votes until the tally deadline.");
  });

  it("status awaiting-finalize menyebut ballot menunggu finalisasi", () => {
    const { container } = render(
      <VoteModal ballot={{ ...BALLOT, status: "awaiting-finalize" }} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain("This ballot is waiting to be finalized.");
  });
});

describe("VoteModal — eligibilityPolicy (spec 9.4: kartu DAN modal)", () => {
  it("menampilkan eligibilityPolicy beserta hitungan credential ketika ada", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain("Open to Midnight Builders credential holders");
    expect(container.textContent).toContain("1,200 of 1,200 credentials issued.");
  });

  it("tidak menampilkan baris 'Who can vote' ketika eligibilityPolicy kosong", () => {
    const { container } = render(
      <VoteModal ballot={{ ...BALLOT, eligibilityPolicy: "" }} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).not.toContain("Who can vote:");
  });
});

describe("VoteModal — teks tombol dipertahankan sadar (P8)", () => {
  it("tombol batal tetap berbunyi 'Cancel', bukan 'Close'", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    const tombolBatal = container.querySelector(".modal-actions .ghost-button")!;
    expect(tombolBatal.textContent).toBe("Cancel");
  });
});

describe("VoteModal — alur dasar (warisan)", () => {
  it("menyusun kelas choice-row terpilih dari template literal", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    const baris = container.querySelectorAll<HTMLElement>(".choice-row");
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
      <VoteModal ballot={BALLOT} connected={false} proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={onVote} />,
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
      <VoteModal ballot={BALLOT} connected proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={onVote} />,
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

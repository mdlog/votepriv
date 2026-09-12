import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoteModal, pesanPrivasiBuka, pesanPrivasiSuara, teksTahap, unduhCadangan } from "./VoteModal";
import { ballotUji } from "@/test/fixture-ballot";
import type { WalletConnection } from "@/lib/midnight-wallet";
import type { ProofServerStatus } from "@/lib/proof-server";
import type { CadanganOpening, TahapKirimSuara } from "@/lib/chain/tulis";

/**
 * Mock SATU-SATUNYA pintu jalur tulis yang VoteModal.tsx pakai —
 * `muatJalurTulis()` dari "@/lib/chain/jalur-tulis". Berkas uji ini BUKAN
 * bagian dari graf statis yang batas-bundel.test.ts telusuri (yang dimulai
 * dari client/src/main.tsx), jadi mock di sini tidak berkonsekuensi apa pun
 * atas gerbang itu — ia murni menggantikan modul yang, di produksi, hanya
 * pernah dimuat lewat `await import("./tulis")` di dalam badan fungsi.
 *
 * `vi.hoisted` WAJIB: `vi.mock` dinaikkan ke atas berkas oleh Vitest, jadi
 * mock-mock ini harus sudah ada SEBELUM baris itu dieksekusi.
 */
const { kirimSuaraMock, bukaSuaraMock } = vi.hoisted(() => ({
  kirimSuaraMock: vi.fn(),
  bukaSuaraMock: vi.fn(),
}));
vi.mock("@/lib/chain/jalur-tulis", () => ({
  muatJalurTulis: async () => ({
    kirimSuara: kirimSuaraMock,
    bukaSuara: bukaSuaraMock,
    GalatCastVote: class GalatCastVote extends Error {
      kode = "TIDAK_DIKENAL";
      mungkinSudahMasuk?: { nullifierHex: string };
    },
    GalatOpeningHilang: class GalatOpeningHilang extends Error {
      constructor(alamatBallot: string) {
        super(`Tidak ada opening tersimpan untuk ballot ${alamatBallot} di perangkat ini.`);
        this.name = "GalatOpeningHilang";
      }
    },
  }),
}));

afterEach(() => {
  vi.useRealTimers();
  kirimSuaraMock.mockReset();
  bukaSuaraMock.mockReset();
  cleanup();
});

/**
 * Menguras microtask queue (dan setiap timer 0ms tertunda) sebelum
 * mengasersi KETIADAAN sebuah panggilan async.
 *
 * Ditemukan lewat gerbang mutasi Task 8 sendiri: mengasersi
 * `.not.toHaveBeenCalled()` TEPAT SESUDAH `fireEvent.click(...)`, tanpa
 * menguras apa pun, lolos HIJAU bahkan ketika guard credential-nya dirusak
 * total (regex diganti jadi cocok-apa-saja) — sebab `submit`/`submitOpen` melempar SATU
 * `await muatJalurTulis()` sebelum `kirimSuara`/`bukaSuara` sungguhan
 * terpanggil, dan assert sinkron berjalan SEBELUM microtask itu sempat
 * lanjut. Ini persis padanan UI dari pelajaran invarian privasi: uji yang
 * hanya memeriksa ketiadaan tetap hijau saat jalur yang diujinya mati.
 *
 * BUKAN wall-clock: `setTimeout(…, 0)` di sini tidak pernah dipakai untuk
 * mengukur durasi — ia hanya memastikan giliran microtask/macrotask
 * tertunda sudah habis sebelum assert berjalan, deterministik di mesin
 * mana pun.
 */
async function kurasAsync(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

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

/** Wallet dipakai untuk MENCOBLOS di seluruh berkas ini kecuali disebut lain. */
function walletContoh(alamat = "mn_shield-addr_test1x-coblos"): WalletConnection {
  return {
    address: alamat,
    coinPublicKey: "cpk",
    encryptionPublicKey: "epk",
    networkId: "preview",
    connectorName: "lace",
    apiVersion: "4.0.1",
    api: {},
  };
}

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

  it("reach lokal DAN targetTerverifikasi: SATU-SATUNYA kondisi kuat=true, dan menyebut DUA kaki proving (Task 8, diperbarui)", () => {
    const p = pesanPrivasiSuara(LOKAL_VERIFIED);
    expect(p.kuat).toBe(true);
    expect(p.kalimat).toBe(
      "Your choice stays private. The proof is built on this device; your wallet only balances and submits the already-proven transaction — it never sees your selection.",
    );
    expect(p.kalimat).toMatch(/wallet only balances/i);
    expect(p.kalimat).toMatch(/never sees your selection/i);
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

describe("pesanPrivasiBuka — kalimat privasi MEMBUKA suara, terpisah dari mencoblos (Task 8, sesi ini)", () => {
  it("TIDAK PERNAH mengklaim 'stays private' — membuka SELALU melabeli opsi di indexer, tidak ada topologi yang membuatnya rahasia", () => {
    for (const status of [null, LOKAL_VERIFIED, LOKAL_TAK_TERVERIFIKASI, LEWAT_HOST, REMOTE]) {
      expect(pesanPrivasiBuka(status).kalimat).not.toMatch(/stays private/i);
    }
  });

  it("lokal+terverifikasi: kuat=true DAN menyebut proof server tidak melihat opsi", () => {
    const p = pesanPrivasiBuka(LOKAL_VERIFIED);
    expect(p.kuat).toBe(true);
    expect(p.kalimat).toMatch(/proof server never sees which option/i);
  });

  it("remote: kuat=false dan menyebut hop APA ADANYA", () => {
    const p = pesanPrivasiBuka(REMOTE);
    expect(p.kuat).toBe(false);
    expect(p.kalimat).toContain(REMOTE.hop);
  });

  it("kelima kalimat SEMUANYA berbeda satu sama lain", () => {
    const semua = [null, LOKAL_VERIFIED, LOKAL_TAK_TERVERIFIKASI, LEWAT_HOST, REMOTE].map(
      (s) => pesanPrivasiBuka(s).kalimat,
    );
    expect(new Set(semua).size).toBe(semua.length);
  });
});

describe("VoteModal — klaim privasi dirender sesuai proofStatus", () => {
  it("klaim KUAT ('stays private') HANYA muncul ketika reach lokal DAN terverifikasi", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
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
      <VoteModal ballot={BALLOT} connected wallet={null} jaringan="preview" proofStatus={status} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).not.toContain("Your choice stays private.");
  });

  it("kalimat privasi TIDAK dirender saat ballot tidak lagi menerima suara (tidak ada proof yang akan dibuat)", () => {
    const { container } = render(
      <VoteModal
        ballot={{ ...BALLOT, status: "awaiting-finalize" }}
        connected
        wallet={null}
        jaringan="preview"
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
      <VoteModal ballot={BALLOT} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.querySelector(".choice-list")).not.toBeNull();
    expect(within(container).getByText("Generate proof & vote")).not.toBeNull();
  });

  it.each(["tally-open", "awaiting-finalize", "finalized"] as const)(
    "status %s TIDAK menawarkan tombol 'Generate proof & vote' maupun choice-list",
    status => {
      const { container } = render(
        <VoteModal ballot={{ ...BALLOT, status }} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
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
      <VoteModal ballot={{ ...BALLOT, status: "tally-open" }} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain("Voters can still open their sealed votes until the tally deadline.");
  });

  it("status awaiting-finalize menyebut ballot menunggu finalisasi", () => {
    const { container } = render(
      <VoteModal ballot={{ ...BALLOT, status: "awaiting-finalize" }} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain("This ballot is waiting to be finalized.");
  });
});

describe("VoteModal — eligibilityPolicy (spec 9.4: kartu DAN modal)", () => {
  it("menampilkan eligibilityPolicy beserta hitungan credential ketika ada", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain("Open to Midnight Builders credential holders");
    expect(container.textContent).toContain("1,200 of 1,200 credentials issued.");
  });

  it("tidak menampilkan baris 'Who can vote' ketika eligibilityPolicy kosong", () => {
    const { container } = render(
      <VoteModal ballot={{ ...BALLOT, eligibilityPolicy: "" }} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).not.toContain("Who can vote:");
  });
});

describe("VoteModal — teks tombol dipertahankan sadar (P8)", () => {
  it("tombol batal tetap berbunyi 'Cancel', bukan 'Close'", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    const tombolBatal = container.querySelector(".modal-actions .ghost-button")!;
    expect(tombolBatal.textContent).toBe("Cancel");
  });
});

describe("VoteModal — alur dasar (warisan)", () => {
  it("menyusun kelas choice-row terpilih dari template literal", () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
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

  it("menolak mengirim tanpa wallet dan tetap di tahap select, TIDAK memanggil kirimSuara", async () => {
    const onVote = vi.fn();
    const { container } = render(
      <VoteModal ballot={BALLOT} connected={false} wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={onVote} />,
    );
    fireEvent.click(container.querySelectorAll<HTMLElement>(".choice-row")[0]);
    fireEvent.click(within(container).getByText("Generate proof & vote"));
    // Guard `!connected || !wallet` mengembalikan SEBELUM `await
    // muatJalurTulis()` mana pun tercapai, jadi ini sebetulnya aman diperiksa
    // sinkron — tapi kurasAsync() tetap dipakai di sini, konsisten dengan uji
    // sepupunya di atas, supaya perubahan urutan guard di masa depan tidak
    // diam-diam membuat uji ini palsu-hijau lagi.
    await kurasAsync();
    expect(onVote).not.toHaveBeenCalled();
    expect(kirimSuaraMock).not.toHaveBeenCalled();
    expect(container.querySelector(".choice-list")).not.toBeNull();
  });
});

describe("VoteModal — jalur tulis sungguhan (Task 8)", () => {
  it("menolak submit tanpa credential yang valid, TIDAK memanggil kirimSuara (dikuras async — lihat kurasAsync)", async () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.click(within(container).getByText(/Generate proof & vote/));
    await kurasAsync();
    expect(kirimSuaraMock).not.toHaveBeenCalled();
  });

  it("menolak submit tanpa wallet TERSAMBUNG walau opsi dan credential VALID — guard 'connected/wallet' TERISOLASI dari guard credential (Task 8, gerbang mutasi G13)", async () => {
    // Ditemukan lewat mutation testing: uji "menolak mengirim tanpa wallet"
    // di describe "alur dasar (warisan)" TIDAK mengisi credential sama
    // sekali, jadi menghapus guard `!connected || !wallet` tetap lolos HIJAU
    // di sana — panggilan tetap tertahan guard REGEX credential (G1), bukan
    // guard wallet yang sebenarnya diuji. Uji ini mengisi opsi DAN credential
    // valid, sehingga HANYA guard wallet yang tersisa untuk diuji.
    const onVote = vi.fn();
    const { container } = render(
      <VoteModal ballot={BALLOT} connected={false} wallet={null} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={onVote} />,
    );
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "9".repeat(64) } });
    fireEvent.click(within(container).getByText(/Generate proof & vote/));
    await kurasAsync();
    expect(kirimSuaraMock).not.toHaveBeenCalled();
    expect(onVote).not.toHaveBeenCalled();
  });

  it("menolak submit tanpa opsi TERPILIH walau wallet dan credential VALID — guard 'selected' TERISOLASI (Task 8, gerbang mutasi G14)", async () => {
    const onVote = vi.fn();
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={onVote} />,
    );
    // SENGAJA tidak mengklik satu pun .choice-row.
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "8".repeat(64) } });
    fireEvent.click(within(container).getByText(/Generate proof & vote/));
    await kurasAsync();
    expect(kirimSuaraMock).not.toHaveBeenCalled();
    expect(onVote).not.toHaveBeenCalled();
  });

  it("sukses: memanggil onVote dengan txRef dari hasil kirimSuara, txRef BUKAN null", async () => {
    kirimSuaraMock.mockResolvedValue({ txId: "tx-nyata-123", nullifierHex: "a".repeat(64) });
    const onVote = vi.fn();
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={onVote} />,
    );
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "b".repeat(64) } });
    fireEvent.click(within(container).getByText(/Generate proof & vote/));
    await waitFor(() => expect(onVote).toHaveBeenCalledWith({
      ballotId: BALLOT.id, proofStatus: "verified", nullifierStatus: "consumed", txRef: "tx-nyata-123",
    }));
    // wallet DIKIRIM UTUH ke kirimSuara sebagai parameter TERPISAH, persis
    // tanda tangan tulis.ts::kirimSuara(params, wallet).
    expect(kirimSuaraMock).toHaveBeenCalledWith(
      expect.objectContaining({ alamatBallot: BALLOT.id, credentialHex: "b".repeat(64), opsi: 0, jaringan: "preview" }),
      expect.objectContaining({ address: "mn_shield-addr_test1x-coblos" }),
    );
  });

  it("kegagalan BIASA menampilkan pesan galat, BUKAN teks 'may have already gone through'", async () => {
    kirimSuaraMock.mockRejectedValue(Object.assign(new Error("wallet menolak"), { kode: "WALLET" }));
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "c".repeat(64) } });
    fireEvent.click(within(container).getByText(/Generate proof & vote/));
    await waitFor(() => expect(screen.getByText(/wallet menolak/)).toBeTruthy());
    expect(screen.queryByText(/may have already gone through/)).toBeNull();
  });

  it("kegagalan dengan mungkinSudahMasuk menampilkan peringatan JANGAN mencoba lagi", async () => {
    kirimSuaraMock.mockRejectedValue(
      Object.assign(new Error("indexer terputus"), { kode: "TIDAK_DIKENAL", mungkinSudahMasuk: { nullifierHex: "d".repeat(64) } }),
    );
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "e".repeat(64) } });
    fireEvent.click(within(container).getByText(/Generate proof & vote/));
    await waitFor(() => expect(screen.getByText(/may have already gone through/)).toBeTruthy());
    expect(screen.getByText(/Do not vote again/)).toBeTruthy();
  });

  it('input credential punya type="password"', () => {
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("layar sukses TIDAK mengklaim tanpa syarat 'never sent as plain text' ketika proof server REMOTE", async () => {
    kirimSuaraMock.mockResolvedValue({ txId: "tx-remote-1", nullifierHex: "a".repeat(64) });
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={walletContoh()} jaringan="preview" proofStatus={REMOTE} onClose={() => {}} onVote={() => {}} />,
    );
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "f".repeat(64) } });
    fireEvent.click(within(container).getByText(/Generate proof & vote/));
    await waitFor(() => expect(container.querySelector(".success-state")).not.toBeNull());
    expect(container.textContent).not.toContain("never sent anywhere as plain text");
    expect(container.textContent).toContain("proof server operator");
  });

  it("teksTahap dipanggil lewat onStatus dan ditampilkan di layar proving", async () => {
    let kirimTahap!: (t: TahapKirimSuara) => void;
    kirimSuaraMock.mockImplementation(
      (params: { onStatus?: (t: TahapKirimSuara) => void }) =>
        new Promise(() => {
          kirimTahap = params.onStatus ?? (() => {});
          kirimTahap("membuat-proof");
        }),
    );
    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "1".repeat(64) } });
    fireEvent.click(within(container).getByText(/Generate proof & vote/));
    await waitFor(() => expect(container.textContent).toContain(teksTahap("membuat-proof")));
  });

  it("tombol unduh cadangan muncul saat onOpeningTersimpan terpanggil, dan mengunduh tanpa melempar", async () => {
    let selesaikanKirim!: (v: { txId: string; nullifierHex: string }) => void;
    kirimSuaraMock.mockImplementation(
      (params: { onOpeningTersimpan?: (c: CadanganOpening) => void }) =>
        new Promise((resolve) => {
          selesaikanKirim = resolve;
          params.onOpeningTersimpan?.({ alamatBallot: BALLOT.id, opsi: 0, saltHex: "a".repeat(64) });
        }),
    );
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    // jsdom tidak mengimplementasikan navigasi anchor sungguhan — bukan
    // urusan uji ini (yang menguji BAHWA unduhan dipicu, bukan bahwa browser
    // benar-benar berpindah halaman) — jadi .click() anchor di-noop di sini,
    // sama seperti describe("unduhCadangan") di bawah.
    const asliCreateElement = document.createElement.bind(document);
    const spyCreateElement = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = asliCreateElement(tag);
      if (tag === "a") el.click = vi.fn();
      return el;
    });

    const { container } = render(
      <VoteModal ballot={BALLOT} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "2".repeat(64) } });
    fireEvent.click(within(container).getByText(/Generate proof & vote/));

    const tombolUnduh = await screen.findByText(/Download opening backup/);
    fireEvent.click(tombolUnduh);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    selesaikanKirim({ txId: "tx-akhir", nullifierHex: "b".repeat(64) });
    spyCreateElement.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("teksTahap", () => {
  it("setiap TahapKirimSuara punya teks BERBEDA dari default, dan null memakai default", () => {
    const tahapan: TahapKirimSuara[] = [
      "menyiapkan-artefak", "membaca-eligibility", "menyusun-witness", "membuat-proof",
      "menyeimbangkan-wallet", "mengirim", "menunggu-indexer",
    ];
    const teks = new Set(tahapan.map((t) => teksTahap(t)));
    expect(teks.size).toBe(tahapan.length); // tidak ada dua tahap dengan teks sama
    expect(teksTahap(null)).not.toBe("");
    expect(teksTahap(null)).not.toBe(teksTahap("membuat-proof"));
  });
});

describe("unduhCadangan", () => {
  it("memicu unduhan lewat Blob + createObjectURL, nama berkas menyebut alamat ballot", () => {
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const klikMock = vi.fn();
    const asliCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = asliCreateElement(tag);
      if (tag === "a") el.click = klikMock;
      return el;
    });

    unduhCadangan({ alamatBallot: BALLOT.id, opsi: 1, saltHex: "c".repeat(64) });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(klikMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");

    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("VoteModal — membuka suara (bukaSuara), wallet SENGAJA terpisah dari mencoblos (Task 8, sesi ini)", () => {
  it("panel 'Open your vote' HANYA muncul saat status tally-open", () => {
    const { container: live } = render(
      <VoteModal ballot={BALLOT} connected wallet={null} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    expect(live.textContent).not.toContain("Open your vote");
    cleanup();
    const { container: tally } = render(
      <VoteModal ballot={{ ...BALLOT, status: "tally-open" }} connected wallet={null} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    expect(tally.textContent).toContain("Open your vote");
  });

  it("bawaannya TIDAK mengisi openWallet dari wallet pencoblosan — tombolnya 'Connect a wallet to open', BUKAN 'Open my vote'", () => {
    const { container } = render(
      <VoteModal
        ballot={{ ...BALLOT, status: "tally-open" }}
        connected
        wallet={walletContoh("mn_shield-addr_test1x-coblos")}
        jaringan="preview"
        proofStatus={null}
        onClose={() => {}}
        onVote={() => {}}
      />,
    );
    expect(within(container).queryByText("Open my vote")).toBeNull();
    expect(within(container).getByText(/Connect a wallet to open/)).toBeTruthy();
  });

  it("tombol 'Connect a wallet to open' memanggil onConnectOpenWallet — TIDAK PERNAH connect() sungguhan dari sini", () => {
    const onConnectOpenWallet = vi.fn();
    const { container } = render(
      <VoteModal
        ballot={{ ...BALLOT, status: "tally-open" }}
        connected
        wallet={walletContoh()}
        jaringan="preview"
        proofStatus={null}
        openWallet={null}
        onConnectOpenWallet={onConnectOpenWallet}
        onClose={() => {}}
        onVote={() => {}}
      />,
    );
    fireEvent.click(within(container).getByText(/Connect a wallet to open/));
    expect(onConnectOpenWallet).toHaveBeenCalledTimes(1);
    expect(bukaSuaraMock).not.toHaveBeenCalled();
  });

  it("bukaSuara dipanggil dengan openWallet, BUKAN dengan wallet pencoblosan — TITIK PANGGIL nyata (Task 8, mutasi wajib #3)", async () => {
    bukaSuaraMock.mockResolvedValue({ txId: "tx-buka-1", nullifierHex: "f".repeat(64) });
    const walletCoblos = walletContoh("mn_shield-addr_test1x-coblos");
    const walletBuka = walletContoh("mn_shield-addr_test1y-buka-BEDA");
    const { container } = render(
      <VoteModal
        ballot={{ ...BALLOT, status: "tally-open", votes: 3, tallied: 1 }}
        connected
        wallet={walletCoblos}
        jaringan="preview"
        proofStatus={null}
        openWallet={walletBuka}
        onClose={() => {}}
        onVote={() => {}}
      />,
    );
    fireEvent.click(within(container).getByText("Open my vote"));
    await waitFor(() => expect(bukaSuaraMock).toHaveBeenCalledTimes(1));
    expect(bukaSuaraMock).toHaveBeenCalledWith(
      expect.objectContaining({ alamatBallot: BALLOT.id, jaringan: "preview" }),
      walletBuka,
    );
    // Bukan sekadar "dipanggil dengan objek yang benar" — pastikan objek yang
    // BERBEDA (wallet pencoblosan) TIDAK PERNAH sampai ke bukaSuara.
    expect(bukaSuaraMock).not.toHaveBeenCalledWith(expect.anything(), walletCoblos);
    await waitFor(() => expect(container.textContent).toContain("Your vote is now counted."));
  });

  it("kegagalan GalatOpeningHilang menampilkan 'No opening found on this device', BUKAN pesan kegagalan generik", async () => {
    bukaSuaraMock.mockImplementation(async () => {
      const e = new Error(`Tidak ada opening tersimpan untuk ballot ${BALLOT.id} di perangkat ini.`);
      e.name = "GalatOpeningHilang";
      throw e;
    });
    const { container } = render(
      <VoteModal
        ballot={{ ...BALLOT, status: "tally-open" }}
        connected
        wallet={walletContoh()}
        jaringan="preview"
        proofStatus={null}
        openWallet={walletContoh("mn_shield-addr_test1y-buka")}
        onClose={() => {}}
        onVote={() => {}}
      />,
    );
    fireEvent.click(within(container).getByText("Open my vote"));
    await waitFor(() => expect(screen.getByText(/No opening found on this device/)).toBeTruthy());
    expect(screen.queryByText("Vote not opened")).toBeNull();
  });

  it("kegagalan biasa (bukan GalatOpeningHilang) menampilkan 'Vote not opened'", async () => {
    bukaSuaraMock.mockRejectedValue(Object.assign(new Error("wallet buka menolak"), { kode: "WALLET" }));
    const { container } = render(
      <VoteModal
        ballot={{ ...BALLOT, status: "tally-open" }}
        connected
        wallet={walletContoh()}
        jaringan="preview"
        proofStatus={null}
        openWallet={walletContoh("mn_shield-addr_test1y-buka")}
        onClose={() => {}}
        onVote={() => {}}
      />,
    );
    fireEvent.click(within(container).getByText("Open my vote"));
    await waitFor(() => expect(screen.getByText("Vote not opened")).toBeTruthy());
    expect(screen.getByText(/wallet buka menolak/)).toBeTruthy();
    expect(screen.queryByText(/No opening found on this device/)).toBeNull();
  });
});

describe("VoteModal — teks privasi JUJUR panel 'Open your vote' (FAKTA PRIVASI, Task 8 sesi ini)", () => {
  it("menyebut TEPAT bahwa chain tidak punya field payer/signer/sender — bukan klaim rahasia total", () => {
    const { container } = render(
      <VoteModal ballot={{ ...BALLOT, status: "tally-open" }} connected wallet={null} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain(
      "No payer, signer, or sender field exists on this transaction",
    );
  });

  it("menyebut bahwa membuka MELABELI opsi secara publik di indexer", () => {
    const { container } = render(
      <VoteModal ballot={{ ...BALLOT, status: "tally-open" }} connected wallet={null} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain(
      "opening labels the transaction with the option it reveals, publicly, on the indexer",
    );
  });

  it("menyebut ANGKA anonimitas sungguhan (talliedCount/voteCount) dari ballot, bukan angka dikarang", () => {
    const { container } = render(
      <VoteModal
        ballot={{ ...BALLOT, status: "tally-open", votes: 3, tallied: 1 }}
        connected wallet={null} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}}
      />,
    );
    expect(container.textContent).toContain("1 of 3 votes on this ballot have been opened so far");
  });

  it("menyebut bahwa berkas cadangan opening adalah kuitansi suara yang sempurna", () => {
    const { container } = render(
      <VoteModal ballot={{ ...BALLOT, status: "tally-open" }} connected wallet={null} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).toContain(
      "The opening backup file you downloaded when you voted is a perfect receipt of your choice",
    );
  });

  it("TIDAK PERNAH mengklaim privasi jalur Lace yang tidak terverifikasi dari pohon ini (tidak menyebut 'verified' bersama 'Lace' atau 'wallet extension')", () => {
    const { container } = render(
      <VoteModal ballot={{ ...BALLOT, status: "tally-open" }} connected wallet={null} jaringan="preview" proofStatus={LOKAL_VERIFIED} onClose={() => {}} onVote={() => {}} />,
    );
    expect(container.textContent).not.toMatch(/lace[^.]*verified/i);
    expect(container.textContent).not.toMatch(/wallet extension[^.]*verified/i);
  });
});

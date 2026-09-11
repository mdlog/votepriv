/**
 * Ditemukan lewat mutation testing (Task 8, gerbang mutasi): membalik kondisi
 * `if (nextReceipt.txRef === null)` di handleVote (Home.tsx) lolos HIJAU pada
 * seluruh uji lain di pohon ini — tidak satu pun yang benar-benar menekan
 * jalur vote sampai ke `handleVote` sambil mengamati toast mana yang dipanggil.
 * pesanSuksesVote sendiri sudah diuji sebagai fungsi murni (Home.pesan-vote.test.ts),
 * tetapi PEMANGGILAN-nya di handleVote — yang menentukan toast.info vs
 * toast.success — belum pernah ditekan. Berkas ini menutup celah itu.
 */
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProofServerStatus } from "@/lib/proof-server";
import type { DataRantai } from "@/hooks/useDataRantai";
import { ballotUji } from "@/test/fixture-ballot";

const STATUS_LOKAL: ProofServerStatus = {
  reachable: true,
  version: "8.1.0",
  target: "http://127.0.0.1:6300",
  targetTerverifikasi: true,
  reach: "lokal",
  hop: "browser → http://127.0.0.1:6300",
};

const toastInfo = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/proof-server", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/proof-server")>();
  return { ...asli, checkProofServer: async () => STATUS_LOKAL };
});

// submit() di VoteModal menolak mengirim tanpa wallet tersambung — jalur itu
// sendiri sudah diuji di VoteModal.test.tsx. Berkas ini menguji APA YANG
// TERJADI SESUDAHNYA (pilihan toast), jadi wallet dipalsukan agar tersambung
// tanpa menyentuh ekstensi sungguhan.
//
// networkId DAPAT DIUBAH per uji lewat WALLET_NETWORK_ID: guard wallet-vs-
// rantai berselisih (Home.tsx, "· wallet on {network}") hanya tercapai ketika
// wallet melaporkan jaringan yang BERBEDA dari data.jaringan.networkId
// ("preview" pada mock useDataRantai di bawah).
let WALLET_NETWORK_ID = "preview";
vi.mock("@/lib/midnight-wallet", async importAsli => {
  const asli = await importAsli<typeof import("@/lib/midnight-wallet")>();
  return {
    ...asli,
    connectMidnightWallet: async () => ({
      address: "mn_shield-addr_test1uji",
      networkId: WALLET_NETWORK_ID,
      connectorName: "uji",
      apiVersion: "1.0.0",
    }),
  };
});

const BALLOT_LIVE = ballotUji({ status: "live" });

vi.mock("@/hooks/useDataRantai", () => ({
  useDataRantai: (): DataRantai => ({
    fase: "siap",
    hasil: {
      jaringan: {
        networkId: "preview",
        indexer: "https://indexer.contoh.test/api/v3/graphql",
        indexerWS: "",
        alamatRegistry: "aabbcc",
      },
      registry: { count: 1, alamat: [BALLOT_LIVE.id], aksi: [] },
      ballot: [],
      gagal: [],
      blok: { height: 1, timestampMs: 0 },
      epoch: null,
      sekarangMs: 0,
    } as never,
    ballots: [BALLOT_LIVE],
    jaringan: {
      networkId: "preview",
      indexer: "https://indexer.contoh.test/api/v3/graphql",
      indexerWS: "",
      alamatRegistry: "aabbcc",
    },
    muatUlang: () => {},
  }),
}));

afterEach(() => {
  WALLET_NETWORK_ID = "preview";
  cleanup();
});

describe("Home.handleVote — pilihan toast setelah simulasi", () => {
  it("txRef null (SATU-SATUNYA bentuk yang terjadi hari ini) memanggil toast.info, BUKAN toast.success", async () => {
    // Timer SUNGGUHAN dipakai, bukan vi.useFakeTimers(): waitFor milik
    // testing-library memakai setTimeout/setInterval internal yang ikut
    // dibekukan fake timers, dan keduanya berebut giliran tanpa
    // vi.advanceTimersByTimeAsync — lebih sederhana menunggu jeda nyata
    // ~1.8 detik yang memang dipakai VoteModal.
    const Home = (await import("./Home")).default;
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<Home />));
    });

    const tombolWallet = container.querySelector<HTMLButtonElement>(".wallet-button")!;
    await act(async () => { tombolWallet.click(); });
    await waitFor(() => expect(tombolWallet.className).toContain("connected"));

    const tombolVote = container.querySelector<HTMLButtonElement>(".ballot-card .text-button")!;
    await act(async () => { tombolVote.click(); });
    await waitFor(() => expect(container.querySelector(".vote-modal")).not.toBeNull());

    fireEvent.click(container.querySelectorAll<HTMLElement>(".choice-row")[0]);
    fireEvent.click(within(container).getByText("Generate proof & vote"));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1900));
    });

    expect(toastInfo).toHaveBeenCalledWith("Vote simulated", expect.objectContaining({
      description: expect.stringContaining("No transaction was submitted"),
    }));
    expect(toastSuccess).not.toHaveBeenCalledWith("Vote simulated", expect.anything());
    // toast.success MEMANG dipanggil sekali untuk "Wallet connected" pada alur
    // lain — tapi TIDAK PERNAH dengan judul yang mengklaim "verified" di sini,
    // karena txRef simulasi selalu null.
    expect(toastSuccess).not.toHaveBeenCalledWith(expect.stringMatching(/verified/i), expect.anything());
  });
});

describe("Home — status jaringan wallet vs jaringan yang dibaca", () => {
  it("menyebut jaringan WALLET terpisah HANYA ketika ia berselisih dari jaringan yang dibaca", async () => {
    // Ditemukan lewat mutation testing: menghapus guard ini sama sekali lolos
    // HIJAU pada seluruh uji lain — tidak ada satu pun yang pernah
    // menyambungkan wallet dengan jaringan yang BERBEDA dari data.jaringan.
    WALLET_NETWORK_ID = "preprod";
    const Home = (await import("./Home")).default;
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<Home />));
    });
    const tombolWallet = container.querySelector<HTMLButtonElement>(".wallet-button")!;
    await act(async () => { tombolWallet.click(); });
    await waitFor(() => expect(tombolWallet.className).toContain("connected"));

    const status = container.querySelector(".network-status")!;
    expect(status.textContent).toContain("Midnight preview");
    expect(status.textContent).toContain("wallet on preprod");
  });

  it("TIDAK menyebut jaringan wallet ketika keduanya SAMA", async () => {
    WALLET_NETWORK_ID = "preview";
    const Home = (await import("./Home")).default;
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<Home />));
    });
    const tombolWallet = container.querySelector<HTMLButtonElement>(".wallet-button")!;
    await act(async () => { tombolWallet.click(); });
    await waitFor(() => expect(tombolWallet.className).toContain("connected"));

    expect(container.querySelector(".network-status")!.textContent).not.toContain("wallet on");
  });
});

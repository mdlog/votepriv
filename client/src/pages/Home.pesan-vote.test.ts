import { describe, expect, it } from "vitest";
import { pesanSuksesVote } from "./Home";
import type { JaringanAktif } from "@/lib/chain";
import type { Receipt } from "@/components/votepriv/types";

/**
 * Praperiksa P5: toast lama berbunyi "Vote verified on Midnight testnet" TANPA
 * SYARAT — kata "testnet" dikarang meski jaringan sungguhan sudah diketahui
 * dari pembacaan rantai, DAN klaim "verified" dipakai pada tanda terima yang
 * txRef-nya SELALU null hari ini (VoteModal masih simulasi murni; jalur tulis
 * adalah C-2b). Diuji sebagai fungsi murni supaya tidak perlu memata-matai
 * `<Toaster />`, yang tinggal di App.tsx dan tidak pernah tercap uji render
 * manapun di pohon ini.
 */
const JARINGAN: JaringanAktif = {
  networkId: "preview",
  indexer: "https://indexer.contoh.test/api/v3/graphql",
  indexerWS: "",
  alamatRegistry: "aabbcc",
};

function receiptUji(ubah: Partial<Receipt> = {}): Receipt {
  return { ballotId: "b1", proofStatus: "simulated", nullifierStatus: "not-consumed", txRef: null, ...ubah };
}

describe("pesanSuksesVote", () => {
  it("txRef null (SATU-SATUNYA bentuk yang benar-benar terjadi hari ini): mengaku SIMULASI, tidak mengklaim 'verified'", () => {
    const p = pesanSuksesVote(receiptUji({ txRef: null }), JARINGAN);
    expect(p.judul).toBe("Vote simulated");
    expect(p.judul).not.toMatch(/verified/i);
    expect(p.deskripsi).toContain("No transaction was submitted");
  });

  it("txRef berupa string: mengklaim 'verified' DAN menyebut jaringan SUNGGUHAN, bukan kata umum 'testnet'", () => {
    const p = pesanSuksesVote(
      receiptUji({ txRef: "0000000000000000000000000000000000000000000000000000000000000001", proofStatus: "verified" }),
      JARINGAN,
    );
    expect(p.judul).toBe("Vote verified on Midnight preview");
    expect(p.judul).not.toMatch(/testnet/i);
  });

  it("jaringan null (konfigurasi gagal) TIDAK dikarang menjadi nama jaringan apa pun", () => {
    const p = pesanSuksesVote(
      receiptUji({ txRef: "0000000000000000000000000000000000000000000000000000000000000001" }),
      null,
    );
    expect(p.judul).toBe("Vote verified on Midnight network");
    expect(p.judul).not.toMatch(/testnet|preview/i);
  });

  it("dua bentuk txRef menghasilkan judul yang BERBEDA", () => {
    const simulasi = pesanSuksesVote(receiptUji({ txRef: null }), JARINGAN);
    const sungguhan = pesanSuksesVote(receiptUji({ txRef: "tx-1", proofStatus: "verified" }), JARINGAN);
    expect(simulasi.judul).not.toBe(sungguhan.judul);
  });
});

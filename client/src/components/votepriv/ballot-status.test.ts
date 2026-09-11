import { describe, expect, it } from "vitest";
import {
  BATAS_ATAS_TUTUP_SEGERA_MS,
  ambangTutupSegeraMs,
  keadaanHasil,
  menerimaSuara,
  statusLabel,
  statusTag,
  statusTone,
  turunkanStatus,
} from "./ballot-status";
import type { BallotStatus, KeadaanHasil } from "./types";

const SEMUA: BallotStatus[] = ["live", "closing-soon", "tally-open", "awaiting-finalize", "finalized"];

const T0 = 1_000_000_000_000; // titik acuan sembarang; seluruh assert relatif terhadapnya
const seminggu = 7 * 24 * 3600 * 1000;
const menit = 60 * 1000;

/**
 * Bentuk ballot yang BENAR-BENAR ADA di preview hari ini: jendela voting ≈60
 * menit, jendela tally 35 menit. Bentuk inilah yang membunuh ambang tetap 24 jam.
 */
function ballotNyata(sisaMenitKeVoteDeadline: number) {
  const voteDeadlineMs = T0 + sisaMenitKeVoteDeadline * menit;
  return { phase: 0 as const, voteDeadlineMs, tallyDeadlineMs: voteDeadlineMs + 35 * menit };
}

describe("ambangTutupSegeraMs", () => {
  it("MENURUNKAN ambang dari jendela tally, bukan memakai 24 jam", () => {
    // Kalau ini pernah berbunyi BATAS_ATAS pada ballot 60 menit, label
    // "Live now" berhenti dapat dicapai sama sekali.
    expect(ambangTutupSegeraMs(ballotNyata(60))).toBe(35 * menit);
    expect(ambangTutupSegeraMs(ballotNyata(60))).toBeLessThan(BATAS_ATAS_TUTUP_SEGERA_MS);
  });

  it("jatuh ke batas atas pada ballot bertempo panjang", () => {
    const panjang = { voteDeadlineMs: T0 + 30 * seminggu, tallyDeadlineMs: T0 + 31 * seminggu };
    expect(ambangTutupSegeraMs(panjang)).toBe(BATAS_ATAS_TUTUP_SEGERA_MS);
  });

  it("tidak pernah negatif walau data melanggar jaminan tallyDl > voteDl", () => {
    expect(ambangTutupSegeraMs({ voteDeadlineMs: T0, tallyDeadlineMs: T0 - 1000 })).toBe(0);
  });
});

describe("turunkanStatus", () => {
  it("live ketika phase voting dan voteDeadline masih jauh", () => {
    expect(
      turunkanStatus({ phase: 0, voteDeadlineMs: T0 + seminggu, tallyDeadlineMs: T0 + 2 * seminggu }, T0),
    ).toBe("live");
  });

  it("live BENAR-BENAR TERCAPAI pada ballot 60 menit yang nyata", () => {
    // Inilah assert yang ambang tetap 24 jam gagalkan. Pada ballot dengan
    // jendela voting 60 menit dan jendela tally 35 menit, 40 menit sebelum
    // voteDeadline masih "Live now" — dengan ambang 24 jam ia "Closing soon".
    expect(turunkanStatus(ballotNyata(40), T0)).toBe("live");
    expect(turunkanStatus(ballotNyata(36), T0)).toBe("live");
  });

  it("closing-soon tepat di dalam ambang yang DITURUNKAN, live tepat di luarnya", () => {
    // Ambang diturunkan, bukan diketik: setiap ballotNyata punya jendela tally
    // 35 menit, jadi ambangnya 35 menit — dan nilai itu DIBACA dari fungsinya.
    const ambangMenit = ambangTutupSegeraMs(ballotNyata(0)) / menit;
    expect(turunkanStatus(ballotNyata(ambangMenit), T0)).toBe("closing-soon");
    expect(turunkanStatus(ballotNyata(ambangMenit + 1), T0)).toBe("live");
  });

  it("tally-open PERSIS di voteDeadline, live PERSIS satu ms sebelumnya (batas tertutup di kiri)", () => {
    // sekarangMs >= voteDeadlineMs harus SUDAH tally-open (di luar ambang closing-soon).
    const b = { phase: 0 as const, voteDeadlineMs: T0, tallyDeadlineMs: T0 + seminggu };
    expect(turunkanStatus(b, T0)).toBe("tally-open");
    expect(turunkanStatus(b, T0 - 1)).toBe("closing-soon");
  });

  it("awaiting-finalize PERSIS di tallyDeadline, tally-open PERSIS satu ms sebelumnya", () => {
    const b = { phase: 0 as const, voteDeadlineMs: T0 - seminggu, tallyDeadlineMs: T0 };
    expect(turunkanStatus(b, T0)).toBe("awaiting-finalize");
    expect(turunkanStatus(b, T0 - 1)).toBe("tally-open");
  });

  it("JEBAKAN 1: phase voting DENGAN voteDeadline lewat BUKAN live", () => {
    // Inilah keadaan yang benar-benar ada di rantai. UI lama akan berbunyi
    // "Live now" padahal castVote PASTI ditolak kontrak.
    const s = turunkanStatus(
      { phase: 0, voteDeadlineMs: T0 - 1000, tallyDeadlineMs: T0 + seminggu },
      T0,
    );
    expect(s).toBe("tally-open");
    expect(s).not.toBe("live");
    expect(menerimaSuara(s)).toBe(false);
  });

  it("JEBAKAN 1: phase voting DENGAN KEDUA deadline lewat menjadi awaiting-finalize", () => {
    const s = turunkanStatus({ phase: 0, voteDeadlineMs: T0 - 2000, tallyDeadlineMs: T0 - 1000 }, T0);
    expect(s).toBe("awaiting-finalize");
    expect(menerimaSuara(s)).toBe(false);
  });

  it("phase finalized menang atas waktu apa pun", () => {
    // finalize() hanya berhasil setelah tallyDeadline lewat, jadi kombinasi ini
    // tidak seharusnya ada di rantai; kalau toh muncul, finalitas eksplisit
    // adalah jawaban yang benar karena ia tidak pernah mundur.
    expect(
      turunkanStatus({ phase: 2, voteDeadlineMs: T0 + seminggu, tallyDeadlineMs: T0 + 2 * seminggu }, T0),
    ).toBe("finalized");
  });

  it("phase tallying di dalam jendela tally tetap tally-open", () => {
    expect(
      turunkanStatus({ phase: 1, voteDeadlineMs: T0 - 1000, tallyDeadlineMs: T0 + 1000 }, T0),
    ).toBe("tally-open");
  });

  it("phase tallying setelah tallyDeadline menjadi awaiting-finalize", () => {
    expect(
      turunkanStatus({ phase: 1, voteDeadlineMs: T0 - 2000, tallyDeadlineMs: T0 - 1000 }, T0),
    ).toBe("awaiting-finalize");
  });
});

describe("statusLabel / statusTone / statusTag", () => {
  it("memberi label berbeda untuk kelima status", () => {
    expect(new Set(SEMUA.map(statusLabel)).size).toBe(SEMUA.length);
  });

  it("memetakan SETIAP status ke label persis ini — tidak sekadar berbeda", () => {
    // Menutup pertukaran antar-label yang uniqueness-check di atas tidak
    // menangkap: menukar "Opening votes" <-> "Awaiting finalization" tetap
    // lolos uji keunikan tapi salah bagi pembaca.
    expect(statusLabel("live")).toBe("Live now");
    expect(statusLabel("closing-soon")).toBe("Closing soon");
    expect(statusLabel("tally-open")).toBe("Opening votes");
    expect(statusLabel("awaiting-finalize")).toBe("Awaiting finalization");
    expect(statusLabel("finalized")).toBe("Finalized");
  });

  it("mempertahankan ketiga label warisan apa adanya", () => {
    // Disalin dengan mata dari Home.tsx pra-pemecahan baris 131-133 lewat C-1.
    // Ketiganya teks UI Inggris dan tidak boleh berubah tanpa alasan produk.
    expect(statusLabel("live")).toBe("Live now");
    expect(statusLabel("closing-soon")).toBe("Closing soon");
    expect(statusLabel("finalized")).toBe("Finalized");
  });

  it("memakai HANYA tone yang benar-benar ada di index.css", () => {
    const tone = new Set(SEMUA.map(statusTone));
    for (const t of tone) expect(["", "closing-soon", "finalized"]).toContain(t);
  });

  it("memetakan SETIAP status ke tone persis ini", () => {
    // index.css hanya punya TIGA aturan (.status-badge dasar, .closing-soon,
    // .finalized). Membedakan HANYA lewat keanggotaan set (uji di atas) lolos
    // walau tally-open dan awaiting-finalize ditukar ke "finalized" — pin
    // persis per status menutup itu.
    expect(statusTone("live")).toBe("");
    expect(statusTone("closing-soon")).toBe("closing-soon");
    expect(statusTone("tally-open")).toBe("closing-soon");
    expect(statusTone("awaiting-finalize")).toBe("closing-soon");
    expect(statusTone("finalized")).toBe("finalized");
  });

  it("memberi tag berbeda untuk kelima status", () => {
    expect(new Set(SEMUA.map(statusTag)).size).toBe(SEMUA.length);
  });

  it("memetakan SETIAP status ke tag persis ini", () => {
    expect(statusTag("live")).toBe("Open");
    expect(statusTag("closing-soon")).toBe("Closing soon");
    expect(statusTag("tally-open")).toBe("Tally window");
    expect(statusTag("awaiting-finalize")).toBe("Needs finalizing");
    expect(statusTag("finalized")).toBe("Finalized");
  });

  it("menerimaSuara hanya benar pada dua status yang kontraknya memang menerima", () => {
    expect(SEMUA.filter(menerimaSuara)).toEqual(["live", "closing-soon"]);
  });
});

describe("keadaanHasil — JEBAKAN 4", () => {
  it("selalu ada-hasil begitu ada satu suara yang dibuka, apa pun statusnya", () => {
    for (const s of SEMUA) expect(keadaanHasil({ status: s, tallied: 1 })).toBe("ada-hasil");
  });

  it("MEMBEDAKAN keempat sebab talliedCount nol", () => {
    // Kalau keempatnya pernah runtuh jadi satu nilai, halaman Results kembali
    // berbunyi "tersegel sampai deadline" pada ballot yang deadline-nya sudah
    // sudah lewat — persis keadaan f597222d… sejak rencana ini ditulis.
    const nol = (status: BallotStatus) => keadaanHasil({ status, tallied: 0 });
    expect(nol("live")).toBe("tersegel");
    expect(nol("closing-soon")).toBe("tersegel");
    expect(nol("tally-open")).toBe("menunggu-pembukaan");
    expect(nol("awaiting-finalize")).toBe("tidak-ada-yang-dibuka");
    expect(nol("finalized")).toBe("tidak-ada-yang-dibuka");
  });

  it("TIDAK PERNAH berbunyi tersegel pada status yang voteDeadline-nya pasti sudah lewat", () => {
    // tally-open, awaiting-finalize, dan finalized semuanya hanya tercapai
    // setelah voteDeadline lewat. "Tersegel sampai vote deadline" pada ketiganya
    // adalah kalimat yang salah secara faktual, bukan sekadar kurang tepat.
    for (const s of ["tally-open", "awaiting-finalize", "finalized"] as const) {
      expect(keadaanHasil({ status: s, tallied: 0 })).not.toBe("tersegel");
    }
  });

  it("memberi keempat nilai yang mungkin, tidak ada yang tak terjangkau", () => {
    const terlihat = new Set<KeadaanHasil>();
    for (const s of SEMUA) {
      terlihat.add(keadaanHasil({ status: s, tallied: 0 }));
      terlihat.add(keadaanHasil({ status: s, tallied: 1 }));
    }
    expect(terlihat).toEqual(
      new Set<KeadaanHasil>(["ada-hasil", "tersegel", "menunggu-pembukaan", "tidak-ada-yang-dibuka"]),
    );
  });
});

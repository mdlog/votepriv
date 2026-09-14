import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegisterModal, type CadanganKredensial, uraiCadanganKredensial, unduhCadanganKredensial } from "./RegisterModal";
import { ballotUji } from "@/test/fixture-ballot";
// Lintas-paket, SENGAJA: satu-satunya cara membuktikan ekspor CLI (alur
// juri, pkgs/cli/src/ekspor-cadangan.ts) menghasilkan berkas yang BENAR-BENAR
// bisa diimpor RegisterModal adalah memanggil `uraiCadanganKredensial` ASLI
// di atas (bukan meniru validasinya) atas keluaran NYATA `eksporCadangan` —
// lihat describe "ekspor-cadangan CLI x uraiCadanganKredensial" di akhir
// berkas ini, dan .superpowers/alur-juri.md untuk latar lengkapnya. Aman
// diimpor di sini: ekspor-cadangan.ts murni Node fs/path + artefak.ts/
// config.ts (tidak menyentuh React/DOM), dan `main()`-nya dijaga
// `import.meta.main` (tidak pernah berjalan saat diimpor begini).
import { eksporCadangan } from "../../../../pkgs/cli/src/ekspor-cadangan.ts";

/**
 * Mock SATU-SATUNYA pintu jalur tulis yang RegisterModal.tsx pakai —
 * `muatJalurTulis()` dari "@/lib/chain/jalur-tulis" — pola identik dengan
 * VoteModal.test.tsx (lihat komentar di sana). Berkas uji ini BUKAN bagian
 * dari graf statis yang batas-bundel.test.ts telusuri, jadi mock di sini
 * tidak berkonsekuensi apa pun atas gerbang itu.
 */
const { daftarkanDiriSendiriMock, pulihkanKredensialDariCadanganMock } = vi.hoisted(() => ({
  daftarkanDiriSendiriMock: vi.fn(),
  pulihkanKredensialDariCadanganMock: vi.fn(),
}));
vi.mock("@/lib/chain/jalur-tulis", () => ({
  muatJalurTulis: async () => ({
    daftarkanDiriSendiri: daftarkanDiriSendiriMock,
    pulihkanKredensialDariCadangan: pulihkanKredensialDariCadanganMock,
  }),
}));

afterEach(() => {
  cleanup();
  // resetAllMocks, BUKAN clearAllMocks: clearAllMocks hanya mengosongkan
  // riwayat panggilan (mock.calls), TIDAK menghapus implementasi yang
  // disetel mockResolvedValue/mockImplementation di uji sebelumnya — celah
  // yang bisa membuat satu uji diam-diam mewarisi nilai balik uji lain lewat
  // mock yang sama (daftarkanDiriSendiriMock/pulihkanKredensialDariCadanganMock
  // dipakai ULANG di setiap `it`, bukan dibuat baru). resetAllMocks menghapus
  // keduanya, memaksa setiap uji menyetel sendiri apa yang ia butuhkan.
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

const BALLOT = ballotUji({ id: "e".repeat(64), nomor: 7, title: "Q4 Community Treasury", community: "Midnight Builders" });

function berkasDari(teks: string, nama = "cadangan.json"): File {
  return new File([teks], nama, { type: "application/json" });
}

describe("RegisterModal — keadaan memuat", () => {
  it("menampilkan keadaan memuat SEGERA saat modal dibuka, sebelum daftarkanDiriSendiri selesai", () => {
    // Promise yang SENGAJA tidak pernah resolve: uji ini hanya memeriksa
    // keadaan AWAL (mandat jalur-tulis.ts: "pemanggilnya HARUS menampilkan
    // keadaan memuat"), bukan apa yang terjadi setelah pemuatan selesai —
    // itu sudah diuji describe lain di berkas ini.
    daftarkanDiriSendiriMock.mockImplementation(() => new Promise(() => {}));
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    expect(screen.getByText("Setting up your credential")).toBeTruthy();
    // Berpasangan: keadaan SIAP (leaf) belum pernah dirender pada titik ini.
    expect(screen.queryByText(/Download credential backup/)).toBeNull();
  });
});

describe("RegisterModal — credential baru", () => {
  it("menampilkan leaf sebagai hex 64 karakter, DAN tidak menampilkan callout 'sudah ada'", async () => {
    daftarkanDiriSendiriMock.mockResolvedValue({
      credentialHex: "1".repeat(64),
      leafHex: "2".repeat(64),
      kredensialBaru: true,
    });
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("2".repeat(64))).toBeTruthy());
    // Berpasangan dengan assert positif di atas (nilai leaf sungguh muncul) —
    // bukan sekadar "kalimat X tidak muncul" yang tetap hijau bila komponen
    // gagal render sama sekali.
    expect(screen.queryByText(/You already generated a credential/)).toBeNull();
  });

  it("credentialHex TIDAK PERNAH dirender apa adanya di layar", async () => {
    const credentialRahasia = "9".repeat(64);
    daftarkanDiriSendiriMock.mockResolvedValue({
      credentialHex: credentialRahasia,
      leafHex: "3".repeat(64),
      kredensialBaru: true,
    });
    const { container } = render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("3".repeat(64))).toBeTruthy());
    expect(container.textContent).not.toContain(credentialRahasia);
  });

  it("menyalin leaf ke clipboard saat tombol salin diklik", async () => {
    daftarkanDiriSendiriMock.mockResolvedValue({
      credentialHex: "4".repeat(64),
      leafHex: "5".repeat(64),
      kredensialBaru: true,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("5".repeat(64))).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Copy leaf"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("5".repeat(64)));
  });

  it("tombol unduh memicu Blob + createObjectURL, nama berkas menyebut alamat ballot", async () => {
    daftarkanDiriSendiriMock.mockResolvedValue({
      credentialHex: "6".repeat(64),
      leafHex: "7".repeat(64),
      kredensialBaru: true,
    });
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const asliCreateElement = document.createElement.bind(document);
    let hrefUnduhan = "";
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = asliCreateElement(tag);
      if (tag === "a") {
        el.click = vi.fn();
        Object.defineProperty(el, "download", {
          set(v: string) { hrefUnduhan = v; },
          get() { return hrefUnduhan; },
        });
      }
      return el;
    });
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("7".repeat(64))).toBeTruthy());
    fireEvent.click(screen.getByText(/Download credential backup/));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect(hrefUnduhan).toBe(`votepriv-credential-${BALLOT.id.slice(0, 8)}.json`);
    spy.mockRestore();
  });
});

describe("RegisterModal — credential SUDAH ADA (guard mutasi wajib #1, sisi UI)", () => {
  it("kredensialBaru: false menampilkan callout 'sudah ada', DAN leaf yang dikembalikan tetap tampil", async () => {
    daftarkanDiriSendiriMock.mockResolvedValue({
      credentialHex: "8".repeat(64),
      leafHex: "9".repeat(64),
      kredensialBaru: false,
    });
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("9".repeat(64))).toBeTruthy());
    expect(screen.getByText(/You already generated a credential/)).toBeTruthy();
  });

  it("memanggil daftarkanDiriSendiri TEPAT SEKALI per pemasangan modal (tidak dua kali diam-diam)", async () => {
    daftarkanDiriSendiriMock.mockResolvedValue({
      credentialHex: "a".repeat(64),
      leafHex: "b".repeat(64),
      kredensialBaru: false,
    });
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("b".repeat(64))).toBeTruthy());
    expect(daftarkanDiriSendiriMock).toHaveBeenCalledTimes(1);
    expect(daftarkanDiriSendiriMock).toHaveBeenCalledWith(BALLOT.id);
  });
});

describe("RegisterModal — kegagalan", () => {
  it("menampilkan pesan galat DAN tombol Try again yang memanggil ulang daftarkanDiriSendiri", async () => {
    daftarkanDiriSendiriMock.mockRejectedValueOnce(new Error("IndexedDB diblokir"));
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("IndexedDB diblokir")).toBeTruthy());
    daftarkanDiriSendiriMock.mockResolvedValueOnce({
      credentialHex: "c".repeat(64),
      leafHex: "d".repeat(64),
      kredensialBaru: true,
    });
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getByText("d".repeat(64))).toBeTruthy());
    expect(daftarkanDiriSendiriMock).toHaveBeenCalledTimes(2);
  });
});

describe("RegisterModal — pemulihan dari berkas cadangan", () => {
  it("memulihkan credential dari berkas yang cocok dan menampilkan leaf hasil pemulihan", async () => {
    daftarkanDiriSendiriMock.mockResolvedValue({
      credentialHex: "1".repeat(64),
      leafHex: "2".repeat(64),
      kredensialBaru: true,
    });
    pulihkanKredensialDariCadanganMock.mockResolvedValue({
      credentialHex: "f".repeat(64),
      leafHex: "0".repeat(64),
      kredensialBaru: false,
    });
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("2".repeat(64))).toBeTruthy());

    const cadangan: CadanganKredensial = { alamatBallot: BALLOT.id, credentialHex: "f".repeat(64) };
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [berkasDari(JSON.stringify(cadangan))] } });

    await waitFor(() => expect(screen.getByText("0".repeat(64))).toBeTruthy());
    expect(pulihkanKredensialDariCadanganMock).toHaveBeenCalledWith(BALLOT.id, cadangan);
  });

  it("GUARD MUTASI WAJIB #3 (sisi UI) — menolak berkas cadangan ballot LAIN tanpa memanggil pulihkanKredensialDariCadangan", async () => {
    daftarkanDiriSendiriMock.mockResolvedValue({
      credentialHex: "1".repeat(64),
      leafHex: "2".repeat(64),
      kredensialBaru: true,
    });
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("2".repeat(64))).toBeTruthy());

    const cadanganBallotLain: CadanganKredensial = { alamatBallot: "z".repeat(64), credentialHex: "f".repeat(64) };
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [berkasDari(JSON.stringify(cadanganBallotLain))] } });

    await waitFor(() => expect(screen.getByText(/different ballot/)).toBeTruthy());
    expect(pulihkanKredensialDariCadanganMock).not.toHaveBeenCalled();
    // Berpasangan: leaf ASLI (bukan hasil restore) tetap tampil apa adanya.
    expect(screen.getByText("2".repeat(64))).toBeTruthy();
  });

  it("berkas yang bukan JSON valid menampilkan pesan galat pemulihan, bukan melempar tak tertangani", async () => {
    daftarkanDiriSendiriMock.mockResolvedValue({
      credentialHex: "1".repeat(64),
      leafHex: "2".repeat(64),
      kredensialBaru: true,
    });
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("2".repeat(64))).toBeTruthy());

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [berkasDari("bukan json")] } });

    await waitFor(() => expect(screen.getByText(/not valid JSON/)).toBeTruthy());
    expect(pulihkanKredensialDariCadanganMock).not.toHaveBeenCalled();
  });
});

describe("uraiCadanganKredensial / unduhCadanganKredensial — round trip (guard mutasi wajib #3)", () => {
  it("teks yang BENAR-BENAR ditulis unduhCadanganKredensial terbaca kembali PERSIS oleh uraiCadanganKredensial", () => {
    let teksDitulis = "";
    class BlobPerekam {
      constructor(parts: BlobPart[]) {
        teksDitulis = String(parts[0]);
      }
    }
    vi.stubGlobal("Blob", BlobPerekam);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    const asliCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = asliCreateElement(tag);
      if (tag === "a") el.click = vi.fn();
      return el;
    });

    const asli: CadanganKredensial = { alamatBallot: "a".repeat(64), credentialHex: "b".repeat(64) };
    unduhCadanganKredensial(asli);
    expect(teksDitulis.length).toBeGreaterThan(0);

    const dibaca = uraiCadanganKredensial(teksDitulis);
    expect(dibaca).toEqual(asli);

    spy.mockRestore();
  });

  it("uraiCadanganKredensial menormalkan huruf besar dan awalan tanpa mengubah artinya", () => {
    const dibaca = uraiCadanganKredensial(JSON.stringify({ alamatBallot: "x".repeat(64), credentialHex: "AB".repeat(32) }));
    expect(dibaca.credentialHex).toBe("ab".repeat(32));
  });

  it("uraiCadanganKredensial menolak hex yang bukan 64 karakter", () => {
    expect(() => uraiCadanganKredensial(JSON.stringify({ alamatBallot: "x".repeat(64), credentialHex: "ab" }))).toThrow();
  });
});

describe("ekspor-cadangan CLI (pkgs/cli) x uraiCadanganKredensial — round trip lintas paket (alur juri)", () => {
  // Guard mutasi wajib (a), .superpowers/alur-juri.md: ekspor CLI harus
  // menghasilkan bentuk PERSIS yang uraiCadanganKredensial (KONTRAK, tidak
  // diubah) terima — dibuktikan dengan mengimpor dan memanggil fungsi ASLI
  // itu di sini, bukan menulis ulang aturannya (64 hex, dua field bernama
  // persis alamatBallot/credentialHex).
  it("berkas yang ditulis eksporCadangan terbaca PERSIS oleh uraiCadanganKredensial ASLI, alamatBallot cocok ballot", () => {
    const dirArtefak = fs.mkdtempSync(path.join(os.tmpdir(), "votepriv-uji-artefak-juri-"));
    const dirKeluaran = fs.mkdtempSync(path.join(os.tmpdir(), "votepriv-uji-cadangan-juri-"));
    const alamatBallot = "f".repeat(64);
    const credentials = ["1".repeat(64), "2".repeat(64), "3".repeat(64)];

    // Artefak sintetis TULIS TANGAN, sengaja BUKAN lewat tulisArtefak (yang
    // hidup di pkgs/cli/src/artefak.ts — pkgs/cli sudah mengujinya sendiri di
    // artefak.test.ts): berkas ini hanya perlu berbentuk seperti yang
    // `bacaArtefak` baca kembali (JSON.parse polos), untuk menjaga uji
    // lintas-paket ini sesempit mungkin.
    fs.writeFileSync(
      path.join(dirArtefak, "test-net-juri.json"),
      JSON.stringify({ networkId: "test-net-juri", ballot: alamatBallot, credentials }),
    );

    const hasil = eksporCadangan("test-net-juri", { dirArtefak, dirKeluaran });
    expect(hasil.jumlah).toBe(3);
    expect(hasil.berkas).toHaveLength(3);

    const alamatTerbaca = new Set<string>();
    const credentialTerbaca = new Set<string>();
    for (const jalur of hasil.berkas) {
      const teks = fs.readFileSync(jalur, "utf8");
      const dibaca = uraiCadanganKredensial(teks); // FUNGSI ASLI RegisterModal.tsx — bukan tiruan
      expect(dibaca.alamatBallot).toBe(alamatBallot);
      alamatTerbaca.add(dibaca.alamatBallot);
      credentialTerbaca.add(dibaca.credentialHex);
    }
    expect(alamatTerbaca).toEqual(new Set([alamatBallot]));
    expect(credentialTerbaca).toEqual(new Set(credentials));
  });

  it("uraiCadanganKredensial ASLI menolak berkas eksporCadangan ketika dicocokkan dengan ballot LAIN — pesan 'different ballot'", () => {
    // Reproduksi guard RegisterModal.tsx.pulihkanDariBerkas: `alamatBallot !==
    // ballot.id yang sedang dibuka` ditolak. uraiCadanganKredensial sendiri
    // TIDAK memeriksa ini (itu tanggung jawab pemanggil) — uji ini karena itu
    // memeriksa bagian yang jadi tanggung jawab CLI: alamatBallot yang
    // dikembalikan uraiCadanganKredensial adalah alamat BALLOT ASLI yang
    // dipakai eksporCadangan, sehingga perbandingan `!== ballot.id lain` di
    // RegisterModal.tsx pasti berlaku benar atas keluaran CLI ini.
    const dirArtefak = fs.mkdtempSync(path.join(os.tmpdir(), "votepriv-uji-artefak-juri-"));
    const dirKeluaran = fs.mkdtempSync(path.join(os.tmpdir(), "votepriv-uji-cadangan-juri-"));
    const alamatBallotAsli = "a".repeat(64);
    fs.writeFileSync(
      path.join(dirArtefak, "test-net-juri.json"),
      JSON.stringify({ networkId: "test-net-juri", ballot: alamatBallotAsli, credentials: ["9".repeat(64)] }),
    );

    const hasil = eksporCadangan("test-net-juri", { dirArtefak, dirKeluaran });
    const dibaca = uraiCadanganKredensial(fs.readFileSync(hasil.berkas[0], "utf8"));

    const alamatBallotLain = "b".repeat(64);
    expect(dibaca.alamatBallot).not.toBe(alamatBallotLain);
    expect(dibaca.alamatBallot).toBe(alamatBallotAsli);
  });
});

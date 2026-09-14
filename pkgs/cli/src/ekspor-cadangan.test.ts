import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { tulisArtefak } from "./artefak.ts";
import {
  DIR_CADANGAN,
  cetakRingkasan,
  direktoriKeluaranBawaan,
  eksporCadangan,
  namaBerkasCadangan,
  siapkanDaftarCadangan,
} from "./ekspor-cadangan.ts";

// Seluruh uji di sini memakai direktori tmp SINTETIS (mkdtempSync) untuk
// artefak MAUPUN keluaran — tidak satu pun uji membaca atau menulis
// pkgs/cli/artefak/ atau pkgs/cli/cadangan/ sungguhan (dilarang lingkup tugas
// ini). `pnpm cli` juga tidak pernah dijalankan di sini — hanya `eksporCadangan`
// (fungsi murni-testable) yang dipanggil langsung.
const dirSementara = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const ALAMAT_BALLOT = "ab".repeat(32);
const CREDENTIALS = ["11".repeat(32), "22".repeat(32), "33".repeat(32)];

/** Artefak sintetis dengan 3 credential, ditulis lewat `tulisArtefak` ASLI (artefak.ts) — bukan JSON tangan yang bisa diam-diam menyimpang dari bentuk yang `bacaArtefak` sungguhan hasilkan. */
function artefakTigaCredential(networkId = "test-net"): { dirArtefak: string; alamatBallot: string } {
  const dirArtefak = dirSementara("votepriv-uji-artefak-");
  tulisArtefak(networkId, { ballot: ALAMAT_BALLOT, credentials: CREDENTIALS }, dirArtefak);
  return { dirArtefak, alamatBallot: ALAMAT_BALLOT };
}

describe("siapkanDaftarCadangan", () => {
  it("menyusun satu CadanganKredensial per credential, field alamatBallot sama untuk semuanya", () => {
    const daftar = siapkanDaftarCadangan({ networkId: "test-net", ballot: ALAMAT_BALLOT, credentials: CREDENTIALS });
    expect(daftar).toHaveLength(3);
    for (const c of daftar) expect(c.alamatBallot).toBe(ALAMAT_BALLOT);
    expect(daftar.map((c) => c.credentialHex)).toEqual(CREDENTIALS);
  });

  it("melempar dengan pesan yang menjelaskan MENGAPA ketika credentials tidak ada (mode pendaftaran mandiri)", () => {
    expect(() => siapkanDaftarCadangan({ networkId: "test-net", ballot: ALAMAT_BALLOT })).toThrow();
    try {
      siapkanDaftarCadangan({ networkId: "test-net", ballot: ALAMAT_BALLOT });
      throw new Error("seharusnya melempar");
    } catch (e) {
      const pesan = (e as Error).message;
      expect(pesan).toMatch(/pendaftaran MANDIRI/);
      expect(pesan).toMatch(/credential/i);
      expect(pesan).toMatch(/register-leaves/);
    }
  });

  it("credentials array KOSONG diperlakukan sama seperti tidak ada sama sekali", () => {
    expect(() => siapkanDaftarCadangan({ networkId: "test-net", ballot: ALAMAT_BALLOT, credentials: [] })).toThrow(
      /pendaftaran MANDIRI/,
    );
  });

  it("melempar pesan berbeda ketika ballot sendiri belum ada (bukan dikacaukan dengan pesan tanpa-pendaftaran)", () => {
    expect(() => siapkanDaftarCadangan({ networkId: "test-net" })).toThrow(/deploy-ballot/);
    try {
      siapkanDaftarCadangan({ networkId: "test-net" });
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).not.toMatch(/pendaftaran MANDIRI/);
    }
  });
});

describe("namaBerkasCadangan", () => {
  it("pola votepriv-credential-<8 hex alamat>-<nomor>.json", () => {
    expect(namaBerkasCadangan(ALAMAT_BALLOT, 1)).toBe(`votepriv-credential-${ALAMAT_BALLOT.slice(0, 8)}-1.json`);
    expect(namaBerkasCadangan(ALAMAT_BALLOT, 42)).toBe(`votepriv-credential-${ALAMAT_BALLOT.slice(0, 8)}-42.json`);
  });
});

describe("direktoriKeluaranBawaan", () => {
  it("pkgs/cli/cadangan/<8 hex alamat>/ ketika dirDasar tidak diberikan", () => {
    expect(direktoriKeluaranBawaan(ALAMAT_BALLOT)).toBe(path.join(DIR_CADANGAN, ALAMAT_BALLOT.slice(0, 8)));
  });

  it("bergabung dengan dirDasar kustom bila diberikan (jalur suntikan uji)", () => {
    expect(direktoriKeluaranBawaan(ALAMAT_BALLOT, "/tmp/xyz")).toBe(path.join("/tmp/xyz", ALAMAT_BALLOT.slice(0, 8)));
  });
});

describe("eksporCadangan — artefak sintetis 3 credential", () => {
  it("menulis 3 berkas; masing-masing field PERSIS {alamatBallot, credentialHex} dan alamatBallot cocok ballot", () => {
    const { dirArtefak, alamatBallot } = artefakTigaCredential();
    const dirKeluaran = dirSementara("votepriv-uji-keluaran-");

    const hasil = eksporCadangan("test-net", { dirArtefak, dirKeluaran });

    expect(hasil.jumlah).toBe(3);
    expect(hasil.berkas).toHaveLength(3);
    expect(hasil.dirTujuan).toBe(dirKeluaran);

    const isiSemua = hasil.berkas.map((jalur) => JSON.parse(fs.readFileSync(jalur, "utf8")));
    for (const isi of isiSemua) {
      expect(Object.keys(isi).sort()).toEqual(["alamatBallot", "credentialHex"]);
      expect(isi.alamatBallot).toBe(alamatBallot);
      expect(isi.credentialHex).toMatch(/^[0-9a-f]{64}$/);
    }
    // Ketiga credential sintetis muncul PERSIS SEKALI, tidak ada yang hilang/dobel.
    expect(isiSemua.map((i) => i.credentialHex).sort()).toEqual([...CREDENTIALS].sort());
  });

  it("nama berkas terurut votepriv-credential-<8hex>-1/-2/-3.json", () => {
    const { dirArtefak, alamatBallot } = artefakTigaCredential();
    const hasil = eksporCadangan("test-net", { dirArtefak, dirKeluaran: dirSementara("votepriv-uji-keluaran-") });

    expect(hasil.berkas.map((j) => path.basename(j))).toEqual([
      `votepriv-credential-${alamatBallot.slice(0, 8)}-1.json`,
      `votepriv-credential-${alamatBallot.slice(0, 8)}-2.json`,
      `votepriv-credential-${alamatBallot.slice(0, 8)}-3.json`,
    ]);
  });

  it("berkas ditulis dengan mode 0600", () => {
    const { dirArtefak } = artefakTigaCredential();
    const hasil = eksporCadangan("test-net", { dirArtefak, dirKeluaran: dirSementara("votepriv-uji-keluaran-") });

    for (const jalur of hasil.berkas) {
      const mode = fs.statSync(jalur).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it("mode tetap 0600 walau berkas SUDAH ADA sebelumnya dengan mode longgar (jalan ulang atas ballot yang sama)", () => {
    const { dirArtefak, alamatBallot } = artefakTigaCredential();
    const dirKeluaran = dirSementara("votepriv-uji-keluaran-");
    fs.mkdirSync(dirKeluaran, { recursive: true });
    const jalurLama = path.join(dirKeluaran, namaBerkasCadangan(alamatBallot, 1));
    fs.writeFileSync(jalurLama, "{}", { mode: 0o644 }); // simulasi berkas lama bermode longgar
    expect(fs.statSync(jalurLama).mode & 0o777).toBe(0o644);

    eksporCadangan("test-net", { dirArtefak, dirKeluaran });

    expect(fs.statSync(jalurLama).mode & 0o777).toBe(0o600);
  });

  it("membuat direktori keluaran bila belum ada", () => {
    const { dirArtefak } = artefakTigaCredential();
    const dirKeluaran = path.join(dirSementara("votepriv-uji-keluaran-"), "belum-ada", "lagi");
    expect(fs.existsSync(dirKeluaran)).toBe(false);

    eksporCadangan("test-net", { dirArtefak, dirKeluaran });

    expect(fs.existsSync(dirKeluaran)).toBe(true);
  });
});

describe("eksporCadangan — mode tanpa-pendaftaran (VOTEPRIV_TANPA_PENDAFTARAN=1 saat deploy-ballot)", () => {
  it("gagal dengan pesan yang dipaku (pendaftaran mandiri, tidak ada credential admin, sarankan register-leaves) — TIDAK menulis satu berkas pun", () => {
    const dirArtefak = dirSementara("votepriv-uji-artefak-");
    tulisArtefak("test-net", { ballot: ALAMAT_BALLOT }, dirArtefak); // TANPA credentials — persis artefak VOTEPRIV_TANPA_PENDAFTARAN=1
    const dirKeluaran = dirSementara("votepriv-uji-keluaran-");

    expect(() => eksporCadangan("test-net", { dirArtefak, dirKeluaran })).toThrow(/pendaftaran MANDIRI/);
    expect(fs.readdirSync(dirKeluaran)).toEqual([]);
  });
});

describe("eksporCadangan — artefak/ballot belum ada", () => {
  it("gagal jelas ketika belum ada artefak sama sekali untuk jaringan itu", () => {
    expect(() =>
      eksporCadangan("jaringan-kosong", {
        dirArtefak: dirSementara("votepriv-uji-artefak-"),
        dirKeluaran: dirSementara("votepriv-uji-keluaran-"),
      }),
    ).toThrow(/deploy-ballot/);
  });

  it("gagal jelas ketika artefak ada tapi belum ada alamat ballot (mis. baru deploy-registry)", () => {
    const dirArtefak = dirSementara("votepriv-uji-artefak-");
    tulisArtefak("test-net", { registry: "cc".repeat(32) }, dirArtefak);

    expect(() =>
      eksporCadangan("test-net", { dirArtefak, dirKeluaran: dirSementara("votepriv-uji-keluaran-") }),
    ).toThrow(/deploy-ballot/);
  });
});

describe("keamanan: credential TIDAK PERNAH tercetak (MUTASI WAJIB c)", () => {
  it("eksporCadangan + cetakRingkasan tidak pernah mencetak hex 64 karakter ke console.log — hanya nama berkas dan jumlah", () => {
    const { dirArtefak, alamatBallot } = artefakTigaCredential();
    const dirKeluaran = dirSementara("votepriv-uji-keluaran-");

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const hasil = eksporCadangan("test-net", { dirArtefak, dirKeluaran });
    cetakRingkasan(hasil);

    // Assert SEBELUM mockRestore(): mockRestore() ikut mengosongkan mock.calls.
    const gabungan = spy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(spy).toHaveBeenCalled(); // bukti uji ini bukan vakum — ringkasan sungguhan mencetak sesuatu
    expect(gabungan).toContain(String(hasil.jumlah));
    expect(gabungan).toContain(alamatBallot.slice(0, 8)); // 8 hex publik boleh, BUKAN credential
    for (const c of CREDENTIALS) expect(gabungan).not.toContain(c); // credential SUNGGUHAN, byte-demi-byte
    expect(gabungan).not.toMatch(/[0-9a-f]{64}/i); // penjaga umum: TIDAK ADA hex 64 karakter sama sekali
    spy.mockRestore();
  });

  it("eksporCadangan sendiri (tanpa cetakRingkasan) tidak memanggil console.log/console.error sama sekali", () => {
    const { dirArtefak } = artefakTigaCredential();
    const spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const spyErr = vi.spyOn(console, "error").mockImplementation(() => {});

    eksporCadangan("test-net", { dirArtefak, dirKeluaran: dirSementara("votepriv-uji-keluaran-") });

    expect(spyLog).not.toHaveBeenCalled();
    expect(spyErr).not.toHaveBeenCalled();
    spyLog.mockRestore();
    spyErr.mockRestore();
  });
});

describe("ekspor-cadangan.ts — pengkabelan (guard sumber)", () => {
  const src = fs.readFileSync(path.resolve(fileURLToPath(import.meta.url), "..", "ekspor-cadangan.ts"), "utf8");

  it("TIDAK mengimpor ./bootstrap.ts sama sekali (jadi tidak mungkin memanggil siapkanSesi) — perintah ini murni baca artefak + tulis berkas", () => {
    // Regex atas SUMBER, bukan `not.toMatch(/siapkanSesi/)` polos: komentar
    // kepala berkas ini SENGAJA menyebut nama "siapkanSesi" untuk menjelaskan
    // KENAPA ia tidak dipanggil — mengecek substring itu akan false-positive
    // pada komentarnya sendiri. Memeriksa specifier impor "./bootstrap.ts"
    // (satu-satunya modul yang mengekspor siapkanSesi) sudah cukup dan tidak
    // rentan pada komentar penjelas.
    expect(src).not.toMatch(/from\s*["']\.\/bootstrap\.ts["']/);
  });

  it("dijaga import.meta.main — main() tidak berjalan saat modul ini diimpor uji", () => {
    expect(src).toMatch(/if\s*\(\s*import\.meta\.main\s*\)/);
  });
});

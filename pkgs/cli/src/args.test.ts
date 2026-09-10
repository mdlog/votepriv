import { describe, expect, it } from "vitest";
import { caraTurunanDariArgv } from "./args.ts";

describe("caraTurunanDariArgv — bentuk yang didukung", () => {
  it("default ke pbkdf2 saat flag tidak ada", () => {
    expect(caraTurunanDariArgv([])).toBe("pbkdf2");
    expect(caraTurunanDariArgv(["preprod"])).toBe("pbkdf2");
  });

  it("membaca bentuk --seed-derivation=<metode>", () => {
    expect(caraTurunanDariArgv(["--seed-derivation=pbkdf2-32"])).toBe("pbkdf2-32");
    expect(caraTurunanDariArgv(["--seed-derivation=entropy"])).toBe("entropy");
  });

  it("membaca bentuk --seed-derivation <metode> (dipisah spasi) — I1", () => {
    // Regresi langsung dari fix round 1, I1: bentuk ini sebelumnya diam-diam
    // diabaikan sepenuhnya, tepat untuk pengguna yang butuh pbkdf2-32.
    expect(caraTurunanDariArgv(["--seed-derivation", "pbkdf2-32"])).toBe("pbkdf2-32");
    expect(caraTurunanDariArgv(["--seed-derivation", "entropy"])).toBe("entropy");
  });

  it("membaca flag di antara argumen lain, kedua bentuk", () => {
    expect(caraTurunanDariArgv(["--foo", "--seed-derivation=entropy", "--bar"])).toBe("entropy");
    expect(caraTurunanDariArgv(["--foo", "--seed-derivation", "entropy", "--bar"])).toBe("entropy");
  });
});

describe("caraTurunanDariArgv — penolakan keras (I1: silence adalah cacatnya)", () => {
  it("menolak nilai yang tidak dikenal pada bentuk =", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation=raksasa"])).toThrow(/seed-derivation/);
  });

  it("menolak nilai yang tidak dikenal pada bentuk spasi", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation", "raksasa"])).toThrow(/seed-derivation/);
  });

  it("menolak --seed-derivation tanpa nilai sama sekali (argumen terakhir)", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation"])).toThrow(/seed-derivation/);
  });

  it("menolak --seed-derivation diikuti flag lain, bukan nilai", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation", "--verbose"])).toThrow(/seed-derivation/);
  });

  it("menolak ejaan jamak --seed-derivations=<metode> (typo umum), bukan diam-diam diabaikan", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivations=pbkdf2-32"])).toThrow(/menyerupai/);
  });

  it("menolak ejaan jamak --seed-derivations <metode> (typo umum)", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivations", "pbkdf2-32"])).toThrow(/menyerupai/);
  });

  it("menolak --seed-derivation= kosong (bentuk = tanpa nilai)", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation="])).toThrow(/seed-derivation/);
  });

  it("pesan galat tidak pernah mengutip nilai mentah yang diberikan (M1)", () => {
    // Fix round 2 (test-hygiene): versi sebelumnya memakai
    // `try { fn(); throw new Error("seharusnya melempar"); } catch { ... }`
    // — pola yang lolos VAKUM kalau `fn()` berhenti melempar sama sekali,
    // karena `catch` lalu menangkap error PENGGANTI buatan sendiri dan
    // menjalankan assertion terhadap PESAN ITU (yang memang tidak memuat
    // rahasianya), bukan terhadap perilaku fn() yang sesungguhnya.
    // Diperbaiki: `expect(() => fn()).toThrow(/pola/)` gagal secara tidak-
    // vakum bila fn() berhenti melempar (assert ini sendiri akan merah),
    // BARU SETELAH ITU isi pesannya diperiksa tidak memuat rahasia.
    const rahasiaPalsu = "kata-rahasia-pengguna-yang-salah-ketik";

    expect(() => caraTurunanDariArgv(["--seed-derivation", rahasiaPalsu])).toThrow(
      /--seed-derivation harus salah satu dari/,
    );
    try {
      caraTurunanDariArgv(["--seed-derivation", rahasiaPalsu]);
    } catch (e) {
      expect((e as Error).message).not.toContain(rahasiaPalsu);
    }

    expect(() => caraTurunanDariArgv([`--seed-derivations=${rahasiaPalsu}`])).toThrow(/menyerupai/);
    try {
      caraTurunanDariArgv([`--seed-derivations=${rahasiaPalsu}`]);
    } catch (e) {
      expect((e as Error).message).not.toContain(rahasiaPalsu);
    }
  });

  it("TIDAK menolak flag lain yang tidak mirip --seed-derivation sama sekali", () => {
    expect(caraTurunanDariArgv(["--seed-derivationX-tidak-nyambung"])).toBe("pbkdf2");
    expect(caraTurunanDariArgv(["--lain-lain=pbkdf2-32"])).toBe("pbkdf2");
  });
});

describe("caraTurunanDariArgv — pemindaian SELURUH argv, bukan berhenti di kecocokan valid pertama (fix round 2)", () => {
  it("near-miss yang duduk SETELAH satu flag valid tetap ditolak keras, bukan diam-diam diabaikan", () => {
    // Regresi langsung dari laporan reviewer: sebelum fix round 2, fungsi
    // ini `return` pada kecocokan valid PERTAMA, jadi sisa argv (termasuk
    // near-miss ini) tidak pernah diperiksa — bug kelas yang sama dengan I1.
    expect(() => caraTurunanDariArgv(["--seed-derivation=pbkdf2", "--seed-derivations=entropy"])).toThrow(
      /menyerupai/,
    );
  });

  it("near-miss yang duduk SEBELUM satu flag valid juga tetap ditolak keras", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivations=entropy", "--seed-derivation=pbkdf2"])).toThrow(
      /menyerupai/,
    );
  });

  it("flag diulang dengan nilai BERBEDA ditolak keras, bukan diam-diam memenangkan kemunculan pertama", () => {
    expect(() => caraTurunanDariArgv(["--seed-derivation=pbkdf2", "--seed-derivation=entropy"])).toThrow(
      /diberikan lebih dari sekali/,
    );
    expect(() => caraTurunanDariArgv(["--seed-derivation", "pbkdf2", "--seed-derivation", "entropy"])).toThrow(
      /diberikan lebih dari sekali/,
    );
  });

  it("flag diulang dengan nilai yang SAMA PERSIS diterima (tidak ambigu, pilihan sengaja)", () => {
    expect(caraTurunanDariArgv(["--seed-derivation=pbkdf2-32", "--seed-derivation=pbkdf2-32"])).toBe("pbkdf2-32");
    expect(caraTurunanDariArgv(["--seed-derivation", "entropy", "--seed-derivation=entropy"])).toBe("entropy");
  });
});

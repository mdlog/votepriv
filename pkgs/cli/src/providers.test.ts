import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zkDir, SIRKUIT_BALLOT, SIRKUIT_REGISTRY } from "./kontrak.ts";
import { passwordStore } from "./providers.ts";

/**
 * Replika aturan validasi milik levelPrivateStateProvider 4.0.4
 * (dist/index.mjs:175-251), ditulis ulang di sini supaya uji ini gagal bila
 * pembangkit kita melanggarnya — validator aslinya tidak diekspor.
 * MIN_PASSWORD_LENGTH=16, MIN_CHARACTER_CLASSES=3, MAX_CONSECUTIVE_REPEATED=3,
 * MIN_SEQUENTIAL_LENGTH=4.
 */
function langgaranKebijakan(pw: string): string[] {
  const langgar: string[] = [];
  if (pw.length < 16) langgar.push(`panjang ${pw.length} < 16`);

  const kelas = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (kelas < 3) langgar.push(`kelas karakter ${kelas} < 3`);

  let beruntun = 1;
  for (let i = 1; i < pw.length; i++) {
    beruntun = pw[i] === pw[i - 1] ? beruntun + 1 : 1;
    if (beruntun > 3) langgar.push(`4 karakter identik beruntun di indeks ${i}`);
  }

  const kecil = pw.toLowerCase();
  for (let i = 0; i + 3 < kecil.length; i++) {
    const d = [1, 2, 3].map((k) => kecil.charCodeAt(i + k) - kecil.charCodeAt(i + k - 1));
    if (d.every((x) => x === 1) || d.every((x) => x === -1)) {
      langgar.push(`4 charCode berurutan mulai indeks ${i}: "${kecil.slice(i, i + 4)}"`);
    }
  }
  return langgar;
}

describe("passwordStore", () => {
  // Menetralkan override lingkungan. Tanpa ini, mesin yang kebetulan
  // menyetel VOTEPRIV_PRIVATE_STATE_PASSWORD membuat kedua uji pertama
  // menguji hal yang berbeda dari yang dimaksud — dan uji "berbeda antar
  // accountId" gagal, karena override memintas seluruh penurunan.
  beforeEach(() => {
    vi.stubEnv("VOTEPRIV_PRIVATE_STATE_PASSWORD", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lolos seluruh aturan kebijakan untuk 500 accountId acak", () => {
    for (let i = 0; i < 500; i++) {
      const accountId = crypto.randomBytes(32).toString("hex");
      const pw = passwordStore(accountId);
      expect(langgaranKebijakan(pw), `accountId ${accountId} menghasilkan password yang melanggar`).toEqual([]);
    }
  });

  it("deterministik per accountId dan berbeda antar accountId", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    expect(passwordStore(a)).toBe(passwordStore(a));
    expect(passwordStore(a)).not.toBe(passwordStore(b));
  });

  it("memakai VOTEPRIV_PRIVATE_STATE_PASSWORD apa adanya bila disetel", () => {
    vi.stubEnv("VOTEPRIV_PRIVATE_STATE_PASSWORD", "Qz7#mVx9Lp2$Kw4!");
    expect(passwordStore("a".repeat(64))).toBe("Qz7#mVx9Lp2$Kw4!");
    expect(passwordStore("b".repeat(64))).toBe("Qz7#mVx9Lp2$Kw4!");
  });

  it("replika kebijakan benar-benar menolak contoh yang ditolak pustaka aslinya", () => {
    expect(langgaranKebijakan("Qz7#mVx9Lp2$Kw4!")).toEqual([]); // diketahui lolos
    expect(langgaranKebijakan("abcdABCD1234!!!!").length).toBeGreaterThan(0);
    expect(langgaranKebijakan("Qz7#mVx9Lp2$Kw")).toContain("panjang 14 < 16");
  });
});

describe("zkDir", () => {
  it("menunjuk direktori yang memuat keys/ dan zkir/ untuk kedua kontrak", () => {
    for (const [nama, sirkuit] of [
      ["ballot", SIRKUIT_BALLOT],
      ["registry", SIRKUIT_REGISTRY],
    ] as const) {
      const dir = zkDir(nama);
      expect(fs.existsSync(path.join(dir, "keys")), `${dir}/keys tidak ada`).toBe(true);
      expect(fs.existsSync(path.join(dir, "zkir")), `${dir}/zkir tidak ada`).toBe(true);
      for (const id of sirkuit) {
        expect(fs.existsSync(path.join(dir, "keys", `${id}.prover`)), `${id}.prover hilang`).toBe(true);
        expect(fs.existsSync(path.join(dir, "keys", `${id}.verifier`)), `${id}.verifier hilang`).toBe(true);
        // Ekstensi yang dibaca provider adalah .bzkir, bukan .zkir.
        expect(fs.existsSync(path.join(dir, "zkir", `${id}.bzkir`)), `${id}.bzkir hilang`).toBe(true);
      }
    }
  });
});

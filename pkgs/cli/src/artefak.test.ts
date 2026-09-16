import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bacaArtefak, pastikanAlamatKontrak, tulisArtefak } from "./artefak.ts";

const dirSementara = () => fs.mkdtempSync(path.join(os.tmpdir(), "votepriv-artefak-"));

describe("pastikanAlamatKontrak", () => {
  it("menerima 64 hex huruf kecil", () => {
    const a = "ab".repeat(32);
    expect(pastikanAlamatKontrak(a)).toBe(a);
  });

  it("menolak awalan 0x, panjang salah, dan huruf besar", () => {
    expect(() => pastikanAlamatKontrak(`0x${"ab".repeat(32)}`)).toThrow(/64 (lowercase )?hexadecimal characters/);
    expect(() => pastikanAlamatKontrak("ab".repeat(31))).toThrow(/64 (lowercase )?hexadecimal characters/);
    expect(() => pastikanAlamatKontrak("AB".repeat(32))).toThrow(/64 (lowercase )?hexadecimal characters/);
  });
});

describe("tulisArtefak", () => {
  it("menggabungkan, tidak menimpa entri sebelumnya", () => {
    const dir = dirSementara();
    tulisArtefak("preview", { registry: "aa".repeat(32) }, dir);
    tulisArtefak("preview", { ballot: "bb".repeat(32), voteDeadline: "1757000000" }, dir);

    const hasil = bacaArtefak("preview", dir);
    expect(hasil?.registry).toBe("aa".repeat(32));
    expect(hasil?.ballot).toBe("bb".repeat(32));
    expect(hasil?.voteDeadline).toBe("1757000000");
    expect(hasil?.networkId).toBe("preview");
  });

  it("mengembalikan null bila belum ada artefak", () => {
    expect(bacaArtefak("preview", dirSementara())).toBeNull();
  });

  it("membuat direktori tujuan bila belum ada (jalur berjalan pertama kali)", () => {
    // Kedua uji di atas memakai dirSementara(), yang SUDAH dibuat mkdtempSync
    // — mkdirSync di tulisArtefak jadi no-op di sana dan tidak pernah teruji.
    // Di sini direktorinya sengaja belum ada sama sekali, meniru
    // pkgs/cli/artefak/ pada checkout baru.
    const dir = path.join(dirSementara(), "belum-ada", "lagi");
    expect(fs.existsSync(dir)).toBe(false);

    tulisArtefak("preview", { registry: "cc".repeat(32) }, dir);

    expect(fs.existsSync(dir)).toBe(true);
    expect(bacaArtefak("preview", dir)?.registry).toBe("cc".repeat(32));
  });

  // Regresi Fix 1 (ronde review seluruh cabang): sebelum ArtefakDeploy.e2e
  // ada, deploy-ballot.ts dan e2e.ts menulis ballot/voteDeadline/
  // tallyDeadline/options/credentials ke field TOP-LEVEL YANG SAMA.
  // tulisArtefak menggabungkan per-PANGGILAN (spread objek), bukan per-
  // field secara cerdas, jadi panggilan kedua menimpa kelima field itu
  // sekaligus — menjalankan `pnpm cli e2e` setelah `pnpm cli deploy-ballot`
  // menghancurkan ballot yang deploy-ballot sudah bayar dan daftarkan tiga
  // pemilihnya, karena credential-nya HANYA hidup di berkas artefak ini.
  it("field ballot e2e (di bawah `e2e`) tidak pernah menimpa field ballot top-level milik deploy-ballot, atau sebaliknya", () => {
    const dir = dirSementara();

    // Urutan operasi sungguhan: `pnpm cli deploy-ballot` dulu, lalu `pnpm cli e2e`.
    tulisArtefak(
      "preview",
      {
        ballot: "bb".repeat(32),
        voteDeadline: "1000",
        tallyDeadline: "2000",
        options: ["opsi deploy-ballot A", "opsi deploy-ballot B"],
        credentials: ["c1".repeat(32), "c2".repeat(32), "c3".repeat(32)],
      },
      dir,
    );
    tulisArtefak(
      "preview",
      {
        e2e: {
          ballot: "ee".repeat(32),
          voteDeadline: "9000",
          tallyDeadline: "9500",
          options: ["opsi e2e A", "opsi e2e B", "opsi e2e C"],
          credentials: ["d1".repeat(32), "d2".repeat(32), "d3".repeat(32)],
        },
      },
      dir,
    );

    const hasil = bacaArtefak("preview", dir);

    // Milik deploy-ballot (top-level) HARUS TETAP seperti panggilan pertama.
    expect(hasil?.ballot).toBe("bb".repeat(32));
    expect(hasil?.voteDeadline).toBe("1000");
    expect(hasil?.tallyDeadline).toBe("2000");
    expect(hasil?.options).toEqual(["opsi deploy-ballot A", "opsi deploy-ballot B"]);
    expect(hasil?.credentials).toEqual(["c1".repeat(32), "c2".repeat(32), "c3".repeat(32)]);

    // Milik e2e tersimpan UTUH di namespace-nya sendiri.
    expect(hasil?.e2e?.ballot).toBe("ee".repeat(32));
    expect(hasil?.e2e?.voteDeadline).toBe("9000");
    expect(hasil?.e2e?.tallyDeadline).toBe("9500");
    expect(hasil?.e2e?.options).toEqual(["opsi e2e A", "opsi e2e B", "opsi e2e C"]);
    expect(hasil?.e2e?.credentials).toEqual(["d1".repeat(32), "d2".repeat(32), "d3".repeat(32)]);
  });

  // Regresi kejadian lapangan: VOTEPRIV_TANPA_PENDAFTARAN=1 +
  // VOTEPRIV_DEPLOY_ULANG=1 men-deploy ballot BARU tanpa credential, tapi
  // artefak sesudahnya tetap memuat tiga `credentials` milik ballot LAMA —
  // sidik jarinya identik dengan yang lama, jadi bukan credential baru.
  // Sebabnya: merge tulisArtefak per-PANGGILAN (di atas) tidak membedakan
  // "field milik ballot" dari "field lintas-ballot" — tidak menyebut
  // `credentials` di panggilan baru berarti `credentials` LAMA bertahan.
  describe("field milik-ballot (credentials/voteDeadline/tallyDeadline/options) saat ballot BERGANTI", () => {
    it("TIDAK ikut ke ballot baru walau panggilan baru tidak menyebutnya — deteksi via `in`, bukan cuma `undefined`", () => {
      const dir = dirSementara();
      tulisArtefak(
        "preview",
        {
          ballot: "aa".repeat(32),
          voteDeadline: "1000",
          tallyDeadline: "2000",
          options: ["opsi lama A", "opsi lama B"],
          credentials: ["c1".repeat(32), "c2".repeat(32), "c3".repeat(32)],
        },
        dir,
      );

      // Ballot BARU (redeploy), TIDAK menyebut credentials/deadline/options
      // sama sekali — persis pola VOTEPRIV_TANPA_PENDAFTARAN=1.
      const hasil = tulisArtefak("preview", { ballot: "bb".repeat(32) }, dir);

      expect(hasil.ballot).toBe("bb".repeat(32));
      expect("credentials" in hasil).toBe(false);
      expect("voteDeadline" in hasil).toBe(false);
      expect("tallyDeadline" in hasil).toBe(false);
      expect("options" in hasil).toBe(false);
    });

    it("registry TETAP bertahan lintas pergantian ballot (itu alasan merge ada — perbaikan field milik-ballot tidak boleh merusaknya)", () => {
      const dir = dirSementara();
      tulisArtefak("preview", { registry: "aa".repeat(32), ballot: "bb".repeat(32) }, dir);

      const hasil = tulisArtefak("preview", { ballot: "cc".repeat(32) }, dir);

      expect(hasil.registry).toBe("aa".repeat(32));
      expect(hasil.ballot).toBe("cc".repeat(32));
    });

    it("ballot SAMA: perilaku merge lama dipertahankan — credentials ballot yang sedang aktif tidak terhapus hanya karena satu panggilan tidak menyebutnya", () => {
      const dir = dirSementara();
      tulisArtefak(
        "preview",
        {
          ballot: "aa".repeat(32),
          credentials: ["c1".repeat(32), "c2".repeat(32), "c3".repeat(32)],
        },
        dir,
      );

      // Ballot SAMA persis — mis. panggilan lain yang cuma memperbarui registry.
      const hasil = tulisArtefak("preview", { ballot: "aa".repeat(32), registry: "ff".repeat(32) }, dir);

      expect(hasil.credentials).toEqual(["c1".repeat(32), "c2".repeat(32), "c3".repeat(32)]);
      expect(hasil.registry).toBe("ff".repeat(32));
    });
  });
});

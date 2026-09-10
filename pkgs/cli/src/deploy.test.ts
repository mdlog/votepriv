import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { batchDaun, deployBallot, deployRegistry, validasiMetadata } from "./deploy.ts";
import type { ProvidersBallot, ProvidersRegistry } from "./providers.ts";
import { BATAS_MS } from "./tunggu.ts";

// Logger palsu: uji ini tidak boleh menulis apa pun ke berkas log.
const logPalsu = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;

describe("deployRegistry", () => {
  // Menjaga regresi yang sudah pernah terjadi sekali di draf awal rencana
  // ini: menghapus `denganBatasWaktu(...)` dari sekeliling `deployFn(...)`.
  // tsc tidak menangkapnya (pembungkus itu transparan pada tipe kembalian),
  // jadi hanya uji ini yang berdiri di antara regresi itu dan CLI yang diam
  // selamanya bila transaksi deploy ditolak konsensus.
  it("menolak dengan pesan batas waktu bila deployContract tidak pernah selesai", async () => {
    vi.useFakeTimers();
    try {
      const takPernahSelesai = () => new Promise<never>(() => {});
      const janji = deployRegistry({} as unknown as ProvidersRegistry, logPalsu, takPernahSelesai);
      // Perlu di-attach SEBELUM memajukan jam palsu, supaya rejection tidak
      // pernah menjadi "unhandled" di antara advance dan await.
      const ekspektasi = expect(janji).rejects.toThrow(/tidak selesai dalam/);
      await vi.advanceTimersByTimeAsync(BATAS_MS.deploy);
      await ekspektasi;
    } finally {
      vi.useRealTimers();
    }
  });
});

const daun = (isi: number) => new Uint8Array(32).fill(isi);

const metaSah = () => ({
  title: "Q4 Community Treasury",
  description: "Pilih arah dukungan treasury pada Q4.",
  community: "Midnight Builders",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  voteDeadline: 1_800_000_000n,
  tallyDeadline: 1_800_001_200n,
  quorumPercent: 60,
  eligibleCount: 3,
  eligibilityPolicy: "Tiga credential uji end-to-end",
});

describe("validasiMetadata", () => {
  it("menerima metadata yang memenuhi keempat batas kontrak", () => {
    expect(() => validasiMetadata(metaSah())).not.toThrow();
  });

  it("menolak jumlah opsi di luar 2..4", () => {
    expect(() => validasiMetadata({ ...metaSah(), options: ["Cuma satu"] })).toThrow(/2 sampai 4/);
    expect(() => validasiMetadata({ ...metaSah(), options: ["a", "b", "c", "d", "e"] })).toThrow(/2 sampai 4/);
  });

  it("menolak tallyDeadline yang tidak lebih besar dari voteDeadline", () => {
    expect(() => validasiMetadata({ ...metaSah(), tallyDeadline: 1_800_000_000n })).toThrow(/setelah batas waktu pemungutan suara/);
    expect(() => validasiMetadata({ ...metaSah(), tallyDeadline: 1_799_999_999n })).toThrow(/setelah batas waktu pemungutan suara/);
  });

  it("menolak eligibleCount nol atau di atas 1024", () => {
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 0 })).toThrow(/minimal 1/);
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 1025 })).toThrow(/1024/);
  });

  it("menolak quorumPercent di atas 100", () => {
    expect(() => validasiMetadata({ ...metaSah(), quorumPercent: 101 })).toThrow(/100/);
  });

  it("menolak deadline yang terlihat seperti milidetik", () => {
    // Date.now() mentah ~1.75e12; detik ~1.75e9. Kontrak akan menerimanya dan
    // menghasilkan ballot yang deadline-nya tidak pernah tiba.
    expect(() =>
      validasiMetadata({ ...metaSah(), voteDeadline: 1_757_000_000_000n, tallyDeadline: 1_757_000_060_000n }),
    ).toThrow(/DETIK/);
  });

  it("menolak eligibleCount yang lebih kecil dari jumlah credential yang akan didaftarkan", () => {
    // Argumen kedua opsional: jumlah credential yang akan didaftarkan.
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 2 }, 3)).toThrow(/eligibleCount/);
  });

  // optionCount di-seal terpisah dari label opsi: tanpa guard ini, nOptions=4
  // dengan o2/o3 kosong lolos ke kontrak dan castVote mengizinkan opsi tanpa
  // label. Guard ini TIDAK ditegakkan kontrak — murni pagar CLI.
  it("menolak label opsi yang kosong atau hanya spasi", () => {
    expect(() => validasiMetadata({ ...metaSah(), options: ["Opsi A", "  ", "Opsi C"] })).toThrow(/tidak boleh kosong/);
  });
});

describe("batchDaun", () => {
  it("mengisi tepat delapan slot walau daunnya tiga", () => {
    const b = batchDaun([daun(1), daun(2), daun(3)]);
    expect(b).toHaveLength(1);
    expect(b[0].n).toBe(3n);
    expect(b[0].leaves).toHaveLength(8);
    expect(b[0].leaves.every((d) => d.length === 32)).toBe(true);
    expect([...b[0].leaves[3]]).toEqual([...new Uint8Array(32)]); // padding nol
  });

  it("memecah sembilan daun jadi batch 8 dan 1", () => {
    const b = batchDaun(Array.from({ length: 9 }, (_, i) => daun(i + 1)));
    expect(b.map((x) => x.n)).toEqual([8n, 1n]);
    expect(b.every((x) => x.leaves.length === 8)).toBe(true);
  });

  it("menolak daun yang bukan 32 byte dan daftar kosong", () => {
    expect(() => batchDaun([new Uint8Array(31)])).toThrow(/32 byte/);
    expect(() => batchDaun([])).toThrow(/Tidak ada daun/);
  });
});

describe("deployBallot", () => {
  // Kedua uji ini bergantung pada urutan pemeriksaan di dalam deployBallot:
  // panjang rahasiaAdmin/nonce diperiksa SEBELUM providers pernah disentuh,
  // sehingga providers palsu ({}) cukup — kegagalan tidak pernah sampai ke
  // deployContract/jaringan.
  it("menolak rahasiaAdmin yang bukan 32 byte sebelum menyentuh providers", async () => {
    await expect(
      deployBallot({} as unknown as ProvidersBallot, metaSah(), new Uint8Array(31), new Uint8Array(32), logPalsu),
    ).rejects.toThrow(/Kunci rahasia admin harus 32 byte/);
  });

  it("menolak ballotNonce yang bukan 32 byte sebelum menyentuh providers", async () => {
    await expect(
      deployBallot({} as unknown as ProvidersBallot, metaSah(), new Uint8Array(32), new Uint8Array(31), logPalsu),
    ).rejects.toThrow(/ballotNonce harus 32 byte/);
  });
});

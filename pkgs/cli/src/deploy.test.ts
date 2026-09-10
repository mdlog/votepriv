import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import {
  batchDaun,
  catatKeRegistry,
  daftarkanVoter,
  deployBallot,
  deployRegistry,
  kunciAdmin,
  validasiMetadata,
} from "./deploy.ts";
import type { BallotC, RegistryC } from "./kontrak.ts";
import type { ProvidersBallot, ProvidersRegistry } from "./providers.ts";
import { BATAS_MS } from "./tunggu.ts";
import type { KonteksWallet } from "./wallet.ts";

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

  // Tanpa guard ini, quorumPercent/eligibleCount pecahan lolos validasi lalu
  // mati di BigInt(...) milik deployBallot dengan RangeError native, bukan
  // pesan yang menyebut field-nya — persis kelas kegagalan yang fungsi ini
  // dibuat untuk mencegah, hanya pindah satu langkah lebih dalam.
  it("menolak quorumPercent yang bukan bilangan bulat", () => {
    expect(() => validasiMetadata({ ...metaSah(), quorumPercent: 60.5 })).toThrow(/bilangan bulat/);
  });

  it("menolak quorumPercent negatif", () => {
    expect(() => validasiMetadata({ ...metaSah(), quorumPercent: -1 })).toThrow(/negatif/);
  });

  it("menolak eligibleCount yang bukan bilangan bulat", () => {
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 2.5 })).toThrow(/bilangan bulat/);
  });

  // 1_000_000_000n (September 2001) aman selalu di masa lalu terlepas kapan
  // uji ini dijalankan, dan di bawah AMBANG_MILIDETIK sehingga guard
  // milidetik tidak ikut memicu duluan.
  it("menolak voteDeadline yang sudah lewat", () => {
    expect(() => validasiMetadata({ ...metaSah(), voteDeadline: 1_000_000_000n })).toThrow(/sudah lewat/);
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

  // Sama seperti uji regresi deployRegistry di atas, dan untuk kerawanan yang
  // sama persis: menghapus `denganBatasWaktu(...)` dari sekeliling
  // `deployFn(...)` di deployBallot tidak digagalkan tsc (pembungkus itu
  // transparan pada tipe kembalian). Butuh argumen ketujuh (deployFn) karena
  // deployBallot tidak punya seam lain untuk menyuntikkan deployContract palsu.
  it("menolak dengan pesan batas waktu bila deployContract(ballot) tidak pernah selesai", async () => {
    vi.useFakeTimers();
    try {
      const takPernahSelesai = () => new Promise<never>(() => {});
      const janji = deployBallot(
        {} as unknown as ProvidersBallot,
        metaSah(),
        new Uint8Array(32),
        new Uint8Array(32),
        logPalsu,
        undefined,
        takPernahSelesai,
      );
      const ekspektasi = expect(janji).rejects.toThrow(/tidak selesai dalam/);
      await vi.advanceTimersByTimeAsync(BATAS_MS.deploy);
      await ekspektasi;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("daftarkanVoter", () => {
  // Sama seperti deployBallot di atas: menghapus denganBatasWaktu di sekeliling
  // registerVoters tidak digagalkan tsc. daftarkanVoter menerima handle
  // kontrak sebagai parameter, jadi tidak perlu seam baru — stub callTx yang
  // tidak pernah selesai sudah cukup.
  it("menolak dengan pesan batas waktu bila callTx.registerVoters tidak pernah selesai", async () => {
    vi.useFakeTimers();
    try {
      const ballotPalsu = {
        callTx: { registerVoters: () => new Promise<never>(() => {}) },
      } as unknown as FoundContract<BallotC>;
      const janji = daftarkanVoter(ballotPalsu, [daun(1)], logPalsu);
      const ekspektasi = expect(janji).rejects.toThrow(/tidak selesai dalam/);
      await vi.advanceTimersByTimeAsync(BATAS_MS.panggilBerat);
      await ekspektasi;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("catatKeRegistry", () => {
  it("menolak dengan pesan batas waktu bila callTx.register tidak pernah selesai", async () => {
    vi.useFakeTimers();
    try {
      const registryPalsu = {
        callTx: { register: () => new Promise<never>(() => {}) },
      } as unknown as FoundContract<RegistryC>;
      const janji = catatKeRegistry(registryPalsu, "a".repeat(64), logPalsu);
      const ekspektasi = expect(janji).rejects.toThrow(/tidak selesai dalam/);
      await vi.advanceTimersByTimeAsync(BATAS_MS.panggilRingan);
      await ekspektasi;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("kunciAdmin", () => {
  // Vektor beku: rahasia TETAP (32 byte 0x11 berulang — bukan seed nyata,
  // tidak pernah dipakai untuk apa pun selain uji ini), dihitung independen
  // di luar kode produksi (Python hashlib, dicatat di laporan fix round) dari
  // sha256("votepriv:admin:v1" || rahasia). Mengubah pemisah domain ATAU
  // urutan pemanggilan .update() mengubah nilai ini — uji ini dirancang untuk
  // gagal nyaring pada keduanya, karena kesalahan itu sendiri TIDAK
  // menghasilkan galat di titik deploy: ia hanya membuat registerVoters
  // ditolak selamanya pada ballot yang sudah ter-deploy dan sudah dibayar.
  it("menghasilkan vektor tetap untuk rahasia tetap (mendeteksi perubahan pemisah domain/urutan hash)", () => {
    const rahasiaTetap = new Uint8Array(32).fill(0x11);
    const ctxPalsu = {
      unshieldedKeystore: { getSecretKey: () => Buffer.from(rahasiaTetap) },
    } as unknown as KonteksWallet;

    const hasil = kunciAdmin(ctxPalsu);

    expect(hasil).toHaveLength(32);
    expect(Buffer.from(hasil).toString("hex")).toBe(
      "81e85ff243ac0942d74f28a4aa6637b5e6de0e707fa2ee08e529c4dc935efef6",
    );
  });
});

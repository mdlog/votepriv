import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import {
  ballotSudahTercatat,
  batchDaun,
  catatKeRegistry,
  daftarkanVoter,
  deployBallot,
  deployRegistry,
  kunciAdmin,
  registerVotersMendarat,
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
      const ekspektasi = expect(janji).rejects.toThrow(/did not finish within/);
      await vi.advanceTimersByTimeAsync(BATAS_MS.deploy);
      await ekspektasi;
    } finally {
      vi.useRealTimers();
    }
  });

  // Retri (lihat OpsiRetriDeploy/sudahMendaratDeploy): deployFn dipanggil
  // KEDUA kalinya (bukan objek DeployedContract sungguhan yang dikonstruksi —
  // percobaan kedua sengaja gagal juga, dengan galat LAIN yang khas, supaya
  // uji ini membuktikan "diulang" murni dari JUMLAH pemanggilan dan identitas
  // galat akhir, tanpa perlu memalsukan bentuk DeployedContract<RegistryC>
  // yang sesungguhnya).
  it("putus koneksi + DUST tidak turun: mengulang (deployFn terpanggil dua kali)", async () => {
    let panggilan = 0;
    const dustPerPanggilan = [500n, 500n]; // tidak turun sama sekali
    let bacaDustKe = 0;
    const deployFnPalsu = async () => {
      panggilan += 1;
      if (panggilan === 1) throw galatPutusKoneksi();
      throw new Error("percobaan-2 sengaja gagal (uji retri)");
    };
    const bacaDust = async () => {
      const v = dustPerPanggilan[bacaDustKe] ?? 500n;
      bacaDustKe += 1;
      return v;
    };

    await expect(
      deployRegistry({} as unknown as ProvidersRegistry, logPalsu, deployFnPalsu, { bacaDust, jedaMs: 1 }),
    ).rejects.toThrow(/percobaan-2 sengaja gagal/);
    expect(panggilan).toBe(2);
  });

  it("putus koneksi + DUST TURUN: berhenti (tidakPasti), TIDAK mengulang — mencegah deploy KEDUA", async () => {
    let panggilan = 0;
    const dustPerPanggilan = [500n, 300n]; // turun — kemungkinan biaya terpakai
    let bacaDustKe = 0;
    const deployFnPalsu = async () => {
      panggilan += 1;
      throw galatPutusKoneksi();
    };
    const bacaDust = async () => {
      const v = dustPerPanggilan[bacaDustKe] ?? 300n;
      bacaDustKe += 1;
      return v;
    };

    await expect(
      deployRegistry({} as unknown as ProvidersRegistry, logPalsu, deployFnPalsu, { bacaDust, jedaMs: 1 }),
    ).rejects.toThrow(/cannot be determined/);
    expect(panggilan).toBe(1);
  });

  it("putus koneksi TANPA bacaDust: berhenti (tidakPasti) pada percobaan pertama", async () => {
    let panggilan = 0;
    const deployFnPalsu = async () => {
      panggilan += 1;
      throw galatPutusKoneksi();
    };

    await expect(
      deployRegistry({} as unknown as ProvidersRegistry, logPalsu, deployFnPalsu, { jedaMs: 1 }),
    ).rejects.toThrow(/cannot be determined/);
    expect(panggilan).toBe(1);
  });

  it("penolakan rantai TIDAK diulang walau bacaDust diberikan", async () => {
    let panggilan = 0;
    const deployFnPalsu = async () => {
      panggilan += 1;
      throw new Error('failed assert: "Option count must be between 2 and 4"');
    };

    await expect(
      deployRegistry({} as unknown as ProvidersRegistry, logPalsu, deployFnPalsu, {
        bacaDust: async () => 500n,
        jedaMs: 1,
      }),
    ).rejects.toThrow(/Option count must be between 2 and 4/);
    expect(panggilan).toBe(1);
  });
});

/**
 * Bentuk galat putus koneksi persis yang dilaporkan di lapangan — lihat
 * .superpowers/retry-submit-cli.md.
 */
function galatPutusKoneksi(): Error {
  const penyebab = new Error("disconnected from wss://rpc.preview.midnight.network/: 1000:: Normal Closure");
  const e = new Error("Transaction submission failed", { cause: penyebab });
  e.name = "SubmissionError";
  return e;
}

const daun = (isi: number) => new Uint8Array(32).fill(isi);

// Bahasa Inggris dengan sengaja (bukan sekadar "metadata sah"): sejak
// deployBallot memanggil validasiBahasaMetadata (gerbang bahasa, paket
// shared — lihat .superpowers/audit-bahasa-metadata.md), fixture yang dulu
// Indonesia di sini akan ditolak gerbang itu SEBELUM sempat mencapai
// perilaku yang sesungguhnya diuji tiap `it` di bawah (timeout, retri, dst.)
// — persis kelas kebocoran bahasa yang audit itu tutup, hanya kali ini di
// fixture uji, bukan di ballot yang benar-benar ter-deploy.
const metaSah = () => ({
  title: "Q4 Community Treasury",
  description: "Choose the treasury's direction of support for Q4.",
  community: "Midnight Builders",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  voteDeadline: 1_800_000_000n,
  tallyDeadline: 1_800_001_200n,
  quorumPercent: 60,
  eligibleCount: 3,
  eligibilityPolicy: "Three test credentials issued by the organiser.",
});

describe("validasiMetadata", () => {
  it("menerima metadata yang memenuhi keempat batas kontrak", () => {
    expect(() => validasiMetadata(metaSah())).not.toThrow();
  });

  it("menolak jumlah opsi di luar 2..4", () => {
    expect(() => validasiMetadata({ ...metaSah(), options: ["Cuma satu"] })).toThrow(/2 to 4 options/);
    expect(() => validasiMetadata({ ...metaSah(), options: ["a", "b", "c", "d", "e"] })).toThrow(/2 to 4 options/);
  });

  it("menolak tallyDeadline yang tidak lebih besar dari voteDeadline", () => {
    expect(() => validasiMetadata({ ...metaSah(), tallyDeadline: 1_800_000_000n })).toThrow(/must be after the vote deadline/);
    expect(() => validasiMetadata({ ...metaSah(), tallyDeadline: 1_799_999_999n })).toThrow(/must be after the vote deadline/);
  });

  it("menolak eligibleCount nol atau di atas 1024", () => {
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 0 })).toThrow(/at least 1/);
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
    ).toThrow(/SECONDS/);
  });

  it("menolak eligibleCount yang lebih kecil dari jumlah credential yang akan didaftarkan", () => {
    // Argumen kedua opsional: jumlah credential yang akan didaftarkan.
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 2 }, 3)).toThrow(/eligibleCount/);
  });

  // optionCount di-seal terpisah dari label opsi: tanpa guard ini, nOptions=4
  // dengan o2/o3 kosong lolos ke kontrak dan castVote mengizinkan opsi tanpa
  // label. Guard ini TIDAK ditegakkan kontrak — murni pagar CLI.
  it("menolak label opsi yang kosong atau hanya spasi", () => {
    expect(() => validasiMetadata({ ...metaSah(), options: ["Opsi A", "  ", "Opsi C"] })).toThrow(/must not be empty/);
  });

  // Tanpa guard ini, quorumPercent/eligibleCount pecahan lolos validasi lalu
  // mati di BigInt(...) milik deployBallot dengan RangeError native, bukan
  // pesan yang menyebut field-nya — persis kelas kegagalan yang fungsi ini
  // dibuat untuk mencegah, hanya pindah satu langkah lebih dalam.
  it("menolak quorumPercent yang bukan bilangan bulat", () => {
    expect(() => validasiMetadata({ ...metaSah(), quorumPercent: 60.5 })).toThrow(/must be an? (positive )?integer/);
  });

  it("menolak quorumPercent negatif", () => {
    expect(() => validasiMetadata({ ...metaSah(), quorumPercent: -1 })).toThrow(/must not be negative/);
  });

  it("menolak eligibleCount yang bukan bilangan bulat", () => {
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 2.5 })).toThrow(/must be an? (positive )?integer/);
  });

  // 1_000_000_000n (September 2001) aman selalu di masa lalu terlepas kapan
  // uji ini dijalankan, dan di bawah AMBANG_MILIDETIK sehingga guard
  // milidetik tidak ikut memicu duluan.
  it("menolak voteDeadline yang sudah lewat", () => {
    expect(() => validasiMetadata({ ...metaSah(), voteDeadline: 1_000_000_000n })).toThrow(/has already passed/);
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
    expect(() => batchDaun([new Uint8Array(31)])).toThrow(/32 bytes/);
    expect(() => batchDaun([])).toThrow(/No eligibility leaves/);
  });
});

describe("deployBallot", () => {
  // Bukti PENGKABELAN gerbang bahasa (audit-bahasa-metadata): validasiBahasaMetadata
  // (paket shared) sungguh dipanggil DI DALAM deployBallot, bukan cuma
  // didefinisikan dan tidak pernah dipakai. Uji field+kata secara MENYELURUH
  // (setiap field, setiap indeks options[]) ada di
  // pkgs/shared/src/bahasa-metadata.test.ts — uji di sini hanya membuktikan
  // deployBallot benar-benar menegakkannya, sebelum providers disentuh sama
  // sekali (pola sama seperti dua uji rahasiaAdmin/nonce di bawah).
  it("menolak metadata berbahasa Indonesia sebelum menyentuh providers (gerbang bahasa)", async () => {
    await expect(
      deployBallot(
        {} as unknown as ProvidersBallot,
        { ...metaSah(), description: "Pilih arah dukungan treasury pada Q4." },
        new Uint8Array(32),
        new Uint8Array(32),
        logPalsu,
      ),
    ).rejects.toThrow(/field "description".+"pada"/);
  });

  // Kedua uji ini bergantung pada urutan pemeriksaan di dalam deployBallot:
  // panjang rahasiaAdmin/nonce diperiksa SEBELUM providers pernah disentuh,
  // sehingga providers palsu ({}) cukup — kegagalan tidak pernah sampai ke
  // deployContract/jaringan.
  it("menolak rahasiaAdmin yang bukan 32 byte sebelum menyentuh providers", async () => {
    await expect(
      deployBallot({} as unknown as ProvidersBallot, metaSah(), new Uint8Array(31), new Uint8Array(32), logPalsu),
    ).rejects.toThrow(/admin secret key must be 32 bytes/);
  });

  it("menolak ballotNonce yang bukan 32 byte sebelum menyentuh providers", async () => {
    await expect(
      deployBallot({} as unknown as ProvidersBallot, metaSah(), new Uint8Array(32), new Uint8Array(31), logPalsu),
    ).rejects.toThrow(/ballotNonce must be 32 bytes/);
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
      const ekspektasi = expect(janji).rejects.toThrow(/did not finish within/);
      await vi.advanceTimersByTimeAsync(BATAS_MS.deploy);
      await ekspektasi;
    } finally {
      vi.useRealTimers();
    }
  });

  // Retri lewat opsiRetri (argumen KEDELAPAN — deployFn di argumen ketujuh
  // tetap seam terpisah, lihat catatan di atasnya). Pola uji sama seperti
  // deployRegistry di atas: percobaan kedua sengaja gagal dengan galat LAIN,
  // supaya "diulang" dibuktikan dari jumlah pemanggilan + identitas galat
  // akhir, tanpa memalsukan bentuk DeployedContract<BallotC> sungguhan.
  it("putus koneksi + DUST tidak turun: mengulang (deployFn terpanggil dua kali)", async () => {
    let panggilan = 0;
    const dustPerPanggilan = [500n, 500n];
    let bacaDustKe = 0;
    const deployFnPalsu = async () => {
      panggilan += 1;
      if (panggilan === 1) throw galatPutusKoneksi();
      throw new Error("percobaan-2 sengaja gagal (uji retri)");
    };
    const bacaDust = async () => {
      const v = dustPerPanggilan[bacaDustKe] ?? 500n;
      bacaDustKe += 1;
      return v;
    };

    await expect(
      deployBallot(
        {} as unknown as ProvidersBallot,
        metaSah(),
        new Uint8Array(32),
        new Uint8Array(32),
        logPalsu,
        undefined,
        deployFnPalsu,
        { bacaDust, jedaMs: 1 },
      ),
    ).rejects.toThrow(/percobaan-2 sengaja gagal/);
    expect(panggilan).toBe(2);
  });

  it("putus koneksi + DUST TURUN: berhenti (tidakPasti), TIDAK mengulang — mencegah ballot KEDUA", async () => {
    let panggilan = 0;
    const dustPerPanggilan = [500n, 300n];
    let bacaDustKe = 0;
    const deployFnPalsu = async () => {
      panggilan += 1;
      throw galatPutusKoneksi();
    };
    const bacaDust = async () => {
      const v = dustPerPanggilan[bacaDustKe] ?? 300n;
      bacaDustKe += 1;
      return v;
    };

    await expect(
      deployBallot(
        {} as unknown as ProvidersBallot,
        metaSah(),
        new Uint8Array(32),
        new Uint8Array(32),
        logPalsu,
        undefined,
        deployFnPalsu,
        { bacaDust, jedaMs: 1 },
      ),
    ).rejects.toThrow(/cannot be determined/);
    expect(panggilan).toBe(1);
  });

  it("putus koneksi TANPA bacaDust: berhenti (tidakPasti) pada percobaan pertama", async () => {
    let panggilan = 0;
    const deployFnPalsu = async () => {
      panggilan += 1;
      throw galatPutusKoneksi();
    };

    await expect(
      deployBallot(
        {} as unknown as ProvidersBallot,
        metaSah(),
        new Uint8Array(32),
        new Uint8Array(32),
        logPalsu,
        undefined,
        deployFnPalsu,
        { jedaMs: 1 },
      ),
    ).rejects.toThrow(/cannot be determined/);
    expect(panggilan).toBe(1);
  });
});

/**
 * Stub `PublicDataProvider` lengkap (bukan `as any`/`as unknown`): SETIAP
 * anggota interface diimplementasikan supaya tsc memeriksa penuh, tapi hanya
 * `queryContractState` yang benar-benar dipakai uji-uji di berkas ini — sisanya
 * melempar bila TERPANGGIL, supaya pemakaian tak sengaja gagal nyaring.
 */
function publicDataProviderPalsu(queryContractState: PublicDataProvider["queryContractState"]): PublicDataProvider {
  const takTerpakai = (nama: string) => (): never => {
    throw new Error(`${nama} tidak dipakai di uji ini`);
  };
  return {
    queryContractState,
    queryZSwapAndContractState: takTerpakai("queryZSwapAndContractState"),
    queryDeployContractState: takTerpakai("queryDeployContractState"),
    queryUnshieldedBalances: takTerpakai("queryUnshieldedBalances"),
    watchForContractState: takTerpakai("watchForContractState"),
    watchForUnshieldedBalances: takTerpakai("watchForUnshieldedBalances"),
    watchForDeployTxData: takTerpakai("watchForDeployTxData"),
    watchForTxData: takTerpakai("watchForTxData"),
    contractStateObservable: takTerpakai("contractStateObservable"),
    unshieldedBalancesObservable: takTerpakai("unshieldedBalancesObservable"),
  };
}

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
      const ekspektasi = expect(janji).rejects.toThrow(/did not finish within/);
      await vi.advanceTimersByTimeAsync(BATAS_MS.panggilBerat);
      await ekspektasi;
    } finally {
      vi.useRealTimers();
    }
  });

  // Retri: TANPA publicDataProvider/alamatBallot tidak ada cara memastikan
  // status mendarat (lihat OpsiRetriDaftarkanVoter), jadi putus koneksi harus
  // BERHENTI dengan galat baru — bukan mengulang membabi buta, dan bukan pula
  // menelan galat asli secara diam-diam.
  it("putus koneksi TANPA opsi retri: berhenti (tidakPasti), registerVoters dipanggil tepat sekali", async () => {
    let panggilan = 0;
    const ballotPalsu = {
      callTx: {
        registerVoters: async () => {
          panggilan += 1;
          throw galatPutusKoneksi();
        },
      },
    } as unknown as FoundContract<BallotC>;

    await expect(daftarkanVoter(ballotPalsu, [daun(1)], logPalsu, { jedaMs: 1 })).rejects.toThrow(
      /cannot be determined/,
    );
    expect(panggilan).toBe(1);
  });

  // Penolakan rantai (bukan putus koneksi) TIDAK BOLEH diulang. TANPA opsi
  // retri dengan sengaja di sini: registeredSebelum (dibaca SEBELUM percobaan
  // pertama bila publicDataProvider/alamatBallot diberikan) tidak relevan
  // untuk uji ini — klasifikasi bolehDiulang diperiksa SEBELUM sudahMendarat
  // pernah dipanggil sama sekali (lihat kirimDenganRetri), jadi perilakunya
  // sama persis dengan atau tanpa opsi.
  it("penolakan rantai TIDAK diulang — pesan galat kontrak diteruskan apa adanya", async () => {
    let panggilan = 0;
    const ballotPalsu = {
      callTx: {
        registerVoters: async () => {
          panggilan += 1;
          throw new Error('failed assert: "Only the admin can register voters"');
        },
      },
    } as unknown as FoundContract<BallotC>;

    await expect(daftarkanVoter(ballotPalsu, [daun(1)], logPalsu, { jedaMs: 1 })).rejects.toThrow(
      /Only the admin can register voters/,
    );
    expect(panggilan).toBe(1);
  });
});

describe("registerVotersMendarat (aritmetika retri daftarkanVoter)", () => {
  it("belum mendarat bila registeredCount belum naik sama sekali", () => {
    expect(registerVotersMendarat(3n, 2n, 3n)).toBe(false);
  });

  it("belum mendarat bila naik tapi kurang dari batchN", () => {
    expect(registerVotersMendarat(3n, 2n, 4n)).toBe(false);
  });

  it("mendarat tepat saat naik persis sebesar batchN", () => {
    expect(registerVotersMendarat(3n, 2n, 5n)).toBe(true);
  });

  it("mendarat (>=) bila naik LEBIH dari batchN", () => {
    expect(registerVotersMendarat(3n, 2n, 6n)).toBe(true);
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
      const ekspektasi = expect(janji).rejects.toThrow(/did not finish within/);
      await vi.advanceTimersByTimeAsync(BATAS_MS.panggilRingan);
      await ekspektasi;
    } finally {
      vi.useRealTimers();
    }
  });

  it("putus koneksi TANPA opsi retri: berhenti (tidakPasti), register dipanggil tepat sekali", async () => {
    let panggilan = 0;
    const registryPalsu = {
      callTx: {
        register: async () => {
          panggilan += 1;
          throw galatPutusKoneksi();
        },
      },
    } as unknown as FoundContract<RegistryC>;

    await expect(catatKeRegistry(registryPalsu, "a".repeat(64), logPalsu, { jedaMs: 1 })).rejects.toThrow(
      /cannot be determined/,
    );
    expect(panggilan).toBe(1);
  });

  // Sama seperti daftarkanVoter: penolakan rantai (mis. "sengaja" ditolak
  // kontrak untuk alasan lain) tidak pernah diulang.
  it("penolakan rantai TIDAK diulang walau publicDataProvider diberikan", async () => {
    let panggilan = 0;
    const registryPalsu = {
      callTx: {
        register: async () => {
          panggilan += 1;
          throw new Error('failed assert: "alamat tidak sah"');
        },
      },
    } as unknown as FoundContract<RegistryC>;
    const providerPalsu = publicDataProviderPalsu(async () => {
      throw new Error("queryContractState seharusnya tidak pernah terpanggil di uji ini");
    });

    await expect(
      catatKeRegistry(registryPalsu, "a".repeat(64), logPalsu, {
        publicDataProvider: providerPalsu,
        alamatRegistry: "b".repeat(64),
        jedaMs: 1,
      }),
    ).rejects.toThrow(/alamat tidak sah/);
    expect(panggilan).toBe(1);
  });
});

describe("ballotSudahTercatat (keanggotaan retri catatKeRegistry)", () => {
  it("false untuk daftar kosong", () => {
    expect(ballotSudahTercatat([], "0200abc")).toBe(false);
  });

  it("false bila alamat tidak ada di daftar", () => {
    expect(ballotSudahTercatat(["0200aaa", "0200bbb"], "0200ccc")).toBe(false);
  });

  it("true bila alamat ADA di daftar — TIDAK peduli posisi (pushFront menaruh terbaru di depan)", () => {
    expect(ballotSudahTercatat(["0200bbb", "0200aaa"], "0200aaa")).toBe(true);
  });

  // Ini justru alasan keanggotaan dipilih, bukan count: count yang naik bisa
  // berasal dari entri SIAPA PUN (registry permissionless), bukan bukti
  // entri KITA yang mendarat. Uji ini mendokumentasikan itu lewat contoh:
  // daftar berisi ballot LAIN (count > 0) tapi alamat kita sendiri tidak ada.
  it("false walau daftar tidak kosong, ketika isinya bukan alamat kita", () => {
    expect(ballotSudahTercatat(["0200milikOrangLain"], "0200milikKita")).toBe(false);
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

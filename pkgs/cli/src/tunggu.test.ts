import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import {
  cobaSampaiWaktuBlokCocok,
  denganBatasWaktu,
  kirimDenganRetri,
  pastikan,
  POLA_BELUM_WAKTUNYA,
  POLA_PUTUS_KONEKSI,
  putusKoneksiAmanDiulang,
  ringkasTallies,
  type StatusMendarat,
  ulangiSampai,
} from "./tunggu.ts";

// Logger palsu: uji ini tidak boleh menulis apa pun ke berkas log.
const logPalsu = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;

describe("pastikan", () => {
  it("diam bila benar, melempar pesan apa adanya bila salah", () => {
    expect(() => pastikan(true, "tidak akan terjadi")).not.toThrow();
    expect(() => pastikan(false, "tally harus kosong")).toThrow("tally harus kosong");
  });
});

describe("denganBatasWaktu", () => {
  it("meneruskan hasil bila selesai tepat waktu", async () => {
    await expect(denganBatasWaktu(Promise.resolve(42), 1000, "kelamaan")).resolves.toBe(42);
  });

  it("melempar pesan yang diberikan bila lewat batas", async () => {
    const menggantung = new Promise<never>(() => {});
    await expect(denganBatasWaktu(menggantung, 20, "kelamaan")).rejects.toThrow("kelamaan");
  });

  it("membersihkan timer setelah selesai tepat waktu (tidak membiarkan handle tergantung)", async () => {
    // finally { clearTimeout } tidak pernah menentukan hasil sebuah uji lain
    // — dua uji di atas sama-sama lolos walau clearTimeout dihapus, karena
    // proses uji selalu berakhir lewat process.exit di produksi. vi.getTimerCount()
    // di bawah fake timers adalah satu-satunya cara memeriksa handle-nya
    // langsung dibersihkan.
    vi.useFakeTimers();
    try {
      await denganBatasWaktu(Promise.resolve(42), 1000, "kelamaan");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ulangiSampai", () => {
  it("mengembalikan nilai pertama bila syarat sudah terpenuhi", async () => {
    const hasil = await ulangiSampai(async () => 3n, (n) => n === 3n, logPalsu, "n === 3", 5, 1);
    expect(hasil.cocok).toBe(true);
    expect(hasil.nilai).toBe(3n);
    expect(hasil.percobaan).toBe(1);
  });

  it("mengulang sampai indexer menyusul", async () => {
    let ke = 0;
    const hasil = await ulangiSampai(
      async () => {
        ke += 1;
        return ke < 3 ? 0n : 3n;
      },
      (n) => n === 3n,
      logPalsu,
      "n === 3",
      10,
      1,
    );
    expect(hasil.cocok).toBe(true);
    expect(hasil.nilai).toBe(3n);
    expect(hasil.percobaan).toBe(3);
  });

  it("menyerah setelah maks percobaan tanpa melempar, membawa nilai terakhir", async () => {
    const hasil = await ulangiSampai(async () => 0n, (n) => n === 3n, logPalsu, "n === 3", 3, 1);
    expect(hasil.cocok).toBe(false);
    expect(hasil.nilai).toBe(0n);
    expect(hasil.percobaan).toBe(3);
    expect(hasil.galatTerakhir).toBeUndefined();
  });

  it("memperlakukan galat pembacaan sebagai 'belum siap' dan menyimpan pesannya", async () => {
    const hasil = await ulangiSampai<bigint>(
      async () => {
        throw new Error("Registry belum terlihat di indexer");
      },
      (n) => n === 3n,
      logPalsu,
      "n === 3",
      2,
      1,
    );
    expect(hasil.cocok).toBe(false);
    expect(hasil.nilai).toBeUndefined();
    expect(hasil.galatTerakhir).toMatch(/belum terlihat di indexer/);
  });

  it("mereset galatTerakhir setelah pembacaan gagal lalu berhasil menyusul (walau syarat belum terpenuhi)", async () => {
    // Jalur "syarat langsung terpenuhi" mengembalikan literal
    // `galatTerakhir: undefined` di tempat, jadi tidak menguji resetnya.
    // Baris `galatTerakhir = undefined;` sesudah pembacaan sukses hanya
    // kelihatan pengaruhnya pada hasil AKHIR bila pembacaan terakhir
    // berhasil tapi syaratnya tidak pernah terpenuhi sampai percobaan
    // habis. Di sini percobaan pertama melempar, sisanya berhasil dibaca
    // tapi tidak pernah cocok.
    let ke = 0;
    const hasil = await ulangiSampai<bigint>(
      async () => {
        ke += 1;
        if (ke === 1) throw new Error("Registry belum terlihat di indexer");
        return 0n; // berhasil dibaca, tapi tidak pernah memenuhi syarat n === 3n
      },
      (n) => n === 3n,
      logPalsu,
      "n === 3",
      4,
      1,
    );
    expect(hasil.cocok).toBe(false);
    expect(hasil.nilai).toBe(0n);
    expect(hasil.percobaan).toBe(4);
    expect(hasil.galatTerakhir).toBeUndefined();
  });
});

describe("ringkasTallies", () => {
  it("memetakan entri map tally ke array per opsi", () => {
    expect(ringkasTallies([[0n, 2n], [2n, 1n]], 3)).toEqual([2n, 0n, 1n]);
  });

  it("mengembalikan seluruh nol untuk tally kosong", () => {
    expect(ringkasTallies([], 3)).toEqual([0n, 0n, 0n]);
  });

  it("menolak opsi di luar rentang", () => {
    expect(() => ringkasTallies([[7n, 1n]], 3)).toThrow(/di luar rentang/);
  });
});

describe("POLA_BELUM_WAKTUNYA", () => {
  it("cocok dua pesan 'belum waktunya' dan TIDAK cocok 'sudah lewat'", () => {
    // Dua yang boleh diulang: waktu blok belum sampai, mencoba lagi masuk akal.
    expect(POLA_BELUM_WAKTUNYA.test("failed assert: Pemungutan suara masih berlangsung")).toBe(true);
    expect(POLA_BELUM_WAKTUNYA.test("failed assert: Batas waktu pembukaan suara belum lewat")).toBe(true);
    // Yang TIDAK boleh diulang: jendelanya sudah tertutup, mengulang hanya
    // membakar proof. Perhatikan "sudah" versus "belum".
    expect(POLA_BELUM_WAKTUNYA.test("failed assert: Batas waktu pembukaan suara sudah lewat")).toBe(false);
    expect(POLA_BELUM_WAKTUNYA.test("failed assert: Credential ini sudah dipakai memilih")).toBe(false);
  });
});

/**
 * Bentuk galat putus koneksi persis yang dilaporkan di lapangan (lihat
 * .superpowers/retry-submit-cli.md): `SubmissionError` dari NodeClientError
 * (PolkadotNodeClient.js baris 84-92) membungkus galat penutupan socket dari
 * @polkadot/rpc-provider (ws/index.js baris 371).
 */
function galatPutusKoneksi(): Error {
  const penyebab = new Error("disconnected from wss://rpc.preview.midnight.network/: 1000:: Normal Closure");
  const submissionError = new Error("Transaction submission failed", { cause: penyebab });
  submissionError.name = "SubmissionError";
  return submissionError;
}

/** Bentuk galat penolakan rantai (assert kontrak gagal) — TIDAK boleh diulang. */
function galatDitolakRantai(): Error {
  return new Error('failed assert: "Hanya admin yang boleh mendaftarkan pemilih"');
}

describe("POLA_PUTUS_KONEKSI / putusKoneksiAmanDiulang", () => {
  it("cocok pesan putus koneksi persis yang dilaporkan (SubmissionError + disconnected from)", () => {
    expect(putusKoneksiAmanDiulang(galatPutusKoneksi())).toBe(true);
  });

  it("cocok ConnectionError dari ensureConnection()", () => {
    const e = new Error("Could not connect within specified time range (5s)");
    e.name = "ConnectionError";
    expect(putusKoneksiAmanDiulang(e)).toBe(true);
  });

  it("TIDAK cocok penolakan rantai (assert kontrak gagal)", () => {
    expect(putusKoneksiAmanDiulang(galatDitolakRantai())).toBe(false);
  });

  it("TIDAK cocok galat generik yang tidak menyerupai keduanya", () => {
    expect(putusKoneksiAmanDiulang(new Error("ENOTFOUND indexer.example"))).toBe(false);
    expect(putusKoneksiAmanDiulang("bukan Error sama sekali")).toBe(false);
  });

  it("POLA_PUTUS_KONEKSI diekspor dan dipakai sebagai bawaan bolehDiulang", () => {
    expect(POLA_PUTUS_KONEKSI.test("disconnected from wss://x/: 1000:: Normal Closure")).toBe(true);
  });
});

describe("kirimDenganRetri", () => {
  it("meneruskan hasil pada percobaan pertama tanpa pernah memanggil sudahMendarat", async () => {
    let panggilanKirim = 0;
    let panggilanCek = 0;
    const hasil = await kirimDenganRetri<string>({
      kirim: async () => {
        panggilanKirim += 1;
        return "sukses";
      },
      sudahMendarat: async () => {
        panggilanCek += 1;
        return { status: "belum" };
      },
      log: logPalsu,
      label: "uji",
      jedaMs: 1,
    });
    expect(hasil).toBe("sukses");
    expect(panggilanKirim).toBe(1);
    expect(panggilanCek).toBe(0);
  });

  it("mengulang pada putus koneksi lalu sukses, setelah memeriksa sudahMendarat (belum mendarat)", async () => {
    let panggilanKirim = 0;
    let panggilanCek = 0;
    const hasil = await kirimDenganRetri<string>({
      kirim: async () => {
        panggilanKirim += 1;
        if (panggilanKirim === 1) throw galatPutusKoneksi();
        return "sukses-percobaan-2";
      },
      sudahMendarat: async () => {
        panggilanCek += 1;
        return { status: "belum" };
      },
      log: logPalsu,
      label: "uji",
      jedaMs: 1,
    });
    expect(hasil).toBe("sukses-percobaan-2");
    expect(panggilanKirim).toBe(2);
    expect(panggilanCek).toBe(1);
  });

  it("penolakan rantai TIDAK diulang — kirim dipanggil tepat sekali, galat asli diteruskan", async () => {
    let panggilanKirim = 0;
    let panggilanCek = 0;
    await expect(
      kirimDenganRetri<string>({
        kirim: async () => {
          panggilanKirim += 1;
          throw galatDitolakRantai();
        },
        sudahMendarat: async () => {
          panggilanCek += 1;
          return { status: "belum" };
        },
        log: logPalsu,
        label: "uji",
        jedaMs: 1,
      }),
    ).rejects.toThrow(/Hanya admin yang boleh mendaftarkan pemilih/);
    expect(panggilanKirim).toBe(1);
    expect(panggilanCek).toBe(0);
  });

  // MUTASI WAJIB: menghapus blok "periksa sudahMendarat sebelum mengulang"
  // (mis. langsung menunggu lalu mengulang tanpa membaca hasilnya) membuat
  // uji ini MERAH — kirim akan terpanggil KEDUA kalinya dan hasil "sukses
  // lama" yang seharusnya dipakai apa adanya akan tertimpa nilai baru.
  it("sudah mendarat sebelum retry — memakai hasil itu, TIDAK PERNAH mengirim ulang", async () => {
    let panggilanKirim = 0;
    const hasil = await kirimDenganRetri<string>({
      kirim: async () => {
        panggilanKirim += 1;
        if (panggilanKirim === 1) throw galatPutusKoneksi();
        return "seharusnya-tidak-pernah-dipakai";
      },
      sudahMendarat: async (): Promise<StatusMendarat<string>> => ({ status: "mendarat", nilai: "sukses-lama" }),
      log: logPalsu,
      label: "uji",
      jedaMs: 1,
    });
    expect(hasil).toBe("sukses-lama");
    expect(panggilanKirim).toBe(1);
  });

  it("status tidakPasti — BERHENTI dengan galat baru, TIDAK mengulang dan TIDAK dianggap sukses", async () => {
    let panggilanKirim = 0;
    await expect(
      kirimDenganRetri<string>({
        kirim: async () => {
          panggilanKirim += 1;
          throw galatPutusKoneksi();
        },
        sudahMendarat: async (): Promise<StatusMendarat<string>> => ({
          status: "tidakPasti",
          alasan: "pembacaan chain gagal (uji)",
        }),
        log: logPalsu,
        label: "uji",
        jedaMs: 1,
      }),
    ).rejects.toThrow(/tidak bisa dipastikan/);
    expect(panggilanKirim).toBe(1);
  });

  it("jatah percobaan habis pada putus koneksi berulang — melempar galat ASLI, bukan galat generik", async () => {
    let panggilanKirim = 0;
    let panggilanCek = 0;
    await expect(
      kirimDenganRetri<string>({
        kirim: async () => {
          panggilanKirim += 1;
          throw galatPutusKoneksi();
        },
        sudahMendarat: async () => {
          panggilanCek += 1;
          return { status: "belum" };
        },
        log: logPalsu,
        label: "uji",
        maksPercobaan: 3,
        jedaMs: 1,
      }),
    ).rejects.toThrow(/Transaction submission failed/);
    expect(panggilanKirim).toBe(3); // 1 percobaan awal + 2 ulang, sesuai maksPercobaan
    expect(panggilanCek).toBe(2); // dipanggil sebelum SETIAP ulang (percobaan 1 dan 2), bukan sebelum yang ke-3
  });

  it("bolehDiulang kustom menggantikan klasifikasi bawaan", async () => {
    let panggilanKirim = 0;
    const hasil = await kirimDenganRetri<string>({
      kirim: async () => {
        panggilanKirim += 1;
        if (panggilanKirim === 1) throw new Error("galat kustom apa pun");
        return "sukses";
      },
      sudahMendarat: async () => ({ status: "belum" }) as const,
      bolehDiulang: () => true, // menerima SEMUA galat sebagai aman diulang
      log: logPalsu,
      label: "uji",
      jedaMs: 1,
    });
    expect(hasil).toBe("sukses");
    expect(panggilanKirim).toBe(2);
  });

  it("menolak maksPercobaan < 1", async () => {
    await expect(
      kirimDenganRetri<string>({
        kirim: async () => "tidak pernah tercapai",
        sudahMendarat: async () => ({ status: "belum" }) as const,
        log: logPalsu,
        label: "uji",
        maksPercobaan: 0,
      }),
    ).rejects.toThrow(/maksPercobaan harus >= 1/);
  });
});

describe("cobaSampaiWaktuBlokCocok", () => {
  it("mengulang selama pesannya 'belum waktunya', lalu meneruskan hasil", async () => {
    let ke = 0;
    const hasil = await cobaSampaiWaktuBlokCocok(
      async () => {
        ke += 1;
        if (ke < 3) throw new Error("failed assert: Pemungutan suara masih berlangsung");
        return "dibuka";
      },
      logPalsu,
      POLA_BELUM_WAKTUNYA,
      5,
      1,
    );
    expect(hasil).toBe("dibuka");
    expect(ke).toBe(3);
  });

  it("meneruskan galat lain apa adanya tanpa satu pun pengulangan", async () => {
    let ke = 0;
    await expect(
      cobaSampaiWaktuBlokCocok(
        async () => {
          ke += 1;
          throw new Error("failed assert: Credential ini sudah dipakai memilih");
        },
        logPalsu,
        POLA_BELUM_WAKTUNYA,
        5,
        1,
      ),
    ).rejects.toThrow(/sudah dipakai memilih/);
    expect(ke).toBe(1);
  });
});

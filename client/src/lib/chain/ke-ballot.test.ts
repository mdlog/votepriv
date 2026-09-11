import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { bacaRantai } from "./baca-rantai";
import { accentDariAlamat, formatDeadlineUtc, keBallot, keDaftarBallot, labelNomor } from "./ke-ballot";
import type { JaringanAktif } from "./endpoint";
import type { BallotTerbaca, HasilRantai } from "./baca-rantai";
import type { KeadaanBallot } from "./dekode";
import { keadaanHasil, menerimaSuara } from "@/components/votepriv/ballot-status";

const DIR = new URL("../../test/fixture-rantai/", import.meta.url);
const baca = (n: string) => JSON.parse(readFileSync(new URL(n, DIR), "utf8"));
const fxRegistry = baca("registry.json");
const fxBallots = baca("ballots.json");
const fxJaringan = baca("jaringan.json");
const meta = baca("meta.json");

const JARINGAN: JaringanAktif = {
  networkId: meta.jaringan,
  indexer: meta.endpoint,
  indexerWS: "",
  alamatRegistry: meta.alamatRegistry,
};

function ambilPalsu(): typeof fetch {
  return (async (_u: string, init: RequestInit) => {
    const nama = /query\s+(\w+)/.exec(JSON.parse(String(init.body)).query)?.[1] ?? "?";
    const j = nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
    return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const hasil = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
const daftar = keDaftarBallot(hasil);

// ─────────────────────────────────────────────────────────────────────────
// Pembangun data SINTETIS untuk keBallot()/keDaftarBallot(). BallotTerbaca
// dan KeadaanBallot adalah tipe data MURNI (bukan accessor Ledger tergenerasi
// dari kontrak), jadi konstruksi literal langsung di sini sudah diikat tipe
// oleh compiler — tidak perlu pola mock ledger() seperti di
// dekode.ledger-sintetis.test.ts. Dipakai untuk menutup praperiksa P1 dan P5:
// fixture rekaman tidak dapat membuktikan keduanya (lihat komentar masing-
// masing describe di bawah).
// ─────────────────────────────────────────────────────────────────────────

function keadaanMinimal(overrides: Partial<KeadaanBallot> = {}): KeadaanBallot {
  return {
    title: "t",
    description: "d",
    community: "c",
    opsi: ["A", "B"],
    optionCount: 2,
    voteDeadlineDetik: 10_000,
    tallyDeadlineDetik: 20_000,
    quorumPercent: 50,
    eligibleCount: 5,
    registeredCount: 5,
    eligibilityPolicy: "e",
    phase: 0,
    voteCount: 0,
    talliedCount: 0,
    tallies: [],
    ...overrides,
  };
}

function terbacaSintetis(
  alamat: string,
  deployHeight: number,
  overrides: Partial<KeadaanBallot> = {},
): BallotTerbaca {
  return { alamat, keadaan: keadaanMinimal(overrides), deployHeight, aksi: [] };
}

function hasilSintetis(ballot: BallotTerbaca[], sekarangMs = 0): HasilRantai {
  return {
    jaringan: JARINGAN,
    registry: { count: ballot.length, alamat: ballot.map(b => b.alamat), aksi: [] },
    ballot,
    gagal: [],
    blok: { height: 0, timestampMs: 0 },
    epoch: null,
    sekarangMs,
  };
}

describe("keDaftarBallot — pemetaan spec 9.4 (fixture rekaman)", () => {
  it("memetakan setiap ballot yang berhasil dibaca", () => {
    expect(daftar).toHaveLength(hasil.ballot.length);
  });

  it("memakai ALAMAT sebagai id, bukan nomor urut", () => {
    for (const b of daftar) {
      expect(b.id).toMatch(/^[0-9a-fA-F]+$/);
      expect(hasil.ballot.map(x => x.alamat)).toContain(b.id);
    }
  });

  it("JEBAKAN 2: nomor urut mengikuti tinggi blok DEPLOY, bukan indeks registry", () => {
    const urutRegistry = hasil.registry.alamat.filter(a => daftar.some(b => b.id === a));
    const urutNomor = [...daftar].sort((a, b) => a.nomor - b.nomor).map(b => b.id);
    const urutDeploy = [...daftar].sort((a, b) => a.deployHeight - b.deployHeight).map(b => b.id);
    expect(urutNomor).toEqual(urutDeploy);
    // Fixture memuat DUA ballot: urutan registry (pushFront, terbaru di depan)
    // harus KEBALIKAN dari urutan deploy. Assert ini membuktikan nomor tidak
    // diambil dari indeks registry.
    if (daftar.length > 1) {
      expect(urutNomor).not.toEqual(urutRegistry);
      expect(urutNomor).toEqual([...urutRegistry].reverse());
    }
  });

  it("memberi nomor yang rapat mulai dari 1", () => {
    const nomor = daftar.map(b => b.nomor).sort((a, b) => a - b);
    expect(nomor).toEqual(Array.from({ length: daftar.length }, (_, i) => i + 1));
  });

  it("JEBAKAN 1: tidak ada ballot yang berstatus live sementara voteDeadline-nya sudah lewat", () => {
    for (const b of daftar) {
      if (b.voteDeadlineMs <= hasil.sekarangMs) {
        expect(b.status).not.toBe("live");
        expect(b.status).not.toBe("closing-soon");
        expect(menerimaSuara(b.status)).toBe(false);
      }
    }
  });

  it("JEBAKAN 1: setiap ballot yang phase-nya voting dengan kedua deadline lewat jadi awaiting-finalize", () => {
    for (const b of daftar) {
      if (b.phase !== 2 && b.tallyDeadlineMs <= hasil.sekarangMs) {
        expect(b.status).toBe("awaiting-finalize");
      }
    }
  });

  it("JEBAKAN 3: tallies dipadatkan dan jumlahnya sama dengan talliedCount", () => {
    for (const b of daftar) {
      // SELALU larik, tidak pernah null — panjangnya selalu sama dengan options.
      expect(Array.isArray(b.tallies)).toBe(true);
      expect(b.tallies).toHaveLength(b.options.length);
      expect(b.tallies.reduce((s, n) => s + n, 0)).toBe(b.tallied);
      // Lubang pada map jarang hadir sebagai 0, bukan undefined.
      for (const n of b.tallies) expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("JEBAKAN 4: keadaanHasil digantung pada STATUS, bukan pada talliedCount", () => {
    for (const b of daftar) {
      if (b.tallied > 0) {
        expect(b.keadaanHasil).toBe("ada-hasil");
        continue;
      }
      const diharap = {
        live: "tersegel",
        "closing-soon": "tersegel",
        "tally-open": "menunggu-pembukaan",
        "awaiting-finalize": "tidak-ada-yang-dibuka",
        finalized: "tidak-ada-yang-dibuka",
      } as const;
      expect(b.keadaanHasil).toBe(diharap[b.status]);
      if (b.voteDeadlineMs <= hasil.sekarangMs) {
        expect(b.keadaanHasil).not.toBe("tersegel");
      }
    }
  });

  it("JEBAKAN 4: ballot yang difinalisasi tanpa satu suara dibuka BUKAN tersegel", () => {
    // Ballot f597222d… hari ini berada satu panggilan finalize() dari keadaan
    // ini. Diuji secara sintetis karena rantai belum sampai ke sana.
    expect(keadaanHasil({ status: "finalized", tallied: 0 })).toBe("tidak-ada-yang-dibuka");
    expect(keadaanHasil({ status: "finalized", tallied: 0 })).not.toBe("tersegel");
  });

  it("memotong opsi menurut optionCount — tidak menawarkan pilihan yang pasti ditolak", () => {
    for (const b of daftar) {
      expect(b.options.length).toBeGreaterThanOrEqual(2);
      expect(b.options.length).toBeLessThanOrEqual(4);
      for (const o of b.options) expect(o).not.toBe("");
    }
  });

  it("membawa eligibilityPolicy dan quorum apa adanya dari ledger", () => {
    for (const b of daftar) {
      expect(typeof b.eligibilityPolicy).toBe("string");
      expect(b.quorum).toBeLessThanOrEqual(100);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Praperiksa P1: fixture rekaman TIDAK dapat membuktikan bahwa keBallot()
// memakai sekarangMs yang disuntikkan, bukan Date.now() — kedua ballot fixture
// sudah lewat kedua deadline-nya SEKARANG (2026) dan tetap lewat memakai
// Date.now() kapan pun uji ini dijalankan, sehingga assert "not.toBe(live)"
// di atas benar dengan jam MANA PUN. Berkas ini membuktikannya lewat deadline
// SINTETIS dekat epoch (1970): Date.now() sungguhan (2026+) selalu berada JAUH
// melewati deadline itu, sehingga bila implementasi diam-diam memakai
// Date.now(), ketiga snapshot di bawah akan menghasilkan status yang SAMA
// ("awaiting-finalize") dan assert live/tally-open akan gagal.
// ─────────────────────────────────────────────────────────────────────────
describe("keBallot — P1: memakai sekarangMs yang DISUNTIKKAN, bukan jam perangkat", () => {
  it("verdict status berubah begitu sekarangMs yang disuntikkan melewati voteDeadline lalu tallyDeadline", () => {
    const b = terbacaSintetis("waktu-uji", 1, {
      voteDeadlineDetik: 1_000_000, // voteDeadlineMs = 1_000_000_000 (12 Jan 1970)
      tallyDeadlineDetik: 2_000_000, // tallyDeadlineMs = 2_000_000_000 (24 Jan 1970)
    });
    const voteDeadlineMs = b.keadaan.voteDeadlineDetik * 1000;
    const tallyDeadlineMs = b.keadaan.tallyDeadlineDetik * 1000;

    const live = keBallot(b, { nomor: 1, sekarangMs: voteDeadlineMs - 200_000_000 });
    const tallyOpen = keBallot(b, { nomor: 1, sekarangMs: voteDeadlineMs + 1 });
    const awaitingFinalize = keBallot(b, { nomor: 1, sekarangMs: tallyDeadlineMs + 1 });

    expect(live.status).toBe("live");
    expect(tallyOpen.status).toBe("tally-open");
    expect(awaitingFinalize.status).toBe("awaiting-finalize");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Praperiksa P5: keDaftarBallot menaruh entri deployHeight = 0 (ContractDeploy
// tidak terbaca) di BELAKANG urutan nomor, bukan di depan. Fixture rekaman
// tidak pernah punya deployHeight 0 (kedua ballotnya 810832 dan 813330), jadi
// cabang ini hanya dapat dijangkau lewat data sintetis.
// ─────────────────────────────────────────────────────────────────────────
describe("keDaftarBallot — P5: entri deployHeight = 0 ditaruh di BELAKANG, tie-break lewat alamat", () => {
  it("menomori dari tinggi deploy naik, kelompok deployHeight=0 di belakang, TANPA menyortir ulang urutan tampil", () => {
    const masuk = [
      terbacaSintetis("x-tinggi", 200),
      terbacaSintetis("c-nol", 0),
      terbacaSintetis("a-nol", 0),
      terbacaSintetis("b-nol", 0),
      terbacaSintetis("v-sedang", 100),
      terbacaSintetis("u-sedang", 100),
    ];
    const daftarSintetis = keDaftarBallot(hasilSintetis(masuk, 0));

    // Urutan TAMPIL mengikuti hasil.ballot apa adanya — TIDAK diurutkan ulang.
    expect(daftarSintetis.map(b => b.id)).toEqual([
      "x-tinggi",
      "c-nol",
      "a-nol",
      "b-nol",
      "v-sedang",
      "u-sedang",
    ]);

    const nomorDari = (id: string) => daftarSintetis.find(b => b.id === id)!.nomor;
    // 100 == 100 -> tie-break alamat: "u" < "v".
    expect(nomorDari("u-sedang")).toBe(1);
    expect(nomorDari("v-sedang")).toBe(2);
    // 200, sendirian di kelompoknya, sebelum kelompok 0.
    expect(nomorDari("x-tinggi")).toBe(3);
    // Kelompok deployHeight=0 di BELAKANG, tie-break alamat: a < b < c.
    expect(nomorDari("a-nol")).toBe(4);
    expect(nomorDari("b-nol")).toBe(5);
    expect(nomorDari("c-nol")).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Pemetaan field satu-per-satu dengan nilai yang SENGAJA semuanya berbeda,
// supaya pertukaran field (mis. eligible<->registered, votes<->tallied)
// membuat assert di bawah merah, bukan lolos karena kebetulan sama seperti
// di fixture (eligibleCount == registeredCount == 3, voteCount == talliedCount
// di kedua ballot fixture).
// ─────────────────────────────────────────────────────────────────────────
describe("keBallot — pemetaan field tanpa tertukar (nilai sengaja semuanya berbeda)", () => {
  it("memetakan 1:1 setiap field skalar dan string ke tempat yang benar", () => {
    const b = terbacaSintetis("kontrak-uji", 555, {
      title: "Judul X",
      description: "Deskripsi Y",
      community: "Komunitas Z",
      opsi: ["Opsi Satu", "Opsi Dua"],
      optionCount: 2,
      voteDeadlineDetik: 2_000_000, // voteDeadlineMs = 2_000_000_000
      tallyDeadlineDetik: 3_000_000, // tallyDeadlineMs = 3_000_000_000
      quorumPercent: 113,
      eligibleCount: 101,
      registeredCount: 103,
      voteCount: 107,
      talliedCount: 0,
      eligibilityPolicy: "Kebijakan W",
      phase: 0,
      tallies: [],
    });
    // sekarangMs jauh sebelum voteDeadlineMs dan di luar ambang closing-soon
    // (jendela tally 1_000_000_000ms jauh di atas batas atas 24 jam, jadi
    // ambangnya 24 jam == 86_400_000ms).
    const out = keBallot(b, { nomor: 7, sekarangMs: 1_000_000_000 });

    expect(out.id).toBe("kontrak-uji");
    expect(out.nomor).toBe(7);
    expect(out.title).toBe("Judul X");
    expect(out.description).toBe("Deskripsi Y");
    expect(out.community).toBe("Komunitas Z");
    expect(out.votes).toBe(107);
    expect(out.eligible).toBe(101);
    expect(out.registered).toBe(103);
    expect(out.tallied).toBe(0);
    expect(out.quorum).toBe(113);
    expect(out.eligibilityPolicy).toBe("Kebijakan W");
    expect(out.voteDeadlineMs).toBe(2_000_000_000);
    expect(out.tallyDeadlineMs).toBe(3_000_000_000);
    expect(out.phase).toBe(0);
    expect(out.status).toBe("live");
    expect(out.options).toEqual(["Opsi Satu", "Opsi Dua"]);
    expect(out.tallies).toEqual([0, 0]);
    expect(out.keadaanHasil).toBe("tersegel");
    // Diturunkan tangan lewat rumus accentDariAlamat pada "kontrak-uji" —
    // diverifikasi terpisah lewat node sebelum ditulis di sini.
    expect(out.accent).toBe("violet");
    expect(out.tag).toBe("Open");
    expect(out.deployHeight).toBe(555);
    expect(out.deadline).toBe("Jan 24, 1970, 03:33 UTC");
  });

  it("memetakan talliedCount > 0 ke keadaanHasil ada-hasil, apa pun statusnya", () => {
    const b = terbacaSintetis("kontrak-final", 1, {
      phase: 2, // finalized menang atas waktu apa pun
      talliedCount: 109,
      voteCount: 200,
    });
    const out = keBallot(b, { nomor: 1, sekarangMs: 0 });
    expect(out.status).toBe("finalized");
    expect(out.tallied).toBe(109);
    expect(out.keadaanHasil).toBe("ada-hasil");
    expect(out.tag).toBe("Finalized");
  });

  it("accent diturunkan dari ALAMAT, bukan dari nomor urut tampilan", () => {
    // Nilai b1.accent dan b3.accent kebetulan bisa kembar bila diuji lewat
    // satu alamat saja (mis. "kontrak-uji" dan nomor 7 sama-sama jatuh ke
    // "violet" lewat rumus mod 3) — itu tidak membuktikan APA yang dipakai
    // keBallot untuk menghitungnya. Uji ini memutus kebetulan itu: mengubah
    // NOMOR sambil menahan ALAMAT (b1 vs b2) harus TIDAK mengubah accent;
    // mengubah ALAMAT sambil menahan NOMOR (b1 vs b3) harus mengubahnya.
    const b1 = keBallot(terbacaSintetis("0", 1), { nomor: 1, sekarangMs: 0 });
    const b2 = keBallot(terbacaSintetis("0", 1), { nomor: 99, sekarangMs: 0 });
    const b3 = keBallot(terbacaSintetis("1", 1), { nomor: 1, sekarangMs: 0 });
    expect(b1.accent).toBe("mint");
    expect(b2.accent).toBe("mint");
    expect(b3.accent).toBe("violet");
  });

  it("memadatkan pasangan tallies MENTAH ke larik terurut-indeks, lubang jadi nol", () => {
    const b = terbacaSintetis("kontrak-tallies", 1, {
      optionCount: 3,
      opsi: ["O0", "O1", "O2"],
      // Kunci 1 SENGAJA tidak ada — map jarang. Urutan pasangan dibalik
      // sengaja (indeks 2 lebih dulu) supaya padatkanTallies harus benar-
      // benar mengindeks, bukan menyalin urutan array mentah apa adanya.
      tallies: [
        [2, 5],
        [0, 3],
      ],
      talliedCount: 8,
    });
    const out = keBallot(b, { nomor: 1, sekarangMs: 0 });
    expect(out.tallies).toEqual([3, 0, 5]);
  });
});

describe("formatDeadlineUtc", () => {
  it("memformat pada UTC dan menuliskannya, apa pun TZ mesin", () => {
    const teks = formatDeadlineUtc(0);
    expect(teks).toMatch(/UTC$/);
    expect(teks).toContain("1970");
  });

  it("memberi hasil yang sama untuk ms yang sama pada dua pemanggilan", () => {
    const b = daftar[0];
    expect(formatDeadlineUtc(b.voteDeadlineMs)).toBe(b.deadline);
  });

  it("memformat nilai konkret ke teks konkret (bukan hanya pola)", () => {
    // Diverifikasi terpisah lewat node -e sebelum ditulis di sini.
    expect(formatDeadlineUtc(2_000_000_000)).toBe("Jan 24, 1970, 03:33 UTC");
  });
});

describe("formatDeadlineUtc — praperiksa P2: memaksa timeZone eksplisit, bukan bergantung ke TZ proses", () => {
  const TZ_ASLI = process.env.TZ;

  afterEach(() => {
    process.env.TZ = TZ_ASLI;
    vi.resetModules();
  });

  it("tetap memformat sebagai UTC walau TZ proses BUKAN UTC", async () => {
    // vitest.config.ts mematok TZ=UTC untuk SELURUH proses uji (lihat komentar
    // di sana), sehingga memformat TANPA `timeZone: "UTC"` eksplisit tetap
    // kebetulan benar di bawah konfigurasi itu — lihat praperiksa P2. Uji di
    // atas ("memformat pada UTC …") karena itu TIDAK dapat menangkap
    // penghapusan opsi timeZone eksplisit dari FORMAT_DEADLINE.
    //
    // Uji ini memutus kebetulan itu: TZ proses diubah ke zona LAIN, lalu
    // modul diimpor ULANG lewat vi.resetModules() + import() dinamis, karena
    // FORMAT_DEADLINE adalah singleton level-modul yang dibuat SEKALI saat
    // modul pertama kali diimpor. Bila `timeZone: "UTC"` pernah terhapus,
    // formatter baru ini akan default ke TZ proses ("America/New_York") dan
    // keluarannya berubah — diverifikasi lewat node -e sebelum ditulis di sini.
    process.env.TZ = "America/New_York";
    vi.resetModules();
    const { formatDeadlineUtc: formatDenganTzLain } = await import("./ke-ballot");
    // 00:30 UTC, 2 Jan 1970 == 19:30, 1 Jan 1970 di America/New_York (UTC-5).
    const ms = Date.UTC(1970, 0, 2, 0, 30);
    expect(formatDenganTzLain(ms)).toBe("Jan 2, 1970, 00:30 UTC");
  });
});

describe("accentDariAlamat", () => {
  it("memetakan alamat ke warna PERSIS ini, diturunkan tangan dari rumus (jumlah kode karakter mod 3)", () => {
    // "0".charCodeAt(0) % 3 === 0 -> mint; "1" -> sisa 1 -> violet;
    // "2" -> sisa 2 -> blue. Diverifikasi terpisah lewat node -e.
    expect(accentDariAlamat("0")).toBe("mint");
    expect(accentDariAlamat("1")).toBe("violet");
    expect(accentDariAlamat("2")).toBe("blue");
  });

  it("stabil untuk alamat yang sama pada dua pemanggilan berturutan", () => {
    expect(accentDariAlamat("alamat-tetap")).toBe(accentDariAlamat("alamat-tetap"));
  });

  it("hanya menghasilkan accent yang punya kelas di index.css, untuk seluruh ballot fixture", () => {
    for (const b of daftar) expect(["mint", "violet", "blue"]).toContain(b.accent);
  });
});

describe("labelNomor", () => {
  it("memberi tiga digit", () => {
    expect(labelNomor(1)).toBe("Ballot 001");
    expect(labelNomor(42)).toBe("Ballot 042");
  });
});

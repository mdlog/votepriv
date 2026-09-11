import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GalatRantai } from "./graphql";
import { bacaRantai } from "./baca-rantai";
import type { JaringanAktif } from "./endpoint";

const DIR = new URL("../../test/fixture-rantai/", import.meta.url);
const baca = (n: string) => JSON.parse(readFileSync(new URL(n, DIR), "utf8"));
const fxRegistry = baca("registry.json");
const fxBallots = baca("ballots.json");
const fxJaringan = baca("jaringan.json");
const meta = baca("meta.json");

const JARINGAN: JaringanAktif = {
  networkId: meta.jaringan,
  indexer: meta.endpoint,
  indexerWS: "wss://contoh.test/ws",
  alamatRegistry: meta.alamatRegistry,
};

/**
 * fetch palsu yang memilih jawaban menurut nama operasi di dokumen.
 * `ubah` memungkinkan tiap uji merusak satu jawaban tanpa menyalin fixture.
 *
 * Ia juga MEMANGKAS jawaban agar sesuai dokumen yang benar-benar dikirim.
 * Fixture merekam SUPERSET — `terbaru` ada pada setiap ballot — supaya menyetel
 * MAKS_BALLOT_BERAKSI tidak menuntut rekam ulang. Tanpa pemangkasan ini, uji
 * akan melihat riwayat aksi pada ballot yang aplikasinya TIDAK MEMINTANYA, dan
 * gerbang jendela biaya berhenti menggigit.
 *
 * CATATAN (praperiksa P1): fixture hanya memuat DUA ballot, jauh di bawah
 * MAKS_BALLOT_BERAKSI (6) — jadi pemangkas ini pada berkas ini SENDIRI tidak
 * pernah benar-benar menghapus `terbaru` (kedua alias selalu memakai ...Penuh).
 * Itu bukan kesalahan pemangkas ini; itu batas fixture. Gerbang jendela
 * Penuh/Ringkas dan penghitungan lintas-dokumen diuji SUNGGUHAN, dengan angka
 * yang dipaku, di baca-rantai.registry-sintetis.test.ts lewat registry
 * sintetis yang addressnya sengaja melebihi MAKS_BALLOT_BERAKSI dan
 * MAKS_ALAMAT_PER_DOKUMEN.
 */
function pangkasMenurutDokumen(query: string, jawaban: any): any {
  if (!/query Ballots/.test(query) || !jawaban?.data) return jawaban;
  for (const [alias, isi] of Object.entries(jawaban.data as Record<string, any>)) {
    if (!isi) continue;
    // Indexer menghilangkan kunci `terbaru` sepenuhnya pada alias ...Ringkas —
    // diverifikasi terhadap indexer sungguhan. Ditiru apa adanya di sini.
    const memakaiPenuh = new RegExp(`\\b${alias}:\\s*contract\\([^)]*\\)\\s*\\{\\s*\\.\\.\\.Penuh\\s*\\}`).test(query);
    if (!memakaiPenuh) delete isi.terbaru;
  }
  return jawaban;
}

function ambilPalsu(ubah: (nama: string, jawaban: any) => any = (_n, j) => j): typeof fetch {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
    const asli =
      nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
    const jawaban = ubah(nama, pangkasMenurutDokumen(body.query, structuredClone(asli)));
    return new Response(JSON.stringify(jawaban), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("bacaRantai — jalur sehat", () => {
  it("membaca registry, seluruh ballot, dan keadaan jaringan dalam tiga POST", async () => {
    const ambil = ambilPalsu();
    const h = await bacaRantai({ jaringan: JARINGAN, ambil });
    // Nilai DITURUNKAN dari fixture; tidak ada angka yang diketik di sini.
    expect(h.registry.alamat).toEqual(fxBallots.alamat);
    expect(h.ballot).toHaveLength(fxBallots.alamat.length);
    expect(h.gagal).toEqual([]);
    expect(h.blok.height).toBe(fxJaringan.data.block.height);
    expect(h.sekarangMs).toBe(fxJaringan.data.block.timestamp);
    expect(h.epoch?.epochNo).toBe(fxJaringan.data.currentEpochInfo.epochNo);
    // Tepat tiga POST: satu registry, satu ballot (fixture di bawah batas keping), satu jaringan.
    expect((ambil as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(3);
  });

  it("memakai jam RANTAI sebagai sekarangMs ketika POST 3 berhasil, bukan jam perangkat", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    // Satu-satunya assert bernilai yang berlaku di sini: sekarangMs adalah
    // TEPAT stempel waktu blok fixture. (praperiksa P7: baris pembanding
    // terhadap Date.now() dihapus — ia trivial benar bahkan ketika sekarangMs
    // diganti Date.now() sungguhan, karena dua panggilan Date.now() yang
    // berbeda beberapa milidetik nyaris pasti tidak sama juga; assert seperti
    // itu tidak menangkap bug apa pun, dan bergantung pada nilai hidup pula.)
    expect(h.sekarangMs).toBe(fxJaringan.data.block.timestamp);
  });

  it("membawa deployHeight untuk setiap ballot — sumber nomor urut yang stabil", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    for (const b of h.ballot) expect(b.deployHeight).toBeGreaterThan(0);
  });

  it("MENDEKODE state setiap aksi dan menghasilkan selisih — Recent activity DIBACA, bukan disimpulkan", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    const semua = [...h.registry.aksi, ...h.ballot.flatMap(b => b.aksi)];
    expect(semua.length).toBeGreaterThan(0);

    // Bentuknya: state MENTAH tidak pernah sampai ke sini. Kalau ia masih ada,
    // berarti ~11,5 KB per aksi dibawa tanpa pembaca — dan klaim "dibaca" palsu.
    for (const a of semua) {
      expect(a).not.toHaveProperty("state");
      expect(typeof a.height).toBe("number");
      expect(typeof a.cuplikanTerbaca).toBe("boolean");
    }

    // Isinya: SEKURANG-KURANGNYA satu aksi punya selisih yang benar-benar
    // dihitung. Tanpa assert ini, seluruh jalur dekode boleh gagal diam-diam dan
    // panelnya kembali jadi label dari entryPoint.
    const berselisih = semua.filter(a => a.perubahan.length > 0);
    expect(berselisih.length).toBeGreaterThan(0);

    // Dan setiap selisih benar-benar selisih: dari ≠ ke, pada bidang yang dikenal.
    for (const a of berselisih) {
      for (const p of a.perubahan) {
        expect(["voteCount", "talliedCount", "registeredCount", "phase", "count"]).toContain(p.bidang);
        expect(p.dari).not.toBe(p.ke);
      }
    }
  });

  it("menyatakan pendahulu yang TIDAK terbaca alih-alih melaporkannya sebagai tanpa perubahan", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    for (const daftar of [h.registry.aksi, ...h.ballot.map(b => b.aksi)]) {
      if (daftar.length === 0) continue;
      // Aksi paling tua di dalam jendela actions(limit: 5) tidak punya pendahulu
      // di dalam jendela itu. Ia WAJIB mengaku, bukan berbunyi "no change".
      const palingTua = daftar[daftar.length - 1];
      expect(palingTua.pendahuluTerbaca).toBe(false);
      expect(palingTua.perubahan).toEqual([]);
    }
  });

  it("HANYA mengambil riwayat aksi untuk ballot di dalam jendela, dan tidak berpura-pura untuk sisanya", async () => {
    const ambil = ambilPalsu();
    const h = await bacaRantai({ jaringan: JARINGAN, ambil });
    // Dokumen Ballots memakai ...Penuh hanya untuk alias terdepan. Diturunkan
    // dari dokumen yang benar-benar dikirim, bukan dari konstanta yang diketik.
    const panggilan = (ambil as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const dok = panggilan.map(([, init]) => JSON.parse(String(init.body))).find(b => /query Ballots/.test(b.query));
    const nPenuh = (String(dok.query).match(/\.\.\.Penuh/g) ?? []).length;
    // Ballot yang memakai ...Ringkas tidak punya aksi sama sekali — dan itu
    // "tidak diambil", bukan "tidak ada aksi".
    const nBerAksi = h.ballot.filter(b => b.aksi.length > 0).length;
    expect(nBerAksi).toBeLessThanOrEqual(nPenuh);
  });
});

describe("bacaRantai — kegagalan SEBAGIAN tetap menampilkan sisanya", () => {
  it("mencatat alias yang HILANG tanpa menghapus ballot lain", async () => {
    const h = await bacaRantai({
      jaringan: JARINGAN,
      ambil: ambilPalsu((nama, j) => {
        if (nama !== "Ballots") return j;
        // Bentuk yang diverifikasi terhadap indexer sungguhan: kunci alias yang
        // gagal HILANG dari data, dan errors terisi. Ia tidak bernilai null.
        delete j.data.b0;
        j.errors = [{ message: "invalid address: cannot hex-decode: odd number of digits" }];
        return j;
      }),
    });
    expect(h.ballot).toHaveLength(fxBallots.alamat.length - 1);
    expect(h.gagal.map(g => g.sebab)).toContain("alias-hilang");
  });

  it("membedakan kontrak-null dari alias-hilang", async () => {
    const h = await bacaRantai({
      jaringan: JARINGAN,
      ambil: ambilPalsu((nama, j) => {
        if (nama !== "Ballots") return j;
        j.data.b0 = null;
        return j;
      }),
    });
    expect(h.gagal.map(g => g.sebab)).toContain("kontrak-null");
  });

  it("mencatat state yang gagal didekode tanpa menjatuhkan pembacaan", async () => {
    const h = await bacaRantai({
      jaringan: JARINGAN,
      ambil: ambilPalsu((nama, j) => {
        if (nama !== "Ballots") return j;
        // State registry yang dipaksa masuk sebagai ballot: bentuk kegagalan yang
        // PERSIS dialami entri sampah di registry.
        j.data.b0.state = fxRegistry.data.r.state;
        return j;
      }),
    });
    expect(h.ballot).toHaveLength(fxBallots.alamat.length - 1);
    expect(h.gagal.find(g => g.sebab === "dekode")).toBeDefined();
  });

  it("TIDAK pernah mengirim alamat yang bukan hex ke indexer", async () => {
    const ambil = ambilPalsu((nama, j) => {
      if (nama !== "Registry") return j;
      return j;
    });
    await bacaRantai({ jaringan: JARINGAN, ambil });
    const panggilan = (ambil as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const dokBallot = panggilan.map(([, init]) => JSON.parse(String(init.body))).find(b => /query Ballots/.test(b.query));
    for (const nilai of Object.values(dokBallot.variables as Record<string, string>)) {
      expect(nilai).toMatch(/^[0-9a-fA-F]+$/);
    }
    // CATATAN (praperiksa P2): fixture registry hanya berisi alamat hex yang
    // SAH, jadi assert di atas saja tidak pernah bisa merah — saringan
    // alamatKontrakValid() bisa dihapus seluruhnya dari baca-rantai.ts dan uji
    // ini tetap hijau. Penyaringan sungguhan (dengan entri sampah beneran, dan
    // dengan nilai gagal[] yang dipaku) diuji di
    // baca-rantai.registry-sintetis.test.ts, yang bisa mengarang isi
    // registry.ballots lewat ledger sintetis alih-alih fixture rekaman.
  });

  /**
   * Praperiksa P5: `cuplikanTerbaca` sebelumnya hanya diuji BENTUKNYA
   * (typeof === "boolean"), tidak pernah dipaksa menjadi false. Uji ini
   * merusak `state` SATU AKSI (bukan state kontrak keseluruhan, yang sudah
   * diuji di atas) sehingga cuplikanBallot() melempar dan catch-nya di
   * baca-rantai.ts benar-benar tereksekusi.
   */
  it("mencatat state SATU AKSI yang gagal didekode tanpa menjatuhkan ballot atau aksi lain", async () => {
    // b0 (f26827a7...) adalah ballot dengan 5 aksi di fixture. Aksi indeks 2
    // (tengah) dirusak: itu memungkinkan memeriksa DUA efek sekaligus — aksi
    // itu sendiri, dan tetangganya yang lebih baru (indeks 1) yang pendahulunya
    // jadi tidak terbaca.
    const h = await bacaRantai({
      jaringan: JARINGAN,
      ambil: ambilPalsu((nama, j) => {
        if (nama !== "Ballots") return j;
        j.data.b0.terbaru[2].state = "bukan-hex-sama-sekali";
        return j;
      }),
    });
    const b0 = h.ballot.find(b => b.alamat === fxBallots.alamat[0]);
    expect(b0).toBeDefined();
    expect(b0!.aksi).toHaveLength(5);

    const rusak = b0!.aksi[2];
    expect(rusak.cuplikanTerbaca).toBe(false);
    expect(rusak.perubahan).toEqual([]);
    expect(rusak.pendahuluTerbaca).toBe(false);

    // Tetangga yang lebih baru: cuplikan-nya SENDIRI tetap terbaca, tapi
    // pendahulunya (indeks 2, yang baru dirusak) tidak — jadi ia TIDAK BOLEH
    // melaporkan "tidak ada perubahan" seakan-akan dibandingkan.
    const tetangga = b0!.aksi[1];
    expect(tetangga.cuplikanTerbaca).toBe(true);
    expect(tetangga.pendahuluTerbaca).toBe(false);
    expect(tetangga.perubahan).toEqual([]);
  });
});

describe("bacaRantai — kegagalan TOTAL", () => {
  it("melempar ketika registry bernilai null, dengan pesan yang menyebut jaringan", async () => {
    const ambil = ambilPalsu((nama, j) => (nama === "Registry" ? { data: { r: null }, errors: [] } : j));
    await expect(bacaRantai({ jaringan: JARINGAN, ambil })).rejects.toThrow(
      new RegExp(`No contract exists at registry address .* on the ${JARINGAN.networkId} network`),
    );
  });

  /**
   * Praperiksa P3: kunci `r` yang HILANG (bukan bernilai null) adalah bentuk
   * kegagalan yang diverifikasi nyata di graphql.ts (lihat komentar
   * JawabanGraphQL di sana) tapi tidak pernah diuji di Task 5 sebelumnya.
   * Tanpa perbaikan kode, ini melempar TypeError mentah, bukan GalatRantai.
   */
  it("melempar GalatRantai bersebab registry-hilang ketika kunci r HILANG SELURUHNYA, bukan hanya null", async () => {
    const ambil = ambilPalsu((nama, j) =>
      nama === "Registry" ? { data: {}, errors: [{ message: "invalid address: cannot hex-decode" }] } : j,
    );
    await expect(bacaRantai({ jaringan: JARINGAN, ambil })).rejects.toMatchObject({
      sebab: "registry-hilang",
    });
  });

  it("melempar GalatRantai bersebab jaringan ketika fetch menolak", async () => {
    const ambil = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(bacaRantai({ jaringan: JARINGAN, ambil })).rejects.toMatchObject({
      sebab: "jaringan",
    });
  });
});

describe("bacaRantai — POST 3 TIDAK PERNAH menjatuhkan pembacaan", () => {
  it("tetap mengembalikan ballot ketika kueri jaringan gagal, dengan epoch null", async () => {
    const ambil = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
      if (nama === "Jaringan") return new Response("upstream down", { status: 502, headers: { "content-type": "text/plain" } });
      const asli = nama === "Registry" ? fxRegistry : fxBallots.jawaban;
      return new Response(JSON.stringify(asli), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const sebelum = Date.now();
    const h = await bacaRantai({ jaringan: JARINGAN, ambil });
    const sesudah = Date.now();
    expect(h.ballot).toHaveLength(fxBallots.alamat.length);
    expect(h.epoch).toBeNull();
    // Tinggi blok jatuh ke yang tertinggi di antara aksi kontrak — DIBACA dari
    // rantai, bukan ditebak, dan bukan nol.
    expect(h.blok.height).toBeGreaterThan(0);

    // Praperiksa P4: sekarangMs TIDAK LAGI sama dengan h.blok.timestampMs di
    // sini. Diukur pada fixture ini: aksi tertinggi yang terlihat (finalize
    // pada b0) sudah 5.309 blok / 8,875 jam di belakang POST 3 sungguhan yang
    // fixture jaringan.json rekam pada waktu yang sama — memakainya apa adanya
    // sebagai "sekarang" akan membuat ballot yang deadline-nya lewat di jendela
    // mundur itu tampil "Live now". Jam perangkat sekarang dipakai sebagai
    // BATAS BAWAH: sekarangMs tidak pernah lebih kecil dari waktu nyata saat
    // panggilan ini berjalan. Assert di sini SENGAJA berupa rentang, bukan
    // nilai tunggal yang dipaku — beda dengan uji lain di berkas ini — karena
    // nilai yang benar di jalur fallback ini memang bergantung pada jam
    // perangkat SAAT UJI BERJALAN, bukan pada fixture yang beku.
    expect(h.sekarangMs).toBeGreaterThanOrEqual(sebelum);
    expect(h.sekarangMs).toBeLessThanOrEqual(sesudah);
    // Dan tetap tidak pernah mundur dari angka rantai yang berhasil dibaca.
    expect(h.sekarangMs).toBeGreaterThanOrEqual(h.blok.timestampMs);
  });
});

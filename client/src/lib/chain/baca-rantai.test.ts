import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GalatRantai } from "./graphql";
import { bacaRantai } from "./baca-rantai";
import type { JaringanAktif } from "./endpoint";
import {
  galatVariabelHilang,
  proyeksikanJawabanJaringan,
  proyeksikanJawabanKontrak,
} from "../../test/proyeksi-kueri-rantai";

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
 * Ia juga MEMPROYEKSIKAN jawaban menurut field yang BENAR-BENAR diminta pada
 * teks kueri yang dikirim (lewat proyeksi-kueri-rantai.ts) — bukan hanya
 * menghapus kunci `terbaru` per alias seperti sebelumnya. Fixture merekam
 * SUPERSET — setiap field ada pada setiap ballot — supaya menyetel
 * MAKS_BALLOT_BERAKSI atau mengubah field yang diminta di kueri.ts tidak
 * menuntut rekam ulang; proyektorlah yang memutuskan apa yang benar-benar
 * "dijawab". Tanpa proyeksi field ini, menghapus `state` dari BIDANG_DASAR,
 * menghapus `state` dari blok `terbaru:`, atau mengubah `limit: 5` menjadi
 * `limit: 1` di kueri.ts tidak mengubah jawaban palsu sama sekali — celah
 * yang mutasi M5/M6/M7 buktikan nyata (lihat task-5-hasil-mutasi.md).
 *
 * CATATAN (praperiksa P1): fixture hanya memuat DUA ballot, jauh di bawah
 * MAKS_BALLOT_BERAKSI (6) — jadi berkas ini SENDIRI tidak pernah benar-benar
 * menghapus `terbaru` lewat batas MAKS_BALLOT_BERAKSI (kedua alias selalu
 * memakai ...Penuh). Itu bukan kekurangan proyektor; itu batas fixture.
 * Gerbang jendela Penuh/Ringkas dan penghitungan lintas-dokumen diuji
 * SUNGGUHAN, dengan angka yang dipaku, di
 * baca-rantai.registry-sintetis.test.ts lewat registry sintetis yang
 * addressnya sengaja melebihi MAKS_BALLOT_BERAKSI dan MAKS_ALAMAT_PER_DOKUMEN.
 */
function proyeksikanMenurutKueri(nama: string, query: string, jawaban: any): any {
  if ((nama === "Registry" || nama === "Ballots") && jawaban?.data) {
    return { ...jawaban, data: proyeksikanJawabanKontrak(query, jawaban.data) };
  }
  if (nama === "Jaringan" && jawaban?.data) {
    return { ...jawaban, data: proyeksikanJawabanJaringan(query, jawaban.data) };
  }
  return jawaban;
}

function ambilPalsu(ubah: (nama: string, jawaban: any) => any = (_n, j) => j): typeof fetch {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
    // Korespondensi nama variabel: kunci `variables` yang dikirim (`a0`, …)
    // harus sama persis dengan `$a0`, … yang dideklarasikan tanda tangan
    // operasi. Terhadap indexer sungguhan, ketidakcocokan ini adalah galat
    // validasi yang menjatuhkan SELURUH kueri — ditiru di sini alih-alih
    // diabaikan seperti sebelumnya (lihat proyeksi-kueri-rantai.ts).
    const errVar = galatVariabelHilang(body.query, body.variables);
    if (errVar.length > 0) {
      return new Response(JSON.stringify({ data: null, errors: errVar }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const asli =
      nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
    const jawaban = ubah(nama, proyeksikanMenurutKueri(nama, body.query, structuredClone(asli)));
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
    // Nilai PERSIS untuk b0, diturunkan dari fixture (dekode ContractDeploy
    // asli): bukan hanya "positif", supaya k.deploy[0]?.transaction.block.height
    // tertukar dengan bidang lain (mis. .timestamp) benar-benar jatuh.
    const b0 = h.ballot.find(b => b.alamat === fxBallots.alamat[0]);
    expect(b0!.deployHeight).toBe(fxBallots.jawaban.data.b0.deploy[0].transaction.block.height);
  });

  it("memaku registry.count ke jumlah alamat registry sungguhan — bidang yang sebelumnya tak pernah diassert", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    expect(h.registry.count).toBe(fxBallots.alamat.length);
  });

  /**
   * Memaku SETIAP bidang AksiTerbaca yang sebelumnya tidak pernah diassert
   * sama sekali (jenis, entryPoint, txHash, timestampMs, sumber), dan yang
   * paling penting: `height` vs `timestampMs` TIDAK BOLEH tertukar. Nilainya
   * diturunkan langsung dari ballots.json/registry.json (superset lengkap
   * yang dikirim ke proyektor kueri di atas), bukan diketik bebas.
   */
  it("memaku jenis, entryPoint, txHash, height, timestampMs, dan sumber pada aksi ballot yang diketahui — tidak tertukar", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    const b0 = h.ballot.find(b => b.alamat === fxBallots.alamat[0]);
    expect(b0).toBeDefined();
    const aksiMentah = fxBallots.jawaban.data.b0.terbaru[0];
    const aksi0 = b0!.aksi[0];
    expect(aksi0.jenis).toBe("ContractCall");
    expect(aksi0.jenis).toBe(aksiMentah.__typename);
    expect(aksi0.entryPoint).toBe("finalize");
    expect(aksi0.entryPoint).toBe(aksiMentah.entryPoint);
    expect(aksi0.txHash).toBe(aksiMentah.transaction.hash);
    expect(aksi0.height).toBe(aksiMentah.transaction.block.height);
    expect(aksi0.timestampMs).toBe(aksiMentah.transaction.block.timestamp);
    // height dan timestampMs TIDAK boleh sama di fixture ini — kalau kebetulan
    // sama, uji di atas tidak bisa membedakan keduanya tertukar (M10).
    expect(aksi0.height).not.toBe(aksi0.timestampMs);
    // sumber ballot adalah JUDUL ballot yang didekode, bukan konstanta.
    expect(aksi0.sumber).toBe(b0!.keadaan.title);
    expect(aksi0.sumber).not.toBe("Registry");
  });

  it("memaku jenis, entryPoint, txHash, height, dan timestampMs pada aksi REGISTRY yang diketahui (ContractDeploy tertua) — sumber selalu 'Registry'", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    const aksiMentah = fxRegistry.data.r.terbaru[fxRegistry.data.r.terbaru.length - 1];
    const tertua = h.registry.aksi[h.registry.aksi.length - 1];
    expect(tertua.jenis).toBe("ContractDeploy");
    expect(tertua.jenis).toBe(aksiMentah.__typename);
    expect(tertua.entryPoint).toBeNull();
    expect(tertua.txHash).toBe(aksiMentah.transaction.hash);
    expect(tertua.height).toBe(aksiMentah.transaction.block.height);
    expect(tertua.timestampMs).toBe(aksiMentah.transaction.block.timestamp);
    expect(tertua.height).not.toBe(tertua.timestampMs);
    expect(tertua.sumber).toBe("Registry");
  });

  /**
   * K1: isi `perubahan` DIPAKU ke nilai konkret pada satu aksi BALLOT yang
   * diketahui — bukan sekadar "dari ≠ ke" seperti uji lama. Tanpa ini,
   * membalik arah (`dari`/`ke` tertukar, M3) atau mengosongkan seluruh isi
   * cuplikanBallot() (M2) lolos, karena satu-satunya assert isi sebelumnya
   * terpenuhi SELURUHNYA oleh selisih aksi REGISTRY — lihat temuan K1 di
   * task-5-hasil-mutasi.md. b0.aksi[1] (tallyVote, height 813948) punya
   * pendahulu b0.aksi[2] (tallyVote, height 813944) dengan talliedCount 2;
   * b0.aksi[1] sendiri talliedCount 3 — SATU-SATUNYA bidang yang berubah di
   * pasangan ini, jadi arah dan isinya bisa dipaku PERSIS tanpa ambiguitas.
   */
  it("memaku isi DAN ARAH perubahan pada satu aksi ballot yang diketahui — menutup jalur M2/M3 yang tidak bisa diselamatkan aksi registry", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    const b0 = h.ballot.find(b => b.alamat === fxBallots.alamat[0]);
    const aksi1 = b0!.aksi[1];
    expect(aksi1.entryPoint).toBe("tallyVote");
    expect(aksi1.perubahan).toEqual([{ bidang: "talliedCount", dari: 2, ke: 3 }]);
  });

  /**
   * M19: `perubahan` mencatat SEMUA bidang yang berubah pada satu aksi, bukan
   * hanya yang pertama ditemukan. b0.aksi[3] (tallyVote, height 813940)
   * dibanding pendahulunya b0.aksi[4] (castVote, height 813349) punya DUA
   * bidang yang berubah sekaligus: talliedCount (0→1) dan phase (0→1).
   * Menambahkan `break;` setelah `perubahan.push(...)` di baca-rantai.ts akan
   * memotong larik ini jadi panjang 1 — mutasi itulah yang uji ini tutup.
   */
  it("mencatat SEMUA bidang yang berubah pada satu aksi, bukan hanya yang pertama (M19)", async () => {
    const h = await bacaRantai({ jaringan: JARINGAN, ambil: ambilPalsu() });
    const b0 = h.ballot.find(b => b.alamat === fxBallots.alamat[0]);
    const aksi3 = b0!.aksi[3];
    expect(aksi3.entryPoint).toBe("tallyVote");
    expect(aksi3.perubahan).toEqual([
      { bidang: "talliedCount", dari: 0, ke: 1 },
      { bidang: "phase", dari: 0, ke: 1 },
    ]);
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

  /**
   * M4: penjaga try/catch di cuplikanRegistry() sebelumnya tidak disentuh uji
   * mana pun — menghapusnya seluruhnya tetap lolos hijau. Uji ini merusak
   * `state` SATU AKSI REGISTRY (padanan uji P5 di atas, tapi untuk registry,
   * bukan ballot) sehingga dekodeRegistry() di dalam cuplikanRegistry()
   * melempar, dan catch-nya benar-benar tereksekusi: aksi itu sendiri jadi
   * cuplikanTerbaca=false, TANPA menjatuhkan bacaRantai() atau ballot lain.
   */
  it("mencatat state SATU AKSI REGISTRY yang gagal didekode tanpa menjatuhkan bacaRantai() (M4)", async () => {
    // registry.json fixture punya 3 aksi (register, register, ContractDeploy).
    // Indeks 1 (register, height 810840) dirusak: tetangganya yang lebih baru
    // (indeks 0) lalu kehilangan pendahulu yang terbaca.
    const h = await bacaRantai({
      jaringan: JARINGAN,
      ambil: ambilPalsu((nama, j) => {
        if (nama !== "Registry") return j;
        j.data.r.terbaru[1].state = "bukan-hex-sama-sekali";
        return j;
      }),
    });
    // Tidak menjatuhkan pembacaan: ballot tetap lengkap seperti jalur sehat.
    expect(h.ballot).toHaveLength(fxBallots.alamat.length);
    expect(h.gagal).toEqual([]);

    expect(h.registry.aksi).toHaveLength(3);
    const rusak = h.registry.aksi[1];
    expect(rusak.cuplikanTerbaca).toBe(false);
    expect(rusak.perubahan).toEqual([]);
    expect(rusak.pendahuluTerbaca).toBe(false);

    const tetangga = h.registry.aksi[0];
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
   *
   * Sebabnya "registry-skema", BUKAN "registry-hilang": kunci `r` yang hilang
   * berarti kuerinya sendiri gagal divalidasi (alias/skema), sedangkan
   * "registry-hilang" (uji di atas) berarti kuerinya SAH dan indexer benar-
   * benar menjawab "tidak ada kontrak". Melaporkan keduanya sama pernah
   * terjadi di Task 5 — lihat konflasi P3 di laporan mutasi.
   */
  it("melempar GalatRantai bersebab registry-skema (BUKAN registry-hilang) ketika kunci r HILANG SELURUHNYA, bukan hanya null", async () => {
    const ambil = ambilPalsu((nama, j) =>
      nama === "Registry" ? { data: {}, errors: [{ message: "invalid address: cannot hex-decode" }] } : j,
    );
    await expect(bacaRantai({ jaringan: JARINGAN, ambil })).rejects.toMatchObject({
      sebab: "registry-skema",
    });
    // Rincian menyebut galat skema/alias yang sesungguhnya (dari errors[]),
    // BUKAN kalimat "No contract exists…" milik registry-hilang — itu
    // kalimat yang salah kalau sebab sesungguhnya adalah galat kueri.
    const ambil2 = ambilPalsu((nama, j) =>
      nama === "Registry" ? { data: {}, errors: [{ message: "invalid address: cannot hex-decode" }] } : j,
    );
    await expect(bacaRantai({ jaringan: JARINGAN, ambil: ambil2 })).rejects.toMatchObject({
      rincian: expect.stringContaining("invalid address: cannot hex-decode"),
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

  /**
   * M22 (bug nyata, bukan hanya prediksi mutasi — lihat task-5-hasil-mutasi.md):
   * POST 3 sebelumnya TIDAK memeriksa keberadaan kunci block.height/
   * block.timestamp sebelum membacanya — satu-satunya dari tiga POST yang
   * begitu, padahal praperiksa P3 baru saja memaksa perbaikan yang sama di
   * POST 1. Tanpa perbaikan itu, kunci `timestamp` yang hilang dari jawaban
   * membuat `sekarangMs` menjadi `undefined` secara DIAM-DIAM: tidak ada
   * entri gagal[], tidak ada GalatRantai, padahal tipenya `number`. Uji ini
   * membuktikan perbaikannya: dengan kunci `timestamp` hilang, POST 3
   * dianggap GAGAL dan bacaRantai() jatuh ke jalur fallback yang SUDAH ADA
   * (tinggi aksi kontrak / jam perangkat) — bukan mewariskan nilai rusak.
   */
  it("jatuh ke fallback POST-3-gagal ketika kunci timestamp HILANG dari block, bukan mewariskan sekarangMs=undefined (M22)", async () => {
    const ambil = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
      if (nama === "Jaringan") {
        // Kunci `timestamp` HILANG (bukan bernilai null) — bentuk yang sama
        // yang praperiksa P3 verifikasi untuk kunci `r` di POST 1.
        return new Response(
          JSON.stringify({
            data: { block: { height: 819599, hash: "x" } },
            errors: [{ message: "timestamp unavailable" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      const asli = nama === "Registry" ? fxRegistry : fxBallots.jawaban;
      return new Response(JSON.stringify(asli), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const sebelum = Date.now();
    const h = await bacaRantai({ jaringan: JARINGAN, ambil });
    const sesudah = Date.now();
    expect(h.ballot).toHaveLength(fxBallots.alamat.length);
    expect(h.epoch).toBeNull();
    expect(Number.isFinite(h.sekarangMs)).toBe(true);
    // Sama seperti jalur POST-3-gagal biasa di atas: floor terhadap jam
    // perangkat, tidak pernah mundur dari angka rantai yang terlihat.
    expect(h.sekarangMs).toBeGreaterThanOrEqual(sebelum);
    expect(h.sekarangMs).toBeLessThanOrEqual(sesudah);
  });

  /** Penjaga `AbortError` di catch POST 3 (M15) — sebelumnya tidak diuji sama
   * sekali. AbortError adalah PEMBATALAN yang diminta pemanggil, bukan
   * kegagalan; ia HARUS naik apa adanya, bukan ditelan jadi fallback jam
   * perangkat seperti kegagalan biasa. */
  it("meneruskan AbortError POST 3 apa adanya, TIDAK menelannya jadi fallback (M15)", async () => {
    const abortErr = new DOMException("dibatalkan", "AbortError");
    const ambil = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
      if (nama === "Jaringan") throw abortErr;
      const asli = nama === "Registry" ? fxRegistry : fxBallots.jawaban;
      return new Response(JSON.stringify(asli), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    await expect(bacaRantai({ jaringan: JARINGAN, ambil })).rejects.toBe(abortErr);
  });

  /**
   * M12: `Math.max(blok.timestampMs, Date.now())` menjadi `Date.now()` polos
   * TIDAK terdeteksi oleh uji fallback biasa di atas, karena fixture ini
   * BEKU di masa lalu (direkam kemarin) — jam perangkat SELALU lebih besar,
   * jadi Math.max selalu memilih Date.now() juga, kebetulan menghasilkan
   * angka yang sama. Uji ini memaksa kasus di mana angka RANTAI lebih besar
   * dari jam perangkat (aksi dengan stempel waktu jauh di masa depan — tahun
   * 5138, dipaku ke KONSTANTA, bukan bergantung Date.now() saat uji
   * berjalan): floor Math.max WAJIB memilih angka rantai itu, bukan jam
   * perangkat, betapa pun jauhnya angka itu.
   */
  it("memilih angka RANTAI di atas jam perangkat ketika angka rantai itu LEBIH BESAR — floor Math.max, bukan Date.now() polos (M12)", async () => {
    const TS_MASA_DEPAN = 99999999999999; // tahun ~5138: jauh di depan Date.now() kapan pun uji ini berjalan
    const HEIGHT_BESAR = 99999999;
    const ambil = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const nama = /query\s+(\w+)/.exec(body.query)?.[1] ?? "?";
      if (nama === "Jaringan") {
        return new Response("upstream down", { status: 502, headers: { "content-type": "text/plain" } });
      }
      if (nama === "Registry") {
        const j = structuredClone(fxRegistry);
        const proyeksi = proyeksikanJawabanKontrak(body.query, j.data);
        // Aksi registry TERBARU (indeks 0) dipaksa ke tinggi/stempel waktu
        // yang jauh melebihi apa pun yang bisa dihasilkan Date.now() nyata —
        // satu-satunya cara memaksa cabang floor Math.max benar-benar
        // MEMILIH sisi rantai, bukan kebetulan sama dengan jam perangkat.
        const aksiTerbaru = proyeksi.r?.terbaru?.[0];
        if (!aksiTerbaru) throw new Error("proyeksi registry tak terduga: terbaru[0] hilang");
        aksiTerbaru.transaction.block.height = HEIGHT_BESAR;
        aksiTerbaru.transaction.block.timestamp = TS_MASA_DEPAN;
        return new Response(JSON.stringify({ ...j, data: proyeksi }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const j = structuredClone(fxBallots.jawaban);
      const proyeksi = proyeksikanJawabanKontrak(body.query, j.data);
      return new Response(JSON.stringify({ ...j, data: proyeksi }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const h = await bacaRantai({ jaringan: JARINGAN, ambil });
    expect(h.blok.height).toBe(HEIGHT_BESAR);
    expect(h.sekarangMs).toBe(TS_MASA_DEPAN);
  });
});

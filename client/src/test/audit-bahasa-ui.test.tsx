/**
 * PENJAGA MESIN — audit-bahasa-ui (Task: "audit dan perbaiki seluruh teks yang
 * tampil ke pengguna supaya hanya Bahasa Inggris").
 *
 * Bug nyata yang memicu berkas ini: proofServerHop() (client/src/lib/proof-server.ts)
 * menyisipkan "(loopback mesin itu, bukan perangkat Anda)" ke dalam kalimat
 * Inggris yang dirender VoteModal — satu-satunya layar yang PASTI dilihat
 * pemilih saat mencoblos lewat tunnel. Grep kasar menemukan 121 baris kandidat;
 * sebagian besar adalah komentar atau nama variabel Indonesia yang MEMANG boleh
 * ada (konvensi repo) — hanya STRING YANG DIRENDER yang salah.
 *
 * Berkas ini dua arah, sengaja:
 *
 *   A. TIDAK ADA kata Indonesia di teks yang dirender — daftar kata di
 *      POLA_INDONESIA di bawah, dicocokkan dengan batas kata (\b) supaya tidak
 *      salah tangkap substring kebetulan di kata Inggris (mis. "dari" adalah
 *      substring "mandarin", tapi \bdari\b tidak cocok karena tidak ada batas
 *      kata sebelum "d" di posisi itu).
 *   B. ADA teks Inggris yang diharapkan pada setiap kondisi — tanpa ini,
 *      komponen yang gagal total (throw, render kosong) akan LOLOS uji "tidak
 *      ada kata Indonesia" begitu saja, karena tidak ada teks SAMA SEKALI yang
 *      diperiksa. Pola ini terbukti empiris di repo ini (lihat komentar
 *      paritas-permukaan-rantai.test.tsx soal "detektor perubahan vs bukti").
 *
 * CAKUPAN — setiap kondisi yang DAPAT DICAPAI, bukan hanya jalur bahagia:
 *   - KeadaanRantai: SEMBILAN sebab GalatRantai (bukan delapan — lihat
 *     komentar SEMUA_SEBAB di KeadaanRantai.test.tsx), keadaan memuat, spanduk
 *     sebagian.
 *   - VoteModal: KELIMA cabang `reach` proof server (null/lokal-terverifikasi/
 *     lokal-tak-terverifikasi/lewat-host-halaman/remote), keadaan gagal
 *     (GalatOpeningHilang DAN kegagalan generik), tally-open, ballot tertutup.
 *   - RegisterModal: memuat, siap, gagal (dengan pesan IndexedDB SUNGGUHAN
 *     dari kredensial-idb.ts, bukan pesan karangan).
 *   - CreateBallotModal, Docs, BallotCard, Overview (termasuk registry
 *     KOSONG), LiveBallots (termasuk kosong DAN "tidak ditemukan"), Results
 *     (KEEMPAT keadaanHasil + tanda terima simulasi/nyata).
 *   - Home: KEENAM cabang privacy (useMemo, termasuk atribut title= sidebar —
 *     permukaan yang sebelumnya menjadi SATU-SATUNYA tempat peringatan tunnel
 *     hidup, dan pada layar sempit malah tersembunyi total), dan kegagalan
 *     connect wallet ("wallet tidak ada").
 *   - Assert LANGSUNG atas fungsi lib/: proofServerHop, checkProofServer
 *     (ketiga pesan galatnya), statusLabel/statusTag, pesanGagal (kesembilan
 *     sebab), pesanPrivasiSuara/pesanPrivasiBuka (kelima cabang), pesanSuksesVote,
 *     rincian GalatRantai NYATA dari graphql.ts/dekode.ts/baca-rantai.ts (bukan
 *     GalatRantai karangan), WalletError, GalatOpeningHilang, adaptor-lace.
 *
 * BUKTI GUARD BISA MERAH (audit #1): didokumentasikan di
 * .superpowers/audit-bahasa-ui.md — proofServerHop() dikembalikan sementara ke
 * bentuk Indonesia lama, `pnpm vitest run client/src/test/audit-bahasa-ui.test.tsx`
 * dijalankan, hasilnya MERAH pada uji "proofServerHop — tunnel", lalu
 * dikembalikan.
 *
 * ── AUDIT #2 (.superpowers/audit-bahasa-ui-2.md) — DUA KELAS yang audit #1
 * di atas TIDAK menjangkau, karena keduanya bukan STRING TETAP di kode
 * `lib/`/komponen, melainkan `e.message` mentah dari galat yang dilempar saat
 * RUNTIME dan dirender apa adanya oleh `setGalat`/`setOpenGalat`/`setPesanGalat`:
 *
 *   - Kelas 1: `CallTxFailedError` (midnight-js) membungkus salah satu dari
 *     23 string `assert(...)` di pkgs/contract/src/ballot.compact — SEMUANYA
 *     Indonesia, dan TIDAK BOLEH diubah di sana (lihat keputusan tugas #2:
 *     mengubahnya menuntut membangun ulang artefak ZK). Ditutup di klien lewat
 *     `terjemahkanGalatRantai` (client/src/lib/chain/pesan-rantai.ts),
 *     dipasang di KEDUA titik `setGalat`/`setOpenGalat` VoteModal.tsx dan di
 *     `setPesanGalat`/`setGalatPulih` RegisterModal.tsx. Diuji langsung di
 *     bawah (ke-23 pesan, dipaku ke nilai Inggris) DAN lewat render VoteModal
 *     dengan pesan terbungkus ala CallTxFailedError.
 *   - Kelas 2: galat jalur tulis biasa (bukan assert kontrak) di
 *     client/src/lib/chain/eligibility-tulis.ts yang SEBELUMNYA Indonesia
 *     (`GalatEligibility` — "ballot belum terlihat di indexer", "tidak
 *     ditemukan setelah N percobaan" dengan dua varian sebab) — diperbaiki
 *     LANGSUNG di sumbernya (bukan lewat pesan-rantai.ts), diuji di
 *     eligibility-tulis.test.ts (pin diperbarui ke teks Inggris baru).
 *
 * GERBANG BUNDEL BAHASA (bagian D di bawah): dist/public/assets/*.js MEMANG
 * memuat ke-23 string Indonesia (kontrak tergenerasi memuatnya — itu bukan
 * bug, lihat komentar di sana), jadi gerbang itu TIDAK BISA mengassert
 * ketiadaannya. Ia mengassert kehadiran ke-23 PADANAN INGGRIS sebagai bukti
 * `terjemahkanGalatRantai` sungguh ikut ter-bundle dan tidak di-tree-shake.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GalatRantai, bacaRantai } from "@/lib/chain";
import type { HasilRantai, JaringanAktif, SebabGalatRantai } from "@/lib/chain";
import { postGraphQL } from "@/lib/chain/graphql";
import { dekodeRegistry } from "@/lib/chain/dekode";
import { GalatOpeningHilang } from "@/lib/chain/tulis";
import { buatAdaptorLace } from "@/lib/chain/adaptor-lace";
import { terjemahkanGalatRantai } from "@/lib/chain/pesan-rantai";
import type { WalletConnection } from "@/lib/midnight-wallet";
import { describeWalletError, pickConnector, WalletError } from "@/lib/midnight-wallet";
import type { ProofServerStatus } from "@/lib/proof-server";
import { proofServerHop } from "@/lib/proof-server";

import {
  GridBallotMemuat,
  KartuBallotMemuat,
  PanelGagalRantai,
  SpandukSebagian,
  pesanGagal,
} from "@/components/votepriv/KeadaanRantai";
import { statusLabel, statusTag } from "@/components/votepriv/ballot-status";
import { VoteModal, pesanPrivasiBuka, pesanPrivasiSuara } from "@/components/votepriv/VoteModal";
import { RegisterModal } from "@/components/votepriv/RegisterModal";
import { CreateBallotModal } from "@/components/votepriv/CreateBallotModal";
import { Docs } from "@/components/votepriv/Docs";
import { BallotCard } from "@/components/votepriv/BallotCard";
import { Overview } from "@/components/votepriv/Overview";
import { LiveBallots } from "@/components/votepriv/LiveBallots";
import { Results } from "@/components/votepriv/Results";
import { ballotUji } from "@/test/fixture-ballot";
import type { Ballot, Receipt } from "@/components/votepriv/types";

// ─── Mock jalur tulis (SATU-SATUNYA pintu, sama seperti VoteModal.test.tsx
// dan RegisterModal.test.tsx) — berkas uji ini di luar graf statis yang
// batas-bundel.test.ts telusuri, jadi mock ini tidak menyentuh gerbang itu. ──
const { kirimSuaraMock, bukaSuaraMock, daftarkanDiriSendiriMock, pulihkanKredensialDariCadanganMock } = vi.hoisted(
  () => ({
    kirimSuaraMock: vi.fn(),
    bukaSuaraMock: vi.fn(),
    daftarkanDiriSendiriMock: vi.fn(),
    pulihkanKredensialDariCadanganMock: vi.fn(),
  }),
);
vi.mock("@/lib/chain/jalur-tulis", () => ({
  muatJalurTulis: async () => ({
    kirimSuara: kirimSuaraMock,
    bukaSuara: bukaSuaraMock,
    daftarkanDiriSendiri: daftarkanDiriSendiriMock,
    pulihkanKredensialDariCadangan: pulihkanKredensialDariCadanganMock,
  }),
}));

// checkProofServer dan connectMidnightWallet dikontrol per-uji lewat vi.fn();
// SISA modulnya (proofServerHop, WalletError, describeWalletError, dst.) tetap
// ASLI lewat spread — uji "assert langsung" di bawah butuh implementasi nyata.
const { checkProofServerMock, connectMidnightWalletMock } = vi.hoisted(() => ({
  checkProofServerMock: vi.fn(),
  connectMidnightWalletMock: vi.fn(),
}));
vi.mock("@/lib/proof-server", async (importAsli) => {
  const asli = await importAsli<typeof import("@/lib/proof-server")>();
  return { ...asli, checkProofServer: checkProofServerMock };
});
vi.mock("@/lib/midnight-wallet", async (importAsli) => {
  const asli = await importAsli<typeof import("@/lib/midnight-wallet")>();
  return { ...asli, connectMidnightWallet: connectMidnightWalletMock };
});

// sonner dipalsukan supaya toast.* dapat diperiksa ISINYA langsung — toast
// TIDAK dirender ke document.body tanpa <Toaster/> (yang tinggal di App.tsx,
// bukan di komponen yang diuji di sini), jadi tanpa mock ini teks toast lolos
// tak teramati sama sekali.
const { toastInfo, toastSuccess, toastError } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { info: toastInfo, success: toastSuccess, error: toastError, warning: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

// ─── A. Daftar kata Indonesia yang tidak mungkin muncul di UI Inggris ──────
const KATA_TERLARANG = [
  "yang", "dan", "atau", "tidak", "bukan", "belum", "sudah", "akan", "juga",
  "dengan", "untuk", "dari", "pada", "adalah", "dapat", "kembali",
  "perangkat", "mesin", "pemilih", "suara", "jaringan", "sebab", "kesalahan",
  "kegagalan", "keberhasilan", "pilihan", "disajikan", "dikirim",
  "terverifikasi", "terjangkau", "konfigurasi", "tersambung", "terhubung",
  "kredensial", "menunggu", "hilang", "silakan", "mohon", "peringatan",
  "menampilkan", "memilih", "coba lagi", "gagal", "berhasil",
];
const POLA_INDONESIA = new RegExp(
  `\\b(${KATA_TERLARANG.map((k) => k.replace(/ /g, "\\s+")).join("|")})\\b`,
  "i",
);

/** Dua arah dalam satu panggilan: ADA teks Inggris yang diharapkan, DAN TIDAK ADA kata Indonesia. */
function assertHanyaInggris(teks: string, ekspektasi: RegExp | string, label: string): void {
  expect(teks, `[${label}] teks Inggris yang diharapkan tidak ditemukan`).toMatch(ekspektasi);
  expect(teks, `[${label}] mengandung kata Indonesia yang dilarang`).not.toMatch(POLA_INDONESIA);
}

function teksBody(): string {
  return document.body.textContent ?? "";
}

describe("Penjaga: daftar kata Indonesia tidak salah tangkap teks Inggris yang SUDAH BENAR", () => {
  it("tidak cocok dengan kalimat privasi Inggris yang sesungguhnya dipakai VoteModal/Home", () => {
    const contoh = [
      "Your choice stays private. The proof is built on this device; your wallet only balances and submits the already-proven transaction — it never sees your selection.",
      "This page is served from localhost:3000, not from your device, so http://127.0.0.1:6300 is THAT MACHINE's loopback — not yours. The witness travels browser → localhost:3000 → http://127.0.0.1:6300, and whoever operates that machine can see your vote choice.",
      "No Midnight wallet detected. Install the Lace extension, then reload this page.",
      "The wallet is connected but did not report coinPublicKey/encryptionPublicKey — the write path needs them.",
      "No opening is stored for ballot aaaa on this device. If you voted from a different device, or cleared this site's data, restore it from the backup file downloaded when you voted.",
    ];
    for (const teks of contoh) expect(teks).not.toMatch(POLA_INDONESIA);
  });
});

// ─── B. Assert LANGSUNG atas fungsi lib/ yang mengembalikan teks UI ────────

describe("proofServerHop", () => {
  it("hop langsung: tidak menyisipkan perantara apa pun", () => {
    assertHanyaInggris(
      proofServerHop("http://127.0.0.1:6300", { hostname: "localhost", host: "localhost:3000" }),
      "browser → http://127.0.0.1:6300",
      "proofServerHop langsung",
    );
  });

  it("hop lewat tunnel: REGRESI YANG DIJAGA BERKAS INI — dulu menyisipkan '(loopback mesin itu, bukan perangkat Anda)'", () => {
    const hop = proofServerHop("http://127.0.0.1:6300", {
      hostname: "votepriv.mdloglabs.org",
      host: "votepriv.mdloglabs.org",
    });
    assertHanyaInggris(
      hop,
      "browser → votepriv.mdloglabs.org → http://127.0.0.1:6300 (that machine's loopback, not your device)",
      "proofServerHop tunnel",
    );
  });

  it("target lokal dengan asal halaman null (tidak diketahui): 'this page's host', bukan 'host halaman ini'", () => {
    // target LOKAL wajib di sini — target remote membuat proofServerReach
    // mengembalikan "remote" sebelum sempat memeriksa asal sama sekali, jadi
    // cabang "lewat-host-halaman" (satu-satunya yang membaca `asal`) tidak
    // akan pernah tercapai dengan target remote.
    assertHanyaInggris(
      proofServerHop("http://127.0.0.1:6300", null),
      /this page's host/,
      "proofServerHop asal null",
    );
  });
});

describe("checkProofServer — ketiga pesan galat", () => {
  it("HTML, kosong, dan tidak terhubung semuanya berbahasa Inggris", async () => {
    const { checkProofServer: asli } = await vi.importActual<typeof import("@/lib/proof-server")>(
      "@/lib/proof-server",
    );
    vi.stubGlobal("location", { hostname: "localhost", host: "localhost:3000" });

    const statusHtml = await asli(async () =>
      new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    if (!statusHtml.reachable) assertHanyaInggris(statusHtml.error, /HTML/, "checkProofServer — HTML");
    else throw new Error("statusHtml seharusnya reachable:false");

    const statusKosong = await asli(async () => new Response("", { status: 200, headers: { "content-type": "text/plain" } }));
    if (!statusKosong.reachable) assertHanyaInggris(statusKosong.error, /empty/, "checkProofServer — kosong");
    else throw new Error("statusKosong seharusnya reachable:false");

    const statusMati = await asli(async () => {
      throw new TypeError("Failed to fetch");
    });
    if (!statusMati.reachable) assertHanyaInggris(statusMati.error, /Failed to fetch/, "checkProofServer — jaringan mati");
    else throw new Error("statusMati seharusnya reachable:false");
  });
});

describe("statusLabel & statusTag — kelima status", () => {
  it("tidak satu pun mengandung kata Indonesia", () => {
    for (const s of ["live", "closing-soon", "tally-open", "awaiting-finalize", "finalized"] as const) {
      expect(statusLabel(s), `statusLabel(${s})`).not.toMatch(POLA_INDONESIA);
      expect(statusTag(s), `statusTag(${s})`).not.toMatch(POLA_INDONESIA);
      expect(statusLabel(s).length).toBeGreaterThan(0);
      expect(statusTag(s).length).toBeGreaterThan(0);
    }
  });
});

const JARINGAN_UJI: JaringanAktif = {
  networkId: "preview",
  indexer: "https://indexer.contoh.test/api/v3/graphql",
  indexerWS: "",
  alamatRegistry: "aabbcc",
};

describe("pesanGagal — SEMBILAN sebab GalatRantai (permukaan gagal utama)", () => {
  const SEMUA_SEBAB: SebabGalatRantai[] = [
    "jaringan", "http", "bukan-json", "balasan-html", "graphql-fatal",
    "registry-hilang", "registry-skema", "dekode", "konfigurasi",
  ];

  it("kesembilan sebab menghasilkan judul/kalimat/saran berbahasa Inggris", () => {
    expect(SEMUA_SEBAB).toHaveLength(9);
    for (const sebab of SEMUA_SEBAB) {
      const jaringan = sebab === "konfigurasi" ? null : JARINGAN_UJI;
      const p = pesanGagal(new GalatRantai(sebab, "Some technical detail from a real failure", "indexer.contoh.test"), jaringan);
      const gabungan = `${p.judul} ${p.kalimat} ${p.saran}`;
      expect(p.judul.length, `judul kosong untuk ${sebab}`).toBeGreaterThan(0);
      expect(p.kalimat.length, `kalimat kosong untuk ${sebab}`).toBeGreaterThan(0);
      expect(p.saran.length, `saran kosong untuk ${sebab}`).toBeGreaterThan(0);
      expect(gabungan, `pesanGagal(${sebab}) mengandung kata Indonesia`).not.toMatch(POLA_INDONESIA);
    }
  });

  it("setiap sebab punya judul Inggris yang BERBEDA dan dapat dikenali", () => {
    const diharapkan: Record<SebabGalatRantai, RegExp> = {
      jaringan: /can't reach the indexer/i,
      http: /indexer returned an error/i,
      "bukan-json": /unreadable answer/i,
      "balasan-html": /standing in front of the indexer/i,
      "graphql-fatal": /rejected the query/i,
      "registry-hilang": /registry not found/i,
      "registry-skema": /could not be answered/i,
      dekode: /could not be decoded/i,
      konfigurasi: /misconfigured/i,
    };
    for (const sebab of SEMUA_SEBAB) {
      const jaringan = sebab === "konfigurasi" ? null : JARINGAN_UJI;
      const p = pesanGagal(new GalatRantai(sebab, "r", "h"), jaringan);
      assertHanyaInggris(p.judul, diharapkan[sebab], `judul(${sebab})`);
    }
  });
});

describe("GalatRantai.rincian NYATA — dari transport/dekoder sesungguhnya, bukan GalatRantai karangan", () => {
  it("graphql.ts: balasan HTML menghasilkan rincian Inggris", async () => {
    const galat = await postGraphQL({
      url: "https://indexer.contoh.test/api/v3/graphql",
      query: "query Registry { r: contract(address: \"aa\") { address } }",
      ambil: async () => new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    }).catch((e: unknown) => e);
    expect(galat).toBeInstanceOf(GalatRantai);
    assertHanyaInggris((galat as GalatRantai).rincian, /HTML instead of JSON/, "graphql.ts balasan-html");
  });

  it("graphql.ts: data:null tanpa errors menghasilkan rincian Inggris", async () => {
    const galat = await postGraphQL({
      url: "https://indexer.contoh.test/api/v3/graphql",
      query: "query Registry { r: contract(address: \"aa\") { address } }",
      ambil: async () =>
        new Response(JSON.stringify({ data: null, errors: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    }).catch((e: unknown) => e);
    expect(galat).toBeInstanceOf(GalatRantai);
    assertHanyaInggris((galat as GalatRantai).rincian, /without any errors/, "graphql.ts graphql-fatal");
  });

  it("dekode.ts: hex tidak sah menghasilkan rincian Inggris", () => {
    let galat: unknown;
    try {
      dekodeRegistry("bukan-hex-yang-valid!!", "0xaabb");
    } catch (e) {
      galat = e;
    }
    expect(galat).toBeInstanceOf(GalatRantai);
    assertHanyaInggris((galat as GalatRantai).rincian, /not valid hex/, "dekode.ts hex tidak sah");
  });

  it("baca-rantai.ts: registry null (r: null) menghasilkan rincian Inggris", async () => {
    const galat = await bacaRantai({
      jaringan: JARINGAN_UJI,
      ambil: async () =>
        new Response(JSON.stringify({ data: { r: null }, errors: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    }).catch((e: unknown) => e);
    expect(galat).toBeInstanceOf(GalatRantai);
    expect((galat as GalatRantai).sebab).toBe("registry-hilang");
    assertHanyaInggris((galat as GalatRantai).rincian, /No contract exists/, "baca-rantai.ts registry-hilang");
  });

  it("baca-rantai.ts: kunci r hilang seluruhnya menghasilkan rincian Inggris (registry-skema)", async () => {
    const galat = await bacaRantai({
      jaringan: JARINGAN_UJI,
      ambil: async () =>
        new Response(JSON.stringify({ data: {}, errors: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    }).catch((e: unknown) => e);
    expect(galat).toBeInstanceOf(GalatRantai);
    expect((galat as GalatRantai).sebab).toBe("registry-skema");
    assertHanyaInggris((galat as GalatRantai).rincian, /schema or alias mismatch/, "baca-rantai.ts registry-skema");
  });
});

const LOKAL_VERIFIED: ProofServerStatus = {
  reachable: true, version: "8.1.0", target: "http://127.0.0.1:6300",
  targetTerverifikasi: true, reach: "lokal", hop: "browser → http://127.0.0.1:6300",
};
const LOKAL_TAK_TERVERIFIKASI: ProofServerStatus = { ...LOKAL_VERIFIED, targetTerverifikasi: false };
const LEWAT_HOST: ProofServerStatus = {
  reachable: true, version: "8.1.0", target: "http://127.0.0.1:6300",
  targetTerverifikasi: true, reach: "lewat-host-halaman",
  hop: "browser → votepriv.mdloglabs.org → http://127.0.0.1:6300 (that machine's loopback, not your device)",
};
const REMOTE: ProofServerStatus = {
  reachable: true, version: "8.1.0", target: "https://proof.pihak-lain.example",
  targetTerverifikasi: true, reach: "remote", hop: "browser → https://proof.pihak-lain.example",
};

describe("pesanPrivasiSuara & pesanPrivasiBuka — KELIMA cabang reach", () => {
  it("pesanPrivasiSuara: null, lokal-terverifikasi, lokal-tak-terverifikasi, lewat-host-halaman, remote", () => {
    assertHanyaInggris(pesanPrivasiSuara(null).kalimat, /before it can be marked private/, "pesanPrivasiSuara(null)");
    const kuat = pesanPrivasiSuara(LOKAL_VERIFIED);
    assertHanyaInggris(kuat.kalimat, /stays private/, "pesanPrivasiSuara(lokal-terverifikasi)");
    expect(kuat.kuat).toBe(true);
    const takTerverifikasi = pesanPrivasiSuara(LOKAL_TAK_TERVERIFIKASI);
    assertHanyaInggris(takTerverifikasi.kalimat, /has not been confirmed by this page/, "pesanPrivasiSuara(lokal-tak-terverifikasi)");
    expect(takTerverifikasi.kuat).toBe(false);
    // Klaim topologi tunnel WAJIB tetap menyebut operator dapat MELIHAT pilihan.
    const tunnel = pesanPrivasiSuara(LEWAT_HOST);
    assertHanyaInggris(tunnel.kalimat, /whoever operates that machine can see it/, "pesanPrivasiSuara(lewat-host-halaman)");
    expect(tunnel.kalimat).toContain(LEWAT_HOST.hop);
    const remote = pesanPrivasiSuara(REMOTE);
    assertHanyaInggris(remote.kalimat, /not private from the proof server operator/, "pesanPrivasiSuara(remote)");
  });

  it("pesanPrivasiBuka: kelima cabang yang sama, kalimat SENDIRI (bukan pesanPrivasiSuara didaur ulang)", () => {
    assertHanyaInggris(pesanPrivasiBuka(null).kalimat, /before it can be marked private/, "pesanPrivasiBuka(null)");
    assertHanyaInggris(pesanPrivasiBuka(LOKAL_VERIFIED).kalimat, /never sees which option/, "pesanPrivasiBuka(lokal-terverifikasi)");
    assertHanyaInggris(
      pesanPrivasiBuka(LOKAL_TAK_TERVERIFIKASI).kalimat, /has not been confirmed by this page/,
      "pesanPrivasiBuka(lokal-tak-terverifikasi)",
    );
    assertHanyaInggris(
      pesanPrivasiBuka(LEWAT_HOST).kalimat, /whoever operates that machine can see which option/,
      "pesanPrivasiBuka(lewat-host-halaman)",
    );
    assertHanyaInggris(pesanPrivasiBuka(REMOTE).kalimat, /its operator can see which option/, "pesanPrivasiBuka(remote)");
  });
});

describe("WalletError, adaptor-lace, GalatOpeningHilang — 'wallet tidak ada' dan sejenisnya", () => {
  it("pickConnector tanpa window.midnight: NO_CONNECTOR berbahasa Inggris", () => {
    vi.stubGlobal("midnight", undefined);
    let galat: unknown;
    try {
      pickConnector();
    } catch (e) {
      galat = e;
    }
    expect(galat).toBeInstanceOf(WalletError);
    assertHanyaInggris((galat as WalletError).message, /No Midnight wallet detected/, "pickConnector NO_CONNECTOR");
  });

  it("describeWalletError: fallback bukan Error tetap berbahasa Inggris", () => {
    assertHanyaInggris(describeWalletError("bukan instance Error"), /Could not connect to the wallet/, "describeWalletError fallback");
  });

  it("buatAdaptorLace: wallet tanpa coinPublicKey berbahasa Inggris ('wallet tidak ada' credential)", () => {
    const wallet: WalletConnection = {
      address: "mn_shield-addr_test1x", networkId: "preview", connectorName: "lace", apiVersion: "4.0.1", api: {},
    };
    let galat: unknown;
    try {
      buatAdaptorLace(wallet);
    } catch (e) {
      galat = e;
    }
    expect(galat).toBeInstanceOf(Error);
    assertHanyaInggris(
      (galat as Error).message, /did not report coinPublicKey\/encryptionPublicKey/, "buatAdaptorLace tanpa coinPublicKey",
    );
  });

  it("GalatOpeningHilang: credential tidak ditemukan menyebut jalan pemulihan, berbahasa Inggris", () => {
    const galat = new GalatOpeningHilang("f".repeat(64));
    assertHanyaInggris(galat.message, /No opening is stored for ballot/, "GalatOpeningHilang");
    assertHanyaInggris(galat.message, /restore it from the backup file/, "GalatOpeningHilang — jalan pemulihan");
  });
});

/**
 * Tiruan bentuk `CallTxFailedError` (@midnight-ntwrk/midnight-js-contracts,
 * kelas `TxFailedError` yang diwarisinya) — verifikasi langsung terhadap
 * paket TERPASANG (dist/index.mjs, node_modules/.pnpm/@midnight-ntwrk+midnight-js-contracts@4.0.4):
 * `this.message = JSON.stringify({circuitId, ...finalizedTxData}, ..., "\t")`.
 * Bentuk NYATA `finalizedTxData` tidak direproduksi persis di sini (itu butuh
 * testnet sungguhan) — yang dibuktikan cukup satu hal, dan itulah yang
 * ditegakkan gerbang bahasa ini: string assert ada DI DALAM `e.message` yang
 * dibungkus JSON lain, BUKAN sama dengan `e.message` itu sendiri. Itu alasan
 * `terjemahkanGalatRantai` WAJIB mencocokkan lewat substring (`.includes`),
 * bukan kesetaraan (`===`) — uji di bawah gagal (merah) bila pesan-rantai.ts
 * pernah diam-diam diganti ke pencocokan `===`.
 */
function bungkusCallTxFailedError(pesanAssert: string): string {
  return JSON.stringify(
    { circuitId: "castVote", status: "FailFallible", description: `assert failed: '${pesanAssert}'` },
    null,
    "\t",
  );
}

describe("terjemahkanGalatRantai — ke-23 pesan assert ballot.compact (audit #2, Kelas 1)", () => {
  // Disalin MANUAL dari pkgs/contract/src/ballot.compact (grep `assert(`) dan
  // dari padanan Inggris yang DIPAKU sebagai nilai literal di sini — BUKAN
  // diimpor dari pesan-rantai.ts. Mengimpor peta yang sama yang diuji akan
  // membuat uji ini tautologis (map[i] === map[i]): mengosongkan satu entri
  // peta harus membuat BARIS INI merah, bukan ikut kosong bersamanya.
  const KE_23_PESAN_ASSERT: ReadonlyArray<readonly [indonesia: string, inggris: string]> = [
    ["Jumlah opsi harus 2 sampai 4", "This ballot must have between 2 and 4 options."],
    [
      "Batas waktu pembukaan suara harus setelah batas waktu pemungutan suara",
      "The vote-opening deadline must come after the voting deadline.",
    ],
    ["Jumlah pemilih yang berhak minimal 1", "This ballot needs at least 1 eligible voter."],
    [
      "Jumlah pemilih yang berhak melebihi kapasitas pohon (1024)",
      "This ballot allows more eligible voters than the maximum of 1,024.",
    ],
    ["Persentase kuorum tidak boleh melebihi 100", "The quorum percentage cannot be more than 100."],
    ["Hanya admin yang boleh mendaftarkan pemilih", "Only this ballot's admin can register voters."],
    ["Ballot sudah tidak dalam fase pemungutan suara", "This ballot is no longer in its voting phase."],
    ["Pendaftaran ditutup setelah suara pertama masuk", "Registration closed as soon as the first vote was cast."],
    ["Jumlah pendaftaran harus 1 sampai 8", "You can register between 1 and 8 voters at a time."],
    [
      "Melebihi eligibleCount yang ditetapkan ballot",
      "This would exceed the number of eligible voters set for this ballot.",
    ],
    ["Batas waktu pemungutan suara sudah lewat", "The voting deadline for this ballot has passed."],
    ["Ballot tidak sedang menerima suara", "This ballot is not currently accepting votes."],
    ["Merkle path bukan untuk credential ini", "The submitted proof path does not match this credential."],
    ["Anda tidak terdaftar sebagai pemilih pada ballot ini", "This credential is not registered for this ballot."],
    ["Pilihan di luar opsi yang tersedia", "That option is not available on this ballot."],
    ["Credential ini sudah dipakai memilih", "This credential has already voted on this ballot."],
    ["Ballot sudah difinalisasi", "This ballot has already been finalized."],
    ["Pemungutan suara masih berlangsung", "Voting is still open — votes can't be opened yet."],
    ["Batas waktu pembukaan suara sudah lewat", "The deadline to open votes on this ballot has passed."],
    ["Merkle path bukan untuk commitment ini", "The submitted proof path does not match this sealed vote."],
    ["Commitment tidak ditemukan pada ballot ini", "This sealed vote was not found on this ballot."],
    ["Suara ini sudah pernah dibuka", "This vote has already been opened."],
    [
      "Batas waktu pembukaan suara belum lewat",
      "This ballot can't be finalized yet — the vote-opening deadline hasn't passed.",
    ],
  ];

  it("mencakup PERSIS 23 pesan — bukan lebih sedikit, bukan duplikat", () => {
    expect(KE_23_PESAN_ASSERT).toHaveLength(23);
    expect(new Set(KE_23_PESAN_ASSERT.map(([indonesia]) => indonesia)).size).toBe(23);
  });

  it.each(KE_23_PESAN_ASSERT)(
    "%s -> dipaku ke Inggris, walau dibungkus ala CallTxFailedError",
    (indonesia, inggris) => {
      // Pesan MENTAH (tanpa pembungkus) — pencocokan substring mencakup kasus
      // pesan == kebutuhan persis, bukan hanya pesan yang lebih panjang.
      expect(terjemahkanGalatRantai(indonesia)).toBe(inggris);
      // Pesan TERBUNGKUS (bentuk sungguhan yang sampai ke setGalat) — DIPAKU
      // ke nilai Inggris yang SAMA, bukan sekadar "berbeda dari masukan".
      expect(terjemahkanGalatRantai(bungkusCallTxFailedError(indonesia))).toBe(inggris);
      // Dan hasilnya sendiri tidak mengandung kata Indonesia terlarang.
      expect(inggris).not.toMatch(POLA_INDONESIA);
    },
  );

  it("pesan tak dikenal (bukan salah satu dari ke-23) lolos APA ADANYA — galat tak terduga tidak disembunyikan", () => {
    const takDikenal = "Some future assert message this contract has never had before.";
    expect(terjemahkanGalatRantai(takDikenal)).toBe(takDikenal);
    // Dibungkus ala CallTxFailedError: masih tidak dikenal (substring-nya
    // sendiri tidak cocok satu pun dari ke-23), jadi seluruh pesan terbungkus
    // dikembalikan apa adanya — bukan dipotong jadi hanya bagian assert-nya.
    const terbungkus = bungkusCallTxFailedError(takDikenal);
    expect(terjemahkanGalatRantai(terbungkus)).toBe(terbungkus);
  });
});

// ─── C. Render setiap komponen pada setiap kondisi yang dapat dicapai ──────

describe("KeadaanRantai — kesembilan sebab, keadaan memuat, spanduk sebagian", () => {
  const SEMUA_SEBAB: SebabGalatRantai[] = [
    "jaringan", "http", "bukan-json", "balasan-html", "graphql-fatal",
    "registry-hilang", "registry-skema", "dekode", "konfigurasi",
  ];

  it("PanelGagalRantai merender teks Inggris untuk KESEMBILAN sebab", () => {
    for (const sebab of SEMUA_SEBAB) {
      const jaringan = sebab === "konfigurasi" ? null : JARINGAN_UJI;
      const { unmount } = render(
        <PanelGagalRantai
          galat={new GalatRantai(sebab, "Some technical detail", "indexer.contoh.test")}
          jaringan={jaringan}
          percobaan={0}
          onCoba={() => {}}
        />,
      );
      assertHanyaInggris(teksBody(), /[a-z]/i, `PanelGagalRantai(${sebab})`);
      expect(teksBody(), `PanelGagalRantai(${sebab}) kosong`).not.toBe("");
      unmount();
    }
  });

  it("keadaan memuat (kartu kerangka) tidak mengandung kata Indonesia", () => {
    render(<GridBallotMemuat count={2} />);
    assertHanyaInggris(teksBody(), /Reading chain/, "GridBallotMemuat");
  });

  it("satu kartu kerangka tunggal juga bersih", () => {
    render(<KartuBallotMemuat />);
    assertHanyaInggris(teksBody(), /Reading contract state/, "KartuBallotMemuat");
  });

  it("spanduk sebagian (SATU dan BANYAK entri gagal) berbahasa Inggris", () => {
    const { unmount } = render(<SpandukSebagian gagal={[{ alamat: "aa", sebab: "dekode", pesan: "x" }]} />);
    assertHanyaInggris(teksBody(), /1 registry entry could not be read/, "SpandukSebagian(1)");
    unmount();
    render(
      <SpandukSebagian
        gagal={[
          { alamat: "aa", sebab: "dekode", pesan: "x" },
          { alamat: "bb", sebab: "kontrak-null", pesan: "y" },
        ]}
      />,
    );
    assertHanyaInggris(teksBody(), /2 registry entries could not be read/, "SpandukSebagian(2)");
  });
});

const BALLOT: Ballot = ballotUji({
  id: "b".repeat(64), nomor: 3, title: "Q4 Community Treasury", community: "Midnight Builders",
  eligibilityPolicy: "Open to Midnight Builders credential holders",
});

function renderVoteModal(props: Partial<Parameters<typeof VoteModal>[0]> = {}) {
  return render(
    <VoteModal
      ballot={BALLOT}
      connected
      wallet={null}
      jaringan="preview"
      proofStatus={null}
      onClose={() => {}}
      onVote={() => {}}
      {...props}
    />,
  );
}

describe("VoteModal — KELIMA cabang reach, keadaan gagal, tally-open, ballot tertutup", () => {
  it.each([
    ["proofStatus null (memeriksa)", null, /Checking where this vote will be proven/],
    ["lokal + terverifikasi", LOKAL_VERIFIED, /stays private/],
    ["lokal + BELUM terverifikasi", LOKAL_TAK_TERVERIFIKASI, /has not been confirmed by this page/],
    ["lewat host halaman (tunnel)", LEWAT_HOST, /whoever operates that machine can see it/],
    ["remote", REMOTE, /not private from the proof server operator/],
  ] as const)("layar pilih suara — %s", (_label, status, ekspektasi) => {
    const { unmount } = renderVoteModal({ proofStatus: status });
    assertHanyaInggris(teksBody(), ekspektasi, `VoteModal select (${_label})`);
    unmount();
  });

  it("ballot yang menerima suara TERTUTUP (finalized) menjelaskan alasannya, bukan menawarkan tombol yang pasti gagal", () => {
    renderVoteModal({ ballot: { ...BALLOT, status: "finalized" } });
    assertHanyaInggris(teksBody(), /Voting is closed for this ballot/, "VoteModal ballot tertutup (finalized)");
  });

  it("ballot berstatus tally-open menjelaskan bahwa suara masih bisa dibuka", () => {
    renderVoteModal({ ballot: { ...BALLOT, status: "tally-open" } });
    assertHanyaInggris(teksBody(), /Voters can still open their sealed votes until the tally deadline/, "VoteModal ballot tally-open (tertutup untuk suara baru)");
  });

  it("kegagalan GalatOpeningHilang: heading DAN pesan pemulihan berbahasa Inggris", async () => {
    bukaSuaraMock.mockImplementation(async () => {
      const e = new Error(new GalatOpeningHilang(BALLOT.id).message);
      e.name = "GalatOpeningHilang";
      throw e;
    });
    const { container } = renderVoteModal({
      ballot: { ...BALLOT, status: "tally-open" },
      wallet: { address: "mn_shield-addr_test1x", networkId: "preview", connectorName: "lace", apiVersion: "4.0.1", api: {} },
      openWallet: { address: "mn_shield-addr_test1y", networkId: "preview", connectorName: "lace", apiVersion: "4.0.1", api: {} },
    });
    fireEvent.click(within(container).getByText("Open my vote"));
    await waitFor(() => expect(screen.getByText(/No opening found on this device/)).toBeTruthy());
    assertHanyaInggris(teksBody(), /restore it from the backup file/, "VoteModal GalatOpeningHilang");
  });

  it("kegagalan biasa saat mencoblos ('Something went wrong') berbahasa Inggris", async () => {
    kirimSuaraMock.mockRejectedValue(Object.assign(new Error("The proof server refused the request."), { kode: "WALLET" }));
    const { container } = renderVoteModal({
      wallet: { address: "mn_shield-addr_test1x", networkId: "preview", connectorName: "lace", apiVersion: "4.0.1", api: {} },
    });
    fireEvent.change(within(container).getByPlaceholderText("64-character credential from registration"), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.click(within(container).getByText("Generate proof & vote"));
    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeTruthy());
    assertHanyaInggris(teksBody(), /proof server refused the request/, "VoteModal kegagalan generik");
  });

  it("kegagalan KONTRAK (CallTxFailedError membungkus assert Indonesia) dirender Inggris — audit #2 Kelas 1", async () => {
    // Bentuk nyata: midnight-js melempar CallTxFailedError (lihat komentar
    // bungkusCallTxFailedError di atas), tapi VoteModal hanya pernah membaca
    // `e.message` (`e instanceof Error ? e.message : String(e)`) — Error
    // biasa dengan message BERBENTUK SAMA (JSON yang memuat string assert)
    // sudah cukup untuk membuktikan jalur terjemahkanGalatRantai bekerja,
    // tanpa mengimpor CallTxFailedError sungguhan (yang menyeret
    // midnight-js-contracts ke berkas uji ini).
    const pesanKontrakTerbungkus = bungkusCallTxFailedError("Credential ini sudah dipakai memilih");
    kirimSuaraMock.mockRejectedValue(Object.assign(new Error(pesanKontrakTerbungkus), { kode: "ON_CHAIN" }));
    const { container } = renderVoteModal({
      wallet: { address: "mn_shield-addr_test1x", networkId: "preview", connectorName: "lace", apiVersion: "4.0.1", api: {} },
    });
    fireEvent.change(within(container).getByPlaceholderText("64-character credential from registration"), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.click(within(container).getByText("Generate proof & vote"));
    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeTruthy());
    // Dirender INGGRIS (paku yang SAMA dengan peta di pesan-rantai.ts dan
    // dengan uji ke-23 di atas) — bukan pembungkus JSON mentah.
    assertHanyaInggris(
      teksBody(),
      /This credential has already voted on this ballot\./,
      "VoteModal galat kontrak (assert Indonesia terbungkus)",
    );
    // Dan secara eksplisit: string assert Indonesia ASLI tidak muncul sama
    // sekali di DOM — bukan cuma lolos dari POLA_INDONESIA lewat kebetulan.
    expect(teksBody()).not.toContain("Credential ini sudah dipakai memilih");
  });

  it("layar sukses mencoblos berbahasa Inggris pada proof server REMOTE (klaim BERSYARAT)", async () => {
    kirimSuaraMock.mockResolvedValue({ txId: "tx-1", nullifierHex: "c".repeat(64) });
    const { container } = renderVoteModal({
      proofStatus: REMOTE,
      wallet: { address: "mn_shield-addr_test1x", networkId: "preview", connectorName: "lace", apiVersion: "4.0.1", api: {} },
    });
    fireEvent.change(within(container).getByPlaceholderText("64-character credential from registration"), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.click(within(container).getByText(BALLOT.options[0]));
    fireEvent.click(within(container).getByText("Generate proof & vote"));
    await waitFor(() => expect(screen.getByText("Your ballot is sealed on-chain.")).toBeTruthy());
    assertHanyaInggris(teksBody(), /not private from the proof server operator/, "VoteModal sukses (remote)");
  });
});

describe("RegisterModal — memuat, siap, gagal (pesan IndexedDB SUNGGUHAN)", () => {
  it("keadaan memuat berbahasa Inggris", () => {
    daftarkanDiriSendiriMock.mockImplementation(() => new Promise(() => {}));
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    assertHanyaInggris(teksBody(), /Setting up your credential/, "RegisterModal memuat");
  });

  it("keadaan siap (dengan panel pemulihan) berbahasa Inggris", async () => {
    daftarkanDiriSendiriMock.mockResolvedValue({ credentialHex: "1".repeat(64), leafHex: "2".repeat(64), kredensialBaru: true });
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("2".repeat(64))).toBeTruthy());
    assertHanyaInggris(teksBody(), /Registering from a new device/, "RegisterModal siap");
  });

  it("keadaan gagal memakai PESAN NYATA kredensial-idb.ts ('Could not open IndexedDB ...') — bukan galat karangan", async () => {
    daftarkanDiriSendiriMock.mockRejectedValue(new Error('Could not open IndexedDB "votepriv-credentials"'));
    render(<RegisterModal ballot={BALLOT} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeTruthy());
    assertHanyaInggris(teksBody(), /Could not open IndexedDB/, "RegisterModal gagal (IndexedDB nyata)");
  });
});

describe("CreateBallotModal — validasi dan toast", () => {
  it("form kosong: toast.error berbahasa Inggris", () => {
    render(<CreateBallotModal onClose={() => {}} />);
    fireEvent.click(screen.getByText("Create ballot", { selector: "button.primary-button" }));
    expect(toastError).toHaveBeenCalled();
    const [judul, opsi] = toastError.mock.calls[0] as [string, { description?: string }];
    assertHanyaInggris(`${judul} ${opsi?.description ?? ""}`, /A title and two options are required/, "CreateBallotModal validasi");
  });

  it("form terisi: toast.info 'menulis butuh wallet' berbahasa Inggris", () => {
    render(<CreateBallotModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Community treasury allocation"), { target: { value: "Judul uji" } });
    fireEvent.click(screen.getByText("Create ballot", { selector: "button.primary-button" }));
    expect(toastInfo).toHaveBeenCalled();
    const [judul, opsi] = toastInfo.mock.calls[0] as [string, { description?: string }];
    assertHanyaInggris(`${judul} ${opsi?.description ?? ""}`, /Creating ballots needs a wallet/, "CreateBallotModal info");
  });
});

describe("Docs, BallotCard — render statis", () => {
  it("Docs berbahasa Inggris", () => {
    render(<Docs />);
    assertHanyaInggris(teksBody(), /Docs for humans/, "Docs");
  });

  it("BallotCard: menerima suara vs sudah tertutup, dengan DAN tanpa tombol daftar", () => {
    const { unmount } = render(<BallotCard ballot={BALLOT} onVote={() => {}} onRegister={() => {}} />);
    assertHanyaInggris(teksBody(), /Vote privately/, "BallotCard live");
    unmount();
    render(<BallotCard ballot={{ ...BALLOT, status: "finalized" }} onVote={() => {}} />);
    assertHanyaInggris(teksBody(), /View result/, "BallotCard finalized");
  });
});

function hasilUji(ubah: Partial<HasilRantai> = {}): HasilRantai {
  return {
    jaringan: JARINGAN_UJI,
    registry: { count: 0, alamat: [], aksi: [] },
    ballot: [],
    gagal: [],
    blok: { height: 100, timestampMs: 1_789_000_000_000 },
    epoch: { epochNo: 1, durationSeconds: 1800, elapsedSeconds: 60 },
    sekarangMs: 1_789_000_000_000,
    ...ubah,
  };
}

describe("Overview — registry KOSONG dan terisi", () => {
  it("registry kosong: 'No ballots yet' berbahasa Inggris, bukan crash", () => {
    render(<Overview hasil={hasilUji()} ballots={[]} onVote={() => {}} onCreate={() => {}} onSection={() => {}} />);
    assertHanyaInggris(teksBody(), /No ballots yet/, "Overview kosong");
  });

  it("registry terisi: hero, metrik, dan recent activity berbahasa Inggris", () => {
    render(
      <Overview
        hasil={hasilUji({ registry: { count: 1, alamat: [BALLOT.id], aksi: [] } })}
        ballots={[BALLOT]}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    assertHanyaInggris(teksBody(), /Decisions that stay/, "Overview terisi");
    assertHanyaInggris(teksBody(), /No contract activity read/, "Overview — recent activity kosong");
  });
});

describe("LiveBallots — kosong (registry) dan tidak ditemukan (pencarian)", () => {
  it("registry benar-benar kosong", () => {
    render(<LiveBallots ballots={[]} onVote={() => {}} onCreate={() => {}} />);
    assertHanyaInggris(teksBody(), /The registry has no ballots yet/, "LiveBallots registry kosong");
  });

  it("pencarian tidak menemukan hasil pada registry yang TERISI", () => {
    render(<LiveBallots ballots={[BALLOT]} onVote={() => {}} onCreate={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search ballots or communities"), { target: { value: "zzz-tidak-ada" } });
    assertHanyaInggris(teksBody(), /Try a different community or title/, "LiveBallots tidak ditemukan");
  });
});

describe("Results — KEEMPAT keadaanHasil, dan tanda terima simulasi/nyata", () => {
  const dasar = { jaringan: JARINGAN_UJI, blokHeight: 100, onMuatUlang: () => {} };

  it.each([
    ["ada-hasil sebagian (tallied < votes)", { keadaanHasil: "ada-hasil" as const, votes: 10, tallied: 6, tallies: [4, 2, 0] as number[] }, /leading · \d+ of \d+ opened/],
    ["ada-hasil penuh (tallied === votes)", { keadaanHasil: "ada-hasil" as const, votes: 6, tallied: 6, tallies: [6, 0, 0] as number[] }, /leading option/],
    ["tersegel (masih menerima suara)", { keadaanHasil: "tersegel" as const, votes: 2, tallied: 0 }, /Results stay sealed until/],
    ["menunggu pembukaan (voting tutup, belum ada yang membuka)", { keadaanHasil: "menunggu-pembukaan" as const, votes: 2, tallied: 0 }, /no sealed vote has been opened yet/],
    ["tidak ada yang dibuka, votes=0", { keadaanHasil: "tidak-ada-yang-dibuka" as const, votes: 0, tallied: 0 }, /No votes were cast/],
    ["tidak ada yang dibuka, votes>0", { keadaanHasil: "tidak-ada-yang-dibuka" as const, votes: 3, tallied: 0 }, /before the tally deadline/],
  ] as const)("%s", (_label, ubah, ekspektasi) => {
    render(<Results {...dasar} ballots={[{ ...BALLOT, ...ubah }]} receipt={null} />);
    assertHanyaInggris(teksBody(), ekspektasi, `Results (${_label})`);
  });

  it("tanda terima SIMULASI dan NYATA sama-sama berbahasa Inggris", () => {
    const simulasi: Receipt = { ballotId: BALLOT.id, proofStatus: "simulated", nullifierStatus: "not-consumed", txRef: null };
    const { unmount } = render(<Results {...dasar} ballots={[BALLOT]} receipt={simulasi} />);
    assertHanyaInggris(teksBody(), /Simulated — no transaction was submitted/, "Results tanda terima simulasi");
    unmount();
    const nyata: Receipt = { ballotId: BALLOT.id, proofStatus: "verified", nullifierStatus: "consumed", txRef: "tx-nyata-1" };
    render(<Results {...dasar} ballots={[BALLOT]} receipt={nyata} />);
    assertHanyaInggris(teksBody(), /Proof verified/, "Results tanda terima nyata");
  });
});

describe("pesanSuksesVote — toast setelah mencoblos", () => {
  it("txRef null (simulasi) dan txRef nyata sama-sama berbahasa Inggris", async () => {
    const { pesanSuksesVote } = await import("@/pages/Home");
    const simulasi = pesanSuksesVote(
      { ballotId: "x", proofStatus: "simulated", nullifierStatus: "not-consumed", txRef: null },
      JARINGAN_UJI,
    );
    assertHanyaInggris(`${simulasi.judul} ${simulasi.deskripsi}`, /Vote simulated/, "pesanSuksesVote(txRef null)");
    const nyata = pesanSuksesVote(
      { ballotId: "x", proofStatus: "verified", nullifierStatus: "consumed", txRef: "tx-1" },
      JARINGAN_UJI,
    );
    assertHanyaInggris(`${nyata.judul} ${nyata.deskripsi}`, /Vote verified on Midnight preview/, "pesanSuksesVote(txRef nyata)");
  });
});

describe("Home — KEENAM cabang privacy (title= sidebar), keadaan memuat, wallet tidak ada", () => {
  it.each([
    ["memeriksa (proofStatus null)", null, /Checking the proof server/],
    [
      "remote — operator DAPAT melihat pilihan",
      { reachable: true, version: "1", target: "https://proof.other.example", targetTerverifikasi: true, reach: "remote", hop: "browser → https://proof.other.example" } as ProofServerStatus,
      /operator can see your vote choice/,
    ],
    [
      "lewat host halaman (tunnel) — operator DAPAT melihat pilihan",
      LEWAT_HOST,
      /whoever operates that machine can see your vote choice/,
    ],
    [
      "offline (lokal, tidak terjangkau)",
      { reachable: false, error: "could not be reached", target: "http://127.0.0.1:6300", targetTerverifikasi: true, reach: "lokal", hop: "browser → http://127.0.0.1:6300" } as ProofServerStatus,
      /could not be reached/,
    ],
    [
      "lokal, hidup, TARGET belum terverifikasi",
      LOKAL_TAK_TERVERIFIKASI,
      /the witness never leaves this device" is not made here/,
    ],
    ["lokal, hidup, target terverifikasi (Always on)", LOKAL_VERIFIED, /the witness never leaves this device\./],
  ] as const)("privacy panel — %s", async (_label, status, ekspektasi) => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    checkProofServerMock.mockResolvedValue(status);
    const { default: Home } = await import("@/pages/Home");
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<Home />));
    });
    const panel = container.querySelector(".privacy-mode")!;
    assertHanyaInggris(panel.getAttribute("title") ?? "", ekspektasi, `Home privacy (${_label})`);
    assertHanyaInggris(panel.textContent ?? "", /./, `Home privacy label (${_label})`);
  });

  it("keadaan memuat ('Reading the chain…') berbahasa Inggris", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    checkProofServerMock.mockResolvedValue(null);
    const { default: Home } = await import("@/pages/Home");
    await act(async () => {
      render(<Home />);
    });
    assertHanyaInggris(teksBody(), /Reading the chain/, "Home memuat");
  });

  it("'wallet tidak ada': connect gagal menampilkan toast.error berbahasa Inggris (NO_CONNECTOR NYATA)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    checkProofServerMock.mockResolvedValue(null);
    connectMidnightWalletMock.mockRejectedValue(
      new WalletError("NO_CONNECTOR", "No Midnight wallet detected. Install the Lace extension, then reload this page."),
    );
    const { default: Home } = await import("@/pages/Home");
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<Home />));
    });
    await act(async () => {
      fireEvent.click(within(container).getByText("Connect wallet"));
    });
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const [judul, opsi] = toastError.mock.calls[0] as [string, { description?: string }];
    assertHanyaInggris(`${judul} ${opsi?.description ?? ""}`, /No Midnight wallet detected/, "Home wallet tidak ada");
  });
});

// ─── D. Gerbang bundel bahasa — dist/public/assets/*.js (audit #2) ─────────
//
// BATASAN JUJUR, diminta eksplisit oleh brief audit #2: ke-23 string assert
// INDONESIA tetap ADA di dist/public/assets/*.js pada build apa pun —
// pkgs/contract/src/managed/ballot/contract (kontrak TERGENERASI, kode
// pihak lain yang diimpor sebagai kotak hitam — lihat komentar
// batas-bundel.test.ts soal batas kepercayaan yang sama) memuatnya apa
// adanya di dalam circuit yang dikompilasi, dan itu BUKAN bug — lihat
// keputusan tugas ini soal MENGAPA ballot.compact tidak boleh diubah.
//
// Gerbang ini karena itu TIDAK mengassert KETIADAAN Indonesia (assert itu
// PASTI merah selamanya, untuk alasan yang tidak ada hubungannya dengan
// regresi bahasa apa pun). Yang ia assert: ke-23 PADANAN INGGRIS dari
// `terjemahkanGalatRantai` (pesan-rantai.ts) benar-benar IKUT ter-bundle,
// bukan di-tree-shake sebagai kode "tidak terpakai" oleh Vite/Rollup — bukti
// TIDAK LANGSUNG bahwa jalur terjemahan sungguh terpasang di build produksi,
// bukan cuma lolos di lingkungan uji (jsdom, tanpa build sungguhan).
//
// INI BUKAN bukti bahwa terjemahan dipanggil pada waktu yang tepat dengan
// argumen yang tepat, atau bahwa hasil renderiannya benar — bukti UNTUK ITU
// ada di describe "terjemahkanGalatRantai" dan uji VoteModal "kegagalan
// KONTRAK" di atas (render sungguhan lewat @testing-library/react, bukan
// pemindaian teks bundel). Kedua jenis bukti saling melengkapi, tidak saling
// menggantikan.
//
// LEWATI BERSIH bila dist/ belum dibangun — pola yang sama dengan
// client/src/lib/chain/batas-bundel.test.ts (gerbang jalur SUMBER di sana
// selalu jalan; gerbang jalur KELUARAN, seperti ini, butuh `pnpm build`
// lebih dulu, sama seperti scripts/ukur-batas-bundel.mjs).
//
// path.resolve(process.cwd(), …), BUKAN `new URL(…, import.meta.url)`: berkas
// ini di-render lewat pool jsdom (environmentMatchGlobs memetakan *.test.tsx
// ke jsdom — lihat vitest.config.ts), dan di sana import.meta.url tidak bisa
// dipakai sebagai basis URL relatif yang bisa diandalkan (dibuktikan empiris:
// resolusi relatif darinya menghasilkan path `/@fs/...` yang salah, BUKAN
// path repo sungguhan — persis masalah yang sudah didokumentasikan di
// client/src/test/paritas-permukaan-rantai.test.tsx). `pnpm test`/`vitest run`
// selalu dijalankan dari akar repo (lihat package.json), jadi process.cwd()
// adalah dasar yang stabil di kedua pool (node MAUPUN jsdom).
const AKAR_GERBANG_BUNDEL = path.resolve(process.cwd());
const DIST_ASSETS = path.join(AKAR_GERBANG_BUNDEL, "dist", "public", "assets");
const DIST_ADA = existsSync(DIST_ASSETS);

describe.skipIf(!DIST_ADA)("D. Gerbang bundel bahasa — dist/public/assets/*.js (audit #2)", () => {
  function teksSeluruhBundelJs(): string {
    const berkas = readdirSync(DIST_ASSETS).filter((f) => f.endsWith(".js"));
    expect(berkas.length, "tidak ada satu pun .js di dist/public/assets — build diduga rusak").toBeGreaterThan(0);
    return berkas.map((f) => readFileSync(path.join(DIST_ASSETS, f), "utf8")).join("\n");
  }

  // Salinan INDEPENDEN dari padanan Inggris ke-23 assert — SENGAJA diketik
  // ulang di sini, bukan diimpor dari describe "terjemahkanGalatRantai" di
  // atas maupun dari pesan-rantai.ts: dua tempat yang mengetik ulang nilai
  // yang sama secara independen saling menjaga dari salah ketik yang lolos
  // tak teramati di satu tempat (pola yang sama dengan alasan uji ke-23 di
  // atas TIDAK mengimpor peta internal pesan-rantai.ts).
  const KE_23_PADANAN_INGGRIS = [
    "This ballot must have between 2 and 4 options.",
    "The vote-opening deadline must come after the voting deadline.",
    "This ballot needs at least 1 eligible voter.",
    "This ballot allows more eligible voters than the maximum of 1,024.",
    "The quorum percentage cannot be more than 100.",
    "Only this ballot's admin can register voters.",
    "This ballot is no longer in its voting phase.",
    "Registration closed as soon as the first vote was cast.",
    "You can register between 1 and 8 voters at a time.",
    "This would exceed the number of eligible voters set for this ballot.",
    "The voting deadline for this ballot has passed.",
    "This ballot is not currently accepting votes.",
    "The submitted proof path does not match this credential.",
    "This credential is not registered for this ballot.",
    "That option is not available on this ballot.",
    "This credential has already voted on this ballot.",
    "This ballot has already been finalized.",
    "Voting is still open — votes can't be opened yet.",
    "The deadline to open votes on this ballot has passed.",
    "The submitted proof path does not match this sealed vote.",
    "This sealed vote was not found on this ballot.",
    "This vote has already been opened.",
    "This ballot can't be finalized yet — the vote-opening deadline hasn't passed.",
  ] as const;

  it("mencakup PERSIS 23 padanan — jaring rangkap terhadap salah ketik di uji ini sendiri", () => {
    expect(KE_23_PADANAN_INGGRIS).toHaveLength(23);
    expect(new Set(KE_23_PADANAN_INGGRIS).size).toBe(23);
  });

  it("ke-23 padanan Inggris terjemahkanGalatRantai ADA di bundel produksi (bukti tidak di-tree-shake)", () => {
    const gabungan = teksSeluruhBundelJs();
    const hilang = KE_23_PADANAN_INGGRIS.filter((s) => !gabungan.includes(s));
    expect(hilang, `padanan Inggris hilang dari dist/public/assets/*.js: ${JSON.stringify(hilang)}`).toEqual([]);
  });

  it("padanan invarian witness pkgs/contract/ballot-witnesses.ts (di luar 23, lihat pesan-rantai.ts) juga ADA di bundel", () => {
    const gabungan = teksSeluruhBundelJs();
    expect(gabungan).toContain(
      "This device is missing required local vote data for this ballot — try restoring your credential or vote backup file, then try again.",
    );
  });
});

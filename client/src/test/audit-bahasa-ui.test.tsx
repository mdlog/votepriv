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
 * BUKTI GUARD BISA MERAH: didokumentasikan di .superpowers/audit-bahasa-ui.md
 * — proofServerHop() dikembalikan sementara ke bentuk Indonesia lama, `pnpm
 * vitest run client/src/test/audit-bahasa-ui.test.tsx` dijalankan, hasilnya
 * MERAH pada uji "proofServerHop — tunnel", lalu dikembalikan.
 */
import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GalatRantai, bacaRantai } from "@/lib/chain";
import type { HasilRantai, JaringanAktif, SebabGalatRantai } from "@/lib/chain";
import { postGraphQL } from "@/lib/chain/graphql";
import { dekodeRegistry } from "@/lib/chain/dekode";
import { GalatOpeningHilang } from "@/lib/chain/tulis";
import { buatAdaptorLace } from "@/lib/chain/adaptor-lace";
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

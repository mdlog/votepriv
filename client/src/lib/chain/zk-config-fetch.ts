/**
 * ZKConfigProvider berbasis fetch. Paket resmi
 * @midnight-ntwrk/midnight-js-fetch-zk-config-provider (disebut spec §14.4)
 * TIDAK terpasang (nol baris di pnpm-lock.yaml) — ditulis sendiri dari
 * abstract class ZKConfigProvider (midnight-js-types), 3 metode abstrak:
 * getZKIR/getProverKey/getVerifierKey. createProverKey/createVerifierKey/
 * createZKIR adalah fungsi IDENTITAS, diverifikasi dari NodeZkConfigProvider
 * terpasang.
 *
 * httpClientProofProvider MENELAN galat konfigurasi ZK diam-diam
 * (getKeyMaterial: try {...} catch { return undefined }) — kegagalan di sini
 * HARUS melempar keras di titik fetch, bukan resolve ke undefined (pola yang
 * sama dengan PrivateStateProvider IndexedDB Task 1: lihat komentar di
 * private-state-idb.ts soal "kegagalan penyimpanan TIDAK PERNAH boleh
 * terlihat seperti 'belum ada data'" — di sini padanannya "kegagalan
 * mengambil artefak TIDAK PERNAH boleh terlihat seperti artefak yang sah").
 *
 * PENJAGA BALASAN HTML (dua lapis, bukan satu): provider ini mengirim
 * prover key yang diambilnya LANGSUNG ke proof server sebagai bagian dari
 * witness. Bila fetch diam-diam menerima balasan HTML dari fallback SPA
 * (proxy salah konfigurasi, portal wifi, atau — sebelum server/index.ts
 * punya rute /zk/ballot — express.static yang tidak menemukan berkas dan
 * jatuh ke index.html) sebagai "artefak", kegagalannya baru kelihatan jauh
 * kemudian sebagai proof yang ditolak proof server, dan tidak ada yang
 * menunjuk balik ke sini. Karena itu balasan disaring DI TITIK FETCH INI,
 * memakai pola YANG SAMA dengan `balasanHtml` di ./graphql.ts dan di
 * client/src/lib/proof-server.ts: content-type SAJA tidak cukup (reverse
 * proxy bisa menjawab HTML tanpa pernah menyetel content-type dengan benar),
 * jadi awal badan balasan ikut disniff dengan regex yang PERSIS SAMA
 * (`/^\s*<(!doctype html|html)\b/i`).
 */
import {
  createProverKey,
  createVerifierKey,
  createZKIR,
  ZKConfigProvider,
} from "@midnight-ntwrk/midnight-js-types";

const KEY_DIR = "keys";
const PROVER_EXT = ".prover";
const VERIFIER_EXT = ".verifier";
const ZKIR_DIR = "zkir";
const ZKIR_EXT = ".bzkir";

/**
 * SENGAJA lebih sempit dari `typeof fetch` (yang menerima `URL | RequestInfo`):
 * setiap pemanggilan di berkas ini membangun `url` sebagai string lewat
 * template literal (lihat `urlUntuk`), tidak pernah objek `URL`/`Request`.
 * Menahan tanda tangan pada `string` membuat mock uji type-checkable tanpa
 * `as unknown as typeof fetch` (pola yang dipakai graphql.test.ts/
 * proof-server.test.ts, tapi dilarang untuk berkas ini) — `fetch` global
 * tetap cocok sebagai nilai bawaan karena parameternya yang lebih LEBAR
 * (menerima string) adalah supertipe yang sah dari tanda tangan yang lebih
 * sempit ini.
 */
type Ambil = (url: string, init?: RequestInit) => Promise<Response>;

/** Sama persis dengan regex di balasanHtml (graphql.ts / proof-server.ts). */
const POLA_HTML = /^\s*<(!doctype html|html)\b/i;
/** Berapa banyak byte awal yang cukup disniff — jauh di bawah artefak biner terkecil. */
const SNIFF_BYTES = 256;

export class GalatArtefakZk extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GalatArtefakZk";
  }
}

/**
 * Disalin sebagai pola dari balasanHtml (./graphql.ts, client/src/lib/proof-server.ts),
 * alasannya sama: fallback SPA bisa menjawab HTTP 200 dengan content-type
 * yang salah (atau tanpa content-type sama sekali) sehingga `res.ok` bernilai
 * true dan badannya diam-diam diperlakukan sebagai artefak sah.
 */
function balasanHtmlArtefak(contentType: string, bytes: Uint8Array): boolean {
  if (contentType.includes("text/html")) return true;
  const awal = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, SNIFF_BYTES));
  return POLA_HTML.test(awal);
}

async function ambilArtefak(ambil: Ambil, url: string): Promise<Uint8Array> {
  const res = await ambil(url, { cache: "no-store" });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const tipe = (res.headers.get("content-type") ?? "").toLowerCase();
  if (balasanHtmlArtefak(tipe, bytes)) {
    throw new GalatArtefakZk(
      `GET ${url} mengembalikan text/html — kemungkinan fallback SPA menjawab artefak yang hilang.`,
    );
  }
  if (!res.ok) {
    throw new GalatArtefakZk(`GET ${url} -> HTTP ${res.status}`);
  }
  return bytes;
}

export class FetchZkConfigProvider<K extends string> extends ZKConfigProvider<K> {
  constructor(
    private readonly baseUrl: string,
    private readonly ambil: Ambil = fetch,
  ) {
    super();
  }

  private urlUntuk(subDir: string, circuitId: K, ext: string): string {
    return `${this.baseUrl}/${subDir}/${circuitId}${ext}`;
  }

  getProverKey(circuitId: K) {
    return ambilArtefak(this.ambil, this.urlUntuk(KEY_DIR, circuitId, PROVER_EXT)).then(createProverKey);
  }

  getVerifierKey(circuitId: K) {
    return ambilArtefak(this.ambil, this.urlUntuk(KEY_DIR, circuitId, VERIFIER_EXT)).then(createVerifierKey);
  }

  getZKIR(circuitId: K) {
    return ambilArtefak(this.ambil, this.urlUntuk(ZKIR_DIR, circuitId, ZKIR_EXT)).then(createZKIR);
  }
}

/**
 * Penjaga MURAH sebelum konstruksi provider penuh: hanya verifier key
 * (2.119 B untuk castVote/tallyVote — diukur sendiri lewat `stat`, lihat
 * task-2-report.md), BUKAN prover key (9.990.205 B castVote / 5.223.586 B
 * tallyVote) — menggagalkan alur sebelum unduhan besar ditarik.
 */
export async function pastikanArtefakZkMurah(
  baseUrl: string,
  circuitId: string,
  ambil: Ambil = fetch,
): Promise<void> {
  await ambilArtefak(ambil, `${baseUrl}/${KEY_DIR}/${circuitId}${VERIFIER_EXT}`);
}

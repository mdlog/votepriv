/**
 * Sisi KLIEN dari "registration inbox": app pemilih mengirim LEAF-nya
 * (hash publik credential) ke inbox penyelenggara, lalu memantau sampai
 * pendaftarannya mendarat di rantai.
 *
 * Dari mana URL inbox datang: DARI RANTAI. `eligibilityPolicy` ballot (sealed
 * saat deploy) memuat URL-nya — lihat `kebijakanEligibility` di
 * pkgs/cli/src/pendaftaran-awal.ts. App tidak punya konfigurasi inbox sama
 * sekali: ballot yang berbeda bisa punya inbox yang berbeda, dan ballot tanpa
 * URL memakai alur manual (salin leaf, kirim ke penyelenggara).
 *
 * Dua sumber kebenaran, dipakai berlapis:
 *   1. Status dari inbox (queued → submitting → registered/failed, txId) —
 *      cepat, tapi itu KLAIM server penyelenggara.
 *   2. Keanggotaan leaf di pohon eligibility on-chain, dibaca dari indexer
 *      (`leafTerdaftarDiRantai`) — lambat beberapa detik, tapi itu BUKTI.
 *   UI hanya mengatakan "registered" setelah (2) benar.
 *
 * Yang dikirim: ballot (publik) + leaf (publik). Server inbox, seperti server
 * web mana pun, juga melihat alamat IP pengirim — dinyatakan apa adanya di UI.
 */
import { dekodeKeanggotaanLeaf } from "./dekode";
import { GalatRantai, postGraphQL } from "./graphql";

export type StatusInbox = "queued" | "submitting" | "registered" | "failed";

export type JawabanInbox = {
  leaf: string;
  status: StatusInbox;
  txId?: string;
  error?: string;
};

/**
 * Mengambil URL inbox dari teks kebijakan eligibility. Hanya https, atau
 * http://localhost / 127.0.0.1 (pengembangan) — URL http ke host lain
 * diabaikan: leaf memang publik, tapi jawaban inbox (status, txId) tidak
 * boleh bisa dipalsukan di tengah jalan oleh siapa pun di jaringan pemilih.
 */
export function alamatInboxDariKebijakan(kebijakan: string): string | null {
  const m = /(https:\/\/[^\s"'<>]+|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?[^\s"'<>]*)/.exec(kebijakan);
  if (!m) return null;
  // Tanda baca penutup kalimat bukan bagian URL.
  return m[1].replace(/[.,;:)\]]+$/, "");
}

export class GalatInbox extends Error {
  readonly kode: number | null;
  constructor(message: string, kode: number | null) {
    super(message);
    this.name = "GalatInbox";
    this.kode = kode;
  }
}

async function bacaJawaban(res: Response): Promise<JawabanInbox> {
  const teks = await res.text();
  let json: Partial<JawabanInbox> & { error?: string };
  try {
    json = JSON.parse(teks) as typeof json;
  } catch {
    throw new GalatInbox(
      `The registration inbox answered with something that is not JSON (HTTP ${res.status}). ` +
        "This is usually a proxy or captive portal standing in front of it.",
      res.status,
    );
  }
  if (!res.ok) {
    throw new GalatInbox(json.error ?? `The registration inbox refused the request (HTTP ${res.status}).`, res.status);
  }
  if (typeof json.leaf !== "string" || typeof json.status !== "string") {
    throw new GalatInbox("The registration inbox answered without a status.", res.status);
  }
  return json as JawabanInbox;
}

export async function kirimLeafKeInbox(input: {
  url: string;
  ballot: string;
  leaf: string;
  signal?: AbortSignal;
  ambil?: typeof fetch;
}): Promise<JawabanInbox> {
  const { url, ballot, leaf, signal, ambil = fetch } = input;
  let res: Response;
  try {
    res = await ambil(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ballot, leaf }),
      signal,
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new GalatInbox(`Could not reach the registration inbox at ${hostDari(url)}: ${e instanceof Error ? e.message : String(e)}`, null);
  }
  return bacaJawaban(res);
}

export async function statusInbox(input: {
  url: string;
  ballot: string;
  leaf: string;
  signal?: AbortSignal;
  ambil?: typeof fetch;
}): Promise<JawabanInbox> {
  const { url, ballot, leaf, signal, ambil = fetch } = input;
  let res: Response;
  try {
    res = await ambil(`${url.replace(/\/$/, "")}/${ballot}/${leaf}`, { signal, cache: "no-store" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new GalatInbox(`Could not reach the registration inbox at ${hostDari(url)}: ${e instanceof Error ? e.message : String(e)}`, null);
  }
  return bacaJawaban(res);
}

const KUERI_STATE = `query Keanggotaan($a: HexEncoded!) { c: contract(address: $a) { state } }`;

/**
 * BUKTI on-chain: apakah `leafHex` sudah ada di pohon eligibility ballot?
 * Membaca state kontrak terbaru dari indexer dan memakai
 * `eligibility.findPathForLeaf` dari ledger kontrak yang di-decode — kode
 * yang sama yang nanti dipakai castVote untuk menyusun path.
 */
export async function leafTerdaftarDiRantai(input: {
  indexer: string;
  ballot: string;
  leafHex: string;
  signal?: AbortSignal;
  ambil?: typeof fetch;
}): Promise<boolean> {
  const { indexer, ballot, leafHex, signal, ambil } = input;
  const { data } = await postGraphQL<{ c: { state: string } | null }>({
    url: indexer,
    query: KUERI_STATE,
    variables: { a: ballot },
    signal,
    ambil,
  });
  if (!("c" in data)) throw new GalatRantai("registry-skema", "The indexer answered without the contract field.", hostDari(indexer));
  if (data.c === null) return false;
  return dekodeKeanggotaanLeaf(data.c.state, ballot, leafHex);
}

function hostDari(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

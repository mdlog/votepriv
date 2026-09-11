/**
 * Transport GraphQL ke indexer Midnight.
 *
 * MENGAPA fetch mentah dan BUKAN midnight-js-indexer-public-data-provider:
 * provider itu menyeret ledger-v8 (10.143.782 B) ke dalam bundel dan membuatnya
 * 12.383.609 B — 8,5x lipat — tanpa menambah satu pun kemampuan untuk MEMBACA.
 * ledger-v8 adalah milik jalur TULIS. Diverifikasi lewat build yang dijalankan,
 * bukan dibaca dari dokumentasi.
 *
 * Konsekuensinya jujur: karena tidak ada pustaka yang menangani kegagalan untuk
 * kita, seluruh taksonomi kegagalan ada di berkas ini. Itu bukan beban tambahan
 * melainkan syarat — UI tidak bisa mengatakan "indexer tak terjangkau" berbeda
 * dari "kontrak tidak ditemukan" kalau lapis ini meratakan keduanya jadi satu
 * catch.
 *
 * Berkas ini TIDAK mengimpor WASM. Ia bisa diuji, dan diuji, tanpa menyalakan
 * onchain-runtime sama sekali.
 */

/**
 * Sebab kegagalan. DELAPAN, dan tiap-tiapnya punya kalimat sendiri di UI.
 *
 * Dua di antaranya ada justru karena meratakannya menghasilkan pesan yang SALAH,
 * bukan sekadar pesan yang kurang tepat:
 *
 *   - `registry-hilang` dipisah dari `graphql-fatal`. `graphql-fatal` dilempar
 *     oleh transport ini pada `data: null` di tingkat atas — yang sebabnya
 *     biasanya galat validasi skema, misalnya `Unknown field "applyStage"` saat
 *     indexer berubah. Melaporkan itu sebagai "Registry not found on this
 *     network" mengirim pembaca memeriksa VITE_MIDNIGHT_NETWORK padahal yang
 *     berubah adalah skema indexer.
 *   - `registry-skema` dipisah dari `registry-hilang`. Keduanya lahir dari
 *     kueri Registry (baca-rantai.ts), tapi bentuk kegagalannya BEDA: `r`
 *     bernilai `null` berarti kueri berhasil dan indexer memang menjawab
 *     "tidak ada kontrak di alamat ini" — itulah `registry-hilang`. Kunci `r`
 *     HILANG SELURUHNYA dari `data` berarti kueri itu sendiri gagal divalidasi
 *     (alias tidak cocok, skema berubah) — indexer tidak pernah sampai
 *     menjawab pertanyaan "ada kontrak atau tidak". Melaporkan keduanya
 *     dengan sebab yang sama pernah terjadi di Task 5 dan mengirim pembaca
 *     memeriksa jaringan padahal yang salah adalah bentuk kuerinya.
 *   - `konfigurasi` dipisah dari semuanya. Salah ketik VITE_MIDNIGHT_NETWORK
 *     terjadi SEBELUM ada jaringan yang dituju sama sekali; melaporkannya
 *     sebagai kegagalan jaringan menuntut UI mengarang objek JaringanAktif
 *     untuk ditampilkan, dan objek karangan itu akan menyebut jaringan yang
 *     TIDAK diminta operator.
 */
export type SebabGalatRantai =
  /** fetch menolak: DNS, offline, CORS, dibatalkan */
  | "jaringan"
  /** HTTP status bukan 2xx */
  | "http"
  /** badan balasan bukan JSON yang sah */
  | "bukan-json"
  /** balasan berupa HTML — fallback SPA, portal wifi, reverse proxy nyasar */
  | "balasan-html"
  /** GraphQL menjawab data: null di tingkat atas — kueri tidak dieksekusi sama sekali (validasi/skema) */
  | "graphql-fatal"
  /** Kueri berhasil, tetapi tidak ada kontrak pada alamat registry. Dilempar baca-rantai.ts. */
  | "registry-hilang"
  /** Kunci `r` HILANG SELURUHNYA dari jawaban Registry — galat skema/alias, BUKAN registry kosong. Dilempar baca-rantai.ts. */
  | "registry-skema"
  /** ContractState/ledger melempar; dilempar oleh dekode.ts, bukan berkas ini */
  | "dekode"
  /** env salah ketik atau alamat registry tidak sah. Terjadi SEBELUM ada jaringan yang dituju. */
  | "konfigurasi";

export class GalatRantai extends Error {
  readonly sebab: SebabGalatRantai;
  /**
   * Rincian teknis, apa adanya. DITAMPILKAN KE PENGGUNA di dalam panel galat —
   * menyembunyikannya membuat laporan galat dari pengguna tidak berguna.
   *
   * Karena ia berakhir di layar, `rincian` adalah TEKS UI dan ditulis dalam
   * BAHASA INGGRIS, bukan Indonesia. Ini satu-satunya pengecualian terhadap
   * aturan "pesan galat internal berbahasa Indonesia" di rencana C-2a, dan
   * alasannya sederhana: pesan yang dirender ke pengguna adalah teks UI, apa pun
   * namanya di kode. Komentar dan prosa di sekitarnya tetap Indonesia.
   */
  readonly rincian: string;
  /** Host yang dihubungi. Dipakai permukaan gagal untuk menyebut APA yang dicoba. */
  readonly host: string;

  constructor(sebab: SebabGalatRantai, rincian: string, host: string) {
    super(`[${sebab}] ${rincian}`);
    this.name = "GalatRantai";
    this.sebab = sebab;
    this.rincian = rincian;
    this.host = host;
  }
}

export type JawabanGraphQL<T> = {
  /**
   * TIDAK nullable pada nilai yang BENAR-BENAR dikembalikan: `data === null` di
   * tingkat atas sudah dilempar sebagai `graphql-fatal` di bawah, sebelum fungsi
   * ini kembali. Pemanggil karena itu tidak perlu memeriksanya lagi — dan
   * pemeriksaan yang tidak perlu adalah tempat cabang mati tumbuh.
   *
   * Bisa terisi SEBAGIAN bersamaan dengan errors yang tidak kosong.
   *
   * Ini bukan teori. Diverifikasi terhadap indexer sungguhan: kueri dua alias
   * dengan satu alamat sah dan satu alamat bukan-hex mengembalikan data.b0
   * terisi, kunci b1 TIDAK MUNCUL sama sekali, dan satu entri di errors.
   *
   * Karena itu pemanggil WAJIB memeriksa keberadaan kunci (`"b1" in data`),
   * bukan nilainya (`data.b1 === null`), dan TIDAK BOLEH memperlakukan errors
   * yang tidak kosong sebagai kegagalan total. Memperlakukannya begitu berarti
   * satu entri sampah di registry — yang permissionless — menghapus seluruh
   * ballot dari layar, yaitu persis bentuk "kegagalan indexer terlihat seperti
   * tidak ada ballot" yang dilarang rencana ini.
   */
  data: T;
  errors: readonly { message: string }[];
};

/**
 * Penjaga balasan HTML.
 *
 * Disalin sebagai pola dari client/src/lib/proof-server.ts, dan alasannya sama:
 * fallback SPA menjawab HTTP 200 dengan text/html, sehingga res.ok bernilai true
 * dan JSON.parse gagal dengan pesan yang menyesatkan ("Unexpected token '<'").
 * Spec 14.4 menyebut kelas cacat ini eksplisit. Indexer publik bukan SPA, tetapi
 * setiap proxy, portal wifi, dan reverse proxy antara pengguna dan indexer bisa
 * menjadi SPA itu.
 */
function balasanHtml(contentType: string | null, body: string): boolean {
  return (
    (contentType ?? "").toLowerCase().includes("text/html") ||
    /^\s*<(!doctype html|html)\b/i.test(body)
  );
}

function hostDari(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function postGraphQL<T>(input: {
  url: string;
  query: string;
  variables?: Record<string, unknown>;
  signal?: AbortSignal;
  ambil?: typeof fetch;
}): Promise<JawabanGraphQL<T>> {
  const { url, query, variables, signal, ambil = fetch } = input;
  const host = hostDari(url);

  let res: Response;
  try {
    res = await ambil(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal,
      cache: "no-store",
    });
  } catch (e) {
    // AbortError dibiarkan naik apa adanya: ia BUKAN kegagalan, melainkan
    // pembatalan yang diminta pemanggil (komponen di-unmount, refresh baru
    // menyusul). Membungkusnya jadi GalatRantai akan memunculkan panel galat
    // setiap kali pengguna berpindah section.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new GalatRantai("jaringan", e instanceof Error ? e.message : String(e), host);
  }

  const teks = await res.text();

  if (balasanHtml(res.headers.get("content-type"), teks)) {
    throw new GalatRantai(
      "balasan-html",
      // rincian adalah TEKS UI — ditulis Inggris; lihat komentar di GalatRantai.
      // (praperiksa P3: sempat Indonesia di sini, dan case "balasan-html" adalah
      // satu-satunya cabang pesanGagal yang TIDAK menyisipkan rincian ke layar —
      // itulah kenapa kebocoran ini tidak pernah membuat satu uji pun merah.)
      `${host} answered with HTML instead of JSON GraphQL (HTTP ${res.status}). This is usually a proxy, captive portal, or SPA fallback standing in front of the indexer.`,
      host,
    );
  }

  if (!res.ok) {
    throw new GalatRantai("http", `HTTP ${res.status} ${res.statusText}: ${teks.slice(0, 200)}`, host);
  }

  let json: { data?: T | null; errors?: readonly { message: string }[] };
  try {
    json = JSON.parse(teks) as typeof json;
  } catch (e) {
    throw new GalatRantai("bukan-json", e instanceof Error ? e.message : String(e), host);
  }

  const errors = json.errors ?? [];
  const data = json.data ?? null;

  // data === null di tingkat atas berarti kueri tidak dieksekusi sama sekali —
  // galat validasi atau koersi argumen. Itu kegagalan total dan BERBEDA dari
  // kegagalan sebagian, yang justru punya data terisi bersama errors.
  if (data === null) {
    // rincian adalah TEKS UI — ditulis Inggris; lihat komentar di GalatRantai.
    // (praperiksa P3: fallback ini sempat Indonesia dan bocor apa adanya ke
    // panel galat lewat case "graphql-fatal", yang MEMANG menyisipkan rincian.)
    const pesan = errors.length > 0 ? errors.map(e => e.message).join("; ") : "the indexer answered data: null without any errors";
    throw new GalatRantai("graphql-fatal", pesan, host);
  }

  return { data, errors };
}

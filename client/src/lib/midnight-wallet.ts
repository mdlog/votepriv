/**
 * Koneksi ke wallet Midnight (Lace) lewat DApp Connector API.
 *
 * Catatan penting soal penemuan konektor: contoh-contoh yang beredar memakai
 * `window.midnight.mnLace`. Itu pola connector API 3.x. Lace yang beredar sekarang
 * mendaftarkan dirinya di bawah kunci UUID acak dan membawa field `rdns`, mengikuti
 * pola penemuan multi-wallet ala EIP-6963. Menelusuri seluruh kunci lalu memilih
 * berdasarkan `rdns` bekerja untuk keduanya; mengandalkan nama kunci tidak.
 */

export const LACE_RDNS = "io.lace.wallet";

/**
 * Lace mewajibkan network ID saat connect — memanggil tanpa argumen ditolak dengan
 * "Invalid network ID: undefined". Daftar nilai sah di bawah ini berasal langsung dari
 * pesan galat Lace, bukan tebakan.
 *
 * Perhatikan bedanya "sah" dan "didukung": ketujuh nilai di atas diterima sebagai
 * identifier, tapi Lace hanya benar-benar melayani undeployed, mainnet, preview,
 * dan preprod. Menyebut `testnet` ditolak dengan "Unsupported network ID", bukan
 * "Network ID mismatch" — sehingga daftar probe hanya boleh berisi yang didukung,
 * dan kedua bentuk penolakan itu harus sama-sama dibaca sebagai "jaringan keliru".
 *
 * Tidak ada cara menanyakan jaringan wallet SEBELUM tersambung, tapi kedua
 * penolakan tadi terjadi seketika tanpa popup, jadi mencoba berurutan itu murah.
 */
export const PROBE_NETWORKS = ["preprod", "preview", "undeployed"] as const;

// mainnet sengaja TIDAK ikut diprobe. Ini aplikasi testnet; menyambung ke uang
// sungguhan tanpa diminta bukan sesuatu yang boleh terjadi karena kebetulan urutan.
export const MAINNET = "mainnet";

/** Jaringan dibaca dari prefiks bech32 alamat, mis. mn_addr_preprod1… → "preprod". */
function networkFromAddress(address: string): string {
  const m = address.match(/^mn_(?:shield-)?addr_([a-z0-9]+?)1/i);
  return m?.[1] ?? "unknown";
}

export type ConnectorInfo = {
  key: string;
  name: string;
  rdns?: string;
  icon?: string;
  apiVersion: string;
};

/** Bentuk yang dikembalikan getConfiguration() pada connector 4.0.1. */
export type WalletConfiguration = {
  networkId?: string;
  indexerUri?: string;
  indexerWsUri?: string;
  proverServerUri?: string;
  substrateNodeUri?: string;
};

export type WalletConnection = {
  /** Alamat shielded — yang relevan untuk voting privat. */
  address: string;
  unshieldedAddress?: string;
  /** Dibutuhkan WalletProvider midnight-js pada tahap kontrak. */
  coinPublicKey?: string;
  encryptionPublicKey?: string;
  networkId: string;
  connectorName: string;
  apiVersion: string;
  /** Endpoint indexer/node/proof-server datang dari wallet, bukan dari konstanta kita. */
  configuration?: WalletConfiguration;
  /** Objek API mentah dari wallet, dipakai lapisan provider pada tahap kontrak. */
  api: unknown;
};

/** Alamat bisa datang sebagai string, array, atau objek — terima ketiganya. */
function firstAddress(v: unknown): string | undefined {
  if (typeof v === "string") return v || undefined;
  if (Array.isArray(v)) {
    for (const item of v) {
      const a = firstAddress(item);
      if (a) return a;
    }
    return undefined;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Nama kunci diambil dari respons Lace yang sebenarnya, bukan tebakan generik.
    for (const k of ["shieldedAddress", "unshieldedAddress", "address", "bech32", "value"]) {
      if (typeof o[k] === "string" && o[k]) return o[k] as string;
    }
  }
  return undefined;
}

export type WalletErrorCode =
  | "NO_CONNECTOR"
  | "WALLET_STALE"
  | "TIMEOUT"
  | "CONNECT_REJECTED"
  | "NETWORK_MISMATCH"
  | "NO_ADDRESS"
  | "UNKNOWN";

export class WalletError extends Error {
  constructor(
    readonly code: WalletErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

type RawConnector = {
  name?: string;
  apiVersion?: string;
  icon?: string;
  rdns?: string;
  connect: (networkId?: string) => Promise<unknown>;
};

const root = (): Record<string, RawConnector> | undefined =>
  (globalThis as unknown as { midnight?: Record<string, RawConnector> }).midnight;

/** Semua konektor Midnight yang menyuntikkan diri ke halaman ini. */
export function listConnectors(): ConnectorInfo[] {
  const injected = root();
  if (!injected) return [];
  return Object.entries(injected).map(([key, c]) => ({
    key,
    name: c?.name ?? key,
    rdns: c?.rdns,
    icon: c?.icon,
    apiVersion: c?.apiVersion ?? "unknown",
  }));
}

/** Lace bila ada, kalau tidak konektor pertama yang menyuntikkan diri. */
function pickConnector(): { info: ConnectorInfo; raw: RawConnector } {
  const injected = root();
  const all = listConnectors();
  if (!injected || all.length === 0) {
    throw new WalletError(
      "NO_CONNECTOR",
      "Tidak ada wallet Midnight yang terdeteksi. Pasang ekstensi Lace, lalu muat ulang halaman ini.",
    );
  }
  const info = all.find((c) => c.rdns === LACE_RDNS) ?? all[0];
  return { info, raw: injected[info.key] };
}

/**
 * Objek yang disuntikkan ekstensi adalah handle hidup ke dalam service worker-nya.
 * Ketika worker itu restart — karena tidur, karena ganti jaringan, atau karena
 * ekstensinya dimuat ulang — handle yang masih dipegang halaman ini sudah mati,
 * dan panggilan pertama lewat handle itu gagal dengan pesan soal kanal, bukan soal
 * wallet.
 *
 * Yang penting: mencoba ulang TIDAK menolong. Handle-nya sendiri yang mati, bukan
 * worker-nya yang sibuk. Hanya muat ulang halaman yang membuat ekstensi menyuntikkan
 * handle baru yang hidup.
 */
function handleBasi(msg: string): boolean {
  return /was shutdown|no longer be used|context invalidated|receiving end does not exist|could not establish connection/i.test(
    msg,
  );
}

/** Kedua pesan ini sama artinya: jaringannya yang keliru, bukan Anda. */
function jaringanKeliru(msg: string): boolean {
  return /network id mismatch/i.test(msg) || /unsupported network id/i.test(msg);
}

/** Lace membuka jendela persetujuan di luar halaman, jadi permintaan yang tidak
 * dijawab terlihat sama persis dengan ekstensi yang mati dari sini: promise-nya
 * tidak pernah selesai. Tanpa batas waktu, tombolnya tersangkut selamanya. */
export const WALLET_LAMBAT_MS = 8_000;
export const WALLET_TIMEOUT_MS = 120_000;

export async function tungguWallet<T>(
  panggilan: Promise<T>,
  opsi: { onLambat?: () => void; lambatMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const { onLambat, lambatMs = WALLET_LAMBAT_MS, timeoutMs = WALLET_TIMEOUT_MS } = opsi;
  let tLambat: ReturnType<typeof setTimeout> | undefined;
  let tKeras: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      panggilan,
      new Promise<never>((_, reject) => {
        if (onLambat) tLambat = setTimeout(onLambat, lambatMs);
        tKeras = setTimeout(
          () =>
            reject(
              new WalletError(
                "TIMEOUT",
                `Wallet tidak menjawab dalam ${Math.round(timeoutMs / 1000)} detik. Periksa apakah ada jendela persetujuan yang menunggu, dan pastikan wallet tidak terkunci.`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(tLambat);
    clearTimeout(tKeras);
  }
}

/**
 * SELURUH log diagnostik di berkas ini digerbangi `import.meta.env.DEV`, dan
 * gerbangnya ditulis di TITIK PANGGIL, bukan di dalam sebuah helper.
 *
 * Alasannya bukan sekadar kebersihan. vite.config.ts menyuntikkan collector yang
 * mem-POST setiap entri console ke dev server, yang menuliskannya ke
 * .manus-logs/browserConsole.log. Pada konfigurasi tunnel yang didukung branch
 * ini, "dev server" itu adalah mesin orang lain — sehingga log berisi alamat
 * shielded, shieldedCoinPublicKey, shieldedEncryptionPublicKey, dan URI
 * indexer/node/prover milik pengguna akan mendarat sebagai berkas di mesin itu.
 *
 * Gerbang di titik panggil karena Vite mengganti `import.meta.env.DEV` menjadi
 * `false` saat build, sehingga esbuild membuang seluruh blok — termasuk argumen
 * dan JSON.stringify di dalamnya. Helper `devLog(...)` hanya membuat BADAN-nya
 * kosong: pemanggilannya, string-nya, dan penyusunan argumennya tetap ikut
 * terbundel. Bentuk ini dapat diperiksa siapa pun dengan grep terhadap bundle.
 */

/**
 * Nama field saja, tanpa nilainya. Untuk introspeksi bentuk jawaban wallet,
 * nama field-lah yang berguna — nilainya justru bahan yang tidak boleh
 * disalin ke mana-mana.
 */
const namaField = (v: unknown): string[] =>
  v && typeof v === "object" ? Object.keys(v as object) : [];

/** Memanggil method opsional pada objek API wallet; undefined bila tidak tersedia. */
async function tryCall<T>(api: unknown, method: string): Promise<T | undefined> {
  const fn = (api as Record<string, unknown> | null)?.[method];
  if (typeof fn !== "function") return undefined;
  try {
    return (await (fn as () => Promise<T>).call(api)) as T;
  } catch (error) {
    console.warn(`[votepriv:wallet] ${method}() gagal`, error);
    return undefined;
  }
}

/**
 * Membuka koneksi ke wallet. Memunculkan popup izin di Lace — hanya panggil
 * sebagai respons langsung atas aksi pengguna, jangan saat halaman dimuat.
 */
export async function connectMidnightWallet(
  networkId?: string,
  onLambat?: () => void,
): Promise<WalletConnection> {
  const { info, raw } = pickConnector();
  if (import.meta.env.DEV) {
    console.log("[votepriv:wallet] konektor terpilih", JSON.stringify(info));
  }

  // Kalau pengguna menyebut jaringan, hormati itu saja. Kalau tidak, coba berurutan.
  const urutan = networkId ? [networkId] : [...PROBE_NETWORKS];

  let api: unknown;
  let terpakai = "";
  const ditolak: string[] = [];

  for (const net of urutan) {
    try {
      api = await tungguWallet(raw.connect(net), { onLambat });
      // Wallet tidak pernah menyebut jaringannya sendiri saat menolak, jadi
      // pastikan yang tersambung memang yang diminta.
      const status = await tryCall<{ networkId?: string }>(api, "getConnectionStatus");
      if (status?.networkId && status.networkId !== net) {
        throw new WalletError(
          "NETWORK_MISMATCH",
          `Wallet tersambung ke ${status.networkId}, padahal yang diminta ${net}.`,
        );
      }
      terpakai = net;
      break;
    } catch (error) {
      if (error instanceof WalletError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      // Jaringan keliru — murah, tanpa popup, lanjut ke kandidat berikutnya.
      if (jaringanKeliru(msg)) {
        ditolak.push(net);
        continue;
      }
      if (handleBasi(msg)) {
        throw new WalletError(
          "WALLET_STALE",
          "Ekstensi wallet sempat restart, sehingga halaman ini memegang koneksi yang sudah mati. Muat ulang halaman — dengan wallet dalam keadaan tidak terkunci — lalu sambungkan lagi.",
          error,
        );
      }
      // Apa pun selain itu (pengguna menolak, wallet terkunci) harus menghentikan
      // langkah — melanjutkan hanya akan menumpuk popup.
      throw new WalletError("CONNECT_REJECTED", msg || "Wallet menolak permintaan koneksi.", error);
    }
  }

  if (!terpakai) {
    throw new WalletError(
      "NETWORK_MISMATCH",
      `Wallet tidak berada di satu pun jaringan yang didukung (dicoba: ${ditolak.join(", ")}). ` +
        "Kalau Lace sedang di mainnet, pindahkan ke salah satu jaringan testnet.",
    );
  }
  if (import.meta.env.DEV) {
    console.log(
      "[votepriv:wallet] tersambung di jaringan",
      terpakai,
      "— ditolak:",
      JSON.stringify(ditolak),
    );
  }

  // Bentuk API setelah connect belum sepenuhnya pasti pada 4.x — dicatat sebagai JSON
  // supaya terbaca utuh saat disalin dari console (debug-collector menciutkan objek).
  if (import.meta.env.DEV) {
    console.log(
      "[votepriv:wallet] bentuk API setelah connect",
      JSON.stringify({
        own: api ? Object.keys(api as object) : [],
        proto: api ? Object.getOwnPropertyNames(Object.getPrototypeOf(api)) : [],
      }),
    );
  }

  // Connector 4.0.1 tidak punya state() maupun serviceUriConfig() — itu bentuk 3.x
  // yang dipakai contoh-contoh lama. Nama method di bawah berasal dari introspeksi
  // objek api yang benar-benar dikembalikan Lace, bukan dari dokumentasi.
  const shielded = await tryCall<Record<string, unknown>>(api, "getShieldedAddresses");
  const unshielded = await tryCall<Record<string, unknown>>(api, "getUnshieldedAddress");
  const configuration = await tryCall<WalletConfiguration>(api, "getConfiguration");

  // Nama field saja, BUKAN isinya. Ketiga jawaban ini memuat alamat shielded,
  // shieldedCoinPublicKey, shieldedEncryptionPublicKey, dan URI indexer/node/
  // prover milik wallet pengguna — tidak satu pun perlu tercetak untuk mengetahui
  // bentuk jawaban wallet, dan justru itu yang membuat log ini berbahaya.
  if (import.meta.env.DEV) {
    console.log(
      "[votepriv:wallet] bentuk jawaban alamat & konfigurasi",
      JSON.stringify({
        getShieldedAddresses: namaField(shielded),
        getUnshieldedAddress: namaField(unshielded),
        getConfiguration: namaField(configuration),
      }),
    );
  }

  const unshieldedAddress = firstAddress(unshielded);
  const address = firstAddress(shielded) ?? unshieldedAddress;

  if (!address) {
    throw new WalletError(
      "NO_ADDRESS",
      "Wallet tersambung tapi tidak mengembalikan alamat. Periksa console untuk bentuk yang dikembalikan.",
    );
  }

  // Silang-periksa: jaringan yang diterima connect() harus sejalan dengan prefiks
  // alamat. Kalau berbeda, ada asumsi kita yang keliru dan itu harus terlihat.
  const dariAlamat = networkFromAddress(address);
  if (dariAlamat !== "unknown" && !terpakai.includes(dariAlamat) && !dariAlamat.includes(terpakai)) {
    console.warn(
      `[votepriv:wallet] jaringan tidak sejalan — connect() menerima "${terpakai}" tapi prefiks alamat "${dariAlamat}"`,
    );
  }

  return {
    address,
    unshieldedAddress,
    coinPublicKey: shielded?.shieldedCoinPublicKey as string | undefined,
    encryptionPublicKey: shielded?.shieldedEncryptionPublicKey as string | undefined,
    // getConfiguration() melaporkan jaringan yang wallet benar-benar pakai — itu
    // lebih layak dipercaya daripada nilai yang kebetulan diterima saat probe.
    networkId: configuration?.networkId ?? terpakai,
    connectorName: info.name,
    apiVersion: info.apiVersion,
    configuration,
    api,
  };
}

/** Pesan yang layak ditampilkan ke pengguna dari galat apa pun. */
export function describeWalletError(error: unknown): string {
  if (error instanceof WalletError) return error.message;
  if (error instanceof Error) return error.message;
  return "Gagal menyambung ke wallet.";
}

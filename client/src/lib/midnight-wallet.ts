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
 * Persoalannya: tidak ada cara menanyakan jaringan wallet SEBELUM tersambung, dan
 * menyebut jaringan yang salah ditolak dengan "Network ID mismatch". Untungnya
 * penolakan itu terjadi seketika tanpa popup, jadi kita boleh mencoba berurutan
 * sampai menemukan jaringan yang dipakai wallet.
 */
export const PROBE_NETWORKS = [
  "preprod",
  "preview",
  "testnet",
  "devnet",
  "qanet",
  "undeployed",
] as const;

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
  | "WALLET_ASLEEP"
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
 * Service worker ekstensi pada Chrome MV3 tidur setelah kira-kira 30 detik menganggur.
 * Saat itu terjadi, kanal pesan Lace mati dan panggilan apa pun gagal dengan galat
 * internal yang tidak berarti apa-apa bagi pengguna. Ini bukan penolakan — objeknya
 * cuma basi — jadi satu percobaan ulang biasanya cukup, dan tidak menumpuk popup
 * karena tidak ada popup yang sempat terbuka.
 */
function walletTertidur(msg: string): boolean {
  return /was shutdown|no longer be used|Receiving end does not exist|Could not establish connection|Extension context invalidated/i.test(
    msg,
  );
}

const jeda = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
/** connect() sekali, dengan satu percobaan ulang bila kanal ekstensi kebetulan basi. */
async function sambung(raw: RawConnector, net: string): Promise<unknown> {
  try {
    return await raw.connect(net);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!walletTertidur(msg)) throw error;
    console.warn(`[votepriv:wallet] kanal ekstensi basi (${msg}) — mencoba ulang sekali`);
    await jeda(600);
    return await raw.connect(net);
  }
}

export async function connectMidnightWallet(
  networkId?: string,
): Promise<WalletConnection> {
  const { info, raw } = pickConnector();
  console.log("[votepriv:wallet] konektor terpilih", JSON.stringify(info));

  // Kalau pengguna menyebut jaringan, hormati itu saja. Kalau tidak, coba berurutan.
  const urutan = networkId ? [networkId] : [...PROBE_NETWORKS];

  let api: unknown;
  let terpakai = "";
  const ditolak: string[] = [];

  for (const net of urutan) {
    try {
      api = await sambung(raw, net);
      terpakai = net;
      break;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Jaringan keliru — murah, tanpa popup, lanjut ke kandidat berikutnya.
      if (/mismatch/i.test(msg)) {
        ditolak.push(net);
        continue;
      }
      if (walletTertidur(msg)) {
        throw new WalletError(
          "WALLET_ASLEEP",
          "Ekstensi Lace sedang tidak aktif. Buka Lace dari toolbar Chrome untuk membangunkannya, lalu coba lagi.",
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
  console.log("[votepriv:wallet] tersambung di jaringan", terpakai, "— ditolak:", JSON.stringify(ditolak));

  // Bentuk API setelah connect belum sepenuhnya pasti pada 4.x — dicatat sebagai JSON
  // supaya terbaca utuh saat disalin dari console (debug-collector menciutkan objek).
  console.log(
    "[votepriv:wallet] bentuk API setelah connect",
    JSON.stringify({
      own: api ? Object.keys(api as object) : [],
      proto: api ? Object.getOwnPropertyNames(Object.getPrototypeOf(api)) : [],
    }),
  );

  // Connector 4.0.1 tidak punya state() maupun serviceUriConfig() — itu bentuk 3.x
  // yang dipakai contoh-contoh lama. Nama method di bawah berasal dari introspeksi
  // objek api yang benar-benar dikembalikan Lace, bukan dari dokumentasi.
  const shielded = await tryCall<Record<string, unknown>>(api, "getShieldedAddresses");
  const unshielded = await tryCall<Record<string, unknown>>(api, "getUnshieldedAddress");
  const configuration = await tryCall<WalletConfiguration>(api, "getConfiguration");

  console.log("[votepriv:wallet] getShieldedAddresses", JSON.stringify(shielded));
  console.log("[votepriv:wallet] getUnshieldedAddress", JSON.stringify(unshielded));
  console.log("[votepriv:wallet] getConfiguration", JSON.stringify(configuration));

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

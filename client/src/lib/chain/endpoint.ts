import {
  MIDNIGHT_NETWORK_ENDPOINTS,
  type MidnightNetworkId,
} from "@pkgs/shared/src/network-config";

/**
 * Jaringan mana yang dibaca, dan dari mana.
 *
 * Berkas ini MURNI: tidak ada fetch, tidak ada WASM, tidak ada state global. Itu
 * disengaja — seluruh lapis transport di graphql.ts dapat diuji tanpa pernah
 * menyalakan onchain-runtime.
 *
 * Endpoint TIDAK disalin ke sini. Ia diimpor dari pkgs/shared/src/network-config.ts,
 * yang sudah menjadi satu-satunya tempat endpoint jaringan didefinisikan di repo
 * ini. Menyalinnya akan melahirkan dua sumber kebenaran yang pasti berpisah, dan
 * berpisahnya tidak akan terlihat sampai seseorang membaca jaringan yang salah.
 *
 * PERHATIAN pada jalur wallet, yang BUKAN urusan C-2a tetapi mudah tertukar:
 * client/src/lib/midnight-wallet.ts memakai getConfiguration() milik ekstensi
 * untuk endpoint-nya sendiri, dan nilai itu terbukti berbeda (Lace 4.0.1 di
 * preprod melaporkan host blockfrost.lw.iog.io). Jalur BACA di berkas ini tidak
 * pernah menanyakan wallet apa pun — memang tidak ada wallet yang terlibat.
 */

/**
 * Jaringan tempat registry VotePriv benar-benar berada hari ini.
 *
 * Diverifikasi, bukan diasumsikan: kueri contractAction untuk alamat registry
 * mengembalikan null di preprod dan objek terisi di preview.
 */
export const JARINGAN_BAWAAN: MidnightNetworkId = "preview";

/**
 * Alamat kontrak registry. Satu-satunya titik masuk penemuan ballot (spec §2.3):
 * seluruh daftar ballot lahir dari `registry.ballots`.
 */
export const ALAMAT_REGISTRY_BAWAAN =
  "c42681741bff50e346b9e80493b622c57883f748cc0a3af60f71545e6f8ff35a";

export type JaringanAktif = {
  networkId: MidnightNetworkId;
  indexer: string;
  indexerWS: string;
  alamatRegistry: string;
};

const JARINGAN_SAH: readonly MidnightNetworkId[] = ["preprod", "preview", "undeployed"];

function bacaJaringan(nilai: string | undefined): MidnightNetworkId {
  if (nilai === undefined || nilai.trim() === "") return JARINGAN_BAWAAN;
  const rapi = nilai.trim() as MidnightNetworkId;
  if (!JARINGAN_SAH.includes(rapi)) {
    // Menjatuhkan diri ke jaringan bawaan di sini akan membuat salah ketik
    // ("previewe") membaca jaringan yang BERBEDA dari yang diminta operator,
    // secara diam-diam. Lebih baik gagal saat modul dimuat.
    throw new Error(
      // Teks ini sampai ke layar lewat permukaan "konfigurasi", jadi Inggris.
      `Unknown VITE_MIDNIGHT_NETWORK: ${JSON.stringify(nilai)}. Valid values: ${JARINGAN_SAH.join(", ")}`,
    );
  }
  return rapi;
}

/**
 * Bentuk alamat kontrak yang dapat dikirim ke indexer.
 *
 * `registry.register()` bersifat permissionless dan menerima Opaque<"string">
 * apa pun, jadi isi `registry.ballots` TIDAK dijamin berupa alamat. Diverifikasi:
 * alamat yang bukan hex membuat indexer menjawab errors untuk alias itu dan
 * MENGHILANGKAN kuncinya dari `data` — bukan mengembalikan null. Menyaringnya di
 * sini lebih murah daripada menangani kunci yang hilang di lapis atas, dan
 * membuat spanduk "sebagian" menyebut sebab yang tepat.
 *
 * Batas panjang 512 nibble bukan aturan protokol melainkan rem: entri sampah
 * sepanjang megabyte akan ikut masuk dokumen GraphQL kalau tidak direm.
 */
export function alamatKontrakValid(alamat: string): boolean {
  return /^[0-9a-fA-F]+$/.test(alamat) && alamat.length % 2 === 0 && alamat.length >= 2 && alamat.length <= 512;
}

export function jaringanAktif(
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<string, string | undefined>,
): JaringanAktif {
  const networkId = bacaJaringan(env.VITE_MIDNIGHT_NETWORK);
  const endpoint = MIDNIGHT_NETWORK_ENDPOINTS[networkId];
  const alamatRegistry = (env.VITE_VOTEPRIV_REGISTRY ?? "").trim() || ALAMAT_REGISTRY_BAWAAN;
  if (!alamatKontrakValid(alamatRegistry)) {
    throw new Error(
      `VITE_VOTEPRIV_REGISTRY is not a valid contract address: ${JSON.stringify(alamatRegistry)}`,
    );
  }
  return {
    networkId,
    indexer: endpoint.indexer,
    indexerWS: endpoint.indexerWS,
    alamatRegistry,
  };
}

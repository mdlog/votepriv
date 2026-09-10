export type MidnightNetworkId = "preprod" | "preview" | "undeployed";

export interface MidnightNetworkEndpoints {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly faucetUrl?: string;
}

/** Proof server lokal. Witness melewatinya, jadi bawaannya selalu di mesin sendiri. */
export const DEFAULT_PROOF_SERVER_URL = "http://127.0.0.1:6300";

/**
 * Satu-satunya tempat endpoint jaringan didefinisikan.
 *
 * Pengimpor nyata satu-satunya di repo ini adalah `pkgs/cli/src/config.ts`
 * (PreprodConfig/PreviewConfig): CLI headless memakai nilai di sini LANGSUNG
 * dan TANPA SYARAT sebagai endpoint aktualnya — tidak ada jalur di paket cli
 * yang memanggil getConfiguration() untuk menimpanya, jadi di sini nilai ini
 * BUKAN cadangan, melainkan satu-satunya sumber.
 *
 * `client/src/lib/midnight-wallet.ts` (jalur browser) memanggil
 * getConfiguration() milik wallet extension untuk endpoint-nya sendiri —
 * Lace 4.0.1 di preprod melaporkan host blockfrost.lw.iog.io, bukan host
 * midnight.network yang tercantum di sini — tapi berkas itu TIDAK mengimpor
 * konstanta ini sama sekali. Jalur browser dan jalur CLI terpisah total,
 * tidak berbagi nilai lewat modul ini.
 */
export const MIDNIGHT_NETWORK_ENDPOINTS: Record<MidnightNetworkId, MidnightNetworkEndpoints> = {
  preprod: {
    indexer: "https://indexer.preprod.midnight.network/api/v3/graphql",
    indexerWS: "wss://indexer.preprod.midnight.network/api/v3/graphql/ws",
    node: "https://rpc.preprod.midnight.network",
    faucetUrl: "https://faucet.preprod.midnight.network/",
  },
  preview: {
    indexer: "https://indexer.preview.midnight.network/api/v3/graphql",
    indexerWS: "wss://indexer.preview.midnight.network/api/v3/graphql/ws",
    node: "https://rpc.preview.midnight.network",
    faucetUrl: "https://faucet.preview.midnight.network/",
  },
  undeployed: {
    indexer: "http://127.0.0.1:8088/api/v3/graphql",
    indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
    node: "http://127.0.0.1:9944",
  },
};

export const faucetUrlFor = (networkId: string): string | undefined =>
  (MIDNIGHT_NETWORK_ENDPOINTS as Record<string, MidnightNetworkEndpoints>)[networkId]?.faucetUrl;

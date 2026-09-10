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
 * Ini nilai CADANGAN. Bila wallet melaporkan endpoint lewat getConfiguration(),
 * nilai wallet-lah yang dipakai — Lace 4.0.1 di preprod melaporkan host
 * blockfrost.lw.iog.io, bukan host midnight.network yang tercantum di sini.
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

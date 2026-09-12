/**
 * Perakitan ENAM provider ContractProviders<BallotC> untuk browser — bentuk
 * persis pkgs/cli/src/providers.ts (rakitProvidersBallot), dengan tiga
 * penggantian: privateStateProvider (IndexedDB, Task 1), zkConfigProvider
 * (fetch, Task 2), wallet di balik AdaptorWallet (Task 4/5).
 */
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { MidnightProvider, PublicDataProvider, WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import { BallotPrivateStateId, type BallotPrivateState } from "@pkgs/contract/src/ballot-witnesses.js";
import type { AdaptorWallet } from "./adaptor-wallet";
import type { SirkuitBallot } from "./kontrak-tulis";
import { buatPrivateStateProviderIdb } from "./private-state-idb";
import { FetchZkConfigProvider } from "./zk-config-fetch";

export type ProvidersBallotBrowser = {
  privateStateProvider: ReturnType<typeof buatPrivateStateProviderIdb<typeof BallotPrivateStateId, BallotPrivateState>>;
  publicDataProvider: PublicDataProvider;
  zkConfigProvider: FetchZkConfigProvider<SirkuitBallot>;
  proofProvider: ReturnType<typeof httpClientProofProvider<SirkuitBallot>>;
  walletProvider: WalletProvider;
  midnightProvider: MidnightProvider;
};

/** 600.000 ms — sama seperti CLI (pkgs/cli/src/providers.ts). */
const TIMEOUT_PROOF_MS = 600_000;
const NAMA_DB_PRIVATE_STATE = "votepriv-private-state";

export interface KonteksProviderTulis {
  indexerUri: string;
  indexerWsUri: string;
  zkBaseUrl: string;
  proofServerUrl: string;
  dompet: AdaptorWallet;
}

export function rakitProvidersBallotBrowser(kp: KonteksProviderTulis): ProvidersBallotBrowser {
  const zkConfigProvider = new FetchZkConfigProvider<SirkuitBallot>(kp.zkBaseUrl);
  return {
    privateStateProvider: buatPrivateStateProviderIdb<typeof BallotPrivateStateId, BallotPrivateState>(
      NAMA_DB_PRIVATE_STATE,
    ),
    publicDataProvider: indexerPublicDataProvider(kp.indexerUri, kp.indexerWsUri),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(kp.proofServerUrl, zkConfigProvider, { timeout: TIMEOUT_PROOF_MS }),
    walletProvider: kp.dompet,
    midnightProvider: kp.dompet,
  };
}

import path from "node:path";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { DEFAULT_PROOF_SERVER_URL, MIDNIGHT_NETWORK_ENDPOINTS } from "shared";

export const currentDir = path.resolve(new URL(import.meta.url).pathname, "..");

export interface Config {
  readonly networkId: string;
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

const logDirUntuk = (network: string) =>
  path.resolve(currentDir, "..", "logs", network, `${new Date().toISOString()}.log`);

export class PreprodConfig implements Config {
  networkId = "preprod";
  logDir = logDirUntuk("preprod");
  indexer = MIDNIGHT_NETWORK_ENDPOINTS.preprod.indexer;
  indexerWS = MIDNIGHT_NETWORK_ENDPOINTS.preprod.indexerWS;
  node = MIDNIGHT_NETWORK_ENDPOINTS.preprod.node;
  proofServer = DEFAULT_PROOF_SERVER_URL;

  constructor() {
    // midnight-js menyimpan network sebagai state global dan alamat dikodekan
    // terhadapnya. Wajib dipanggil sebelum provider mana pun dibangun.
    setNetworkId("preprod");
  }
}

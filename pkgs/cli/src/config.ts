import path from "node:path";
import { fileURLToPath } from "node:url";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { DEFAULT_PROOF_SERVER_URL, MIDNIGHT_NETWORK_ENDPOINTS } from "shared";

// `new URL(import.meta.url).pathname` mengembalikan path ter-escape-persen pada
// direktori yang memuat spasi atau karakter non-ASCII (mis. "%20" untuk spasi).
// `fileURLToPath` mendekode itu dengan benar. Konsekuensinya bukan kosmetik:
// `walletCacheDir` di wallet.ts dibangun dari `currentDir`, dan `.gitignore`
// mencocokkan literal `pkgs/cli/wallet-cache/` — direktori bersaudara ber-nama
// `%20` tidak akan pernah cocok dengan pola itu, membuat bahan wallet bisa
// ter-commit tanpa sengaja pada mesin dengan path semacam itu.
export const currentDir = path.resolve(fileURLToPath(import.meta.url), "..");

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

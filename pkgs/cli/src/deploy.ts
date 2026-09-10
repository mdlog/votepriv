import {
  deployContract,
  findDeployedContract,
  type DeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import { Registry, RegistryPrivateStateId, emptyRegistryPrivateState } from "contract";
import type { Logger } from "pino";
import { pastikanAlamatKontrak } from "./artefak.ts";
import { kompilasiRegistry, type RegistryC } from "./kontrak.ts";
import type { ProvidersRegistry } from "./providers.ts";
import { BATAS_MS, denganBatasWaktu } from "./tunggu.ts";

export type LedgerRegistry = ReturnType<typeof Registry.ledger>;

export interface HasilDeployRegistry {
  readonly alamat: string;
  /** Handle lengkap dari deploy — sudah memuat callTx. Jangan dibuang. */
  readonly kontrak: DeployedContract<RegistryC>;
}

/**
 * Deploy kontrak registry.
 *
 * Memakai overload BER-private-state, bukan yang tanpa. Overload pertama
 * dibatasi `Contract<undefined>`; RegistryPrivateState adalah
 * `Record<string, never>`, dan itu BUKAN `undefined` — jadi registry pun wajib
 * lewat jalur privateStateId + initialPrivateState.
 *
 * TIDAK ADA field `args` di sini: `initialState` registry tidak menerima
 * parameter selain context, sehingga `Contract.InitializeParameters` melebur
 * jadi `[]` dan tipe opsinya tidak punya kunci `args` sama sekali —
 * menambahkan `args: []` adalah galat properti berlebih, bukan no-op.
 *
 * `signingKey` dibiarkan kosong: deployContract mengambil sampel sendiri dan
 * menyimpannya di privateStateProvider di bawah alamat baru.
 */
export async function deployRegistry(providers: ProvidersRegistry, log: Logger): Promise<HasilDeployRegistry> {
  log.info(
    { batasMenit: BATAS_MS.deploy / 60_000 },
    "Men-deploy kontrak registry (menyusun transaksi, membuat proof, menunggu finalisasi — hitung menit)",
  );

  const kontrak = await denganBatasWaktu(
    deployContract(providers, {
      compiledContract: kompilasiRegistry(),
      privateStateId: RegistryPrivateStateId,
      initialPrivateState: emptyRegistryPrivateState(),
    }),
    BATAS_MS.deploy,
    `deployContract(registry) tidak selesai dalam ${BATAS_MS.deploy / 60_000} menit. watchForDeployTxData menunggu selamanya secara desain, jadi ini biasanya berarti transaksinya ditolak konsensus atau proof server/indexer tidak menjawab. JANGAN mengirim ulang sebelum memeriksa keadaan chain: transaksinya mungkin sudah mendarat.`,
  );

  const alamat = pastikanAlamatKontrak(kontrak.deployTxData.public.contractAddress);
  log.info(
    {
      alamat,
      txId: kontrak.deployTxData.public.txId,
      status: kontrak.deployTxData.public.status,
      blockHeight: kontrak.deployTxData.public.blockHeight,
    },
    "Registry ter-deploy",
  );
  return { alamat, kontrak };
}

/**
 * Menemukan registry yang sudah ter-deploy.
 *
 * HANYA untuk registry yang di-deploy pada SESI LAIN. Bila registry baru saja
 * di-deploy pada proses ini, pakai `kontrak` dari `deployRegistry` — fungsi ini
 * mengulang lima perjalanan pulang-pergi ke indexer tanpa perlu.
 *
 * `initialPrivateState` SELALU disertakan (varian "store"), bukan hanya
 * `privateStateId`. Alasannya: varian yang hanya membawa privateStateId
 * MELEMPAR bila belum ada apa pun tersimpan di pasangan (alamat, id) itu — dan
 * itu keadaan normal untuk direktori private state yang baru atau mesin lain.
 * Private state registry kosong, jadi menuliskannya ulang tidak menghilangkan
 * apa pun.
 */
export async function temukanRegistry(
  providers: ProvidersRegistry,
  alamat: string,
): Promise<FoundContract<RegistryC>> {
  return denganBatasWaktu(
    findDeployedContract(providers, {
      compiledContract: kompilasiRegistry(),
      contractAddress: pastikanAlamatKontrak(alamat),
      privateStateId: RegistryPrivateStateId,
      initialPrivateState: emptyRegistryPrivateState(),
    }),
    BATAS_MS.temukan,
    `findDeployedContract(registry ${alamat}) tidak selesai dalam ${BATAS_MS.temukan / 60_000} menit. Periksa indexer dan pastikan alamat itu memang milik jaringan ini — findDeployedContract menunggu watchForDeployTxData yang tidak pernah timeout sendiri.`,
  );
}

/**
 * Membaca ledger registry dari indexer.
 *
 * `queryContractState` mengembalikan `ContractState | null`; `.data` bertipe
 * `ChargedState`, dan `ledger()` hasil compactc menerima `StateValue` MAUPUN
 * `ChargedState` — baris pertama fungsi `ledger` yang dihasilkan compactc
 * (`pkgs/contract/src/managed/registry/contract/index.js:222-224`) melakukan
 * percabangan `instanceof StateValue` justru untuk itu. Tidak ada cast yang
 * dibutuhkan di sini, dan tidak boleh ada yang ditambahkan: cast akan
 * menyembunyikan kesalahan nyata (mis. state milik kontrak lain) alih-alih
 * memunculkannya.
 */
export async function bacaLedgerRegistry(
  publicDataProvider: PublicDataProvider,
  alamat: string,
): Promise<LedgerRegistry> {
  const st = await denganBatasWaktu(
    publicDataProvider.queryContractState(pastikanAlamatKontrak(alamat)),
    BATAS_MS.bacaIndexer,
    `queryContractState(${alamat}) tidak menjawab dalam ${BATAS_MS.bacaIndexer / 1000} detik.`,
  );
  if (st === null) throw new Error(`Registry ${alamat} belum terlihat di indexer`);
  return Registry.ledger(st.data);
}

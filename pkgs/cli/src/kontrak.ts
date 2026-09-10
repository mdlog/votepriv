import path from "node:path";
import { fileURLToPath } from "node:url";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import type { Contract as CjsContract } from "@midnight-ntwrk/compact-js/effect/Contract";
import {
  Ballot,
  Registry,
  ballotWitnesses,
  type BallotPrivateState,
  type RegistryPrivateState,
} from "contract";

const dirIni = path.resolve(fileURLToPath(import.meta.url), "..");

export type BallotC = Ballot.Contract<BallotPrivateState>;
export type RegistryC = Registry.Contract<RegistryPrivateState>;

export type SirkuitBallot = CjsContract.ProvableCircuitId<BallotC>;
export type SirkuitRegistry = CjsContract.ProvableCircuitId<RegistryC>;

/**
 * Nama-nama ini BUKAN sekadar label: NodeZkConfigProvider membaca
 * `<dir>/keys/<circuitId>.prover` dan `<dir>/zkir/<circuitId>.bzkir`, jadi id
 * circuit dan nama berkas di disk harus cocok satu-satu. Dipakai untuk
 * memaksa kegagalan NYARING di awal (lihat pastikanArtefakZk di providers.ts).
 */
export const SIRKUIT_BALLOT: readonly SirkuitBallot[] = [
  "registerVoters",
  "castVote",
  "tallyVote",
  "finalize",
];
export const SIRKUIT_REGISTRY: readonly SirkuitRegistry[] = ["register"];

/**
 * Direktori yang MEMUAT `keys/` dan `zkir/` — bukan `keys/` itu sendiri.
 * Menunjuk `src/managed`, bukan `dist/managed`: `dist/` ada di .gitignore,
 * sehingga hanya salinan src yang dijamin ada di setiap checkout. Jalur
 * absolut, diturunkan dari URL modul: jalur relatif diselesaikan terhadap
 * process.cwd() oleh fs.readFile, dan cwd tidak dijamin apa pun.
 */
export const zkDir = (nama: "ballot" | "registry"): string =>
  path.resolve(dirIni, "..", "..", "contract", "src", "managed", nama);

/**
 * WAJIB memakai `.pipe(...)`, bukan pemanggilan data-first bersarang.
 * `withCompiledFileAssets(withWitnesses(make(...), w), p)` memang lolos tipe di
 * panggilan dalam, tapi hasil luarnya melebur jadi
 * `CompiledContract<Contract<unknown, ...>, unknown, unknown>` dan baru gagal
 * di `deployContract` dengan pesan yang menyesatkan ("Property 'impureCircuits'
 * is missing").
 *
 * `withCompiledFileAssets` wajib walau tidak ada satu pun dist midnight-js yang
 * memanggil `getCompiledAssetsPath` (sudah di-grep, nol hasil): tanpanya
 * parameter tipe `R` tidak pernah kosong dan `deployContract` menolaknya. Diisi
 * direktori managed yang sebenarnya supaya tidak menyesatkan pembaca berikutnya.
 */
export const kompilasiBallot = () =>
  CompiledContract.make<BallotC>("ballot", Ballot.Contract).pipe(
    CompiledContract.withWitnesses(ballotWitnesses),
    CompiledContract.withCompiledFileAssets(zkDir("ballot")),
  );

/**
 * `withVacantWitnesses`, BUKAN `withWitnesses(registryWitnesses)`.
 * registry.compact tidak mendeklarasikan witness apa pun, sehingga
 * `Contract.Witnesses<RegistryC>` melebur jadi `never` dan meneruskan objek
 * `registryWitnesses` yang diekspor paket contract adalah galat kompilasi
 * (`Argument of type '{}' is not assignable to parameter of type 'never'`),
 * bukan no-op yang senyap. Arity-nya 1 dan bukan dual — masuk ke .pipe()
 * tanpa tanda kurung pemanggilan.
 */
export const kompilasiRegistry = () =>
  CompiledContract.make<RegistryC>("registry", Registry.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(zkDir("registry")),
  );

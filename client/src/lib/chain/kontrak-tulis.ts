/**
 * Bentuk compiledContract untuk ballot, versi BROWSER — padanan
 * pkgs/cli/src/kontrak.ts TANPA fs/path.
 *
 * withCompiledFileAssets(path) mewajibkan STRING untuk memenuhi tipe
 * CompiledContract.Context — TAPI tidak satu pun dist
 * @midnight-ntwrk/midnight-js-contracts memanggil getCompiledAssetsPath
 * (grep atas SELURUH folder dist setiap paket @midnight-ntwrk di
 * node_modules/.pnpm: nol hasil di luar compact-js sendiri). Nilai di sini
 * karena itu TIDAK PERNAH dibaca runtime — placeholder yang jujur, bukan
 * path yang lupa diisi.
 *
 * (Catatan koreksi brief: contoh Task 4 asli menulis glob path yang memuat
 * substring "*\/dist" di dalam komentar blok ini, yang menutup komentar
 * lebih awal dan membuat esbuild gagal parse dengan galat sintaks. Diperbaiki
 * dengan menghindari urutan karakter itu, bukan mengubah maknanya.)
 */
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import type { Contract as CjsContract } from "@midnight-ntwrk/compact-js/effect/Contract";
import { ballotWitnesses, type BallotPrivateState } from "@pkgs/contract/src/ballot-witnesses.js";
import * as Ballot from "@pkgs/contract/src/managed/ballot/contract/index.js";

export type BallotC = Ballot.Contract<BallotPrivateState>;
export type SirkuitBallot = CjsContract.ProvableCircuitId<BallotC>;

const PLACEHOLDER_TIDAK_DIBACA_RUNTIME = "browser://tidak-dipakai-lihat-komentar-kontrak-tulis.ts";

export const kompilasiBallotBrowser = () =>
  CompiledContract.make<BallotC>("ballot", Ballot.Contract).pipe(
    CompiledContract.withWitnesses(ballotWitnesses),
    CompiledContract.withCompiledFileAssets(PLACEHOLDER_TIDAK_DIBACA_RUNTIME),
  );

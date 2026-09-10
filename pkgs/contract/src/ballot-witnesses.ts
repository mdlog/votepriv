import type { MerkleTreePath } from "@midnight-ntwrk/compact-runtime";

export const BallotPrivateStateId = "votePrivBallot" as const;

export type BallotPrivateState = {
  /** Kunci rahasia admin; menentukan adminKey saat deploy. */
  readonly secretKey: Uint8Array;
  /** Credential voter untuk ballot ini. */
  readonly credential: Uint8Array | null;
  /** Pilihan yang sedang dikerjakan, dipakai castVote lalu tallyVote. */
  readonly option: bigint | null;
  /** Salt pengikat commitment. */
  readonly salt: Uint8Array | null;
  /** Merkle path menuju daun eligibility, disusun klien dari state on-chain. */
  readonly eligibilityPath: MerkleTreePath<Uint8Array> | null;
  /** Merkle path menuju commitment, disusun klien saat fase tally. */
  // biome-ignore lint/suspicious/noExplicitAny: bentuk MerkleTreePath berasal dari runtime;
  // dikencangkan di Task 6 saat commitmentPath benar-benar dipakai.
  readonly commitmentPath: any | null;
};

export const emptyBallotPrivateState = (
  secretKey: Uint8Array,
): BallotPrivateState => ({
  secretKey,
  credential: null,
  option: null,
  salt: null,
  eligibilityPath: null,
  commitmentPath: null,
});

type Ctx = { readonly privateState: BallotPrivateState };

const need = <T>(v: T | null, nama: string): T => {
  if (v === null) throw new Error(`${nama} belum diisi di private state`);
  return v;
};

/**
 * Penyimpan lokal yang bodoh. Tidak memvalidasi aturan apa pun —
 * seluruh aturan ditegakkan assert di dalam circuit.
 */
export const ballotWitnesses = {
  admin_secret_key: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.secretKey,
  ],
  voter_credential: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    need(ctx.privateState.credential, "credential"),
  ],
  get_my_option: (ctx: Ctx): [BallotPrivateState, bigint] => [
    ctx.privateState,
    need(ctx.privateState.option, "option"),
  ],
  get_my_salt: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    need(ctx.privateState.salt, "salt"),
  ],
  eligibility_path: (ctx: Ctx): [BallotPrivateState, MerkleTreePath<Uint8Array>] => [
    ctx.privateState,
    need(ctx.privateState.eligibilityPath, "eligibilityPath"),
  ],
  // biome-ignore lint/suspicious/noExplicitAny: lihat di atas
  commitment_path: (ctx: Ctx): [BallotPrivateState, any] => [
    ctx.privateState,
    need(ctx.privateState.commitmentPath, "commitmentPath"),
  ],
  store_opening: (
    ctx: Ctx,
    option: bigint,
    salt: Uint8Array,
  ): [BallotPrivateState, []] => [{ ...ctx.privateState, option, salt }, []],
};

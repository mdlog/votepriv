import type { MerkleTreePath, WitnessContext } from "@midnight-ntwrk/compact-runtime";

/**
 * ONE id for EVERY ballot — and that is deliberate.
 *
 * CORRECTION (full branch review): this comment previously claimed that
 * midnight-js "locks the private state provider to this id, so every ballot
 * shares one storage blob". That was WRONG, verified directly against the
 * installed @midnight-ntwrk/midnight-js-level-private-state-provider 4.0.4
 * (src/level-private-state-provider.ts, `getScopedKey`): the real storage key
 * is `${contractAddress}:${privateStateId}` — the CONTRACT ADDRESS is part of
 * the key, not just this id — so every ballot (different address) already gets
 * a SEPARATE LevelDB entry on its own, even though its `privateStateId` is
 * exactly the same for all of them. That is the correct picture, and it matches
 * the `setContractAddress` note in vote.ts (siapkanPemilih): "the level provider
 * composes its key as `${contractAddress}:${privateStateId}`" — vote.ts was
 * right; this comment was wrong and has been corrected.
 *
 * What decides whether several ballots can safely share one id is THEREFORE
 * not the shape of the blob (the provider already separates blobs per ballot,
 * whatever their shape) — it is that the `BallotPrivateState` read by
 * `psp.get(BallotPrivateStateId)` keeps STATING which ballot it belongs to,
 * per spec §8: every field other than `secretKey` is a map keyed by ballot
 * contract address (see `BallotPrivateState` below), not a flat field. This
 * matters precisely because one store (one LevelDB directory) MAY be used by
 * the same admin for more than one ballot they created (see the
 * `rakitProvidersBallot`/`namaStore` comment in pkgs/cli/src/deploy-ballot.ts)
 * — and if one process ever holds two `BallotPrivateState`s from two different
 * ballots at once (e.g. merged in application code, not by the providers), flat
 * `option`/`salt` fields would not say which ballot owns them: overwriting a
 * flat `option` with ballot B's value destroys (LOGICALLY, at the application
 * level, not at the storage level) the opening of ballot A held at the same
 * time, and A's vote becomes permanently unopenable (spec §6.3: lost opening =
 * lost vote). Address-keyed maps close that gap at the TYPE level: ballot A's
 * and ballot B's values never occupy the same slot even inside one JS object.
 */
export const BallotPrivateStateId = "votePrivBallot" as const;

/**
 * The opening of one vote: the (option, salt) pair that binds one commitment.
 * Stored as a single record because the two really are atomic — the commitment
 * is a hash of both at once, so a salt without its option (or the reverse) can
 * never open anything.
 */
export type BallotOpening = {
  readonly option: bigint;
  readonly salt: Uint8Array;
};

/**
 * Shape of the VotePriv private state, per spec §8 ("Private state shape").
 *
 * Every field other than `secretKey` is a map KEYED BY BALLOT CONTRACT ADDRESS.
 * `secretKey` deliberately stays flat: it is the admin's identity, not a
 * per-ballot value — one person uses the same key for every ballot they create.
 *
 * The key is the `ContractAddress` EXACTLY as the runtime reports it through
 * `WitnessContext.contractAddress`. The store (the Plan C adapter) MUST use the
 * very same string form when writing, or witness reads will miss and the vote
 * will appear lost. Use the `with*` helpers below; do not build the maps by hand.
 */
export type BallotPrivateState = {
  /** Admin secret key; determines adminKey at deploy. Not a per-ballot value. */
  readonly secretKey: Uint8Array;
  /** ballot address -> the voter's credential on that ballot. */
  readonly credentials: Record<string, Uint8Array>;
  /** ballot address -> the opening used by castVote and later tallyVote. */
  readonly openings: Record<string, BallotOpening>;
  /** ballot address -> Merkle path to the eligibility leaf, built client-side from on-chain state. */
  readonly eligibilityPaths: Record<string, MerkleTreePath<Uint8Array>>;
  /** ballot address -> Merkle path to the commitment, built client-side in the tally phase. */
  readonly commitmentPaths: Record<string, MerkleTreePath<Uint8Array>>;
};

export const emptyBallotPrivateState = (secretKey: Uint8Array): BallotPrivateState => ({
  secretKey,
  credentials: {},
  openings: {},
  eligibilityPaths: {},
  commitmentPaths: {},
});

// ── Writers: the only correct way to fill per-ballot state ──────────────────
// All pure, none validates anything. None touches another ballot's entry —
// that is the whole point of this design.

export const withCredential = (
  ps: BallotPrivateState,
  ballot: string,
  credential: Uint8Array,
): BallotPrivateState => ({
  ...ps,
  credentials: { ...ps.credentials, [ballot]: credential },
});

export const withOpening = (
  ps: BallotPrivateState,
  ballot: string,
  opening: BallotOpening,
): BallotPrivateState => ({
  ...ps,
  openings: { ...ps.openings, [ballot]: opening },
});

export const withEligibilityPath = (
  ps: BallotPrivateState,
  ballot: string,
  path: MerkleTreePath<Uint8Array>,
): BallotPrivateState => ({
  ...ps,
  eligibilityPaths: { ...ps.eligibilityPaths, [ballot]: path },
});

export const withCommitmentPath = (
  ps: BallotPrivateState,
  ballot: string,
  path: MerkleTreePath<Uint8Array>,
): BallotPrivateState => ({
  ...ps,
  commitmentPaths: { ...ps.commitmentPaths, [ballot]: path },
});

// ── Readers: used by the UI to know whether a vote can still be opened ──────

export const credentialFor = (ps: BallotPrivateState, ballot: string): Uint8Array | null =>
  ps.credentials[ballot] ?? null;

export const openingFor = (ps: BallotPrivateState, ballot: string): BallotOpening | null =>
  ps.openings[ballot] ?? null;

/**
 * The real witness context from the runtime. What matters here is
 * `contractAddress`. Witnesses do not receive the ballot identity as an
 * argument — none of the seven witnesses in ballot.compact has a parameter for
 * it, and adding one would change the circuit interface. The runtime supplies
 * it: compactc-generated code calls
 * `createWitnessContext(ledger, privateState, context.currentQueryContext.address)`
 * before EVERY witness call, so the address of the running contract is always
 * available — with no key the caller has to set first and no per-instance
 * private state id.
 *
 * Ledger is deliberately `unknown`: this layer must not read public state to
 * decide anything.
 */
type Ctx = WitnessContext<unknown, BallotPrivateState>;

const need = <T>(v: T | null, name: string, ballot: string): T => {
  if (v === null) {
    throw new Error(`${name} for ballot ${ballot} is not set in private state`);
  }
  return v;
};

const lookup = <T>(map: Record<string, T>, ballot: string): T | null => map[ballot] ?? null;

/**
 * A dumb local store. Validates no rule at all — every rule is enforced by the
 * asserts inside the circuits.
 *
 * The only "cleverness" here is picking the entry that belongs to the ballot
 * being called, and that is not a rule: it is correctly keyed storage.
 */
export const ballotWitnesses = {
  admin_secret_key: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.secretKey,
  ],
  voter_credential: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    need(lookup(ctx.privateState.credentials, ctx.contractAddress), "credential", ctx.contractAddress),
  ],
  get_my_option: (ctx: Ctx): [BallotPrivateState, bigint] => [
    ctx.privateState,
    need(lookup(ctx.privateState.openings, ctx.contractAddress), "opening", ctx.contractAddress).option,
  ],
  get_my_salt: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    need(lookup(ctx.privateState.openings, ctx.contractAddress), "opening", ctx.contractAddress).salt,
  ],
  eligibility_path: (ctx: Ctx): [BallotPrivateState, MerkleTreePath<Uint8Array>] => [
    ctx.privateState,
    need(
      lookup(ctx.privateState.eligibilityPaths, ctx.contractAddress),
      "eligibilityPath",
      ctx.contractAddress,
    ),
  ],
  commitment_path: (ctx: Ctx): [BallotPrivateState, MerkleTreePath<Uint8Array>] => [
    ctx.privateState,
    need(
      lookup(ctx.privateState.commitmentPaths, ctx.contractAddress),
      "commitmentPath",
      ctx.contractAddress,
    ),
  ],
  store_opening: (ctx: Ctx, option: bigint, salt: Uint8Array): [BallotPrivateState, []] => [
    withOpening(ctx.privateState, ctx.contractAddress, { option, salt }),
    [],
  ],
};

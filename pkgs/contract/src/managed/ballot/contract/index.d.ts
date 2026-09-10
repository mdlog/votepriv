import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum BallotPhase { voting = 0, tallying = 1, finalized = 2 }

export type Witnesses<PS> = {
  admin_secret_key(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  voter_credential(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  eligibility_path(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                                 path: { sibling: { field: bigint
                                                                                                  },
                                                                                         goes_left: boolean
                                                                                       }[]
                                                                               }];
  get_my_option(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  get_my_salt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  store_opening(context: __compactRuntime.WitnessContext<Ledger, PS>,
                o_0: bigint,
                s_0: Uint8Array): [PS, []];
  commitment_path(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                                path: { sibling: { field: bigint
                                                                                                 },
                                                                                        goes_left: boolean
                                                                                      }[]
                                                                              }];
}

export type ImpureCircuits<PS> = {
  registerVoters(context: __compactRuntime.CircuitContext<PS>,
                 leaves_0: Uint8Array[],
                 n_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  tallyVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  finalize(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  registerVoters(context: __compactRuntime.CircuitContext<PS>,
                 leaves_0: Uint8Array[],
                 n_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  tallyVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  finalize(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  admin_pk(sk_0: Uint8Array): Uint8Array;
  cred_leaf(cred_0: Uint8Array): Uint8Array;
  vote_nullifier(nonce_0: Uint8Array, cred_0: Uint8Array): Uint8Array;
  vote_commitment(option_0: bigint, salt_0: Uint8Array): Uint8Array;
  tally_nullifier(salt_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  admin_pk(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  cred_leaf(context: __compactRuntime.CircuitContext<PS>, cred_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  vote_nullifier(context: __compactRuntime.CircuitContext<PS>,
                 nonce_0: Uint8Array,
                 cred_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  vote_commitment(context: __compactRuntime.CircuitContext<PS>,
                  option_0: bigint,
                  salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  tally_nullifier(context: __compactRuntime.CircuitContext<PS>,
                  salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  registerVoters(context: __compactRuntime.CircuitContext<PS>,
                 leaves_0: Uint8Array[],
                 n_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  tallyVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  finalize(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly title: string;
  readonly description: string;
  readonly community: string;
  readonly option0: string;
  readonly option1: string;
  readonly option2: string;
  readonly option3: string;
  readonly optionCount: bigint;
  readonly voteDeadline: bigint;
  readonly tallyDeadline: bigint;
  readonly quorumPercent: bigint;
  readonly eligibleCount: bigint;
  readonly eligibilityPolicy: string;
  readonly adminKey: Uint8Array;
  readonly ballotNonce: Uint8Array;
  readonly phase: BallotPhase;
  eligibility: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  readonly voteCount: bigint;
  readonly registeredCount: bigint;
  nullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  commitments: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  tallyNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  tallies: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
  readonly talliedCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               t_0: string,
               d_0: string,
               c_0: string,
               o0_0: string,
               o1_0: string,
               o2_0: string,
               o3_0: string,
               nOptions_0: bigint,
               voteDl_0: bigint,
               tallyDl_0: bigint,
               quorum_0: bigint,
               eligible_0: bigint,
               policy_0: string,
               nonce_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;

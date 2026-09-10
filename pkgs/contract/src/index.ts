export * as Ballot from "./managed/ballot/contract/index.js";
export * as Registry from "./managed/registry/contract/index.js";

export {
  BallotPrivateStateId,
  ballotWitnesses,
  emptyBallotPrivateState,
  type BallotPrivateState,
} from "./ballot-witnesses.js";

export {
  RegistryPrivateStateId,
  registryWitnesses,
  emptyRegistryPrivateState,
  type RegistryPrivateState,
} from "./registry-witnesses.js";

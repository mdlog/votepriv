export * as Ballot from "./managed/ballot/contract/index.js";
export * as Registry from "./managed/registry/contract/index.js";

export {
  BallotPrivateStateId,
  ballotWitnesses,
  emptyBallotPrivateState,
  withCredential,
  withOpening,
  withEligibilityPath,
  withCommitmentPath,
  credentialFor,
  openingFor,
  type BallotPrivateState,
  type BallotOpening,
} from "./ballot-witnesses.js";

export {
  RegistryPrivateStateId,
  registryWitnesses,
  emptyRegistryPrivateState,
  type RegistryPrivateState,
} from "./registry-witnesses.js";

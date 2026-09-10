import {
  type ChargedState,
  type CircuitContext,
  type EncodedZswapLocalState,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  type Witnesses,
  ledger,
} from "../managed/registry/contract/index.js";
import {
  type RegistryPrivateState,
  emptyRegistryPrivateState,
  registryWitnesses,
} from "../registry-witnesses.js";

/**
 * Simulator registry. Menjalankan impureCircuits langsung, tanpa proof server.
 */
export class RegistrySimulator {
  private readonly contract: Contract<RegistryPrivateState>;
  private readonly contractAddress = sampleContractAddress();
  private privateState: RegistryPrivateState = emptyRegistryPrivateState();
  private zswapState: EncodedZswapLocalState;
  private state: ChargedState;

  constructor() {
    this.contract = new Contract<RegistryPrivateState>(
      registryWitnesses as unknown as Witnesses<RegistryPrivateState>,
    );
    const init = this.contract.initialState(
      createConstructorContext(this.privateState, "0".repeat(64)),
    );
    this.zswapState = init.currentZswapLocalState;
    this.state = init.currentContractState.data;
  }

  private ctx(): CircuitContext<RegistryPrivateState> {
    return createCircuitContext(
      this.contractAddress,
      this.zswapState,
      this.state,
      this.privateState,
    );
  }

  getLedger(): Ledger {
    return ledger(this.state);
  }

  register(addr: string): Ledger {
    const result = this.contract.impureCircuits.register(this.ctx(), addr);
    this.privateState = result.context.currentPrivateState;
    this.zswapState = result.context.currentZswapLocalState;
    this.state = result.context.currentQueryContext.state;
    return ledger(this.state);
  }
}

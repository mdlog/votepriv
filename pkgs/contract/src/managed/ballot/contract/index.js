import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.16.0');

export var BallotPhase;
(function (BallotPhase) {
  BallotPhase[BallotPhase['voting'] = 0] = 'voting';
  BallotPhase[BallotPhase['tallying'] = 1] = 'tallying';
  BallotPhase[BallotPhase['finalized'] = 2] = 'finalized';
})(BallotPhase || (BallotPhase = {}));

const _descriptor_0 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

const _descriptor_1 = __compactRuntime.CompactTypeBoolean;

const _descriptor_2 = new __compactRuntime.CompactTypeEnum(2, 1);

const _descriptor_3 = new __compactRuntime.CompactTypeBytes(32);

const _descriptor_4 = __compactRuntime.CompactTypeField;

class _MerkleTreeDigest_0 {
  alignment() {
    return _descriptor_4.alignment();
  }
  fromValue(value_0) {
    return {
      field: _descriptor_4.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_4.toValue(value_0.field);
  }
}

const _descriptor_5 = new _MerkleTreeDigest_0();

const _descriptor_6 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

const _descriptor_7 = new __compactRuntime.CompactTypeUnsignedInteger(65535n, 2);

const _descriptor_8 = new __compactRuntime.CompactTypeVector(8, _descriptor_3);

class _MerkleTreePathEntry_0 {
  alignment() {
    return _descriptor_5.alignment().concat(_descriptor_1.alignment());
  }
  fromValue(value_0) {
    return {
      sibling: _descriptor_5.fromValue(value_0),
      goes_left: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_5.toValue(value_0.sibling).concat(_descriptor_1.toValue(value_0.goes_left));
  }
}

const _descriptor_9 = new _MerkleTreePathEntry_0();

const _descriptor_10 = new __compactRuntime.CompactTypeVector(10, _descriptor_9);

class _MerkleTreePath_0 {
  alignment() {
    return _descriptor_3.alignment().concat(_descriptor_10.alignment());
  }
  fromValue(value_0) {
    return {
      leaf: _descriptor_3.fromValue(value_0),
      path: _descriptor_10.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_3.toValue(value_0.leaf).concat(_descriptor_10.toValue(value_0.path));
  }
}

const _descriptor_11 = new _MerkleTreePath_0();

const _descriptor_12 = new __compactRuntime.CompactTypeBytes(6);

class _LeafPreimage_0 {
  alignment() {
    return _descriptor_12.alignment().concat(_descriptor_3.alignment());
  }
  fromValue(value_0) {
    return {
      domain_sep: _descriptor_12.fromValue(value_0),
      data: _descriptor_3.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_12.toValue(value_0.domain_sep).concat(_descriptor_3.toValue(value_0.data));
  }
}

const _descriptor_13 = new _LeafPreimage_0();

const _descriptor_14 = new __compactRuntime.CompactTypeVector(3, _descriptor_3);

const _descriptor_15 = new __compactRuntime.CompactTypeVector(2, _descriptor_3);

const _descriptor_16 = new __compactRuntime.CompactTypeVector(2, _descriptor_4);

class _Either_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_3.alignment().concat(_descriptor_3.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_1.fromValue(value_0),
      left: _descriptor_3.fromValue(value_0),
      right: _descriptor_3.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.is_left).concat(_descriptor_3.toValue(value_0.left).concat(_descriptor_3.toValue(value_0.right)));
  }
}

const _descriptor_17 = new _Either_0();

const _descriptor_18 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

class _ContractAddress_0 {
  alignment() {
    return _descriptor_3.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_3.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_3.toValue(value_0.bytes);
  }
}

const _descriptor_19 = new _ContractAddress_0();

const _descriptor_20 = __compactRuntime.CompactTypeOpaqueString;

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    if (typeof(witnesses_0.admin_secret_key) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named admin_secret_key');
    }
    if (typeof(witnesses_0.voter_credential) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named voter_credential');
    }
    if (typeof(witnesses_0.eligibility_path) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named eligibility_path');
    }
    if (typeof(witnesses_0.get_my_option) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named get_my_option');
    }
    if (typeof(witnesses_0.get_my_salt) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named get_my_salt');
    }
    if (typeof(witnesses_0.store_opening) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named store_opening');
    }
    if (typeof(witnesses_0.commitment_path) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named commitment_path');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      admin_pk(context, ...args_1) {
        return { result: pureCircuits.admin_pk(...args_1), context };
      },
      cred_leaf(context, ...args_1) {
        return { result: pureCircuits.cred_leaf(...args_1), context };
      },
      vote_nullifier(context, ...args_1) {
        return { result: pureCircuits.vote_nullifier(...args_1), context };
      },
      vote_commitment(context, ...args_1) {
        return { result: pureCircuits.vote_commitment(...args_1), context };
      },
      tally_nullifier(context, ...args_1) {
        return { result: pureCircuits.tally_nullifier(...args_1), context };
      },
      registerVoters: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`registerVoters: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const leaves_0 = args_1[1];
        const n_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('registerVoters',
                                     'argument 1 (as invoked from Typescript)',
                                     'ballot.compact line 151 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(leaves_0) && leaves_0.length === 8 && leaves_0.every((t) => t.buffer instanceof ArrayBuffer && t.BYTES_PER_ELEMENT === 1 && t.length === 32))) {
          __compactRuntime.typeError('registerVoters',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'ballot.compact line 151 char 1',
                                     'Vector<8, Bytes<32>>',
                                     leaves_0)
        }
        if (!(typeof(n_0) === 'bigint' && n_0 >= 0n && n_0 <= 255n)) {
          __compactRuntime.typeError('registerVoters',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'ballot.compact line 151 char 1',
                                     'Uint<0..256>',
                                     n_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_8.toValue(leaves_0).concat(_descriptor_6.toValue(n_0)),
            alignment: _descriptor_8.alignment().concat(_descriptor_6.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._registerVoters_0(context,
                                                partialProofData,
                                                leaves_0,
                                                n_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      castVote: (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`castVote: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('castVote',
                                     'argument 1 (as invoked from Typescript)',
                                     'ballot.compact line 184 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._castVote_0(context, partialProofData);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      tallyVote: (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`tallyVote: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('tallyVote',
                                     'argument 1 (as invoked from Typescript)',
                                     'ballot.compact line 239 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._tallyVote_0(context, partialProofData);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      finalize: (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`finalize: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('finalize',
                                     'argument 1 (as invoked from Typescript)',
                                     'ballot.compact line 291 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._finalize_0(context, partialProofData);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      }
    };
    this.impureCircuits = {
      registerVoters: this.circuits.registerVoters,
      castVote: this.circuits.castVote,
      tallyVote: this.circuits.tallyVote,
      finalize: this.circuits.finalize
    };
    this.provableCircuits = {
      registerVoters: this.circuits.registerVoters,
      castVote: this.circuits.castVote,
      tallyVote: this.circuits.tallyVote,
      finalize: this.circuits.finalize
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 15) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 15 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    const t_0 = args_0[1];
    const d_0 = args_0[2];
    const c_0 = args_0[3];
    const o0_0 = args_0[4];
    const o1_0 = args_0[5];
    const o2_0 = args_0[6];
    const o3_0 = args_0[7];
    const nOptions_0 = args_0[8];
    const voteDl_0 = args_0[9];
    const tallyDl_0 = args_0[10];
    const quorum_0 = args_0[11];
    const eligible_0 = args_0[12];
    const policy_0 = args_0[13];
    const nonce_0 = args_0[14];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialPrivateState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialPrivateState' in argument 1 (as invoked from Typescript)`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!(typeof(nOptions_0) === 'bigint' && nOptions_0 >= 0n && nOptions_0 <= 255n)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 8 (argument 9 as invoked from Typescript)',
                                 'ballot.compact line 115 char 1',
                                 'Uint<0..256>',
                                 nOptions_0)
    }
    if (!(typeof(voteDl_0) === 'bigint' && voteDl_0 >= 0n && voteDl_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 9 (argument 10 as invoked from Typescript)',
                                 'ballot.compact line 115 char 1',
                                 'Uint<0..18446744073709551616>',
                                 voteDl_0)
    }
    if (!(typeof(tallyDl_0) === 'bigint' && tallyDl_0 >= 0n && tallyDl_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 10 (argument 11 as invoked from Typescript)',
                                 'ballot.compact line 115 char 1',
                                 'Uint<0..18446744073709551616>',
                                 tallyDl_0)
    }
    if (!(typeof(quorum_0) === 'bigint' && quorum_0 >= 0n && quorum_0 <= 255n)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 11 (argument 12 as invoked from Typescript)',
                                 'ballot.compact line 115 char 1',
                                 'Uint<0..256>',
                                 quorum_0)
    }
    if (!(typeof(eligible_0) === 'bigint' && eligible_0 >= 0n && eligible_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 12 (argument 13 as invoked from Typescript)',
                                 'ballot.compact line 115 char 1',
                                 'Uint<0..18446744073709551616>',
                                 eligible_0)
    }
    if (!(nonce_0.buffer instanceof ArrayBuffer && nonce_0.BYTES_PER_ELEMENT === 1 && nonce_0.length === 32)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 14 (argument 15 as invoked from Typescript)',
                                 'ballot.compact line 115 char 1',
                                 'Bytes<32>',
                                 nonce_0)
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    let stateValue_2 = __compactRuntime.StateValue.newArray();
    stateValue_2 = stateValue_2.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_2 = stateValue_2.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_2 = stateValue_2.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_2 = stateValue_2.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_2 = stateValue_2.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_2 = stateValue_2.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_2 = stateValue_2.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_2 = stateValue_2.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_2 = stateValue_2.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(stateValue_2);
    let stateValue_1 = __compactRuntime.StateValue.newArray();
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_1 = stateValue_1.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(stateValue_1);
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('registerVoters', new __compactRuntime.ContractOperation());
    state_0.setOperation('castVote', new __compactRuntime.ContractOperation());
    state_0.setOperation('tallyVote', new __compactRuntime.ContractOperation());
    state_0.setOperation('finalize', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext(__compactRuntime.dummyContractAddress(), constructorContext_0.initialZswapLocalState.coinPublicKey, state_0.data, constructorContext_0.initialPrivateState);
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(0n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(''),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(1n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(''),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(2n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(''),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(3n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(''),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(4n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(''),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(5n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(''),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(6n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(''),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(7n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(0n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(8n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(0n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(1n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(0n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(2n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(3n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(''),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(4n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_3.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(5n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_3.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(6n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(7n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newBoundedMerkleTree(
                                                                       new __compactRuntime.StateBoundedMerkleTree(10)
                                                                     )).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                                                        alignment: _descriptor_0.alignment() })).arrayPush(__compactRuntime.StateValue.newMap(
                                                                                                                                                                             new __compactRuntime.StateMap()
                                                                                                                                                                           ))
                                                          .encode() } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(2n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       'root',
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: true, n: 2 } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(8n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(9n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(10n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(11n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newBoundedMerkleTree(
                                                                       new __compactRuntime.StateBoundedMerkleTree(10)
                                                                     )).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                                                        alignment: _descriptor_0.alignment() }))
                                                          .encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(12n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(13n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(14n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(0n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(t_0),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(1n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(d_0),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(2n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(c_0),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(3n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(o0_0),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(4n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(o1_0),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(5n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(o2_0),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(6n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(o3_0),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(7n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(nOptions_0),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(8n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(voteDl_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(0n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tallyDl_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(1n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(quorum_0),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(2n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(eligible_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(3n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(policy_0),
                                                                                              alignment: _descriptor_20.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(5n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(nonce_0),
                                                                                              alignment: _descriptor_3.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_0 = this._admin_pk_0(this._admin_secret_key_0(context,
                                                            partialProofData));
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(4n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(tmp_0),
                                                                                              alignment: _descriptor_3.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(6n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState
    }
  }
  _merkleTreePathRoot_0(path_0) {
    return { field:
               this._folder_0((...args_0) =>
                                this._merkleTreePathEntryRoot_0(...args_0),
                              this._degradeToTransient_0(this._persistentHash_2({ domain_sep:
                                                                                    new Uint8Array([109, 100, 110, 58, 108, 104]),
                                                                                  data:
                                                                                    path_0.leaf })),
                              path_0.path) };
  }
  _merkleTreePathEntryRoot_0(recursiveDigest_0, entry_0) {
    const left_0 = entry_0.goes_left ? recursiveDigest_0 : entry_0.sibling.field;
    const right_0 = entry_0.goes_left ?
                    entry_0.sibling.field :
                    recursiveDigest_0;
    return this._transientHash_0([left_0, right_0]);
  }
  _transientHash_0(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_16, value_0);
    return result_0;
  }
  _persistentHash_0(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_14, value_0);
    return result_0;
  }
  _persistentHash_1(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_15, value_0);
    return result_0;
  }
  _persistentHash_2(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_13, value_0);
    return result_0;
  }
  _degradeToTransient_0(x_0) {
    const result_0 = __compactRuntime.degradeToTransient(x_0);
    return result_0;
  }
  _admin_secret_key_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.admin_secret_key(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('admin_secret_key',
                                 'return value',
                                 'ballot.compact line 78 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_3.toValue(result_0),
      alignment: _descriptor_3.alignment()
    });
    return result_0;
  }
  _voter_credential_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.voter_credential(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('voter_credential',
                                 'return value',
                                 'ballot.compact line 79 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_3.toValue(result_0),
      alignment: _descriptor_3.alignment()
    });
    return result_0;
  }
  _eligibility_path_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.eligibility_path(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'object' && result_0.leaf.buffer instanceof ArrayBuffer && result_0.leaf.BYTES_PER_ELEMENT === 1 && result_0.leaf.length === 32 && Array.isArray(result_0.path) && result_0.path.length === 10 && result_0.path.every((t) => typeof(t) === 'object' && typeof(t.sibling) === 'object' && typeof(t.sibling.field) === 'bigint' && t.sibling.field >= 0 && t.sibling.field <= __compactRuntime.MAX_FIELD && typeof(t.goes_left) === 'boolean'))) {
      __compactRuntime.typeError('eligibility_path',
                                 'return value',
                                 'ballot.compact line 80 char 1',
                                 'struct MerkleTreePath<leaf: Bytes<32>, path: Vector<10, struct MerkleTreePathEntry<sibling: struct MerkleTreeDigest<field: Field>, goes_left: Boolean>>>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_11.toValue(result_0),
      alignment: _descriptor_11.alignment()
    });
    return result_0;
  }
  _get_my_option_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.get_my_option(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'bigint' && result_0 >= 0n && result_0 <= 255n)) {
      __compactRuntime.typeError('get_my_option',
                                 'return value',
                                 'ballot.compact line 81 char 1',
                                 'Uint<0..256>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_6.toValue(result_0),
      alignment: _descriptor_6.alignment()
    });
    return result_0;
  }
  _get_my_salt_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.get_my_salt(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('get_my_salt',
                                 'return value',
                                 'ballot.compact line 82 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_3.toValue(result_0),
      alignment: _descriptor_3.alignment()
    });
    return result_0;
  }
  _store_opening_0(context, partialProofData, o_0, s_0) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.store_opening(witnessContext_0,
                                                                        o_0,
                                                                        s_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(Array.isArray(result_0) && result_0.length === 0 )) {
      __compactRuntime.typeError('store_opening',
                                 'return value',
                                 'ballot.compact line 83 char 1',
                                 '[]',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: [],
      alignment: []
    });
    return result_0;
  }
  _commitment_path_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.commitment_path(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'object' && result_0.leaf.buffer instanceof ArrayBuffer && result_0.leaf.BYTES_PER_ELEMENT === 1 && result_0.leaf.length === 32 && Array.isArray(result_0.path) && result_0.path.length === 10 && result_0.path.every((t) => typeof(t) === 'object' && typeof(t.sibling) === 'object' && typeof(t.sibling.field) === 'bigint' && t.sibling.field >= 0 && t.sibling.field <= __compactRuntime.MAX_FIELD && typeof(t.goes_left) === 'boolean'))) {
      __compactRuntime.typeError('commitment_path',
                                 'return value',
                                 'ballot.compact line 84 char 1',
                                 'struct MerkleTreePath<leaf: Bytes<32>, path: Vector<10, struct MerkleTreePathEntry<sibling: struct MerkleTreeDigest<field: Field>, goes_left: Boolean>>>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_11.toValue(result_0),
      alignment: _descriptor_11.alignment()
    });
    return result_0;
  }
  _admin_pk_0(sk_0) {
    return this._persistentHash_1([new Uint8Array([118, 111, 116, 101, 112, 114, 105, 118, 58, 112, 107, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   sk_0]);
  }
  _cred_leaf_0(cred_0) {
    return this._persistentHash_1([new Uint8Array([118, 111, 116, 101, 112, 114, 105, 118, 58, 99, 114, 101, 100, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   cred_0]);
  }
  _vote_nullifier_0(nonce_0, cred_0) {
    return this._persistentHash_0([new Uint8Array([118, 111, 116, 101, 112, 114, 105, 118, 58, 110, 102, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   nonce_0,
                                   cred_0]);
  }
  _vote_commitment_0(option_0, salt_0) {
    return this._persistentHash_0([new Uint8Array([118, 111, 116, 101, 112, 114, 105, 118, 58, 118, 111, 116, 101, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   __compactRuntime.convertFieldToBytes(32,
                                                                        option_0,
                                                                        'ballot.compact line 105 char 5'),
                                   salt_0]);
  }
  _tally_nullifier_0(salt_0) {
    return this._persistentHash_1([new Uint8Array([118, 111, 116, 101, 112, 114, 105, 118, 58, 116, 110, 102, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   salt_0]);
  }
  _registerVoters_0(context, partialProofData, leaves_0, n_0) {
    __compactRuntime.assert(this._equal_0(this._admin_pk_0(this._admin_secret_key_0(context,
                                                                                    partialProofData)),
                                          _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_6.toValue(1n),
                                                                                                                                alignment: _descriptor_6.alignment() } },
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_6.toValue(4n),
                                                                                                                                alignment: _descriptor_6.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value)),
                            'Hanya admin yang boleh mendaftarkan pemilih');
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(1n),
                                                                                                                  alignment: _descriptor_6.alignment() } },
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(6n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value)
                            ===
                            0,
                            'Ballot sudah tidak dalam fase pemungutan suara');
    __compactRuntime.assert(this._equal_1(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_6.toValue(1n),
                                                                                                                                alignment: _descriptor_6.alignment() } },
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_6.toValue(8n),
                                                                                                                                alignment: _descriptor_6.alignment() } }] } },
                                                                                                     { popeq: { cached: true,
                                                                                                                result: undefined } }]).value),
                                          0n),
                            'Pendaftaran ditutup setelah suara pertama masuk');
    __compactRuntime.assert(n_0 >= 1n && n_0 <= 8n,
                            'Jumlah pendaftaran harus 1 sampai 8');
    const terpakai_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                 partialProofData,
                                                                                 [
                                                                                  { dup: { n: 0 } },
                                                                                  { idx: { cached: false,
                                                                                           pushPath: false,
                                                                                           path: [
                                                                                                  { tag: 'value',
                                                                                                    value: { value: _descriptor_6.toValue(1n),
                                                                                                             alignment: _descriptor_6.alignment() } },
                                                                                                  { tag: 'value',
                                                                                                    value: { value: _descriptor_6.toValue(9n),
                                                                                                             alignment: _descriptor_6.alignment() } }] } },
                                                                                  { popeq: { cached: true,
                                                                                             result: undefined } }]).value);
    let t_0;
    __compactRuntime.assert((t_0 = terpakai_0 + n_0,
                             t_0
                             <=
                             _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(2n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { popeq: { cached: false,
                                                                                                   result: undefined } }]).value)),
                            'Melebihi eligibleCount yang ditetapkan ballot');
    if (n_0 > 0n) {
      const tmp_0 = leaves_0[0];
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(7n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                                { value: _descriptor_3.toValue(tmp_0),
                                                                                                  alignment: _descriptor_3.alignment() }
                                                                                              )).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { addi: { immediate: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(2n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         'root',
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 3 } }]);
    }
    if (n_0 > 1n) {
      const tmp_1 = leaves_0[1];
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(7n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                                { value: _descriptor_3.toValue(tmp_1),
                                                                                                  alignment: _descriptor_3.alignment() }
                                                                                              )).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { addi: { immediate: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(2n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         'root',
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 3 } }]);
    }
    if (n_0 > 2n) {
      const tmp_2 = leaves_0[2];
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(7n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                                { value: _descriptor_3.toValue(tmp_2),
                                                                                                  alignment: _descriptor_3.alignment() }
                                                                                              )).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { addi: { immediate: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(2n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         'root',
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 3 } }]);
    }
    if (n_0 > 3n) {
      const tmp_3 = leaves_0[3];
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(7n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                                { value: _descriptor_3.toValue(tmp_3),
                                                                                                  alignment: _descriptor_3.alignment() }
                                                                                              )).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { addi: { immediate: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(2n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         'root',
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 3 } }]);
    }
    if (n_0 > 4n) {
      const tmp_4 = leaves_0[4];
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(7n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                                { value: _descriptor_3.toValue(tmp_4),
                                                                                                  alignment: _descriptor_3.alignment() }
                                                                                              )).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { addi: { immediate: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(2n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         'root',
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 3 } }]);
    }
    if (n_0 > 5n) {
      const tmp_5 = leaves_0[5];
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(7n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                                { value: _descriptor_3.toValue(tmp_5),
                                                                                                  alignment: _descriptor_3.alignment() }
                                                                                              )).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { addi: { immediate: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(2n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         'root',
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 3 } }]);
    }
    if (n_0 > 6n) {
      const tmp_6 = leaves_0[6];
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(7n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                                { value: _descriptor_3.toValue(tmp_6),
                                                                                                  alignment: _descriptor_3.alignment() }
                                                                                              )).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { addi: { immediate: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(2n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         'root',
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 3 } }]);
    }
    if (n_0 > 7n) {
      const tmp_7 = leaves_0[7];
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(7n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                                { value: _descriptor_3.toValue(tmp_7),
                                                                                                  alignment: _descriptor_3.alignment() }
                                                                                              )).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { addi: { immediate: 1 } },
                                         { ins: { cached: true, n: 1 } },
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(2n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: false,
                                                  pushPath: false,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(0n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         'root',
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 3 } }]);
    }
    const tmp_8 = n_0;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } },
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(9n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_7.toValue(tmp_8),
                                                                alignment: _descriptor_7.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 2 } }]);
    return [];
  }
  _castVote_0(context, partialProofData) {
    let tmp_0;
    __compactRuntime.assert((tmp_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                               partialProofData,
                                                                                               [
                                                                                                { dup: { n: 0 } },
                                                                                                { idx: { cached: false,
                                                                                                         pushPath: false,
                                                                                                         path: [
                                                                                                                { tag: 'value',
                                                                                                                  value: { value: _descriptor_6.toValue(0n),
                                                                                                                           alignment: _descriptor_6.alignment() } },
                                                                                                                { tag: 'value',
                                                                                                                  value: { value: _descriptor_6.toValue(8n),
                                                                                                                           alignment: _descriptor_6.alignment() } }] } },
                                                                                                { popeq: { cached: false,
                                                                                                           result: undefined } }]).value),
                             _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 2 } },
                                                                                        { idx: { cached: true,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(2n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'lt',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value)),
                            'Batas waktu pemungutan suara sudah lewat');
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(1n),
                                                                                                                  alignment: _descriptor_6.alignment() } },
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(6n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value)
                            ===
                            0,
                            'Ballot tidak sedang menerima suara');
    const cred_0 = this._voter_credential_0(context, partialProofData);
    const daun_0 = this._cred_leaf_0(cred_0);
    const path_0 = this._eligibility_path_0(context, partialProofData);
    __compactRuntime.assert(this._equal_2(path_0.leaf, daun_0),
                            'Merkle path bukan untuk credential ini');
    const rt_0 = this._merkleTreePathRoot_0(path_0);
    __compactRuntime.assert(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(1n),
                                                                                                                  alignment: _descriptor_6.alignment() } },
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(7n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(2n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(rt_0),
                                                                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'Anda tidak terdaftar sebagai pemilih pada ballot ini');
    const opsi_0 = this._get_my_option_0(context, partialProofData);
    const salt_0 = this._get_my_salt_0(context, partialProofData);
    __compactRuntime.assert(opsi_0
                            <
                            _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(0n),
                                                                                                                  alignment: _descriptor_6.alignment() } },
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(7n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                            'Pilihan di luar opsi yang tersedia');
    const nf_0 = this._vote_nullifier_0(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                  partialProofData,
                                                                                                  [
                                                                                                   { dup: { n: 0 } },
                                                                                                   { idx: { cached: false,
                                                                                                            pushPath: false,
                                                                                                            path: [
                                                                                                                   { tag: 'value',
                                                                                                                     value: { value: _descriptor_6.toValue(1n),
                                                                                                                              alignment: _descriptor_6.alignment() } },
                                                                                                                   { tag: 'value',
                                                                                                                     value: { value: _descriptor_6.toValue(5n),
                                                                                                                              alignment: _descriptor_6.alignment() } }] } },
                                                                                                   { popeq: { cached: false,
                                                                                                              result: undefined } }]).value),
                                        cred_0);
    __compactRuntime.assert(!_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(10n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(nf_0),
                                                                                                                                               alignment: _descriptor_3.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'Credential ini sudah dipakai memilih');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } },
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(10n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(nf_0),
                                                                                              alignment: _descriptor_3.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 2 } }]);
    const tmp_1 = this._vote_commitment_0(opsi_0, salt_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } },
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(11n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                              { value: _descriptor_3.toValue(tmp_1),
                                                                                                alignment: _descriptor_3.alignment() }
                                                                                            )).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { addi: { immediate: 1 } },
                                       { ins: { cached: true, n: 3 } }]);
    const tmp_2 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } },
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(8n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_7.toValue(tmp_2),
                                                                alignment: _descriptor_7.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 2 } }]);
    this._store_opening_0(context, partialProofData, opsi_0, salt_0);
    return [];
  }
  _tallyVote_0(context, partialProofData) {
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(1n),
                                                                                                                  alignment: _descriptor_6.alignment() } },
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(6n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value)
                            !==
                            2,
                            'Ballot sudah difinalisasi');
    let tmp_0;
    __compactRuntime.assert((tmp_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                               partialProofData,
                                                                                               [
                                                                                                { dup: { n: 0 } },
                                                                                                { idx: { cached: false,
                                                                                                         pushPath: false,
                                                                                                         path: [
                                                                                                                { tag: 'value',
                                                                                                                  value: { value: _descriptor_6.toValue(0n),
                                                                                                                           alignment: _descriptor_6.alignment() } },
                                                                                                                { tag: 'value',
                                                                                                                  value: { value: _descriptor_6.toValue(8n),
                                                                                                                           alignment: _descriptor_6.alignment() } }] } },
                                                                                                { popeq: { cached: false,
                                                                                                           result: undefined } }]).value),
                             _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        { dup: { n: 3 } },
                                                                                        { idx: { cached: true,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(2n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        'lt',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value)),
                            'Pemungutan suara masih berlangsung');
    let tmp_1;
    __compactRuntime.assert((tmp_1 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                               partialProofData,
                                                                                               [
                                                                                                { dup: { n: 0 } },
                                                                                                { idx: { cached: false,
                                                                                                         pushPath: false,
                                                                                                         path: [
                                                                                                                { tag: 'value',
                                                                                                                  value: { value: _descriptor_6.toValue(1n),
                                                                                                                           alignment: _descriptor_6.alignment() } },
                                                                                                                { tag: 'value',
                                                                                                                  value: { value: _descriptor_6.toValue(0n),
                                                                                                                           alignment: _descriptor_6.alignment() } }] } },
                                                                                                { popeq: { cached: false,
                                                                                                           result: undefined } }]).value),
                             _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 2 } },
                                                                                        { idx: { cached: true,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(2n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_1),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'lt',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value)),
                            'Batas waktu pembukaan suara sudah lewat');
    const opsi_0 = this._get_my_option_0(context, partialProofData);
    const salt_0 = this._get_my_salt_0(context, partialProofData);
    const c_0 = this._vote_commitment_0(opsi_0, salt_0);
    const path_0 = this._commitment_path_0(context, partialProofData);
    __compactRuntime.assert(this._equal_3(path_0.leaf, c_0),
                            'Merkle path bukan untuk commitment ini');
    const rt_0 = this._merkleTreePathRoot_0(path_0);
    __compactRuntime.assert(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(1n),
                                                                                                                  alignment: _descriptor_6.alignment() } },
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(11n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(0n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       'root',
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(rt_0),
                                                                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                                                                       'eq',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'Commitment tidak ditemukan pada ballot ini');
    const tnf_0 = this._tally_nullifier_0(salt_0);
    __compactRuntime.assert(!_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(12n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(tnf_0),
                                                                                                                                               alignment: _descriptor_3.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'Suara ini sudah pernah dibuka');
    if (_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                  partialProofData,
                                                                  [
                                                                   { dup: { n: 0 } },
                                                                   { idx: { cached: false,
                                                                            pushPath: false,
                                                                            path: [
                                                                                   { tag: 'value',
                                                                                     value: { value: _descriptor_6.toValue(1n),
                                                                                              alignment: _descriptor_6.alignment() } },
                                                                                   { tag: 'value',
                                                                                     value: { value: _descriptor_6.toValue(6n),
                                                                                              alignment: _descriptor_6.alignment() } }] } },
                                                                   { popeq: { cached: false,
                                                                              result: undefined } }]).value)
        ===
        0)
    {
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(6n),
                                                                                                alignment: _descriptor_6.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(1),
                                                                                                alignment: _descriptor_2.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } }]);
    }
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } },
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(12n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(tnf_0),
                                                                                              alignment: _descriptor_3.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 2 } }]);
    const opsiPublik_0 = opsi_0;
    if (_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                  partialProofData,
                                                                  [
                                                                   { dup: { n: 0 } },
                                                                   { idx: { cached: false,
                                                                            pushPath: false,
                                                                            path: [
                                                                                   { tag: 'value',
                                                                                     value: { value: _descriptor_6.toValue(1n),
                                                                                              alignment: _descriptor_6.alignment() } },
                                                                                   { tag: 'value',
                                                                                     value: { value: _descriptor_6.toValue(13n),
                                                                                              alignment: _descriptor_6.alignment() } }] } },
                                                                   { push: { storage: false,
                                                                             value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(opsiPublik_0),
                                                                                                                          alignment: _descriptor_6.alignment() }).encode() } },
                                                                   'member',
                                                                   { popeq: { cached: true,
                                                                              result: undefined } }]).value))
    {
      const tmp_2 = ((t1) => {
                      if (t1 > 18446744073709551615n) {
                        throw new __compactRuntime.CompactError('ballot.compact line 269 char 32: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
                      }
                      return t1;
                    })(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                 partialProofData,
                                                                                 [
                                                                                  { dup: { n: 0 } },
                                                                                  { idx: { cached: false,
                                                                                           pushPath: false,
                                                                                           path: [
                                                                                                  { tag: 'value',
                                                                                                    value: { value: _descriptor_6.toValue(1n),
                                                                                                             alignment: _descriptor_6.alignment() } },
                                                                                                  { tag: 'value',
                                                                                                    value: { value: _descriptor_6.toValue(13n),
                                                                                                             alignment: _descriptor_6.alignment() } }] } },
                                                                                  { idx: { cached: false,
                                                                                           pushPath: false,
                                                                                           path: [
                                                                                                  { tag: 'value',
                                                                                                    value: { value: _descriptor_6.toValue(opsiPublik_0),
                                                                                                             alignment: _descriptor_6.alignment() } }] } },
                                                                                  { popeq: { cached: false,
                                                                                             result: undefined } }]).value)
                       +
                       1n);
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(13n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(opsiPublik_0),
                                                                                                alignment: _descriptor_6.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_2),
                                                                                                alignment: _descriptor_0.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 2 } }]);
    } else {
      const tmp_3 = 1n;
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(1n),
                                                                    alignment: _descriptor_6.alignment() } },
                                                         { tag: 'value',
                                                           value: { value: _descriptor_6.toValue(13n),
                                                                    alignment: _descriptor_6.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(opsiPublik_0),
                                                                                                alignment: _descriptor_6.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_3),
                                                                                                alignment: _descriptor_0.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 2 } }]);
    }
    const tmp_4 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } },
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(14n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_7.toValue(tmp_4),
                                                                alignment: _descriptor_7.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 2 } }]);
    return [];
  }
  _finalize_0(context, partialProofData) {
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(1n),
                                                                                                                  alignment: _descriptor_6.alignment() } },
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(6n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value)
                            !==
                            2,
                            'Ballot sudah difinalisasi');
    let tmp_0;
    __compactRuntime.assert((tmp_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                               partialProofData,
                                                                                               [
                                                                                                { dup: { n: 0 } },
                                                                                                { idx: { cached: false,
                                                                                                         pushPath: false,
                                                                                                         path: [
                                                                                                                { tag: 'value',
                                                                                                                  value: { value: _descriptor_6.toValue(1n),
                                                                                                                           alignment: _descriptor_6.alignment() } },
                                                                                                                { tag: 'value',
                                                                                                                  value: { value: _descriptor_6.toValue(0n),
                                                                                                                           alignment: _descriptor_6.alignment() } }] } },
                                                                                                { popeq: { cached: false,
                                                                                                           result: undefined } }]).value),
                             _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        { dup: { n: 3 } },
                                                                                        { idx: { cached: true,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(2n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        'lt',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value)),
                            'Batas waktu pembukaan suara belum lewat');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(6n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(2),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _folder_0(f, x, a0) {
    for (let i = 0; i < 10; i++) { x = f(x, a0[i]); }
    return x;
  }
  _equal_0(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_1(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
  _equal_2(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_3(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()),
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    get title() {
      return _descriptor_20.fromValue(__compactRuntime.queryLedgerState(context,
                                                                        partialProofData,
                                                                        [
                                                                         { dup: { n: 0 } },
                                                                         { idx: { cached: false,
                                                                                  pushPath: false,
                                                                                  path: [
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(0n),
                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(0n),
                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                         { popeq: { cached: false,
                                                                                    result: undefined } }]).value);
    },
    get description() {
      return _descriptor_20.fromValue(__compactRuntime.queryLedgerState(context,
                                                                        partialProofData,
                                                                        [
                                                                         { dup: { n: 0 } },
                                                                         { idx: { cached: false,
                                                                                  pushPath: false,
                                                                                  path: [
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(0n),
                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(1n),
                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                         { popeq: { cached: false,
                                                                                    result: undefined } }]).value);
    },
    get community() {
      return _descriptor_20.fromValue(__compactRuntime.queryLedgerState(context,
                                                                        partialProofData,
                                                                        [
                                                                         { dup: { n: 0 } },
                                                                         { idx: { cached: false,
                                                                                  pushPath: false,
                                                                                  path: [
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(0n),
                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(2n),
                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                         { popeq: { cached: false,
                                                                                    result: undefined } }]).value);
    },
    get option0() {
      return _descriptor_20.fromValue(__compactRuntime.queryLedgerState(context,
                                                                        partialProofData,
                                                                        [
                                                                         { dup: { n: 0 } },
                                                                         { idx: { cached: false,
                                                                                  pushPath: false,
                                                                                  path: [
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(0n),
                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(3n),
                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                         { popeq: { cached: false,
                                                                                    result: undefined } }]).value);
    },
    get option1() {
      return _descriptor_20.fromValue(__compactRuntime.queryLedgerState(context,
                                                                        partialProofData,
                                                                        [
                                                                         { dup: { n: 0 } },
                                                                         { idx: { cached: false,
                                                                                  pushPath: false,
                                                                                  path: [
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(0n),
                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(4n),
                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                         { popeq: { cached: false,
                                                                                    result: undefined } }]).value);
    },
    get option2() {
      return _descriptor_20.fromValue(__compactRuntime.queryLedgerState(context,
                                                                        partialProofData,
                                                                        [
                                                                         { dup: { n: 0 } },
                                                                         { idx: { cached: false,
                                                                                  pushPath: false,
                                                                                  path: [
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(0n),
                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(5n),
                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                         { popeq: { cached: false,
                                                                                    result: undefined } }]).value);
    },
    get option3() {
      return _descriptor_20.fromValue(__compactRuntime.queryLedgerState(context,
                                                                        partialProofData,
                                                                        [
                                                                         { dup: { n: 0 } },
                                                                         { idx: { cached: false,
                                                                                  pushPath: false,
                                                                                  path: [
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(0n),
                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(6n),
                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                         { popeq: { cached: false,
                                                                                    result: undefined } }]).value);
    },
    get optionCount() {
      return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(0n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(7n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get voteDeadline() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(0n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(8n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get tallyDeadline() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(0n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get quorumPercent() {
      return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get eligibleCount() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(2n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get eligibilityPolicy() {
      return _descriptor_20.fromValue(__compactRuntime.queryLedgerState(context,
                                                                        partialProofData,
                                                                        [
                                                                         { dup: { n: 0 } },
                                                                         { idx: { cached: false,
                                                                                  pushPath: false,
                                                                                  path: [
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(1n),
                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_6.toValue(3n),
                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                         { popeq: { cached: false,
                                                                                    result: undefined } }]).value);
    },
    get adminKey() {
      return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(4n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get ballotNonce() {
      return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(5n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get phase() {
      return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(6n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    eligibility: {
      isFull(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isFull: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(7n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(1024n),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'lt',
                                                                          'neg',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      checkRoot(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`checkRoot: expected 1 argument, received ${args_0.length}`);
        }
        const rt_0 = args_0[0];
        if (!(typeof(rt_0) === 'object' && typeof(rt_0.field) === 'bigint' && rt_0.field >= 0 && rt_0.field <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('checkRoot',
                                     'argument 1',
                                     'ballot.compact line 42 char 1',
                                     'struct MerkleTreeDigest<field: Field>',
                                     rt_0)
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(7n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(2n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(rt_0),
                                                                                                                                 alignment: _descriptor_5.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      root(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`root: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1].asArray()[7];
        return ((result) => result             ? __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(result)             : undefined)(self_0.asArray()[0].asBoundedMerkleTree().rehash().root()?.value);
      },
      firstFree(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`first_free: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1].asArray()[7];
        return __compactRuntime.CompactTypeField.fromValue(self_0.asArray()[1].asCell().value);
      },
      pathForLeaf(...args_0) {
        if (args_0.length !== 2) {
          throw new __compactRuntime.CompactError(`path_for_leaf: expected 2 arguments, received ${args_0.length}`);
        }
        const index_0 = args_0[0];
        const leaf_0 = args_0[1];
        if (!(typeof(index_0) === 'bigint' && index_0 >= 0 && index_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 1',
                                     'ballot.compact line 42 char 1',
                                     'Field',
                                     index_0)
        }
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 2',
                                     'ballot.compact line 42 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[1].asArray()[7];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(10, _descriptor_3).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().pathForLeaf(    index_0,    {      value: _descriptor_3.toValue(leaf_0),      alignment: _descriptor_3.alignment()    }  )?.value);
      },
      findPathForLeaf(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`find_path_for_leaf: expected 1 argument, received ${args_0.length}`);
        }
        const leaf_0 = args_0[0];
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('find_path_for_leaf',
                                     'argument 1',
                                     'ballot.compact line 42 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[1].asArray()[7];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(10, _descriptor_3).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().findPathForLeaf(    {      value: _descriptor_3.toValue(leaf_0),      alignment: _descriptor_3.alignment()    }  )?.value);
      },
      history(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`history: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1].asArray()[7];
        return self_0.asArray()[2].asMap().keys().map(  (elem) => __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    get voteCount() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(8n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: true,
                                                                                   result: undefined } }]).value);
    },
    get registeredCount() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(9n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: true,
                                                                                   result: undefined } }]).value);
    },
    nullifiers: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(10n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(10n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const elem_0 = args_0[0];
        if (!(elem_0.buffer instanceof ArrayBuffer && elem_0.BYTES_PER_ELEMENT === 1 && elem_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'ballot.compact line 65 char 1',
                                     'Bytes<32>',
                                     elem_0)
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(10n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(elem_0),
                                                                                                                                 alignment: _descriptor_3.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1].asArray()[10];
        return self_0.asMap().keys().map((elem) => _descriptor_3.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    commitments: {
      isFull(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isFull: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(11n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(1024n),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'lt',
                                                                          'neg',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      checkRoot(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`checkRoot: expected 1 argument, received ${args_0.length}`);
        }
        const rt_0 = args_0[0];
        if (!(typeof(rt_0) === 'object' && typeof(rt_0.field) === 'bigint' && rt_0.field >= 0 && rt_0.field <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('checkRoot',
                                     'argument 1',
                                     'ballot.compact line 68 char 1',
                                     'struct MerkleTreeDigest<field: Field>',
                                     rt_0)
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(11n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(0n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'root',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(rt_0),
                                                                                                                                 alignment: _descriptor_5.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      root(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`root: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1].asArray()[11];
        return ((result) => result             ? __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(result)             : undefined)(self_0.asArray()[0].asBoundedMerkleTree().rehash().root()?.value);
      },
      firstFree(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`first_free: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1].asArray()[11];
        return __compactRuntime.CompactTypeField.fromValue(self_0.asArray()[1].asCell().value);
      },
      pathForLeaf(...args_0) {
        if (args_0.length !== 2) {
          throw new __compactRuntime.CompactError(`path_for_leaf: expected 2 arguments, received ${args_0.length}`);
        }
        const index_0 = args_0[0];
        const leaf_0 = args_0[1];
        if (!(typeof(index_0) === 'bigint' && index_0 >= 0 && index_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 1',
                                     'ballot.compact line 68 char 1',
                                     'Field',
                                     index_0)
        }
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 2',
                                     'ballot.compact line 68 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[1].asArray()[11];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(10, _descriptor_3).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().pathForLeaf(    index_0,    {      value: _descriptor_3.toValue(leaf_0),      alignment: _descriptor_3.alignment()    }  )?.value);
      },
      findPathForLeaf(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`find_path_for_leaf: expected 1 argument, received ${args_0.length}`);
        }
        const leaf_0 = args_0[0];
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('find_path_for_leaf',
                                     'argument 1',
                                     'ballot.compact line 68 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[1].asArray()[11];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(10, _descriptor_3).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().findPathForLeaf(    {      value: _descriptor_3.toValue(leaf_0),      alignment: _descriptor_3.alignment()    }  )?.value);
      }
    },
    tallyNullifiers: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(12n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(12n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const elem_0 = args_0[0];
        if (!(elem_0.buffer instanceof ArrayBuffer && elem_0.BYTES_PER_ELEMENT === 1 && elem_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'ballot.compact line 74 char 1',
                                     'Bytes<32>',
                                     elem_0)
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(12n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(elem_0),
                                                                                                                                 alignment: _descriptor_3.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1].asArray()[12];
        return self_0.asMap().keys().map((elem) => _descriptor_3.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    tallies: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(13n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(13n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0n && key_0 <= 255n)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'ballot.compact line 75 char 1',
                                     'Uint<0..256>',
                                     key_0)
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(13n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(key_0),
                                                                                                                                 alignment: _descriptor_6.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0n && key_0 <= 255n)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'ballot.compact line 75 char 1',
                                     'Uint<0..256>',
                                     key_0)
        }
        return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } },
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(13n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(key_0),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1].asArray()[13];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_6.fromValue(key.value),      _descriptor_0.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    get talliedCount() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } },
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(14n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: true,
                                                                                   result: undefined } }]).value);
    }
  };
}
const _emptyContext = {
  currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress())
};
const _dummyContract = new Contract({
  admin_secret_key: (...args) => undefined,
  voter_credential: (...args) => undefined,
  eligibility_path: (...args) => undefined,
  get_my_option: (...args) => undefined,
  get_my_salt: (...args) => undefined,
  store_opening: (...args) => undefined,
  commitment_path: (...args) => undefined
});
export const pureCircuits = {
  admin_pk: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`admin_pk: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const sk_0 = args_0[0];
    if (!(sk_0.buffer instanceof ArrayBuffer && sk_0.BYTES_PER_ELEMENT === 1 && sk_0.length === 32)) {
      __compactRuntime.typeError('admin_pk',
                                 'argument 1',
                                 'ballot.compact line 90 char 1',
                                 'Bytes<32>',
                                 sk_0)
    }
    return _dummyContract._admin_pk_0(sk_0);
  },
  cred_leaf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`cred_leaf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const cred_0 = args_0[0];
    if (!(cred_0.buffer instanceof ArrayBuffer && cred_0.BYTES_PER_ELEMENT === 1 && cred_0.length === 32)) {
      __compactRuntime.typeError('cred_leaf',
                                 'argument 1',
                                 'ballot.compact line 94 char 1',
                                 'Bytes<32>',
                                 cred_0)
    }
    return _dummyContract._cred_leaf_0(cred_0);
  },
  vote_nullifier: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`vote_nullifier: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const nonce_0 = args_0[0];
    const cred_0 = args_0[1];
    if (!(nonce_0.buffer instanceof ArrayBuffer && nonce_0.BYTES_PER_ELEMENT === 1 && nonce_0.length === 32)) {
      __compactRuntime.typeError('vote_nullifier',
                                 'argument 1',
                                 'ballot.compact line 98 char 1',
                                 'Bytes<32>',
                                 nonce_0)
    }
    if (!(cred_0.buffer instanceof ArrayBuffer && cred_0.BYTES_PER_ELEMENT === 1 && cred_0.length === 32)) {
      __compactRuntime.typeError('vote_nullifier',
                                 'argument 2',
                                 'ballot.compact line 98 char 1',
                                 'Bytes<32>',
                                 cred_0)
    }
    return _dummyContract._vote_nullifier_0(nonce_0, cred_0);
  },
  vote_commitment: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`vote_commitment: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const option_0 = args_0[0];
    const salt_0 = args_0[1];
    if (!(typeof(option_0) === 'bigint' && option_0 >= 0n && option_0 <= 255n)) {
      __compactRuntime.typeError('vote_commitment',
                                 'argument 1',
                                 'ballot.compact line 102 char 1',
                                 'Uint<0..256>',
                                 option_0)
    }
    if (!(salt_0.buffer instanceof ArrayBuffer && salt_0.BYTES_PER_ELEMENT === 1 && salt_0.length === 32)) {
      __compactRuntime.typeError('vote_commitment',
                                 'argument 2',
                                 'ballot.compact line 102 char 1',
                                 'Bytes<32>',
                                 salt_0)
    }
    return _dummyContract._vote_commitment_0(option_0, salt_0);
  },
  tally_nullifier: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`tally_nullifier: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const salt_0 = args_0[0];
    if (!(salt_0.buffer instanceof ArrayBuffer && salt_0.BYTES_PER_ELEMENT === 1 && salt_0.length === 32)) {
      __compactRuntime.typeError('tally_nullifier',
                                 'argument 1',
                                 'ballot.compact line 110 char 1',
                                 'Bytes<32>',
                                 salt_0)
    }
    return _dummyContract._tally_nullifier_0(salt_0);
  }
};
export const contractReferenceLocations =
  { tag: 'publicLedgerArray', indices: { } };
//# sourceMappingURL=index.js.map

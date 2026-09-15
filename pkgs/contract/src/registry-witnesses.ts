/** The registry has no private data; this type exists so its shape matches the ballot's. */
export type RegistryPrivateState = Record<string, never>;

export const RegistryPrivateStateId = "votePrivRegistry" as const;

export const emptyRegistryPrivateState = (): RegistryPrivateState => ({});

/** registry.compact declares no witnesses. */
export const registryWitnesses = {};

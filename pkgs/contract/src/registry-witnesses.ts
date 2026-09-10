/** Registry tidak punya data privat; tipe ini ada agar bentuknya seragam dengan ballot. */
export type RegistryPrivateState = Record<string, never>;

export const RegistryPrivateStateId = "votePrivRegistry" as const;

export const emptyRegistryPrivateState = (): RegistryPrivateState => ({});

/** Tidak ada witness yang dideklarasikan registry.compact. */
export const registryWitnesses = {};

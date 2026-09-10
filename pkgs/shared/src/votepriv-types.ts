export const BallotPhase = { voting: 0, tallying: 1, finalized: 2 } as const;
export type BallotPhase = (typeof BallotPhase)[keyof typeof BallotPhase];

/** Metadata yang di-seal saat deploy. Deadline dalam DETIK sejak epoch. */
export type MetadataBallot = {
  title: string;
  description: string;
  community: string;
  options: string[];        // 2..4
  voteDeadline: bigint;
  tallyDeadline: bigint;
  quorumPercent: number;    // informatif, tidak ditegakkan kontrak
  eligibleCount: number;
  eligibilityPolicy: string;
};

export type HasilBallot = {
  counts: Record<number, bigint>;
  voteCount: bigint;
  talliedCount: bigint;
  phase: BallotPhase;
};

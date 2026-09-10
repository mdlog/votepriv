import {
  type ChargedState,
  type CircuitContext,
  type EncodedZswapLocalState,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  BallotPhase,
  Contract,
  type Ledger,
  type Witnesses,
  ledger,
  pureCircuits,
} from "../managed/ballot/contract/index.js";
import {
  type BallotPrivateState,
  ballotWitnesses,
  emptyBallotPrivateState,
} from "../ballot-witnesses.js";

export { BallotPhase, pureCircuits };
export type { Ledger };

const HARI = 24 * 60 * 60 * 1000;

export type BallotOpts = {
  title?: string;
  description?: string;
  community?: string;
  options?: string[];
  quorumPercent?: number;
  eligibleCount?: number;
  eligibilityPolicy?: string;
  voteDeadline?: bigint;
  tallyDeadline?: bigint;
  ballotNonce?: Uint8Array;
  adminSecretKey?: Uint8Array;
};

/**
 * Simulator ballot. Setiap pelaku (admin, tiap voter) punya private state sendiri,
 * tapi berbagi satu ledger — persis seperti kontrak sungguhan.
 */
export class BallotSimulator {
  private readonly contract: Contract<BallotPrivateState>;
  private readonly contractAddress = sampleContractAddress();
  private zswap: EncodedZswapLocalState;
  private state: ChargedState;
  /** Waktu blok yang dilihat circuit; dirangkai ke context pada Task 5. */
  private blockTime: bigint = BigInt(Date.now());
  readonly adminSecretKey: Uint8Array;
  readonly ballotNonce: Uint8Array;

  constructor(opts: BallotOpts = {}) {
    const options = opts.options ?? ["Setuju", "Tidak setuju"];
    this.adminSecretKey = opts.adminSecretKey ?? new Uint8Array(32).fill(1);
    this.ballotNonce = opts.ballotNonce ?? new Uint8Array(32).fill(0x5a);

    this.contract = new Contract<BallotPrivateState>(
      ballotWitnesses as unknown as Witnesses<BallotPrivateState>,
    );

    const init = this.contract.initialState(
      createConstructorContext(
        emptyBallotPrivateState(this.adminSecretKey),
        "0".repeat(64),
      ),
      opts.title ?? "Ballot uji",
      opts.description ?? "Deskripsi uji",
      opts.community ?? "Komunitas uji",
      options[0] ?? "",
      options[1] ?? "",
      options[2] ?? "",
      options[3] ?? "",
      BigInt(options.length),
      opts.voteDeadline ?? BigInt(Date.now() + 7 * HARI),
      opts.tallyDeadline ?? BigInt(Date.now() + 14 * HARI),
      BigInt(opts.quorumPercent ?? 50),
      BigInt(opts.eligibleCount ?? 8),
      opts.eligibilityPolicy ?? "Kebijakan uji",
      this.ballotNonce,
    );

    this.zswap = init.currentZswapLocalState;
    this.state = init.currentContractState.data;
  }

  getLedger(): Ledger {
    return ledger(this.state);
  }

  /** Menjalankan satu circuit atas nama pelaku dengan private state tertentu. */
  protected run(
    jalankan: (ctx: CircuitContext<BallotPrivateState>) => {
      context: {
        currentQueryContext: { state: ChargedState };
        currentZswapLocalState: EncodedZswapLocalState;
      };
    },
    privateState: BallotPrivateState,
  ): Ledger {
    const ctx = createCircuitContext(
      this.contractAddress,
      this.zswap,
      this.state,
      privateState,
    );
    const result = jalankan(ctx);
    this.state = result.context.currentQueryContext.state;
    this.zswap = result.context.currentZswapLocalState;
    // Private state hasil store_opening sengaja dibuang: uji selalu memberikan
    // option dan salt secara eksplisit, jadi tidak ada yang perlu diingat.
    return ledger(this.state);
  }

  /** Menyetel waktu blok yang dilihat circuit. */
  setBlockTime(ms: bigint): void {
    this.blockTime = ms;
  }

  /** Memajukan waktu melewati voteDeadline, sehingga pembukaan suara boleh dimulai. */
  majuKeFaseTally(): void {
    this.setBlockTime(this.getLedger().voteDeadline + 1n);
  }

  /** Memajukan waktu melewati tallyDeadline, sehingga finalisasi boleh dilakukan. */
  majuKeFaseFinal(): void {
    this.setBlockTime(this.getLedger().tallyDeadline + 1n);
  }

  /**
   * Mendaftarkan sampai 8 credential sekaligus.
   * `sebagai` menentukan secret key pemanggil — default admin.
   */
  registerVoters(creds: Uint8Array[], sebagai?: Uint8Array): Ledger {
    if (creds.length < 1 || creds.length > 8) {
      throw new Error("registerVoters menerima 1..8 credential");
    }
    const daun: Uint8Array[] = Array.from({ length: 8 }, (_, i) =>
      i < creds.length ? pureCircuits.cred_leaf(creds[i]) : new Uint8Array(32),
    );
    const ps = emptyBallotPrivateState(sebagai ?? this.adminSecretKey);
    return this.run(
      (ctx) =>
        this.contract.impureCircuits.registerVoters(
          ctx,
          daun as unknown as Parameters<
            typeof this.contract.impureCircuits.registerVoters
          >[1],
          BigInt(creds.length),
        ),
      ps,
    );
  }

  /** Mencoblos memakai credential tertentu. Path eligibility disusun dari state on-chain. */
  castVote(cred: Uint8Array, option: number, salt: Uint8Array): Ledger {
    const daun = pureCircuits.cred_leaf(cred);
    const path = this.getLedger().eligibility.findPathForLeaf(daun);
    if (path === undefined) {
      throw new Error("Credential tidak ada di pohon eligibility");
    }
    const ps: BallotPrivateState = {
      ...emptyBallotPrivateState(new Uint8Array(32)),
      credential: cred,
      option: BigInt(option),
      salt,
      eligibilityPath: path,
    };
    return this.run((ctx) => this.contract.impureCircuits.castVote(ctx), ps);
  }

  /**
   * KHUSUS UJI: menjalankan castVote dengan private state yang disusun manual,
   * melewati pencarian path otomatis di castVote(). castVote() biasa selalu
   * menyusun path yang benar-benar valid untuk credential yang diberikan,
   * sehingga guard di dalam circuit (kecocokan leaf, checkRoot) tidak pernah
   * bisa dipicu ke cabang gagalnya lewat method itu — path dan credential
   * selalu konsisten satu sama lain. Method ini ada supaya uji dapat menembus
   * guard tersebut secara sengaja (mis. memasangkan path milik satu credential
   * dengan credential lain, atau meng-utak-atik satu sibling di dalam path)
   * tanpa mengubah kode circuit maupun memakai `as any` di tiap titik panggil.
   */
  castVoteWithRawPrivateState(
    ps: Partial<Pick<BallotPrivateState, "credential" | "option" | "salt" | "eligibilityPath">>,
  ): Ledger {
    const full: BallotPrivateState = {
      ...emptyBallotPrivateState(new Uint8Array(32)),
      ...ps,
    };
    return this.run((ctx) => this.contract.impureCircuits.castVote(ctx), full);
  }
}

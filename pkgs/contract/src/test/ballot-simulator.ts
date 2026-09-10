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

// Satu hari, dalam DETIK — bukan milidetik. Dikonfirmasi empiris pada Task 5:
// parameter `time` pada createCircuitContext (lihat method `run` di bawah)
// dipakai mentah sebagai `secondsSinceEpoch` tanpa skala apa pun (bukti:
// @midnight-ntwrk/compact-runtime dist/circuit-context.js —
// `secondsSinceEpoch: BigInt(time ?? Math.floor(Date.now() / 1_000))`; hanya
// fallback Date.now() yang dibagi 1000, nilai `time` yang disuntikkan eksplisit
// tidak). CallContext/BlockContext dari onchain-runtime-v3 juga mendeklarasikan
// `secondsSinceEpoch: bigint` sebagai "the seconds since the UNIX epoch" — itu
// konvensi node Midnight sungguhan, yang tidak bisa di-override di luar
// simulator ini. Karena itu voteDeadline/tallyDeadline WAJIB dalam detik sejak
// epoch Unix, bukan Date.now()-style milidetik, atau penegakan deadline akan
// diam-diam tidak berfungsi saat dideploy sungguhan (nilai ms ≈ 1000× nilai
// detik yang sebenarnya, sehingga blockTimeLessThan(voteDeadline) nyaris
// selalu true).
const HARI = 24 * 60 * 60;

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
  /**
   * Waktu blok yang dilihat circuit, dalam DETIK sejak epoch Unix (lihat
   * catatan pada `HARI` di atas). Dirangkai ke context lewat method `run`.
   */
  private blockTime: bigint = BigInt(Math.floor(Date.now() / 1000));
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
      opts.voteDeadline ?? BigInt(Math.floor(Date.now() / 1000) + 7 * HARI),
      opts.tallyDeadline ?? BigInt(Math.floor(Date.now() / 1000) + 14 * HARI),
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
      undefined, // gasLimit — pakai default runtime
      undefined, // costModel — pakai default runtime
      Number(this.blockTime), // waktu blok, DETIK sejak epoch (Task 5)
    );
    const result = jalankan(ctx);
    this.state = result.context.currentQueryContext.state;
    this.zswap = result.context.currentZswapLocalState;
    // Private state hasil store_opening sengaja dibuang: uji selalu memberikan
    // option dan salt secara eksplisit, jadi tidak ada yang perlu diingat.
    return ledger(this.state);
  }

  /**
   * Menyetel waktu blok yang dilihat circuit, dalam DETIK sejak epoch Unix
   * (bukan milidetik — lihat catatan pada `HARI`). Sebelum Task 5 method ini
   * tidak berefek apa pun; sejak Task 5 nilainya dirangkai ke
   * createCircuitContext lewat method `run`.
   */
  setBlockTime(seconds: bigint): void {
    this.blockTime = seconds;
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

  /** Membuka satu suara. Path commitment disusun dari state on-chain. */
  tallyVote(option: number, salt: Uint8Array): Ledger {
    const c = pureCircuits.vote_commitment(BigInt(option), salt);
    const path = this.getLedger().commitments.findPathForLeaf(c);
    if (path === undefined) {
      throw new Error("Commitment tidak ada di pohon");
    }
    const ps: BallotPrivateState = {
      ...emptyBallotPrivateState(new Uint8Array(32)),
      option: BigInt(option),
      salt,
      commitmentPath: path,
    };
    return this.run((ctx) => this.contract.impureCircuits.tallyVote(ctx), ps);
  }

  /** Membaca hitungan satu opsi; 0 bila belum ada yang membuka. */
  tally(option: number): bigint {
    const t = this.getLedger().tallies;
    return t.member(BigInt(option)) ? t.lookup(BigInt(option)) : 0n;
  }

  /**
   * KHUSUS UJI: menjalankan tallyVote dengan private state yang disusun manual,
   * melewati pencarian path otomatis di tallyVote(). tallyVote() biasa selalu
   * menyusun path commitment dari (option, salt) yang sama persis dengan yang
   * diberikan (lewat vote_commitment lalu findPathForLeaf), sehingga guard di
   * dalam circuit (kecocokan leaf, checkRoot) tidak pernah bisa dipicu ke
   * cabang gagalnya lewat method itu — (option, salt, path) selalu konsisten
   * satu sama lain. Method ini ada supaya uji dapat menembus guard tersebut
   * secara sengaja tanpa mengubah kode circuit maupun memakai `as any` di
   * tiap titik panggil.
   *
   * Sengaja BUKAN `Partial<Pick<...>>` seperti castVoteWithRawPrivateState:
   * Partial mengizinkan properti diberi nilai `undefined` secara eksplisit,
   * yang lewat spread `{...default, ...ps}` akan menimpa default `null` milik
   * emptyBallotPrivateState dengan `undefined` — lolos dari pengecekan `=== null`
   * pada helper `need()` di ballot-witnesses.ts, sehingga kegagalan berakhir
   * sebagai throw TypeScript entah di mana (mis. saat runtime mencoba meng-encode
   * `undefined` sebagai Bytes<32>), bukan sebagai penolakan assert di dalam
   * circuit — persis kegagalan yang coba dicegah escape hatch ini. Dengan
   * `Pick` polos (tanpa Partial), ketiga field wajib diisi, dan tipe masing-
   * masing (`bigint | null`, `Uint8Array | null`, `MerkleTreePath<Uint8Array> | null`)
   * tidak memuat `undefined` sama sekali — di bawah `strict` tsconfig, TypeScript
   * menolak `{ option: undefined, ... }` saat dikompilasi, bukan saat dijalankan.
   */
  tallyVoteWithRawPrivateState(
    ps: Pick<BallotPrivateState, "option" | "salt" | "commitmentPath">,
  ): Ledger {
    const full: BallotPrivateState = {
      ...emptyBallotPrivateState(new Uint8Array(32)),
      ...ps,
    };
    return this.run((ctx) => this.contract.impureCircuits.tallyVote(ctx), full);
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

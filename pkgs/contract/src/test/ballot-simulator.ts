import {
  type ChargedState,
  type CircuitContext,
  type EncodedZswapLocalState,
  type MerkleTreePath,
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
  type BallotOpening,
  type BallotPrivateState,
  ballotWitnesses,
  emptyBallotPrivateState,
  openingFor,
  withCommitmentPath,
  withCredential,
  withEligibilityPath,
  withOpening,
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
  /**
   * Menimpa nOptions yang biasanya diturunkan dari `options.length`. Ada supaya
   * uji dapat mencoba men-deploy ballot dengan jumlah opsi yang TIDAK sah (0, 8)
   * — sesuatu yang tidak bisa dinyatakan lewat `options` saja, karena panjang
   * array label dan nilai optionCount yang di-seal adalah dua hal berbeda, dan
   * justru perbedaan itulah yang membuat nOptions = 8 berbahaya: opsi 4..7
   * tidak punya label on-chain sama sekali.
   */
  optionCount?: number;
  quorumPercent?: number;
  eligibleCount?: number;
  eligibilityPolicy?: string;
  voteDeadline?: bigint;
  tallyDeadline?: bigint;
  ballotNonce?: Uint8Array;
  adminSecretKey?: Uint8Array;
};

/**
 * Bentuk minimum hasil pemanggilan circuit yang benar-benar dipakai simulator
 * ini. Tiga field, tidak lebih — `currentPrivateState` ikut karena uji
 * lintas-ballot perlu melihat efek `store_opening`.
 */
type Jalankan = (ctx: CircuitContext<BallotPrivateState>) => {
  context: {
    currentQueryContext: { state: ChargedState };
    currentZswapLocalState: EncodedZswapLocalState;
    currentPrivateState: BallotPrivateState;
  };
};

/**
 * Nilai per-ballot mentah untuk escape hatch castVote di bawah.
 *
 * Sengaja BUKAN `Partial<...>`: Partial mengizinkan properti diberi nilai
 * `undefined` secara eksplisit, yang akan lolos dari pengecekan `=== null` dan
 * membuat kegagalan berakhir sebagai throw TypeScript entah di mana (mis. saat
 * runtime mencoba meng-encode `undefined` sebagai Bytes<32>), bukan sebagai
 * penolakan assert di dalam circuit — persis kegagalan yang coba dicegah escape
 * hatch ini. Ketiga properti wajib diisi, dan tipenya (`X | null`) tidak memuat
 * `undefined` sama sekali, sehingga `strict` tsconfig menolak
 * `{ credential: undefined, ... }` saat dikompilasi, bukan saat dijalankan.
 *
 * `opening` adalah satu record, bukan `option` dan `salt` terpisah: commitment
 * adalah hash keduanya sekaligus, jadi memisahkannya di sini akan menyiratkan
 * bahwa salah satunya bisa ada tanpa yang lain — yang tidak pernah benar.
 */
export type RawCastState = {
  credential: Uint8Array | null;
  opening: BallotOpening | null;
  eligibilityPath: MerkleTreePath<Uint8Array> | null;
};

/** Sama, untuk escape hatch tallyVote. Lihat catatan pada RawCastState. */
export type RawTallyState = {
  opening: BallotOpening | null;
  commitmentPath: MerkleTreePath<Uint8Array> | null;
};

/**
 * Simulator ballot. Setiap pelaku (admin, tiap voter) punya private state sendiri,
 * tapi berbagi satu ledger — persis seperti kontrak sungguhan.
 */
export class BallotSimulator {
  private readonly contract: Contract<BallotPrivateState>;
  /**
   * Kunci private state untuk ballot ini. Publik karena uji lintas-ballot perlu
   * menyebutnya: inilah nilai yang dipakai lapisan witness sebagai kunci map,
   * lewat `WitnessContext.contractAddress`.
   */
  readonly contractAddress = sampleContractAddress();
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
      BigInt(opts.optionCount ?? options.length),
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
  protected run(jalankan: Jalankan, privateState: BallotPrivateState): Ledger {
    // Private state hasilnya dibuang di sini: method-method biasa selalu
    // memberikan option dan salt secara eksplisit, jadi tidak ada yang perlu
    // diingat. Uji lintas-ballot memakai runDenganState di bawah.
    return this.runDenganState(jalankan, privateState).ledger;
  }

  /**
   * Sama seperti `run`, tapi MENGEMBALIKAN private state hasil eksekusi circuit
   * — termasuk efek `store_opening`. Dibutuhkan uji yang memodelkan satu blob
   * private state yang dipakai bersama beberapa ballot, karena persis begitulah
   * levelPrivateStateProvider bekerja: satu id, satu blob, seluruh ballot.
   */
  protected runDenganState(
    jalankan: Jalankan,
    privateState: BallotPrivateState,
  ): { ledger: Ledger; privateState: BallotPrivateState } {
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
    return { ledger: ledger(this.state), privateState: result.context.currentPrivateState };
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
    const ps = this.siapkanCoblos(
      emptyBallotPrivateState(new Uint8Array(32)),
      cred,
      option,
      salt,
    );
    return this.run((ctx) => this.contract.impureCircuits.castVote(ctx), ps);
  }

  /**
   * Mengisi private state dengan seluruh bahan untuk mencoblos di ballot INI —
   * credential, opening, dan path eligibility — tanpa menyentuh entri milik
   * ballot lain di dalam state yang sama. Dipakai `castVote` maupun uji
   * lintas-ballot.
   */
  siapkanCoblos(
    ps: BallotPrivateState,
    cred: Uint8Array,
    option: number,
    salt: Uint8Array,
  ): BallotPrivateState {
    const daun = pureCircuits.cred_leaf(cred);
    const path = this.getLedger().eligibility.findPathForLeaf(daun);
    if (path === undefined) {
      throw new Error("Credential tidak ada di pohon eligibility");
    }
    const dengan = withCredential(ps, this.contractAddress, cred);
    return withEligibilityPath(
      withOpening(dengan, this.contractAddress, { option: BigInt(option), salt }),
      this.contractAddress,
      path,
    );
  }

  /** Membuka satu suara. Path commitment disusun dari state on-chain. */
  tallyVote(option: number, salt: Uint8Array): Ledger {
    const ps = this.siapkanBuka(
      withOpening(emptyBallotPrivateState(new Uint8Array(32)), this.contractAddress, {
        option: BigInt(option),
        salt,
      }),
    );
    return this.run((ctx) => this.contract.impureCircuits.tallyVote(ctx), ps);
  }

  /**
   * Menyusun path commitment untuk ballot INI dari opening yang SUDAH tersimpan
   * di private state — bukan dari nilai yang diberikan ulang pemanggil. Itulah
   * yang membuat uji lintas-ballot bermakna: kalau opening milik ballot ini
   * tertimpa ballot lain, commitment yang dihitung di sini akan salah dan
   * path-nya tidak ditemukan.
   */
  siapkanBuka(ps: BallotPrivateState): BallotPrivateState {
    const opening = openingFor(ps, this.contractAddress);
    if (opening === null) {
      throw new Error(`Tidak ada opening tersimpan untuk ballot ${this.contractAddress}`);
    }
    const c = pureCircuits.vote_commitment(opening.option, opening.salt);
    const path = this.getLedger().commitments.findPathForLeaf(c);
    if (path === undefined) {
      throw new Error("Commitment tidak ada di pohon");
    }
    return withCommitmentPath(ps, this.contractAddress, path);
  }

  /**
   * KHUSUS UJI: mencoblos memakai SATU private state yang dipakai bersama lintas
   * ballot, lalu mengembalikan private state hasilnya (termasuk efek
   * `store_opening`). `castVote()` biasa menyusun private state sekali pakai dan
   * membuangnya, sehingga tidak dapat memodelkan blob bersama milik
   * levelPrivateStateProvider — dan justru di blob bersama itulah suara bisa
   * saling menimpa bila bentuk state-nya datar.
   */
  castVoteBersama(
    psBersama: BallotPrivateState,
    cred: Uint8Array,
    option: number,
    salt: Uint8Array,
  ): BallotPrivateState {
    const ps = this.siapkanCoblos(psBersama, cred, option, salt);
    return this.runDenganState((ctx) => this.contract.impureCircuits.castVote(ctx), ps)
      .privateState;
  }

  /**
   * KHUSUS UJI: membuka suara memakai private state bersama, dengan opsi dan
   * salt diambil DARI private state itu sendiri — bukan diberikan ulang oleh
   * uji. Inilah bentuk yang benar-benar memeriksa bahwa opening milik ballot ini
   * masih utuh setelah ballot lain ikut dicoblos memakai blob yang sama.
   */
  tallyVoteBersama(psBersama: BallotPrivateState): BallotPrivateState {
    const ps = this.siapkanBuka(psBersama);
    return this.runDenganState((ctx) => this.contract.impureCircuits.tallyVote(ctx), ps)
      .privateState;
  }

  /** Membaca hitungan satu opsi; 0 bila belum ada yang membuka. */
  tally(option: number): bigint {
    const t = this.getLedger().tallies;
    return t.member(BigInt(option)) ? t.lookup(BigInt(option)) : 0n;
  }

  /**
   * KHUSUS UJI: menjalankan tallyVote dengan private state yang disusun manual,
   * melewati pencarian path otomatis di tallyVote(). tallyVote() biasa selalu
   * menyusun path commitment dari opening yang sama persis dengan yang tersimpan
   * (lewat vote_commitment lalu findPathForLeaf), sehingga guard di dalam
   * circuit (kecocokan leaf, checkRoot) tidak pernah bisa dipicu ke cabang
   * gagalnya lewat method itu — (opening, path) selalu konsisten satu sama lain.
   * Method ini ada supaya uji dapat menembus guard tersebut secara sengaja tanpa
   * mengubah kode circuit maupun memakai `as any` di tiap titik panggil.
   *
   * Lihat RawTallyState untuk alasan bentuk tipenya.
   */
  tallyVoteWithRawPrivateState(ps: RawTallyState): Ledger {
    return this.run(
      (ctx) => this.contract.impureCircuits.tallyVote(ctx),
      this.susunMentah({ credential: null, ...ps, eligibilityPath: null }),
    );
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
   *
   * Lihat RawCastState untuk alasan bentuk tipenya.
   */
  castVoteWithRawPrivateState(ps: RawCastState): Ledger {
    return this.run(
      (ctx) => this.contract.impureCircuits.castVote(ctx),
      this.susunMentah({ ...ps, commitmentPath: null }),
    );
  }

  /**
   * Menaruh nilai mentah pada kunci ballot INI. `null` berarti "jangan isi sama
   * sekali", sehingga witness yang membacanya gagal lewat `need()` — bukan
   * lewat encoding `undefined`.
   */
  private susunMentah(raw: RawCastState & RawTallyState): BallotPrivateState {
    let ps = emptyBallotPrivateState(new Uint8Array(32));
    if (raw.credential !== null) ps = withCredential(ps, this.contractAddress, raw.credential);
    if (raw.opening !== null) ps = withOpening(ps, this.contractAddress, raw.opening);
    if (raw.eligibilityPath !== null) {
      ps = withEligibilityPath(ps, this.contractAddress, raw.eligibilityPath);
    }
    if (raw.commitmentPath !== null) {
      ps = withCommitmentPath(ps, this.contractAddress, raw.commitmentPath);
    }
    return ps;
  }

  /** Memfinalisasi ballot. Memajukan waktu blok melewati tallyDeadline. */
  finalize(): Ledger {
    this.majuKeFaseFinal();
    return this.run(
      (ctx) => this.contract.impureCircuits.finalize(ctx),
      emptyBallotPrivateState(this.adminSecretKey),
    );
  }

  /**
   * KHUSUS UJI: memanggil circuit finalize TANPA memajukan waktu blok lebih
   * dulu. finalize() di atas selalu memanggil majuKeFaseFinal(), sehingga
   * assert kernel.blockTimeGreaterThan(tallyDeadline) di dalam circuit tidak
   * pernah bisa dipicu ke cabang gagalnya lewat method itu — waktu selalu
   * sudah lewat tallyDeadline pada saat circuit dipanggil. Method ini memakai
   * waktu blok simulator apa adanya (atur lewat setBlockTime sebelum
   * memanggil bila perlu), sehingga uji dapat memicu guard tallyDeadline
   * tersebut secara sengaja. finalize tidak mengonsumsi witness apa pun, jadi
   * tidak ada escape hatch private-state yang diperlukan di sini — hanya
   * waktu blok yang perlu dikontrol manual.
   */
  finalizeSekarang(): Ledger {
    return this.run(
      (ctx) => this.contract.impureCircuits.finalize(ctx),
      emptyBallotPrivateState(this.adminSecretKey),
    );
  }
}

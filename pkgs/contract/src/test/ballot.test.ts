import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, expect, it } from "vitest";
import { BallotPhase, BallotSimulator, pureCircuits } from "./ballot-simulator.js";

setNetworkId("undeployed");

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const bytes32 = (fill: number) => new Uint8Array(32).fill(fill);

describe("ballot.compact — metadata", () => {
  it("menyimpan metadata yang diberikan saat deploy", () => {
    const sim = new BallotSimulator({
      title: "Q4 Community Treasury",
      description: "Pilih arah dukungan treasury pada Q4.",
      community: "Midnight Builders",
      options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
      quorumPercent: 60,
      eligibleCount: 12,
      eligibilityPolicy: "Anggota terdaftar Midnight Builders",
    });
    const l = sim.getLedger();
    expect(l.title).toBe("Q4 Community Treasury");
    expect(l.community).toBe("Midnight Builders");
    expect(l.option0).toBe("Fund developer grants");
    expect(l.option2).toBe("Open-source tooling");
    expect(l.option3).toBe("");
    expect(l.optionCount).toBe(3n);
    expect(l.quorumPercent).toBe(60n);
    expect(l.eligibleCount).toBe(12n);
    expect(l.eligibilityPolicy).toBe("Anggota terdaftar Midnight Builders");
    expect(l.phase).toBe(BallotPhase.voting);
  });

  it("menyetel adminKey dari secret key yang men-deploy", () => {
    const adminSk = bytes32(7);
    const sim = new BallotSimulator({ adminSecretKey: adminSk });
    expect(hex(sim.getLedger().adminKey)).toBe(hex(pureCircuits.admin_pk(adminSk)));
  });
});

describe("ballot.compact — pure circuit hash", () => {
  it("cred_leaf bersifat deterministik", () => {
    expect(hex(pureCircuits.cred_leaf(bytes32(3)))).toBe(hex(pureCircuits.cred_leaf(bytes32(3))));
  });

  it("cred_leaf berbeda untuk credential berbeda", () => {
    expect(hex(pureCircuits.cred_leaf(bytes32(3)))).not.toBe(hex(pureCircuits.cred_leaf(bytes32(4))));
  });

  it("vote_commitment mengikat pilihan — salt sama, pilihan beda, hasil beda", () => {
    const salt = bytes32(9);
    expect(hex(pureCircuits.vote_commitment(0n, salt))).not.toBe(
      hex(pureCircuits.vote_commitment(1n, salt)),
    );
  });

  it("vote_commitment menyembunyikan pilihan — pilihan sama, salt beda, hasil beda", () => {
    expect(hex(pureCircuits.vote_commitment(0n, bytes32(9)))).not.toBe(
      hex(pureCircuits.vote_commitment(0n, bytes32(10))),
    );
  });

  it("pemisahan domain — cred_leaf dan tally_nullifier tidak pernah bertabrakan", () => {
    const x = bytes32(5);
    expect(hex(pureCircuits.cred_leaf(x))).not.toBe(hex(pureCircuits.tally_nullifier(x)));
  });

  it("vote_nullifier terikat pada ballotNonce", () => {
    const cred = bytes32(2);
    expect(hex(pureCircuits.vote_nullifier(bytes32(1), cred))).not.toBe(
      hex(pureCircuits.vote_nullifier(bytes32(2), cred)),
    );
  });
});

describe("ballot.compact — pendaftaran eligibility", () => {
  const CRED_A = bytes32(0x11);
  const CRED_B = bytes32(0x22);
  const CRED_C = bytes32(0x33);

  it("admin dapat mendaftarkan voter", () => {
    const sim = new BallotSimulator({ eligibleCount: 8 });
    sim.registerVoters([CRED_A, CRED_B]);
    expect(sim.getLedger().eligibility.firstFree()).toBe(2n);
  });

  it("pendaftaran dapat dilakukan bertahap", () => {
    const sim = new BallotSimulator({ eligibleCount: 8 });
    sim.registerVoters([CRED_A]);
    sim.registerVoters([CRED_B, CRED_C]);
    expect(sim.getLedger().eligibility.firstFree()).toBe(3n);
  });

  it("bukan admin ditolak", () => {
    const sim = new BallotSimulator({ eligibleCount: 8 });
    expect(() => sim.registerVoters([CRED_A], bytes32(0xee))).toThrow();
  });

  it("melebihi eligibleCount ditolak", () => {
    const sim = new BallotSimulator({ eligibleCount: 2 });
    sim.registerVoters([CRED_A, CRED_B]);
    expect(() => sim.registerVoters([CRED_C])).toThrow();
  });

  it("eligibleCount ditegakkan lintas beberapa batch", () => {
    const sim = new BallotSimulator({ eligibleCount: 3 });
    sim.registerVoters([CRED_A, CRED_B]);
    expect(() => sim.registerVoters([CRED_C, bytes32(0x44)])).toThrow();
  });
});

describe("ballot.compact — castVote", () => {
  const CRED_A = bytes32(0x11);
  const CRED_B = bytes32(0x22);
  const ASING = bytes32(0x99);
  const SALT_1 = bytes32(0xa1);
  const SALT_2 = bytes32(0xa2);

  const siap = () => {
    const sim = new BallotSimulator({ eligibleCount: 4, options: ["Ya", "Tidak"] });
    sim.registerVoters([CRED_A, CRED_B]);
    return sim;
  };

  it("voter terdaftar dapat mencoblos", () => {
    const sim = siap();
    sim.castVote(CRED_A, 0, SALT_1);
    expect(sim.getLedger().voteCount).toBe(1n);
    expect(sim.getLedger().commitments.firstFree()).toBe(1n);
  });

  it("menyimpan nullifier yang benar", () => {
    const sim = siap();
    sim.castVote(CRED_A, 0, SALT_1);
    const nf = pureCircuits.vote_nullifier(sim.ballotNonce, CRED_A);
    expect(sim.getLedger().nullifiers.member(nf)).toBe(true);
  });

  it("menyimpan commitment yang benar", () => {
    const sim = siap();
    sim.castVote(CRED_A, 1, SALT_1);
    const c = pureCircuits.vote_commitment(1n, SALT_1);
    expect(sim.getLedger().commitments.findPathForLeaf(c)).toBeDefined();
  });

  it("credential yang tidak terdaftar ditolak", () => {
    // Ini menguji guard di simulator (findPathForLeaf mengembalikan undefined
    // sehingga castVote() menolak sebelum circuit sempat dipanggil), bukan
    // guard di dalam circuit itu sendiri. Lihat dua uji "in-circuit" di bawah
    // untuk uji yang benar-benar memicu cabang gagal assert di dalam castVote.
    const sim = siap();
    expect(() => sim.castVote(ASING, 0, SALT_1)).toThrow();
  });

  it("path milik credential lain ditolak in-circuit (guard kecocokan leaf)", () => {
    const sim = siap();
    // Path ini benar-benar valid — tapi untuk CRED_A. castVoteWithRawPrivateState
    // memasangkannya secara sengaja dengan credential CRED_B, sesuatu yang tidak
    // bisa terjadi lewat castVote() biasa karena castVote() selalu menyusun path
    // yang konsisten dengan credential yang diberikan. Ini memicu
    // assert(disclose(path.leaf == daun), "Merkle path bukan untuk credential ini")
    // di ballot.compact, bukan guard simulator manapun.
    const path = sim.getLedger().eligibility.findPathForLeaf(pureCircuits.cred_leaf(CRED_A));
    if (path === undefined) throw new Error("setup uji gagal: path CRED_A tidak ditemukan");
    expect(() =>
      sim.castVoteWithRawPrivateState({
        credential: CRED_B,
        option: 0n,
        salt: SALT_1,
        eligibilityPath: path,
      }),
    ).toThrow();
  });

  it("path dengan sibling yang diubah ditolak in-circuit (guard checkRoot)", () => {
    const sim = siap();
    // leaf tetap cocok dengan CRED_A (lolos guard kecocokan leaf), tapi satu
    // sibling di dalam path diubah sehingga akar yang direkonstruksi
    // merkleTreePathRoot() bukan akar yang pernah benar-benar dimiliki pohon
    // eligibility. Ini memicu assert(eligibility.checkRoot(rt), "Anda tidak
    // terdaftar sebagai pemilih pada ballot ini") di ballot.compact.
    const path = sim.getLedger().eligibility.findPathForLeaf(pureCircuits.cred_leaf(CRED_A));
    if (path === undefined) throw new Error("setup uji gagal: path CRED_A tidak ditemukan");
    const pathRusak = {
      leaf: path.leaf,
      path: path.path.map((entri, i) =>
        i === 0 ? { ...entri, sibling: { field: entri.sibling.field + 1n } } : entri,
      ),
    };
    expect(() =>
      sim.castVoteWithRawPrivateState({
        credential: CRED_A,
        option: 0n,
        salt: SALT_1,
        eligibilityPath: pathRusak,
      }),
    ).toThrow();
  });

  it("credential yang sama tidak bisa mencoblos dua kali", () => {
    const sim = siap();
    sim.castVote(CRED_A, 0, SALT_1);
    expect(() => sim.castVote(CRED_A, 1, SALT_2)).toThrow();
  });

  it("credential berbeda dapat mencoblos masing-masing sekali", () => {
    const sim = siap();
    sim.castVote(CRED_A, 0, SALT_1);
    sim.castVote(CRED_B, 1, SALT_2);
    expect(sim.getLedger().voteCount).toBe(2n);
  });

  it("pilihan di luar optionCount ditolak", () => {
    const sim = siap();
    expect(() => sim.castVote(CRED_A, 3, SALT_1)).toThrow();
  });

  it("ledger tidak memuat jejak pilihan apa pun setelah mencoblos", () => {
    const a = siap();
    a.castVote(CRED_A, 0, SALT_1);
    const b = siap();
    b.castVote(CRED_A, 1, SALT_1);
    // Satu-satunya yang berbeda adalah commitment; nullifier dan hitungan identik.
    expect(hex(pureCircuits.vote_nullifier(a.ballotNonce, CRED_A))).toBe(
      hex(pureCircuits.vote_nullifier(b.ballotNonce, CRED_A)),
    );
    expect(a.getLedger().voteCount).toBe(b.getLedger().voteCount);
  });

  it("pendaftaran ditutup setelah suara pertama", () => {
    const sim = siap();
    sim.castVote(CRED_A, 0, SALT_1);
    expect(() => sim.registerVoters([bytes32(0x44)])).toThrow();
  });
});

describe("ballot.compact — deadline", () => {
  const CRED_A = bytes32(0x11);
  const SALT_1 = bytes32(0xa1);
  // Detik sejak epoch Unix, BUKAN milidetik — lihat catatan pada konstanta
  // `HARI` di ballot-simulator.ts (Task 5). Besaran ~1.8e9 di sini murni
  // fiksi uji (kira-kira tahun 2027); yang penting hanyalah konsisten dengan
  // satuan yang dipakai setBlockTime dan default konstruktor ballot — bukan
  // representasi waktu sungguhan.
  const SEKARANG = 1_800_000_000n;

  it("menolak suara setelah voteDeadline lewat", () => {
    const sim = new BallotSimulator({
      eligibleCount: 4,
      voteDeadline: SEKARANG + 1000n,
      tallyDeadline: SEKARANG + 5000n,
    });
    sim.setBlockTime(SEKARANG);
    sim.registerVoters([CRED_A]);
    sim.setBlockTime(SEKARANG + 2000n);
    expect(() => sim.castVote(CRED_A, 0, SALT_1)).toThrow();
  });

  it("menerima suara sebelum voteDeadline", () => {
    const sim = new BallotSimulator({
      eligibleCount: 4,
      voteDeadline: SEKARANG + 1000n,
      tallyDeadline: SEKARANG + 5000n,
    });
    sim.setBlockTime(SEKARANG);
    sim.registerVoters([CRED_A]);
    sim.castVote(CRED_A, 0, SALT_1);
    expect(sim.getLedger().voteCount).toBe(1n);
  });

  it("menolak suara tepat saat voteDeadline (batas eksklusif, bukan <=)", () => {
    // kernel.blockTimeLessThan dikonfirmasi empiris (Task 5, probe langsung ke
    // compact-runtime) bersifat strict: true hanya bila waktu blok < deadline.
    // Pada waktu == deadline persis, suara sudah ditolak — bukan diterima.
    const sim = new BallotSimulator({
      eligibleCount: 4,
      voteDeadline: SEKARANG + 1000n,
      tallyDeadline: SEKARANG + 5000n,
    });
    sim.setBlockTime(SEKARANG);
    sim.registerVoters([CRED_A]);
    sim.setBlockTime(SEKARANG + 1000n);
    expect(() => sim.castVote(CRED_A, 0, SALT_1)).toThrow();
  });
});

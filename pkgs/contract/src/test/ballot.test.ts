import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, expect, it } from "vitest";
import {
  credentialFor,
  emptyBallotPrivateState,
  openingFor,
  withCredential,
  withOpening,
} from "../ballot-witnesses.js";
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

describe("ballot.compact — validasi constructor", () => {
  // Seluruh field yang divalidasi di sini bersifat `sealed`. Nilai yang keliru
  // TIDAK PERNAH bisa diperbaiki setelah deploy — satu-satunya jalan keluar
  // adalah men-deploy ballot baru dan meninggalkan yang lama beserta seluruh
  // suara di dalamnya. Karena itu constructor adalah satu-satunya tempat yang
  // masuk akal untuk menolaknya.
  const T = 1_800_000_000n;
  const sah = { voteDeadline: T + 1000n, tallyDeadline: T + 5000n };

  it("menerima konfigurasi yang sah", () => {
    expect(
      () =>
        new BallotSimulator({
          ...sah,
          options: ["Ya", "Tidak"],
          eligibleCount: 8,
          quorumPercent: 50,
        }),
    ).not.toThrow();
  });

  it("menolak optionCount di atas 4 — opsi tanpa label on-chain", () => {
    // Dampaknya nyata, bukan teoretis: dengan nOptions = 8, castVote untuk opsi
    // 7 lolos assert(opsi < optionCount) dan tallies[7] terisi, padahal ledger
    // hanya punya option0..option3. Hasil akhirnya memuat baris yang tidak dapat
    // diberi nama oleh siapa pun yang membaca chain.
    expect(
      () => new BallotSimulator({ ...sah, options: ["Ya", "Tidak"], optionCount: 8 }),
    ).toThrow(/Option count must be between 2 and 4/);
  });

  it("menolak optionCount 0 — ballot tanpa pilihan apa pun", () => {
    expect(() => new BallotSimulator({ ...sah, options: [], optionCount: 0 })).toThrow(
      /Option count must be between 2 and 4/,
    );
  });

  it("menolak optionCount 1 — pilihan tunggal bukan pemungutan suara", () => {
    expect(() => new BallotSimulator({ ...sah, options: ["Ya"], optionCount: 1 })).toThrow(
      /Option count must be between 2 and 4/,
    );
  });

  it("menerima batas bawah dan batas atas optionCount (2 dan 4)", () => {
    expect(
      () => new BallotSimulator({ ...sah, options: ["Ya", "Tidak"], optionCount: 2 }),
    ).not.toThrow();
    expect(
      () => new BallotSimulator({ ...sah, options: ["A", "B", "C", "D"], optionCount: 4 }),
    ).not.toThrow();
  });

  it("menolak tallyDeadline yang sama dengan voteDeadline", () => {
    // Kedua guard tallyVote — blockTime > voteDeadline DAN blockTime <
    // tallyDeadline — tidak pernah benar bersamaan pada ballot semacam ini.
    // Suara masuk, lalu PERMANEN tidak dapat dibuka, sementara finalize tetap
    // berhasil dan menerbitkan ballot final dengan voteCount > 0 dan
    // talliedCount == 0 tanpa satu pun penanda bahwa ballot itu sudah mati.
    expect(
      () => new BallotSimulator({ voteDeadline: T + 1000n, tallyDeadline: T + 1000n }),
    ).toThrow(/Tally deadline must be after the vote deadline/);
  });

  it("menolak tallyDeadline sebelum voteDeadline", () => {
    expect(
      () => new BallotSimulator({ voteDeadline: T + 5000n, tallyDeadline: T + 1000n }),
    ).toThrow(/Tally deadline must be after the vote deadline/);
  });

  it("menerima tallyDeadline satu detik setelah voteDeadline", () => {
    expect(
      () => new BallotSimulator({ voteDeadline: T + 1000n, tallyDeadline: T + 1001n }),
    ).not.toThrow();
  });

  it("menolak eligibleCount 0 — ballot yang tidak bisa dipilih siapa pun", () => {
    expect(() => new BallotSimulator({ ...sah, eligibleCount: 0 })).toThrow(
      /Eligible voter count must be at least 1/,
    );
  });

  it("menolak eligibleCount di atas kapasitas pohon eligibility", () => {
    // eligibleCount = 2000 dulu diterima diam-diam, lalu pendaftaran berjalan
    // sampai daun ke-1024 dan gagal dengan "exceeded structure bounds" dari
    // runtime — galat internal yang tidak menjelaskan apa pun kepada admin.
    expect(() => new BallotSimulator({ ...sah, eligibleCount: 2000 })).toThrow(
      /Eligible voter count exceeds the tree capacity/,
    );
  });

  it("menerima eligibleCount tepat 1024 (kapasitas penuh pohon depth 10)", () => {
    expect(() => new BallotSimulator({ ...sah, eligibleCount: 1024 })).not.toThrow();
  });

  it("menolak quorumPercent di atas 100", () => {
    expect(() => new BallotSimulator({ ...sah, quorumPercent: 200 })).toThrow(
      /Quorum percent cannot exceed 100/,
    );
  });

  it("menerima quorumPercent tepat 100", () => {
    expect(() => new BallotSimulator({ ...sah, quorumPercent: 100 })).not.toThrow();
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

  it("pemisahan domain — admin_pk dan cred_leaf tidak pernah bertabrakan", () => {
    // Pasangan yang paling berisiko dari copy-paste yang ceroboh: keduanya
    // hash Vector<2, Bytes<32>> satu-argumen yang secara struktural nyaris
    // identik (admin_pk(sk) vs cred_leaf(cred)), hanya berbeda di string
    // prefix ("votepriv:pk:v1" vs "votepriv:cred:v1"). Bila prefix itu
    // pernah tertukar atau hilang, admin_pk dan cred_leaf akan bertabrakan
    // untuk input yang sama — sebuah credential bisa disalahartikan sebagai
    // admin key, atau sebaliknya.
    const x = bytes32(0x77);
    expect(hex(pureCircuits.admin_pk(x))).not.toBe(hex(pureCircuits.cred_leaf(x)));
  });

  it("pemisahan domain — vote_nullifier dan vote_commitment tidak pernah bertabrakan", () => {
    // vote_nullifier(nonce, cred) dan vote_commitment(option, salt) tidak
    // punya argumen pertama dengan tipe yang sama (Bytes<32> vs Uint<8>),
    // jadi "input yang sama" didekati dengan menyamakan argumen Bytes<32>
    // yang berbagi posisi (cred/salt) dan memakai nilai "nol" yang setara
    // untuk argumen lain (nonce = bytes32(0) vs option = 0n) — keduanya
    // encode ke elemen Bytes<32> pertama yang sama-sama nol sebelum di-pad
    // dengan prefix domain masing-masing.
    const shared = bytes32(6);
    expect(hex(pureCircuits.vote_nullifier(bytes32(0), shared))).not.toBe(
      hex(pureCircuits.vote_commitment(0n, shared)),
    );
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
    expect(() => sim.registerVoters([CRED_A], bytes32(0xee))).toThrow(
      /Only the admin can register voters/,
    );
  });

  it("melebihi eligibleCount ditolak", () => {
    const sim = new BallotSimulator({ eligibleCount: 2 });
    sim.registerVoters([CRED_A, CRED_B]);
    expect(() => sim.registerVoters([CRED_C])).toThrow(/Registration would exceed the ballot's eligibleCount/);
  });

  it("eligibleCount ditegakkan lintas beberapa batch", () => {
    const sim = new BallotSimulator({ eligibleCount: 3 });
    sim.registerVoters([CRED_A, CRED_B]);
    expect(() => sim.registerVoters([CRED_C, bytes32(0x44)])).toThrow(/Registration would exceed the ballot's eligibleCount/);
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
    expect(() => sim.castVote(ASING, 0, SALT_1)).toThrow(
      /Credential is not in the eligibility tree/,
    );
  });

  it("path milik credential lain ditolak in-circuit (guard kecocokan leaf)", () => {
    const sim = siap();
    // Path ini benar-benar valid — tapi untuk CRED_A. castVoteWithRawPrivateState
    // memasangkannya secara sengaja dengan credential CRED_B, sesuatu yang tidak
    // bisa terjadi lewat castVote() biasa karena castVote() selalu menyusun path
    // yang konsisten dengan credential yang diberikan. Ini memicu
    // assert(disclose(path.leaf == daun), "Merkle path does not belong to this credential")
    // di ballot.compact, bukan guard simulator manapun.
    const path = sim.getLedger().eligibility.findPathForLeaf(pureCircuits.cred_leaf(CRED_A));
    if (path === undefined) throw new Error("setup uji gagal: path CRED_A tidak ditemukan");
    expect(() =>
      sim.castVoteWithRawPrivateState({
        credential: CRED_B,
        opening: { option: 0n, salt: SALT_1 },
        eligibilityPath: path,
      }),
    ).toThrow(/Merkle path does not belong to this credential/);
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
        opening: { option: 0n, salt: SALT_1 },
        eligibilityPath: pathRusak,
      }),
    ).toThrow(/Credential is not registered on this ballot/);
  });

  it("credential yang sama tidak bisa mencoblos dua kali", () => {
    const sim = siap();
    sim.castVote(CRED_A, 0, SALT_1);
    expect(() => sim.castVote(CRED_A, 1, SALT_2)).toThrow(/Credential has already voted/);
  });

  it("credential berbeda dapat mencoblos masing-masing sekali", () => {
    const sim = siap();
    sim.castVote(CRED_A, 0, SALT_1);
    sim.castVote(CRED_B, 1, SALT_2);
    expect(sim.getLedger().voteCount).toBe(2n);
  });

  it("pilihan di luar optionCount ditolak", () => {
    const sim = siap();
    expect(() => sim.castVote(CRED_A, 3, SALT_1)).toThrow(/Option is out of range/);
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
    expect(() => sim.registerVoters([bytes32(0x44)])).toThrow(
      /Registration is closed once the first vote is cast/,
    );
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
    expect(() => sim.castVote(CRED_A, 0, SALT_1)).toThrow(
      /Vote deadline has passed/,
    );
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
    expect(() => sim.castVote(CRED_A, 0, SALT_1)).toThrow(
      /Vote deadline has passed/,
    );
  });
});

describe("ballot.compact — tallyVote", () => {
  const CRED_A = bytes32(0x11);
  const CRED_B = bytes32(0x22);
  const SALT_1 = bytes32(0xa1);
  const SALT_2 = bytes32(0xa2);

  const setelahDuaSuara = () => {
    const sim = new BallotSimulator({ eligibleCount: 4, options: ["Ya", "Tidak"] });
    sim.registerVoters([CRED_A, CRED_B]);
    sim.castVote(CRED_A, 0, SALT_1);
    sim.castVote(CRED_B, 0, SALT_2);
    sim.majuKeFaseTally();
    return sim;
  };

  it("membuka satu suara menambah hitungan opsi yang benar", () => {
    const sim = setelahDuaSuara();
    sim.tallyVote(0, SALT_1);
    expect(sim.tally(0)).toBe(1n);
    expect(sim.tally(1)).toBe(0n);
    expect(sim.getLedger().talliedCount).toBe(1n);
  });

  it("dua suara terbuka terhitung dua", () => {
    const sim = setelahDuaSuara();
    sim.tallyVote(0, SALT_1);
    sim.tallyVote(0, SALT_2);
    expect(sim.tally(0)).toBe(2n);
    expect(sim.getLedger().talliedCount).toBe(2n);
  });

  it("salt yang sama tidak bisa dibuka dua kali", () => {
    const sim = setelahDuaSuara();
    sim.tallyVote(0, SALT_1);
    expect(() => sim.tallyVote(0, SALT_1)).toThrow(/Vote has already been opened/);
  });

  it("membuka dengan pilihan yang tidak sesuai commitment ditolak", () => {
    // Ini menguji guard di simulator (findPathForLeaf mengembalikan undefined untuk
    // commitment yang salah, sehingga tallyVote() menolak sebelum circuit sempat
    // dipanggil), bukan guard di dalam circuit itu sendiri — pola yang sama dengan
    // "credential yang tidak terdaftar ditolak" pada castVote (Task 4). Lihat
    // "pilihan yang tidak cocok dengan path ditolak in-circuit" di bawah untuk uji
    // yang benar-benar memicu cabang gagal assert path.leaf == c di dalam tallyVote.
    const sim = setelahDuaSuara();
    // Commitment mengikat (pilihan, salt); mengaku memilih 1 dengan SALT_1
    // menghasilkan commitment yang tidak ada di pohon.
    expect(() => sim.tallyVote(1, SALT_1)).toThrow(/Commitment is not in the tree/);
  });

  it("salt yang tidak pernah dipakai memilih ditolak", () => {
    // Sama seperti di atas: findPathForLeaf tidak menemukan commitment untuk salt
    // yang tidak pernah dipakai memilih, jadi ini juga guard simulator, bukan guard
    // di dalam circuit.
    const sim = setelahDuaSuara();
    expect(() => sim.tallyVote(0, bytes32(0xf0))).toThrow(/Commitment is not in the tree/);
  });

  it("pilihan yang tidak cocok dengan path ditolak in-circuit (guard kecocokan leaf)", () => {
    const sim = setelahDuaSuara();
    // Path ini benar-benar valid — untuk commitment (opsi 0, SALT_1).
    // tallyVoteWithRawPrivateState memasangkannya secara sengaja dengan opsi 1,
    // sesuatu yang tidak bisa terjadi lewat tallyVote() biasa karena tallyVote()
    // selalu menyusun path dari commitment (opsi, salt) yang sama persis dengan
    // yang diberikan. Ini memicu
    // assert(disclose(path.leaf == c), "Merkle path does not belong to this commitment")
    // di ballot.compact, bukan guard simulator manapun.
    const c = pureCircuits.vote_commitment(0n, SALT_1);
    const path = sim.getLedger().commitments.findPathForLeaf(c);
    if (path === undefined) throw new Error("setup uji gagal: path commitment tidak ditemukan");
    expect(() =>
      sim.tallyVoteWithRawPrivateState({
        opening: { option: 1n, salt: SALT_1 },
        commitmentPath: path,
      }),
    ).toThrow(/Merkle path does not belong to this commitment/);
  });

  it("path dengan sibling yang diubah ditolak in-circuit (guard checkRoot)", () => {
    const sim = setelahDuaSuara();
    // opsi dan salt tetap cocok dengan path.leaf (lolos guard kecocokan leaf), tapi
    // satu sibling di dalam path diubah sehingga akar yang direkonstruksi
    // merkleTreePathRoot() bukan akar yang pernah benar-benar dimiliki pohon
    // commitments. Ini memicu assert(commitments.checkRoot(rt), "Commitment tidak
    // ditemukan pada ballot ini") di ballot.compact.
    const c = pureCircuits.vote_commitment(0n, SALT_1);
    const path = sim.getLedger().commitments.findPathForLeaf(c);
    if (path === undefined) throw new Error("setup uji gagal: path commitment tidak ditemukan");
    const pathRusak = {
      leaf: path.leaf,
      path: path.path.map((entri, i) =>
        i === 0 ? { ...entri, sibling: { field: entri.sibling.field + 1n } } : entri,
      ),
    };
    expect(() =>
      sim.tallyVoteWithRawPrivateState({
        opening: { option: 0n, salt: SALT_1 },
        commitmentPath: pathRusak,
      }),
    ).toThrow(/Commitment not found on this ballot/);
  });

  it("tidak bisa membuka sebelum voteDeadline lewat (guard deadline, bukan guard fase)", () => {
    // Judul lama menyebut "fase". Itu keliru: yang menembak di sini adalah
    // assert kernel.blockTimeGreaterThan(voteDeadline) — waktu blok belum
    // dimajukan sama sekali. Pencocokan pesan di bawah yang membuktikannya,
    // dan itu pula yang akan menangkap kesalahan pelabelan seperti ini
    // berikutnya.
    const sim = new BallotSimulator({ eligibleCount: 4 });
    sim.registerVoters([CRED_A]);
    sim.castVote(CRED_A, 0, SALT_1);
    expect(() => sim.tallyVote(0, SALT_1)).toThrow(/Voting is still open/);
  });

  it("tidak bisa mencoblos lagi setelah voteDeadline lewat (fase masih voting)", () => {
    // Judul lama menyebut "setelah fase tally dimulai" — keliru dua kali.
    // setelahDuaSuara() hanya memajukan waktu blok; belum ada satu pun suara
    // yang dibuka, jadi phase MASIH `voting` pada titik ini (dipastikan oleh
    // assertion di bawah). Yang menolak adalah assert deadline castVote.
    const sim = setelahDuaSuara();
    expect(sim.getLedger().phase).toBe(BallotPhase.voting);
    expect(() => sim.castVote(CRED_A, 0, bytes32(0xb1))).toThrow(
      /Vote deadline has passed/,
    );
  });
});

describe("ballot.compact — finalize", () => {
  it("menolak finalisasi sebelum tallyDeadline lewat", () => {
    // finalizeSekarang() tidak memajukan waktu blok — sim baru dibuat, waktu
    // blok masih jauh sebelum tallyDeadline default (Date.now() + 14 hari).
    // Ini memicu assert kernel.blockTimeGreaterThan(tallyDeadline) di dalam
    // circuit, bukan guard simulator manapun.
    const sim = new BallotSimulator({ eligibleCount: 2, options: ["Ya", "Tidak"] });
    expect(() => sim.finalizeSekarang()).toThrow(/Tally deadline has not passed yet/);
  });

  it("menolak finalisasi dua kali", () => {
    const sim = new BallotSimulator({ eligibleCount: 2, options: ["Ya", "Tidak"] });
    sim.finalize();
    expect(sim.getLedger().phase).toBe(BallotPhase.finalized);
    // Panggilan kedua memajukan waktu blok lagi (tetap lewat tallyDeadline,
    // tidak berubah), tapi kini memicu assert phase != BallotPhase.finalized.
    expect(() => sim.finalize()).toThrow(/Ballot is already finalized/);
  });

  it("dapat difinalisasi walau belum ada satu suara pun yang dibuka (fase masih voting)", () => {
    // Ini adalah bukti langsung bahwa finalize TIDAK mensyaratkan
    // phase == BallotPhase.tallying. Fase hanya berpindah ke tallying lewat
    // pembuka suara pertama (lihat komentar di tallyVote); sebuah ballot yang
    // tidak pernah dibuka satu suara pun harus tetap bisa difinalisasi,
    // bukan macet selamanya di fase voting — jebakan liveness yang sama
    // dengan alasan closeVoting dihapus sebagai circuit terpisah.
    const sim = new BallotSimulator({ eligibleCount: 2, options: ["Ya", "Tidak"] });
    expect(sim.getLedger().phase).toBe(BallotPhase.voting);
    sim.finalize();
    expect(sim.getLedger().phase).toBe(BallotPhase.finalized);
  });

  it("tidak menyentuh registeredCount maupun eligibility", () => {
    // INVARIAN yang didokumentasikan di ballot.compact: registeredCount harus
    // selalu sama dengan jumlah leaf di eligibility. finalize tidak boleh
    // menyentuh keduanya sama sekali.
    const sim = new BallotSimulator({ eligibleCount: 2, options: ["Ya", "Tidak"] });
    sim.registerVoters([bytes32(0x11)]);
    const sebelum = sim.getLedger();
    sim.finalize();
    const sesudah = sim.getLedger();
    expect(sesudah.registeredCount).toBe(sebelum.registeredCount);
    expect(sesudah.eligibility.firstFree()).toBe(sebelum.eligibility.firstFree());
  });
});

describe("ballot.compact — alur penuh tiga pemilih", () => {
  const CRED = [bytes32(0x11), bytes32(0x22), bytes32(0x33)];
  const SALT = [bytes32(0xa1), bytes32(0xa2), bytes32(0xa3)];

  it("menghitung dengan benar dari daftar sampai finalisasi", () => {
    const sim = new BallotSimulator({
      title: "Q4 Community Treasury",
      options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
      eligibleCount: 3,
      quorumPercent: 60,
    });

    sim.registerVoters(CRED);
    expect(sim.getLedger().eligibility.firstFree()).toBe(3n);

    // Dua memilih opsi 0, satu memilih opsi 2.
    sim.castVote(CRED[0], 0, SALT[0]);
    sim.castVote(CRED[1], 2, SALT[1]);
    sim.castVote(CRED[2], 0, SALT[2]);
    expect(sim.getLedger().voteCount).toBe(3n);

    // Selama pemungutan suara, tidak ada hitungan yang bocor: bukan hanya
    // dua opsi ini kebetulan nol, tapi peta tallies itu sendiri masih kosong
    // sama sekali — talliedCount juga nol. Ini adalah bentuk yang bisa
    // dieksekusi dari janji utama aplikasi ini: selama pemungutan suara,
    // chain hanya memuat nullifier dan commitment, tidak ada apa pun lagi.
    expect(sim.tally(0)).toBe(0n);
    expect(sim.tally(2)).toBe(0n);
    expect(sim.getLedger().tallies.isEmpty()).toBe(true);
    expect(sim.getLedger().talliedCount).toBe(0n);

    sim.majuKeFaseTally();
    // Fase masih `voting` sampai ada yang membuka suara pertama — transisinya
    // dilakukan tallyVote secara malas, bukan oleh circuit penutup tersendiri.
    expect(sim.getLedger().phase).toBe(BallotPhase.voting);

    sim.tallyVote(0, SALT[0]);
    expect(sim.getLedger().phase).toBe(BallotPhase.tallying);
    sim.tallyVote(2, SALT[1]);
    sim.tallyVote(0, SALT[2]);

    expect(sim.tally(0)).toBe(2n);
    expect(sim.tally(1)).toBe(0n);
    expect(sim.tally(2)).toBe(1n);
    expect(sim.getLedger().talliedCount).toBe(3n);

    sim.finalize();
    expect(sim.getLedger().phase).toBe(BallotPhase.finalized);
  });

  it("suara yang tidak dibuka tidak terhitung, dan selisihnya terlihat publik", () => {
    const sim = new BallotSimulator({ eligibleCount: 3, options: ["Ya", "Tidak"] });
    sim.registerVoters(CRED);
    sim.castVote(CRED[0], 0, SALT[0]);
    sim.castVote(CRED[1], 0, SALT[1]);
    sim.castVote(CRED[2], 1, SALT[2]);
    sim.majuKeFaseTally();

    sim.tallyVote(0, SALT[0]); // dua lainnya tidak pernah dibuka

    expect(sim.getLedger().voteCount).toBe(3n);
    expect(sim.getLedger().talliedCount).toBe(1n);
    expect(sim.tally(0)).toBe(1n);
  });

  it("tidak bisa membuka suara setelah finalisasi", () => {
    // CATATAN dari fault injection (lihat task-7-report.md): penolakan di sini
    // tidak terisolasi murni ke assert phase != BallotPhase.finalized di
    // tallyVote — finalize() (lewat majuKeFaseFinal()) sudah memajukan waktu
    // blok melewati tallyDeadline sebagai prasyaratnya sendiri, jadi assert
    // blockTimeLessThan(tallyDeadline) tallyVote juga sudah pasti gagal pada
    // titik ini. Uji ini tetap sah dan berharga sebagai uji hasil-akhir
    // (tallyVote memang harus ditolak setelah finalisasi, apa pun alasan
    // persisnya), tapi bukan uji yang mengisolasi guard phase itu sendiri.
    const sim = new BallotSimulator({ eligibleCount: 2, options: ["Ya", "Tidak"] });
    sim.registerVoters([CRED[0], CRED[1]]);
    sim.castVote(CRED[0], 0, SALT[0]);
    sim.majuKeFaseTally();
    sim.finalize();
    expect(sim.getLedger().phase).toBe(BallotPhase.finalized);
    expect(() => sim.tallyVote(0, SALT[0])).toThrow(/Ballot is already finalized/);
  });
});


describe("ballot-witnesses — private state lintas ballot", () => {
  const CRED_A = bytes32(0x11);
  const CRED_B = bytes32(0x22);
  const SALT_A = bytes32(0xa1);
  const SALT_B = bytes32(0xb2);

  it("helper with* tidak menyentuh entri milik ballot lain", () => {
    let ps = emptyBallotPrivateState(bytes32(0));
    ps = withOpening(ps, "ballot-a", { option: 0n, salt: SALT_A });
    ps = withCredential(ps, "ballot-a", CRED_A);
    ps = withOpening(ps, "ballot-b", { option: 1n, salt: SALT_B });
    expect(openingFor(ps, "ballot-a")).toEqual({ option: 0n, salt: SALT_A });
    expect(openingFor(ps, "ballot-b")).toEqual({ option: 1n, salt: SALT_B });
    expect(credentialFor(ps, "ballot-a")).toEqual(CRED_A);
    expect(credentialFor(ps, "ballot-b")).toBeNull();
    expect(openingFor(ps, "ballot-yang-tidak-ada")).toBeNull();
  });

  it("mencoblos di ballot kedua tidak menghancurkan opening ballot pertama", () => {
    // Ini BUKAN skenario penyerang: ini pengguna biasa yang memilih di dua
    // ballot. Dengan private state datar (satu `option`, satu `salt`), coblosan
    // di ballot B menimpa opening milik ballot A dan suara A menjadi PERMANEN
    // tidak dapat dibuka — spec §6.3: opening yang hilang berarti suara hilang.
    const a = new BallotSimulator({ eligibleCount: 4, options: ["Ya", "Tidak"] });
    const b = new BallotSimulator({ eligibleCount: 4, options: ["Ya", "Tidak"] });
    a.registerVoters([CRED_A]);
    b.registerVoters([CRED_B]);

    // SATU blob private state dipakai kedua ballot, persis seperti
    // levelPrivateStateProvider yang berkunci satu BallotPrivateStateId.
    let dompet = emptyBallotPrivateState(bytes32(0));
    dompet = a.castVoteBersama(dompet, CRED_A, 0, SALT_A);
    dompet = b.castVoteBersama(dompet, CRED_B, 1, SALT_B);

    // Kedua opening bertahan, masing-masing di kuncinya sendiri. Nilai ini
    // datang dari witness store_opening, bukan dari yang disiapkan uji.
    expect(openingFor(dompet, a.contractAddress)).toEqual({ option: 0n, salt: SALT_A });
    expect(openingFor(dompet, b.contractAddress)).toEqual({ option: 1n, salt: SALT_B });
    expect(credentialFor(dompet, a.contractAddress)).toEqual(CRED_A);
    expect(credentialFor(dompet, b.contractAddress)).toEqual(CRED_B);

    // Dan inilah yang menentukan: suara di ballot A masih dapat dibuka, dengan
    // opsi dan salt dibaca DARI private state bersama itu sendiri.
    a.majuKeFaseTally();
    dompet = a.tallyVoteBersama(dompet);
    expect(a.tally(0)).toBe(1n);
    expect(a.getLedger().talliedCount).toBe(1n);

    b.majuKeFaseTally();
    b.tallyVoteBersama(dompet);
    expect(b.tally(1)).toBe(1n);
    expect(b.getLedger().talliedCount).toBe(1n);
  });

  it("witness menolak dengan jelas bila ballot yang dipanggil belum punya entri", () => {
    // Private state punya isi — tapi untuk ballot LAIN. Pesan galatnya harus
    // menyebut ballot mana yang kosong, bukan sekadar "credential belum diisi".
    const a = new BallotSimulator({ eligibleCount: 4, options: ["Ya", "Tidak"] });
    a.registerVoters([CRED_A]);
    const path = a.getLedger().eligibility.findPathForLeaf(pureCircuits.cred_leaf(CRED_A));
    if (path === undefined) throw new Error("setup uji gagal: path CRED_A tidak ditemukan");
    expect(() =>
      a.castVoteWithRawPrivateState({
        credential: null,
        opening: { option: 0n, salt: SALT_A },
        eligibilityPath: path,
      }),
    ).toThrow(new RegExp(`credential for ballot ${a.contractAddress} is not set`));
  });
});

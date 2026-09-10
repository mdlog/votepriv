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
    expect(() => sim.tallyVote(0, SALT_1)).toThrow();
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
    expect(() => sim.tallyVote(1, SALT_1)).toThrow();
  });

  it("salt yang tidak pernah dipakai memilih ditolak", () => {
    // Sama seperti di atas: findPathForLeaf tidak menemukan commitment untuk salt
    // yang tidak pernah dipakai memilih, jadi ini juga guard simulator, bukan guard
    // di dalam circuit.
    const sim = setelahDuaSuara();
    expect(() => sim.tallyVote(0, bytes32(0xf0))).toThrow();
  });

  it("pilihan yang tidak cocok dengan path ditolak in-circuit (guard kecocokan leaf)", () => {
    const sim = setelahDuaSuara();
    // Path ini benar-benar valid — untuk commitment (opsi 0, SALT_1).
    // tallyVoteWithRawPrivateState memasangkannya secara sengaja dengan opsi 1,
    // sesuatu yang tidak bisa terjadi lewat tallyVote() biasa karena tallyVote()
    // selalu menyusun path dari commitment (opsi, salt) yang sama persis dengan
    // yang diberikan. Ini memicu
    // assert(disclose(path.leaf == c), "Merkle path bukan untuk commitment ini")
    // di ballot.compact, bukan guard simulator manapun.
    const c = pureCircuits.vote_commitment(0n, SALT_1);
    const path = sim.getLedger().commitments.findPathForLeaf(c);
    if (path === undefined) throw new Error("setup uji gagal: path commitment tidak ditemukan");
    expect(() =>
      sim.tallyVoteWithRawPrivateState({
        option: 1n,
        salt: SALT_1,
        commitmentPath: path,
      }),
    ).toThrow();
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
        option: 0n,
        salt: SALT_1,
        commitmentPath: pathRusak,
      }),
    ).toThrow();
  });

  it("tidak bisa membuka selagi masih fase pemungutan suara", () => {
    const sim = new BallotSimulator({ eligibleCount: 4 });
    sim.registerVoters([CRED_A]);
    sim.castVote(CRED_A, 0, SALT_1);
    expect(() => sim.tallyVote(0, SALT_1)).toThrow();
  });

  it("tidak bisa mencoblos lagi setelah fase tally dimulai", () => {
    const sim = setelahDuaSuara();
    expect(() => sim.castVote(CRED_A, 0, bytes32(0xb1))).toThrow();
  });
});

describe("ballot.compact — finalize", () => {
  it("menolak finalisasi sebelum tallyDeadline lewat", () => {
    // finalizeSekarang() tidak memajukan waktu blok — sim baru dibuat, waktu
    // blok masih jauh sebelum tallyDeadline default (Date.now() + 14 hari).
    // Ini memicu assert kernel.blockTimeGreaterThan(tallyDeadline) di dalam
    // circuit, bukan guard simulator manapun.
    const sim = new BallotSimulator({ eligibleCount: 2, options: ["Ya", "Tidak"] });
    expect(() => sim.finalizeSekarang()).toThrow();
  });

  it("menolak finalisasi dua kali", () => {
    const sim = new BallotSimulator({ eligibleCount: 2, options: ["Ya", "Tidak"] });
    sim.finalize();
    expect(sim.getLedger().phase).toBe(BallotPhase.finalized);
    // Panggilan kedua memajukan waktu blok lagi (tetap lewat tallyDeadline,
    // tidak berubah), tapi kini memicu assert phase != BallotPhase.finalized.
    expect(() => sim.finalize()).toThrow();
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
    expect(() => sim.tallyVote(0, SALT[0])).toThrow();
  });
});

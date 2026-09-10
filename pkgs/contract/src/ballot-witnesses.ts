import type { MerkleTreePath, WitnessContext } from "@midnight-ntwrk/compact-runtime";

/**
 * SATU id untuk SELURUH ballot — dan itu memang disengaja.
 *
 * KOREKSI (review cabang penuh): komentar ini sebelumnya mengklaim bahwa
 * midnight-js "mengunci private state provider pada id ini, jadi seluruh
 * ballot berbagi satu blob penyimpanan". Itu SALAH, diverifikasi langsung
 * terhadap @midnight-ntwrk/midnight-js-level-private-state-provider 4.0.4
 * yang terpasang (src/level-private-state-provider.ts, `getScopedKey`):
 * kunci penyimpanan sesungguhnya adalah `${contractAddress}:${privateStateId}`
 * — ALAMAT KONTRAK ikut jadi bagian kunci, bukan hanya id ini — sehingga
 * setiap ballot (alamat berbeda) sudah mendapat ENTRI TERPISAH di LevelDB
 * dengan sendirinya, walau `privateStateId`-nya sama persis untuk semuanya.
 * Ini yang benar, dan cocok dengan catatan `setContractAddress` di vote.ts
 * (siapkanPemilih): "level provider menyusun kuncinya sebagai
 * `${contractAddress}:${privateStateId}`" — vote.ts sudah benar; komentar
 * inilah yang salah dan sudah dikoreksi.
 *
 * Yang menentukan aman atau tidaknya beberapa ballot memakai id yang sama
 * KARENA ITU bukan bentuk isi blob-nya (provider sudah memisahkan blob per
 * ballot sendiri, terlepas dari bentuk isinya) — melainkan supaya
 * `BallotPrivateState` yang dibaca `psp.get(BallotPrivateStateId)` tetap
 * MENYATAKAN SENDIRI ballot mana yang dimilikinya, sesuai spec §8: setiap
 * field selain `secretKey` adalah map berkunci alamat kontrak ballot (lihat
 * `BallotPrivateState` di bawah), bukan field datar. Ini penting justru
 * karena satu penyimpan (satu direktori LevelDB) BOLEH dipakai admin yang
 * sama untuk lebih dari satu ballot yang ia buat (lihat komentar
 * `rakitProvidersBallot`/`namaStore` di pkgs/cli/src/deploy-ballot.ts) —
 * dan bila kelak satu proses memegang dua `BallotPrivateState` dari dua
 * ballot berbeda sekaligus (mis. digabung di kode aplikasi, bukan providers
 * yang menggabungkannya), field datar `option`/`salt` tidak menyatakan
 * ballot mana pemiliknya: menimpa satu variabel `option` datar dengan nilai
 * ballot B menghancurkan (secara LOGIS, di level aplikasi, bukan di level
 * penyimpanan) opening ballot A yang sedang dipegang bersamaan, dan suara A
 * jadi permanen tidak dapat dibuka (spec §6.3: opening hilang = suara
 * hilang). Map berkunci alamat menutup celah itu di level TIPE: nilai
 * ballot A dan ballot B tidak pernah menempati slot yang sama walau berada
 * di objek JS yang sama.
 */
export const BallotPrivateStateId = "votePrivBallot" as const;

/**
 * Pembukaan satu suara: pasangan (opsi, salt) yang mengikat satu commitment.
 * Disimpan sebagai satu record karena keduanya memang atomik — commitment adalah
 * hash dari keduanya sekaligus, jadi salt tanpa opsi (atau sebaliknya) tidak
 * pernah bisa membuka apa pun.
 */
export type BallotOpening = {
  readonly option: bigint;
  readonly salt: Uint8Array;
};

/**
 * Bentuk private state VotePriv, sesuai spec §8 ("Bentuk private state").
 *
 * Setiap field selain `secretKey` adalah map BERKUNCI ALAMAT KONTRAK BALLOT.
 * `secretKey` sengaja tetap datar: ia identitas admin, bukan nilai per-ballot —
 * satu orang memakai kunci yang sama untuk seluruh ballot yang ia buat.
 *
 * Kuncinya adalah `ContractAddress` APA ADANYA seperti yang dilaporkan runtime
 * lewat `WitnessContext.contractAddress`. Penyimpan (adapter Plan C) WAJIB
 * memakai bentuk string yang sama persis saat menulis, atau pembacaan witness
 * akan meleset dan suara tampak hilang. Pakai helper `with*` di bawah, jangan
 * menyusun map-nya sendiri.
 */
export type BallotPrivateState = {
  /** Kunci rahasia admin; menentukan adminKey saat deploy. Bukan nilai per-ballot. */
  readonly secretKey: Uint8Array;
  /** alamat ballot -> credential voter pada ballot itu. */
  readonly credentials: Record<string, Uint8Array>;
  /** alamat ballot -> opening yang dipakai castVote lalu tallyVote. */
  readonly openings: Record<string, BallotOpening>;
  /** alamat ballot -> Merkle path menuju daun eligibility, disusun klien dari state on-chain. */
  readonly eligibilityPaths: Record<string, MerkleTreePath<Uint8Array>>;
  /** alamat ballot -> Merkle path menuju commitment, disusun klien saat fase tally. */
  readonly commitmentPaths: Record<string, MerkleTreePath<Uint8Array>>;
};

export const emptyBallotPrivateState = (secretKey: Uint8Array): BallotPrivateState => ({
  secretKey,
  credentials: {},
  openings: {},
  eligibilityPaths: {},
  commitmentPaths: {},
});

// ── Penulis: satu-satunya cara yang benar mengisi state per-ballot ──────────
// Semuanya murni dan tidak memvalidasi apa pun. Tidak satu pun menyentuh entri
// milik ballot lain — itulah keseluruhan poin perbaikan ini.

export const withCredential = (
  ps: BallotPrivateState,
  ballot: string,
  credential: Uint8Array,
): BallotPrivateState => ({
  ...ps,
  credentials: { ...ps.credentials, [ballot]: credential },
});

export const withOpening = (
  ps: BallotPrivateState,
  ballot: string,
  opening: BallotOpening,
): BallotPrivateState => ({
  ...ps,
  openings: { ...ps.openings, [ballot]: opening },
});

export const withEligibilityPath = (
  ps: BallotPrivateState,
  ballot: string,
  path: MerkleTreePath<Uint8Array>,
): BallotPrivateState => ({
  ...ps,
  eligibilityPaths: { ...ps.eligibilityPaths, [ballot]: path },
});

export const withCommitmentPath = (
  ps: BallotPrivateState,
  ballot: string,
  path: MerkleTreePath<Uint8Array>,
): BallotPrivateState => ({
  ...ps,
  commitmentPaths: { ...ps.commitmentPaths, [ballot]: path },
});

// ── Pembaca: dipakai UI untuk tahu apakah masih ada suara yang bisa dibuka ──

export const credentialFor = (ps: BallotPrivateState, ballot: string): Uint8Array | null =>
  ps.credentials[ballot] ?? null;

export const openingFor = (ps: BallotPrivateState, ballot: string): BallotOpening | null =>
  ps.openings[ballot] ?? null;

/**
 * Context witness yang sebenarnya dari runtime. Yang penting di sini:
 * `contractAddress`. Witness tidak menerima identitas ballot sebagai argumen —
 * tidak satu pun dari ketujuh witness di ballot.compact punya parameter untuk
 * itu, dan menambahkannya berarti mengubah antarmuka circuit. Runtime sendiri
 * yang menyediakannya: kode yang dihasilkan compactc memanggil
 * `createWitnessContext(ledger, privateState, context.currentQueryContext.address)`
 * sebelum SETIAP pemanggilan witness, jadi alamat kontrak yang sedang berjalan
 * selalu tersedia — tanpa kunci yang harus disetel pemanggil lebih dulu dan
 * tanpa id private state per-instance.
 *
 * Ledger sengaja `unknown`: lapisan ini tidak boleh membaca state publik untuk
 * memutuskan apa pun.
 */
type Ctx = WitnessContext<unknown, BallotPrivateState>;

const need = <T>(v: T | null, nama: string, ballot: string): T => {
  if (v === null) {
    throw new Error(`${nama} untuk ballot ${ballot} belum diisi di private state`);
  }
  return v;
};

const lihat = <T>(peta: Record<string, T>, ballot: string): T | null => peta[ballot] ?? null;

/**
 * Penyimpan lokal yang bodoh. Tidak memvalidasi aturan apa pun —
 * seluruh aturan ditegakkan assert di dalam circuit.
 *
 * Satu-satunya "kepintaran" di sini adalah memilih entri milik ballot yang
 * sedang dipanggil, dan itu bukan aturan: itu penyimpanan yang berkunci benar.
 */
export const ballotWitnesses = {
  admin_secret_key: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.secretKey,
  ],
  voter_credential: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    need(lihat(ctx.privateState.credentials, ctx.contractAddress), "credential", ctx.contractAddress),
  ],
  get_my_option: (ctx: Ctx): [BallotPrivateState, bigint] => [
    ctx.privateState,
    need(lihat(ctx.privateState.openings, ctx.contractAddress), "opening", ctx.contractAddress).option,
  ],
  get_my_salt: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    need(lihat(ctx.privateState.openings, ctx.contractAddress), "opening", ctx.contractAddress).salt,
  ],
  eligibility_path: (ctx: Ctx): [BallotPrivateState, MerkleTreePath<Uint8Array>] => [
    ctx.privateState,
    need(
      lihat(ctx.privateState.eligibilityPaths, ctx.contractAddress),
      "eligibilityPath",
      ctx.contractAddress,
    ),
  ],
  commitment_path: (ctx: Ctx): [BallotPrivateState, MerkleTreePath<Uint8Array>] => [
    ctx.privateState,
    need(
      lihat(ctx.privateState.commitmentPaths, ctx.contractAddress),
      "commitmentPath",
      ctx.contractAddress,
    ),
  ],
  store_opening: (ctx: Ctx, option: bigint, salt: Uint8Array): [BallotPrivateState, []] => [
    withOpening(ctx.privateState, ctx.contractAddress, { option, salt }),
    [],
  ],
};

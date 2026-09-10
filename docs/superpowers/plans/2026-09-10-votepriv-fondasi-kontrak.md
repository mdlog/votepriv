# VotePriv — Rencana Implementasi A: Fondasi Kontrak

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: gunakan superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`).

**Goal:** Menghasilkan dua kontrak Compact untuk VotePriv — `registry.compact` dan `ballot.compact` — yang terkompilasi dan lulus uji simulator, mencakup eligibility ber-Merkle, pemungutan suara dua fase, dan penegakan deadline.

**Architecture:** Monorepo pnpm dengan `pkgs/contract` sebagai paket pertama. Satu kontrak registry menyimpan daftar alamat ballot; satu kontrak per ballot menyimpan metadata ter-seal, pohon eligibility, nullifier, commitment, dan tally. Seluruh aturan ditegakkan `assert` di dalam circuit; lapisan witness TypeScript hanyalah penyimpan lokal. Pengujian memakai simulator `@midnight-ntwrk/compact-runtime` yang mengeksekusi circuit langsung tanpa proof server.

**Tech Stack:** Compact (compactc 0.31.1), `@midnight-ntwrk/compact-runtime` 0.15.0, TypeScript 5.6+, Vitest, pnpm workspaces, Node 22.

**Spec:** [`docs/superpowers/specs/2026-09-10-votepriv-midnight-design.md`](../specs/2026-09-10-votepriv-midnight-design.md)

## Global Constraints

- Nama witness dan circuit memakai `snake_case`, persis seperti tertulis di spec §5.2 dan §5.5–5.7.
- Setiap hash wajib memakai prefiks domain dari tabel spec §5.3. Jangan pernah memakai satu prefiks untuk dua keperluan.
- Kedalaman Merkle tree adalah `10` untuk `eligibility` maupun `commitments`.
- Nilai yang berasal dari witness maupun argumen circuit wajib dibungkus `disclose()` sebelum ditulis ke ledger atau dipakai dalam `assert`.
- Lapisan witness TypeScript tidak boleh memvalidasi aturan apa pun. Seluruh aturan hidup di dalam circuit.
- Pesan `assert` ditulis dalam bahasa Indonesia agar langsung terbaca pengguna saat transaksi ditolak.
- Node ≥ 22.15. pnpm 10.4.1. Jangan memakai bun — repo ini sudah memakai pnpm dengan lockfile dan patch `wouter`.
- Setiap commit memakai Conventional Commits (`feat:`, `test:`, `chore:`, `fix:`).

## Empat penyesuaian terhadap spec

Ditemukan saat menyusun rencana ini. Semuanya menurunkan risiko, dan dicatat di sini agar dapat ditelusuri.

1. **Seluruh pendaftaran voter lewat `registerVoters`, bukan constructor.** Spec §5.4 menyebut jalur ini sebagai rencana mundur; rencana ini mengangkatnya jadi jalur utama. Constructor jadi tidak perlu mengulang (`for`) di dalamnya, dan tidak perlu argumen `Vector<16, Bytes<32>>`. Biayanya satu transaksi tambahan saat membuat ballot.
2. **`eligibility` memakai `HistoricMerkleTree`, bukan `MerkleTree`.** Bila admin mendaftarkan voter dalam beberapa batch, root berubah di antara batch. `HistoricMerkleTree.checkRoot()` menerima root lama, sehingga path yang disusun voter sebelum batch terakhir tetap sah. `commitments` tetap `MerkleTree` biasa karena pohon itu sudah beku saat fase tally dimulai.
3. **Tidak ada circuit penutup pemungutan suara.** Perpindahan fase `voting` ke `tallying` dilakukan `tallyVote` secara malas saat suara pertama dibuka. Circuit penutup tersendiri akan menciptakan jebakan liveness: bila tidak ada yang memanggilnya, suara tidak pernah bisa dibuka sama sekali. Fase karenanya tetap `voting` selama jeda antara `voteDeadline` dan pembukaan pertama — tampilan membacanya sebagai "menunggu pembukaan" dengan membandingkan waktu terhadap `voteDeadline`.
4. **Pendaftaran tertutup begitu suara pertama masuk** (`assert(voteCount.read() == 0)`), lebih ketat daripada "sebelum `voteDeadline`" di spec. Daftar pemilih karenanya tidak bisa berubah setelah pemungutan suara berjalan.

## Peta berkas

| Berkas | Tanggung jawab |
|---|---|
| `pnpm-workspace.yaml` | Mendaftarkan `pkgs/*` sebagai workspace |
| `package.json` (root) | Skrip perantara `contract`, `app`, `cli` |
| `pkgs/contract/package.json` | Skrip `compact`, `build`, `test` |
| `pkgs/contract/tsconfig.json` | Konfigurasi TypeScript paket kontrak |
| `pkgs/contract/vitest.config.ts` | Konfigurasi Vitest (node, `**/*.test.ts`) |
| `pkgs/contract/src/registry.compact` | Kontrak direktori ballot |
| `pkgs/contract/src/ballot.compact` | Kontrak satu ballot |
| `pkgs/contract/src/registry-witnesses.ts` | Private state registry (kosong) |
| `pkgs/contract/src/ballot-witnesses.ts` | Private state ballot + implementasi witness |
| `pkgs/contract/src/index.ts` | Titik ekspor paket |
| `pkgs/contract/src/test/registry-simulator.ts` | Harness simulator registry |
| `pkgs/contract/src/test/ballot-simulator.ts` | Harness simulator ballot |
| `pkgs/contract/src/test/registry.test.ts` | Uji registry |
| `pkgs/contract/src/test/ballot.test.ts` | Uji ballot |

`src/managed/` dihasilkan compiler dan tidak ditulis tangan.

---

### Task 1: Monorepo, toolchain, dan `registry.compact`

Registry adalah kontrak paling sederhana yang kita butuhkan, jadi sekaligus berfungsi sebagai uji asap toolchain. Kalau tugas ini lulus, seluruh rantai — compiler, runtime, simulator, Vitest — sudah terbukti bekerja.

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `pkgs/contract/package.json`
- Create: `pkgs/contract/tsconfig.json`
- Create: `pkgs/contract/vitest.config.ts`
- Create: `pkgs/contract/src/registry.compact`
- Create: `pkgs/contract/src/registry-witnesses.ts`
- Test: `pkgs/contract/src/test/registry-simulator.ts`, `pkgs/contract/src/test/registry.test.ts`

**Interfaces:**
- Produces: `RegistrySimulator` dengan `register(addr: string): Ledger` dan `getLedger(): Ledger`; ledger registry punya `ballots` (iterable of string) dan `count` (bigint).

- [ ] **Step 1: Pastikan versi compiler**

```bash
compact compile --version
```
Catat angkanya. Diharapkan `0.31.1`. Angka ini menentukan `pragma` yang dipakai di Step 5.

- [ ] **Step 2: Buat workspace pnpm**

Buat `pnpm-workspace.yaml`:

```yaml
packages:
  - "pkgs/*"
```

Di `package.json` root, tambahkan skrip perantara ke dalam blok `scripts` yang sudah ada:

```json
    "contract": "pnpm --filter contract",
    "cli": "pnpm --filter cli",
    "app": "pnpm --filter app"
```

- [ ] **Step 3: Buat paket kontrak**

`pkgs/contract/package.json`:

```json
{
  "name": "contract",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "compact": "compact compile src/registry.compact src/managed/registry && compact compile src/ballot.compact src/managed/ballot",
    "compact:registry": "compact compile src/registry.compact src/managed/registry",
    "compact:ballot": "compact compile src/ballot.compact src/managed/ballot",
    "build": "rm -rf dist && tsc --project tsconfig.json && cp -Rf ./src/managed ./dist/managed",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@midnight-ntwrk/compact-runtime": "0.15.0"
  },
  "devDependencies": {
    "@midnight-ntwrk/midnight-js-network-id": "4.0.4",
    "typescript": "5.6.3",
    "vitest": "^2.1.4"
  }
}
```

`pkgs/contract/tsconfig.json`:

```json
{
  "include": ["src/**/*.ts"],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "lib": ["ESNext"],
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "strict": true,
    "noImplicitAny": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  }
}
```

`pkgs/contract/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    extensions: [".ts", ".js"],
    conditions: ["import", "node", "default"],
  },
});
```

Lalu jalankan:

```bash
pnpm install
```

- [ ] **Step 4: Tulis uji yang gagal**

`pkgs/contract/src/test/registry.test.ts`:

```typescript
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, expect, it } from "vitest";
import { RegistrySimulator } from "./registry-simulator.js";

setNetworkId("undeployed");

describe("registry.compact", () => {
  it("mulai kosong", () => {
    const sim = new RegistrySimulator();
    expect(sim.getLedger().count).toBe(0n);
    expect([...sim.getLedger().ballots]).toEqual([]);
  });

  it("mencatat satu alamat ballot", () => {
    const sim = new RegistrySimulator();
    sim.register("0200abcd");
    expect(sim.getLedger().count).toBe(1n);
    expect([...sim.getLedger().ballots]).toEqual(["0200abcd"]);
  });

  it("menaruh alamat terbaru di depan", () => {
    const sim = new RegistrySimulator();
    sim.register("aaaa");
    sim.register("bbbb");
    sim.register("cccc");
    expect(sim.getLedger().count).toBe(3n);
    expect([...sim.getLedger().ballots]).toEqual(["cccc", "bbbb", "aaaa"]);
  });
});
```

`pkgs/contract/src/test/registry-simulator.ts`:

```typescript
import {
  type ChargedState,
  type CircuitContext,
  type EncodedZswapLocalState,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  type Witnesses,
  ledger,
} from "../managed/registry/contract/index.js";
import {
  type RegistryPrivateState,
  emptyRegistryPrivateState,
  registryWitnesses,
} from "../registry-witnesses.js";

/**
 * Simulator registry. Menjalankan impureCircuits langsung, tanpa proof server.
 */
export class RegistrySimulator {
  private readonly contract: Contract<RegistryPrivateState>;
  private readonly contractAddress = sampleContractAddress();
  private privateState: RegistryPrivateState = emptyRegistryPrivateState();
  private zswapState: EncodedZswapLocalState;
  private state: ChargedState;

  constructor() {
    this.contract = new Contract<RegistryPrivateState>(
      registryWitnesses as unknown as Witnesses<RegistryPrivateState>,
    );
    const init = this.contract.initialState(
      createConstructorContext(this.privateState, "0".repeat(64)),
    );
    this.zswapState = init.currentZswapLocalState;
    this.state = init.currentContractState.data;
  }

  private ctx(): CircuitContext<RegistryPrivateState> {
    return createCircuitContext(
      this.contractAddress,
      this.zswapState,
      this.state,
      this.privateState,
    );
  }

  getLedger(): Ledger {
    return ledger(this.state);
  }

  register(addr: string): Ledger {
    const result = this.contract.impureCircuits.register(this.ctx(), addr);
    this.privateState = result.context.currentPrivateState;
    this.zswapState = result.context.currentZswapLocalState;
    this.state = result.context.currentQueryContext.state;
    return ledger(this.state);
  }
}
```

`pkgs/contract/src/registry-witnesses.ts`:

```typescript
/** Registry tidak punya data privat; tipe ini ada agar bentuknya seragam dengan ballot. */
export type RegistryPrivateState = Record<string, never>;

export const RegistryPrivateStateId = "votePrivRegistry" as const;

export const emptyRegistryPrivateState = (): RegistryPrivateState => ({});

/** Tidak ada witness yang dideklarasikan registry.compact. */
export const registryWitnesses = {};
```

- [ ] **Step 5: Tulis kontrak registry**

`pkgs/contract/src/registry.compact`:

```compact
pragma language_version >= 0.23;

import CompactStandardLibrary;

// Alamat kontrak ballot, terbaru di depan.
export ledger ballots: List<Opaque<"string">>;
export ledger count:   Counter;

// Permissionless: siapa pun boleh mendaftarkan ballot yang sudah ia deploy.
// Entri yang tidak resolve ke kontrak ballot yang sah disaring di sisi klien.
export circuit register(addr: Opaque<"string">): [] {
  ballots.pushFront(disclose(addr));
  count.increment(1);
}
```

Bila Step 1 melaporkan versi compiler di bawah `0.31`, ganti baris pragma menjadi `pragma language_version >= 0.16 && <= 0.22;` — kombinasi itulah yang terverifikasi pada compactc 0.30.0.

- [ ] **Step 6: Kompilasi kontrak**

```bash
pnpm contract compact:registry
```
Diharapkan: berhasil, dan `pkgs/contract/src/managed/registry/contract/index.js` terbentuk.

Bila compiler menolak `pragma`, ikuti catatan di Step 5. Bila compiler menolak `List` atau `pushFront`, ganti ledger menjadi `Map<Uint<64>, Opaque<"string">>` dan tubuh circuit menjadi `ballots.insert(disclose(count.read() as Uint<64>), disclose(addr)); count.increment(1);` — lalu sesuaikan uji Step 4 karena urutannya jadi terlama-di-depan.

- [ ] **Step 7: Jalankan uji, pastikan lulus**

```bash
pnpm contract test
```
Diharapkan: 3 uji lulus.

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml package.json pkgs/contract
git commit -m "feat(contract): monorepo pnpm dan kontrak registry ballot"
```

---

### Task 2: Kerangka `ballot.compact` — pure circuit hash dan metadata

Menyiapkan seluruh fungsi hash sebagai `export pure circuit` supaya TypeScript dapat memanggilnya lewat `pureCircuits`. Ini menghilangkan kebutuhan mengimplementasi ulang hashing Compact di sisi klien — sumber kesalahan yang paling mahal pada aplikasi berbasis commitment.

**Files:**
- Create: `pkgs/contract/src/ballot.compact`
- Create: `pkgs/contract/src/ballot-witnesses.ts`
- Test: `pkgs/contract/src/test/ballot-simulator.ts`, `pkgs/contract/src/test/ballot.test.ts`

**Interfaces:**
- Consumes: skrip `compact:ballot` dan konfigurasi Vitest dari Task 1.
- Produces:
  - `pureCircuits.admin_pk(sk: Uint8Array): Uint8Array`
  - `pureCircuits.cred_leaf(cred: Uint8Array): Uint8Array`
  - `pureCircuits.vote_nullifier(nonce: Uint8Array, cred: Uint8Array): Uint8Array`
  - `pureCircuits.vote_commitment(option: bigint, salt: Uint8Array): Uint8Array`
  - `pureCircuits.tally_nullifier(salt: Uint8Array): Uint8Array`
  - `BallotSimulator` dengan `getLedger()`, dan konstruktor `new BallotSimulator(opts?: BallotOpts)`
  - `type BallotPrivateState`, `emptyBallotPrivateState(secretKey)`, `ballotWitnesses`

- [ ] **Step 1: Tulis uji yang gagal**

`pkgs/contract/src/test/ballot.test.ts`:

```typescript
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
```

- [ ] **Step 2: Tulis witness dan harness simulator**

`pkgs/contract/src/ballot-witnesses.ts`:

```typescript
export const BallotPrivateStateId = "votePrivBallot" as const;

export type BallotPrivateState = {
  /** Kunci rahasia admin; menentukan adminKey saat deploy. */
  readonly secretKey: Uint8Array;
  /** Credential voter untuk ballot ini. */
  readonly credential: Uint8Array | null;
  /** Pilihan yang sedang dikerjakan, dipakai castVote lalu tallyVote. */
  readonly option: bigint | null;
  /** Salt pengikat commitment. */
  readonly salt: Uint8Array | null;
  /** Merkle path menuju daun eligibility, disusun klien dari state on-chain. */
  // biome-ignore lint/suspicious/noExplicitAny: bentuk MerkleTreePath berasal dari runtime
  readonly eligibilityPath: any | null;
  /** Merkle path menuju commitment, disusun klien saat fase tally. */
  // biome-ignore lint/suspicious/noExplicitAny: lihat di atas
  readonly commitmentPath: any | null;
};

export const emptyBallotPrivateState = (
  secretKey: Uint8Array,
): BallotPrivateState => ({
  secretKey,
  credential: null,
  option: null,
  salt: null,
  eligibilityPath: null,
  commitmentPath: null,
});

type Ctx = { readonly privateState: BallotPrivateState };

const need = <T>(v: T | null, nama: string): T => {
  if (v === null) throw new Error(`${nama} belum diisi di private state`);
  return v;
};

/**
 * Penyimpan lokal yang bodoh. Tidak memvalidasi aturan apa pun —
 * seluruh aturan ditegakkan assert di dalam circuit.
 */
export const ballotWitnesses = {
  admin_secret_key: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.secretKey,
  ],
  voter_credential: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    need(ctx.privateState.credential, "credential"),
  ],
  get_my_option: (ctx: Ctx): [BallotPrivateState, bigint] => [
    ctx.privateState,
    need(ctx.privateState.option, "option"),
  ],
  get_my_salt: (ctx: Ctx): [BallotPrivateState, Uint8Array] => [
    ctx.privateState,
    need(ctx.privateState.salt, "salt"),
  ],
  // biome-ignore lint/suspicious/noExplicitAny: bentuk MerkleTreePath berasal dari runtime
  eligibility_path: (ctx: Ctx): [BallotPrivateState, any] => [
    ctx.privateState,
    need(ctx.privateState.eligibilityPath, "eligibilityPath"),
  ],
  // biome-ignore lint/suspicious/noExplicitAny: lihat di atas
  commitment_path: (ctx: Ctx): [BallotPrivateState, any] => [
    ctx.privateState,
    need(ctx.privateState.commitmentPath, "commitmentPath"),
  ],
  store_opening: (
    ctx: Ctx,
    option: bigint,
    salt: Uint8Array,
  ): [BallotPrivateState, []] => [{ ...ctx.privateState, option, salt }, []],
};
```

`pkgs/contract/src/test/ballot-simulator.ts`:

```typescript
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
}
```

- [ ] **Step 3: Jalankan uji, pastikan gagal**

```bash
pnpm contract test
```
Diharapkan: GAGAL dengan `Cannot find module '../managed/ballot/contract/index.js'`.

- [ ] **Step 4: Tulis kontrak ballot**

`pkgs/contract/src/ballot.compact`:

```compact
pragma language_version >= 0.23;

import CompactStandardLibrary;

export enum BallotPhase { voting, tallying, finalized }

// ── Metadata, di-seal saat deploy ────────────────────────────────────────
export sealed ledger title:             Opaque<"string">;
export sealed ledger description:       Opaque<"string">;
export sealed ledger community:         Opaque<"string">;
export sealed ledger option0:           Opaque<"string">;
export sealed ledger option1:           Opaque<"string">;
export sealed ledger option2:           Opaque<"string">;
export sealed ledger option3:           Opaque<"string">;
export sealed ledger optionCount:       Uint<8>;
export sealed ledger voteDeadline:      Uint<64>;
export sealed ledger tallyDeadline:     Uint<64>;
export sealed ledger quorumPercent:     Uint<8>;
export sealed ledger eligibleCount:     Uint<64>;
export sealed ledger eligibilityPolicy: Opaque<"string">;
export sealed ledger adminKey:          Bytes<32>;
export sealed ledger ballotNonce:       Bytes<32>;

export ledger phase: BallotPhase;

witness admin_secret_key(): Bytes<32>;

// ── Hash berpemisah domain ───────────────────────────────────────────────
// Semuanya `export pure` agar dapat dipanggil TypeScript lewat pureCircuits,
// sehingga klien tidak perlu mengimplementasi ulang hashing Compact.

export pure circuit admin_pk(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([pad(32, "votepriv:pk:v1"), sk]);
}

export pure circuit cred_leaf(cred: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([pad(32, "votepriv:cred:v1"), cred]);
}

export pure circuit vote_nullifier(nonce: Bytes<32>, cred: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([pad(32, "votepriv:nf:v1"), nonce, cred]);
}

export pure circuit vote_commitment(option: Uint<8>, salt: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "votepriv:vote:v1"),
    (option as Field) as Bytes<32>,
    salt
  ]);
}

export pure circuit tally_nullifier(salt: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([pad(32, "votepriv:tnf:v1"), salt]);
}

// ── Constructor ──────────────────────────────────────────────────────────
constructor(
  t: Opaque<"string">,
  d: Opaque<"string">,
  c: Opaque<"string">,
  o0: Opaque<"string">,
  o1: Opaque<"string">,
  o2: Opaque<"string">,
  o3: Opaque<"string">,
  nOptions: Uint<8>,
  voteDl: Uint<64>,
  tallyDl: Uint<64>,
  quorum: Uint<8>,
  eligible: Uint<64>,
  policy: Opaque<"string">,
  nonce: Bytes<32>
) {
  title             = disclose(t);
  description       = disclose(d);
  community         = disclose(c);
  option0           = disclose(o0);
  option1           = disclose(o1);
  option2           = disclose(o2);
  option3           = disclose(o3);
  optionCount       = disclose(nOptions);
  voteDeadline      = disclose(voteDl);
  tallyDeadline     = disclose(tallyDl);
  quorumPercent     = disclose(quorum);
  eligibleCount     = disclose(eligible);
  eligibilityPolicy = disclose(policy);
  ballotNonce       = disclose(nonce);
  adminKey          = disclose(admin_pk(admin_secret_key()));
  phase             = BallotPhase.voting;
}
```

- [ ] **Step 5: Kompilasi dan jalankan uji**

```bash
pnpm contract compact:ballot && pnpm contract test
```
Diharapkan: kompilasi berhasil, seluruh uji Task 1 dan Task 2 lulus.

Bila compiler menolak `sealed` pada `Opaque<"string">`, hapus kata kunci `sealed` dari ketujuh field string tersebut — nilainya tetap hanya ditulis di constructor, jadi perilakunya tidak berubah, hanya jaminan compile-time-nya yang hilang. Catat penyimpangan ini di komentar kontrak.

- [ ] **Step 6: Commit**

```bash
git add pkgs/contract/src/ballot.compact pkgs/contract/src/ballot-witnesses.ts pkgs/contract/src/test pkgs/contract/src/managed
git commit -m "feat(contract): metadata ballot dan pure circuit hash berpemisah domain"
```

---

### Task 3: Pohon eligibility dan `registerVoters`

**Files:**
- Modify: `pkgs/contract/src/ballot.compact`
- Modify: `pkgs/contract/src/test/ballot-simulator.ts`
- Test: `pkgs/contract/src/test/ballot.test.ts`

**Interfaces:**
- Consumes: `pureCircuits.cred_leaf`, `pureCircuits.admin_pk` dari Task 2.
- Produces: `BallotSimulator.registerVoters(creds: Uint8Array[], sebagai?: Uint8Array): Ledger`; ledger bertambah `eligibility` (HistoricMerkleTree) dan `voteCount` (Counter).

- [ ] **Step 1: Tambahkan method simulator**

Tambahkan ke `BallotSimulator` di `pkgs/contract/src/test/ballot-simulator.ts`:

```typescript
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
```

- [ ] **Step 2: Tulis uji yang gagal**

Tambahkan ke `pkgs/contract/src/test/ballot.test.ts`:

```typescript
describe("ballot.compact — pendaftaran eligibility", () => {
  const CRED_A = bytes32(0x11);
  const CRED_B = bytes32(0x22);
  const CRED_C = bytes32(0x33);

  it("admin dapat mendaftarkan voter", () => {
    const sim = new BallotSimulator({ eligibleCount: 8 });
    sim.registerVoters([CRED_A, CRED_B]);
    expect(sim.getLedger().eligibility.firstFree).toBe(2n);
  });

  it("pendaftaran dapat dilakukan bertahap", () => {
    const sim = new BallotSimulator({ eligibleCount: 8 });
    sim.registerVoters([CRED_A]);
    sim.registerVoters([CRED_B, CRED_C]);
    expect(sim.getLedger().eligibility.firstFree).toBe(3n);
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
```

- [ ] **Step 3: Jalankan uji, pastikan gagal**

```bash
pnpm contract test
```
Diharapkan: GAGAL — `registerVoters` belum ada pada `impureCircuits`.

- [ ] **Step 4: Tambahkan ledger dan circuit**

Di `pkgs/contract/src/ballot.compact`, tambahkan setelah `export ledger phase`:

```compact
// ── Eligibility ──────────────────────────────────────────────────────────
// HistoricMerkleTree, bukan MerkleTree: bila admin mendaftarkan voter dalam
// beberapa batch, root berubah di antara batch. checkRoot() menerima root lama
// sehingga path yang sudah disusun voter tetap sah.
export ledger eligibility: HistoricMerkleTree<10, Bytes<32>>;

// ── Fase vote ────────────────────────────────────────────────────────────
export ledger voteCount: Counter;
```

Tambahkan circuit di akhir berkas:

```compact
// Khusus admin. Menutup sendiri begitu suara pertama masuk, sehingga daftar
// pemilih tidak dapat berubah di tengah pemungutan suara.
export circuit registerVoters(leaves: Vector<8, Bytes<32>>, n: Uint<8>): [] {
  assert(disclose(admin_pk(admin_secret_key()) == adminKey), "Hanya admin yang boleh mendaftarkan pemilih");
  assert(phase == BallotPhase.voting, "Ballot sudah tidak dalam fase pemungutan suara");
  assert(voteCount.read() == 0, "Pendaftaran ditutup setelah suara pertama masuk");
  assert(n >= 1 && n <= 8, "Jumlah pendaftaran harus 1 sampai 8");

  // firstFree() bersifat publik, jadi siapa pun dapat memeriksa jumlah credential
  // yang benar-benar diterbitkan terhadap eligibleCount yang di-seal.
  const terpakai = eligibility.firstFree() as Uint<64>;
  assert(terpakai + (n as Uint<64>) <= eligibleCount, "Melebihi eligibleCount yang ditetapkan ballot");

  // Diurai manual, bukan for-loop, agar tidak bergantung pada sintaks perulangan.
  if (n > 0) { eligibility.insert(disclose(leaves[0])); }
  if (n > 1) { eligibility.insert(disclose(leaves[1])); }
  if (n > 2) { eligibility.insert(disclose(leaves[2])); }
  if (n > 3) { eligibility.insert(disclose(leaves[3])); }
  if (n > 4) { eligibility.insert(disclose(leaves[4])); }
  if (n > 5) { eligibility.insert(disclose(leaves[5])); }
  if (n > 6) { eligibility.insert(disclose(leaves[6])); }
  if (n > 7) { eligibility.insert(disclose(leaves[7])); }
}
```

- [ ] **Step 5: Kompilasi dan jalankan uji**

```bash
pnpm contract compact:ballot && pnpm contract test
```
Diharapkan: seluruh uji lulus.

Bila `eligibility.firstFree()` tidak mengembalikan tipe yang dapat dibandingkan dengan `Uint<64>`, ganti dua baris tersebut menjadi `assert(disclose(eligibility.firstFree() as Field) as Uint<64>) + (n as Uint<64>) <= eligibleCount, ...)` dan sesuaikan casting sampai compiler menerima. Bila nama pada sisi TypeScript ternyata `firstFree()` (method) alih-alih `firstFree` (property), sesuaikan uji Step 2.

- [ ] **Step 6: Commit**

```bash
git add pkgs/contract/src
git commit -m "feat(contract): pohon eligibility dan pendaftaran voter khusus admin"
```

---

### Task 4: `castVote` — bukti eligibility, nullifier, commitment

**Files:**
- Modify: `pkgs/contract/src/ballot.compact`
- Modify: `pkgs/contract/src/test/ballot-simulator.ts`
- Test: `pkgs/contract/src/test/ballot.test.ts`

**Interfaces:**
- Consumes: `eligibility`, `voteCount`, `pureCircuits.*` dari Task 2 dan 3.
- Produces: `BallotSimulator.castVote(cred: Uint8Array, option: number, salt: Uint8Array): Ledger`; ledger bertambah `nullifiers` (Set), `commitments` (MerkleTree).

- [ ] **Step 1: Tambahkan method simulator**

Tambahkan ke `BallotSimulator`:

```typescript
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
```

- [ ] **Step 2: Tulis uji yang gagal**

Tambahkan ke `pkgs/contract/src/test/ballot.test.ts`:

```typescript
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
    expect(sim.getLedger().commitments.firstFree).toBe(1n);
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
    const sim = siap();
    expect(() => sim.castVote(ASING, 0, SALT_1)).toThrow();
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
```

- [ ] **Step 3: Jalankan uji, pastikan gagal**

```bash
pnpm contract test
```
Diharapkan: GAGAL — `castVote` belum ada.

- [ ] **Step 4: Tambahkan ledger, witness, dan circuit**

Di `pkgs/contract/src/ballot.compact`, tambahkan ke blok fase vote:

```compact
export ledger nullifiers:  Set<Bytes<32>>;
// MerkleTree biasa, bukan Historic: pohon ini sudah beku saat fase tally dimulai,
// karena castVote hanya boleh sebelum deadline dan tallyVote hanya sesudahnya.
export ledger commitments: MerkleTree<10, Bytes<32>>;
```

Tambahkan deklarasi witness di dekat `admin_secret_key`:

```compact
witness voter_credential():  Bytes<32>;
witness eligibility_path():  MerkleTreePath<10, Bytes<32>>;
witness get_my_option():     Uint<8>;
witness get_my_salt():       Bytes<32>;
witness store_opening(o: Uint<8>, s: Bytes<32>): [];
```

Tambahkan circuit:

```compact
export circuit castVote(): [] {
  assert(phase == BallotPhase.voting, "Ballot tidak sedang menerima suara");

  const cred    = voter_credential();
  const daun    = cred_leaf(cred);
  const path    = eligibility_path();

  // Membuktikan credential ada di pohon eligibility tanpa membuka credential-nya.
  assert(disclose(path.leaf == daun), "Merkle path bukan untuk credential ini");
  assert(disclose(eligibility.checkRoot(merkleTreePathRoot<10, Bytes<32>>(path))),
         "Anda tidak terdaftar sebagai pemilih pada ballot ini");

  // Satu credential, satu suara.
  const nf = vote_nullifier(ballotNonce, cred);
  assert(disclose(!nullifiers.member(nf)), "Credential ini sudah dipakai memilih");
  nullifiers.insert(disclose(nf));

  const opsi = get_my_option();
  const salt = get_my_salt();
  assert(disclose(opsi < optionCount), "Pilihan di luar opsi yang tersedia");

  // Yang masuk ledger hanyalah hash. Tidak ada satu bit pun tentang pilihan.
  commitments.insert(disclose(vote_commitment(opsi, salt)));
  voteCount.increment(1);

  // Disimpan lokal agar pemilih dapat membuka suaranya pada fase tally.
  store_opening(opsi, salt);
}
```

- [ ] **Step 5: Kompilasi dan jalankan uji**

```bash
pnpm contract compact:ballot && pnpm contract test
```
Diharapkan: seluruh uji lulus.

Bila `path.leaf` bukan nama field yang benar pada `MerkleTreePath`, jalankan `cat pkgs/contract/src/managed/ballot/contract/index.d.ts | grep -A6 MerkleTreePath` untuk melihat bentuk aslinya, lalu sesuaikan. Bila `merkleTreePathRoot` menuntut argumen tipe berbeda, coba `merkleTreePathRootNoLeafHash` — bedanya hanya pada apakah daun ikut di-hash.

- [ ] **Step 6: Commit**

```bash
git add pkgs/contract/src
git commit -m "feat(contract): castVote dengan bukti eligibility ZK dan nullifier"
```

---

### Task 5: Penegakan deadline

Dipisah menjadi tugas tersendiri karena spec §12 mencatat ejaan API kernel waktu blok sebagai ketidakpastian, dan karena belum diketahui apakah simulator dapat mengatur waktu blok. Reviewer dapat menolak tugas ini tanpa membatalkan Task 4.

**Files:**
- Modify: `pkgs/contract/src/ballot.compact`
- Modify: `pkgs/contract/src/test/ballot-simulator.ts`
- Test: `pkgs/contract/src/test/ballot.test.ts`

**Interfaces:**
- Consumes: `castVote` dari Task 4, `voteDeadline`/`tallyDeadline` dari Task 2.
- Produces: `castVote` menolak setelah `voteDeadline`.

- [ ] **Step 1: Telusuri API waktu blok**

```bash
grep -rn "blockTime" pkgs/contract/src/managed/ballot/contract/index.d.ts
grep -rn "blockTime" node_modules/.pnpm/@midnight-ntwrk+compact-runtime*/node_modules/@midnight-ntwrk/compact-runtime/dist/*.d.ts | head -20
```
Catat ejaan yang benar. Dokumentasi menyebut dua bentuk: `kernel.blockTimeLessThan(t)` dan `blockTimeLt(t)`. Pakai yang muncul pada hasil grep.

- [ ] **Step 2: Telusuri apakah simulator dapat mengatur waktu blok**

```bash
grep -rn "block\|Timestamp\|QueryContext" node_modules/.pnpm/@midnight-ntwrk+compact-runtime*/node_modules/@midnight-ntwrk/compact-runtime/dist/*.d.ts | grep -i "time\|block" | head -20
```
Bila `createCircuitContext` atau `QueryContext` menerima waktu blok, lanjut ke Step 3. Bila tidak, lewati Step 3 sampai Step 5 dan kerjakan Step 6 — pengujian deadline dipindahkan ke Rencana B (uji CLI di testnet dengan deadline yang sengaja dibuat pendek), dan catat keputusan itu di komentar `ballot.test.ts`.

- [ ] **Step 3: Rangkai waktu blok ke context**

`setBlockTime`, `majuKeFaseTally`, `majuKeFaseFinal`, dan field `blockTime` sudah ada sejak Task 2 — sampai sekarang nilainya belum berpengaruh apa-apa. Yang ditambahkan di sini hanyalah perangkaiannya ke `createCircuitContext` di dalam method `run`, memakai nama parameter yang ditemukan pada Step 2. Bentuknya kira-kira:

```typescript
    const ctx = createCircuitContext(
      this.contractAddress,
      this.zswap,
      this.state,
      privateState,
      { blockTime: this.blockTime },   // ← nama field sesuai hasil Step 2
    );
```

Bila Step 2 menunjukkan waktu blok tidak dapat disuntikkan, biarkan `run` apa adanya. `setBlockTime` tetap ada sebagai no-op sehingga Task 6 dan 7 tidak perlu diubah, dan uji yang bergantung padanya ditandai `it.skip`.

- [ ] **Step 4: Tulis uji yang gagal**

Tambahkan ke `pkgs/contract/src/test/ballot.test.ts`:

```typescript
describe("ballot.compact — deadline", () => {
  const CRED_A = bytes32(0x11);
  const SALT_1 = bytes32(0xa1);
  const SEKARANG = 1_800_000_000_000n;

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
});
```

- [ ] **Step 5: Jalankan uji, pastikan gagal**

```bash
pnpm contract test
```
Diharapkan: uji pertama GAGAL karena suara setelah deadline masih diterima.

- [ ] **Step 6: Tambahkan assert deadline**

Di `pkgs/contract/src/ballot.compact`, tambahkan sebagai baris pertama tubuh `castVote`, memakai ejaan dari Step 1:

```compact
  assert(kernel.blockTimeLessThan(voteDeadline as Uint<64>), "Batas waktu pemungutan suara sudah lewat");
```

- [ ] **Step 7: Kompilasi dan jalankan uji**

```bash
pnpm contract compact:ballot && pnpm contract test
```
Diharapkan: seluruh uji lulus. Bila Step 2 menyimpulkan simulator tidak dapat mengatur waktu blok, yang diharapkan hanyalah kompilasi berhasil dan uji-uji sebelumnya tetap lulus.

- [ ] **Step 8: Commit**

```bash
git add pkgs/contract/src
git commit -m "feat(contract): penegakan deadline pemungutan suara di kontrak"
```

---

### Task 6: `tallyVote` — pembukaan yang tidak dapat dilacak

**Files:**
- Modify: `pkgs/contract/src/ballot.compact`
- Modify: `pkgs/contract/src/test/ballot-simulator.ts`
- Test: `pkgs/contract/src/test/ballot.test.ts`

**Interfaces:**
- Consumes: `commitments`, `pureCircuits.vote_commitment`, `pureCircuits.tally_nullifier`.
- Produces: `BallotSimulator.tallyVote(option: number, salt: Uint8Array): Ledger`; ledger bertambah `tallyNullifiers` (Set), `tallies` (Map), `talliedCount` (Counter).

- [ ] **Step 1: Tambahkan method simulator**

Tambahkan ke `BallotSimulator`:

```typescript
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
```

- [ ] **Step 2: Tulis uji yang gagal**

Bila Task 5 Step 2 menyimpulkan waktu blok tidak dapat disuntikkan ke simulator, tandai `it.skip` pada dua uji terakhir blok ini (yang bergantung pada perpindahan fase) dengan komentar yang menunjuk ke Rencana B.

Tambahkan ke `pkgs/contract/src/test/ballot.test.ts`:

```typescript
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
    const sim = setelahDuaSuara();
    // Commitment mengikat (pilihan, salt); mengaku memilih 1 dengan SALT_1
    // menghasilkan commitment yang tidak ada di pohon.
    expect(() => sim.tallyVote(1, SALT_1)).toThrow();
  });

  it("salt yang tidak pernah dipakai memilih ditolak", () => {
    const sim = setelahDuaSuara();
    expect(() => sim.tallyVote(0, bytes32(0xf0))).toThrow();
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
```

- [ ] **Step 3: Jalankan uji, pastikan gagal**

```bash
pnpm contract test
```
Diharapkan: GAGAL — `tallyVote` belum ada pada `impureCircuits`.

- [ ] **Step 4: Tambahkan ledger dan circuit**

Di `pkgs/contract/src/ballot.compact`, tambahkan blok fase tally:

```compact
// ── Fase tally ───────────────────────────────────────────────────────────
export ledger tallyNullifiers: Set<Bytes<32>>;
export ledger tallies:         Map<Uint<8>, Uint<64>>;
export ledger talliedCount:    Counter;
```

Tambahkan dua circuit:

```compact
export circuit tallyVote(): [] {
  assert(phase != BallotPhase.finalized, "Ballot sudah difinalisasi");
  assert(kernel.blockTimeGreaterThan(voteDeadline as Uint<64>), "Pemungutan suara masih berlangsung");
  assert(kernel.blockTimeLessThan(tallyDeadline as Uint<64>), "Batas waktu pembukaan suara sudah lewat");

  // Transisi fase dilakukan secara malas oleh pembuka suara pertama, bukan lewat
  // circuit penutup tersendiri. Circuit penutup akan menciptakan jebakan liveness:
  // bila tidak ada yang memanggilnya, suara tidak akan pernah bisa dibuka sama sekali.
  if (phase == BallotPhase.voting) { phase = BallotPhase.tallying; }

  const opsi = get_my_option();
  const salt = get_my_salt();
  const c    = vote_commitment(opsi, salt);
  const path = commitment_path();

  // Membuktikan commitment ini ada di pohon, tanpa membuka commitment yang mana.
  assert(disclose(path.leaf == c), "Merkle path bukan untuk commitment ini");
  assert(disclose(commitments.checkRoot(merkleTreePathRoot<10, Bytes<32>>(path))),
         "Commitment tidak ditemukan pada ballot ini");

  // Nullifier tally diturunkan dari salt yang rahasia — bukan dari commitment.
  // Inilah yang membuat "satu suara untuk opsi X" tidak dapat dihubungkan
  // kembali ke commitment mana pun, apalagi ke pemilihnya.
  const tnf = tally_nullifier(salt);
  assert(disclose(!tallyNullifiers.member(tnf)), "Suara ini sudah pernah dibuka");
  tallyNullifiers.insert(disclose(tnf));

  const opsiPublik = disclose(opsi);
  const sebelum = tallies.member(opsiPublik) ? tallies.lookup(opsiPublik) : 0;
  tallies.insert(opsiPublik, sebelum + 1);
  talliedCount.increment(1);
}
```

Tambahkan deklarasi witness `commitment_path`:

```compact
witness commitment_path(): MerkleTreePath<10, Bytes<32>>;
```

- [ ] **Step 5: Kompilasi dan jalankan uji**

```bash
pnpm contract compact:ballot && pnpm contract test
```
Diharapkan: seluruh uji lulus.

Bila compiler menolak `Map<Uint<8>, Uint<64>>` atau operasi `lookup`/`insert` di atasnya, ganti dengan empat counter terpisah `tally0`–`tally3` dan gantikan tiga baris terakhir dengan rangkaian `if (opsiPublik == 0) { tally0.increment(1); }` sampai `3`. Sesuaikan `BallotSimulator.tally()` agar membaca counter yang sesuai.

- [ ] **Step 6: Commit**

```bash
git add pkgs/contract/src
git commit -m "feat(contract): tallyVote dengan pembukaan suara yang tidak dapat dilacak"
```

---

### Task 7: `finalize` dan uji alur penuh

**Files:**
- Modify: `pkgs/contract/src/ballot.compact`
- Modify: `pkgs/contract/src/test/ballot-simulator.ts`
- Create: `pkgs/contract/src/index.ts`
- Test: `pkgs/contract/src/test/ballot.test.ts`

**Interfaces:**
- Consumes: seluruh circuit dari Task 2 sampai 6.
- Produces: ekspor paket `contract` — `Ballot`, `Registry`, `ballotWitnesses`, `registryWitnesses`, `BallotPrivateStateId`, `RegistryPrivateStateId`, `emptyBallotPrivateState`, `emptyRegistryPrivateState`, `type BallotPrivateState`, `type RegistryPrivateState`. Rencana B dan C mengonsumsi persis nama-nama ini.

- [ ] **Step 1: Tulis uji alur penuh yang gagal**

Tambahkan ke `pkgs/contract/src/test/ballot.test.ts`:

```typescript
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
    expect(sim.getLedger().eligibility.firstFree).toBe(3n);

    // Dua memilih opsi 0, satu memilih opsi 2.
    sim.castVote(CRED[0], 0, SALT[0]);
    sim.castVote(CRED[1], 2, SALT[1]);
    sim.castVote(CRED[2], 0, SALT[2]);
    expect(sim.getLedger().voteCount).toBe(3n);

    // Selama pemungutan suara, tidak ada hitungan yang bocor.
    expect(sim.tally(0)).toBe(0n);
    expect(sim.tally(2)).toBe(0n);

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
    const sim = new BallotSimulator({ eligibleCount: 2, options: ["Ya", "Tidak"] });
    sim.registerVoters([CRED[0], CRED[1]]);
    sim.castVote(CRED[0], 0, SALT[0]);
    sim.majuKeFaseTally();
    sim.finalize();
    expect(sim.getLedger().phase).toBe(BallotPhase.finalized);
    expect(() => sim.tallyVote(0, SALT[0])).toThrow();
  });
});
```

- [ ] **Step 2: Tambahkan `finalize` ke simulator**

Tambahkan ke `BallotSimulator`:

```typescript
  /** Memfinalisasi ballot. Memajukan waktu blok melewati tallyDeadline. */
  finalize(): Ledger {
    this.majuKeFaseFinal();
    return this.run(
      (ctx) => this.contract.impureCircuits.finalize(ctx),
      emptyBallotPrivateState(this.adminSecretKey),
    );
  }
```

- [ ] **Step 3: Jalankan uji, pastikan gagal**

```bash
pnpm contract test
```
Diharapkan: GAGAL — `finalize` belum ada.

- [ ] **Step 4: Tambahkan circuit `finalize`**

Di `pkgs/contract/src/ballot.compact`:

```compact
// Terbuka untuk siapa saja setelah tallyDeadline lewat. Memberi tanda finalitas
// yang eksplisit di on-chain, bukan sekadar turunan waktu di sisi tampilan.
export circuit finalize(): [] {
  assert(phase != BallotPhase.finalized, "Ballot sudah difinalisasi");
  assert(kernel.blockTimeGreaterThan(tallyDeadline as Uint<64>), "Batas waktu pembukaan suara belum lewat");
  phase = BallotPhase.finalized;
}
```

- [ ] **Step 5: Tulis titik ekspor paket**

`pkgs/contract/src/index.ts`:

```typescript
export * as Ballot from "./managed/ballot/contract/index.js";
export * as Registry from "./managed/registry/contract/index.js";

export {
  BallotPrivateStateId,
  ballotWitnesses,
  emptyBallotPrivateState,
  type BallotPrivateState,
} from "./ballot-witnesses.js";

export {
  RegistryPrivateStateId,
  registryWitnesses,
  emptyRegistryPrivateState,
  type RegistryPrivateState,
} from "./registry-witnesses.js";
```

- [ ] **Step 6: Kompilasi, uji, dan build**

```bash
pnpm contract compact && pnpm contract test && pnpm contract build
```
Diharapkan: kompilasi berhasil, seluruh uji lulus, `pkgs/contract/dist/index.js` dan `dist/managed/` terbentuk.

- [ ] **Step 7: Commit**

```bash
git add pkgs/contract
git commit -m "feat(contract): finalisasi ballot dan uji alur penuh"
```

---

## Selesai bila

- `pnpm contract compact` mengompilasi kedua kontrak tanpa galat.
- `pnpm contract test` menghijaukan seluruh uji.
- `pnpm contract build` menghasilkan `dist/` yang dapat dikonsumsi paket lain.
- Keempat ketidakpastian spec §12 sudah terjawab dan dicatat: ejaan API waktu blok, dukungan `Map<Uint<8>, Uint<64>>`, versi compiler beserta pragma-nya, dan apakah simulator dapat mengatur waktu blok.

## Rencana berikutnya

**Rencana B — CLI dan deployment testnet.** Paket `pkgs/shared` (endpoint jaringan, tipe domain, pembuat credential), paket `pkgs/cli` (wallet headless, deploy registry, deploy ballot, terbitkan credential, uji end-to-end di Preview). Disusun setelah Rencana A selesai, karena bentuk pemanggilan circuit dan nama tipe yang benar baru pasti setelah kontrak terkompilasi.

**Rencana C — Integrasi aplikasi.** Migrasi `client/` ke `pkgs/app`, `PrivacyAdapter` dengan implementasi Mock dan Midnight, konektor Lace, pemecahan `Home.tsx`, dan perubahan UI di spec §9.2. Bergantung pada A dan B.

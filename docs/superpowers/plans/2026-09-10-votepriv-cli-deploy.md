# VotePriv — Rencana Implementasi B: CLI dan Deployment Testnet

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: gunakan superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`).

**Goal:** Men-deploy kedua kontrak VotePriv ke Midnight preprod dari wallet headless, lalu membuktikan seluruh rangkaiannya bekerja di jaringan nyata lewat satu uji tiga pemilih — dari pendaftaran sampai finalisasi.

**Architecture:** Dua paket baru di monorepo. `pkgs/shared` memuat tipe domain, endpoint jaringan, dan pembuat credential yang dipakai bersama CLI dan aplikasi. `pkgs/cli` menjalankan wallet headless yang diturunkan dari seed, menyusun provider midnight-js, dan mengeksekusi deploy serta pemanggilan circuit. Kontrak dan artefak ZK-nya sudah selesai dan teruji di Rencana A; rencana ini tidak menyentuh `.compact` mana pun.

**Tech Stack:** TypeScript, `@midnight-ntwrk/wallet-sdk-*` (hd, facade, shielded, unshielded-wallet, dust-wallet), `midnight-js-*` 4.x, `@midnight-ntwrk/ledger-v8`, rxjs, pino, Vitest, pnpm.

**Spec:** [`docs/superpowers/specs/2026-09-10-votepriv-midnight-design.md`](../specs/2026-09-10-votepriv-midnight-design.md)

**Rencana pendahulu:** [`2026-09-10-votepriv-fondasi-kontrak.md`](2026-09-10-votepriv-fondasi-kontrak.md) — selesai, 64/64 uji hijau, kedua kontrak terkompilasi dengan kunci ZK lengkap.

## Global Constraints

- **Seed wallet tidak boleh masuk repo, log, maupun pesan galat.** Dibaca dari env `MIDNIGHT_WALLET_SEED` bila ada, kalau tidak diminta interaktif tanpa echo. Jangan pernah mencetaknya, bahkan sebagian.
- **Deadline dalam DETIK sejak epoch Unix**, bukan milidetik. Kernel membandingkan `secondsSinceEpoch` mentah-mentah; milidetik menghasilkan angka seribu kali terlalu besar dan pemungutan suara tidak pernah tertutup.
- **Endpoint jaringan tidak boleh di-hardcode di `cli`.** Definisinya hanya di `pkgs/shared/src/network-config.ts`.
- `@midnight-ntwrk/compact-runtime` harus **0.16.0 persis** — kode hasil kompilasi memeriksa kecocokan versi minor secara ketat.
- `setNetworkId()` wajib dipanggil sebelum provider dibangun. midnight-js menyimpan network sebagai state global dan alamat dikodekan terhadapnya.
- Private state kini **berkunci alamat kontrak** (hasil gelombang perbaikan Rencana A). CLI harus menulis dengan bentuk string yang sama dengan yang dilaporkan runtime.
- Pesan yang dilihat pengguna ditulis dalam bahasa Indonesia, konsisten dengan pesan assert kontrak.
- Node ≥ 22.15, pnpm 10.4.1. Jangan memakai bun.
- Conventional Commits (`feat:`, `test:`, `chore:`, `fix:`).

## Kematangan rencana — baca ini sebelum mengeksekusi

Rencana ini **tidak sematang Rencana A**, dan alasannya perlu dinyatakan terbuka.

Rencana A memuat kode verbatim di setiap langkah karena bahasanya, Compact, punya permukaan kecil yang bisa saya verifikasi lebih dulu lewat dokumentasi dan kontrak contoh. Wallet SDK Midnight tidak begitu: `WalletFacade`, ketiga sub-wallet, penurunan kunci HD, dan penanganan bug penandatanganannya adalah permukaan besar yang **belum pernah saya jalankan sendiri**. Menuliskannya verbatim berarti mengarang tanda tangan API yang belum terkonfirmasi — dan galat dari API yang dikarang jauh lebih membingungkan daripada langkah yang jujur menunjuk implementasi rujukan.

Konsekuensinya, ada lima langkah tanpa blok kode lengkap: Task 3 Step 2, Task 4 Step 1 (`balanceTx`), Task 5 Step 1 dan 2, dan Task 6 Step 1. Semuanya adalah **penyalinan berpola dari rujukan yang terbukti bekerja**, bukan penemuan.

**Task 3 karena itu berfungsi ganda sebagai spike.** Deliverable-nya — wallet tersambung ke preprod dan melaporkan saldo nyata — adalah yang menetapkan bentuk API sebenarnya. Setelah Task 3 selesai, Task 4 sampai 6 layak ditulis ulang dengan kode verbatim dari permukaan yang sudah diketahui, persis seperti Rencana A. Kerjakan Task 1 sampai 3, lalu minta rencana untuk sisanya diperbarui.

Yang **sudah** setara Rencana A: Task 1 dan Task 2 lengkap dengan uji dan kode verbatim, dan seluruh temuan mahal dari Rencana A sudah tertanam sebagai batasan — satuan detik, endpoint dari wallet, versi runtime, kebijakan password, dan keharusan `setNetworkId()`.

## Prasyarat yang sudah terpenuhi

Diverifikasi sebelum rencana ini ditulis, jangan diturunkan ulang:

| | |
|---|---|
| Kedua kontrak terkompilasi | `pkgs/contract/src/managed/{ballot,registry}` lengkap dengan prover + verifier |
| Uji simulator | 64/64 hijau |
| Proof server | `midnightntwrk/proof-server:8.1.0` berjalan di `:6300` |
| Wallet | headless, punya seed, **sudah berisi tNight dan tDUST** |
| Toolchain | compactc 0.31.1, Node 22.23.1, pnpm 10.4.1, Docker 29.2.1 |

Karena wallet sudah berdana, alur faucet dan penantian generasi DUST **tidak perlu dibangun** — cukup ditampilkan sebagai diagnosis bila saldonya ternyata nol.

## Bacaan rujukan

Implementasi rujukan yang polanya diikuti rencana ini. Ambil lewat `curl` saat dibutuhkan, jangan di-vendor ke repo:

- `https://raw.githubusercontent.com/mashharuki/midnight-rps-sample-app/main/pkgs/cli/src/api.ts` — wallet dari seed, provider, deploy
- `https://raw.githubusercontent.com/mashharuki/midnight-rps-sample-app/main/pkgs/cli/src/config.ts` — kelas Config per jaringan
- `https://raw.githubusercontent.com/mashharuki/midnight-rps-sample-app/main/pkgs/cli/package.json` — versi dependensi yang terbukti bekerja bersama

Juga tersedia di mesin ini, implementasi milik pengguna sendiri yang memakai midnight-js 4.1.1: `/home/mdlog/Project-MDlabs/Akindo/Midnight/proofpass-dashboard/client/src/lib/midnightProviders.ts`.

## Peta berkas

| Berkas | Tanggung jawab |
|---|---|
| `pkgs/shared/src/network-config.ts` | Endpoint indexer/node/faucet per jaringan, URL proof server bawaan |
| `pkgs/shared/src/votepriv-types.ts` | Tipe domain: Ballot, BallotPhase, VoteReceipt, tipe provider |
| `pkgs/shared/src/credentials.ts` | Pembuat credential acak dan pengubahnya ke daun eligibility |
| `pkgs/shared/src/waktu.ts` | Pembantu deadline dalam detik, satu-satunya tempat konversi waktu |
| `pkgs/shared/src/index.ts` | Titik ekspor |
| `pkgs/cli/src/config.ts` | Kelas Config per jaringan, memanggil `setNetworkId()` |
| `pkgs/cli/src/logger.ts` | pino, menulis ke berkas per jaringan |
| `pkgs/cli/src/seed.ts` | Pembacaan seed dari env atau prompt tanpa echo |
| `pkgs/cli/src/wallet.ts` | Wallet headless dari seed, sinkronisasi, saldo |
| `pkgs/cli/src/providers.ts` | Perakitan provider midnight-js |
| `pkgs/cli/src/deploy.ts` | Deploy registry dan ballot, pendaftaran voter |
| `pkgs/cli/src/vote.ts` | castVote, tallyVote, finalize lewat CLI |
| `pkgs/cli/src/e2e.ts` | Uji tiga pemilih di jaringan nyata |
| `pkgs/cli/src/preprod.ts` | Titik masuk preprod |
| `pkgs/cli/proof-server.yml` | Compose proof server, port 6300 |

---

### Task 1: `pkgs/shared`

Paket murni TypeScript tanpa ketergantungan jaringan, sehingga dapat diuji sepenuhnya tanpa testnet. Semua konversi waktu dipusatkan di sini — inilah tempat bug milidetik-vs-detik dicegah kembali lahir.

**Files:**
- Create: `pkgs/shared/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `pkgs/shared/src/{network-config,votepriv-types,credentials,waktu,index}.ts`
- Test: `pkgs/shared/src/{credentials,waktu}.test.ts`

**Interfaces:**
- Consumes: `contract` (paket dari Rencana A) untuk `Ballot.pureCircuits.cred_leaf`.
- Produces: `MIDNIGHT_NETWORK_ENDPOINTS`, `DEFAULT_PROOF_SERVER_URL`, `faucetUrlFor(networkId)`, `buatCredential()`, `daunEligibility(cred)`, `detikSekarang()`, `detikDariSekarang(n)`, tipe `MidnightNetworkId`.

- [ ] **Step 1: Buat paket**

`pkgs/shared/package.json`:

```json
{
  "name": "shared",
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
    "build": "rm -rf dist && tsc --project tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "contract": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "^2.1.4"
  }
}
```

`pkgs/shared/tsconfig.json`: salin isi `pkgs/contract/tsconfig.json` apa adanya — konfigurasinya identik dan sudah terbukti.

`pkgs/shared/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { extensions: [".ts", ".js"], conditions: ["import", "node", "default"] },
});
```

- [ ] **Step 2: Tulis uji yang gagal**

`pkgs/shared/src/waktu.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { detikDariSekarang, detikSekarang } from "./waktu.js";

describe("waktu", () => {
  it("detikSekarang mengembalikan DETIK, bukan milidetik", () => {
    const t = detikSekarang();
    const ms = BigInt(Date.now());
    // Detik selalu kira-kira seperseribu milidetik. Perbandingan ini akan
    // gagal seketika bila seseorang mengembalikan Date.now() apa adanya —
    // kekeliruan yang di jaringan nyata membuat deadline tidak pernah tercapai.
    expect(t).toBeLessThan(ms / 100n);
    expect(t).toBeGreaterThan(ms / 10000n);
  });

  it("detikDariSekarang menambah tepat sejumlah detik", () => {
    const dasar = detikSekarang();
    const nanti = detikDariSekarang(300);
    expect(nanti - dasar).toBeGreaterThanOrEqual(299n);
    expect(nanti - dasar).toBeLessThanOrEqual(301n);
  });

  it("menolak durasi yang sudah lewat", () => {
    expect(() => detikDariSekarang(-1)).toThrow(/tidak boleh negatif/);
  });
});
```

`pkgs/shared/src/credentials.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buatCredential, daunEligibility } from "./credentials.js";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("credentials", () => {
  it("membuat credential 32 byte", () => {
    expect(buatCredential().length).toBe(32);
  });

  it("dua credential tidak pernah sama", () => {
    expect(hex(buatCredential())).not.toBe(hex(buatCredential()));
  });

  it("daun eligibility deterministik terhadap credential yang sama", () => {
    const c = buatCredential();
    expect(hex(daunEligibility(c))).toBe(hex(daunEligibility(c)));
  });

  it("daun eligibility memakai circuit kontrak, bukan hash tandingan", () => {
    // Bila seseorang mengimplementasi ulang hash di TypeScript, nilainya akan
    // berbeda dari yang dihitung circuit dan tidak ada commitment yang pernah cocok.
    const c = buatCredential();
    const daun = daunEligibility(c);
    expect(daun.length).toBe(32);
    expect(hex(daun)).not.toBe(hex(c));
  });
});
```

- [ ] **Step 3: Jalankan uji, pastikan gagal**

```bash
pnpm --filter shared test
```
Diharapkan: GAGAL — modul `./waktu.js` dan `./credentials.js` belum ada.

- [ ] **Step 4: Tulis implementasinya**

`pkgs/shared/src/waktu.ts`:

```typescript
/**
 * Satu-satunya tempat waktu dikonversi di seluruh proyek.
 *
 * Kernel Midnight membandingkan deadline terhadap `secondsSinceEpoch` mentah,
 * tanpa penskalaan. Nilai dalam milidetik karenanya kira-kira seribu kali terlalu
 * besar: `blockTimeLessThan(voteDeadline)` nyaris selalu benar dan pemungutan
 * suara tidak pernah tertutup. Simulator dapat menyuntikkan waktu blok sehingga
 * ujinya tetap hijau dengan satuan mana pun — node sungguhan tidak bisa, jadi
 * kekeliruan ini hanya terlihat setelah di jaringan.
 */

export const detikSekarang = (): bigint => BigInt(Math.floor(Date.now() / 1000));

export const detikDariSekarang = (detik: number): bigint => {
  if (detik < 0) throw new Error("Durasi deadline tidak boleh negatif");
  return detikSekarang() + BigInt(Math.floor(detik));
};

export const MENIT = 60;
export const JAM = 60 * MENIT;
export const HARI = 24 * JAM;
```

`pkgs/shared/src/credentials.ts`:

```typescript
import { Ballot } from "contract";

/**
 * Credential pemilih: 32 byte acak dari CSPRNG.
 *
 * Nullifier tally diturunkan dari salt dan nullifier vote dari credential, jadi
 * keduanya harus benar-benar acak. Credential yang diturunkan secara deterministik
 * akan membuat dua pemilih bertabrakan, dan yang kedua kehilangan suaranya secara
 * senyap dengan pesan "sudah pernah dipakai".
 */
export const buatCredential = (): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(32));

/**
 * Daun yang didaftarkan ke pohon eligibility.
 *
 * Sengaja memanggil circuit kontrak, bukan mengimplementasi ulang hash-nya di
 * TypeScript. Hash tandingan yang meleset satu byte menghasilkan pohon yang tidak
 * pernah cocok dengan commitment mana pun, dan galatnya tidak menunjuk ke mana-mana.
 */
export const daunEligibility = (credential: Uint8Array): Uint8Array =>
  Ballot.pureCircuits.cred_leaf(credential);
```

`pkgs/shared/src/network-config.ts`:

```typescript
export type MidnightNetworkId = "preprod" | "preview" | "undeployed";

export interface MidnightNetworkEndpoints {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly faucetUrl?: string;
}

/** Proof server lokal. Witness melewatinya, jadi bawaannya selalu di mesin sendiri. */
export const DEFAULT_PROOF_SERVER_URL = "http://127.0.0.1:6300";

/**
 * Satu-satunya tempat endpoint jaringan didefinisikan.
 *
 * Ini nilai CADANGAN. Bila wallet melaporkan endpoint lewat getConfiguration(),
 * nilai wallet-lah yang dipakai — Lace 4.0.1 di preprod melaporkan host
 * blockfrost.lw.iog.io, bukan host midnight.network yang tercantum di sini.
 */
export const MIDNIGHT_NETWORK_ENDPOINTS: Record<MidnightNetworkId, MidnightNetworkEndpoints> = {
  preprod: {
    indexer: "https://indexer.preprod.midnight.network/api/v3/graphql",
    indexerWS: "wss://indexer.preprod.midnight.network/api/v3/graphql/ws",
    node: "https://rpc.preprod.midnight.network",
    faucetUrl: "https://faucet.preprod.midnight.network/",
  },
  preview: {
    indexer: "https://indexer.preview.midnight.network/api/v3/graphql",
    indexerWS: "wss://indexer.preview.midnight.network/api/v3/graphql/ws",
    node: "https://rpc.preview.midnight.network",
    faucetUrl: "https://faucet.preview.midnight.network/",
  },
  undeployed: {
    indexer: "http://127.0.0.1:8088/api/v3/graphql",
    indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
    node: "http://127.0.0.1:9944",
  },
};

export const faucetUrlFor = (networkId: string): string | undefined =>
  (MIDNIGHT_NETWORK_ENDPOINTS as Record<string, MidnightNetworkEndpoints>)[networkId]?.faucetUrl;
```

`pkgs/shared/src/votepriv-types.ts`:

```typescript
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
```

`pkgs/shared/src/index.ts`:

```typescript
export * from "./network-config.js";
export * from "./votepriv-types.js";
export * from "./credentials.js";
export * from "./waktu.js";
```

- [ ] **Step 5: Pasang dan jalankan uji**

```bash
pnpm install
pnpm --filter contract build && pnpm --filter shared test
```
Diharapkan: seluruh uji lulus. `pkgs/contract` harus di-build lebih dulu karena `shared` mengonsumsi keluaran `dist`-nya.

- [ ] **Step 6: Commit**

```bash
git add pkgs/shared pnpm-lock.yaml
git commit -m "feat(shared): tipe domain, endpoint jaringan, credential, dan pembantu waktu"
```

---

### Task 2: Kerangka `pkgs/cli`, config, dan seed

Tugas ini belum menyentuh jaringan. Deliverable-nya: `pnpm cli preprod` berjalan, membaca seed dengan aman, mencetak konfigurasi jaringan, lalu keluar.

**Files:**
- Create: `pkgs/cli/{package.json,tsconfig.json,proof-server.yml}`
- Create: `pkgs/cli/src/{config,logger,seed,preprod}.ts`
- Modify: `package.json` (root), `.gitignore`
- Test: `pkgs/cli/src/seed.test.ts`

**Interfaces:**
- Consumes: `shared` untuk `MIDNIGHT_NETWORK_ENDPOINTS`, `DEFAULT_PROOF_SERVER_URL`.
- Produces: `class PreprodConfig implements Config`, `bacaSeed(): Promise<string>`, `buatLogger(logDir): Logger`.

- [ ] **Step 1: Tulis uji seed yang gagal**

`pkgs/cli/src/seed.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { validasiSeed } from "./seed.js";

describe("validasiSeed", () => {
  const sah = "a".repeat(64);

  it("menerima hex 64 karakter", () => {
    expect(() => validasiSeed(sah)).not.toThrow();
  });

  it("menerima huruf besar dan spasi di tepi", () => {
    expect(() => validasiSeed(`  ${"A".repeat(64)}  `)).not.toThrow();
  });

  it("menolak panjang yang salah", () => {
    expect(() => validasiSeed("a".repeat(63))).toThrow(/64 karakter/);
  });

  it("menolak karakter non-hex", () => {
    expect(() => validasiSeed("z".repeat(64))).toThrow(/heksadesimal/);
  });

  it("pesan galat tidak pernah memuat seed-nya", () => {
    const rahasia = "deadbeef".repeat(7); // 56 karakter, panjangnya salah
    try {
      validasiSeed(rahasia);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect((e as Error).message).not.toContain("deadbeef");
    }
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

```bash
pnpm --filter cli test
```
Diharapkan: GAGAL — paket dan modulnya belum ada.

- [ ] **Step 3: Buat paket**

`pkgs/cli/package.json`:

```json
{
  "name": "cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "preprod": "node --max-old-space-size=4096 --no-warnings --experimental-strip-types src/preprod.ts",
    "preprod-ps": "docker compose -f proof-server.yml up -d && pnpm preprod",
    "build": "rm -rf dist && tsc --project tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@midnight-ntwrk/compact-runtime": "0.16.0",
    "@midnight-ntwrk/compact-js": "2.5.0",
    "@midnight-ntwrk/ledger-v8": "8.1.0",
    "@midnight-ntwrk/midnight-js-contracts": "4.0.4",
    "@midnight-ntwrk/midnight-js-http-client-proof-provider": "4.0.4",
    "@midnight-ntwrk/midnight-js-indexer-public-data-provider": "4.0.4",
    "@midnight-ntwrk/midnight-js-level-private-state-provider": "4.0.4",
    "@midnight-ntwrk/midnight-js-network-id": "4.0.4",
    "@midnight-ntwrk/midnight-js-node-zk-config-provider": "4.0.4",
    "@midnight-ntwrk/midnight-js-types": "4.0.4",
    "@midnight-ntwrk/midnight-js-utils": "4.0.4",
    "@midnight-ntwrk/wallet-sdk-address-format": "3.1.0",
    "@midnight-ntwrk/wallet-sdk-dust-wallet": "^3.0.0",
    "@midnight-ntwrk/wallet-sdk-facade": "^3.0.0",
    "@midnight-ntwrk/wallet-sdk-hd": "^3.0.2",
    "@midnight-ntwrk/wallet-sdk-shielded": "^2.1.0",
    "@midnight-ntwrk/wallet-sdk-unshielded-wallet": "^2.1.0",
    "contract": "workspace:*",
    "shared": "workspace:*",
    "pino": "^10.3.1",
    "pino-pretty": "^13.1.3",
    "rxjs": "^7.8.2",
    "ws": "^8.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.7.0",
    "@types/ws": "^8.0.0",
    "typescript": "5.6.3",
    "vitest": "^2.1.4"
  }
}
```

`pkgs/cli/tsconfig.json`: salin `pkgs/contract/tsconfig.json`, ubah `"lib"` menjadi `["ESNext", "DOM"]` karena wallet SDK memakai `WebSocket` dan `crypto` global.

`pkgs/cli/proof-server.yml`:

```yaml
services:
  proof-server:
    image: "midnightntwrk/proof-server:8.1.0"
    command: ["midnight-proof-server -v"]
    ports:
      - "6300:6300"
    environment:
      RUST_BACKTRACE: "full"
```

Catatan versi: repo rujukan mengunci `8.0.3`; mesin ini menjalankan `8.1.0` dan sudah terbukti menjawab `/version`. Pakai yang sedang berjalan.

Tambahkan ke `.gitignore`:

```
# Rahasia wallet dan cache — jangan pernah masuk repo
pkgs/cli/wallet-cache/
pkgs/cli/logs/
*.seed
.seed
```

- [ ] **Step 4: Tulis seed, config, logger**

`pkgs/cli/src/seed.ts`:

```typescript
import { createInterface } from "node:readline/promises";

/**
 * Seed wallet tidak boleh muncul di repo, log, maupun pesan galat.
 * Karena itu galat di sini menyebut BENTUK yang salah, tidak pernah nilainya.
 */
export function validasiSeed(masukan: string): string {
  const seed = masukan.trim().toLowerCase();
  if (seed.length !== 64) {
    throw new Error(`Seed harus 64 karakter heksadesimal; yang diberikan ${seed.length} karakter.`);
  }
  if (!/^[0-9a-f]{64}$/.test(seed)) {
    throw new Error("Seed harus berupa heksadesimal (0-9, a-f) saja.");
  }
  return seed;
}

/** Dari env bila ada, kalau tidak diminta interaktif tanpa echo. */
export async function bacaSeed(): Promise<string> {
  const dariEnv = process.env.MIDNIGHT_WALLET_SEED;
  if (dariEnv) return validasiSeed(dariEnv);

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    // Matikan echo supaya seed tidak tertinggal di layar maupun scrollback.
    const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
    const adaTty = Boolean(stdin.isTTY);
    if (adaTty) stdin.setRawMode?.(false);
    process.stdout.write("Seed wallet (64 hex, tidak akan ditampilkan): ");
    const jawaban = await rl.question("");
    process.stdout.write("\n");
    return validasiSeed(jawaban);
  } finally {
    rl.close();
  }
}
```

`pkgs/cli/src/config.ts`:

```typescript
import path from "node:path";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { DEFAULT_PROOF_SERVER_URL, MIDNIGHT_NETWORK_ENDPOINTS } from "shared";

export const currentDir = path.resolve(new URL(import.meta.url).pathname, "..");

export interface Config {
  readonly networkId: string;
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

const logDirUntuk = (network: string) =>
  path.resolve(currentDir, "..", "logs", network, `${new Date().toISOString()}.log`);

export class PreprodConfig implements Config {
  networkId = "preprod";
  logDir = logDirUntuk("preprod");
  indexer = MIDNIGHT_NETWORK_ENDPOINTS.preprod.indexer;
  indexerWS = MIDNIGHT_NETWORK_ENDPOINTS.preprod.indexerWS;
  node = MIDNIGHT_NETWORK_ENDPOINTS.preprod.node;
  proofServer = DEFAULT_PROOF_SERVER_URL;

  constructor() {
    // midnight-js menyimpan network sebagai state global dan alamat dikodekan
    // terhadapnya. Wajib dipanggil sebelum provider mana pun dibangun.
    setNetworkId("preprod");
  }
}
```

`pkgs/cli/src/logger.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import pino from "pino";

export function buatLogger(logDir: string) {
  fs.mkdirSync(path.dirname(logDir), { recursive: true });
  return pino(
    { level: process.env.LOG_LEVEL ?? "info" },
    pino.multistream([
      { stream: pino.destination(logDir) },
      { stream: pino.transport({ target: "pino-pretty", options: { colorize: true } }) },
    ]),
  );
}
```

`pkgs/cli/src/preprod.ts`:

```typescript
import { PreprodConfig } from "./config.js";
import { buatLogger } from "./logger.js";
import { bacaSeed } from "./seed.js";

const config = new PreprodConfig();
const log = buatLogger(config.logDir);

log.info({ networkId: config.networkId, indexer: config.indexer, node: config.node, proofServer: config.proofServer }, "Konfigurasi jaringan");

const seed = await bacaSeed();
log.info(`Seed diterima (${seed.length} karakter). Wallet dibangun pada Task 3.`);
```

- [ ] **Step 5: Tambahkan skrip root dan pasang**

Di `package.json` root, skrip `cli` sudah ada dari Rencana A. Jalankan:

```bash
pnpm install && pnpm --filter cli test
```
Diharapkan: 5 uji seed lulus.

- [ ] **Step 6: Jalankan CLI-nya**

```bash
MIDNIGHT_WALLET_SEED=$(printf 'a%.0s' {1..64}) pnpm cli preprod
```
Diharapkan: mencetak konfigurasi preprod dan pesan seed diterima. Pastikan **seed itu sendiri tidak muncul** di keluaran maupun di berkas log yang terbentuk.

- [ ] **Step 7: Commit**

```bash
git add pkgs/cli .gitignore pnpm-lock.yaml
git commit -m "feat(cli): kerangka paket, konfigurasi jaringan, dan pembacaan seed yang aman"
```

---

### Task 3: Wallet headless dari seed

Tugas pertama yang menyentuh jaringan. Deliverable: CLI tersambung ke preprod, menampilkan alamat, dan melaporkan saldo tNight serta tDUST milik pengguna.

**Files:**
- Create: `pkgs/cli/src/wallet.ts`
- Modify: `pkgs/cli/src/preprod.ts`

**Interfaces:**
- Consumes: `Config` dari Task 2, `bacaSeed()` dari Task 2.
- Produces: `type KonteksWallet = { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore }`, `bangunWallet(config, seed): Promise<KonteksWallet>`, `ringkasSaldo(ctx): Promise<{ night: bigint; dust: bigint; alamatUnshielded: string }>`.

- [ ] **Step 1: Baca implementasi rujukan**

```bash
curl -s https://raw.githubusercontent.com/mashharuki/midnight-rps-sample-app/main/pkgs/cli/src/api.ts > /tmp/rps-api.ts
sed -n '486,612p' /tmp/rps-api.ts
```

Bagian yang ditiru: `deriveKeysFromSeed`, `Roles.Zswap` / `Roles.Dust` / `Roles.NightExternal`, ketiga sub-wallet, `WalletFacade.init`, lalu `wallet.start(shieldedSecretKeys, dustSecretKey)`.

Yang **tidak** ditiru: seluruh alur faucet dan penantian generasi DUST. Wallet pengguna sudah berisi tNight dan tDUST, jadi bagian itu digantikan pelaporan saldo, dan URL faucet hanya ditampilkan bila saldonya ternyata nol.

- [ ] **Step 2: Tulis wallet.ts**

Struktur yang harus dihasilkan (isi detail turunkan dari rujukan Step 1 — nama API-nya harus persis, jangan dikarang):

```typescript
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { UnshieldedWallet, PublicKey } from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import * as Rx from "rxjs";
import WebSocket from "ws";
import type { Config } from "./config.js";

// Wallet SDK mengharapkan WebSocket global seperti di browser.
globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

export interface KonteksWallet {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
}

export async function bangunWallet(config: Config, seed: string): Promise<KonteksWallet> { /* … */ }

/** Menunggu sinkronisasi selesai lalu melaporkan saldo. */
export async function ringkasSaldo(ctx: KonteksWallet): Promise<{ night: bigint; dust: bigint; alamatUnshielded: string }> { /* … */ }
```

Sinkronisasi memakai pola `Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)))`.

- [ ] **Step 3: Sambungkan ke preprod.ts**

Ganti baris terakhir `preprod.ts` dengan:

```typescript
const ctx = await bangunWallet(config, seed);
const saldo = await ringkasSaldo(ctx);
log.info({ alamat: saldo.alamatUnshielded, night: saldo.night.toString(), dust: saldo.dust.toString() }, "Wallet tersinkronisasi");

Tambahkan `faucetUrlFor` ke impor dari `shared` di berkas yang sama, jika belum ada.

```typescript
if (saldo.dust === 0n) {
  log.error("Saldo DUST nol. DUST diperlukan untuk membayar biaya transaksi dan digenerasi dari NIGHT UTXO yang terdaftar.");
  log.error(`Isi wallet dengan tNight lewat faucet: ${faucetUrlFor(config.networkId)}`);
  process.exit(1);
}
```

- [ ] **Step 4: Jalankan terhadap preprod**

```bash
curl -s -m 3 http://127.0.0.1:6300/version   # pastikan proof server hidup
MIDNIGHT_WALLET_SEED=<seed Anda> pnpm cli preprod
```

Diharapkan: alamat unshielded tercetak, saldo NIGHT dan DUST bukan nol. **Sinkronisasi pertama memakan waktu** — wallet memindai dari genesis. Biarkan berjalan; jangan tambahkan optimasi birthday-offset (repo rujukan mencobanya dan membatalkannya: pohon commitment zswap menuntut penyisipan berurutan dari indeks 0, dan menambal offset merusak sinkronisasi).

- [ ] **Step 5: Commit**

```bash
git add pkgs/cli/src
git commit -m "feat(cli): wallet headless dari seed dengan pelaporan saldo"
```

---

### Task 4: Provider dan deploy registry

**Files:**
- Create: `pkgs/cli/src/providers.ts`, `pkgs/cli/src/deploy.ts`
- Modify: `pkgs/cli/src/preprod.ts`

**Interfaces:**
- Consumes: `KonteksWallet` dari Task 3.
- Produces: `rakitProviders(ctx, config, privateStateId, zkConfigPath)`, `deployRegistry(providers): Promise<string>` mengembalikan alamat kontrak.

- [ ] **Step 1: Tulis providers.ts**

```typescript
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import * as Rx from "rxjs";
import type { Config } from "./config.js";
import type { KonteksWallet } from "./wallet.js";

/**
 * Password store private state. levelPrivateStateProvider menolak password lemah:
 * minimal 16 karakter, tiga dari empat kelas karakter, tidak boleh empat karakter
 * berurutan maupun empat identik beruntun — dan diperiksa pada SETIAP baca-tulis.
 */
function passwordStore(accountId: string): string {
  return `${Buffer.from(accountId, "hex").toString("base64")}!Aa1`;
}

export async function rakitProviders(ctx: KonteksWallet, config: Config, privateStateStoreName: string, zkConfigPath: string) {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const accountId = state.shielded.coinPublicKey.toHexString();
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

  const walletProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    balanceTx: async (tx: unknown, ttl?: Date) => { /* pola dari rujukan api.ts:165-195 */ },
  };
  const midnightProvider = { submitTx: (tx: unknown) => ctx.wallet.submitTransaction(tx as never) };

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      accountId,
      privateStoragePasswordProvider: () => passwordStore(accountId),
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider,
  };
}
```

`balanceTx` menyalin pola rujukan `api.ts` baris 165–195 apa adanya, **termasuk penanganan bug SDK-nya**: `signRecipe` menanamkan penanda `pre-proof` secara hardcode saat mengkloning intent, padahal intent yang sudah terbukti membawa data `proof`, sehingga gagal dengan "Failed to clone intent". Rujukan menandatangani manual dengan penanda yang benar. Jangan hilangkan bagian itu.

- [ ] **Step 2: Tulis deploy registry**

```typescript
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { Registry, registryWitnesses, RegistryPrivateStateId, emptyRegistryPrivateState } from "contract";

export async function deployRegistry(providers: unknown): Promise<string> {
  const compiled = CompiledContract.withWitnesses(
    CompiledContract.make("registry", Registry.Contract as never),
    registryWitnesses,
  );
  const hasil = await deployContract(providers as never, {
    compiledContract: compiled as never,
    privateStateId: RegistryPrivateStateId,
    initialPrivateState: emptyRegistryPrivateState(),
    args: [] as never,
  });
  return (hasil as { deployTxData: { public: { contractAddress: string } } }).deployTxData.public.contractAddress;
}
```

- [ ] **Step 3: Jalankan deploy**

Tambahkan ke `preprod.ts` setelah pemeriksaan saldo:

```typescript
const providers = await rakitProviders(ctx, config, "votepriv-registry", "src/managed/registry");
const alamatRegistry = await deployRegistry(providers);
log.info({ alamatRegistry }, "Registry ter-deploy");
```

```bash
MIDNIGHT_WALLET_SEED=<seed Anda> pnpm cli preprod
```
Diharapkan: alamat kontrak tercetak. **Simpan alamat itu** — ia menjadi konstanta yang dipakai aplikasi.

Bila galatnya `ZKConfigurationReadError`, periksa `zkConfigPath` menunjuk direktori yang benar-benar memuat `keys/` dan `zkir/`. Bila galatnya menyebut versi runtime, naikkan `compact-runtime` ke versi yang disebut `contract-info.json`.

- [ ] **Step 4: Commit**

```bash
git add pkgs/cli/src
git commit -m "feat(cli): perakitan provider dan deploy kontrak registry"
```

---

### Task 5: Deploy ballot dan pendaftaran voter

**Files:**
- Modify: `pkgs/cli/src/deploy.ts`, `pkgs/cli/src/preprod.ts`

**Interfaces:**
- Consumes: `rakitProviders`, `deployRegistry` dari Task 4; `buatCredential`, `daunEligibility`, `detikDariSekarang`, `MENIT` dari `shared`.
- Produces: `deployBallot(providers, metadata): Promise<string>`, `daftarkanVoter(contract, daun[]): Promise<void>`, `catatKeRegistry(registryContract, alamatBallot): Promise<void>`.

- [ ] **Step 1: Tulis deployBallot**

Constructor menerima 14 argumen berurutan. Urutannya wajib persis: `title, description, community, option0, option1, option2, option3, optionCount, voteDeadline, tallyDeadline, quorumPercent, eligibleCount, eligibilityPolicy, ballotNonce`. Opsi yang tidak terpakai diisi string kosong.

Kontrak menolak: `optionCount` di luar 2..4, `tallyDeadline <= voteDeadline`, `eligibleCount` nol atau di atas 1024, dan `quorumPercent` di atas 100. Semua pesannya berbahasa Indonesia dan akan tampil apa adanya bila salah.

- [ ] **Step 2: Tulis daftarkanVoter**

`registerVoters(leaves: Vector<8, Bytes<32>>, n: Uint<8>)` menerima maksimal delapan daun per panggilan. Untuk jumlah voter di atas delapan, panggil berkali-kali; slot yang tidak terpakai diisi `new Uint8Array(32)`. Circuit hanya menyisipkan bila `n > i`, jadi slot nol tidak pernah masuk pohon.

Pendaftaran **tertutup begitu suara pertama masuk** (`assert(voteCount.read() == 0)`), jadi seluruh voter harus terdaftar sebelum pemungutan suara dimulai.

- [ ] **Step 3: Jalankan dengan deadline pendek**

```typescript
const metadata = {
  title: "Q4 Community Treasury",
  description: "Pilih arah dukungan treasury pada Q4.",
  community: "Midnight Builders",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  voteDeadline: detikDariSekarang(5 * MENIT),
  tallyDeadline: detikDariSekarang(15 * MENIT),
  quorumPercent: 60,
  eligibleCount: 3,
  eligibilityPolicy: "Tiga credential uji end-to-end",
};
```

Deadline sengaja pendek: uji Task 6 harus benar-benar menunggu waktu berlalu, karena waktu blok di jaringan nyata tidak bisa dimajukan.

```bash
MIDNIGHT_WALLET_SEED=<seed Anda> pnpm cli preprod
```
Diharapkan: alamat ballot tercetak, tiga credential tercetak (simpan!), dan `registeredCount` terbaca 3.

- [ ] **Step 4: Commit**

```bash
git add pkgs/cli/src
git commit -m "feat(cli): deploy ballot dengan metadata dan pendaftaran voter"
```

---

### Task 6: Uji end-to-end tiga pemilih di jaringan nyata

Inilah bukti yang tidak bisa diberikan simulator. Deadline benar-benar berlalu, proof benar-benar dibuat, dan transaksi benar-benar difinalisasi node.

**Files:**
- Create: `pkgs/cli/src/e2e.ts`
- Create: `pkgs/cli/src/vote.ts`

**Interfaces:**
- Consumes: seluruh keluaran Task 1–5.
- Produces: `jalankanE2E(config, seed): Promise<void>`.

- [ ] **Step 1: Tulis vote.ts**

`castVote` dan `tallyVote` menerima witness dari private state, bukan argumen. Sebelum tiap panggilan, tulis credential, option, salt, dan Merkle path ke private state **berkunci alamat kontrak** — bentuk yang ditetapkan gelombang perbaikan Rencana A.

Merkle path diturunkan dari state on-chain lewat `findPathForLeaf`, bukan dihitung sendiri.

- [ ] **Step 2: Tulis alur e2e**

```
1. Deploy registry (atau pakai yang sudah ada)
2. Deploy ballot: 3 opsi, voteDeadline +5 menit, tallyDeadline +15 menit, eligibleCount 3
3. Daftarkan 3 credential
4. Catat ke registry
5. Tiga pemilih mencoblos: opsi 0, opsi 2, opsi 0 — masing-masing dengan private state terpisah
6. Periksa: voteCount == 3, tallies KOSONG, talliedCount == 0
7. TUNGGU sampai voteDeadline lewat (waktu nyata, kira-kira 5 menit)
8. Ketiga pemilih membuka suaranya
9. Periksa: tally(0) == 2, tally(1) == 0, tally(2) == 1, talliedCount == 3
10. TUNGGU sampai tallyDeadline lewat
11. finalize
12. Periksa: phase == finalized
```

Langkah 6 adalah janji inti aplikasi dalam bentuk yang bisa dijalankan: selama pemungutan suara berlangsung, rantai memegang nullifier dan commitment, dan tidak ada hasil parsial yang bisa bocor.

- [ ] **Step 3: Jalankan**

```bash
MIDNIGHT_WALLET_SEED=<seed Anda> pnpm --filter cli exec node --experimental-strip-types src/e2e.ts
```

Perlu waktu sekitar 20 menit karena menunggu deadline nyata. Setiap pembuatan proof memakan 5–20 detik.

- [ ] **Step 4: Commit**

```bash
git add pkgs/cli/src
git commit -m "feat(cli): uji end-to-end tiga pemilih di preprod"
```

---

## Selesai bila

- Registry ter-deploy di preprod, alamatnya tercatat.
- Satu ballot ter-deploy dengan tiga credential terdaftar dan tercatat di registry.
- Uji end-to-end lulus: tiga suara masuk, tally kosong selama pemungutan suara, hasil akhir 2–0–1, ballot difinalisasi.
- Tidak ada seed yang pernah muncul di repo, log, atau keluaran terminal.

## Risiko dan jalur mundur

| Risiko | Jalur mundur |
|---|---|
| Sinkronisasi wallet pertama sangat lama | Biarkan berjalan; cache per jaringan membuat sesi berikutnya cepat. Jangan tambal offset |
| Bug SDK "Failed to clone intent" | Penandatanganan manual dengan penanda proof yang benar, seperti rujukan `api.ts` |
| Password private state ditolak | Kebijakan: ≥16 karakter, tiga kelas karakter, tanpa empat berurutan/identik |
| `ZKConfigurationReadError` | Periksa `zkConfigPath` memuat `keys/` dan `zkir/` |
| Versi runtime tidak cocok | Naikkan ke versi yang disebut `contract-info.json` |
| Endpoint preprod berbeda dari konstanta | Ambil dari wallet bila tersedia; konstanta hanya cadangan |

## Rencana berikutnya

**Rencana C — Integrasi aplikasi.** Migrasi `client/` ke `pkgs/app`, `PrivacyAdapter` dengan implementasi Mock dan Midnight, pemecahan `Home.tsx`, dan perubahan UI di spec §9.2. Bergantung pada B karena alamat registry dan bentuk provider baru pasti setelah deployment nyata.

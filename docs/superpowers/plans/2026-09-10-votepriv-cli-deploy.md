# VotePriv — Rencana Implementasi B: CLI dan Deployment Testnet

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: gunakan superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`).

**Goal:** Men-deploy kedua kontrak VotePriv ke Midnight **preview** dari wallet headless, lalu membuktikan seluruh rangkaiannya bekerja di jaringan nyata lewat satu uji tiga pemilih — dari pendaftaran sampai finalisasi.

> **Jaringannya preview, bukan preprod.** Sinkronisasi zswap preprod macet di indeks commitment ~1.500.100 dan direproduksi enam kali pada dua indexer dan dua generasi SDK — blokir di tingkat data rantai, di luar kendali kode ini. Buktinya ada di spec §11. `pkgs/cli/src/preprod.ts` sengaja dipertahankan supaya blokirnya dapat diperiksa ulang bila jaringan itu diperbaiki; ia bukan jalur eksekusi rencana ini.

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

**Task 4, 5 dan 6 sudah ditulis ulang dari dosir API yang terverifikasi, bukan lagi dari sketsa.** Versi pertama rencana ini menahan diri di ketiga tugas itu: permukaan wallet SDK Midnight — `WalletFacade`, ketiga sub-wallet, penurunan kunci HD, jembatan provider midnight-js — belum pernah dijalankan sendiri, dan menuliskannya verbatim berarti mengarang tanda tangan API. Task 3 berfungsi ganda sebagai spike untuk itu.

Spike itu sudah selesai, dan setelahnya setiap pemanggilan midnight-js, wallet-sdk, dan kontrak di Task 4–6 diperiksa satu per satu terhadap paket yang **benar-benar terpasang** di `pkgs/cli/node_modules` dan terhadap kode hasil compactc di `pkgs/contract/src/managed`: arity, tipe, overload yang dipilih, nilai bawaan yang hilang (`balanceTx` tanpa ttl), bentuk yang diterima (`ledger()` menerima `StateValue` maupun `ChargedState`), ekstensi berkas yang benar-benar dibaca (`.bzkir`, bukan `.zkir`), dan pesan assert kontrak apa adanya. Beberapa keputusan yang tampak sepele tercatat lengkap dengan alasannya justru karena ia hasil reproduksi, bukan ingatan — termasuk mengapa helper `signTransactionIntents` dari repo rujukan **tidak boleh** disalin (pada versi terpasang ia tidak diperlukan sekaligus tidak berfungsi).

Konsekuensinya untuk pengeksekusi: **tidak ada lagi langkah tanpa blok kode lengkap di Task 4–6, dan tidak ada langkah yang menyelesaikan ketidakpastian dengan cast atau dengan "terima saja hasilnya".** Pertanyaan yang dulu digantung — di mana assert deadline dievaluasi, lokal atau on-chain — dijawab di Task 6 Step 1 dari kode yang dihasilkan compactc, deterministik, tanpa wallet dan tanpa jaringan. Task 3 Step 2 tetap satu-satunya langkah yang menunjuk implementasi rujukan alih-alih memuat kodenya.

Yang **sudah** setara Rencana A sejak awal: Task 1 dan Task 2 lengkap dengan uji dan kode verbatim, dan seluruh temuan mahal dari Rencana A tertanam sebagai batasan — satuan detik, endpoint dari wallet, versi runtime, kebijakan password, dan keharusan `setNetworkId()`.

Satu batasan yang tetap nyata: Task 4–6 hanya bisa dibuktikan dengan menjalankannya di **preview** dengan wallet berdana. Uji unit di dalamnya menjaga helper murni; yang menjaga sisanya adalah tiga perintah `pnpm cli` di Task 4 Step 14, Task 5 Step 7, dan Task 6 Step 7 — dan sekitar 90 menit untuk yang terakhir.

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
```

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
pnpm cli preprod   # prompt interaktif tanpa gema
```

Diharapkan: alamat unshielded tercetak, saldo NIGHT dan DUST bukan nol. **Sinkronisasi pertama memakan waktu** — wallet memindai dari genesis. Biarkan berjalan; jangan tambahkan optimasi birthday-offset (repo rujukan mencobanya dan membatalkannya: pohon commitment zswap menuntut penyisipan berurutan dari indeks 0, dan menambal offset merusak sinkronisasi).

- [ ] **Step 5: Commit**

```bash
git add pkgs/cli/src
git commit -m "feat(cli): wallet headless dari seed dengan pelaporan saldo"
```

---

### Task 4: Provider midnight-js, pembungkus batas waktu, dan deploy kontrak `registry`

Tugas pertama yang membangun transaksi, bukan sekadar membaca. Empat provider non-wallet (ZK config, proof, indexer, private state) dirakit di sini, jembatan `WalletFacade → WalletProvider & MidnightProvider` ditulis di sini, pembungkus batas waktu yang dipakai **setiap** operasi jaringan di Task 4–6 lahir di sini, dan hasilnya dibuktikan dengan satu deploy nyata: kontrak `registry` di jaringan **preview**.

Kenapa preview dan bukan preprod: sinkronisasi zswap preprod macet di indeks commitment ~1,5 juta — direproduksi enam kali pada dua indexer dan dua generasi SDK (lihat laporan Task 3). Preview sinkron penuh. Seluruh Task 4–6 karena itu menargetkan preview; `PreprodConfig` dibiarkan utuh dan tidak dipakai.

Kenapa `tunggu.ts` lahir di Task 4 dan bukan Task 6: `watchForDeployTxData` dan `watchForTxData` didokumentasikan **tidak pernah timeout dan tidak pernah reject**, dan `deployContract`, `findDeployedContract`, serta `submitCallTx` ketiganya melewatinya. Deploy registry di Step 14 adalah transaksi pertama rencana ini — kalau ia ditolak konsensus, CLI akan diam selamanya tanpa pembungkus itu. Batas waktu harus ada sebelum transaksi pertama, bukan sesudah transaksi kesebelas.

Alamat registry yang dihasilkan langkah terakhir adalah **konstanta yang akan dipakai aplikasi di Rencana C**. Ia harus tersimpan ke berkas, bukan hanya tercetak — SDK wallet menulis galat sinkronisasi mentah langsung ke stdout, di luar pino, jadi stdout CLI ini bukan saluran yang boleh di-parse untuk mengambil alamat.

**Files:**
- Create: `pkgs/cli/src/wallet-provider.ts`, `pkgs/cli/src/kontrak.ts`, `pkgs/cli/src/tunggu.ts`, `pkgs/cli/src/providers.ts`, `pkgs/cli/src/artefak.ts`, `pkgs/cli/src/deploy.ts`, `pkgs/cli/src/bootstrap.ts`, `pkgs/cli/src/deploy-registry.ts`
- Test: `pkgs/cli/src/tunggu.test.ts`, `pkgs/cli/src/providers.test.ts`, `pkgs/cli/src/artefak.test.ts`
- Modify: `pkgs/cli/src/wallet.ts` (satu kata: ekspor `simpanCacheWallet`), `pkgs/cli/package.json` (skrip), `.gitignore`

**Interfaces:**
- Consumes: `KonteksWallet`, `bangunWallet`, `ringkasSaldo`, `simpanCacheWallet` (Task 3); `Config`, `PreviewConfig`, `currentDir` (Task 2); `bacaSeed`, `caraTurunanDariArgv` (Task 2); `buatLogger` (Task 2); `faucetUrlFor` (paket `shared`); `Registry`, `RegistryPrivateStateId`, `emptyRegistryPrivateState` (paket `contract`).
- Produces:
  - `pkgs/cli/src/wallet-provider.ts` — `buatWalletProvider(ctx: KonteksWallet): Promise<WalletProvider & MidnightProvider>`
  - `pkgs/cli/src/kontrak.ts` — `zkDir(nama: "ballot" | "registry"): string`; `kompilasiBallot(): CompiledContract<BallotC, never>`; `kompilasiRegistry(): CompiledContract<RegistryC, never>`; `SIRKUIT_BALLOT: readonly SirkuitBallot[]`; `SIRKUIT_REGISTRY: readonly SirkuitRegistry[]`; tipe `BallotC`, `RegistryC`, `SirkuitBallot`, `SirkuitRegistry`
  - `pkgs/cli/src/tunggu.ts` — `pastikan(kondisi: boolean, pesan: string): asserts kondisi`; `BATAS_MS` (objek konstanta batas waktu per operasi); `denganBatasWaktu<T>(janji: Promise<T>, ms: number, pesan: string): Promise<T>`; `ulangiSampai<T>(baca: () => Promise<T>, syarat: (nilai: T) => boolean, log: Logger, label: string, maks?: number, jedaMs?: number): Promise<HasilUlang<T>>`; tipe `HasilUlang<T> = { nilai: T | undefined; cocok: boolean; percobaan: number; galatTerakhir: string | undefined }`
  - `pkgs/cli/src/providers.ts` — `passwordStore(accountId: string): string`; `buatKonteksProvider(ctx: KonteksWallet, config: Config, log: Logger): Promise<KonteksProvider>`; `rakitProvidersRegistry(kp: KonteksProvider, namaStore: string): Promise<ProvidersRegistry>`; `rakitProvidersBallot(kp: KonteksProvider, namaStore: string): Promise<ProvidersBallot>`; tipe `KonteksProvider`, `ProvidersBallot`, `ProvidersRegistry`
  - `pkgs/cli/src/artefak.ts` — `pastikanAlamatKontrak(s: string): string`; `jalurArtefak(networkId: string, dir?: string): string`; `bacaArtefak(networkId: string, dir?: string): ArtefakDeploy | null`; `tulisArtefak(networkId: string, tambahan: Partial<ArtefakDeploy>, dir?: string): ArtefakDeploy`; `DIR_ARTEFAK: string`; tipe `ArtefakDeploy`
  - `pkgs/cli/src/deploy.ts` — `deployRegistry(providers: ProvidersRegistry, log: Logger): Promise<HasilDeployRegistry>`; `temukanRegistry(providers: ProvidersRegistry, alamat: string): Promise<FoundContract<RegistryC>>`; `bacaLedgerRegistry(publicDataProvider: PublicDataProvider, alamat: string): Promise<LedgerRegistry>`; tipe `HasilDeployRegistry = { alamat: string; kontrak: DeployedContract<RegistryC> }`, `LedgerRegistry = ReturnType<typeof Registry.ledger>`
  - `pkgs/cli/src/bootstrap.ts` — `siapkanSesi(): Promise<Sesi>`; `tutupSesi(sesi: Sesi, kode?: number): Promise<never>`; tipe `Sesi = { config: Config; log: Logger; ctx: KonteksWallet; kp: KonteksProvider }`
  - `pkgs/cli/src/deploy-registry.ts` — skrip tingkat-atas, **tidak mengekspor apa pun**

---

- [ ] **Step 1: Pastikan prasyarat di mesin ini sebelum menulis kode apa pun**

Tiga hal harus benar: paket `contract` sudah ter-build (CLI mengimpor `contract` yang resolve ke `dist/index.js`), artefak ZK ada di `src/managed` (bukan `dist/managed` — `dist/` masuk `.gitignore`, jadi jalur ZK harus menunjuk `src`), dan proof server hidup.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
pnpm --filter contract build
ls pkgs/contract/src/managed/ballot/keys pkgs/contract/src/managed/ballot/zkir
ls pkgs/contract/src/managed/registry/keys pkgs/contract/src/managed/registry/zkir
docker compose -f pkgs/cli/proof-server.yml up -d
curl -s -m 3 http://127.0.0.1:6300/health || curl -s -m 3 http://127.0.0.1:6300/version
```

Diharapkan: `keys/` ballot memuat `castVote.prover`, `finalize.prover`, `registerVoters.prover`, `tallyVote.prover`; `zkir/` memuat berkas berekstensi **`.bzkir`** (yang dibaca provider) berdampingan dengan `.zkir` (yang tidak dibaca — jangan dihapus, jangan diganti nama). `keys/` registry memuat `register.prover`. Proof server menjawab.

Bila `keys/` kosong: `pnpm --filter contract compact` lalu ulangi.

- [ ] **Step 2: Tulis jembatan wallet → provider**

Ini satu-satunya berkas yang menyentuh `WalletFacade` dari sisi midnight-js. Perhatikan bahwa **tidak ada** penandatanganan manual intent di sini: helper `signTransactionIntents` dari repo rujukan tidak boleh disalin — pada wallet-sdk-facade 4.0.1 helper itu tidak diperlukan (jalur `signRecipe` tidak punya penanda proof hardcode) *dan* tidak berfungsi (ia memanggil `tx.intents.set(...)` tanpa menugaskan balik, sedangkan getter `intents` ledger-v8 8.1.0 mengembalikan `Map` baru tiap kali dipanggil — jadi seluruh tanda tangan yang dihitungnya dibuang).

`pkgs/cli/src/wallet-provider.ts`:

```typescript
// Jembatan antara WalletFacade headless (wallet.ts) dan dua antarmuka yang
// diminta midnight-js: WalletProvider (menyeimbangkan + kunci publik) dan
// MidnightProvider (mengirim transaksi).
//
// CATATAN VERSI: berkas ini ditulis terhadap @midnight-ntwrk/wallet-sdk-facade
// 4.0.1 (yang benar-benar terpasang; lihat pnpm-lock.yaml), BUKAN 3.0.0 yang
// dipakai repo rujukan. Salinan 3.0.0 memang ada di pnpm store tapi yatim —
// tidak ada paket di workspace ini yang menunjuknya.
//
// SENGAJA TIDAK ADA penandatanganan intent manual di sini. Rujukan memakai
// helper `signTransactionIntents` untuk mengakali "Failed to clone intent".
// Pada versi yang terpasang, string galat itu tidak ada di paket mana pun
// maupun di wasm ledger-v8 8.1.0, jalur `signRecipe` untuk resep UNBOUND tidak
// menyentuh ProofMarker.preProof sama sekali, dan helper rujukan itu sendiri
// tidak berefek (getter `tx.intents` mengembalikan Map BARU setiap dipanggil,
// sehingga `tx.intents.set(...)` tanpa penugasan balik hilang begitu saja).
// Jangan porting helper itu ke sini.
import type { FinalizedTransaction, TransactionId } from "@midnight-ntwrk/ledger-v8";
import type { MidnightProvider, UnboundTransaction, WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import * as Rx from "rxjs";
import type { KonteksWallet } from "./wallet.ts";

/**
 * midnight-js memanggil `balanceTx(provenTx)` TANPA argumen ttl —
 * midnight-js-contracts 4.0.4 dist/index.mjs:199 persis begitu — padahal
 * `balanceUnboundTransaction` mewajibkan `options.ttl`. Jadi nilai bawaan
 * harus datang dari sini, atau setiap deploy dan setiap pemanggilan circuit
 * gagal. Satu jam adalah nilai yang sama dengan DEFAULT_TTL_MS milik facade
 * (private, tidak bisa diimpor) dan sama dengan `ttlOneHour()` milik
 * midnight-js-utils.
 */
const TTL_BAWAAN_MS = 60 * 60 * 1000;

export const buatWalletProvider = async (
  ctx: KonteksWallet,
): Promise<WalletProvider & MidnightProvider> => {
  // Pola sinkronisasi yang sama dengan ringkasSaldo: menuntut ketiga
  // sub-wallet sinkron SERENTAK. `waitForSyncedState()` memakai Promise.all
  // per sub-wallet sehingga momen "sinkron"-nya boleh tidak berimpitan —
  // bentuk Rx inilah yang benar.
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));

  return {
    // HEX, bukan bech32m. midnight-js menormalkan coin public key lewat
    // parseCoinPublicKeyToHex, tapi encryption key diteruskan MENTAH ke
    // pembuatan transaksi — `state.shielded.address.toString()` (bech32m) di
    // sini akan merusaknya tanpa pesan yang menunjuk ke sini.
    getCoinPublicKey: (): string => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: (): string => state.shielded.encryptionPublicKey.toHexString(),

    async balanceTx(tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction> {
      const resep = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + TTL_BAWAAN_MS) },
      );
      // Untuk transaksi deploy biasanya no-op (biaya dibayar DUST, tidak ada
      // ketidakseimbangan unshielded yang perlu ditandatangani). Tetap
      // dipanggil karena begitu ada penyeimbangan NIGHT, ia wajib.
      const ditandatangani = await ctx.wallet.signRecipe(resep, (data: Uint8Array) =>
        ctx.unshieldedKeystore.signData(data),
      );
      return ctx.wallet.finalizeRecipe(ditandatangani);
    },

    // Tidak perlu `as any`: TransactionIdentifier dan TransactionId sama-sama
    // string. Perhatikan bahwa submitTransaction MENUNGGU finalisasi node
    // (wait-level 'Finalized'), lalu midnight-js masih menunggu indexer lewat
    // watchForTxData — hitung menit per transaksi, bukan detik.
    submitTx: (tx: FinalizedTransaction): Promise<TransactionId> => ctx.wallet.submitTransaction(tx),
  };
};
```

- [ ] **Step 3: Tulis pembungkus kontrak terkompilasi**

Dua jebakan tipe hidup di berkas kecil ini, keduanya sudah direproduksi: `withCompiledFileAssets` **wajib** dirantai walau nilainya tidak pernah dibaca oleh alur midnight-js (tanpa itu `R` tersisa `CompiledAssetsPath` dan tsc menolak dengan `Type 'CompiledAssetsPath' is not assignable to type 'never'`), dan registry **tidak boleh** memakai `withWitnesses` (kontraknya tanpa witness, sehingga tipe parameternya menyempit jadi `never`).

`pkgs/cli/src/kontrak.ts`:

```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import type { Contract as CjsContract } from "@midnight-ntwrk/compact-js/effect/Contract";
import {
  Ballot,
  Registry,
  ballotWitnesses,
  type BallotPrivateState,
  type RegistryPrivateState,
} from "contract";

const dirIni = path.resolve(fileURLToPath(import.meta.url), "..");

export type BallotC = Ballot.Contract<BallotPrivateState>;
export type RegistryC = Registry.Contract<RegistryPrivateState>;

export type SirkuitBallot = CjsContract.ProvableCircuitId<BallotC>;
export type SirkuitRegistry = CjsContract.ProvableCircuitId<RegistryC>;

/**
 * Nama-nama ini BUKAN sekadar label: NodeZkConfigProvider membaca
 * `<dir>/keys/<circuitId>.prover` dan `<dir>/zkir/<circuitId>.bzkir`, jadi id
 * circuit dan nama berkas di disk harus cocok satu-satu. Dipakai untuk
 * memaksa kegagalan NYARING di awal (lihat pastikanArtefakZk di providers.ts).
 */
export const SIRKUIT_BALLOT: readonly SirkuitBallot[] = [
  "registerVoters",
  "castVote",
  "tallyVote",
  "finalize",
];
export const SIRKUIT_REGISTRY: readonly SirkuitRegistry[] = ["register"];

/**
 * Direktori yang MEMUAT `keys/` dan `zkir/` — bukan `keys/` itu sendiri.
 * Menunjuk `src/managed`, bukan `dist/managed`: `dist/` ada di .gitignore,
 * sehingga hanya salinan src yang dijamin ada di setiap checkout. Jalur
 * absolut, diturunkan dari URL modul: jalur relatif diselesaikan terhadap
 * process.cwd() oleh fs.readFile, dan cwd tidak dijamin apa pun.
 */
export const zkDir = (nama: "ballot" | "registry"): string =>
  path.resolve(dirIni, "..", "..", "contract", "src", "managed", nama);

/**
 * WAJIB memakai `.pipe(...)`, bukan pemanggilan data-first bersarang.
 * `withCompiledFileAssets(withWitnesses(make(...), w), p)` memang lolos tipe di
 * panggilan dalam, tapi hasil luarnya melebur jadi
 * `CompiledContract<Contract<unknown, ...>, unknown, unknown>` dan baru gagal
 * di `deployContract` dengan pesan yang menyesatkan ("Property 'impureCircuits'
 * is missing").
 *
 * `withCompiledFileAssets` wajib walau tidak ada satu pun dist midnight-js yang
 * memanggil `getCompiledAssetsPath` (sudah di-grep, nol hasil): tanpanya
 * parameter tipe `R` tidak pernah kosong dan `deployContract` menolaknya. Diisi
 * direktori managed yang sebenarnya supaya tidak menyesatkan pembaca berikutnya.
 */
export const kompilasiBallot = () =>
  CompiledContract.make<BallotC>("ballot", Ballot.Contract).pipe(
    CompiledContract.withWitnesses(ballotWitnesses),
    CompiledContract.withCompiledFileAssets(zkDir("ballot")),
  );

/**
 * `withVacantWitnesses`, BUKAN `withWitnesses(registryWitnesses)`.
 * registry.compact tidak mendeklarasikan witness apa pun, sehingga
 * `Contract.Witnesses<RegistryC>` melebur jadi `never` dan meneruskan objek
 * `registryWitnesses` yang diekspor paket contract adalah galat kompilasi
 * (`Argument of type '{}' is not assignable to parameter of type 'never'`),
 * bukan no-op yang senyap. Arity-nya 1 dan bukan dual — masuk ke .pipe()
 * tanpa tanda kurung pemanggilan.
 */
export const kompilasiRegistry = () =>
  CompiledContract.make<RegistryC>("registry", Registry.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(zkDir("registry")),
  );
```

- [ ] **Step 4: Tulis uji yang gagal untuk pembungkus batas waktu dan pembacaan-sampai-tenang**

Dua bahaya yang dijawab berkas ini, keduanya sudah terverifikasi pada build terpasang:

1. `watchForDeployTxData`/`watchForTxData` **tidak pernah timeout dan tidak pernah reject** — dan `deployContract`, `findDeployedContract`, `submitCallTx` semuanya melewatinya. Transaksi yang ditolak konsensus = proses diam selamanya.
2. Indexer tertinggal beberapa detik di belakang node. Membaca ledger tepat setelah sebuah transaksi sukses dapat mengembalikan angka lama, dan assert yang membandingkannya akan gagal dengan pesan yang terdengar seperti kegagalan produk padahal hanya keterlambatan indexer.

`pkgs/cli/src/tunggu.test.ts`:

```typescript
import type { Logger } from "pino";
import { describe, expect, it } from "vitest";
import { denganBatasWaktu, pastikan, ulangiSampai } from "./tunggu.ts";

// Logger palsu: uji ini tidak boleh menulis apa pun ke berkas log.
const logPalsu = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;

describe("pastikan", () => {
  it("diam bila benar, melempar pesan apa adanya bila salah", () => {
    expect(() => pastikan(true, "tidak akan terjadi")).not.toThrow();
    expect(() => pastikan(false, "tally harus kosong")).toThrow("tally harus kosong");
  });
});

describe("denganBatasWaktu", () => {
  it("meneruskan hasil bila selesai tepat waktu", async () => {
    await expect(denganBatasWaktu(Promise.resolve(42), 1000, "kelamaan")).resolves.toBe(42);
  });

  it("melempar pesan yang diberikan bila lewat batas", async () => {
    const menggantung = new Promise<never>(() => {});
    await expect(denganBatasWaktu(menggantung, 20, "kelamaan")).rejects.toThrow("kelamaan");
  });
});

describe("ulangiSampai", () => {
  it("mengembalikan nilai pertama bila syarat sudah terpenuhi", async () => {
    const hasil = await ulangiSampai(async () => 3n, (n) => n === 3n, logPalsu, "n === 3", 5, 1);
    expect(hasil.cocok).toBe(true);
    expect(hasil.nilai).toBe(3n);
    expect(hasil.percobaan).toBe(1);
  });

  it("mengulang sampai indexer menyusul", async () => {
    let ke = 0;
    const hasil = await ulangiSampai(
      async () => {
        ke += 1;
        return ke < 3 ? 0n : 3n;
      },
      (n) => n === 3n,
      logPalsu,
      "n === 3",
      10,
      1,
    );
    expect(hasil.cocok).toBe(true);
    expect(hasil.nilai).toBe(3n);
    expect(hasil.percobaan).toBe(3);
  });

  it("menyerah setelah maks percobaan tanpa melempar, membawa nilai terakhir", async () => {
    const hasil = await ulangiSampai(async () => 0n, (n) => n === 3n, logPalsu, "n === 3", 3, 1);
    expect(hasil.cocok).toBe(false);
    expect(hasil.nilai).toBe(0n);
    expect(hasil.percobaan).toBe(3);
    expect(hasil.galatTerakhir).toBeUndefined();
  });

  it("memperlakukan galat pembacaan sebagai 'belum siap' dan menyimpan pesannya", async () => {
    const hasil = await ulangiSampai<bigint>(
      async () => {
        throw new Error("Registry belum terlihat di indexer");
      },
      (n) => n === 3n,
      logPalsu,
      "n === 3",
      2,
      1,
    );
    expect(hasil.cocok).toBe(false);
    expect(hasil.nilai).toBeUndefined();
    expect(hasil.galatTerakhir).toMatch(/belum terlihat di indexer/);
  });
});
```

```bash
pnpm --filter cli exec vitest run src/tunggu.test.ts
```

Diharapkan: gagal saat resolusi impor — `Failed to resolve import "./tunggu.ts"`. Itu kegagalan yang benar untuk langkah ini.

- [ ] **Step 5: Implementasikan tunggu.ts sampai hijau**

`pkgs/cli/src/tunggu.ts`:

```typescript
import type { Logger } from "pino";

export function pastikan(kondisi: boolean, pesan: string): asserts kondisi {
  if (!kondisi) throw new Error(pesan);
}

/**
 * Anggaran waktu per jenis operasi jaringan, dalam milidetik.
 *
 * Setiap `await` ke midnight-js di rencana ini dibungkus salah satu nilai di
 * bawah. Angkanya dipilih dari waktu terukur terburuk (~2,5 menit per
 * transaksi pada preview) dikalikan margin besar, BUKAN dari tebakan: yang
 * dijaga bukan performa, melainkan perbedaan antara "gagal nyaring setelah N
 * menit" dan "diam selamanya".
 *
 * Perhatikan bahwa `TIMEOUT_PROOF_MS` milik httpClientProofProvider (10 menit,
 * lihat providers.ts) lebih kecil daripada `panggilBerat`/`deploy`. Itu
 * disengaja: bila yang macet adalah proof server, pesan galatnya datang dari
 * proof provider yang tahu circuit mana — jauh lebih informatif daripada
 * pesan generik di sini. Batas di bawah hanya menangkap yang lolos dari itu:
 * penantian node dan indexer yang memang tak berbatas.
 */
export const BATAS_MS = {
  /**
   * deployContract: satu proof ZK + penyeimbangan + finalisasi node +
   * watchForDeployTxData (tak berbatas secara desain). 15 menit ≈ 6× terburuk.
   */
  deploy: 15 * 60_000,
  /**
   * findDeployedContract: TANPA proof — watchForDeployTxData +
   * queryDeployContractState + queryContractState + getVerifierKeys +
   * verifyContractState. Semuanya indexer.
   */
  temukan: 5 * 60_000,
  /**
   * callTx.registerVoters / castVote / tallyVote — prover key 9,97-9,99 MB,
   * proof termahal di repo ini. Sama dengan anggaran deploy.
   */
  panggilBerat: 15 * 60_000,
  /** callTx.register (registry) dan callTx.finalize (ballot): prover kecil. */
  panggilRingan: 10 * 60_000,
  /** Satu queryContractState ke indexer. */
  bacaIndexer: 60_000,
  /** serializeState ketiga sub-wallet + wallet.stop() saat menutup sesi. */
  tutup: 60_000,
} as const;

/**
 * Batas waktu untuk operasi yang secara desain menunggu SELAMANYA.
 * `watchForTxData` dan `watchForDeployTxData` didokumentasikan "will never
 * timeout or reject", dan deployContract/submitCallTx/findDeployedContract
 * semuanya melewatinya — jadi transaksi yang ditolak konsensus membuat CLI
 * diam tanpa batas.
 *
 * PENTING: timeout di sini BUKAN izin untuk mengulang. Transaksi yang sudah
 * dikirim mungkin tetap mendarat; mengirim ulang berisiko memilih UTXO yang
 * sama dan membakar credential yang sama dua kali. Pada timeout, hentikan
 * proses dan periksa keadaan chain lebih dulu.
 *
 * `janji` yang kalah lomba TIDAK dibatalkan — tidak ada pembatalan pada
 * Promise. Operasinya tetap berjalan di latar sampai proses berakhir. Itu
 * sebabnya pemanggil wajib menghentikan proses setelah menangkap galat ini,
 * bukan melanjutkan ke langkah berikutnya.
 */
export const denganBatasWaktu = async <T>(janji: Promise<T>, ms: number, pesan: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      janji,
      new Promise<never>((_, tolak) => {
        timer = setTimeout(() => tolak(new Error(pesan)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export interface HasilUlang<T> {
  /** Nilai terakhir yang berhasil dibaca; undefined bila SETIAP pembacaan melempar. */
  readonly nilai: T | undefined;
  readonly cocok: boolean;
  readonly percobaan: number;
  /** Pesan galat pembacaan terakhir, bila ada. */
  readonly galatTerakhir: string | undefined;
}

/**
 * Membaca ulang sebuah nilai sampai syaratnya terpenuhi, dengan batas
 * percobaan. Ini penanganan KETERLAMBATAN INDEXER, dan ia harus berupa kode,
 * bukan catatan "coba baca lagi beberapa detik kemudian" di dokumen.
 *
 * Node memfinalisasi transaksi lebih dulu; indexer menyusul beberapa detik
 * kemudian. `queryContractState` tepat setelah sebuah transaksi sukses
 * karenanya bisa mengembalikan state lama — atau `null`. Assert yang langsung
 * membandingkan hasil itu akan gagal dengan pesan yang terdengar seperti
 * kegagalan produk ("PRIVASI BOCOR", "registeredCount seharusnya 3") padahal
 * yang terjadi hanya keterlambatan beberapa detik.
 *
 * TIDAK MELEMPAR. Galat pembacaan diperlakukan sebagai "belum siap" dan
 * dicoba lagi; kehabisan percobaan mengembalikan `cocok: false`. Pemanggil
 * yang memutuskan apa artinya — dan pemanggil pula yang menutup sesi dengan
 * benar (lihat `tutupSesi`), yang tidak mungkin dilakukan dari sini.
 */
export async function ulangiSampai<T>(
  baca: () => Promise<T>,
  syarat: (nilai: T) => boolean,
  log: Logger,
  label: string,
  maks = 12,
  jedaMs = 5_000,
): Promise<HasilUlang<T>> {
  let nilai: T | undefined;
  let galatTerakhir: string | undefined;

  for (let i = 1; i <= maks; i++) {
    try {
      nilai = await baca();
      galatTerakhir = undefined;
      if (syarat(nilai)) return { nilai, cocok: true, percobaan: i, galatTerakhir: undefined };
      log.info({ percobaan: i, dari: maks, label }, "Indexer belum menyusul; membaca ulang");
    } catch (e) {
      galatTerakhir = (e as Error).message ?? String(e);
      log.info({ percobaan: i, dari: maks, label, galat: galatTerakhir }, "Pembacaan indexer gagal; mencoba lagi");
    }
    if (i < maks) await new Promise((r) => setTimeout(r, jedaMs));
  }

  return { nilai, cocok: false, percobaan: maks, galatTerakhir };
}
```

```bash
pnpm --filter cli exec vitest run src/tunggu.test.ts
```

Diharapkan: `Test Files 1 passed`, **7 uji hijau** — berkas uji di Step 4 mendefinisikan tujuh blok `it()`: `pastikan` 1, `denganBatasWaktu` 2, `ulangiSampai` 4.

- [ ] **Step 6: Tulis uji yang gagal untuk kebijakan password private state**

`levelPrivateStateProvider` 4.0.4 memvalidasi password pada **setiap** baca dan tulis, dengan lima aturan yang semuanya sudah dipicu dan diverifikasi terhadap build terpasang. Password yang lolos "kadang-kadang" berarti store yang mati permanen untuk wallet tertentu, jadi pembangkitnya harus lolos **selalu**, bukan hampir selalu.

Perhatikan `vi.stubEnv` di bawah. Tanpa itu uji ini bergantung pada lingkungan: `passwordStore` mengembalikan `VOTEPRIV_PRIVATE_STATE_PASSWORD` apa adanya bila variabel itu terisi, sehingga di mesin yang menyetelnya uji "berbeda antar accountId" akan gagal (dua accountId menghasilkan password yang sama) dan uji kebijakan akan menguji password pengguna, bukan pembangkit kita. Nilai `""` dipilih karena implementasinya memeriksa `dariEnv.length > 0` — string kosong berarti "pakai turunan".

`pkgs/cli/src/providers.test.ts`:

```typescript
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zkDir, SIRKUIT_BALLOT, SIRKUIT_REGISTRY } from "./kontrak.ts";
import { passwordStore } from "./providers.ts";

/**
 * Replika aturan validasi milik levelPrivateStateProvider 4.0.4
 * (dist/index.mjs:175-251), ditulis ulang di sini supaya uji ini gagal bila
 * pembangkit kita melanggarnya — validator aslinya tidak diekspor.
 * MIN_PASSWORD_LENGTH=16, MIN_CHARACTER_CLASSES=3, MAX_CONSECUTIVE_REPEATED=3,
 * MIN_SEQUENTIAL_LENGTH=4.
 */
function langgaranKebijakan(pw: string): string[] {
  const langgar: string[] = [];
  if (pw.length < 16) langgar.push(`panjang ${pw.length} < 16`);

  const kelas = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (kelas < 3) langgar.push(`kelas karakter ${kelas} < 3`);

  let beruntun = 1;
  for (let i = 1; i < pw.length; i++) {
    beruntun = pw[i] === pw[i - 1] ? beruntun + 1 : 1;
    if (beruntun > 3) langgar.push(`4 karakter identik beruntun di indeks ${i}`);
  }

  const kecil = pw.toLowerCase();
  for (let i = 0; i + 3 < kecil.length; i++) {
    const d = [1, 2, 3].map((k) => kecil.charCodeAt(i + k) - kecil.charCodeAt(i + k - 1));
    if (d.every((x) => x === 1) || d.every((x) => x === -1)) {
      langgar.push(`4 charCode berurutan mulai indeks ${i}: "${kecil.slice(i, i + 4)}"`);
    }
  }
  return langgar;
}

describe("passwordStore", () => {
  // Menetralkan override lingkungan. Tanpa ini, mesin yang kebetulan
  // menyetel VOTEPRIV_PRIVATE_STATE_PASSWORD membuat kedua uji pertama
  // menguji hal yang berbeda dari yang dimaksud — dan uji "berbeda antar
  // accountId" gagal, karena override memintas seluruh penurunan.
  beforeEach(() => {
    vi.stubEnv("VOTEPRIV_PRIVATE_STATE_PASSWORD", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lolos seluruh aturan kebijakan untuk 500 accountId acak", () => {
    for (let i = 0; i < 500; i++) {
      const accountId = crypto.randomBytes(32).toString("hex");
      const pw = passwordStore(accountId);
      expect(langgaranKebijakan(pw), `accountId ${accountId} menghasilkan password yang melanggar`).toEqual([]);
    }
  });

  it("deterministik per accountId dan berbeda antar accountId", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    expect(passwordStore(a)).toBe(passwordStore(a));
    expect(passwordStore(a)).not.toBe(passwordStore(b));
  });

  it("memakai VOTEPRIV_PRIVATE_STATE_PASSWORD apa adanya bila disetel", () => {
    vi.stubEnv("VOTEPRIV_PRIVATE_STATE_PASSWORD", "Qz7#mVx9Lp2$Kw4!");
    expect(passwordStore("a".repeat(64))).toBe("Qz7#mVx9Lp2$Kw4!");
    expect(passwordStore("b".repeat(64))).toBe("Qz7#mVx9Lp2$Kw4!");
  });

  it("replika kebijakan benar-benar menolak contoh yang ditolak pustaka aslinya", () => {
    expect(langgaranKebijakan("Qz7#mVx9Lp2$Kw4!")).toEqual([]); // diketahui lolos
    expect(langgaranKebijakan("abcdABCD1234!!!!").length).toBeGreaterThan(0);
    expect(langgaranKebijakan("Qz7#mVx9Lp2$Kw")).toContain("panjang 14 < 16");
  });
});

describe("zkDir", () => {
  it("menunjuk direktori yang memuat keys/ dan zkir/ untuk kedua kontrak", () => {
    for (const [nama, sirkuit] of [
      ["ballot", SIRKUIT_BALLOT],
      ["registry", SIRKUIT_REGISTRY],
    ] as const) {
      const dir = zkDir(nama);
      expect(fs.existsSync(path.join(dir, "keys")), `${dir}/keys tidak ada`).toBe(true);
      expect(fs.existsSync(path.join(dir, "zkir")), `${dir}/zkir tidak ada`).toBe(true);
      for (const id of sirkuit) {
        expect(fs.existsSync(path.join(dir, "keys", `${id}.prover`)), `${id}.prover hilang`).toBe(true);
        expect(fs.existsSync(path.join(dir, "keys", `${id}.verifier`)), `${id}.verifier hilang`).toBe(true);
        // Ekstensi yang dibaca provider adalah .bzkir, bukan .zkir.
        expect(fs.existsSync(path.join(dir, "zkir", `${id}.bzkir`)), `${id}.bzkir hilang`).toBe(true);
      }
    }
  });
});
```

```bash
pnpm --filter cli exec vitest run src/providers.test.ts
```

Diharapkan: gagal saat resolusi impor — `Failed to resolve import "./providers.ts"` (berkasnya belum ada). Itu kegagalan yang benar untuk langkah ini.

- [ ] **Step 7: Tulis providers.ts sampai uji hijau**

`pkgs/cli/src/providers.ts`:

```typescript
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ContractProviders } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type {
  MidnightProvider,
  PublicDataProvider,
  WalletProvider,
  ZKConfigProvider,
} from "@midnight-ntwrk/midnight-js-types";
import {
  BallotPrivateStateId,
  RegistryPrivateStateId,
  type BallotPrivateState,
  type RegistryPrivateState,
} from "contract";
import type { Logger } from "pino";
import { currentDir, type Config } from "./config.ts";
import {
  SIRKUIT_BALLOT,
  SIRKUIT_REGISTRY,
  zkDir,
  type BallotC,
  type RegistryC,
  type SirkuitBallot,
  type SirkuitRegistry,
} from "./kontrak.ts";
import { buatWalletProvider } from "./wallet-provider.ts";
import type { KonteksWallet } from "./wallet.ts";

export type ProvidersBallot = ContractProviders<BallotC>;
export type ProvidersRegistry = ContractProviders<RegistryC>;

// ─── Password store private state ───────────────────────────────────────────
//
// levelPrivateStateProvider 4.0.4 mengenkripsi private state di disk dengan
// AES-256-GCM dan MEMVALIDASI password pada SETIAP operasi baca/tulis, bukan
// sekali saat dibuka. Aturannya (diverifikasi dengan memicu tiap pesannya):
//   1. wajib ada
//   2. panjang >= 16
//   3. maksimal 3 karakter identik beruntun
//   4. minimal 3 dari 4 kelas: huruf kecil, huruf besar, angka, simbol
//   5. tidak boleh ada 4 charCode berurutan naik ATAU turun, dicek pada string
//      yang SUDAH di-lowercase — jadi "abcd", "1234", "dcba", bahkan "()*+"
//      semuanya ditolak
//
// Aturan 5 itulah alasan pendekatan naif (base64 dari kunci publik + akhiran)
// berbahaya: alfabet base64 punya banyak rentang berurutan, sehingga password
// akan lolos untuk hampir semua wallet dan gagal PERMANEN untuk sebagian kecil.
// Di sini password dibangun dari empat alfabet yang setiap anggotanya berjarak
// >= 2 charCode dari anggota mana pun (juga setelah di-lowercase), dan posisi
// bergilir antar kelas — sehingga aturan 3, 4 dan 5 dipenuhi SECARA KONSTRUKSI,
// bukan secara kebetulan.
const ALFABET: readonly string[] = [
  "acegikmoqsuwy", // huruf kecil, berjarak 2
  "ACEGIKMOQSUWY", // huruf besar; setelah lowercase tetap berjarak 2 dari yang di atas
  "13579", // angka, berjarak 2
  "#%+", // simbol, berjarak >= 2, jauh dari angka dan huruf
];

const PANJANG_PASSWORD = 24;

/**
 * PERINGATAN KEAMANAN YANG JUJUR: password ini diturunkan dari `accountId`,
 * yang adalah coin public key wallet — data PUBLIK. Enkripsi store karenanya
 * melindungi dari pembacaan disk yang tidak sengaja (backup, indexer berkas,
 * mata yang lewat), BUKAN dari penyerang yang tahu kunci publik wallet dan
 * memegang berkas LevelDB-nya. Untuk pemakaian sungguhan, setel
 * VOTEPRIV_PRIVATE_STATE_PASSWORD dan password itulah yang dipakai.
 */
export function passwordStore(accountId: string): string {
  const dariEnv = process.env.VOTEPRIV_PRIVATE_STATE_PASSWORD;
  if (dariEnv !== undefined && dariEnv.length > 0) return dariEnv;

  const benih = crypto.createHash("sha256").update(`votepriv:private-state:v1:${accountId}`).digest();
  let pw = "";
  for (let i = 0; i < PANJANG_PASSWORD; i++) {
    const alfabet = ALFABET[i % ALFABET.length];
    pw += alfabet[benih[i % benih.length] % alfabet.length];
  }
  return pw;
}

// ─── Konteks bersama ────────────────────────────────────────────────────────

export interface KonteksProvider {
  readonly config: Config;
  readonly publicDataProvider: PublicDataProvider;
  readonly dompet: WalletProvider & MidnightProvider;
  readonly accountId: string;
  readonly log: Logger;
}

/**
 * publicDataProvider dan jembatan wallet dibuat SEKALI dan dipakai bersama
 * seluruh objek providers. Yang TIDAK bisa dipakai bersama adalah
 * zkConfigProvider dan privateStateProvider: MidnightProviders menaruh id
 * circuit di ZKConfigProvider<PCK> dan tipe private state di
 * PrivateStateProvider<PSI, PS>, keduanya di posisi tipe kembalian, sehingga
 * tidak ada pelebaran tipe yang bisa membuat satu objek melayani kedua
 * kontrak (sudah dicoba: `MidnightProviders<string, ...>` dan gabungan union
 * keduanya sama-sama galat kompilasi). Direktori ZK-nya memang berbeda juga.
 *
 * Tiga parameter, bukan dua: `log` disimpan di konteks supaya setiap perakit
 * provider dan setiap pemanggil punya logger yang sama tanpa variabel global.
 */
export async function buatKonteksProvider(
  ctx: KonteksWallet,
  config: Config,
  log: Logger,
): Promise<KonteksProvider> {
  const dompet = await buatWalletProvider(ctx);
  return {
    config,
    log,
    dompet,
    accountId: dompet.getCoinPublicKey(),
    // Skema URL divalidasi saat konstruksi: query wajib http/https,
    // subscription wajib ws/wss. Tertukar = InvalidProtocolSchemeError.
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
  };
}

/**
 * Direktori LevelDB private state. SATU direktori per identitas (admin,
 * pemilih-0, ...) — bukan kemewahan: levelPrivateStateProvider MEMBUKA dan
 * MENUTUP seluruh LevelDB pada setiap operasi, sehingga dua operasi yang
 * tumpang tindih pada direktori yang sama bertabrakan di berkas LOCK dan
 * melempar NotOpenError / LEVEL_LOCKED. Itu sudah diukur pada build terpasang.
 */
const dirPrivateState = (networkId: string, namaStore: string): string => {
  const dir = path.resolve(currentDir, "..", "private-state", networkId, namaStore);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * httpClientProofProvider MENELAN galat konfigurasi ZK diam-diam: bila
 * `zkConfigProvider.get(circuitId)` melempar (jalur salah, berkas hilang, id
 * tidak cocok), ia menangkapnya dan mengirim permintaan ke proof server tanpa
 * key material — gagalnya jauh kemudian, dengan pesan proof server yang tidak
 * menunjuk ke mana-mana. Karena itu kunci verifier dibaca paksa lebih dulu di
 * sini, supaya jalur yang salah gagal SEKARANG dengan ENOENT yang menyebut
 * nama berkasnya.
 */
async function pastikanArtefakZk<K extends string>(
  zk: ZKConfigProvider<K>,
  sirkuit: readonly K[],
  dir: string,
): Promise<void> {
  try {
    await zk.getVerifierKeys([...sirkuit]);
  } catch (e) {
    throw new Error(
      `Artefak ZK tidak terbaca di ${dir} (butuh keys/<circuit>.prover, keys/<circuit>.verifier, zkir/<circuit>.bzkir untuk ${sirkuit.join(", ")}). Penyebab: ${(e as Error).message}`,
    );
  }
}

/**
 * 10 menit. Sengaja LEBIH KECIL daripada BATAS_MS.deploy dan
 * BATAS_MS.panggilBerat (15 menit) di tunggu.ts: bila yang macet adalah proof
 * server, pesan galat dari proof provider menyebut circuit-nya, sedangkan
 * pembungkus batas waktu generik tidak.
 */
const TIMEOUT_PROOF_MS = 600_000;

export async function rakitProvidersRegistry(kp: KonteksProvider, namaStore: string): Promise<ProvidersRegistry> {
  const dir = zkDir("registry");
  const zkConfigProvider = new NodeZkConfigProvider<SirkuitRegistry>(dir);
  await pastikanArtefakZk(zkConfigProvider, SIRKUIT_REGISTRY, dir);

  return {
    privateStateProvider: levelPrivateStateProvider<typeof RegistryPrivateStateId, RegistryPrivateState>({
      midnightDbName: dirPrivateState(kp.config.networkId, namaStore),
      accountId: kp.accountId,
      privateStoragePasswordProvider: () => passwordStore(kp.accountId),
    }),
    publicDataProvider: kp.publicDataProvider,
    zkConfigProvider,
    // Satu proof provider per kontrak: ia terikat pada zkConfigProvider-nya.
    // Memakai ulang proof provider registry untuk ballot akan menabrak
    // penelanan galat di atas dan gagal senyap.
    proofProvider: httpClientProofProvider(kp.config.proofServer, zkConfigProvider, {
      // Timeout HANYA berlaku bila diberikan di sini. ProveTxConfig yang
      // diteruskan ke proveTx() diabaikan (parameternya berawalan underscore
      // dan tidak dipakai). Bawaannya 300_000 ms; prover key castVote dan
      // registerVoters ~10 MB, jadi dinaikkan.
      timeout: TIMEOUT_PROOF_MS,
    }),
    walletProvider: kp.dompet,
    midnightProvider: kp.dompet,
  };
}

export async function rakitProvidersBallot(kp: KonteksProvider, namaStore: string): Promise<ProvidersBallot> {
  const dir = zkDir("ballot");
  const zkConfigProvider = new NodeZkConfigProvider<SirkuitBallot>(dir);
  await pastikanArtefakZk(zkConfigProvider, SIRKUIT_BALLOT, dir);

  return {
    privateStateProvider: levelPrivateStateProvider<typeof BallotPrivateStateId, BallotPrivateState>({
      midnightDbName: dirPrivateState(kp.config.networkId, namaStore),
      accountId: kp.accountId,
      privateStoragePasswordProvider: () => passwordStore(kp.accountId),
    }),
    publicDataProvider: kp.publicDataProvider,
    zkConfigProvider,
    proofProvider: httpClientProofProvider(kp.config.proofServer, zkConfigProvider, { timeout: TIMEOUT_PROOF_MS }),
    walletProvider: kp.dompet,
    midnightProvider: kp.dompet,
  };
}
```

```bash
pnpm --filter cli exec vitest run src/providers.test.ts
```

Diharapkan: `Test Files 1 passed`, **5 uji hijau** (passwordStore 4, zkDir 1).

- [ ] **Step 8: Tulis artefak.ts dan ujinya**

Alamat kontrak tidak boleh diambil dengan mem-parse stdout: SDK wallet menulis galat sinkronisasi mentah langsung ke stdout, di luar pino, dan bisa bercampur dengan baris mana pun. Alamat dikembalikan lewat nilai fungsi, lalu disimpan ke JSON.

`pkgs/cli/src/artefak.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { currentDir } from "./config.ts";

export const DIR_ARTEFAK = path.resolve(currentDir, "..", "artefak");

/**
 * Alamat kontrak Midnight: 64 karakter heksadesimal huruf kecil, TANPA awalan
 * "0x". midnight-js memvalidasinya dengan assertIsContractAddress
 * (CONTRACT_ADDRESS_BYTE_LENGTH = 32) yang MELEMPAR TypeError bila ada awalan
 * "0x". Apa pun yang kita simpan harus mempertahankan bentuk itu persis —
 * jangan pernah mengubah huruf besar/kecilnya, memberi awalan, atau
 * meng-encode bech32.
 */
export function pastikanAlamatKontrak(s: string): string {
  if (!/^[0-9a-f]{64}$/.test(s)) {
    throw new Error(
      `Alamat kontrak harus 64 karakter heksadesimal huruf kecil tanpa awalan "0x"; yang diberikan panjang ${s.length}.`,
    );
  }
  return s;
}

/**
 * Bentuk ballot: satu deploy ballot beserta deadline, opsi, dan credential
 * pemilihnya. Sama untuk `deploy-ballot.ts` (top-level, lihat `ArtefakDeploy`)
 * maupun `e2e.ts` (di bawah kunci `e2e`, lihat catatan di `ArtefakDeploy.e2e`).
 */
export interface ArtefakBallot {
  ballot?: string;
  voteDeadline?: string;
  tallyDeadline?: string;
  options?: string[];
  /**
   * Credential pemilih dalam hex. INI BAHAN UJI, bukan pola produksi: pada
   * pemakaian sungguhan credential diserahkan ke masing-masing pemilih di luar
   * jalur ini dan tidak pernah berkumpul di satu berkas. Direktori artefak
   * masuk .gitignore.
   */
  credentials?: string[];
}

/** Deadline disimpan sebagai string: JSON tidak punya bigint. */
export interface ArtefakDeploy extends ArtefakBallot {
  networkId: string;
  /**
   * Alamat registry. DIMILIKI BERSAMA oleh `deploy-registry.ts` dan
   * `e2e.ts` (yang memakai ulang registry dari sesi sebelumnya bila sudah
   * ada) — keduanya menunjuk SATU registry sungguhan yang sama di chain,
   * jadi menulis field ini dari kedua tempat itu bukan tabrakan, melainkan
   * dua penulis yang mencatat fakta yang sama.
   */
  registry?: string;
  /**
   * Ballot milik `pnpm cli e2e`, TERPISAH TOTAL dari field ballot/
   * voteDeadline/tallyDeadline/options/credentials di atas (yang dimiliki
   * SOLELY oleh `deploy-ballot.ts`).
   *
   * Fix seam Task 6/7: sebelumnya `e2e.ts` menulis kelima field itu langsung
   * ke top-level lewat `tulisArtefak` yang MERGE, bukan timpa — tapi merge
   * per FIELD berarti field yang sama (mis. `ballot`) tetap saling menimpa.
   * Menjalankan `pnpm cli e2e` setelah `pnpm cli deploy-ballot` diam-diam
   * menghancurkan ballot yang sudah dibayar dan didaftarkan tiga pemilih
   * oleh deploy-ballot: alamat dan credential-nya tertimpa alamat/credential
   * ballot e2e, dan satu-satunya salinan credential lama (yang HANYA hidup
   * di berkas ini) hilang selamanya. Namespace ini menutup celah itu: e2e
   * menulis di sini, deploy-ballot menulis di top-level, dan tidak satu pun
   * boleh membaca field milik yang lain.
   */
  e2e?: ArtefakBallot;
  diperbarui?: string;
}

export const jalurArtefak = (networkId: string, dir: string = DIR_ARTEFAK): string =>
  path.join(dir, `${networkId}.json`);

export function bacaArtefak(networkId: string, dir: string = DIR_ARTEFAK): ArtefakDeploy | null {
  const p = jalurArtefak(networkId, dir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as ArtefakDeploy;
}

/** Merge, bukan timpa: deploy ballot tidak boleh menghapus alamat registry. */
export function tulisArtefak(
  networkId: string,
  tambahan: Partial<ArtefakDeploy>,
  dir: string = DIR_ARTEFAK,
): ArtefakDeploy {
  fs.mkdirSync(dir, { recursive: true });
  const lama = bacaArtefak(networkId, dir) ?? { networkId };
  const baru: ArtefakDeploy = { ...lama, ...tambahan, networkId, diperbarui: new Date().toISOString() };
  fs.writeFileSync(jalurArtefak(networkId, dir), `${JSON.stringify(baru, null, 2)}\n`, "utf8");
  return baru;
}
```

`pkgs/cli/src/artefak.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bacaArtefak, pastikanAlamatKontrak, tulisArtefak } from "./artefak.ts";

const dirSementara = () => fs.mkdtempSync(path.join(os.tmpdir(), "votepriv-artefak-"));

describe("pastikanAlamatKontrak", () => {
  it("menerima 64 hex huruf kecil", () => {
    const a = "ab".repeat(32);
    expect(pastikanAlamatKontrak(a)).toBe(a);
  });

  it("menolak awalan 0x, panjang salah, dan huruf besar", () => {
    expect(() => pastikanAlamatKontrak(`0x${"ab".repeat(32)}`)).toThrow(/64 karakter/);
    expect(() => pastikanAlamatKontrak("ab".repeat(31))).toThrow(/64 karakter/);
    expect(() => pastikanAlamatKontrak("AB".repeat(32))).toThrow(/64 karakter/);
  });
});

describe("tulisArtefak", () => {
  it("menggabungkan, tidak menimpa entri sebelumnya", () => {
    const dir = dirSementara();
    tulisArtefak("preview", { registry: "aa".repeat(32) }, dir);
    tulisArtefak("preview", { ballot: "bb".repeat(32), voteDeadline: "1757000000" }, dir);

    const hasil = bacaArtefak("preview", dir);
    expect(hasil?.registry).toBe("aa".repeat(32));
    expect(hasil?.ballot).toBe("bb".repeat(32));
    expect(hasil?.voteDeadline).toBe("1757000000");
    expect(hasil?.networkId).toBe("preview");
  });

  it("mengembalikan null bila belum ada artefak", () => {
    expect(bacaArtefak("preview", dirSementara())).toBeNull();
  });
});
```

```bash
pnpm --filter cli exec vitest run src/artefak.test.ts
```

Diharapkan: **4 uji hijau**.

- [ ] **Step 9: Tulis deploy.ts dengan deployRegistry dan pembaca ledger**

Dua keputusan bentuk di berkas ini, keduanya menghemat menit-menit di jaringan nyata:

- **`deployRegistry` mengembalikan handle kontraknya, bukan hanya alamat.** `DeployedContract<C>` adalah `FoundContract<C> & { deployTxData }` — hasil deploy SUDAH membawa `callTx`. Membuangnya dan memanggil `temukanRegistry` sesudahnya berarti satu `watchForDeployTxData` (tak berbatas), satu `queryDeployContractState`, satu `queryContractState`, satu `getVerifierKeys`, dan satu `verifyContractState` yang seluruhnya tidak perlu.
- **Setiap `await` ke jaringan dibungkus `denganBatasWaktu`.** Tidak satu pun operasi midnight-js di berkas ini boleh menggantung tanpa batas.

`pkgs/cli/src/deploy.ts`:

```typescript
import {
  deployContract,
  findDeployedContract,
  type DeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import { Registry, RegistryPrivateStateId, emptyRegistryPrivateState } from "contract";
import type { Logger } from "pino";
import { pastikanAlamatKontrak } from "./artefak.ts";
import { kompilasiRegistry, type RegistryC } from "./kontrak.ts";
import type { ProvidersRegistry } from "./providers.ts";
import { BATAS_MS, denganBatasWaktu } from "./tunggu.ts";

export type LedgerRegistry = ReturnType<typeof Registry.ledger>;

export interface HasilDeployRegistry {
  readonly alamat: string;
  /** Handle lengkap dari deploy — sudah memuat callTx. Jangan dibuang. */
  readonly kontrak: DeployedContract<RegistryC>;
}

/**
 * Deploy kontrak registry.
 *
 * Memakai overload BER-private-state, bukan yang tanpa. Overload pertama
 * dibatasi `Contract<undefined>`; RegistryPrivateState adalah
 * `Record<string, never>`, dan itu BUKAN `undefined` — jadi registry pun wajib
 * lewat jalur privateStateId + initialPrivateState.
 *
 * TIDAK ADA field `args` di sini: `initialState` registry tidak menerima
 * parameter selain context, sehingga `Contract.InitializeParameters` melebur
 * jadi `[]` dan tipe opsinya tidak punya kunci `args` sama sekali —
 * menambahkan `args: []` adalah galat properti berlebih, bukan no-op.
 *
 * `signingKey` dibiarkan kosong: deployContract mengambil sampel sendiri dan
 * menyimpannya di privateStateProvider di bawah alamat baru.
 */
export async function deployRegistry(providers: ProvidersRegistry, log: Logger): Promise<HasilDeployRegistry> {
  log.info(
    { batasMenit: BATAS_MS.deploy / 60_000 },
    "Men-deploy kontrak registry (menyusun transaksi, membuat proof, menunggu finalisasi — hitung menit)",
  );

  const kontrak = await denganBatasWaktu(
    deployContract(providers, {
      compiledContract: kompilasiRegistry(),
      privateStateId: RegistryPrivateStateId,
      initialPrivateState: emptyRegistryPrivateState(),
    }),
    BATAS_MS.deploy,
    `deployContract(registry) tidak selesai dalam ${BATAS_MS.deploy / 60_000} menit. watchForDeployTxData menunggu selamanya secara desain, jadi ini biasanya berarti transaksinya ditolak konsensus atau proof server/indexer tidak menjawab. JANGAN mengirim ulang sebelum memeriksa keadaan chain: transaksinya mungkin sudah mendarat.`,
  );

  const alamat = pastikanAlamatKontrak(kontrak.deployTxData.public.contractAddress);
  log.info(
    {
      alamat,
      txId: kontrak.deployTxData.public.txId,
      status: kontrak.deployTxData.public.status,
      blockHeight: kontrak.deployTxData.public.blockHeight,
    },
    "Registry ter-deploy",
  );
  return { alamat, kontrak };
}

/**
 * Menemukan registry yang sudah ter-deploy.
 *
 * HANYA untuk registry yang di-deploy pada SESI LAIN. Bila registry baru saja
 * di-deploy pada proses ini, pakai `kontrak` dari `deployRegistry` — fungsi ini
 * mengulang lima perjalanan pulang-pergi ke indexer tanpa perlu.
 *
 * `initialPrivateState` SELALU disertakan (varian "store"), bukan hanya
 * `privateStateId`. Alasannya: varian yang hanya membawa privateStateId
 * MELEMPAR bila belum ada apa pun tersimpan di pasangan (alamat, id) itu — dan
 * itu keadaan normal untuk direktori private state yang baru atau mesin lain.
 * Private state registry kosong, jadi menuliskannya ulang tidak menghilangkan
 * apa pun.
 */
export async function temukanRegistry(
  providers: ProvidersRegistry,
  alamat: string,
): Promise<FoundContract<RegistryC>> {
  return denganBatasWaktu(
    findDeployedContract(providers, {
      compiledContract: kompilasiRegistry(),
      contractAddress: pastikanAlamatKontrak(alamat),
      privateStateId: RegistryPrivateStateId,
      initialPrivateState: emptyRegistryPrivateState(),
    }),
    BATAS_MS.temukan,
    `findDeployedContract(registry ${alamat}) tidak selesai dalam ${BATAS_MS.temukan / 60_000} menit. Periksa indexer dan pastikan alamat itu memang milik jaringan ini — findDeployedContract menunggu watchForDeployTxData yang tidak pernah timeout sendiri.`,
  );
}

/**
 * Membaca ledger registry dari indexer.
 *
 * `queryContractState` mengembalikan `ContractState | null`; `.data` bertipe
 * `ChargedState`, dan `ledger()` hasil compactc menerima `StateValue` MAUPUN
 * `ChargedState` — baris pertama fungsi `ledger` yang dihasilkan compactc
 * (`pkgs/contract/src/managed/registry/contract/index.js:222-224`) melakukan
 * percabangan `instanceof StateValue` justru untuk itu. Tidak ada cast yang
 * dibutuhkan di sini, dan tidak boleh ada yang ditambahkan: cast akan
 * menyembunyikan kesalahan nyata (mis. state milik kontrak lain) alih-alih
 * memunculkannya.
 */
export async function bacaLedgerRegistry(
  publicDataProvider: PublicDataProvider,
  alamat: string,
): Promise<LedgerRegistry> {
  const st = await denganBatasWaktu(
    publicDataProvider.queryContractState(pastikanAlamatKontrak(alamat)),
    BATAS_MS.bacaIndexer,
    `queryContractState(${alamat}) tidak menjawab dalam ${BATAS_MS.bacaIndexer / 1000} detik.`,
  );
  if (st === null) throw new Error(`Registry ${alamat} belum terlihat di indexer`);
  return Registry.ledger(st.data);
}
```

- [ ] **Step 10: Ekspor `simpanCacheWallet` dari wallet.ts**

Satu kata. `simpanCacheWallet` sekarang dipanggil dua kali per sesi — sekali di awal oleh `ringkasSaldo` (seperti sebelumnya) dan sekali di akhir oleh `tutupSesi`. Tanpa yang kedua, checkpoint sinkronisasi yang tersimpan berumur sama dengan panjang sesi: setelah uji e2e 90 menit, cache-nya tertinggal 90 menit dan klaim "sinkronisasi dari cache, hitungan detik" pada sesi berikutnya tidak benar.

Di `pkgs/cli/src/wallet.ts`, satu baris berubah — tidak ada perubahan lain di berkas itu:

```diff
-const simpanCacheWallet = async (wallet: WalletFacade, cacheDir: string, log: Logger): Promise<void> => {
+export const simpanCacheWallet = async (wallet: WalletFacade, cacheDir: string, log: Logger): Promise<void> => {
```

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
sed -i 's/^const simpanCacheWallet = async (/export const simpanCacheWallet = async (/' pkgs/cli/src/wallet.ts
grep -n "^export const simpanCacheWallet" pkgs/cli/src/wallet.ts
```

Diharapkan: tepat satu baris cocok, bernomor sekitar 160.

- [ ] **Step 11: Tulis bootstrap sesi**

`pkgs/cli/src/bootstrap.ts`:

```typescript
// Bootstrap bersama untuk seluruh titik masuk yang menyentuh jaringan
// (deploy-registry, deploy-ballot, e2e). Menargetkan PREVIEW: sinkronisasi
// zswap preprod macet di indeks commitment ~1,5 juta (direproduksi enam kali,
// dua indexer, dua generasi SDK — lihat laporan Task 3). PreprodConfig tetap
// ada dan tetap tidak dipakai di Rencana B.
import type { Logger } from "pino";
import { faucetUrlFor } from "shared";
import { caraTurunanDariArgv } from "./args.ts";
import { PreviewConfig, type Config } from "./config.ts";
import { buatLogger } from "./logger.ts";
import { buatKonteksProvider, type KonteksProvider } from "./providers.ts";
import { bacaSeed } from "./seed.ts";
import { BATAS_MS, denganBatasWaktu } from "./tunggu.ts";
import { bangunWallet, ringkasSaldo, simpanCacheWallet, type KonteksWallet } from "./wallet.ts";

export interface Sesi {
  readonly config: Config;
  readonly log: Logger;
  readonly ctx: KonteksWallet;
  readonly kp: KonteksProvider;
}

/**
 * Menutup wallet dengan tertib: menyimpan checkpoint sinkronisasi TERBARU lalu
 * menghentikan ketiga sub-wallet.
 *
 * Kenapa ini perlu ada: `ringkasSaldo` menyimpan cache SEKALI, di awal sesi.
 * Sesi e2e berjalan ~90 menit; tanpa penyimpanan kedua di sini, cache-nya
 * berumur 90 menit dan sesi berikutnya harus menyusul 90 menit blok sebelum
 * bisa bekerja — padahal ia sudah melihat blok-blok itu. `wallet.stop()` juga
 * menutup langganan WebSocket ke indexer; tanpa itu proses hanya berakhir
 * karena `process.exit`, bukan karena selesai.
 *
 * Keduanya terbaik-upaya dan berbatas waktu: kegagalan menutup tidak boleh
 * mengubah kode keluar yang sudah ditentukan alur utama, dan tidak boleh
 * menggantung setelah pekerjaan sebenarnya selesai.
 */
export async function hentikanWallet(ctx: KonteksWallet, log: Logger): Promise<void> {
  try {
    await denganBatasWaktu(
      simpanCacheWallet(ctx.wallet, ctx.cacheDir, log),
      BATAS_MS.tutup,
      "Penyimpanan cache wallet melewati batas waktu",
    );
  } catch (e) {
    log.warn({ err: (e as Error).message }, "Gagal menyimpan cache wallet saat menutup (tidak fatal)");
  }
  try {
    await denganBatasWaktu(ctx.wallet.stop(), BATAS_MS.tutup, "wallet.stop() melewati batas waktu");
  } catch (e) {
    log.warn({ err: (e as Error).message }, "Gagal menghentikan wallet dengan tertib (tidak fatal)");
  }
}

/**
 * Menutup sesi lalu keluar. Jalan keluar untuk jalur SUKSES.
 *
 * Cabang galat memakai `await hentikanWallet(...)` diikuti `process.exit(1)`
 * secara terpisah, bukan fungsi ini — dan itu bukan gaya penulisan melainkan
 * keharusan tipe: `process.exit` dideklarasikan mengembalikan `never`, sehingga
 * tsc tahu kode setelahnya tidak tercapai dan penyempitan tipe (`nilai !==
 * undefined`) tetap berlaku di baris-baris berikutnya. `await tutupSesi(...)`
 * tidak memberi tsc informasi itu, dan setiap cabang galat yang memakainya akan
 * menghasilkan galat "possibly undefined" beberapa baris kemudian.
 */
export async function tutupSesi(sesi: Sesi, kode = 0): Promise<never> {
  await hentikanWallet(sesi.ctx, sesi.log);
  sesi.log.info({ kode }, "Sesi ditutup");
  process.exit(kode);
}

export async function siapkanSesi(): Promise<Sesi> {
  const config = new PreviewConfig(); // memanggil setNetworkId("preview")
  const log = buatLogger(config.logDir);

  log.info(
    { networkId: config.networkId, indexer: config.indexer, node: config.node, proofServer: config.proofServer },
    "Konfigurasi jaringan",
  );

  const caraTurunan = caraTurunanDariArgv();
  const seed = await bacaSeed(caraTurunan);
  log.info(`Seed diterima (${seed.length} byte, metode turunan: ${caraTurunan}).`);

  const ctx = await bangunWallet(config, seed, log);
  const saldo = await ringkasSaldo(ctx, log);
  log.info(
    { alamat: saldo.alamatUnshielded, night: saldo.night.toString(), dust: saldo.dust.toString() },
    "Wallet tersinkronisasi",
  );

  // DUST membayar biaya setiap transaksi. Tanpa DUST tidak ada satu pun
  // langkah berikutnya yang bisa jalan, jadi berhenti di sini dengan pesan
  // yang benar, bukan di tengah pembuatan proof dengan pesan yang tidak.
  if (saldo.dust === 0n) {
    log.error("Saldo DUST nol. DUST diperlukan untuk membayar biaya transaksi dan digenerasi dari NIGHT UTXO terdaftar.");
    log.error(`Isi wallet dengan tNight lewat faucet: ${faucetUrlFor(config.networkId)}`);
    await hentikanWallet(ctx, log);
    process.exit(1);
  }

  const kp = await buatKonteksProvider(ctx, config, log);
  return { config, log, ctx, kp };
}
```

- [ ] **Step 12: Tulis titik masuk deploy-registry, skrip pnpm, dan .gitignore**

`pkgs/cli/src/deploy-registry.ts`:

```typescript
// `pnpm cli deploy-registry` — men-deploy kontrak registry ke preview dan
// menyimpan alamatnya ke pkgs/cli/artefak/preview.json.
//
// Berkas ini adalah SKRIP tingkat-atas, bukan modul: ia tidak mengekspor apa
// pun dan tidak boleh diimpor dari mana pun.
//
// Alamat DIKEMBALIKAN lewat kode dan ditulis ke berkas, tidak untuk dipungut
// dari stdout: SDK wallet menulis galat sinkronisasi mentah langsung ke stdout
// di luar pino, jadi keluaran terminal bukan saluran data yang bisa dipercaya.
import { bacaArtefak, tulisArtefak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import { bacaLedgerRegistry, deployRegistry } from "./deploy.ts";
import { rakitProvidersRegistry } from "./providers.ts";
import { ulangiSampai } from "./tunggu.ts";

const sesi = await siapkanSesi();
const { config, log, kp } = sesi;

const sudahAda = bacaArtefak(config.networkId)?.registry;
if (sudahAda !== undefined && process.env.VOTEPRIV_DEPLOY_ULANG !== "1") {
  log.warn(
    { alamat: sudahAda },
    "Registry sudah tercatat di artefak. Setel VOTEPRIV_DEPLOY_ULANG=1 bila memang ingin men-deploy registry BARU.",
  );
  await tutupSesi(sesi, 0);
}

const providers = await rakitProvidersRegistry(kp, "admin");
const { alamat: alamatRegistry } = await deployRegistry(providers, log);

// Indexer menyusul node beberapa detik. Membaca ledger tepat setelah deploy
// dapat mengembalikan null; itu bukan kegagalan, itu keterlambatan.
const { nilai: ledger, galatTerakhir, percobaan } = await ulangiSampai(
  () => bacaLedgerRegistry(kp.publicDataProvider, alamatRegistry),
  () => true, // pembacaan yang BERHASIL sudah cukup; count registry baru memang 0
  log,
  `ledger registry ${alamatRegistry} terlihat di indexer`,
);
if (ledger === undefined) {
  log.error(
    { galatTerakhir, percobaan },
    "Registry ter-deploy tapi tidak pernah terbaca dari indexer. Alamatnya TETAP disimpan — deploy-nya sukses.",
  );
  tulisArtefak(config.networkId, { registry: alamatRegistry });
  await hentikanWallet(sesi.ctx, log);
  process.exit(1);
}
log.info({ count: ledger.count.toString(), kosong: ledger.ballots.isEmpty() }, "Ledger registry terbaca dari indexer");

const artefak = tulisArtefak(config.networkId, { registry: alamatRegistry });
log.info({ berkas: `pkgs/cli/artefak/${config.networkId}.json`, artefak }, "Alamat registry tersimpan");

await tutupSesi(sesi, 0);
```

Tambahkan skrip di `pkgs/cli/package.json` (di dalam `"scripts"`, setelah `"preview"`):

```json
    "deploy-registry": "node --max-old-space-size=4096 --no-warnings --experimental-strip-types src/deploy-registry.ts",
    "deploy-ballot": "node --max-old-space-size=4096 --no-warnings --experimental-strip-types src/deploy-ballot.ts",
    "e2e": "node --max-old-space-size=4096 --no-warnings --experimental-strip-types src/e2e.ts",
```

Tambahkan di akhir `.gitignore` (bawah blok "Rahasia wallet dan cache"):

```gitignore
# Store private state terenkripsi dan artefak deploy (memuat credential uji)
pkgs/cli/private-state/
pkgs/cli/artefak/
```

- [ ] **Step 13: Typecheck seluruh paket CLI dan jalankan semua uji unit**

```bash
pnpm --filter cli typecheck && pnpm --filter cli exec vitest run
```

Diharapkan: typecheck keluar tanpa keluaran (exit 0); seluruh uji CLI hijau — args, seed, mnemonic, plus **7 (tunggu) + 5 (providers) + 4 (artefak)** yang baru.

Bila muncul `Type 'CompiledAssetsPath' is not assignable to type 'never'` — rantai `.pipe()` di `kontrak.ts` kehilangan `withCompiledFileAssets`. Bila muncul `Argument of type '{}' is not assignable to parameter of type 'never'` — registry memakai `withWitnesses`, ganti ke `withVacantWitnesses`. Bila muncul `Property 'impureCircuits' is missing` — ada pemanggilan data-first bersarang, kembalikan ke `.pipe()`.

- [ ] **Step 14: Deploy ke preview dan SIMPAN alamatnya**

> **Jangan pakai `MIDNIGHT_WALLET_SEED=<frasa> pnpm ...`.** Bentuk itu menaruh frasa
> pemulihan Anda di `~/.bash_history` dan di `/proc/<pid>/environ`, tempat proses lain
> milik pengguna yang sama dapat membacanya selama perintah berjalan. `bacaSeed()`
> memang menerima env var — itu jalur untuk CI dengan secret manager, bukan untuk
> tangan manusia di terminal. Untuk dijalankan sendiri, pakai salah satu dari dua
> bentuk di bawah: prompt interaktif tanpa gema, atau pipa yang dibaca sampai EOF.

```bash
docker compose -f pkgs/cli/proof-server.yml up -d
# Bentuk 1 — prompt interaktif, tidak ada gema, tidak menyentuh history:
pnpm cli deploy-registry

# Bentuk 2 — dari secret manager / berkas, tanpa newline penutup:
printf '%s' "$FRASA" | pnpm cli deploy-registry
```

Diharapkan, berurutan:
1. `Konfigurasi jaringan` dengan `networkId: "preview"`.
2. Progres sinkronisasi wallet. **Sinkronisasi pertama pada preview memakan waktu sekitar lima menit dari keadaan dingin**; sesi berikutnya memulihkan dari cache dan selesai dalam hitungan detik. Jangan diinterupsi.
3. `Wallet tersinkronisasi` dengan NIGHT dan DUST bukan nol (wallet pengguna sudah berdana tNIGHT dan tDUST di preview).
4. `Men-deploy kontrak registry ...` dengan `batasMenit: 15`, lalu jeda: satu proof ZK (5–20 detik) diikuti penantian finalisasi node dan indexer. Hitung menit, bukan detik. Ini bukan hang — dan kalaupun jadi hang, ia sekarang berakhir sendiri setelah 15 menit dengan pesan yang menyebut sebabnya.
5. `Registry ter-deploy` dengan `alamat` 64 hex, `status: "SucceedEntirely"`.
6. `Ledger registry terbaca dari indexer` dengan `count: "0"`, `kosong: true`. Bila indexer masih tertinggal, satu atau dua baris `Pembacaan indexer gagal; mencoba lagi` mendahuluinya — itu normal dan sudah tertangani.
7. `Alamat registry tersimpan`, lalu `Sesi ditutup` dengan `kode: 0`.

**Salin alamat itu.** Ia ada di `pkgs/cli/artefak/preview.json` (berkas ini di-gitignore) dan menjadi konstanta yang dipakai aplikasi di Rencana C:

```bash
cat pkgs/cli/artefak/preview.json
```

Diagnosa bila melenceng:

| Gejala | Sebab dan tindakan |
|---|---|
| `Artefak ZK tidak terbaca di ...` | Jalur `zkDir` salah atau `pnpm --filter contract compact` belum dijalankan. Itu memang gunanya pemeriksaan dini di Step 7: tanpa itu kegagalan yang sama muncul jauh kemudian sebagai galat proof server yang tidak menunjuk apa pun. |
| `deployContract(registry) tidak selesai dalam 15 menit` | Transaksi kemungkinan ditolak konsensus, atau proof server/indexer tidak menjawab. Periksa `docker compose -f pkgs/cli/proof-server.yml logs --tail 50` dan saldo DUST. **Jangan langsung men-deploy ulang** — periksa dulu apakah alamatnya sudah muncul di indexer. |
| `Registry ter-deploy tapi tidak pernah terbaca dari indexer` | Deploy-nya sukses dan alamatnya sudah disimpan. Indexer tertinggal jauh; jalankan `pnpm cli deploy-registry` lagi (ia akan berhenti karena artefak sudah ada) atau baca alamatnya langsung dari berkas artefak. |
| `Saldo DUST nol` | Isi wallet lewat faucet yang disebut di baris berikutnya, tunggu DUST tergenerasi dari NIGHT UTXO, lalu ulangi. |

- [ ] **Step 15: Commit**

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
git add pkgs/cli/src pkgs/cli/package.json .gitignore
git commit -m "feat(cli): perakitan provider midnight-js, pembungkus batas waktu, dan deploy kontrak registry ke preview"
```

---

### Task 5: Deploy ballot bermetadata dan pendaftaran pemilih

Dengan provider terbukti bekerja, tugas ini menerbitkan satu ballot sungguhan: metadata di-seal, tiga credential diterbitkan, daun eligibility-nya didaftarkan, dan alamat ballot dicatat ke registry.

Constructor ballot menyegel 14 nilai secara permanen — tidak ada satu pun yang bisa diperbaiki setelah deploy, satu-satunya jalan keluar adalah men-deploy ballot baru dan meninggalkan yang lama beserta seluruh suaranya. Karena itu validasi dilakukan di sisi CLI lebih dulu, dengan pesan yang menyebut nama field, sebelum kontrak menolak dengan `CompactError: failed assert: ...`.

Kontrak menolak empat hal, dan Task ini memenuhi keempatnya secara eksplisit: `optionCount` di luar 2..4, `tallyDeadline <= voteDeadline`, `eligibleCount` nol atau di atas 1024, dan `quorumPercent` di atas 100. Metadata yang dipakai di Step 7 memakai 3 opsi, `voteDeadline` 60 menit dan `tallyDeadline` 95 menit dari sekarang, `eligibleCount` 3, `quorumPercent` 60 — keempat batas terpenuhi, dan **deadline dalam DETIK** lewat `detikDariSekarang`.

**Kenapa 60 dan 95 menit, bukan 15 dan 35.** Nilai ini TIDAK dihitung mandiri di sini: `voteDeadline`/`tallyDeadline` dibangun dari `MENIT_VOTE`/`MENIT_TALLY`, diimpor dari `./jadwal.ts` — SATU sumber dipakai bersama dengan Task 6 (`e2e.ts`), supaya kedua skrip tidak bisa diam-diam menyimpang seperti yang pernah terjadi (45/80 di sini, 60/95 di `e2e.ts`, sebelum penyatuan). Nilainya dipilih cukup untuk invarian anggaran waktu loop coblos `e2e.ts` (`SISA_MINIMAL_VOTE`/`SISA_MINIMAL_TALLY`) — pekerjaan Task ini sendiri (satu deploy, satu registerVoters, satu register ke registry, tanpa loop coblos) jauh lebih ringan, tapi memakai jendela yang sama sederhana dan tidak menyimpan dua anggaran independen yang harus dijaga tetap sinkron. Perhitungan lengkapnya ada di Task 6 Step 5 dan di `jadwal.ts`.

**Files:**
- Modify: `pkgs/cli/src/deploy.ts`
- Create: `pkgs/cli/src/deploy-ballot.ts`
- Test: `pkgs/cli/src/deploy.test.ts`

**Interfaces:**
- Consumes: `rakitProvidersBallot`, `rakitProvidersRegistry`, `temukanRegistry`, `siapkanSesi`, `tutupSesi`, `pastikanAlamatKontrak`, `bacaArtefak`, `tulisArtefak`, `BATAS_MS`, `denganBatasWaktu`, `ulangiSampai`, `kompilasiBallot`, `KonteksWallet` (Task 3–4); `buatCredential`, `daunEligibility`, `detikDariSekarang`, `MENIT`, tipe `MetadataBallot` (paket `shared`); `Ballot`, `BallotPrivateStateId`, `emptyBallotPrivateState`, tipe `BallotPrivateState` (paket `contract`).
- Produces (semuanya dari `pkgs/cli/src/deploy.ts` kecuali yang disebut lain):
  - `validasiMetadata(meta: MetadataBallot, jumlahCredential?: number): void`
  - `batchDaun(daun: readonly Uint8Array[]): BatchDaun[]`; tipe `BatchDaun = { leaves: Uint8Array[]; n: bigint }`
  - `kunciAdmin(ctx: KonteksWallet): Uint8Array`
  - `deployBallot(providers: ProvidersBallot, meta: MetadataBallot, rahasiaAdmin: Uint8Array, nonce: Uint8Array, log: Logger, jumlahCredential?: number): Promise<HasilDeployBallot>`
  - tipe `HasilDeployBallot = { alamat: string; kontrak: DeployedContract<BallotC> }`
  - `temukanBallot(providers: ProvidersBallot, alamat: string, privateStateAwal: BallotPrivateState): Promise<FoundContract<BallotC>>`
  - `daftarkanVoter(ballot: FoundContract<BallotC>, daun: readonly Uint8Array[], log: Logger): Promise<void>`
  - `catatKeRegistry(registry: FoundContract<RegistryC>, alamatBallot: string, log: Logger): Promise<void>`
  - `bacaLedgerBallot(publicDataProvider: PublicDataProvider, alamat: string): Promise<LedgerBallot>`; tipe `LedgerBallot = ReturnType<typeof Ballot.ledger>`
  - `pkgs/cli/src/deploy-ballot.ts` — skrip tingkat-atas, **tidak mengekspor apa pun**

---

- [ ] **Step 1: Tulis uji yang gagal untuk validasi metadata dan pembatchan daun**

`pkgs/cli/src/deploy.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { batchDaun, validasiMetadata } from "./deploy.ts";

const daun = (isi: number) => new Uint8Array(32).fill(isi);

const metaSah = () => ({
  title: "Q4 Community Treasury",
  description: "Pilih arah dukungan treasury pada Q4.",
  community: "Midnight Builders",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  voteDeadline: 1_800_000_000n,
  tallyDeadline: 1_800_001_200n,
  quorumPercent: 60,
  eligibleCount: 3,
  eligibilityPolicy: "Tiga credential uji end-to-end",
});

describe("validasiMetadata", () => {
  it("menerima metadata yang memenuhi keempat batas kontrak", () => {
    expect(() => validasiMetadata(metaSah())).not.toThrow();
  });

  it("menolak jumlah opsi di luar 2..4", () => {
    expect(() => validasiMetadata({ ...metaSah(), options: ["Cuma satu"] })).toThrow(/2 sampai 4/);
    expect(() => validasiMetadata({ ...metaSah(), options: ["a", "b", "c", "d", "e"] })).toThrow(/2 sampai 4/);
  });

  it("menolak tallyDeadline yang tidak lebih besar dari voteDeadline", () => {
    expect(() => validasiMetadata({ ...metaSah(), tallyDeadline: 1_800_000_000n })).toThrow(/setelah batas waktu pemungutan suara/);
    expect(() => validasiMetadata({ ...metaSah(), tallyDeadline: 1_799_999_999n })).toThrow(/setelah batas waktu pemungutan suara/);
  });

  it("menolak eligibleCount nol atau di atas 1024", () => {
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 0 })).toThrow(/minimal 1/);
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 1025 })).toThrow(/1024/);
  });

  it("menolak quorumPercent di atas 100", () => {
    expect(() => validasiMetadata({ ...metaSah(), quorumPercent: 101 })).toThrow(/100/);
  });

  it("menolak deadline yang terlihat seperti milidetik", () => {
    // Date.now() mentah ~1.75e12; detik ~1.75e9. Kontrak akan menerimanya dan
    // menghasilkan ballot yang deadline-nya tidak pernah tiba.
    expect(() =>
      validasiMetadata({ ...metaSah(), voteDeadline: 1_757_000_000_000n, tallyDeadline: 1_757_000_060_000n }),
    ).toThrow(/DETIK/);
  });

  it("menolak eligibleCount yang lebih kecil dari jumlah credential yang akan didaftarkan", () => {
    // Argumen kedua opsional: jumlah credential yang akan didaftarkan.
    expect(() => validasiMetadata({ ...metaSah(), eligibleCount: 2 }, 3)).toThrow(/eligibleCount/);
  });
});

describe("batchDaun", () => {
  it("mengisi tepat delapan slot walau daunnya tiga", () => {
    const b = batchDaun([daun(1), daun(2), daun(3)]);
    expect(b).toHaveLength(1);
    expect(b[0].n).toBe(3n);
    expect(b[0].leaves).toHaveLength(8);
    expect(b[0].leaves.every((d) => d.length === 32)).toBe(true);
    expect([...b[0].leaves[3]]).toEqual([...new Uint8Array(32)]); // padding nol
  });

  it("memecah sembilan daun jadi batch 8 dan 1", () => {
    const b = batchDaun(Array.from({ length: 9 }, (_, i) => daun(i + 1)));
    expect(b.map((x) => x.n)).toEqual([8n, 1n]);
    expect(b.every((x) => x.leaves.length === 8)).toBe(true);
  });

  it("menolak daun yang bukan 32 byte dan daftar kosong", () => {
    expect(() => batchDaun([new Uint8Array(31)])).toThrow(/32 byte/);
    expect(() => batchDaun([])).toThrow(/Tidak ada daun/);
  });
});
```

```bash
pnpm --filter cli exec vitest run src/deploy.test.ts
```

Diharapkan: gagal — `validasiMetadata` dan `batchDaun` belum diekspor dari `deploy.ts` (`SyntaxError` / `does not provide an export named`).

- [ ] **Step 2: Ganti blok impor deploy.ts, lalu tambahkan validasiMetadata dan batchDaun**

Task 5 menambah sepuluh simbol ke `deploy.ts` yang belum diimpor di Task 4 Step 9. Blok impor di bawah adalah blok **final** berkas ini — berlaku setelah Step 2, Step 3 dan Step 4 selesai. Ganti seluruh blok impor `deploy.ts` yang ada dengan blok ini sekarang, sekali, supaya tidak ada langkah berikutnya yang menyisipkan `import` di tengah berkas:

```typescript
import crypto from "node:crypto";
import {
  deployContract,
  findDeployedContract,
  type DeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import {
  Ballot,
  BallotPrivateStateId,
  Registry,
  RegistryPrivateStateId,
  emptyBallotPrivateState,
  emptyRegistryPrivateState,
  type BallotPrivateState,
} from "contract";
import type { Logger } from "pino";
import type { MetadataBallot } from "shared";
import { pastikanAlamatKontrak } from "./artefak.ts";
import { kompilasiBallot, kompilasiRegistry, type BallotC, type RegistryC } from "./kontrak.ts";
import type { ProvidersBallot, ProvidersRegistry } from "./providers.ts";
import { BATAS_MS, denganBatasWaktu } from "./tunggu.ts";
import type { KonteksWallet } from "./wallet.ts";
```

Yang bertambah dibanding versi Task 4, sepuluh seluruhnya: `crypto` (dipakai `kunciAdmin`); `Ballot`, `BallotPrivateStateId`, `emptyBallotPrivateState`, `type BallotPrivateState` dari `"contract"`; `type MetadataBallot` dari `"shared"`; `kompilasiBallot` dan `type BallotC` dari `"./kontrak.ts"`; `type ProvidersBallot` dari `"./providers.ts"`; dan `type KonteksWallet` dari `"./wallet.ts"`. Sisanya sudah ada sejak Task 4 Step 9 dan tidak berubah.

Lalu tambahkan di bawah `bacaLedgerRegistry`:

```typescript
/**
 * Ambang "terlihat seperti milidetik". Detik sejak epoch pada 2026 berkisar
 * 1,7e9; milidetik 1,7e12. 1e11 memisahkan keduanya dengan margin besar dan
 * tetap menerima tanggal detik sampai tahun 5138.
 */
const AMBANG_MILIDETIK = 100_000_000_000n;

/**
 * Menegakkan di sisi CLI keempat batas yang ditolak constructor ballot, plus
 * dua pemeriksaan yang TIDAK ditegakkan kontrak tapi sama fatalnya.
 *
 * Kenapa di sini dan bukan sekadar membiarkan kontrak menolak: seluruh field
 * yang ditulis constructor bersifat `sealed`. Nilai keliru tidak pernah bisa
 * diperbaiki setelah deploy — satu-satunya jalan keluar adalah men-deploy
 * ballot baru dan meninggalkan yang lama beserta seluruh suara di dalamnya.
 * Pesan kontrak ("Jumlah opsi harus 2 sampai 4") tidak menyebut field mana
 * pada objek metadata yang salah; pesan di sini menyebutnya.
 *
 * `jumlahCredential` opsional karena hanya pemanggil yang tahu berapa
 * credential yang akan didaftarkan; bila diberikan, ia menutup satu kegagalan
 * yang baru muncul SATU TRANSAKSI KEMUDIAN (registerVoters ditolak
 * "Melebihi eligibleCount yang ditetapkan ballot", pada ballot yang sudah
 * telanjur ter-deploy dan tidak bisa diperbaiki).
 */
export function validasiMetadata(meta: MetadataBallot, jumlahCredential?: number): void {
  if (meta.options.length < 2 || meta.options.length > 4) {
    throw new Error(`Jumlah opsi harus 2 sampai 4; metadata memberi ${meta.options.length}.`);
  }
  if (meta.options.some((o) => o.trim() === "")) {
    // optionCount di-seal terpisah dari label. nOptions=4 dengan o2/o3 kosong
    // DITERIMA kontrak, dan castVote lalu mengizinkan opsi tanpa label.
    throw new Error("Label opsi tidak boleh kosong — optionCount diturunkan dari jumlah label ini.");
  }
  if (meta.tallyDeadline <= meta.voteDeadline) {
    throw new Error(
      `tallyDeadline harus setelah batas waktu pemungutan suara (voteDeadline). Diberikan voteDeadline=${meta.voteDeadline}, tallyDeadline=${meta.tallyDeadline}.`,
    );
  }
  if (meta.voteDeadline >= AMBANG_MILIDETIK || meta.tallyDeadline >= AMBANG_MILIDETIK) {
    throw new Error(
      "voteDeadline/tallyDeadline harus dalam DETIK sejak epoch, bukan milidetik. Pakai detikDariSekarang() dari paket shared.",
    );
  }
  if (meta.eligibleCount < 1) throw new Error("eligibleCount minimal 1.");
  if (meta.eligibleCount > 1024) throw new Error("eligibleCount melebihi kapasitas pohon eligibility (1024).");
  if (meta.quorumPercent > 100) throw new Error(`quorumPercent tidak boleh melebihi 100; diberikan ${meta.quorumPercent}.`);
  if (jumlahCredential !== undefined && jumlahCredential > meta.eligibleCount) {
    throw new Error(
      `eligibleCount (${meta.eligibleCount}) lebih kecil dari jumlah credential yang akan didaftarkan (${jumlahCredential}); registerVoters akan ditolak kontrak.`,
    );
  }
}

export interface BatchDaun {
  readonly leaves: Uint8Array[];
  readonly n: bigint;
}

/**
 * Memecah daun eligibility menjadi batch untuk registerVoters.
 *
 * Tipe TS-nya `Uint8Array[]`, tapi runtime kontrak menuntut Vector<8,Bytes<32>>:
 * array dengan panjang PERSIS 8, setiap elemen persis 32 byte. Tiga daun dengan
 * n=3 tanpa padding akan ditolak dengan "type error: ... expected value of type
 * Vector<8, Bytes<32>>". Circuit hanya menyisipkan `n` entri pertama; sisanya
 * padding nol yang tidak pernah masuk pohon.
 */
export function batchDaun(daun: readonly Uint8Array[]): BatchDaun[] {
  if (daun.length === 0) throw new Error("Tidak ada daun eligibility untuk didaftarkan.");
  for (const [i, d] of daun.entries()) {
    if (d.length !== 32) throw new Error(`Daun eligibility harus 32 byte; entri ke-${i} berukuran ${d.length} byte.`);
  }

  const hasil: BatchDaun[] = [];
  for (let i = 0; i < daun.length; i += 8) {
    const potong = daun.slice(i, i + 8);
    hasil.push({
      leaves: Array.from({ length: 8 }, (_, j) => potong[j] ?? new Uint8Array(32)),
      n: BigInt(potong.length),
    });
  }
  return hasil;
}
```

```bash
pnpm --filter cli exec vitest run src/deploy.test.ts
```

Diharapkan: **10 uji hijau** (validasiMetadata 7, batchDaun 3).

- [ ] **Step 3: Tulis kunciAdmin, deployBallot, temukanBallot, dan bacaLedgerBallot**

Kunci admin harus **sama pada setiap sesi**: `registerVoters` menuntut `admin_pk(admin_secret_key()) == adminKey`, dan `adminKey` di-seal saat deploy dari witness `admin_secret_key`. Kunci acak yang baru tiap proses akan membuat pendaftaran pemilih ditolak selamanya oleh ballot yang baru saja kita deploy. Diturunkan deterministik dari kunci rahasia unshielded wallet — tidak perlu disimpan di mana pun, dan tidak pernah dicetak.

Tambahkan ke `pkgs/cli/src/deploy.ts` (tidak ada `import` baru — blok impor Step 2 sudah lengkap):

```typescript
/**
 * Kunci rahasia admin ballot, 32 byte, deterministik dari wallet.
 *
 * WAJIB stabil lintas proses: constructor ballot menyegel
 * adminKey = admin_pk(admin_secret_key()), dan registerVoters menolak siapa pun
 * yang tidak bisa mereproduksi kunci itu ("Hanya admin yang boleh mendaftarkan
 * pemilih"). Kunci acak per proses berarti ballot yang baru di-deploy langsung
 * tidak bisa diisi pemilih, permanen.
 *
 * Diturunkan dari kunci rahasia unshielded dengan pemisah domain, bukan
 * disimpan di berkas: tidak ada rahasia baru yang perlu dijaga, dan pemilik
 * wallet yang sama selalu mendapat kunci admin yang sama. NILAI INI TIDAK
 * PERNAH BOLEH DICETAK ATAU MASUK LOG.
 */
export function kunciAdmin(ctx: KonteksWallet): Uint8Array {
  const rahasia = ctx.unshieldedKeystore.getSecretKey();
  return new Uint8Array(crypto.createHash("sha256").update("votepriv:admin:v1").update(rahasia).digest());
}

export type LedgerBallot = ReturnType<typeof Ballot.ledger>;

export interface HasilDeployBallot {
  readonly alamat: string;
  /**
   * Handle lengkap dari deploy — sudah memuat `callTx`, dan private state
   * awalnya sudah tertulis oleh deployContract. Pemanggil TIDAK perlu (dan
   * tidak boleh) memanggil `temukanBallot` untuk identitas yang sama pada
   * proses yang sama: itu lima perjalanan indexer yang percuma di dalam
   * jendela waktu yang sudah sempit.
   */
  readonly kontrak: DeployedContract<BallotC>;
}

/**
 * Deploy ballot.
 *
 * 14 argumen POSISIONAL, urutannya wajib persis:
 *   title, description, community, option0, option1, option2, option3,
 *   optionCount, voteDeadline, tallyDeadline, quorumPercent, eligibleCount,
 *   eligibilityPolicy, ballotNonce
 * Tujuh string berurutan lalu lima bigint berurutan: tertukar di dalam salah
 * satu deret itu tetap lolos kompilasi DAN lolos seluruh assert kontrak.
 * `Opaque<"string">` juga tidak diperiksa tipenya saat runtime — TypeScript
 * satu-satunya yang menjaga. Karena itu argumen disusun dari objek bernama di
 * bawah, bukan ditulis inline di tempat pemanggilan.
 *
 * initialPrivateState WAJIB sudah membawa kunci admin yang benar: witness
 * admin_secret_key dibaca DI DALAM constructor (di bawah alamat dummy
 * 0000...0000), sehingga tidak ada kesempatan memperbaikinya setelah deploy.
 */
export async function deployBallot(
  providers: ProvidersBallot,
  meta: MetadataBallot,
  rahasiaAdmin: Uint8Array,
  nonce: Uint8Array,
  log: Logger,
  jumlahCredential?: number,
): Promise<HasilDeployBallot> {
  validasiMetadata(meta, jumlahCredential);
  if (rahasiaAdmin.length !== 32) throw new Error("Kunci rahasia admin harus 32 byte.");
  if (nonce.length !== 32) throw new Error("ballotNonce harus 32 byte.");

  const opsi = [meta.options[0] ?? "", meta.options[1] ?? "", meta.options[2] ?? "", meta.options[3] ?? ""];

  log.info(
    {
      judul: meta.title,
      opsi: meta.options,
      optionCount: meta.options.length,
      voteDeadline: meta.voteDeadline.toString(),
      tallyDeadline: meta.tallyDeadline.toString(),
      eligibleCount: meta.eligibleCount,
      quorumPercent: meta.quorumPercent,
      batasMenit: BATAS_MS.deploy / 60_000,
    },
    "Men-deploy ballot (deadline dalam DETIK sejak epoch)",
  );

  const kontrak = await denganBatasWaktu(
    deployContract(providers, {
      compiledContract: kompilasiBallot(),
      privateStateId: BallotPrivateStateId,
      initialPrivateState: emptyBallotPrivateState(rahasiaAdmin),
      args: [
        meta.title,
        meta.description,
        meta.community,
        opsi[0],
        opsi[1],
        opsi[2],
        opsi[3],
        BigInt(meta.options.length),
        meta.voteDeadline,
        meta.tallyDeadline,
        BigInt(meta.quorumPercent),
        BigInt(meta.eligibleCount),
        meta.eligibilityPolicy,
        nonce,
      ],
    }),
    BATAS_MS.deploy,
    `deployContract(ballot) tidak selesai dalam ${BATAS_MS.deploy / 60_000} menit. JANGAN mengirim ulang sebelum memeriksa indexer: bila transaksinya mendarat, mengulang akan men-deploy ballot KEDUA dan membakar biaya dua kali.`,
  );

  const alamat = pastikanAlamatKontrak(kontrak.deployTxData.public.contractAddress);
  log.info(
    { alamat, txId: kontrak.deployTxData.public.txId, status: kontrak.deployTxData.public.status },
    "Ballot ter-deploy",
  );
  return { alamat, kontrak };
}

/**
 * Menemukan ballot yang sudah ter-deploy dan MENULIS private state awal.
 *
 * HANYA untuk identitas yang belum punya handle: ballot dari sesi lain, atau
 * store pemilih yang berbeda dari store admin. Untuk ballot yang baru di-deploy
 * pada proses ini, pakai `kontrak` dari `deployBallot`.
 *
 * PERHATIKAN URUTANNYA: varian ini menimpa apa pun yang tersimpan di
 * (alamat, BallotPrivateStateId). Panggil ini DULU, baru tulis credential /
 * opening / path pemilih. Terbalik = kredensial terhapus tepat sebelum dipakai.
 * Varian tanpa initialPrivateState MELEMPAR bila belum ada apa-apa tersimpan,
 * jadi ia bukan pilihan yang aman untuk store yang baru.
 */
export async function temukanBallot(
  providers: ProvidersBallot,
  alamat: string,
  privateStateAwal: BallotPrivateState,
): Promise<FoundContract<BallotC>> {
  return denganBatasWaktu(
    findDeployedContract(providers, {
      compiledContract: kompilasiBallot(),
      contractAddress: pastikanAlamatKontrak(alamat),
      privateStateId: BallotPrivateStateId,
      initialPrivateState: privateStateAwal,
    }),
    BATAS_MS.temukan,
    `findDeployedContract(ballot ${alamat}) tidak selesai dalam ${BATAS_MS.temukan / 60_000} menit. Periksa indexer; watchForDeployTxData di dalamnya tidak pernah timeout sendiri.`,
  );
}

/** Sama seperti bacaLedgerRegistry: `.data` bertipe ChargedState dan `ledger()` menerimanya. */
export async function bacaLedgerBallot(
  publicDataProvider: PublicDataProvider,
  alamat: string,
): Promise<LedgerBallot> {
  const st = await denganBatasWaktu(
    publicDataProvider.queryContractState(pastikanAlamatKontrak(alamat)),
    BATAS_MS.bacaIndexer,
    `queryContractState(${alamat}) tidak menjawab dalam ${BATAS_MS.bacaIndexer / 1000} detik.`,
  );
  if (st === null) throw new Error(`Ballot ${alamat} belum terlihat di indexer`);
  return Ballot.ledger(st.data);
}
```

- [ ] **Step 4: Tulis daftarkanVoter dan catatKeRegistry**

Tambahkan ke `pkgs/cli/src/deploy.ts`:

```typescript
/**
 * Mendaftarkan daun eligibility, maksimal delapan per transaksi.
 *
 * DAUN, BUKAN CREDENTIAL. Keduanya sama-sama Uint8Array 32 byte sehingga
 * meneruskan credential mentah lolos kompilasi, lolos proof, dan mendarat di
 * chain — lalu castVote tidak akan pernah bisa jalan, karena circuit memeriksa
 * `path.leaf == cred_leaf(cred)` dan findPathForLeaf(cred_leaf(cred)) akan
 * mengembalikan undefined selamanya. Pakai `daunEligibility(cred)` dari paket
 * shared (yang memanggil Ballot.pureCircuits.cred_leaf).
 *
 * Berurutan, tidak pernah Promise.all: (a) private state LevelDB dibuka-tutup
 * per operasi dan tabrakan lock melempar LEVEL_LOCKED; (b) penyeimbangan
 * unshielded tidak memindahkan UTXO ke status pending, sehingga dua transaksi
 * yang diseimbangkan sebelum yang pertama terlihat di chain dapat memilih UTXO
 * yang sama.
 *
 * registerVoters MENUTUP SENDIRI: ia menuntut voteCount == 0. Seluruh pemilih
 * harus terdaftar SEBELUM suara pertama masuk.
 */
export async function daftarkanVoter(
  ballot: FoundContract<BallotC>,
  daun: readonly Uint8Array[],
  log: Logger,
): Promise<void> {
  const batch = batchDaun(daun);
  for (const [i, b] of batch.entries()) {
    log.info(
      { batch: i + 1, dari: batch.length, n: Number(b.n), batasMenit: BATAS_MS.panggilBerat / 60_000 },
      "Mendaftarkan batch daun eligibility (proof ZK 5-20 detik, lalu finalisasi — hitung menit)",
    );
    const r = await denganBatasWaktu(
      ballot.callTx.registerVoters(b.leaves, b.n),
      BATAS_MS.panggilBerat,
      `callTx.registerVoters (batch ${i + 1}/${batch.length}) tidak selesai dalam ${BATAS_MS.panggilBerat / 60_000} menit. JANGAN mengulang sebelum membaca registeredCount dari indexer — batch yang sudah mendarat akan terdaftar dua kali dan memakan kuota eligibleCount.`,
    );
    log.info({ batch: i + 1, txId: r.public.txId, status: r.public.status }, "Batch terdaftar");
  }
}

/**
 * Mencatat alamat ballot ke registry. Permissionless dan tanpa validasi apa
 * pun di sisi kontrak: mendaftarkan alamat yang sama dua kali menghasilkan dua
 * entri, dan `count` bertambah dua. Penyaringan duplikat adalah tanggung jawab
 * klien (registry.compact menyatakan itu secara eksplisit).
 */
export async function catatKeRegistry(
  registry: FoundContract<RegistryC>,
  alamatBallot: string,
  log: Logger,
): Promise<void> {
  log.info({ alamatBallot }, "Mencatat ballot ke registry (proof ZK, lalu finalisasi)");
  const r = await denganBatasWaktu(
    registry.callTx.register(pastikanAlamatKontrak(alamatBallot)),
    BATAS_MS.panggilRingan,
    `callTx.register (registry) tidak selesai dalam ${BATAS_MS.panggilRingan / 60_000} menit. Mengulang akan menambah entri KEDUA untuk ballot yang sama — periksa registry.count lebih dulu.`,
  );
  log.info({ txId: r.public.txId, status: r.public.status }, "Ballot tercatat di registry");
}
```

- [ ] **Step 5: Tulis titik masuk deploy-ballot.ts**

**Catatan pasca-implementasi (fix seam Task 6/7):** `deploy-ballot.ts` dan `e2e.ts` (Task 6 Step 5) awalnya masing-masing mendefinisikan `MENIT_VOTE`/`MENIT_TALLY` sendiri (45/80 di sini, 60/95 di sana) dan diam-diam menyimpang — commit e545d61 menaikkan angka e2e.ts saja. Perbaikan berikutnya menyatukan definisinya di satu modul baru, `pkgs/cli/src/jadwal.ts`, supaya penyimpangan itu tidak mungkin lagi terjadi tanpa disadari:

```typescript
// Jendela deadline BERSAMA untuk `deploy-ballot.ts` dan `e2e.ts` — SATU-
// SATUNYA definisi MENIT_VOTE/MENIT_TALLY di seluruh CLI.
//
// Nilai 60/95 dipertahankan (bukan dikembalikan ke 45/80): itu nilai yang
// sudah dibuktikan cukup untuk invarian SISA_MINIMAL_VOTE/SISA_MINIMAL_TALLY
// e2e.ts (lihat tabel anggaran waktu di Task 6 Step 5). Menurunkannya ke
// 45/80 akan membuat jendela e2e.ts lebih kecil dari biaya terburuk satu
// iterasi loop coblos — regresi yang sudah pernah terjadi dan diperbaiki.
export const MENIT_VOTE = 60;
export const MENIT_TALLY = 95;
```

Kedua skrip di bawah (`deploy-ballot.ts` dan `e2e.ts`) mengimpor `MENIT_VOTE`/`MENIT_TALLY` dari `./jadwal.ts` — bukan mendefinisikannya sendiri-sendiri.

`pkgs/cli/src/deploy-ballot.ts`:

```typescript
// `pnpm cli deploy-ballot` — menerbitkan satu ballot di preview, mendaftarkan
// tiga credential, dan mencatat alamatnya ke registry. Skrip tingkat-atas:
// tidak mengekspor apa pun.
//
// Deadline sengaja pendek dibanding ballot sungguhan, tapi TIDAK sependek
// versi awal rencana ini (15/35 menit). Uji end-to-end Task 6 harus
// benar-benar menunggu keduanya lewat: waktu blok di jaringan nyata tidak bisa
// dimajukan, jadi setiap menit di sini adalah menit yang harus ditunggu di
// sana. Terlalu pendek justru lebih mahal: registerVoters dan tiga castVote
// harus SELESAI sebelum voteDeadline, dan tiga tallyVote harus muat di antara
// voteDeadline dan tallyDeadline — jendela yang kekecilan berarti seluruh
// rangkaian transaksi berbayar terbuang dan harus diulang dari nol.
import crypto from "node:crypto";
import { buatCredential, daunEligibility, detikDariSekarang, MENIT, type MetadataBallot } from "shared";
import { bacaArtefak, tulisArtefak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import {
  bacaLedgerBallot,
  bacaLedgerRegistry,
  catatKeRegistry,
  daftarkanVoter,
  deployBallot,
  kunciAdmin,
  temukanRegistry,
} from "./deploy.ts";
import { MENIT_TALLY, MENIT_VOTE } from "./jadwal.ts";
import { rakitProvidersBallot, rakitProvidersRegistry } from "./providers.ts";
import { ulangiSampai } from "./tunggu.ts";

// MENIT_VOTE/MENIT_TALLY diimpor dari ./jadwal.ts — SATU sumber yang dipakai
// bersama dengan e2e.ts (Task 6 Step 5), supaya kedua skrip tidak lagi bisa
// diam-diam menyimpang seperti sebelum perbaikan seam Task 6/7 (lihat
// komentar di jadwal.ts: sebelumnya 45/80 di sini, 60/95 di e2e.ts).

const JUMLAH_PEMILIH = 3;

const sesi = await siapkanSesi();
const { config, log, ctx, kp } = sesi;

const alamatRegistry = bacaArtefak(config.networkId)?.registry;
if (alamatRegistry === undefined) {
  log.error("Belum ada alamat registry di artefak. Jalankan `pnpm cli deploy-registry` lebih dulu (Task 4).");
  await hentikanWallet(ctx, log);
  // process.exit (bukan tutupSesi) supaya tsc tahu baris di bawah tidak
  // tercapai dan `alamatRegistry` menyempit jadi string setelah blok ini.
  process.exit(1);
}

// Penjaga deploy-ulang: tanpa ini, menjalankan ulang `pnpm cli deploy-ballot`
// men-deploy ballot BARU dan menimpa alamat/credential ballot LAMA di
// artefak — ballot lama yang mungkin sudah dibayar dan sebagian pemilihnya
// sudah mencoblos jadi yatim. Setel VOTEPRIV_DEPLOY_ULANG=1 untuk memaksa
// deploy baru yang memang disengaja.
const ballotSudahAda = bacaArtefak(config.networkId)?.ballot;
if (ballotSudahAda !== undefined && process.env.VOTEPRIV_DEPLOY_ULANG !== "1") {
  log.warn(
    { alamat: ballotSudahAda },
    "Ballot sudah tercatat di artefak. Setel VOTEPRIV_DEPLOY_ULANG=1 bila memang ingin men-deploy ballot BARU.",
  );
  await tutupSesi(sesi, 0);
}

const metadata: MetadataBallot = {
  title: "Q4 Community Treasury",
  description: "Pilih arah dukungan treasury pada Q4.",
  community: "Midnight Builders",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  // DETIK sejak epoch, lewat helper shared — bukan Date.now().
  voteDeadline: detikDariSekarang(MENIT_VOTE * MENIT),
  tallyDeadline: detikDariSekarang(MENIT_TALLY * MENIT),
  quorumPercent: 60, // <= 100. Metadata saja: TIDAK ditegakkan circuit mana pun.
  eligibleCount: JUMLAH_PEMILIH, // 1..1024
  eligibilityPolicy: "Tiga credential uji end-to-end",
};

// Credential adalah 32 byte acak CSPRNG; daunnya dihitung circuit kontrak
// sendiri, bukan hash tandingan di TypeScript.
const credentials = Array.from({ length: JUMLAH_PEMILIH }, () => buatCredential());
const daun = credentials.map(daunEligibility);

const rahasiaAdmin = kunciAdmin(ctx); // JANGAN PERNAH di-log
const nonce = crypto.getRandomValues(new Uint8Array(32));

const providersBallot = await rakitProvidersBallot(kp, "admin");
const { alamat: alamatBallot, kontrak: ballot } = await deployBallot(
  providersBallot,
  metadata,
  rahasiaAdmin,
  nonce,
  log,
  JUMLAH_PEMILIH,
);

// `ballot` datang langsung dari deployContract — private state awal (kunci
// admin) sudah tertulis olehnya. Tidak ada temukanBallot di sini: itu akan
// mengulang lima perjalanan indexer dan menimpa private state yang sudah benar.
await daftarkanVoter(ballot, daun, log);

const providersRegistry = await rakitProvidersRegistry(kp, "admin");
const registry = await temukanRegistry(providersRegistry, alamatRegistry);
await catatKeRegistry(registry, alamatBallot, log);

// Indexer tertinggal node beberapa detik. Membaca registeredCount tepat setelah
// registerVoters sukses bisa mengembalikan 0 — itu keterlambatan, bukan
// kegagalan. Baca ulang sampai tenang, dengan batas.
const { nilai: lb, cocok, galatTerakhir, percobaan } = await ulangiSampai(
  () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
  (x) => x.registeredCount === BigInt(JUMLAH_PEMILIH),
  log,
  `registeredCount === ${JUMLAH_PEMILIH}`,
);

if (!cocok || lb === undefined) {
  log.error(
    { registeredCount: lb?.registeredCount.toString() ?? "(tidak terbaca)", galatTerakhir, percobaan },
    `registeredCount tidak pernah mencapai ${JUMLAH_PEMILIH} setelah ${percobaan} pembacaan. Ballot dan credential TETAP disimpan supaya keadaan ini bisa diperiksa.`,
  );
  tulisArtefak(config.networkId, {
    ballot: alamatBallot,
    voteDeadline: metadata.voteDeadline.toString(),
    tallyDeadline: metadata.tallyDeadline.toString(),
    options: metadata.options,
    credentials: credentials.map((c) => Buffer.from(c).toString("hex")),
  });
  await hentikanWallet(ctx, log);
  process.exit(1);
}

const lr = await bacaLedgerRegistry(kp.publicDataProvider, alamatRegistry);
log.info(
  {
    registeredCount: lb.registeredCount.toString(),
    eligibleCount: lb.eligibleCount.toString(),
    voteCount: lb.voteCount.toString(),
    phase: lb.phase,
    registryCount: lr.count.toString(),
  },
  "Ballot siap menerima suara",
);

const artefak = tulisArtefak(config.networkId, {
  ballot: alamatBallot,
  voteDeadline: metadata.voteDeadline.toString(),
  tallyDeadline: metadata.tallyDeadline.toString(),
  options: metadata.options,
  credentials: credentials.map((c) => Buffer.from(c).toString("hex")),
});
log.info(
  { berkas: `pkgs/cli/artefak/${config.networkId}.json`, ballot: artefak.ballot },
  "Alamat ballot dan credential tersimpan (berkas ini di-gitignore — credential adalah bahan uji)",
);

await tutupSesi(sesi, 0);
```

- [ ] **Step 6: Typecheck dan jalankan seluruh uji unit**

```bash
pnpm --filter cli typecheck && pnpm --filter cli exec vitest run
```

Diharapkan: typecheck exit 0; seluruh uji CLI hijau (args, seed, mnemonic, tunggu 7, providers 5, artefak 4, deploy 10).

Bila tsc mengeluh pada `args:` di `deployBallot` (jumlah atau tipe elemen tuple), bandingkan satu per satu dengan urutan 14 parameter di `pkgs/contract/src/managed/ballot/contract/index.d.ts` — itu sumber kebenarannya, bukan ingatan.

- [ ] **Step 7: Jalankan terhadap preview**

```bash
docker compose -f pkgs/cli/proof-server.yml up -d
pnpm cli deploy-ballot
# atau: printf '%s' "$FRASA" | pnpm cli deploy-ballot
```

Diharapkan, berurutan:
1. Sinkronisasi wallet — kali ini dari cache, sekitar satu detik.
2. `Men-deploy ballot` dengan `voteDeadline`/`tallyDeadline` berupa angka ~1,7 miliar (**sepuluh digit**, bukan tiga belas — tiga belas digit berarti milidetik dan validasi seharusnya sudah menolaknya lebih dulu).
3. `Ballot ter-deploy` dengan alamat 64 hex.
4. `Mendaftarkan batch daun eligibility` satu kali (`batch: 1, dari: 1, n: 3`), lalu `Batch terdaftar`.
5. `Ballot tercatat di registry`.
6. Mungkin satu-dua baris `Indexer belum menyusul; membaca ulang` dengan `label: "registeredCount === 3"` — itu normal.
7. `Ballot siap menerima suara` dengan `registeredCount: "3"`, `eligibleCount: "3"`, `voteCount: "0"`, `phase: 0`, `registryCount: "1"`.
8. `Alamat ballot dan credential tersimpan`, lalu `Sesi ditutup` dengan `kode: 0`.

Total sekitar 6–10 menit: empat transaksi, masing-masing satu proof ZK (5–20 detik) plus finalisasi node dan indexer.

Diagnosa bila melenceng:

| Gejala | Sebab dan tindakan |
|---|---|
| `failed assert: Hanya admin yang boleh mendaftarkan pemilih` | `kunciAdmin` tidak mereproduksi kunci yang dipakai saat deploy. Periksa bahwa `deployBallot` menerima `rahasiaAdmin` yang sama, dan bahwa tidak ada `temukanBallot` yang menimpa private state antara deploy dan `daftarkanVoter`. |
| `type error: ... expected value of type Vector<8, Bytes<32>>` | `batchDaun` tidak dipakai, atau hasilnya dipotong di suatu tempat. |
| `registeredCount tidak pernah mencapai 3` | Bukan lagi tebakan: `ulangiSampai` sudah membaca ulang 12 kali dengan jeda 5 detik (satu menit) sebelum menyerah. Bila tetap 0 setelah itu, transaksi registerVoters-nya memang tidak mendarat — periksa `txId` yang tercatat di log terhadap indexer. |
| `callTx.registerVoters ... tidak selesai dalam 15 menit` | Periksa proof server dan saldo DUST. **Jangan mengulang** sebelum membaca `registeredCount`: batch yang sudah mendarat akan terdaftar dua kali dan memakan kuota `eligibleCount`. |

- [ ] **Step 8: Commit**

```bash
git add pkgs/cli/src
git commit -m "feat(cli): deploy ballot bermetadata, pendaftaran pemilih, dan pencatatan ke registry"
```

---

### Task 6: Uji end-to-end tiga pemilih di preview

Inilah bukti yang tidak bisa diberikan simulator. Deadline benar-benar berlalu, proof benar-benar dibuat, transaksi benar-benar difinalisasi node, dan tally benar-benar kosong selama pemungutan suara berlangsung.

**Baris terpenting dalam berkas ini adalah pemeriksaan bahwa `tallies` KOSONG setelah tiga suara masuk.** Itu bentuk yang bisa dieksekusi dari janji inti aplikasi ini: selama pemungutan suara berlangsung, rantai hanya memegang nullifier dan commitment, dan tidak ada hasil parsial yang bisa bocor — tidak kepada penyelenggara, tidak kepada siapa pun yang membaca chain. Kalau baris itu suatu saat harus dilonggarkan, produknya sudah berubah, bukan ujinya.

**Berapa lama, dan kenapa tidak bisa dipercepat.** Sekitar **100–110 menit**, sebagian besarnya menunggu. Dua penantian tidak bisa dihindari: sampai `voteDeadline` lewat (60 menit sejak metadata disusun) dan sampai `tallyDeadline` lewat (95 menit sejak metadata disusun). Kontrak membandingkan deadline terhadap **waktu blok jaringan**, dan waktu blok jaringan publik tidak bisa dimajukan dari klien — tidak ada `evm_increaseTime` di sini. Simulator bisa menyuntikkan waktu; preview tidak.

Kenapa 60/95 dan bukan 15/35 seperti sketsa awal, atau 45/80 seperti draf sebelumnya: jendela 15 menit tidak muat pekerjaannya, dan jendela 45/80 sendiri kemudian terbukti kekecilan untuk anggaran waktu loop coblos e2e.ts (lihat `SISA_MINIMAL_VOTE`/`SISA_MINIMAL_TALLY`) begitu keduanya dihitung pada basis biaya yang benar. Perhitungan lengkapnya, dan modul bersama `./jadwal.ts` yang sekarang jadi satu-satunya sumber nilai ini, ada di Step 5.

Selain menunggu, ada **sepuluh atau sebelas transaksi**, masing-masing dengan proof ZK sungguhan 5–20 detik ditambah finalisasi node dan indexer: deploy ballot, registerVoters, register ke registry, tiga castVote, tiga tallyVote, finalize — sepuluh bila registry sudah tercatat di artefak dari sesi sebelumnya (dipakai ulang), sebelas bila belum (turut men-deploy registry baru). Jeda panjang tanpa keluaran adalah normal — dan sejak Task 4, jeda yang benar-benar tak berujung berakhir sendiri dengan pesan, bukan dengan diam.

**Files:**
- Create: `pkgs/cli/src/vote.ts`, `pkgs/cli/src/e2e.ts`
- Modify: `pkgs/cli/src/tunggu.ts`
- Test: `pkgs/cli/src/tunggu.test.ts` (menambah blok uji, tidak mengganti yang ada)

**Interfaces:**
- Consumes: seluruh keluaran Task 1–5 — khususnya `pastikan`, `denganBatasWaktu`, `BATAS_MS`, `ulangiSampai` (Task 4 `tunggu.ts`), `deployRegistry`, `deployBallot`, `temukanBallot`, `temukanRegistry`, `daftarkanVoter`, `catatKeRegistry`, `bacaLedgerBallot`, `kunciAdmin` (Task 4–5 `deploy.ts`), `siapkanSesi`, `tutupSesi`, `hentikanWallet` (Task 4 `bootstrap.ts`), `detikSekarang`, `detikDariSekarang`, `MENIT`, `buatCredential`, `daunEligibility` (paket `shared`), `Ballot`, `emptyBallotPrivateState`, `withCredential`, `withOpening`, `withEligibilityPath`, `withCommitmentPath` (paket `contract`).
- Produces:
  - Tambahan pada `pkgs/cli/src/tunggu.ts`:
    - `tungguSampaiDetik(target: bigint, log: Logger, label: string, bufferDetik?: number): Promise<void>`
    - `ringkasTallies(entri: readonly (readonly [bigint, bigint])[], nOpsi: number): bigint[]`
    - `POLA_BELUM_WAKTUNYA: RegExp`
    - `cobaSampaiWaktuBlokCocok<T>(fn: () => Promise<T>, log: Logger, pola?: RegExp, maks?: number, jedaMs?: number): Promise<T>`
  - `pkgs/cli/src/vote.ts`:
    - `acak32(): Uint8Array`
    - `siapkanPemilih(providers: ProvidersBallot, alamat: string, credential: Uint8Array, opsi: bigint, salt: Uint8Array, jalurEligibility: MerkleTreePath<Uint8Array>): Promise<void>`
    - `siapkanPembukaan(providers: ProvidersBallot, alamat: string, opsi: bigint, salt: Uint8Array, jalurCommitment: MerkleTreePath<Uint8Array>): Promise<void>`
    - `pilih(ballot: FoundContract<BallotC>, log: Logger, label: string): Promise<void>`
    - `bukaSuara(ballot: FoundContract<BallotC>, log: Logger, label: string): Promise<void>`
    - `finalisasi(ballot: FoundContract<BallotC>, log: Logger): Promise<void>`
  - `pkgs/cli/src/e2e.ts` — **skrip tingkat-atas, tidak mengekspor apa pun.** Tidak ada fungsi `jalankanE2E`: berkas ini adalah rangkaian bagian bernomor yang dijalankan `pnpm cli e2e`, dan tidak ada pemanggil lain yang boleh mengimpornya.

---

- [ ] **Step 1: Selesaikan pertanyaan lokal-vs-on-chain SEBELUM menulis kode apa pun**

`cobaSampaiWaktuBlokCocok` (Step 3) mengulang berdasarkan **galat yang dilempar**. Itu hanya benar bila `assert(kernel.blockTimeGreaterThan(voteDeadline))` gagal saat circuit dieksekusi secara **lokal** — sebelum proof dibuat dan sebelum transaksi dikirim. Bila sebaliknya penolakan terjadi **on-chain**, kegagalannya muncul sebagai `status` transaksi, bukan sebagai `throw`, dan logika ulang tidak akan pernah menangkapnya.

Pertanyaan ini dijawab dari kode yang dihasilkan compactc, bukan dari transaksi percobaan di jaringan: jawabannya deterministik, ada di repo ini, dan tidak memerlukan wallet, DUST, maupun ballot yang masih hidup.

```bash
cd /home/mdlog/Project-MDlabs/Akindo/votepriv
awk '/_tallyVote_0\(context, partialProofData\) \{/,/Batas waktu pembukaan suara sudah lewat/' \
  pkgs/contract/src/managed/ballot/contract/index.js \
  | grep -n "__compactRuntime.assert(\|submitTx\|Pemungutan suara masih berlangsung\|Batas waktu pembukaan suara sudah lewat"
```

Diharapkan persis lima baris, bernomor relatif terhadap awal badan circuit:

```
2:    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
21:    __compactRuntime.assert((tmp_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
52:                            'Pemungutan suara masih berlangsung');
54:    __compactRuntime.assert((tmp_1 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
85:                            'Batas waktu pembukaan suara sudah lewat');
```

Yang dibuktikan keluaran itu, dan jawaban yang dikunci ke dalam kode di langkah-langkah berikutnya:

1. **Ketiga assert berada di dalam badan `_tallyVote_0`**, yaitu fungsi yang dieksekusi runtime untuk menyusun transkrip — jauh sebelum proving, jauh sebelum pengiriman. Tidak ada `submitTx` di antara keduanya (grep di atas mencarinya dan tidak menemukannya).
2. `__compactRuntime.assert` **melempar**, tidak mengembalikan status. Buktinya satu baris:

```bash
sed -n '29,33p' pkgs/cli/node_modules/@midnight-ntwrk/compact-runtime/dist/error.js
```

Diharapkan:

```
export function assert(b, s) {
    if (!b) {
        const msg = `failed assert: ${s}`;
        throw new CompactError(msg);
```

Jadi pesan yang sampai ke pemanggil adalah `failed assert: Pemungutan suara masih berlangsung` — cocok dengan `POLA_BELUM_WAKTUNYA` sebagai substring, dan datang dalam hitungan detik tanpa membakar proof maupun biaya.

3. **Urutan assert di `ballot.compact` juga sudah benar untuk keperluan ini**: `phase != finalized` → `blockTimeGreaterThan(voteDeadline)` → `blockTimeLessThan(tallyDeadline)` → baru witness `get_my_option()`/`get_my_salt()`. Artinya pesan deadline datang LEBIH DULU daripada "opening untuk ballot ... belum diisi di private state", sehingga sebuah percobaan yang terlalu dini tidak akan menyamar sebagai kegagalan private state.

**Kesimpulan yang dipakai seluruh Task 6:** logika ulang berbasis `throw` benar apa adanya. Tidak ada versi alternatif `bukaSuara`/`finalisasi` yang perlu dipilih.

Terpisah dari itu — dan bukan sebagai cadangan untuk pertanyaan di atas — ketiga pembungkus di Step 4 tetap memeriksa `status` transaksi tanpa syarat. Itu menjaga kegagalan yang MEMANG on-chain (`FailEntirely`/`FailFallible` karena sebab apa pun: DUST habis di tengah jalan, konflik nullifier, kesalahan penyeimbangan) supaya tidak lolos sebagai "sukses" hanya karena tidak ada yang dilempar. Pesannya sengaja TIDAK cocok dengan `POLA_BELUM_WAKTUNYA` sehingga tidak pernah diulang: pada titik itu penyebabnya bukan waktu blok.

- [ ] **Step 2: Tambahkan uji yang gagal untuk helper fase tally**

Tambahkan ke `pkgs/cli/src/tunggu.test.ts` (blok yang sudah ada dari Task 4 dibiarkan utuh; hanya impor di baris pertama yang bertambah):

```typescript
// Ganti baris impor dari "./tunggu.ts" menjadi:
import {
  cobaSampaiWaktuBlokCocok,
  denganBatasWaktu,
  pastikan,
  POLA_BELUM_WAKTUNYA,
  ringkasTallies,
  ulangiSampai,
} from "./tunggu.ts";
```

lalu tambahkan di akhir berkas:

```typescript
describe("ringkasTallies", () => {
  it("memetakan entri map tally ke array per opsi", () => {
    expect(ringkasTallies([[0n, 2n], [2n, 1n]], 3)).toEqual([2n, 0n, 1n]);
  });

  it("mengembalikan seluruh nol untuk tally kosong", () => {
    expect(ringkasTallies([], 3)).toEqual([0n, 0n, 0n]);
  });

  it("menolak opsi di luar rentang", () => {
    expect(() => ringkasTallies([[7n, 1n]], 3)).toThrow(/di luar rentang/);
  });
});

describe("POLA_BELUM_WAKTUNYA", () => {
  it("cocok dua pesan 'belum waktunya' dan TIDAK cocok 'sudah lewat'", () => {
    // Dua yang boleh diulang: waktu blok belum sampai, mencoba lagi masuk akal.
    expect(POLA_BELUM_WAKTUNYA.test("failed assert: Pemungutan suara masih berlangsung")).toBe(true);
    expect(POLA_BELUM_WAKTUNYA.test("failed assert: Batas waktu pembukaan suara belum lewat")).toBe(true);
    // Yang TIDAK boleh diulang: jendelanya sudah tertutup, mengulang hanya
    // membakar proof. Perhatikan "sudah" versus "belum".
    expect(POLA_BELUM_WAKTUNYA.test("failed assert: Batas waktu pembukaan suara sudah lewat")).toBe(false);
    expect(POLA_BELUM_WAKTUNYA.test("failed assert: Credential ini sudah dipakai memilih")).toBe(false);
  });
});

describe("cobaSampaiWaktuBlokCocok", () => {
  it("mengulang selama pesannya 'belum waktunya', lalu meneruskan hasil", async () => {
    let ke = 0;
    const hasil = await cobaSampaiWaktuBlokCocok(
      async () => {
        ke += 1;
        if (ke < 3) throw new Error("failed assert: Pemungutan suara masih berlangsung");
        return "dibuka";
      },
      logPalsu,
      POLA_BELUM_WAKTUNYA,
      5,
      1,
    );
    expect(hasil).toBe("dibuka");
    expect(ke).toBe(3);
  });

  it("meneruskan galat lain apa adanya tanpa satu pun pengulangan", async () => {
    let ke = 0;
    await expect(
      cobaSampaiWaktuBlokCocok(
        async () => {
          ke += 1;
          throw new Error("failed assert: Credential ini sudah dipakai memilih");
        },
        logPalsu,
        POLA_BELUM_WAKTUNYA,
        5,
        1,
      ),
    ).rejects.toThrow(/sudah dipakai memilih/);
    expect(ke).toBe(1);
  });
});
```

```bash
pnpm --filter cli exec vitest run src/tunggu.test.ts
```

Diharapkan: gagal — `tunggu.ts` belum mengekspor `ringkasTallies`, `POLA_BELUM_WAKTUNYA`, maupun `cobaSampaiWaktuBlokCocok`.

- [ ] **Step 3: Tambahkan helper fase tally ke tunggu.ts sampai hijau**

Tambahkan di akhir `pkgs/cli/src/tunggu.ts` (dan tambahkan `import { detikSekarang } from "shared";` di blok impor berkas itu, di bawah `import type { Logger } from "pino";`):

```typescript
/**
 * Meratakan isi ledger `tallies` (Map<Uint<8>, Uint<64>>) menjadi array per
 * opsi. Sengaja tidak memakai `tallies.lookup(k)`: lookup pada kunci yang tidak
 * ada MELEMPAR "expected a cell, received null", sedangkan opsi tanpa suara
 * memang tidak punya kunci. Iterasi `[...ledger.tallies]` menghasilkan pasangan
 * [opsi, jumlah] dan menghindari jebakan itu sepenuhnya.
 */
export const ringkasTallies = (
  entri: readonly (readonly [bigint, bigint])[],
  nOpsi: number,
): bigint[] => {
  const hasil = new Array<bigint>(nOpsi).fill(0n);
  for (const [opsi, jumlah] of entri) {
    const i = Number(opsi);
    if (i < 0 || i >= nOpsi) throw new Error(`Tally untuk opsi ${i} di luar rentang 0..${nOpsi - 1}`);
    hasil[i] = jumlah;
  }
  return hasil;
};

/**
 * Menunggu waktu dinding melewati sebuah deadline (DETIK sejak epoch), dengan
 * buffer.
 *
 * Buffer ada karena yang dibandingkan kontrak adalah WAKTU BLOK, bukan jam
 * lokal. Keduanya berjalan bersama tapi tidak identik: blok berikutnya bisa
 * saja masih membawa cap waktu sedikit sebelum deadline walau jam kita sudah
 * lewat. Buffer 60 detik jauh lebih murah daripada satu proof yang terbuang.
 */
export async function tungguSampaiDetik(
  target: bigint,
  log: Logger,
  label: string,
  bufferDetik = 60,
): Promise<void> {
  const sasaran = target + BigInt(bufferDetik);
  while (detikSekarang() < sasaran) {
    const sisa = Number(sasaran - detikSekarang());
    log.info(
      { sisaDetik: sisa, label },
      `Menunggu ${label} benar-benar lewat. Waktu blok jaringan nyata tidak bisa dimajukan — penantian ini tidak bisa dipersingkat.`,
    );
    await new Promise((r) => setTimeout(r, Math.min(30_000, Math.max(1_000, sisa * 1000))));
  }
  log.info({ label }, `${label} sudah lewat menurut jam lokal (+${bufferDetik} detik buffer)`);
}

/**
 * Dua pesan assert yang BOLEH diulang — dan hanya dua.
 *
 *   "Pemungutan suara masih berlangsung"        (tallyVote terlalu cepat)
 *   "Batas waktu pembukaan suara belum lewat"   (finalize terlalu cepat)
 *
 * Keduanya berarti hal yang sama: jam lokal sudah lewat, waktu blok belum.
 * Menunggu lalu mengulang akan berhasil.
 *
 * Yang SENGAJA TIDAK ada di sini: "Batas waktu pembukaan suara **sudah**
 * lewat" — assert ketiga tallyVote. Perbedaannya satu kata (belum/sudah) dan
 * artinya berlawanan: jendelanya sudah tertutup, dan mengulang hanya membakar
 * proof sampai `maks` habis. Ia harus melempar keluar dan menghentikan proses.
 * Itu pula sebabnya kedua loop di e2e.ts punya penjaga anggaran waktu: pesan
 * itu tidak boleh sampai pernah muncul.
 */
export const POLA_BELUM_WAKTUNYA = /Pemungutan suara masih berlangsung|Batas waktu pembukaan suara belum lewat/;

/**
 * Mengulang sebuah pemanggilan selama kegagalannya adalah "waktu blok belum
 * sampai" — bukan kegagalan lain.
 *
 * Aman diulang karena assert deadline dievaluasi saat eksekusi circuit LOKAL
 * (dibuktikan di Step 1): percobaan yang gagal tidak pernah menghasilkan
 * proof, tidak pernah dikirim, dan tidak pernah mengubah keadaan chain.
 *
 * Kegagalan lain diteruskan apa adanya — mengulang assert seperti "Credential
 * ini sudah dipakai memilih" tidak akan pernah berhasil dan hanya membuang
 * waktu di dalam jendela yang berbatas.
 */
export async function cobaSampaiWaktuBlokCocok<T>(
  fn: () => Promise<T>,
  log: Logger,
  pola: RegExp = POLA_BELUM_WAKTUNYA,
  maks = 6,
  jedaMs = 20_000,
): Promise<T> {
  let terakhir: unknown;
  for (let i = 1; i <= maks; i++) {
    try {
      return await fn();
    } catch (e) {
      terakhir = e;
      const pesan = (e as Error).message ?? String(e);
      if (!pola.test(pesan)) throw e;
      log.warn({ percobaan: i, dari: maks, pesan }, "Waktu blok belum melewati deadline; menunggu lalu mencoba lagi");
      if (i < maks) await new Promise((r) => setTimeout(r, jedaMs));
    }
  }
  throw terakhir;
}
```

```bash
pnpm --filter cli exec vitest run src/tunggu.test.ts
```

Diharapkan: **13 uji hijau** — 7 dari Task 4 (pastikan 1, denganBatasWaktu 2, ulangiSampai 4) ditambah 6 dari Step 2 (ringkasTallies 3, POLA_BELUM_WAKTUNYA 1, cobaSampaiWaktuBlokCocok 2).

`maks = 6` dan `jedaMs = 20_000` berarti anggaran ulang maksimal **2 menit** per pemanggilan. Itu dipilih supaya muat di jendela tally yang dihitung di Step 5, bukan diambil dari udara.

- [ ] **Step 4: Tulis vote.ts**

`pkgs/cli/src/vote.ts`:

```typescript
// castVote, tallyVote, dan finalize lewat CLI.
//
// Ketiga circuit ini TIDAK menerima argumen: seluruh masukannya datang dari
// witness, yang membaca private state BERKUNCI ALAMAT KONTRAK. Berkas ini
// karena itu sebagian besar berisi penulisan private state yang benar SEBELUM
// pemanggilan, bukan pemanggilannya sendiri.
import crypto from "node:crypto";
import type { MerkleTreePath } from "@midnight-ntwrk/compact-runtime";
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import { SucceedEntirely } from "@midnight-ntwrk/midnight-js-types";
import {
  BallotPrivateStateId,
  emptyBallotPrivateState,
  withCommitmentPath,
  withCredential,
  withEligibilityPath,
  withOpening,
  type BallotPrivateState,
} from "contract";
import type { Logger } from "pino";
import type { BallotC } from "./kontrak.ts";
import type { ProvidersBallot } from "./providers.ts";
import { BATAS_MS, denganBatasWaktu } from "./tunggu.ts";

export const acak32 = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

/**
 * Menulis kredensial, pilihan, salt, dan Merkle path eligibility untuk SATU
 * pemilih, di bawah alamat ballot yang sedang dipakai. Ini persiapan
 * **castVote**, dan hanya castVote — parameter terakhirnya adalah path
 * eligibility, bukan path commitment.
 *
 * `setContractAddress` wajib dipanggil lebih dulu: level provider menyusun
 * kuncinya sebagai `${contractAddress}:${privateStateId}` dan melempar
 * "Contract address not set..." bila belum disetel. midnight-js memanggilnya
 * sendiri di dalam deploy/find/call, tapi TIDAK untuk tulisan langsung seperti
 * ini. Alamat yang dipakai harus string 64 hex APA ADANYA dari
 * `deployTxData.public.contractAddress` — sama persis dengan yang dilihat
 * witness lewat `WitnessContext.contractAddress`.
 *
 * secretKey diisi nol: castVote dan tallyVote tidak membacanya sama sekali.
 * Hanya registerVoters (admin) yang butuh kunci admin sungguhan.
 */
export async function siapkanPemilih(
  providers: ProvidersBallot,
  alamat: string,
  credential: Uint8Array,
  opsi: bigint,
  salt: Uint8Array,
  jalurEligibility: MerkleTreePath<Uint8Array>,
): Promise<void> {
  const psp = providers.privateStateProvider;
  psp.setContractAddress(alamat);

  const dasar = (await psp.get(BallotPrivateStateId)) ?? emptyBallotPrivateState(new Uint8Array(32));
  let ps: BallotPrivateState = withCredential(dasar, alamat, credential);
  ps = withOpening(ps, alamat, { option: opsi, salt });
  ps = withEligibilityPath(ps, alamat, jalurEligibility);
  await psp.set(BallotPrivateStateId, ps);
}

/**
 * Menulis opening dan Merkle path commitment menjelang **tallyVote**.
 *
 * Path commitment HARUS disusun dari state ledger TERBARU: `commitments`
 * adalah MerkleTree biasa (bukan Historic), sehingga `checkRoot` hanya
 * menerima root saat ini. Path yang dibangun di tengah pemungutan suara akan
 * ditolak setelah suara lain masuk. `eligibility` sebaliknya Historic, jadi
 * path eligibility aman dibangun sejak pemilih terdaftar.
 *
 * Basis yang null diterima dan diisi dari `emptyBallotPrivateState`, BUKAN
 * dilempar. Alasannya bentuk, bukan kemudahan: tallyVote hanya memanggil
 * `get_my_option`, `get_my_salt`, dan `commitment_path` — ia tidak pernah
 * menyentuh `voter_credential`, `eligibility_path`, maupun `admin_secret_key`
 * (sudah diperiksa satu per satu di ballot.compact). Jadi kedua field yang
 * ditulis fungsi ini memang seluruh yang dibutuhkan.
 *
 * Konsekuensinya penting: JANGAN memanggil `siapkanPemilih` dengan path
 * commitment untuk "mengisi basis" sebelum fungsi ini. Kedua path bertipe sama
 * (`MerkleTreePath<Uint8Array>`), sehingga tsc tidak akan menangkap
 * pertukarannya, dan path commitment yang mendarat di `eligibilityPaths` hanya
 * tidak terlihat karena tallyVote kebetulan tidak membacanya — sampai suatu
 * hari ada circuit yang membacanya.
 */
export async function siapkanPembukaan(
  providers: ProvidersBallot,
  alamat: string,
  opsi: bigint,
  salt: Uint8Array,
  jalurCommitment: MerkleTreePath<Uint8Array>,
): Promise<void> {
  const psp = providers.privateStateProvider;
  psp.setContractAddress(alamat);

  const dasar = (await psp.get(BallotPrivateStateId)) ?? emptyBallotPrivateState(new Uint8Array(32));
  let ps: BallotPrivateState = withOpening(dasar, alamat, { option: opsi, salt });
  ps = withCommitmentPath(ps, alamat, jalurCommitment);
  await psp.set(BallotPrivateStateId, ps);
}

/**
 * Menegakkan bahwa transaksi benar-benar sukses SELURUHNYA.
 *
 * `callTx.*` menyelesaikan promise-nya begitu transaksi difinalisasi, sukses
 * maupun tidak: `FailEntirely` dan `FailFallible` datang sebagai NILAI, bukan
 * sebagai lemparan. Tanpa pemeriksaan ini, transaksi yang ditolak chain akan
 * tercatat di log sebagai "Suara masuk" dan baru terlihat salah beberapa
 * langkah kemudian, sebagai angka ledger yang tidak masuk akal.
 *
 * Pesannya sengaja TIDAK memuat frasa mana pun dari POLA_BELUM_WAKTUNYA:
 * kegagalan on-chain bukan soal waktu blok (Step 1 membuktikan assert deadline
 * gagal secara lokal), jadi ia tidak boleh diulang — ia harus menghentikan
 * proses.
 */
function pastikanSukses(status: string, apa: string, txId: string): void {
  if (status !== SucceedEntirely) {
    throw new Error(
      `${apa} difinalisasi chain dengan status ${status} (txId ${txId}), bukan ${SucceedEntirely}. Ini kegagalan on-chain, bukan soal waktu blok — periksa saldo DUST, nullifier, dan log proof server sebelum mencoba apa pun lagi.`,
    );
  }
}

export async function pilih(ballot: FoundContract<BallotC>, log: Logger, label: string): Promise<void> {
  log.info({ pemilih: label }, "castVote: membuat proof ZK (5-20 detik) lalu menunggu finalisasi");
  const r = await denganBatasWaktu(
    ballot.callTx.castVote(),
    BATAS_MS.panggilBerat,
    `callTx.castVote (${label}) tidak selesai dalam ${BATAS_MS.panggilBerat / 60_000} menit. JANGAN mengulang sebelum membaca voteCount dari indexer: bila transaksinya mendarat, credential ini sudah terpakai dan percobaan kedua akan ditolak "Credential ini sudah dipakai memilih".`,
  );
  pastikanSukses(r.public.status, `castVote (${label})`, r.public.txId);
  log.info({ pemilih: label, txId: r.public.txId, status: r.public.status }, "Suara masuk");
}

export async function bukaSuara(ballot: FoundContract<BallotC>, log: Logger, label: string): Promise<void> {
  log.info({ pemilih: label }, "tallyVote: membuat proof ZK lalu menunggu finalisasi");
  const r = await denganBatasWaktu(
    ballot.callTx.tallyVote(),
    BATAS_MS.panggilBerat,
    `callTx.tallyVote (${label}) tidak selesai dalam ${BATAS_MS.panggilBerat / 60_000} menit. JANGAN mengulang sebelum membaca talliedCount dari indexer: bila transaksinya mendarat, tallyNullifier-nya sudah terpakai.`,
  );
  pastikanSukses(r.public.status, `tallyVote (${label})`, r.public.txId);
  log.info({ pemilih: label, txId: r.public.txId, status: r.public.status }, "Suara dibuka");
}

export async function finalisasi(ballot: FoundContract<BallotC>, log: Logger): Promise<void> {
  log.info("finalize: membuat proof ZK lalu menunggu finalisasi");
  const r = await denganBatasWaktu(
    ballot.callTx.finalize(),
    BATAS_MS.panggilRingan,
    `callTx.finalize tidak selesai dalam ${BATAS_MS.panggilRingan / 60_000} menit. Periksa phase di indexer sebelum mengulang: finalize kedua akan ditolak "Ballot sudah difinalisasi".`,
  );
  pastikanSukses(r.public.status, "finalize", r.public.txId);
  log.info({ txId: r.public.txId, status: r.public.status }, "Ballot difinalisasi");
}
```

- [ ] **Step 5: Tulis e2e.ts**

**Anggaran waktu, dihitung bukan ditebak — DIPERBARUI mengikuti kode terkirim (Fix Round 3/4/5, lihat `pkgs/cli/src/jadwal.ts` dan komentar di atas `SISA_MINIMAL_VOTE`/`SISA_MINIMAL_TALLY` di `e2e.ts`).** Setiap komponen ditabelkan pada SALAH SATU dari dua basis biaya, sengaja berbeda per jenis: pembacaan indexer (`temukanBallot`, `temukanRegistry`, `bacaLedgerBallot`, retry eligibility path) pada BATAS TIMEOUT-nya (keterlambatan indexer itu umum dan bisa pulih, jadi guard harus mengizinkan menunggu sampai batas itu); proof+transaksi (`deployBallot`, `daftarkanVoter`, `catatKeRegistry`, `castVote`, `tallyVote`) pada biaya TERUKUR di preview (~2,5 menit), bukan batas timeout-nya — mencapai timeout proof/transaksi berarti proof server/node patologis rusak, kegagalan yang tidak bisa dipulihkan dengan menunggu lebih lama, dan menabelkannya pada timeout akan mendorong jendela ke orde jam tanpa melindungi apa pun.

Jendela pemungutan suara, `MENIT_VOTE = 60` (dari `./jadwal.ts`), dari saat `detikDariSekarang` dipanggil sampai `castVote` ketiga difinalisasi:

Pra-loop (sekali, sebelum iterasi pertama):

| Pekerjaan | Basis | Terburuk (detik) |
|---|---|---|
| `deployBallot` | terukur | 150 |
| `daftarkanVoter` (registerVoters) | terukur | 150 |
| `temukanRegistry` (hanya bila registry dari sesi sebelumnya) | timeout (`BATAS_MS.temukan`) | 300 |
| `catatKeRegistry` (register) | terukur | 150 |
| **Subtotal pra-loop** | | **750** |

Satu iterasi loop coblos (× 3 pemilih):

| Pekerjaan | Basis | Terburuk (detik) |
|---|---|---|
| retry eligibility path (`ulangiSampai`, bagian 5: maks 6 percobaan × `BATAS_MS.bacaIndexer` 60 dtk, ditambah 5 jeda × 5 dtk) | timeout | 385 |
| `temukanBallot` | timeout (`BATAS_MS.temukan`) | 300 |
| `castVote` | terukur | 150 |
| **Total satu iterasi** | | **835** |

Verifikasi dirantai PENUH pada basis terburuk, per iterasi, terhadap jendela 3600 detik (`MENIT_VOTE × 60`): sisa sebelum loop = 3600−750 = 2850 detik.
- iterasi ke-0: 2850 > 900 (margin 1950); konsumsi 835 → sisa 2015
- iterasi ke-1: 2015 > 900 (margin 1115); konsumsi 835 → sisa 1180
- iterasi ke-2: 1180 > 900 (margin 280); konsumsi 835 → sisa AKHIR 345 detik (~5,75 menit)

Penjaga `sisaDetik > SISA_MINIMAL_VOTE` (900 detik: 835 dibulatkan ke atas + margin 65 detik) diperiksa SEBELUM setiap iterasi dan menghentikan sebelum proof dibuang percuma.

Jendela pembukaan suara, `MENIT_TALLY - MENIT_VOTE = 35` menit (2100 detik) — MENIT_TALLY = 95, dinaikkan bersamaan dengan MENIT_VOTE supaya selisih 35 menit ini TIDAK menyempit:

| Pekerjaan | Basis | Terburuk (detik) |
|---|---|---|
| buffer `tungguSampaiDetik` (sekali, di awal) | — | 60 |
| `bacaLedgerBallot` sebelum tiap pembukaan | timeout (`BATAS_MS.bacaIndexer`) | 60 |
| jeda-ulang `cobaSampaiWaktuBlokCocok` (maks 6 percobaan ⇒ paling banyak 5 jeda × 20 dtk) | ekspektasi (`setTimeout` lokal, bukan `BATAS_MS`) | 100 |
| `tallyVote` | terukur | 150 |
| **Total satu iterasi (× 3)** | | **310** |

**Tidak ada `temukanBallot` di loop ini**: handle `FoundContract` dari bagian 5 dipakai ulang. Itu aman dan bukan optimasi berisiko — `callTx.*` memanggil `getStates` yang membaca ULANG state publik dari indexer dan private state dari LevelDB pada SETIAP pemanggilan (midnight-js-contracts 4.0.4 `dist/index.mjs:886-891`, `995`), sehingga tidak ada apa pun yang basi di dalam handle. Yang di-cache handle hanya alamat, compiledContract, dan providers.

Verifikasi: sisa setelah buffer = 2100−60 = 2040 detik.
- iterasi ke-0: 2040 > 360 (margin 1680); konsumsi 310 → sisa 1730
- iterasi ke-1: 1730 > 360 (margin 1370); konsumsi 310 → sisa 1420
- iterasi ke-2: 1420 > 360 (margin 1060); konsumsi 310 → sisa AKHIR 1110 detik (~18,5 menit)

Penjaga `sisaDetik > SISA_MINIMAL_TALLY` (360 detik: 310 dibulatkan ke atas + margin 50 detik — satu `bacaLedgerBallot` pada basis timeout 60 dtk + jeda ulang 100 dtk + satu `tallyVote` terukur 150 dtk) menghentikan run dengan pesan yang benar sebelum `blockTimeLessThan(tallyDeadline)` gagal. Itu penting: pesan "Batas waktu pembukaan suara sudah lewat" sengaja TIDAK ada di `POLA_BELUM_WAKTUNYA`, jadi tanpa penjaga ini ia akan melempar keluar dan mematikan run dengan dua dari tiga suara sudah terbuka — keadaan yang membuat pemeriksaan `talliedCount === 3n` di bagian 9 tidak akan pernah tercapai.

`MENIT_VOTE`/`MENIT_TALLY` TIDAK lagi didefinisikan lokal di `e2e.ts` maupun `deploy-ballot.ts`: keduanya diimpor dari `./jadwal.ts`, satu-satunya definisi bersama (lihat Step 5 Task 5 di atas dan berkas `jadwal.ts` sendiri) — sebelum penyatuan ini kedua skrip diam-diam menyimpang (45/80 di satu skrip, 60/95 di yang lain) tanpa ada yang memutuskan itu dengan sengaja.

`pkgs/cli/src/e2e.ts`:

```typescript
// `pnpm cli e2e` — uji end-to-end tiga pemilih di preview. Skrip tingkat-atas:
// TIDAK mengekspor apa pun, tidak boleh diimpor dari mana pun.
//
// LAMANYA: sekitar 100-110 menit, dan sebagian besarnya adalah MENUNGGU. Dua
// penantian tidak bisa dihindari: sampai voteDeadline lewat (60 menit sejak
// metadata disusun) dan sampai tallyDeadline lewat (95 menit sejak itu).
// Kontrak membandingkan deadline terhadap WAKTU BLOK jaringan, dan waktu blok
// jaringan publik tidak bisa dimajukan dari klien. Simulator bisa menyuntikkan
// waktu; preview tidak. Itulah tepatnya yang membuat uji ini bernilai.
//
// SEPULUH ATAU SEBELAS TRANSAKSI, masing-masing dengan proof ZK sungguhan
// 5-20 detik plus finalisasi node dan indexer: deploy ballot, registerVoters,
// register ke registry, 3x castVote, 3x tallyVote, finalize — SEPULUH bila
// registry sudah tercatat di artefak dari sesi sebelumnya (dipakai ulang,
// TIDAK di-deploy lagi), SEBELAS bila belum (turut men-deploy registry
// BARU). Setiap await ke jaringan dibungkus denganBatasWaktu, jadi jeda
// panjang berakhir dengan pesan dan bukan dengan diam tak berujung.
//
// SATU PEMILIH SATU STORE. Private state VotePriv berbentuk
// Record<alamatBallot, ...>, bukan Record<pemilih, ...> — midnight-js membaca
// SATU blob di BallotPrivateStateId sebelum tiap pemanggilan dan menulis
// balik ke id yang sama, sehingga tiga pemilih pada SATU ballot di satu store
// akan saling menimpa. Setiap pemilih di sini mendapat direktori LevelDB
// sendiri. Itu sekaligus menghindari LEVEL_LOCKED, karena provider
// membuka-menutup seluruh LevelDB pada tiap operasi.
//
// SEMUANYA BERURUTAN, tidak pernah Promise.all: selain lock LevelDB,
// penyeimbangan unshielded tidak memindahkan UTXO ke pending, sehingga dua
// transaksi yang diseimbangkan sebelum yang pertama terlihat di chain bisa
// memilih UTXO yang sama.
import crypto from "node:crypto";
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import { Ballot, emptyBallotPrivateState } from "contract";
import {
  buatCredential,
  daunEligibility,
  detikDariSekarang,
  detikSekarang,
  MENIT,
  type MetadataBallot,
} from "shared";
import { bacaArtefak, tulisArtefak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import {
  bacaLedgerBallot,
  catatKeRegistry,
  daftarkanVoter,
  deployBallot,
  deployRegistry,
  kunciAdmin,
  temukanBallot,
  temukanRegistry,
  type HasilDeployRegistry,
} from "./deploy.ts";
import { MENIT_TALLY, MENIT_VOTE } from "./jadwal.ts";
import type { BallotC } from "./kontrak.ts";
import { rakitProvidersBallot, rakitProvidersRegistry, type ProvidersBallot } from "./providers.ts";
import {
  cobaSampaiWaktuBlokCocok,
  pastikan,
  POLA_BELUM_WAKTUNYA,
  ringkasTallies,
  tungguSampaiDetik,
  ulangiSampai,
} from "./tunggu.ts";
import { acak32, bukaSuara, finalisasi, pilih, siapkanPemilih, siapkanPembukaan } from "./vote.ts";

const PILIHAN = [0n, 2n, 0n] as const; // hasil yang diharapkan: opsi0=2, opsi1=0, opsi2=1
const JUMLAH_PEMILIH = PILIHAN.length;

// MENIT_VOTE/MENIT_TALLY diimpor dari ./jadwal.ts — SATU-SATUNYA definisi,
// dipakai bersama dengan deploy-ballot.ts (Task 5 Step 5), supaya kedua
// skrip tidak lagi bisa diam-diam menyimpang (lihat komentar di jadwal.ts
// dan tabel anggaran waktu di Task 6 Step 5 di atas — jangan menurunkan
// angka-angkanya tanpa menghitung ulang tabel itu).
/** Cukup untuk retry eligibility path + temukanBallot + castVote pada basis biaya yang dinyatakan di atas SISA_MINIMAL_VOTE (e2e.ts). */
const SISA_MINIMAL_VOTE = 900;
/** Cukup untuk satu bacaLedgerBallot + jeda ulang cobaSampaiWaktuBlokCocok + satu tallyVote pada basis biaya yang dinyatakan di atas SISA_MINIMAL_TALLY (e2e.ts). */
const SISA_MINIMAL_TALLY = 360;

const sesi = await siapkanSesi();
const { config, log, ctx, kp } = sesi;

// ── 1. Registry ─────────────────────────────────────────────────────────────
//
// Bila registry di-deploy pada proses INI, handle-nya dipakai ulang; bila ia
// datang dari sesi sebelumnya, barulah temukanRegistry dipanggil. Membuang
// handle deploy berarti satu watchForDeployTxData + tiga query indexer yang
// percuma, di dalam jendela waktu yang sudah dihitung ketat.
const providersRegistry = await rakitProvidersRegistry(kp, "admin");
const alamatTersimpan = bacaArtefak(config.networkId)?.registry;

let registryDeploy: HasilDeployRegistry | undefined;
let alamatRegistry: string;
if (alamatTersimpan === undefined) {
  registryDeploy = await deployRegistry(providersRegistry, log);
  alamatRegistry = registryDeploy.alamat;
} else {
  alamatRegistry = alamatTersimpan;
}
tulisArtefak(config.networkId, { registry: alamatRegistry });
log.info({ alamatRegistry, dariSesiIni: registryDeploy !== undefined }, "Registry siap");

// ── 2. Ballot ───────────────────────────────────────────────────────────────
const metadata: MetadataBallot = {
  title: "Uji E2E VotePriv",
  description: "Tiga pemilih, tiga opsi, di jaringan preview.",
  community: "Midnight Builders",
  options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
  voteDeadline: detikDariSekarang(MENIT_VOTE * MENIT), // DETIK, bukan milidetik
  tallyDeadline: detikDariSekarang(MENIT_TALLY * MENIT), // > voteDeadline
  quorumPercent: 60, // <= 100
  eligibleCount: JUMLAH_PEMILIH, // 1..1024
  eligibilityPolicy: "Tiga credential uji end-to-end",
};

const rahasiaAdmin = kunciAdmin(ctx); // JANGAN PERNAH di-log
const credentials = Array.from({ length: JUMLAH_PEMILIH }, () => buatCredential());
const salts = Array.from({ length: JUMLAH_PEMILIH }, () => acak32());

const providersAdmin = await rakitProvidersBallot(kp, "admin");
const { alamat: alamatBallot, kontrak: ballotAdmin } = await deployBallot(
  providersAdmin,
  metadata,
  rahasiaAdmin,
  crypto.getRandomValues(new Uint8Array(32)),
  log,
  JUMLAH_PEMILIH,
);
// Fix seam Task 6/7: DI BAWAH KUNCI `e2e`, bukan di top level. Top-level
// ballot/voteDeadline/tallyDeadline/options/credentials adalah milik
// `deploy-ballot.ts` SEPENUHNYA (lihat ArtefakDeploy di artefak.ts) — bila
// e2e menulis ke sana, ballot yang deploy-ballot sudah bayar dan daftarkan
// tiga pemilihnya tertimpa dan credential-nya (yang HANYA hidup di berkas
// ini) hilang selamanya. e2e men-deploy ballotnya SENDIRI (baris di atas),
// jadi ia mencatat hasilnya di namespace sendiri pula.
tulisArtefak(config.networkId, {
  e2e: {
    ballot: alamatBallot,
    voteDeadline: metadata.voteDeadline.toString(),
    tallyDeadline: metadata.tallyDeadline.toString(),
    options: metadata.options,
    credentials: credentials.map((c) => Buffer.from(c).toString("hex")),
  },
});

// ── 3. Pendaftaran pemilih (harus SEBELUM suara pertama) ────────────────────
//
// `ballotAdmin` datang dari deployContract dan private state awalnya (kunci
// admin) sudah tertulis. Tidak ada temukanBallot di sini.
await daftarkanVoter(ballotAdmin, credentials.map(daunEligibility), log);

// ── 4. Catat ke registry ────────────────────────────────────────────────────
const registry = registryDeploy?.kontrak ?? (await temukanRegistry(providersRegistry, alamatRegistry));
await catatKeRegistry(registry, alamatBallot, log);

// ── 5. Tiga pemilih mencoblos: opsi 0, 2, 0 ─────────────────────────────────
const providersPemilih: ProvidersBallot[] = [];
for (let i = 0; i < JUMLAH_PEMILIH; i++) {
  providersPemilih.push(await rakitProvidersBallot(kp, `pemilih-${i}`));
}

// Handle per pemilih disimpan dan dipakai ULANG di bagian 8. `callTx.*`
// membaca ulang state publik dan private pada setiap pemanggilan, jadi handle
// yang lama tidak pernah basi — dan tiga findDeployedContract yang tidak jadi
// dijalankan adalah tiga kali lima menit anggaran yang kembali ke jendela.
const kontrakPemilih: FoundContract<BallotC>[] = [];

for (let i = 0; i < JUMLAH_PEMILIH; i++) {
  const label = `pemilih-${i}`;
  const sisaDetik = Number(metadata.voteDeadline - detikSekarang());
  pastikan(
    sisaDetik > SISA_MINIMAL_VOTE,
    `Anggaran waktu habis: tinggal ${sisaDetik} detik sampai voteDeadline, tidak cukup untuk castVote ${label} (butuh ${SISA_MINIMAL_VOTE} detik). Naikkan MENIT_VOTE dan jalankan ulang.`,
  );

  const lb = await bacaLedgerBallot(kp.publicDataProvider, alamatBallot);
  const jalur = lb.eligibility.findPathForLeaf(daunEligibility(credentials[i]));
  pastikan(jalur !== undefined, `Daun eligibility ${label} tidak ditemukan di pohon on-chain`);

  // temukanBallot menimpa private state, jadi ia dipanggil SEBELUM
  // siapkanPemilih — bukan sesudah.
  const ballot = await temukanBallot(
    providersPemilih[i],
    alamatBallot,
    emptyBallotPrivateState(new Uint8Array(32)),
  );
  kontrakPemilih.push(ballot);
  await siapkanPemilih(providersPemilih[i], alamatBallot, credentials[i], PILIHAN[i], salts[i], jalur);
  await pilih(ballot, log, label);
}

// ── 6. PEMERIKSAAN TERPENTING DI SELURUH BERKAS INI ─────────────────────────
//
// Selama pemungutan suara berlangsung, chain memegang nullifier dan commitment
// dan TIDAK ADA hasil parsial yang bisa bocor — tidak kepada penyelenggara,
// tidak kepada siapa pun yang membaca chain. Baris-baris di bawah adalah bentuk
// yang bisa dieksekusi dari janji itu. Kalau salah satunya harus dilonggarkan
// suatu hari, produknya yang berubah, bukan ujinya.
//
// PEMBACAAN DITENANGKAN LEBIH DULU. Indexer menyusul node beberapa detik;
// membaca tepat setelah castVote ketiga bisa mengembalikan voteCount = 2 dan
// membuat blok ini gagal dengan pesan yang berbunyi seperti kegagalan privasi
// padahal hanya keterlambatan. voteCount === 3 dipakai sebagai syarat tenang
// justru karena ia fakta yang paling belakangan tiba dari empat yang diperiksa.
{
  const { nilai: lb, cocok, galatTerakhir, percobaan } = await ulangiSampai(
    () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
    (x) => x.voteCount === BigInt(JUMLAH_PEMILIH),
    log,
    `voteCount === ${JUMLAH_PEMILIH} (menunggu indexer menyusul castVote terakhir)`,
  );
  if (!cocok || lb === undefined) {
    log.error(
      { voteCount: lb?.voteCount.toString() ?? "(tidak terbaca)", galatTerakhir, percobaan },
      `voteCount tidak pernah mencapai ${JUMLAH_PEMILIH} setelah ${percobaan} pembacaan. Ini BUKAN pemeriksaan privasi yang gagal — indexer tidak pernah menampilkan ketiga suara. Periksa txId ketiga castVote di log.`,
    );
    await hentikanWallet(ctx, log);
    process.exit(1);
  }

  const tally = ringkasTallies([...lb.tallies], metadata.options.length);

  log.info(
    {
      voteCount: lb.voteCount.toString(),
      talliedCount: lb.talliedCount.toString(),
      tallyKosong: lb.tallies.isEmpty(),
      tally: tally.map(String),
      phase: lb.phase, // dicatat untuk diagnosis, TIDAK di-assert: lihat catatan di bawah
    },
    "Keadaan chain SELAMA pemungutan suara berlangsung",
  );

  // Memimpin dengan voteCount adalah yang membuat empat baris berikutnya
  // bermakna: ia membuktikan tiga suara SUDAH ada di chain sebelum kita
  // menyatakan tally-nya kosong. Tanpa itu, "kosong" bisa saja berarti
  // "kosong karena tidak ada yang masuk".
  pastikan(
    lb.voteCount === BigInt(JUMLAH_PEMILIH),
    `voteCount harus ${JUMLAH_PEMILIH}, terbaca ${lb.voteCount}`,
  );
  pastikan(lb.tallies.isEmpty(), "PRIVASI BOCOR: tallies TIDAK kosong selagi pemungutan suara berlangsung");
  pastikan(lb.tallies.size() === 0n, `PRIVASI BOCOR: tallies.size() = ${lb.tallies.size()}, harus 0`);
  pastikan(tally.every((n) => n === 0n), `PRIVASI BOCOR: ada tally bukan nol selama voting: ${tally.map(String)}`);
  pastikan(lb.talliedCount === 0n, `talliedCount harus 0 selama voting, terbaca ${lb.talliedCount}`);

  // SENGAJA TIDAK ADA `pastikan(lb.phase === Ballot.BallotPhase.voting, ...)`
  // di sini, dan jangan menambahkannya. Per ballot.compact, phase hanya
  // berpindah keluar dari `voting` di dalam tallyVote atau finalize — dan
  // keduanya belum pernah dipanggil pada titik ini. Assert itu karena itu
  // tidak bisa gagal, tidak menguji apa pun tentang privasi, dan hanya
  // membuat blok ini terlihat lebih teliti daripada yang sebenarnya. phase
  // di-assert di tempat ia BISA membedakan: bagian 9 (tallying) dan
  // bagian 11 (finalized).
}

// ── 7. Menunggu voteDeadline benar-benar lewat ──────────────────────────────
await tungguSampaiDetik(metadata.voteDeadline, log, "voteDeadline");

// ── 8. Ketiga pemilih membuka suaranya ──────────────────────────────────────
//
// Path commitment dibangun dari state TERBARU tiap kali: `commitments` adalah
// MerkleTree biasa, checkRoot hanya menerima root saat ini.
//
// Hanya siapkanPembukaan yang dipanggil — TIDAK siapkanPemilih. tallyVote
// membaca get_my_option, get_my_salt, dan commitment_path saja; credential dan
// eligibility path tidak pernah disentuhnya. Memanggil siapkanPemilih di sini
// dengan `jalur` (yang adalah path COMMITMENT) akan menuliskannya ke
// `eligibilityPaths` — lolos tsc karena kedua path bertipe sama, dan tidak
// terlihat hanya karena tidak ada yang membacanya.
for (let i = 0; i < JUMLAH_PEMILIH; i++) {
  const label = `pemilih-${i}`;

  // Penjaga anggaran, kembaran dari yang ada di loop coblos. tallyVote
  // menegakkan blockTimeLessThan(tallyDeadline), dan pesannya ("Batas waktu
  // pembukaan suara SUDAH lewat") sengaja tidak ada di POLA_BELUM_WAKTUNYA —
  // jadi melewati batas berarti run mati dengan dua dari tiga suara terbuka
  // dan bagian 9 tidak akan pernah tercapai.
  const sisaDetik = Number(metadata.tallyDeadline - detikSekarang());
  pastikan(
    sisaDetik > SISA_MINIMAL_TALLY,
    `Anggaran waktu habis: tinggal ${sisaDetik} detik sampai tallyDeadline, tidak cukup untuk tallyVote ${label} (butuh ${SISA_MINIMAL_TALLY} detik). Naikkan MENIT_TALLY dan jalankan ulang.`,
  );

  const lb = await bacaLedgerBallot(kp.publicDataProvider, alamatBallot);
  const commitment = Ballot.pureCircuits.vote_commitment(PILIHAN[i], salts[i]);
  const jalur = lb.commitments.findPathForLeaf(commitment);
  pastikan(jalur !== undefined, `Commitment ${label} tidak ditemukan di pohon commitments`);

  await siapkanPembukaan(providersPemilih[i], alamatBallot, PILIHAN[i], salts[i], jalur);

  // Jam lokal boleh sudah lewat sementara waktu blok belum. Ulangi HANYA untuk
  // kegagalan itu — dan hanya sebanyak yang muat di anggaran (6 x 20 detik).
  await cobaSampaiWaktuBlokCocok(
    () => bukaSuara(kontrakPemilih[i], log, label),
    log,
    POLA_BELUM_WAKTUNYA,
    6,
    20_000,
  );
}

// ── 9. Hasil akhir: 2 / 0 / 1 ───────────────────────────────────────────────
{
  const { nilai: lb, cocok, galatTerakhir, percobaan } = await ulangiSampai(
    () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
    (x) => x.talliedCount === BigInt(JUMLAH_PEMILIH),
    log,
    `talliedCount === ${JUMLAH_PEMILIH} (menunggu indexer menyusul tallyVote terakhir)`,
  );
  if (!cocok || lb === undefined) {
    log.error(
      { talliedCount: lb?.talliedCount.toString() ?? "(tidak terbaca)", galatTerakhir, percobaan },
      `talliedCount tidak pernah mencapai ${JUMLAH_PEMILIH}. Periksa txId ketiga tallyVote di log terhadap indexer.`,
    );
    await hentikanWallet(ctx, log);
    process.exit(1);
  }

  const tally = ringkasTallies([...lb.tallies], metadata.options.length);
  log.info(
    { tally: tally.map(String), talliedCount: lb.talliedCount.toString(), phase: lb.phase },
    "Hasil setelah seluruh suara dibuka",
  );

  pastikan(tally[0] === 2n, `Opsi 0 harus 2 suara, terbaca ${tally[0]}`);
  pastikan(tally[1] === 0n, `Opsi 1 harus 0 suara, terbaca ${tally[1]}`);
  // member(), bukan lookup(): lookup pada kunci yang tidak ada MELEMPAR
  // "expected a cell, received null".
  pastikan(!lb.tallies.member(1n), "Opsi 1 seharusnya tidak punya entri tally sama sekali");
  pastikan(tally[2] === 1n, `Opsi 2 harus 1 suara, terbaca ${tally[2]}`);
  pastikan(lb.talliedCount === 3n, `talliedCount harus 3, terbaca ${lb.talliedCount}`);
  // Di SINI phase membedakan: tallyVote memindahkannya dari voting ke tallying.
  pastikan(lb.phase === Ballot.BallotPhase.tallying, `phase harus tallying (1), terbaca ${lb.phase}`);
}

// ── 10. Menunggu tallyDeadline, lalu finalisasi ─────────────────────────────
await tungguSampaiDetik(metadata.tallyDeadline, log, "tallyDeadline");
await cobaSampaiWaktuBlokCocok(() => finalisasi(ballotAdmin, log), log, POLA_BELUM_WAKTUNYA, 6, 20_000);

// ── 11. Bukti akhir ─────────────────────────────────────────────────────────
{
  const { nilai: lb, cocok, galatTerakhir } = await ulangiSampai(
    () => bacaLedgerBallot(kp.publicDataProvider, alamatBallot),
    (x) => x.phase === Ballot.BallotPhase.finalized,
    log,
    "phase === finalized (menunggu indexer menyusul finalize)",
  );
  if (!cocok || lb === undefined) {
    log.error({ phase: lb?.phase, galatTerakhir }, "phase tidak pernah terbaca finalized dari indexer.");
    await hentikanWallet(ctx, log);
    process.exit(1);
  }

  pastikan(lb.phase === Ballot.BallotPhase.finalized, `phase harus finalized (2), terbaca ${lb.phase}`);
  const tally = ringkasTallies([...lb.tallies], metadata.options.length);
  log.info(
    { alamatBallot, alamatRegistry, tally: tally.map(String), phase: lb.phase },
    "UJI END-TO-END LULUS: tiga suara masuk, tally kosong selama pemungutan suara, hasil akhir 2-0-1, ballot difinalisasi",
  );
}

await tutupSesi(sesi, 0);
```

- [ ] **Step 6: Typecheck dan jalankan seluruh uji unit**

```bash
pnpm --filter cli typecheck && pnpm --filter cli exec vitest run
```

Diharapkan: typecheck exit 0, seluruh uji unit hijau — args, seed, mnemonic, tunggu **13**, providers 5, artefak 4, deploy 10. Uji e2e sendiri BUKAN uji vitest — ia butuh jaringan dan 85+ menit, jadi ia dijalankan sebagai skrip.

- [ ] **Step 7: Jalankan uji end-to-end**

```bash
docker compose -f pkgs/cli/proof-server.yml up -d
pnpm cli e2e 2>&1 | tee /tmp/votepriv-e2e.log
# atau, bila frasa datang dari secret manager:
#   printf '%s' "$FRASA" | pnpm cli e2e 2>&1 | tee /tmp/votepriv-e2e.log
```

**Sediakan 100–110 menit dan jangan interupsi prosesnya.** Mematikan proses di antara pengiriman dan finalisasi meninggalkan chain sudah berubah sementara private state dan signing key lokal belum ditulis (keduanya ditulis setelah `SucceedEntirely` terlihat), dan pustaka ini tidak menyediakan jalur pemulihan untuk keadaan itu.

Urutan keluaran yang diharapkan:

1. Sinkronisasi wallet — dari cache, hitungan detik (dari keadaan dingin: ~5 menit).
2. `Registry siap` dengan `dariSesiIni: false` bila registry Task 4 masih tercatat di artefak.
3. `Men-deploy ballot` → `Ballot ter-deploy` (proof + finalisasi, beberapa menit).
4. `Mendaftarkan batch daun eligibility` `n: 3` → `Batch terdaftar`.
5. `Ballot tercatat di registry`.
6. Tiga blok `castVote: membuat proof ZK ...` → `Suara masuk`, satu per pemilih, berurutan.
7. Mungkin satu-dua baris `Indexer belum menyusul; membaca ulang` dengan `label: "voteCount === 3 ..."`.
8. **`Keadaan chain SELAMA pemungutan suara berlangsung`** dengan `voteCount: "3"`, `tallyKosong: true`, `tally: ["0","0","0"]`, `talliedCount: "0"`, `phase: 0`. Inilah baris yang membuktikan bahwa tidak ada tally parsial pernah muncul di chain selama pemungutan suara berlangsung — BUKAN bahwa pilihan seorang pemilih tak terkait dengan pemilih itu (lihat "CAKUPAN BUKTI" di baris 13: uji ini memakai satu wallet untuk seluruh transaksi dengan urutan indeks pemilih yang identik, jadi klaim unlinkability itu sengaja tidak dicoba dibuktikan di sini).
9. Baris `Menunggu voteDeadline benar-benar lewat` berulang setiap 30 detik dengan `sisaDetik` menurun. Ini bukan hang; ini waktu blok jaringan nyata yang tidak bisa dimajukan.
10. Tiga blok `tallyVote ...` → `Suara dibuka`. Baris `Waktu blok belum melewati deadline` sebelum yang pertama adalah normal.
11. `Hasil setelah seluruh suara dibuka` dengan `tally: ["2","0","1"]`, `talliedCount: "3"`, `phase: 1`.
12. `Menunggu tallyDeadline benar-benar lewat` berulang.
13. `Ballot difinalisasi`, lalu `UJI END-TO-END LULUS: ...` dengan `phase: 2`, lalu `Sesi ditutup` dengan `kode: 0`.

Diagnosa bila melenceng:

| Gejala | Sebab dan tindakan |
|---|---|
| `PRIVASI BOCOR: tallies TIDAK kosong` | Regresi paling serius yang mungkin. Jangan diperbaiki di uji — periksa `castVote` di `ballot.compact`: circuit itu hanya boleh menyentuh `nullifiers`, `commitments`, `voteCount`, dan witness `store_opening`. |
| `voteCount tidak pernah mencapai 3` | BUKAN kegagalan privasi. Indexer tidak pernah menampilkan ketiga suara walau `ulangiSampai` sudah membaca 12 kali dalam satu menit. Cocokkan ketiga `txId` castVote di log dengan indexer. |
| `credential untuk ballot ... belum diisi di private state` | `siapkanPemilih` dipanggil sebelum `temukanBallot` (yang menimpa private state), atau alamat yang dipakai sebagai kunci berbeda bentuknya. Cetak `Object.keys((await psp.get(BallotPrivateStateId))!.credentials)` dan bandingkan dengan alamat deploy — harus identik karakter demi karakter. |
| `commitmentPath untuk ballot ... belum diisi di private state` | `siapkanPembukaan` tidak dipanggil untuk store pemilih itu, atau ada `temukanBallot` yang menimpa private state SETELAHNYA. Urutan di bagian 8 sudah benar: siapkanPembukaan lalu bukaSuara, tanpa temukanBallot di antaranya. |
| `NotOpenError` / `LEVEL_LOCKED` | Ada operasi private state yang berjalan bersamaan. Cari `Promise.all` di jalur ini; seluruhnya harus berurutan. |
| `Anggaran waktu habis: tinggal N detik sampai voteDeadline` | Jaringan lebih lambat dari tabel anggaran di Step 5. Naikkan `MENIT_VOTE` **dan** `MENIT_TALLY` (jaga selisihnya ≥ 35 menit), jalankan ulang. Ballot baru akan di-deploy; ballot lama ditinggalkan, itu wajar. |
| `Anggaran waktu habis: tinggal N detik sampai tallyDeadline` | Sama, tapi hentikan lebih serius: sebagian suara mungkin sudah terbuka pada ballot yang ditinggalkan. Naikkan selisih `MENIT_TALLY - MENIT_VOTE`. |
| `... difinalisasi chain dengan status FailEntirely` | Kegagalan on-chain, bukan soal waktu blok. Periksa saldo DUST (`pnpm cli doctor`), lalu log proof server. Jangan mengulang sebelum membaca ledger: transaksi yang gagal entirely tidak mengubah state, yang gagal fallible bisa jadi mengubah sebagian. |
| `callTx.<sirkuit> ... tidak selesai dalam N menit` | Batas waktu Task 4 yang bekerja: `watchForTxData` memang menunggu selamanya, dan sekarang ada yang menghentikannya. Periksa `docker compose -f pkgs/cli/proof-server.yml logs --tail 50` dan saldo DUST. **Jangan mengirim ulang transaksinya** — ia mungkin sudah mendarat; baca ledger lebih dulu. |
| `Pendaftaran ditutup setelah suara pertama masuk` | Ada `castVote` yang mendahului `registerVoters`. Urutannya di `e2e.ts` sudah benar; periksa apakah ada sisa percobaan sebelumnya di store yang sama. |
| `Credential ini sudah dipakai memilih` | Menjalankan ulang e2e terhadap ballot LAMA. Uji ini selalu men-deploy ballot baru; pastikan `alamatBallot` memang dari deploy kali ini. |

- [ ] **Step 8: Commit**

```bash
git add pkgs/cli/src
git commit -m "test(cli): uji end-to-end tiga pemilih di preview dengan bukti tally kosong selama pemungutan suara"
```

---

## Selesai bila

- Registry ter-deploy di preview, alamatnya tercatat.
- Satu ballot ter-deploy dengan tiga credential terdaftar dan tercatat di registry.
- Uji end-to-end lulus: tiga suara masuk, tally kosong selama pemungutan suara, hasil akhir 2–0–1, ballot difinalisasi.
- Tidak ada seed yang pernah muncul di repo, log, atau keluaran terminal.

## Risiko dan jalur mundur

| Risiko | Jalur mundur |
|---|---|
| Sinkronisasi wallet pertama sangat lama | Biarkan berjalan; cache per jaringan membuat sesi berikutnya cepat. Jangan tambal offset |
| Bug SDK "Failed to clone intent" | **JANGAN salin `signTransactionIntents` dari repo rujukan.** Pada wallet-sdk-facade 4.0.1 yang terpasang ia tidak diperlukan *dan* tidak berfungsi: getter `tx.intents` mengembalikan `Map` baru setiap kali dipanggil, jadi `tx.intents.set(...)` tanpa menugaskan balik membuang seluruh tanda tangan yang dihitungnya. Bila galat ini muncul, laporkan apa adanya — jangan tambal. Lihat Task 4 dan catatan `wallet-bridge.ts` |
| Password private state ditolak | Kebijakan: ≥16 karakter, tiga kelas karakter, tanpa empat berurutan/identik |
| `ZKConfigurationReadError` | Periksa `zkConfigPath` memuat `keys/` dan `zkir/` |
| Versi runtime tidak cocok | Naikkan ke versi yang disebut `contract-info.json` |
| Endpoint jaringan berbeda dari konstanta | Berlaku untuk jalur BROWSER saja (`getConfiguration()` wallet bila tersedia, konstanta hanya cadangan). CLI (`pkgs/cli/src/config.ts`) tidak pernah memanggil `getConfiguration()` — konstanta `MIDNIGHT_NETWORK_ENDPOINTS` adalah satu-satunya sumbernya, bukan cadangan; endpoint yang salah di CLI berarti memperbarui konstanta itu sendiri |

## Rencana berikutnya

**Rencana C — Integrasi aplikasi.** Migrasi `client/` ke `pkgs/app`, `PrivacyAdapter` dengan implementasi Mock dan Midnight, pemecahan `Home.tsx`, dan perubahan UI di spec §9.2. Bergantung pada B karena alamat registry dan bentuk provider baru pasti setelah deployment nyata.

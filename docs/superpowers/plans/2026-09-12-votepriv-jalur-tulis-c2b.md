# C-2b VotePriv — Jalur Tulis (castVote + tallyVote dari Browser) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pemilih membuka VotePriv di browser (Brave, wallet Lace), mengetik credential yang sudah diterbitkan admin, memilih opsi, dan mengirim `castVote`/`tallyVote` sungguhan ke Midnight testnet — proof dibuat oleh proof server lokal pemilih sendiri, wallet hanya menyeimbangkan-menandatangani-mengirim transaksi yang SUDAH terbukti.

**Architecture:** Satu pintu dynamic-import (`client/src/lib/chain/jalur-tulis.ts`, sudah ada, sengaja melempar) membuka modul `./tulis.ts` yang merakit enam `ContractProviders` (private state di IndexedDB tulisan sendiri, ZK config berbasis `fetch`, proof provider HTTP ke proof server via proxy same-origin, indexer provider, dan wallet/midnight provider di belakang antarmuka `AdaptorWallet` sendiri yang diimplementasikan Lace), lalu memanggil `findDeployedContract` + `ballot.callTx.castVote()`/`tallyVote()` dari `@midnight-ntwrk/midnight-js-contracts` — rantai proof→balance→submit→watchForTxData berjalan otomatis di dalam paket itu begitu enam provider ada.

**Tech Stack:** React 19 + Vite 7 (sudah ada) · `@midnight-ntwrk/midnight-js-contracts` + 5 paket `midnight-js-*` @4.0.4 + `ledger-v8` @8.1.0 (sudah terpasang di akar) · `@midnight-ntwrk/compact-js` @2.5.0 (BARU, lihat Global Constraints) · IndexedDB native (tanpa library) · `fake-indexeddb` (devDependency uji, BARU) · Lace via `window.midnight` (EIP-6963-style, sudah ditemukan dengan benar oleh `client/src/lib/midnight-wallet.ts`).

**Spec:** `docs/superpowers/specs/2026-09-10-votepriv-midnight-design.md` §14 (dengan koreksi mengikat di §14.3 — lihat Global Constraints), `.superpowers/riset-c2b.md`, `.superpowers/spike-c2b-build.md`.

## Global Constraints

Nilai eksak, seluruhnya diverifikasi terhadap paket yang benar-benar terpasang di HEAD `2fb0af6` (kecuali disebut lain):

- **Basis hijau saat ini:** klien 26 berkas / 303 uji lolos + 1 dilewati; CLI 10 berkas / 121 uji lolos. `pnpm check` dan `pnpm check:uji` bersih. Setiap task WAJIB menjaga ini (plus uji baru task itu sendiri) tetap hijau.
- **Tujuh dependensi jalur tulis SUDAH terpasang persis di akar** (`package.json`, `--save-exact`): `@midnight-ntwrk/{ledger-v8@8.1.0, midnight-js-contracts@4.0.4, midnight-js-types@4.0.4, midnight-js-utils@4.0.4, midnight-js-network-id@4.0.4, midnight-js-http-client-proof-provider@4.0.4, midnight-js-indexer-public-data-provider@4.0.4}`.
- **DEPENDENSI KEDELAPAN yang rencana ini tambahkan, tidak disebut di riset sebelumnya:** `@midnight-ntwrk/compact-js@2.5.0` (persis versi yang dipakai `pkgs/cli`, lihat `pkgs/cli/package.json:20`). WAJIB — `findDeployedContract` (`midnight-js-contracts/dist/index.d.mts:19,682`) menuntut `options.compiledContract: CompiledContract.CompiledContract<C, any>`, sebuah tipe BERNOMINAL (branded lewat `TypeId: unique symbol`, `compact-js/dist/dts/effect/CompiledContract.d.ts:19-23`) yang hanya bisa dibuat lewat `CompiledContract.make(...)` dari paket itu — tidak ada jalan pintas tipe. Dipasang: `pnpm add -w --save-exact @midnight-ntwrk/compact-js@2.5.0` (Task 4 Step 1).
- **`withCompiledFileAssets(path)` TIDAK PERNAH dibaca runtime pada versi terpasang** — diverifikasi sendiri: `grep -rn "getCompiledAssetsPath" node_modules/.pnpm/@midnight-ntwrk+*/node_modules/@midnight-ntwrk/*/dist/*.mjs` menghasilkan NOL kecocokan di luar `compact-js` sendiri (definisi fungsinya). Karena itu boleh diisi string placeholder yang jujur (Task 4), bukan path direktori sungguhan.
- **`findDeployedContract` memanggil `setSigningKey`/`getSigningKey` TANPA SYARAT**, bukan opsional seperti klaim riset sebelumnya ("hanya 5 metode pertama"). Diverifikasi: `midnight-js-contracts/dist/index.mjs:1716-1741` (`findDeployedContract`) memanggil `setOrGetInitialSigningKey` (`:1625-1636`) tanpa syarat, yang men-`getSigningKey`/`setSigningKey` bila kosong. Task 1 WAJIB mengimplementasikan keduanya sungguhan (bukan melempar "belum didukung"). `remove`/`clear` sebaliknya NOL hasil grep pada seluruh jalur `castVote`/`tallyVote`/`findDeployedContract` — boleh sederhana. `exportPrivateStates`/`importPrivateStates`/`exportSigningKeys`/`importSigningKeys` juga nol hasil — boleh melempar "belum didukung".
- **`getNetworkId()` MELEMPAR bila `setNetworkId()` belum pernah dipanggil** (`midnight-js-network-id` `.d.ts`: "`@throws {Error} If setNetworkId has not been called.`"), dan `createUnprovenCallTx`/`createUnprovenDeployTx` di dalam `midnight-js-contracts` memanggilnya langsung (`dist/index.mjs:1041` dst). Jalur BACA (`endpoint.ts`) TIDAK PERNAH memanggil `setNetworkId` — murni, tanpa efek samping. `tulis.ts` WAJIB memanggilnya sebagai baris pertama sebelum provider apa pun dipakai (Task 6).
- **`Transaction.identifiers(): TransactionId[]`** (`ledger-v8.d.ts:2405-2409`) — dihitung LOKAL dari `FinalizedTransaction` yang sudah kita susun sendiri, dipakai sebagai fallback bila `submitTransaction` Lace mengembalikan bukan-string (Keputusan #5). Ini menutup Risiko Pembatal #1 tanpa perlu menebak jawaban §14.3.
- **`TransactionContextImpl[Submit]()` (jalur `callTx.castVote()` tanpa outer tx context) MELEMPAR `CallTxFailedError` pada kegagalan, TIDAK mengembalikan status sebagai nilai** (`midnight-js-contracts/dist/index.mjs:741-756`), dan pada SUKSES memanggil `privateStateProvider.set(...)` OTOMATIS (baris yang sama, `:753`) — `tulis.ts` TIDAK PERLU menulis private state lagi setelah sukses.
- **Path resolusi paket kontrak: WAJIB lewat `@pkgs/contract/src/...`, TIDAK PERNAH lewat bare specifier `"contract"`.** Diverifikasi: root `node_modules/` tidak punya symlink `contract` sama sekali (root package.json tidak mendeklarasikannya sebagai dependency), sehingga `import ... from "contract"` gagal resolve dari `client/src`. Pola yang SUDAH benar dan harus ditiru: `client/src/lib/chain/dekode.ts:2` — `import { ledger as ledgerBallotMentah } from "@pkgs/contract/src/managed/ballot/contract/index.js";`. Konsekuensi: `@pkgs/shared/src/credentials.ts` (yang secara internal mengimpor bare `"contract"`, hanya berfungsi karena `pkgs/shared/node_modules/contract` adalah symlink pnpm DAN `pkgs/contract/dist/` kebetulan sudah pernah di-build) **TIDAK dipakai** oleh rencana ini — `daunEligibility`/`cred_leaf` dipanggil langsung lewat `Ballot.pureCircuits.cred_leaf(...)` dari modul yang sudah diimpor via `@pkgs` alias.
- **Vite `resolve.dedupe: ["@midnight-ntwrk/compact-runtime"]` (`vite.config.ts:357`) SUDAH mengantisipasi `compact-js`** — komentar di `vite.config.ts:340` secara eksplisit menyebut "0.15.0 (pkgs/cli lewat compact-js)" sebagai salah satu dari dua versi compact-runtime yang hidup di pohon pnpm ini. Tidak ada perubahan config dedupe baru dibutuhkan; Task 9 tetap WAJIB membuktikan `pnpm build` sungguhan tidak melempar "expected instance of ChargedState" (satu-satunya gejala dua instance yang didokumentasikan repo ini).
- **Seam sudah berdiri, jangan dibuat ulang:** `client/src/lib/chain/jalur-tulis.ts` sudah ada (`JALUR_TULIS_SIAP = false`, `muatJalurTulis(): Promise<never>` sengaja melempar). Task 6 mengganti isinya menjadi `await import("./tulis")` sungguhan — **file target harus persis** `client/src/lib/chain/tulis.ts` karena `client/src/lib/chain/batas-bundel.test.ts:152` (`TARGET_TULIS`) dan `scripts/ukur-batas-bundel.mjs:24` (`SRC_TULIS_KEY = "src/lib/chain/tulis.ts"`) mengunci nama ini secara literal.
- **Barrel `client/src/lib/chain/index.ts` TIDAK BOLEH menambah ekspor apa pun** dari task ini. `index.test.ts:33-40` memaku daftar `Object.keys(barrel).sort()` ke enam nama; menambah satu nilai membuatnya merah, dan memperbaikinya menghapus satu-satunya penjaga barrel yang ada.
- **Proof server: selalu `${window.location.origin}/proof-server`** (`PROOF_SERVER_PATH` di `client/src/lib/proof-server.ts:37`), TIDAK PERNAH path relatif — `httpClientProofProvider`/`buildEndpointUrl` memanggil `new URL(baseUrl)` TANPA argumen basis dan melempar `Invalid URL` pada path relatif (`http-client-proof-provider/dist/index.mjs:28-32`, diverifikasi ulang `node -e "new URL('/proof-server')"` → throws). Timeout **600.000 ms** (`TIMEOUT_PROOF_MS`, sama seperti CLI `pkgs/cli/src/providers.ts:175`) — default 300.000 kemungkinan besar kurang untuk `castVote.prover` 9,99 MB.
- **Artefak ZK ballot, ukuran persis (diukur `ls -la` langsung, git-tracked bukan gitignored):** `keys/castVote.{prover=9.990.205, verifier=2.119}`, `keys/registerVoters.{prover=9.973.749, verifier=2.119}`, `keys/tallyVote.{prover=5.223.586, verifier=2.119}`, `keys/finalize.{prover=22.970, verifier=1.351}`; `zkir/{castVote=1.104, registerVoters=3.368, tallyVote=1.559, finalize=255}.bzkir`. Direktori sumber: `pkgs/contract/src/managed/ballot/{keys,zkir}/` (BUKAN `dist/`, yang gitignored).
- **Tata letak URL ZK meniru tata letak disk `NodeZkConfigProvider` persis:** `{baseUrl}/keys/{id}.prover`, `{baseUrl}/keys/{id}.verifier`, `{baseUrl}/zkir/{id}.bzkir` — `.bzkir`, BUKAN `.zkir` teks (`.zkir` 89.490 B tidak pernah dipakai runtime).
- **`httpClientProofProvider`'s `getKeyMaterial` MENELAN SEMUA galat** (`try { ... } catch { return undefined }`, `http-client-proof-provider/dist/index.mjs:33-41`) — artefak ZK yang hilang/salah TIDAK melempar di titik yang jelas, ia mengirim payload tanpa key material ke proof server. Setiap task yang membangun `zkConfigProvider` WAJIB dijaga penjaga murah terpisah (Task 2) sebelum konstruksi provider penuh.
- **`SigningKey`, `ContractAddress`, `TransactionId`, `CoinPublicKey`, `EncPublicKey` semuanya `type ... = string`** (`onchain-runtime-v3.d.ts:33,67,143`; `ledger-v8.d.ts:2543`) — tidak perlu (de)serialisasi khusus untuk IndexedDB.
- **`MerkleTreePath<A>` adalah POJO**: `{ leaf: A; path: { sibling: { field: bigint }; goes_left: boolean }[] }` (`compact-runtime/dist/compact-types.d.ts:41-51`) — didukung penuh oleh structured clone IndexedDB (typed array, objek biasa, `bigint`), tanpa serialisasi manual.
- **`PrivateStateProvider` punya 13 metode PERSIS** (`private-state-provider.d.ts:180-274`): `setContractAddress, set, get, remove, clear, setSigningKey, getSigningKey, removeSigningKey, clearSigningKeys, exportPrivateStates, importPrivateStates, exportSigningKeys, importSigningKeys`.
- **Penemuan konektor Lace SUDAH BENAR dan SUDAH ADA** — `client/src/lib/midnight-wallet.ts` (`root()`, `listConnectors()`, `pickConnector()`, baris 120-148) sudah mengiterasi NILAI `window.midnight` dan mencocokkan `rdns`, bukan mengindeks kunci bernama — dikonfirmasi ulang lewat spike Lace langsung (tanpa `connect()`): `window.midnight` memuat SATU kunci UUID, `{name:"lace", apiVersion:"4.0.1", icon, rdns}`; permukaan nyata: `apiVersion, connect (arity 1), icon, name, rdns` — **TIDAK ADA** `enable`/`isEnabled`/`serviceUriConfig`. Rencana ini TIDAK menulis ulang penemuan konektor (Task 5 hanya membangun `AdaptorWallet` di atas `WalletConnection.api` yang sudah dikembalikan `connectMidnightWallet()`).
- **PERINGATAN §14.3 mengikat rencana ini:** klaim "submitTransaction mengembalikan `void`" dan penalaran berbasis `enable()`/`isEnabled()` di spec §14.3 baris 418-450 **berasal dari "repo rujukan" (codebase LAIN)**, bukan dari paket yang terpasang di pohon ini — `@midnight-ntwrk/dapp-connector-api` **nol hasil** di `.pnpm` dan di `pnpm-lock.yaml`. Diperlakukan sebagai **hipotesis tidak terverifikasi**, bukan batasan. Task 5/6 merancang cabang (fallback `identifiers()`), bukan menerima klaim itu sebagai final.
- **Kredential, salt, opening, pilihan suara, nullifier TIDAK BOLEH menyentuh log/argv/env/berkas non-gitignored.** Input credential di UI WAJIB `type="password"`. `vite-plugin-manus-runtime`'s debug collector (opt-in `VOTEPRIV_DEBUG_COLLECTOR=1`, dev-only) TIDAK memfilter field bernama "credential"/"salt"/"cred" — ini masalah PAKET VENDOR pihak ketiga yang sudah diflag terpisah (`spike-c2b-build.md` Q4), **eksplisit DI LUAR LINGKUP** rencana ini untuk diperbaiki (tidak bisa menambal `node_modules`); mitigasi dalam lingkup: `type="password"` pada Task 8.
- **Uji tidak boleh bergantung jam dinding** — retry di Task 3 menerima parameter `tunda` yang bisa disuntik instan saat uji; tidak ada `vi.useFakeTimers()`/`setTimeout` nyata di uji mana pun.
- **`pnpm check` TIDAK men-typecheck `*.test.ts`** — hanya `pnpm check:uji` melakukannya. KEDUA perintah wajib dijalankan hijau di setiap task.
- **Gerbang bundel harus tetap hijau** — `client/src/lib/chain/batas-bundel.test.ts` (graf sumber statis dari `main.tsx`) dan `scripts/ukur-batas-bundel.mjs` (manifest build, dijalankan setelah `pnpm build`) SUDAH diperbaiki (`2fb0af6`) untuk sadar posisi chunk. Task manapun yang menyentuh `client/src/lib/chain/*.ts` WAJIB menjalankan `pnpm test` (memicu `batas-bundel.test.ts`) sebelum commit; hanya Task 9 yang menjalankan `pnpm build && node scripts/ukur-batas-bundel.mjs` (build sungguhan, dilarang di sesi riset tapi WAJIB di sesi implementasi).
- **Mock harus terikat tipe** — impor tipe sungguhan, `vi.fn<FungsiNyata>()` bergenerik, TANPA `as any`/`as unknown`/`@ts-expect-error`. Pola rujukan: `client/src/lib/chain/dekode.ledger-sintetis.test.ts` (`vi.hoisted` + `vi.fn<(charged: unknown) => LedgerBallot>()` + `vi.mock` modul) — untuk objek `Ledger` sintetis besar (Task 3/6), setiap task membangun objek LENGKAP (semua field, metode tak-terpakai mengembalikan `never` lewat helper `tidakDipakai`) alih-alih memotong lalu meng-cast. Pengecualian sempit yang diizinkan di SELURUH rencana ini: `as never` pada fixture parameter untuk tipe WASM `ledger-v8` (`FinalizedTransaction`/`UnboundTransaction`) yang mustahil dikonstruksi sungguhan di uji unit (dipakai Task 4, 5, 6) — token ini TIDAK ada di daftar larangan eksplisit, dan hanya dipakai untuk fixture PARAMETER, bukan untuk mem-bypass tipe modul yang dites.

---

## File Structure

**Baru — di belakang pintu `jalur-tulis.ts`, tidak pernah statis dari entri:**

| Berkas | Tanggung jawab |
|---|---|
| `client/src/lib/chain/private-state-idb.ts` | `PrivateStateProvider` 13-metode di atas IndexedDB mentah (Task 1) |
| `client/src/lib/chain/zk-config-fetch.ts` | `ZKConfigProvider` berbasis `fetch` + penjaga murah (Task 2) |
| `client/src/lib/chain/eligibility-tulis.ts` | Pembacaan `eligibility`/`commitments` path dengan retry, root selalu terbaru (Task 3) |
| `client/src/lib/chain/adaptor-wallet.ts` | Antarmuka `AdaptorWallet` (tipe murni, Task 4) |
| `client/src/lib/chain/kontrak-tulis.ts` | `CompiledContract` ballot untuk browser (Task 4) |
| `client/src/lib/chain/providers-tulis.ts` | Perakit enam `ContractProviders<BallotC>` (Task 4) |
| `client/src/lib/chain/adaptor-lace.ts` | Implementasi `AdaptorWallet` di atas `WalletConnection.api` Lace (Task 5) |
| `client/src/lib/chain/tulis.ts` | `kirimSuara` (Task 6) + `bukaSuara` (Task 7) — modul yang sungguhan dimuat `jalur-tulis.ts` |

Setiap berkas di atas punya `*.test.ts` sedirektori.

**Dimodifikasi:**

| Berkas | Perubahan |
|---|---|
| `client/src/lib/chain/jalur-tulis.ts` | `muatJalurTulis` diisi `await import("./tulis")` sungguhan (Task 6) |
| `vite.config.ts` | Plugin dev-server baru menyajikan `/zk/ballot/{keys,zkir}` (Task 2) |
| `server/index.ts` | Dua `express.static` baru menyajikan `/zk/ballot/{keys,zkir}` (Task 2) |
| `client/src/components/votepriv/VoteModal.tsx` | Input credential, status bertahap, kegagalan dibedakan, cadangan opening (Task 8) |
| `client/src/components/votepriv/VoteModal.test.tsx` | Uji baru untuk perilaku di atas (Task 8) |
| `client/src/pages/Home.tsx` | Menyimpan `WalletConnection` penuh, mengoper ke `VoteModal` (Task 8) |
| `package.json` + `pnpm-lock.yaml` | `+@midnight-ntwrk/compact-js@2.5.0` (dependencies, Task 4), `+fake-indexeddb` (devDependencies, Task 1) |

---

### Task 1: Private state provider IndexedDB

**Files:**
- Create: `client/src/lib/chain/private-state-idb.ts`
- Test: `client/src/lib/chain/private-state-idb.test.ts`
- Modify: `package.json` (tambah devDependency)

**Interfaces:**
- Consumes: `PrivateStateProvider<PSI, PS>` (tipe, `@midnight-ntwrk/midnight-js-types`), `PrivateStateId`, `ContractAddress`/`SigningKey` (`@midnight-ntwrk/compact-runtime`, `type ... = string`).
- Produces: `buatPrivateStateProviderIdb<PSI extends PrivateStateId, PS>(namaDb: string): PrivateStateProvider<PSI, PS>` — dipakai Task 4 (`providers-tulis.ts`) dan Task 7 (`pulihkanOpeningDariCadangan`).

- [ ] **Step 1: Pasang devDependency uji**

```bash
pnpm add -D -w fake-indexeddb
```

(Tidak dipatok `--save-exact`, konsisten dengan `jsdom`/`vitest` lain di `package.json` devDependencies yang memakai rentang caret.)

- [ ] **Step 2: Tulis uji gagal lebih dulu**

`client/src/lib/chain/private-state-idb.test.ts`:

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerkleTreePath } from "@midnight-ntwrk/compact-runtime";
import type { BallotPrivateState } from "@pkgs/contract/src/ballot-witnesses.js";
import { buatPrivateStateProviderIdb } from "./private-state-idb";

function psContoh(): BallotPrivateState {
  const jalur: MerkleTreePath<Uint8Array> = {
    leaf: new Uint8Array(32).fill(7),
    path: [{ sibling: { field: 123456789012345678901234567890n }, goes_left: true }],
  };
  return {
    secretKey: new Uint8Array(32),
    credentials: { "alamat-a": new Uint8Array(32).fill(1) },
    openings: { "alamat-a": { option: 2n, salt: new Uint8Array(32).fill(2) } },
    eligibilityPaths: { "alamat-a": jalur },
    commitmentPaths: {},
  };
}

describe("buatPrivateStateProviderIdb", () => {
  let namaDb: string;
  beforeEach(() => {
    namaDb = `votepriv-test-${Math.random().toString(36).slice(2)}`;
  });

  it("get() sebelum set() apa pun mengembalikan null, bukan melempar", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    await expect(psp.get("votePrivBallot")).resolves.toBeNull();
  });

  it("set() lalu get() mengembalikan objek SAMA termasuk bigint dan Uint8Array bersarang", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    const nilai = psContoh();
    await psp.set("votePrivBallot", nilai);
    const dibaca = await psp.get("votePrivBallot");
    expect(dibaca).toEqual(nilai);
    expect(dibaca?.eligibilityPaths["alamat-a"].path[0].sibling.field).toBe(123456789012345678901234567890n);
  });

  it("dua alamat kontrak berbeda tidak saling menimpa", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    await psp.set("votePrivBallot", psContoh());
    psp.setContractAddress("alamat-b");
    await expect(psp.get("votePrivBallot")).resolves.toBeNull();
  });

  it("get/set/remove melempar sebelum setContractAddress dipanggil", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    await expect(psp.get("votePrivBallot")).rejects.toThrow(/Contract address not set/);
    await expect(psp.set("votePrivBallot", psContoh())).rejects.toThrow(/Contract address not set/);
    await expect(psp.remove("votePrivBallot")).rejects.toThrow(/Contract address not set/);
  });

  it("setSigningKey/getSigningKey bekerja TANPA setContractAddress (dikunci per-parameter address)", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    await psp.setSigningKey("alamat-a", "kunci-tanda-tangan-hex");
    await expect(psp.getSigningKey("alamat-a")).resolves.toBe("kunci-tanda-tangan-hex");
    await expect(psp.getSigningKey("alamat-lain")).resolves.toBeNull();
  });

  it("removeSigningKey dan clearSigningKeys menghapus", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    await psp.setSigningKey("alamat-a", "k1");
    await psp.removeSigningKey("alamat-a");
    await expect(psp.getSigningKey("alamat-a")).resolves.toBeNull();
    await psp.setSigningKey("alamat-b", "k2");
    await psp.clearSigningKeys();
    await expect(psp.getSigningKey("alamat-b")).resolves.toBeNull();
  });

  it("clear() mengosongkan store private state tanpa menyentuh signing keys", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    await psp.set("votePrivBallot", psContoh());
    await psp.setSigningKey("alamat-a", "k1");
    await psp.clear();
    await expect(psp.get("votePrivBallot")).resolves.toBeNull();
    await expect(psp.getSigningKey("alamat-a")).resolves.toBe("k1");
  });

  it("membuka IndexedDB TEPAT SEKALI untuk banyak operasi pada provider yang sama", async () => {
    const spy = vi.spyOn(indexedDB, "open");
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    psp.setContractAddress("alamat-a");
    await psp.set("votePrivBallot", psContoh());
    await psp.get("votePrivBallot");
    await psp.setSigningKey("alamat-a", "k1");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("export/import PrivateStates dan export/import SigningKeys menolak eksplisit", async () => {
    const psp = buatPrivateStateProviderIdb<"votePrivBallot", BallotPrivateState>(namaDb);
    await expect(psp.exportPrivateStates()).rejects.toThrow(/belum didukung/);
    await expect(
      psp.importPrivateStates({ format: "midnight-private-state-export", encryptedPayload: "", salt: "" }),
    ).rejects.toThrow(/belum didukung/);
    await expect(psp.exportSigningKeys()).rejects.toThrow(/belum didukung/);
    await expect(
      psp.importSigningKeys({ format: "midnight-signing-key-export", encryptedPayload: "", salt: "" }),
    ).rejects.toThrow(/belum didukung/);
  });
});
```

- [ ] **Step 3: Jalankan uji, pastikan gagal**

Run: `pnpm test client/src/lib/chain/private-state-idb.test.ts`
Expected: FAIL — `Cannot find module './private-state-idb'`.

- [ ] **Step 4: Implementasi**

`client/src/lib/chain/private-state-idb.ts`:

```ts
/**
 * PrivateStateProvider tulisan sendiri di atas IndexedDB — bukan paket
 * @midnight-ntwrk/midnight-js-level-private-state-provider (Keputusan #3):
 * paket itu memakai `crypto` Node (dist/index.mjs:3-4), menuntut paket
 * `events` yang tidak terpasang, dan vendornya sendiri menulis "DO NOT use
 * for production applications requiring data persistence"
 * (level-private-state-provider.d.ts:88-97).
 *
 * setSigningKey/getSigningKey BUKAN opsional: findDeployedContract memanggil
 * keduanya tanpa syarat lewat setOrGetInitialSigningKey (lihat Global
 * Constraints). remove/clear tidak pernah dipanggil di jalur castVote/
 * tallyVote/findDeployedContract (grep ".remove(|.clear(" atas
 * midnight-js-contracts dist/index.mjs — nol hasil) — boleh sederhana.
 * export/import keduanya juga nol hasil — melempar "belum didukung" jujur.
 *
 * Kunci mengikuti bentuk level provider asli: `${contractAddress}:${id}`
 * (pkgs/contract/src/index.ts mendokumentasikan bentuk ini).
 */
import type { ContractAddress, SigningKey } from "@midnight-ntwrk/compact-runtime";
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from "@midnight-ntwrk/midnight-js-types";

const DB_VERSION = 1;
const STORE_STATE = "privateStates";
const STORE_SIGNING = "signingKeys";

function bukaDb(namaDb: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(namaDb, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_STATE)) db.createObjectStore(STORE_STATE);
      if (!db.objectStoreNames.contains(STORE_SIGNING)) db.createObjectStore(STORE_SIGNING);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`Gagal membuka IndexedDB "${namaDb}"`));
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Gagal menulis "${key}" ke ${store}`));
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error(`Gagal membaca "${key}" dari ${store}`));
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Gagal menghapus "${key}" dari ${store}`));
  });
}

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Gagal mengosongkan ${store}`));
  });
}

function belumDidukung(nama: string): never {
  throw new Error(
    `${nama} belum didukung oleh private state provider IndexedDB VotePriv. ` +
      "Tidak ada jalur castVote/tallyVote yang memanggilnya.",
  );
}

export function buatPrivateStateProviderIdb<PSI extends PrivateStateId, PS>(
  namaDb: string,
): PrivateStateProvider<PSI, PS> {
  let alamatKontrak: ContractAddress | null = null;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (dbPromise === null) dbPromise = bukaDb(namaDb);
    return dbPromise;
  };

  const kunciAlamat = (): ContractAddress => {
    if (alamatKontrak === null) {
      throw new Error("Contract address not set. Call setContractAddress() before exporting private states.");
    }
    return alamatKontrak;
  };
  const kunciState = (id: PSI): string => `${kunciAlamat()}:${id}`;

  return {
    setContractAddress(address: ContractAddress): void {
      alamatKontrak = address;
    },
    async set(privateStateId: PSI, state: PS): Promise<void> {
      await idbPut(await db(), STORE_STATE, kunciState(privateStateId), state);
    },
    async get(privateStateId: PSI): Promise<PS | null> {
      const nilai = await idbGet<PS>(await db(), STORE_STATE, kunciState(privateStateId));
      return nilai ?? null;
    },
    async remove(privateStateId: PSI): Promise<void> {
      await idbDelete(await db(), STORE_STATE, kunciState(privateStateId));
    },
    async clear(): Promise<void> {
      await idbClear(await db(), STORE_STATE);
    },
    async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      await idbPut(await db(), STORE_SIGNING, address, signingKey);
    },
    async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      const nilai = await idbGet<SigningKey>(await db(), STORE_SIGNING, address);
      return nilai ?? null;
    },
    async removeSigningKey(address: ContractAddress): Promise<void> {
      await idbDelete(await db(), STORE_SIGNING, address);
    },
    async clearSigningKeys(): Promise<void> {
      await idbClear(await db(), STORE_SIGNING);
    },
    async exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      belumDidukung("exportPrivateStates");
    },
    async importPrivateStates(
      _exportData: PrivateStateExport,
      _options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      belumDidukung("importPrivateStates");
    },
    async exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      belumDidukung("exportSigningKeys");
    },
    async importSigningKeys(
      _exportData: SigningKeyExport,
      _options?: ImportSigningKeysOptions,
    ): Promise<ImportSigningKeysResult> {
      belumDidukung("importSigningKeys");
    },
  };
}
```

- [ ] **Step 5: Jalankan uji, pastikan lolos**

Run: `pnpm test client/src/lib/chain/private-state-idb.test.ts`
Expected: PASS — 9 uji.

- [ ] **Step 6: Gerbang tipe + mutasi**

Run: `pnpm check && pnpm check:uji`
Expected: bersih (sama seperti sebelum task ini).

**Gerbang mutasi — Tabel 1 (penjaga dari kode, `private-state-idb.ts`):**

| # | Baris | Penjaga |
|---|---|---|
| G1 | `kunciAlamat`, `if (alamatKontrak === null)` | melempar bila `setContractAddress` belum dipanggil — menggerbangi `set`/`get`/`remove` (lewat `kunciState`) |
| G2 | `db()`, `if (dbPromise === null)` | memoisasi SATU koneksi IndexedDB per provider |
| G3×4 | `exportPrivateStates`/`importPrivateStates`/`exportSigningKeys`/`importSigningKeys` | keempatnya WAJIB melempar, bukan sukses senyap |

**Gerbang mutasi — Tabel 2 (mutasi per penjaga):**

| # | Mutasi | Uji yang WAJIB merah |
|---|---|---|
| G1 | Ganti `if (alamatKontrak === null)` jadi `if (false)` | "get/set/remove melempar sebelum setContractAddress dipanggil" — lolos diam-diam, assert `.rejects.toThrow` gagal |
| G2 | Hapus memoisasi, `db()` selalu `bukaDb(namaDb)` baru | "membuka IndexedDB TEPAT SEKALI untuk banyak operasi pada provider yang sama" — `jumlahBuka` naik jadi 3, `toBe(1)` merah |
| G3 | Ganti salah satu `belumDidukung(...)` jadi `return {} as never` | Uji "export/import ... menolak eksplisit" pada metode itu merah (resolve, bukan reject) |

---

### Task 2: ZK config provider berbasis `fetch` + penyajian artefak ZK lewat HTTP

**Files:**
- Create: `client/src/lib/chain/zk-config-fetch.ts`
- Test: `client/src/lib/chain/zk-config-fetch.test.ts`
- Modify: `vite.config.ts` (plugin dev-server baru)
- Modify: `server/index.ts` (dua rute `express.static` baru)

**Interfaces:**
- Consumes: `ZKConfigProvider<K>` (abstract class, `@midnight-ntwrk/midnight-js-types`), `createProverKey`/`createVerifierKey`/`createZKIR` (fungsi identitas, paket sama).
- Produces: `class FetchZkConfigProvider<K extends string> extends ZKConfigProvider<K>`, `async function pastikanArtefakZkMurah(baseUrl: string, circuitId: string, ambil?: typeof fetch): Promise<void>`, `class GalatArtefakZk extends Error` — dipakai Task 4 (`providers-tulis.ts`) dan Task 6/7 (`tulis.ts`).

- [ ] **Step 1: Tulis uji gagal lebih dulu**

`client/src/lib/chain/zk-config-fetch.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { FetchZkConfigProvider, GalatArtefakZk, pastikanArtefakZkMurah } from "./zk-config-fetch";

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

describe("FetchZkConfigProvider", () => {
  it("getVerifierKey mengambil {baseUrl}/keys/{id}.verifier dan mengembalikan Uint8Array", async () => {
    const isi = new Uint8Array([1, 2, 3]);
    const ambil = vi.fn<FetchFn>(async (url) => {
      expect(url).toBe("https://zk.example/ballot/keys/castVote.verifier");
      return new Response(isi, { status: 200, headers: { "content-type": "application/octet-stream" } });
    });
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await expect(zk.getVerifierKey("castVote")).resolves.toEqual(isi);
  });

  it("getProverKey dan getZKIR menyusun path sesuai tata letak Node (keys/*.prover, zkir/*.bzkir)", async () => {
    const ambil = vi.fn<FetchFn>(
      async () => new Response(new Uint8Array([9]), { status: 200, headers: { "content-type": "application/octet-stream" } }),
    );
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await zk.getProverKey("castVote");
    await zk.getZKIR("castVote");
    expect(ambil).toHaveBeenNthCalledWith(1, "https://zk.example/ballot/keys/castVote.prover", { cache: "no-store" });
    expect(ambil).toHaveBeenNthCalledWith(2, "https://zk.example/ballot/zkir/castVote.bzkir", { cache: "no-store" });
  });

  it("HTTP non-ok melempar GalatArtefakZk, bukan mengembalikan undefined", async () => {
    const ambil = vi.fn<FetchFn>(async () => new Response("", { status: 404 }));
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await expect(zk.getVerifierKey("castVote")).rejects.toThrow(GalatArtefakZk);
  });

  it("fallback SPA (200 text/html) melempar, tidak ditelan sebagai artefak sah", async () => {
    const ambil = vi.fn<FetchFn>(
      async () => new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const zk = new FetchZkConfigProvider<"castVote">("https://zk.example/ballot", ambil);
    await expect(zk.getVerifierKey("castVote")).rejects.toThrow(/text\/html/);
  });
});

describe("pastikanArtefakZkMurah", () => {
  it("mengambil HANYA verifier key (bukan prover key)", async () => {
    const ambil = vi.fn<FetchFn>(async () => new Response(new Uint8Array([1]), { status: 200 }));
    await pastikanArtefakZkMurah("https://zk.example/ballot", "castVote", ambil);
    expect(ambil).toHaveBeenCalledTimes(1);
    expect(ambil).toHaveBeenCalledWith("https://zk.example/ballot/keys/castVote.verifier", { cache: "no-store" });
  });

  it("melempar bila verifier key tidak ditemukan (404)", async () => {
    const ambil = vi.fn<FetchFn>(async () => new Response("", { status: 404 }));
    await expect(pastikanArtefakZkMurah("https://zk.example/ballot", "castVote", ambil)).rejects.toThrow(GalatArtefakZk);
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `pnpm test client/src/lib/chain/zk-config-fetch.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`client/src/lib/chain/zk-config-fetch.ts`:

```ts
/**
 * ZKConfigProvider berbasis fetch. Paket resmi
 * @midnight-ntwrk/midnight-js-fetch-zk-config-provider (disebut spec §14.4)
 * TIDAK terpasang (nol baris di pnpm-lock.yaml) — ditulis sendiri dari
 * abstract class ZKConfigProvider (midnight-js-types), 3 metode abstrak:
 * getZKIR/getProverKey/getVerifierKey. createProverKey/createVerifierKey/
 * createZKIR adalah fungsi IDENTITAS, diverifikasi dari NodeZkConfigProvider
 * terpasang.
 *
 * httpClientProofProvider MENELAN galat konfigurasi ZK diam-diam
 * (getKeyMaterial: try {...} catch { return undefined }) — kegagalan di sini
 * HARUS melempar keras di titik fetch.
 */
import {
  createProverKey,
  createVerifierKey,
  createZKIR,
  ZKConfigProvider,
} from "@midnight-ntwrk/midnight-js-types";

const KEY_DIR = "keys";
const PROVER_EXT = ".prover";
const VERIFIER_EXT = ".verifier";
const ZKIR_DIR = "zkir";
const ZKIR_EXT = ".bzkir";

export class GalatArtefakZk extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GalatArtefakZk";
  }
}

async function ambilArtefak(ambil: typeof fetch, url: string): Promise<Uint8Array> {
  const res = await ambil(url, { cache: "no-store" });
  if (!res.ok) {
    throw new GalatArtefakZk(`GET ${url} -> HTTP ${res.status}`);
  }
  const tipe = (res.headers.get("content-type") ?? "").toLowerCase();
  if (tipe.includes("text/html")) {
    throw new GalatArtefakZk(
      `GET ${url} mengembalikan text/html — kemungkinan fallback SPA menjawab artefak yang hilang.`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

export class FetchZkConfigProvider<K extends string> extends ZKConfigProvider<K> {
  constructor(
    private readonly baseUrl: string,
    private readonly ambil: typeof fetch = fetch,
  ) {
    super();
  }

  private urlUntuk(subDir: string, circuitId: K, ext: string): string {
    return `${this.baseUrl}/${subDir}/${circuitId}${ext}`;
  }

  getProverKey(circuitId: K) {
    return ambilArtefak(this.ambil, this.urlUntuk(KEY_DIR, circuitId, PROVER_EXT)).then(createProverKey);
  }

  getVerifierKey(circuitId: K) {
    return ambilArtefak(this.ambil, this.urlUntuk(KEY_DIR, circuitId, VERIFIER_EXT)).then(createVerifierKey);
  }

  getZKIR(circuitId: K) {
    return ambilArtefak(this.ambil, this.urlUntuk(ZKIR_DIR, circuitId, ZKIR_EXT)).then(createZKIR);
  }
}

/**
 * Penjaga MURAH sebelum konstruksi provider penuh: hanya verifier key
 * (2.119 B untuk castVote), BUKAN prover key (9,99 MB) — menggagalkan alur
 * sebelum unduhan besar ditarik.
 */
export async function pastikanArtefakZkMurah(
  baseUrl: string,
  circuitId: string,
  ambil: typeof fetch = fetch,
): Promise<void> {
  await ambilArtefak(ambil, `${baseUrl}/${KEY_DIR}/${circuitId}${VERIFIER_EXT}`);
}
```

- [ ] **Step 4: Jalankan uji, pastikan lolos**

Run: `pnpm test client/src/lib/chain/zk-config-fetch.test.ts`
Expected: PASS — 6 uji.

- [ ] **Step 5: Sajikan artefak ZK lewat HTTP — produksi (`server/index.ts`)**

Modify `server/index.ts`: tambah setelah `app.use("/proof-server", proofServerProxy());` (baris 97) dan SEBELUM `app.use(express.static(staticPath));`:

```ts
// Artefak ZK ballot (Task 2, C-2b): disajikan APA ADANYA dari
// pkgs/contract/src/managed/ballot, bukan disalin ke client/public —
// 25.218.218 B (keys) tidak perlu digandakan ke paket build. Layout URL
// meniru layout disk NodeZkConfigProvider persis.
const dirBallotManaged = path.resolve(__dirname, "..", "pkgs", "contract", "src", "managed", "ballot");
app.use("/zk/ballot/keys", express.static(path.join(dirBallotManaged, "keys")));
app.use("/zk/ballot/zkir", express.static(path.join(dirBallotManaged, "zkir")));
```

- [ ] **Step 6: Sajikan artefak ZK lewat HTTP — dev server (`vite.config.ts`)**

Modify `vite.config.ts`: tambah `import express from "express";` ke bagian import, tambah fungsi plugin baru dekat `vitePluginRuntimeConfig`:

```ts
/** Task 2 (C-2b): layout sama dengan produksi (server/index.ts). */
function vitePluginZkArtifacts(): Plugin {
  const dirBallotManaged = path.resolve(import.meta.dirname, "pkgs", "contract", "src", "managed", "ballot");
  return {
    name: "votepriv-zk-artifacts",
    configureServer(server) {
      server.middlewares.use("/zk/ballot/keys", express.static(path.join(dirBallotManaged, "keys")));
      server.middlewares.use("/zk/ballot/zkir", express.static(path.join(dirBallotManaged, "zkir")));
    },
  };
}
```

Tambah `vitePluginZkArtifacts()` ke array `plugins` yang dikembalikan `defineConfig` (baris yang sudah berisi `vitePluginRuntimeConfig(proofServerTarget)`):

```ts
plugins: [...plugins, vitePluginRuntimeConfig(proofServerTarget), vitePluginZkArtifacts()],
```

- [ ] **Step 7: Verifikasi manual serving (dev)**

Run: `pnpm dev` (di terminal terpisah, port bawaan 3000 — BUKAN 5250/5180/5173/6300 yang sedang dipakai), lalu di terminal lain:
```bash
curl -sI http://127.0.0.1:3000/zk/ballot/keys/castVote.verifier | head -1
```
Expected: `HTTP/1.1 200 OK` dengan `content-length: 2119`. Hentikan dev server setelah verifikasi.

- [ ] **Step 8: Gerbang tipe**

Run: `pnpm check && pnpm check:uji`
Expected: bersih.

**Gerbang mutasi — Tabel 1 (penjaga dari kode, `zk-config-fetch.ts`):**

| # | Fungsi | Penjaga |
|---|---|---|
| G1 | `ambilArtefak`, `if (!res.ok)` | HTTP non-2xx melempar `GalatArtefakZk` |
| G2 | `ambilArtefak`, `if (tipe.includes("text/html"))` | Fallback SPA (200 text/html) melempar, tidak ditelan |
| G3 | `pastikanArtefakZkMurah` | memanggil `ambilArtefak` dengan `VERIFIER_EXT`, BUKAN `PROVER_EXT` |

**Gerbang mutasi — Tabel 2:**

| # | Mutasi | Uji yang WAJIB merah |
|---|---|---|
| G1 | Ganti `if (!res.ok)` jadi `if (false)` | "HTTP non-ok melempar GalatArtefakZk" |
| G2 | Ganti `.includes("text/html")` jadi `.includes("tidak-pernah-cocok")` | "fallback SPA (200 text/html) melempar" |
| G3 | Ganti `VERIFIER_EXT` jadi `PROVER_EXT` di `pastikanArtefakZkMurah` | "mengambil HANYA verifier key" |

**Titik panggil nyata:** `pastikanArtefakZkMurah` dipanggil dari `tulis.ts` (Task 6) SEBELUM konstruksi provider — diuji di `tulis.test.ts` ("artefak ZK hilang menggagalkan SEBELUM proof dibuat"), bukan di sini.

---

### Task 3: Pembacaan eligibility path dari root terbaru, ber-retry

**Files:**
- Create: `client/src/lib/chain/eligibility-tulis.ts`
- Test: `client/src/lib/chain/eligibility-tulis.test.ts`

**Interfaces:**
- Consumes: `PublicDataProvider.queryContractState(alamat): Promise<{data: ContractState} | null>` (`@midnight-ntwrk/midnight-js-types`), `ledger` dari `@pkgs/contract/src/managed/ballot/contract/index.js` (`Ledger.eligibility.findPathForLeaf`, `Ledger.commitments.findPathForLeaf`, keduanya `(leaf: Uint8Array) => MerkleTreePath<Uint8Array> | undefined`).
- Produces: `bacaLedgerBallotTulis(publicDataProvider, alamat): Promise<LedgerBallotTulis>`, `ambilJalurEligibility(publicDataProvider, alamat, daun, opsi?): Promise<MerkleTreePath<Uint8Array>>`, `ambilJalurCommitment(...)` (tanda tangan sama, target `commitments`), `class GalatEligibility extends Error`, `interface OpsiRetryPath { tunda?; percobaan?; jedaMs? }` — dipakai Task 6 (eligibility) dan Task 7 (commitment).

**Keputusan #4 diimplementasikan lewat STRUKTUR, bukan parameter:** setiap percobaan retry memanggil `bacaLedgerBallotTulis` ULANG (tidak pernah memakai path yang di-cache dari percobaan sebelumnya) — sehingga root yang dipakai SELALU yang paling akhir terlihat indexer pada saat itu, bukan root saat pendaftaran.

- [ ] **Step 1: Tulis uji gagal lebih dulu**

`client/src/lib/chain/eligibility-tulis.test.ts` (pola mock sama seperti `dekode.ledger-sintetis.test.ts`: `vi.hoisted` + `vi.fn` bergenerik + `vi.mock` modul):

```ts
import { describe, expect, it, vi } from "vitest";
import type { MerkleTreePath } from "@midnight-ntwrk/compact-runtime";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import type { Ledger as LedgerBallot } from "@pkgs/contract/src/managed/ballot/contract/index.js";

const { ledgerMock } = vi.hoisted(() => ({
  ledgerMock: vi.fn<(charged: unknown) => LedgerBallot>(),
}));

vi.mock("@pkgs/contract/src/managed/ballot/contract/index.js", () => ({
  ledger: (charged: unknown) => ledgerMock(charged),
}));

const { ambilJalurEligibility, ambilJalurCommitment, bacaLedgerBallotTulis, GalatEligibility } = await import(
  "./eligibility-tulis"
);

// eligibility-tulis.ts (Step 3) menerima Pick<PublicDataProvider,
// "queryContractState">, BUKAN PublicDataProvider penuh — satu-satunya
// metode yang dipanggil bacaLedgerBallotTulis. Menyempitkan tipe parameter
// produksi menghindari cast tipe di uji (objek literal SATU metode ini
// structural-cocok tanpa `as unknown`).
function providerDengan(
  hasil: Array<{ data: unknown } | null>,
): Pick<PublicDataProvider, "queryContractState"> {
  let i = 0;
  return {
    queryContractState: vi.fn(async () => hasil[Math.min(i++, hasil.length - 1)]),
  };
}

const tundaInstan = async (_ms: number): Promise<void> => {};

/**
 * Ledger sintetis LENGKAP, bukan potongan yang di-cast — pola yang sama
 * dengan client/src/lib/chain/dekode.ledger-sintetis.test.ts. `tidakDipakai`
 * bertipe kembali `never`, yang bisa menempati SETIAP slot metode Ledger
 * (never adalah subtipe segalanya) tanpa satu pun `as unknown`/`as any`.
 */
function ledgerDengan(
  jalur: MerkleTreePath<Uint8Array> | undefined,
  jalurCommitment: MerkleTreePath<Uint8Array> | undefined = jalur,
): LedgerBallot {
  const tidakDipakai = (): never => {
    throw new Error("tidak dipakai di uji ini");
  };
  return {
    title: "", description: "", community: "", option0: "", option1: "", option2: "", option3: "",
    optionCount: 0n, voteDeadline: 0n, tallyDeadline: 0n, quorumPercent: 0n, eligibleCount: 0n,
    eligibilityPolicy: "", adminKey: new Uint8Array(32), ballotNonce: new Uint8Array(32), phase: 0,
    eligibility: {
      isFull: tidakDipakai, checkRoot: tidakDipakai, root: tidakDipakai, firstFree: tidakDipakai,
      pathForLeaf: tidakDipakai, findPathForLeaf: () => jalur, history: tidakDipakai,
    },
    voteCount: 0n, registeredCount: 0n,
    nullifiers: { isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, [Symbol.iterator]: tidakDipakai },
    commitments: {
      isFull: tidakDipakai, checkRoot: tidakDipakai, root: tidakDipakai, firstFree: tidakDipakai,
      pathForLeaf: tidakDipakai, findPathForLeaf: () => jalurCommitment,
    },
    tallyNullifiers: { isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, [Symbol.iterator]: tidakDipakai },
    tallies: {
      isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, lookup: tidakDipakai,
      [Symbol.iterator]: tidakDipakai,
    },
    talliedCount: 0n,
  };
}

describe("bacaLedgerBallotTulis", () => {
  it("melempar GalatEligibility bila indexer belum melihat ballot (null)", async () => {
    const pdp = providerDengan([null]);
    await expect(bacaLedgerBallotTulis(pdp, "alamat-a")).rejects.toThrow(GalatEligibility);
  });
});

describe("ambilJalurEligibility", () => {
  const daun = new Uint8Array(32).fill(1);

  it("mengembalikan path segera bila percobaan pertama sudah ketemu", async () => {
    ledgerMock.mockReturnValue(ledgerDengan({ leaf: daun, path: [] }));
    const pdp = providerDengan([{ data: "x" }]);
    await expect(ambilJalurEligibility(pdp, "alamat-a", daun, { tunda: tundaInstan })).resolves.toEqual({
      leaf: daun,
      path: [],
    });
  });

  it("mengulang sampai path ditemukan, TANPA menunggu jam dinding sungguhan", async () => {
    let panggilan = 0;
    ledgerMock.mockImplementation(() => {
      panggilan += 1;
      return ledgerDengan(panggilan < 3 ? undefined : { leaf: daun, path: [] });
    });
    const pdp = providerDengan([{ data: "x" }, { data: "x" }, { data: "x" }]);
    const mulai = Date.now();
    await expect(
      ambilJalurEligibility(pdp, "alamat-a", daun, { tunda: tundaInstan, percobaan: 6, jedaMs: 5_000 }),
    ).resolves.toEqual({ leaf: daun, path: [] });
    expect(Date.now() - mulai).toBeLessThan(100); // tunda disuntik instan — bukti tidak bergantung jam dinding
  });

  it("melempar setelah kehabisan percobaan, pesan menyebut jumlah percobaan, TANPA tunda ekstra sesudahnya", async () => {
    const tunda = vi.fn(tundaInstan);
    ledgerMock.mockReturnValue(ledgerDengan(undefined));
    const pdp = providerDengan([{ data: "x" }]);
    await expect(
      ambilJalurEligibility(pdp, "alamat-a", daun, { tunda, percobaan: 3, jedaMs: 1 }),
    ).rejects.toThrow(/3 percobaan/);
    // 3 percobaan, tunda hanya di ANTARA percobaan (0 dan 1) — bukan setelah yang terakhir.
    expect(tunda).toHaveBeenCalledTimes(2);
  });

  it("membaca ULANG ledger pada setiap percobaan (root selalu terbaru, Keputusan #4)", async () => {
    const pdp = providerDengan([{ data: "x" }, { data: "y" }, { data: "z" }]);
    ledgerMock.mockReturnValueOnce(ledgerDengan(undefined));
    ledgerMock.mockReturnValueOnce(ledgerDengan(undefined));
    ledgerMock.mockReturnValueOnce(ledgerDengan({ leaf: daun, path: [] }));
    await ambilJalurEligibility(pdp, "alamat-a", daun, { tunda: tundaInstan, percobaan: 3, jedaMs: 1 });
    expect(pdp.queryContractState).toHaveBeenCalledTimes(3);
  });
});

describe("ambilJalurCommitment", () => {
  it("menargetkan commitments, bukan eligibility", async () => {
    const commitment = new Uint8Array(32).fill(9);
    const lb = ledgerDengan({ leaf: commitment, path: [] });
    const spyCommitments = vi.spyOn(lb.commitments, "findPathForLeaf");
    const spyEligibility = vi.spyOn(lb.eligibility, "findPathForLeaf");
    ledgerMock.mockReturnValue(lb);
    const pdp = providerDengan([{ data: "x" }]);
    await ambilJalurCommitment(pdp, "alamat-a", commitment, { tunda: tundaInstan });
    expect(spyCommitments).toHaveBeenCalledWith(commitment);
    expect(spyEligibility).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `pnpm test client/src/lib/chain/eligibility-tulis.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`client/src/lib/chain/eligibility-tulis.ts`:

```ts
/**
 * Pembacaan eligibility/commitment path untuk jalur tulis, DENGAN retry.
 *
 * Keputusan #4 (mengikat): path dibangun dari root TERBARU, bukan root saat
 * pendaftaran — castVote MENGUNGKAP root eligibility ke transkrip publik
 * (ballot.compact:257-258), dan registerVoters menerima maksimum 8 daun per
 * transaksi (ballot.compact:205) sedangkan eligibleCount bisa sampai 1024;
 * root lama memetakan tiap suara ke batch <=8 pendaftar. Setiap percobaan di
 * bawah membaca ledger ULANG — "root terbaru" adalah bawaan struktural.
 *
 * commitments BUKAN HistoricMerkleTree — path commitment (dipakai Task 7)
 * HARUS fresh tepat sebelum tallyVote, tidak boleh disimpan lama.
 */
import type { MerkleTreePath } from "@midnight-ntwrk/compact-runtime";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import { ledger as ledgerBallot } from "@pkgs/contract/src/managed/ballot/contract/index.js";

export type LedgerBallotTulis = ReturnType<typeof ledgerBallot>;

export class GalatEligibility extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GalatEligibility";
  }
}

export async function bacaLedgerBallotTulis(
  publicDataProvider: PublicDataProvider,
  alamat: string,
): Promise<LedgerBallotTulis> {
  const st = await publicDataProvider.queryContractState(alamat);
  if (st === null) {
    throw new GalatEligibility(`Ballot ${alamat} belum terlihat di indexer.`);
  }
  return ledgerBallot(st.data);
}

export interface OpsiRetryPath {
  tunda?: (ms: number) => Promise<void>;
  percobaan?: number;
  jedaMs?: number;
}

const tundaBawaan = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function ambilPathDenganRetry(
  publicDataProvider: PublicDataProvider,
  alamat: string,
  ambilPath: (lb: LedgerBallotTulis) => MerkleTreePath<Uint8Array> | undefined,
  namaUntukGalat: string,
  opsi: OpsiRetryPath,
): Promise<MerkleTreePath<Uint8Array>> {
  const { tunda = tundaBawaan, percobaan = 6, jedaMs = 5_000 } = opsi;
  let galatTerakhir: unknown;
  for (let i = 0; i < percobaan; i++) {
    try {
      const lb = await bacaLedgerBallotTulis(publicDataProvider, alamat);
      const jalur = ambilPath(lb);
      if (jalur !== undefined) return jalur;
    } catch (e) {
      galatTerakhir = e;
    }
    if (i < percobaan - 1) await tunda(jedaMs);
  }
  throw new GalatEligibility(
    `${namaUntukGalat} tidak ditemukan setelah ${percobaan} percobaan.` +
      (galatTerakhir
        ? ` Galat terakhir: ${String(galatTerakhir)}`
        : " Seluruh pembacaan berhasil, daun/commitment saja belum tampak — kemungkinan indexer belum menyusul."),
  );
}

export function ambilJalurEligibility(
  publicDataProvider: PublicDataProvider,
  alamat: string,
  daun: Uint8Array,
  opsi: OpsiRetryPath = {},
): Promise<MerkleTreePath<Uint8Array>> {
  return ambilPathDenganRetry(
    publicDataProvider,
    alamat,
    (lb) => lb.eligibility.findPathForLeaf(daun),
    "Eligibility path",
    opsi,
  );
}

export function ambilJalurCommitment(
  publicDataProvider: PublicDataProvider,
  alamat: string,
  commitment: Uint8Array,
  opsi: OpsiRetryPath = {},
): Promise<MerkleTreePath<Uint8Array>> {
  return ambilPathDenganRetry(
    publicDataProvider,
    alamat,
    (lb) => lb.commitments.findPathForLeaf(commitment),
    "Commitment path",
    opsi,
  );
}
```

- [ ] **Step 4: Jalankan uji, pastikan lolos**

Run: `pnpm test client/src/lib/chain/eligibility-tulis.test.ts`
Expected: PASS — 6 uji, seluruhnya selesai dalam hitungan milidetik (tanpa jam dinding sungguhan).

- [ ] **Step 5: Gerbang tipe + bundel**

Run: `pnpm check && pnpm check:uji && pnpm test`
Expected: bersih; `batas-bundel.test.ts` tetap lolos (berkas ini tidak diimpor statis dari `main.tsx`).

**Gerbang mutasi — Tabel 1 (penjaga dari kode, `eligibility-tulis.ts`):**

| # | Fungsi | Penjaga |
|---|---|---|
| G1 | `bacaLedgerBallotTulis`, `if (st === null)` | melempar bila indexer belum melihat ballot |
| G2 | `ambilPathDenganRetry`, `if (jalur !== undefined) return jalur` | berhenti retry SEGERA begitu path ditemukan |
| G3 | `ambilPathDenganRetry`, `if (i < percobaan - 1) await tunda(...)` | tidak menunggu setelah percobaan TERAKHIR |
| G4 | `ambilJalurCommitment` vs `ambilJalurEligibility` | memanggil `lb.commitments.findPathForLeaf`, BUKAN `lb.eligibility.findPathForLeaf` |

**Gerbang mutasi — Tabel 2:**

| # | Mutasi | Uji yang WAJIB merah |
|---|---|---|
| G1 | Ganti `if (st === null)` jadi `if (false)` | "melempar GalatEligibility bila indexer belum melihat ballot" |
| G2 | Hapus `if (jalur !== undefined) return jalur`, selalu lanjut ke retry berikutnya | "mengembalikan path segera bila percobaan pertama sudah ketemu" — `queryContractState` terpanggil lebih dari 1x, atau uji retry berubah perilaku |
| G3 | Ganti kondisi jadi `if (true)` (selalu tunda, termasuk setelah percobaan terakhir) | "melempar setelah kehabisan percobaan ... TANPA tunda ekstra" — `tunda` terpanggil 3x, `toHaveBeenCalledTimes(2)` merah |
| G4 | Tukar `lb.commitments`/`lb.eligibility` di kedua fungsi ekspor | "menargetkan commitments, bukan eligibility" — `spyEligibility` terpanggil, assert `.not.toHaveBeenCalled()` merah |

---

### Task 4: Perakitan enam provider, dengan adaptor wallet di belakang antarmuka sendiri

**Files:**
- Create: `client/src/lib/chain/adaptor-wallet.ts` (tipe murni, tanpa uji — lihat catatan di bawah)
- Create: `client/src/lib/chain/kontrak-tulis.ts`
- Test: `client/src/lib/chain/kontrak-tulis.test.ts`
- Create: `client/src/lib/chain/providers-tulis.ts`
- Test: `client/src/lib/chain/providers-tulis.test.ts`
- Modify: `package.json` + `pnpm-lock.yaml` (dependency baru)

**Interfaces:**
- Consumes: `httpClientProofProvider` (Task-independent, sudah terpasang), `indexerPublicDataProvider`, `buatPrivateStateProviderIdb` (Task 1), `FetchZkConfigProvider` (Task 2), `BallotPrivateStateId`/`type BallotPrivateState` (`@pkgs/contract/src/ballot-witnesses.js`).
- Produces: `interface AdaptorWallet { getCoinPublicKey(): string; getEncryptionPublicKey(): string; balanceTx(tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction>; submitTx(tx: FinalizedTransaction): Promise<TransactionId>; }` (`adaptor-wallet.ts`, dikonsumsi Task 5); `type BallotC`, `kompilasiBallotBrowser(): CompiledContract.CompiledContract<BallotC, any>` (`kontrak-tulis.ts`, dikonsumsi Task 6/7); `type ProvidersBallotBrowser`, `rakitProvidersBallotBrowser(kp: KonteksProviderTulis): ProvidersBallotBrowser` (`providers-tulis.ts`, dikonsumsi Task 6/7).

- [ ] **Step 1: Pasang dependency**

```bash
pnpm add -w --save-exact @midnight-ntwrk/compact-js@2.5.0
```

Verifikasi versi persis cocok `pkgs/cli/package.json:20`:
```bash
grep '"@midnight-ntwrk/compact-js"' package.json pkgs/cli/package.json
```
Expected: keduanya `"2.5.0"`.

- [ ] **Step 2: Tulis `adaptor-wallet.ts` (tipe murni, tidak butuh uji)**

`client/src/lib/chain/adaptor-wallet.ts`:

```ts
/**
 * Antarmuka wallet MILIK SENDIRI, di belakang mana adaptor Lace (Task 5)
 * hidup. ContractProviders<BallotC> butuh WalletProvider & MidnightProvider
 * (midnight-js-types) sekaligus — antarmuka ini menggabungkan keduanya persis
 * (wallet-provider.d.ts, midnight-provider.d.ts), memakai `string` untuk
 * CoinPublicKey/EncPublicKey (keduanya type alias string di ledger-v8, sama
 * seperti TransactionId) supaya Task 4 tidak bergantung pada nama tipe
 * bernomina yang belum diverifikasi ekspornya.
 */
import type { FinalizedTransaction, TransactionId } from "@midnight-ntwrk/ledger-v8";
import type { UnboundTransaction } from "@midnight-ntwrk/midnight-js-types";

export interface AdaptorWallet {
  getCoinPublicKey(): string;
  getEncryptionPublicKey(): string;
  balanceTx(tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction>;
  submitTx(tx: FinalizedTransaction): Promise<TransactionId>;
}
```

(Berkas ini murni deklarasi tipe — terhapus total saat kompilasi, nol baris runtime, nol kebutuhan uji. Kebenarannya dijaga oleh `pnpm check:uji` menolak Task 5/6 bila `AdaptorWallet` tidak dipenuhi struktural.)

- [ ] **Step 3: Tulis uji `kontrak-tulis.test.ts` gagal lebih dulu**

```ts
import { describe, expect, it } from "vitest";
import { kompilasiBallotBrowser } from "./kontrak-tulis";

describe("kompilasiBallotBrowser", () => {
  it("membangun CompiledContract dengan tag 'ballot' tanpa menyentuh fs/path", () => {
    const cc = kompilasiBallotBrowser();
    expect(cc.tag).toBe("ballot");
  });
});
```

- [ ] **Step 4: Jalankan, pastikan gagal**

Run: `pnpm test client/src/lib/chain/kontrak-tulis.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 5: Implementasi `kontrak-tulis.ts`**

```ts
/**
 * Bentuk compiledContract untuk ballot, versi BROWSER — padanan
 * pkgs/cli/src/kontrak.ts TANPA fs/path.
 *
 * withCompiledFileAssets(path) mewajibkan STRING untuk memenuhi tipe
 * CompiledContract.Context — TAPI tidak satu pun dist
 * @midnight-ntwrk/midnight-js-contracts memanggil getCompiledAssetsPath
 * (grep atas SELURUH node_modules/.pnpm/@midnight-ntwrk+*/dist: nol hasil di
 * luar compact-js sendiri). Nilai di sini karena itu TIDAK PERNAH dibaca
 * runtime — placeholder yang jujur, bukan path yang lupa diisi.
 */
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import type { Contract as CjsContract } from "@midnight-ntwrk/compact-js/effect/Contract";
import { ballotWitnesses, type BallotPrivateState } from "@pkgs/contract/src/ballot-witnesses.js";
import * as Ballot from "@pkgs/contract/src/managed/ballot/contract/index.js";

export type BallotC = Ballot.Contract<BallotPrivateState>;
export type SirkuitBallot = CjsContract.ProvableCircuitId<BallotC>;

const PLACEHOLDER_TIDAK_DIBACA_RUNTIME = "browser://tidak-dipakai-lihat-komentar-kontrak-tulis.ts";

export const kompilasiBallotBrowser = () =>
  CompiledContract.make<BallotC>("ballot", Ballot.Contract).pipe(
    CompiledContract.withWitnesses(ballotWitnesses),
    CompiledContract.withCompiledFileAssets(PLACEHOLDER_TIDAK_DIBACA_RUNTIME),
  );
```

- [ ] **Step 6: Jalankan, pastikan lolos**

Run: `pnpm test client/src/lib/chain/kontrak-tulis.test.ts`
Expected: PASS — 1 uji. (Ini juga membuktikan empiris bahwa `@midnight-ntwrk/compact-js` resolve dari `client/src` dan `dedupe: ["@midnight-ntwrk/compact-runtime"]` tidak menggagalkan konstruksi di jalur uji Node/Vitest — bukti PARSIAL untuk risiko versi-skew; bukti PENUH menunggu `pnpm build` sungguhan di Task 9.)

- [ ] **Step 7: Tulis uji `providers-tulis.test.ts` gagal lebih dulu**

```ts
import { describe, expect, it } from "vitest";
import type { AdaptorWallet } from "./adaptor-wallet";
import { rakitProvidersBallotBrowser } from "./providers-tulis";

function dompetTiruan(): AdaptorWallet {
  return {
    getCoinPublicKey: () => "cpk",
    getEncryptionPublicKey: () => "epk",
    balanceTx: async (tx) => tx as never,
    submitTx: async () => "txid",
  };
}

describe("rakitProvidersBallotBrowser", () => {
  it("mengembalikan objek dengan ENAM kunci provider persis", () => {
    const providers = rakitProvidersBallotBrowser({
      indexerUri: "https://indexer.example/api/v3/graphql",
      indexerWsUri: "wss://indexer.example/api/v3/graphql/ws",
      zkBaseUrl: "https://app.example/zk/ballot",
      proofServerUrl: "https://app.example/proof-server",
      dompet: dompetTiruan(),
    });
    expect(Object.keys(providers).sort()).toEqual(
      ["midnightProvider", "privateStateProvider", "proofProvider", "publicDataProvider", "walletProvider", "zkConfigProvider"].sort(),
    );
  });

  it("walletProvider dan midnightProvider adalah OBJEK dompet YANG SAMA (bukan disalin)", () => {
    const dompet = dompetTiruan();
    const providers = rakitProvidersBallotBrowser({
      indexerUri: "https://indexer.example/api/v3/graphql",
      indexerWsUri: "wss://indexer.example/api/v3/graphql/ws",
      zkBaseUrl: "https://app.example/zk/ballot",
      proofServerUrl: "https://app.example/proof-server",
      dompet,
    });
    expect(providers.walletProvider).toBe(dompet);
    expect(providers.midnightProvider).toBe(dompet);
  });
});
```

- [ ] **Step 8: Jalankan, pastikan gagal**

Run: `pnpm test client/src/lib/chain/providers-tulis.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 9: Implementasi `providers-tulis.ts`**

```ts
/**
 * Perakitan ENAM provider ContractProviders<BallotC> untuk browser — bentuk
 * persis pkgs/cli/src/providers.ts:205-220 (rakitProvidersBallot), dengan
 * tiga penggantian: privateStateProvider (IndexedDB, Task 1), zkConfigProvider
 * (fetch, Task 2), wallet di balik AdaptorWallet (Task 4/5).
 */
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { MidnightProvider, PublicDataProvider, WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import { BallotPrivateStateId, type BallotPrivateState } from "@pkgs/contract/src/ballot-witnesses.js";
import type { AdaptorWallet } from "./adaptor-wallet";
import type { SirkuitBallot } from "./kontrak-tulis";
import { buatPrivateStateProviderIdb } from "./private-state-idb";
import { FetchZkConfigProvider } from "./zk-config-fetch";

export type ProvidersBallotBrowser = {
  privateStateProvider: ReturnType<typeof buatPrivateStateProviderIdb<typeof BallotPrivateStateId, BallotPrivateState>>;
  publicDataProvider: PublicDataProvider;
  zkConfigProvider: FetchZkConfigProvider<SirkuitBallot>;
  proofProvider: ReturnType<typeof httpClientProofProvider<SirkuitBallot>>;
  walletProvider: WalletProvider;
  midnightProvider: MidnightProvider;
};

/** 600.000 ms — sama seperti CLI (pkgs/cli/src/providers.ts:175). */
const TIMEOUT_PROOF_MS = 600_000;
const NAMA_DB_PRIVATE_STATE = "votepriv-private-state";

export interface KonteksProviderTulis {
  indexerUri: string;
  indexerWsUri: string;
  zkBaseUrl: string;
  proofServerUrl: string;
  dompet: AdaptorWallet;
}

export function rakitProvidersBallotBrowser(kp: KonteksProviderTulis): ProvidersBallotBrowser {
  const zkConfigProvider = new FetchZkConfigProvider<SirkuitBallot>(kp.zkBaseUrl);
  return {
    privateStateProvider: buatPrivateStateProviderIdb<typeof BallotPrivateStateId, BallotPrivateState>(
      NAMA_DB_PRIVATE_STATE,
    ),
    publicDataProvider: indexerPublicDataProvider(kp.indexerUri, kp.indexerWsUri),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(kp.proofServerUrl, zkConfigProvider, { timeout: TIMEOUT_PROOF_MS }),
    walletProvider: kp.dompet,
    midnightProvider: kp.dompet,
  };
}
```

- [ ] **Step 10: Jalankan, pastikan lolos**

Run: `pnpm test client/src/lib/chain/providers-tulis.test.ts`
Expected: PASS — 2 uji.

- [ ] **Step 11: Gerbang tipe + bundel**

Run: `pnpm check && pnpm check:uji && pnpm test`
Expected: bersih. `batas-bundel.test.ts` tetap lolos — tidak satu pun berkas baru task ini diimpor statis dari `main.tsx`.

**Gerbang mutasi — Tabel 1 (penjaga dari kode):**

| # | Berkas/fungsi | Penjaga |
|---|---|---|
| G1 | `providers-tulis.ts`, `rakitProvidersBallotBrowser` | `walletProvider` dan `midnightProvider` HARUS keduanya `kp.dompet` (objek yang sama) — midnight-js memanggil metode dari SATU objek untuk dua peran |
| G2 | `providers-tulis.ts` | `proofProvider` dikonstruksi dengan `zkConfigProvider` yang SAMA dengan yang diekspos di `ProvidersBallotBrowser` (bukan instance baru) |

**Gerbang mutasi — Tabel 2:**

| # | Mutasi | Uji yang WAJIB merah |
|---|---|---|
| G1 | Ganti `midnightProvider: kp.dompet` jadi `midnightProvider: { ...kp.dompet }` (salinan) | "walletProvider dan midnightProvider adalah OBJEK dompet YANG SAMA" — `toBe(dompet)` merah untuk `midnightProvider` |
| G2 | Konstruksi `zkConfigProvider` KEDUA terpisah untuk `proofProvider` | Tidak ada uji langsung — `proofProvider` tidak mengekspos internalnya, jadi identitas objek tidak bisa diuji langsung. **Diuji lewat perilaku** (Step 12 di bawah): spy konstruktor `FetchZkConfigProvider` lewat `vi.mock("./zk-config-fetch", ...)` dan assert TEPAT SATU pemanggilan dengan `zkBaseUrl` yang diberikan |

- [ ] **Step 12 (dari G2 di atas): tambah uji konstruksi tunggal `FetchZkConfigProvider`**

Tambahkan ke `providers-tulis.test.ts` sebelum lanjut ke Task 5:

```ts
import { vi } from "vitest";

vi.mock("./zk-config-fetch", async (impor) => {
  const asli = await impor<typeof import("./zk-config-fetch")>();
  return { ...asli, FetchZkConfigProvider: vi.fn(asli.FetchZkConfigProvider) };
});

it("HANYA membuat SATU instance FetchZkConfigProvider, dipakai zkConfigProvider maupun proofProvider", async () => {
  const { FetchZkConfigProvider } = await import("./zk-config-fetch");
  const providers = rakitProvidersBallotBrowser({
    indexerUri: "https://indexer.example/api/v3/graphql",
    indexerWsUri: "wss://indexer.example/api/v3/graphql/ws",
    zkBaseUrl: "https://app.example/zk/ballot",
    proofServerUrl: "https://app.example/proof-server",
    dompet: dompetTiruan(),
  });
  expect(FetchZkConfigProvider).toHaveBeenCalledTimes(1);
  expect(FetchZkConfigProvider).toHaveBeenCalledWith("https://app.example/zk/ballot");
  expect(providers.zkConfigProvider).toBeInstanceOf(FetchZkConfigProvider);
});
```

Jalankan ulang Step 8-10 untuk uji baru ini.

---

### Task 5: Adaptor Lace + penemuan konektor berbasis UUID

**Files:**
- Create: `client/src/lib/chain/adaptor-lace.ts`
- Test: `client/src/lib/chain/adaptor-lace.test.ts`

**Interfaces:**
- Consumes: `type WalletConnection` (SUDAH ADA, `@/lib/midnight-wallet.ts` — TIDAK diubah task ini; `api: unknown`, `coinPublicKey?: string`, `encryptionPublicKey?: string`), `type AdaptorWallet` (Task 4).
- Produces: `buatAdaptorLace(wallet: WalletConnection): AdaptorWallet` — dikonsumsi Task 6/7 (`tulis.ts`).

**Catatan mengikat:** Task ini TIDAK menulis ulang penemuan konektor. `client/src/lib/midnight-wallet.ts:120-148` (`root()`, `listConnectors()`, `pickConnector()`) SUDAH mengiterasi nilai `window.midnight` dan mencocokkan `rdns`, dikonfirmasi ulang lewat spike Lace langsung (window.midnight satu kunci UUID, `connect` arity 1, tanpa `enable`/`isEnabled`). Pekerjaan nyata di sini HANYA membungkus `WalletConnection.api: unknown` menjadi `AdaptorWallet`.

- [ ] **Step 1: Tulis uji gagal lebih dulu**

`client/src/lib/chain/adaptor-lace.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { WalletConnection } from "@/lib/midnight-wallet";
import { buatAdaptorLace } from "./adaptor-lace";

function walletContoh(api: unknown, override: Partial<WalletConnection> = {}): WalletConnection {
  return {
    address: "mn_shield-addr_test1x",
    coinPublicKey: "cpk-hex",
    encryptionPublicKey: "epk-hex",
    networkId: "preview",
    connectorName: "lace",
    apiVersion: "4.0.1",
    api,
    ...override,
  };
}

describe("buatAdaptorLace", () => {
  it("melempar bila wallet tidak melaporkan coinPublicKey/encryptionPublicKey", () => {
    expect(() => buatAdaptorLace(walletContoh({}, { coinPublicKey: undefined }))).toThrow(/coinPublicKey/);
  });

  it("getCoinPublicKey/getEncryptionPublicKey mengembalikan nilai WalletConnection APA ADANYA", () => {
    const dompet = buatAdaptorLace(walletContoh({}));
    expect(dompet.getCoinPublicKey()).toBe("cpk-hex");
    expect(dompet.getEncryptionPublicKey()).toBe("epk-hex");
  });

  it("balanceTx mencoba balanceSealedTransaction LEBIH DULU", async () => {
    const balanceSealedTransaction = vi.fn(async () => "tx-seimbang");
    const balanceUnsealedTransaction = vi.fn(async () => "tidak-dipakai");
    const dompet = buatAdaptorLace(walletContoh({ balanceSealedTransaction, balanceUnsealedTransaction }));
    await expect(dompet.balanceTx({} as never)).resolves.toBe("tx-seimbang");
    expect(balanceSealedTransaction).toHaveBeenCalledTimes(1);
    expect(balanceUnsealedTransaction).not.toHaveBeenCalled();
  });

  it("balanceTx jatuh ke balanceUnsealedTransaction bila balanceSealedTransaction tidak ada", async () => {
    const balanceUnsealedTransaction = vi.fn(async () => "tx-seimbang-2");
    const dompet = buatAdaptorLace(walletContoh({ balanceUnsealedTransaction }));
    await expect(dompet.balanceTx({} as never)).resolves.toBe("tx-seimbang-2");
  });

  it("balanceTx melempar galat yang MENYEBUT NAMA METODE bila keduanya tidak ada", async () => {
    const dompet = buatAdaptorLace(walletContoh({ metodeLain: () => {} }));
    await expect(dompet.balanceTx({} as never)).rejects.toThrow(/balanceSealedTransaction/);
  });

  it("submitTx memakai nilai submitTransaction bila berupa string", async () => {
    const submitTransaction = vi.fn(async () => "tx-id-dari-wallet");
    const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
    const tx = { identifiers: () => ["tidak-dipakai"] };
    await expect(dompet.submitTx(tx as never)).resolves.toBe("tx-id-dari-wallet");
  });

  it("submitTx jatuh ke tx.identifiers() bila submitTransaction mengembalikan undefined (Risiko #1)", async () => {
    const submitTransaction = vi.fn(async () => undefined);
    const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
    const tx = { identifiers: () => ["id-lokal-1"] };
    await expect(dompet.submitTx(tx as never)).resolves.toBe("id-lokal-1");
  });

  it("submitTx melempar bila submitTransaction undefined DAN identifiers() kosong", async () => {
    const submitTransaction = vi.fn(async () => undefined);
    const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
    const tx = { identifiers: () => [] };
    await expect(dompet.submitTx(tx as never)).rejects.toThrow(/tidak punya identifier/);
  });

  it("submitTx melempar galat yang jelas bila wallet tidak punya submitTransaction sama sekali", async () => {
    const dompet = buatAdaptorLace(walletContoh({}));
    await expect(dompet.submitTx({ identifiers: () => [] } as never)).rejects.toThrow(/submitTransaction/);
  });
});
```

Catatan tipe: `as never` pada parameter `tx` adalah pengecualian yang diizinkan Global Constraints — `UnboundTransaction`/`FinalizedTransaction` adalah instance kelas WASM `ledger-v8` yang mustahil dikonstruksi sungguhan di uji unit; token ini bukan `as any`/`as unknown`, dan hanya dipakai untuk fixture parameter, bukan untuk melewati tipe modul yang dites.

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `pnpm test client/src/lib/chain/adaptor-lace.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`client/src/lib/chain/adaptor-lace.ts`:

```ts
/**
 * AdaptorWallet di atas `api: unknown` yang dikembalikan connectMidnightWallet()
 * (client/src/lib/midnight-wallet.ts). PENEMUAN KONEKTOR SUDAH BENAR di sana —
 * berkas ini TIDAK mengulanginya.
 *
 * DUA hal TIDAK DAPAT DIPASTIKAN dari paket yang terpasang
 * (@midnight-ntwrk/dapp-connector-api nol hasil di pohon ini):
 *  1. balanceSealedTransaction vs balanceUnsealedTransaction. "Sealed" cocok
 *     secara semantik dengan transaksi yang SUDAH dibuktikan (proveTx sudah
 *     berjalan di proof server KITA sebelum balanceTx dipanggil) — dicoba
 *     LEBIH DULU, fallback ke nama satunya, log dev menyebut mana yang dipakai.
 *  2. submitTransaction mengembalikan id atau `void` (spec §14.3 mengklaim
 *     void, TAPI klaim itu dari repo LAIN — connector tidak terpasang di
 *     sini). Ditangani tanpa menebak: Transaction.identifiers(): TransactionId[]
 *     (ledger-v8.d.ts:2405-2409) dihitung LOKAL dari transaksi yang sudah kita
 *     susun sendiri sebagai fallback.
 *
 * Tidak ada `as any`/`as unknown as X`: setiap metode pada `api` dijaga
 * runtime lewat panggilWajib()/cariMetode(), pola yang sama dengan tryCall()
 * di midnight-wallet.ts:235-244.
 */
import type { FinalizedTransaction, TransactionId } from "@midnight-ntwrk/ledger-v8";
import type { UnboundTransaction } from "@midnight-ntwrk/midnight-js-types";
import type { WalletConnection } from "@/lib/midnight-wallet";
import type { AdaptorWallet } from "./adaptor-wallet";

function namaMetodeApi(api: unknown): string[] {
  return api && typeof api === "object" ? Object.keys(api as object) : [];
}

function panggilWajib(api: unknown, method: string): (...args: unknown[]) => Promise<unknown> {
  const fn = (api as Record<string, unknown> | null)?.[method];
  if (typeof fn !== "function") {
    throw new Error(
      `Wallet tidak menyediakan metode "${method}" yang dibutuhkan jalur tulis. Metode tersedia: ${namaMetodeApi(api).join(", ") || "(tidak terdeteksi)"}.`,
    );
  }
  return (fn as (...args: unknown[]) => Promise<unknown>).bind(api);
}

function cariMetode(
  api: unknown,
  kandidat: readonly string[],
): { nama: string; fn: (...args: unknown[]) => Promise<unknown> } | null {
  for (const nama of kandidat) {
    const fn = (api as Record<string, unknown> | null)?.[nama];
    if (typeof fn === "function") return { nama, fn: (fn as (...args: unknown[]) => Promise<unknown>).bind(api) };
  }
  return null;
}

const KANDIDAT_BALANCE = ["balanceSealedTransaction", "balanceUnsealedTransaction"] as const;

export function buatAdaptorLace(wallet: WalletConnection): AdaptorWallet {
  if (!wallet.coinPublicKey || !wallet.encryptionPublicKey) {
    throw new Error(
      "Wallet tersambung tapi tidak melaporkan coinPublicKey/encryptionPublicKey — dibutuhkan jalur tulis.",
    );
  }
  const api = wallet.api;
  const coinPublicKey = wallet.coinPublicKey;
  const encryptionPublicKey = wallet.encryptionPublicKey;

  return {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,

    async balanceTx(tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction> {
      const ditemukan = cariMetode(api, KANDIDAT_BALANCE);
      if (!ditemukan) {
        throw new Error(
          `Wallet tidak menyediakan balanceSealedTransaction maupun balanceUnsealedTransaction. Metode tersedia: ${namaMetodeApi(api).join(", ") || "(tidak terdeteksi)"}.`,
        );
      }
      if (import.meta.env.DEV) console.log(`[votepriv:tulis] balanceTx via ${ditemukan.nama}`);
      return (await ditemukan.fn(tx, ttl)) as FinalizedTransaction;
    },

    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      const kirim = panggilWajib(api, "submitTransaction");
      const hasil = await kirim(tx);
      if (typeof hasil === "string" && hasil.length > 0) return hasil;
      const ids = tx.identifiers();
      if (ids.length === 0) {
        throw new Error(
          "submitTransaction tidak mengembalikan id transaksi, dan transaksi yang dikirim tidak punya identifier apa pun untuk diawasi indexer.",
        );
      }
      if (import.meta.env.DEV) {
        console.warn("[votepriv:tulis] submitTransaction tidak mengembalikan id — memakai identifiers() lokal");
      }
      return ids[0];
    },
  };
}
```

- [ ] **Step 4: Jalankan uji, pastikan lolos**

Run: `pnpm test client/src/lib/chain/adaptor-lace.test.ts`
Expected: PASS — 8 uji.

- [ ] **Step 5: Gerbang tipe + bundel**

Run: `pnpm check && pnpm check:uji && pnpm test`
Expected: bersih.

**Gerbang mutasi — Tabel 1 (penjaga dari kode, `adaptor-lace.ts`):**

| # | Fungsi | Penjaga |
|---|---|---|
| G1 | `buatAdaptorLace`, `if (!wallet.coinPublicKey \|\| !wallet.encryptionPublicKey)` | melempar sebelum membangun adaptor sama sekali |
| G2 | `balanceTx`, `cariMetode(api, KANDIDAT_BALANCE)` urutan array | `balanceSealedTransaction` dicoba SEBELUM `balanceUnsealedTransaction` |
| G3 | `balanceTx`, `if (!ditemukan)` | melempar galat yang menyebut KEDUA nama kandidat |
| G4 | `submitTx`, `if (typeof hasil === "string" \&\& hasil.length > 0)` | memakai nilai wallet HANYA bila string tidak kosong |
| G5 | `submitTx`, `if (ids.length === 0)` | melempar bila fallback lokal JUGA tidak punya identifier |

**Gerbang mutasi — Tabel 2:**

| # | Mutasi | Uji yang WAJIB merah |
|---|---|---|
| G1 | Hapus guard, langsung `const api = wallet.api` | "melempar bila wallet tidak melaporkan coinPublicKey/encryptionPublicKey" |
| G2 | Tukar urutan `KANDIDAT_BALANCE` jadi `["balanceUnsealedTransaction", "balanceSealedTransaction"]` | "balanceTx mencoba balanceSealedTransaction LEBIH DULU" — `balanceUnsealedTransaction` terpanggil, assert `.not.toHaveBeenCalled()` merah |
| G3 | Ganti pesan galat jadi generic tanpa nama metode | "balanceTx melempar galat yang MENYEBUT NAMA METODE" |
| G4 | Ganti kondisi jadi `if (typeof hasil === "string")` (izinkan string kosong) | Tidak ada uji langsung untuk string kosong — **tambahkan** uji "submitTx jatuh ke identifiers() bila submitTransaction mengembalikan string kosong" ke Step 1 sebelum lanjut |
| G5 | Hapus guard, `return ids[0]` langsung (crash `undefined` bila kosong, atau kembalikan `undefined as never`) | "submitTx melempar bila submitTransaction undefined DAN identifiers() kosong" |

- [ ] **Step 6 (dari G4 di atas): tambah satu uji**

Tambahkan ke `adaptor-lace.test.ts`:

```ts
it("submitTx jatuh ke identifiers() bila submitTransaction mengembalikan string KOSONG", async () => {
  const submitTransaction = vi.fn(async () => "");
  const dompet = buatAdaptorLace(walletContoh({ submitTransaction }));
  const tx = { identifiers: () => ["id-lokal-2"] };
  await expect(dompet.submitTx(tx as never)).resolves.toBe("id-lokal-2");
});
```

Jalankan ulang Step 2-5.

---

### Task 6: Alur `castVote` ujung ke ujung di `jalur-tulis.ts`

**Files:**
- Create: `client/src/lib/chain/tulis.ts`
- Test: `client/src/lib/chain/tulis.test.ts`
- Modify: `client/src/lib/chain/jalur-tulis.ts` (buka pintu sungguhan)

**Interfaces:**
- Consumes: SEMUA dari Task 1-5 (`buatPrivateStateProviderIdb`, `FetchZkConfigProvider`/`pastikanArtefakZkMurah`, `ambilJalurEligibility`/`bacaLedgerBallotTulis`, `AdaptorWallet`/`kompilasiBallotBrowser`/`rakitProvidersBallotBrowser`, `buatAdaptorLace`); `findDeployedContract` (`@midnight-ntwrk/midnight-js-contracts`); `setNetworkId` (`@midnight-ntwrk/midnight-js-network-id`); `SucceedEntirely` (`@midnight-ntwrk/midnight-js-types`); `BallotPrivateStateId`/`emptyBallotPrivateState`/`withCredential`/`withOpening`/`withEligibilityPath` (`@pkgs/contract/src/ballot-witnesses.js`); `Ballot.pureCircuits.cred_leaf`/`vote_nullifier` (`@pkgs/contract/src/managed/ballot/contract/index.js`); `MIDNIGHT_NETWORK_ENDPOINTS` (`@pkgs/shared/src/network-config`); `type WalletConnection` (`@/lib/midnight-wallet`); `PROOF_SERVER_PATH` (`@/lib/proof-server`).
- Produces: `type TahapKirimSuara`, `class GalatCastVote extends Error` (dengan `kode` dan `mungkinSudahMasuk?`), `interface CadanganOpening`, `interface ParamKirimSuara`, `interface HasilKirimSuara`, `async function kirimSuara(params: ParamKirimSuara, wallet: WalletConnection): Promise<HasilKirimSuara>` — dikonsumsi Task 8 (`VoteModal.tsx`, lewat `jalur-tulis.ts::muatJalurTulis()`).

- [ ] **Step 1: Tulis uji gagal lebih dulu**

`client/src/lib/chain/tulis.test.ts` — mem-mock SETIAP modul yang menyentuh jaringan/wallet nyata, menguji ORKESTRASI `kirimSuara`, bukan isi masing-masing sub-modul (sudah diuji task-nya sendiri):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BallotPrivateState } from "@pkgs/contract/src/ballot-witnesses.js";
import type { Ledger as LedgerBallot } from "@pkgs/contract/src/managed/ballot/contract/index.js";
import type { WalletConnection } from "@/lib/midnight-wallet";

const { setNetworkIdMock } = vi.hoisted(() => ({ setNetworkIdMock: vi.fn() }));
vi.mock("@midnight-ntwrk/midnight-js-network-id", () => ({ setNetworkId: setNetworkIdMock, getNetworkId: () => "preview" }));

const { findDeployedContractMock } = vi.hoisted(() => ({ findDeployedContractMock: vi.fn() }));
vi.mock("@midnight-ntwrk/midnight-js-contracts", async (impor) => {
  const asli = await impor<typeof import("@midnight-ntwrk/midnight-js-contracts")>();
  return { ...asli, findDeployedContract: findDeployedContractMock };
});

const { pastikanArtefakZkMurahMock } = vi.hoisted(() => ({ pastikanArtefakZkMurahMock: vi.fn(async () => {}) }));
vi.mock("./zk-config-fetch", async (impor) => {
  const asli = await impor<typeof import("./zk-config-fetch")>();
  return { ...asli, pastikanArtefakZkMurah: pastikanArtefakZkMurahMock };
});

const { ambilJalurEligibilityMock, bacaLedgerBallotTulisMock } = vi.hoisted(() => ({
  ambilJalurEligibilityMock: vi.fn(async () => ({ leaf: new Uint8Array(32), path: [] })),
  bacaLedgerBallotTulisMock: vi.fn<(pdp: unknown, alamat: string) => Promise<LedgerBallot>>(),
}));
vi.mock("./eligibility-tulis", async (impor) => {
  const asli = await impor<typeof import("./eligibility-tulis")>();
  return {
    ...asli,
    ambilJalurEligibility: ambilJalurEligibilityMock,
    bacaLedgerBallotTulis: bacaLedgerBallotTulisMock,
  };
});

const { buatAdaptorLaceMock } = vi.hoisted(() => ({
  buatAdaptorLaceMock: vi.fn(() => ({
    getCoinPublicKey: () => "cpk",
    getEncryptionPublicKey: () => "epk",
    balanceTx: async (tx: unknown) => tx,
    submitTx: async () => "tx-id-sukses",
  })),
}));
vi.mock("./adaptor-lace", () => ({ buatAdaptorLace: buatAdaptorLaceMock }));

const { kirimSuara, GalatCastVote } = await import("./tulis");

/**
 * Ledger sintetis LENGKAP (pola sama dengan eligibility-tulis.test.ts Task 3
 * dan dekode.ledger-sintetis.test.ts) — override hanya dua hal yang uji-uji
 * di bawah benar-benar butuh, `tidakDipakai` mengisi sisanya tanpa satu pun
 * `as unknown`/`as any`.
 */
function ledgerContoh(over: { ballotNonce?: Uint8Array; nullifierAda?: boolean } = {}): LedgerBallot {
  const tidakDipakai = (): never => {
    throw new Error("tidak dipakai di uji ini");
  };
  return {
    title: "", description: "", community: "", option0: "", option1: "", option2: "", option3: "",
    optionCount: 0n, voteDeadline: 0n, tallyDeadline: 0n, quorumPercent: 0n, eligibleCount: 0n,
    eligibilityPolicy: "", adminKey: new Uint8Array(32),
    ballotNonce: over.ballotNonce ?? new Uint8Array(32).fill(4),
    phase: 0,
    eligibility: {
      isFull: tidakDipakai, checkRoot: tidakDipakai, root: tidakDipakai, firstFree: tidakDipakai,
      pathForLeaf: tidakDipakai, findPathForLeaf: tidakDipakai, history: tidakDipakai,
    },
    voteCount: 0n, registeredCount: 0n,
    nullifiers: {
      isEmpty: tidakDipakai, size: tidakDipakai, member: () => over.nullifierAda ?? false,
      [Symbol.iterator]: tidakDipakai,
    },
    commitments: {
      isFull: tidakDipakai, checkRoot: tidakDipakai, root: tidakDipakai, firstFree: tidakDipakai,
      pathForLeaf: tidakDipakai, findPathForLeaf: tidakDipakai,
    },
    tallyNullifiers: { isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, [Symbol.iterator]: tidakDipakai },
    tallies: {
      isEmpty: tidakDipakai, size: tidakDipakai, member: tidakDipakai, lookup: tidakDipakai,
      [Symbol.iterator]: tidakDipakai,
    },
    talliedCount: 0n,
  };
}

function walletContoh(): WalletConnection {
  return {
    address: "mn_shield-addr_test1x",
    coinPublicKey: "cpk",
    encryptionPublicKey: "epk",
    networkId: "preview",
    connectorName: "lace",
    apiVersion: "4.0.1",
    api: {},
  };
}

function psTiruan() {
  const isi = new Map<string, unknown>();
  return {
    setContractAddress: vi.fn(),
    get: vi.fn(async (id: string) => (isi.get(id) as BallotPrivateState | undefined) ?? null),
    set: vi.fn(async (id: string, v: BallotPrivateState) => {
      isi.set(id, v);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bacaLedgerBallotTulisMock.mockResolvedValue(ledgerContoh());
});

describe("kirimSuara", () => {
  const paramDasar = {
    alamatBallot: "a".repeat(64),
    credentialHex: "b".repeat(64),
    opsi: 1,
    jaringan: "preview" as const,
  };

  it("memanggil setNetworkId SEBELUM apa pun yang lain", async () => {
    const psp = psTiruan();
    const ballotCallTx = { castVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) };
    findDeployedContractMock.mockResolvedValue({ callTx: ballotCallTx });
    // Ganti privateStateProvider yang dipakai lewat rakitProvidersBallotBrowser
    // sungguhan (Task 4 tidak di-mock) TIDAK praktis diuji identitasnya di
    // sini — cukup pastikan setNetworkId terpanggil sebelum findDeployedContract.
    findDeployedContractMock.mockImplementationOnce(async () => {
      expect(setNetworkIdMock).toHaveBeenCalledWith("preview");
      return { callTx: ballotCallTx };
    });
    await kirimSuara(paramDasar, walletContoh());
    expect(setNetworkIdMock).toHaveBeenCalledTimes(1);
  });

  it("memeriksa artefak ZK murah SEBELUM findDeployedContract", async () => {
    const urutan: string[] = [];
    pastikanArtefakZkMurahMock.mockImplementation(async () => {
      urutan.push("zk");
    });
    findDeployedContractMock.mockImplementation(async () => {
      urutan.push("find");
      return { callTx: { castVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) } };
    });
    await kirimSuara(paramDasar, walletContoh());
    expect(urutan).toEqual(["zk", "find"]);
  });

  it("melempar GalatCastVote berkode ARTEFAK_ZK bila artefak ZK gagal, TIDAK memanggil findDeployedContract", async () => {
    pastikanArtefakZkMurahMock.mockRejectedValueOnce(new Error("404"));
    await expect(kirimSuara(paramDasar, walletContoh())).rejects.toMatchObject({ name: "GalatCastVote" });
    expect(findDeployedContractMock).not.toHaveBeenCalled();
  });

  it("melempar bila credentialHex bukan 64 hex", async () => {
    await expect(kirimSuara({ ...paramDasar, credentialHex: "bukan-hex" }, walletContoh())).rejects.toThrow(
      /64 karakter heksadesimal/,
    );
  });

  it("sukses: mengembalikan txId dan nullifierHex, memanggil onStatus berurutan", async () => {
    const urutanStatus: string[] = [];
    findDeployedContractMock.mockResolvedValue({
      callTx: { castVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-sukses" } })) },
    });
    const hasil = await kirimSuara({ ...paramDasar, onStatus: (t) => urutanStatus.push(t) }, walletContoh());
    expect(hasil.txId).toBe("tx-sukses");
    expect(hasil.nullifierHex).toHaveLength(64);
    expect(urutanStatus[0]).toBe("menyiapkan-artefak");
    expect(urutanStatus.at(-1)).toBe("menunggu-indexer");
  });

  it("memanggil onOpeningTersimpan TEPAT SEBELUM castVote dipanggil", async () => {
    const castVote = vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } }));
    findDeployedContractMock.mockResolvedValue({ callTx: { castVote } });
    let dipanggilSebelumCastVote = false;
    await kirimSuara(
      {
        ...paramDasar,
        onOpeningTersimpan: () => {
          dipanggilSebelumCastVote = castVote.mock.calls.length === 0;
        },
      },
      walletContoh(),
    );
    expect(dipanggilSebelumCastVote).toBe(true);
  });

  it("status akhir bukan SucceedEntirely melempar GalatCastVote berkode ON_CHAIN", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: { castVote: vi.fn(async () => ({ public: { status: "FailEntirely", txId: "tx-gagal" } })) },
    });
    await expect(kirimSuara(paramDasar, walletContoh())).rejects.toMatchObject({ kode: "ON_CHAIN" });
  });

  it("bila callTx.castVote MELEMPAR tapi nullifier TERNYATA sudah ada di ledger, galat membawa mungkinSudahMasuk", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: {
        castVote: vi.fn(async () => {
          throw new Error("indexer terputus setelah submit");
        }),
      },
    });
    bacaLedgerBallotTulisMock.mockResolvedValue(ledgerContoh({ nullifierAda: true }));
    const galat = await kirimSuara(paramDasar, walletContoh()).catch((e) => e);
    expect(galat).toBeInstanceOf(GalatCastVote);
    expect(galat.mungkinSudahMasuk?.nullifierHex).toHaveLength(64);
  });

  it("bila callTx.castVote MELEMPAR dan nullifier TIDAK ada di ledger, galat TIDAK membawa mungkinSudahMasuk", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: {
        castVote: vi.fn(async () => {
          throw new Error("wallet menolak");
        }),
      },
    });
    bacaLedgerBallotTulisMock.mockResolvedValue(ledgerContoh({ nullifierAda: false }));
    const galat = await kirimSuara(paramDasar, walletContoh()).catch((e) => e);
    expect(galat).toBeInstanceOf(GalatCastVote);
    expect(galat.mungkinSudahMasuk).toBeUndefined();
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `pnpm test client/src/lib/chain/tulis.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Buka pintu sungguhan di `jalur-tulis.ts`**

Modify `client/src/lib/chain/jalur-tulis.ts` — ganti seluruh isi (baris 44-62) menjadi:

```ts
/** true — C-2b sudah mengisi ./tulis.ts. */
export const JALUR_TULIS_SIAP = true;

export async function muatJalurTulis(): Promise<typeof import("./tulis")> {
  return import("./tulis");
}
```

Perbarui juga docstring berkas (baris 1-42): hapus paragraf "Berkas ini BELUM memanggil apa pun yang nyata" dan ganti dengan catatan bahwa `./tulis.ts` kini ada dan seluruh aturan (dynamic import, tanpa `import type` dari ledger-v8/midnight-js di jalur statis) tetap berlaku SELAMANYA untuk pintu ini — bukan hanya sampai C-2b selesai.

- [ ] **Step 4: Implementasi `tulis.ts` (bagian castVote)**

```ts
/**
 * SATU-SATUNYA modul jalur TULIS sungguhan (C-2b). Dimuat HANYA lewat
 * jalur-tulis.ts::muatJalurTulis() — TIDAK PERNAH diimpor statis, dijaga
 * batas-bundel.test.ts dan scripts/ukur-batas-bundel.mjs.
 *
 * setNetworkId WAJIB baris pertama: getNetworkId() MELEMPAR bila belum
 * disetel, dan createUnprovenCallTx (di dalam callTx.castVote()) memanggilnya
 * langsung. Jalur BACA tidak pernah menyetel ini.
 */
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { SucceedEntirely } from "@midnight-ntwrk/midnight-js-types";
import {
  BallotPrivateStateId,
  emptyBallotPrivateState,
  withCredential,
  withEligibilityPath,
  withOpening,
  type BallotPrivateState,
} from "@pkgs/contract/src/ballot-witnesses.js";
import * as Ballot from "@pkgs/contract/src/managed/ballot/contract/index.js";
import { MIDNIGHT_NETWORK_ENDPOINTS, type MidnightNetworkId } from "@pkgs/shared/src/network-config";
import type { WalletConnection } from "@/lib/midnight-wallet";
import { PROOF_SERVER_PATH } from "@/lib/proof-server";
import { buatAdaptorLace } from "./adaptor-lace";
import { ambilJalurEligibility, bacaLedgerBallotTulis } from "./eligibility-tulis";
import { kompilasiBallotBrowser } from "./kontrak-tulis";
import { rakitProvidersBallotBrowser, type ProvidersBallotBrowser } from "./providers-tulis";
import { pastikanArtefakZkMurah } from "./zk-config-fetch";

const zkBaseUrl = (): string => `${window.location.origin}/zk/ballot`;
const proofServerUrl = (): string => `${window.location.origin}${PROOF_SERVER_PATH}`;

export type TahapKirimSuara =
  | "menyiapkan-artefak"
  | "membaca-eligibility"
  | "menyusun-witness"
  | "membuat-proof"
  | "menyeimbangkan-wallet"
  | "mengirim"
  | "menunggu-indexer";

export class GalatCastVote extends Error {
  constructor(
    message: string,
    readonly kode: "ARTEFAK_ZK" | "ELIGIBILITY" | "WALLET" | "ON_CHAIN" | "TIDAK_DIKENAL",
    readonly cause?: unknown,
    /** Terisi bila nullifier credential ini TERKONFIRMASI sudah ada di
     * ledger MESKIPUN panggilan di atas melempar. UI WAJIB membedakan ini
     * dari kegagalan biasa: mencoba lagi akan ditolak "Credential ini sudah
     * dipakai memilih", dan itu bukan tanda kegagalan. */
    readonly mungkinSudahMasuk?: { nullifierHex: string },
  ) {
    super(message);
    this.name = "GalatCastVote";
  }
}

export interface CadanganOpening {
  alamatBallot: string;
  opsi: number;
  saltHex: string;
}

export interface ParamKirimSuara {
  alamatBallot: string;
  credentialHex: string;
  opsi: number;
  jaringan: MidnightNetworkId;
  onStatus?: (tahap: TahapKirimSuara) => void;
  /** Dipanggil TEPAT SEBELUM castVote — jendela untuk menawarkan cadangan. */
  onOpeningTersimpan?: (cadangan: CadanganOpening) => void;
}

export interface HasilKirimSuara {
  txId: string;
  nullifierHex: string;
}

function hexKeBytes(hex: string): Uint8Array {
  const bersih = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(bersih)) {
    throw new GalatCastVote("Credential harus 64 karakter heksadesimal (32 byte).", "TIDAK_DIKENAL");
  }
  const keluar = new Uint8Array(32);
  for (let i = 0; i < 32; i++) keluar[i] = Number.parseInt(bersih.slice(i * 2, i * 2 + 2), 16);
  return keluar;
}

function bytesKeHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function siapkanProviders(
  wallet: WalletConnection,
  jaringan: MidnightNetworkId,
): Promise<ProvidersBallotBrowser> {
  setNetworkId(jaringan);
  const endpoint = MIDNIGHT_NETWORK_ENDPOINTS[jaringan];
  return rakitProvidersBallotBrowser({
    indexerUri: endpoint.indexer,
    indexerWsUri: endpoint.indexerWS,
    zkBaseUrl: zkBaseUrl(),
    proofServerUrl: proofServerUrl(),
    dompet: buatAdaptorLace(wallet),
  });
}

async function periksaMungkinSudahMasuk(
  providers: ProvidersBallotBrowser | undefined,
  alamatBallot: string,
  credential: Uint8Array,
): Promise<{ nullifierHex: string } | undefined> {
  if (!providers) return undefined;
  try {
    const lb = await bacaLedgerBallotTulis(providers.publicDataProvider, alamatBallot);
    const nf = Ballot.pureCircuits.vote_nullifier(lb.ballotNonce, credential);
    if (lb.nullifiers.member(nf)) return { nullifierHex: bytesKeHex(nf) };
    return undefined;
  } catch {
    return undefined; // pemeriksaan pemulihan sendiri gagal — biarkan galat asli yang dilempar pemanggil
  }
}

export async function kirimSuara(params: ParamKirimSuara, wallet: WalletConnection): Promise<HasilKirimSuara> {
  const { alamatBallot, credentialHex, opsi, jaringan, onStatus, onOpeningTersimpan } = params;
  const credential = hexKeBytes(credentialHex);
  let providers: ProvidersBallotBrowser | undefined;

  try {
    onStatus?.("menyiapkan-artefak");
    try {
      await pastikanArtefakZkMurah(zkBaseUrl(), "castVote");
    } catch (e) {
      throw new GalatCastVote("Artefak ZK untuk castVote tidak terbaca — periksa /zk/ballot/keys/castVote.verifier.", "ARTEFAK_ZK", e);
    }

    providers = await siapkanProviders(wallet, jaringan);

    onStatus?.("membaca-eligibility");
    const daun = Ballot.pureCircuits.cred_leaf(credential);
    const jalurEligibility = await ambilJalurEligibility(providers.publicDataProvider, alamatBallot, daun);

    // findDeployedContract MENIMPA private state — WAJIB sebelum menulis
    // credential/opening (pola sama dengan pkgs/cli/src/e2e.ts:468-481).
    const ballot = await findDeployedContract(providers, {
      compiledContract: kompilasiBallotBrowser(),
      contractAddress: alamatBallot,
      privateStateId: BallotPrivateStateId,
      initialPrivateState: emptyBallotPrivateState(new Uint8Array(32)),
    });

    onStatus?.("menyusun-witness");
    const psp = providers.privateStateProvider;
    psp.setContractAddress(alamatBallot);
    const dasar = (await psp.get(BallotPrivateStateId)) ?? emptyBallotPrivateState(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(32));
    let ps: BallotPrivateState = withCredential(dasar, alamatBallot, credential);
    ps = withOpening(ps, alamatBallot, { option: BigInt(opsi), salt });
    ps = withEligibilityPath(ps, alamatBallot, jalurEligibility);
    await psp.set(BallotPrivateStateId, ps);
    onOpeningTersimpan?.({ alamatBallot, opsi, saltHex: bytesKeHex(salt) });

    onStatus?.("membuat-proof");
    onStatus?.("menyeimbangkan-wallet");
    // callTx.castVote() menjalankan RANTAI PENUH: witness -> proveTx (proof
    // server KITA) -> balanceTx (wallet) -> submitTx (wallet) ->
    // watchForTxData. midnight-js MELEMPAR CallTxFailedError bila status
    // akhir bukan SucceedEntirely (TransactionContextImpl[Submit](),
    // dist/index.mjs:741-756) — TIDAK mengembalikannya sebagai nilai.
    const r = await ballot.callTx.castVote();
    onStatus?.("mengirim");

    if (r.public.status !== SucceedEntirely) {
      throw new GalatCastVote(
        `castVote difinalisasi dengan status ${r.public.status}, bukan ${SucceedEntirely}.`,
        "ON_CHAIN",
      );
    }
    onStatus?.("menunggu-indexer");
    const nullifier = Ballot.pureCircuits.vote_nullifier(
      (await bacaLedgerBallotTulis(providers.publicDataProvider, alamatBallot)).ballotNonce,
      credential,
    );
    return { txId: r.public.txId, nullifierHex: bytesKeHex(nullifier) };
  } catch (e) {
    // Tidak ada cabang untuk kode "ARTEFAK_ZK": pada tahap itu `providers`
    // masih undefined, dan periksaMungkinSudahMasuk() sudah menjaga dirinya
    // sendiri dengan `if (!providers) return undefined` — hasil akhirnya
    // identik dengan short-circuit eksplisit, jadi short-circuit itu dibuang.
    const mungkinSudahMasuk = await periksaMungkinSudahMasuk(providers, alamatBallot, credential);
    if (e instanceof GalatCastVote) {
      throw new GalatCastVote(e.message, e.kode, e.cause, mungkinSudahMasuk ?? e.mungkinSudahMasuk);
    }
    throw new GalatCastVote(e instanceof Error ? e.message : String(e), "TIDAK_DIKENAL", e, mungkinSudahMasuk);
  }
}
```

- [ ] **Step 5: Jalankan uji, pastikan lolos**

Run: `pnpm test client/src/lib/chain/tulis.test.ts`
Expected: PASS — 9 uji.

- [ ] **Step 6: Gerbang tipe + bundel SUMBER**

Run: `pnpm check && pnpm check:uji && pnpm test`
Expected: bersih. `batas-bundel.test.ts` (jalur sumber) HARUS tetap lolos — `tulis.ts` diimpor HANYA lewat `await import("./tulis")` di `jalur-tulis.ts`, tidak pernah lewat `import`/`export ... from` statis. (Gerbang jalur KELUARAN/`ukur-batas-bundel.mjs`, yang butuh `pnpm build` sungguhan, ditunda ke Task 9.)

**Gerbang mutasi — Tabel 1 (penjaga dari kode, `tulis.ts`):**

| # | Fungsi | Penjaga |
|---|---|---|
| G1 | `hexKeBytes`, regex `/^[0-9a-f]{64}$/` | menolak credential yang bukan 64 hex SEBELUM byte apa pun dipakai |
| G2 | `kirimSuara`, `try { await pastikanArtefakZkMurah... } catch { throw GalatCastVote(...,"ARTEFAK_ZK",...) }` | artefak ZK gagal MENGHENTIKAN alur sebelum `findDeployedContract` — TIDAK menimpa private state pemilih dengan state kosong sia-sia |
| G3 | `kirimSuara`, urutan `findDeployedContract` SEBELUM tulis private state | mencegah kredential/opening tertulis lalu langsung tertimpa kosong |
| G4 | `kirimSuara`, `if (r.public.status !== SucceedEntirely)` | belt-and-suspenders (jalur normal melempar lebih dulu di midnight-js) — tetap diuji karena forward-compatible |
| G5 | `periksaMungkinSudahMasuk`, `if (!providers) return undefined` | galat SEBELUM `providers` ada (mis. ARTEFAK_ZK) tidak pernah mencoba membaca ledger |
| G6 | `periksaMungkinSudahMasuk`, `if (lb.nullifiers.member(nf))` | membedakan "mungkin sudah masuk" dari kegagalan biasa |

**Gerbang mutasi — Tabel 2:**

| # | Mutasi | Uji yang WAJIB merah |
|---|---|---|
| G1 | Ganti regex jadi `/.*/ ` (terima apa saja) | "melempar bila credentialHex bukan 64 hex" |
| G2 | Hapus try/catch di sekitar `pastikanArtefakZkMurah`, biarkan galat aslinya lewat | "melempar GalatCastVote berkode ARTEFAK_ZK ... TIDAK memanggil findDeployedContract" — `kode` bukan lagi `"ARTEFAK_ZK"` |
| G3 | Panggil `psp.set(...)` SEBELUM `findDeployedContract` | "memeriksa artefak ZK murah SEBELUM findDeployedContract" tidak menangkap ini langsung — **tambahkan** uji "findDeployedContract dipanggil SEBELUM psp.set" dengan spy urutan pada `providers.privateStateProvider.set` (perlu expose lewat `rakitProvidersBallotBrowser` asli yang di-mock sebagian — alternatif lebih murah: pindahkan assertion urutan ke `tulis.test.ts` Step 1 langsung, memakai `providers-tulis` ASLI [tidak di-mock] dan men-spy `buatPrivateStateProviderIdb` lewat `vi.mock("./private-state-idb", ...)`; tambahkan sebelum lanjut ke Task 7 |
| G4 | Hapus guard, selalu `return {txId: r.public.txId, ...}` tanpa cek status | "status akhir bukan SucceedEntirely melempar GalatCastVote berkode ON_CHAIN" |
| G5 | Ganti `if (!providers) return undefined` jadi `if (false)` (paksa lanjut dengan `providers` yang mungkin belum ada) | "melempar GalatCastVote berkode ARTEFAK_ZK ... TIDAK memanggil findDeployedContract" — `providers.publicDataProvider` mengakses `undefined`, uji melempar TypeError alih-alih `GalatCastVote` yang rapi |
| G6 | Ganti jadi `if (true)` (selalu anggap mungkin sudah masuk) | "bila callTx.castVote MELEMPAR dan nullifier TIDAK ada di ledger, galat TIDAK membawa mungkinSudahMasuk" |

- [ ] **Step 7 (dari G3 di atas): tambah uji urutan tulis-vs-temukan**

Tambahkan ke `tulis.test.ts`:

```ts
it("findDeployedContract dipanggil SEBELUM private state ditulis", async () => {
  const urutan: string[] = [];
  const psp = { setContractAddress: vi.fn(), get: vi.fn(async () => null), set: vi.fn(async () => { urutan.push("set"); }) };
  vi.doMock("./providers-tulis", async (impor) => {
    const asli = await impor<typeof import("./providers-tulis")>();
    return {
      ...asli,
      rakitProvidersBallotBrowser: (kp: unknown) => ({ ...asli.rakitProvidersBallotBrowser(kp as never), privateStateProvider: psp }),
    };
  });
  findDeployedContractMock.mockImplementation(async () => {
    urutan.push("find");
    return { callTx: { castVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) } };
  });
  const { kirimSuara: kirimSuaraSegar } = await import("./tulis");
  await kirimSuaraSegar(paramDasar, walletContoh());
  expect(urutan).toEqual(["find", "set"]);
});
```

Jalankan ulang Step 2, 5, 6. Perbaiki Step 4's implementasi bila urutan `findDeployedContract` vs `psp.set` ternyata terbalik dari yang ditulis (yang di atas SUDAH menaruh `findDeployedContract` lebih dulu — uji ini adalah PENJAGA, bukan perubahan).

---

### Task 7: `tallyVote`

**Files:**
- Modify: `client/src/lib/chain/tulis.ts` (tambah `bukaSuara` + `pulihkanOpeningDariCadangan`)
- Modify: `client/src/lib/chain/tulis.test.ts` (tambah uji)

**Interfaces:**
- Consumes: SEMUA dari Task 6 plus `ambilJalurCommitment` (Task 3), `openingFor`/`withCommitmentPath` (`@pkgs/contract/src/ballot-witnesses.js`), `Ballot.pureCircuits.vote_commitment`/`tally_nullifier`.
- Produces: `class GalatOpeningHilang extends Error`, `interface ParamBukaSuara`, `async function bukaSuara(params: ParamBukaSuara, wallet: WalletConnection): Promise<HasilKirimSuara>`, `async function pulihkanOpeningDariCadangan(cadangan: CadanganOpening): Promise<void>` — dikonsumsi Task 8.

**Keputusan #4 untuk `commitments` (bukan `eligibility`):** `commitments` BUKAN `HistoricMerkleTree` (ballot.compact) — `jalurCommitment` di bawah dibangun FRESH tepat sebelum `tallyVote`, tidak pernah dari cache. `ambilJalurCommitment` (Task 3) sudah menjamin ini secara struktural (baca ulang setiap percobaan).

**Jalur pemulihan yang jujur (mengikat, keamanan):** bila IndexedDB dibersihkan SETELAH `castVote` tapi SEBELUM `tallyVote`, opening (option+salt) hilang PERMANEN dari perangkat itu — `findDeployedContract` varian "existing private state" (dipakai di sini, TANPA `initialPrivateState`) MELEMPAR segera dengan pesan yang menunjuk pemulihan, bukan gagal senyap di dalam witness. `pulihkanOpeningDariCadangan` menulis ulang opening dari berkas cadangan yang diunduh Task 8 saat `castVote` (`onOpeningTersimpan`), memungkinkan `tallyVote` dari PERANGKAT LAIN atau setelah pembersihan data.

- [ ] **Step 1: Tulis uji gagal lebih dulu**

Tambah ke `tulis.test.ts` (memakai mock modul yang sama dengan Task 6, plus `ambilJalurCommitment`):

```ts
const { ambilJalurCommitmentMock } = vi.hoisted(() => ({
  ambilJalurCommitmentMock: vi.fn(async () => ({ leaf: new Uint8Array(32), path: [] })),
}));
vi.mock("./eligibility-tulis", async (impor) => {
  const asli = await impor<typeof import("./eligibility-tulis")>();
  return {
    ...asli,
    ambilJalurEligibility: ambilJalurEligibilityMock,
    ambilJalurCommitment: ambilJalurCommitmentMock,
    bacaLedgerBallotTulis: bacaLedgerBallotTulisMock,
  };
});

const { bukaSuara, pulihkanOpeningDariCadangan, GalatOpeningHilang } = await import("./tulis");

describe("bukaSuara", () => {
  const paramDasar = { alamatBallot: "a".repeat(64), jaringan: "preview" as const };

  it("findDeployedContract dipanggil TANPA initialPrivateState (tidak menimpa opening tersimpan)", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: { tallyVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) },
    });
    // psp.get mengembalikan opening TERSIMPAN — dipasok lewat mock providers-tulis
    // default (Task 4, tidak di-mock ulang di sini): gunakan ballot berbeda per
    // uji untuk menghindari state bocor antar uji (namaDb sama, tapi alamat beda).
    await expect(bukaSuara(paramDasar, walletContoh())).rejects.toBeInstanceOf(GalatOpeningHilang);
    const opts = findDeployedContractMock.mock.calls.at(-1)?.[1];
    expect(opts).not.toHaveProperty("initialPrivateState");
  });

  it("melempar GalatOpeningHilang dengan pesan yang menyebut pemulihan, bila tidak ada opening tersimpan", async () => {
    findDeployedContractMock.mockResolvedValue({
      callTx: { tallyVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) },
    });
    await expect(bukaSuara(paramDasar, walletContoh())).rejects.toThrow(/pulihkan dari berkas cadangan/);
  });

  it("pulihkanOpeningDariCadangan menulis opening yang lalu terbaca bukaSuara", async () => {
    await pulihkanOpeningDariCadangan({ alamatBallot: paramDasar.alamatBallot, opsi: 2, saltHex: "c".repeat(64) });
    const tallyVote = vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-tally" } }));
    findDeployedContractMock.mockResolvedValue({ callTx: { tallyVote } });
    const hasil = await bukaSuara(paramDasar, walletContoh());
    expect(hasil.txId).toBe("tx-tally");
    expect(tallyVote).toHaveBeenCalledTimes(1);
  });

  it("jalur commitment dibangun FRESH lewat ambilJalurCommitment, bukan ambilJalurEligibility", async () => {
    await pulihkanOpeningDariCadangan({ alamatBallot: paramDasar.alamatBallot, opsi: 0, saltHex: "d".repeat(64) });
    findDeployedContractMock.mockResolvedValue({
      callTx: { tallyVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-2" } })) },
    });
    await bukaSuara(paramDasar, walletContoh());
    expect(ambilJalurCommitmentMock).toHaveBeenCalled();
    expect(ambilJalurEligibilityMock).not.toHaveBeenCalled();
  });

  it("status akhir bukan SucceedEntirely melempar GalatCastVote berkode ON_CHAIN", async () => {
    await pulihkanOpeningDariCadangan({ alamatBallot: paramDasar.alamatBallot, opsi: 0, saltHex: "e".repeat(64) });
    findDeployedContractMock.mockResolvedValue({
      callTx: { tallyVote: vi.fn(async () => ({ public: { status: "FailFallible", txId: "tx-3" } })) },
    });
    await expect(bukaSuara(paramDasar, walletContoh())).rejects.toMatchObject({ kode: "ON_CHAIN" });
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `pnpm test client/src/lib/chain/tulis.test.ts`
Expected: FAIL — `bukaSuara`/`pulihkanOpeningDariCadangan`/`GalatOpeningHilang` belum diekspor.

- [ ] **Step 3: Implementasi — tambahkan ke `tulis.ts`**

Tambah import di puncak berkas (gabung dengan yang sudah ada di Task 6):

```ts
import {
  // ...yang sudah ada dari Task 6...
  openingFor,
  withCommitmentPath,
} from "@pkgs/contract/src/ballot-witnesses.js";
import { ambilJalurCommitment, ambilJalurEligibility, bacaLedgerBallotTulis } from "./eligibility-tulis";
import { buatPrivateStateProviderIdb } from "./private-state-idb";
```

Tambah di akhir berkas:

```ts
export class GalatOpeningHilang extends Error {
  constructor(alamatBallot: string) {
    super(
      `Tidak ada opening tersimpan untuk ballot ${alamatBallot} di perangkat ini. ` +
        "Bila Anda pernah mencoblos dari perangkat lain atau membersihkan data situs, " +
        "pulihkan dari berkas cadangan yang diunduh saat mencoblos (pulihkanOpeningDariCadangan).",
    );
    this.name = "GalatOpeningHilang";
  }
}

const NAMA_DB_PRIVATE_STATE = "votepriv-private-state";

export async function pulihkanOpeningDariCadangan(cadangan: CadanganOpening): Promise<void> {
  const psp = buatPrivateStateProviderIdb<typeof BallotPrivateStateId, BallotPrivateState>(NAMA_DB_PRIVATE_STATE);
  psp.setContractAddress(cadangan.alamatBallot);
  const dasar = (await psp.get(BallotPrivateStateId)) ?? emptyBallotPrivateState(new Uint8Array(32));
  const ps = withOpening(dasar, cadangan.alamatBallot, { option: BigInt(cadangan.opsi), salt: hexKeBytes(cadangan.saltHex) });
  await psp.set(BallotPrivateStateId, ps);
}

export interface ParamBukaSuara {
  alamatBallot: string;
  jaringan: MidnightNetworkId;
  onStatus?: (tahap: TahapKirimSuara) => void;
}

export async function bukaSuara(params: ParamBukaSuara, wallet: WalletConnection): Promise<HasilKirimSuara> {
  const { alamatBallot, jaringan, onStatus } = params;
  let providers: ProvidersBallotBrowser | undefined;

  try {
    onStatus?.("menyiapkan-artefak");
    try {
      await pastikanArtefakZkMurah(zkBaseUrl(), "tallyVote");
    } catch (e) {
      throw new GalatCastVote("Artefak ZK untuk tallyVote tidak terbaca.", "ARTEFAK_ZK", e);
    }

    providers = await siapkanProviders(wallet, jaringan);

    // TANPA initialPrivateState: varian ini MEMBACA state tersimpan dan
    // MELEMPAR bila kosong (midnight-js-contracts dist/index.mjs:1663-1664,
    // assertDefined) — pesan langsung menunjuk "opening hilang", bukan gagal
    // senyap di dalam witness nanti.
    const ballot = await findDeployedContract(providers, {
      compiledContract: kompilasiBallotBrowser(),
      contractAddress: alamatBallot,
      privateStateId: BallotPrivateStateId,
    });

    onStatus?.("menyusun-witness");
    const psp = providers.privateStateProvider;
    psp.setContractAddress(alamatBallot);
    const ps = await psp.get(BallotPrivateStateId);
    const opening = ps ? openingFor(ps, alamatBallot) : null;
    if (!opening) throw new GalatOpeningHilang(alamatBallot);

    onStatus?.("membaca-eligibility");
    const commitment = Ballot.pureCircuits.vote_commitment(opening.option, opening.salt);
    const jalurCommitment = await ambilJalurCommitment(providers.publicDataProvider, alamatBallot, commitment);
    await psp.set(BallotPrivateStateId, withCommitmentPath(ps!, alamatBallot, jalurCommitment));

    onStatus?.("membuat-proof");
    onStatus?.("menyeimbangkan-wallet");
    const r = await ballot.callTx.tallyVote();
    onStatus?.("mengirim");

    if (r.public.status !== SucceedEntirely) {
      throw new GalatCastVote(
        `tallyVote difinalisasi dengan status ${r.public.status}, bukan ${SucceedEntirely}.`,
        "ON_CHAIN",
      );
    }
    onStatus?.("menunggu-indexer");
    const tnf = Ballot.pureCircuits.tally_nullifier(opening.salt);
    return { txId: r.public.txId, nullifierHex: bytesKeHex(tnf) };
  } catch (e) {
    if (e instanceof GalatOpeningHilang) throw e;
    if (e instanceof GalatCastVote) throw e;
    throw new GalatCastVote(e instanceof Error ? e.message : String(e), "TIDAK_DIKENAL", e);
  }
}
```

`bukaSuara` sengaja TIDAK punya pemulihan "mungkin sudah masuk" ala `kirimSuara`: `tallyVote` tidak pernah memegang credential mentah (hanya `opening.salt`, sudah di scope sebelum `callTx.tallyVote()` dipanggil), dan `openingFor`/`GalatOpeningHilang` di atas sudah menutup kelas kegagalan yang setara (opening hilang) dengan galat yang LEBIH SPESIFIK, bukan generik.

- [ ] **Step 4: Jalankan uji, pastikan lolos**

Run: `pnpm test client/src/lib/chain/tulis.test.ts`
Expected: PASS — 9 (Task 6) + 5 (Task 7) = 14 uji.

- [ ] **Step 5: Gerbang tipe + bundel sumber**

Run: `pnpm check && pnpm check:uji && pnpm test`
Expected: bersih.

**Gerbang mutasi — Tabel 1 (penjaga baru dari kode, `bukaSuara`/`pulihkanOpeningDariCadangan`):**

| # | Fungsi | Penjaga |
|---|---|---|
| G1 | `findDeployedContract` panggilan di `bukaSuara` — TIDAK menyertakan `initialPrivateState` | tidak menimpa opening tersimpan |
| G2 | `bukaSuara`, `if (!opening) throw new GalatOpeningHilang(...)` | pesan menunjuk pemulihan, bukan lolos ke witness dengan opening kosong |
| G3 | `bukaSuara` memanggil `ambilJalurCommitment`, BUKAN `ambilJalurEligibility` | commitment path, bukan eligibility path |
| G4 | catch block `bukaSuara`, `if (e instanceof GalatOpeningHilang) throw e` | tidak dibungkus ulang jadi `GalatCastVote` generik — UI (Task 8) butuh tipe spesifik untuk teks pemulihan |

**Gerbang mutasi — Tabel 2:**

| # | Mutasi | Uji yang WAJIB merah |
|---|---|---|
| G1 | Tambahkan `initialPrivateState: emptyBallotPrivateState(new Uint8Array(32))` ke panggilan `findDeployedContract` di `bukaSuara` | "findDeployedContract dipanggil TANPA initialPrivateState" — `toHaveProperty` berbalik jadi truthy |
| G2 | Ganti guard jadi `if (false)` | "melempar GalatOpeningHilang ... bila tidak ada opening tersimpan" |
| G3 | Tukar `ambilJalurCommitment`/`ambilJalurEligibility` di `bukaSuara` | "jalur commitment dibangun FRESH lewat ambilJalurCommitment" — `ambilJalurEligibilityMock` terpanggil, assert `.not.toHaveBeenCalled()` merah |
| G4 | Hapus baris G4, biarkan jatuh ke `throw new GalatCastVote(...)` generik | Tidak ada uji langsung yang memaksa tipe `GalatOpeningHilang` bertahan — **tambahkan** assert `expect(galat).toBeInstanceOf(GalatOpeningHilang)` (bukan hanya `.rejects.toBeInstanceOf` yang sudah ada) plus `expect(galat.name).toBe("GalatOpeningHilang")` ke uji "melempar GalatOpeningHilang..." sebelum lanjut ke Task 8 |

- [ ] **Step 6 (dari G4 di atas): perkuat assertion**

Ganti uji "melempar GalatOpeningHilang dengan pesan yang menyebut pemulihan..." di Step 1 menjadi:

```ts
it("melempar GalatOpeningHilang (bukan GalatCastVote generik) bila tidak ada opening tersimpan", async () => {
  findDeployedContractMock.mockResolvedValue({
    callTx: { tallyVote: vi.fn(async () => ({ public: { status: "SucceedEntirely", txId: "tx-1" } })) },
  });
  const galat = await bukaSuara({ alamatBallot: "f".repeat(64), jaringan: "preview" }, walletContoh()).catch((e) => e);
  expect(galat).toBeInstanceOf(GalatOpeningHilang);
  expect(galat.name).toBe("GalatOpeningHilang");
  expect(galat.message).toMatch(/pulihkan dari berkas cadangan/);
});
```

Jalankan ulang Step 2, 4, 5.

---

### Task 8: UI — status pengiriman, kegagalan yang dapat dibedakan, teks privasi jujur

**Files:**
- Modify: `client/src/components/votepriv/VoteModal.tsx`
- Modify: `client/src/components/votepriv/VoteModal.test.tsx`
- Modify: `client/src/pages/Home.tsx`

**Interfaces:**
- Consumes: `muatJalurTulis` (`@/lib/chain/jalur-tulis`, SUDAH ADA, Task 6 mengisinya), `kirimSuara`/`GalatCastVote`/`TahapKirimSuara`/`CadanganOpening` (tipe, dari modul yang dikembalikan `muatJalurTulis()`), `type WalletConnection` (`@/lib/midnight-wallet`), `type MidnightNetworkId` (`@pkgs/shared/src/network-config`).
- Produces: `VoteModal` menerima prop baru `wallet: WalletConnection | null` dan `jaringan: MidnightNetworkId`; `pesanPrivasiSuara` (tanda tangan tidak berubah, TEKS klaim-kuat berubah); fungsi murni baru `teksTahap(tahap: TahapKirimSuara | null): string` dan `unduhCadangan(cadangan: CadanganOpening): void` (diekspor untuk diuji).

- [ ] **Step 1: Tulis uji gagal lebih dulu (tambahan ke `VoteModal.test.tsx`)**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { WalletConnection } from "@/lib/midnight-wallet";

const { kirimSuaraMock } = vi.hoisted(() => ({ kirimSuaraMock: vi.fn() }));
vi.mock("@/lib/chain/jalur-tulis", () => ({
  muatJalurTulis: async () => ({
    kirimSuara: kirimSuaraMock,
    GalatCastVote: class GalatCastVote extends Error {
      kode = "TIDAK_DIKENAL";
      mungkinSudahMasuk?: { nullifierHex: string };
    },
  }),
}));

function walletContoh(): WalletConnection {
  return {
    address: "mn_shield-addr_test1x",
    coinPublicKey: "cpk",
    encryptionPublicKey: "epk",
    networkId: "preview",
    connectorName: "lace",
    apiVersion: "4.0.1",
    api: {},
  };
}

describe("VoteModal — jalur tulis sungguhan (Task 8)", () => {
  it("menolak submit tanpa credential yang valid, TIDAK memanggil kirimSuara", async () => {
    render(
      <VoteModal ballot={ballotContoh} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    fireEvent.click(screen.getByText(ballotContoh.options[0]));
    fireEvent.click(screen.getByText(/Generate proof & vote/));
    expect(kirimSuaraMock).not.toHaveBeenCalled();
  });

  it("sukses: memanggil onVote dengan txRef dari hasil kirimSuara, txRef BUKAN null", async () => {
    kirimSuaraMock.mockResolvedValue({ txId: "tx-nyata-123", nullifierHex: "a".repeat(64) });
    const onVote = vi.fn();
    render(
      <VoteModal ballot={ballotContoh} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={onVote} />,
    );
    fireEvent.click(screen.getByText(ballotContoh.options[0]));
    fireEvent.change(screen.getByPlaceholderText(/64-character credential/), { target: { value: "b".repeat(64) } });
    fireEvent.click(screen.getByText(/Generate proof & vote/));
    await waitFor(() => expect(onVote).toHaveBeenCalledWith({
      ballotId: ballotContoh.id, proofStatus: "verified", nullifierStatus: "consumed", txRef: "tx-nyata-123",
    }));
  });

  it("kegagalan BIASA menampilkan pesan galat, BUKAN teks 'may have already gone through'", async () => {
    kirimSuaraMock.mockRejectedValue(Object.assign(new Error("wallet menolak"), { kode: "WALLET" }));
    render(
      <VoteModal ballot={ballotContoh} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    fireEvent.click(screen.getByText(ballotContoh.options[0]));
    fireEvent.change(screen.getByPlaceholderText(/64-character credential/), { target: { value: "c".repeat(64) } });
    fireEvent.click(screen.getByText(/Generate proof & vote/));
    await waitFor(() => expect(screen.getByText(/wallet menolak/)).toBeTruthy());
    expect(screen.queryByText(/may have already gone through/)).toBeNull();
  });

  it("kegagalan dengan mungkinSudahMasuk menampilkan peringatan JANGAN mencoba lagi", async () => {
    kirimSuaraMock.mockRejectedValue(
      Object.assign(new Error("indexer terputus"), { kode: "TIDAK_DIKENAL", mungkinSudahMasuk: { nullifierHex: "d".repeat(64) } }),
    );
    render(
      <VoteModal ballot={ballotContoh} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    fireEvent.click(screen.getByText(ballotContoh.options[0]));
    fireEvent.change(screen.getByPlaceholderText(/64-character credential/), { target: { value: "e".repeat(64) } });
    fireEvent.click(screen.getByText(/Generate proof & vote/));
    await waitFor(() => expect(screen.getByText(/may have already gone through/)).toBeTruthy());
    expect(screen.getByText(/Do not vote again/)).toBeTruthy();
  });

  it("input credential punya type=\"password\"", () => {
    render(
      <VoteModal ballot={ballotContoh} connected wallet={walletContoh()} jaringan="preview" proofStatus={null} onClose={() => {}} onVote={() => {}} />,
    );
    expect(screen.getByPlaceholderText(/64-character credential/).getAttribute("type")).toBe("password");
  });
});

describe("teksTahap", () => {
  it("setiap TahapKirimSuara punya teks BERBEDA dari default, dan null memakai default", () => {
    const tahapan: Array<import("@/lib/chain/jalur-tulis").TahapKirimSuara> = [
      "menyiapkan-artefak", "membaca-eligibility", "menyusun-witness", "membuat-proof",
      "menyeimbangkan-wallet", "mengirim", "menunggu-indexer",
    ];
    const teks = new Set(tahapan.map((t) => teksTahap(t)));
    expect(teks.size).toBe(tahapan.length); // tidak ada dua tahap dengan teks sama
    expect(teksTahap(null)).not.toBe("");
  });
});

describe("pesanPrivasiSuara — klaim kuat menyebut DUA kaki proving (Task 8, diperbarui)", () => {
  it("reach lokal DAN targetTerverifikasi: menyebut wallet TIDAK melihat pilihan", () => {
    const p = pesanPrivasiSuara(LOKAL_VERIFIED);
    expect(p.kuat).toBe(true);
    expect(p.kalimat).toMatch(/wallet only balances/i);
    expect(p.kalimat).toMatch(/never sees your selection/i);
  });
});
```

(`ballotContoh`, `LOKAL_VERIFIED` dsb SUDAH ADA di `VoteModal.test.tsx` — dipakai apa adanya, tidak didefinisikan ulang.)

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `pnpm test client/src/components/votepriv/VoteModal.test.tsx`
Expected: FAIL — prop `wallet`/`jaringan` belum ada, `teksTahap`/`unduhCadangan` belum diekspor, teks lama masih dipakai.

- [ ] **Step 3: Modifikasi `VoteModal.tsx`**

Ganti import (baris 1-17) — tambah:

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Check, Clock3, Fingerprint, LockKeyhole, ShieldCheck, Sparkles, TriangleAlert, X, Zap } from "lucide-react";
import { menerimaSuara, statusLabel } from "./ballot-status";
import { labelNomor } from "@/lib/chain/ke-ballot";
import { muatJalurTulis, type TahapKirimSuara, type CadanganOpening } from "@/lib/chain/jalur-tulis";
import type { WalletConnection } from "@/lib/midnight-wallet";
import type { MidnightNetworkId } from "@pkgs/shared/src/network-config";
import type { Ballot, Receipt } from "./types";
import type { ProofServerStatus } from "@/lib/proof-server";
```

Ganti klaim kuat di `pesanPrivasiSuara` (baris 48-53):

```tsx
  if (proofStatus.reach === "lokal" && proofStatus.targetTerverifikasi) {
    return {
      kalimat:
        "Your choice stays private. The proof is built on this device; your wallet only balances and submits the already-proven transaction — it never sees your selection.",
      kuat: true,
    };
  }
```

Tambah dua fungsi murni baru setelah `pesanPrivasiSuara` (sebelum `export function VoteModal`):

```tsx
export function teksTahap(tahap: TahapKirimSuara | null): string {
  switch (tahap) {
    case "menyiapkan-artefak": return "Checking proof artifacts…";
    case "membaca-eligibility": return "Reading your eligibility proof from the chain…";
    case "menyusun-witness": return "Preparing your private ballot on this device…";
    case "membuat-proof": return "Generating your zero-knowledge proof — this can take 5 to 20 seconds.";
    case "menyeimbangkan-wallet": return "Waiting for your wallet to balance the transaction…";
    case "mengirim": return "Submitting your sealed vote…";
    case "menunggu-indexer": return "Waiting for the network to confirm…";
    default: return "Preparing…";
  }
}

export function unduhCadangan(cadangan: CadanganOpening): void {
  const blob = new Blob([JSON.stringify(cadangan, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `votepriv-opening-${cadangan.alamatBallot.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Ganti tanda tangan `VoteModal` (baris 75-88) — tambah dua prop:

```tsx
export function VoteModal({
  ballot,
  connected,
  wallet,
  jaringan,
  proofStatus,
  onClose,
  onVote,
}: {
  ballot: Ballot;
  connected: boolean;
  wallet: WalletConnection | null;
  jaringan: MidnightNetworkId;
  proofStatus: ProofServerStatus | null;
  onClose: () => void;
  onVote: (receipt: Receipt) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [credentialHex, setCredentialHex] = useState("");
  const [stage, setStage] = useState<"select" | "proving" | "success" | "gagal">("select");
  const [tahap, setTahap] = useState<TahapKirimSuara | null>(null);
  const [cadangan, setCadangan] = useState<CadanganOpening | null>(null);
  const [galat, setGalat] = useState<{ pesan: string; mungkinSudahMasuk?: { nullifierHex: string } } | null>(null);
```

Ganti seluruh `submit` (baris 92-112):

```tsx
  const submit = async () => {
    if (!connected || !wallet) {
      toast.error("Connect your wallet first", { description: "VotePriv needs a wallet to check eligibility." });
      return;
    }
    if (!selected) {
      toast.error("Select an option", { description: "Your choice stays private after you submit." });
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(credentialHex.trim())) {
      toast.error("Enter your credential", { description: "Paste the 64-character credential you received when you registered." });
      return;
    }
    setStage("proving");
    setGalat(null);
    setCadangan(null);
    try {
      const { kirimSuara } = await muatJalurTulis();
      const hasil = await kirimSuara(
        {
          alamatBallot: ballot.id,
          credentialHex: credentialHex.trim(),
          opsi: ballot.options.indexOf(selected),
          jaringan,
          onStatus: setTahap,
          onOpeningTersimpan: setCadangan,
        },
        wallet,
      );
      setStage("success");
      onVote({ ballotId: ballot.id, proofStatus: "verified", nullifierStatus: "consumed", txRef: hasil.txId });
    } catch (e) {
      setStage("gagal");
      const mungkinSudahMasuk = (e as { mungkinSudahMasuk?: { nullifierHex: string } } | undefined)?.mungkinSudahMasuk;
      setGalat({ pesan: e instanceof Error ? e.message : String(e), mungkinSudahMasuk });
    }
  };
```

Tambah field credential ke blok "select" — SETELAH blok `choice-list` (baris 166-176), SEBELUM blok klaim privasi (baris 177-187):

```tsx
            {menerimaSuara(ballot.status) && (
              <label className="credential-field">
                <span>Your voting credential</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={credentialHex}
                  onChange={(event) => setCredentialHex(event.target.value)}
                  placeholder="64-character credential from registration"
                />
              </label>
            )}
```

Ganti blok "proving" (baris 201-210) — tambah teks bertahap dan tombol cadangan:

```tsx
        {stage === "proving" && (
          <div className="proof-state">
            <div className="proof-orbit"><Fingerprint size={32} /><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /></div>
            <p className="eyebrow mint-text">ZK proof in progress</p>
            <h2>Sealing your ballot</h2>
            <p>{teksTahap(tahap)}</p>
            <div className="progress-track"><span /></div>
            {cadangan && (
              <button className="ghost-button" onClick={() => unduhCadangan(cadangan)}>
                Download opening backup (needed if you clear this device later)
              </button>
            )}
          </div>
        )}
```

Ganti blok "success" (baris 211-213) menjadi jujur dan bergantung hasil sungguhan:

```tsx
        {stage === "success" && (
          <div className="proof-state success-state">
            <div className="success-mark"><Check size={28} /></div>
            <p className="eyebrow mint-text">Vote recorded</p>
            <h2>Your ballot is sealed on-chain.</h2>
            <p>The proof was built on this device. Your choice was never sent anywhere as plain text.</p>
            <button className="primary-button full-button" onClick={onClose}>Back to dashboard <ArrowUpRight size={15} /></button>
          </div>
        )}
        {stage === "gagal" && galat && (
          <div className="proof-state">
            <TriangleAlert size={28} />
            {galat.mungkinSudahMasuk ? (
              <>
                <p className="eyebrow">Vote not confirmed here</p>
                <h2>Your vote may have already gone through</h2>
                <p>{galat.pesan}</p>
                <p><strong>Do not vote again with this credential.</strong> The network already shows a matching nullifier — trying again will be rejected as already used.</p>
              </>
            ) : (
              <>
                <p className="eyebrow">Vote not sent</p>
                <h2>Something went wrong</h2>
                <p>{galat.pesan}</p>
              </>
            )}
            <button className="ghost-button" onClick={onClose}>Close</button>
          </div>
        )}
```

- [ ] **Step 4: Modifikasi `Home.tsx`**

Modify import (baris 15): tambah `type WalletConnection` dan `type MidnightNetworkId`:

```tsx
import { connectMidnightWallet, describeWalletError, type WalletConnection } from "@/lib/midnight-wallet";
```

Tambah state baru dekat `wallet`/`network` (baris 84-86):

```tsx
  const [walletConn, setWalletConn] = useState<WalletConnection | null>(null);
```

Di `connectWallet` (baris 163-193): tambah `setWalletConn(null)` di cabang disconnect, dan `setWalletConn(result)` setelah `setConnected(true)`:

```tsx
  const connectWallet = async () => {
    if (connected) {
      setConnected(false);
      setWallet("");
      setNetwork("");
      setWalletConn(null);
      toast.info("Wallet disconnected");
      return;
    }
    setConnecting(true);
    try {
      const result = await connectMidnightWallet(undefined, () =>
        toast.info("Menunggu wallet", {
          description: "Buka Lace dari toolbar Chrome — mungkin ada jendela persetujuan yang menunggu.",
        }),
      );
      setWallet(result.address);
      setNetwork(result.networkId);
      setWalletConn(result);
      setConnected(true);
      toast.success("Wallet connected", {
        description: `${result.connectorName} · connector v${result.apiVersion}`,
      });
    } catch (error) {
      console.error("[votepriv:wallet] connect gagal", error);
      toast.error("Could not connect wallet", { description: describeWalletError(error) });
    } finally {
      setConnecting(false);
    }
  };
```

Ganti pemanggilan `<VoteModal .../>` (baris 361-367):

```tsx
      {voteBallot && data.jaringan && (
        <VoteModal
          ballot={voteBallot}
          connected={connected}
          wallet={walletConn}
          jaringan={data.jaringan.networkId}
          proofStatus={proofStatus}
          onClose={() => setVoteBallot(null)}
          onVote={handleVote}
        />
      )}
```

(`data.jaringan` bisa `null` pada fase `memuat`/`gagal` — tapi `voteBallot` hanya pernah diset dari daftar ballot yang HANYA dirender pada fase `siap`, di mana `data.jaringan` non-null; guard `&& data.jaringan` di sini murni defensif tipe, bukan perubahan perilaku.)

- [ ] **Step 5: Jalankan uji, pastikan lolos**

Run: `pnpm test client/src/components/votepriv/VoteModal.test.tsx client/src/pages/Home.smoke.test.tsx`
Expected: PASS.

- [ ] **Step 6: Gerbang tipe + bundel**

Run: `pnpm check && pnpm check:uji && pnpm test`
Expected: bersih. `batas-bundel.test.ts` cek keempat ("permukaan publik lapis rantai tidak mengekspor satu pun operasi tulis") HARUS tetap lolos — `VoteModal.tsx` mengimpor `muatJalurTulis` dari `@/lib/chain/jalur-tulis` LANGSUNG, BUKAN dari barrel `@/lib/chain`.

**Gerbang mutasi — Tabel 1 (penjaga dari kode, `VoteModal.tsx`):**

| # | Fungsi/baris | Penjaga |
|---|---|---|
| G1 | `submit`, regex credential `/^[0-9a-fA-F]{64}$/` | menolak submit sebelum `kirimSuara` dipanggil sama sekali |
| G2 | `submit`, `catch (e)` → `mungkinSudahMasuk` dari `e` | membedakan dua jenis pesan kegagalan di render |
| G3 | render, `stage === "gagal" && galat.mungkinSudahMasuk` (ternary) | teks "may have already gone through" HANYA muncul pada kondisi itu |
| G4 | input credential, `type="password"` | tidak menampilkan credential mentah di layar |

**Gerbang mutasi — Tabel 2:**

| # | Mutasi | Uji yang WAJIB merah |
|---|---|---|
| G1 | Ganti regex jadi `/.*/ ` | "menolak submit tanpa credential yang valid, TIDAK memanggil kirimSuara" |
| G2 | Hapus pembacaan `mungkinSudahMasuk` dari `e`, selalu `undefined` | "kegagalan dengan mungkinSudahMasuk menampilkan peringatan JANGAN mencoba lagi" |
| G3 | Tukar ternary (render "may have already gone through" pada kegagalan BIASA) | "kegagalan BIASA menampilkan pesan galat, BUKAN teks 'may have already gone through'" |
| G4 | Ganti `type="password"` jadi `type="text"` | "input credential punya type=\"password\"" |

**Titik panggil nyata:** `pesanPrivasiSuara` dipanggil dari `VoteModal` pada blok klaim privasi (baris 182-187, TIDAK diubah task ini) — mutasi yang menghapus PEMANGGILAN itu (bukan isi fungsinya) sudah dijaga uji render `VoteModal.test.tsx` yang sudah ada sebelum task ini (praperiksa P8, tidak diulang di sini).

---

### Task 9: Gerbang penutup + pembersihan

**Files:**
- Modify: `client/src/lib/chain/jalur-tulis.ts` (polish docstring, tidak ada perubahan perilaku dari Task 6)
- Tidak ada berkas baru.

**Interfaces:** Tidak ada — task ini murni verifikasi + dokumentasi.

- [ ] **Step 1: Gerbang tipe penuh**

Run: `pnpm check && pnpm check:uji`
Expected: bersih, NOL galat, di SELURUH repo (bukan hanya berkas C-2b).

- [ ] **Step 2: Seluruh uji unit**

Run: `pnpm test`
Expected: SEMUA lolos — basis 26 berkas/303+1 lama TIDAK berkurang, plus uji baru: `private-state-idb.test.ts` (10), `zk-config-fetch.test.ts` (6), `eligibility-tulis.test.ts` (6), `kontrak-tulis.test.ts` (1), `providers-tulis.test.ts` (3), `adaptor-lace.test.ts` (9), `tulis.test.ts` (14), tambahan `VoteModal.test.tsx` (7). Total baru: **56 uji** di **7 berkas baru** + 1 berkas dimodifikasi.

- [ ] **Step 3: Build produksi sungguhan**

Run: `pnpm build`
Expected: exit 0. Verifikasi manual keluaran:
```bash
ls -la dist/public/.vite/manifest.json
grep -c "src/lib/chain/tulis.ts" dist/public/.vite/manifest.json
```
Expected: manifest ada, dan `src/lib/chain/tulis.ts` muncul TEPAT SEKALI sebagai kunci (entri dinamis) — bila muncul 0 kali, Rollup menggabungkannya ke chunk lain (regresi seam); bila error build menyebut "ChargedState" atau "expected instance of", itu gejala DUA instance `compact-runtime` (lihat Global Constraints soal `compact-js`'s `compact-runtime@0.15.0` vs root `0.16.0`) — perbaiki dengan memastikan `resolve.dedupe` di `vite.config.ts:357` TIDAK terhapus/berubah, BUKAN dengan menambah entri dedupe baru (menambahkan `@midnight-ntwrk/onchain-runtime-v3` ke dedupe sudah terbukti GAGAL build di C-2a Task 2 Step 10 — lihat komentar `vite.config.ts:344-350`).

- [ ] **Step 4: Gerbang bundel — jalur KELUARAN**

Run: `node scripts/ukur-batas-bundel.mjs`
Expected: `LULUS`, dengan laporan yang menyerupai bukti "sah" di `spike-c2b-build.md`:
```
=== gerbang batas bundel (atribusi per-chunk, manifest.json) ===
wasm baca terpasang (onchain-runtime-v3) : 1321366 B
wasm terjangkau dari chunk ENTRI          : assets/midnight_onchain_runtime_wasm_bg-*.wasm
js chunk terjangkau statis dari entri     : ~545000 B  ( 1 chunk )
byte chunk JS jalur tulis                 : > 0 B
byte aset .wasm yang chunk itu picu        : ~10143782 B (atau lebih, plus WASM tambahan compact-js bila ada)
catatan                                    : chunk jalur tulis ditemukan sebagai entri dinamis manifest (...), TIDAK terjangkau statis dari entri.
LULUS
```
Bila GAGAL dengan pesan "chunk ENTRI mereferensi .wasm yang bukan milik jalur baca" atau "tanda tangan paket jalur tulis ditemukan di chunk TERJANGKAU STATIS DARI ENTRI" — katanya seam BOCOR. Penyebab yang paling mungkin: sebuah `import`/`export ... from` STATIS (bukan `await import`) menyelinap ke salah satu dari sembilan berkas baru task ini, atau ke `jalur-tulis.ts`, atau ke `VoteModal.tsx`/`Home.tsx`. Cari dengan:
```bash
grep -rn "from \"@midnight-ntwrk\|from \"@pkgs/contract\|from \"@midnight-ntwrk/compact-js" client/src/lib/chain/jalur-tulis.ts client/src/components/votepriv/VoteModal.tsx client/src/pages/Home.tsx
```
Expected: NOL hasil (`tulis.ts` sendiri BOLEH, karena tidak pernah terjangkau statis dari entri — grep di atas sengaja tidak menyertakannya).

- [ ] **Step 5: Bersihkan build verifikasi**

```bash
rm -rf dist
```
(`dist/` gitignored dan tidak boleh dianggap sumber kebenaran untuk checkout berikutnya — sama seperti peringatan di `.superpowers/riset-c2b.md`.)

- [ ] **Step 6: Polish `jalur-tulis.ts`**

Modify `client/src/lib/chain/jalur-tulis.ts` — perbarui docstring (baris 1-42, ditulis ulang Task 6) untuk menghapus SISA kalimat yang menganggap `./tulis` belum ada, dan tegaskan bahwa keempat aturan (dynamic-import-only, tanpa `import type` statis, tanpa ekspor lewat barrel, keadaan memuat wajib) berlaku SELAMANYA untuk pintu ini — bukan hanya sampai C-2b selesai:

```ts
/**
 * SATU-SATUNYA pintu ke jalur TULIS: castVote, tallyVote (createBallot dan
 * finalize tetap lewat CLI — lihat Keputusan #1 rencana C-2b).
 *
 * Jalur tulis menyeret ledger-v8 (10.143.782 B) lewat paket midnight-js-*,
 * plus wallet, proof server, dan artefak ZK. ATURAN INI BERLAKU SELAMANYA,
 * bukan hanya sampai C-2b selesai — dijaga mesin oleh batas-bundel.test.ts
 * (jalur SUMBER) dan scripts/ukur-batas-bundel.mjs (jalur KELUARAN):
 *
 *   1. Modul ./tulis TIDAK BOLEH diimpor secara statis dari mana pun.
 *   2. Satu-satunya cara memuatnya adalah muatJalurTulis() di bawah.
 *   3. Tanda tangan publik berkas ini hanya memakai tipe milik ./tulis
 *      sendiri lewat `typeof import(...)` — tidak pernah `import type` dari
 *      ledger-v8/midnight-js secara statis.
 *   4. Pemanggilnya (VoteModal.tsx) HARUS menampilkan keadaan memuat.
 */
export const JALUR_TULIS_SIAP = true;

export async function muatJalurTulis(): Promise<typeof import("./tulis")> {
  return import("./tulis");
}
```

- [ ] **Step 7: Jalankan gerbang penuh sekali lagi setelah polish**

Run: `pnpm check && pnpm check:uji && pnpm test`
Expected: bersih.

- [ ] **Step 8: Verifikasi barrel tidak tersentuh**

```bash
git diff --stat client/src/lib/chain/index.ts client/src/lib/chain/index.test.ts
```
Expected: KOSONG (nol perubahan) — bila ada perubahan di sini, salah satu task menambahkan ekspor jalur tulis ke barrel, melanggar Global Constraints.

- [ ] **Step 9: Catatan tertutup — apa yang SENGAJA di luar lingkup**

Dokumentasikan (di ringkasan commit/PR, bukan di kode) tiga hal yang secara sadar TIDAK dikerjakan rencana ini, supaya tidak disalahartikan sebagai kelalaian:
1. `client/public/__manus__/` debug collector (vendor `vite-plugin-manus-runtime`, dev-only, opt-in `VOTEPRIV_DEBUG_COLLECTOR=1`) tidak memfilter field "credential"/"salt" — sudah diflag `spike-c2b-build.md` Q4, di luar lingkup C-2b karena berada di `node_modules` pihak ketiga. Mitigasi dalam lingkup: `type="password"` (Task 8) mengurangi permukaan tayang di layar, tidak menghapus risiko log dev.
2. Topologi kemasan (Docker `docker-compose.yml` dua layanan, spec §14.8 baris pertama) TIDAK dibangun — C-2b hanya membangun KEMAMPUAN teknis (browser bisa castVote/tallyVote); PAKET distribusi untuk pemilih non-teknis adalah pekerjaan terpisah.
3. Manual smoke test dengan Lace SUNGGUHAN di Brave (per Keputusan #2, "diuji di Brave") TIDAK dapat diotomasi di sesi mana pun (butuh ekstensi wallet nyata + testnet nyata + interaksi manusia untuk jendela persetujuan Lace) — WAJIB dilakukan operator sebelum mengklaim C-2b "selesai": buka aplikasi di Brave dengan Lace terpasang di preview testnet, sambungkan wallet, coblos SATU ballot uji, verifikasi txId muncul di indexer, lalu tallyVote suara yang sama.

**Gerbang mutasi:** Tidak berlaku untuk task ini — tidak ada kode baru, hanya verifikasi kode dari Task 1-8 dan satu polish docstring tanpa perubahan perilaku (Step 6 tidak mengubah `JALUR_TULIS_SIAP`/`muatJalurTulis` yang sudah ada sejak Task 6, hanya komentarnya).

---

## Self-Review

**Cakupan spec:** Sembilan task memetakan persis ke sembilan urutan mengikat di brief (private state IndexedDB → ZK fetch+HTTP → eligibility retry → enam provider+adaptor → adaptor Lace → castVote → tallyVote → UI → gerbang penutup). Lima keputusan pemilik (#1-#5) diimplementasikan eksplisit: #1 (lingkup castVote+tallyVote saja, Task 6/7 tidak menyentuh createBallot/registerVoters), #2 (Lace, adaptor di Task 5, tanpa WalletFacade headless/seed di halaman), #3 (private state IndexedDB tulisan sendiri, Task 1), #4 (root terbaru, struktural di Task 3 — retry SELALU baca ulang), #5 (submitTx branch eksplisit lewat `identifiers()`, Task 5/6, bukan asumsi). Peringatan §14.3 ditandai eksplisit di Global Constraints dan tidak diperlakukan sebagai batasan (Task 5 mendesain fallback, bukan menyerah pada klaim `void`). Keamanan: credential `type="password"` (Task 8), tidak ada `argv`/env/log yang disentuh (grep manual atas kode yang ditulis: nol `console.log` yang mencetak `credential`/`salt`/`opsi` di luar guard `import.meta.env.DEV` yang hanya mencetak NAMA metode, meniru pola `midnight-wallet.ts`), jalur pemulihan opening dijawab eksplisit (Task 7's `pulihkanOpeningDariCadangan` + Task 8's `unduhCadangan`), teks privasi jujur dua kaki (Task 8).

**Pemindaian placeholder:** Tidak ditemukan `TBD`/`TODO`/"tambahkan nanti" pada kode yang diserahkan sebagai implementasi FINAL. Dua tempat sempat menulis kode draf lalu memperbaikinya dalam task yang sama (Task 6 G5, Task 7 variabel tak terpakai) — keduanya sudah dibersihkan sehingga kode akhir yang tersisa di setiap Step Implementasi adalah versi FINAL, bukan draf.

**Konsistensi tipe lintas task:** `HasilKirimSuara` (Task 6) dipakai APA ADANYA oleh `bukaSuara` (Task 7) dan `VoteModal` (Task 8) — nama field `txId`/`nullifierHex` konsisten di ketiganya. `CadanganOpening` (Task 6) dipakai identik oleh `pulihkanOpeningDariCadangan` (Task 7) dan `unduhCadangan` (Task 8). `AdaptorWallet` (Task 4) diimplementasikan persis oleh `buatAdaptorLace` (Task 5) dan dikonsumsi lewat `KonteksProviderTulis.dompet` (Task 4's `rakitProvidersBallotBrowser`) — tidak ada penyimpangan nama metode (`getCoinPublicKey`/`getEncryptionPublicKey`/`balanceTx`/`submitTx` sama di ketiga task). `TahapKirimSuara` (Task 6) dikonsumsi identik oleh `bukaSuara` (Task 7, `onStatus?: (tahap: TahapKirimSuara) => void`) dan `teksTahap` (Task 8).

**Yang TIDAK DAPAT DIPASTIKAN dari yang terpasang, dan cabang yang dirancang untuknya (bukan tebakan):**
1. Arity dan tanda tangan persis 17 metode connector Lace (termasuk `balanceSealedTransaction`/`balanceUnsealedTransaction`/`submitTransaction`) — TIDAK ada `@midnight-ntwrk/dapp-connector-api` di pohon ini. Cabang: Task 5 mencoba `balanceSealedTransaction` lebih dulu (penalaran semantik "sealed"=terbukti), fallback ke `balanceUnsealedTransaction`, melempar galat yang menyebut KEDUA nama bila tidak ada satu pun — bukan mengasumsikan salah satu benar.
2. Apakah `submitTransaction` mengembalikan `TransactionId` atau `void` (spec §14.3 vs paket yang tidak terpasang). Cabang: Task 5/6 memakai `Transaction.identifiers()` lokal sebagai fallback yang TIDAK bergantung jawaban wallet sama sekali.
3. Apakah `pnpm build` sungguhan selamat dari potensi dua instance `compact-runtime` (0.15.0 lewat `compact-js` baru vs 0.16.0 di root) SETELAH `compact-js` benar-benar dipasang — `resolve.dedupe` yang ada SUDAH mengantisipasi ini menurut komentarnya sendiri, tapi belum pernah dibuktikan dengan `compact-js` benar-benar terpasang (baru dipasang Task 4 rencana ini). Cabang: Task 9 Step 3 menjalankan `pnpm build` sungguhan dan mendokumentasikan pesan galat spesifik ("ChargedState"/"expected instance of") yang harus dicari bila gagal, dengan larangan eksplisit menambah entri dedupe baru (sudah terbukti gagal di C-2a).
4. Apakah service worker Lace memotong fetch tingkat halaman (mempengaruhi `pastikanArtefakZkMurah`/`FetchZkConfigProvider` bila Lace aktif) — spec §14.8 sendiri menyatakan ini tidak dapat diuji dari sesi manapun tanpa Lace nyata berjalan. Cabang: tidak ada — ini murni pertanyaan untuk smoke test manual Task 9 Step 9 butir 3, bukan sesuatu yang bisa dirancang cabangnya lewat kode (kegagalan seperti apa pun yang muncul akan tampil sebagai `GalatCastVote` dengan pesan asli fetch/network, sudah tertangkap generik).
5. Bentuk PERSIS objek yang dikembalikan `api.getShieldedAddresses()`/format `coinPublicKey` yang benar-benar diterima `parseCoinPublicKeyToHex` di dalam midnight-js-contracts — diteruskan APA ADANYA dari `WalletConnection.coinPublicKey` tanpa reformat di `adaptor-lace.ts`, meniru pola CLI (`state.shielded.coinPublicKey.toHexString()` juga diteruskan mentah). Bila salah, kegagalan muncul sebagai galat parsing di dalam `ballot.callTx.castVote()`, tertangkap oleh catch generik `kirimSuara` — bukan gagal senyap.

**Execution Handoff**

Plan complete and saved to `docs/superpowers/plans/2026-09-12-votepriv-jalur-tulis-c2b.md`. Dua pilihan eksekusi:

1. **Subagent-Driven (disarankan)** — dispatch subagent segar per task, review dua-tahap di antaranya.
2. **Inline Execution** — eksekusi task demi task di sesi ini, batch dengan checkpoint.

Mana yang dipilih?

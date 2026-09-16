# VotePriv

Private voting on the [Midnight](https://midnight.network) blockchain. Voters prove
eligibility and cast a sealed choice without revealing who they are; anyone can
audit the tally.

**Status:** testnet (`preview`). Read path, write path, self-registration and a
verifiable voter package all work end to end. Not audited. Do not use for anything
that matters yet.

## What it does

- **Eligibility without identity.** Each voter holds a secret credential. Only its
  hash (`cred_leaf`) is registered on-chain, in a Merkle tree. Casting a vote proves
  membership in that tree without revealing which leaf.
- **One credential, one vote.** A per-ballot nullifier derived from the credential is
  published on cast; a second cast with the same credential is rejected by the
  contract. The nullifier cannot be reversed to the credential.
- **Two-phase tally.** `castVote` seals the choice as a commitment. `tallyVote`
  opens it later using a *different* nullifier derived from the salt, so opening
  cannot be linked to casting.
- **The organiser never holds a voter's secret.** Voters generate their credential
  in the browser and hand over only the leaf — by pasting it to the organiser, or
  automatically through the organiser's registration inbox, whose address the
  ballot declares on-chain. Registering needs no wallet; only voting does.
- **Proof server on the voter's machine.** ZK proofs are built from the credential
  and the choice. Whoever runs the proof server sees both. The voter package runs
  it locally, and the UI only claims "your choice stays private" when that is
  actually the case.

## For voters

You need Docker and the [Lace](https://www.lace.io/) wallet extension. Download one
file — `docker-compose.voter.yml` — from the
[latest release](https://github.com/mdlog/votepriv/releases/latest), then:

```
docker compose -f docker-compose.voter.yml up
```

Open <http://localhost:5300>. *Register to vote* needs no wallet; Lace (on the
`preview` network, with some tDUST) is needed only to cast the vote. If the proof
server cannot download its parameters (containers without internet access), add
the `docker-compose.zk-params.yml` overlay from the release assets. Full
instructions, including how to verify the image you are running against the CI
provenance attestation, are in [README-VOTER.md](README-VOTER.md).

## For organisers

Ballots are created and voters are registered with the CLI, which needs a funded
Midnight wallet (seed is read from a no-echo prompt — never pass it as an argument
or environment variable).

```
pnpm cli deploy-registry                              # once per network
VOTEPRIV_TANPA_PENDAFTARAN=1 pnpm cli deploy-ballot   # ballot with empty seats
pnpm cli register-leaves /abs/path/to/leaves.txt      # one leaf per line, from voters
```

Registration stays open until the ballot's vote deadline (it is closed by the
same deadline as voting, not by the first vote). `pnpm cli doctor` checks your
environment; `pnpm cli e2e` runs a three-voter end-to-end test on testnet.

### Self-service registration (registration inbox)

Instead of collecting leaves by hand, run a **registration inbox**: a small
HTTP service on the organiser's machine that receives a voter's public leaf
and registers it on-chain immediately (one `registerVoters` transaction per
batch of whatever is queued, up to 8 — it never waits for a full batch).

```
VOTEPRIV_TANPA_PENDAFTARAN=1 VOTEPRIV_INBOX_URL=https://<your-host>/register pnpm cli deploy-ballot
VOTEPRIV_INBOX_URL=http://127.0.0.1:5390 pnpm start        # the app proxies /register → inbox
pnpm cli register-inbox                                     # keep running while registration is open
```

The inbox URL is sealed into the ballot's `eligibilityPolicy` at deploy, so a
voter's app finds it **on-chain** — the voter package needs no configuration.
When a voter clicks *Register to vote*, the browser generates the credential,
sends only the leaf to that URL, then watches both the inbox status and the
ballot's eligibility tree on the indexer; it reports "registered" only once
the leaf is provably in the tree. What the inbox receives is the public leaf
and, like any web request, the sender's IP address — never the credential,
never a vote. Ballots whose policy names no inbox keep the manual flow (copy
the leaf, send it to the organiser).

### Running a judged ballot (handing out credentials ahead of time)

Judges vote whenever they get to it, often days after the ballot goes live —
there is no organiser online to run `register-leaves` for them. For that
case, flip the order: create and register the credentials *before* judging
starts, on a long schedule, then hand each one to its judge over a private
channel.

```
VOTEPRIV_ELIGIBLE_COUNT=<judges> VOTEPRIV_MENIT_VOTE=10080 VOTEPRIV_MENIT_TALLY=12960 pnpm cli deploy-ballot
pnpm cli ekspor-cadangan
```

The first command is the old `deploy-ballot` path (no
`VOTEPRIV_TANPA_PENDAFTARAN`), so it creates and registers one credential per
seat itself, with a 7-day voting window plus 2 more days before tallying
closes (`VOTEPRIV_MENIT_VOTE`/`VOTEPRIV_MENIT_TALLY` override the 120/180
minute defaults — both must be positive integers, and tally must exceed
vote). The second reads that artefact and writes one backup file per
credential to `pkgs/cli/cadangan/<ballot address>/` (gitignored, mode
`0600`). Send each file to exactly one judge over a private channel — direct
message, encrypted note, in person — **never** through this repository or a
public link: whoever holds a file could vote with it until its judge does.
Judges import their file from **Register to vote → Restore from backup
file** (see [README-VOTER.md](README-VOTER.md)).

## Pitch deck

[docs/pitch/VotePriv-pitch-deck.pdf](docs/pitch/VotePriv-pitch-deck.pdf) — ten slides: problem, design, contract circuits, dual ledger, topology, self-service registration, evidence, how to test, roadmap. Source: `docs/pitch/deck.html`.

## Architecture and Midnight integration

```
 voter's machine (Docker package or pnpm dev)                organiser's machine
 ┌──────────────────────────────────────────────┐            ┌──────────────────────────────┐
 │ browser: React app                            │            │ pnpm cli register-inbox      │
 │   read path  ── GraphQL ──► preview indexer   │  leaf only │   wallet + admin key         │
 │   write path ── midnight-js 4 ── Lace (4.0.1) │ ─────────► │   registerVoters tx          │
 │   private state: IndexedDB (credential,       │  https     │ pnpm cli deploy-*, e2e, …    │
 │     opening, Merkle paths — never leaves)     │            └──────────────┬───────────────┘
 │ proof server 8.1.0 (same network namespace,   │                           │
 │   port 6300 never published)                  │                           ▼
 └───────────────────────┬──────────────────────┘                 Midnight preview
                         └──── proven tx ──► Lace balances + submits ──► node / indexer
```

- **Contracts** (`pkgs/contract`, Compact 0.23 / compactc 0.31.1): `ballot.compact` — sealed
  metadata, `HistoricMerkleTree<10>` of credential leaves, `Set` of nullifiers, `MerkleTree<10>`
  of vote commitments, tally map; circuits `registerVoters`, `castVote`, `tallyVote`,
  `finalize`, plus `export pure` hash circuits (`cred_leaf`, `vote_nullifier`,
  `vote_commitment`, `tally_nullifier`) so the client never re-implements hashing.
  `registry.compact` — a permissionless list of ballot addresses. Deadlines are compared
  with `kernel.blockTimeLessThan/GreaterThan` in seconds.
- **Dual ledger.** Public state is what the circuits write and anyone can decode from the
  indexer (`client/src/lib/chain/dekode.ts` calls the generated `ledger()`). Private state
  is the witness side (`pkgs/contract/src/ballot-witnesses.ts`): the voter's credential,
  the `(option, salt)` opening stored by `store_opening`, and the Merkle paths the client
  builds from public state. The app keeps it in IndexedDB per ballot address; the CLI in a
  LevelDB store. A proof is the only thing that crosses from private to public.
- **Write path** (`client/src/lib/chain/tulis.ts`): `findDeployedContract` verifies the
  on-chain verifier keys against the compiled contract, `callTx.castVote()` runs witness →
  `proveTx` on the local proof server → `balanceTx` + `submitTx` through the Lace DApp
  connector (`adaptor-lace.ts`). The write path is a lazily loaded chunk so the read-only
  app stays small; a test guards that.
- **Read path**: raw GraphQL to the indexer with an explicit failure taxonomy, so "indexer
  unreachable" is never rendered as "no ballots".
- **Registration inbox** (`pkgs/cli/src/inbox.ts`): HTTP service that turns a leaf into a
  `registerVoters` transaction at once; the app confirms registration by finding the leaf in
  the eligibility tree it decodes from the indexer, not by trusting the inbox.

### How judges can test it

1. **Read only, no install:** <https://votepriv.mdloglabs.org> — Overview, Live ballots and
   Results are decoded live from the preview indexer.
2. **Register and vote (no organiser needed):** run the voter package (above), open the live
   demo ballot, click *Register to vote* — the app sends your leaf to the inbox and reports
   *Registered on-chain* once it verifies the tree — then *Connect wallet* (Lace on
   `preview`, funded with tDUST) → *Vote privately*. The vote count rises; the tally stays
   sealed until the vote deadline.
3. **Contracts and tests:** `pnpm --filter contract compact` recompiles both contracts;
   `pnpm --filter contract test` runs the simulator suite; the counts below are the full
   suite.

## Contracts on Midnight preview

| What | Address |
|---|---|
| Registry (v2 — ballots whose registration stays open until the vote deadline) | `c42681741bff50e346b9e80493b622c57883f748cc0a3af60f71545e6f8ff35a` |
| Live demo ballot (self-service registration, 16 seats) | `cf5e2e1e71a31cf5a3e06479844ecff88d75cb3f7190565209098f1b55e02e13` |
| Finalized three-voter ballot (public tally) | `c270b8d0fe4176a0a623866d6f42597a5625f3730b341fc665ef7af5df563d8d` on registry `2eda6f25dfd9693885f0469a87a8471fb72383a2d608edc7ecf5722dca0e3608` |

The app reads them through the preview indexer, `https://indexer.preview.midnight.network/api/v3/graphql`.
That is a GraphQL endpoint that answers `POST` only — opening it in a browser gives `405`. To read a
contract yourself:

```
curl -s https://indexer.preview.midnight.network/api/v3/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ contract(address:\"cf5e2e1e71a31cf5a3e06479844ecff88d75cb3f7190565209098f1b55e02e13\") { address state actions(limit: 3) { __typename transaction { hash block { height } } } } }"}'
```

`state` is the serialized contract state; `pkgs/contract`'s `ledger()` decodes it (the app does exactly
this — see `client/src/lib/chain/dekode.ts`).

## Development

Requires Node 22.23 and pnpm 10.4 (`corepack enable`), plus a local proof server:

```
docker compose -f pkgs/cli/proof-server.yml up -d   # midnightntwrk/proof-server:8.1.0
pnpm install
pnpm dev                                            # app on :3000 (proxies /proof-server)
pnpm test && pnpm --filter cli test                 # 639 + 296 tests
pnpm --filter contract test && pnpm --filter shared test   # 66 + 19 tests
pnpm check && pnpm check:uji                        # typecheck app, then test files
```

`pnpm check` does not typecheck `.test.ts` files — `check:uji` does. Run both.

`docker compose up` (the root compose, with `build:`) builds and runs the voter
package from source. `scripts/uji-paket-pemilih.sh` proves it reaches the local
proof server. `node scripts/ukur-batas-bundel.mjs` after `pnpm build` guards the
bundle: the write path (ledger WASM, ~10 MB) must stay in a lazily loaded chunk.

Configuration is documented in [`.env.example`](.env.example). Leave
`VITE_PROOF_SERVER_URL` unset unless you understand the build-vs-start trap
described in `client/src/lib/proof-server.ts`.

## Layout

```
client/            React app (Vite). lib/chain/ is the on-chain read and write path.
server/            Production server: static files, /proof-server proxy, optional /register proxy.
pkgs/contract/     Compact contracts (ballot, registry) and generated artefacts.
pkgs/shared/       Credential helpers and metadata validation shared by app and CLI.
pkgs/cli/          Organiser CLI: deploy, register leaves, registration inbox, export judge backups, e2e, doctor.
docs/              Design spec. ARCHITECTURE.md is the original frontend design; the section above is current.
```

## Honest limits

- **Anonymity is the size of the voter set.** With three voters, it is three. The
  local proof server hides the *content* of your vote from the organiser; nothing
  here hides *that* you voted from someone watching the chain.
- **Opening a vote labels the transaction with its option.** That is what tallying
  means. The protection is that the transaction cannot be attributed to a person —
  on-chain. Off-chain metadata (timing, IP) is not covered.
- **The credential backup file is the vote, in the clear.** Anyone holding it can
  vote as you, and losing both browser storage and the backup loses the vote.
- **Ballot metadata already sealed on old testnet ballots is immutable**, including
  text from before the UI language was fixed.

Conventions: prose and code comments are in Indonesian; user-facing text is
English. Commit messages carry no AI attribution trailers (enforced by
`.githooks/commit-msg` and CI).

## License

Apache License 2.0 — see [LICENSE](LICENSE). The Compact contracts in `pkgs/contract` and everything needed to evaluate them are covered by it, as the Midnight Buildathon rules require.

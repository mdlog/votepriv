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
  in the browser and hand over only the leaf. The organiser registers leaves.
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

Open <http://localhost:5300>. Full instructions, including how to verify the image
you are running against the CI provenance attestation, are in
[README-VOTER.md](README-VOTER.md).

## For organisers

Ballots are created and voters are registered with the CLI, which needs a funded
Midnight wallet (seed is read from a no-echo prompt — never pass it as an argument
or environment variable).

```
pnpm cli deploy-registry                              # once per network
VOTEPRIV_TANPA_PENDAFTARAN=1 pnpm cli deploy-ballot   # ballot with empty seats
pnpm cli register-leaves /abs/path/to/leaves.txt      # one leaf per line, from voters
```

Registration closes permanently at the first cast vote. `pnpm cli doctor` checks
your environment; `pnpm cli e2e` runs a three-voter end-to-end test on testnet.

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

## Development

Requires Node 22.23 and pnpm 10.4 (`corepack enable`), plus a local proof server:

```
docker compose -f pkgs/cli/proof-server.yml up -d   # midnightntwrk/proof-server:8.1.0
pnpm install
pnpm dev                                            # app on :3000 (proxies /proof-server)
pnpm test && pnpm --filter cli test                 # 614 + 274 tests
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
server/            Production server: static files + /proof-server proxy.
pkgs/contract/     Compact contracts (ballot, registry) and generated artefacts.
pkgs/shared/       Credential helpers and metadata validation shared by app and CLI.
pkgs/cli/          Organiser CLI: deploy, register leaves, export judge backups, e2e, doctor.
docs/              Design spec. ARCHITECTURE.md predates the on-chain integration.
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

MIT — see [LICENSE](LICENSE).

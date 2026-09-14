# Voting with VotePriv, on your own device

This package runs the two things that build your vote's zero-knowledge proof
— the app and the proof server — on your own computer, in Docker. Nobody
else's machine ever sees your ballot choice or your voting credential.

## Before you start

- **Docker Desktop** (or Docker Engine + the Compose plugin) installed and
  running.
- **A browser with the [Lace](https://www.lace.io/) wallet extension**
  installed. You'll use it to sign your registration and your vote.
- The GitHub release page link your ballot organizer gave you.

You do **not** need Node.js, pnpm, git, or a clone of the source repository.
You need exactly one downloaded file — `docker-compose.voter.yml` — and
Docker. Docker only ever **downloads** the app and proof server images this
file points to; nothing is built on your machine, and nothing you didn't
already have installed gets fetched from anywhere except those two images.

## Run it

1. Open the release page your organizer linked you to, and download
   `docker-compose.voter.yml` from its **Assets**.
2. Open a terminal in the folder where you saved it, and run:

   ```
   docker compose -f docker-compose.voter.yml up
   ```

   The first run downloads the app image and the proof server image by
   their exact digest, so it can take a few minutes. (See "How to verify
   what you are running" below if you want to check what those digests mean
   before this step.) Leave the terminal window open — this is your local
   voting server, and closing it (or pressing Ctrl+C) shuts it down.
3. Once it settles, open your browser to:

   ```
   http://localhost:5300
   ```

4. Connect your Lace wallet, find your ballot, and vote as usual.

When you're done for the session, stop everything with
`docker compose -f docker-compose.voter.yml down` (or Ctrl+C, then that same
command, to remove the containers cleanly).

## If your organiser sent you a credential file

Some ballots — judging rounds, for example, where the organiser cannot count
on being online whenever a judge decides to vote — are set up with
credentials the organiser generates and registers ahead of time, one per
judge. If that's how you were invited, you'll have received a small `.json`
file (named something like `votepriv-credential-<8 characters>.json`) instead
of being asked to register from scratch. To use it:

1. Open the ballot and click **Register to vote**.
2. In the panel at the bottom of that dialog, click **Restore from backup
   file** and choose the `.json` file you were sent.
3. Your leaf and voting screen appear exactly as if you had registered
   yourself — go ahead and vote.

Because the organiser generated this file rather than you, they could
technically have cast a vote with it themselves before it ever reached you —
that is exactly why it has to reach you over a private channel (a direct
message, an encrypted note, in person), and never by posting it in the
repository or any public link. Once you vote with it, the credential is
spent: from that point on, no one — not even the organiser — can use it
again.

## What you'll see, and why it's true here

In the sidebar you'll see a privacy indicator that says **"Always on."** When
you open the vote modal, it will say:

> Your choice stays private. The proof is built on this device; your wallet
> only balances and submits the already-proven transaction — it never sees
> your selection.

This is the app's *strongest* privacy claim, and it only ever appears when
the app can verify that the proof server it's actually talking to is running
on the same machine as the page you're looking at — never on a shared server
run by the organizer or anyone else. Running this package with
`docker compose -f docker-compose.voter.yml up` is what makes that condition
true. If you ever access
VotePriv a different way (e.g. a link someone else hosts for you), that
indicator will honestly say less, because the guarantee no longer holds.

## How to verify what you are running

The `image:` lines in `docker-compose.voter.yml` don't name a movable tag —
they pin each image by **digest** (the `...@sha256:...` part). A tag can be
quietly repointed at a different image at any time; a digest can't, because
it *is* a hash of the image's content. The app's digest is produced by a
GitHub Actions workflow in the source repo
(`.github/workflows/rilis-image.yml`) that builds the image from a tagged
commit and pushes it — with a provenance attestation — before any release is
published; the check below never happens on someone's laptop.

Two checks, both worth doing before you vote:

1. **The digest matches the release.** On the same GitHub release page you
   downloaded the file from, the release notes list the app image's digest
   and the commit SHA it was built from. Open `docker-compose.voter.yml` in
   a text editor and confirm the digest after `ghcr.io/.../votepriv-voter-app@sha256:`
   is identical to the one in the release notes. If it isn't, this file
   didn't come from that release — stop and ask your organizer.
2. **The attestation points at that commit.** With Docker installed, run:

   ```
   docker buildx imagetools inspect <the image: value from the app service>
   ```

   This queries the registry for the attestations attached when the image
   was built, including a provenance record of the source repository and
   commit SHA the build ran from. That commit SHA should match the one in
   the release notes — and from there, it's a normal commit in a normal git
   history you can read.

**What this does and doesn't prove.** This verifies that the image you're
about to run was built by the project's CI from a specific, publicly
readable commit — not assembled on somebody's laptop, and not swapped for
something else after the fact. It does **not** prove that commit is free of
bugs, or that the app behaves exactly as this README describes. Closing that
gap means reading the source at that commit (or trusting someone who did) —
this check only gets you from "an image" to "a specific commit," not from
"a commit" to "correct."

## The honest limits — read this before you rely on it

Running the proof server locally closes one specific leak: **nobody
operating a remote prover gets to see your credential or your choice while
your proof is being built.** It does not do everything "private" might
suggest:

- **It does not make you more anonymous.** Anonymity comes from the crowd of
  voters, not from where the proof server runs. Your vote is as anonymous as
  the number of other votes that have been opened around the same time as
  yours — running this package locally doesn't enlarge that crowd.
- **Opening your vote is public, by design.** When a ballot is opened for
  tallying, your choice is revealed and publicly attached to that
  transaction on-chain so anyone can verify the count. There is no
  configuration of this package that keeps an opened vote secret — that is
  not what it protects.
- **Your credential backup file *is* your ballot in the clear.** The backup
  file this app offers you (your registration credential, and later your
  vote's option and salt) is what lets you recover your vote if you clear
  your browser. Anyone who obtains that file can read exactly how you voted.
  Treat it like a ballot with your name already on it — store it somewhere
  only you control, and never send it to anyone, including the organizer.

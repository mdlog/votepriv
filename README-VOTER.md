# Voting with VotePriv, on your own device

This package runs the two things that build your vote's zero-knowledge proof
— the app and the proof server — on your own computer, in Docker. Nobody
else's machine ever sees your ballot choice or your voting credential.

## Before you start

- **Docker Desktop** (or Docker Engine + the Compose plugin) installed and
  running.
- **A browser with the [Lace](https://www.lace.io/) wallet extension**
  installed. You'll use it to sign your registration and your vote.
- The link or files your ballot organizer gave you (this project folder).

You do **not** need Node.js, pnpm, or anything else installed — Docker builds
everything for you.

## Run it

Open a terminal in this folder and run:

```
docker compose up
```

The first run builds the app image and downloads the proof server image, so
it can take a few minutes. Leave the terminal window open — this is your
local voting server, and closing it (or pressing Ctrl+C) shuts it down.

Once it settles, open your browser to:

```
http://localhost:5300
```

Connect your Lace wallet, find your ballot, and vote as usual.

When you're done for the session, stop everything with `docker compose down`
(or Ctrl+C, then `docker compose down` to remove the containers cleanly).

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
`docker compose up` is what makes that condition true. If you ever access
VotePriv a different way (e.g. a link someone else hosts for you), that
indicator will honestly say less, because the guarantee no longer holds.

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

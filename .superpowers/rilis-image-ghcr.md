# Jalur rilis image VotePriv ke GHCR (dapat diverifikasi lewat digest) — laporan

HEAD saat mulai dikerjakan: `53b9f8a9321cd577214aa0f6b13a4d31bda3f58f`. Repo ini **belum punya remote** — semua yang di bawah diverifikasi lokal; workflow GitHub Actions itu sendiri belum pernah benar-benar dijalankan oleh GitHub (lihat bagian "Yang TIDAK diuji" di akhir).

Berkas yang dihasilkan/diubah (tidak ada satu pun berkas di `pkgs/`, `server/`, `client/src/`, `docs/`, atau `vite.config.ts` yang disentuh; `docker-compose.yml` juga sama sekali tidak disentuh):

- `.github/workflows/rilis-image.yml` (baru)
- `docker-compose.voter.yml` (baru)
- `README-VOTER.md` (diperbarui)
- `scripts/uji-paket-pemilih.sh` (diperbarui — tambah dukungan `VOTEPRIV_IMAGE`)
- `Dockerfile` (satu penambahan: `ARG`/`LABEL` provenance OCI di stage `runtime`, sesuai pengecualian yang diizinkan)
- `.superpowers/rilis-image-ghcr.md` (berkas ini)

## 1. SHA action yang dipatok

Diambil lewat GitHub REST API `GET /repos/{owner}/{repo}/commits/{tag}` (resolusi tag → commit SHA sungguhan, bukan ditebak dari ingatan):

| Action | Tag manusiawi | SHA commit dipatok |
|---|---|---|
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `docker/setup-buildx-action` | v4.3.0 | `37fe631027851001ddb9b187196cc803df7f5f0e` |
| `docker/login-action` | v4.6.0 | `dbcb813823bdd20940b903addbd779551569679f` |
| `docker/build-push-action` | v7.3.0 | `53b7df96c91f9c12dcc8a07bcb9ccacbed38856a` |

Tidak dipakai action pihak ketiga untuk membuat/memperbarui rilis GitHub — dipakai `gh` CLI (sudah terpasang di runner `ubuntu-latest`, diautentikasi lewat `GH_TOKEN=$GITHUB_TOKEN`) untuk `gh release view/create/edit/upload`, supaya permukaan supply-chain (jumlah action pihak ketiga yang perlu dipatok/dipercaya) tetap sekecil mungkin.

Dikonfirmasi lewat dokumentasi resmi (WebFetch `raw.githubusercontent.com/docker/build-push-action/master/README.md`) bahwa `docker/build-push-action` benar-benar mengeluarkan output `digest` ("Image digest"), dan `provenance`/`sbom` adalah input `Bool/String` yang valid — bukan diasumsikan dari ingatan.

## 2. Validasi YAML

**actionlint v1.7.12** (diunduh lewat skrip resmi `download-actionlint.bash` ke scratchpad, bukan dari cache ingatan) + **shellcheck v0.11.0** (diunduh statis dari rilis resmi `koalaman/shellcheck`, supaya blok `run:` juga diperiksa, bukan hanya skema YAML):

```
$ actionlint -verbose .github/workflows/rilis-image.yml
verbose: Linting .github/workflows/rilis-image.yml
verbose: Found 0 parse errors in 0 ms for .github/workflows/rilis-image.yml
verbose: Found total 0 errors in 25 ms for .github/workflows/rilis-image.yml
```

Exit code: `0`. Ini SETELAH satu putaran perbaikan: percobaan pertama memakai heredoc (`cat > file <<NOTES_EOF ... NOTES_EOF`) untuk merakit catatan rilis, dengan badan dan baris penutup heredoc ikut diindentasi mengikuti blok YAML `run: |` di sekitarnya — bug nyata, bukan gaya: heredoc tanpa `<<-` mengharuskan baris penutup TANPA spasi di depan, yang justru akan membuat YAML menganggap baris itu men-dedent KELUAR dari blok literal `run: |` (merusak struktur berkas). Diperbaiki dengan merakit catatan rilis lewat `printf` baris-demi-baris (tidak ada heredoc sama sekali) — tidak sensitif indentasi. actionlint (dengan shellcheck aktif) sempat melaporkan 3 info `SC2016` (false positive: backtick literal untuk format inline-code Markdown di dalam string bertanda kutip tunggal, bukan percobaan command substitution) — diredam eksplisit dengan komentar `# shellcheck disable=SC2016` + penjelasan, bukan diubah kontennya. Hasil akhir: 0 galat.

**pyyaml 6.0.1** (`python3 -c "import yaml; yaml.safe_load(...)"`) sebagai pemeriksaan kedua yang independen dari parser actionlint sendiri — valid untuk `.github/workflows/rilis-image.yml` (9 steps terbaca benar) maupun `docker-compose.voter.yml` (2 services, image/network_mode/ports terbaca sesuai rancangan).

`bash -n scripts/uji-paket-pemilih.sh` → sintaks valid. `shellcheck` atas skrip itu melaporkan 2 hal, KEDUANYA pra-ada (bukan dari perubahan `VOTEPRIV_IMAGE`, hanya bergeser nomor baris): SC2164 (saran `cd ... || exit`, di baris `cd "$(dirname ...)/.."` — sudah ada sebelum tugas ini) dan SC2329 info (`cleanup` "tidak pernah dipanggil" — false positive, dipanggil lewat `trap cleanup EXIT` persis di baris berikutnya, pola yang sudah ada sebelum tugas ini juga). Tidak diubah karena di luar cakupan perubahan yang diminta (skrip disesuaikan untuk `VOTEPRIV_IMAGE`, bukan direfaktor).

## 3. Keluaran `scripts/uji-paket-pemilih.sh` — mode bawaan (regresi: harus tetap identik)

```
$ ./scripts/uji-paket-pemilih.sh
=== 1. docker compose up -d --wait (naikkan proof-server + app, tunggu keduanya healthy) ===
NAME                      IMAGE                              COMMAND                  SERVICE        CREATED          STATUS                    PORTS
votepriv-app-1            votepriv-voter-app:local           "docker-entrypoint.s…"   app            16 seconds ago   Up 5 seconds (healthy)
votepriv-proof-server-1   midnightntwrk/proof-server:8.1.0   "/nix/store/d24gb0hj…"   proof-server   16 seconds ago   Up 16 seconds (healthy)   6300/tcp, 0.0.0.0:5300->3000/tcp, [::]:5300->3000/tcp

=== 2. GET /__votepriv/runtime-config.json ===
{"proofServerTarget":"http://127.0.0.1:6300"}
OK: proofServerTarget menunjuk proof server compose ini lewat loopback bersama (network_mode: service:proof-server).

=== 3. GET /proof-server/version (lewat proxy app -> proof-server) ===
badan jawaban: 8.1.0
OK: versi proof server = 8.1.0

=== 4. GET /zk/ballot/keys/castVote.verifier ===
status HTTP : 200
OK: status 200 dan badan bukan HTML.

=== 5. proofServerReach() ASLI dari client/src/lib/proof-server.ts, dijalankan lewat node ===
{
  "target": "http://127.0.0.1:6300",
  "terverifikasi": true,
  "reach": "lokal",
  "hop": "browser → http://127.0.0.1:6300"
}
OK: reach === "lokal" dan terverifikasi === true — kalimat "stays private" akan tampil ke pemilih.

=== Ringkasan ===
SEMUA PEMERIKSAAN LULUS.
```

Exit code: `0`. Identik dengan transkrip di `.superpowers/paket-pemilih.md` sebelum perubahan ini (proof-server via `docker-compose.yml`, image `votepriv-voter-app:local` dibangun lewat `build:`) — membuktikan penambahan `VOTEPRIV_IMAGE` **tidak mengubah** pemakaian lokal yang sudah ada.

## 4. Keluaran `scripts/uji-paket-pemilih.sh` — `VOTEPRIV_IMAGE=votepriv-voter-app:local` (bukti jalur "pull by reference", tanpa `build:`)

```
$ VOTEPRIV_IMAGE=votepriv-voter-app:local ./scripts/uji-paket-pemilih.sh
=== 0. VOTEPRIV_IMAGE=votepriv-voter-app:local — pakai docker-compose.voter.yml (tanpa build:), ganti image "app" ===
Berkas compose sementara (dipakai, bukan docker-compose.yml): /tmp/tmp.gTkNrE9PYH.yml

=== 1. docker compose up -d --wait (naikkan proof-server + app, tunggu keduanya healthy) ===
NAME                 IMAGE                                                                                                COMMAND                  SERVICE        CREATED          STATUS                    PORTS
tmp-app-1            votepriv-voter-app:local                                                                             "docker-entrypoint.s…"   app            16 seconds ago   Up 5 seconds (healthy)
tmp-proof-server-1   midnightntwrk/proof-server@sha256:801bbc0340e9e96f16735f77b523f23c7459e3359842f7c79c2c53f4e994d531   "/nix/store/d24gb0hj…"   proof-server   16 seconds ago   Up 16 seconds (healthy)   6300/tcp, 0.0.0.0:5300->3000/tcp, [::]:5300->3000/tcp

=== 2. GET /__votepriv/runtime-config.json ===
{"proofServerTarget":"http://127.0.0.1:6300"}
OK: proofServerTarget menunjuk proof server compose ini lewat loopback bersama (network_mode: service:proof-server).

=== 3. GET /proof-server/version (lewat proxy app -> proof-server) ===
badan jawaban: 8.1.0
OK: versi proof server = 8.1.0

=== 4. GET /zk/ballot/keys/castVote.verifier ===
status HTTP : 200
OK: status 200 dan badan bukan HTML.

=== 5. proofServerReach() ASLI dari client/src/lib/proof-server.ts, dijalankan lewat node ===
{
  "target": "http://127.0.0.1:6300",
  "terverifikasi": true,
  "reach": "lokal",
  "hop": "browser → http://127.0.0.1:6300"
}
OK: reach === "lokal" dan terverifikasi === true — kalimat "stays private" akan tampil ke pemilih.

=== Ringkasan ===
SEMUA PEMERIKSAAN LULUS.
```

Exit code: `0`. `docker-compose.voter.yml` (dipakai lewat berkas sementara hasil `sed`, sesuai desain di skrip) **tidak punya `build:` sama sekali** untuk kedua service (dibuktikan juga lewat `docker compose -f docker-compose.voter.yml config` di §5) — Compose secara struktural TIDAK BISA membangun layanan `app` di sini. Kontainer `tmp-app-1` berjalan sehat memakai tag `votepriv-voter-app:local` yang sudah ada, murni lewat referensi `image:`. Ini persis jalur yang akan dipakai CI (`VOTEPRIV_IMAGE=ghcr.io/OWNER/votepriv-voter-app@sha256:...`, ditarik dari registry) dan yang akan dipakai pemilih sungguhan — hanya sumber image-nya (tag lokal vs digest registry) yang beda, mekanismenya identik.

Nama project Compose berubah jadi `tmp` (bukan `votepriv`) karena `mktemp` menaruh berkas sementara langsung di `/tmp` dan Compose menurunkan nama project dari direktori berkas `-f` — tidak masalah, `cleanup()` di skrip memakai `COMPOSE_ARGS` yang sama persis untuk `down`, terbukti bersih (lihat §6).

## 5. `docker compose -f docker-compose.voter.yml config` (dengan placeholder OWNER/DIGEST)

Valid — tidak ada galat. Ringkasan: `app.image: ghcr.io/OWNER/votepriv-voter-app@sha256:DIGEST` (placeholder, string biasa bagi Compose — tidak divalidasi sebagai digest sungguhan pada tahap `config`), `app.network_mode: service:proof-server`, `proof-server.image: midnightntwrk/proof-server@sha256:801bbc...` (digest sungguhan), `proof-server.ports: 5300:3000`. Tidak ada `build:` di service mana pun.

## 6. Digest proof-server yang dipakai

```
$ docker inspect --format '{{index .RepoDigests 0}}' midnightntwrk/proof-server:8.1.0
midnightntwrk/proof-server@sha256:801bbc0340e9e96f16735f77b523f23c7459e3359842f7c79c2c53f4e994d531
```

Ini digest yang SUNGGUHAN tertarik ke mesin ini untuk tag `8.1.0` (bukan ditulis manual) — dipakai apa adanya di `docker-compose.voter.yml`.

## 7. Label provenance OCI (Dockerfile)

`ARG VOTEPRIV_GIT_SOURCE=""` / `ARG VOTEPRIV_GIT_REVISION=""` + `LABEL org.opencontainers.image.source`/`.revision` ditambahkan di stage `runtime`. Diverifikasi dua kali:

```
$ docker build -t votepriv-voter-app:local .                     # TANPA build-arg (path lokal/CI lama)
$ docker inspect --format '{{json .Config.Labels}}' votepriv-voter-app:local
{"org.opencontainers.image.revision":"","org.opencontainers.image.source":""}
# ukuran tetap 225MB — LABEL kosong tidak menggembungkan image, path lokal tidak berubah.

$ docker build --build-arg VOTEPRIV_GIT_SOURCE="https://github.com/OWNER/votepriv" \
               --build-arg VOTEPRIV_GIT_REVISION="$(git rev-parse HEAD)" \
               -t votepriv-voter-app:label-check .
$ docker inspect --format '{{json .Config.Labels}}' votepriv-voter-app:label-check
{"org.opencontainers.image.revision":"53b9f8a9321cd577214aa0f6b13a4d31bda3f58f","org.opencontainers.image.source":"https://github.com/OWNER/votepriv"}
# tag sementara ini dihapus lagi setelah dicek (docker rmi).
```

## 8. `pnpm test` / `pnpm check` / `pnpm check:uji`

```
pnpm test        → Test Files  40 passed | 2 skipped (42); Tests  612 passed | 2 skipped (614)
pnpm check       → tsc --noEmit: bersih, exit 0
pnpm check:uji   → tsc -p tsconfig.uji.json --noEmit: bersih, exit 0
```

Identik dengan baseline yang dinyatakan di awal tugas.

## 9. Beres-beres dan batas yang dijaga

- `docker ps` sebelum dan sesudah seluruh pekerjaan: IDENTIK (5 kontainer tak berkaitan yang sudah berjalan sebelumnya — termasuk `midnight-proof-server` host di 6300 — tidak disentuh). `docker network ls` bersih untuk `votepriv*`/`tmp_default` setelah kedua uji.
- Port 5180 (tunnel produksi): `curl http://localhost:5180/` → `HTTP 200` sebelum DAN sesudah, dengan PID proses Node yang sama (`2383594`) — tidak pernah direstart/disentuh.
- Tidak ada `pnpm cli` dijalankan, tidak ada seed diminta, tidak ada berkas di `pkgs/cli/wallet-cache/`, `private-state/`, `artefak/`, atau `~/.config/google-chrome/` dibaca.
- Tag Docker sementara (`votepriv-voter-app:label-check`) dihapus setelah dipakai untuk verifikasi label.

## 10. Yang TIDAK bisa diuji di sini, dan langkah pemilik setelah push

Workflow `.github/workflows/rilis-image.yml` **belum pernah benar-benar dijalankan oleh GitHub** — repo ini tidak punya remote. Yang TIDAK diuji:

- Bahwa `docker/build-push-action@...` benar-benar menghasilkan output `digest` di lingkungan GitHub Actions sungguhan (dikonfirmasi lewat dokumentasi resmi action, bukan lewat eksekusi nyata).
- Bahwa `gh release create/edit/upload` berjalan seperti dirancang dengan token `GITHUB_TOKEN` sungguhan dan permission `contents: write` di repo nyata.
- Bahwa attestation provenance yang dilampirkan buildx benar-benar memuat `vcs.source`/`vcs.revision` yang cocok saat diperiksa lewat `docker buildx imagetools inspect --format '{{ json .Provenance.SLSA }}'` terhadap image yang BENAR-BENAR didorong ke GHCR (perilaku ini dikonfirmasi lewat dokumentasi resmi Docker — "Source repository and revision" termasuk dalam metadata provenance BAHKAN di mode `min` bawaan — tapi belum diverifikasi langsung terhadap image nyata karena belum ada rilis).
- Visibilitas package GHCR: package yang pertama kali dipublikasikan ke GHCR **defaultnya PRIVATE** — ini TIDAK otomatis teruji di sini.

**Langkah pemilik setelah push** (urutan disarankan):

1. Buat repo GitHub, tambahkan sebagai remote, push branch `feat/fondasi-kontrak` (atau merge ke `main` sesuai alur kerja pemilik) berikut commit dari tugas ini.
2. Buat tag `v0.1.0` (`git tag v0.1.0 && git push origin v0.1.0`) — ini memicu `rilis-image.yml`.
3. Pantau run Actions "rilis-image": pastikan step "Build dan push image" sukses dan step "Uji paket pemilih terhadap image yang baru didorong" LULUS (`reach: "lokal"`) — bila gagal, TIDAK ADA rilis dibuat (by design), periksa log step tersebut.
4. **Penting, sering terlewat:** setelah push pertama berhasil, buka Settings package `votepriv-voter-app` di GHCR (lewat halaman profil/organisasi → Packages) dan **ubah visibilitas ke Public** (dan hubungkan ke repo bila belum otomatis tertaut) — package GHCR baru defaultnya PRIVATE, dan pemilih (tanpa `docker login`) tidak akan bisa `docker pull`/`docker compose up` sampai ini diubah. Perubahan ke Public tidak bisa dibalik.
5. Buka halaman rilis `v0.1.0` di GitHub: cocokkan digest di catatan rilis dengan digest di dalam `image:` aset `docker-compose.voter.yml` yang diunggah.
6. Jalankan `docker buildx imagetools inspect ghcr.io/<owner-sungguhan>/votepriv-voter-app@sha256:<digest-sungguhan>` (opsional tambahkan `--format '{{ json .Provenance.SLSA }}'`) dan konfirmasi field `vcs.source`/`vcs.revision` menunjuk ke repo dan commit SHA yang benar.
7. Ganti semua kemunculan placeholder `OWNER` di `docker-compose.voter.yml` HANYA bila pemilik ingin menguji manual sebelum rilis CI pertama ada — jalur normal (tag → Actions → aset rilis) mengisi ini otomatis, tidak perlu diedit manual.

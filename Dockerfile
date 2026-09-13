# syntax=docker/dockerfile:1
#
# Dockerfile multi-stage untuk paket distribusi pemilih VotePriv.
#
# Dua stage: `builder` memasang dependensi LENGKAP (termasuk devDependencies:
# vite, esbuild, typescript, dst — dibutuhkan untuk mem-build) dan menjalankan
# `pnpm build`. `runtime` hanya membawa hasil build (dist/) dan SATU dependensi
# produksi (express) — lihat komentar panjang di stage runtime untuk alasannya.
# Stage builder dibuang sepenuhnya di image akhir; ia tidak pernah ikut ke
# image yang didistribusikan ke pemilih.
#
# Versi Node dipatok persis ke v22.23.1 (versi yang dipakai mengembangkan dan
# menguji paket ini) supaya build/berjalan tidak diam-diam bergeser saat image
# dibangun ulang di kemudian hari.

# =============================================================================
# Stage "builder"
# =============================================================================
FROM node:22.23.1-slim AS builder
WORKDIR /app

# corepack dibundel Node 22. WAJIB dipakai (bukan `npm i -g pnpm`) karena
# field "packageManager" di package.json memuat hash integritas SHA-512 —
# corepack membaca dan memverifikasinya, memastikan versi pnpm yang benar-benar
# jalan di sini sama persis dengan yang dipakai mengembangkan paket ini.
RUN corepack enable

# Konteks build sudah disaring .dockerignore di akar repo: seluruh isi
# .gitignore (termasuk node_modules/, dist/, pkgs/cli/wallet-cache/,
# pkgs/cli/private-state/, pkgs/cli/artefak/) plus .git/, .superpowers/, docs/
# TIDAK PERNAH sampai ke `COPY . .` di bawah. Lihat .dockerignore dan
# .superpowers/paket-pemilih.md untuk pembuktiannya (docker run + find kosong).
COPY . .

# --frozen-lockfile: gagal keras bila pnpm-lock.yaml tidak sinkron dengan
# package.json manapun di workspace (root, pkgs/cli, pkgs/contract,
# pkgs/shared), alih-alih diam-diam menulis ulang lockfile di dalam image.
RUN pnpm install --frozen-lockfile

# NODE_ENV=production WAJIB terpasang SEBELUM `pnpm build` (bukan hanya saat
# `node dist/index.js` nanti). Alasannya ada di vite.config.ts baris ~429-458:
# `modePengembangan = process.env.NODE_ENV !== "production"` dihitung SAAT
# config Vite dimuat, dan hanya pada production mode dua perkakas debug Manus
# dikeluarkan dari plugin list — vitePluginManusRuntime() (skrip inline 366 KB
# yang disisipkan ke index.html) dan vitePluginManusDebugCollector() (merekam
# teks yang diklik/diketik pemilih). `vite build` biasanya menyetel NODE_ENV
# ini sendiri, tapi dieksplisitkan di sini supaya build TIDAK PERNAH diam-diam
# bergantung pada perilaku bawaan itu — lihat verifikasi #3 di laporan.
#
# VITE_PROOF_SERVER_URL SENGAJA TIDAK diisi di sini. Ini keputusan jaringan
# inti paket ini: lihat docker-compose.yml (network_mode: "service:proof-server")
# dan .superpowers/paket-pemilih.md untuk penjelasan lengkap jebakan
# build-vs-start.
ENV NODE_ENV=production
# Paket workspace `contract` dan `shared` mendeklarasikan main -> dist/index.js,
# yaitu HASIL BUILD (tsc) yang gitignored. client/ dan pkgs/shared mengimpornya
# sebagai paket ("contract", "shared"), jadi keduanya HARUS dibangun sebelum
# `pnpm build` akar — kalau tidak Vite gagal: `Failed to resolve entry for
# package "contract"`. Ini persis yang menjatuhkan rilis v0.1.0 di CI: di mesin
# pengembang pkgs/*/dist kebetulan sudah ada (dan .dockerignore lama tidak
# mengecualikannya), sehingga build lokal sukses dan cacatnya tersembunyi.
# Urutan penting: contract dulu (shared mengimpornya).
# Keduanya murni tsc — artefak compactc di src/managed sudah tracked git.
RUN pnpm --filter contract build && pnpm --filter shared build
RUN pnpm build

# =============================================================================
# Stage "runtime"
# =============================================================================
#
# TIDAK mewarisi node_modules dari stage builder. node_modules di sana adalah
# hasil install workspace pnpm LENGKAP — React, seluruh @radix-ui/*, dan semua
# SDK @midnight-ntwrk/* yang dipakai pkgs/cli — karena dibutuhkan untuk
# mem-build client (Vite) dan tersedia untuk paket workspace lain. Server
# produksi (server/index.ts, dibundel esbuild --packages=external) hanya
# pernah mengimpor SATU paket lewat node_modules: "express". ("http", "https",
# "path", "url" adalah modul bawaan Node, bukan dependensi.) Menyalin seluruh
# node_modules workspace ke image runtime akan membawa ratusan paket yang
# tidak pernah dieksekusi oleh proses ini — sebaliknya, di sini express
# dipasang sendiri, terisolasi dari workspace pnpm, dipatok PERSIS ke versi
# yang sudah diuji di pnpm-lock.yaml (express@4.21.2), lewat npm biasa supaya
# stage ini tidak perlu tahu apa pun soal pnpm/workspace/corepack.
#
# Base image alpine (bukan slim seperti stage builder): express dan seluruh
# dependensinya JS murni, tidak ada binding native, jadi tidak ada risiko
# ketidakcocokan musl vs glibc di sini — beda dengan stage builder yang
# memasang paket-paket dengan binari native (lightningcss, @tailwindcss/oxide,
# dll) yang lebih aman dibangun di atas Debian slim.
FROM node:22.23.1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Label provenance OCI standar — diisi lewat build-arg dari
# .github/workflows/rilis-image.yml (VOTEPRIV_GIT_SOURCE/VOTEPRIV_GIT_REVISION),
# supaya `docker inspect`/`docker buildx imagetools inspect` bisa menunjukkan
# repo dan commit sumber image ini dibangun — lihat README-VOTER.md bagian
# "How to verify what you are running". Default string kosong SENGAJA
# dibiarkan (bukan ARG wajib) supaya `docker build .` / `docker compose up
# --build` lokal, tanpa build-arg ini sama sekali, tetap berjalan persis
# seperti sebelumnya — LABEL dengan nilai kosong tidak mengganggu apa pun.
ARG VOTEPRIV_GIT_SOURCE=""
ARG VOTEPRIV_GIT_REVISION=""
LABEL org.opencontainers.image.source="${VOTEPRIV_GIT_SOURCE}"
LABEL org.opencontainers.image.revision="${VOTEPRIV_GIT_REVISION}"

# package.json minimal, dibuat di tempat — bukan disalin dari repo — supaya
# stage ini punya tepat satu dependensi produksi dan tidak menyeret "type":
# "module" dkk dari package.json workspace yang jauh lebih besar. Versi
# express dipatok ke resolusi persis pnpm-lock.yaml (baris "express@4.21.2:"),
# bukan rentang "^4.21.2", supaya `npm install` di sini tidak pernah diam-diam
# menarik versi patch yang tidak pernah diuji bersama paket ini.
RUN printf '%s\n' \
      '{' \
      '  "name": "votepriv-runtime",' \
      '  "private": true,' \
      '  "type": "module",' \
      '  "dependencies": {' \
      '    "express": "4.21.2"' \
      '  }' \
      '}' > package.json \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Hasil build dari stage builder: dist/index.js (bundel server esbuild) +
# dist/public/ (build Vite + artefak ZK yang disalin plugin build, ~28 MB).
COPY --from=builder --chown=node:node /app/dist ./dist

# Jangan berjalan sebagai root di dalam kontainer yang menghadap jaringan.
RUN chown -R node:node /app
USER node

# Dokumentasi topologi jaringan container, bukan publikasi — pemetaan port
# sungguhan diatur docker-compose.yml (lihat komentar di sana: port ini
# dipublikasikan lewat service proof-server, bukan di sini, karena app
# memakai network_mode: "service:proof-server").
EXPOSE 3000

CMD ["node", "dist/index.js"]

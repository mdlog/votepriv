#!/usr/bin/env bash
#
# scripts/uji-paket-pemilih.sh — uji integrasi paket distribusi pemilih.
#
# BUTUH DOCKER. Dijalankan MANUAL — sengaja TIDAK didaftarkan di `pnpm test`
# (lihat package.json: seluruh skrip test lain jalan tanpa Docker sama
# sekali).
#
# Alur:
#   1. `docker compose up -d --wait` — naikkan proof-server + app, tunggu
#      keduanya healthy (proof-server: /version lewat trik /dev/tcp bash;
#      app: /__votepriv/runtime-config.json lewat fetch bawaan Node).
#   2. GET /__votepriv/runtime-config.json — proofServerTarget HARUS
#      menunjuk proof server compose ini (http://127.0.0.1:6300, karena
#      app memakai network_mode: "service:proof-server" — lihat komentar
#      panjang di docker-compose.yml untuk alasannya).
#   3. GET /proof-server/version (lewat proxy app) — harus "8.1.0".
#   4. GET /zk/ballot/keys/castVote.verifier — harus 200, badan BUKAN HTML.
#   5. Skrip Node kecil yang menjalankan proofServerReach() ASLI dari
#      client/src/lib/proof-server.ts (disalin apa adanya, hanya satu baris
#      import.meta.env yang di-shim supaya jalan di plain Node — lihat
#      komentar di dalam fungsi buat_harness_reach di bawah) terhadap target
#      yang BENAR-BENAR dilaporkan server — harus "lokal" dan
#      targetTerverifikasi === true. Ini yang membuktikan kalimat "Your
#      choice stays private…" di VoteModal.tsx akan tampil sungguhan.
#   6. `docker compose down` — dijalankan lewat trap EXIT, jadi tetap jalan
#      walau salah satu pemeriksaan di atas gagal atau skrip diinterupsi.
#
# Port yang dipakai: 5300 (app, lihat docker-compose.yml). Skrip ini TIDAK
# menyentuh 5180/5250/5173/3000/6300 di host.
#
# VOTEPRIV_IMAGE (env, opsional) — dipakai .github/workflows/rilis-image.yml
# untuk menguji image yang BARU DIDORONG ke GHCR (ditarik lewat digest,
# BUKAN dibangun ulang) sebelum rilis GitHub dibuat:
#
#   VOTEPRIV_IMAGE=ghcr.io/OWNER/votepriv-voter-app@sha256:... ./scripts/uji-paket-pemilih.sh
#
# Juga bisa dipakai manual/lokal untuk membuktikan jalur "pull by reference"
# (tanpa `build:` sama sekali) bekerja, memakai tag lokal yang sudah ada:
#
#   VOTEPRIV_IMAGE=votepriv-voter-app:local ./scripts/uji-paket-pemilih.sh
#
# Bila diisi, skrip memakai docker-compose.voter.yml (paket pemilih, TANPA
# `build:`) alih-alih docker-compose.yml (paket pengembang, dengan `build:
# context: .`), dengan baris image layanan "app" digantikan nilai ini lewat
# sed ke berkas sementara. TIDAK diisi (bawaan): perilaku PERSIS seperti
# sebelum kemampuan ini ditambahkan — docker-compose.yml, tanpa berkas
# sementara, tanpa langkah tambahan apa pun.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BASE_URL="http://localhost:5300"
GAGAL=0

jejak() { printf '\n=== %s ===\n' "$1"; }

# Lihat blok komentar VOTEPRIV_IMAGE di atas. COMPOSE_ARGS kosong (bawaan)
# berarti setiap "docker compose ..." di bawah berjalan tanpa "-f" —
# persis seperti sebelum kemampuan ini ada, dipakai docker-compose.yml.
COMPOSE_ARGS=()
COMPOSE_FILE_SEMENTARA=""
if [ -n "${VOTEPRIV_IMAGE:-}" ]; then
  jejak "0. VOTEPRIV_IMAGE=$VOTEPRIV_IMAGE — pakai docker-compose.voter.yml (tanpa build:), ganti image \"app\""
  COMPOSE_FILE_SEMENTARA="$(mktemp --suffix=.yml)"
  sed -E "s#^([[:space:]]*image:[[:space:]]*).*votepriv-voter-app.*#\1\"${VOTEPRIV_IMAGE}\"#" \
    docker-compose.voter.yml >"$COMPOSE_FILE_SEMENTARA"
  if ! grep -qF "$VOTEPRIV_IMAGE" "$COMPOSE_FILE_SEMENTARA"; then
    echo "GAGAL: penggantian baris image \"app\" di docker-compose.voter.yml tidak menemukan baris yang cocok."
    exit 1
  fi
  COMPOSE_ARGS=(-f "$COMPOSE_FILE_SEMENTARA")
  echo "Berkas compose sementara (dipakai, bukan docker-compose.yml): $COMPOSE_FILE_SEMENTARA"
fi

cleanup() {
  jejak "Beres-beres: docker compose down"
  docker compose "${COMPOSE_ARGS[@]}" down
  if [ -n "$COMPOSE_FILE_SEMENTARA" ]; then
    rm -f "$COMPOSE_FILE_SEMENTARA"
  fi
}
trap cleanup EXIT

jejak "1. docker compose up -d --wait (naikkan proof-server + app, tunggu keduanya healthy)"
if ! docker compose "${COMPOSE_ARGS[@]}" up -d --wait --wait-timeout 180; then
  echo "GAGAL: layanan tidak sehat dalam batas waktu."
  docker compose "${COMPOSE_ARGS[@]}" ps
  docker compose "${COMPOSE_ARGS[@]}" logs --tail 50
  exit 1
fi
docker compose "${COMPOSE_ARGS[@]}" ps

jejak "2. GET /__votepriv/runtime-config.json"
RUNTIME_CONFIG_JSON="$(curl -sS -m 10 "$BASE_URL/__votepriv/runtime-config.json")"
echo "$RUNTIME_CONFIG_JSON"

PROOF_TARGET="$(node -e '
  const data = JSON.parse(process.argv[1]);
  if (typeof data.proofServerTarget !== "string" || data.proofServerTarget.trim() === "") {
    throw new Error("proofServerTarget hilang atau bukan string tidak-kosong");
  }
  process.stdout.write(data.proofServerTarget);
' "$RUNTIME_CONFIG_JSON")"
echo "proofServerTarget = $PROOF_TARGET"

case "$PROOF_TARGET" in
http://127.0.0.1:6300)
  echo "OK: proofServerTarget menunjuk proof server compose ini lewat loopback bersama (network_mode: service:proof-server)."
  ;;
*)
  echo "GAGAL: proofServerTarget tidak seperti yang diharapkan (dapat: '$PROOF_TARGET')."
  GAGAL=1
  ;;
esac

jejak "3. GET /proof-server/version (lewat proxy app -> proof-server)"
VERSION_BODY="$(curl -sS -m 10 "$BASE_URL/proof-server/version")"
echo "badan jawaban: $VERSION_BODY"
if [ "$VERSION_BODY" = "8.1.0" ]; then
  echo "OK: versi proof server = 8.1.0"
else
  echo "GAGAL: versi tidak sesuai (dapat: '$VERSION_BODY')."
  GAGAL=1
fi

jejak "4. GET /zk/ballot/keys/castVote.verifier"
ZK_BODY_FILE="$(mktemp)"
ZK_HEADERS_FILE="$(mktemp)"
ZK_HTTP_CODE="$(curl -sS -m 10 -o "$ZK_BODY_FILE" -D "$ZK_HEADERS_FILE" -w '%{http_code}' "$BASE_URL/zk/ballot/keys/castVote.verifier")"
echo "status HTTP : $ZK_HTTP_CODE"
echo "content-type: $(grep -i '^content-type:' "$ZK_HEADERS_FILE" | tr -d '\r')"
echo "ukuran badan: $(wc -c <"$ZK_BODY_FILE") byte"

if [ "$ZK_HTTP_CODE" != "200" ]; then
  echo "GAGAL: status bukan 200."
  GAGAL=1
fi
if head -c 32 "$ZK_BODY_FILE" | grep -qi -e '<!doctype html' -e '<html'; then
  echo "GAGAL: badan jawaban adalah HTML (fallback SPA) — proxy zk tidak terpasang benar."
  GAGAL=1
else
  echo "OK: status 200 dan badan bukan HTML."
fi
rm -f "$ZK_BODY_FILE" "$ZK_HEADERS_FILE"

jejak "5. proofServerReach() ASLI dari client/src/lib/proof-server.ts, dijalankan lewat node"
SUMBER_ASLI="client/src/lib/proof-server.ts"
HARNESS="$(mktemp --suffix=.mts)"

# Satu-satunya perubahan pada salinan ini: import.meta.env hanya berarti
# sesuatu di bawah transformasi build Vite — di plain Node ia undefined, dan
# baris module-level TARGET_BAWAAN akan meledak saat modul dimuat bila tidak
# di-shim. Setiap fungsi lain (proofServerReach, isRemoteProofServer,
# isLocalHostname, isLocalPageOrigin, muatTargetRuntime, checkProofServer,
# dst) disalin BYTE-FOR-BYTE dari sumber asli lewat sed di atas — TIDAK ditulis
# ulang — supaya ini menguji logika yang benar-benar dikirim ke pemilih,
# bukan pemahaman kita tentangnya.
sed 's/import\.meta\.env/({ VITE_PROOF_SERVER_URL: undefined })/' "$SUMBER_ASLI" >"$HARNESS"

cat >>"$HARNESS" <<'EOF'

// --- Bagian uji di bawah ini DITAMBAHKAN skrip uji-paket-pemilih.sh, bukan
// bagian sumber asli proof-server.ts di atas. ---
const baseUrl = process.env.UJI_BASE_URL;
if (!baseUrl) throw new Error("UJI_BASE_URL tidak diset");

// fetch bawaan Node butuh URL absolut (tidak seperti browser, yang
// menyelesaikan RUNTIME_CONFIG_PATH relatif terhadap location.href) — satu-
// satunya alasan wrapper ini ada.
const ambil = (path: string, opts?: RequestInit) => fetch(new URL(path, baseUrl), opts);

// Persis seperti yang dipanggil UI: resolve target runtime dulu (dan apakah
// itu benar-benar dikonfirmasi server, bukan nilai build), baru klasifikasi
// reach-nya terhadap ASAL HALAMAN pemilih sungguhan (localhost:5300).
const targetRuntime = await muatTargetRuntime(ambil);
const asalHalamanPemilih: AsalHalaman = { hostname: "localhost", host: "localhost:5300" };
const reach = proofServerReach(targetRuntime.target, asalHalamanPemilih);
const hop = proofServerHop(targetRuntime.target, asalHalamanPemilih);

console.log(JSON.stringify({ ...targetRuntime, reach, hop }, null, 2));

let gagalNode = false;
if (reach !== "lokal") {
  console.error(`GAGAL: reach seharusnya "lokal", didapat "${reach}"`);
  gagalNode = true;
}
if (targetRuntime.terverifikasi !== true) {
  console.error("GAGAL: terverifikasi seharusnya true, didapat false");
  gagalNode = true;
}
if (gagalNode) process.exit(1);
console.log('OK: reach === "lokal" dan terverifikasi === true — kalimat "stays private" akan tampil ke pemilih.');
EOF

if ! UJI_BASE_URL="$BASE_URL" node --no-warnings --experimental-strip-types "$HARNESS"; then
  GAGAL=1
fi
rm -f "$HARNESS"

jejak "Ringkasan"
if [ "$GAGAL" -eq 0 ]; then
  echo "SEMUA PEMERIKSAAN LULUS."
else
  echo "ADA PEMERIKSAAN YANG GAGAL — lihat log di atas."
fi
exit "$GAGAL"

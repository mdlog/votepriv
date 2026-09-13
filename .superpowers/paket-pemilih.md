# Paket distribusi pemilih VotePriv — laporan

HEAD saat dikerjakan: `6869667b0ab3e4bf871050a3db6c0a91aa5bcfd7` (tidak diubah — tidak ada commit baru dibuat sepanjang kerja ini, lihat bagian "Status akhir").

Berkas yang dihasilkan (semua baru, tidak ada satu pun berkas di `pkgs/`, `server/`, `client/src/`, `docs/`, atau `vite.config.ts` yang disentuh):

- `.dockerignore`
- `Dockerfile`
- `docker-compose.yml`
- `README-VOTER.md`
- `scripts/uji-paket-pemilih.sh`

## 1. Keputusan jaringan: `network_mode: "service:proof-server"`, bukan env var

**Tidak diisi** di kedua fase (build maupun start): `VITE_PROOF_SERVER_URL`. Nilai bawaan yang dipanggang ke bundel browser (`client/src/lib/proof-server.ts:56`) dan yang dibaca proxy `server/index.ts:19` tetap sama-sama `http://127.0.0.1:6300` — jebakan build-vs-start hilang karena kedua fase memang tidak pernah diberi nilai berbeda untuk dibaca.

Sisa masalahnya jaringan: `127.0.0.1` container app bukan container proof-server di Compose biasa. Dua opsi ditimbang:

- **(a) `network_mode: "service:proof-server"`** — app berbagi network namespace (dan loopback-nya) dengan proof-server. **DIPILIH.**
- (b) `VITE_PROOF_SERVER_URL=http://proof-server:6300` hanya saat start.

**Alasan (a) bukan (b):** diuji langsung lewat logika ASLI di `client/src/lib/proof-server.ts` (lihat probe di bawah, dijalankan sebelum menulis compose final):

```
proofServerReach("http://127.0.0.1:6300", {hostname:"localhost",...}) → "lokal"
proofServerReach("http://proof-server:6300", {hostname:"localhost",...}) → "remote"
```

`proofServerReach()` mengklasifikasikan "lokal" HANYA bila **hostname** target ada di `HOST_LOKAL` (`localhost`, `127.0.0.1`, `::1`, `[::1]`, `0.0.0.0`, atau berakhiran `.localhost`). Nama layanan Compose `"proof-server"` bukan anggota himpunan itu. Jadi opsi (b) akan membuat `runtime-config.json` melaporkan target yang **benar** (proxy memang menghubungi host itu) tetapi diklasifikasikan **"remote"** — kalimat "stays private" di `VoteModal.tsx:95` (butuh `reach === "lokal" && targetTerverifikasi`) **tidak akan pernah tampil**. Hanya (a) membuat proxy sungguhan memakai `127.0.0.1:6300` — hostname yang memang anggota `HOST_LOKAL` — sehingga `reach === "lokal"` tercapai selama halaman juga dibuka dari `localhost`.

Konsekuensi teknis: service `app` tidak boleh (dan Compose menolak bila) punya `ports:`/`networks:` sendiri saat memakai `network_mode: service:x` — karena itu pemetaan port `5300:3000` diletakkan di service `proof-server` di `docker-compose.yml` (keduanya satu network namespace, jadi pemetaan port di container mana pun dalam namespace itu berlaku untuk keduanya). Divalidasi dengan `docker compose config` (tidak ada galat).

**Bukti end-to-end** (lihat transkrip lengkap §4) — dari luar container, lewat `curl`:

```
$ curl -s http://localhost:5300/__votepriv/runtime-config.json
{"proofServerTarget":"http://127.0.0.1:6300"}
```

dan skrip Node yang menjalankan `proofServerReach()` + `muatTargetRuntime()` ASLI (bukan reimplementasi — hanya baris `import.meta.env` yang di-shim karena itu global khusus Vite, lihat §5 skrip uji) terhadap target itu:

```json
{
  "target": "http://127.0.0.1:6300",
  "terverifikasi": true,
  "reach": "lokal",
  "hop": "browser → http://127.0.0.1:6300"
}
```

## 2. Ukuran image

```
votepriv-voter-app:local   225 MB   (225.416.935 byte, docker inspect)
```

Konteks: base `node:22.23.1-alpine` (runtime) sendiri 163 MB; base `node:22.23.1-slim` (builder, dibuang total) 227 MB. Runtime hanya membawa `dist/` (28 MB, termasuk 15 MB artefak ZK) + `node_modules` isolasi berisi **hanya** `express@4.21.2` dan dependensi transitifnya (4,9 MB, diverifikasi lewat `docker run ... ls node_modules` — tidak ada React/Radix/SDK Midnight sama sekali, karena esbuild `--packages=external` membundel `server/index.ts` dan hanya `express` yang diimpor lewat `node_modules`). Proses berjalan sebagai user `node` (non-root, uid 1000), diverifikasi lewat `docker run ... id`.

## 3. Bukti `.dockerignore` (find kosong)

```
$ docker run --rm votepriv-voter-app:local sh -c 'ls pkgs/cli 2>/dev/null; find / -name "wallet-cache" -o -name "private-state" -o -name "browserConsole.log" 2>/dev/null'
(tidak ada keluaran sama sekali — kosong)
```

`pkgs/cli` bahkan tidak ada sama sekali di image (`ls` exit 1) — image runtime tidak membawa **satu pun** source directory (`client/`, `server/`, `pkgs/`), hanya `dist/` hasil build + `node_modules` express. Ini pertahanan kedua di luar `.dockerignore`: walau sesuatu lolos ke *build context* stage builder, ia tidak otomatis ikut ke image akhir kecuali benar-benar menjadi bagian `dist/`.

Pemeriksaan tambahan yang dijalankan manual (di luar checklist wajib, untuk audit perkakas debug — lihat §14.8 fakta #3):

```
$ docker run --rm votepriv-voter-app:local sh -c 'find / -iname "*manus*" 2>/dev/null'
/app/dist/public/__manus__          # direktori KOSONG (lihat catatan di bawah)

$ docker run --rm votepriv-voter-app:local sh -c 'grep -o "manus-runtime" dist/public/index.html; wc -c dist/public/index.html'
(grep: tidak ditemukan, exit 1)
975 dist/public/index.html
```

Catatan: `dist/public/__manus__/` tetap tercipta sebagai direktori **kosong** karena mekanisme `publicDir` Vite menyalin struktur direktori `client/public/` apa adanya; isinya (`version.json`, metadata build non-rahasia — timestamp + hash versi, BUKAN alat rekam interaksi) sengaja ditambahkan ke `.dockerignore` juga (lebih ketat dari yang diminta spek) sehingga tidak ikut sama sekali. Skrip debug-collector (`tools/manus/debug-collector.js`) dan skrip runtime inline 366 KB (`vitePluginManusRuntime()`) sudah terbukti TIDAK ikut — keduanya hanya aktif bila `NODE_ENV !== "production"` (`vite.config.ts:458`), dan `vite build` menyetel `NODE_ENV=production` sendiri (dipertegas eksplisit lagi di `Dockerfile` sebelum `RUN pnpm build`, sebagai jaring pengaman, bukan karena terbukti perlu).

`.dockerignore` sengaja lebih ketat dari sekadar mencerminkan `.gitignore` di satu tempat: `pkgs/cli/leaves/` (data leaf registrasi pemilih hasil `register-leaves`, dibuat setelah `.gitignore` terakhir diperbarui — belum ter-gitignore, tapi jelas bukan urusan image runtime pemilih) ikut ditolak sebagai langkah kehati-hatian tambahan, dicatat eksplisit di komentar `.dockerignore`.

## 4. Keluaran verbatim `scripts/uji-paket-pemilih.sh`

Dijalankan manual dari akar repo (`./scripts/uji-paket-pemilih.sh`), setelah `docker compose down` bersih sebelumnya. Port yang dipakai: 5300 (app). Port 6300 TIDAK dipublikasikan ke host (diverifikasi lewat `docker compose ps`: `PORTS` proof-server menampilkan `6300/tcp` polos, bukan `0.0.0.0:6300->6300/tcp`) — tidak bentrok dengan proof server host yang sudah berjalan di `127.0.0.1:6300` (`midnight-proof-server`, tidak disentuh sepanjang kerja ini, dicek `docker ps` tetap `Up ... (healthy)` di akhir).

```
=== 1. docker compose up -d --wait (naikkan proof-server + app, tunggu keduanya healthy) ===
 Network votepriv_default Creating
 Network votepriv_default Created
 Container votepriv-proof-server-1 Creating
 Container votepriv-proof-server-1 Created
 Container votepriv-app-1 Creating
 Container votepriv-app-1 Created
 Container votepriv-proof-server-1 Starting
 Container votepriv-proof-server-1 Started
 Container votepriv-proof-server-1 Waiting
 Container votepriv-proof-server-1 Healthy
 Container votepriv-app-1 Starting
 Container votepriv-app-1 Started
 Container votepriv-app-1 Waiting
 Container votepriv-proof-server-1 Waiting
 Container votepriv-proof-server-1 Healthy
 Container votepriv-app-1 Healthy
NAME                      IMAGE                              COMMAND                  SERVICE        CREATED          STATUS                    PORTS
votepriv-app-1            votepriv-voter-app:local           "docker-entrypoint.s…"   app            16 seconds ago   Up 5 seconds (healthy)
votepriv-proof-server-1   midnightntwrk/proof-server:8.1.0   "/nix/store/d24gb0hj…"   proof-server   16 seconds ago   Up 16 seconds (healthy)   6300/tcp, 0.0.0.0:5300->3000/tcp, [::]:5300->3000/tcp

=== 2. GET /__votepriv/runtime-config.json ===
{"proofServerTarget":"http://127.0.0.1:6300"}
proofServerTarget = http://127.0.0.1:6300
OK: proofServerTarget menunjuk proof server compose ini lewat loopback bersama (network_mode: service:proof-server).

=== 3. GET /proof-server/version (lewat proxy app -> proof-server) ===
badan jawaban: 8.1.0
OK: versi proof server = 8.1.0

=== 4. GET /zk/ballot/keys/castVote.verifier ===
status HTTP : 200
content-type: Content-Type: application/octet-stream
ukuran badan: 2119 byte
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

=== Beres-beres: docker compose down ===
 Container votepriv-app-1 Stopping
 Container votepriv-app-1 Stopped
 Container votepriv-app-1 Removing
 Container votepriv-app-1 Removed
 Container votepriv-proof-server-1 Stopping
 Container votepriv-proof-server-1 Stopped
 Container votepriv-proof-server-1 Removing
 Container votepriv-proof-server-1 Removed
 Network votepriv_default Removing
 Network votepriv_default Removed
```

Exit code skrip: `0`. Tidak ada container/network `votepriv*` tersisa setelahnya (diverifikasi `docker ps -a` + `docker network ls`, keduanya kosong untuk filter `name=votepriv`).

### Jebakan yang ditemukan SAAT menulis healthcheck (dicatat supaya tidak terulang)

Percobaan pertama healthcheck proof-server (`head -1 <&3 | grep -q 200`) membuat container **selalu unhealthy** walau log `actix-web` di dalamnya menunjukkan setiap permintaan `/version` dijawab sukses. Investigasi (`docker compose exec proof-server ...` terhadap container milik compose ini sendiri — bukan container host `midnight-proof-server`, yang sengaja tidak disentuh sama sekali) menemukan dua hal:

1. Image `midnightntwrk/proof-server:8.1.0` adalah build Nix dengan `PATH` bawaan **sengaja dipersempit** hanya ke direktori binary proof-server sendiri (`docker inspect` → `PATH=/nix/store/.../ledger-8.1.0/bin`) — `head`/`grep` secara fisik ada di `/bin` (dibuktikan lewat `docker export` + `tar -t`) tapi tidak terjangkau lewat nama biasa, gagal dengan "command not found" (exit 127).
2. Perbaikan pertama (tulis ulang pakai builtin bash: `read -r baris` + `[[ "$baris" == *200* ]]`) MASIH gagal dengan sebab berbeda: **Compose men-substitusi `$baris` sebagai variabelnya sendiri** (peringatan `The "baris" variable is not set. Defaulting to a blank string.`) sebelum healthcheck sampai ke container — bukan galat di dalam container sama sekali. Diperbaiki dengan `$$baris` (escape Compose untuk `$` literal) di `docker-compose.yml`.

Healthcheck final (`docker-compose.yml`, service `proof-server`) memakai HANYA builtin bash (`exec`, `printf`, `read`, `[[ ]]`) — tidak ada proses eksternal sama sekali — supaya tidak bergantung lagi pada isi `PATH` image ini.

## 5. Uji `pnpm test` / `pnpm check` / `pnpm check:uji` (tidak disentuh kodenya, dibuktikan tetap hijau)

```
pnpm test        → Test Files  40 passed | 2 skipped (42); Tests  612 passed | 2 skipped (614)
pnpm check       → tsc --noEmit: tidak ada keluaran (bersih)
pnpm check:uji   → tsc -p tsconfig.uji.json --noEmit: tidak ada keluaran (bersih)
```

Sama persis dengan baseline yang dinyatakan di awal tugas ("klien 40 berkas/612 lolos + 2 dilewati"). `git rev-parse HEAD` sebelum dan sesudah seluruh pekerjaan ini: `6869667b0ab3e4bf871050a3db6c0a91aa5bcfd7` (tidak berubah — belum ada commit dibuat; lihat "Status akhir").

## 6. Batasan paket ini

**Yang DISELESAIKAN:** topologi baris pertama spek §14.8 (halaman DAN proof server di mesin pemilih) sekarang bisa dicapai dengan satu `docker compose up`, dan `reach === "lokal"` + `targetTerverifikasi === true` terbukti tercapai sungguhan (§1, §4) — bukan cuma secara teori.

**Yang TIDAK diselesaikan paket ini** (di luar cakupan tugas, dicatat supaya tidak dikira ikut terjawab):

- **Anonimitas tidak bertambah.** Proof server lokal menutup kebocoran ISI suara ke operator server; ia tidak memperbesar himpunan anonimitas. Sesuai catatan `Docs.tsx` yang sudah ada di app sendiri: anonimitas dibatasi oleh berapa banyak suara lain yang SUDAH DIBUKA saat suara Anda dibuka, bukan oleh jumlah total pemilih maupun oleh lokasi proof server. Ditulis eksplisit di `README-VOTER.md`.
- **Membuka suara (tally) tetap publik.** Tidak ada konfigurasi paket ini yang membuat vote yang sudah dibuka menjadi rahasia — itu memang bukan yang dilindungi topologi ini.
- **Berkas cadangan credential = kunci suara.** Siapa pun yang memegang berkas backup credential/vote (opsi + salt) tahu persis bagaimana seseorang memilih. Paket ini tidak menambah maupun mengurangi risiko itu; hanya diteruskan sebagai peringatan jujur di `README-VOTER.md`.
- **Kesenjangan payer-privacy Lace yang sudah tercatat sebelumnya** (`Docs.tsx`: "Payer privacy is verified for the CLI, not yet for Lace") tidak tersentuh oleh paket ini — di luar cakupan (bukan soal proof server, tapi soal langkah balancing di dalam ekstensi wallet).
- **Integritas distribusi paket ini sendiri di luar cakupan.** Jaminan "lokal" bergantung pada pemilih menjalankan Dockerfile/compose YANG ASLI dari repo ini. Bila seseorang membagikan `docker-compose.yml`/`Dockerfile` yang sudah diubah (mis. proof-server menunjuk ke host lain), tidak ada mekanisme di paket ini yang mendeteksi itu — hanya jalur baca (`runtime-config.json` + `proofServerReach()`) yang tetap jujur melaporkan apa pun yang benar-benar dikonfigurasi.
- **Host Docker pemilih sendiri harus dipercaya.** Paket ini tidak melindungi dari mesin pemilih yang sudah disusupi (mis. Docker daemon atau kernel yang dikontrol penyerang bisa tetap membaca witness sebelum masuk proof server).
- **Build butuh akses internet** (mengunduh dependensi `pnpm`, dan proof server sendiri mengunduh parameter ZK dari `https://srs.midnight.network/` saat start — perilaku image resmi Midnight, bukan sesuatu yang diubah paket ini). "Witness tidak pernah meninggalkan perangkat" TIDAK berarti "tidak ada lalu lintas jaringan sama sekali" pada mesin itu.
- **Healthcheck proof-server memakai trik `/dev/tcp` bash** karena image resminya tidak menyediakan curl/wget/nc lewat `PATH` bawaannya (§4). Bila image resmi berganti base (mis. shell dihapus total), healthcheck ini perlu ditinjau ulang.

## Status akhir

Tidak ada commit dibuat. Sesuai instruksi ("Conventional Commits, tanpa trailer atribusi AI apa pun. Jangan commit di pohon merah. Jangan mengirim subagen"), commit diserahkan ke pemanggil tugas ini untuk direview dulu isinya (lima berkas baru di atas) sebelum di-commit — bukan gagal, sengaja tidak dieksekusi otomatis dalam laporan ini. Semua kontainer dan network `votepriv*` yang dibuat sepanjang pengujian sudah dibersihkan (`docker compose down`); tidak ada yang ditinggalkan berjalan.

/**
 * Merekam respons indexer sungguhan menjadi fixture uji.
 *
 * Dijalankan MANUAL, hasilnya di-commit, dan seluruh uji berjalan terhadapnya.
 * Alasannya bukan kecepatan melainkan determinisme: data nyata berubah — tinggi
 * blok naik tiap 6 detik, ballot bisa bertambah, fase bergerak — sehingga uji
 * yang menyentuh jaringan adalah uji yang hijau atau merah menurut hari.
 *
 * meta.json merekam KAPAN rekaman dibuat beserta stempel waktu blok pada saat
 * itu. Uji yang butuh "waktu sekarang" menyuntikkan nilai dari meta.json,
 * BUKAN Date.now(). Itulah yang membuat turunan status (J1) dapat diuji sama
 * sekali: sebuah ballot yang "sudah lewat deadline" harus tetap sudah lewat
 * deadline ketika uji dijalankan tahun depan.
 *
 * Jalankan:  node scripts/rekam-fixture-rantai.mjs
 * Env opsional: VITE_MIDNIGHT_NETWORK, VITE_VOTEPRIV_REGISTRY
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const JARINGAN = process.env.VITE_MIDNIGHT_NETWORK ?? "preview";
const REGISTRY =
  process.env.VITE_VOTEPRIV_REGISTRY ??
  "b9d127d83f1436488e2cc808d9732d51f4f5befe2711362c7d669759db2a298a";

const ENDPOINT = {
  preprod: "https://indexer.preprod.midnight.network/api/v3/graphql",
  preview: "https://indexer.preview.midnight.network/api/v3/graphql",
  undeployed: "http://127.0.0.1:8088/api/v3/graphql",
}[JARINGAN];
if (!ENDPOINT) throw new Error(`jaringan tidak dikenal: ${JARINGAN}`);

const DIR = path.resolve(process.cwd(), "client/src/test/fixture-rantai");
mkdirSync(DIR, { recursive: true });

async function post(query, variables) {
  const t0 = performance.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  return { json, ms: Math.round(performance.now() - t0) };
}

/**
 * Fragmen ini SENGAJA merekam SUPERSET: `terbaru` diambil untuk SETIAP ballot,
 * bukan hanya untuk MAKS_BALLOT_BERAKSI yang pertama seperti yang dikirim
 * aplikasi.
 *
 * Alasannya: fixture yang superset tetap sah ketika MAKS_BALLOT_BERAKSI di
 * baca-rantai.ts dinaikkan atau diturunkan, sehingga menyetel angka itu tidak
 * menuntut rekam ulang dan perjalanan ke jaringan. Uji yang perlu melihat
 * perilaku jendela MEMANGKAS jawaban ini sendiri menurut dokumen yang benar-
 * benar dikirim — lihat `ambilPalsu()` di baca-rantai.test.ts.
 *
 * `limit: 5`, bukan 4: selisih antar-aksi menuntut pendahulu, dan jendela lima
 * memberi empat selisih. Nilainya harus SAMA dengan yang ada di kueri.ts;
 * berbeda berarti fixture merekam lebih sedikit riwayat daripada yang diminta
 * aplikasi, dan uji selisih akan hijau untuk alasan yang salah.
 */
const FRAGMEN = `fragment Isi on Contract {
  address
  state
  deploy: actions(limit: 1, type: DEPLOY) { transaction { hash block { height timestamp } } }
  terbaru: actions(limit: 5) {
    __typename
    ... on ContractCall { entryPoint }
    state
    transaction { hash block { height timestamp } }
  }
}`;

// ── POST 1: registry ──────────────────────────────────────────────────────
const q1 = `query Registry($a: HexEncoded!) { r: contract(address: $a) { ...Isi } }\n${FRAGMEN}`;
const r1 = await post(q1, { a: REGISTRY });
if (!r1.json.data?.r) throw new Error(`registry ${REGISTRY} tidak ditemukan di ${JARINGAN}`);
writeFileSync(path.join(DIR, "registry.json"), JSON.stringify(r1.json, null, 1) + "\n");

// Alamat ballot dibaca dari state registry lewat dekoder yang SAMA dengan yang
// dipakai aplikasi — supaya fixture tidak pernah lahir dari jalur kode kedua.
const { ContractState } = await import("@midnight-ntwrk/compact-runtime");
const { ledger: ledgerRegistry } = await import(
  "../pkgs/contract/src/managed/registry/contract/index.js"
);
const hexKeBita = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));
const reg = ledgerRegistry(ContractState.deserialize(hexKeBita(r1.json.data.r.state)).data);
const alamat = [...reg.ballots];

// ── POST 2: seluruh ballot, satu dokumen, alias per alamat ────────────────
const params = alamat.map((_, i) => `$a${i}: HexEncoded!`).join(", ");
const bidang = alamat.map((_, i) => `  b${i}: contract(address: $a${i}) { ...Isi }`).join("\n");
const q2 = `query Ballots(${params}) {\n${bidang}\n}\n${FRAGMEN}`;
const vars = Object.fromEntries(alamat.map((a, i) => [`a${i}`, a]));
const r2 = await post(q2, vars);
writeFileSync(
  path.join(DIR, "ballots.json"),
  JSON.stringify({ alamat, jawaban: r2.json }, null, 1) + "\n",
);

// ── POST 3: keadaan jaringan ──────────────────────────────────────────────
const q3 = `query Jaringan { block { height timestamp hash } currentEpochInfo { epochNo durationSeconds elapsedSeconds } }`;
const r3 = await post(q3, {});
writeFileSync(path.join(DIR, "jaringan.json"), JSON.stringify(r3.json, null, 1) + "\n");

// ── meta: waktu rekam, dipakai sebagai "sekarang" oleh seluruh uji ────────
const meta = {
  jaringan: JARINGAN,
  endpoint: ENDPOINT,
  alamatRegistry: REGISTRY,
  direkamPada: new Date().toISOString(),
  /**
   * Stempel waktu blok saat rekaman, dalam MILIDETIK — indexer mengembalikan
   * Block.timestamp dalam milidetik sementara deadline ledger dalam DETIK.
   * Uji menyuntikkan nilai ini sebagai "sekarang".
   */
  sekarangMs: r3.json.data.block.timestamp,
  tinggiBlok: r3.json.data.block.height,
  msPerPost: [r1.ms, r2.ms, r3.ms],
  jumlahBallot: alamat.length,
};
writeFileSync(path.join(DIR, "meta.json"), JSON.stringify(meta, null, 1) + "\n");

console.log("fixture direkam ke", DIR);
console.log(JSON.stringify(meta, null, 1));

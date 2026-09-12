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
 * Sejak invarian privasi pembayar (lihat client/src/test/fixture-rantai/README.md,
 * bagian "tx-mentah-tulis.json"), skrip ini JUGA merekam byte MENTAH ("raw",
 * hex apa adanya dari indexer) transaksi castVote/tallyVote yang ditemukan di
 * ballots.json, ke tx-mentah-tulis.json. Uji privasi-pembayar men-deserialisasi
 * ulang byte itu dengan @midnight-ntwrk/ledger-v8 secara OFFLINE, tanpa pernah
 * menyentuh jaringan lagi setelah fixture ini direkam.
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

/**
 * ── POST 2b: byte MENTAH transaksi jalur tulis (castVote/tallyVote) ────────
 *
 * MENGAPA berkas ini ada: klaim privasi aplikasi ("tidak ada identitas
 * pembayar di rantai, jadi 'alamat A memilih opsi X' tidak dapat
 * disimpulkan") sampai sekarang hanya hidup di PROSA (progress.md), bukan di
 * uji yang bisa merah. Untuk mengujinya OFFLINE dan DETERMINISTIK, uji butuh
 * byte MENTAH transaksi castVote/tallyVote yang SUNGGUH terkirim, supaya bisa
 * di-deserialisasi ulang dengan @midnight-ntwrk/ledger-v8 tanpa menyentuh
 * jaringan lagi setiap `pnpm test`.
 *
 * Sumbernya BUKAN daftar hash yang dikarang: aksi castVote/tallyVote diambil
 * dari `r2` (jawaban POST 2 di atas, jawaban ballots.json yang BARU SAJA
 * direkam), lalu untuk tiap hash dikueri ULANG field `raw` lewat kueri
 * `transactions(offset:{hash})` — satu-satunya field indexer v3 yang membawa
 * byte transaksi apa adanya (skema diverifikasi lewat introspeksi langsung
 * terhadap indexer preview, 2026-09-12).
 *
 * TIDAK ADA fallback diam-diam di sini. Bila tidak ada satu pun aksi
 * castVote/tallyVote di ballots.json, atau `transactions(offset:{hash})`
 * tidak menemukan transaksinya, atau entryPoint/tinggi blok yang dikembalikan
 * tidak cocok dengan yang tercatat di ballots.json — skrip BERHENTI (throw),
 * BUKAN menulis fixture kosong/sebagian. Fixture privasi yang salah lebih
 * berbahaya daripada tidak punya fixture sama sekali: ia membuat klaim
 * privasi tampak diuji padahal tidak.
 */
const ENTRY_POINT_TULIS = new Set(["castVote", "tallyVote"]);

function aksiTulisDariBallots(jawabanBallots) {
  const keluar = [];
  const dilihat = new Set();
  for (const [alias, kontrak] of Object.entries(jawabanBallots.data ?? {})) {
    if (!kontrak) continue;
    for (const aksi of kontrak.terbaru ?? []) {
      if (aksi.__typename !== "ContractCall") continue;
      if (!ENTRY_POINT_TULIS.has(aksi.entryPoint)) continue;
      const hash = aksi.transaction.hash;
      if (dilihat.has(hash)) continue; // hash yang sama bisa muncul di lebih dari satu alias ballot
      dilihat.add(hash);
      keluar.push({
        entryPoint: aksi.entryPoint,
        hash,
        blockHeight: aksi.transaction.block.height,
        ballotAddress: kontrak.address,
      });
    }
  }
  return keluar;
}

const aksiTulis = aksiTulisDariBallots(r2.json);
if (aksiTulis.length === 0) {
  throw new Error(
    "BLOCKED: nol aksi castVote/tallyVote ditemukan di ballots.json yang baru direkam — " +
      "tidak ada transaksi jalur tulis untuk direkam byte raw-nya. Berhenti, BUKAN menulis fixture kosong.",
  );
}

const qTx = `query Tx($h: HexEncoded!) {
  transactions(offset: { hash: $h }) {
    __typename
    ... on RegularTransaction {
      hash
      raw
      block { height }
      contractActions { __typename ... on ContractCall { entryPoint } }
    }
  }
}`;

const transaksiTulis = [];
for (const aksi of aksiTulis) {
  const { json: jTx } = await post(qTx, { h: aksi.hash });
  const tx = (jTx.data?.transactions ?? [])[0];
  if (!tx || tx.__typename !== "RegularTransaction" || typeof tx.raw !== "string" || tx.raw.length === 0) {
    throw new Error(
      `BLOCKED: transaksi ${aksi.hash} (entryPoint=${aksi.entryPoint}) tidak ditemukan atau tidak ` +
        `punya field "raw" di jaringan ${JARINGAN}. Berhenti, BUKAN mengarang byte.`,
    );
  }
  const entryPointTx = tx.contractActions?.find((a) => a.__typename === "ContractCall")?.entryPoint;
  if (entryPointTx !== aksi.entryPoint) {
    throw new Error(
      `BLOCKED: entryPoint tidak konsisten untuk transaksi ${aksi.hash} — ballots.json mencatat ` +
        `"${aksi.entryPoint}", tetapi transactions(offset:{hash}) mencatat "${entryPointTx}". ` +
        "Berhenti: ini tanda indexer tidak konsisten atau kueri salah, bukan sesuatu yang aman diabaikan.",
    );
  }
  if (tx.block.height !== aksi.blockHeight) {
    throw new Error(
      `BLOCKED: tinggi blok tidak konsisten untuk transaksi ${aksi.hash} — ballots.json mencatat ` +
        `${aksi.blockHeight}, transactions(offset:{hash}) mencatat ${tx.block.height}.`,
    );
  }
  transaksiTulis.push({
    entryPoint: aksi.entryPoint,
    hash: aksi.hash,
    blockHeight: aksi.blockHeight,
    ballotAddress: aksi.ballotAddress,
    rawByteLength: hexKeBita(tx.raw).length,
    raw: tx.raw,
  });
}
transaksiTulis.sort((a, b) => a.blockHeight - b.blockHeight);

writeFileSync(
  path.join(DIR, "tx-mentah-tulis.json"),
  JSON.stringify(
    {
      jaringan: JARINGAN,
      endpoint: ENDPOINT,
      direkamPada: new Date().toISOString(),
      transaksi: transaksiTulis,
    },
    null,
    1,
  ) + "\n",
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
console.log(
  `tx-mentah-tulis.json: ${transaksiTulis.length} transaksi (` +
    transaksiTulis.map((t) => `${t.entryPoint}:${t.hash.slice(0, 8)}:${t.rawByteLength}B`).join(", ") +
    ")",
);

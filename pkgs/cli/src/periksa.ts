// Pemeriksaan invarian ledger ballot, diekstrak dari e2e.ts (Fix Round 1,
// FIX 5) supaya bisa diuji tanpa jaringan.
//
// Sebelum ekstraksi ini, keenam `pastikan(...)` yang membuktikan tally KOSONG
// selama voting hidup inline di dalam skrip e2e.ts. Menghapus SELURUHNYA
// tetap membuat `pnpm --filter cli typecheck` exit 0 dan seluruh 91 uji unit
// hijau, karena e2e.ts bukan berkas yang pernah dijalankan vitest — baris
// terpenting di seluruh rencana Task 6 hanya dilindungi review manusia. Fungsi
// murni di sini mengubah itu: setiap assert bisa diuji dengan ledger PALSU,
// tanpa proof, tanpa wallet, tanpa jaringan (lihat periksa.test.ts).
//
// Argumen `lb` di tiap fungsi bertipe "ledger-shaped": interface lokal yang
// HANYA menyebut field yang benar-benar dibaca fungsi itu, bukan `LedgerBallot`
// penuh (yang punya lebih dari 15 field, lihat deploy.ts). `LedgerBallot`
// sungguhan tetap bisa dioper ke sini apa adanya dari e2e.ts — TypeScript
// menerima variabel dengan field LEBIH BANYAK daripada yang diminta parameter
// (excess-property check hanya berlaku pada literal objek, bukan variabel) —
// tapi ledger palsu di uji tidak perlu berpura-pura mengisi field lain yang
// tidak relevan sama sekali bagi pemeriksaan yang sedang diuji.
import { Ballot } from "contract";
import { pastikan, ringkasTallies } from "./tunggu.ts";

export interface LedgerVotingKosong {
  readonly voteCount: bigint;
  readonly talliedCount: bigint;
  readonly tallies: {
    isEmpty(): boolean;
    size(): bigint;
    [Symbol.iterator](): Iterator<readonly [bigint, bigint]>;
  };
  readonly tallyNullifiers: { isEmpty(): boolean };
}

/**
 * Pemeriksaan bagian 6 — BARIS TERPENTING DI SELURUH RENCANA TASK 6.
 *
 * SELAMA pemungutan suara berlangsung, chain hanya boleh memegang nullifier
 * dan commitment — tidak ada hasil parsial yang bisa bocor, tidak kepada
 * penyelenggara, tidak kepada siapa pun yang membaca chain. Memimpin dengan
 * `voteCount` SEBELUM kelima pemeriksaan "PRIVASI BOCOR" adalah yang membuat
 * kelimanya bermakna: tanpa itu, tally kosong bisa saja berarti "kosong
 * karena tidak ada suara yang masuk", bukan "kosong karena memang dirancang
 * begitu".
 *
 * YANG DIBUKTIKAN fungsi ini (dan run e2e secara keseluruhan): tidak ada
 * tally parsial yang pernah muncul di chain selama fase voting. YANG TIDAK
 * DIBUKTIKANNYA: bahwa pilihan seorang pemilih tak terkait dengan pemilih
 * itu sendiri — e2e.ts memakai SATU wallet untuk seluruh sebelas transaksi,
 * dan urutan indeks castVote/tallyVote yang identik antar pemilih membuat
 * korelasi indeks-ke-indeks memulihkan pasangan pemilih-opsi dengan mudah.
 * Unlinkability itu properti kriptografis kontrak (nullifier/commitment),
 * bukan sesuatu yang test harness ini pernah berusaha buktikan atau
 * sembunyikan.
 *
 * Empat dari enam pemeriksaan di bawah (`isEmpty`, `size`, `tally.every`,
 * dan tersirat lewat `ringkasTallies`) sama-sama membaca field `tallies`
 * lewat API yang berbeda-beda — sengaja dipertahankan sebagai pertahanan
 * berlapis terhadap satu bug di salah satu API itu sendiri, BUKAN empat
 * fakta independen. `tallyNullifiers.isEmpty()` (assert keenam, ditambahkan
 * Fix Round 1) memeriksa fakta yang sungguh-sungguh berbeda: sebuah regresi
 * di mana `castVote` ikut menyisipkan `tally_nullifier(salt)` saat memilih
 * (bukan hanya `tallyVote` yang boleh melakukannya) akan LOLOS dari kelima
 * pemeriksaan `tallies` di atas — `tallies` sendiri tetap kosong — padahal
 * nilai yang baru saja diterbitkan itu kelak, di fase tally, membuka
 * identitas pemilih. Menerbitkannya di dalam transaksi castVote, alih-alih
 * tallyVote, akan mengikat pemilih ke pilihannya secara permanen tanpa
 * pernah menyentuh `tallies` sama sekali. `tallyNullifiers` adalah satu-
 * satunya field lain di ledger yang relevan dan bisa mendeteksi skenario itu.
 */
export function periksaTallyKosongSelamaVoting(
  lb: LedgerVotingKosong,
  jumlahPemilih: number,
  jumlahOpsi: number,
): bigint[] {
  pastikan(lb.voteCount === BigInt(jumlahPemilih), `voteCount harus ${jumlahPemilih}, terbaca ${lb.voteCount}`);
  pastikan(lb.tallies.isEmpty(), "PRIVASI BOCOR: tallies TIDAK kosong selagi pemungutan suara berlangsung");
  pastikan(lb.tallies.size() === 0n, `PRIVASI BOCOR: tallies.size() = ${lb.tallies.size()}, harus 0`);
  const tally = ringkasTallies([...lb.tallies], jumlahOpsi);
  pastikan(tally.every((n) => n === 0n), `PRIVASI BOCOR: ada tally bukan nol selama voting: ${tally.map(String)}`);
  pastikan(lb.talliedCount === 0n, `talliedCount harus 0 selama voting, terbaca ${lb.talliedCount}`);
  pastikan(
    lb.tallyNullifiers.isEmpty(),
    "PRIVASI BOCOR: tallyNullifiers TIDAK kosong selagi pemungutan suara berlangsung — castVote seharusnya tidak pernah menyisipkan tally_nullifier(salt), hanya tallyVote yang boleh",
  );
  return tally;
}

export interface LedgerHasilTallyAkhir {
  readonly phase: Ballot.BallotPhase;
  readonly talliedCount: bigint;
  readonly tallies: {
    member(key: bigint): boolean;
    [Symbol.iterator](): Iterator<readonly [bigint, bigint]>;
  };
}

/**
 * Pemeriksaan bagian 9: hasil setelah SELURUH suara dibuka.
 *
 * `member()`, bukan `lookup()`, untuk opsi tanpa suara: lookup pada kunci
 * yang tidak ada MELEMPAR "expected a cell, received null", sedangkan opsi
 * tanpa suara memang tidak punya kunci sama sekali di peta tally — diperiksa
 * untuk SETIAP opsi yang diharapkan nol suara, bukan hanya satu.
 *
 * Di sini `phase` di-assert (berbeda dari bagian 6): tallyVote memindahkannya
 * dari `voting` ke `tallying`, jadi di titik ini ia BISA membedakan.
 */
export function periksaHasilTallyAkhir(
  lb: LedgerHasilTallyAkhir,
  jumlahOpsi: number,
  opsiDiharapkan: readonly bigint[],
  talliedCountDiharapkan: bigint,
): bigint[] {
  const tally = ringkasTallies([...lb.tallies], jumlahOpsi);
  for (let i = 0; i < opsiDiharapkan.length; i++) {
    pastikan(tally[i] === opsiDiharapkan[i], `Opsi ${i} harus ${opsiDiharapkan[i]} suara, terbaca ${tally[i]}`);
  }
  for (let i = 0; i < opsiDiharapkan.length; i++) {
    if (opsiDiharapkan[i] === 0n) {
      pastikan(!lb.tallies.member(BigInt(i)), `Opsi ${i} seharusnya tidak punya entri tally sama sekali`);
    }
  }
  pastikan(
    lb.talliedCount === talliedCountDiharapkan,
    `talliedCount harus ${talliedCountDiharapkan}, terbaca ${lb.talliedCount}`,
  );
  pastikan(lb.phase === Ballot.BallotPhase.tallying, `phase harus tallying (1), terbaca ${lb.phase}`);
  return tally;
}

export interface LedgerFaseTerfinalisasi {
  readonly phase: Ballot.BallotPhase;
}

/** Pemeriksaan bagian 11: bukti akhir bahwa ballot benar-benar difinalisasi. */
export function periksaFaseTerfinalisasi(lb: LedgerFaseTerfinalisasi): void {
  pastikan(lb.phase === Ballot.BallotPhase.finalized, `phase harus finalized (2), terbaca ${lb.phase}`);
}

// castVote, tallyVote, dan finalize lewat CLI.
//
// Ketiga circuit ini TIDAK menerima argumen: seluruh masukannya datang dari
// witness, yang membaca private state BERKUNCI ALAMAT KONTRAK. Berkas ini
// karena itu sebagian besar berisi penulisan private state yang benar SEBELUM
// pemanggilan, bukan pemanggilannya sendiri.
import crypto from "node:crypto";
import type { MerkleTreePath } from "@midnight-ntwrk/compact-runtime";
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import { SucceedEntirely } from "@midnight-ntwrk/midnight-js-types";
import {
  BallotPrivateStateId,
  emptyBallotPrivateState,
  withCommitmentPath,
  withCredential,
  withEligibilityPath,
  withOpening,
  type BallotPrivateState,
} from "contract";
import type { Logger } from "pino";
import type { BallotC } from "./kontrak.ts";
import type { ProvidersBallot } from "./providers.ts";
import { BATAS_MS, denganBatasWaktu } from "./tunggu.ts";

export const acak32 = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

/**
 * Menulis kredensial, pilihan, salt, dan Merkle path eligibility untuk SATU
 * pemilih, di bawah alamat ballot yang sedang dipakai. Ini persiapan
 * **castVote**, dan hanya castVote — parameter terakhirnya adalah path
 * eligibility, bukan path commitment.
 *
 * `setContractAddress` wajib dipanggil lebih dulu: level provider menyusun
 * kuncinya sebagai `${contractAddress}:${privateStateId}` dan melempar
 * "Contract address not set..." bila belum disetel. midnight-js memanggilnya
 * sendiri di dalam deploy/find/call, tapi TIDAK untuk tulisan langsung seperti
 * ini. Alamat yang dipakai harus string 64 hex APA ADANYA dari
 * `deployTxData.public.contractAddress` — sama persis dengan yang dilihat
 * witness lewat `WitnessContext.contractAddress`.
 *
 * secretKey diisi nol: castVote dan tallyVote tidak membacanya sama sekali.
 * Hanya registerVoters (admin) yang butuh kunci admin sungguhan.
 */
export async function siapkanPemilih(
  providers: ProvidersBallot,
  alamat: string,
  credential: Uint8Array,
  opsi: bigint,
  salt: Uint8Array,
  jalurEligibility: MerkleTreePath<Uint8Array>,
): Promise<void> {
  const psp = providers.privateStateProvider;
  psp.setContractAddress(alamat);

  const dasar = (await psp.get(BallotPrivateStateId)) ?? emptyBallotPrivateState(new Uint8Array(32));
  let ps: BallotPrivateState = withCredential(dasar, alamat, credential);
  ps = withOpening(ps, alamat, { option: opsi, salt });
  ps = withEligibilityPath(ps, alamat, jalurEligibility);
  await psp.set(BallotPrivateStateId, ps);
}

/**
 * Menulis opening dan Merkle path commitment menjelang **tallyVote**.
 *
 * Path commitment HARUS disusun dari state ledger TERBARU: `commitments`
 * adalah MerkleTree biasa (bukan Historic), sehingga `checkRoot` hanya
 * menerima root saat ini. Path yang dibangun di tengah pemungutan suara akan
 * ditolak setelah suara lain masuk. `eligibility` sebaliknya Historic, jadi
 * path eligibility aman dibangun sejak pemilih terdaftar.
 *
 * Basis yang null diterima dan diisi dari `emptyBallotPrivateState`, BUKAN
 * dilempar. Alasannya bentuk, bukan kemudahan: tallyVote hanya memanggil
 * `get_my_option`, `get_my_salt`, dan `commitment_path` — ia tidak pernah
 * menyentuh `voter_credential`, `eligibility_path`, maupun `admin_secret_key`
 * (sudah diperiksa satu per satu di ballot.compact). Jadi kedua field yang
 * ditulis fungsi ini memang seluruh yang dibutuhkan.
 *
 * Konsekuensinya penting: JANGAN memanggil `siapkanPemilih` dengan path
 * commitment untuk "mengisi basis" sebelum fungsi ini. Kedua path bertipe sama
 * (`MerkleTreePath<Uint8Array>`), sehingga tsc tidak akan menangkap
 * pertukarannya, dan path commitment yang mendarat di `eligibilityPaths` hanya
 * tidak terlihat karena tallyVote kebetulan tidak membacanya — sampai suatu
 * hari ada circuit yang membacanya.
 */
export async function siapkanPembukaan(
  providers: ProvidersBallot,
  alamat: string,
  opsi: bigint,
  salt: Uint8Array,
  jalurCommitment: MerkleTreePath<Uint8Array>,
): Promise<void> {
  const psp = providers.privateStateProvider;
  psp.setContractAddress(alamat);

  const dasar = (await psp.get(BallotPrivateStateId)) ?? emptyBallotPrivateState(new Uint8Array(32));
  let ps: BallotPrivateState = withOpening(dasar, alamat, { option: opsi, salt });
  ps = withCommitmentPath(ps, alamat, jalurCommitment);
  await psp.set(BallotPrivateStateId, ps);
}

/**
 * Cadangan belat-dan-suspender (belt-and-braces): pada
 * `midnight-js-contracts@4.0.4` yang benar-benar terpasang di sini, fungsi
 * ini TIDAK PERNAH tereksekusi lewat jalur normal.
 *
 * Diverifikasi langsung terhadap paket terpasang (bukan diasumsikan dari
 * dokumentasi): `ballot.callTx.castVote()` dkk dipanggil TANPA transaction
 * context (lihat `pilih`/`bukaSuara`/`finalisasi` di bawah — tidak ada `txCtx`
 * yang diteruskan), sehingga jatuh ke `createCircuitCallTxInterface` ->
 * `submitCallTx` -> `scoped(providers, callTxFn)` TANPA `outerTxCtx`
 * (dist/index.mjs:1499-1513). Pada jalur itu, `scoped` memanggil
 * `innerTxCtx[Submit]()` (dist/index.mjs:812, definisi Submit di :749-750),
 * yang MELEMPAR `CallTxFailedError` begitu `finalizedTxData.status !==
 * SucceedEntirely` — promise-nya REJECT, bukan resolve dengan status gagal
 * sebagai nilai. `deployContract`/`submitDeployTx` (dist/index.mjs:654)
 * melempar `DeployTxFailedError` dengan pola yang sama untuk deploy. Jadi
 * baik `FailEntirely` maupun `FailFallible` datang sebagai LEMPARAN pada
 * versi yang terpasang, bukan sebagai nilai `r.public.status` yang bisa
 * dibaca fungsi ini — premis lama komentar ini (bahwa keduanya "datang
 * sebagai nilai") SALAH untuk paket ini, dan pemeriksaannya karena itu
 * tidak pernah tercapai lewat jalur mana pun yang dipakai berkas ini.
 *
 * Dipertahankan (bukan dihapus) sebagai jaring pengaman murah untuk dua
 * kelas risiko yang TIDAK bisa disingkirkan hanya dengan membaca sumber
 * versi saat ini: (1) upgrade `midnight-js-contracts` di masa depan yang
 * mengubah perilaku ini — `package.json` mengunci versi PERSIS `4.0.4`
 * untuk paket ini (bukan rentang; rentang `^4.0.1` itu milik paket LAIN,
 * `wallet-sdk-facade`), tapi pin persis ini hanya bertahan sampai seseorang
 * menaikkannya secara manual, dan perilaku pada versi berikutnya belum
 * diverifikasi terhadap sumbernya; dan (2) pemanggilan lewat transaction
 * context bersama (`outerTxCtx`) suatu hari nanti, yang jalur `scoped`-nya
 * (dist/index.mjs:812-833) mengembalikan `CallResult` TANPA field `status` sama sekali,
 * bukan tanpa syarat melempar — belum dipakai di berkas mana pun di CLI ini,
 * tapi bila kelak dipakai, guard ini adalah satu-satunya yang berdiri antara
 * status gagal yang lolos dan log "Suara masuk" yang keliru. Biayanya satu
 * `if` per pemanggilan; membuang assert lokal ini tidak menghemat apa pun
 * yang berarti dibanding tetap menyimpannya.
 *
 * Pesannya sengaja TIDAK memuat frasa mana pun dari POLA_BELUM_WAKTUNYA:
 * kegagalan on-chain bukan soal waktu blok (Step 1 membuktikan assert deadline
 * gagal secara lokal), jadi ia tidak boleh diulang — ia harus menghentikan
 * proses.
 */
function pastikanSukses(status: string, apa: string, txId: string): void {
  if (status !== SucceedEntirely) {
    throw new Error(
      `${apa} difinalisasi chain dengan status ${status} (txId ${txId}), bukan ${SucceedEntirely}. Ini kegagalan on-chain, bukan soal waktu blok — periksa saldo DUST, nullifier, dan log proof server sebelum mencoba apa pun lagi.`,
    );
  }
}

export async function pilih(ballot: FoundContract<BallotC>, log: Logger, label: string): Promise<void> {
  log.info({ pemilih: label }, "castVote: membuat proof ZK (5-20 detik) lalu menunggu finalisasi");
  const r = await denganBatasWaktu(
    ballot.callTx.castVote(),
    BATAS_MS.panggilBerat,
    `callTx.castVote (${label}) tidak selesai dalam ${BATAS_MS.panggilBerat / 60_000} menit. JANGAN mengulang sebelum membaca voteCount dari indexer: bila transaksinya mendarat, credential ini sudah terpakai dan percobaan kedua akan ditolak "Credential has already voted".`,
  );
  pastikanSukses(r.public.status, `castVote (${label})`, r.public.txId);
  log.info({ pemilih: label, txId: r.public.txId, status: r.public.status }, "Suara masuk");
}

export async function bukaSuara(ballot: FoundContract<BallotC>, log: Logger, label: string): Promise<void> {
  log.info({ pemilih: label }, "tallyVote: membuat proof ZK lalu menunggu finalisasi");
  const r = await denganBatasWaktu(
    ballot.callTx.tallyVote(),
    BATAS_MS.panggilBerat,
    `callTx.tallyVote (${label}) tidak selesai dalam ${BATAS_MS.panggilBerat / 60_000} menit. JANGAN mengulang sebelum membaca talliedCount dari indexer: bila transaksinya mendarat, tallyNullifier-nya sudah terpakai.`,
  );
  pastikanSukses(r.public.status, `tallyVote (${label})`, r.public.txId);
  log.info({ pemilih: label, txId: r.public.txId, status: r.public.status }, "Suara dibuka");
}

export async function finalisasi(ballot: FoundContract<BallotC>, log: Logger): Promise<void> {
  log.info("finalize: membuat proof ZK lalu menunggu finalisasi");
  const r = await denganBatasWaktu(
    ballot.callTx.finalize(),
    BATAS_MS.panggilRingan,
    `callTx.finalize tidak selesai dalam ${BATAS_MS.panggilRingan / 60_000} menit. Periksa phase di indexer sebelum mengulang: finalize kedua akan ditolak "Ballot is already finalized".`,
  );
  pastikanSukses(r.public.status, "finalize", r.public.txId);
  log.info({ txId: r.public.txId, status: r.public.status }, "Ballot difinalisasi");
}

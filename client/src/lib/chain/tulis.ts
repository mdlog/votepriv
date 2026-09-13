/**
 * SATU-SATUNYA modul jalur TULIS sungguhan (C-2b). Dimuat HANYA lewat
 * jalur-tulis.ts::muatJalurTulis() — TIDAK PERNAH diimpor statis, dijaga
 * batas-bundel.test.ts dan scripts/ukur-batas-bundel.mjs.
 *
 * setNetworkId WAJIB baris pertama: getNetworkId() MELEMPAR bila belum
 * disetel, dan createUnprovenCallTx (di dalam callTx.castVote()) memanggilnya
 * langsung. Jalur BACA tidak pernah menyetel ini.
 *
 * URUTAN findDeployedContract SEBELUM penulisan private state (G3 di bawah)
 * MENGIKAT: pkgs/cli/src/e2e.ts:468-481 sudah membuktikan di testnet bahwa
 * findDeployedContract MENIMPA private state (ia memanggil
 * setOrGetInitialSigningKey lalu — bila belum ada — menulis
 * initialPrivateState kosong). Membalik urutan ini menghapus credential dan
 * opening yang baru saja ditulis SEBELUM sempat dipakai castVote.
 *
 * URUTAN penyimpanan opening SEBELUM pengiriman (bukan sesudah) juga
 * MENGIKAT, dan alasannya berbeda dari urutan di atas: opening (opsi + salt)
 * adalah SATU-SATUNYA cara membuka commitment saat tally. Bila proses ini
 * dibunuh — tab ditutup, laptop mati, wallet crash — TEPAT SETELAH transaksi
 * terkirim tapi SEBELUM opening tersimpan, suara itu tetap sah di chain
 * (nullifier terpakai, commitment tercatat) TAPI tidak ada opening di mana
 * pun yang bisa membukanya — suara itu hilang permanen dari hasil tally.
 * Menyimpan opening SEBELUM memanggil castVote membuat kegagalan proses di
 * titik mana pun setelah itu paling buruk berarti "suara belum terkirim,
 * coba lagi" — bukan "suara terkirim tapi tidak bisa dibuka selamanya".
 * Kebalikannya (simpan setelah kirim) mengoptimalkan untuk kasus yang salah:
 * ia menghindari menyimpan opening untuk suara yang gagal terkirim, dengan
 * harga menghilangkan opening untuk suara yang JUSTRU BERHASIL terkirim —
 * dan yang kedua itu tidak bisa diperbaiki lagi.
 */
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { SucceedEntirely } from "@midnight-ntwrk/midnight-js-types";
import {
  BallotPrivateStateId,
  emptyBallotPrivateState,
  openingFor,
  withCommitmentPath,
  withCredential,
  withEligibilityPath,
  withOpening,
  type BallotPrivateState,
} from "@pkgs/contract/src/ballot-witnesses.js";
import * as Ballot from "@pkgs/contract/src/managed/ballot/contract/index.js";
import { buatCredential, daunEligibility } from "@pkgs/shared/src/credentials";
import { MIDNIGHT_NETWORK_ENDPOINTS, type MidnightNetworkId } from "@pkgs/shared/src/network-config";
import type { WalletConnection } from "@/lib/midnight-wallet";
import { PROOF_SERVER_PATH } from "@/lib/proof-server";
import { buatAdaptorLace } from "./adaptor-lace";
import { ambilJalurCommitment, ambilJalurEligibility, bacaLedgerBallotTulis } from "./eligibility-tulis";
import { kompilasiBallotBrowser } from "./kontrak-tulis";
import { buatKredensialStoreIdb, NAMA_DB_KREDENSIAL } from "./kredensial-idb";
import { buatPrivateStateProviderIdb } from "./private-state-idb";
import { rakitProvidersBallotBrowser, type ProvidersBallotBrowser } from "./providers-tulis";
import { pastikanArtefakZkMurah } from "./zk-config-fetch";

// `location` GLOBAL (bukan `window.location`) — pola sama dengan
// client/src/lib/proof-server.ts (asalHalaman): global ini ada bawaan di
// browser sungguhan, tapi TIDAK ada di lingkungan uji Node (vitest.config.ts
// menjalankan *.test.ts di bawah environment "node", jsdom hanya untuk
// *.test.tsx) — uji men-stub-nya lewat vi.stubGlobal("location", …).
const zkBaseUrl = (): string => `${location.origin}/zk/ballot`;
const proofServerUrl = (): string => `${location.origin}${PROOF_SERVER_PATH}`;

export type TahapKirimSuara =
  | "menyiapkan-artefak"
  | "membaca-eligibility"
  | "menyusun-witness"
  | "membuat-proof"
  | "menyeimbangkan-wallet"
  | "mengirim"
  | "menunggu-indexer";

export class GalatCastVote extends Error {
  constructor(
    message: string,
    readonly kode: "ARTEFAK_ZK" | "ELIGIBILITY" | "WALLET" | "ON_CHAIN" | "TIDAK_DIKENAL",
    readonly cause?: unknown,
    /** Terisi bila nullifier credential ini TERKONFIRMASI sudah ada di
     * ledger MESKIPUN panggilan di atas melempar. UI WAJIB membedakan ini
     * dari kegagalan biasa: mencoba lagi akan ditolak "Credential ini sudah
     * dipakai memilih", dan itu bukan tanda kegagalan. */
    readonly mungkinSudahMasuk?: { nullifierHex: string },
  ) {
    super(message);
    this.name = "GalatCastVote";
  }
}

export interface CadanganOpening {
  alamatBallot: string;
  opsi: number;
  saltHex: string;
}

export interface ParamKirimSuara {
  alamatBallot: string;
  credentialHex: string;
  opsi: number;
  jaringan: MidnightNetworkId;
  onStatus?: (tahap: TahapKirimSuara) => void;
  /** Dipanggil TEPAT SEBELUM castVote — jendela untuk menawarkan cadangan. */
  onOpeningTersimpan?: (cadangan: CadanganOpening) => void;
}

export interface HasilKirimSuara {
  txId: string;
  nullifierHex: string;
}

function hexKeBytes(hex: string): Uint8Array {
  const bersih = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(bersih)) {
    throw new GalatCastVote("The credential must be 64 hexadecimal characters (32 bytes).", "TIDAK_DIKENAL");
  }
  const keluar = new Uint8Array(32);
  for (let i = 0; i < 32; i++) keluar[i] = Number.parseInt(bersih.slice(i * 2, i * 2 + 2), 16);
  return keluar;
}

function bytesKeHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function siapkanProviders(
  wallet: WalletConnection,
  jaringan: MidnightNetworkId,
): Promise<ProvidersBallotBrowser> {
  setNetworkId(jaringan);
  const endpoint = MIDNIGHT_NETWORK_ENDPOINTS[jaringan];
  return rakitProvidersBallotBrowser({
    indexerUri: endpoint.indexer,
    indexerWsUri: endpoint.indexerWS,
    zkBaseUrl: zkBaseUrl(),
    proofServerUrl: proofServerUrl(),
    dompet: buatAdaptorLace(wallet),
  });
}

async function periksaMungkinSudahMasuk(
  providers: ProvidersBallotBrowser | undefined,
  alamatBallot: string,
  credential: Uint8Array,
): Promise<{ nullifierHex: string } | undefined> {
  if (!providers) return undefined;
  try {
    const lb = await bacaLedgerBallotTulis(providers.publicDataProvider, alamatBallot);
    const nf = Ballot.pureCircuits.vote_nullifier(lb.ballotNonce, credential);
    if (lb.nullifiers.member(nf)) return { nullifierHex: bytesKeHex(nf) };
    return undefined;
  } catch {
    return undefined; // pemeriksaan pemulihan sendiri gagal — biarkan galat asli yang dilempar pemanggil
  }
}

export async function kirimSuara(params: ParamKirimSuara, wallet: WalletConnection): Promise<HasilKirimSuara> {
  const { alamatBallot, credentialHex, opsi, jaringan, onStatus, onOpeningTersimpan } = params;
  const credential = hexKeBytes(credentialHex);
  let providers: ProvidersBallotBrowser | undefined;

  try {
    onStatus?.("menyiapkan-artefak");
    try {
      await pastikanArtefakZkMurah(zkBaseUrl(), "castVote");
    } catch (e) {
      throw new GalatCastVote(
        "The ZK artifacts for castVote could not be read — check /zk/ballot/keys/castVote.verifier.",
        "ARTEFAK_ZK",
        e,
      );
    }

    providers = await siapkanProviders(wallet, jaringan);

    onStatus?.("membaca-eligibility");
    const daun = Ballot.pureCircuits.cred_leaf(credential);
    const jalurEligibility = await ambilJalurEligibility(providers.publicDataProvider, alamatBallot, daun);

    // findDeployedContract MENIMPA private state — WAJIB sebelum menulis
    // credential/opening (pola sama dengan pkgs/cli/src/e2e.ts:468-481).
    const ballot = await findDeployedContract(providers, {
      compiledContract: kompilasiBallotBrowser(),
      contractAddress: alamatBallot,
      privateStateId: BallotPrivateStateId,
      initialPrivateState: emptyBallotPrivateState(new Uint8Array(32)),
    });

    onStatus?.("menyusun-witness");
    const psp = providers.privateStateProvider;
    psp.setContractAddress(alamatBallot);
    const dasar = (await psp.get(BallotPrivateStateId)) ?? emptyBallotPrivateState(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(32));
    let ps: BallotPrivateState = withCredential(dasar, alamatBallot, credential);
    ps = withOpening(ps, alamatBallot, { option: BigInt(opsi), salt });
    ps = withEligibilityPath(ps, alamatBallot, jalurEligibility);
    // Opening DISIMPAN DI SINI, SEBELUM callTx.castVote() dipanggil di bawah —
    // lihat blok komentar di kepala berkas untuk alasan urutan ini mengikat.
    await psp.set(BallotPrivateStateId, ps);
    onOpeningTersimpan?.({ alamatBallot, opsi, saltHex: bytesKeHex(salt) });

    onStatus?.("membuat-proof");
    onStatus?.("menyeimbangkan-wallet");
    // callTx.castVote() menjalankan RANTAI PENUH: witness -> proveTx (proof
    // server KITA) -> balanceTx (wallet) -> submitTx (wallet) ->
    // watchForTxData. midnight-js MELEMPAR CallTxFailedError bila status
    // akhir bukan SucceedEntirely (TransactionContextImpl[Submit](),
    // dist/index.mjs:741-756) — TIDAK mengembalikannya sebagai nilai.
    const r = await ballot.callTx.castVote();
    onStatus?.("mengirim");

    if (r.public.status !== SucceedEntirely) {
      throw new GalatCastVote(
        `castVote finalized with status ${r.public.status}, not ${SucceedEntirely}.`,
        "ON_CHAIN",
      );
    }
    onStatus?.("menunggu-indexer");
    const nullifier = Ballot.pureCircuits.vote_nullifier(
      (await bacaLedgerBallotTulis(providers.publicDataProvider, alamatBallot)).ballotNonce,
      credential,
    );
    return { txId: r.public.txId, nullifierHex: bytesKeHex(nullifier) };
  } catch (e) {
    // Tidak ada cabang untuk kode "ARTEFAK_ZK": pada tahap itu `providers`
    // masih undefined, dan periksaMungkinSudahMasuk() sudah menjaga dirinya
    // sendiri dengan `if (!providers) return undefined` — hasil akhirnya
    // identik dengan short-circuit eksplisit, jadi short-circuit itu dibuang.
    const mungkinSudahMasuk = await periksaMungkinSudahMasuk(providers, alamatBallot, credential);
    if (e instanceof GalatCastVote) {
      throw new GalatCastVote(e.message, e.kode, e.cause, mungkinSudahMasuk ?? e.mungkinSudahMasuk);
    }
    throw new GalatCastVote(e instanceof Error ? e.message : String(e), "TIDAK_DIKENAL", e, mungkinSudahMasuk);
  }
}

/**
 * Dilempar bila tidak ada opening (opsi + salt) tersimpan di private state
 * lokal untuk ballot ini — satu-satunya sumber kebenaran yang bisa membuka
 * commitment suara pada fase tally. Dipisah dari `GalatCastVote` generik
 * karena UI (Task 8) HARUS bisa membedakan "belum dibuka" (state sementara
 * yang wajar — coba lagi setelah memulihkan opening) dari "gagal membuka"
 * (kesalahan transaksi/jaringan biasa). Menyamarkan keduanya di balik satu
 * tipe galat berarti pemilih yang openingnya hilang melihat pesan yang sama
 * dengan pemilih yang wallet-nya sekadar menolak — dan hanya salah satu dari
 * keduanya punya jalan keluar (pulihkan dari cadangan).
 */
export class GalatOpeningHilang extends Error {
  constructor(alamatBallot: string) {
    super(
      `No opening is stored for ballot ${alamatBallot} on this device. ` +
        "If you voted from a different device, or cleared this site's data, " +
        "restore it from the backup file downloaded when you voted (pulihkanOpeningDariCadangan).",
    );
    this.name = "GalatOpeningHilang";
  }
}

// Sama persis dengan NAMA_DB_PRIVATE_STATE di providers-tulis.ts — WAJIB
// identik, sebab pulihkanOpeningDariCadangan menulis ke penyimpan yang sama
// persis yang dibaca bukaSuara lewat rakitProvidersBallotBrowser. String
// literal (bukan impor) karena providers-tulis.ts tidak mengekspornya —
// duplikasi sengaja, bukan lupa disatukan (mengekspornya hanya untuk satu
// pemakai lagi tidak sepadan dengan menambah permukaan ekspor modul itu).
const NAMA_DB_PRIVATE_STATE = "votepriv-private-state";

/**
 * Menulis ulang opening dari berkas cadangan yang diunduh Task 8 saat
 * `kirimSuara` (lewat `onOpeningTersimpan`). Jalur pemulihan ini yang membuat
 * `tallyVote` masih mungkin dari PERANGKAT LAIN, atau dari perangkat yang
 * sama setelah IndexedDB-nya dibersihkan di antara castVote dan tallyVote.
 */
export async function pulihkanOpeningDariCadangan(cadangan: CadanganOpening): Promise<void> {
  const psp = buatPrivateStateProviderIdb<typeof BallotPrivateStateId, BallotPrivateState>(NAMA_DB_PRIVATE_STATE);
  psp.setContractAddress(cadangan.alamatBallot);
  const dasar = (await psp.get(BallotPrivateStateId)) ?? emptyBallotPrivateState(new Uint8Array(32));
  const ps = withOpening(dasar, cadangan.alamatBallot, {
    option: BigInt(cadangan.opsi),
    salt: hexKeBytes(cadangan.saltHex),
  });
  await psp.set(BallotPrivateStateId, ps);
}

export interface ParamBukaSuara {
  alamatBallot: string;
  jaringan: MidnightNetworkId;
  onStatus?: (tahap: TahapKirimSuara) => void;
}

export async function bukaSuara(params: ParamBukaSuara, wallet: WalletConnection): Promise<HasilKirimSuara> {
  const { alamatBallot, jaringan, onStatus } = params;

  try {
    onStatus?.("menyiapkan-artefak");
    try {
      await pastikanArtefakZkMurah(zkBaseUrl(), "tallyVote");
    } catch (e) {
      throw new GalatCastVote("The ZK artifacts for tallyVote could not be read.", "ARTEFAK_ZK", e);
    }

    const providers = await siapkanProviders(wallet, jaringan);

    // TANPA initialPrivateState: varian ini MEMBACA state tersimpan dan
    // MELEMPAR bila kosong (midnight-js-contracts dist/index.mjs,
    // setOrGetInitialPrivateState -> assertDefined) alih-alih menimpanya
    // dengan private state kosong seperti varian yang dipakai kirimSuara.
    // Menimpa di sini akan menghapus opening yang justru sedang dicari —
    // lihat blok komentar G1 di kepala berkas untuk alasan urutan yang sama
    // berlaku juga di sini, hanya arah akibatnya dibalik (di kirimSuara,
    // urutan yang benar MENDAHULUI penulisan; di sini, opsi yang benar
    // adalah TIDAK MENULIS sama sekali).
    const ballot = await findDeployedContract(providers, {
      compiledContract: kompilasiBallotBrowser(),
      contractAddress: alamatBallot,
      privateStateId: BallotPrivateStateId,
    });

    onStatus?.("menyusun-witness");
    const psp = providers.privateStateProvider;
    psp.setContractAddress(alamatBallot);
    const psTersimpan = await psp.get(BallotPrivateStateId);
    const opening = psTersimpan ? openingFor(psTersimpan, alamatBallot) : null;
    // SATU guard gabungan, sengaja bukan dua `if` terpisah: psTersimpan null
    // berarti belum pernah ada apa pun tersimpan untuk ballot ini; opening
    // null berarti privat state ADA tapi openingnya sendiri tidak (mis. state
    // lama dari format berbeda). Keduanya sama-sama "belum dibuka", bukan
    // "gagal membuka" — inilah titik yang membedakan keduanya bagi pemanggil:
    // galat spesifik dengan pesan yang menunjuk pemulihan, bukan melanjutkan
    // ke witness dengan opening kosong lalu gagal generik di dalam proof.
    // Digabung satu `if` (bukan dua guard berurutan) supaya TIDAK ADA jalan
    // bagi salah satu cabang untuk diam-diam menutupi mutasi pada cabang lain
    // — dua guard terpisah yang kebetulan menolak skenario uji yang sama
    // berarti mem-nol-kan salah satunya tidak pernah membuat uji itu merah.
    if (!psTersimpan || !opening) throw new GalatOpeningHilang(alamatBallot);

    onStatus?.("membaca-eligibility");
    // Nullifier di sini (vote_commitment) HANYA dipakai untuk mencari letak
    // commitment di pohon — bukan nullifier yang dipakai castVote
    // (vote_nullifier, dari ballotNonce+credential) dan bukan pula nullifier
    // yang dipublikasikan tallyVote (tally_nullifier, dari salt saja).
    const commitment = Ballot.pureCircuits.vote_commitment(opening.option, opening.salt);
    const jalurCommitment = await ambilJalurCommitment(providers.publicDataProvider, alamatBallot, commitment);
    await psp.set(BallotPrivateStateId, withCommitmentPath(psTersimpan, alamatBallot, jalurCommitment));

    onStatus?.("membuat-proof");
    onStatus?.("menyeimbangkan-wallet");
    const r = await ballot.callTx.tallyVote();
    onStatus?.("mengirim");

    if (r.public.status !== SucceedEntirely) {
      throw new GalatCastVote(
        `tallyVote finalized with status ${r.public.status}, not ${SucceedEntirely}.`,
        "ON_CHAIN",
      );
    }
    onStatus?.("menunggu-indexer");
    // tally_nullifier(salt) — BUKAN vote_nullifier(ballotNonce, credential)
    // yang dipakai castVote. Dua nullifier, dua Set on-chain terpisah
    // (nullifiers vs tallyNullifiers), diturunkan dari dua rahasia yang
    // berbeda; lihat ballot.compact untuk assert kedua fase.
    const tnf = Ballot.pureCircuits.tally_nullifier(opening.salt);
    return { txId: r.public.txId, nullifierHex: bytesKeHex(tnf) };
  } catch (e) {
    // GalatOpeningHilang TIDAK dibungkus ulang jadi GalatCastVote generik:
    // Task 8 butuh bisa membedakan tipe ini secara spesifik (instanceof) untuk
    // menampilkan teks pemulihan, bukan pesan kegagalan transaksi biasa.
    if (e instanceof GalatOpeningHilang) throw e;
    if (e instanceof GalatCastVote) throw e;
    throw new GalatCastVote(e instanceof Error ? e.message : String(e), "TIDAK_DIKENAL", e);
  }
}

// ─── Pendaftaran mandiri: pemilih membuat credential-nya sendiri ───────────
//
// Pola BARU (lihat .superpowers/register-leaves-cli.md dan
// .superpowers/signdata-determinisme.md untuk latar lengkapnya): kontrak
// registerVoters HANYA menerima leaf (cred_leaf(credential)), bukan
// credential itu sendiri — jadi penyelenggara tidak perlu lagi memegang
// rahasia siapa pun, ASALKAN pemilih dapat membuat credential-nya sendiri
// dan menyerahkan leaf-nya. Fungsi di bawah mewujudkan sisi pemilih dari pola
// itu, dan hidup DI SINI — bukan di modul yang terjangkau statis dari entri —
// semata-mata karena menghitung leaf memanggil Ballot.pureCircuits.cred_leaf
// (lewat daunEligibility), yang menarik compact-runtime persis seperti
// castVote/tallyVote di atas.
//
// Credential TIDAK PERNAH menyentuh rantai atau jaringan apa pun di sini —
// hanya disimpan lokal (kredensial-idb.ts, database TERPISAH dari private
// state midnight-js; lihat komentar di kepala berkas itu untuk alasannya) dan
// dikembalikan ke pemanggil (UI) untuk ditampilkan sebagai cadangan yang
// BOLEH diunduh pemiliknya. Leaf-nya publik dengan sengaja: pemilih
// mengirimkannya ke penyelenggara DI LUAR sistem ini, dan penyelenggara
// menjalankan `pnpm cli register-leaves` (lihat pkgs/cli/src/register-leaves.ts).

export interface HasilRegistrasiMandiri {
  /** SATU-SATUNYA rahasia di objek ini — jangan pernah di-log, dikirim ke jaringan, atau ditampilkan apa adanya di layar. */
  credentialHex: string;
  /** Publik — aman dikirim ke penyelenggara. */
  leafHex: string;
  /** false ketika credential yang dipakai SUDAH ADA sebelumnya di perangkat ini untuk ballot ini (bukan baru dibuat). */
  kredensialBaru: boolean;
}

function hasilRegistrasiDari(kredensial: Uint8Array, kredensialBaru: boolean): HasilRegistrasiMandiri {
  return {
    credentialHex: bytesKeHex(kredensial),
    leafHex: bytesKeHex(daunEligibility(kredensial)),
    kredensialBaru,
  };
}

/**
 * Mendaftarkan diri sendiri untuk SATU ballot: memakai credential yang SUDAH
 * ADA di perangkat ini untuk ballot ini bila ada (kredensialBaru: false), dan
 * HANYA membuat yang baru — lewat buatCredential(), CSPRNG 32 byte dipakai
 * apa adanya (pkgs/shared/src/credentials.ts) — ketika benar-benar belum ada
 * satu pun tersimpan.
 *
 * GUARD INI MENGIKAT: membuat credential baru padahal sudah ada satu
 * tersimpan akan menghasilkan LEAF BERBEDA dari yang mungkin sudah diserahkan
 * ke penyelenggara — credential-nya acak (buatCredential), jadi leaf turunan
 * cred_leaf-nya juga tidak akan pernah sama antara dua panggilan. Penyelenggara
 * yang sudah menjalankan register-leaves dengan leaf LAMA tidak akan pernah
 * mendaftarkan leaf BARU ini, dan castVote pemilih akan ditolak tanpa satu
 * pun petunjuk mengapa (lihat eligibility-tulis.ts, ambilJalurEligibility,
 * yang melempar persis pada leaf yang tidak ditemukan di pohon).
 */
export async function daftarkanDiriSendiri(alamatBallot: string): Promise<HasilRegistrasiMandiri> {
  const store = buatKredensialStoreIdb(NAMA_DB_KREDENSIAL);
  const tersimpan = await store.ambilKredensial(alamatBallot);
  if (tersimpan) return hasilRegistrasiDari(tersimpan, false);
  const kredensial = buatCredential();
  await store.simpanKredensial(alamatBallot, kredensial);
  return hasilRegistrasiDari(kredensial, true);
}

/** Bentuk berkas cadangan credential — SAMA PERSIS dengan yang RegisterModal.tsx unduh (lihat komentar salinan strukturalnya di sana). */
export interface CadanganKredensial {
  alamatBallot: string;
  credentialHex: string;
}

/**
 * Menulis ulang credential dari berkas cadangan ke store lokal — untuk
 * perangkat yang belum pernah menyimpan credential ballot ini (pemilih
 * berpindah browser/perangkat, atau membersihkan data situs sejak mendaftar).
 *
 * `alamatBallotDiminta` WAJIB cocok dengan `cadangan.alamatBallot`: tanpa
 * pemeriksaan ini, mengunggah berkas cadangan MILIK BALLOT LAIN akan diam-diam
 * tersimpan di bawah alamat ballot lain itu (bukan ballot yang sedang dibuka
 * pemilih) lalu menampilkan leaf yang tidak berhubungan dengan ballot yang
 * sedang ia lihat — pemilih bisa mengira itu leaf ballot ini dan
 * mengirimkannya ke penyelenggara yang salah.
 */
export async function pulihkanKredensialDariCadangan(
  alamatBallotDiminta: string,
  cadangan: CadanganKredensial,
): Promise<HasilRegistrasiMandiri> {
  if (cadangan.alamatBallot !== alamatBallotDiminta) {
    throw new Error(
      `This backup file is for ballot ${cadangan.alamatBallot}, not the ballot currently being registered (${alamatBallotDiminta}).`,
    );
  }
  const kredensial = hexKeBytes(cadangan.credentialHex);
  await buatKredensialStoreIdb(NAMA_DB_KREDENSIAL).simpanKredensial(alamatBallotDiminta, kredensial);
  return hasilRegistrasiDari(kredensial, false);
}

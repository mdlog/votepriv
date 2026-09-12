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
  withCredential,
  withEligibilityPath,
  withOpening,
  type BallotPrivateState,
} from "@pkgs/contract/src/ballot-witnesses.js";
import * as Ballot from "@pkgs/contract/src/managed/ballot/contract/index.js";
import { MIDNIGHT_NETWORK_ENDPOINTS, type MidnightNetworkId } from "@pkgs/shared/src/network-config";
import type { WalletConnection } from "@/lib/midnight-wallet";
import { PROOF_SERVER_PATH } from "@/lib/proof-server";
import { buatAdaptorLace } from "./adaptor-lace";
import { ambilJalurEligibility, bacaLedgerBallotTulis } from "./eligibility-tulis";
import { kompilasiBallotBrowser } from "./kontrak-tulis";
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
    throw new GalatCastVote("Credential harus 64 karakter heksadesimal (32 byte).", "TIDAK_DIKENAL");
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
        "Artefak ZK untuk castVote tidak terbaca — periksa /zk/ballot/keys/castVote.verifier.",
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
        `castVote difinalisasi dengan status ${r.public.status}, bukan ${SucceedEntirely}.`,
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

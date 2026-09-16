import crypto from "node:crypto";
import {
  deployContract,
  findDeployedContract,
  type DeployContractOptionsWithPrivateState,
  type DeployedContract,
  type FinalizedCallTxData,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import {
  Ballot,
  BallotPrivateStateId,
  Registry,
  RegistryPrivateStateId,
  emptyBallotPrivateState,
  emptyRegistryPrivateState,
  type BallotPrivateState,
} from "contract";
import type { Logger } from "pino";
import { detikSekarang, validasiBahasaMetadata, type MetadataBallot } from "shared";
import { pastikanAlamatKontrak } from "./artefak.ts";
import { kompilasiBallot, kompilasiRegistry, type BallotC, type RegistryC } from "./kontrak.ts";
import type { ProvidersBallot, ProvidersRegistry } from "./providers.ts";
import { BATAS_MS, denganBatasWaktu, kirimDenganRetri, type StatusMendarat } from "./tunggu.ts";
import type { KonteksWallet } from "./wallet.ts";

export type LedgerRegistry = ReturnType<typeof Registry.ledger>;

export interface HasilDeployRegistry {
  readonly alamat: string;
  /** Handle lengkap dari deploy — sudah memuat callTx. Jangan dibuang. */
  readonly kontrak: DeployedContract<RegistryC>;
}

/**
 * Titik injeksi untuk `deployContract`, semata supaya `deployRegistry` bisa
 * diuji tanpa jaringan (lihat deploy.test.ts: memastikan pembungkus
 * `denganBatasWaktu` di bawah tidak bisa dihapus tanpa membuat satu uji pun
 * gagal). Pemanggil produksi tidak pernah meneruskan argumen ketiga —
 * bawaannya `deployContract` yang asli.
 */
type FungsiDeployKontrak = (
  providers: ProvidersRegistry,
  options: DeployContractOptionsWithPrivateState<RegistryC>,
) => Promise<DeployedContract<RegistryC>>;

/**
 * Opsi retri untuk `deployRegistry`/`deployBallot`. Lihat `sudahMendaratDeploy`
 * di bawah untuk kenapa satu-satunya sinyal yang tersedia di sini adalah DUST,
 * dan kenapa itu jauh lebih lemah daripada pemeriksaan ledger PASTI yang
 * dipakai `daftarkanVoter`/`catatKeRegistry`.
 */
export interface OpsiRetriDeploy {
  /**
   * Membaca saldo DUST SAAT INI. Opsional: bila tidak diberikan, retri pada
   * putus koneksi tetap terjadi (diklasifikasi murni dari bentuk galat), tapi
   * pemeriksaan "sudah mendarat" SELALU "tidakPasti" — lihat
   * `sudahMendaratDeploy`. Pemanggil produksi (deploy-ballot.ts,
   * deploy-registry.ts) memberikannya lewat pembacaan `wallet.state()`.
   */
  readonly bacaDust?: () => Promise<bigint>;
  readonly maksPercobaan?: number;
  readonly jedaMs?: number;
}

/**
 * "sudahMendarat" untuk deploy (deployBallot/deployRegistry).
 *
 * BEDA MENDASAR dari daftarkanVoter/catatKeRegistry di bawah: alamat kontrak
 * BARU tidak diketahui sebelum `deployFn` berhasil kembali (dihitung dari
 * konten transaksi + state wallet SAAT deploy — lihat createUnprovenLedgerDeployTx
 * di @midnight-ntwrk/midnight-js-contracts), jadi TIDAK ADA pembacaan ledger
 * yang bisa memastikan "apakah KONTRAK INI ada" seperti pada dua fungsi lain.
 *
 * Satu-satunya sinyal yang tersedia tanpa alamat adalah saldo DUST: DUST
 * HANYA bertambah lewat akrual waktu (lihat `dust.balance()` di wallet.ts) dan
 * HANYA berkurang lewat biaya transaksi yang benar-benar mendarat. Jadi:
 *   - DUST turun sejak sebelum percobaan ini -> ADA biaya terpakai -> "tidakPasti"
 *     (BERHENTI: kontrak KEDUA yang ter-deploy membakar biaya dua kali DAN
 *     meninggalkan yang pertama yatim, tidak tercatat di mana pun).
 *   - DUST tetap atau naik -> tidak ada biaya terpakai -> "belum" (aman diulang).
 *   - `bacaDust` tidak diberikan sama sekali -> "tidakPasti" TANPA syarat: tanpa
 *     sinyal apa pun, berhenti adalah pilihan aman, mengulang membabi buta
 *     bukan.
 *
 * INI LEBIH LEMAH daripada pemeriksaan `daftarkanVoter`/`catatKeRegistry`
 * (yang membaca KEBERADAAN nyata di ledger, bukan proksi saldo) — lihat
 * "Yang TIDAK dilindungi" di .superpowers/retry-submit-cli.md. Karena itu
 * `"mendarat"` TIDAK PERNAH dikembalikan di sini (tipe kembaliannya generik
 * atas `T` justru supaya itu terlihat di tanda tangan fungsi): bahkan bila
 * DUST membuktikan sesuatu terpakai, kita tetap tidak tahu ALAMATNYA, jadi
 * tidak ada `T` yang bisa direkonstruksi untuk dipakai sebagai hasil.
 */
function sudahMendaratDeploy<T>(
  bacaDust: (() => Promise<bigint>) | undefined,
  dustAwal: bigint | undefined,
): () => Promise<StatusMendarat<T>> {
  return async () => {
    if (bacaDust === undefined || dustAwal === undefined) {
      return {
        status: "tidakPasti",
        alasan:
          "bacaDust not provided, and the new contract address is unknown until deployFn succeeds — no way to confirm whether the deploy landed",
      };
    }
    let dustSekarang: bigint;
    try {
      dustSekarang = await bacaDust();
    } catch (e) {
      return { status: "tidakPasti", alasan: `DUST balance read failed: ${(e as Error).message}` };
    }
    if (dustSekarang < dustAwal) {
      return {
        status: "tidakPasti",
        alasan: `DUST balance dropped from ${dustAwal} to ${dustSekarang} since before this attempt — the fee was probably spent (the transaction may have landed at an address not yet known)`,
      };
    }
    return { status: "belum" };
  };
}

/**
 * Deploy kontrak registry.
 *
 * Memakai overload BER-private-state, bukan yang tanpa. Overload pertama
 * dibatasi `Contract<undefined>`; RegistryPrivateState adalah
 * `Record<string, never>`, dan itu BUKAN `undefined` — jadi registry pun wajib
 * lewat jalur privateStateId + initialPrivateState.
 *
 * TIDAK ADA field `args` di sini: `initialState` registry tidak menerima
 * parameter selain context, sehingga `Contract.InitializeParameters` melebur
 * jadi `[]` dan tipe opsinya tidak punya kunci `args` sama sekali —
 * menambahkan `args: []` adalah galat properti berlebih, bukan no-op.
 *
 * `signingKey` dibiarkan kosong: deployContract mengambil sampel sendiri dan
 * menyimpannya di privateStateProvider di bawah alamat baru.
 *
 * Retri (lihat OpsiRetriDeploy/sudahMendaratDeploy di atas): dibungkus
 * `kirimDenganRetri`, TAPI hanya mengulang pada galat berbentuk putus koneksi
 * (`putusKoneksiAmanDiulang`) — timeout `denganBatasWaktu` di bawah TIDAK
 * cocok pola itu, jadi regresi yang dijaga deploy.test.ts (menghapus
 * `denganBatasWaktu`) tetap terdeteksi tanpa berubah.
 */
export async function deployRegistry(
  providers: ProvidersRegistry,
  log: Logger,
  // Cast eksplisit: deployContract asli adalah generik + overload, dan tsc
  // tidak bisa menyempitkannya sendiri ke bentuk non-generik FungsiDeployKontrak
  // sebagai nilai bawaan parameter. Ini murni keterbatasan inferensi tipe di
  // titik deklarasi — pemanggilan sesungguhnya (RegistryC konkret) tetap
  // diperiksa penuh lewat FungsiDeployKontrak di posisi parameter.
  deployFn: FungsiDeployKontrak = deployContract as FungsiDeployKontrak,
  opsi: OpsiRetriDeploy = {},
): Promise<HasilDeployRegistry> {
  log.info(
    { batasMenit: BATAS_MS.deploy / 60_000 },
    "Deploying the registry contract (building the transaction, proving, waiting for finalisation — expect minutes)",
  );

  const dustAwal = opsi.bacaDust ? await opsi.bacaDust() : undefined;

  const kontrak = await kirimDenganRetri({
    kirim: () =>
      denganBatasWaktu(
        deployFn(providers, {
          compiledContract: kompilasiRegistry(),
          privateStateId: RegistryPrivateStateId,
          initialPrivateState: emptyRegistryPrivateState(),
        }),
        BATAS_MS.deploy,
        `deployContract(registry) did not finish within ${BATAS_MS.deploy / 60_000} minutes. watchForDeployTxData waits forever by design, so this usually means consensus rejected the transaction or the proof server/indexer is not answering. Do NOT resubmit before checking the chain: the transaction may already have landed.`,
      ),
    sudahMendarat: sudahMendaratDeploy<DeployedContract<RegistryC>>(opsi.bacaDust, dustAwal),
    log,
    label: "deployContract(registry)",
    maksPercobaan: opsi.maksPercobaan,
    jedaMs: opsi.jedaMs,
  });

  const alamat = pastikanAlamatKontrak(kontrak.deployTxData.public.contractAddress);
  log.info(
    {
      alamat,
      txId: kontrak.deployTxData.public.txId,
      status: kontrak.deployTxData.public.status,
      blockHeight: kontrak.deployTxData.public.blockHeight,
    },
    "Registry deployed",
  );
  return { alamat, kontrak };
}

/**
 * Menemukan registry yang sudah ter-deploy.
 *
 * HANYA untuk registry yang di-deploy pada SESI LAIN. Bila registry baru saja
 * di-deploy pada proses ini, pakai `kontrak` dari `deployRegistry` — fungsi ini
 * mengulang lima perjalanan pulang-pergi ke indexer tanpa perlu.
 *
 * `initialPrivateState` SELALU disertakan (varian "store"), bukan hanya
 * `privateStateId`. Alasannya: varian yang hanya membawa privateStateId
 * MELEMPAR bila belum ada apa pun tersimpan di pasangan (alamat, id) itu — dan
 * itu keadaan normal untuk direktori private state yang baru atau mesin lain.
 * Private state registry kosong, jadi menuliskannya ulang tidak menghilangkan
 * apa pun.
 */
export async function temukanRegistry(
  providers: ProvidersRegistry,
  alamat: string,
): Promise<FoundContract<RegistryC>> {
  return denganBatasWaktu(
    findDeployedContract(providers, {
      compiledContract: kompilasiRegistry(),
      contractAddress: pastikanAlamatKontrak(alamat),
      privateStateId: RegistryPrivateStateId,
      initialPrivateState: emptyRegistryPrivateState(),
    }),
    BATAS_MS.temukan,
    `findDeployedContract(registry ${alamat}) did not finish within ${BATAS_MS.temukan / 60_000} minutes. Check the indexer and make sure the address belongs to this network — findDeployedContract waits on watchForDeployTxData, which never times out by itself.`,
  );
}

/**
 * Membaca ledger registry dari indexer.
 *
 * `queryContractState` mengembalikan `ContractState | null`; `.data` bertipe
 * `ChargedState`, dan `ledger()` hasil compactc menerima `StateValue` MAUPUN
 * `ChargedState` — baris pertama fungsi `ledger` yang dihasilkan compactc
 * (`pkgs/contract/src/managed/registry/contract/index.js:222-224`) melakukan
 * percabangan `instanceof StateValue` justru untuk itu. Tidak ada cast yang
 * dibutuhkan di sini, dan tidak boleh ada yang ditambahkan: cast akan
 * menyembunyikan kesalahan nyata (mis. state milik kontrak lain) alih-alih
 * memunculkannya.
 */
export async function bacaLedgerRegistry(
  publicDataProvider: PublicDataProvider,
  alamat: string,
): Promise<LedgerRegistry> {
  const st = await denganBatasWaktu(
    publicDataProvider.queryContractState(pastikanAlamatKontrak(alamat)),
    BATAS_MS.bacaIndexer,
    `queryContractState(${alamat}) did not answer within ${BATAS_MS.bacaIndexer / 1000} seconds.`,
  );
  if (st === null) throw new Error(`Registry ${alamat} is not visible on the indexer yet`);
  return Registry.ledger(st.data);
}

/**
 * Ambang "terlihat seperti milidetik". Detik sejak epoch pada 2026 berkisar
 * 1,7e9; milidetik 1,7e12. 1e11 memisahkan keduanya dengan margin besar dan
 * tetap menerima tanggal detik sampai tahun 5138.
 */
const AMBANG_MILIDETIK = 100_000_000_000n;

/**
 * Menegakkan di sisi CLI keempat batas yang ditolak constructor ballot, plus
 * dua pemeriksaan yang TIDAK ditegakkan kontrak tapi sama fatalnya.
 *
 * Kenapa di sini dan bukan sekadar membiarkan kontrak menolak: seluruh field
 * yang ditulis constructor bersifat `sealed`. Nilai keliru tidak pernah bisa
 * diperbaiki setelah deploy — satu-satunya jalan keluar adalah men-deploy
 * ballot baru dan meninggalkan yang lama beserta seluruh suara di dalamnya.
 * Pesan kontrak ("Option count must be between 2 and 4") tidak menyebut field mana
 * pada objek metadata yang salah; pesan di sini menyebutnya.
 *
 * `jumlahCredential` opsional karena hanya pemanggil yang tahu berapa
 * credential yang akan didaftarkan; bila diberikan, ia menutup satu kegagalan
 * yang baru muncul SATU TRANSAKSI KEMUDIAN (registerVoters ditolak
 * "Registration would exceed the ballot's eligibleCount", pada ballot yang sudah
 * telanjur ter-deploy dan tidak bisa diperbaiki).
 */
export function validasiMetadata(meta: MetadataBallot, jumlahCredential?: number): void {
  if (meta.options.length < 2 || meta.options.length > 4) {
    throw new Error(`There must be 2 to 4 options (the contract rejects with "Option count must be between 2 and 4"); the metadata has ${meta.options.length}.`);
  }
  if (meta.options.some((o) => o.trim() === "")) {
    // optionCount di-seal terpisah dari label. nOptions=4 dengan o2/o3 kosong
    // DITERIMA kontrak, dan castVote lalu mengizinkan opsi tanpa label.
    throw new Error("Option labels must not be empty — optionCount is derived from the number of labels.");
  }
  if (meta.tallyDeadline <= meta.voteDeadline) {
    throw new Error(
      `tallyDeadline must be after the vote deadline (voteDeadline). Got voteDeadline=${meta.voteDeadline}, tallyDeadline=${meta.tallyDeadline}.`,
    );
  }
  if (meta.voteDeadline >= AMBANG_MILIDETIK || meta.tallyDeadline >= AMBANG_MILIDETIK) {
    throw new Error(
      "voteDeadline/tallyDeadline must be in SECONDS since the epoch, not milliseconds. Use detikDariSekarang() from the shared package.",
    );
  }
  // Baru diperiksa SETELAH satuannya dipastikan detik (guard di atas): deadline
  // yang sudah lewat lolos kompilasi DAN lolos seluruh assert kontrak (kontrak
  // tidak pernah membandingkan deadline terhadap waktu deploy), lalu ballot
  // yang baru dibayar itu langsung berada di fase "voting sudah tutup".
  const sekarang = detikSekarang();
  if (meta.voteDeadline <= sekarang) {
    throw new Error(
      `voteDeadline has already passed; it must be in the future. Got voteDeadline=${meta.voteDeadline}, now=${sekarang}.`,
    );
  }
  if (!Number.isInteger(meta.eligibleCount)) {
    throw new Error(`eligibleCount must be an integer; got ${meta.eligibleCount}.`);
  }
  if (meta.eligibleCount < 1) throw new Error("eligibleCount must be at least 1.");
  if (meta.eligibleCount > 1024) throw new Error("eligibleCount exceeds the eligibility tree capacity (1024).");
  if (!Number.isInteger(meta.quorumPercent)) {
    throw new Error(`quorumPercent must be an integer; got ${meta.quorumPercent}.`);
  }
  if (meta.quorumPercent < 0) {
    throw new Error(`quorumPercent must not be negative; got ${meta.quorumPercent}.`);
  }
  if (meta.quorumPercent > 100) throw new Error(`quorumPercent must not exceed 100; got ${meta.quorumPercent}.`);
  if (jumlahCredential !== undefined && jumlahCredential > meta.eligibleCount) {
    throw new Error(
      `eligibleCount (${meta.eligibleCount}) is smaller than the number of credentials to register (${jumlahCredential}); the contract would reject registerVoters.`,
    );
  }
}

export interface BatchDaun {
  readonly leaves: Uint8Array[];
  readonly n: bigint;
}

/**
 * Memecah daun eligibility menjadi batch untuk registerVoters.
 *
 * Tipe TS-nya `Uint8Array[]`, tapi runtime kontrak menuntut Vector<8,Bytes<32>>:
 * array dengan panjang PERSIS 8, setiap elemen persis 32 byte. Tiga daun dengan
 * n=3 tanpa padding akan ditolak dengan "type error: ... expected value of type
 * Vector<8, Bytes<32>>". Circuit hanya menyisipkan `n` entri pertama; sisanya
 * padding nol yang tidak pernah masuk pohon.
 */
export function batchDaun(daun: readonly Uint8Array[]): BatchDaun[] {
  if (daun.length === 0) throw new Error("No eligibility leaves to register.");
  for (const [i, d] of daun.entries()) {
    if (d.length !== 32) throw new Error(`An eligibility leaf must be 32 bytes; entry ${i} is ${d.length} bytes.`);
  }

  const hasil: BatchDaun[] = [];
  for (let i = 0; i < daun.length; i += 8) {
    const potong = daun.slice(i, i + 8);
    hasil.push({
      leaves: Array.from({ length: 8 }, (_, j) => potong[j] ?? new Uint8Array(32)),
      n: BigInt(potong.length),
    });
  }
  return hasil;
}

/**
 * Kunci rahasia admin ballot, 32 byte, deterministik dari wallet.
 *
 * WAJIB stabil lintas proses: constructor ballot menyegel
 * adminKey = admin_pk(admin_secret_key()), dan registerVoters menolak siapa pun
 * yang tidak bisa mereproduksi kunci itu ("Only the admin can register
 * voters"). Kunci acak per proses berarti ballot yang baru di-deploy langsung
 * tidak bisa diisi pemilih, permanen.
 *
 * Diturunkan dari kunci rahasia unshielded dengan pemisah domain, bukan
 * disimpan di berkas: tidak ada rahasia baru yang perlu dijaga, dan pemilik
 * wallet yang sama selalu mendapat kunci admin yang sama. NILAI INI TIDAK
 * PERNAH BOLEH DICETAK ATAU MASUK LOG.
 */
export function kunciAdmin(ctx: KonteksWallet): Uint8Array {
  const rahasia = ctx.unshieldedKeystore.getSecretKey();
  return new Uint8Array(crypto.createHash("sha256").update("votepriv:admin:v1").update(rahasia).digest());
}

export type LedgerBallot = ReturnType<typeof Ballot.ledger>;

export interface HasilDeployBallot {
  readonly alamat: string;
  /**
   * Handle lengkap dari deploy — sudah memuat `callTx`, dan private state
   * awalnya sudah tertulis oleh deployContract. Pemanggil TIDAK perlu (dan
   * tidak boleh) memanggil `temukanBallot` untuk identitas yang sama pada
   * proses yang sama: itu lima perjalanan indexer yang percuma di dalam
   * jendela waktu yang sudah sempit.
   */
  readonly kontrak: DeployedContract<BallotC>;
}

/**
 * Titik injeksi untuk `deployContract` pada `deployBallot`, pola persis
 * `FungsiDeployKontrak` milik `deployRegistry` di atas — dan untuk alasan yang
 * sama persis (lihat komentar di sana): tanpa seam ini, menghapus
 * `denganBatasWaktu(...)` di sekeliling panggilan deploy tidak digagalkan tsc
 * ataupun satu uji pun (pembungkus itu transparan pada tipe kembalian), dan
 * itu justru regresi yang sudah pernah lolos sekali di riwayat proyek ini
 * (lihat deploy.test.ts). Pemanggil produksi tidak pernah meneruskan argumen
 * ketujuh — bawaannya `deployContract` yang asli.
 */
type FungsiDeployBallot = (
  providers: ProvidersBallot,
  options: DeployContractOptionsWithPrivateState<BallotC>,
) => Promise<DeployedContract<BallotC>>;

/**
 * Deploy ballot.
 *
 * 14 argumen POSISIONAL, urutannya wajib persis:
 *   title, description, community, option0, option1, option2, option3,
 *   optionCount, voteDeadline, tallyDeadline, quorumPercent, eligibleCount,
 *   eligibilityPolicy, ballotNonce
 * Tujuh string berurutan lalu lima bigint berurutan: tertukar di dalam salah
 * satu deret itu tetap lolos kompilasi DAN lolos seluruh assert kontrak.
 * `Opaque<"string">` juga tidak diperiksa tipenya saat runtime — TypeScript
 * satu-satunya yang menjaga. Karena itu argumen disusun dari objek bernama di
 * bawah, bukan ditulis inline di tempat pemanggilan.
 *
 * initialPrivateState WAJIB sudah membawa kunci admin yang benar: witness
 * admin_secret_key dibaca DI DALAM constructor (di bawah alamat dummy
 * 0000...0000), sehingga tidak ada kesempatan memperbaikinya setelah deploy.
 *
 * Metadata juga digerbang BAHASA di sini (`validasiBahasaMetadata`, paket
 * shared) sebelum args disusun: title/description/community/options[]/
 * eligibilityPolicy SEALED selamanya begitu transaksi ini mendarat, jadi
 * kata Indonesia yang lolos sampai sini permanen dan mahal untuk diperbaiki
 * (deploy ballot baru, tinggalkan yang lama). Lihat
 * .superpowers/audit-bahasa-metadata.md.
 *
 * Retri: parameter terakhir `opsiRetri` (namanya BUKAN `opsi` — nama itu
 * sudah dipakai variabel lokal array label opsi ballot di bawah). Sama
 * seperti `deployRegistry`: dibungkus `kirimDenganRetri`, hanya mengulang
 * pada putus koneksi, dan lihat `sudahMendaratDeploy` untuk kenapa
 * pemeriksaan "sudah mendarat"-nya cuma sinyal DUST, bukan pembacaan ledger
 * yang pasti.
 */
export async function deployBallot(
  providers: ProvidersBallot,
  meta: MetadataBallot,
  rahasiaAdmin: Uint8Array,
  nonce: Uint8Array,
  log: Logger,
  jumlahCredential?: number,
  // Cast eksplisit dengan alasan yang sama seperti default deployFn milik
  // deployRegistry: deployContract asli generik + overload, tsc tidak bisa
  // menyempitkannya sendiri sebagai nilai bawaan parameter di titik deklarasi.
  deployFn: FungsiDeployBallot = deployContract as FungsiDeployBallot,
  opsiRetri: OpsiRetriDeploy = {},
): Promise<HasilDeployBallot> {
  validasiMetadata(meta, jumlahCredential);
  validasiBahasaMetadata(meta);
  if (rahasiaAdmin.length !== 32) throw new Error("The admin secret key must be 32 bytes.");
  if (nonce.length !== 32) throw new Error("ballotNonce must be 32 bytes.");

  const opsi = [meta.options[0] ?? "", meta.options[1] ?? "", meta.options[2] ?? "", meta.options[3] ?? ""];

  log.info(
    {
      title: meta.title,
      options: meta.options,
      optionCount: meta.options.length,
      voteDeadline: meta.voteDeadline.toString(),
      tallyDeadline: meta.tallyDeadline.toString(),
      eligibleCount: meta.eligibleCount,
      quorumPercent: meta.quorumPercent,
      timeoutMinutes: BATAS_MS.deploy / 60_000,
    },
    "Deploying the ballot (deadlines in SECONDS since the epoch)",
  );

  const dustAwal = opsiRetri.bacaDust ? await opsiRetri.bacaDust() : undefined;

  const kontrak = await kirimDenganRetri({
    kirim: () =>
      denganBatasWaktu(
        deployFn(providers, {
          compiledContract: kompilasiBallot(),
          privateStateId: BallotPrivateStateId,
          initialPrivateState: emptyBallotPrivateState(rahasiaAdmin),
          args: [
            meta.title,
            meta.description,
            meta.community,
            opsi[0],
            opsi[1],
            opsi[2],
            opsi[3],
            BigInt(meta.options.length),
            meta.voteDeadline,
            meta.tallyDeadline,
            BigInt(meta.quorumPercent),
            BigInt(meta.eligibleCount),
            meta.eligibilityPolicy,
            nonce,
          ],
        }),
        BATAS_MS.deploy,
        `deployContract(ballot) did not finish within ${BATAS_MS.deploy / 60_000} minutes. Do NOT resubmit before checking the indexer: if the transaction landed, retrying deploys a SECOND ballot and burns the fee twice.`,
      ),
    sudahMendarat: sudahMendaratDeploy<DeployedContract<BallotC>>(opsiRetri.bacaDust, dustAwal),
    log,
    label: "deployContract(ballot)",
    maksPercobaan: opsiRetri.maksPercobaan,
    jedaMs: opsiRetri.jedaMs,
  });

  const alamat = pastikanAlamatKontrak(kontrak.deployTxData.public.contractAddress);
  log.info(
    { address: alamat, txId: kontrak.deployTxData.public.txId, status: kontrak.deployTxData.public.status },
    "Ballot deployed",
  );
  return { alamat, kontrak };
}

/**
 * Menemukan ballot yang sudah ter-deploy dan MENULIS private state awal.
 *
 * HANYA untuk identitas yang belum punya handle: ballot dari sesi lain, atau
 * store pemilih yang berbeda dari store admin. Untuk ballot yang baru di-deploy
 * pada proses ini, pakai `kontrak` dari `deployBallot`.
 *
 * PERHATIKAN URUTANNYA: varian ini menimpa apa pun yang tersimpan di
 * (alamat, BallotPrivateStateId). Panggil ini DULU, baru tulis credential /
 * opening / path pemilih. Terbalik = kredensial terhapus tepat sebelum dipakai.
 * Varian tanpa initialPrivateState MELEMPAR bila belum ada apa-apa tersimpan,
 * jadi ia bukan pilihan yang aman untuk store yang baru.
 */
export async function temukanBallot(
  providers: ProvidersBallot,
  alamat: string,
  privateStateAwal: BallotPrivateState,
): Promise<FoundContract<BallotC>> {
  return denganBatasWaktu(
    findDeployedContract(providers, {
      compiledContract: kompilasiBallot(),
      contractAddress: pastikanAlamatKontrak(alamat),
      privateStateId: BallotPrivateStateId,
      initialPrivateState: privateStateAwal,
    }),
    BATAS_MS.temukan,
    `findDeployedContract(ballot ${alamat}) did not finish within ${BATAS_MS.temukan / 60_000} minutes. Check the indexer; the watchForDeployTxData inside it never times out by itself.`,
  );
}

/** Sama seperti bacaLedgerRegistry: `.data` bertipe ChargedState dan `ledger()` menerimanya. */
export async function bacaLedgerBallot(
  publicDataProvider: PublicDataProvider,
  alamat: string,
): Promise<LedgerBallot> {
  const st = await denganBatasWaktu(
    publicDataProvider.queryContractState(pastikanAlamatKontrak(alamat)),
    BATAS_MS.bacaIndexer,
    `queryContractState(${alamat}) did not answer within ${BATAS_MS.bacaIndexer / 1000} seconds.`,
  );
  if (st === null) throw new Error(`Ballot ${alamat} is not visible on the indexer yet`);
  return Ballot.ledger(st.data);
}

/**
 * Mendaftarkan daun eligibility, maksimal delapan per transaksi.
 *
 * DAUN, BUKAN CREDENTIAL. Keduanya sama-sama Uint8Array 32 byte sehingga
 * meneruskan credential mentah lolos kompilasi, lolos proof, dan mendarat di
 * chain — lalu castVote tidak akan pernah bisa jalan, karena circuit memeriksa
 * `path.leaf == cred_leaf(cred)` dan findPathForLeaf(cred_leaf(cred)) akan
 * mengembalikan undefined selamanya. Pakai `daunEligibility(cred)` dari paket
 * shared (yang memanggil Ballot.pureCircuits.cred_leaf).
 *
 * Berurutan, tidak pernah Promise.all: (a) private state LevelDB dibuka-tutup
 * per operasi dan tabrakan lock melempar LEVEL_LOCKED; (b) penyeimbangan
 * unshielded tidak memindahkan UTXO ke status pending, sehingga dua transaksi
 * yang diseimbangkan sebelum yang pertama terlihat di chain dapat memilih UTXO
 * yang sama.
 *
 * registerVoters ditutup oleh voteDeadline (deadline yang sama dengan
 * castVote), BUKAN lagi oleh suara pertama — pemilih baru bisa didaftarkan
 * selama jendela vote masih terbuka.
 */
export interface OpsiRetriDaftarkanVoter {
  /**
   * Diberikan bersama: memungkinkan pemeriksaan "sudah mendarat" PASTI lewat
   * `registeredCount` (BUKAN sinyal lemah seperti pada deploy — alamat ballot
   * di sini SUDAH diketahui pemanggil). Bila salah satu/kedua tidak
   * diberikan, retri pada putus koneksi tetap terjadi tapi pemeriksaannya
   * selalu "tidakPasti" (berhenti, bukan mengulang membabi buta).
   */
  readonly publicDataProvider?: PublicDataProvider;
  readonly alamatBallot?: string;
  readonly maksPercobaan?: number;
  readonly jedaMs?: number;
}

/**
 * Aritmetika murni di balik pemeriksaan "sudah mendarat" `daftarkanVoter`,
 * diekspor terpisah supaya bisa diuji langsung dengan bigint biasa — tanpa
 * ledger ballot sungguhan (yang perlu compact-runtime nyata untuk diparsing,
 * di luar jangkauan uji unit pkgs/cli tanpa jaringan).
 *
 * `>=`, bukan `===`: batch yang sedang diperiksa adalah SATU-SATUNYA operasi
 * yang bisa menaikkan `registeredCount` ballot ini selagi berjalan
 * (daftarkanVoter berurutan, lihat komentar di atas fungsi itu), jadi
 * kenaikan sebesar `batchN` sudah cukup sebagai bukti — dan `>=` tetap benar
 * bila kelak ada margin ekstra.
 */
export function registerVotersMendarat(registeredSebelum: bigint, batchN: bigint, registeredSekarang: bigint): boolean {
  return registeredSekarang >= registeredSebelum + batchN;
}

export async function daftarkanVoter(
  ballot: FoundContract<BallotC>,
  daun: readonly Uint8Array[],
  log: Logger,
  opsi: OpsiRetriDaftarkanVoter = {},
): Promise<{ txIds: (string | null)[] }> {
  // txId per batch, `null` bila batch itu mendarat lewat pemeriksaan
  // "sudah mendarat" (percobaan asli putus sebelum node menjawab) — dipakai
  // inbox pendaftaran untuk melaporkan txId ke pemilih.
  const txIds: (string | null)[] = [];
  // BUKAN `Awaited<ReturnType<typeof ballot.callTx.registerVoters>>`: circuit
  // call di CircuitCallTxInterface (midnight-js-contracts) OVERLOADED — satu
  // signature tanpa TransactionContext (yang KITA pakai, mengembalikan
  // FinalizedCallTxData dengan `.public.txId`/`.public.status`) dan satu lagi
  // DENGAN TransactionContext (mengembalikan CallResult, `.public`-nya TIDAK
  // punya `txId`/`status`). ReturnType pada tipe fungsi overloaded mengambil
  // signature TERAKHIR, bukan yang benar-benar dipakai di bawah — memakainya
  // di sini diam-diam menghasilkan tipe yang salah dan gagal kompilasi tepat
  // di titik pemakaian `.public.txId` (dibuktikan sekali, lihat riwayat).
  type HasilRegisterVoters = FinalizedCallTxData<BallotC, "registerVoters">;

  const batch = batchDaun(daun);
  for (const [i, b] of batch.entries()) {
    log.info(
      { batch: i + 1, of: batch.length, n: Number(b.n), timeoutMinutes: BATAS_MS.panggilBerat / 60_000 },
      "Registering a batch of eligibility leaves (ZK proof 5-20 s, then finalisation — expect minutes)",
    );

    // Dasar pembanding "sudah mendarat" untuk BATCH INI, dibaca SEKALI sebelum
    // percobaan pertamanya. Valid sepanjang retri batch yang sama:
    // daftarkanVoter berjalan berurutan (lihat komentar di atas fungsi ini),
    // jadi tidak ada operasi lain yang bisa menaikkan registeredCount ballot
    // ini secara konkuren selagi batch ini berjalan.
    const registeredSebelum =
      opsi.publicDataProvider !== undefined && opsi.alamatBallot !== undefined
        ? (await bacaLedgerBallot(opsi.publicDataProvider, opsi.alamatBallot)).registeredCount
        : undefined;

    const r = await kirimDenganRetri<HasilRegisterVoters | undefined>({
      kirim: () =>
        denganBatasWaktu(
          ballot.callTx.registerVoters(b.leaves, b.n),
          BATAS_MS.panggilBerat,
          `callTx.registerVoters (batch ${i + 1}/${batch.length}) did not finish within ${BATAS_MS.panggilBerat / 60_000} minutes. Do NOT retry before reading registeredCount from the indexer — a batch that already landed would be registered twice and eat into the eligibleCount quota.`,
        ),
      sudahMendarat: async () => {
        if (opsi.publicDataProvider === undefined || opsi.alamatBallot === undefined || registeredSebelum === undefined) {
          return {
            status: "tidakPasti",
            alasan: "publicDataProvider/alamatBallot not provided — cannot read registeredCount",
          };
        }
        try {
          const lb = await bacaLedgerBallot(opsi.publicDataProvider, opsi.alamatBallot);
          if (registerVotersMendarat(registeredSebelum, b.n, lb.registeredCount)) {
            return { status: "mendarat", nilai: undefined };
          }
          return { status: "belum" };
        } catch (e) {
          return { status: "tidakPasti", alasan: `registeredCount read failed: ${(e as Error).message}` };
        }
      },
      log,
      label: `registerVoters batch ${i + 1}/${batch.length}`,
      maksPercobaan: opsi.maksPercobaan,
      jedaMs: opsi.jedaMs,
    });

    txIds.push(r?.public.txId ?? null);
    log.info(
      {
        batch: i + 1,
        txId: r?.public.txId ?? "(landed before the retry — the original attempt's txId is unknown)",
        status: r?.public.status ?? "(inferred from registeredCount, not from the node's reply)",
      },
      "Batch registered",
    );
  }
  return { txIds };
}

/**
 * Mencatat alamat ballot ke registry. Permissionless dan tanpa validasi apa
 * pun di sisi kontrak: mendaftarkan alamat yang sama dua kali menghasilkan dua
 * entri, dan `count` bertambah dua. Penyaringan duplikat adalah tanggung jawab
 * klien (registry.compact menyatakan itu secara eksplisit).
 *
 * KARENA `count` bertambah juga pada entri duplikat siapa pun (di atas),
 * pemeriksaan "sudah mendarat" TIDAK BOLEH memakai `count` sendirian —
 * count yang naik tidak membuktikan ENTRI KITA yang menaikkannya, hanya
 * bahwa SESUATU mendarat. `registry.compact` memakai `ballots.pushFront`,
 * jadi entri kita (bila mendarat) selalu ada di daftar; pemeriksaan di bawah
 * mengecek KEANGGOTAAN `alamatBallot` di `ballots`, bukan `count`.
 */
export interface OpsiRetriCatatKeRegistry {
  /** Lihat catatan `OpsiRetriDaftarkanVoter` — pola dan alasannya sama. */
  readonly publicDataProvider?: PublicDataProvider;
  readonly alamatRegistry?: string;
  readonly maksPercobaan?: number;
  readonly jedaMs?: number;
}

/**
 * Keanggotaan murni di balik pemeriksaan "sudah mendarat" `catatKeRegistry`,
 * diekspor terpisah supaya bisa diuji dengan array string biasa (yang juga
 * `Iterable<string>`) — tanpa ledger registry sungguhan. Lihat komentar di
 * atas `catatKeRegistry` untuk kenapa ini keanggotaan, BUKAN `count`.
 */
export function ballotSudahTercatat(ballots: Iterable<string>, alamatBallot: string): boolean {
  for (const a of ballots) {
    if (a === alamatBallot) return true;
  }
  return false;
}

export async function catatKeRegistry(
  registry: FoundContract<RegistryC>,
  alamatBallot: string,
  log: Logger,
  opsi: OpsiRetriCatatKeRegistry = {},
): Promise<void> {
  // Lihat catatan di HasilRegisterVoters (daftarkanVoter, atas) — alasan yang
  // sama persis melarang `Awaited<ReturnType<typeof registry.callTx.register>>`.
  type HasilRegister = FinalizedCallTxData<RegistryC, "register">;

  log.info({ ballotAddress: alamatBallot }, "Recording the ballot in the registry (ZK proof, then finalisation)");

  const r = await kirimDenganRetri<HasilRegister | undefined>({
    kirim: () =>
      denganBatasWaktu(
        registry.callTx.register(pastikanAlamatKontrak(alamatBallot)),
        BATAS_MS.panggilRingan,
        `callTx.register (registry) did not finish within ${BATAS_MS.panggilRingan / 60_000} minutes. Retrying would add a SECOND entry for the same ballot — check registry.count first.`,
      ),
    sudahMendarat: async () => {
      if (opsi.publicDataProvider === undefined || opsi.alamatRegistry === undefined) {
        return {
          status: "tidakPasti",
          alasan: "publicDataProvider/alamatRegistry not provided — cannot read the ballot list",
        };
      }
      try {
        const lr = await bacaLedgerRegistry(opsi.publicDataProvider, opsi.alamatRegistry);
        if (ballotSudahTercatat(lr.ballots, alamatBallot)) {
          return { status: "mendarat", nilai: undefined };
        }
        return { status: "belum" };
      } catch (e) {
        return { status: "tidakPasti", alasan: `registry read failed: ${(e as Error).message}` };
      }
    },
    log,
    label: "register (registry)",
    maksPercobaan: opsi.maksPercobaan,
    jedaMs: opsi.jedaMs,
  });

  log.info(
    {
      txId: r?.public.txId ?? "(landed before the retry — the original attempt's txId is unknown)",
      status: r?.public.status ?? "(inferred from membership in registry.ballots, not from the node's reply)",
    },
    "Ballot recorded in the registry",
  );
}

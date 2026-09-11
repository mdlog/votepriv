import { jaringanAktif, alamatKontrakValid, type JaringanAktif } from "./endpoint";
import { GalatRantai, postGraphQL } from "./graphql";
import { dekodeBallot, dekodeRegistry, type KeadaanBallot } from "./dekode";
import {
  KUERI_JARINGAN,
  KUERI_REGISTRY,
  susunKueriBallot,
  type AksiKontrak,
  type JawabanJaringan,
  type KontrakTerbaca,
} from "./kueri";

export type BallotGagal = {
  alamat: string;
  sebab: "alamat-tak-sah" | "alias-hilang" | "kontrak-null" | "dekode";
  pesan: string;
};

/**
 * Satu bidang ledger yang BERUBAH di antara dua aksi berurutan.
 *
 * Inilah isi Recent activity menurut spec 9.4 — "perubahan terbaru pada
 * voteCount, talliedCount, dan registry.count" — dan ia hanya bisa ada kalau
 * `state` per aksi benar-benar didekode, bukan dibuang.
 */
export type PerubahanAksi = {
  bidang: "voteCount" | "talliedCount" | "registeredCount" | "phase" | "count";
  dari: number;
  ke: number;
};

export type AksiTerbaca = {
  jenis: "ContractDeploy" | "ContractCall" | "ContractUpdate";
  /** null pada ContractDeploy dan ContractUpdate. */
  entryPoint: string | null;
  txHash: string;
  height: number;
  timestampMs: number;
  /** Nama yang ditampilkan sebagai asal aksi: judul ballot, atau "Registry". */
  sumber: string;
  /**
   * Bidang yang berubah dibanding aksi SEBELUMNYA di kontrak yang sama.
   *
   * Kosong berarti salah satu dari dua hal, dan keduanya dibedakan oleh
   * `pendahuluTerbaca`: tidak ada yang berubah, atau pendahulunya berada di luar
   * jendela `actions(limit: 5)` sehingga selisihnya TIDAK DIKETAHUI. UI wajib
   * mengatakan "unknown", bukan "no change", pada kasus kedua.
   */
  perubahan: PerubahanAksi[];
  pendahuluTerbaca: boolean;
  /** false bila `state` aksi ini gagal didekode; `perubahan` lalu selalu kosong. */
  cuplikanTerbaca: boolean;
};

export type BallotTerbaca = {
  alamat: string;
  keadaan: KeadaanBallot;
  /** Tinggi blok ContractDeploy. Sumber NOMOR URUT yang stabil (J2). */
  deployHeight: number;
  /**
   * Aksi terbaru yang SUDAH DIDEKODE dan diselisihkan, untuk Recent activity.
   *
   * KOSONG untuk ballot di luar jendela MAKS_BALLOT_BERAKSI — bagi mereka,
   * `terbaru` memang tidak pernah diminta dari indexer. Larik kosong di sini
   * berarti "tidak diambil", bukan "tidak ada aksi", dan tidak ada tempat di UI
   * yang menafsirkannya sebagai yang kedua.
   */
  aksi: AksiTerbaca[];
};

export type HasilRantai = {
  jaringan: JaringanAktif;
  registry: { count: number; alamat: string[]; aksi: AksiTerbaca[] };
  ballot: BallotTerbaca[];
  /** Tidak kosong berarti SEBAGIAN — bukan kegagalan. Daftar yang berhasil tetap tampil. */
  gagal: BallotGagal[];
  blok: { height: number; timestampMs: number };
  /** null bila POST 3 gagal; kartu network status menahan klaimnya, bukan mengarang. */
  epoch: { epochNo: number; durationSeconds: number; elapsedSeconds: number } | null;
  /**
   * Waktu dinding yang dipakai SELURUH turunan status.
   *
   * Diambil dari stempel waktu blok terbaru, BUKAN dari jam perangkat pembaca.
   * Alasannya bukan kerapian: kontrak memutuskan sah-tidaknya castVote dengan
   * kernel.blockTimeLessThan(), yaitu terhadap waktu BLOK. Jam perangkat yang
   * melenceng beberapa menit akan membuat UI berkata "Live now" pada ballot
   * yang kontraknya sudah menolak, atau sebaliknya.
   *
   * Bila POST 3 gagal, lihat komentar di atas perhitungan `sekarangMs` di bawah
   * fungsi ini — jatuhnya TIDAK BOLEH begitu saja ke stempel waktu aksi kontrak
   * TERBARU (tinggi tertinggi) yang kebetulan terlihat, karena itu bisa MUNDUR
   * berjam-jam dan membuka kembali celah "Live now" palsu yang komentar ini
   * coba tutup.
   */
  sekarangMs: number;
};

/** Batas jumlah alamat per dokumen GraphQL. */
const MAKS_ALAMAT_PER_DOKUMEN = 24;

/**
 * Batas jumlah ballot yang dibaca sama sekali.
 *
 * registry.register() permissionless dan registry.ballots tak berbatas panjang.
 * Spec 14.6 sudah menandai ini: alamat sampah yang tidak resolve akan
 * memperlambat Overview bila tidak dibatasi. Yang dipotong adalah EKOR daftar,
 * yaitu yang PALING LAMA karena List memakai pushFront — jadi ballot terbaru
 * selalu terbaca.
 */
const MAKS_BALLOT = 48;

/**
 * Berapa ballot yang riwayat aksinya benar-benar diambil DAN didekode.
 *
 * Setiap aksi membawa `state` ~11,5 KB dan menuntut satu dekode WASM. Mengambil
 * lima aksi untuk 48 ballot berarti 240 dekode untuk panel yang menampilkan tiga
 * baris. Yang dipilih adalah alamat PALING DEPAN di registry.ballots — yaitu yang
 * PALING BARU didaftarkan, karena List memakai pushFront — sehingga panel Recent
 * activity memang berisi yang terbaru.
 *
 * Biayanya digerbangi Task 5 Step 7 dengan anggaran yang perintah itu hitung
 * sendiri dari ukuran WASM terpasang.
 *
 * PENTING untuk pembaca uji: fixture rantai yang direkam (Task 4) hanya
 * memuat DUA ballot — jauh di bawah angka ini. Gerbang jendela Penuh/Ringkas
 * dan penghitungan lintas-dokumen (`sudahBerAksi` di bawah) karena itu
 * TIDAK PERNAH tereksekusi lewat fixture rekaman saja; keduanya diuji lewat
 * registry SINTETIS di baca-rantai.registry-sintetis.test.ts, bukan di
 * baca-rantai.test.ts. Lihat praperiksa P1.
 */
const MAKS_BALLOT_BERAKSI = 6;

function potong<T>(arr: T[], n: number): T[][] {
  const keping: T[][] = [];
  for (let i = 0; i < arr.length; i += n) keping.push(arr.slice(i, i + n));
  return keping;
}

/** Cuplikan ledger pada satu aksi. Hanya bidang yang spec 9.4 minta diselisihkan. */
type Cuplikan = Partial<Record<PerubahanAksi["bidang"], number>>;

function cuplikanBallot(stateHex: string, alamat: string): Cuplikan | null {
  try {
    const k = dekodeBallot(stateHex, alamat);
    return {
      voteCount: k.voteCount,
      talliedCount: k.talliedCount,
      registeredCount: k.registeredCount,
      phase: k.phase,
    };
  } catch {
    // State satu aksi boleh saja tidak terbaca tanpa membuat aksinya hilang:
    // barisnya tetap tampil, hanya tanpa selisih. Diuji tuntas (bukan hanya
    // bentuknya) di baca-rantai.test.ts — lihat praperiksa P5.
    return null;
  }
}

function cuplikanRegistry(stateHex: string, alamat: string): Cuplikan | null {
  try {
    return { count: dekodeRegistry(stateHex, alamat).count };
  } catch {
    return null;
  }
}

/**
 * Mengubah daftar aksi mentah menjadi aksi yang SUDAH DIDEKODE dan diselisihkan.
 *
 * `mentah` datang dari indexer dengan urutan TERBARU DI DEPAN. Selisih untuk
 * aksi ke-i dihitung terhadap aksi ke-(i+1), yaitu pendahulunya. Aksi paling tua
 * di dalam jendela tidak punya pendahulu yang terbaca, dan itu DINYATAKAN lewat
 * `pendahuluTerbaca: false` alih-alih dilaporkan sebagai "tidak ada perubahan".
 */
function keAksiTerbaca(
  mentah: AksiKontrak[],
  alamat: string,
  sumber: string,
  ambilCuplikan: (stateHex: string, alamat: string) => Cuplikan | null,
): AksiTerbaca[] {
  const cuplikan = mentah.map(a => ambilCuplikan(a.state, alamat));
  return mentah.map((a, i) => {
    const kini = cuplikan[i];
    const lalu = cuplikan[i + 1] ?? null;
    const perubahan: PerubahanAksi[] = [];
    if (kini && lalu) {
      for (const bidang of Object.keys(kini) as PerubahanAksi["bidang"][]) {
        const dari = lalu[bidang];
        const ke = kini[bidang];
        if (dari !== undefined && ke !== undefined && dari !== ke) perubahan.push({ bidang, dari, ke });
      }
    }
    return {
      jenis: a.__typename,
      entryPoint: a.entryPoint ?? null,
      txHash: a.transaction.hash,
      height: a.transaction.block.height,
      timestampMs: a.transaction.block.timestamp,
      sumber,
      perubahan,
      pendahuluTerbaca: kini !== null && lalu !== null,
      cuplikanTerbaca: kini !== null,
      // `state` mentah TIDAK diteruskan. Ia sudah dipakai habis di sini; membawanya
      // lebih jauh berarti ~11,5 KB per aksi menggantung di memori React tanpa
      // satu pun pembaca.
    };
  });
}

export async function bacaRantai(opsi: {
  jaringan?: JaringanAktif;
  signal?: AbortSignal;
  ambil?: typeof fetch;
} = {}): Promise<HasilRantai> {
  const jaringan = opsi.jaringan ?? jaringanAktif();
  const { signal, ambil } = opsi;
  const url = jaringan.indexer;

  // ── POST 1: registry ────────────────────────────────────────────────────
  const j1 = await postGraphQL<{ r: KontrakTerbaca | null }>({
    url,
    query: KUERI_REGISTRY,
    variables: { a: jaringan.alamatRegistry },
    signal,
    ambil,
  });
  // Kunci `r` yang HILANG dan `r` yang bernilai `null` adalah dua bentuk
  // kegagalan berbeda (graphql.ts:89-99), dan keduanya harus ditangkap di sini
  // — bukan hanya nilainya. Tipe `{ r: KontrakTerbaca | null }` menyatakan `r`
  // SELALU ada, jadi memeriksa `j1.data.r === null` saja lolos begitu saja bila
  // kuncinya justru hilang: TypeScript menyempitkan `registryTerbaca` ke
  // non-null tanpa dasar runtime, dan `registryTerbaca.state` sebaris di bawah
  // melempar TypeError MENTAH, melewati seluruh taksonomi GalatRantai. Lihat
  // praperiksa P3.
  //
  // KEDUANYA juga dipisah SATU SAMA LAIN, bukan cuma dari "graphql-fatal":
  // kunci hilang berarti kueri gagal DIVALIDASI (alias tak cocok, skema
  // berubah) dan indexer tidak pernah sampai menjawab "ada kontrak atau
  // tidak" — itu galat SKEMA. `r === null` berarti kuerinya SAH dan indexer
  // benar-benar menjawab "tidak ada kontrak di alamat ini" — itu baru
  // "registry-hilang", dan satu-satunya kasus di mana saran "periksa
  // VITE_MIDNIGHT_NETWORK" (lihat komentar GalatRantai di graphql.ts) relevan.
  // Melaporkan keduanya dengan sebab yang sama mengirim pembaca memeriksa
  // jaringan padahal yang salah adalah bentuk kuerinya.
  if (!("r" in j1.data)) {
    throw new GalatRantai(
      "registry-skema",
      // rincian adalah TEKS UI — ditulis Inggris; lihat komentar di GalatRantai.
      `Indexer query for the registry contract at ${jaringan.alamatRegistry} did not return a \`r\` field. This usually means a GraphQL schema or alias mismatch, not a missing contract: ${j1.errors.map(e => e.message).join("; ") || "no error message returned."}`,
      new URL(url).host,
    );
  }
  if (j1.data.r === null) {
    // BUKAN "tidak ada ballot". Hampir selalu berarti alamat benar tetapi
    // jaringannya salah — diverifikasi: alamat registry mengembalikan null di
    // preprod dan objek terisi di preview.
    throw new GalatRantai(
      "registry-hilang",
      // rincian adalah TEKS UI — ditulis Inggris; lihat komentar di GalatRantai.
      `No contract exists at registry address ${jaringan.alamatRegistry} on the ${jaringan.networkId} network.`,
      new URL(url).host,
    );
  }
  const registryTerbaca = j1.data.r;
  const reg = dekodeRegistry(registryTerbaca.state, jaringan.alamatRegistry);
  // Registry SELALU memakai fragmen penuh, jadi `terbaru` pasti ada. `?? []`
  // hanya menjaga tipe; kalau ia pernah benar-benar kosong, panel Recent
  // activity kehilangan baris registry dan tidak ada yang lain yang rusak.
  let aksiRegistry: AksiTerbaca[];
  try {
    aksiRegistry = keAksiTerbaca(
      registryTerbaca.terbaru ?? [],
      jaringan.alamatRegistry,
      "Registry",
      cuplikanRegistry,
    );
  } catch {
    // Pertahanan KEDUA, bukan yang utama: cuplikanRegistry() sudah menjaga
    // per-aksi (try/catch di dalamnya, return null pada state yang gagal
    // dibaca), jadi baris ini seharusnya tidak pernah tereksekusi lewat jalur
    // itu. Ia ada untuk kasus di luar itu — mis. keAksiTerbaca sendiri
    // melempar karena bentuk `mentah` tak terduga — supaya SATU aksi registry
    // yang rusak tidak pernah menjatuhkan seluruh bacaRantai(): ballot tetap
    // harus tampil walau baris registry di Recent activity hilang.
    aksiRegistry = [];
  }

  // ── Saring alamat sebelum dikirim ───────────────────────────────────────
  const gagal: BallotGagal[] = [];
  const dipakai: string[] = [];
  for (const a of reg.alamat.slice(0, MAKS_BALLOT)) {
    if (alamatKontrakValid(a)) dipakai.push(a);
    else
      gagal.push({
        alamat: a,
        sebab: "alamat-tak-sah",
        pesan: "Entri registry ini bukan alamat kontrak yang sah, jadi tidak pernah dikirim ke indexer.",
      });
  }
  if (reg.alamat.length > MAKS_BALLOT) {
    gagal.push({
      alamat: `+${reg.alamat.length - MAKS_BALLOT}`,
      sebab: "alamat-tak-sah",
      pesan: `Registry memuat ${reg.alamat.length} entri; hanya ${MAKS_BALLOT} terbaru yang dibaca.`,
    });
  }

  // ── POST 2: seluruh ballot, dipotong bila perlu ─────────────────────────
  const ballot: BallotTerbaca[] = [];
  // Berapa alamat yang sudah mendapat riwayat aksi, dihitung LINTAS keping:
  // jendela MAKS_BALLOT_BERAKSI adalah jendela global atas `dipakai`, bukan
  // jendela per keping. Tanpa hitungan ini, registry dengan 30 ballot akan
  // mengambil riwayat dua kali lipat. Diuji sungguhan (bukan hanya dibaca dari
  // komentar) di baca-rantai.registry-sintetis.test.ts — praperiksa P1.
  let sudahBerAksi = 0;
  for (const keping of potong(dipakai, MAKS_ALAMAT_PER_DOKUMEN)) {
    const berAksiDiKeping = Math.max(0, Math.min(keping.length, MAKS_BALLOT_BERAKSI - sudahBerAksi));
    sudahBerAksi += berAksiDiKeping;
    const variables = Object.fromEntries(keping.map((a, i) => [`a${i}`, a]));
    const j2 = await postGraphQL<Record<string, KontrakTerbaca | null>>({
      url,
      query: susunKueriBallot(keping.length, berAksiDiKeping),
      variables,
      signal,
      ambil,
    });
    for (let i = 0; i < keping.length; i++) {
      const alamat = keping[i];
      const kunci = `b${i}`;
      // Kunci yang HILANG dan kunci yang null adalah dua hal berbeda, dan
      // keduanya diverifikasi terhadap indexer sungguhan.
      if (!(kunci in j2.data)) {
        gagal.push({
          alamat,
          sebab: "alias-hilang",
          pesan:
            j2.errors.map(e => e.message).join("; ") ||
            "Indexer tidak mengembalikan bidang untuk alamat ini.",
        });
        continue;
      }
      const k = j2.data[kunci];
      if (k === null) {
        gagal.push({
          alamat,
          sebab: "kontrak-null",
          pesan: `Tidak ada kontrak pada alamat ini di jaringan ${jaringan.networkId}.`,
        });
        continue;
      }
      try {
        const keadaan = dekodeBallot(k.state, alamat);
        ballot.push({
          alamat,
          keadaan,
          // Registry permissionless: entri yang terdaftar tapi bukan ballot bisa
          // saja tidak punya ContractDeploy yang terbaca. 0 adalah penanda
          // "tidak diketahui", dan penomoran di ke-ballot.ts menaruhnya di belakang.
          deployHeight: k.deploy[0]?.transaction.block.height ?? 0,
          // `k.terbaru` HANYA ada pada alias yang memakai ...Penuh. Untuk sisanya
          // kuncinya tidak muncul sama sekali, dan larik kosong di sini berarti
          // "tidak diambil" — bukan "tidak ada aksi".
          aksi: k.terbaru
            ? keAksiTerbaca(k.terbaru, alamat, keadaan.title, cuplikanBallot)
            : [],
        });
      } catch (e) {
        // Inilah saringan yang registry.compact minta dilakukan di sisi klien.
        gagal.push({
          alamat,
          sebab: "dekode",
          pesan: e instanceof GalatRantai ? e.rincian : String(e),
        });
      }
    }
  }

  // ── POST 3: keadaan jaringan. TIDAK PERNAH menggagalkan pembacaan ──────
  let blok = { height: 0, timestampMs: 0 };
  let epoch: HasilRantai["epoch"] = null;
  // Dibedakan dari "blok.timestampMs > 0" biasa: sumbernya penting, bukan
  // hanya keberadaannya. POST 3 yang berhasil adalah bacaan LANGSUNG dari
  // rantai. Jatuh ke tinggi aksi kontrak (di bawah) adalah tebakan TERBAIK
  // dari data yang sudah terlanjur diambil, dan tebakan itu bisa mundur jauh —
  // lihat komentar pada perhitungan `sekarangMs` di bawah. Praperiksa P4.
  let post3Berhasil = false;
  try {
    const j3 = await postGraphQL<JawabanJaringan>({ url, query: KUERI_JARINGAN, signal, ambil });
    // Kunci `block.height`/`block.timestamp` yang HILANG (galat skema/alias,
    // atau errors[] parsial pada jawaban yang tetap punya data terisi
    // sebagian) harus ditangkap DI SINI sebelum dipakai — persis alasan yang
    // sama yang sudah memaksa perbaikan di POST 1 (lihat komentar "r" di
    // atas). POST 3 SENGAJA tidak punya pemeriksaan seperti ini sebelumnya:
    // tanpa itu, `j3.data.block.timestamp` yang hilang membuat `sekarangMs`
    // menjadi `undefined` secara DIAM-DIAM (Number.isFinite(undefined) ===
    // false) — tanpa entri gagal[], tanpa GalatRantai, padahal tipenya
    // `number`. Melempar di sini membuat POST 3 jatuh ke jalur "gagal" yang
    // SUDAH ADA di bawah (fallback ke tinggi aksi kontrak / jam perangkat),
    // bukan mengalir sebagai nilai rusak yang diam-diam terpakai.
    if (typeof j3.data.block?.height !== "number" || typeof j3.data.block?.timestamp !== "number") {
      throw new Error(
        j3.errors.map(e => e.message).join("; ") ||
          "Indexer tidak mengembalikan block.height atau block.timestamp yang bertipe number.",
      );
    }
    blok = { height: j3.data.block.height, timestampMs: j3.data.block.timestamp };
    epoch = j3.data.currentEpochInfo;
    post3Berhasil = true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    // Kartu network status adalah hiasan yang berguna; daftar ballot adalah
    // isinya. Jatuh ke tinggi blok tertinggi yang terlihat di aksi kontrak —
    // masih dibaca dari rantai, bukan ditebak — TAPI lihat komentar di bawah:
    // nilai ini sendiri TIDAK dipakai langsung sebagai sekarangMs lagi.
    const semuaAksi = [...aksiRegistry, ...ballot.flatMap(b => b.aksi)];
    for (const a of semuaAksi) {
      if (a.height > blok.height) blok = { height: a.height, timestampMs: a.timestampMs };
    }
  }

  /**
   * sekarangMs — DUA jalur, terurut dari yang paling dipercaya.
   *
   * (Sebelumnya ditulis sebagai TIGA jalur, dengan cabang ketiga terpisah
   * untuk "tidak ada aksi kontrak terlihat sama sekali". Itu cabang MATI:
   * `blok.timestampMs` di jalur gagal tidak pernah negatif — ia diam di 0
   * (nilai awal) atau naik dari tinggi aksi kontrak di atas — sehingga
   * `Math.max(blok.timestampMs, Date.now())` dan `Date.now()` polos
   * menghasilkan angka yang SAMA PERSIS setiap kali cabang "tidak ada aksi
   * terlihat" itu dipilih: `Math.max(0, Date.now()) === Date.now()`. Dua
   * ekspresi kode yang secara matematis tidak bisa dibedakan bukan dua jalur;
   * disatukan di sini alih-alih dipertahankan sebagai cabang yang komentar
   * lama sebut "keadaan terburuk yang tercatat sebagai demikian" padahal
   * tidak ada penanda apa pun yang membuatnya terlihat berbeda dari cabang
   * biasa — klaim itu tidak terpenuhi kode, jadi dihapus alih-alih
   * dipertahankan sebagai prosa yang bercerita beda dari kodenya.)
   *
   * 1. POST 3 berhasil: `blok.timestampMs` APA ADANYA. Ini bacaan LANGSUNG
   *    dari tinggi blok terbaru rantai, sumber paling akurat yang ada.
   *
   * 2. POST 3 gagal: `Math.max(blok.timestampMs, Date.now())`. Bila ada
   *    tinggi aksi kontrak yang terlihat (praperiksa P4), `blok.timestampMs`
   *    di sini adalah stempel waktu aksi TERBARU (tinggi tertinggi) yang
   *    terlihat — dan itu sendiri sekalipun bisa mundur berjam-jam dari waktu
   *    nyata, diukur pada fixture terekam: 5.309 blok / 8,875 jam di belakang
   *    POST 3 yang sesungguhnya. Memakainya APA ADANYA sebagai "sekarang"
   *    membuka kembali celah yang tipe ini ditulis untuk menutup: ballot yang
   *    voteDeadline-nya sudah lewat di jendela mundur itu akan tampil
   *    "Live now", dan VoteModal menawarkan castVote yang kontraknya PASTI
   *    tolak. Karena itu jam PERANGKAT dipakai sebagai BATAS BAWAH (floor)
   *    lewat Math.max — bukan sebagai sumber utama: sekarangMs TIDAK PERNAH
   *    lebih kecil dari waktu nyata pembaca, dan tetap memakai angka rantai
   *    ketika angka itu (jarang, karena jam klien melenceng ke belakang)
   *    justru lebih besar. Bila TIDAK ADA aksi kontrak yang terlihat sama
   *    sekali (registry kosong baru, atau seluruh ballot yang dibaca juga
   *    gagal), `blok.timestampMs` diam di 0 dan Math.max menghasilkan
   *    `Date.now()` apa adanya — keadaan TERBURUK, tapi secara aritmetika
   *    sama dengan floor di atas, bukan cabang terpisah.
   */
  const sekarangMs = post3Berhasil ? blok.timestampMs : Math.max(blok.timestampMs, Date.now());

  return {
    jaringan,
    registry: { count: reg.count, alamat: reg.alamat, aksi: aksiRegistry },
    ballot,
    gagal,
    blok,
    epoch,
    sekarangMs,
  };
}

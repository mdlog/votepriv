/**
 * Tiga dokumen GraphQL. Murni string dan tipe; tidak ada I/O di berkas ini.
 *
 * Dipisahkan supaya dokumennya dapat dibaca dan di-diff tanpa membaca logika
 * orkestrasi, dan supaya perubahan skema indexer punya satu tempat untuk diperiksa.
 */

/**
 * DUA fragmen, bukan satu, dan pembagiannya adalah keputusan biaya.
 *
 * Yang sama di keduanya:
 *
 * `deploy: actions(limit: 1, type: DEPLOY)` — tinggi blok ContractDeploy, sumber
 * NOMOR URUT yang stabil. Ia TIDAK boleh diganti dengan "elemen terakhir dari
 * daftar aksi": ballot dengan banyak suara mendorong ContractDeploy keluar dari
 * limit berapa pun yang wajar, dan nomor urutnya lalu hilang diam-diam.
 *
 * Yang HANYA ada di ...Penuh:
 *
 * `terbaru: actions(limit: 5)` beserta `state` per aksi. `state` itu BENAR-BENAR
 * DIDEKODE di baca-rantai.ts menjadi cuplikan ledger, lalu diselisihkan terhadap
 * aksi sebelumnya — itulah yang spec 9.4 minta ("perubahan terbaru pada
 * voteCount, talliedCount, dan registry.count"). Mengambil `state` lalu hanya
 * memakai nama entry point berarti membayar bandwidth untuk sesuatu yang dibuang,
 * sambil mengklaim manfaat yang tidak diambil.
 *
 * Angka 5, bukan 4: selisih menuntut pendahulu. Dengan jendela lima aksi, empat
 * di antaranya punya pendahulu di dalam jendela dan karena itu punya selisih.
 *
 * ...Ringkas dipakai untuk ballot yang tidak masuk jendela Recent activity.
 * `state` per aksi berukuran ~11,5 KB dan menuntut satu dekode WASM masing-
 * masing; mengambilnya untuk setiap ballot berarti ratusan dekode untuk panel
 * tiga baris. Diverifikasi terhadap indexer sungguhan bahwa satu dokumen boleh
 * memakai dua fragmen berbeda pada alias yang berbeda, dan alias ...Ringkas
 * mengembalikan objek TANPA kunci `terbaru` sama sekali — ditiru di
 * baca-rantai.registry-sintetis.test.ts dengan cara yang lebih kuat daripada
 * sekadar memangkas fixture: jawaban dibangun DARI dokumen yang benar-benar
 * dikirim, per alias.
 *
 * `__typename` WAJIB: `entryPoint` hanya ada pada ContractCall, dan tanpa
 * diskriminan, ContractDeploy dan ContractUpdate tidak dapat dibedakan.
 */
const BIDANG_DASAR = `  address
  state
  deploy: actions(limit: 1, type: DEPLOY) { transaction { hash block { height timestamp } } }`;

export const FRAGMEN_PENUH = `fragment Penuh on Contract {
${BIDANG_DASAR}
  terbaru: actions(limit: 5) {
    __typename
    ... on ContractCall { entryPoint }
    state
    transaction { hash block { height timestamp } }
  }
}`;

export const FRAGMEN_RINGKAS = `fragment Ringkas on Contract {
${BIDANG_DASAR}
}`;

/** Registry SELALU memakai fragmen penuh: registry.count adalah satu dari tiga angka yang spec 9.4 minta diselisihkan. */
export const KUERI_REGISTRY = `query Registry($a: HexEncoded!) { r: contract(address: $a) { ...Penuh } }
${FRAGMEN_PENUH}`;

/**
 * `block` tanpa argumen mengembalikan blok terbaru.
 *
 * `currentEpochInfo` adalah PADANAN TERDEKAT untuk "waktu finality" pada kartu
 * network status. Waktu finality TIDAK PUNYA FIELD di skema ini: introspeksi
 * seluruh tipe dan field terhadap /final/i mengembalikan NOL hasil (perintah
 * penurunannya ada di rencana C-2a Task 5 Step 2, dan dijalankan ulang saat
 * berkas ini ditulis: 116 tipe diperiksa, 0 kecocokan, EpochInfo persis
 * epochNo/durationSeconds/elapsedSeconds). UI karena itu menampilkan posisi
 * epoch apa adanya dan TIDAK mengarang angka finality.
 */
export const KUERI_JARINGAN = `query Jaringan {
  block { height timestamp hash }
  currentEpochInfo { epochNo durationSeconds elapsedSeconds }
}`;

/**
 * Menyusun dokumen ballot dengan satu alias per alamat.
 *
 * Satu dokumen, bukan satu POST per ballot: round-trip ke layanan publik terukur
 * 1.047-1.279 ms dan berlipat langsung dengan jumlah ballot, sementara jawaban
 * yang besar menyusut sekitar sepersebelas di kawat lewat gzip.
 *
 * Alias b0..bN-1 mengikuti URUTAN registry.ballots APA ADANYA (pushFront, terbaru
 * di depan). Ia BUKAN nomor seri — lihat J2 di rencana C-2a.
 *
 * `jumlahBerAksi` alias PERTAMA memakai ...Penuh (dengan riwayat aksi), sisanya
 * ...Ringkas. Karena urutannya pushFront, yang mendapat riwayat adalah yang
 * PALING BARU didaftarkan — yang memang isi panel Recent activity.
 */
export function susunKueriBallot(jumlah: number, jumlahBerAksi: number): string {
  if (jumlah < 1) throw new Error("susunKueriBallot dipanggil dengan jumlah < 1");
  if (jumlahBerAksi < 0 || jumlahBerAksi > jumlah) {
    throw new Error(`jumlahBerAksi (${jumlahBerAksi}) harus antara 0 dan jumlah (${jumlah})`);
  }
  const params = Array.from({ length: jumlah }, (_, i) => `$a${i}: HexEncoded!`).join(", ");
  const bidang = Array.from(
    { length: jumlah },
    (_, i) => `  b${i}: contract(address: $a${i}) { ...${i < jumlahBerAksi ? "Penuh" : "Ringkas"} }`,
  ).join("\n");
  // Fragmen yang dideklarasikan tetapi tidak dipakai adalah galat validasi
  // GraphQL, jadi keduanya hanya disertakan ketika benar-benar terpakai.
  const fragmen = [
    jumlahBerAksi > 0 ? FRAGMEN_PENUH : "",
    jumlahBerAksi < jumlah ? FRAGMEN_RINGKAS : "",
  ].filter(Boolean).join("\n");
  return `query Ballots(${params}) {\n${bidang}\n}\n${fragmen}`;
}

export type BlokAksi = { height: number; timestamp: number };

/** Aksi APA ADANYA dari indexer, dengan `state` mentah yang belum didekode. */
export type AksiKontrak = {
  __typename: "ContractDeploy" | "ContractCall" | "ContractUpdate";
  /** Hanya ada pada ContractCall. */
  entryPoint?: string;
  state: string;
  transaction: { hash: string; block: BlokAksi };
};

export type KontrakTerbaca = {
  address: string;
  state: string;
  deploy: { transaction: { hash: string; block: BlokAksi } }[];
  /** TIDAK ADA pada alias yang memakai ...Ringkas — diverifikasi: kuncinya hilang, bukan larik kosong. */
  terbaru?: AksiKontrak[];
};

export type JawabanJaringan = {
  block: { height: number; timestamp: number; hash: string };
  currentEpochInfo: { epochNo: number; durationSeconds: number; elapsedSeconds: number } | null;
};

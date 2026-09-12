import {
  Transaction,
  type Binding,
  type ContractAction,
  type ContractCall,
  type Proof,
  type SignatureEnabled,
} from "@midnight-ntwrk/ledger-v8";

/**
 * Ekstraksi FAKTA STRUKTURAL dari byte MENTAH satu transaksi castVote/tallyVote
 * yang sungguh terkirim, lewat @midnight-ntwrk/ledger-v8 8.1.0.
 *
 * MENGAPA berkas ini ada, dan mengapa TIDAK sekadar toString()+regex:
 *
 * Klaim privasi aplikasi ini — "tidak ada identitas pembayar di rantai, jadi
 * 'alamat A memilih opsi X' tidak dapat disimpulkan" — sebelumnya hanya hidup
 * di prosa (progress.md). Mengujinya lewat toString() Rust-Debug + regex teks
 * ("owner"/"night_key" tidak muncul) PUNYA CACAT FATAL: parser yang rusak,
 * ter-stub, atau salah membaca transaksi akan MENGEMBALIKAN STRING KOSONG/AMAT
 * PENDEK — dan string kosong juga tidak mengandung "owner". Uji akan tetap
 * HIJAU untuk alasan yang salah.
 *
 * Fungsi ini karena itu membaca FIELD BERTIPE, bukan teks: `intent.actions`,
 * `intent.guaranteedUnshieldedOffer`/`fallibleUnshieldedOffer`,
 * `intent.dustActions.{spends,registrations}`, dan `effects.{unshieldedInputs,
 * unshieldedOutputs,claimedUnshieldedSpends}` — field TERKETIK milik kelas
 * `Intent`/`ContractCall`/`DustActions`/`Effects` yang diimpor dari
 * `@midnight-ntwrk/ledger-v8` sendiri (lihat impor tipe di atas): bila nama
 * field berubah di versi ledger-v8 berikutnya, `pnpm check:uji` MERAH di sini
 * duluan, bukan diam-diam membaca `undefined` dan lolos.
 *
 * Dipakai BERSAMA oleh:
 *  - privasi-pembayar.test.ts (OFFLINE, dari fixture-rantai/tx-mentah-tulis.json)
 *  - privasi-pembayar.jaringan-nyata.test.ts (dilewati bawaan, dari indexer HIDUP)
 * supaya kedua uji menuntut invarian yang SAMA persis, bukan masing-masing versi
 * sendiri yang bisa diam-diam menyimpang.
 */
export type FaktaPrivasiPembayar = {
  /** Dihitung ULANG dari byte oleh Transaction.transactionHash() — lihat komentar di pemanggil: */
  hashTerhitungUlang: string;
  /** Jumlah intent pada transaksi (1 = intent biaya DUST, 1 lain = intent panggilan kontrak). */
  jumlahIntent: number;
  /** entryPoint SATU-SATUNYA ContractCall yang ditemukan di seluruh intent, atau "" bila nol ditemukan. */
  entryPoint: string;
  /** Jumlah ContractCall yang ditemukan di SELURUH intent — harus tepat 1. */
  jumlahPanggilanKontrak: number;
  /** Total DustSpend di seluruh intent — inilah kanal biaya dibayar (bukan UTXO unshielded). */
  jumlahDustSpends: number;
  /** Total DustRegistration di seluruh intent — bila > 0, night_key/dust_address BISA muncul (lihat DustRegistration.nightKey/.dustAddress di ledger-v8.d.ts). */
  jumlahDustRegistrations: number;
  /** True bila SATU PUN intent punya guaranteedUnshieldedOffer atau fallibleUnshieldedOffer terisi (UnshieldedOffer membawa .signatures — lihat ledger-v8.d.ts). */
  adaUnshieldedOffer: boolean;
  /** Effects.unshieldedInputs.size milik transkrip panggilan kontrak; -1 bila tidak ada panggilan/transkrip ditemukan (sentinel kegagalan, BUKAN nol). */
  unshieldedInputsSize: number;
  /** Effects.unshieldedOutputs.size milik transkrip panggilan kontrak; -1 bila tidak ada panggilan/transkrip ditemukan. */
  unshieldedOutputsSize: number;
  /** Effects.claimedUnshieldedSpends.size milik transkrip panggilan kontrak; -1 bila tidak ada panggilan/transkrip ditemukan. */
  claimedUnshieldedSpendsSize: number;
};

function apakahPanggilanKontrak(a: ContractAction<Proof>): a is ContractCall<Proof> {
  // ContractDeploy dan MaintenanceUpdate TIDAK punya field entryPoint sama
  // sekali (lihat ledger-v8.d.ts) — pembeda ini karena itu tidak pernah
  // bergantung pada bentuk __typename/tag string yang bisa berubah nama.
  return "entryPoint" in a;
}

/**
 * Mendeserialisasi byte MENTAH satu transaksi dan mengekstrak fakta di atas.
 *
 * Marker "signature"/"proof"/"binding": transaksi yang SUNGGUH terkirim dan
 * terfinalisasi di rantai SELALU dalam bentuk ini (bertanda tangan, terbukti,
 * terikat) — lihat instance literal SignatureEnabled/Proof/Binding di
 * ledger-v8.d.ts. Bukan tebakan: dibuktikan lewat transactionHash() yang
 * dikembalikan cocok PERSIS dengan hash yang dipakai untuk mengambil raw ini
 * (lihat pemanggil, yang membandingkan `hashTerhitungUlang` terhadap hash
 * fixture) — kalau markernya salah, deserialize() melempar, bukan diam-diam
 * mengembalikan transaksi yang "kelihatannya benar".
 */
export function faktaPrivasiPembayar(raw: Uint8Array): FaktaPrivasiPembayar {
  const t = Transaction.deserialize<SignatureEnabled, Proof, Binding>("signature", "proof", "binding", raw);
  const intents = t.intents ? [...t.intents.values()] : [];

  let adaUnshieldedOffer = false;
  let jumlahDustSpends = 0;
  let jumlahDustRegistrations = 0;
  const panggilan: ContractCall<Proof>[] = [];

  for (const intent of intents) {
    if (intent.guaranteedUnshieldedOffer !== undefined) adaUnshieldedOffer = true;
    if (intent.fallibleUnshieldedOffer !== undefined) adaUnshieldedOffer = true;
    if (intent.dustActions) {
      jumlahDustSpends += intent.dustActions.spends.length;
      jumlahDustRegistrations += intent.dustActions.registrations.length;
    }
    for (const aksi of intent.actions) {
      if (apakahPanggilanKontrak(aksi)) panggilan.push(aksi);
    }
  }

  const call = panggilan[0];
  const transkrip = call ? (call.fallibleTranscript ?? call.guaranteedTranscript) : undefined;
  const effects = transkrip?.effects;

  return {
    hashTerhitungUlang: t.transactionHash(),
    jumlahIntent: intents.length,
    entryPoint: call ? String(call.entryPoint) : "",
    jumlahPanggilanKontrak: panggilan.length,
    jumlahDustSpends,
    jumlahDustRegistrations,
    adaUnshieldedOffer,
    unshieldedInputsSize: effects ? effects.unshieldedInputs.size : -1,
    unshieldedOutputsSize: effects ? effects.unshieldedOutputs.size : -1,
    claimedUnshieldedSpendsSize: effects ? effects.claimedUnshieldedSpends.size : -1,
  };
}

export function hexKeBita(h: string): Uint8Array {
  return Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));
}

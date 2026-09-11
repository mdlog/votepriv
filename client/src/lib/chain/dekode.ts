import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { ledger as ledgerBallotMentah } from "@pkgs/contract/src/managed/ballot/contract/index.js";
import { ledger as ledgerRegistryMentah } from "@pkgs/contract/src/managed/registry/contract/index.js";
import { GalatRantai } from "./graphql";

/**
 * SATU-SATUNYA modul di aplikasi ini yang mengimpor WASM.
 *
 * Pemusatan ini disengaja dan dijaga mesin di Task 9: pertanyaan "apa yang
 * menarik onchain-runtime-v3 (1.321.366 B) ke dalam bundel" harus punya satu
 * jawaban yang dapat diperiksa dengan satu grep. Begitu dua berkas mengimpornya,
 * gerbang ukuran bundel berhenti bisa menunjuk penyebabnya.
 *
 * Yang TIDAK ada di sini, dan tidak boleh masuk: ledger-v8, paket midnight-js-*
 * apa pun, wallet, proof server, artefak ZK. Seluruhnya milik jalur TULIS (C-2b).
 */

export type FaseBallot = 0 | 1 | 2;

export type KeadaanRegistry = {
  count: number;
  /** Urutan APA ADANYA dari List: pushFront, jadi TERBARU DI DEPAN. Bukan nomor seri. */
  alamat: string[];
};

export type KeadaanBallot = {
  title: string;
  description: string;
  community: string;
  /** Sudah dipotong menurut optionCount. option3 yang kosong tidak pernah ikut. */
  opsi: string[];
  optionCount: number;
  /** DETIK sejak epoch, bukan milidetik. Satuan ini ditegakkan ballot.compact. */
  voteDeadlineDetik: number;
  tallyDeadlineDetik: number;
  /** Informatif. TIDAK ditegakkan circuit mana pun — lihat komentar di ballot.compact. */
  quorumPercent: number;
  eligibleCount: number;
  registeredCount: number;
  eligibilityPolicy: string;
  phase: FaseBallot;
  voteCount: number;
  talliedCount: number;
  /** Pasangan MENTAH dari map jarang. Pemadatannya dilakukan padatkanTallies(). */
  tallies: [number, number][];
};

function keNomor(nilai: bigint, nama: string, alamat: string): number {
  if (nilai > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new GalatRantai(
      "dekode",
      `${nama} on contract ${alamat} exceeds Number.MAX_SAFE_INTEGER (${nilai})`,
      alamat,
    );
  }
  return Number(nilai);
}

function keChargedState(stateHex: string, alamat: string) {
  const rapi = stateHex.startsWith("0x") ? stateHex.slice(2) : stateHex;
  if (!/^[0-9a-fA-F]*$/.test(rapi) || rapi.length % 2 !== 0) {
    // rincian adalah TEKS UI — ditulis Inggris; lihat komentar di GalatRantai.
    throw new GalatRantai("dekode", `Contract state for ${alamat} is not valid hex.`, alamat);
  }
  const bita = new Uint8Array(rapi.length / 2);
  for (let i = 0; i < bita.length; i++) bita[i] = parseInt(rapi.slice(i * 2, i * 2 + 2), 16);
  try {
    return ContractState.deserialize(bita).data;
  } catch (e) {
    // Bentuk galat yang diverifikasi pada bita sampah:
    // "expected header tag 'midnight:contract-state[v6]:'"
    throw new GalatRantai(
      "dekode",
      `ContractState.deserialize failed for ${alamat}: ${e instanceof Error ? e.message : String(e)}`,
      alamat,
    );
  }
}

export function dekodeRegistry(stateHex: string, alamat: string): KeadaanRegistry {
  const charged = keChargedState(stateHex, alamat);
  try {
    const l = ledgerRegistryMentah(charged);
    // Dibaca EAGER. ledger() mengembalikan objek bergetter; menunda pembacaan
    // berarti CompactError meledak di tengah render React, jauh dari try ini.
    return { count: keNomor(l.count, "count", alamat), alamat: [...l.ballots] };
  } catch (e) {
    if (e instanceof GalatRantai) throw e;
    throw new GalatRantai(
      "dekode",
      `${alamat} could not be read as a registry contract: ${e instanceof Error ? e.message : String(e)}`,
      alamat,
    );
  }
}

export function dekodeBallot(stateHex: string, alamat: string): KeadaanBallot {
  const charged = keChargedState(stateHex, alamat);
  try {
    const l = ledgerBallotMentah(charged);
    const optionCount = keNomor(l.optionCount, "optionCount", alamat);
    // Ledger selalu punya option0..option3; yang di atas optionCount berisi
    // string kosong. Menampilkannya berarti menawarkan pilihan yang castVote
    // PASTI tolak: assert(opsi < optionCount).
    const semuaOpsi = [l.option0, l.option1, l.option2, l.option3];
    return {
      title: l.title,
      description: l.description,
      community: l.community,
      opsi: semuaOpsi.slice(0, optionCount),
      optionCount,
      voteDeadlineDetik: keNomor(l.voteDeadline, "voteDeadline", alamat),
      tallyDeadlineDetik: keNomor(l.tallyDeadline, "tallyDeadline", alamat),
      quorumPercent: keNomor(l.quorumPercent, "quorumPercent", alamat),
      eligibleCount: keNomor(l.eligibleCount, "eligibleCount", alamat),
      registeredCount: keNomor(l.registeredCount, "registeredCount", alamat),
      eligibilityPolicy: l.eligibilityPolicy,
      phase: l.phase as FaseBallot,
      voteCount: keNomor(l.voteCount, "voteCount", alamat),
      talliedCount: keNomor(l.talliedCount, "talliedCount", alamat),
      // [...map] memberi pasangan yang BENAR-BENAR ADA. Kunci yang tidak pernah
      // menerima suara TIDAK muncul di sini sama sekali — lihat padatkanTallies.
      tallies: [...l.tallies].map(([k, v]) => [
        // "kunci tallies"/"nilai tallies" sebelumnya di sini: rincian adalah
        // TEKS UI berbahasa Inggris (lihat komentar di baris 62 dan di
        // GalatRantai), dan dua call site ini melanggarnya. Diperbaiki.
        keNomor(k, "tally key", alamat),
        keNomor(v, "tally value", alamat),
      ]),
    };
  } catch (e) {
    if (e instanceof GalatRantai) throw e;
    // Bentuk yang diverifikasi ketika state registry didekode sebagai ballot:
    // CompactError "invalid operation for type: tried to idx, only map, array,
    // and bmt are supported". Inilah saringan untuk entri sampah di registry,
    // yang registry.compact sendiri sebut harus disaring di sisi klien.
    throw new GalatRantai(
      "dekode",
      `${alamat} could not be read as a ballot contract: ${e instanceof Error ? e.message : String(e)}`,
      alamat,
    );
  }
}

/**
 * Map tallies JARANG: kunci yang tidak pernah menerima suara TIDAK ADA,
 * bukan bernilai 0.
 *
 * Diverifikasi pada ballot yang benar-benar final: tallies = [[2,1],[0,2]].
 * Kunci 1 tidak ada. Pengindeksan naif `tallies[i]` salah baca, dan `lookup()`
 * pada kunci yang tidak ada MELEMPAR "expected a cell, received null" —
 * perilaku yang sudah dicatat pkgs/cli/src/periksa.ts.
 *
 * Fungsi ini memadatkan ke larik sepanjang jumlahOpsi, mengisi lubangnya dengan
 * nol, dan MENGABAIKAN kunci di luar rentang opsi alih-alih membuangnya
 * diam-diam ke indeks yang salah.
 *
 * Konversi NILAI (bigint->number) lewat keNomor, BUKAN `Number(v)` telanjang.
 * Alasannya: jalur bigint di sini menerima `ledger().tallies` LANGSUNG — satu-
 * satunya jalur lain (dekodeBallot:123-127) yang membaca map yang SAMA sudah
 * dijaga keNomor karena nilainya Uint64 tak terbatas (lihat _descriptor_0 di
 * managed/ballot/contract/index.js). Sebelum perbaikan ini, data yang identik
 * berperilaku dua arah: MELEMPAR lewat dekodeBallot, dibulatkan diam-diam lewat
 * padatkanTallies. Pasangan yang sudah berupa `number` (dari KeadaanBallot.tallies,
 * sudah lewat keNomor sekali di dekodeBallot) dipakai apa adanya — tidak perlu
 * dijaga dua kali, dan keNomor tetap menuntut bigint.
 */
export function padatkanTallies(
  pasangan: Iterable<readonly [bigint, bigint] | readonly [number, number]>,
  jumlahOpsi: number,
  alamat = "(padatkanTallies)",
): number[] {
  const padat = new Array<number>(jumlahOpsi).fill(0);
  for (const [k, v] of pasangan) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= jumlahOpsi) continue;
    padat[i] = typeof v === "bigint" ? keNomor(v, "tally value", alamat) : v;
  }
  return padat;
}

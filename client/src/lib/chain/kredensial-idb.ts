/**
 * Store IndexedDB TERPISAH untuk credential pendaftaran pemilih — BUKAN
 * private state midnight-js (bandingkan client/src/lib/chain/private-state-idb.ts)
 * dan BUKAN database "votepriv-private-state" (providers-tulis.ts/tulis.ts).
 *
 * KENAPA TERPISAH (Keputusan #1 rencana pendaftaran-browser): `findDeployedContract`
 * (dipanggil kirimSuara/bukaSuara di tulis.ts) memanggil `setOrGetInitialPrivateState`
 * yang MENIMPA private state midnight-js begitu ballot ditemukan — tulis.ts sendiri
 * mendokumentasikan ini sebagai urutan yang mengikat (komentar G1 di kepala berkas
 * itu). Credential pendaftaran (dibuat SEBELUM pemilih pernah menyentuh wallet atau
 * findDeployedContract sama sekali) harus hidup DI LUAR semantik "ditimpa saat
 * ditemukan" itu — dikunci alamatBallot, di database sendiri.
 *
 * BENTUK KEGAGALAN: pola SAMA dengan private-state-idb.ts — setiap operasi
 * IndexedDB yang gagal (kuota penuh, storage privat diblokir, dst.) MENOLAK
 * Promise dengan Error yang jelas, tidak pernah resolve ke nilai kosong.
 * `ambilKredensial` yang mengembalikan `null` HANYA berarti "belum pernah ada
 * credential tersimpan untuk ballot ini" (jalur normal, key memang tidak ada) —
 * dibedakan tegas dari kegagalan baca (`onerror`, ditolak). Kredensial adalah
 * SATU-SATUNYA cara membuktikan hak pilih saat mencoblos; membiarkan kegagalan
 * penyimpanan terlihat seperti "belum pernah daftar" akan membuat pemilih
 * mendaftar ulang dengan credential BARU tanpa tahu yang lama gagal tersimpan
 * (bukan hilang) — dua leaf berbeda untuk satu orang, dan hanya satu yang
 * pernah diserahkan ke penyelenggara.
 *
 * TIDAK mengimpor apa pun dari @midnight-ntwrk/* atau dari ./tulis: berkas ini
 * dipakai lewat IMPOR STATIS oleh VoteModal.tsx (auto-isi kolom credential) dan
 * RegisterModal.tsx, jadi ia harus tetap TERJANGKAU dari entri TANPA menyeret
 * WASM — lihat batas-bundel.test.ts. Penghitungan leaf (yang BUTUH WASM lewat
 * daunEligibility) tetap hidup di balik pintu dinamis, di tulis.ts, yang
 * mengimpor modul ini untuk MENULIS/MEMBACA credential mentahnya.
 */
const DB_VERSION = 1;
const STORE_KREDENSIAL = "credentials";

function bukaDb(namaDb: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(namaDb, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KREDENSIAL)) db.createObjectStore(STORE_KREDENSIAL);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`Could not open IndexedDB "${namaDb}"`));
  });
}

function idbPut(db: IDBDatabase, key: string, value: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KREDENSIAL, "readwrite");
    tx.objectStore(STORE_KREDENSIAL).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Could not write the credential for "${key}"`));
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<Uint8Array | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KREDENSIAL, "readonly");
    const req = tx.objectStore(STORE_KREDENSIAL).get(key);
    req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
    req.onerror = () => reject(req.error ?? new Error(`Could not read the credential for "${key}"`));
  });
}

export interface KredensialStoreIdb {
  /** `null` HANYA berarti belum pernah disimpan — kegagalan baca MENOLAK, tidak pernah resolve ke sini. */
  ambilKredensial(alamatBallot: string): Promise<Uint8Array | null>;
  simpanKredensial(alamatBallot: string, kredensial: Uint8Array): Promise<void>;
}

/**
 * Nama database bawaan aplikasi — TERPISAH dari "votepriv-private-state"
 * (dideklarasikan ulang sebagai literal di providers-tulis.ts DAN tulis.ts;
 * lihat komentar `NAMA_DB_PRIVATE_STATE` di tulis.ts untuk alasan duplikasi
 * itu sendiri dipertahankan sengaja). Diekspor (bukan diduplikasi) di sini
 * karena dipakai TIGA pemanggil nyata (tulis.ts, VoteModal.tsx,
 * RegisterModal.tsx) yang semuanya harus mengunci ke DB YANG SAMA PERSIS.
 */
export const NAMA_DB_KREDENSIAL = "votepriv-credentials";

/** Factory, BUKAN singleton — supaya uji bisa mengoper nama DB acak per uji (pola sama dengan buatPrivateStateProviderIdb). */
export function buatKredensialStoreIdb(namaDb: string): KredensialStoreIdb {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (dbPromise === null) dbPromise = bukaDb(namaDb);
    return dbPromise;
  };
  return {
    async ambilKredensial(alamatBallot: string): Promise<Uint8Array | null> {
      const nilai = await idbGet(await db(), alamatBallot);
      return nilai ?? null;
    },
    async simpanKredensial(alamatBallot: string, kredensial: Uint8Array): Promise<void> {
      await idbPut(await db(), alamatBallot, kredensial);
    },
  };
}

/** Hex huruf kecil tanpa awalan "0x" — salinan sengaja dari bytesKeHex tulis.ts (lihat alasan duplikasi di kepala berkas). */
export function kredensialKeHex(kredensial: Uint8Array): string {
  return Array.from(kredensial, (x) => x.toString(16).padStart(2, "0")).join("");
}

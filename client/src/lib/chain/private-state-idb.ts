/**
 * PrivateStateProvider tulisan sendiri di atas IndexedDB — bukan paket
 * @midnight-ntwrk/midnight-js-level-private-state-provider (Keputusan #3):
 * paket itu memakai `crypto` Node (dist/index.mjs baris 3-4: `import * as
 * crypto from 'crypto'` dan `import { randomBytes, pbkdf2Sync, createCipheriv,
 * createDecipheriv, createHash } from 'crypto'`), dan vendornya sendiri
 * menulis "DO NOT use for production applications requiring data
 * persistence" (level-private-state-provider.d.ts baris 90-93).
 *
 * setSigningKey/getSigningKey BUKAN opsional: `findDeployedContract`
 * (midnight-js-contracts dist/index.mjs:1716) memanggil
 * `providers.privateStateProvider.setContractAddress(contractAddress)` tanpa
 * syarat, lalu `setOrGetInitialSigningKey(providers.privateStateProvider,
 * options)` (dipanggil di baris 1727) — fungsi itu sendiri (baris 1625-1636)
 * SELALU memanggil `setSigningKey` (baik lewat cabang `options.signingKey`
 * maupun lewat fallback `sampleSigningKey()`-nya) dan/atau `getSigningKey`.
 * Jadi kedua metode itu wajib berfungsi, bukan boleh dibiarkan melempar.
 * remove/clear tidak pernah dipanggil di jalur ini (grep
 * "privateStateProvider\.remove\|privateStateProvider\.clear" atas
 * midnight-js-contracts dist/index.mjs — nol hasil) — boleh sederhana.
 * export/import keempatnya juga nol hasil pada grep yang sama — melempar
 * "belum didukung" jujur, bukan pura-pura sukses.
 *
 * Kunci mengikuti bentuk level provider asli: `${contractAddress}:${id}`
 * (didokumentasikan ulang di pkgs/contract/src/ballot-witnesses.ts, komentar
 * di atas `BallotPrivateStateId`) — bukan karena bentuk itu istimewa,
 * melainkan karena `findDeployedContract` memanggil `setContractAddress` lalu
 * mengandalkan provider mengisolasi state per alamat kontrak; perilaku kita
 * harus cocok dengan itu.
 *
 * BENTUK KEGAGALAN PENYIMPANAN (diputuskan sadar, lihat task-1-report.md
 * untuk uraian lengkap): setiap operasi IndexedDB yang gagal — kuota penuh,
 * jendela privat yang memblokir storage, site data yang dibersihkan
 * pertengahan sesi, dsb — MENOLAK Promise dengan Error yang jelas, bukan
 * resolve ke `undefined`/nilai kosong. `idbGet` yang mengembalikan `undefined`
 * karena key memang tidak ada (jalur normal) dibedakan secara eksplisit dari
 * `onerror` (jalur gagal, ditolak). Kegagalan membuka database sendiri
 * (`bukaDb` menolak) mengalir ke SETIAP pemanggil lewat `db()` karena promise
 * yang gagal itu di-cache dan dikembalikan apa adanya — tidak pernah ditelan
 * atau diubah jadi `null`. Ini sengaja: kehilangan `opening` yang tersimpan
 * berarti suara itu permanen tidak bisa dibuka saat tally, jadi provider ini
 * TIDAK PERNAH boleh membiarkan kegagalan penyimpanan terlihat seperti "belum
 * ada data".
 */
import type { ContractAddress, SigningKey } from "@midnight-ntwrk/compact-runtime";
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from "@midnight-ntwrk/midnight-js-types";

const DB_VERSION = 1;
const STORE_STATE = "privateStates";
const STORE_SIGNING = "signingKeys";

function bukaDb(namaDb: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(namaDb, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_STATE)) db.createObjectStore(STORE_STATE);
      if (!db.objectStoreNames.contains(STORE_SIGNING)) db.createObjectStore(STORE_SIGNING);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`Gagal membuka IndexedDB "${namaDb}"`));
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Gagal menulis "${key}" ke ${store}`));
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error(`Gagal membaca "${key}" dari ${store}`));
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Gagal menghapus "${key}" dari ${store}`));
  });
}

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Gagal mengosongkan ${store}`));
  });
}

function belumDidukung(nama: string): never {
  throw new Error(
    `${nama} belum didukung oleh private state provider IndexedDB VotePriv. ` +
      "Tidak ada jalur castVote/tallyVote yang memanggilnya.",
  );
}

export function buatPrivateStateProviderIdb<PSI extends PrivateStateId, PS>(
  namaDb: string,
): PrivateStateProvider<PSI, PS> {
  let alamatKontrak: ContractAddress | null = null;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (dbPromise === null) dbPromise = bukaDb(namaDb);
    return dbPromise;
  };

  const kunciAlamat = (): ContractAddress => {
    if (alamatKontrak === null) {
      throw new Error("Contract address not set. Call setContractAddress() before exporting private states.");
    }
    return alamatKontrak;
  };
  const kunciState = (id: PSI): string => `${kunciAlamat()}:${id}`;

  return {
    setContractAddress(address: ContractAddress): void {
      alamatKontrak = address;
    },
    async set(privateStateId: PSI, state: PS): Promise<void> {
      await idbPut(await db(), STORE_STATE, kunciState(privateStateId), state);
    },
    async get(privateStateId: PSI): Promise<PS | null> {
      const nilai = await idbGet<PS>(await db(), STORE_STATE, kunciState(privateStateId));
      return nilai ?? null;
    },
    async remove(privateStateId: PSI): Promise<void> {
      await idbDelete(await db(), STORE_STATE, kunciState(privateStateId));
    },
    async clear(): Promise<void> {
      await idbClear(await db(), STORE_STATE);
    },
    async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      await idbPut(await db(), STORE_SIGNING, address, signingKey);
    },
    async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      const nilai = await idbGet<SigningKey>(await db(), STORE_SIGNING, address);
      return nilai ?? null;
    },
    async removeSigningKey(address: ContractAddress): Promise<void> {
      await idbDelete(await db(), STORE_SIGNING, address);
    },
    async clearSigningKeys(): Promise<void> {
      await idbClear(await db(), STORE_SIGNING);
    },
    async exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      belumDidukung("exportPrivateStates");
    },
    async importPrivateStates(
      _exportData: PrivateStateExport,
      _options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      belumDidukung("importPrivateStates");
    },
    async exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      belumDidukung("exportSigningKeys");
    },
    async importSigningKeys(
      _exportData: SigningKeyExport,
      _options?: ImportSigningKeysOptions,
    ): Promise<ImportSigningKeysResult> {
      belumDidukung("importSigningKeys");
    },
  };
}

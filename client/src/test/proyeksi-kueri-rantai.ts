/**
 * Proyektor kueri→jawaban untuk indexer PALSU di uji baca-rantai.
 *
 * MENGAPA berkas ini ada: sebelum perbaikan ini, kedua tiruan indexer
 * (`ambilPalsu` di baca-rantai.test.ts, `indexerSintetis` di
 * baca-rantai.registry-sintetis.test.ts) menjawab dari SUPERSET tetap —
 * fixture rekaman atau objek karangan yang selalu memuat setiap field,
 * apa pun isi teks kueri yang sesungguhnya dikirim. Akibatnya menghapus
 * `state` dari `BIDANG_DASAR`, menghapus `state` dari blok `terbaru:`, atau
 * mengubah `actions(limit: 5)` menjadi `actions(limit: 1)` di kueri.ts sama
 * sekali tidak mengubah jawaban palsu — mutasi itu lolos hijau (M5/M6/M7).
 *
 * Fungsi di sini membaca TEKS KUERI yang benar-benar dikirim dan memproyeksikan
 * superset ke bentuk yang HANYA memuat field yang benar-benar diminta pada
 * level itu. Field yang hilang dari kueri karena itu benar-benar hilang dari
 * jawaban — persis seperti indexer sungguhan akan berlaku.
 *
 * Dipakai bersama oleh baca-rantai.test.ts dan
 * baca-rantai.registry-sintetis.test.ts supaya keduanya menuntut fidelitas
 * yang sama, bukan masing-masing menutup sebagian saja.
 */

/** Mengembalikan isi di antara `{` PERTAMA pada/dari `dariIndeks` dan
 * pasangan `}`-nya, dengan penghitungan kedalaman kurung kurawal — BUKAN
 * regex non-greedy, yang berhenti pada `}` pertama meski itu milik blok
 * bersarang (mis. `deploy { transaction { block { height } } }`). */
function blokBerkurung(teks: string, dariIndeks: number): string {
  const mulai = teks.indexOf("{", dariIndeks);
  if (mulai === -1) throw new Error("proyeksi-kueri-rantai: '{' pembuka tidak ditemukan");
  let dalam = 0;
  for (let i = mulai; i < teks.length; i++) {
    if (teks[i] === "{") dalam++;
    else if (teks[i] === "}") {
      dalam--;
      if (dalam === 0) return teks.slice(mulai + 1, i);
    }
  }
  throw new Error("proyeksi-kueri-rantai: kurung kurawal tidak seimbang");
}

/** Isi blok bernama `nama` (opsional dengan alias/argumen, mis.
 * `terbaru: actions(limit: 5)`) pada LEVEL TEKS `teks` — bukan rekursif ke
 * level lebih dalam. `null` bila field itu sama sekali tidak ada di `teks`. */
function subBlok(teks: string, nama: string): string | null {
  const re = new RegExp(`\\b${nama}\\s*(:\\s*\\w+\\s*\\([^)]*\\))?\\s*\\{`);
  const m = re.exec(teks);
  if (!m) return null;
  return blokBerkurung(teks, m.index + m[0].length - 1);
}

/** True bila `field` muncul sebagai TOKEN utuh (bukan bagian kata lain) di `teks`. */
function ada(teks: string, field: string): boolean {
  return new RegExp(`\\b${field}\\b`).test(teks);
}

/** Angka `limit:` pada deklarasi `nama: actions(limit: N...)`, atau null bila
 * field `nama` tidak ada atau tidak memakai bentuk `actions(limit: …)`. */
function angkaLimit(teks: string, nama: string): number | null {
  const m = new RegExp(`\\b${nama}\\s*:\\s*actions\\(limit:\\s*(\\d+)`).exec(teks);
  return m ? Number(m[1]) : null;
}

export type AksiSuperset = {
  __typename: string;
  entryPoint?: string;
  state: string;
  transaction: { hash: string; block: { height: number; timestamp: number } };
};

export type KontrakSuperset = {
  address: string;
  state: string;
  deploy: { transaction: { hash: string; block: { height: number; timestamp: number } } }[];
  terbaru?: AksiSuperset[];
};

function namaFragmenDipakai(query: string, alias: string): "Penuh" | "Ringkas" | null {
  if (new RegExp(`\\b${alias}:\\s*contract\\([^)]*\\)\\s*\\{\\s*\\.\\.\\.Penuh\\s*\\}`).test(query)) return "Penuh";
  if (new RegExp(`\\b${alias}:\\s*contract\\([^)]*\\)\\s*\\{\\s*\\.\\.\\.Ringkas\\s*\\}`).test(query)) return "Ringkas";
  return null;
}

function bodiFragmen(query: string, nama: "Penuh" | "Ringkas"): string | null {
  const m = new RegExp(`fragment\\s+${nama}\\s+on\\s+Contract\\s*`).exec(query);
  if (!m) return null;
  return blokBerkurung(query, m.index + m[0].length);
}

/** Memproyeksikan SATU objek kontrak superset menurut teks fragmen (Penuh
 * atau Ringkas) yang benar-benar dipakai alias ini. */
export function proyeksikanKontrak(fragBody: string, superset: KontrakSuperset): Partial<KontrakSuperset> {
  const hasil: Partial<KontrakSuperset> = {};
  // BIDANG_DASAR (address/state/deploy) SELALU muncul TEKSTUAL sebelum
  // `terbaru:` di kedua fragmen (lihat kueri.ts) — memotong di situ
  // membedakan `state` MILIK KONTRAK (BIDANG_DASAR) dari `state` MILIK AKSI
  // (di dalam `terbaru { … }`), yang dua-duanya cuma token "state" polos dan
  // tidak bisa dibedakan lewat regex datar atas seluruh fragBody.
  const luar = fragBody.split(/\bterbaru\s*:/)[0];
  if (ada(luar, "address")) hasil.address = superset.address;
  if (ada(luar, "state")) hasil.state = superset.state;
  if (subBlok(luar, "deploy") !== null) hasil.deploy = superset.deploy;

  const blokTerbaru = subBlok(fragBody, "terbaru");
  if (blokTerbaru !== null) {
    const limit = angkaLimit(fragBody, "terbaru");
    const dipotong = (superset.terbaru ?? []).slice(0, limit ?? (superset.terbaru ?? []).length);
    hasil.terbaru = dipotong.map((a): AksiSuperset => {
      const proyeksi: Partial<AksiSuperset> = {};
      if (ada(blokTerbaru, "__typename")) proyeksi.__typename = a.__typename;
      if (ada(blokTerbaru, "entryPoint") && a.entryPoint !== undefined) proyeksi.entryPoint = a.entryPoint;
      if (ada(blokTerbaru, "state")) proyeksi.state = a.state;
      const blokTx = subBlok(blokTerbaru, "transaction");
      if (blokTx !== null) {
        const tx: Partial<AksiSuperset["transaction"]> = {};
        if (ada(blokTx, "hash")) tx.hash = a.transaction.hash;
        const blokBlok = subBlok(blokTx, "block");
        if (blokBlok !== null) {
          const blok: Partial<AksiSuperset["transaction"]["block"]> = {};
          if (ada(blokBlok, "height")) blok.height = a.transaction.block.height;
          if (ada(blokBlok, "timestamp")) blok.timestamp = a.transaction.block.timestamp;
          tx.block = blok as AksiSuperset["transaction"]["block"];
        }
        proyeksi.transaction = tx as AksiSuperset["transaction"];
      }
      return proyeksi as AksiSuperset;
    });
  }
  return hasil;
}

/**
 * Memproyeksikan seluruh `data` (satu objek per alias — cocok untuk jawaban
 * `query Ballots` MAUPUN `query Registry`, yang bentuknya sama-sama
 * `{ alias: KontrakTerbaca | null, … }`) menurut fragmen yang benar-benar
 * dipakai TIAP alias pada `query` yang dikirim.
 */
export function proyeksikanJawabanKontrak(
  query: string,
  supersetPerAlias: Record<string, KontrakSuperset | null>,
): Record<string, Partial<KontrakSuperset> | null> {
  const hasil: Record<string, Partial<KontrakSuperset> | null> = {};
  for (const [alias, superset] of Object.entries(supersetPerAlias)) {
    if (superset === null) {
      hasil[alias] = null;
      continue;
    }
    const nama = namaFragmenDipakai(query, alias);
    if (nama === null) {
      // Alias ini tidak dikenali sebagai memakai ...Penuh atau ...Ringkas di
      // kueri yang dikirim — jawaban kosong, BUKAN menebak dari superset.
      hasil[alias] = {};
      continue;
    }
    const body = bodiFragmen(query, nama);
    hasil[alias] = body === null ? {} : proyeksikanKontrak(body, superset);
  }
  return hasil;
}

export type JaringanSuperset = {
  block: { height: number; timestamp: number; hash: string };
  currentEpochInfo: { epochNo: number; durationSeconds: number; elapsedSeconds: number } | null;
};

/** Memproyeksikan jawaban `query Jaringan` menurut field yang benar-benar
 * diminta pada `block { … }` dan `currentEpochInfo { … }`. */
export function proyeksikanJawabanJaringan(query: string, superset: JaringanSuperset): Partial<JaringanSuperset> {
  const hasil: Partial<JaringanSuperset> = {};
  const blokBlock = subBlok(query, "block");
  if (blokBlock !== null) {
    const blok: Partial<JaringanSuperset["block"]> = {};
    if (ada(blokBlock, "height")) blok.height = superset.block.height;
    if (ada(blokBlock, "timestamp")) blok.timestamp = superset.block.timestamp;
    if (ada(blokBlock, "hash")) blok.hash = superset.block.hash;
    hasil.block = blok as JaringanSuperset["block"];
  }
  if (subBlok(query, "currentEpochInfo") !== null) {
    hasil.currentEpochInfo = superset.currentEpochInfo;
  }
  return hasil;
}

/**
 * Nama variabel `$nama` yang DIDEKLARASIKAN pada tanda tangan operasi
 * (`query Ballots($a0: HexEncoded!, …)`), diambil dari kurung yang menempel
 * LANGSUNG setelah nama operasi — bukan kurung argumen field mana pun di
 * dalam badan kueri (mis. `actions(limit: 5)`).
 */
function variabelDideklarasikan(query: string): string[] {
  const m = /^\s*query\s+\w+\s*\(([^)]*)\)/.exec(query);
  if (!m) return [];
  return Array.from(m[1].matchAll(/\$(\w+)\s*:/g)).map(x => x[1]);
}

/**
 * Korespondensi nama variabel: kunci `variables` yang BENAR-BENAR DIKIRIM
 * (mis. `a0`) harus sama persis dengan nama `$a0` yang dideklarasikan
 * tanda tangan operasi. Terhadap indexer sungguhan, ketidakcocokan ini
 * adalah galat validasi GraphQL yang menjatuhkan SELURUH kueri (data: null),
 * bukan sekadar satu field yang hilang. Kembalikan larik `errors` gaya
 * GraphQL yang sama untuk setiap `$nama` yang dideklarasikan tapi tidak
 * dikirim; larik kosong berarti korespondensinya utuh.
 */
export function galatVariabelHilang(
  query: string,
  variables: Record<string, unknown> | undefined,
): { message: string }[] {
  const dideklarasikan = variabelDideklarasikan(query);
  const dikirim = new Set(Object.keys(variables ?? {}));
  return dideklarasikan
    .filter(nama => !dikirim.has(nama))
    .map(nama => ({ message: `Variable "$${nama}" of required type was not provided.` }));
}

// Inti "registration inbox": pemilih mengirim LEAF-nya (publik) lewat HTTP,
// inbox mendaftarkannya ke rantai SEGERA (batch berisi berapa pun yang sedang
// antre, maksimal 8 — tidak menunggu penuh), dan pemilih memantau statusnya.
//
// Berkas ini TIDAK menyentuh wallet, seed, atau midnight-js: fungsi pendaftar
// (`daftarkan`) dan pembaca ledger (`bacaLedger`) DISUNTIK oleh register-inbox.ts
// (titik masuk CLI) — sehingga seluruh perilaku HTTP/antrean bisa diuji dengan
// server sungguhan di port acak tanpa jaringan Midnight.
//
// Yang diterima inbox: leaf (hash publik credential) dan, seperti permintaan
// web mana pun, alamat IP pengirim. Yang TIDAK PERNAH sampai ke sini:
// credential, salt, opening, pilihan. Log inbox hanya memuat leaf (publik)
// dan txId (publik).
import http from "node:http";
import type { AddressInfo } from "node:net";

export type StatusEntri = "queued" | "submitting" | "registered" | "failed";

export interface EntriInbox {
  readonly leaf: string; // 64 hex, huruf kecil
  status: StatusEntri;
  txId?: string;
  error?: string;
  readonly diterimaPada: number; // ms sejak epoch
}

/** Bentuk ledger minimal yang dibutuhkan inbox — publik semua. */
export interface LedgerInbox {
  readonly registeredCount: bigint;
  readonly eligibleCount: bigint;
  readonly voteDeadline: bigint; // DETIK sejak epoch
  /** `undefined` bila leaf belum ada di pohon; mengikuti API HistoricMerkleTree.findPathForLeaf. */
  readonly leafTerdaftar: (leafHex: string) => boolean;
}

export interface OpsiInbox {
  /** Alamat ballot (64 hex) yang dilayani inbox ini — permintaan untuk ballot lain ditolak 404. */
  readonly alamatBallot: string;
  /** Mengirim SATU transaksi registerVoters untuk <= 8 leaf; mengembalikan txId. */
  readonly daftarkan: (leaves: readonly string[]) => Promise<{ txId: string }>;
  /** Membaca keadaan ballot dari indexer (kuota, deadline, keanggotaan leaf). */
  readonly bacaLedger: () => Promise<LedgerInbox>;
  /** Batas permintaan POST per alamat IP per jam (anti-spam sederhana). Bawaan 20. */
  readonly batasPerIpPerJam?: number;
  /** Panjang antrean maksimum. Bawaan 64. */
  readonly maksAntrean?: number;
  /** Jam yang bisa disuntik untuk uji. */
  readonly sekarangMs?: () => number;
  readonly log?: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void; error: (o: object, m: string) => void };
}

const HEX64 = /^[0-9a-f]{64}$/;

export function normalisasiHex64(nilai: unknown): string | null {
  if (typeof nilai !== "string") return null;
  const rapi = nilai.trim().toLowerCase().replace(/^0x/, "");
  return HEX64.test(rapi) ? rapi : null;
}

/**
 * Header CORS: paket pemilih berjalan di http://localhost:5300 (origin
 * berbeda-beda per mesin), jadi inbox harus menerima origin apa pun. Tidak ada
 * kredensial/cookie yang terlibat, dan seluruh data yang dikirim publik.
 */
const HEADER_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "600",
} as const;

function jawabJson(res: http.ServerResponse, kode: number, badan: unknown): void {
  res.writeHead(kode, { ...HEADER_CORS, "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(badan));
}

async function bacaBadanJson(req: http.IncomingMessage, maksByte = 4096): Promise<unknown> {
  let total = 0;
  const potongan: Buffer[] = [];
  for await (const p of req) {
    total += (p as Buffer).length;
    if (total > maksByte) throw new Error("payload too large");
    potongan.push(p as Buffer);
  }
  const teks = Buffer.concat(potongan).toString("utf8");
  return teks.length === 0 ? {} : JSON.parse(teks);
}

function ipDari(req: http.IncomingMessage): string {
  // Di balik proxy app (server/index.ts) IP asli ada di x-forwarded-for.
  const xff = req.headers["x-forwarded-for"];
  const pertama = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
  return pertama || req.socket.remoteAddress || "?";
}

export class Inbox {
  private readonly entri = new Map<string, EntriInbox>();
  private readonly hitunganIp = new Map<string, number[]>();
  private sedangMengirim = false;
  private readonly opsi: Required<Pick<OpsiInbox, "batasPerIpPerJam" | "maksAntrean" | "sekarangMs">> & OpsiInbox;

  constructor(opsi: OpsiInbox) {
    const alamat = normalisasiHex64(opsi.alamatBallot);
    if (alamat === null) throw new Error(`alamatBallot tidak sah: ${String(opsi.alamatBallot)}`);
    this.opsi = { batasPerIpPerJam: 20, maksAntrean: 64, sekarangMs: () => Date.now(), ...opsi, alamatBallot: alamat };
  }

  get alamatBallot(): string {
    return this.opsi.alamatBallot;
  }

  status(leaf: string): EntriInbox | undefined {
    return this.entri.get(leaf);
  }

  ringkasan(): { queued: number; submitting: number; registered: number; failed: number } {
    const r = { queued: 0, submitting: 0, registered: 0, failed: 0 };
    for (const e of this.entri.values()) r[e.status]++;
    return r;
  }

  private ipMelebihiBatas(ip: string): boolean {
    const kini = this.opsi.sekarangMs();
    const jendela = (this.hitunganIp.get(ip) ?? []).filter((t) => kini - t < 3_600_000);
    if (jendela.length >= this.opsi.batasPerIpPerJam) {
      this.hitunganIp.set(ip, jendela);
      return true;
    }
    jendela.push(kini);
    this.hitunganIp.set(ip, jendela);
    return false;
  }

  /**
   * Menerima satu leaf. Mengembalikan kode HTTP + badan yang akan dikirim.
   * Idempoten: leaf yang sudah pernah diterima mengembalikan status yang ada,
   * bukan entri ganda.
   */
  async terima(masukan: { ballot: unknown; leaf: unknown }, ip: string): Promise<{ kode: number; badan: object }> {
    const ballot = normalisasiHex64(masukan.ballot);
    const leaf = normalisasiHex64(masukan.leaf);
    if (ballot === null || leaf === null) {
      return { kode: 400, badan: { error: "Expected JSON { ballot: <64 hex>, leaf: <64 hex> }." } };
    }
    if (ballot !== this.opsi.alamatBallot) {
      return { kode: 404, badan: { error: `This inbox registers voters for ballot ${this.opsi.alamatBallot.slice(0, 8)}…, not ${ballot.slice(0, 8)}….` } };
    }
    const ada = this.entri.get(leaf);
    if (ada !== undefined) return { kode: 200, badan: keBadan(ada) };

    if (this.ipMelebihiBatas(ip)) {
      return { kode: 429, badan: { error: "Too many registration requests from this address — try again later." } };
    }
    if (this.ringkasan().queued >= this.opsi.maksAntrean) {
      return { kode: 503, badan: { error: "The registration inbox is full right now — try again in a minute." } };
    }

    let ledger: LedgerInbox;
    try {
      ledger = await this.opsi.bacaLedger();
    } catch (e) {
      return { kode: 502, badan: { error: `The organiser's inbox could not read the ballot from the indexer: ${(e as Error).message}` } };
    }
    const kini = BigInt(Math.floor(this.opsi.sekarangMs() / 1000));
    if (kini >= ledger.voteDeadline) {
      return { kode: 409, badan: { error: "Registration is closed: this ballot's vote deadline has passed." } };
    }
    if (ledger.leafTerdaftar(leaf)) {
      const entri: EntriInbox = { leaf, status: "registered", diterimaPada: this.opsi.sekarangMs() };
      this.entri.set(leaf, entri);
      return { kode: 200, badan: keBadan(entri) };
    }
    const antre = BigInt(this.ringkasan().queued + this.ringkasan().submitting);
    if (ledger.registeredCount + antre >= ledger.eligibleCount) {
      return { kode: 409, badan: { error: `All ${ledger.eligibleCount} seats on this ballot are taken.` } };
    }

    const entri: EntriInbox = { leaf, status: "queued", diterimaPada: this.opsi.sekarangMs() };
    this.entri.set(leaf, entri);
    this.opsi.log?.info({ leaf, ip }, "Leaf diterima — masuk antrean pendaftaran");
    void this.proses();
    return { kode: 202, badan: keBadan(entri) };
  }

  /**
   * Worker: mengambil SEMUA yang antre (maks 8) dan mengirim SATU transaksi
   * registerVoters. Dipicu setiap kali ada leaf baru; hanya satu transaksi
   * berjalan pada satu waktu (wallet yang sama tidak boleh menyeimbangkan dua
   * transaksi bersamaan). Leaf yang datang selama pengiriman menunggu putaran
   * berikutnya — otomatis, tanpa menunggu 8.
   */
  async proses(): Promise<void> {
    if (this.sedangMengirim) return;
    this.sedangMengirim = true;
    try {
      for (;;) {
        const batch = [...this.entri.values()].filter((e) => e.status === "queued").slice(0, 8);
        if (batch.length === 0) return;
        for (const e of batch) e.status = "submitting";
        try {
          const { txId } = await this.opsi.daftarkan(batch.map((e) => e.leaf));
          for (const e of batch) {
            e.status = "registered";
            e.txId = txId;
          }
          this.opsi.log?.info({ jumlah: batch.length, txId }, "Batch terdaftar di rantai");
        } catch (err) {
          const pesan = err instanceof Error ? err.message : String(err);
          for (const e of batch) {
            e.status = "failed";
            e.error = pesan;
          }
          this.opsi.log?.error({ jumlah: batch.length, pesan }, "Batch GAGAL didaftarkan");
        }
      }
    } finally {
      this.sedangMengirim = false;
    }
  }

  /** Handler HTTP mentah — dipasang di http.createServer oleh register-inbox.ts. */
  handler(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
    return (req, res) => {
      void this.tangani(req, res);
    };
  }

  private async tangani(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://inbox.local");
    // Diterima dengan atau tanpa awalan /register: lewat proxy app, Express
    // melepas awalan mount; langsung ke port inbox, awalannya masih ada.
    const jalur = url.pathname.replace(/^\/register(?=\/|$)/, "") || "/";

    if (req.method === "OPTIONS") {
      res.writeHead(204, HEADER_CORS);
      res.end();
      return;
    }
    if (req.method === "GET" && jalur === "/health") {
      let ledger: LedgerInbox | null = null;
      try {
        ledger = await this.opsi.bacaLedger();
      } catch {
        ledger = null;
      }
      jawabJson(res, 200, {
        ballot: this.opsi.alamatBallot,
        registeredCount: ledger ? ledger.registeredCount.toString() : null,
        eligibleCount: ledger ? ledger.eligibleCount.toString() : null,
        ...this.ringkasan(),
      });
      return;
    }
    if (req.method === "POST" && jalur === "/") {
      let badan: unknown;
      try {
        badan = await bacaBadanJson(req);
      } catch (e) {
        jawabJson(res, 400, { error: `Invalid request body: ${(e as Error).message}` });
        return;
      }
      const b = (badan ?? {}) as { ballot?: unknown; leaf?: unknown };
      const hasil = await this.terima({ ballot: b.ballot, leaf: b.leaf }, ipDari(req));
      jawabJson(res, hasil.kode, hasil.badan);
      return;
    }
    const cocok = /^\/([0-9a-fA-Fx]+)\/([0-9a-fA-Fx]+)$/.exec(jalur);
    if (req.method === "GET" && cocok) {
      const ballot = normalisasiHex64(cocok[1]);
      const leaf = normalisasiHex64(cocok[2]);
      if (ballot === null || leaf === null || ballot !== this.opsi.alamatBallot) {
        jawabJson(res, 404, { error: "Unknown ballot or leaf." });
        return;
      }
      const e = this.entri.get(leaf);
      if (e === undefined) {
        jawabJson(res, 404, { error: "This leaf has not been sent to this inbox." });
        return;
      }
      jawabJson(res, 200, keBadan(e));
      return;
    }
    jawabJson(res, 404, { error: "Not found." });
  }
}

function keBadan(e: EntriInbox): object {
  return { leaf: e.leaf, status: e.status, ...(e.txId ? { txId: e.txId } : {}), ...(e.error ? { error: e.error } : {}) };
}

/** Membuka server HTTP inbox di host:port; port 0 = acak (untuk uji). */
export function dengarkanInbox(inbox: Inbox, port: number, host = "127.0.0.1"): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(inbox.handler());
  return new Promise((selesai, gagal) => {
    server.once("error", gagal);
    server.listen(port, host, () => selesai({ server, port: (server.address() as AddressInfo).port }));
  });
}

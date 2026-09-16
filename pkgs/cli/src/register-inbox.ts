// `pnpm cli register-inbox` — "registration inbox" penyelenggara.
//
// Menjalankan server HTTP kecil (bawaan 127.0.0.1:5390) yang menerima LEAF
// (hash publik credential) dari pemilih mana pun dan mendaftarkannya ke
// ballot SEGERA lewat registerVoters — satu transaksi per batch berisi berapa
// pun leaf yang sedang antre (maks 8), tanpa menunggu penuh. Pemilih memantau
// statusnya lewat GET, dan app di sisi pemilih memastikan sendiri lewat
// indexer bahwa leaf-nya sudah ada di pohon eligibility.
//
// Yang dipegang proses ini: wallet penyelenggara (seed lewat prompt tanpa
// gema / stdin) untuk membayar transaksi, dan kunci admin ballot. Yang TIDAK
// PERNAH sampai ke sini: credential, salt, opening, pilihan pemilih. Log
// hanya memuat leaf (publik) dan txId (publik).
//
// Dijangkau publik lewat proxy `/register` di server app (server/index.ts,
// env VOTEPRIV_INBOX_URL) — mis. https://votepriv.mdloglabs.org/register —
// dan alamat itulah yang ditulis ke eligibilityPolicy ballot saat deploy
// (VOTEPRIV_INBOX_URL pada `pnpm cli deploy-ballot`), sehingga app pemilih
// menemukannya dari rantai, bukan dari konfigurasi.
//
// Dibiarkan hidup selama pendaftaran dibuka; Ctrl+C menutup rapi (cache
// wallet disimpan). Semua transaksi wallet ini HARUS lewat proses ini selagi
// ia hidup — jangan menjalankan deploy-ballot/register-leaves/e2e bersamaan
// dengan wallet yang sama (dua proses menyeimbangkan UTXO dust yang sama).
import { emptyBallotPrivateState } from "contract";
import { bacaArtefak, pastikanAlamatKontrak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import { bacaLedgerBallot, daftarkanVoter, kunciAdmin, temukanBallot } from "./deploy.ts";
import { Inbox, dengarkanInbox, type LedgerInbox } from "./inbox.ts";
import { rakitProvidersBallot } from "./providers.ts";

const port = Number(process.env.VOTEPRIV_INBOX_PORT ?? "5390");
const host = process.env.VOTEPRIV_INBOX_HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`VOTEPRIV_INBOX_PORT tidak sah: ${process.env.VOTEPRIV_INBOX_PORT}`);
  process.exit(1);
}

const sesi = await siapkanSesi();
const { config, log, ctx, kp } = sesi;

const alamatBallotMentah = process.env.VOTEPRIV_BALLOT ?? bacaArtefak(config.networkId)?.ballot;
if (alamatBallotMentah === undefined) {
  log.error("Tidak ada alamat ballot. Jalankan `pnpm cli deploy-ballot` lebih dulu, atau setel VOTEPRIV_BALLOT=<alamat>.");
  await hentikanWallet(ctx, log);
  process.exit(1);
}
const alamatBallot = pastikanAlamatKontrak(alamatBallotMentah);

const rahasiaAdmin = kunciAdmin(ctx); // JANGAN PERNAH di-log
const providersBallot = await rakitProvidersBallot(kp, "admin");
const ballot = await temukanBallot(providersBallot, alamatBallot, emptyBallotPrivateState(rahasiaAdmin));

const hexKeBita = (hex: string): Uint8Array => {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return b;
};

const bacaLedger = async (): Promise<LedgerInbox> => {
  const lb = await bacaLedgerBallot(kp.publicDataProvider, alamatBallot);
  return {
    registeredCount: lb.registeredCount,
    eligibleCount: lb.eligibleCount,
    voteDeadline: lb.voteDeadline,
    leafTerdaftar: (leafHex) => {
      try {
        return lb.eligibility.findPathForLeaf(hexKeBita(leafHex)) !== undefined;
      } catch {
        return false;
      }
    },
  };
};

const inbox = new Inbox({
  alamatBallot,
  bacaLedger,
  daftarkan: async (leaves) => {
    const { txIds } = await daftarkanVoter(ballot, leaves.map(hexKeBita), log, {
      publicDataProvider: kp.publicDataProvider,
      alamatBallot,
    });
    return { txId: txIds[0] ?? "landed (transaction id not captured — confirmed via registeredCount)" };
  },
  batasPerIpPerJam: Number(process.env.VOTEPRIV_INBOX_BATAS_IP ?? "20"),
  log,
});

const { server } = await dengarkanInbox(inbox, port, host);
const awal = await bacaLedger();
log.info(
  { alamatBallot, url: `http://${host}:${port}/register`, registeredCount: awal.registeredCount.toString(), eligibleCount: awal.eligibleCount.toString() },
  "Registration inbox siap — menunggu leaf dari pemilih (Ctrl+C untuk berhenti)",
);

let sedangTutup = false;
const tutup = async (sinyal: string): Promise<void> => {
  if (sedangTutup) return;
  sedangTutup = true;
  log.info({ sinyal, ...inbox.ringkasan() }, "Menutup inbox");
  await new Promise<void>((r) => server.close(() => r()));
  await tutupSesi(sesi, 0);
};
process.on("SIGINT", () => void tutup("SIGINT"));
process.on("SIGTERM", () => void tutup("SIGTERM"));

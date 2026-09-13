import { toast } from "sonner";
import {
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Code2,
  Fingerprint,
  Github,
  Globe2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

/**
 * Task 9 (C-2b) — audit ulang SELURUH klaim privasi/jalur-tulis di berkas ini
 * terhadap kode yang SUNGGUH ada hari ini, bukan terhadap niat lama (C-2a
 * memperbaikinya sekali, sebelum jalur tulis ada). Lima kalimat diperbaiki —
 * daftar lengkap dengan alasan ada di task-9-report.md:
 *
 *  1. CTA "Write path is next" — SALAH sejak Task 5-7: jalur tulis
 *     (castVote/tallyVote lewat Lace + proof server) sudah berjalan.
 *  2. Klaim proof ZK — "jaringan" tidak belajar pilihan Anda itu benar, tapi
 *     tidak menyebut bahwa proof SERVER (milik penyelenggara, bukan chain)
 *     melihat witness mentah untuk membangun proof itu.
 *  3. Klaim tally agregat — pembukaan suara MELABELI opsinya secara publik
 *     PER TRANSAKSI (bukan sekadar "angka berjalan"), dan anonimitasnya
 *     berukuran talliedCount saat itu, bukan ukuran ballot.
 *  4. "Losing local state loses the vote" — tidak lagi selalu benar sejak
 *     Task 7/8 menambah cadangan opening yang bisa diunduh; tapi cadangan itu
 *     sendiri adalah kuitansi suara (siapa pun yang memegangnya tahu pilihan
 *     Anda), jadi frasa itu tidak boleh diganti tanpa syarat.
 *  5. (Baru) Cakupan verifikasi privasi pembayar — privasi-pembayar.test.ts
 *     membuktikannya untuk transaksi yang dibangun CLI, BUKAN untuk Lace:
 *     Lace mendelegasikan penyeimbangan transaksi ke ekstensi, kotak hitam
 *     yang tidak bisa diperiksa dari pohon ini.
 */
export function Docs() {
  return <section className="page-section docs-page"><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-mark" /> The privacy model</p><h1>Docs for humans.</h1><p>Everything you need to understand what VotePriv reveals, what it protects, and why the result can still be trusted.</p></div></div><div className="docs-grid"><div className="doc-main"><div className="doc-flow"><div className="flow-line" /><div className="flow-node"><span>01</span><div><strong>Eligibility</strong><p>A credential or membership proof confirms you are allowed to vote.</p></div><ShieldCheck size={19} /></div><div className="flow-node"><span>02</span><div><strong>Commitment</strong><p>Your selection is sealed before it ever touches the public surface.</p></div><LockKeyhole size={19} /></div><div className="flow-node"><span>03</span><div><strong>ZK proof</strong><p>The network verifies the rules without learning your choice — though the proof server that builds this proof does see it, for the moment proving takes.</p></div><Fingerprint size={19} /></div><div className="flow-node"><span>04</span><div><strong>Aggregate tally</strong><p>Opening a sealed vote publicly labels that transaction with the option it reveals — your anonymity is bounded by how many votes have already been opened when yours is, not by the ballot's total size. Finalizing a ballot only closes it; it does not hide anything that was already opened.</p></div><BarChart3 size={19} /></div></div><div className="code-note"><div className="code-note-top"><Code2 size={15} /> Read path, today <span>TypeScript</span></div><pre>{`bacaRantai()\n  → registry.ballots          (contract discovery)\n  → per-ballot contract state (title, counts, tallies)\n  → block height + epoch      (network status)\n\nNo wallet. No proof server. No signing.\nPublic HTTP requests only: one for the registry, one batch\nper 24 ballots, one for network status.`}</pre></div></div><div className="docs-sidebar"><div className="side-panel"><p className="eyebrow mint-text">Design principle</p><h2>Publicly useful.<br />Privately safe.</h2><p>VotePriv separates what must be verified from what should remain yours.</p><button className="panel-link" onClick={() => toast.info("Read and write paths, both live", { description: "Reads come from a real Midnight contract over the indexer. Casting and tallying votes go through a real wallet connection (Lace) and a real proof server. Voters generate their own credential in the browser and hand the organizer only its public leaf — the organizer still submits registerVoters through the CLI, but never sees or holds anyone's credential." })}>View adapter notes <ArrowUpRight size={14} /></button></div><div className="side-panel docs-links"><p className="eyebrow">Resources</p><button><Globe2 size={15} /> Midnight docs <ArrowUpRight size={14} /></button><button><Github size={15} /> GitHub repository <ArrowUpRight size={14} /></button><button><CircleHelp size={15} /> FAQ for voters <ArrowUpRight size={14} /></button></div><div className="side-panel"><p className="eyebrow mint-text">Known limits</p><h2>What this design costs.</h2><p><strong>Unopened votes do not count.</strong> Voters must return after the deadline to open their sealed vote. The gap is public as sealed minus opened, so it stays auditable — but it is a real cost of the two-phase design.</p><p><strong>Quorum is a stated intention, not a rule.</strong> The contract records the quorum the ballot creator asked for, and never checks it. A ballot finalizes at 0% turnout exactly as it does at 100%.</p><p><strong>Losing local state loses the vote — unless you kept the backup.</strong> Casting a vote offers a one-time backup file (your option and salt) to download; without it or the original browser storage, clearing your device before the tally makes a sealed vote permanently uncountable. That backup file is also a perfect receipt of your choice — anyone who holds it knows how you voted.</p><p><strong>Payer privacy is verified for the CLI, not yet for Lace.</strong> Automated tests prove that CLI-submitted castVote/tallyVote transactions carry no payer, signer, or sender field on testnet. Voting from a browser wallet delegates that same balancing step to the extension, which this codebase cannot inspect — so the same guarantee has not been verified for that path.</p></div></div></div></section>;
}

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleHelp,
  Fingerprint,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { BallotCard } from "./BallotCard";
import { menerimaSuara } from "./ballot-status";
import type { Ballot, Section } from "./types";
import type { AksiTerbaca, HasilRantai, PerubahanAksi } from "@/lib/chain";

/**
 * Recent activity, BENAR-BENAR DIBACA dari rantai.
 *
 * Yang membuat kalimat itu benar bukan pengambilan `state`-nya, melainkan
 * PEMAKAIANNYA: baca-rantai.ts mendekode snapshot ledger pada setiap aksi dan
 * menyelisihkannya terhadap aksi sebelumnya, sehingga `a.perubahan` memuat
 * "voteCount 2 → 3" dan bukan sekadar "castVote dipanggil". Spec 9.4 meminta
 * persis itu: "perubahan terbaru pada voteCount, talliedCount, dan
 * registry.count".
 *
 * Nama entry point tetap dipakai untuk JUDUL baris, karena ia memang nama
 * tindakannya. Yang tidak boleh terjadi adalah judul itu berpura-pura sebagai
 * pembacaan ketika tidak ada angka di belakangnya — lihat `detailAksi`.
 */
export function labelAksi(a: AksiTerbaca): string {
  if (a.jenis === "ContractDeploy") return "Contract deployed";
  if (a.jenis === "ContractUpdate") return "Contract updated";
  switch (a.entryPoint) {
    case "castVote": return "Vote sealed";
    case "tallyVote": return "Vote opened";
    case "registerVoters": return "Voters registered";
    case "finalize": return "Ballot finalized";
    case "register": return "Ballot registered";
    default: return a.entryPoint ?? "Contract call";
  }
}

/** Nama bidang ledger untuk mata manusia. Teks UI Inggris. */
const NAMA_BIDANG: Record<PerubahanAksi["bidang"], string> = {
  voteCount: "sealed votes",
  talliedCount: "opened votes",
  registeredCount: "registered voters",
  phase: "phase",
  count: "registered ballots",
};

/**
 * Baris kedua setiap entri aktivitas — dan satu-satunya tempat klaim
 * "dibaca dari ledger" ditunaikan atau ditarik.
 *
 * TIGA kemungkinan, dan ketiganya jujur:
 *   - ada selisih         → "sealed votes 2 → 3"
 *   - pendahulu terbaca, tidak ada yang berubah → "no ledger change"
 *   - pendahulu di luar jendela actions()       → "earlier state not read"
 *
 * Kalimat ketiga itu yang membedakan rencana ini dari yang sebelumnya: ia
 * mengaku tidak tahu alih-alih melaporkan nol perubahan.
 */
export function detailAksi(a: AksiTerbaca): string {
  if (a.perubahan.length > 0) {
    return a.perubahan.map(p => `${NAMA_BIDANG[p.bidang]} ${p.dari} → ${p.ke}`).join(" · ");
  }
  if (!a.cuplikanTerbaca) return "ledger state could not be read";
  if (!a.pendahuluTerbaca) return "earlier state not read";
  return "no ledger change";
}

/** Blok waktu aksi, diformat UTC seperti seluruh waktu lain di aplikasi ini. */
const FORMAT_AKSI = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

/**
 * Warna ikon diturunkan dari JENIS perubahan, bukan diputar menurut indeks.
 * Ketiga kelas sudah ada di index.css: .activity-icon.mint/.violet/.blue.
 */
export function toneAksi(a: AksiTerbaca): "mint" | "violet" | "blue" {
  if (a.perubahan.some(p => p.bidang === "talliedCount" || p.bidang === "phase")) return "blue";
  if (a.perubahan.some(p => p.bidang === "voteCount")) return "mint";
  return "violet";
}

export function aktivitasTerbaru(hasil: HasilRantai, batas = 3): AksiTerbaca[] {
  return [...hasil.registry.aksi, ...hasil.ballot.flatMap(b => b.aksi)]
    .sort((x, y) => y.height - x.height)
    .slice(0, batas);
}

export function Overview({ hasil, ballots, onVote, onRegister, onCreate, onSection }: {
  hasil: HasilRantai;
  ballots: Ballot[];
  onVote: (ballot: Ballot) => void;
  /** Opsional — lihat komentar prop yang sama di BallotCard.tsx. */
  onRegister?: (ballot: Ballot) => void;
  onCreate: () => void;
  onSection: (section: Section) => void;
}) {
  // ballots[0] pada registry KOSONG bernilai undefined, dan baris berikutnya
  // membaca featured.votes. Itu crash — dan ia persis lubang yang rencana ini
  // janjikan tutup, karena registry yang benar-benar kosong adalah keadaan yang
  // SAH: pembacaan berhasil, hanya tidak ada ballot yang terdaftar.
  //
  // Ini BUKAN permukaan gagal. Home hanya merender Overview pada fase `siap`,
  // jadi sampai di sini pembacaan sudah pasti berhasil.
  if (ballots.length === 0) {
    return (
      <section className="page-section">
        <div className="page-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-mark" /> Midnight {hasil.jaringan.networkId}</p>
            <h1>No ballots yet.</h1>
            <p>
              The registry at {hasil.jaringan.alamatRegistry.slice(0, 12)}… was read successfully
              and holds no ballots. Block {hasil.blok.height.toLocaleString()}.
            </p>
          </div>
          <button className="primary-button" onClick={onCreate}><Plus size={16} /> Create ballot</button>
        </div>
        <div className="empty-state">
          <Vote size={22} />
          <h3>The registry is empty</h3>
          <p>Every ballot is discovered through the registry. Once one is registered, it appears here.</p>
        </div>
      </section>
    );
  }

  const featured = ballots[0];
  return (
    <>
      <section className="hero-row">
        <div>
          <p className="eyebrow"><span className="eyebrow-mark" /> Midnight network · private governance</p>
          <h1>Decisions that stay<br /><em>yours.</em></h1>
          <p className="hero-copy">
            Vote with confidence. VotePriv makes every ballot <strong>private for the voter</strong> and{" "}
            <strong>verifiable for everyone.</strong>
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onVote(featured)}><Vote size={16} /> Vote on featured ballot</button>
            <button className="secondary-button" onClick={onCreate}><Plus size={16} /> Create ballot</button>
          </div>
        </div>
        <div className="hero-proof-card">
          <div className="proof-card-grid" />
          <div className="proof-card-top">
            {/* "LIVE PROOF LAYER" -> pernyataan tentang MODEL kontraknya. C-2a
                tidak membuat maupun memverifikasi satu proof pun; jalur bukti
                adalah C-2b. Lencana jaringan memakai jaringan yang benar-benar
                dibaca. */}
            <span className="mini-label">PRIVACY MODEL</span>
            <span className="network-dot"><span /> {hasil.jaringan.networkId}</span>
          </div>
          <div className="proof-visual">
            <div className="proof-core"><Fingerprint size={30} /><span className="core-dot" /></div>
            <div className="proof-label label-one"><span /> Private input</div>
            <div className="proof-label label-two"><span /> Public proof</div>
            <div className="proof-line line-one" />
            <div className="proof-line line-two" />
          </div>
          <div className="proof-card-bottom">
            <div><strong>Proofs verified on-chain</strong><span>by the contract, not by this page</span></div>
            <ArrowUpRight size={17} />
          </div>
        </div>
      </section>
      <section className="metric-grid">
        <div className="metric-card">
          <div className="metric-icon mint"><Activity size={18} /></div>
          {/* "Open for voting", bukan "Active ballots": dihitung dari status
              turunan, sehingga ballot yang phase-nya masih voting tetapi
              deadline-nya sudah lewat TIDAK ikut dihitung. */}
          <span>Open for voting</span>
          <strong>{ballots.filter(b => menerimaSuara(b.status)).length}</strong>
          <small>of {ballots.length} on the registry</small>
        </div>
        <div className="metric-card">
          <div className="metric-icon violet"><ShieldCheck size={18} /></div>
          <span>Verified votes</span>
          <strong>{ballots.reduce((s, b) => s + b.votes, 0).toLocaleString()}</strong>
          <small>{ballots.reduce((s, b) => s + b.tallied, 0).toLocaleString()} opened so far</small>
        </div>
        <div className="metric-card">
          <div className="metric-icon blue"><LockKeyhole size={18} /></div>
          <span>Tally during voting</span>
          <strong>Sealed</strong>
          <small>Enforced by the contract</small>
        </div>
        <div className="metric-card network-card">
          <div className="metric-network-line">
            <span className="pulse-dot" /> Midnight {hasil.jaringan.networkId}
            <span className="network-live">Operational</span>
          </div>
          <div className="network-bar"><span /><span /><span /><span /><span /><span /><span /><span /></div>
          {/* Finality TIDAK PUNYA FIELD di skema indexer. Yang ditampilkan
              adalah padanan terdekat yang benar-benar ada: posisi di dalam
              epoch. */}
          <small>
            Last block <strong>{hasil.blok.height.toLocaleString()}</strong>
            {hasil.epoch
              ? <> · epoch {hasil.epoch.epochNo}, {hasil.epoch.elapsedSeconds}s of {hasil.epoch.durationSeconds}s</>
              : <> · epoch position unavailable</>}
          </small>
        </div>
      </section>
      <section className="content-grid">
        <div className="main-column">
          <div className="section-heading">
            <div><p className="eyebrow">Make your voice count</p><h2>Featured ballot</h2></div>
            <button className="link-button" onClick={() => onSection("Live ballots")}>View all ballots <ArrowUpRight size={14} /></button>
          </div>
          <BallotCard ballot={featured} onVote={onVote} onRegister={onRegister} />
          <div className="section-heading lower-heading">
            <div><p className="eyebrow">Browse the room</p><h2>Active ballots</h2></div>
            <button className="link-button" onClick={() => onSection("Live ballots")}>Explore <ArrowUpRight size={14} /></button>
          </div>
          <div className="mini-ballot-list">
            {ballots.slice(1, 3).map(ballot => <BallotCard key={ballot.id} ballot={ballot} onVote={onVote} onRegister={onRegister} />)}
          </div>
        </div>
        <aside className="side-column">
          <div className="side-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">A quiet audit trail</p><h2>Recent activity</h2></div>
              <button className="icon-button" aria-label="View activity"><ArrowUpRight size={16} /></button>
            </div>
            <div className="activity-list">
              {aktivitasTerbaru(hasil).map(a => (
                /* txHash + height unik per aksi; alamat kontrak tidak, karena
                   satu kontrak menyumbang beberapa baris. */
                <div className="activity-item" key={`${a.txHash}-${a.height}`}>
                  <div className={`activity-icon ${toneAksi(a)}`}>
                    {a.jenis === "ContractDeploy" ? <Plus size={16} />
                      : a.entryPoint === "tallyVote" || a.entryPoint === "finalize" ? <BarChart3 size={16} />
                      : <ShieldCheck size={16} />}
                  </div>
                  <div>
                    <strong>{labelAksi(a)}</strong>
                    {/* Sumber, selisih ledger, blok, dan waktu. Keempatnya
                        fakta rantai; tidak satu pun diturunkan dari jam
                        perangkat atau dikarang. */}
                    <span>
                      {a.sumber} · {detailAksi(a)} · block {a.height.toLocaleString()} ·{" "}
                      {FORMAT_AKSI.format(new Date(a.timestampMs))} UTC
                    </span>
                  </div>
                  {/* Centang HANYA ketika ada angka ledger yang benar-benar
                      terbaca. */}
                  {a.cuplikanTerbaca && (
                    <span className="activity-check"><Check size={12} /></span>
                  )}
                </div>
              ))}
              {aktivitasTerbaru(hasil).length === 0 && (
                <div className="activity-item">
                  <div className="activity-icon violet"><CircleHelp size={16} /></div>
                  <div>
                    <strong>No contract activity read</strong>
                    <span>The registry and its ballots reported no recent actions.</span>
                  </div>
                </div>
              )}
            </div>
            <button className="panel-link" onClick={() => onSection("Results")}>Open audit log <ArrowUpRight size={14} /></button>
          </div>
          <div className="side-panel how-panel">
            <div className="panel-heading">
              <div><p className="eyebrow mint-text">Built for trust</p><h2>How it works</h2></div>
              <CircleHelp size={18} />
            </div>
            <div className="how-step"><span>01</span><div><strong>Prove eligibility</strong><p>Show you can vote without revealing who you are.</p></div></div>
            <div className="how-step"><span>02</span><div><strong>Seal your choice</strong><p>Your vote becomes a private commitment.</p></div></div>
            <div className="how-step"><span>03</span><div><strong>Verify the result</strong><p>Anyone can audit the aggregate tally.</p></div></div>
            <button className="panel-link" onClick={() => onSection("Docs")}>Read the privacy model <ArrowUpRight size={14} /></button>
          </div>
        </aside>
      </section>
    </>
  );
}

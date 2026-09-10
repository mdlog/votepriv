import { useMemo, useState } from "react";
import { toast } from "sonner";
import { connectMidnightWallet, describeWalletError } from "@/lib/midnight-wallet";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Code2,
  Copy,
  FileCheck2,
  Fingerprint,
  Github,
  Globe2,
  Info,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Vote,
  Wallet,
  X,
  Zap,
} from "lucide-react";

type Section = "Overview" | "Live ballots" | "Results" | "Docs";
type BallotStatus = "live" | "closing-soon" | "finalized";

type Ballot = {
  id: string;
  title: string;
  description: string;
  community: string;
  votes: number;
  eligible: number;
  quorum: number;
  deadline: string;
  status: BallotStatus;
  options: string[];
  accent: string;
  tag: string;
};

type Receipt = {
  ballotId: string;
  proofStatus: "verified";
  nullifierStatus: "consumed";
  txRef: string;
};

const initialBallots: Ballot[] = [
  {
    id: "ballot-042",
    title: "Q4 Community Treasury",
    description: "Choose how the community treasury supports public goods in Q4.",
    community: "Midnight Builders",
    votes: 842,
    eligible: 1200,
    quorum: 60,
    deadline: "Oct 18, 2026",
    status: "live",
    options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
    accent: "mint",
    tag: "Featured",
  },
  {
    id: "ballot-041",
    title: "Protocol Grants Round 03",
    description: "Prioritise the next cohort of privacy tooling grants.",
    community: "ZK Commons",
    votes: 316,
    eligible: 500,
    quorum: 55,
    deadline: "Oct 16, 2026",
    status: "closing-soon",
    options: ["Identity primitives", "Developer education", "Audit funding"],
    accent: "violet",
    tag: "Closing soon",
  },
  {
    id: "ballot-039",
    title: "Network Upgrade 7B",
    description: "Signal community support for the next network upgrade window.",
    community: "Midnight Core",
    votes: 1108,
    eligible: 1500,
    quorum: 66,
    deadline: "Finalized Sep 28, 2026",
    status: "finalized",
    options: ["Support", "Abstain", "Do not support"],
    accent: "blue",
    tag: "Finalized",
  },
];

const navItems: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Live ballots", icon: Vote },
  { label: "Results", icon: BarChart3 },
  { label: "Docs", icon: Code2 },
];

function shortAddress(address: string) {
  if (!address) return "";
  // Alamat Midnight berbentuk mn_shield-addr_test1… — prefiksnya selalu sama, jadi
  // dibuang supaya bagian yang membedakan (jaringan + ekor) tetap terbaca.
  const bare = address.replace(/^mn_(shield-addr|addr)_/, "");
  if (bare.length <= 12) return bare;
  return `${bare.slice(0, 6)}…${bare.slice(-4)}`;
}

function statusLabel(status: BallotStatus) {
  if (status === "closing-soon") return "Closing soon";
  if (status === "finalized") return "Finalized";
  return "Live now";
}

function VoteModal({
  ballot,
  connected,
  onClose,
  onVote,
}: {
  ballot: Ballot;
  connected: boolean;
  onClose: () => void;
  onVote: (receipt: Receipt) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [stage, setStage] = useState<"select" | "proving" | "success">("select");

  const submit = () => {
    if (!connected) {
      toast.error("Connect your wallet first", { description: "VotePriv needs a wallet to check eligibility." });
      return;
    }
    if (!selected) {
      toast.error("Select an option", { description: "Your choice stays private after you submit." });
      return;
    }
    setStage("proving");
    window.setTimeout(() => setStage("success"), 1350);
    window.setTimeout(() => {
      onVote({ ballotId: ballot.id, proofStatus: "verified", nullifierStatus: "consumed", txRef: "0x7f…a91c" });
    }, 1750);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="vote-modal" role="dialog" aria-modal="true" aria-labelledby="vote-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close vote dialog"><X size={18} /></button>
        {stage === "select" && (
          <>
            <div className="modal-kicker"><LockKeyhole size={14} /> Private ballot</div>
            <div className="modal-heading-row">
              <div>
                <p className="eyebrow">{ballot.community} · {ballot.id}</p>
                <h2 id="vote-title">{ballot.title}</h2>
              </div>
              <span className="live-pill"><span /> {statusLabel(ballot.status)}</span>
            </div>
            <p className="modal-description">Choose one option. Your selection will be sealed into a zero-knowledge proof and never exposed as a public wallet action.</p>
            <div className="choice-list">
              {ballot.options.map((option, index) => (
                <button key={option} className={`choice-row ${selected === option ? "selected" : ""}`} onClick={() => setSelected(option)}>
                  <span className={`choice-index choice-${index}`}>{String(index + 1).padStart(2, "0")}</span>
                  <span className="choice-label">{option}</span>
                  <span className="choice-radio">{selected === option && <Check size={14} />}</span>
                </button>
              ))}
            </div>
            <div className="privacy-callout"><ShieldCheck size={17} /><span><strong>Your choice stays private.</strong> Only the proof, nullifier status, and aggregate tally are verifiable.</span></div>
            <div className="modal-actions"><button className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={submit}><Sparkles size={16} /> Generate proof & vote</button></div>
          </>
        )}
        {stage === "proving" && (
          <div className="proof-state">
            <div className="proof-orbit"><Fingerprint size={32} /><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /></div>
            <p className="eyebrow mint-text">ZK proof in progress</p>
            <h2>Sealing your ballot</h2>
            <p>VotePriv is proving eligibility without revealing your identity or selection.</p>
            <div className="progress-track"><span /></div>
            <div className="proof-steps"><span className="done"><Check size={12} /> Eligibility checked</span><span className="active"><Zap size={12} /> Generating proof</span><span><Clock3 size={12} /> Submitting receipt</span></div>
          </div>
        )}
        {stage === "success" && (
          <div className="proof-state success-state"><div className="success-mark"><Check size={28} /></div><p className="eyebrow mint-text">Vote verified</p><h2>Your ballot is sealed.</h2><p>The network accepted your proof. Your choice will only contribute to the aggregate result.</p><div className="receipt-mini"><div><span>Proof status</span><strong><span className="status-dot" /> Verified</strong></div><div><span>Nullifier</span><strong>Consumed</strong></div><div><span>Receipt</span><strong>0x7f…a91c <Copy size={13} /></strong></div></div><button className="primary-button full-button" onClick={onClose}>Back to dashboard <ArrowUpRight size={15} /></button></div>
        )}
      </div>
    </div>
  );
}

function CreateBallotModal({ onClose, onCreate }: { onClose: () => void; onCreate: (ballot: Ballot) => void }) {
  const [title, setTitle] = useState("");
  const [community, setCommunity] = useState("Midnight Builders");
  const [optionOne, setOptionOne] = useState("Fund developer grants");
  const [optionTwo, setOptionTwo] = useState("Host local meetups");

  const create = () => {
    if (!title.trim() || !optionOne.trim() || !optionTwo.trim()) {
      toast.error("Complete the ballot details", { description: "A title and two options are required." });
      return;
    }
    onCreate({ id: `ballot-${Math.floor(Math.random() * 90 + 10)}`, title, description: "A new community decision, ready for private voting.", community, votes: 0, eligible: 0, quorum: 50, deadline: "Oct 24, 2026", status: "live", options: [optionOne, optionTwo], accent: "mint", tag: "New ballot" });
    toast.success("Ballot created", { description: "Your new ballot is ready for eligible voters." });
    onClose();
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="create-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={onClose} aria-label="Close create ballot dialog"><X size={18} /></button><div className="modal-kicker"><Plus size={14} /> Create ballot</div><h2>Put a decision on-chain.</h2><p className="modal-description">Create a proposal with privacy-first defaults. This demo keeps metadata local until a backend is connected.</p><div className="form-stack"><label>Ballot title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Community treasury allocation" /></label><label>Community<input value={community} onChange={(event) => setCommunity(event.target.value)} /></label><div className="form-grid"><label>Option one<input value={optionOne} onChange={(event) => setOptionOne(event.target.value)} /></label><label>Option two<input value={optionTwo} onChange={(event) => setOptionTwo(event.target.value)} /></label></div></div><div className="modal-actions"><button className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={create}><Plus size={16} /> Create ballot</button></div></div></div>;
}

function BallotCard({ ballot, onVote }: { ballot: Ballot; onVote: (ballot: Ballot) => void }) {
  const percentage = Math.min(100, Math.round((ballot.votes / Math.max(ballot.eligible, 1)) * 100));
  return <article className={`ballot-card accent-${ballot.accent}`}><div className="card-topline"><span className={`status-badge ${ballot.status}`}><span /> {statusLabel(ballot.status)}</span><span className="ballot-tag">{ballot.tag}</span></div><div className="ballot-title-row"><div><h3>{ballot.title}</h3><p>{ballot.description}</p></div><div className="ballot-symbol"><Vote size={19} /></div></div><div className="ballot-meta"><span><Globe2 size={14} /> {ballot.community}</span><span><Clock3 size={14} /> {ballot.deadline}</span></div><div className="ballot-progress-label"><span>Participation</span><strong>{percentage}%</strong></div><div className="progress-track slim"><span style={{ width: `${percentage}%` }} /></div><div className="ballot-footer"><span>{ballot.votes.toLocaleString()} of {ballot.eligible.toLocaleString()} votes <i>·</i> {ballot.quorum}% quorum</span>{ballot.status === "finalized" ? <button className="text-button" onClick={() => onVote(ballot)}>View result <ArrowUpRight size={14} /></button> : <button className="text-button" onClick={() => onVote(ballot)}>Vote privately <ChevronRight size={14} /></button>}</div></article>;
}

function Overview({ ballots, connected, onVote, onCreate, onSection }: { ballots: Ballot[]; connected: boolean; onVote: (ballot: Ballot) => void; onCreate: () => void; onSection: (section: Section) => void }) {
  const featured = ballots[0];
  const recent = [{ label: "Proof verified", detail: "Ballot 041 · 2 min ago", icon: ShieldCheck, tone: "mint" }, { label: "New ballot created", detail: "Network upgrade 7B · 18 min ago", icon: Plus, tone: "violet" }, { label: "Tally checkpoint", detail: "Treasury Q4 · 1 hr ago", icon: BarChart3, tone: "blue" }];
  return <>
    <section className="hero-row"><div><p className="eyebrow"><span className="eyebrow-mark" /> Midnight network · private governance</p><h1>Decisions that stay<br /><em>yours.</em></h1><p className="hero-copy">Vote with confidence. VotePriv makes every ballot <strong>private for the voter</strong> and <strong>verifiable for everyone.</strong></p><div className="hero-actions"><button className="primary-button" onClick={() => onVote(featured)}><Vote size={16} /> Vote on featured ballot</button><button className="secondary-button" onClick={onCreate}><Plus size={16} /> Create ballot</button></div></div><div className="hero-proof-card"><div className="proof-card-grid" /><div className="proof-card-top"><span className="mini-label">LIVE PROOF LAYER</span><span className="network-dot"><span /> Testnet</span></div><div className="proof-visual"><div className="proof-core"><Fingerprint size={30} /><span className="core-dot" /></div><div className="proof-label label-one"><span /> Private input</div><div className="proof-label label-two"><span /> Public proof</div><div className="proof-line line-one" /><div className="proof-line line-two" /></div><div className="proof-card-bottom"><div><strong>zk-verified</strong><span>without revealing the vote</span></div><ArrowUpRight size={17} /></div></div></section>
    <section className="metric-grid"><div className="metric-card"><div className="metric-icon mint"><Activity size={18} /></div><span>Active ballots</span><strong>12</strong><small><span className="up">+18%</span> this month</small></div><div className="metric-card"><div className="metric-icon violet"><ShieldCheck size={18} /></div><span>Verified votes</span><strong>4,286</strong><small><span className="up">+24.6%</span> participation</small></div><div className="metric-card"><div className="metric-icon blue"><LockKeyhole size={18} /></div><span>Privacy score</span><strong>100<span className="metric-suffix">/100</span></strong><small>All systems nominal</small></div><div className="metric-card network-card"><div className="metric-network-line"><span className="pulse-dot" /> Midnight testnet <span className="network-live">Operational</span></div><div className="network-bar"><span /><span /><span /><span /><span /><span /><span /><span /></div><small>Last block <strong>1,928,441</strong> · 2.4s finality</small></div></section>
    <section className="content-grid"><div className="main-column"><div className="section-heading"><div><p className="eyebrow">Make your voice count</p><h2>Featured ballot</h2></div><button className="link-button" onClick={() => onSection("Live ballots")}>View all ballots <ArrowUpRight size={14} /></button></div><BallotCard ballot={featured} onVote={onVote} /><div className="section-heading lower-heading"><div><p className="eyebrow">Browse the room</p><h2>Active ballots</h2></div><button className="link-button" onClick={() => onSection("Live ballots")}>Explore <ArrowUpRight size={14} /></button></div><div className="mini-ballot-list">{ballots.slice(1, 3).map((ballot) => <BallotCard key={ballot.id} ballot={ballot} onVote={onVote} />)}</div></div><aside className="side-column"><div className="side-panel"><div className="panel-heading"><div><p className="eyebrow">A quiet audit trail</p><h2>Recent activity</h2></div><button className="icon-button" aria-label="View activity"><ArrowUpRight size={16} /></button></div><div className="activity-list">{recent.map(({ label, detail, icon: Icon, tone }) => <div className="activity-item" key={label}><div className={`activity-icon ${tone}`}><Icon size={16} /></div><div><strong>{label}</strong><span>{detail}</span></div><span className="activity-check"><Check size={12} /></span></div>)}</div><button className="panel-link" onClick={() => onSection("Results")}>Open audit log <ArrowUpRight size={14} /></button></div><div className="side-panel how-panel"><div className="panel-heading"><div><p className="eyebrow mint-text">Built for trust</p><h2>How it works</h2></div><CircleHelp size={18} /></div><div className="how-step"><span>01</span><div><strong>Prove eligibility</strong><p>Show you can vote without revealing who you are.</p></div></div><div className="how-step"><span>02</span><div><strong>Seal your choice</strong><p>Your vote becomes a private commitment.</p></div></div><div className="how-step"><span>03</span><div><strong>Verify the result</strong><p>Anyone can audit the aggregate tally.</p></div></div><button className="panel-link" onClick={() => onSection("Docs")}>Read the privacy model <ArrowUpRight size={14} /></button></div></aside></section>
  </>;
}

function LiveBallots({ ballots, connected, onVote, onCreate }: { ballots: Ballot[]; connected: boolean; onVote: (ballot: Ballot) => void; onCreate: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = ballots.filter((ballot) => `${ballot.title} ${ballot.community}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-section"><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-mark" /> Community governance</p><h1>Live ballots</h1><p>Private decisions, open verification. Find a ballot and make your voice count.</p></div><button className="primary-button" onClick={onCreate}><Plus size={16} /> Create ballot</button></div><div className="toolbar"><div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ballots or communities" /></div><div className="filter-chip active">All <span>{ballots.length}</span></div><div className="filter-chip">Live <span>{ballots.filter((ballot) => ballot.status === "live").length}</span></div><div className="filter-chip">Finalized <span>{ballots.filter((ballot) => ballot.status === "finalized").length}</span></div></div><div className="ballots-grid">{filtered.map((ballot) => <BallotCard key={ballot.id} ballot={ballot} onVote={onVote} />)}</div>{filtered.length === 0 && <div className="empty-state"><Search size={22} /><h3>No ballots found</h3><p>Try a different community or title.</p></div>}</section>;
}

function Results({ ballots, receipt }: { ballots: Ballot[]; receipt: Receipt | null }) {
  return <section className="page-section"><div className="page-heading split-heading"><div><p className="eyebrow"><span className="eyebrow-mark" /> Public verification</p><h1>Results & audit</h1><p>Aggregate outcomes are visible. Individual choices never are.</p></div><div className="verified-stamp"><ShieldCheck size={18} /><span><strong>All proofs valid</strong><small>Network checkpoint #1,928,441</small></span></div></div><div className="results-layout"><div className="results-table-panel"><div className="panel-heading"><div><p className="eyebrow">Latest tallies</p><h2>Community outcomes</h2></div><button className="secondary-button compact"><ClipboardCheck size={15} /> Verify all</button></div><div className="result-rows">{ballots.map((ballot, index) => { const pct = index === 0 ? 62 : index === 1 ? 71 : 74; return <div className="result-row" key={ballot.id}><div className={`result-number result-${index}`}>0{index + 1}</div><div className="result-main"><div className="result-row-top"><strong>{ballot.title}</strong><span className={`status-badge ${ballot.status}`}><span /> {statusLabel(ballot.status)}</span></div><div className="result-bar"><span style={{ width: `${pct}%` }} /></div><div className="result-row-bottom"><span>{ballot.votes.toLocaleString()} verified votes</span><span>{pct}% leading option</span></div></div><ArrowUpRight size={16} className="muted-arrow" /></div>; })}</div></div><div className="result-side"><div className="side-panel privacy-result"><div className="privacy-result-icon"><LockKeyhole size={18} /></div><p className="eyebrow mint-text">Privacy preserved</p><h2>Zero choices exposed.</h2><p>We publish the proof state and the tally, never the voter-to-choice mapping.</p><div className="privacy-stat"><span>Individual choices</span><strong>Hidden</strong></div><div className="privacy-stat"><span>Proof validity</span><strong>100%</strong></div><div className="privacy-stat"><span>Nullifiers replayed</span><strong>0</strong></div></div>{receipt && <div className="side-panel receipt-panel"><p className="eyebrow">Your latest receipt</p><div className="receipt-line"><span className="status-dot" /> Proof verified <strong>{receipt.txRef}</strong></div></div>}</div></div></section>;
}

function Docs() {
  return <section className="page-section docs-page"><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-mark" /> The privacy model</p><h1>Docs for humans.</h1><p>Everything you need to understand what VotePriv reveals, what it protects, and why the result can still be trusted.</p></div></div><div className="docs-grid"><div className="doc-main"><div className="doc-flow"><div className="flow-line" /><div className="flow-node"><span>01</span><div><strong>Eligibility</strong><p>A credential or membership proof confirms you are allowed to vote.</p></div><ShieldCheck size={19} /></div><div className="flow-node"><span>02</span><div><strong>Commitment</strong><p>Your selection is sealed before it ever touches the public surface.</p></div><LockKeyhole size={19} /></div><div className="flow-node"><span>03</span><div><strong>ZK proof</strong><p>The network verifies the rules without learning your choice.</p></div><Fingerprint size={19} /></div><div className="flow-node"><span>04</span><div><strong>Aggregate tally</strong><p>Only the final count is revealed when the ballot is finalized.</p></div><BarChart3 size={19} /></div></div><div className="code-note"><div className="code-note-top"><Code2 size={15} /> Privacy adapter boundary <span>TypeScript</span></div><pre>{`generateProof({ ballotId, optionId })\n  → { commitment, proof }\n\nsubmitVote({ commitment, proof })\n  → { verified: true }`}</pre></div></div><div className="docs-sidebar"><div className="side-panel"><p className="eyebrow mint-text">Design principle</p><h2>Publicly useful.<br />Privately safe.</h2><p>VotePriv separates what must be verified from what should remain yours.</p><button className="panel-link" onClick={() => toast.info("Compact adapter is next", { description: "The frontend boundary is ready for a Midnight contract integration." })}>View adapter notes <ArrowUpRight size={14} /></button></div><div className="side-panel docs-links"><p className="eyebrow">Resources</p><button><Globe2 size={15} /> Midnight docs <ArrowUpRight size={14} /></button><button><Github size={15} /> GitHub repository <ArrowUpRight size={14} /></button><button><CircleHelp size={15} /> FAQ for voters <ArrowUpRight size={14} /></button></div></div></div></section>;
}

export default function Home() {
  const [section, setSection] = useState<Section>("Overview");
  const [ballots, setBallots] = useState<Ballot[]>(initialBallots);
  const [connected, setConnected] = useState(false);
  const [wallet, setWallet] = useState("");
  const [network, setNetwork] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [voteBallot, setVoteBallot] = useState<Ballot | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const connectWallet = async () => {
    if (connected) {
      setConnected(false);
      setWallet("");
      setNetwork("");
      toast.info("Wallet disconnected");
      return;
    }
    setConnecting(true);
    try {
      const result = await connectMidnightWallet();
      setWallet(result.address);
      setNetwork(result.networkId);
      setConnected(true);
      // Sengaja tidak mengklaim "eligibility check passed" seperti versi mock:
      // pemeriksaan itu belum ada sampai kontrak ballot tersambung.
      toast.success("Wallet connected", {
        description: `${result.connectorName} · connector v${result.apiVersion}`,
      });
    } catch (error) {
      console.error("[votepriv:wallet] connect gagal", error);
      toast.error("Could not connect wallet", { description: describeWalletError(error) });
    } finally {
      setConnecting(false);
    }
  };

  const handleVote = (nextReceipt: Receipt) => {
    setReceipt(nextReceipt);
    toast.success("Vote verified on Midnight testnet", { description: "Your choice remains private." });
  };

  const createBallot = (ballot: Ballot) => setBallots((current) => [ballot, ...current]);
  const currentCopy = useMemo(() => section === "Overview" ? "Your private governance workspace" : section === "Live ballots" ? "Choose with confidence" : section === "Results" ? "Trust, without the trade-off" : "Understand the protocol", [section]);

  return <div className="app-shell"><aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}><div className="brand"><div className="brand-mark"><span /><span /><span /></div><span>vote<span>priv</span></span></div><button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={20} /></button><div className="workspace-card"><div className="workspace-avatar">MB</div><div><strong>Midnight Builders</strong><span>Community workspace</span></div><ChevronRight size={15} /></div><div className="sidebar-label">Workspace</div><nav>{navItems.map(({ label, icon: Icon }) => <button key={label} className={section === label ? "active" : ""} onClick={() => { setSection(label); setMobileNav(false); }}><Icon size={17} /><span>{label}</span>{label === "Live ballots" && <b>12</b>}</button>)}</nav><div className="sidebar-bottom"><div className="privacy-mode"><div className="privacy-mode-icon"><LockKeyhole size={15} /></div><div><span>Privacy mode</span><strong>Always on</strong></div><span className="status-dot" /></div><button className="help-link" onClick={() => setSection("Docs")}><CircleHelp size={16} /> Help center</button><div className="sidebar-footer"><span>VotePriv v0.1</span><span>·</span><span>Testnet</span></div></div></aside><div className={`mobile-overlay ${mobileNav ? "visible" : ""}`} onClick={() => setMobileNav(false)} /><main className="main-shell"><header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="topbar-context"><span className="context-title">{currentCopy}</span><span className="context-divider">/</span><span className="context-section">{section}</span></div><div className="topbar-actions"><div className="network-status"><span className="pulse-dot" /> {connected && network ? `Midnight ${network}` : "Midnight testnet"} <ChevronRight size={14} /></div><button className={`wallet-button ${connected ? "connected" : ""}`} onClick={connectWallet} disabled={connecting}><Wallet size={16} />{connecting ? "Connecting…" : connected ? shortAddress(wallet) : "Connect wallet"}</button><div className="user-avatar">AR</div></div></header><div className="page-container">{section === "Overview" && <Overview ballots={ballots} connected={connected} onVote={setVoteBallot} onCreate={() => setCreateOpen(true)} onSection={setSection} />}{section === "Live ballots" && <LiveBallots ballots={ballots} connected={connected} onVote={setVoteBallot} onCreate={() => setCreateOpen(true)} />}{section === "Results" && <Results ballots={ballots} receipt={receipt} />}{section === "Docs" && <Docs />}</div></main>{voteBallot && <VoteModal ballot={voteBallot} connected={connected} onClose={() => setVoteBallot(null)} onVote={handleVote} />}{createOpen && <CreateBallotModal onClose={() => setCreateOpen(false)} onCreate={createBallot} />}</div>;
}

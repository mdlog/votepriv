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

export function Docs() {
  return <section className="page-section docs-page"><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-mark" /> The privacy model</p><h1>Docs for humans.</h1><p>Everything you need to understand what VotePriv reveals, what it protects, and why the result can still be trusted.</p></div></div><div className="docs-grid"><div className="doc-main"><div className="doc-flow"><div className="flow-line" /><div className="flow-node"><span>01</span><div><strong>Eligibility</strong><p>A credential or membership proof confirms you are allowed to vote.</p></div><ShieldCheck size={19} /></div><div className="flow-node"><span>02</span><div><strong>Commitment</strong><p>Your selection is sealed before it ever touches the public surface.</p></div><LockKeyhole size={19} /></div><div className="flow-node"><span>03</span><div><strong>ZK proof</strong><p>The network verifies the rules without learning your choice.</p></div><Fingerprint size={19} /></div><div className="flow-node"><span>04</span><div><strong>Aggregate tally</strong><p>Only the final count is revealed when the ballot is finalized.</p></div><BarChart3 size={19} /></div></div><div className="code-note"><div className="code-note-top"><Code2 size={15} /> Privacy adapter boundary <span>TypeScript</span></div><pre>{`generateProof({ ballotId, optionId })\n  → { commitment, proof }\n\nsubmitVote({ commitment, proof })\n  → { verified: true }`}</pre></div></div><div className="docs-sidebar"><div className="side-panel"><p className="eyebrow mint-text">Design principle</p><h2>Publicly useful.<br />Privately safe.</h2><p>VotePriv separates what must be verified from what should remain yours.</p><button className="panel-link" onClick={() => toast.info("Compact adapter is next", { description: "The frontend boundary is ready for a Midnight contract integration." })}>View adapter notes <ArrowUpRight size={14} /></button></div><div className="side-panel docs-links"><p className="eyebrow">Resources</p><button><Globe2 size={15} /> Midnight docs <ArrowUpRight size={14} /></button><button><Github size={15} /> GitHub repository <ArrowUpRight size={14} /></button><button><CircleHelp size={15} /> FAQ for voters <ArrowUpRight size={14} /></button></div></div></div></section>;
}

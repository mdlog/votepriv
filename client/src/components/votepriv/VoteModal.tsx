import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  Clock3,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { statusLabel } from "./ballot-status";
import type { Ballot, Receipt } from "./types";

export function VoteModal({
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
      // SIMULASI. Alur ini belum menyentuh kontrak: tidak ada witness yang disusun,
      // tidak ada proof yang dibuat, tidak ada transaksi yang dikirim. txRef sengaja
      // `null` — sebelumnya di sini ada hash palsu "0x7f…a91c" yang ditampilkan
      // berdampingan dengan kalimat "The network accepted your proof", dan itu satu-
      // satunya hal di aplikasi ini yang benar-benar tidak dapat dipertahankan.
      // Diganti alur sungguhan pada Rencana C-2 (spec §9.2 butir 1).
      onVote({ ballotId: ballot.id, proofStatus: "simulated", nullifierStatus: "not-consumed", txRef: null });
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
          <div className="proof-state success-state"><div className="success-mark"><Check size={28} /></div><p className="eyebrow mint-text">Simulated vote</p><h2>This is a preview of the flow.</h2><p>No proof was generated and nothing was submitted to the network. The contract, the ZK proof and the on-chain receipt arrive with the Midnight adapter.</p><div className="receipt-mini"><div><span>Proof status</span><strong>Simulated</strong></div><div><span>Nullifier</span><strong>Not consumed</strong></div><div><span>Receipt</span><strong>None — no transaction</strong></div></div><button className="primary-button full-button" onClick={onClose}>Back to dashboard <ArrowUpRight size={15} /></button></div>
        )}
      </div>
    </div>
  );
}

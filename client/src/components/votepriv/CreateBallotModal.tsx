import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

export function CreateBallotModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [community, setCommunity] = useState("Midnight Builders");
  const [optionOne, setOptionOne] = useState("Fund developer grants");
  const [optionTwo, setOptionTwo] = useState("Host local meetups");

  const create = () => {
    if (!title.trim() || !optionOne.trim() || !optionTwo.trim()) {
      toast.error("Complete the ballot details", { description: "A title and two options are required." });
      return;
    }
    // Deploy sungguhan adalah C-2b (spec 9.2 butir 3): ia menuntut wallet,
    // proof server, artefak ZK, dan constructor 14 argumen. Membuat Ballot lokal
    // di sini akan menampilkan ballot yang HILANG pada muat ulang berikutnya,
    // karena daftar sekarang dibaca dari registry on-chain.
    toast.info("Creating ballots needs a wallet", {
      description:
        "Deploying a ballot writes to the chain: it needs a wallet, a proof server, and the ZK artifacts. VotePriv reads the chain today; writing arrives next.",
    });
    onClose();
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="create-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={onClose} aria-label="Close create ballot dialog"><X size={18} /></button><div className="modal-kicker"><Plus size={14} /> Create ballot</div><h2>Put a decision on-chain.</h2><p className="modal-description">Create a proposal with privacy-first defaults. This demo keeps metadata local until a backend is connected.</p><div className="form-stack"><label>Ballot title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Community treasury allocation" /></label><label>Community<input value={community} onChange={(event) => setCommunity(event.target.value)} /></label><div className="form-grid"><label>Option one<input value={optionOne} onChange={(event) => setOptionOne(event.target.value)} /></label><label>Option two<input value={optionTwo} onChange={(event) => setOptionTwo(event.target.value)} /></label></div></div><div className="modal-actions"><button className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={create}><Plus size={16} /> Create ballot</button></div></div></div>;
}

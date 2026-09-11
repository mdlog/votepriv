import { ArrowUpRight, ChevronRight, Clock3, Globe2, Vote } from "lucide-react";
import { statusLabel } from "./ballot-status";
import type { Ballot } from "./types";

export function BallotCard({ ballot, onVote }: { ballot: Ballot; onVote: (ballot: Ballot) => void }) {
  const percentage = Math.min(100, Math.round((ballot.votes / Math.max(ballot.eligible, 1)) * 100));
  return <article className={`ballot-card accent-${ballot.accent}`}><div className="card-topline"><span className={`status-badge ${ballot.status}`}><span /> {statusLabel(ballot.status)}</span><span className="ballot-tag">{ballot.tag}</span></div><div className="ballot-title-row"><div><h3>{ballot.title}</h3><p>{ballot.description}</p></div><div className="ballot-symbol"><Vote size={19} /></div></div><div className="ballot-meta"><span><Globe2 size={14} /> {ballot.community}</span><span><Clock3 size={14} /> {ballot.deadline}</span></div><div className="ballot-progress-label"><span>Participation</span><strong>{percentage}%</strong></div><div className="progress-track slim"><span style={{ width: `${percentage}%` }} /></div><div className="ballot-footer"><span>{ballot.votes.toLocaleString()} of {ballot.eligible.toLocaleString()} votes <i>·</i> {ballot.quorum}% quorum</span>{ballot.status === "finalized" ? <button className="text-button" onClick={() => onVote(ballot)}>View result <ArrowUpRight size={14} /></button> : <button className="text-button" onClick={() => onVote(ballot)}>Vote privately <ChevronRight size={14} /></button>}</div></article>;
}

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { BallotCard } from "./BallotCard";
import type { Ballot } from "./types";

export function LiveBallots({ ballots, onVote, onCreate }: { ballots: Ballot[]; onVote: (ballot: Ballot) => void; onCreate: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = ballots.filter((ballot) => `${ballot.title} ${ballot.community}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-section"><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-mark" /> Community governance</p><h1>Live ballots</h1><p>Private decisions, open verification. Find a ballot and make your voice count.</p></div><button className="primary-button" onClick={onCreate}><Plus size={16} /> Create ballot</button></div><div className="toolbar"><div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ballots or communities" /></div><div className="filter-chip active">All <span>{ballots.length}</span></div><div className="filter-chip">Live <span>{ballots.filter((ballot) => ballot.status === "live").length}</span></div><div className="filter-chip">Finalized <span>{ballots.filter((ballot) => ballot.status === "finalized").length}</span></div></div><div className="ballots-grid">{filtered.map((ballot) => <BallotCard key={ballot.id} ballot={ballot} onVote={onVote} />)}</div>{filtered.length === 0 && <div className="empty-state"><Search size={22} /><h3>No ballots found</h3><p>Try a different community or title.</p></div>}</section>;
}

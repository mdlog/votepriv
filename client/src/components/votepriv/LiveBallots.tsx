import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { BallotCard } from "./BallotCard";
import { menerimaSuara } from "./ballot-status";
import type { Ballot } from "./types";

export function LiveBallots({
  ballots,
  onVote,
  onCreate,
  atas,
}: {
  ballots: Ballot[];
  onVote: (ballot: Ballot) => void;
  onCreate: () => void;
  /** Permukaan memuat / gagal / spanduk sebagian, disuntikkan shell. */
  atas?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const filtered = ballots.filter(b =>
    `${b.title} ${b.community}`.toLowerCase().includes(query.toLowerCase()),
  );
  // Dihitung dari STATUS TURUNAN, bukan dari phase. Sebelum C-2a, chip "Live"
  // menghitung phase === voting dan karena itu menghitung ballot yang kontraknya
  // sudah menolak semua suara. Angka itu bohong, dan sekarang tidak bisa lagi.
  const nLive = ballots.filter(b => menerimaSuara(b.status)).length;
  const nTally = ballots.filter(b => b.status === "tally-open").length;
  const nMenunggu = ballots.filter(b => b.status === "awaiting-finalize").length;
  const nFinal = ballots.filter(b => b.status === "finalized").length;
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow"><span className="eyebrow-mark" /> Community governance</p>
          <h1>Live ballots</h1>
          <p>Private decisions, open verification. Find a ballot and make your voice count.</p>
        </div>
        <button className="primary-button" onClick={onCreate}><Plus size={16} /> Create ballot</button>
      </div>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ballots or communities" />
        </div>
        <div className="filter-chip active">All <span>{ballots.length}</span></div>
        <div className="filter-chip">Open <span>{nLive}</span></div>
        <div className="filter-chip">Tally <span>{nTally}</span></div>
        <div className="filter-chip">Needs finalizing <span>{nMenunggu}</span></div>
        <div className="filter-chip">Finalized <span>{nFinal}</span></div>
      </div>
      {atas}
      <div className="ballots-grid">
        {filtered.map(b => <BallotCard key={b.id} ballot={b} onVote={onVote} />)}
      </div>
      {/* Keadaan kosong HANYA muncul ketika daftar memang kosong setelah
          pembacaan BERHASIL. Shell tidak pernah merender komponen ini pada fase
          memuat maupun gagal — lihat Home.tsx dan uji paritas-permukaan-rantai. */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <Search size={22} />
          <h3>No ballots found</h3>
          <p>{ballots.length === 0 ? "The registry has no ballots yet." : "Try a different community or title."}</p>
        </div>
      )}
    </section>
  );
}

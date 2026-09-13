import { ArrowUpRight, ChevronRight, Clock3, Globe2, KeyRound, ShieldCheck, Vote } from "lucide-react";
import { menerimaPendaftaran, menerimaSuara, statusLabel, statusTone } from "./ballot-status";
import { labelNomor } from "@/lib/chain/ke-ballot";
import type { Ballot } from "./types";

export function BallotCard({
  ballot,
  onVote,
  onRegister,
}: {
  ballot: Ballot;
  onVote: (ballot: Ballot) => void;
  /**
   * Opsional (bukan wajib seperti onVote): dibiarkan `undefined` di berkas
   * uji yang tidak sedang menguji tombol pendaftaran, supaya SELURUH `it()`
   * yang ada sebelum tombol ini ditambahkan tetap lolos tanpa satu pun
   * disuntik. Tombol hanya pernah dirender ketika prop ini ADA *dan*
   * menerimaPendaftaran(ballot) benar (lihat render di bawah) — ballot uji
   * yang sudah ada (votes bukan 0) tidak akan pernah memuaskan syarat kedua,
   * jadi tidak ada `it()` lama yang bisa terpengaruh oleh prop baru ini.
   */
  onRegister?: (ballot: Ballot) => void;
}) {
  const percentage = Math.min(100, Math.round((ballot.votes / Math.max(ballot.eligible, 1)) * 100));
  return (
    <article className={`ballot-card accent-${ballot.accent}`}>
      <div className="card-topline">
        {/* statusTone, BUKAN status: kelima status dipetakan ke tiga tone yang
            memang ada di index.css. Memakai status langsung akan menghasilkan
            kelas tally-open dan awaiting-finalize yang tidak punya aturan CSS. */}
        <span className={`status-badge ${statusTone(ballot.status)}`}>
          <span /> {statusLabel(ballot.status)}
        </span>
        <span className="ballot-tag">{labelNomor(ballot.nomor)} · {ballot.tag}</span>
      </div>
      <div className="ballot-title-row">
        <div>
          <h3>{ballot.title}</h3>
          <p>{ballot.description}</p>
        </div>
        <div className="ballot-symbol"><Vote size={19} /></div>
      </div>
      <div className="ballot-meta">
        <span><Globe2 size={14} /> {ballot.community}</span>
        <span><Clock3 size={14} /> {ballot.deadline}</span>
        {/* Baris spec 9.4 yang sebelumnya tidak punya tempat di UI. */}
        {ballot.eligibilityPolicy !== "" && (
          <span><ShieldCheck size={14} /> {ballot.eligibilityPolicy}</span>
        )}
      </div>
      <div className="ballot-progress-label"><span>Participation</span><strong>{percentage}%</strong></div>
      <div className="progress-track slim"><span style={{ width: `${percentage}%` }} /></div>
      <div className="ballot-footer">
        {/* "intended quorum", bukan "quorum": ballot.compact menulis sendiri bahwa
            quorumPercent tidak pernah dibaca circuit mana pun dan finalize()
            berhasil pada partisipasi 0% persis seperti pada 100%. */}
        <span>
          {ballot.votes.toLocaleString()} of {ballot.eligible.toLocaleString()} votes <i>·</i>{" "}
          {ballot.quorum}% intended quorum
        </span>
        <div className="ballot-footer-actions">
          {/* Independen dari menerimaSuara: registerVoters menutup pada
              voteCount pertama, castVote pada voteDeadline — dua syarat
              berbeda, jadi kedua tombol BISA tampil berdampingan (ballot baru,
              belum ada suara, jendela voting sudah terbuka). */}
          {onRegister && menerimaPendaftaran(ballot) && (
            <button className="text-button" onClick={() => onRegister(ballot)}>
              <KeyRound size={14} /> Register to vote
            </button>
          )}
          {menerimaSuara(ballot.status) ? (
            <button className="text-button" onClick={() => onVote(ballot)}>Vote privately <ChevronRight size={14} /></button>
          ) : (
            <button className="text-button" onClick={() => onVote(ballot)}>View result <ArrowUpRight size={14} /></button>
          )}
        </div>
      </div>
    </article>
  );
}

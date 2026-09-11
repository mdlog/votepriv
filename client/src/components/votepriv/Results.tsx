import { ArrowUpRight, ClipboardCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import { statusLabel, statusTone } from "./ballot-status";
import type { Ballot, Receipt } from "./types";
import type { JaringanAktif } from "@/lib/chain";

export function Results({ ballots, receipt, jaringan, blokHeight, onMuatUlang }: {
  ballots: Ballot[];
  receipt: Receipt | null;
  jaringan: JaringanAktif;
  blokHeight: number;
  /** Membaca ULANG seluruh keadaan dari indexer. Inilah arti "verify" di jalur baca-saja. */
  onMuatUlang: () => void;
}) {
  return (
    <section className="page-section">
      <div className="page-heading split-heading">
        <div>
          <p className="eyebrow"><span className="eyebrow-mark" /> Public verification</p>
          <h1>Results & audit</h1>
          <p>Aggregate outcomes are visible. Individual choices never are.</p>
        </div>
        <div className="verified-stamp">
          <ShieldCheck size={18} />
          <span>
            <strong>Read from chain</strong>
            <small>Midnight {jaringan.networkId} · block {blokHeight.toLocaleString()}</small>
          </span>
        </div>
      </div>
      <div className="results-layout">
        <div className="results-table-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Latest tallies</p><h2>Community outcomes</h2></div>
            {/* Label diubah dari "Verify all" menjadi apa yang benar-benar
                terjadi. "Verify" pada jalur BACA berarti: ambil ulang state
                kontrak dari indexer dan hitung ulang persentasenya. Tombol
                inert berlabel "Verify all" pada halaman yang membaca rantai
                adalah klaim yang tidak ditunaikan — kelas cacat yang sama
                dengan badge "Demo data". */}
            <button className="secondary-button compact" onClick={onMuatUlang}>
              <ClipboardCheck size={15} /> Re-read from chain
            </button>
          </div>
          <div className="result-rows">
            {ballots.map((ballot, index) => {
              // tallies SELALU larik padat sepanjang options. Persentase hanya
              // dihitung ketika keadaanHasil mengizinkannya — lihat cabang di bawah.
              const adaHasil = ballot.keadaanHasil === "ada-hasil";
              const memimpin = adaHasil ? Math.max(...ballot.tallies) : 0;
              // Penyebutnya WAJIB ballot.tallied (suara yang SUDAH DIBUKA), bukan
              // ballot.votes (suara yang tersegel, belum dibuka). Spec §6.3: suara
              // yang tidak dibuka tidak terhitung. Memakai ballot.votes di sini
              // akan mengklaim hasil dari suara yang belum pernah diverifikasi.
              const pct = adaHasil ? Math.round((memimpin / ballot.tallied) * 100) : 0;
              const parsial = adaHasil && ballot.tallied < ballot.votes;
              return (
                <div className="result-row" key={ballot.id}>
                  <div className={`result-number result-${index % 3}`}>{String(ballot.nomor).padStart(2, "0")}</div>
                  <div className="result-main">
                    <div className="result-row-top">
                      <strong>{ballot.title}</strong>
                      <span className={`status-badge ${statusTone(ballot.status)}`}>
                        <span /> {statusLabel(ballot.status)}
                      </span>
                    </div>
                    {adaHasil ? (
                      <div className="result-bar"><span style={{ width: `${pct}%` }} /></div>
                    ) : (
                      /* Bukan bar nol. Bar 0% terbaca sebagai "tidak ada yang
                         memilih opsi ini" — kebalikan dari yang benar pada
                         ketiga keadaan tanpa hasil. */
                      <div className="result-bar" aria-hidden="true" />
                    )}
                    <div className="result-row-bottom">
                      <span>{ballot.votes.toLocaleString()} sealed votes</span>
                      {/* SATU cabang per keadaan, tanpa cabang lain-lain. */}
                      {ballot.keadaanHasil === "ada-hasil" ? (
                        parsial ? (
                          /* Spec 6.3 butir pertama: suara yang tidak dibuka
                             tidak terhitung, dan selisihnya terlihat publik
                             sebagai voteCount - talliedCount. */
                          <span>{pct}% leading · {ballot.tallied} of {ballot.votes} opened</span>
                        ) : (
                          <span>{pct}% leading option</span>
                        )
                      ) : ballot.keadaanHasil === "tersegel" ? (
                        /* BENAR di sini, dan hanya di sini: deadline memang
                           belum lewat. */
                        <span>Results stay sealed until {ballot.deadline}</span>
                      ) : ballot.keadaanHasil === "menunggu-pembukaan" ? (
                        <span>Voting closed · no sealed vote has been opened yet</span>
                      ) : (
                        /* tidak-ada-yang-dibuka: jendela tally sudah tutup,
                           atau ballot sudah final, tanpa satu suara pun
                           dibuka. */
                        <span>
                          {ballot.votes === 0
                            ? "No votes were cast"
                            : `No sealed vote was opened before the tally deadline · ${ballot.votes} sealed, 0 opened`}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowUpRight size={16} className="muted-arrow" />
                </div>
              );
            })}
          </div>
        </div>
        <div className="result-side">
          <div className="side-panel privacy-result">
            <div className="privacy-result-icon"><LockKeyhole size={18} /></div>
            <p className="eyebrow mint-text">What the ledger never holds</p>
            <h2>No voter-to-choice mapping.</h2>
            <p>
              The chain stores nullifiers, commitments and the aggregate tally. It never stores who chose
              what. Whether the <em>organiser</em> can see your choice depends on who runs the proof
              server — the panel on the dashboard says which.
            </p>
            <div className="privacy-stat"><span>Choice on the ledger</span><strong>Never</strong></div>
            <div className="privacy-stat"><span>Tally during voting</span><strong>Sealed</strong></div>
            {/* Menggantikan "Demo data below / Yes". Dua baris di atas adalah
                pernyataan tentang kontrak; baris ini pernyataan tentang ASAL
                angka di halaman ini, dan sekarang ia dapat menyebut sumbernya. */}
            <div className="privacy-stat">
              <span>Source</span>
              <strong>Midnight {jaringan.networkId} · block {blokHeight.toLocaleString()}</strong>
            </div>
          </div>
          {receipt && (
            <div className="side-panel receipt-panel">
              <p className="eyebrow">Your latest receipt</p>
              <div className="receipt-line">
                {receipt.txRef === null
                  ? <>Simulated — no transaction was submitted</>
                  : <><span className="status-dot" /> Proof verified <strong>{receipt.txRef}</strong></>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

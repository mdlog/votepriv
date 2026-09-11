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
import { menerimaSuara, statusLabel } from "./ballot-status";
import { labelNomor } from "@/lib/chain/ke-ballot";
import type { Ballot, Receipt } from "./types";
import type { ProofServerStatus } from "@/lib/proof-server";

/**
 * Kalimat privasi pilihan suara, BERSYARAT pada topologi proof server SUNGGUHAN.
 *
 * Praperiksa P8 + tugas Task 8 butir B: versi sebelumnya merender "Your choice
 * stays private." TANPA SYARAT, pada satu-satunya layar yang PASTI dilihat
 * pemilih saat mencoblos. Peringatan terkuat aplikasi ini sebelumnya hanya
 * hidup di atribut title= sidebar, yang pada layar ≤800px berada di luar
 * viewport (.network-status { display:none } — lihat index.css) dan tidak
 * pernah muncul di telepon.
 *
 * Klaim terkuat — "Your choice stays private." — HANYA sah ketika witness
 * benar-benar tidak meninggalkan perangkat pemilih: `reach === "lokal"` DAN
 * `targetTerverifikasi === true`. Pada nilai `reach` lain, kalimatnya WAJIB
 * menyebut ke mana witness sebenarnya pergi — dipakai APA ADANYA dari `hop`
 * yang sudah dihitung proof-server.ts, BUKAN disusun ulang dari nilai build
 * (`target`/`import.meta.env`) di sini. Menyusun ulang dari nilai build adalah
 * persis kesalahan yang komentar proof-server.ts sendiri memperingatkan: nilai
 * itu dipanggang saat BUILD, sedangkan proxy sungguhan membaca lingkungannya
 * saat START.
 */
export function pesanPrivasiSuara(
  proofStatus: ProofServerStatus | null,
): { kalimat: string; kuat: boolean } {
  if (!proofStatus) {
    return {
      kalimat: "Checking where this vote will be proven before it can be marked private…",
      kuat: false,
    };
  }
  if (proofStatus.reach === "lokal" && proofStatus.targetTerverifikasi) {
    return {
      kalimat: "Your choice stays private. Only the proof, nullifier status, and aggregate tally are verifiable.",
      kuat: true,
    };
  }
  if (proofStatus.reach === "remote") {
    return {
      kalimat: `Your choice is not private from the proof server operator: it travels ${proofStatus.hop} to be proven before it is sealed.`,
      kuat: false,
    };
  }
  if (proofStatus.reach === "lewat-host-halaman") {
    return {
      kalimat: `Your choice travels ${proofStatus.hop} to be proven — whoever operates that machine can see it before it is sealed.`,
      kuat: false,
    };
  }
  // reach === "lokal" tapi targetTerverifikasi === false: ke mana ia SEHARUSNYA
  // pergi diketahui, tapi belum dikonfirmasi oleh server yang menyajikan halaman
  // ini, jadi klaim kuat tidak dibuat di sini juga.
  return {
    kalimat: `The proof server target has not been confirmed by this page (${proofStatus.hop}), so this vote cannot be guaranteed to stay on this device.`,
    kuat: false,
  };
}

export function VoteModal({
  ballot,
  connected,
  proofStatus,
  onClose,
  onVote,
}: {
  ballot: Ballot;
  connected: boolean;
  /** Dipakai HANYA untuk menyusun klaim privasi — lihat pesanPrivasiSuara. */
  proofStatus: ProofServerStatus | null;
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

  const privasi = pesanPrivasiSuara(proofStatus);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="vote-modal" role="dialog" aria-modal="true" aria-labelledby="vote-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close vote dialog"><X size={18} /></button>
        {stage === "select" && (
          <>
            <div className="modal-kicker"><LockKeyhole size={14} /> Private ballot</div>
            <div className="modal-heading-row">
              <div>
                {/* Nomor urut sebagai TEKS, alamat sebagai identitas. Alamat
                    dipendekkan karena 64 hex tidak terbaca mata, tetapi ia
                    yang benar. */}
                <p className="eyebrow">{ballot.community} · {labelNomor(ballot.nomor)} · {ballot.id.slice(0, 8)}…</p>
                <h2 id="vote-title">{ballot.title}</h2>
              </div>
              <span className="live-pill"><span /> {statusLabel(ballot.status)}</span>
            </div>
            {/* Baris spec 9.4: eligibilityPolicy tampil di KARTU DAN MODAL. Di
                sinilah ia paling berguna — layar tempat seseorang memutuskan
                apakah ia berhak memilih. castVote menolak siapa pun yang
                credential-nya tidak diterbitkan admin, jadi syaratnya harus
                terbaca SEBELUM tombolnya, bukan sesudah penolakannya. */}
            {ballot.eligibilityPolicy !== "" && (
              <div className="privacy-callout">
                <ShieldCheck size={17} />
                <span>
                  <strong>Who can vote:</strong> {ballot.eligibilityPolicy}
                  {" "}({ballot.registered.toLocaleString()} of {ballot.eligible.toLocaleString()} credentials issued.)
                </span>
              </div>
            )}
            {menerimaSuara(ballot.status) ? (
              <p className="modal-description">
                Choose one option. Your selection will be sealed into a zero-knowledge proof and never exposed
                as a public wallet action.
              </p>
            ) : (
              /* Kontrak akan MENOLAK castVote pada status ini —
                 assert(kernel.blockTimeLessThan(voteDeadline)). Menawarkan
                 tombolnya berarti menjanjikan sesuatu yang pasti gagal. */
              <div className="privacy-callout">
                <ShieldCheck size={17} />
                <span>
                  <strong>Voting is closed for this ballot.</strong> The contract stops accepting votes after{" "}
                  {ballot.deadline}, so no proof can be submitted. {ballot.status === "tally-open"
                    ? "Voters can still open their sealed votes until the tally deadline."
                    : "This ballot is waiting to be finalized."}
                </span>
              </div>
            )}
            {menerimaSuara(ballot.status) && (
              <div className="choice-list">
                {ballot.options.map((option, index) => (
                  <button key={option} className={`choice-row ${selected === option ? "selected" : ""}`} onClick={() => setSelected(option)}>
                    <span className={`choice-index choice-${index}`}>{String(index + 1).padStart(2, "0")}</span>
                    <span className="choice-label">{option}</span>
                    <span className="choice-radio">{selected === option && <Check size={14} />}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Klaim privasi soal KE MANA witness sungguhan pergi — BERSYARAT
                pada topologi proof server (lihat pesanPrivasiSuara di atas).
                Hanya berguna dirender saat sebuah proof memang BISA dibuat;
                tidak ada gunanya menjanjikan atau menyangkal privasi sebuah
                proof yang tidak akan pernah disusun. */}
            {menerimaSuara(ballot.status) && (
              <div className="privacy-callout">
                <ShieldCheck size={17} />
                <span>{privasi.kuat ? <strong>{privasi.kalimat}</strong> : privasi.kalimat}</span>
              </div>
            )}
            <div className="modal-actions">
              {/* "Cancel", DIPERTAHANKAN — praperiksa P8 menemukan brief mengganti
                  label ini menjadi "Close" tanpa satu kalimat pun yang
                  mengumumkannya dan tanpa uji yang menjaganya. Tidak ada alasan
                  yang diberikan untuk perubahan itu, jadi teks yang sudah mapan
                  dipertahankan di sini secara sadar. */}
              <button className="ghost-button" onClick={onClose}>Cancel</button>
              {menerimaSuara(ballot.status) && (
                <button className="primary-button" onClick={submit}><Sparkles size={16} /> Generate proof & vote</button>
              )}
            </div>
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

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, KeyRound, ShieldCheck, TriangleAlert, Upload, X } from "lucide-react";
import { labelNomor } from "@/lib/chain/ke-ballot";
import { muatJalurTulis } from "@/lib/chain/jalur-tulis";
import type { Ballot } from "./types";

/**
 * Salinan STRUKTURAL dari `HasilRegistrasiMandiri`/`CadanganKredensial` milik
 * `client/src/lib/chain/tulis.ts` — BUKAN diimpor, bahkan sebagai `import type`.
 *
 * Alasannya SAMA PERSIS dengan salinan `TahapKirimSuara`/`CadanganOpening` di
 * VoteModal.tsx (lihat komentar di kepala berkas itu): berkas ini TERJANGKAU
 * STATIS dari entri (main.tsx -> Home.tsx -> RegisterModal.tsx), dan
 * batas-bundel.test.ts menjaring SEMUA specifier tekstual yang menunjuk ke
 * chain/tulis lewat regex atas `import`/`export … from`, tanpa mengecualikan
 * type-only. Nilai sungguhan datang dari `muatJalurTulis()` (tipe
 * `Promise<typeof import("./tulis")>`, yang sudah lolos gerbang yang sama),
 * dan TypeScript membandingkan kedua tipe ini secara STRUKTURAL — jadi tetap
 * type-safe dipakai berdampingan tanpa satu baris impor pun ke tulis.ts.
 */
interface HasilRegistrasiMandiri {
  credentialHex: string;
  leafHex: string;
  kredensialBaru: boolean;
}

export interface CadanganKredensial {
  alamatBallot: string;
  credentialHex: string;
}

/**
 * Bentuk berkas cadangan credential yang diunduh `unduhCadanganKredensial` di
 * bawah — dan SATU-SATUNYA bentuk yang `uraiCadanganKredensial` terima
 * kembali. Keduanya harus tetap berpasangan: berkas yang keluar dari salah
 * satu HARUS bisa masuk lagi lewat yang lain (uji round-trip di
 * RegisterModal.test.tsx menjaga ini secara eksplisit — Guard Mutasi Wajib #3).
 */
function cadanganValid(data: unknown): data is CadanganKredensial {
  if (typeof data !== "object" || data === null) return false;
  const rekaman = data as CadanganKredensial;
  return typeof rekaman.alamatBallot === "string" && typeof rekaman.credentialHex === "string";
}

export function uraiCadanganKredensial(teks: string): CadanganKredensial {
  let data: unknown;
  try {
    data = JSON.parse(teks);
  } catch {
    throw new Error("This file is not valid JSON — it does not look like a VotePriv credential backup.");
  }
  if (!cadanganValid(data)) {
    throw new Error('This file is missing "alamatBallot" or "credentialHex" — it does not look like a VotePriv credential backup.');
  }
  const bersih = data.credentialHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(bersih)) {
    throw new Error("The credential in this file is not a 64-character hex value.");
  }
  return { alamatBallot: data.alamatBallot, credentialHex: bersih };
}

/**
 * `FileReader.readAsText`, BUKAN `File.prototype.text()` — dua API yang
 * fungsinya identik di browser sungguhan, tapi hanya yang pertama tersedia di
 * lingkungan uji (jsdom di sini tidak mengimplementasikan `Blob.prototype.text`,
 * dibuktikan empiris sebelum baris ini ditulis). FileReader jauh lebih tua dan
 * didukung di mana-mana, jadi ini bukan kompromi untuk lolos uji — ia pilihan
 * yang sama amannya di produksi.
 */
function bacaBerkasSebagaiTeks(berkas: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the selected file."));
    reader.readAsText(berkas);
  });
}

export function unduhCadanganKredensial(cadangan: CadanganKredensial): void {
  const blob = new Blob([JSON.stringify(cadangan, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `votepriv-credential-${cadangan.alamatBallot.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RegisterModal({ ballot, onClose }: { ballot: Ballot; onClose: () => void }) {
  const [stage, setStage] = useState<"memuat" | "siap" | "gagal">("memuat");
  const [hasil, setHasil] = useState<HasilRegistrasiMandiri | null>(null);
  const [pesanGalat, setPesanGalat] = useState<string | null>(null);
  const [percobaan, setPercobaan] = useState(0);
  const [disalin, setDisalin] = useState(false);
  const [memulihkan, setMemulihkan] = useState(false);
  const [galatPulih, setGalatPulih] = useState<string | null>(null);

  useEffect(() => {
    let dibatalkan = false;
    setStage("memuat");
    (async () => {
      try {
        const jalur = await muatJalurTulis();
        const hasilBaru = await jalur.daftarkanDiriSendiri(ballot.id);
        if (dibatalkan) return;
        setHasil(hasilBaru);
        setStage("siap");
      } catch (e) {
        if (dibatalkan) return;
        setPesanGalat(e instanceof Error ? e.message : String(e));
        setStage("gagal");
      }
    })();
    return () => {
      dibatalkan = true;
    };
  }, [ballot.id, percobaan]);

  const salinLeaf = async () => {
    if (!hasil) return;
    try {
      await navigator.clipboard.writeText(hasil.leafHex);
      setDisalin(true);
      toast.success("Leaf copied", { description: "Safe to paste anywhere — send it to the ballot organizer." });
      setTimeout(() => setDisalin(false), 2000);
    } catch {
      toast.error("Could not copy", { description: "Select and copy the leaf text manually instead." });
    }
  };

  const unduh = () => {
    if (!hasil) return;
    unduhCadanganKredensial({ alamatBallot: ballot.id, credentialHex: hasil.credentialHex });
  };

  const pulihkanDariBerkas = async (berkas: File) => {
    setMemulihkan(true);
    setGalatPulih(null);
    try {
      const teks = await bacaBerkasSebagaiTeks(berkas);
      const cadangan = uraiCadanganKredensial(teks);
      // Pemeriksaan alamat DI SINI, sebelum muatJalurTulis() dipanggil sama
      // sekali: berkas cadangan ballot LAIN ditolak tanpa mengunduh belasan
      // megabyte jalur tulis maupun menulis apa pun ke store. tulis.ts sendiri
      // (pulihkanKredensialDariCadangan) menegakkan pemeriksaan yang SAMA
      // sebagai jaring pengaman independen untuk pemanggil lain — lihat
      // komentar di sana untuk alasan keduanya dipertahankan, bukan salah
      // satu dibuang sebagai "duplikat".
      if (cadangan.alamatBallot !== ballot.id) {
        throw new Error(
          `This backup file is for a different ballot (${cadangan.alamatBallot.slice(0, 8)}…), not this one (${ballot.id.slice(0, 8)}…).`,
        );
      }
      const jalur = await muatJalurTulis();
      const hasilPulih = await jalur.pulihkanKredensialDariCadangan(ballot.id, cadangan);
      setHasil(hasilPulih);
      setPesanGalat(null);
      setStage("siap");
      toast.success("Credential restored", { description: "Showing the leaf for the restored credential below." });
    } catch (e) {
      setGalatPulih(e instanceof Error ? e.message : String(e));
    } finally {
      setMemulihkan(false);
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const berkas = event.target.files?.[0];
    event.target.value = ""; // memilih berkas yang SAMA lagi harus tetap memicu onChange
    if (berkas) void pulihkanDariBerkas(berkas);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="vote-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close registration dialog">
          <X size={18} />
        </button>
        <div className="modal-kicker">
          <KeyRound size={14} /> Voter registration
        </div>
        <div className="modal-heading-row">
          <div>
            <p className="eyebrow">
              {ballot.community} · {labelNomor(ballot.nomor)} · {ballot.id.slice(0, 8)}…
            </p>
            <h2 id="register-title">{ballot.title}</h2>
          </div>
        </div>

        {stage === "memuat" && (
          <div className="proof-state">
            <div className="proof-orbit">
              <KeyRound size={32} />
              <span className="orbit-ring ring-one" />
              <span className="orbit-ring ring-two" />
            </div>
            <p className="eyebrow mint-text">Preparing</p>
            <h2>Setting up your credential</h2>
            <p>
              This loads the same components used to vote — around a dozen megabytes on a first
              visit, so it can take a moment on a slow connection.
            </p>
            <div className="progress-track">
              <span />
            </div>
          </div>
        )}

        {stage === "siap" && hasil && (
          <>
            <p className="modal-description">
              Registering creates a private credential that stays on this device. Only its public
              "leaf" is ever shared — with the organizer, so they can add it to this ballot's
              eligibility list.
            </p>
            {!hasil.kredensialBaru && (
              <div className="privacy-callout">
                <ShieldCheck size={17} />
                <span>
                  You already generated a credential for this ballot on this device — shown again
                  below. Generating a new one now would not match a leaf you may have already sent
                  the organizer, so nothing new was created.
                </span>
              </div>
            )}
            <label className="credential-field">
              <span>Your public leaf — safe to send to the organizer</span>
              <div className="leaf-row">
                <code>{hasil.leafHex}</code>
                <button type="button" className="icon-button" onClick={salinLeaf} aria-label="Copy leaf">
                  {disalin ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            </label>
            <div className="privacy-callout">
              <ShieldCheck size={17} />
              <span>
                This leaf is public: sending it to the ballot organizer reveals nothing about you
                or how you will vote. The credential it was derived from — the actual secret —
                never leaves this device.
              </span>
            </div>
            <div className="privacy-callout">
              <TriangleAlert size={17} />
              <span>
                <strong>Your credential is your voting key.</strong> Anyone who holds it can vote
                in your place, so keep the backup file as secret as a password. If you lose both
                this device's storage and that backup file, this vote is permanently lost — there
                is no way to recover or reissue a credential.
              </span>
            </div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={onClose}>
                Close
              </button>
              <button className="primary-button" onClick={unduh}>
                <Download size={16} /> Download credential backup
              </button>
            </div>
          </>
        )}

        {stage === "gagal" && (
          <div className="proof-state">
            <TriangleAlert size={28} />
            <p className="eyebrow">Registration not ready</p>
            <h2>Something went wrong</h2>
            <p>{pesanGalat}</p>
            <button className="ghost-button" onClick={() => setPercobaan((p) => p + 1)}>
              Try again
            </button>
          </div>
        )}

        {stage !== "memuat" && (
          <div className="restore-panel">
            <p className="eyebrow">Registering from a new device?</p>
            <p className="modal-description">
              If you already have a backup credential file for this ballot, restore it here
              instead of generating a new one — a fresh credential will not match a leaf you may
              have already sent the organizer.
            </p>
            <label className="secondary-button full-button">
              <Upload size={16} /> {memulihkan ? "Restoring…" : "Restore from backup file"}
              <input type="file" accept="application/json" hidden disabled={memulihkan} onChange={onFileChange} />
            </label>
            {galatPulih && <p className="restore-error">{galatPulih}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

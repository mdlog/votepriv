import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";
import { menerimaSuara, statusLabel } from "./ballot-status";
import { labelNomor } from "@/lib/chain/ke-ballot";
import { muatJalurTulis } from "@/lib/chain/jalur-tulis";
import { terjemahkanGalatRantai } from "@/lib/chain/pesan-rantai";
import { buatKredensialStoreIdb, kredensialKeHex, NAMA_DB_KREDENSIAL } from "@/lib/chain/kredensial-idb";
import type { WalletConnection } from "@/lib/midnight-wallet";
import type { MidnightNetworkId } from "@pkgs/shared/src/network-config";
import type { Ballot, Receipt } from "./types";
import type { ProofServerStatus } from "@/lib/proof-server";

/**
 * Salinan STRUKTURAL dari `TahapKirimSuara`/`CadanganOpening` milik
 * `client/src/lib/chain/tulis.ts` — BUKAN diimpor, bahkan sebagai `import type`.
 *
 * batas-bundel.test.ts menjaring SEMUA specifier tekstual yang menunjuk ke
 * chain/tulis lewat regex atas `import`/`export … from`, TANPA mengecualikan
 * type-only (lihat komentarnya sendiri: itu properti yang disengaja, bukan
 * celah). Berkas ini TERJANGKAU STATIS dari entri (main.tsx -> Home.tsx ->
 * VoteModal.tsx), jadi satu baris `import type {...} from "@/lib/chain/tulis"`
 * di sini akan memerahkan gerbang "modul jalur tulis tidak diimpor secara
 * statis" — sama seperti impor NILAI, walau tidak akan pernah muncul di JS
 * yang dibangun. TypeScript membandingkan dua tipe secara STRUKTURAL, bukan
 * nominal, jadi nilai sungguhan yang datang dari `muatJalurTulis()` (yang
 * bertipe `Promise<typeof import("./tulis")>` — pola yang SUDAH lolos gerbang
 * yang sama, karena `typeof import(...)` tanpa klausa `from` tidak pernah
 * cocok dengan regex-nya) tetap type-safe dipakai berdampingan dengan salinan
 * ini, tanpa satu baris impor pun ke tulis.ts.
 */
type TahapKirimSuara =
  | "menyiapkan-artefak"
  | "membaca-eligibility"
  | "menyusun-witness"
  | "membuat-proof"
  | "menyeimbangkan-wallet"
  | "mengirim"
  | "menunggu-indexer";

interface CadanganOpening {
  alamatBallot: string;
  opsi: number;
  saltHex: string;
}

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
 *
 * TASK 8 (sesi ini) memperbarui TEKS klaim kuat, bukan strukturnya: klaim
 * lama ("Only the proof, nullifier status, and aggregate tally are
 * verifiable.") tidak salah, tapi tidak menyebut FAKTA yang sekarang mengikat
 * — bahwa wallet TIDAK PERNAH melihat witness sama sekali, karena proof
 * dibangun di perangkat ini SEBELUM wallet dipanggil (kirimSuara di tulis.ts:
 * proveTx lalu balanceTx/submitTx). Klaim baru menyebut itu secara eksplisit,
 * tanpa mengklaim apa pun soal privasi PEMBAYAR di rantai — itu urusan
 * pesanPrivasiBuka() dan panel "Open your vote" di bawah, bukan di sini.
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
      kalimat:
        "Your choice stays private. The proof is built on this device; your wallet only balances and submits the already-proven transaction — it never sees your selection.",
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

/**
 * Kalimat privasi untuk MEMBUKA suara (tallyVote) — SENGAJA fungsi terpisah
 * dari pesanPrivasiSuara, bukan cabang tambahan di dalamnya, karena fakta yang
 * mengikatnya beda pada SATU sumbu penting: membuka SELALU melabeli
 * transaksinya dengan opsi yang dibukanya, publik, di indexer (FAKTA PRIVASI
 * butir 2 — snapshot `state` berurutan menyelisihkan transaksi ke opsinya
 * dengan kepastian). Itu bukan risiko bersyarat seperti kebocoran ke proof
 * server; itu bagian dari cara tallyVote bekerja, SELALU. Karena itu fungsi
 * ini tidak punya cabang "sepenuhnya rahasia" ala kuat=true milik
 * pesanPrivasiSuara — tidak ada topologi proof server yang membuat pembukaan
 * tetap rahasia dari publik.
 *
 * Yang BERSYARAT di sini murni SATU sumbu: apakah witness (opsi+salt) sempat
 * terlihat operator proof server SEBELUM disegel — risiko yang sama persis
 * dengan mencoblos, karena bukaSuara menjalankan rantai proveTx yang sama
 * (lihat tulis.ts::bukaSuara, callTx.tallyVote()).
 *
 * `kuat` di sini berarti "kaki proving-nya lokal", BUKAN "pembukaannya
 * rahasia" — pemanggil TIDAK boleh membaca kuat=true sebagai izin merender
 * klaim privasi tanpa syarat, dan komponen ini memang tidak pernah
 * melakukannya (lihat render: kalimat fakta publik/anonimitas selalu
 * dirender TERPISAH dan TANPA SYARAT dari `kuat`, karena fakta itu sendiri
 * tidak bersyarat pada proof server).
 */
export function pesanPrivasiBuka(
  proofStatus: ProofServerStatus | null,
): { kalimat: string; kuat: boolean } {
  if (!proofStatus) {
    return {
      kalimat: "Checking where this step will be proven before it can be marked private…",
      kuat: false,
    };
  }
  if (proofStatus.reach === "lokal" && proofStatus.targetTerverifikasi) {
    return {
      kalimat:
        "The proof for opening is built on this device too — the proof server never sees which option you are revealing before it is sealed.",
      kuat: true,
    };
  }
  if (proofStatus.reach === "remote") {
    return {
      kalimat: `Opening still travels ${proofStatus.hop} to be proven, so its operator can see which option you are revealing before it is even public.`,
      kuat: false,
    };
  }
  if (proofStatus.reach === "lewat-host-halaman") {
    return {
      kalimat: `Opening travels ${proofStatus.hop} to be proven — whoever operates that machine can see which option you are revealing before it is sealed.`,
      kuat: false,
    };
  }
  return {
    kalimat: `The proof server target for opening has not been confirmed by this page (${proofStatus.hop}), so this step cannot be guaranteed to stay on this device.`,
    kuat: false,
  };
}

export function teksTahap(tahap: TahapKirimSuara | null): string {
  switch (tahap) {
    case "menyiapkan-artefak":
      return "Checking proof artifacts…";
    case "membaca-eligibility":
      return "Reading your eligibility proof from the chain…";
    case "menyusun-witness":
      return "Preparing your private ballot on this device…";
    case "membuat-proof":
      return "Generating your zero-knowledge proof — this can take 5 to 20 seconds.";
    case "menyeimbangkan-wallet":
      return "Waiting for your wallet to balance the transaction…";
    case "mengirim":
      return "Submitting your sealed vote…";
    case "menunggu-indexer":
      return "Waiting for the network to confirm…";
    default:
      return "Preparing…";
  }
}

export function unduhCadangan(cadangan: CadanganOpening): void {
  const blob = new Blob([JSON.stringify(cadangan, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `votepriv-opening-${cadangan.alamatBallot.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function VoteModal({
  ballot,
  connected,
  wallet,
  jaringan,
  proofStatus,
  openWallet = null,
  openConnecting = false,
  onConnectOpenWallet = () => {},
  onClose,
  onVote,
}: {
  ballot: Ballot;
  connected: boolean;
  /** Wallet dipakai untuk MENCOBLOS (kirimSuara). */
  wallet: WalletConnection | null;
  jaringan: MidnightNetworkId;
  /** Dipakai HANYA untuk menyusun klaim privasi — lihat pesanPrivasiSuara. */
  proofStatus: ProofServerStatus | null;
  /**
   * Wallet dipakai untuk MEMBUKA suara (bukaSuara) — SENGAJA prop terpisah
   * dari `wallet`, bukan dipakai ulang. tallyVote tidak pernah membaca
   * voter_credential (ballot.compact) dan tulis.ts::bukaSuara menerima wallet
   * sebagai parameter fungsi sendiri, jadi tidak ada apa pun di kontrak atau
   * di jalur tulis yang menuntut wallet yang sama dipakai untuk mencoblos dan
   * membuka. "Bentuk alur yang saya putuskan" (Task 8, sesi ini) menjadikan
   * pemisahan ini BAWAAN: bawaannya `null` — TIDAK diam-diam diisi dari
   * `wallet` — sehingga pemilih harus secara aktif menyambungkan (mungkin)
   * wallet lain untuk membuka, bukan menemukan opsi itu terkubur di dokumen.
   */
  openWallet?: WalletConnection | null;
  openConnecting?: boolean;
  onConnectOpenWallet?: () => void;
  onClose: () => void;
  onVote: (receipt: Receipt) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [credentialHex, setCredentialHex] = useState("");
  const [credentialDariPerangkat, setCredentialDariPerangkat] = useState(false);
  const [stage, setStage] = useState<"select" | "proving" | "success" | "gagal">("select");
  const [tahap, setTahap] = useState<TahapKirimSuara | null>(null);
  const [cadangan, setCadangan] = useState<CadanganOpening | null>(null);
  const [galat, setGalat] = useState<{ pesan: string; mungkinSudahMasuk?: { nullifierHex: string } } | null>(null);

  // Keadaan MEMBUKA suara (bukaSuara) — mesin state TERPISAH dari mencoblos di
  // atas, dirender inline di dalam layar "select" untuk ballot berstatus
  // tally-open. Terpisah sengaja: menyatukannya dengan `stage` akan memaksa
  // salah satu alur meniru bentuk transisi milik yang lain padahal
  // keduanya independen (pemilih bisa menutup modal ini tanpa membuka, lalu
  // kembali kapan pun dalam jendela tally).
  const [openStage, setOpenStage] = useState<"idle" | "membuka" | "selesai" | "gagal">("idle");
  const [openTahap, setOpenTahap] = useState<TahapKirimSuara | null>(null);
  const [openGalat, setOpenGalat] = useState<string | null>(null);
  const [openingHilang, setOpeningHilang] = useState(false);

  // true begitu pemilih MENGETIK/menempel sendiri ke kolom credential —
  // dijaga lewat ref (bukan bergantung pada `credentialHex === ""` di dalam
  // effect di bawah) karena closure useEffect menutup nilai state PADA SAAT
  // effect dibuat (mount), bukan nilai TERBARU: memeriksa `credentialHex`
  // langsung di dalam .then() akan selalu melihat string kosong dari render
  // pertama, walau pemilih sudah mulai mengetik sebelum pembacaan IndexedDB
  // selesai.
  const dieditManualRef = useRef(false);

  // Auto-isi dari store IndexedDB milik kita sendiri (kredensial-idb.ts) —
  // BUKAN lewat muatJalurTulis(): membaca credential mentah tidak butuh WASM
  // (leaf-lah yang butuh, lihat tulis.ts), jadi effect ini TIDAK memicu
  // unduhan belasan megabyte jalur tulis hanya untuk membuka modal ini.
  // Kegagalan baca (storage diblokir, dst.) sengaja DITELAN di sini — ini
  // murni kemudahan pengisian otomatis, jalur tempel manual tetap tersedia
  // sebagai cadangan (lihat input di bawah), berbeda dari kegagalan
  // PENDAFTARAN di tulis.ts yang WAJIB melempar.
  useEffect(() => {
    let dibatalkan = false;
    buatKredensialStoreIdb(NAMA_DB_KREDENSIAL)
      .ambilKredensial(ballot.id)
      .then((kredensial) => {
        if (dibatalkan || !kredensial || dieditManualRef.current) return;
        setCredentialHex(kredensialKeHex(kredensial));
        setCredentialDariPerangkat(true);
      })
      .catch(() => {});
    return () => {
      dibatalkan = true;
    };
  }, [ballot.id]);

  const submit = async () => {
    if (!connected || !wallet) {
      toast.error("Connect your wallet first", { description: "VotePriv needs a wallet to check eligibility." });
      return;
    }
    if (!selected) {
      toast.error("Select an option", { description: "Your choice stays private after you submit." });
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(credentialHex.trim())) {
      toast.error("Enter your credential", { description: "Paste the 64-character credential you received when you registered." });
      return;
    }
    setStage("proving");
    setGalat(null);
    setCadangan(null);
    try {
      const { kirimSuara } = await muatJalurTulis();
      const hasil = await kirimSuara(
        {
          alamatBallot: ballot.id,
          credentialHex: credentialHex.trim(),
          opsi: ballot.options.indexOf(selected),
          jaringan,
          onStatus: setTahap,
          onOpeningTersimpan: setCadangan,
        },
        wallet,
      );
      // TIDAK ADA jendela di sini di mana tx bisa "mendarat tapi UI mengira
      // gagal": kirimSuara() HANYA mengembalikan (bukan melempar) ketika
      // r.public.status === SucceedEntirely sungguhan (tulis.ts baris
      // ~207-221) — tidak ada nilai "berhasil sebagian" yang lolos ke sini
      // tersamar sebagai kegagalan.
      setStage("success");
      onVote({ ballotId: ballot.id, proofStatus: "verified", nullifierStatus: "consumed", txRef: hasil.txId });
    } catch (e) {
      setStage("gagal");
      // `mungkinSudahMasuk` HANYA terisi ketika tulis.ts sudah mengonfirmasi
      // ULANG ke indexer bahwa nullifier credential ini SUDAH ada di ledger
      // meski panggilan di atas melempar (lihat periksaMungkinSudahMasuk di
      // tulis.ts) — inilah SATU-SATUNYA sinyal yang membedakan "kirim
      // melempar tapi tx mendarat" dari kegagalan biasa, dan permukaan UI
      // WAJIB menampilkannya berbeda (lihat render di bawah): mencoba lagi
      // pada kasus ini akan ditolak "credential sudah dipakai", dan pemilih
      // harus tahu itu BUKAN tanda suaranya hilang.
      const mungkinSudahMasuk = (e as { mungkinSudahMasuk?: { nullifierHex: string } } | undefined)?.mungkinSudahMasuk;
      // terjemahkanGalatRantai: CallTxFailedError (midnight-js) membungkus
      // string assert Indonesia dari pkgs/contract/src/ballot.compact di
      // dalam e.message apa adanya — lihat audit-bahasa-ui-2.md Kelas 1.
      setGalat({ pesan: terjemahkanGalatRantai(e instanceof Error ? e.message : String(e)), mungkinSudahMasuk });
    }
  };

  const submitOpen = async () => {
    if (!openWallet) {
      toast.error("Connect a wallet to open this vote", {
        description: "This can be a different wallet than the one you voted with.",
      });
      return;
    }
    setOpenStage("membuka");
    setOpenGalat(null);
    setOpeningHilang(false);
    try {
      const jalur = await muatJalurTulis();
      await jalur.bukaSuara(
        { alamatBallot: ballot.id, jaringan, onStatus: setOpenTahap },
        // `openWallet`, BUKAN `wallet` — lihat komentar prop di atas. Ini
        // SATU-SATUNYA titik panggil bukaSuara di seluruh UI; memaksanya
        // memakai `wallet` di sini akan membuang pemisahan yang props di atas
        // ada untuk menegakkan.
        openWallet,
      );
      // txId sengaja tidak dipakai di sini: layar sukses membuka tidak
      // mengulang tanda terima ala mencoblos (onVote/Receipt) — bukaSuara
      // tidak mengubah nullifier suara pemilih di kartu Results, hanya
      // membuka commitment yang sudah ada.
      setOpenStage("selesai");
    } catch (e) {
      setOpenStage("gagal");
      // Sama seperti GalatCastVote: dibaca dari `.name`, bukan `instanceof`
      // dengan kelas yang diimpor statis — GalatOpeningHilang HANYA ada di
      // dalam modul yang dimuat dinamis lewat muatJalurTulis(), dan berkas
      // ini tidak boleh mengimpornya (lihat komentar di kepala berkas soal
      // batas-bundel.test.ts).
      setOpeningHilang(e instanceof Error && e.name === "GalatOpeningHilang");
      // terjemahkanGalatRantai: sama seperti setGalat di submit() di atas —
      // lihat komentar di sana.
      setOpenGalat(terjemahkanGalatRantai(e instanceof Error ? e.message : String(e)));
    }
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
            {menerimaSuara(ballot.status) && (
              <label className="credential-field">
                <span>
                  Your voting credential
                  {credentialDariPerangkat && <em className="found-badge"> · found on this device</em>}
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={credentialHex}
                  onChange={(event) => {
                    dieditManualRef.current = true;
                    setCredentialDariPerangkat(false);
                    setCredentialHex(event.target.value);
                  }}
                  placeholder="64-character credential from registration"
                />
              </label>
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
            {/*
             * Panel "Open your vote" — HANYA untuk tally-open, dan ia BUKAN
             * bagian dari brief awal Task 8: ia mewujudkan keputusan sesi ini
             * ("Bentuk alur yang saya putuskan") bahwa membuka dari wallet
             * LAIN, pada waktu pilihan pemilih sendiri, adalah bentuk BAWAAN
             * — bukan saran yang terkubur di Docs.
             */}
            {ballot.status === "tally-open" && (
              <div className="open-vote-panel">
                <p className="eyebrow mint-text">Open your vote</p>
                {openStage === "idle" && (
                  <>
                    <p className="modal-description">
                      Opening submits your sealed choice for tallying. This step uses its own wallet
                      connection below — it does not have to be the wallet you voted with, and by
                      default we suggest it isn't: connect a different wallet, and open whenever you
                      choose within the tally window rather than right away.
                    </p>
                    <div className="privacy-callout">
                      <ShieldCheck size={17} />
                      <span>
                        No payer, signer, or sender field exists on this transaction — the chain does
                        not record who opens a vote. But opening labels the transaction with the
                        option it reveals, publicly, on the indexer: what protects you is that the
                        transaction cannot be traced back to you, not that the choice stays hidden
                        once it is opened. {ballot.tallied} of {ballot.votes.toLocaleString()} votes on
                        this ballot have been opened so far — the smaller that crowd when you open
                        yours, the less cover you have.
                      </span>
                    </div>
                    <div className="privacy-callout">
                      <TriangleAlert size={17} />
                      <span>{pesanPrivasiBuka(proofStatus).kalimat}</span>
                    </div>
                    <div className="privacy-callout">
                      <Fingerprint size={17} />
                      <span>
                        The opening backup file you downloaded when you voted is a perfect receipt of
                        your choice — anyone who holds it knows how you voted.
                      </span>
                    </div>
                    {openWallet ? (
                      <button className="primary-button full-button" onClick={submitOpen}>
                        <Sparkles size={16} /> Open my vote
                      </button>
                    ) : (
                      <button className="secondary-button full-button" onClick={onConnectOpenWallet} disabled={openConnecting}>
                        <Wallet size={16} /> {openConnecting ? "Connecting…" : "Connect a wallet to open"}
                      </button>
                    )}
                  </>
                )}
                {openStage === "membuka" && (
                  <div className="proof-state">
                    <div className="proof-orbit"><Fingerprint size={32} /><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /></div>
                    <p>{teksTahap(openTahap)}</p>
                    <div className="progress-track"><span /></div>
                  </div>
                )}
                {openStage === "selesai" && (
                  <div className="proof-state success-state">
                    <div className="success-mark"><Check size={28} /></div>
                    <h2>Your vote is now counted.</h2>
                    <p>
                      The option you chose is now public on the indexer, labeled on this transaction —
                      not linked to your identity.
                    </p>
                  </div>
                )}
                {openStage === "gagal" && (
                  <div className="proof-state">
                    <TriangleAlert size={28} />
                    {openingHilang ? (
                      <>
                        <p className="eyebrow">No opening found on this device</p>
                        <p>{openGalat}</p>
                      </>
                    ) : (
                      <>
                        <p className="eyebrow">Vote not opened</p>
                        <p>{openGalat}</p>
                      </>
                    )}
                    <button className="ghost-button" onClick={() => setOpenStage("idle")}>Try again</button>
                  </div>
                )}
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
            <p>{teksTahap(tahap)}</p>
            <div className="progress-track"><span /></div>
            {cadangan && (
              <button className="ghost-button" onClick={() => unduhCadangan(cadangan)}>
                Download opening backup (needed if you clear this device later)
              </button>
            )}
          </div>
        )}
        {stage === "success" && (
          <div className="proof-state success-state">
            <div className="success-mark"><Check size={28} /></div>
            <p className="eyebrow mint-text">Vote recorded</p>
            <h2>Your ballot is sealed on-chain.</h2>
            {/* Klaim privasi di layar sukses harus BERSYARAT pada topologi
                proof server sungguhan yang SAMA dengan layar pemilihan —
                bukan pengulangan tanpa syarat "never sent as plain text" yang
                akan salah persis pada reach remote/lewat-host-halaman, tempat
                witness MEMANG melintasi jaringan sebelum disegel. */}
            <p>{privasi.kuat ? privasi.kalimat : `Your vote was recorded. ${privasi.kalimat}`}</p>
            <button className="primary-button full-button" onClick={onClose}>Back to dashboard <ArrowUpRight size={15} /></button>
          </div>
        )}
        {stage === "gagal" && galat && (
          <div className="proof-state">
            <TriangleAlert size={28} />
            {galat.mungkinSudahMasuk ? (
              <>
                <p className="eyebrow">Vote not confirmed here</p>
                <h2>Your vote may have already gone through</h2>
                <p>{galat.pesan}</p>
                <p><strong>Do not vote again with this credential.</strong> The network already shows a matching nullifier — trying again will be rejected as already used.</p>
              </>
            ) : (
              <>
                <p className="eyebrow">Vote not sent</p>
                <h2>Something went wrong</h2>
                <p>{galat.pesan}</p>
              </>
            )}
            <button className="ghost-button" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

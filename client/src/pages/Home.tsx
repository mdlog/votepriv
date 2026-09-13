import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  ChevronRight,
  CircleHelp,
  Code2,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import { connectMidnightWallet, describeWalletError, type WalletConnection } from "@/lib/midnight-wallet";
import { checkProofServer, type ProofServerStatus } from "@/lib/proof-server";
import { useDataRantai } from "@/hooks/useDataRantai";
import { GridBallotMemuat, PanelGagalRantai, SpandukSebagian } from "@/components/votepriv/KeadaanRantai";
import { CreateBallotModal } from "@/components/votepriv/CreateBallotModal";
import { Docs } from "@/components/votepriv/Docs";
import { LiveBallots } from "@/components/votepriv/LiveBallots";
import { Overview } from "@/components/votepriv/Overview";
import { RegisterModal } from "@/components/votepriv/RegisterModal";
import { Results } from "@/components/votepriv/Results";
import { VoteModal } from "@/components/votepriv/VoteModal";
import type { JaringanAktif } from "@/lib/chain";
import type { Ballot, Receipt, Section } from "@/components/votepriv/types";

const navItems: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Live ballots", icon: Vote },
  { label: "Results", icon: BarChart3 },
  { label: "Docs", icon: Code2 },
];

function shortAddress(address: string) {
  if (!address) return "";
  // Alamat Midnight berbentuk mn_shield-addr_test1… — prefiksnya selalu sama, jadi
  // dibuang supaya bagian yang membedakan (jaringan + ekor) tetap terbaca.
  const bare = address.replace(/^mn_(shield-addr|addr)_/, "");
  if (bare.length <= 12) return bare;
  return `${bare.slice(0, 6)}…${bare.slice(-4)}`;
}

/**
 * Kalimat toast setelah kirimSuara selesai.
 *
 * Praperiksa P5: sebelumnya `toast.success("Vote verified on Midnight
 * testnet", …)` TANPA SYARAT — salah pada DUA sumbu sekaligus:
 *
 *   (a) jaringan dikarang sebagai kata umum "testnet", padahal sesudah C-2a
 *       Task 8 sudah diketahui persis dari pembacaan rantai (data.jaringan);
 *   (b) klaim "verified" dipakai pada tanda terima yang txRef-nya SELALU null
 *       hari ini — VoteModal masih simulasi murni (jalur tulis adalah C-2b).
 *       "Verified" pada tanda terima yang tidak pernah menyentuh kontrak
 *       adalah klaim yang tidak ditunaikan, kelas cacat yang sama dengan
 *       badge "Demo data" yang Task 8 buang di tempat lain.
 *
 * TASK 8 (sesi ini, jalur tulis tersambung): cabang `txRef === null` kini
 * TIDAK PERNAH tercapai dari UI sungguhan — VoteModal.tsx hanya memanggil
 * `onVote` sesudah `kirimSuara` benar-benar berhasil, dan hasilnya selalu
 * membawa `txId` bertipe string. Cabang itu dipertahankan sebagai jaring
 * pengaman murni (Receipt masih mengizinkan txRef null di tipe), BUKAN
 * dihapus — tapi deskripsi cabang `txRef` non-null diperbaiki di sini: versi
 * lama ("Your choice remains private.") adalah klaim privasi TANPA SYARAT
 * persis seperti yang VoteModal.tsx sendiri sudah perbaiki (pesanPrivasiSuara)
 * — toast ini tidak tahu topologi proof server sungguhan, jadi ia tidak boleh
 * mengulang klaim itu. Kalimat barunya netral dan mengarahkan ke modal, yang
 * memang menyimpan nuansa bersyaratnya.
 *
 * Diekspor supaya dapat diuji langsung sebagai fungsi murni, tanpa perlu
 * menjalankan seluruh alur vote lewat DOM dan tanpa perlu memata-matai
 * `<Toaster />` — yang toh tinggal di App.tsx, di luar akar mana pun yang
 * pernah dirender uji manapun di pohon ini.
 */
export function pesanSuksesVote(
  receipt: Receipt,
  jaringan: JaringanAktif | null,
): { judul: string; deskripsi: string } {
  if (receipt.txRef === null) {
    return {
      judul: "Vote simulated",
      deskripsi: "No transaction was submitted — the write path is not connected yet.",
    };
  }
  return {
    judul: `Vote verified on Midnight ${jaringan ? jaringan.networkId : "network"}`,
    deskripsi: "Your ballot was sealed on-chain. See the vote dialog for exactly what stayed private.",
  };
}

export default function Home() {
  const data = useDataRantai();
  const ballots = data.fase === "siap" ? data.ballots : [];

  const [section, setSection] = useState<Section>("Overview");
  const [connected, setConnected] = useState(false);
  const [wallet, setWallet] = useState("");
  const [network, setNetwork] = useState("");
  const [connecting, setConnecting] = useState(false);
  // Objek WalletConnection PENUH (dipakai jalur tulis C-2b, bukan hanya
  // alamat/jaringan yang dua state string di atas simpan untuk topbar).
  const [walletConn, setWalletConn] = useState<WalletConnection | null>(null);
  // Wallet MEMBUKA suara (bukaSuara) — SENGAJA state terpisah dari
  // `walletConn`, tidak pernah diam-diam diisi dari situ. Lihat komentar prop
  // `openWallet` di VoteModal.tsx untuk alasannya.
  const [openWalletConn, setOpenWalletConn] = useState<WalletConnection | null>(null);
  const [openConnecting, setOpenConnecting] = useState(false);
  const [proofStatus, setProofStatus] = useState<ProofServerStatus | null>(null);

  useEffect(() => {
    checkProofServer().then(setProofStatus);
  }, []);

  // Panel ini tidak boleh mengklaim "Always on" tanpa syarat. Proof server menerima
  // witness, jadi kalau ia remote — atau mati — pengguna harus melihatnya di sini,
  // bukan menemukannya setelah suaranya terlanjur dikirim.
  //
  // Klaim "witness tidak pernah meninggalkan perangkat ini" menuntut DUA hal
  // sekaligus: target proxy lokal DAN asal halaman lokal. Target lokal saja tidak
  // cukup — VITE_PROOF_SERVER_URL diselesaikan proses Node yang menjalankan dev
  // server, jadi 127.0.0.1:6300 berarti loopback MESIN DEV. Halaman yang dibuka
  // lewat tunnel mengirim witness menyeberangi jaringan menuju mesin itu. Karena
  // itu `reach` punya tiga nilai, bukan boolean remote/lokal.
  //
  // Seluruh jalur witness dibaca dari proofStatus, TIDAK dari modul. Target yang
  // dipanggang ke bundel saat build bisa berbeda dari yang benar-benar dipakai
  // proxy saat start; checkProofServer() menanyakannya ke server dan menyertakan
  // `targetTerverifikasi`. Ketika target tidak dapat dikonfirmasi, panel ini
  // menahan klaim kuatnya alih-alih menebak — indikator yang menebak lebih buruk
  // daripada indikator yang mengaku tidak tahu.
  const privacy = useMemo(() => {
    if (!proofStatus) return { label: "Checking…", tone: "", title: "Checking the proof server." };
    // Keadaan privasi disampaikan lebih dulu, keterjangkauan menyusul dalam
    // kalimat yang sama: pengguna yang witness-nya menyeberang jaringan perlu
    // tahu hal itu terlepas dari apakah proof server-nya sedang hidup.
    const jangkauan = proofStatus.reachable
      ? `The proof server answered v${proofStatus.version}.`
      : `The proof server could not be reached either (${proofStatus.error}).`;
    // Disematkan ke peringatan yang sudah ada, bukan menggantikannya: kalau target
    // belum dikonfirmasi, nama host yang disebut kalimat di bawah pun belum pasti.
    const catatanTarget = proofStatus.targetTerverifikasi
      ? ""
      : " This target comes from the build value and has not been confirmed by the server serving this page, so the real destination may differ.";
    if (proofStatus.reach === "remote")
      return {
        label: "Proof server remote",
        tone: "warn",
        title: `Your witness — your credential and vote choice — is sent to ${proofStatus.target}. Because the proof server receives the witness, its operator can see your vote choice. ${jangkauan}${catatanTarget}`,
      };
    if (proofStatus.reach === "lewat-host-halaman")
      return {
        label: "Witness crosses the network",
        tone: "warn",
        title: `This page is served from ${location.host}, not from your device, so ${proofStatus.target} is THAT MACHINE's loopback — not yours. The witness travels ${proofStatus.hop}, and whoever operates that machine can see your vote choice. ${jangkauan}${catatanTarget}`,
      };
    if (!proofStatus.reachable)
      return {
        label: "Proof server offline",
        tone: "off",
        title: `The local proof server could not be reached (${proofStatus.error}). Run: docker compose -f proof-server.yml up`,
      };
    // Sampai di sini jalurnya lokal DAN proof server hidup. Klaim terkuat aplikasi
    // ini boleh dibuat — tetapi hanya bila target benar-benar dikonfirmasi server.
    // Tanpa konfirmasi, /proof-server bisa saja diteruskan reverse proxy di depan
    // ke tempat lain sementara bundel tetap menyebut 127.0.0.1.
    if (!proofStatus.targetTerverifikasi)
      return {
        label: "Target not verified",
        tone: "warn",
        title: `The proof server answered v${proofStatus.version}, but the server serving this page did not report where /proof-server is forwarded to. ${proofStatus.target} is only the value baked in at build time. Because the real destination cannot be confirmed, the claim "the witness never leaves this device" is not made here.`,
      };
    return {
      label: "Always on",
      tone: "",
      title: `Local proof server v${proofStatus.version} at ${proofStatus.target}, accessed from a local page — the witness never leaves this device.`,
    };
  }, [proofStatus]);
  const [voteBallot, setVoteBallot] = useState<Ballot | null>(null);
  // Pendaftaran mandiri (pemilih membuat credential-nya sendiri) — state
  // TERPISAH dari voteBallot dengan sengaja: pendaftaran tidak butuh wallet
  // maupun jaringan sama sekali (lihat RegisterModal.tsx), jadi tidak ada
  // alasan menggabungkannya dengan mesin state milik VoteModal.
  const [registerBallot, setRegisterBallot] = useState<Ballot | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const connectWallet = async () => {
    if (connected) {
      setConnected(false);
      setWallet("");
      setNetwork("");
      setWalletConn(null);
      toast.info("Wallet disconnected");
      return;
    }
    setConnecting(true);
    try {
      // Lace membuka jendela persetujuan di luar halaman, jadi permintaan yang
      // belum dijawab tidak bisa dibedakan dari ekstensi yang mati. Setelah
      // beberapa detik, arahkan pengguna ke sana alih-alih membiarkannya menebak.
      const result = await connectMidnightWallet(undefined, () =>
        toast.info("Waiting on wallet", {
          description: "Open Lace from the Chrome toolbar — there may be a pending approval window.",
        }),
      );
      setWallet(result.address);
      setNetwork(result.networkId);
      setWalletConn(result);
      setConnected(true);
      // Sengaja tidak mengklaim "eligibility check passed" seperti versi mock:
      // pemeriksaan itu belum ada sampai kontrak ballot tersambung.
      toast.success("Wallet connected", {
        description: `${result.connectorName} · connector v${result.apiVersion}`,
      });
    } catch (error) {
      console.error("[votepriv:wallet] connect gagal", error);
      toast.error("Could not connect wallet", { description: describeWalletError(error) });
    } finally {
      setConnecting(false);
    }
  };

  /**
   * Wallet untuk MEMBUKA suara — TERPISAH dari connectWallet di atas dan
   * TIDAK PERNAH berbagi state dengannya. "Bentuk alur yang saya putuskan"
   * (Task 8, sesi ini): default-nya adalah menyambungkan wallet APA PUN yang
   * sedang aktif di ekstensi saat tombol ini ditekan — yang bisa, dan
   * sebaiknya, BUKAN wallet yang tadi mencoblos. VoteModal tidak pernah
   * membaca `wallet`/`walletConn` untuk mengisi `openWallet` secara diam-diam.
   */
  const connectOpenWallet = async () => {
    if (openWalletConn) {
      setOpenWalletConn(null);
      toast.info("Opening wallet disconnected");
      return;
    }
    setOpenConnecting(true);
    try {
      const result = await connectMidnightWallet(undefined, () =>
        toast.info("Waiting on wallet", {
          description: "Open Lace from the Chrome toolbar — there may be a pending approval window.",
        }),
      );
      setOpenWalletConn(result);
      toast.success("Wallet connected to open votes", {
        description: `${result.connectorName} · connector v${result.apiVersion}`,
      });
    } catch (error) {
      console.error("[votepriv:wallet] connect (buka suara) gagal", error);
      toast.error("Could not connect wallet", { description: describeWalletError(error) });
    } finally {
      setOpenConnecting(false);
    }
  };

  const handleVote = (nextReceipt: Receipt) => {
    setReceipt(nextReceipt);
    const { judul, deskripsi } = pesanSuksesVote(nextReceipt, data.jaringan);
    if (nextReceipt.txRef === null) {
      toast.info(judul, { description: deskripsi });
    } else {
      toast.success(judul, { description: deskripsi });
    }
  };

  const currentCopy = useMemo(
    () =>
      section === "Overview" ? "Your private governance workspace"
      : section === "Live ballots" ? "Choose with confidence"
      : section === "Results" ? "Trust, without the trade-off"
      : "Understand the protocol",
    [section],
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <span>vote<span>priv</span></span>
        </div>
        <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={20} /></button>
        <div className="workspace-card">
          <div className="workspace-avatar">MB</div>
          <div><strong>Midnight Builders</strong><span>Community workspace</span></div>
          <ChevronRight size={15} />
        </div>
        <div className="sidebar-label">Workspace</div>
        <nav>
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={section === label ? "active" : ""}
              onClick={() => { setSection(label); setMobileNav(false); }}
            >
              <Icon size={17} />
              <span>{label}</span>
              {label === "Live ballots" && data.fase === "siap" && <b>{ballots.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className={`privacy-mode ${privacy.tone}`} title={privacy.title}>
            <div className="privacy-mode-icon"><LockKeyhole size={15} /></div>
            <div><span>Privacy mode</span><strong>{privacy.label}</strong></div>
            <span className={`status-dot ${privacy.tone}`} />
          </div>
          <button className="help-link" onClick={() => setSection("Docs")}><CircleHelp size={16} /> Help center</button>
          <div className="sidebar-footer">
            <span>VotePriv v0.1</span><span>·</span>
            {/* Kata umum "Testnet" diganti jaringan sebenarnya — lihat P5. */}
            <span>{data.jaringan ? data.jaringan.networkId : "no network"}</span>
          </div>
        </div>
      </aside>
      <div className={`mobile-overlay ${mobileNav ? "visible" : ""}`} onClick={() => setMobileNav(false)} />
      <main className="main-shell">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="topbar-context">
            <span className="context-title">{currentCopy}</span>
            <span className="context-divider">/</span>
            <span className="context-section">{section}</span>
          </div>
          <div className="topbar-actions">
            {/* Status JARINGAN YANG DIBACA, bukan wallet. Sebelumnya ia
                menampilkan jaringan wallet bila tersambung dan "Midnight
                testnet" bila tidak — keduanya bisa BERBEDA, dan yang
                menentukan isi halaman adalah yang dibaca. Jaringan wallet
                disebut terpisah hanya ketika ia berselisih. */}
            <div className="network-status">
              <span className="pulse-dot" />{" "}
              {data.jaringan ? `Midnight ${data.jaringan.networkId}` : "Midnight —"}
              {connected && network && data.jaringan && network !== data.jaringan.networkId && (
                <> · wallet on {network}</>
              )}
              <ChevronRight size={14} />
            </div>
            <button className={`wallet-button ${connected ? "connected" : ""}`} onClick={connectWallet} disabled={connecting}>
              <Wallet size={16} />
              {connecting ? "Connecting…" : connected ? shortAddress(wallet) : "Connect wallet"}
            </button>
            <div className="user-avatar">AR</div>
          </div>
        </header>
        <div className="page-container">
          {/*
           * Docs TIDAK digerbangi fase pembacaan rantai (praperiksa P4):
           * ia halaman statis yang tidak menyentuh data rantai sama sekali,
           * dan justru halaman yang menjelaskan model privasi ini yang paling
           * penting tetap terjangkau SAAT indexer mati — bukan tergantikan
           * diam-diam oleh panel gagal tanpa pesan apa pun. LiveBallots,
           * Overview, dan Results TETAP hanya dirender pada fase `siap`: itu
           * yang diperiksa oleh cabang di bawah untuk KETIGA section itu.
           */}
          {section === "Docs" ? (
            <Docs />
          ) : data.fase === "memuat" ? (
            <section className="page-section">
              <div className="page-heading">
                <div>
                  {/* data.jaringan bernilai null ketika konfigurasi sendiri
                      yang gagal. Itu tidak boleh dikarang menjadi "preview". */}
                  <p className="eyebrow">
                    <span className="eyebrow-mark" />{" "}
                    {data.jaringan ? `Midnight ${data.jaringan.networkId}` : "Starting up"}
                  </p>
                  <h1>Reading the chain…</h1>
                  <p>VotePriv is fetching registry and ballot state from the indexer.</p>
                </div>
              </div>
              <GridBallotMemuat />
            </section>
          ) : data.fase === "gagal" ? (
            <section className="page-section">
              <PanelGagalRantai
                galat={data.galat}
                jaringan={data.jaringan}
                percobaan={data.percobaan}
                onCoba={data.muatUlang}
              />
            </section>
          ) : (
            <>
              {section === "Overview" && (
                <Overview
                  hasil={data.hasil}
                  ballots={ballots}
                  onVote={setVoteBallot}
                  onRegister={setRegisterBallot}
                  onCreate={() => setCreateOpen(true)}
                  onSection={setSection}
                />
              )}
              {section === "Live ballots" && (
                <LiveBallots
                  ballots={ballots}
                  onVote={setVoteBallot}
                  onRegister={setRegisterBallot}
                  onCreate={() => setCreateOpen(true)}
                  atas={<SpandukSebagian gagal={data.hasil.gagal} />}
                />
              )}
              {section === "Results" && (
                // data.hasil.jaringan, BUKAN data.jaringan: pada fase `siap`
                // keduanya sama, tetapi yang pertama bertipe JaringanAktif
                // (tidak nullable) karena ia jaringan yang pembacaan ini
                // BENAR-BENAR pakai.
                <Results
                  ballots={ballots}
                  receipt={receipt}
                  jaringan={data.hasil.jaringan}
                  blokHeight={data.hasil.blok.height}
                  onMuatUlang={data.muatUlang}
                />
              )}
            </>
          )}
        </div>
      </main>
      {/*
       * `data.jaringan` bisa `null` pada fase memuat/gagal — tapi `voteBallot`
       * hanya pernah diset dari daftar ballot yang HANYA dirender pada fase
       * `siap`, di mana `data.jaringan` non-null; guard `&& data.jaringan` di
       * sini murni defensif tipe, bukan perubahan perilaku.
       */}
      {voteBallot && data.jaringan && (
        <VoteModal
          ballot={voteBallot}
          connected={connected}
          wallet={walletConn}
          jaringan={data.jaringan.networkId}
          proofStatus={proofStatus}
          openWallet={openWalletConn}
          openConnecting={openConnecting}
          onConnectOpenWallet={connectOpenWallet}
          onClose={() => setVoteBallot(null)}
          onVote={handleVote}
        />
      )}
      {/* Tidak butuh guard `data.jaringan` seperti VoteModal: pendaftaran
          mandiri tidak menyentuh wallet maupun jaringan sama sekali (lihat
          RegisterModal.tsx) — registerBallot hanya pernah diset dari ballot
          yang dirender pada fase `siap`, jadi ballot itu sendiri sudah valid. */}
      {registerBallot && <RegisterModal ballot={registerBallot} onClose={() => setRegisterBallot(null)} />}
      {createOpen && <CreateBallotModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

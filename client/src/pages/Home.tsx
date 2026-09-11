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
import { connectMidnightWallet, describeWalletError } from "@/lib/midnight-wallet";
import { checkProofServer, type ProofServerStatus } from "@/lib/proof-server";
import { CreateBallotModal } from "@/components/votepriv/CreateBallotModal";
import { Docs } from "@/components/votepriv/Docs";
import { LiveBallots } from "@/components/votepriv/LiveBallots";
import { Overview } from "@/components/votepriv/Overview";
import { Results } from "@/components/votepriv/Results";
import { VoteModal } from "@/components/votepriv/VoteModal";
import { initialBallots } from "@/components/votepriv/demo-data";
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

export default function Home() {
  const [section, setSection] = useState<Section>("Overview");
  const [ballots, setBallots] = useState<Ballot[]>(initialBallots);
  const [connected, setConnected] = useState(false);
  const [wallet, setWallet] = useState("");
  const [network, setNetwork] = useState("");
  const [connecting, setConnecting] = useState(false);
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
    if (!proofStatus) return { label: "Checking…", tone: "", title: "Memeriksa proof server." };
    // Keadaan privasi disampaikan lebih dulu, keterjangkauan menyusul dalam
    // kalimat yang sama: pengguna yang witness-nya menyeberang jaringan perlu
    // tahu hal itu terlepas dari apakah proof server-nya sedang hidup.
    const jangkauan = proofStatus.reachable
      ? `Proof server menjawab v${proofStatus.version}.`
      : `Proof server juga tidak dapat dihubungi (${proofStatus.error}).`;
    // Disematkan ke peringatan yang sudah ada, bukan menggantikannya: kalau target
    // belum dikonfirmasi, nama host yang disebut kalimat di bawah pun belum pasti.
    const catatanTarget = proofStatus.targetTerverifikasi
      ? ""
      : " Target ini berasal dari nilai build dan belum dikonfirmasi oleh server yang menyajikan halaman ini, jadi tujuan sebenarnya bisa berbeda.";
    if (proofStatus.reach === "remote")
      return {
        label: "Proof server remote",
        tone: "warn",
        title: `Witness Anda — credential dan pilihan suara — dikirim ke ${proofStatus.target}. Karena proof server menerima witness, operatornya dapat melihat pilihan suara Anda. ${jangkauan}${catatanTarget}`,
      };
    if (proofStatus.reach === "lewat-host-halaman")
      return {
        label: "Witness lewat jaringan",
        tone: "warn",
        title: `Halaman ini disajikan dari ${location.host}, bukan dari perangkat Anda, sehingga ${proofStatus.target} adalah loopback MESIN ITU — bukan loopback Anda. Witness menempuh ${proofStatus.hop}, dan siapa pun yang mengoperasikan mesin itu dapat melihat pilihan suara Anda. ${jangkauan}${catatanTarget}`,
      };
    if (!proofStatus.reachable)
      return {
        label: "Proof server offline",
        tone: "off",
        title: `Proof server lokal tidak dapat dihubungi (${proofStatus.error}). Jalankan: docker compose -f proof-server.yml up`,
      };
    // Sampai di sini jalurnya lokal DAN proof server hidup. Klaim terkuat aplikasi
    // ini boleh dibuat — tetapi hanya bila target benar-benar dikonfirmasi server.
    // Tanpa konfirmasi, /proof-server bisa saja diteruskan reverse proxy di depan
    // ke tempat lain sementara bundel tetap menyebut 127.0.0.1.
    if (!proofStatus.targetTerverifikasi)
      return {
        label: "Target belum terverifikasi",
        tone: "warn",
        title: `Proof server menjawab v${proofStatus.version}, tetapi server yang menyajikan halaman ini tidak melaporkan ke mana /proof-server diteruskan. ${proofStatus.target} hanyalah nilai yang dipanggang saat build. Karena tujuan sebenarnya tidak dapat dipastikan, klaim "witness tidak pernah meninggalkan perangkat ini" tidak dibuat di sini.`,
      };
    return {
      label: "Always on",
      tone: "",
      title: `Proof server lokal v${proofStatus.version} di ${proofStatus.target}, diakses dari halaman lokal — witness tidak pernah meninggalkan perangkat ini.`,
    };
  }, [proofStatus]);
  const [voteBallot, setVoteBallot] = useState<Ballot | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const connectWallet = async () => {
    if (connected) {
      setConnected(false);
      setWallet("");
      setNetwork("");
      toast.info("Wallet disconnected");
      return;
    }
    setConnecting(true);
    try {
      // Lace membuka jendela persetujuan di luar halaman, jadi permintaan yang
      // belum dijawab tidak bisa dibedakan dari ekstensi yang mati. Setelah
      // beberapa detik, arahkan pengguna ke sana alih-alih membiarkannya menebak.
      const result = await connectMidnightWallet(undefined, () =>
        toast.info("Menunggu wallet", {
          description: "Buka Lace dari toolbar Chrome — mungkin ada jendela persetujuan yang menunggu.",
        }),
      );
      setWallet(result.address);
      setNetwork(result.networkId);
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

  const handleVote = (nextReceipt: Receipt) => {
    setReceipt(nextReceipt);
    toast.success("Vote verified on Midnight testnet", { description: "Your choice remains private." });
  };

  const createBallot = (ballot: Ballot) => setBallots((current) => [ballot, ...current]);
  const currentCopy = useMemo(() => section === "Overview" ? "Your private governance workspace" : section === "Live ballots" ? "Choose with confidence" : section === "Results" ? "Trust, without the trade-off" : "Understand the protocol", [section]);

  return <div className="app-shell"><aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}><div className="brand"><div className="brand-mark"><span /><span /><span /></div><span>vote<span>priv</span></span></div><button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={20} /></button><div className="workspace-card"><div className="workspace-avatar">MB</div><div><strong>Midnight Builders</strong><span>Community workspace</span></div><ChevronRight size={15} /></div><div className="sidebar-label">Workspace</div><nav>{navItems.map(({ label, icon: Icon }) => <button key={label} className={section === label ? "active" : ""} onClick={() => { setSection(label); setMobileNav(false); }}><Icon size={17} /><span>{label}</span>{label === "Live ballots" && <b>12</b>}</button>)}</nav><div className="sidebar-bottom"><div className={`privacy-mode ${privacy.tone}`} title={privacy.title}><div className="privacy-mode-icon"><LockKeyhole size={15} /></div><div><span>Privacy mode</span><strong>{privacy.label}</strong></div><span className={`status-dot ${privacy.tone}`} /></div><button className="help-link" onClick={() => setSection("Docs")}><CircleHelp size={16} /> Help center</button><div className="sidebar-footer"><span>VotePriv v0.1</span><span>·</span><span>Testnet</span></div></div></aside><div className={`mobile-overlay ${mobileNav ? "visible" : ""}`} onClick={() => setMobileNav(false)} /><main className="main-shell"><header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="topbar-context"><span className="context-title">{currentCopy}</span><span className="context-divider">/</span><span className="context-section">{section}</span></div><div className="topbar-actions"><div className="network-status"><span className="pulse-dot" /> {connected && network ? `Midnight ${network}` : "Midnight testnet"} <ChevronRight size={14} /></div><button className={`wallet-button ${connected ? "connected" : ""}`} onClick={connectWallet} disabled={connecting}><Wallet size={16} />{connecting ? "Connecting…" : connected ? shortAddress(wallet) : "Connect wallet"}</button><div className="user-avatar">AR</div></div></header><div className="page-container">{section === "Overview" && <Overview ballots={ballots} onVote={setVoteBallot} onCreate={() => setCreateOpen(true)} onSection={setSection} />}{section === "Live ballots" && <LiveBallots ballots={ballots} onVote={setVoteBallot} onCreate={() => setCreateOpen(true)} />}{section === "Results" && <Results ballots={ballots} receipt={receipt} />}{section === "Docs" && <Docs />}</div></main>{voteBallot && <VoteModal ballot={voteBallot} connected={connected} onClose={() => setVoteBallot(null)} onVote={handleVote} />}{createOpen && <CreateBallotModal onClose={() => setCreateOpen(false)} onCreate={createBallot} />}</div>;
}

import { AlertTriangle, RefreshCcw, ServerCrash, Unplug } from "lucide-react";
import type { BallotGagal, GalatRantai, JaringanAktif } from "@/lib/chain";

/**
 * Permukaan yang lahir bersama data jaringan: satu kerangka memuat, SATU panel
 * gagal yang kalimatnya berubah menurut sebab (SEMBILAN sebab GalatRantai,
 * masing-masing dengan kalimatnya sendiri lewat pesanGagal), dan satu spanduk
 * sebagian.
 *
 * Data mockup selalu ada seketika; data indexer tidak — terukur 1.047-1.279 ms,
 * dan berasal dari layanan publik yang tidak kita kendalikan. Sebelum C-2a,
 * tidak satu pun dari keempat keadaan ini punya tempat di UI.
 *
 * Seluruh nama kelas di berkas ini SUDAH ADA di client/src/index.css. Tidak ada
 * satu baris CSS pun yang ditambah C-2a.
 */

/** Satu kartu kerangka. Memakai bentuk kartu yang sama supaya tata letak tidak melompat saat data mendarat. */
export function KartuBallotMemuat() {
  return (
    <article className="ballot-card" aria-busy="true">
      <div className="card-topline">
        <span className="status-badge">
          <span /> Loading
        </span>
        <span className="ballot-tag">Reading chain</span>
      </div>
      <div className="ballot-title-row">
        <div>
          <h3>&nbsp;</h3>
          <p>Reading contract state from the indexer.</p>
        </div>
      </div>
      <div className="ballot-progress-label">
        <span>Participation</span>
        <strong>—</strong>
      </div>
      <div className="progress-track slim">
        <span style={{ width: "0%" }} />
      </div>
    </article>
  );
}

export function GridBallotMemuat({ count = 2 }: { count?: number }) {
  return (
    <div className="ballots-grid">
      {Array.from({ length: count }, (_, i) => (
        <KartuBallotMemuat key={i} />
      ))}
    </div>
  );
}

/**
 * Kalimat untuk tiap sebab kegagalan.
 *
 * Dipisah dari komponennya supaya dapat diuji sebagai fungsi murni, dan supaya
 * setiap kalimat dapat dibaca berdampingan tanpa JSX di antaranya. Tidak ada
 * cabang "lain-lain" yang berbunyi "Something went wrong": pesan semacam itu
 * membuat laporan galat dari pengguna tidak berguna, dan membuat perbedaan
 * antara "indexer mati" dan "jaringan salah" hilang tepat ketika ia paling
 * dibutuhkan.
 *
 * PENYEMPITAN TIPE (praperiksa P1): guard di bawah adalah
 * `galat.sebab === "konfigurasi" || jaringan === null`, BUKAN sekadar
 * `galat.sebab === "konfigurasi"`. Klausa `|| jaringan === null` WAJIB
 * dipertahankan: "konfigurasi" adalah SATU-SATUNYA sebab yang boleh muncul
 * dengan `jaringan` null (lihat useDataRantai — jaringan null persis ketika
 * hook sendiri menghasilkan GalatRantai("konfigurasi", …)), tetapi sebab LAIN
 * dengan `jaringan` null bukan hal yang mustahil secara TIPE — parameter
 * `jaringan` di sini adalah `JaringanAktif | null` untuk SEMUA sebab, bukan
 * hanya untuk "konfigurasi". Tanpa klausa kedua ini, sebab lain (mis.
 * "registry-hilang") yang kebetulan dipanggil dengan jaringan null akan lolos
 * ke switch di bawah dan mendereferensi `jaringan.alamatRegistry` pada nilai
 * null — TypeError mentah, melewati seluruh permukaan galat yang justru
 * dibangun untuk menangkapnya.
 *
 * Konsekuensinya: setelah guard ini, `galat.sebab` TERSEMPIT ke delapan sebab
 * SELAIN "konfigurasi", dan `jaringan` TERSEMPIT ke `JaringanAktif` (non-null)
 * untuk SISA fungsi. `case "konfigurasi":` di dalam switch di bawah karena itu
 * SENGAJA TIDAK ADA — bukan diagi, tapi memang sudah eksaustif ditangani oleh
 * guard ini sendiri. Menambahkannya kembali adalah TS2678 (tipe yang sudah
 * dipersempit tidak lagi memuat "konfigurasi"), dan menghapusnya dari sini
 * pun tidak kehilangan apa pun: isinya identik dengan return di guard ini.
 * TypeScript sendiri menjaga eksaustifan switch di bawah — fungsi ini WAJIB
 * mengembalikan nilai di setiap cabang (tidak ada `default`), jadi melewatkan
 * satu sebab dari SebabGalatRantai akan gagal `pnpm check` dengan "not all
 * code paths return a value", bukan lolos diam-diam.
 */
export function pesanGagal(
  galat: GalatRantai,
  /** null ketika konfigurasi sendiri yang gagal — tidak ada jaringan yang dipilih. */
  jaringan: JaringanAktif | null,
): { judul: string; kalimat: string; saran: string } {
  // Sebab "konfigurasi" ditangani lebih dulu, DIGABUNG dengan jaringan null:
  // ia SATU-SATUNYA cabang yang boleh muncul tanpa jaringan, dan seluruh
  // cabang di bawahnya boleh menganggap jaringan sudah ada. Lihat komentar
  // PENYEMPITAN TIPE di atas untuk alasan klausa `|| jaringan === null`.
  if (galat.sebab === "konfigurasi" || jaringan === null) {
    return {
      judul: "VotePriv is misconfigured",
      kalimat: `VotePriv could not work out which network to read before it contacted anything: ${galat.rincian}`,
      saran: "Fix VITE_MIDNIGHT_NETWORK or VITE_VOTEPRIV_REGISTRY in your environment, then reload.",
    };
  }
  switch (galat.sebab) {
    case "jaringan":
      return {
        judul: "Can't reach the indexer",
        kalimat: `VotePriv could not connect to ${galat.host}. Nothing was read from the chain, so no ballots can be shown — this is not an empty registry.`,
        saran: "Check your connection, then try again.",
      };
    case "http":
      return {
        judul: "The indexer returned an error",
        kalimat: `${galat.host} answered with an error instead of data: ${galat.rincian}`,
        saran: "This is usually temporary. Try again in a moment.",
      };
    case "balasan-html":
      return {
        judul: "Something is standing in front of the indexer",
        kalimat: `${galat.host} answered with a web page instead of GraphQL data. A proxy, captive portal, or sign-in page is intercepting the request.`,
        saran: "Open a normal page in this browser first, then try again.",
      };
    case "bukan-json":
      return {
        judul: "The indexer sent an unreadable answer",
        kalimat: `${galat.host} answered with something that is not valid JSON: ${galat.rincian}`,
        saran: "Try again. If it keeps happening, the indexer is likely unhealthy.",
      };
    case "graphql-fatal":
      // BUKAN "registry tidak ditemukan". Ini kegagalan di tingkat KUERI —
      // biasanya skema indexer berubah dan sebuah field tidak dikenal lagi.
      // Menyebutnya sebagai registry yang salah jaringan mengirim pembaca
      // memeriksa variabel lingkungan yang sebenarnya benar.
      return {
        judul: "The indexer rejected the query",
        kalimat: `${galat.host} accepted the request but did not run the query, so nothing was read. This usually means the indexer schema changed. Details: ${galat.rincian}`,
        saran: "This is not a wrong address or a wrong network. It needs a code change to match the new schema.",
      };
    case "registry-hilang":
      return {
        judul: "Registry not found on this network",
        kalimat: `No contract was found at ${jaringan.alamatRegistry} on the ${jaringan.networkId} network. Every ballot is discovered through the registry, so nothing can be listed. Details: ${galat.rincian}`,
        saran: "The address is probably right but the network is wrong. Check VITE_MIDNIGHT_NETWORK.",
      };
    case "registry-skema":
      // BUKAN "registry tidak ditemukan" dan BUKAN "jaringan salah". Kunci `r`
      // hilang SELURUHNYA dari jawaban Registry berarti KUERI ITU SENDIRI
      // gagal divalidasi (alias atau skema tidak cocok) — indexer tidak pernah
      // sampai menjawab "ada kontrak atau tidak" di alamat ini. Memakai saran
      // registry-hilang ("periksa VITE_MIDNIGHT_NETWORK") di sini menyesatkan:
      // jaringan dan alamatnya bisa saja sudah benar sepenuhnya, dan yang
      // rusak adalah bentuk kueri terhadap skema indexer. Inilah alasan
      // taksonomi memisahnya dari registry-hilang — lihat komentar
      // SebabGalatRantai di graphql.ts.
      return {
        judul: "The registry query could not be answered",
        kalimat: `${galat.host} did not return the expected field for the registry contract at ${jaringan.alamatRegistry}. This usually means a GraphQL schema or alias mismatch, not a missing contract or a wrong network. Details: ${galat.rincian}`,
        saran: "This is not a wrong address or a wrong network. It needs a code change to match the indexer schema.",
      };
    case "dekode":
      return {
        judul: "Contract state could not be decoded",
        kalimat: `A contract answered, but its state does not match the VotePriv contract layout: ${galat.rincian}`,
        saran: "This usually means the address points at a different contract than expected.",
      };
  }
}

/**
 * Ikon per sebab. Dipisah dari PanelGagalRantai (dan diekspor) supaya
 * pemetaannya dapat diuji langsung sebagai identitas komponen — lewat DOM,
 * ketiga ikon lucide-react ini tidak punya penanda yang murah dibedakan uji.
 */
export function ikonUntukSebab(sebab: GalatRantai["sebab"]) {
  if (sebab === "jaringan") return Unplug;
  if (sebab === "dekode" || sebab === "konfigurasi") return AlertTriangle;
  return ServerCrash;
}

export function PanelGagalRantai({
  galat,
  jaringan,
  percobaan,
  onCoba,
}: {
  galat: GalatRantai;
  /** null ketika konfigurasi sendiri yang gagal. TIDAK PERNAH diisi objek rekaan. */
  jaringan: JaringanAktif | null;
  percobaan: number;
  onCoba: () => void;
}) {
  const { judul, kalimat, saran } = pesanGagal(galat, jaringan);
  const Ikon = ikonUntukSebab(galat.sebab);
  return (
    <div className="empty-state" role="alert" data-sebab={galat.sebab}>
      <Ikon size={22} />
      <h3>{judul}</h3>
      <p>{kalimat}</p>
      <p>{saran}</p>
      <button className="primary-button" onClick={onCoba}>
        <RefreshCcw size={15} /> Retry
      </button>
      {percobaan > 0 && <p className="ballot-tag">Attempt {percobaan + 1}</p>}
    </div>
  );
}

/**
 * Spanduk kegagalan SEBAGIAN.
 *
 * BUKAN permukaan gagal: daftar ballot yang berhasil dibaca tetap tampil di
 * bawahnya. registry.register() bersifat permissionless dan registry.compact
 * sendiri menyebut entri yang tidak resolve harus disaring di sisi klien —
 * menyembunyikan seluruh daftar karena satu entri sampah berarti siapa pun
 * dapat mematikan halaman ini dengan satu transaksi.
 */
export function SpandukSebagian({ gagal }: { gagal: BallotGagal[] }) {
  if (gagal.length === 0) return null;
  return (
    <div className="privacy-callout" role="status">
      <AlertTriangle size={17} />
      <span>
        <strong>
          {gagal.length} registry {gagal.length === 1 ? "entry" : "entries"} could not be read.
        </strong>{" "}
        The registry is permissionless, so anyone can add an entry that is not a VotePriv ballot. The
        ballots below were read successfully.
      </span>
    </div>
  );
}

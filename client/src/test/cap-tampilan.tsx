/**
 * Cap tampilan: mengubah satu render menjadi nilai yang bisa dibandingkan.
 *
 * Definisi "murni struktural" di spec §14.7 adalah: render tiap section sebelum
 * dan sesudah pemecahan, lalu bandingkan himpunan nama kelasnya. Berkas ini
 * menjalankan itu, dan menambah tiga lapis karena himpunan saja tidak menggigit:
 *
 *   kelas       himpunan token class unik, terurut. Yang diminta spec.
 *   garisBesar  daftar berurut "kedalaman:tag.kelas[atribut]" per elemen.
 *               Struktur: himpunan tidak bisa membedakan elemen yang berpindah
 *               induk — dua struktur yang sama sekali berbeda punya himpunan
 *               yang identik. Pada pemecahan dengan empat baris JSX 2.000+
 *               karakter, perpindahan induk justru kegagalan yang paling
 *               mungkin terjadi.
 *               Atribut: SELURUH atribut DOM selain class, terurut menurut
 *               nama. Tanpa ini, cap buta terhadap style, title, aria-*, role,
 *               placeholder, value, id, dan disabled. Home.tsx memuat dua
 *               style={{ width: … }} — garis dasar baris 239 (ikut BallotCard)
 *               dan 259 (ikut Results) — yang keduanya adalah lebar bar progres.
 *               Satu salah pindah dan bar-nya membeku di lebar yang salah tanpa
 *               satu token kelas pun berubah.
 *   teks        textContent ternormalisasi. Menangkap teks Inggris yang hilang
 *               atau kehilangan satu spasi saat baris raksasa disentuh.
 *
 * Yang TIDAK dijangkau berkas ini: prop fungsi (React tidak menaruhnya di DOM),
 * key, CSS yang sesungguhnya, dan permukaan di luar ketiga belas yang dijelajah
 * rekamPermukaan(). Lihat bagian "Apa yang keempat lapis itu TIDAK buktikan" di
 * rencana C-1.
 */
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { createElement, type ComponentType } from "react";
import { vi } from "vitest";
import type { ProofServerStatus } from "@/lib/proof-server";
import type { WalletConnection } from "@/lib/midnight-wallet";

export type Cap = { kelas: string[]; garisBesar: string[]; teks: string };
export type CapPrivasi = { kelas: string[]; label: string; judul: string };
export type Rekaman = { permukaan: Record<string, Cap>; privasi: Record<string, CapPrivasi> };

/**
 * Satu nilai fixture untuk panel privasi: status proof server yang sudah dijawab,
 * atau "menggantung" untuk keadaan checkProofServer() yang belum selesai.
 *
 * Diekspor supaya kedua berkas uji paritas dapat mengetik fungsi `atur`-nya
 * dengan tipe yang sama persis dengan yang dituntut rekamPrivasi(). Tanpa alias
 * ini, keduanya terpaksa memakai `as never` untuk menambal ketidakcocokan tipe
 * yang sebetulnya tidak perlu ada.
 */
export type StatusFixture = ProofServerStatus | "menggantung";

/**
 * Token kelas WAJIB dibaca lewat getAttribute("class"), bukan el.className.
 *
 * Pada elemen SVG — dan lucide-react merender SVG di hampir setiap kartu, badge,
 * dan tombol di halaman ini — `className` bukan string melainkan SVGAnimatedString,
 * sehingga `.split()` melempar. Ini bukan detail gaya: ikon membawa kelas
 * (`lucide`, `lucide-arrow-up-right`, dan pada satu tempat `muted-arrow` yang
 * dioper eksplisit di baris 259 garis dasar). Melewatkan SVG berarti melewatkan
 * justru bagian yang paling mudah hilang saat JSX dipindah.
 */
function tokenKelas(el: Element): string[] {
  const mentah = el.getAttribute("class");
  if (mentah === null) return [];
  return mentah.trim().split(/\s+/).filter(t => t !== "");
}

/**
 * Angka diratakan menjadi "#".
 *
 * `ballot.votes.toLocaleString()` menghasilkan "1,200" pada locale en-US dan
 * "1.200" pada de-DE. Tanpa perataan ini, rekaman garis dasar hanya sah di mesin
 * yang membuatnya. Yang tetap terjaga adalah yang memang penting di sini: spasi,
 * urutan kata, dan tanda baca — "# of # votes" tetap berbeda dari "#of # votes".
 */
export function normalkanTeks(teks: string): string {
  return teks
    .replace(/\d[\d.,\u00a0\u202f]*/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lapis keempat: SELURUH atribut selain `class`, terurut menurut nama.
 *
 * Tiga lapis pertama buta terhadap segala sesuatu yang bukan kelas, tag, atau
 * teks. Yang paling mahal di antaranya ada dua di berkas ini:
 *
 *   garis dasar 239  style={{ width: `${percentage}%` }}  → pindah ke BallotCard
 *   garis dasar 259  style={{ width: `${pct}%` }}         → pindah ke Results
 *
 * Keduanya lebar bar progres. Satu salah pindah dan bar-nya membeku tanpa satu
 * token kelas pun berubah — persis bentuk kegagalan yang rencana ini klaim tidak
 * mungkin lolos. Ikut terjaga di sini: title, aria-label, aria-modal,
 * aria-labelledby, role, placeholder, value, id, dan disabled.
 *
 * Nilainya TIDAK dinormalkan seperti teks. Tidak ada atribut di berkas ini yang
 * lahir dari toLocaleString(); persentase bar dihitung dengan aritmetika biasa,
 * dan satu-satunya `title` menyusun kalimatnya dari fixture plus location.host
 * yang dipatok di vitest.config.ts. Perbandingan apa adanya karena itu aman, dan
 * lebih menggigit daripada yang diratakan.
 */
function atributLain(el: Element): string {
  const pasangan = Array.from(el.attributes)
    .filter(a => a.name !== "class")
    .map(a => `${a.name}=${a.value}`)
    .sort();
  return pasangan.length === 0 ? "" : `[${pasangan.join("|")}]`;
}

export function capDari(akar: HTMLElement): Cap {
  const kelas = new Set<string>();
  const garisBesar: string[] = [];
  for (const el of Array.from(akar.querySelectorAll("*"))) {
    const token = tokenKelas(el);
    for (const t of token) kelas.add(t);
    let kedalaman = 0;
    for (let p = el.parentElement; p !== null && p !== akar; p = p.parentElement) kedalaman += 1;
    garisBesar.push(
      `${kedalaman}:${el.tagName.toLowerCase()}${token.map(t => `.${t}`).join("")}${atributLain(el)}`,
    );
  }
  return {
    // Array.from(kelas), bukan [...kelas]: `kelas` adalah Set<string>, dan
    // menyebarkannya lewat spread menuntut target ES2015+ atau flag
    // --downlevelIteration. tsconfig.json proyek ini tidak menyalakan
    // keduanya (default target lama), sehingga `pnpm check` menolaknya dengan
    // TS2802. Array.from() memakai jalur konversi yang sama tanpa menuntut
    // keduanya, dan hasilnya identik.
    kelas: Array.from(kelas).sort(),
    garisBesar,
    teks: normalkanTeks(akar.textContent ?? ""),
  };
}

export const STATUS_LOKAL: ProofServerStatus = {
  reachable: true,
  version: "8.1.0",
  target: "http://127.0.0.1:6300",
  targetTerverifikasi: true,
  reach: "lokal",
  hop: "browser → http://127.0.0.1:6300",
};

/**
 * Kelima cabang useMemo privasi di shell, ditambah keadaan "belum dijawab".
 *
 * Blok itu TIDAK dipindah ke mana pun di C-1 (lihat Jebakan 1 di rencana), dan
 * fixture ini yang membuktikannya: label, kelas, dan atribut title-nya harus
 * sama persis sebelum dan sesudah pemecahan. Seluruh teks di dalamnya adalah
 * klaim privasi yang mengikat, bukan salinan tampilan.
 */
export const FIXTURE_PRIVASI: Record<string, StatusFixture> = {
  menunggu: "menggantung",
  remote: {
    reachable: true,
    version: "8.1.0",
    target: "https://proof-server.preprod.midnight.network",
    targetTerverifikasi: true,
    reach: "remote",
    hop: "browser → https://proof-server.preprod.midnight.network",
  },
  "lewat-host-halaman": {
    reachable: true,
    version: "8.1.0",
    target: "http://127.0.0.1:6300",
    targetTerverifikasi: true,
    reach: "lewat-host-halaman",
    hop: "browser → votepriv.mdloglabs.org → http://127.0.0.1:6300 (loopback mesin itu, bukan perangkat Anda)",
  },
  mati: {
    reachable: false,
    error: "Failed to fetch",
    target: "http://127.0.0.1:6300",
    targetTerverifikasi: true,
    reach: "lokal",
    hop: "browser → http://127.0.0.1:6300",
  },
  "target-belum-terverifikasi": {
    reachable: true,
    version: "8.1.0",
    target: "http://127.0.0.1:6300",
    targetTerverifikasi: false,
    reach: "lokal",
    hop: "browser → http://127.0.0.1:6300",
  },
  lokal: STATUS_LOKAL,
};

export const KONEKSI_PALSU: WalletConnection = {
  address: "mn_shield-addr_test1qqxyzw9r4k2m7v0abcdefghijklmnopqrstu",
  networkId: "preview",
  connectorName: "Lace",
  apiVersion: "4.0.1",
  api: null,
};

/** Menunggu satu putaran microtask di dalam act, supaya efek async selesai. */
async function tenang(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Menjelajah permukaan Home dan mengecap setiap keadaan.
 *
 * Skrip yang sama persis dijalankan terhadap komponen beku dan komponen hidup.
 * Kalau satu selector gagal pada komponen hidup, itu sendiri sudah sinyal:
 * struktur yang dicarinya tidak lagi ada.
 *
 * TIGA BELAS permukaan, bukan dua belas. Nama dan urutannya dikunci sebagai
 * daftar literal di paritas-pra-pecah.test.tsx, supaya menambah permukaan kelak
 * terlihat sebagai perubahan yang disengaja — bukan sebagai angka yang perlu
 * ditambal. Kalau Anda menambah satu baris `hasil[...]` di bawah, daftar literal
 * itu HARUS ikut bertambah, dan ujinya memang akan merah sampai Anda melakukannya.
 */
export async function rekamPermukaan(Komponen: ComponentType): Promise<Record<string, Cap>> {
  const hasil: Record<string, Cap> = {};
  let container!: HTMLElement;
  await act(async () => {
    ({ container } = render(createElement(Komponen)));
  });
  const akar = () => container.querySelector<HTMLElement>(".app-shell")!;
  const teks = (t: string) => within(container).getByText(t);

  const kePanel = async (label: string) => {
    const nav = container.querySelector<HTMLElement>("nav")!;
    await act(async () => {
      fireEvent.click(within(nav).getByText(label));
    });
  };

  hasil["overview-terputus"] = capDari(akar());

  // Sambungkan wallet: membuka kelas `wallet-button connected`, teks
  // shortAddress(), dan label jaringan di topbar.
  await act(async () => {
    fireEvent.click(teks("Connect wallet"));
  });
  await tenang();
  hasil["overview-tersambung"] = capDari(akar());

  await kePanel("Live ballots");
  hasil["live-ballots"] = capDari(akar());

  // Keadaan kosong hanya lahir kalau filter tidak menemukan apa pun — satu-satunya
  // jalan menuju kelas `empty-state`.
  const cari = container.querySelector<HTMLInputElement>(".search-field input")!;
  await act(async () => {
    fireEvent.change(cari, { target: { value: "tidak-ada-ballot-begini" } });
  });
  hasil["live-ballots-kosong"] = capDari(akar());
  await act(async () => {
    fireEvent.change(cari, { target: { value: "" } });
  });

  await kePanel("Results");
  hasil["results-tanpa-tanda-terima"] = capDari(akar());

  await kePanel("Docs");
  hasil["docs"] = capDari(akar());

  await kePanel("Overview");
  await act(async () => {
    fireEvent.click(teks("Vote on featured ballot"));
  });
  hasil["vote-pilih"] = capDari(akar());

  await act(async () => {
    fireEvent.click(teks("Fund developer grants"));
  });
  hasil["vote-terpilih"] = capDari(akar());

  // Tahap proving muncul seketika; tahap success dijadwalkan 1350 ms, dan onVote
  // 1750 ms. Timer palsu supaya dua tahap terakhir dapat dicapai tanpa menunggu.
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(teks("Generate proof & vote"));
  });
  hasil["vote-proving"] = capDari(akar());
  await act(async () => {
    vi.advanceTimersByTime(1400);
  });
  hasil["vote-sukses"] = capDari(akar());
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  vi.useRealTimers();

  await act(async () => {
    fireEvent.click(teks("Back to dashboard"));
  });

  // Panel receipt di Results hanya ada setelah suara dikirim — cabang yang tidak
  // pernah terlihat kalau Results dicap sebelum vote.
  await kePanel("Results");
  hasil["results-dengan-tanda-terima"] = capDari(akar());

  await kePanel("Overview");
  await act(async () => {
    fireEvent.click(teks("Create ballot"));
  });
  hasil["create-ballot"] = capDari(akar());
  await act(async () => {
    fireEvent.click(teks("Cancel"));
  });

  // Sidebar mobile: kelas `mobile-open` dan `mobile-overlay visible` adalah dua
  // template literal yang tidak akan pernah terlihat pada render diam.
  await act(async () => {
    fireEvent.click(container.querySelector<HTMLElement>(".menu-button")!);
  });
  hasil["sidebar-mobile"] = capDari(akar());
  await act(async () => {
    fireEvent.click(container.querySelector<HTMLElement>(".mobile-close")!);
  });

  cleanup();
  return hasil;
}

/**
 * Mengecap panel privasi di sidebar untuk keenam fixture.
 *
 * `judul` (atribut title) sengaja TIDAK dinormalkan: ia adalah kalimat klaim
 * privasi, dan setiap kata di dalamnya harus sama persis. Angka di dalamnya
 * seluruhnya berasal dari fixture dan dari URL jsdom yang dipatok di
 * vitest.config.ts, sehingga deterministik apa adanya.
 */
export async function rekamPrivasi(
  Komponen: ComponentType,
  atur: (s: StatusFixture) => void,
): Promise<Record<string, CapPrivasi>> {
  const hasil: Record<string, CapPrivasi> = {};
  for (const [nama, fixture] of Object.entries(FIXTURE_PRIVASI)) {
    atur(fixture);
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(createElement(Komponen)));
    });
    await tenang();
    const panel = container.querySelector<HTMLElement>(".privacy-mode")!;
    const titik = container.querySelector<HTMLElement>(".sidebar-bottom .status-dot")!;
    hasil[nama] = {
      kelas: [...tokenKelas(panel), ...tokenKelas(titik)],
      label: panel.querySelector("strong")!.textContent ?? "",
      judul: panel.getAttribute("title") ?? "",
    };
    cleanup();
  }
  return hasil;
}

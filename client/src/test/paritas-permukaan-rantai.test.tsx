/**
 * Pengganti uji paritas warisan C-1 (dihapus di C-2a Task 1).
 *
 * BEDANYA, dan ini harus dibaca sebelum menaksir kekuatannya:
 *
 * Uji warisan membandingkan render terhadap garis dasar yang direkam dari
 * SALINAN BEKU kode pra-pemecahan. Nilai "sebelum"-nya adalah keluaran dari
 * mengeksekusi kode asli, dan karena itu ia bukti yang independen.
 *
 * Uji ini TIDAK dapat memiliki sifat itu, dan tidak berpura-pura memilikinya.
 * Yang independen di sini adalah DATANYA: fixture di client/src/test/fixture-rantai/
 * adalah bita yang benar-benar dikirim indexer, bukan nilai yang diturunkan dari
 * kode yang diuji. Waktu dinding ikut dibekukan bersamanya lewat meta.sekarangMs.
 *
 * Karena itu berkas ini memisahkan dua hal yang berbeda kekuatannya:
 *
 *   A. ASSERT YANG DITULIS TANGAN — label status, hitungan chip, persentase dari
 *      tallies jarang, nomor urut dari tinggi blok deploy, kalimat permukaan
 *      gagal. Nilainya diketik manusia dan dapat salah; itulah yang membuatnya
 *      bukti.
 *
 *   B. CAP EMPAT LAPIS atas sisanya — DETEKTOR PERUBAHAN, bukan bukti kebenaran.
 *      Ia menangkap kelas CSS yang hilang dan teks yang berubah tanpa sengaja.
 *      Ia TIDAK menyatakan apa pun tentang benar atau salah.
 *
 * PENYIMPANGAN SADAR dari task-8-brief.md, per praperiksa-task-8.md:
 *
 *   - P1: uji "JEBAKAN 1" brief tidak pernah membaca satu deadline pun, dan
 *     cabang else-nya menyatakan kesetaraan yang dibantah komponennya sendiri
 *     (closing-soon merender "Vote privately", bukan "View result"). Diganti
 *     di sini dengan perbandingan terhadap turunkanStatus/statusLabel/
 *     menerimaSuara SUNGGUHAN, dihitung dari ballot yang didekode + meta.sekarangMs
 *     — bukan dari asumsi dikotomi "Live now" vs selainnya.
 *   - P2: pct dalam uji "persentase hasil DITURUNKAN dari tallies JARANG" di
 *     bawah tetap memvalidasi pemadatan tallies jarang (itu tujuannya), TAPI
 *     TIDAK dapat membedakan penyebut tallied vs votes karena kebetulan fixture
 *     (voteCount === talliedCount === 3 pada satu-satunya ballot ber-hasil).
 *     Celah itu ditutup terpisah, dengan data tulisan tangan yang membuat
 *     keduanya BERBEDA, di Results.test.tsx — bukan di sini, karena fixture ini
 *     secara struktural tidak bisa menyediakan kasus itu.
 *   - P4: ditambahkan satu uji baru bahwa navigasi ke Docs tetap berfungsi
 *     ketika pembacaan rantai GAGAL — sebelumnya panel gagal digerbangi tanpa
 *     memandang section, sehingga tombol Docs tampak aktif tapi isinya tidak
 *     pernah berganti.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import Home from "@/pages/Home";

// path.resolve(process.cwd(), …), BUKAN `new URL(…, import.meta.url)`: berkas
// ini di-render lewat pool jsdom (environmentMatchGlobs memetakan *.test.tsx
// ke jsdom), dan di sana import.meta.url TIDAK selalu berskema file:// —
// mencoba membangun URL relatif darinya melempar "The URL must be of scheme
// file". `pnpm test`/`vitest run` selalu dijalankan dari akar repo (lihat
// package.json), jadi process.cwd() adalah dasar yang stabil di kedua pool.
const DIR = path.resolve(process.cwd(), "client/src/test/fixture-rantai");
const baca = (n: string) => JSON.parse(readFileSync(path.join(DIR, n), "utf8"));
const fxRegistry = baca("registry.json");
const fxBallots = baca("ballots.json");
const fxJaringan = baca("jaringan.json");
const meta = baca("meta.json");

vi.mock("@/lib/proof-server", async asli => {
  const m = await asli<typeof import("@/lib/proof-server")>();
  return { ...m, checkProofServer: () => new Promise(() => {}) };
});

function pasangFetch(mode: "sehat" | "mati" | "registry-hilang") {
  const palsu = vi.fn(async (_u: string, init: RequestInit) => {
    if (mode === "mati") throw new TypeError("Failed to fetch");
    const nama = /query\s+(\w+)/.exec(JSON.parse(String(init.body)).query)?.[1] ?? "?";
    if (mode === "registry-hilang" && nama === "Registry") {
      return new Response(JSON.stringify({ data: { r: null }, errors: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    const j = nama === "Registry" ? fxRegistry : nama === "Ballots" ? fxBallots.jawaban : fxJaringan;
    return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", palsu);
  return palsu;
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("A. Assert yang ditulis tangan — bukti kebenaran", () => {
  it("menampilkan keadaan MEMUAT lebih dulu, dan bukan keadaan kosong", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    expect(container.querySelectorAll("[aria-busy='true']").length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("No ballots found");
  });

  it("kegagalan indexer TIDAK terlihat seperti tidak ada ballot", async () => {
    pasangFetch("mati");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector("[role='alert']")).not.toBeNull());
    expect(container.textContent).toContain("Can't reach the indexer");
    expect(container.textContent).not.toContain("No ballots found");
  });

  it("registry yang tidak ditemukan menyebut alamat DAN jaringan", async () => {
    pasangFetch("registry-hilang");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector("[role='alert']")).not.toBeNull());
    expect(container.textContent).toContain("Registry not found on this network");
    expect(container.textContent).toContain(meta.jaringan);
  });

  it("P4: Docs tetap terjangkau ketika pembacaan rantai GAGAL — panel gagal tidak menelan section lain", async () => {
    // Sebelum perbaikan ini, cabang `data.fase === "gagal"` dirender tanpa
    // memandang `section` sama sekali: tombol Docs di sidebar berubah .active
    // tapi isi halaman tidak pernah berganti dari panel gagal. Docs.tsx adalah
    // halaman statis yang tidak menyentuh data rantai — ia justru satu-satunya
    // halaman yang menjelaskan model privasi, dan seharusnya paling mudah
    // dijangkau ketika indexer sedang bermasalah, bukan sebaliknya.
    pasangFetch("mati");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector("[role='alert']")).not.toBeNull());
    const tombolDocs = Array.from(container.querySelectorAll("nav button")).find(b =>
      (b.textContent ?? "").includes("Docs"),
    ) as HTMLButtonElement;
    await act(async () => { tombolDocs.click(); });
    expect(container.querySelector(".docs-page")).not.toBeNull();
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("JEBAKAN 1 (diperbaiki, P1): badge status dan tombol memakai turunkanStatus/menerimaSuara SUNGGUHAN — dibandingkan terhadap meta.sekarangMs, bukan diasumsikan", async () => {
    // Praperiksa P1: versi brief tidak pernah membaca voteDeadlineMs maupun
    // meta.sekarangMs, dan cabang else-nya ("bila bukan Live now, harus View
    // result") dibantah oleh statusnya sendiri — ballot closing-soon merender
    // "Vote privately", bukan "View result". Uji ini menghitung status yang
    // BENAR untuk setiap ballot terekam, lalu memverifikasi kartu merender
    // label DAN tombol yang cocok dengan status turunan itu — apa pun nilainya.
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));

    const { dekodeBallot } = await import("@/lib/chain/dekode");
    const { turunkanStatus, statusLabel, menerimaSuara } = await import(
      "@/components/votepriv/ballot-status"
    );
    const per = fxBallots.alamat.map((a: string, i: number) => dekodeBallot(fxBallots.jawaban.data[`b${i}`].state, a));
    expect(per.length).toBeGreaterThan(0);

    const kartu = Array.from(container.querySelectorAll(".ballot-card"));
    expect(kartu).toHaveLength(per.length);

    for (const k of per) {
      const status = turunkanStatus(
        { phase: k.phase, voteDeadlineMs: k.voteDeadlineDetik * 1000, tallyDeadlineMs: k.tallyDeadlineDetik * 1000 },
        meta.sekarangMs,
      );
      const label = statusLabel(status);
      const punyaKartu = kartu.find(el => (el.textContent ?? "").includes(k.title));
      expect(punyaKartu, `tidak ada kartu untuk "${k.title}"`).toBeDefined();
      expect(punyaKartu!.textContent).toContain(label);
      // Tombolnya harus cocok dengan menerimaSuara — BUKAN dengan apakah label
      // kebetulan berbunyi "Live now". Ini persis dikotomi palsu yang P1 tandai.
      expect(punyaKartu!.textContent).toContain(menerimaSuara(status) ? "Vote privately" : "View result");
    }
  });

  it("JEBAKAN 2: nomor 001 melekat pada ballot dengan blok deploy TERENDAH, bukan pada yang pertama di registry", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));

    // Nilai pembanding DITURUNKAN dari fixture, bukan diketik: judul ballot
    // ber-deploy terendah dibaca lewat dekoder yang sama dengan yang dipakai
    // aplikasi, sehingga uji ini tetap benar bila fixture direkam ulang.
    const { dekodeBallot } = await import("@/lib/chain/dekode");
    const per = fxBallots.alamat.map((a: string, i: number) => ({
      alamat: a,
      indeksRegistry: i,
      deployHeight: fxBallots.jawaban.data[`b${i}`].deploy[0].transaction.block.height as number,
      judul: dekodeBallot(fxBallots.jawaban.data[`b${i}`].state, a).title,
    }));
    const terendah = [...per].sort((x, y) => x.deployHeight - y.deployHeight)[0];

    // Kartu yang membawa teks "Ballot 001" harus memuat judul itu.
    const kartu001 = Array.from(container.querySelectorAll(".ballot-card")).find(k =>
      (k.textContent ?? "").includes("Ballot 001"),
    );
    expect(kartu001, "tidak ada kartu ber-nomor 001").toBeDefined();
    expect(kartu001!.textContent).toContain(terendah.judul);

    // Dan inilah yang membedakan uji ini dari uji yang tidak menggigit: bila
    // fixture memuat lebih dari satu ballot, ballot ber-deploy terendah BUKAN
    // yang pertama di registry (List memakai pushFront, terbaru di depan).
    if (per.length > 1) {
      expect(terendah.indeksRegistry).not.toBe(0);
    }
  });

  it("chip filter memakai KELIMA teks yang benar, dalam urutan yang benar", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));
    // Navigasi ke Live ballots dilakukan lewat sidebar, bukan lewat state internal.
    const nav = Array.from(container.querySelectorAll("nav button")).find(b =>
      (b.textContent ?? "").includes("Live ballots"),
    ) as HTMLButtonElement;
    await act(async () => { nav.click(); });
    await waitFor(() => expect(container.querySelectorAll(".filter-chip").length).toBe(5));

    // KELIMA teksnya ditulis tangan dan diassert apa adanya.
    const chip = Array.from(container.querySelectorAll(".filter-chip")).map(e => e.textContent ?? "");
    const label = chip.map(c => c.replace(/\s*\d[\d,]*\s*$/, "").trim());
    expect(label).toEqual(["All", "Open", "Tally", "Needs finalizing", "Finalized"]);

    // Setiap chip menampilkan angkanya, termasuk yang bernilai nol.
    for (const c of chip) expect(c).toMatch(/\d/);
    // Dan jumlah keempat chip status sama dengan "All": setiap ballot masuk
    // tepat satu ember. Diturunkan dari yang dirender, bukan diketik.
    const angka = chip.map(c => Number((c.match(/(\d[\d,]*)\s*$/)?.[1] ?? "0").replace(/,/g, "")));
    expect(angka[1] + angka[2] + angka[3] + angka[4]).toBe(angka[0]);
  });

  it("persentase hasil DITURUNKAN dari tallies JARANG, bukan dari indeks baris", async () => {
    // Janji Task 1 yang kedua. Lihat catatan P2 di kepala berkas: uji ini
    // memvalidasi PEMADATAN tallies jarang (padatkanTallies), bukan pilihan
    // penyebut (tallied vs votes) — fixture ini kebetulan punya voteCount ===
    // talliedCount pada satu-satunya ballot ber-hasil, jadi keduanya tidak
    // dapat dibedakan DI SINI. Celah itu ditutup di Results.test.tsx.
    const { padatkanTallies } = await import("@/lib/chain/dekode");
    const { dekodeBallot } = await import("@/lib/chain/dekode");

    const berhasil = fxBallots.alamat
      .map((a: string, i: number) => ({ a, k: dekodeBallot(fxBallots.jawaban.data[`b${i}`].state, a) }))
      .filter(({ k }: any) => k.talliedCount > 0);
    expect(berhasil.length, "fixture tidak memuat satu pun ballot dengan suara terbuka — rekam ulang").toBeGreaterThan(0);

    const { k } = berhasil[0];
    const padat = padatkanTallies(k.tallies, k.optionCount);
    const pct = Math.round((Math.max(...padat) / k.talliedCount) * 100);

    expect(k.tallies.length).toBeLessThan(k.optionCount);
    expect(padat).toHaveLength(k.optionCount);

    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));
    const nav = Array.from(container.querySelectorAll("nav button")).find(b =>
      (b.textContent ?? "").includes("Results"),
    ) as HTMLButtonElement;
    await act(async () => { nav.click(); });
    await waitFor(() => expect(container.querySelectorAll(".result-row").length).toBeGreaterThan(0));

    const baris = Array.from(container.querySelectorAll(".result-row")).find(r =>
      (r.textContent ?? "").includes(k.title),
    );
    expect(baris, `tidak ada baris hasil untuk "${k.title}"`).toBeDefined();
    expect(baris!.textContent).toContain(`${pct}%`);
  });

  it("JEBAKAN 4: hasil yang tidak ada TIDAK berbunyi tersegel ketika deadline sudah lewat", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));
    const nav = Array.from(container.querySelectorAll("nav button")).find(b =>
      (b.textContent ?? "").includes("Results"),
    ) as HTMLButtonElement;
    await act(async () => { nav.click(); });
    await waitFor(() => expect(container.querySelectorAll(".result-row").length).toBeGreaterThan(0));

    for (const baris of Array.from(container.querySelectorAll(".result-row"))) {
      const teks = baris.textContent ?? "";
      if (teks.includes("stay sealed until")) {
        expect(teks).toMatch(/Live now|Closing soon/);
      }
    }
  });

  it("Recent activity menampilkan SELISIH ledger, bukan sekadar nama entry point", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".activity-item").length).toBeGreaterThan(0));
    const teks = container.querySelector(".activity-list")!.textContent ?? "";
    expect(teks).toMatch(/(sealed votes|opened votes|registered ballots|registered voters|phase) \d+ → \d+/);
    expect(teks).not.toContain("Demo data");
  });

  it("kuorum disebut sebagai NIAT, bukan sebagai ambang", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));
    expect(container.textContent).toContain("intended quorum");
  });

  it("kartu network status memakai tinggi blok nyata dan TIDAK mengarang angka finality", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.textContent).toContain("Last block"));
    expect(container.textContent).toContain(fxJaringan.data.block.height.toLocaleString());
    expect(container.textContent).not.toMatch(/finality/i);
  });

  it("menyebut jaringan yang BENAR-BENAR dibaca, bukan kata umum testnet — di TOPBAR maupun SIDEBAR-FOOTER", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));
    expect(container.querySelector(".network-status")!.textContent).toContain(meta.jaringan);
    // Kata ketiga (praperiksa P5): .sidebar-footer punya kalimatnya sendiri,
    // terpisah dari .network-status, dan tidak satu uji pun sebelumnya
    // menyentuhnya — ditemukan lewat mutation testing.
    expect(container.querySelector(".sidebar-footer")!.textContent).toContain(meta.jaringan);
    expect(container.textContent).not.toMatch(/Midnight testnet/);
    expect(container.querySelector(".sidebar-footer")!.textContent).not.toMatch(/testnet/i);
  });

  it("TIDAK mengklaim lapis bukti yang C-2a tidak punya", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));
    expect(container.textContent).not.toMatch(/live proof layer/i);
  });

  it("tidak ada lagi teks Demo data DI MANA PUN, di keempat section", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));

    const nav = Array.from(container.querySelectorAll("nav button")) as HTMLButtonElement[];
    for (const section of ["Overview", "Live ballots", "Results", "Docs"]) {
      const tombol = nav.find(b => (b.textContent ?? "").includes(section))!;
      await act(async () => { tombol.click(); });
      const teks = container.textContent ?? "";
      expect(teks, `"demo data" masih muncul di section ${section}`).not.toMatch(/demo\s+data/i);
      expect(teks, `"Not yet read from the chain" masih muncul di ${section}`).not.toMatch(/not yet read from the chain/i);
    }
  });

  it("modal vote menyebut eligibilityPolicy, bukan hanya kartunya", async () => {
    // Spec 9.4 menuntut keduanya: "tampil di kartu ballot DAN modal vote".
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));

    const { dekodeBallot } = await import("@/lib/chain/dekode");
    const kebijakan = dekodeBallot(fxBallots.jawaban.data.b0.state, fxBallots.alamat[0]).eligibilityPolicy;
    expect(kebijakan.length, "fixture tidak punya eligibilityPolicy untuk diuji").toBeGreaterThan(0);

    const tombol = Array.from(container.querySelectorAll(".ballot-card .text-button"))[0] as HTMLButtonElement;
    await act(async () => { tombol.click(); });
    await waitFor(() => expect(container.querySelector(".vote-modal")).not.toBeNull());
    expect(container.querySelector(".vote-modal")!.textContent).toContain(kebijakan);
  });
});

describe("B. Himpunan kelas CSS — DETEKTOR PERUBAHAN, bukan bukti kebenaran", () => {
  it("menjaga himpunan kelas CSS pada permukaan siap tetap berada di dalam index.css", async () => {
    pasangFetch("sehat");
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelectorAll(".ballot-card:not([aria-busy='true'])").length).toBeGreaterThan(0));
    const css = readFileSync(path.resolve(process.cwd(), "client/src/index.css"), "utf8");
    const dipakai = new Set<string>();
    for (const el of Array.from(container.querySelectorAll("*"))) {
      for (const t of (el.getAttribute("class") ?? "").split(/\s+/)) if (t) dipakai.add(t);
    }

    /**
     * Token kelas yang SENGAJA tidak punya aturan sendiri di index.css.
     * Setiap entri wajib punya alasan; daftar tanpa alasan adalah daftar yang
     * tumbuh sampai assert-nya tidak menjaga apa pun.
     *
     *  - `lucide*`   : milik lucide-react, bukan desain halaman ini.
     *  - `sr-only`   : utilitas Tailwind.
     *  - `accent-mint`: DIPERIKSA — index.css hanya punya `.accent-violet:before`
     *    dan `.accent-blue:before`. Mint bukan kelas; ia GAYA BAWAAN
     *    `.ballot-card:before`, yang memakai `background: var(--mint)`.
     */
    const abai = new Set(["sr-only", "accent-mint"]);
    const hilang = [...dipakai].filter(
      t => !/^lucide/.test(t) && !abai.has(t) && !css.includes(`.${t}`),
    );
    // C-2a berjanji TIDAK menambah satu baris CSS pun. Assert ini yang menjaganya.
    expect(hilang).toEqual([]);

    // Dan penjaga terhadap daftar abai yang membusuk: kalau suatu saat
    // .accent-mint BENAR-BENAR ditambahkan ke index.css, baris ini memerah dan
    // memaksa alasannya dibaca ulang alih-alih dibiarkan menumpuk.
    expect(css.includes(".accent-mint")).toBe(false);
  });
});

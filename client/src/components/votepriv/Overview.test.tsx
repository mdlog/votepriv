import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Overview, aktivitasTerbaru, detailAksi, labelAksi, toneAksi } from "./Overview";
import { ballotUji } from "@/test/fixture-ballot";
import type { AksiTerbaca, BallotTerbaca, HasilRantai } from "@/lib/chain";

afterEach(() => cleanup());

/** HasilRantai minimal untuk merender Overview tanpa menyentuh jaringan. */
function hasilUji(ubah: Partial<HasilRantai> = {}): HasilRantai {
  return {
    jaringan: {
      networkId: "preview",
      indexer: "https://indexer.contoh.test/api/v3/graphql",
      indexerWS: "",
      alamatRegistry: "b9d127d83f1436488e2cc808d9732d51f4f5befe2711362c7d669759db2a298a",
    },
    registry: { count: 0, alamat: [], aksi: [] },
    ballot: [],
    gagal: [],
    blok: { height: 817_778, timestampMs: 1_789_124_322_000 },
    epoch: { epochNo: 993_958, durationSeconds: 1800, elapsedSeconds: 1737 },
    sekarangMs: 1_789_124_322_000,
    ...ubah,
  };
}

function aksiUji(ubah: Partial<AksiTerbaca> = {}): AksiTerbaca {
  return {
    jenis: "ContractCall",
    entryPoint: "castVote",
    txHash: "tx-1",
    height: 100,
    timestampMs: 1_789_124_000_000,
    sumber: "Q4 Community Treasury",
    perubahan: [],
    pendahuluTerbaca: true,
    cuplikanTerbaca: true,
    ...ubah,
  };
}

describe("Overview pada registry KOSONG", () => {
  it("TIDAK crash ketika tidak ada satu ballot pun", () => {
    // Sebelum gerbang ini, ballots[0] bernilai undefined dan baris berikutnya
    // membaca featured.votes. Uji ini gagal dengan TypeError, bukan dengan
    // assert — dan itulah bentuk kegagalan yang ingin dicegah.
    expect(() =>
      render(
        <Overview hasil={hasilUji()} ballots={[]} onVote={() => {}} onCreate={() => {}} onSection={() => {}} />,
      ),
    ).not.toThrow();
  });

  it("merender permukaan kosong yang menyebut pembacaan BERHASIL", () => {
    const { container } = render(
      <Overview hasil={hasilUji()} ballots={[]} onVote={() => {}} onCreate={() => {}} onSection={() => {}} />,
    );
    expect(container.querySelector(".empty-state")).not.toBeNull();
    expect(container.textContent).toContain("The registry is empty");
    // Registry kosong BUKAN kegagalan: kalimatnya wajib menyebut bahwa
    // pembacaannya berhasil, kalau tidak ia tidak dapat dibedakan dari indexer
    // yang mati — larangan paling keras di rencana ini.
    expect(container.textContent).toMatch(/read successfully/i);
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("tidak menawarkan ballot unggulan yang tidak ada", () => {
    const { container } = render(
      <Overview hasil={hasilUji()} ballots={[]} onVote={() => {}} onCreate={() => {}} onSection={() => {}} />,
    );
    expect(container.textContent).not.toContain("Vote on featured ballot");
    expect(container.querySelectorAll(".ballot-card")).toHaveLength(0);
  });

  it("tetap merender ballot unggulan ketika registry TIDAK kosong", () => {
    // Penjaga terhadap gerbang yang terlalu rakus: kalau cabang kosong pernah
    // ikut menelan kasus normal, seluruh Overview hilang tanpa satu uji memerah.
    const { container } = render(
      <Overview
        hasil={hasilUji({ registry: { count: 1, alamat: ["aa"], aksi: [] } })}
        ballots={[ballotUji()]}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    expect(container.querySelector(".empty-state")).toBeNull();
    expect(container.querySelectorAll(".ballot-card").length).toBeGreaterThan(0);
  });
});

describe("Overview — metrik 'Open for voting'", () => {
  it("dihitung dari menerimaSuara (status turunan), bukan dari phase", () => {
    const ballots = [
      ballotUji({ id: "a", status: "live", phase: 1 }), // phase menyesatkan bila dipakai
      ballotUji({ id: "b", status: "closing-soon" }),
      ballotUji({ id: "c", status: "tally-open" }),
      ballotUji({ id: "d", status: "finalized" }),
    ];
    const { container } = render(
      <Overview
        hasil={hasilUji({ registry: { count: 4, alamat: ["a", "b", "c", "d"], aksi: [] } })}
        ballots={ballots}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    const metric = Array.from(container.querySelectorAll(".metric-card"))[0];
    expect(metric.querySelector("span")!.textContent).toBe("Open for voting");
    expect(metric.querySelector("strong")!.textContent).toBe("2");
    expect(metric.querySelector("small")!.textContent).toBe("of 4 on the registry");
  });
});

describe("Overview — network status", () => {
  it("menampilkan posisi epoch ketika epoch tersedia", () => {
    const { container } = render(
      <Overview
        hasil={hasilUji({ registry: { count: 1, alamat: ["a"], aksi: [] }, epoch: { epochNo: 5, durationSeconds: 1800, elapsedSeconds: 900 } })}
        ballots={[ballotUji()]}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    expect(container.textContent).toContain("epoch 5, 900s of 1800s");
    expect(container.textContent).not.toMatch(/finality/i);
  });

  it("menahan klaim epoch ketika epoch null, TANPA mengarang angka finality", () => {
    const { container } = render(
      <Overview
        hasil={hasilUji({ registry: { count: 1, alamat: ["a"], aksi: [] }, epoch: null })}
        ballots={[ballotUji()]}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    expect(container.textContent).toContain("epoch position unavailable");
    expect(container.textContent).not.toMatch(/finality/i);
  });
});

describe("labelAksi", () => {
  it("memetakan setiap entryPoint yang dikenal ke judul manusia", () => {
    expect(labelAksi(aksiUji({ jenis: "ContractDeploy", entryPoint: null }))).toBe("Contract deployed");
    expect(labelAksi(aksiUji({ jenis: "ContractUpdate", entryPoint: null }))).toBe("Contract updated");
    expect(labelAksi(aksiUji({ jenis: "ContractCall", entryPoint: "castVote" }))).toBe("Vote sealed");
    expect(labelAksi(aksiUji({ jenis: "ContractCall", entryPoint: "tallyVote" }))).toBe("Vote opened");
    expect(labelAksi(aksiUji({ jenis: "ContractCall", entryPoint: "registerVoters" }))).toBe("Voters registered");
    expect(labelAksi(aksiUji({ jenis: "ContractCall", entryPoint: "finalize" }))).toBe("Ballot finalized");
    expect(labelAksi(aksiUji({ jenis: "ContractCall", entryPoint: "register" }))).toBe("Ballot registered");
    expect(labelAksi(aksiUji({ jenis: "ContractCall", entryPoint: "entryPointAsing" }))).toBe("entryPointAsing");
  });
});

describe("detailAksi", () => {
  it("menampilkan selisih ledger ketika ada perubahan", () => {
    const a = aksiUji({ perubahan: [{ bidang: "voteCount", dari: 2, ke: 3 }] });
    expect(detailAksi(a)).toBe("sealed votes 2 → 3");
  });

  it("menggabungkan lebih dari satu perubahan dengan titik tengah", () => {
    const a = aksiUji({
      perubahan: [
        { bidang: "talliedCount", dari: 0, ke: 1 },
        { bidang: "phase", dari: 0, ke: 1 },
      ],
    });
    expect(detailAksi(a)).toBe("opened votes 0 → 1 · phase 0 → 1");
  });

  it("mengaku TIDAK TAHU ketika pendahulu di luar jendela — bukan 'no ledger change'", () => {
    const a = aksiUji({ perubahan: [], pendahuluTerbaca: false, cuplikanTerbaca: true });
    expect(detailAksi(a)).toBe("earlier state not read");
  });

  it("mengaku ledger tidak terbaca ketika cuplikan aksi ini sendiri gagal didekode", () => {
    const a = aksiUji({ perubahan: [], cuplikanTerbaca: false, pendahuluTerbaca: false });
    expect(detailAksi(a)).toBe("ledger state could not be read");
  });

  it("mengatakan 'no ledger change' HANYA ketika pendahulu terbaca dan tidak ada selisih", () => {
    const a = aksiUji({ perubahan: [], cuplikanTerbaca: true, pendahuluTerbaca: true });
    expect(detailAksi(a)).toBe("no ledger change");
  });
});

describe("toneAksi", () => {
  it("blue ketika ada perubahan talliedCount atau phase", () => {
    expect(toneAksi(aksiUji({ perubahan: [{ bidang: "talliedCount", dari: 0, ke: 1 }] }))).toBe("blue");
    expect(toneAksi(aksiUji({ perubahan: [{ bidang: "phase", dari: 0, ke: 1 }] }))).toBe("blue");
  });

  it("mint ketika hanya voteCount yang berubah", () => {
    expect(toneAksi(aksiUji({ perubahan: [{ bidang: "voteCount", dari: 0, ke: 1 }] }))).toBe("mint");
  });

  it("violet pada sisanya (mis. registeredCount, count, atau tanpa perubahan)", () => {
    expect(toneAksi(aksiUji({ perubahan: [{ bidang: "registeredCount", dari: 0, ke: 1 }] }))).toBe("violet");
    expect(toneAksi(aksiUji({ perubahan: [] }))).toBe("violet");
  });
});

describe("aktivitasTerbaru", () => {
  it("menggabungkan aksi registry dan ballot, terurut MENURUN menurut height, dipotong pada batas", () => {
    const hasil = hasilUji({
      registry: { count: 1, alamat: ["a"], aksi: [aksiUji({ txHash: "r1", height: 10 })] },
      ballot: [
        {
          alamat: "a",
          keadaan: {} as unknown as BallotTerbaca["keadaan"],
          deployHeight: 1,
          aksi: [aksiUji({ txHash: "b1", height: 30 }), aksiUji({ txHash: "b2", height: 20 })],
        },
      ],
    });
    const hasilnya = aktivitasTerbaru(hasil, 2);
    expect(hasilnya.map(a => a.txHash)).toEqual(["b1", "b2"]);
  });

  it("mengembalikan larik kosong ketika tidak ada satu aksi pun", () => {
    expect(aktivitasTerbaru(hasilUji())).toEqual([]);
  });
});

describe("Overview — Recent activity", () => {
  it("merender panel 'no contract activity read' ketika aktivitasTerbaru kosong", () => {
    const { container } = render(
      <Overview
        hasil={hasilUji({ registry: { count: 1, alamat: ["a"], aksi: [] } })}
        ballots={[ballotUji()]}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    expect(container.textContent).toContain("No contract activity read");
  });

  it("merender selisih ledger sungguhan dan centang HANYA saat cuplikan terbaca", () => {
    const aksi = aksiUji({
      txHash: "abc",
      height: 42,
      perubahan: [{ bidang: "voteCount", dari: 2, ke: 3 }],
      cuplikanTerbaca: true,
    });
    const { container } = render(
      <Overview
        hasil={hasilUji({ registry: { count: 1, alamat: ["a"], aksi: [aksi] } })}
        ballots={[ballotUji()]}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    expect(container.textContent).toContain("sealed votes 2 → 3");
    expect(container.querySelector(".activity-check")).not.toBeNull();
  });

  it("memilih ikon dari JENIS/entryPoint aksi — Plus untuk deploy, chart untuk tallyVote/finalize, shield untuk sisanya", () => {
    // Ditemukan lewat mutation testing: sebelum uji ini ditambahkan, menukar
    // kondisi `a.jenis === "ContractDeploy"` menjadi `"ContractUpdate"` di
    // sini lolos HIJAU — tidak ada uji yang membedakan ikon SVG yang dipilih.
    const deploy = aksiUji({ jenis: "ContractDeploy", entryPoint: null, txHash: "d1", height: 1 });
    const tally = aksiUji({ jenis: "ContractCall", entryPoint: "tallyVote", txHash: "d2", height: 2 });
    const lain = aksiUji({ jenis: "ContractCall", entryPoint: "castVote", txHash: "d3", height: 3 });
    const { container } = render(
      <Overview
        hasil={hasilUji({ registry: { count: 1, alamat: ["a"], aksi: [deploy, tally, lain] } })}
        ballots={[ballotUji()]}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    const item = Array.from(container.querySelectorAll(".activity-item"));
    // aktivitasTerbaru default batas=3, dan mengurutkan height MENURUN:
    // lain(3), tally(2), deploy(1).
    expect(item).toHaveLength(3);
    expect(item[0].querySelector("svg")!.getAttribute("class")).toContain("lucide-shield-check");
    expect(item[1].querySelector("svg")!.getAttribute("class")).toContain("lucide-chart-column");
    expect(item[2].querySelector("svg")!.getAttribute("class")).toContain("lucide-plus");
  });

  it("TIDAK memberi centang saat cuplikan aksi tidak terbaca", () => {
    const aksi = aksiUji({ txHash: "abc", height: 42, perubahan: [], cuplikanTerbaca: false, pendahuluTerbaca: false });
    const { container } = render(
      <Overview
        hasil={hasilUji({ registry: { count: 1, alamat: ["a"], aksi: [aksi] } })}
        ballots={[ballotUji()]}
        onVote={() => {}}
        onCreate={() => {}}
        onSection={() => {}}
      />,
    );
    expect(container.querySelector(".activity-check")).toBeNull();
  });
});

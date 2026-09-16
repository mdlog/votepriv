import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { Logger } from "pino";
import { describe, expect, it } from "vitest";
import type { BallotC } from "./kontrak.ts";
import {
  bentukFieldCredentials,
  daftarkanVoterJikaPerlu,
  eligibleCountDariEnv,
  modeDeployUlangAktif,
  modeTanpaPendaftaranAktif,
  siapkanPemilihAwal,
  kebijakanEligibility,
} from "./pendaftaran-awal.ts";

// Logger palsu: pola sama dengan deploy.test.ts — uji ini tidak boleh menulis ke berkas log.
const logPalsu = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;

describe("modeTanpaPendaftaranAktif", () => {
  it('true HANYA ketika env persis "1"', () => {
    expect(modeTanpaPendaftaranAktif({ VOTEPRIV_TANPA_PENDAFTARAN: "1" })).toBe(true);
  });

  it.each([undefined, "true", "yes", "0", " 1", "1 "])("false untuk nilai lain (%s)", (nilai) => {
    expect(modeTanpaPendaftaranAktif({ VOTEPRIV_TANPA_PENDAFTARAN: nilai })).toBe(false);
  });

  it("false ketika env tidak disetel sama sekali", () => {
    expect(modeTanpaPendaftaranAktif({})).toBe(false);
  });
});

describe("eligibleCountDariEnv", () => {
  it("bawaan 3 ketika VOTEPRIV_ELIGIBLE_COUNT tidak disetel", () => {
    expect(eligibleCountDariEnv({})).toBe(3);
  });

  it("bawaan 3 ketika VOTEPRIV_ELIGIBLE_COUNT string kosong", () => {
    expect(eligibleCountDariEnv({ VOTEPRIV_ELIGIBLE_COUNT: "  " })).toBe(3);
  });

  it("memakai nilai dari env ketika berupa bilangan bulat", () => {
    expect(eligibleCountDariEnv({ VOTEPRIV_ELIGIBLE_COUNT: "50" })).toBe(50);
  });

  it("menolak nilai yang bukan bilangan bulat", () => {
    expect(() => eligibleCountDariEnv({ VOTEPRIV_ELIGIBLE_COUNT: "abc" })).toThrow(/bilangan bulat/);
    expect(() => eligibleCountDariEnv({ VOTEPRIV_ELIGIBLE_COUNT: "3.5" })).toThrow(/bilangan bulat/);
  });
});

describe("siapkanPemilihAwal", () => {
  it("tanpaPendaftaran: TIDAK membuat credential sama sekali, daun kosong", () => {
    let panggilanBuat = 0;
    let panggilanDaun = 0;
    const hasil = siapkanPemilihAwal(
      true,
      3,
      () => {
        panggilanBuat += 1;
        return new Uint8Array(32);
      },
      () => {
        panggilanDaun += 1;
        return new Uint8Array(32);
      },
    );

    expect(hasil).toEqual({ daun: [] });
    expect("credentials" in hasil).toBe(false);
    expect(panggilanBuat).toBe(0);
    expect(panggilanDaun).toBe(0);
  });

  it("bukan tanpaPendaftaran: membuat persis jumlahEligible credential dan daunnya", () => {
    const kredensialDibuat: Uint8Array[] = [];
    let penghitung = 0;
    const buatCredentialFn = () => {
      const c = new Uint8Array(32).fill(penghitung);
      penghitung += 1;
      kredensialDibuat.push(c);
      return c;
    };
    const daunEligibilityFn = (c: Uint8Array) => new Uint8Array(32).fill(c[0] + 100);

    const hasil = siapkanPemilihAwal(false, 4, buatCredentialFn, daunEligibilityFn);

    expect(hasil.credentials).toHaveLength(4);
    expect(hasil.daun).toHaveLength(4);
    expect(hasil.credentials).toEqual(kredensialDibuat);
    expect(hasil.daun.map((d) => d[0])).toEqual([100, 101, 102, 103]);
  });
});

describe("bentukFieldCredentials", () => {
  it("TIDAK ADA field credentials sama sekali ketika argumennya undefined", () => {
    const hasil = bentukFieldCredentials(undefined);
    expect(hasil).toEqual({});
    expect("credentials" in hasil).toBe(false);
  });

  it("berisi hex tiap credential ketika argumennya array", () => {
    const c1 = new Uint8Array(32).fill(0xaa);
    const c2 = new Uint8Array(32).fill(0xbb);
    expect(bentukFieldCredentials([c1, c2])).toEqual({
      credentials: [Buffer.from(c1).toString("hex"), Buffer.from(c2).toString("hex")],
    });
  });

  it("array kosong tetap menghasilkan field credentials (array kosong, BUKAN dihilangkan)", () => {
    expect(bentukFieldCredentials([])).toEqual({ credentials: [] });
  });
});

describe("daftarkanVoterJikaPerlu", () => {
  const ballotPalsu = {} as unknown as FoundContract<BallotC>;
  const daun = [new Uint8Array(32).fill(1)];

  // Ini uji perilaku untuk syarat rencana: "daftarkanVoter TIDAK dipanggil" pada mode VOTEPRIV_TANPA_PENDAFTARAN=1.
  it("tanpaPendaftaran: daftarkanVoterFn TIDAK PERNAH dipanggil", async () => {
    let panggilan = 0;
    await daftarkanVoterJikaPerlu(true, ballotPalsu, daun, logPalsu, {}, async () => {
      panggilan += 1;
    });
    expect(panggilan).toBe(0);
  });

  it("bukan tanpaPendaftaran: daftarkanVoterFn dipanggil TEPAT SEKALI dengan argumen yang benar", async () => {
    const panggilan: Array<{ ballot: unknown; daun: readonly Uint8Array[]; opsi: unknown }> = [];
    const opsi = { alamatBallot: "b".repeat(64) };
    await daftarkanVoterJikaPerlu(false, ballotPalsu, daun, logPalsu, opsi, async (b, d, _log, o) => {
      panggilan.push({ ballot: b, daun: d, opsi: o });
    });

    expect(panggilan).toHaveLength(1);
    expect(panggilan[0].ballot).toBe(ballotPalsu);
    expect(panggilan[0].daun).toBe(daun);
    expect(panggilan[0].opsi).toBe(opsi);
  });
});

describe("kebijakanEligibility", () => {
  it("mode credential CLI: kalimat tetap, URL inbox diabaikan", () => {
    expect(kebijakanEligibility(false, "https://x.example/register")).toBe("Three test credentials issued by the organiser.");
  });

  it("tanpa pendaftaran, tanpa inbox: kalimat pendaftaran mandiri lama", () => {
    expect(kebijakanEligibility(true, undefined)).toBe(
      "Voters register their own credential leaf; the organiser only ever holds the hash.",
    );
    expect(kebijakanEligibility(true, "   ")).toMatch(/^Voters register their own credential leaf/);
  });

  it("tanpa pendaftaran + inbox https: URL ditulis apa adanya di kalimat kebijakan (masuk rantai)", () => {
    const k = kebijakanEligibility(true, " https://votepriv.mdloglabs.org/register ");
    expect(k).toBe(
      "Open registration until the vote deadline: the app sends only your public leaf to https://votepriv.mdloglabs.org/register and the organiser registers it on-chain; the organiser only ever holds the hash.",
    );
  });

  it("http://localhost diterima untuk pengembangan; http host lain dan teks non-URL ditolak", () => {
    expect(kebijakanEligibility(true, "http://localhost:5390/register")).toContain("http://localhost:5390/register");
    expect(() => kebijakanEligibility(true, "http://inbox.example/register")).toThrow(/harus URL https/);
    expect(() => kebijakanEligibility(true, "kirim ke saya")).toThrow(/harus URL https/);
  });
});

describe("nama env publik (Inggris) dan alias lamanya", () => {
  it("VOTEPRIV_SELF_REGISTRATION=1 dan VOTEPRIV_TANPA_PENDAFTARAN=1 sama-sama mengaktifkan mode tanpa pendaftaran; nilai lain tidak", () => {
    expect(modeTanpaPendaftaranAktif({ VOTEPRIV_SELF_REGISTRATION: "1" })).toBe(true);
    expect(modeTanpaPendaftaranAktif({ VOTEPRIV_TANPA_PENDAFTARAN: "1" })).toBe(true);
    expect(modeTanpaPendaftaranAktif({ VOTEPRIV_SELF_REGISTRATION: "true" })).toBe(false);
    expect(modeTanpaPendaftaranAktif({})).toBe(false);
  });

  it("VOTEPRIV_REDEPLOY=1 dan VOTEPRIV_DEPLOY_ULANG=1 sama-sama mengizinkan deploy ulang; nilai lain tidak", () => {
    expect(modeDeployUlangAktif({ VOTEPRIV_REDEPLOY: "1" })).toBe(true);
    expect(modeDeployUlangAktif({ VOTEPRIV_DEPLOY_ULANG: "1" })).toBe(true);
    expect(modeDeployUlangAktif({ VOTEPRIV_REDEPLOY: "yes" })).toBe(false);
    expect(modeDeployUlangAktif({})).toBe(false);
  });
});

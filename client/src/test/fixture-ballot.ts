import type { Ballot } from "@/components/votepriv/types";

/**
 * Satu pembuat Ballot untuk seluruh uji komponen.
 *
 * Sebelumnya lima berkas uji masing-masing menuliskan objek Ballot sendiri,
 * sehingga setiap field baru menuntut lima suntingan. Nilai bawaan di sini
 * meniru ballot yang BENAR-BENAR ADA di rantai — termasuk kuorum yang tidak
 * ditegakkan dan kebijakan eligibility yang berbunyi seperti aslinya — supaya
 * uji tidak diam-diam menguji bentuk data yang tidak pernah muncul.
 */
export function ballotUji(ubah: Partial<Ballot> = {}): Ballot {
  const voteDeadlineMs = Date.UTC(2026, 9, 18, 12, 0, 0);
  return {
    id: "f597222dde4be5b8f13944bed3cd3d7a9fe0223c9c9cefafec98cdf42d1ebec8",
    nomor: 1,
    title: "Q4 Community Treasury",
    description: "Choose how the community treasury supports public goods in Q4.",
    community: "Midnight Builders",
    votes: 0,
    eligible: 3,
    registered: 3,
    tallied: 0,
    quorum: 60,
    eligibilityPolicy: "Tiga credential uji end-to-end",
    deadline: "Oct 18, 2026, 12:00 UTC",
    voteDeadlineMs,
    tallyDeadlineMs: voteDeadlineMs + 35 * 60 * 1000,
    phase: 0,
    status: "live",
    options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
    // SELALU larik padat sepanjang options — tidak pernah null. Yang membedakan
    // "tersegel" dari "final tanpa satu pun dibuka" adalah keadaanHasil.
    tallies: [0, 0, 0],
    keadaanHasil: "tersegel",
    accent: "mint",
    tag: "Open",
    deployHeight: 810_832,
    ...ubah,
  };
}

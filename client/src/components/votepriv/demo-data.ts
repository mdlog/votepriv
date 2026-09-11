import type { Ballot } from "./types";

/**
 * Tiga ballot mockup yang mengisi UI sebelum ada kontrak.
 *
 * Spec §2.4: selama wallet belum tersambung, UI dijalankan MockAdapter dan
 * angka mockup ditampilkan apa adanya dengan badge "Demo data" yang jelas.
 * MockAdapter itu sendiri dibangun di Rencana C-2; C-1 hanya memindahkan
 * datanya ke tempat yang akan ditukar, tanpa mengubah satu angka pun.
 */
// C-2a Task 6 menumbuhkan Ballot dengan field baru yang wajib (nomor,
// registered, tallied, eligibilityPolicy, voteDeadlineMs, tallyDeadlineMs,
// phase, deployHeight, keadaanHasil, tallies). Berkas ini bukan target
// perilaku Task 6 — komponen yang membaca data ini belum disambungkan ke
// status lima-nilai (itu Task 8) — jadi nilai baru di bawah HANYA menutup
// kontrak tipe: dipilih supaya konsisten dengan field lama yang sudah ada
// (mis. keadaanHasil mengikuti status+tallied lewat aturan yang sama dengan
// ballot-status.ts), bukan hasil pengukuran apa pun.
export const initialBallots: Ballot[] = [
  {
    id: "ballot-042",
    nomor: 1,
    title: "Q4 Community Treasury",
    description: "Choose how the community treasury supports public goods in Q4.",
    community: "Midnight Builders",
    votes: 842,
    eligible: 1200,
    registered: 1200,
    tallied: 0,
    quorum: 60,
    eligibilityPolicy: "Open to Midnight Builders credential holders",
    deadline: "Oct 18, 2026",
    voteDeadlineMs: Date.UTC(2026, 9, 18, 12, 0),
    tallyDeadlineMs: Date.UTC(2026, 9, 18, 13, 0),
    phase: 0,
    status: "live",
    options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
    tallies: [0, 0, 0],
    keadaanHasil: "tersegel",
    accent: "mint",
    tag: "Featured",
    deployHeight: 100,
  },
  {
    id: "ballot-041",
    nomor: 2,
    title: "Protocol Grants Round 03",
    description: "Prioritise the next cohort of privacy tooling grants.",
    community: "ZK Commons",
    votes: 316,
    eligible: 500,
    registered: 500,
    tallied: 0,
    quorum: 55,
    eligibilityPolicy: "ZK Commons contributors with an active grant credential",
    deadline: "Oct 16, 2026",
    voteDeadlineMs: Date.UTC(2026, 9, 16, 12, 0),
    tallyDeadlineMs: Date.UTC(2026, 9, 16, 13, 0),
    phase: 0,
    status: "closing-soon",
    options: ["Identity primitives", "Developer education", "Audit funding"],
    tallies: [0, 0, 0],
    keadaanHasil: "tersegel",
    accent: "violet",
    tag: "Closing soon",
    deployHeight: 90,
  },
  {
    id: "ballot-039",
    nomor: 3,
    title: "Network Upgrade 7B",
    description: "Signal community support for the next network upgrade window.",
    community: "Midnight Core",
    votes: 1108,
    eligible: 1500,
    registered: 1500,
    tallied: 1108,
    quorum: 66,
    eligibilityPolicy: "Midnight Core token holders as of the upgrade snapshot",
    deadline: "Finalized Sep 28, 2026",
    voteDeadlineMs: Date.UTC(2026, 8, 28, 12, 0),
    tallyDeadlineMs: Date.UTC(2026, 8, 28, 13, 0),
    phase: 2,
    status: "finalized",
    options: ["Support", "Abstain", "Do not support"],
    tallies: [700, 200, 208],
    keadaanHasil: "ada-hasil",
    accent: "blue",
    tag: "Finalized",
    deployHeight: 80,
  },
];

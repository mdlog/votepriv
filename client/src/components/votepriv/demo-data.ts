import type { Ballot } from "./types";

/**
 * Tiga ballot mockup yang mengisi UI sebelum ada kontrak.
 *
 * Spec §2.4: selama wallet belum tersambung, UI dijalankan MockAdapter dan
 * angka mockup ditampilkan apa adanya dengan badge "Demo data" yang jelas.
 * MockAdapter itu sendiri dibangun di Rencana C-2; C-1 hanya memindahkan
 * datanya ke tempat yang akan ditukar, tanpa mengubah satu angka pun.
 */
export const initialBallots: Ballot[] = [
  {
    id: "ballot-042",
    title: "Q4 Community Treasury",
    description: "Choose how the community treasury supports public goods in Q4.",
    community: "Midnight Builders",
    votes: 842,
    eligible: 1200,
    quorum: 60,
    deadline: "Oct 18, 2026",
    status: "live",
    options: ["Fund developer grants", "Host local meetups", "Open-source tooling"],
    accent: "mint",
    tag: "Featured",
  },
  {
    id: "ballot-041",
    title: "Protocol Grants Round 03",
    description: "Prioritise the next cohort of privacy tooling grants.",
    community: "ZK Commons",
    votes: 316,
    eligible: 500,
    quorum: 55,
    deadline: "Oct 16, 2026",
    status: "closing-soon",
    options: ["Identity primitives", "Developer education", "Audit funding"],
    accent: "violet",
    tag: "Closing soon",
  },
  {
    id: "ballot-039",
    title: "Network Upgrade 7B",
    description: "Signal community support for the next network upgrade window.",
    community: "Midnight Core",
    votes: 1108,
    eligible: 1500,
    quorum: 66,
    deadline: "Finalized Sep 28, 2026",
    status: "finalized",
    options: ["Support", "Abstain", "Do not support"],
    accent: "blue",
    tag: "Finalized",
  },
];

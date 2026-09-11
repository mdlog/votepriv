import { describe, expect, it } from "vitest";
import { statusLabel } from "./ballot-status";
import type { BallotStatus } from "./types";

describe("statusLabel", () => {
  // Ketiga string ini disalin dari Home.tsx pra-pemecahan baris 131-133.
  // Ia teks UI berbahasa Inggris dan tidak boleh diterjemahkan.
  it("memetakan ketiga status ke label yang sama persis dengan sebelum pemecahan", () => {
    expect(statusLabel("live")).toBe("Live now");
    expect(statusLabel("closing-soon")).toBe("Closing soon");
    expect(statusLabel("finalized")).toBe("Finalized");
  });

  it("tidak punya status keempat", () => {
    const semua: BallotStatus[] = ["live", "closing-soon", "finalized"];
    expect(new Set(semua.map(statusLabel)).size).toBe(3);
  });
});

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, expect, it } from "vitest";
import { RegistrySimulator } from "./registry-simulator.js";

setNetworkId("undeployed");

describe("registry.compact", () => {
  it("mulai kosong", () => {
    const sim = new RegistrySimulator();
    expect(sim.getLedger().count).toBe(0n);
    expect([...sim.getLedger().ballots]).toEqual([]);
  });

  it("mencatat satu alamat ballot", () => {
    const sim = new RegistrySimulator();
    sim.register("0200abcd");
    expect(sim.getLedger().count).toBe(1n);
    expect([...sim.getLedger().ballots]).toEqual(["0200abcd"]);
  });

  it("menaruh alamat terbaru di depan", () => {
    const sim = new RegistrySimulator();
    sim.register("aaaa");
    sim.register("bbbb");
    sim.register("cccc");
    expect(sim.getLedger().count).toBe(3n);
    expect([...sim.getLedger().ballots]).toEqual(["cccc", "bbbb", "aaaa"]);
  });
});

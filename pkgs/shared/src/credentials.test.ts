import { describe, expect, it } from "vitest";
import { Ballot } from "contract";
import { buatCredential, daunEligibility } from "./credentials.js";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("credentials", () => {
  it("membuat credential 32 byte", () => {
    expect(buatCredential().length).toBe(32);
  });

  it("dua credential tidak pernah sama", () => {
    expect(hex(buatCredential())).not.toBe(hex(buatCredential()));
  });

  it("daun eligibility deterministik terhadap credential yang sama", () => {
    const c = buatCredential();
    expect(hex(daunEligibility(c))).toBe(hex(daunEligibility(c)));
  });

  it("daun eligibility memakai circuit kontrak, bukan hash tandingan", () => {
    // Dibandingkan langsung terhadap Ballot.pureCircuits.cred_leaf yang diambil
    // independen di sini — bukan sekadar "32 byte dan bukan identity". Hash
    // tandingan apa pun, termasuk yang menghasilkan 32 byte deterministik dan
    // non-identity, akan gagal di sini karena nilainya tidak cocok dengan yang
    // dihitung circuit sungguhan.
    const c = buatCredential();
    const daun = daunEligibility(c);
    const daunDariCircuit = Ballot.pureCircuits.cred_leaf(c);
    expect(daun.length).toBe(32);
    expect(hex(daun)).toBe(hex(daunDariCircuit));
  });
});

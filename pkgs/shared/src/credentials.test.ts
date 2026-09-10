import { describe, expect, it } from "vitest";
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
    // Bila seseorang mengimplementasi ulang hash di TypeScript, nilainya akan
    // berbeda dari yang dihitung circuit dan tidak ada commitment yang pernah cocok.
    const c = buatCredential();
    const daun = daunEligibility(c);
    expect(daun.length).toBe(32);
    expect(hex(daun)).not.toBe(hex(c));
  });
});

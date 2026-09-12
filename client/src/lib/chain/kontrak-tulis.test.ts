import { describe, expect, it } from "vitest";
import { kompilasiBallotBrowser } from "./kontrak-tulis";

describe("kompilasiBallotBrowser", () => {
  it("membangun CompiledContract dengan tag 'ballot' tanpa menyentuh fs/path", () => {
    const cc = kompilasiBallotBrowser();
    expect(cc.tag).toBe("ballot");
  });
});

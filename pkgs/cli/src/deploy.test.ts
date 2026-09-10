import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { deployRegistry } from "./deploy.ts";
import type { ProvidersRegistry } from "./providers.ts";
import { BATAS_MS } from "./tunggu.ts";

// Logger palsu: uji ini tidak boleh menulis apa pun ke berkas log.
const logPalsu = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;

describe("deployRegistry", () => {
  // Menjaga regresi yang sudah pernah terjadi sekali di draf awal rencana
  // ini: menghapus `denganBatasWaktu(...)` dari sekeliling `deployFn(...)`.
  // tsc tidak menangkapnya (pembungkus itu transparan pada tipe kembalian),
  // jadi hanya uji ini yang berdiri di antara regresi itu dan CLI yang diam
  // selamanya bila transaksi deploy ditolak konsensus.
  it("menolak dengan pesan batas waktu bila deployContract tidak pernah selesai", async () => {
    vi.useFakeTimers();
    try {
      const takPernahSelesai = () => new Promise<never>(() => {});
      const janji = deployRegistry({} as unknown as ProvidersRegistry, logPalsu, takPernahSelesai);
      // Perlu di-attach SEBELUM memajukan jam palsu, supaya rejection tidak
      // pernah menjadi "unhandled" di antara advance dan await.
      const ekspektasi = expect(janji).rejects.toThrow(/tidak selesai dalam/);
      await vi.advanceTimersByTimeAsync(BATAS_MS.deploy);
      await ekspektasi;
    } finally {
      vi.useRealTimers();
    }
  });
});

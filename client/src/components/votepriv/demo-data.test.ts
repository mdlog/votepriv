import { describe, expect, it } from "vitest";
import { keadaanHasil as keadaanHasilAsli } from "./ballot-status";
import { initialBallots } from "./demo-data";

/**
 * demo-data.ts sendiri mengklaim (lihat komentar modul) nilai barunya
 * "konsisten dengan field lama yang sudah ada di sini (mis. keadaanHasil
 * mengikuti status+tallied lewat aturan yang sama dengan ballot-status.ts)".
 * Klaim itu tidak pernah ditegakkan uji apa pun — mutasi M10 membuktikannya:
 * menukar nomor tampilan dan mengubah keadaanHasil ballot-039 jadi "tersegel"
 * (padahal tallied-nya 1108, seharusnya "ada-hasil" menurut aturan turunan
 * yang modul ini klaim diikuti) lolos bersih di pnpm test/check/check:uji.
 *
 * Uji ini menutup celah itu: memverifikasi klaim konsistensi terhadap fungsi
 * turunan SUNGGUHAN, bukan mengetik ulang nilai yang diharapkan.
 *
 * (Berbeda dari demo-data.gate.test.ts: uji itu gerbang untuk penghapusan
 * demo-data.ts di Task 8 Step 10. Uji ini murni menjaga konsistensi ISI
 * demo-data.ts SELAMA berkas itu masih ada, dan otomatis lenyap bersamanya.)
 */
describe("initialBallots — konsistensi nilai yang diklaim modul", () => {
  it("keadaanHasil setiap ballot cocok dengan turunan status+tallied SUNGGUHAN dari ballot-status.ts", () => {
    for (const b of initialBallots) {
      expect(b.keadaanHasil).toBe(keadaanHasilAsli({ status: b.status, tallied: b.tallied }));
    }
  });

  it("nomor tampilan mengikuti urutan larik, mulai dari 1", () => {
    expect(initialBallots.map(b => b.nomor)).toEqual(
      initialBallots.map((_, i) => i + 1),
    );
  });
});

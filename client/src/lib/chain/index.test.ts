import { describe, expect, it } from "vitest";
import * as barrel from "./index";

/**
 * Penjaga MURAH untuk daftar ekspor barrel `./index.ts`.
 *
 * Berkas barrel itu sendiri tidak punya satu uji pun sebelumnya — menambah
 * atau menghapus ekspor tidak membuat apa pun merah. Gerbang UKURAN BUNDEL
 * sungguhan (yang bisa membedakan ekspor yang aman dari yang menarik WASM
 * lewat atribusi per-chunk) memang ditunda ke Task 9 — tapi menunggu Task 9
 * untuk sesuatu yang bisa ditangkap satu assert sederhana HARI INI adalah
 * penundaan tanpa alasan.
 *
 * MENGAPA daftar ini dipaku persis: `Object.keys(barrel).sort()` hanya berisi
 * ekspor NILAI — `export type` terhapus total saat kompilasi TypeScript,
 * jadi tidak pernah muncul di sini apa pun banyaknya. Menambahkan ekspor
 * NILAI baru dari "./dekode" (mis. `export { padatkanTallies } from
 * "./dekode"`) akan menarik WASM (onchain-runtime-v3, 1.321.366 B) lewat
 * barrel ini — dan sampai gerbang per-chunk Task 9 mendarat, UJI INI adalah
 * satu-satunya hal di pohon ini yang membuat penambahan semacam itu
 * terlihat. Uji ini juga menangkap arah sebaliknya: menghapus ekspor yang
 * ada (mis. `bacaRantai`) diam-diam, yang akan merusak setiap pengimpor
 * barrel tanpa peringatan tipe di sini (peringatan tipe muncul di PENGIMPOR,
 * bukan di barrel-nya sendiri).
 *
 * Dibuktikan sendiri (bukan diasumsikan): menambahkan sementara
 * `export { padatkanTallies } from "./dekode";` ke index.ts dan menjalankan
 * `pnpm test` membuat uji ini MERAH — lihat task-5-report.md untuk keluaran
 * verbatim-nya.
 */
describe("barrel client/src/lib/chain/index.ts", () => {
  it("hanya mengekspor NILAI yang dipaku persis — penambahan maupun penghapusan harus terlihat", () => {
    expect(Object.keys(barrel).sort()).toEqual([
      "ALAMAT_REGISTRY_BAWAAN",
      "GalatRantai",
      "JARINGAN_BAWAAN",
      "alamatKontrakValid",
      "bacaRantai",
      "jaringanAktif",
    ]);
  });
});

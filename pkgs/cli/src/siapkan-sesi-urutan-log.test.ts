import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { JEDA_TRANSPORT_PRETTY_MS } from "./bootstrap.ts";

// PENJAGA PENGKABELAN — bukan uji perilaku. `siapkanSesi` BISA diimpor (bukan
// skrip tingkat-atas), tapi TIDAK BISA dijalankan sungguhan di uji unit: ia
// membangun wallet dan meminta seed lewat prompt (dilarang menjalankan tanpa
// wallet/jaringan, dan `bacaSeed` akan menggantung menunggu stdin). Jalan
// yang tersisa: baca sumbernya sebagai TEKS dan pastikan jeda
// JEDA_TRANSPORT_PRETTY_MS benar-benar berada DI ANTARA log "Konfigurasi
// jaringan" dan pemanggilan bacaSeed/caraTurunanDariArgv — bukan sekadar ADA
// di suatu tempat pada berkas ini.
//
// Latar lengkap kenapa jeda ini diperlukan (worker thread pino-pretty
// asinkron, logger.flush() terbukti tidak cukup, dst) ada di komentar
// JEDA_TRANSPORT_PRETTY_MS sendiri (bootstrap.ts) dan
// .superpowers/register-leaves-cli.md.
const bootstrapPath = path.resolve(fileURLToPath(import.meta.url), "..", "bootstrap.ts");
const sumberAsli = fs.readFileSync(bootstrapPath, "utf8");

const mulaiFungsi = sumberAsli.indexOf("export async function siapkanSesi");
const badanFungsi = sumberAsli.slice(mulaiFungsi);

describe("siapkanSesi: jeda transport pino-pretty berada di antara log konfigurasi dan prompt seed", () => {
  it("fungsi siapkanSesi ditemukan di bootstrap.ts", () => {
    expect(mulaiFungsi).toBeGreaterThan(-1);
  });

  it('log "Network configuration" muncul SEBELUM jeda, dan jeda muncul SEBELUM bacaSeed/caraTurunanDariArgv', () => {
    const idxLog = badanFungsi.indexOf("Network configuration");
    const idxJeda = badanFungsi.indexOf("JEDA_TRANSPORT_PRETTY_MS");
    const idxCaraTurunan = badanFungsi.indexOf("caraTurunanDariArgv(");
    const idxBacaSeed = badanFungsi.indexOf("bacaSeed(");

    expect(idxLog, 'log "Network configuration" harus ada di siapkanSesi').toBeGreaterThan(-1);
    expect(idxJeda, "JEDA_TRANSPORT_PRETTY_MS harus dipakai di siapkanSesi").toBeGreaterThan(-1);
    expect(idxCaraTurunan, "caraTurunanDariArgv( harus dipanggil di siapkanSesi").toBeGreaterThan(-1);
    expect(idxBacaSeed, "bacaSeed( harus dipanggil di siapkanSesi").toBeGreaterThan(-1);

    expect(idxJeda, "jeda harus muncul SETELAH log konfigurasi").toBeGreaterThan(idxLog);
    expect(idxCaraTurunan, "caraTurunanDariArgv harus muncul SETELAH jeda").toBeGreaterThan(idxJeda);
    expect(idxBacaSeed, "bacaSeed harus muncul SETELAH jeda").toBeGreaterThan(idxJeda);
  });

  it("jeda benar-benar berupa await (bukan fire-and-forget) atas sebuah Promise/setTimeout", () => {
    const cuplikan = badanFungsi.slice(
      badanFungsi.indexOf("Network configuration"),
      badanFungsi.indexOf("caraTurunanDariArgv("),
    );
    expect(cuplikan).toMatch(/await\s+new Promise\(.*setTimeout.*JEDA_TRANSPORT_PRETTY_MS/s);
  });

  it("nilai jeda positif dan tidak nol (jeda nol setara dengan tidak ada perbaikan sama sekali)", () => {
    expect(JEDA_TRANSPORT_PRETTY_MS).toBeGreaterThan(0);
  });
});

// `pnpm cli deploy-registry` — men-deploy kontrak registry ke preview dan
// menyimpan alamatnya ke pkgs/cli/artefak/preview.json.
//
// Berkas ini adalah SKRIP tingkat-atas, bukan modul: ia tidak mengekspor apa
// pun dan tidak boleh diimpor dari mana pun.
//
// Alamat DIKEMBALIKAN lewat kode dan ditulis ke berkas, tidak untuk dipungut
// dari stdout: SDK wallet menulis galat sinkronisasi mentah langsung ke stdout
// di luar pino, jadi keluaran terminal bukan saluran data yang bisa dipercaya.
import { bacaArtefak, jalurArtefak, tulisArtefak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import { bacaLedgerRegistry, deployRegistry } from "./deploy.ts";
import { modeDeployUlangAktif } from "./pendaftaran-awal.ts";
import { rakitProvidersRegistry } from "./providers.ts";
import { ulangiSampai } from "./tunggu.ts";
import { bacaDustSaatIni } from "./wallet.ts";

const sesi = await siapkanSesi();
const { config, ctx, log, kp } = sesi;

const sudahAda = bacaArtefak(config.networkId)?.registry;
if (sudahAda !== undefined && !modeDeployUlangAktif()) {
  log.warn(
    { alamat: sudahAda },
    "Registry sudah tercatat di artefak. Setel VOTEPRIV_REDEPLOY=1 bila memang ingin men-deploy registry BARU.",
  );
  await tutupSesi(sesi, 0);
}

const providers = await rakitProvidersRegistry(kp, "admin");
const { alamat: alamatRegistry } = await deployRegistry(providers, log, undefined, {
  bacaDust: () => bacaDustSaatIni(ctx.wallet),
});

// Simpan alamat SEGERA setelah deploy sukses — sebelum membaca ledger dari
// indexer. Berkas artefak adalah saluran catatan resmi untuk alamat ini
// (lihat komentar berkas di atas); throw apa pun antara sini dan pembacaan
// ledger tidak boleh menghilangkan alamat dari sebuah deploy yang sudah
// berhasil dan sudah membayar biaya.
tulisArtefak(config.networkId, { registry: alamatRegistry });

// Indexer menyusul node beberapa detik. Membaca ledger tepat setelah deploy
// dapat mengembalikan null; itu bukan kegagalan, itu keterlambatan.
const { nilai: ledger, galatTerakhir, percobaan } = await ulangiSampai(
  () => bacaLedgerRegistry(kp.publicDataProvider, alamatRegistry),
  () => true, // pembacaan yang BERHASIL sudah cukup; count registry baru memang 0
  log,
  `ledger registry ${alamatRegistry} terlihat di indexer`,
);
if (ledger === undefined) {
  log.error(
    { galatTerakhir, percobaan },
    "Registry ter-deploy tapi tidak pernah terbaca dari indexer. Alamatnya TETAP tersimpan — deploy-nya sukses.",
  );
  await hentikanWallet(sesi.ctx, log);
  process.exit(1);
}
log.info({ count: ledger.count.toString(), kosong: ledger.ballots.isEmpty() }, "Ledger registry terbaca dari indexer");

// Log hanya jalur berkas dan alamat, BUKAN objek artefak: Task 5/6 mengisi
// ArtefakDeploy.credentials, dan menulis objek itu ke log berarti credential
// pemilih ikut mendarat mentah-mentah di pkgs/cli/logs/.
log.info({ berkas: jalurArtefak(config.networkId), alamat: alamatRegistry }, "Alamat registry tersimpan");

await tutupSesi(sesi, 0);

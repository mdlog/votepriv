// `pnpm cli deploy-registry` — men-deploy kontrak registry ke preview dan
// menyimpan alamatnya ke pkgs/cli/artefak/preview.json.
//
// Berkas ini adalah SKRIP tingkat-atas, bukan modul: ia tidak mengekspor apa
// pun dan tidak boleh diimpor dari mana pun.
//
// Alamat DIKEMBALIKAN lewat kode dan ditulis ke berkas, tidak untuk dipungut
// dari stdout: SDK wallet menulis galat sinkronisasi mentah langsung ke stdout
// di luar pino, jadi keluaran terminal bukan saluran data yang bisa dipercaya.
import { bacaArtefak, tulisArtefak } from "./artefak.ts";
import { hentikanWallet, siapkanSesi, tutupSesi } from "./bootstrap.ts";
import { bacaLedgerRegistry, deployRegistry } from "./deploy.ts";
import { rakitProvidersRegistry } from "./providers.ts";
import { ulangiSampai } from "./tunggu.ts";

const sesi = await siapkanSesi();
const { config, log, kp } = sesi;

const sudahAda = bacaArtefak(config.networkId)?.registry;
if (sudahAda !== undefined && process.env.VOTEPRIV_DEPLOY_ULANG !== "1") {
  log.warn(
    { alamat: sudahAda },
    "Registry sudah tercatat di artefak. Setel VOTEPRIV_DEPLOY_ULANG=1 bila memang ingin men-deploy registry BARU.",
  );
  await tutupSesi(sesi, 0);
}

const providers = await rakitProvidersRegistry(kp, "admin");
const { alamat: alamatRegistry } = await deployRegistry(providers, log);

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
    "Registry ter-deploy tapi tidak pernah terbaca dari indexer. Alamatnya TETAP disimpan — deploy-nya sukses.",
  );
  tulisArtefak(config.networkId, { registry: alamatRegistry });
  await hentikanWallet(sesi.ctx, log);
  process.exit(1);
}
log.info({ count: ledger.count.toString(), kosong: ledger.ballots.isEmpty() }, "Ledger registry terbaca dari indexer");

const artefak = tulisArtefak(config.networkId, { registry: alamatRegistry });
log.info({ berkas: `pkgs/cli/artefak/${config.networkId}.json`, artefak }, "Alamat registry tersimpan");

await tutupSesi(sesi, 0);

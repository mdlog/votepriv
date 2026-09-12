import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { postGraphQL } from "./graphql";
import { faktaPrivasiPembayar, hexKeBita } from "@/test/privasi-pembayar-fakta";

/**
 * Varian JARINGAN dari privasi-pembayar.test.ts.
 *
 * Menyentuh indexer SUNGGUHAN. Dilewati kecuali diminta:
 *
 *   VOTEPRIV_UJI_JARINGAN=1 pnpm test client/src/lib/chain/privasi-pembayar.jaringan-nyata.test.ts
 *
 * MENGAPA berkas ini ada TERPISAH dari privasi-pembayar.test.ts (pola sama
 * dengan jaringan-nyata.test.ts vs baca-rantai.test.ts): fixture menjaga kita
 * dari REGRESI KODE (deserialisasi/ekstraksi fakta yang tadinya benar, rusak
 * oleh perubahan di repo ini). Ia TIDAK bisa menjaga kita dari PERUBAHAN DI
 * SISI RANTAI — upgrade protokol, cara wallet menyeimbangkan transaksi, atau
 * versi ledger-v8 baru yang mulai menyertakan identitas pembayar. Untuk itu
 * uji ini mengambil ULANG byte `raw` transaksi castVote/tallyVote yang SAMA
 * (hash yang sama, dari client/src/test/fixture-rantai/tx-mentah-tulis.json)
 * langsung dari indexer HIDUP, dan menjalankan INVARIAN YANG SAMA PERSIS
 * (faktaPrivasiPembayar — dibagi dengan uji offline, bukan disalin) atas byte
 * yang baru diambil itu.
 *
 * Transaksi lama BERSIFAT ABADI di rantai (immutable), jadi mengambil ulang
 * hash yang sama HARUS mengembalikan byte yang IDENTIK — itu sendiri
 * diassert di bawah sebagai bukti tambahan bahwa kita membaca transaksi yang
 * benar, bukan sekadar "sesuatu yang ada".
 */

const fixture = JSON.parse(
  readFileSync(new URL("../../test/fixture-rantai/tx-mentah-tulis.json", import.meta.url), "utf8"),
) as {
  jaringan: string;
  endpoint: string;
  transaksi: readonly { entryPoint: string; hash: string; raw: string }[];
};

const Q = `query Tx($h: HexEncoded!) {
  transactions(offset: { hash: $h }) {
    __typename
    ... on RegularTransaction { hash raw }
  }
}`;

type JawabanTx = {
  transactions: readonly { __typename: string; hash?: string; raw?: string }[];
};

describe.skipIf(!process.env.VOTEPRIV_UJI_JARINGAN)("privasi pembayar — jalur JARINGAN (indexer hidup)", () => {
  it(
    "mengambil ulang byte raw castVote/tallyVote dari indexer hidup dan menjalankan invarian privasi pembayar",
    { timeout: 30_000 },
    async () => {
      expect(fixture.transaksi.length).toBeGreaterThanOrEqual(2);

      for (const tx of fixture.transaksi) {
        const { data } = await postGraphQL<JawabanTx>({
          url: fixture.endpoint,
          query: Q,
          variables: { h: tx.hash },
        });
        const hidup = data.transactions[0];

        // KEBERADAAN: indexer hidup masih menjawab transaksi ini, dan byte-nya
        // ABADI — identik dengan yang direkam. Kalau ini gagal, bukan
        // invarian privasi yang salah, melainkan rantai/indexer yang berubah
        // bentuk dari yang diasumsikan fixture (lihat README fixture).
        expect(hidup?.__typename).toBe("RegularTransaction");
        expect(hidup?.hash).toBe(tx.hash);
        expect(hidup?.raw).toBe(tx.raw);

        const fakta = faktaPrivasiPembayar(hexKeBita(hidup!.raw!));

        // ── Invarian YANG SAMA PERSIS dengan privasi-pembayar.test.ts ──
        expect(fakta.hashTerhitungUlang).toBe(tx.hash);
        expect(fakta.entryPoint).toBe(tx.entryPoint);
        expect(fakta.jumlahIntent).toBe(2);
        expect(fakta.jumlahPanggilanKontrak).toBe(1);
        expect(fakta.jumlahDustSpends).toBe(1);
        expect(fakta.adaUnshieldedOffer).toBe(false);
        expect(fakta.jumlahDustRegistrations).toBe(0);
        expect(fakta.unshieldedInputsSize).toBe(0);
        expect(fakta.unshieldedOutputsSize).toBe(0);
        expect(fakta.claimedUnshieldedSpendsSize).toBe(0);
      }
    },
  );
});

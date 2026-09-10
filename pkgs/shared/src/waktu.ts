/**
 * Satu-satunya tempat konversi waktu untuk deadline yang mencapai CLI dan app.
 * (Simulator uji `pkgs/contract/src/test/ballot-simulator.ts` punya konversi
 * ms→detik sendiri untuk kebutuhan test scaffolding — paket itu tidak boleh
 * bergantung pada `shared`, karena arah ketergantungannya adalah shared → contract.)
 *
 * Kernel Midnight membandingkan deadline terhadap `secondsSinceEpoch` mentah,
 * tanpa penskalaan. Nilai dalam milidetik karenanya kira-kira seribu kali terlalu
 * besar: `blockTimeLessThan(voteDeadline)` nyaris selalu benar dan pemungutan
 * suara tidak pernah tertutup. Simulator dapat menyuntikkan waktu blok sehingga
 * ujinya tetap hijau dengan satuan mana pun — node sungguhan tidak bisa, jadi
 * kekeliruan ini hanya terlihat setelah di jaringan.
 */

export const detikSekarang = (): bigint => BigInt(Math.floor(Date.now() / 1000));

export const detikDariSekarang = (detik: number): bigint => {
  if (detik < 0) throw new Error("Durasi deadline tidak boleh negatif");
  return detikSekarang() + BigInt(Math.floor(detik));
};

export const MENIT = 60;
export const JAM = 60 * MENIT;
export const HARI = 24 * JAM;

import { Ballot } from "contract";

/**
 * Credential pemilih: 32 byte acak dari CSPRNG.
 *
 * Nullifier tally diturunkan dari salt dan nullifier vote dari credential, jadi
 * keduanya harus benar-benar acak. Credential yang diturunkan secara deterministik
 * akan membuat dua pemilih bertabrakan, dan yang kedua kehilangan suaranya secara
 * senyap dengan pesan "sudah pernah dipakai".
 */
export const buatCredential = (): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(32));

/**
 * Daun yang didaftarkan ke pohon eligibility.
 *
 * Sengaja memanggil circuit kontrak, bukan mengimplementasi ulang hash-nya di
 * TypeScript. Hash tandingan yang meleset satu byte menghasilkan pohon yang tidak
 * pernah cocok dengan commitment mana pun, dan galatnya tidak menunjuk ke mana-mana.
 */
export const daunEligibility = (credential: Uint8Array): Uint8Array =>
  Ballot.pureCircuits.cred_leaf(credential);

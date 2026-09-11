import { useCallback, useEffect, useRef, useState } from "react";
import { GalatRantai, bacaRantai, jaringanAktif, type HasilRantai, type JaringanAktif } from "@/lib/chain";
import { keDaftarBallot } from "@/lib/chain/ke-ballot";
import type { Ballot } from "@/components/votepriv/types";

/**
 * Mesin keadaan pembacaan rantai.
 *
 * TIGA fase, dan ketiganya harus dapat dibedakan komponen di atasnya. Sebuah
 * hook yang hanya mengembalikan `ballots: Ballot[]` memaksa UI menampilkan
 * daftar kosong pada fase memuat DAN pada fase gagal — dan itulah bagaimana
 * kegagalan indexer berubah menjadi "tidak ada ballot", yang dilarang keras
 * oleh rencana ini.
 *
 * `percobaan` naik pada setiap muatUlang(). Ia dipakai permukaan gagal untuk
 * mengatakan "dicoba ke-N", supaya pengguna tahu tombolnya benar-benar bekerja
 * ketika kegagalannya berulang dengan pesan yang sama.
 */
export type KeadaanData =
  | { fase: "memuat"; percobaan: number }
  | { fase: "siap"; hasil: HasilRantai; ballots: Ballot[] }
  | { fase: "gagal"; galat: GalatRantai; percobaan: number };

export type DataRantai = KeadaanData & {
  /**
   * NULL ketika konfigurasi sendiri yang gagal — salah ketik
   * VITE_MIDNIGHT_NETWORK, atau alamat registry yang bukan hex.
   *
   * Nilainya TIDAK boleh dikarang. Versi sebelumnya mengembalikan objek rekaan
   * `{ networkId: "preview", indexer: "", indexerWS: "", alamatRegistry: "" }`,
   * sehingga salah ketik `previewe` muncul di layar sebagai kegagalan jaringan
   * **preview** — jaringan yang justru TIDAK diminta operator. Sebuah objek
   * konfigurasi yang dikarang adalah bentuk kebohongan yang paling sulit
   * ditemukan, karena ia terlihat seperti data.
   */
  jaringan: JaringanAktif | null;
  muatUlang: () => void;
};

export function useDataRantai(opsi: { ambil?: typeof fetch; otomatis?: boolean } = {}): DataRantai {
  const { ambil, otomatis = true } = opsi;
  // jaringanAktif() dapat MELEMPAR pada env yang salah ketik. Dievaluasi sekali
  // dan hasilnya disimpan: melemparnya di dalam render akan meledak di
  // ErrorBoundary alih-alih di panel galat yang punya tombol Retry.
  const [jaringan] = useState<JaringanAktif | GalatRantai>(() => {
    try {
      return jaringanAktif();
    } catch (e) {
      // Sebabnya "konfigurasi", BUKAN "graphql-fatal": tidak ada GraphQL yang
      // pernah dijalankan, tidak ada host yang pernah dihubungi, dan tidak ada
      // jaringan yang pernah dipilih. host diisi string kosong karena memang
      // tidak ada host — bukan "konfigurasi" yang menyamar sebagai nama host.
      return new GalatRantai("konfigurasi", e instanceof Error ? e.message : String(e), "");
    }
  });
  const [percobaan, setPercobaan] = useState(0);
  const [keadaan, setKeadaan] = useState<KeadaanData>({ fase: "memuat", percobaan: 0 });
  const batalRef = useRef<AbortController | null>(null);

  const muatUlang = useCallback(() => setPercobaan(n => n + 1), []);

  useEffect(() => {
    if (!otomatis) return;
    if (jaringan instanceof GalatRantai) {
      setKeadaan({ fase: "gagal", galat: jaringan, percobaan });
      return;
    }
    // Permintaan sebelumnya dibatalkan sebelum yang baru berangkat: tanpa ini,
    // dua muatUlang beruntun bisa mendarat terbalik dan menampilkan data lama.
    // (Diuji sungguhan, bukan hanya diklaim di komentar — lihat
    // useDataRantai.test.tsx "percobaan lama yang mendarat TERLAMBAT tidak
    // menimpa percobaan baru", praperiksa P4.)
    batalRef.current?.abort();
    const ac = new AbortController();
    batalRef.current = ac;
    setKeadaan({ fase: "memuat", percobaan });
    bacaRantai({ jaringan, signal: ac.signal, ambil })
      .then(hasil => {
        if (ac.signal.aborted) return;
        setKeadaan({ fase: "siap", hasil, ballots: keDaftarBallot(hasil) });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        // AbortError bukan kegagalan; ia pembatalan yang kita minta sendiri.
        if (e instanceof DOMException && e.name === "AbortError") return;
        const galat =
          e instanceof GalatRantai
            ? e
            : // host diisi "unknown" — BUKAN "tidak diketahui" — karena galat.host
              // dirender apa adanya ke dalam kalimat UI berbahasa Inggris oleh
              // pesanGagal(). String Indonesia di sini akan membuat panel galat
              // berbunyi "VotePriv could not connect to tidak diketahui.", teks
              // campur bahasa yang melanggar batas UI-tetap-Inggris. Praperiksa P2.
              new GalatRantai("jaringan", e instanceof Error ? e.message : String(e), "unknown");
        setKeadaan({ fase: "gagal", galat, percobaan });
      });
    return () => ac.abort();
  }, [jaringan, percobaan, otomatis, ambil]);

  return {
    ...keadaan,
    // null, BUKAN objek rekaan. Permukaan gagal untuk sebab "konfigurasi" tidak
    // menyebut jaringan sama sekali, karena belum ada jaringan yang dipilih.
    jaringan: jaringan instanceof GalatRantai ? null : jaringan,
    muatUlang,
  };
}

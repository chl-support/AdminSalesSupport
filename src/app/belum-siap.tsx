"use client";

/**
 * Layar yang menunya sudah ada tetapi isinya belum dibuat.
 *
 * Empat menu baru — Memo Approval, Sirkulasi Dokumen, Approval / Persetujuan,
 * dan Report / Laporan — disusun lebih dulu supaya urutan menunya sudah benar
 * sejak sekarang. Tanpa layar di ujungnya, menekan menu itu berakhir pada
 * halaman 404 bawaan Next.js: layar yang tidak memakai kerangka konsol, tidak
 * berbahasa Indonesia, dan terbaca seperti sistemnya rusak.
 *
 * Yang ditampilkan di sini menyatakan apa adanya: menunya sudah disiapkan,
 * isinya belum. Itu keterangan, bukan janji — tidak ada satu pun kalimat di
 * sini yang menyebutkan layar ini akan berisi apa, karena itu memang belum
 * diputuskan.
 */

import { useKata } from "./bahasa";
import { Kerangka, MemeriksaSesi } from "./kerangka";
import { useSesi } from "./session";

const KATA = {
  id: {
    banner: "Layar ini belum dibuat",
    isi:
      "Menunya sudah disiapkan supaya urutannya tetap sejak sekarang. Isinya " +
      "menyusul — sampai saat itu tidak ada yang dapat dikerjakan dari sini.",
  },
  en: {
    banner: "This screen has not been built yet",
    isi:
      "The menu entry is in place so the ordering is settled from now on. The " +
      "contents follow later — until then there is nothing to do from here.",
  },
};

export function BelumSiap(
  { judul }: { judul: { id: string; en: string } },
) {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const j = useKata(judul);

  if (memuat || !sesi) return <MemeriksaSesi />;

  return (
    <Kerangka sesi={sesi} judul={<div><h1>{j}</h1></div>}>
      <div className="banner info">
        <b>{k.banner}</b>
        {k.isi}
      </div>
    </Kerangka>
  );
}

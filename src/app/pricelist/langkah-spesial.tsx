"use client";

/**
 * Langkah 4b. Harga Spesial: menyusun tampilan lembar yang dicetak untuk
 * konsumen, sambil melihat hasilnya di atas kertas A4.
 *
 * Angkanya tidak diketik ulang di sini — seluruhnya diambil dari langkah
 * 4a. Harga, termasuk yang belum disimpan. Yang disusun di layar ini hanya
 * tampilannya: arah kertas, kolom mana yang ikut, urutan besar-kecilnya
 * tulisan, dan unit mana yang dicetak. Pilihannya diingat peramban per
 * proyek dan dipakai pula oleh tombol Cetak A4 di langkah 4a, jadi lembar
 * yang terlihat di sini itu juga yang keluar dari pencetak.
 */

import { useKata } from "../bahasa";
import {
  AlatLembar, LembarHarga, useLembar,
} from "./lembar-harga";
import { bukaCetak, isiLembar, type PropsLangkah } from "./langkah";

const KATA = {
  id: {
    kosong: "Belum ada unit berharga di langkah 4a. Harga — isi dulu langkahnya, " +
      "lalu susun tampilan cetakannya di sini.",
    info: "Semua angka diambil dari langkah 4a. Harga. Yang diatur di sini hanya tampilan " +
      "cetakannya; isian Harga tidak berubah, dan susunan ini dipakai juga oleh tombol Cetak A4.",
    cetakA4: "🖨 Cetak A4",
    cetakInfo: "Buka tab cetak dengan susunan yang terlihat di bawah",
    pratinjau: "Pratinjau kertas A4",
  },
  en: {
    kosong: "No priced units in step 4a. Price List yet — fill that step first, " +
      "then lay out its printout here.",
    info: "Every figure comes from step 4a. Price List. Only the printout's look is set here; " +
      "the price list itself is unchanged, and this layout is what the Print A4 button uses.",
    cetakA4: "🖨 Print A4",
    cetakInfo: "Open the print tab with the layout shown below",
    pratinjau: "A4 paper preview",
  },
};

export function LangkahHargaSpesial({ data, hasil, slug }: PropsLangkah & {
  slug?: string | null;
}) {
  const kt = useKata(KATA);
  const isi = isiLembar(data, hasil, slug);
  const lembar = useLembar(slug);

  if (!isi.unit.length) return <div className="banner info">{kt.kosong}</div>;

  return (
    <>
      <p className="hint kiri">{kt.info}</p>
      {/* Bilah alat yang sama dengan tab cetak, tanpa judulnya: di sini
          judulnya sudah ada di kepala langkah. */}
      <AlatLembar isi={isi} lembar={lembar} judul={null}>
        <button className="pri" onClick={() => bukaCetak(isi)} title={kt.cetakInfo}>
          {kt.cetakA4}</button>
      </AlatLembar>
      <div className="pratinjau-lembar" aria-label={kt.pratinjau}>
        <LembarHarga isi={isi} lembar={lembar} />
      </div>
    </>
  );
}

"use client";

/**
 * Tab Cetak Harga (A4): lembar yang disusun di langkah 4b, siap dicetak.
 *
 * Isinya dikirim halaman Harga lewat localStorage tepat sebelum tab ini
 * dibuka; susunan tampilannya dibaca dari kunci yang sama dengan langkah
 * 4b, jadi yang terlihat di sana itu pula yang keluar di sini. Lembar dan
 * alat penyusunnya sendiri ada di `../lembar-harga`.
 */

import { useEffect, useState } from "react";

import { useKata } from "../../bahasa";
import { AlatLembar, KATA, KUNCI, LembarHarga, useLembar, type Isi } from "../lembar-harga";

export default function CetakPricelist() {
  const kt = useKata(KATA);
  const [isi, setIsi] = useState<Isi | null>(null);
  const lembar = useLembar(isi?.slug);

  useEffect(() => {
    try {
      const s = localStorage.getItem(KUNCI);
      if (s) setIsi(JSON.parse(s) as Isi);
    } catch { /* tidak ada isi */ }
  }, []);

  if (!isi) {
    return (
      <main className="cetak-tnc-kosong">
        <p>{kt.kosong1} {kt.kosong2} <b>{kt.cetakA4}</b>.</p>
      </main>
    );
  }

  return (
    <>
      <style>{`
        @page { size: A4 ${lembar.tata.arah === "lanskap" ? "landscape" : "portrait"}; margin: 8mm; }
        @media print {
          body { background: #fff !important; }
          .cetak-alat { display: none !important; }
          .cetak-kertas { box-shadow: none !important; margin: 0 !important; padding: 0 !important;
                          width: auto !important; min-height: 0 !important; }
          .cetak-latar { background: none !important; padding: 0 !important; min-height: 0 !important; }
        }
      `}</style>

      <AlatLembar isi={isi} lembar={lembar}>
        <button className="pri" onClick={() => print()}>{kt.cetak}</button>
        <button onClick={() => close()}>{kt.tutup}</button>
      </AlatLembar>
      <LembarHarga isi={isi} lembar={lembar} />
    </>
  );
}

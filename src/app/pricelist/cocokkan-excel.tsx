"use client";

/**
 * Cocokkan dengan Excel: unggah berkas Excel PL, lalu harga per cara bayar
 * (Data Pricelist) dan Harga Setelah Faktor (Unit Data) di Excel itu
 * dibandingkan dengan hitungan draf di layar — unit dan kolom yang berbeda
 * langsung terlihat, tanpa mencocokkan baris demi baris secara manual.
 * Tidak mengubah draf apa pun.
 */

import { useState } from "react";

import { formatRupiah } from "@/lib/money";
import type { HasilSusun, SusunPricelist } from "@/lib/susun-pricelist";
import type { HargaExcel } from "@/lib/susun-pricelist-xlsx";
import { useKata } from "../bahasa";
import { PilihBerkas } from "../pilih-berkas";
import { ringkasXlsx } from "./ringkas-xlsx";

const KATA = {
  id: {
    judul: "Cocokkan dengan Excel",
    info: "Unggah berkas Excel PL proyek ini: harga tiap unit dan tiap cara bayar dibandingkan dengan hitungan di layar. Draf tidak berubah.",
    cocokkan: "Cocokkan", membaca: "Membaca…", tutup: "Tutup",
    hfaktor: "Harga Setelah Faktor",
    thKolom: "Kolom", thSama: "Sama", thBeda: "Beda", thTidakAda: "Tidak ada di sistem",
    thKode: "Kode", thSistem: "Sistem", thExcel: "Excel", thSelisih: "Selisih",
    semuaSama: (u: number, k: number) => `Semua sama: ${u} unit × ${k} kolom harga sama dengan Excel.`,
    adaBeda: (n: number) => `${n} harga berbeda dengan Excel.`,
    lebih: (n: number) => `… dan ${n} lagi.`,
    kolomTidakAda: (x: string) => `Kolom Excel tanpa padanan di Data Harga (cek namanya): ${x}.`,
    unitTidakAda: (x: string) => `Unit di Excel yang tidak ada di sistem: ${x}.`,
  },
  en: {
    judul: "Compare with Excel",
    info: "Upload this project's Excel price list: each unit's price for every payment scheme is compared with the calculation on screen. The draft is not changed.",
    cocokkan: "Compare", membaca: "Reading…", tutup: "Close",
    hfaktor: "Factored Price",
    thKolom: "Column", thSama: "Same", thBeda: "Different", thTidakAda: "Not in system",
    thKode: "Code", thSistem: "System", thExcel: "Excel", thSelisih: "Difference",
    semuaSama: (u: number, k: number) => `All match: ${u} units × ${k} price columns equal the Excel.`,
    adaBeda: (n: number) => `${n} prices differ from the Excel.`,
    lebih: (n: number) => `… and ${n} more.`,
    kolomTidakAda: (x: string) => `Excel columns with no matching Price Data column (check the names): ${x}.`,
    unitTidakAda: (x: string) => `Units in the Excel that are not in the system: ${x}.`,
  },
};

/** Nama kolom tanpa beda huruf besar, spasi dan tanda baca. */
const kunci = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]/g, "");

type Beda = { kode: string; kolom: string; sistem: number; excel: number };

/**
 * Angka Excel yang terakhir diunggah, bertahan saat berpindah langkah:
 * perbaiki isian di langkah lain, kembali ke sini, dan hasilnya langsung
 * dicocokkan ulang tanpa mengunggah lagi.
 */
let terakhir: { nama: string; excel: HargaExcel } | null = null;

export function CocokkanExcel({ data, hasil }: { data: SusunPricelist; hasil: HasilSusun }) {
  const k = useKata(KATA);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [excel, setExcelState] = useState<HargaExcel | null>(terakhir?.excel ?? null);
  const setExcel = (x: HargaExcel | null, nama = "") => {
    terakhir = x ? { nama, excel: x } : null;
    setExcelState(x);
  };

  const baca = async () => {
    if (!berkas) return;
    setSibuk(true); setGalat(null);
    try {
      const fd = new FormData(); fd.append("file", await ringkasXlsx(berkas));
      const r = await fetch("/api/pricelist/susun/cocokkan", { method: "POST", body: fd });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${r.status}`); return; }
      setExcel(b as HargaExcel, berkas.name);
    } finally {
      setSibuk(false);
    }
  };

  // Pencocokan dihitung ulang setiap draf di layar berubah, jadi hasil
  // perbaikan langsung terlihat tanpa mengunggah ulang.
  let isi: React.ReactNode = null;
  if (excel) {
    const perKode = new Map(hasil.baris.map((b) => [b.unit.kode, b]));
    const dp = new Map(data.dataPricelist.kolom.map((x) => [kunci(x.nama), x.nama]));
    const padan = excel.kolom.map((nama) => ({ nama, sistem: dp.get(kunci(nama)) }));
    const ringkas = new Map<string, { sama: number; beda: number }>();
    const beda: Beda[] = [];
    const unitTidakAda: string[] = [];
    const catat = (kolom: string, kode: string, sistem: number, ex: number) => {
      const x = ringkas.get(kolom) ?? { sama: 0, beda: 0 };
      if (Math.abs(Math.round(sistem) - Math.round(ex)) < 1) x.sama++;
      else { x.beda++; beda.push({ kode, kolom, sistem, excel: ex }); }
      ringkas.set(kolom, x);
    };
    const kodeExcel = new Set([...Object.keys(excel.harga), ...Object.keys(excel.factored)]);
    for (const kode of kodeExcel) {
      const b = perKode.get(kode);
      if (!b) { unitTidakAda.push(kode); continue; }
      const f = excel.factored[kode];
      if (f != null) catat(k.hfaktor, kode, b.hasilUnit.factored, f);
      for (const p of padan) {
        const ex = excel.harga[kode]?.[p.nama];
        if (p.sistem && ex != null) catat(p.nama, kode, b.dataPl[p.sistem], ex);
      }
    }
    const kolomTidakAda = padan.filter((p) => !p.sistem).map((p) => p.nama);
    const total = [...ringkas.values()].reduce((a, x) => a + x.sama + x.beda, 0);
    isi = (
      <>
        {excel.peringatan.map((p) => <div key={p} className="banner warn">{p}</div>)}
        {total > 0 && (
          <div className={`banner ${beda.length ? "stop" : "ok"}`}>
            {beda.length ? k.adaBeda(beda.length)
              : k.semuaSama(kodeExcel.size - unitTidakAda.length, ringkas.size)}
          </div>
        )}
        {kolomTidakAda.length > 0 && <div className="banner warn">{k.kolomTidakAda(kolomTidakAda.join(", "))}</div>}
        {unitTidakAda.length > 0 && <div className="banner warn">{k.unitTidakAda(unitTidakAda.join(", "))}</div>}
        {ringkas.size > 0 && (
          <div className="tscroll" style={{ marginTop: 8 }}>
            <table className="tabel-ringkas tabel-rapat tabel-cocok"><tbody>
              <tr><th>{k.thKolom}</th><th>{k.thSama}</th><th>{k.thBeda}</th></tr>
              {[...ringkas].map(([nama, x]) => (
                <tr key={nama}><td>{nama}</td><td className="n">{x.sama}</td>
                  <td className="n">{x.beda ? <b style={{ color: "#a3201a" }}>{x.beda}</b> : 0}</td></tr>
              ))}
            </tbody></table>
          </div>
        )}
        {beda.length > 0 && (
          <div className="tscroll" style={{ marginTop: 8, maxHeight: 360, overflowY: "auto" }}>
            <table className="tabel-ringkas tabel-rapat kepala-lekat tabel-cocok"><tbody>
              <tr><th>{k.thKode}</th><th>{k.thKolom}</th><th>{k.thSistem}</th><th>{k.thExcel}</th><th>{k.thSelisih}</th></tr>
              {beda.slice(0, 200).map((x, i) => (
                <tr key={i}><td><b>{x.kode}</b></td><td>{x.kolom}</td>
                  <td className="n">{formatRupiah(Math.round(x.sistem))}</td>
                  <td className="n">{formatRupiah(Math.round(x.excel))}</td>
                  <td className="n">{formatRupiah(Math.round(x.sistem - x.excel))}</td></tr>
              ))}
            </tbody></table>
            {beda.length > 200 && <p className="hint kiri">{k.lebih(beda.length - 200)}</p>}
          </div>
        )}
      </>
    );
  }

  return (
    <details className="form-blok sp" style={{ marginTop: 12 }} open={!!excel || undefined}>
      <summary style={{ cursor: "pointer" }}><b>{k.judul}</b></summary>
      <p className="hint kiri">{k.info}</p>
      <div className="row" style={{ marginBottom: 0 }}>
        <PilihBerkas accept=".xlsx" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
        <button id="cocokkan-excel" className="pri" disabled={!berkas || sibuk} onClick={() => void baca()}>
          {sibuk ? k.membaca : k.cocokkan}</button>
        {excel && <button onClick={() => setExcel(null)}>{k.tutup}</button>}
      </div>
      {galat && <div className="banner stop">{galat}</div>}
      {excel && terakhir?.nama && <p className="hint kiri" style={{ marginBottom: 0 }}>📄 {terakhir.nama}</p>}
      {isi}
    </details>
  );
}

"use client";

/**
 * Cetak Pricelist (langkah 4) pada kertas A4, seperti lembar Pricelist
 * berkas PL Excel: logo, judul, tanggal, lalu tabel unit dengan harga tiap
 * cara bayar (dan DPP & Nilai Free PPN DTP bila dipilih).
 *
 * Isinya dikirim halaman Pricelist lewat localStorage tepat sebelum tab ini
 * dibuka. Cara bayar dan cluster (Address) yang tidak dicentang hanya
 * disembunyikan dari cetakan — isian Pricelist tidak berubah. Pilihan itu
 * diingat peramban per project untuk cetakan berikutnya.
 */

import { useEffect, useRef, useState } from "react";

import type { UnitHarga } from "@/lib/simulasi";

const KUNCI = "cetak-pl";

type Isi = {
  judul: string; tanggal: string; catatan: string; slug: string | null;
  kolom: string[]; unit: UnitHarga[];
};
type Pilihan = { kolom: string[]; alamat: string[]; pajak: boolean };

/** Ukuran isi halaman A4 dalam px CSS (96 dpi) dikurangi margin 8 mm. */
const MM = 96 / 25.4;
const LEBAR = { lanskap: (297 - 16) * MM, potret: (210 - 16) * MM };

const angka = (n: number | null | undefined, d = 0) =>
  n == null || !Number.isFinite(n) ? "" : n.toLocaleString("id-ID", { maximumFractionDigits: d });

export default function CetakPricelist() {
  const [isi, setIsi] = useState<Isi | null>(null);
  const [arah, setArah] = useState<"lanskap" | "potret">("lanskap");
  const [huruf, setHuruf] = useState(7.5);
  const [sembunyi, setSembunyi] = useState<Pilihan>({ kolom: [], alamat: [], pajak: true });
  const [muatkan, setMuatkan] = useState(false);
  const [terlalu, setTerlalu] = useState(false);
  const tabel = useRef<HTMLTableElement>(null);
  const kunciPilihan = `${KUNCI}-pilihan-${isi?.slug ?? "-"}`;

  useEffect(() => {
    try {
      const s = localStorage.getItem(KUNCI);
      if (!s) return;
      const v: Isi = JSON.parse(s);
      setIsi(v);
      const p = localStorage.getItem(`${KUNCI}-pilihan-${v.slug ?? "-"}`);
      if (p) setSembunyi((x) => ({ ...x, ...JSON.parse(p) }));
    } catch { /* tidak ada isi */ }
  }, []);

  const simpanPilihan = (n: Pilihan) => {
    setSembunyi(n);
    try { localStorage.setItem(kunciPilihan, JSON.stringify(n)); } catch { /* abaikan */ }
  };
  const ganti = (jenis: "kolom" | "alamat", k: string, tampil: boolean) =>
    simpanPilihan({ ...sembunyi, [jenis]: tampil ? sembunyi[jenis].filter((x) => x !== k)
                                                 : [...sembunyi[jenis], k] });

  // Tabel harus muat selebar kertas; "Muatkan lebar kertas" mengecilkan
  // huruf setengah poin demi setengah poin sampai muat (paling kecil 5 pt).
  useEffect(() => {
    const el = tabel.current;
    if (!el) return;
    const lewat = el.scrollWidth > LEBAR[arah] + 1;
    setTerlalu(lewat);
    if (muatkan) {
      if (lewat && huruf > 5) setHuruf((h) => +(h - 0.5).toFixed(1));
      else setMuatkan(false);
    }
  }, [isi, arah, huruf, sembunyi, muatkan]);

  if (!isi) {
    return (
      <main className="cetak-tnc-kosong">
        <p>Tidak ada isi untuk dicetak. Buka halaman Pricelist → langkah 4. Pricelist, lalu
          klik <b>Cetak A4</b>.</p>
      </main>
    );
  }

  const pajak = !sembunyi.pajak;
  const kolom = isi.kolom.filter((k) => !sembunyi.kolom.includes(k));
  const semuaAlamat = [...new Set(isi.unit.map((u) => u.alamat || "(tanpa address)"))];
  const unit = isi.unit.filter((u) => !sembunyi.alamat.includes(u.alamat || "(tanpa address)"));
  const jumlahSembunyi = sembunyi.kolom.length + sembunyi.alamat.length;

  return (
    <>
      <style>{`
        @page { size: A4 ${arah === "lanskap" ? "landscape" : "portrait"}; margin: 8mm; }
        @media print {
          body { background: #fff !important; }
          .cetak-alat { display: none !important; }
          .cetak-kertas { box-shadow: none !important; margin: 0 !important; padding: 0 !important;
                          width: auto !important; }
          .cetak-latar { background: none !important; padding: 0 !important; }
        }
      `}</style>

      <div className="cetak-alat">
        <b>Cetak Pricelist (A4)</b>
        <label>Orientasi
          <select value={arah} onChange={(e) => setArah(e.target.value as typeof arah)}>
            <option value="lanskap">Lanskap (mendatar)</option>
            <option value="potret">Potret (tegak)</option>
          </select>
        </label>
        <label><input type="checkbox" checked={pajak}
                      onChange={(e) => simpanPilihan({ ...sembunyi, pajak: !e.target.checked })} />
          DPP &amp; Nilai Free PPN DTP</label>
        <span className="cetak-huruf">Ukuran huruf
          <button onClick={() => setHuruf((h) => Math.max(5, +(h - 0.5).toFixed(1)))} aria-label="Perkecil huruf">A−</button>
          <b>{huruf.toLocaleString("id-ID")} pt</b>
          <button onClick={() => setHuruf((h) => Math.min(12, +(h + 0.5).toFixed(1)))} aria-label="Perbesar huruf">A+</button>
        </span>
        <span className={`pill ${terlalu ? "warn" : "ok"}`}>
          {terlalu ? "Tabel lebih lebar dari kertas" : "Muat selebar A4"}</span>
        {terlalu && <button onClick={() => setMuatkan(true)}>Muatkan lebar kertas</button>}
        <details className="cetak-pilih">
          <summary>Pilih isi yang dicetak{jumlahSembunyi ? ` (${jumlahSembunyi} disembunyikan)` : ""}</summary>
          <div className="cetak-pilih-isi">
            <p className="hint">Yang tidak dicentang hanya disembunyikan dari cetakan; isi Pricelist
              tidak berubah.</p>
            <b>Cara bayar</b>
            <div className="row" style={{ margin: "0 0 4px" }}>
              <button className="kecil" onClick={() => simpanPilihan({ ...sembunyi, kolom: [] })}>Centang semua</button>
              <button className="kecil" onClick={() => simpanPilihan({ ...sembunyi, kolom: [...isi.kolom] })}>Kosongkan</button>
            </div>
            {isi.kolom.map((k) => (
              <label key={k}><input type="checkbox" checked={!sembunyi.kolom.includes(k)}
                onChange={(e) => ganti("kolom", k, e.target.checked)} /> {k}</label>
            ))}
            {semuaAlamat.length > 1 && <>
              <b>Address (cluster)</b>
              {semuaAlamat.map((a) => (
                <label key={a}><input type="checkbox" checked={!sembunyi.alamat.includes(a)}
                  onChange={(e) => ganti("alamat", a, e.target.checked)} />
                  {" "}{a} ({isi.unit.filter((u) => (u.alamat || "(tanpa address)") === a).length} unit)</label>
              ))}
            </>}
          </div>
        </details>
        <button className="pri" onClick={() => print()}>Cetak / Simpan PDF</button>
        <button onClick={() => close()}>Tutup</button>
        <span className="hint">{unit.length} unit · {kolom.length} cara bayar. Di dialog cetak pilih
          kertas <b>A4</b>; untuk PDF pilih “Simpan sebagai PDF”.</span>
      </div>

      <div className="cetak-latar">
        <div className="cetak-kertas" style={{ width: LEBAR[arah] + 2 * 30, padding: 30 }}>
          <div className="pl-lembar" style={{ fontSize: `${huruf}pt` }}>
            <header>
              {isi.slug ? <img src={`/project/${isi.slug}.png`} alt="" className="tnc-logo" /> : <span />}
              <div className="pl-judul">
                <h1>{isi.judul || "PRICELIST"}</h1>
                {isi.tanggal && <div>{isi.tanggal}</div>}
              </div>
              <span />
            </header>
            <table ref={tabel}>
              <thead>
                <tr>
                  <th rowSpan={2}>No</th><th rowSpan={2}>Address</th><th rowSpan={2}>Unit No</th>
                  <th rowSpan={2}>Phase</th><th rowSpan={2}>Ukuran</th><th rowSpan={2}>View</th>
                  <th rowSpan={2}>Tipe</th><th rowSpan={2}>Sub-Tipe</th><th colSpan={2}>Area (m²)</th>
                  {kolom.map((k) => <th key={k} colSpan={pajak ? 3 : 1} className="cb">{k}</th>)}
                </tr>
                <tr>
                  <th>Land</th><th>Build</th>
                  {kolom.map((k) => pajak
                    ? [<th key={`${k}h`}>Harga</th>, <th key={`${k}d`}>DPP</th>, <th key={`${k}t`}>Free PPN DTP</th>]
                    : <th key={k}>Harga</th>)}
                </tr>
              </thead>
              <tbody>
                {unit.map((u, i) => (
                  <tr key={`${u.kode}-${i}`}>
                    <td className="c">{i + 1}</td><td>{u.alamat}</td><td>{u.kode}</td>
                    <td className="c">{u.phase}</td><td className="c">{u.ukuran}</td><td>{u.view}</td>
                    <td className="c">{u.tipe}</td><td>{u.subTipe}</td>
                    <td className="n">{angka(u.lt, 2)}</td><td className="n">{angka(u.lb, 2)}</td>
                    {kolom.map((k) => pajak
                      ? [<td key={`${k}h`} className="n h">{angka(u.harga[k])}</td>,
                         <td key={`${k}d`} className="n">{angka(u.pajak?.[k]?.dpp)}</td>,
                         <td key={`${k}t`} className="n">{angka(u.pajak?.[k]?.dtp)}</td>]
                      : <td key={k} className="n h">{angka(u.harga[k])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {isi.catatan && <p className="pl-catatan">{isi.catatan}</p>}
          </div>
        </div>
      </div>
    </>
  );
}

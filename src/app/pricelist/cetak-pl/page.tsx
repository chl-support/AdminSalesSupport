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

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { UnitHarga } from "@/lib/simulasi";

const KUNCI = "cetak-pl";

type Isi = {
  judul: string; tanggal: string; catatan: string; slug: string | null;
  kolom: string[]; unit: UnitHarga[];
};
type Pilihan = { kolom: string[]; alamat: string[]; pajak: boolean; info?: string[] };

/**
 * Kolom keterangan unit yang dapat disembunyikan dari cetakan. Makin sedikit
 * kolom, makin besar tulisannya saat tabel dipaskan selebar kertas.
 */
const INFO: [keyof UnitHarga, string, string][] = [
  ["alamat", "Address", ""], ["phase", "Phase", "c"], ["ukuran", "Ukuran", "c"],
  ["view", "View", ""], ["tipe", "Tipe", "c"], ["subTipe", "Sub-Tipe", ""],
];
const AREA: [keyof UnitHarga, string][] = [["lt", "Land"], ["lb", "Build"]];

/** Ukuran isi halaman A4 dalam px CSS (96 dpi) dikurangi margin 8 mm. */
const MM = 96 / 25.4;
const LEBAR = { lanskap: (297 - 16) * MM, potret: (210 - 16) * MM };
/** Tinggi isi halaman A4 (dikurangi margin 8 mm dan sedikit cadangan). */
const TINGGI = { lanskap: (210 - 16) * MM - 4, potret: (297 - 16) * MM - 4 };

/** Land selalu satu angka di belakang koma, seperti di Unit Data (70,0 · 107,2). */
const satuDesimal = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? ""
    : n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const angka = (n: number | null | undefined, d = 0) =>
  n == null || !Number.isFinite(n) ? "" : n.toLocaleString("id-ID", { maximumFractionDigits: d });

export default function CetakPricelist() {
  const [isi, setIsi] = useState<Isi | null>(null);
  const [arah, setArah] = useState<"lanskap" | "potret">("lanskap");
  const [huruf, setHuruf] = useState(7.5);
  /** Jarak atas-bawah isi tiap baris (em). */
  const [baris, setBaris] = useState(0.15);
  const [sembunyi, setSembunyi] = useState<Pilihan>({ kolom: [], alamat: [], pajak: true });
  const [muatkan, setMuatkan] = useState(false);
  const [terlalu, setTerlalu] = useState(false);
  /**
   * Penyesuaian ukuran lembar (zoom yang sama ke kedua arah):
   * "lebar" — pas selebar kertas, ke bawah boleh beberapa halaman (bawaan);
   * "halaman" — seluruhnya pas satu halaman A4; "asli" — tanpa penyesuaian.
   */
  const [pas, setPas] = useState<"lebar" | "halaman" | "asli">("lebar");
  const satuHalaman = pas !== "asli";
  const [skala, setSkala] = useState({ zoom: 1, lebar: 0 });
  const tabel = useRef<HTMLTableElement>(null);
  const lembar = useRef<HTMLDivElement>(null);
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

  // Ukur lembar pada ukuran aslinya, lalu perbesar/perkecil seluruhnya dengan
  // zoom yang sama ke kedua arah: pas selebar kertas, atau (pilihan "1
  // halaman") sekaligus pas setinggi satu halaman A4.
  useLayoutEffect(() => {
    const el = lembar.current;
    if (!el) return;
    if (!satuHalaman) { setSkala({ zoom: 1, lebar: 0 }); return; }
    const simpan = { zoom: el.style.zoom, width: el.style.width };
    el.style.zoom = "1"; el.style.width = "max-content";
    const w = el.scrollWidth;
    el.style.width = `${w}px`;
    const h = el.scrollHeight;
    el.style.zoom = simpan.zoom; el.style.width = simpan.width;
    // Pas lebar: boleh diperbesar sampai 1,6× supaya tabel memenuhi kertas.
    // Pas 1 halaman: juga dibatasi tinggi (cadangan 5%: hasil cetak sedikit
    // lebih tinggi dari ukuran di layar).
    const zLebar = Math.min(1.6, LEBAR[arah] / w);
    const z = pas === "halaman" ? Math.min(zLebar, (TINGGI[arah] * 0.95) / h) : zLebar;
    setSkala((s) => (Math.abs(s.zoom - z) < 0.001 && s.lebar === w ? s : { zoom: z, lebar: w }));
  }, [isi, arah, huruf, sembunyi, pas, baris]);

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
  const info = INFO.filter(([k]) => !(sembunyi.info ?? []).includes(k));
  const area = AREA.filter(([k]) => !(sembunyi.info ?? []).includes(k));
  const jumlahSembunyi = sembunyi.kolom.length + sembunyi.alamat.length + (sembunyi.info ?? []).length;

  return (
    <>
      <style>{`
        @page { size: A4 ${arah === "lanskap" ? "landscape" : "portrait"}; margin: 8mm; }
        @media print {
          body { background: #fff !important; }
          .cetak-alat { display: none !important; }
          .cetak-kertas { box-shadow: none !important; margin: 0 !important; padding: 0 !important;
                          width: auto !important; min-height: 0 !important; }
          .cetak-latar { background: none !important; padding: 0 !important; min-height: 0 !important; }
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
        <span className="cetak-huruf">Tinggi baris
          <button onClick={() => setBaris((b) => Math.max(0.05, +(b - 0.1).toFixed(2)))} aria-label="Rapatkan baris">−</button>
          <b>{Math.round((baris - 0.15) / 0.1) + 1}</b>
          <button onClick={() => setBaris((b) => Math.min(1.25, +(b + 0.1).toFixed(2)))} aria-label="Renggangkan baris">+</button>
        </span>
        <span className="cetak-huruf">Ukuran huruf
          <button onClick={() => setHuruf((h) => Math.max(5, +(h - 0.5).toFixed(1)))} aria-label="Perkecil huruf">A−</button>
          <b>{huruf.toLocaleString("id-ID")} pt</b>
          <button onClick={() => setHuruf((h) => Math.min(12, +(h + 0.5).toFixed(1)))} aria-label="Perbesar huruf">A+</button>
        </span>
        <label>Ukuran cetak
          <select value={pas} onChange={(e) => setPas(e.target.value as typeof pas)}>
            <option value="lebar">Pas lebar kertas (ke bawah boleh lebih)</option>
            <option value="halaman">Pas 1 halaman A4</option>
            <option value="asli">Ukuran asli</option>
          </select>
          {satuHalaman && <b>{Math.round(skala.zoom * 100)}%</b>}</label>
        {!satuHalaman && <>
          <span className={`pill ${terlalu ? "warn" : "ok"}`}>
            {terlalu ? "Tabel lebih lebar dari kertas" : "Muat selebar A4"}</span>
          {terlalu && <button onClick={() => setMuatkan(true)}>Muatkan lebar kertas</button>}
        </>}
        <details className="cetak-pilih">
          <summary>Pilih isi yang dicetak{jumlahSembunyi ? ` (${jumlahSembunyi} disembunyikan)` : ""}</summary>
          <div className="cetak-pilih-isi">
            <p className="hint">Yang tidak dicentang hanya disembunyikan dari cetakan; isi Pricelist
              tidak berubah.</p>
            <b>Kolom keterangan</b>
            <span className="hint" style={{ textAlign: "left", margin: 0 }}>Sembunyikan kolom yang tidak
              perlu supaya tulisan tercetak lebih besar.</span>
            {[...INFO, ...AREA.map(([k, l]) => [k, `${l} (m²)`, ""] as [keyof UnitHarga, string, string])].map(([k, l]) => (
              <label key={k}><input type="checkbox" checked={!(sembunyi.info ?? []).includes(k)}
                onChange={(e) => simpanPilihan({ ...sembunyi, info: e.target.checked
                  ? (sembunyi.info ?? []).filter((x) => x !== k) : [...(sembunyi.info ?? []), k] })} /> {l}</label>
            ))}
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
        <div className="cetak-kertas" style={{ width: LEBAR[arah] + 2 * 30, minHeight: TINGGI[arah] + 2 * 30, padding: 30 }}>
          <div ref={lembar} className="pl-lembar"
               style={{ fontSize: `${huruf}pt`, ["--pad" as string]: `${baris}em`,
                        ...(satuHalaman && skala.lebar ? { zoom: skala.zoom, width: skala.lebar } : {}) }}>
            <header>
              {isi.slug ? <img src={`/project/${isi.slug}.png`} alt="" className="tnc-logo" /> : <span />}
              <div className="pl-judul">
                <h1>{isi.judul || "PRICELIST"}</h1>
              </div>
              <span />
            </header>
            {/* Tanggal di pojok kiri, tepat di atas tabel. */}
            {isi.tanggal && <div className="pl-tanggal">{isi.tanggal}</div>}
            <table ref={tabel}>
              <thead>
                <tr>
                  <th rowSpan={2}>No</th>
                  {info.filter(([k]) => k === "alamat").map(([k, l]) => <th key={k} rowSpan={2}>{l}</th>)}
                  <th rowSpan={2}>Unit No</th>
                  {info.filter(([k]) => k !== "alamat").map(([k, l]) => <th key={k} rowSpan={2}>{l}</th>)}
                  {area.length > 0 && <th colSpan={area.length}>Area (m²)</th>}
                  {/* Judul cara bayar: kolom sama lebar, judul panjang dilipat. Tanpa
                      DPP/DTP judulnya dua baris tinggi (tidak ada baris "Harga"). */}
                  {kolom.map((k) => pajak
                    ? <th key={k} colSpan={3} className="cb">{k}</th>
                    : <th key={k} rowSpan={2} className="cb harga">{k}</th>)}
                </tr>
                <tr>
                  {area.map(([k, l]) => <th key={k}>{l}</th>)}
                  {kolom.map((k) => pajak
                    ? [<th key={`${k}h`} className="harga">Harga</th>, <th key={`${k}d`} className="harga">DPP</th>,
                       <th key={`${k}t`} className="harga">Free PPN DTP</th>]
                    : null)}
                </tr>
              </thead>
              <tbody>
                {unit.map((u, i) => (
                  <tr key={`${u.kode}-${i}`}>
                    <td className="c">{i + 1}</td>
                    {info.filter(([k]) => k === "alamat").map(([k]) => <td key={k}>{String(u[k] ?? "")}</td>)}
                    <td>{u.kode}</td>
                    {info.filter(([k]) => k !== "alamat").map(([k, , c]) =>
                      <td key={k} className={c || undefined}>{String(u[k] ?? "")}</td>)}
                    {area.map(([k]) => <td key={k} className="n">
                      {k === "lt" ? satuDesimal(u.lt) : angka(u[k] as number | null, 2)}</td>)}
                    {kolom.map((k) => pajak
                      ? [<td key={`${k}h`} className="n h harga">{angka(u.harga[k])}</td>,
                         <td key={`${k}d`} className="n harga">{angka(u.pajak?.[k]?.dpp)}</td>,
                         <td key={`${k}t`} className="n harga">{angka(u.pajak?.[k]?.dtp)}</td>]
                      : <td key={k} className="n h harga">{angka(u.harga[k])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

/**
 * Cetak Pricelist (langkah 4a) pada kertas A4, seperti lembar Pricelist
 * berkas PL Excel: logo, judul, tanggal, lalu tabel unit dengan harga tiap
 * cara bayar (dan kolom DPP dan/atau Nilai Free PPN DTP bila dicentang).
 *
 * Isinya dikirim halaman Pricelist lewat localStorage tepat sebelum tab ini
 * dibuka. Cara bayar dan cluster (Address) yang tidak dicentang hanya
 * disembunyikan dari cetakan — isian Pricelist tidak berubah. Pilihan itu
 * diingat peramban per project untuk cetakan berikutnya.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { UnitHarga } from "@/lib/simulasi";
import { useKata } from "../../bahasa";
import { TeksBergaya } from "../gaya-teks";

const KATA = {
  id: {
    kosong1: "Tidak ada isi untuk dicetak. Buka halaman Harga → langkah 4a. Harga, lalu",
    kosong2: "klik", cetakA4: "Cetak A4",
    judul: "Cetak Harga (A4)",
    orientasi: "Orientasi", lanskap: "Lanskap (mendatar)", potret: "Potret (tegak)",
    pajakHarga: "Harga Incld. PPN", pajakDpp: "Harga Excld. PPN", pajakDtp: "PPN DTP",
    tinggiBaris: "Tinggi baris", rapatkan: "Rapatkan baris", renggangkan: "Renggangkan baris",
    ukuranHuruf: "Ukuran huruf", perkecil: "Perkecil huruf", perbesar: "Perbesar huruf",
    ukuranCetak: "Ukuran cetak", pasLebar: "Pas lebar kertas (ke bawah boleh lebih)",
    pasHalaman: "Pas 1 halaman A4", asli: "Ukuran asli",
    terlalu: "Tabel lebih lebar dari kertas", muat: "Muat selebar A4", muatkan: "Muatkan lebar kertas",
    pilihIsi: "Pilih isi yang dicetak", disembunyikan: (n: number) => ` (${n} disembunyikan)`,
    pilihInfo: "Yang tidak dicentang hanya disembunyikan dari cetakan; isi Harga tidak berubah.",
    kolKet: "Kolom keterangan",
    kolKetInfo: "Sembunyikan kolom yang tidak perlu supaya tulisan tercetak lebih besar.",
    caraBayar: "Cara bayar", centangSemua: "Centang semua", kosongkan: "Kosongkan",
    cluster: "Alamat (klaster)", tanpaAlamat: "(tanpa alamat)",
    nUnit: (n: number) => `${n} unit`,
    cetak: "Cetak / Simpan PDF", tutup: "Tutup",
    ringkas: (u: number, c: number) => `${u} unit · ${c} cara bayar. Di dialog cetak pilih kertas`,
    pdf: "; untuk PDF pilih “Simpan sebagai PDF”.",
    no: "No", unitNo: "No Unit", area: "Luas (m²)",
    harga: "Harga Incld. PPN", dpp: "Harga Excld. PPN", dtp: "PPN DTP",
    kol: { alamat: "Alamat", phase: "Tahap", ukuran: "Ukuran", view: "Arah Hadap", tipe: "Tipe",
           subTipe: "Sub-Tipe", lt: "Tanah", lb: "Bangunan" } as Record<string, string>,
  },
  en: {
    kosong1: "Nothing to print. Open the Price List page → step 4a. Price List, then",
    kosong2: "click", cetakA4: "Print A4",
    judul: "Print Price List (A4)",
    orientasi: "Orientation", lanskap: "Landscape", potret: "Portrait",
    pajakHarga: "Price Incl. VAT", pajakDpp: "Price Excl. VAT", pajakDtp: "VAT DTP",
    tinggiBaris: "Row height", rapatkan: "Tighter rows", renggangkan: "Looser rows",
    ukuranHuruf: "Font size", perkecil: "Smaller font", perbesar: "Larger font",
    ukuranCetak: "Print size", pasLebar: "Fit paper width (may run onto more pages)",
    pasHalaman: "Fit 1 A4 page", asli: "Actual size",
    terlalu: "Table is wider than the paper", muat: "Fits A4 width", muatkan: "Fit to paper width",
    pilihIsi: "Choose what to print", disembunyikan: (n: number) => ` (${n} hidden)`,
    pilihInfo: "Unchecked items are only hidden from the printout; the price list itself is unchanged.",
    kolKet: "Detail columns",
    kolKetInfo: "Hide columns you do not need so the text prints larger.",
    caraBayar: "Payment schemes", centangSemua: "Check all", kosongkan: "Clear",
    cluster: "Address (cluster)", tanpaAlamat: "(no address)",
    nUnit: (n: number) => `${n} units`,
    cetak: "Print / Save PDF", tutup: "Close",
    ringkas: (u: number, c: number) => `${u} units · ${c} payment schemes. In the print dialog choose`,
    pdf: " paper; for PDF choose “Save as PDF”.",
    no: "No", unitNo: "Unit No", area: "Area (m²)",
    harga: "Price Incl. VAT", dpp: "Price Excl. VAT", dtp: "VAT DTP",
    kol: { alamat: "Address", phase: "Phase", ukuran: "Size", view: "View", tipe: "Type",
           subTipe: "Sub-type", lt: "Land", lb: "Build" } as Record<string, string>,
  },
};

const KUNCI = "cetak-pl";

type Isi = {
  judul: string; tanggal: string; catatan: string; slug: string | null;
  kolom: string[]; unit: UnitHarga[];
};
/**
 * `hrg`, `dpp`, dan `dtp`: kolom Harga Incld. PPN, Harga Excld. PPN, dan PPN
 * DTP disembunyikan
 * sendiri-sendiri. `pajak` adalah pilihan lama (keduanya sekaligus) yang
 * masih tersimpan di peramban sebagian orang — dipakai sebagai bawaan bila
 * dua kunci baru itu belum ada.
 */
type Pilihan = {
  kolom: string[]; alamat: string[]; pajak: boolean;
  hrg?: boolean; dpp?: boolean; dtp?: boolean; info?: string[];
};

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
  const kt = useKata(KATA);
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
  /**
   * Centang salah satu kolom harga. `pajak` ikut ditulis supaya
   * pilihan ini tetap terbaca benar oleh versi layar yang lama.
   */
  const gantiPajak = (jenis: "hrg" | "dpp" | "dtp", tampil: boolean) => {
    const n = { ...sembunyi, [jenis]: !tampil };
    simpanPilihan({ ...n, pajak: (n.dpp ?? n.pajak) && (n.dtp ?? n.pajak) });
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
        <p>{kt.kosong1}{" "}
          {kt.kosong2} <b>{kt.cetakA4}</b>.</p>
      </main>
    );
  }

  const hrg = !sembunyi.hrg;
  const dpp = !(sembunyi.dpp ?? sembunyi.pajak);
  const dtp = !(sembunyi.dtp ?? sembunyi.pajak);
  /**
   * Kolom angka di bawah tiap cara bayar, dalam urutan tampilnya. Kosong
   * berarti cara bayarnya tidak dicetak sama sekali — yang tersisa hanya
   * keterangan unitnya.
   */
  const kolPajak: ("harga" | "dpp" | "dtp")[] = [
    ...(hrg ? ["harga" as const] : []),
    ...(dpp ? ["dpp" as const] : []),
    ...(dtp ? ["dtp" as const] : [])];
  const judulPajak = { harga: kt.harga, dpp: kt.dpp, dtp: kt.dtp };
  const angkaPajak = (u: UnitHarga, k: string, jenis: "harga" | "dpp" | "dtp") =>
    jenis === "harga" ? angka(u.harga[k]) : angka(u.pajak?.[k]?.[jenis]);
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
        <b>{kt.judul}</b>
        <label>{kt.orientasi}
          <select value={arah} onChange={(e) => setArah(e.target.value as typeof arah)}>
            <option value="lanskap">{kt.lanskap}</option>
            <option value="potret">{kt.potret}</option>
          </select>
        </label>
        <label><input type="checkbox" checked={hrg}
                      onChange={(e) => gantiPajak("hrg", e.target.checked)} />
          {kt.pajakHarga}</label>
        <label><input type="checkbox" checked={dpp}
                      onChange={(e) => gantiPajak("dpp", e.target.checked)} />
          {kt.pajakDpp}</label>
        <label><input type="checkbox" checked={dtp}
                      onChange={(e) => gantiPajak("dtp", e.target.checked)} />
          {kt.pajakDtp}</label>
        <span className="cetak-huruf">{kt.tinggiBaris}
          <button onClick={() => setBaris((b) => Math.max(0.05, +(b - 0.1).toFixed(2)))} aria-label={kt.rapatkan}>−</button>
          <b>{Math.round((baris - 0.15) / 0.1) + 1}</b>
          <button onClick={() => setBaris((b) => Math.min(1.25, +(b + 0.1).toFixed(2)))} aria-label={kt.renggangkan}>+</button>
        </span>
        <span className="cetak-huruf">{kt.ukuranHuruf}
          <button onClick={() => setHuruf((h) => Math.max(5, +(h - 0.5).toFixed(1)))} aria-label={kt.perkecil}>A−</button>
          <b>{huruf.toLocaleString("id-ID")} pt</b>
          <button onClick={() => setHuruf((h) => Math.min(12, +(h + 0.5).toFixed(1)))} aria-label={kt.perbesar}>A+</button>
        </span>
        <label>{kt.ukuranCetak}
          <select value={pas} onChange={(e) => setPas(e.target.value as typeof pas)}>
            <option value="lebar">{kt.pasLebar}</option>
            <option value="halaman">{kt.pasHalaman}</option>
            <option value="asli">{kt.asli}</option>
          </select>
          {satuHalaman && <b>{Math.round(skala.zoom * 100)}%</b>}</label>
        {!satuHalaman && <>
          <span className={`pill ${terlalu ? "warn" : "ok"}`}>
            {terlalu ? kt.terlalu : kt.muat}</span>
          {terlalu && <button onClick={() => setMuatkan(true)}>{kt.muatkan}</button>}
        </>}
        <details className="cetak-pilih">
          <summary>{kt.pilihIsi}{jumlahSembunyi ? kt.disembunyikan(jumlahSembunyi) : ""}</summary>
          <div className="cetak-pilih-isi">
            <p className="hint">{kt.pilihInfo}</p>
            <b>{kt.kolKet}</b>
            <span className="hint" style={{ textAlign: "left", margin: 0 }}>{kt.kolKetInfo}</span>
            {[...INFO.map(([k, , c]) => [k, kt.kol[k], c] as [keyof UnitHarga, string, string]),
              ...AREA.map(([k]) => [k, `${kt.kol[k]} (m²)`, ""] as [keyof UnitHarga, string, string])].map(([k, l]) => (
              <label key={k}><input type="checkbox" checked={!(sembunyi.info ?? []).includes(k)}
                onChange={(e) => simpanPilihan({ ...sembunyi, info: e.target.checked
                  ? (sembunyi.info ?? []).filter((x) => x !== k) : [...(sembunyi.info ?? []), k] })} /> {l}</label>
            ))}
            <b>{kt.caraBayar}</b>
            <div className="row" style={{ margin: "0 0 4px" }}>
              <button className="kecil" onClick={() => simpanPilihan({ ...sembunyi, kolom: [] })}>{kt.centangSemua}</button>
              <button className="kecil" onClick={() => simpanPilihan({ ...sembunyi, kolom: [...isi.kolom] })}>{kt.kosongkan}</button>
            </div>
            {isi.kolom.map((k) => (
              <label key={k}><input type="checkbox" checked={!sembunyi.kolom.includes(k)}
                onChange={(e) => ganti("kolom", k, e.target.checked)} /> {k}</label>
            ))}
            {semuaAlamat.length > 1 && <>
              <b>{kt.cluster}</b>
              {semuaAlamat.map((a) => (
                <label key={a}><input type="checkbox" checked={!sembunyi.alamat.includes(a)}
                  onChange={(e) => ganti("alamat", a, e.target.checked)} />
                  {" "}{a === "(tanpa address)" ? kt.tanpaAlamat : a} ({kt.nUnit(isi.unit.filter((u) => (u.alamat || "(tanpa address)") === a).length)})</label>
              ))}
            </>}
          </div>
        </details>
        <button className="pri" onClick={() => print()}>{kt.cetak}</button>
        <button onClick={() => close()}>{kt.tutup}</button>
        <span className="hint">{kt.ringkas(unit.length, kolom.length)}{" "}
          <b>A4</b>{kt.pdf}</span>
      </div>

      <div className="cetak-latar">
        <div className="cetak-kertas" style={{ width: LEBAR[arah] + 2 * 30, minHeight: TINGGI[arah] + 2 * 30, padding: 30 }}>
          <div ref={lembar} className="pl-lembar"
               style={{ fontSize: `${huruf}pt`, ["--pad" as string]: `${baris}em`,
                        ...(satuHalaman && skala.lebar ? { zoom: skala.zoom, width: skala.lebar } : {}) }}>
            <header>
              {isi.slug ? <img src={`/project/${isi.slug}.png`} alt="" className="tnc-logo" /> : <span />}
              <div className="pl-judul">
                <h1><TeksBergaya teks={isi.judul || "PRICELIST"} /></h1>
              </div>
              {/* Tanggal di pojok kanan atas, sejajar judul. */}
              <div className="pl-tanggal"><TeksBergaya teks={isi.tanggal} /></div>
            </header>
            <table ref={tabel}>
              <thead>
                <tr>
                  <th rowSpan={2}>{kt.no}</th>
                  {info.filter(([k]) => k === "alamat").map(([k]) => <th key={k} rowSpan={2}>{kt.kol[k]}</th>)}
                  <th rowSpan={2}>{kt.unitNo}</th>
                  {info.filter(([k]) => k !== "alamat").map(([k]) => <th key={k} rowSpan={2}>{kt.kol[k]}</th>)}
                  {area.length > 0 && <th colSpan={area.length}>{kt.area}</th>}
                  {/* Judul cara bayar: kolom sama lebar, judul panjang dilipat.
                      Dengan satu kolom angka saja judulnya dua baris tinggi
                      (tidak perlu baris judul kedua). */}
                  {kolom.map((k) => kolPajak.length > 1
                    ? <th key={k} colSpan={kolPajak.length} className="cb">{k}</th>
                    : kolPajak.length === 1
                      ? <th key={k} rowSpan={2} className="cb harga">{k}</th>
                      : null)}
                </tr>
                <tr>
                  {area.map(([k]) => <th key={k}>{kt.kol[k]}</th>)}
                  {kolom.map((k) => kolPajak.length > 1
                    ? kolPajak.map((j) =>
                        <th key={`${k}-${j}`} className="harga">{judulPajak[j]}</th>)
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
                    {kolom.map((k) => kolPajak.map((j) =>
                      <td key={`${k}-${j}`}
                          className={j === "harga" ? "n h harga" : "n harga"}>
                        {angkaPajak(u, k, j)}</td>))}
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

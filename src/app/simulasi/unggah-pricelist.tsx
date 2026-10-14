"use client";

/**
 * Unggah pricelist, ditempatkan di layar Simulasi / NPV.
 *
 * Bentuk berkasnya sama dengan lembar pricelist pada "Simulation TOP": Unit
 * No, Address, Tipe, Area (Land, Build), lalu satu kolom harga per cara bayar.
 * Berkasnya selalu dibaca lebih dulu tanpa menulis apa pun (pratinjau), dan
 * baru disimpan sesudah orang melihat hasil pemeriksaannya — pricelist yang
 * keliru langsung terbawa ke setiap simulasi yang dicetak untuk konsumen.
 *
 * Diletakkan di layar simulasi, bukan di layar tersendiri, atas permintaan
 * pemakainya: orang yang menyusun simulasi juga yang menerima pricelist baru
 * dari bagian penjualan, dan hasilnya langsung terlihat di layar yang sama.
 */

import { useState } from "react";

import { useKata } from "../bahasa";
import { PilihBerkas } from "../pilih-berkas";
import { formatRupiah } from "@/lib/money";
import type { UnitHarga } from "@/lib/simulasi";

const KATA = {
  id: {
    unggah: "Upload D-Pricelist",
    unggahCatatan: "Berkas .xlsx dengan bentuk yang sama seperti lembar " +
      "pricelist Simulation TOP: Unit No, Address, Tipe, Area (Land, Build), " +
      "lalu satu kolom harga per cara bayar. Pricelist yang tersimpan langsung " +
      "dipakai simulasi untuk project ini.",
    template: "Unduh template .xlsx",
    fBerkas: "Berkas .xlsx",
    fNama: "Nama pricelist",
    fNamaContoh: "mis. Pricelist Oktober 2026",
    fLembar: "Lembar",
    pratinjau: "Periksa berkas",
    membaca: "Membaca…",
    simpan: "Simpan & berlakukan",
    menyimpan: "Menyimpan…",
    galatJudul: "Belum dapat disimpan",
    peringatanJudul: "Perlu dilihat",
    lolos: "Berkas lolos pemeriksaan",
    pratinjauInfo: (u: number, s: number, b: number, l: string) =>
      `${u} unit dan ${s} cara bayar terbaca dari lembar "${l}", baris judul ke-${b}. ` +
      "Belum ada yang tersimpan.",
    caraBayar: "Cara bayar terbaca", jadwal: "Bentuk jadwal",
    tersimpan: (n: string) => `Pricelist "${n}" tersimpan dan berlaku.`,
    gagal: "Gagal",
    kUnit: "Unit No", kAlamat: "Address", kTipe: "Tipe", kLt: "Land", kLb: "Build",
    sisanya: (n: number) => `… dan ${n} unit lainnya`,
  },
  en: {
    unggah: "Upload D-Pricelist",
    unggahCatatan: "An .xlsx file shaped like the Simulation TOP price list " +
      "sheet: Unit No, Address, Type, Area (Land, Build), then one price " +
      "column per payment scheme. A saved price list is used by the " +
      "simulation for this project straight away.",
    template: "Download .xlsx template",
    fBerkas: ".xlsx file",
    fNama: "Price list name",
    fNamaContoh: "e.g. Price list October 2026",
    fLembar: "Sheet",
    pratinjau: "Check file",
    membaca: "Reading…",
    simpan: "Save & apply",
    menyimpan: "Saving…",
    galatJudul: "Cannot be saved yet",
    peringatanJudul: "Worth a look",
    lolos: "File passed the checks",
    pratinjauInfo: (u: number, s: number, b: number, l: string) =>
      `${u} units and ${s} payment schemes read from sheet "${l}", header row ${b}. ` +
      "Nothing has been saved yet.",
    caraBayar: "Payment scheme", jadwal: "Schedule shape",
    tersimpan: (n: string) => `Price list "${n}" saved and in force.`,
    gagal: "Failed",
    kUnit: "Unit No", kAlamat: "Address", kTipe: "Type", kLt: "Land", kLb: "Build",
    sisanya: (n: number) => `… and ${n} more units`,
  },
};

/** Peran yang boleh mengunggah — sama dengan pagar di /api/pricelist. */
export const PENGUNGGAH = ["admin_sales", "admin_system"];

type Pratinjau = {
  nama: string; lembar: string; daftarLembar: string[]; barisJudul: number;
  skema: { nama: string; uraian: string }[]; unit: UnitHarga[];
  galat: string[]; peringatan: string[];
};

const luas = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

/** Tabel unit × cara bayar, dalam susunan kolom yang sama dengan berkasnya. */
export function TabelHarga({ skema, unit, batas }: {
  skema: string[]; unit: UnitHarga[]; batas?: number;
}) {
  const k = useKata(KATA);
  const tampil = batas ? unit.slice(0, batas) : unit;
  return (
    <div className="tscroll" style={{ maxHeight: 420, overflowY: "auto" }}>
      {/* Tanpa pindah baris: kode unit dan rupiah yang terpotong dua baris
          sulit dibaca berderet; tabelnya digulir ke samping saja. */}
      <table className="tabel-ringkas" style={{ whiteSpace: "nowrap" }}><tbody>
        <tr>
          <th>{k.kUnit}</th><th>{k.kAlamat}</th><th>{k.kTipe}</th>
          <th>{k.kLt}</th><th>{k.kLb}</th>
          {skema.map((s) => <th key={s}>{s}</th>)}
        </tr>
        {tampil.map((u) => (
          <tr key={u.kode}>
            <td>{u.kode}</td><td>{u.alamat}</td><td>{u.tipe}</td>
            <td className="n">{luas(u.lt)}</td><td className="n">{luas(u.lb)}</td>
            {skema.map((s) => (
              <td key={s} className="n">
                {u.harga[s] ? formatRupiah(u.harga[s]) : "—"}
              </td>
            ))}
          </tr>
        ))}
        {tampil.length < unit.length && (
          <tr><td colSpan={5 + skema.length} className="hint"
                  style={{ textAlign: "left" }}>
            {k.sisanya(unit.length - tampil.length)}
          </td></tr>
        )}
      </tbody></table>
    </div>
  );
}

/** Panel unggah: pilih berkas → periksa → simpan & berlakukan. */
export function UnggahPricelist({ onTersimpan }: { onTersimpan: () => void }) {
  const k = useKata(KATA);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [nama, setNama] = useState("");
  const [lembar, setLembar] = useState("");
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [selesai, setSelesai] = useState<string | null>(null);
  // Pemilih berkas menyimpan nama berkasnya sendiri; dipasang ulang sesudah
  // tersimpan supaya tidak tetap menampilkan berkas yang sudah diunggah.
  const [kunci, setKunci] = useState(0);

  const kirim = async (dryRun: boolean, lembarPilih = lembar) => {
    if (!berkas) return;
    setSibuk(true); setGalat(null); setSelesai(null);
    try {
      const fd = new FormData();
      fd.append("file", berkas);
      fd.append("nama", nama);
      if (lembarPilih) fd.append("lembar", lembarPilih);
      const res = await fetch(`/api/pricelist?dry_run=${dryRun}`,
                              { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      if (dryRun) {
        setPratinjau(b);
        setLembar(b.lembar);
        if (!nama) setNama(b.nama);
      } else {
        setSelesai(k.tersimpan(b.nama));
        setPratinjau(null); setBerkas(null); setNama(""); setLembar("");
        setKunci((x) => x + 1);
        onTersimpan();
      }
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="panel sp">
      <div className="form-blok">
        <h3>{k.unggah}</h3>
        <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
          {k.unggahCatatan}{" "}
          <a href="/api/pricelist/template">{k.template}</a>
        </p>
        <div className="filters">
          <div>
            <div className="lbl">{k.fBerkas}</div>
            <PilihBerkas key={kunci} accept=".xlsx"
                         onChange={(e) => {
                           setBerkas(e.target.files?.[0] ?? null);
                           setPratinjau(null); setLembar("");
                           setGalat(null); setSelesai(null);
                         }} />
          </div>
          <div>
            <div className="lbl">{k.fNama}</div>
            <input value={nama} maxLength={120} placeholder={k.fNamaContoh}
                   onChange={(e) => setNama(e.target.value)} />
          </div>
          {pratinjau && pratinjau.daftarLembar.length > 1 && (
            <div>
              <div className="lbl">{k.fLembar}</div>
              <select value={lembar}
                      onChange={(e) => {
                        setLembar(e.target.value);
                        void kirim(true, e.target.value);
                      }}>
                {pratinjau.daftarLembar.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
          <button disabled={!berkas || sibuk} onClick={() => void kirim(true)}>
            {sibuk && !pratinjau ? k.membaca : k.pratinjau}
          </button>
          <button className="pri"
                  disabled={!pratinjau || pratinjau.galat.length > 0 || sibuk}
                  onClick={() => void kirim(false)}>
            {sibuk && pratinjau ? k.menyimpan : k.simpan}
          </button>
        </div>
      </div>

      {galat && <div className="banner stop"><b>{k.gagal}</b>{galat}</div>}
      {selesai && <div className="banner ok">{selesai}</div>}

      {pratinjau && (
        <>
          {pratinjau.galat.length > 0 ? (
            <div className="banner stop">
              <b>{k.galatJudul}</b>
              <ul style={{ margin: "4px 0 0 16px" }}>
                {pratinjau.galat.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </div>
          ) : (
            <div className="banner ok">
              <b>{k.lolos}</b>
              {k.pratinjauInfo(pratinjau.unit.length, pratinjau.skema.length,
                               pratinjau.barisJudul, pratinjau.lembar)}
            </div>
          )}
          {pratinjau.peringatan.length > 0 && (
            <div className="banner warn">
              <b>{k.peringatanJudul}</b>
              <ul style={{ margin: "4px 0 0 16px" }}>
                {pratinjau.peringatan.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </div>
          )}
          {pratinjau.skema.length > 0 && (
            <div className="tscroll sp">
              <table className="tabel-ringkas"><tbody>
                <tr><th>{k.caraBayar}</th><th>{k.jadwal}</th></tr>
                {pratinjau.skema.map((s) => (
                  <tr key={s.nama}><td>{s.nama}</td><td>{s.uraian}</td></tr>
                ))}
              </tbody></table>
            </div>
          )}
          {pratinjau.unit.length > 0 && (
            <TabelHarga skema={pratinjau.skema.map((s) => s.nama)}
                        unit={pratinjau.unit} batas={50} />
          )}
        </>
      )}
    </div>
  );
}

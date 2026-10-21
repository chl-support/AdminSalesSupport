"use client";

/**
 * Langkah 4b. Harga Spesial: harga permintaan yang berangkat dari harga
 * langkah 4a tanpa mengubahnya.
 *
 * Yang disepakati dengan konsumen kerap bukan harga pricelist — ada unit
 * yang diberi diskon, ada cara bayar yang harganya dibulatkan ke angka
 * kesepakatan. Dulu itu berarti mengubah langkah 4a, dan harga dasarnya
 * hilang. Di sini harga dasar tetap utuh: tiap set hanya mencatat
 * selisihnya, dan set mana yang dipakai dipilih saat memberlakukan harga.
 *
 * Dua lapis, dibaca berurutan:
 *   • penyesuaian unit — satu diskon atau penambahan (rupiah atau persen)
 *     yang menggeser seluruh cara bayar unit itu;
 *   • timpaan sel — harga satu cara bayar unit itu diketik langsung, dan
 *     angka yang diketik dipakai apa adanya.
 *
 * Tampilan cetakannya tidak diatur di sini melainkan di tab Cetak Harga
 * (A4), supaya kedua layar tidak mengerjakan hal yang sama.
 */

import { useState } from "react";

import { formatRupiah } from "@/lib/money";
import { hargaSpesial, type SetSpesial } from "@/lib/susun-pricelist";
import { useKata } from "../bahasa";
import type { PropsLangkah } from "./langkah";

const KATA = {
  id: {
    info: "Harga di sini berangkat dari langkah 4a dan hanya mencatat selisihnya — harga dasar 4a tidak berubah. " +
      "Set mana yang dipakai dipilih saat Simpan & berlakukan.",
    kosong: "Belum ada unit berharga di langkah 4a.",
    belumSet: "Belum ada set harga spesial. Tekan “Set baru” untuk membuatnya.",
    set: "Set harga", setBaru: "Set baru", setSalin: "Salin set", setHapus: "Hapus set",
    setNama: "Nama set", setCatatan: "Catatan (mis. nama konsumen)",
    namaBaru: (n: number) => `Harga Spesial ${n}`,
    yakinHapus: (n: string) => `Hapus set harga spesial “${n}”?`,
    thUnit: "Unit", thTipe: "Tipe", thSesuai: "Penyesuaian unit",
    thSesuaiInfo: "Menggeser seluruh cara bayar unit ini. Minus berarti diskon, mis. −5% atau −25.000.000.",
    dasar: "Dasar", selisih: "Selisih",
    kosongkanUnit: "Kosongkan penyesuaian unit ini",
    kosongkanSel: "Kembalikan sel ini ke harga 4a",
    kembalikanBaris: "Kembalikan baris ini ke harga 4a",
    ringkas: (unit: number, sel: number) =>
      `${unit} unit disesuaikan · ${sel} sel diketik sendiri`,
    tanpaBeda: "Belum ada harga yang berbeda dari langkah 4a.",
    cari: "Cari unit", cariContoh: "mis. BIOA6-06",
    hanyaBeda: "Hanya yang berbeda",
    tersaring: (n: number, t: number) => `${n} dari ${t} unit tampil`,
  },
  en: {
    info: "Prices here start from step 4a and only record the difference — the base prices stay untouched. " +
      "Which set is used is chosen when you Save & apply.",
    kosong: "No priced units in step 4a yet.",
    belumSet: "No special price set yet. Press “New set” to create one.",
    set: "Price set", setBaru: "New set", setSalin: "Duplicate set", setHapus: "Delete set",
    setNama: "Set name", setCatatan: "Note (e.g. customer name)",
    namaBaru: (n: number) => `Special Price ${n}`,
    yakinHapus: (n: string) => `Delete the special price set “${n}”?`,
    thUnit: "Unit", thTipe: "Type", thSesuai: "Unit adjustment",
    thSesuaiInfo: "Shifts every payment scheme of this unit. Negative means a discount, e.g. −5% or −25,000,000.",
    dasar: "Base", selisih: "Difference",
    kosongkanUnit: "Clear this unit's adjustment",
    kosongkanSel: "Restore this cell to the step 4a price",
    kembalikanBaris: "Restore this row to the step 4a prices",
    ringkas: (unit: number, sel: number) =>
      `${unit} units adjusted · ${sel} cells typed individually`,
    tanpaBeda: "No price differs from step 4a yet.",
    cari: "Search unit", cariContoh: "e.g. BIOA6-06",
    hanyaBeda: "Only what differs",
    tersaring: (n: number, t: number) => `${n} of ${t} units shown`,
  },
};

const rupiah = (n: number) =>
  Number.isFinite(n) ? Math.round(n).toLocaleString("id-ID") : "";
const bacaAngka = (s: string) => {
  const n = Number(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function LangkahHargaSpesial({ data, hasil, ubah, bolehUbah }: PropsLangkah) {
  const kt = useKata(KATA);
  const ro = !bolehUbah;
  const daftar = data.spesial?.set ?? [];
  const [pilih, setPilih] = useState<string>(daftar[0]?.id ?? "");
  const [cari, setCari] = useState("");
  const [hanyaBeda, setHanyaBeda] = useState(false);
  const set = daftar.find((s) => s.id === pilih) ?? daftar[0];

  const kolom = data.pricelist.kolom.map((k) => k.nama);
  const baris = hasil.baris.filter((b) => b.unit.kode);

  const ubahSet = (f: (s: SetSpesial) => SetSpesial) => {
    if (!set) return;
    ubah((d) => ({ ...d, spesial: { set: (d.spesial?.set ?? []).map((s) => s.id === set.id ? f(s) : s) } }));
  };
  const tambahSet = (dari?: SetSpesial) => {
    const id = `s${Date.now().toString(36)}`;
    const baru: SetSpesial = dari
      ? { ...dari, id, nama: `${dari.nama} (2)` }
      : { id, nama: kt.namaBaru(daftar.length + 1), unit: {}, sel: {} };
    ubah((d) => ({ ...d, spesial: { set: [...(d.spesial?.set ?? []), baru] } }));
    setPilih(id);
  };
  const hapusSet = () => {
    if (!set || !confirm(kt.yakinHapus(set.nama))) return;
    const sisa = daftar.filter((s) => s.id !== set.id);
    ubah((d) => ({ ...d, spesial: { set: (d.spesial?.set ?? []).filter((s) => s.id !== set.id) } }));
    setPilih(sisa[0]?.id ?? "");
  };

  /** Penyesuaian unit: nilai dan satuannya. */
  const setAtur = (kode: string, atur: { jenis: "rp" | "persen"; nilai: number } | null) =>
    ubahSet((s) => {
      const unit = { ...s.unit };
      if (atur && atur.nilai) unit[kode] = atur; else delete unit[kode];
      return { ...s, unit };
    });
  /** Timpaan satu sel; `null` mengembalikannya ke harga 4a. */
  const setSel = (kode: string, nama: string, nilai: number | null) =>
    ubahSet((s) => {
      const sel = { ...s.sel, [kode]: { ...(s.sel[kode] ?? {}) } };
      if (nilai == null) delete sel[kode][nama]; else sel[kode][nama] = nilai;
      if (!Object.keys(sel[kode]).length) delete sel[kode];
      return { ...s, sel };
    });
  const kembalikanBaris = (kode: string) =>
    ubahSet((s) => {
      const unit = { ...s.unit }; delete unit[kode];
      const sel = { ...s.sel }; delete sel[kode];
      return { ...s, unit, sel };
    });

  if (!baris.length) return <div className="banner info">{kt.kosong}</div>;

  const cocok = (kode: string) => !cari.trim() ||
    kode.toLowerCase().includes(cari.trim().toLowerCase());
  const beda = (kode: string) => !!set && (!!set.unit[kode] || !!set.sel[kode]);
  const tampil = baris.filter((b) => cocok(b.unit.kode) && (!hanyaBeda || beda(b.unit.kode)));

  return (
    <>
      <p className="hint kiri">{kt.info}</p>

      <div className="row" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="lbl">{kt.set}</div>
          <select value={set?.id ?? ""} disabled={!daftar.length}
                  aria-label={kt.set} onChange={(e) => setPilih(e.target.value)}>
            {!daftar.length && <option value="">—</option>}
            {daftar.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
        {!ro && <>
          <button onClick={() => tambahSet()}>{kt.setBaru}</button>
          {set && <button onClick={() => tambahSet(set)}>{kt.setSalin}</button>}
          {set && <button onClick={hapusSet}>{kt.setHapus}</button>}
        </>}
      </div>

      {!set ? (
        <div className="banner info" style={{ marginTop: 10 }}>{kt.belumSet}</div>
      ) : (
        <>
          <div className="filters rapat" style={{ marginTop: 10 }}>
            <div><div className="lbl">{kt.setNama}</div>
              <input value={set.nama} maxLength={80} disabled={ro} aria-label={kt.setNama}
                     onChange={(e) => ubahSet((s) => ({ ...s, nama: e.target.value }))} /></div>
            <div style={{ gridColumn: "span 2" }}><div className="lbl">{kt.setCatatan}</div>
              <input value={set.catatan ?? ""} maxLength={200} disabled={ro} aria-label={kt.setCatatan}
                     onChange={(e) => ubahSet((s) => ({ ...s, catatan: e.target.value }))} /></div>
            <div><div className="lbl">{kt.cari}</div>
              <input value={cari} placeholder={kt.cariContoh} aria-label={kt.cari}
                     onChange={(e) => setCari(e.target.value)} /></div>
          </div>

          <div className="row" style={{ alignItems: "center", marginTop: 0 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={hanyaBeda}
                     onChange={(e) => setHanyaBeda(e.target.checked)} />
              {kt.hanyaBeda}
            </label>
            <span className="hint" style={{ margin: 0 }}>
              {kt.ringkas(Object.keys(set.unit).length,
                          Object.values(set.sel).reduce((t, x) => t + Object.keys(x).length, 0))}
              {" · "}{kt.tersaring(tampil.length, baris.length)}
            </span>
          </div>

          <div className="tscroll">
            <table className="tabel-ringkas tabel-isian tabel-rapat tabel-spesial"><tbody>
              <tr>
                <th>{kt.thUnit}</th>
                <th>{kt.thTipe}</th>
                <th title={kt.thSesuaiInfo}>{kt.thSesuai}</th>
                {kolom.map((k) => <th key={k} className="n">{k}</th>)}
                {!ro && <th />}
              </tr>
              {tampil.map((b) => {
                const kode = b.unit.kode;
                const atur = set.unit[kode];
                return (
                  <tr key={kode} className={beda(kode) ? "terpilih" : undefined}>
                    <td><b>{kode}</b></td>
                    <td>{String(b.unit.tipe ?? "")}</td>
                    <td>
                      <span className="satuan">
                        <input className="n" inputMode="decimal" style={{ width: 110 }}
                               disabled={ro} aria-label={`${kt.thSesuai} ${kode}`}
                               value={atur ? String(atur.nilai).replace(".", ",") : ""}
                               onChange={(e) => setAtur(kode, {
                                 jenis: atur?.jenis ?? "persen", nilai: bacaAngka(e.target.value) })} />
                        <select value={atur?.jenis ?? "persen"} disabled={ro}
                                aria-label={`${kt.thSesuai} ${kode} — satuan`}
                                onChange={(e) => setAtur(kode, {
                                  jenis: e.target.value as "rp" | "persen", nilai: atur?.nilai ?? 0 })}>
                          <option value="persen">%</option>
                          <option value="rp">Rp</option>
                        </select>
                      </span>
                      {atur && !ro && (
                        <button className="kecil" title={kt.kosongkanUnit}
                                onClick={() => setAtur(kode, null)}>×</button>)}
                    </td>
                    {kolom.map((k) => {
                      // Harga 4a baris ini; `hasil` sendiri memang harga dasar,
                      // sebab langkah 4b tidak pernah menghitung ulang 4a.
                      const dasar = b.pricelist[k]?.harga ?? NaN;
                      const kini = hargaSpesial(set, kode, k, dasar);
                      const diketik = set.sel[kode]?.[k] != null;
                      const selisih = Number.isFinite(dasar) ? kini - dasar : 0;
                      return (
                        <td key={k} className="n">
                          <input className="n" inputMode="decimal" disabled={ro}
                                 aria-label={`${kode} ${k}`}
                                 style={{ width: 130, fontWeight: diketik ? 700 : undefined }}
                                 value={rupiah(kini)}
                                 onChange={(e) => setSel(kode, k, bacaAngka(e.target.value))} />
                          {diketik && !ro && (
                            <button className="kecil" title={kt.kosongkanSel}
                                    onClick={() => setSel(kode, k, null)}>×</button>)}
                          <small className="asal-spesial">
                            {kt.dasar} {rupiah(dasar)}
                            {selisih ? ` · ${selisih > 0 ? "+" : "−"}${formatRupiah(Math.abs(selisih))}` : ""}
                          </small>
                        </td>
                      );
                    })}
                    {!ro && (
                      <td>
                        {beda(kode) && (
                          <button className="kecil" title={kt.kembalikanBaris}
                                  onClick={() => kembalikanBaris(kode)}>↺</button>)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody></table>
          </div>
          {!Object.keys(set.unit).length && !Object.keys(set.sel).length && (
            <p className="hint kiri">{kt.tanpaBeda}</p>
          )}
        </>
      )}
    </>
  );
}

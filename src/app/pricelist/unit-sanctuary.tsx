"use client";

/**
 * Tabel langkah 2 (Data Unit) untuk The Sanctuary Collection: kolomnya
 * mengikuti berkas Unit Data project itu (lihat src/lib/unit-sanctuary.ts),
 * bukan susunan enam project lain. Harga per m² sudah Termasuk PPN; kolom
 * Belum PPN = Termasuk ÷ (1 + PPN).
 */

import { Fragment, useState, type ReactNode } from "react";

import { formatRupiah } from "@/lib/money";
import type { HasilSusun, SusunPricelist, UnitData } from "@/lib/susun-pricelist";
import {
  KOLOM_TSC_AKHIR, KOLOM_TSC_AWAL, KOLOM_TSC_BANGUNAN, KOLOM_TSC_FAKTOR, KOLOM_TSC_HARGA_LAMA,
  KOLOM_TSC_TANAH, KOLOM_TSC_TANAH_TAMBAHAN, KOLOM_TSC_TENGAH, ambilTsc, isiTsc, kategoriTsc,
  type KolomTsc,
} from "@/lib/unit-sanctuary";
import { Isian, IsianTeks } from "./langkah";

const rp = (n: number) => (Number.isFinite(n) ? formatRupiah(Math.round(n)) : "—");
const polos = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString("id-ID") : "—");
/** Luas, satu angka di belakang koma (tampilan; nilainya tetap utuh). */
const luas = (n: number) => `${n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`;

/** Satu kolom tabel: judul, isi sel, dan isi baris total. */
type Kolom = { kunci: string; judul: ReactNode; sel: (u: UnitData, i: number) => ReactNode;
               total?: (baris: { u: UnitData; i: number }[]) => ReactNode; kelas?: string; th?: ReactNode };

export function TabelUnitTsc({
  data, hasil, tampil, ro, bolehUbah, pilih, tandai, pilihSemua, ubahUnit, tambah, hapus,
  modePpn, lp, kepalaKenaikan, label,
}: {
  data: SusunPricelist; hasil: HasilSusun; tampil: { u: UnitData; i: number }[];
  ro: boolean; bolehUbah: boolean; pilih: Set<number>;
  tandai: (i: number, on: boolean) => void; pilihSemua: (on: boolean) => void;
  ubahUnit: (i: number, f: (u: UnitData) => UnitData) => void;
  tambah: (dari: number) => void; hapus: (i: number) => void;
  modePpn: "semua" | "incl" | "excl"; lp: string;
  /** Judul kolom Persentase Kenaikan Harga, dengan isian massalnya. */
  kepalaKenaikan: ReactNode;
  label: { no: string; salin: string; hapus: string; yaHapus: string; batal: string; total: (n: number) => string };
}) {
  const [yakin, setYakin] = useState<number | null>(null);
  const ppn = 1 + (data.ppn ?? 0.11);
  const h = (i: number) => hasil.baris[i]?.hasilUnit;
  const incl = modePpn !== "excl", excl = modePpn !== "incl";
  const isi = (d: KolomTsc): Kolom => ({
    kunci: d.kunci, judul: d.judul ?? d.excel,
    sel: (u, i) => {
      const v = ambilTsc(u, d.kunci);
      const ganti = (x: string | number) => ubahUnit(i, (y) => isiTsc(y, d.kunci, x));
      return d.jenis === "teks"
        ? <IsianTeks id={d.kunci === "kode" ? `unit-kode-${i}` : undefined} nilai={String(v)} lebar={d.lebar}
                     disabled={ro} ubah={ganti} />
        // Persen tampil dua angka di belakang koma, mis. -2,00%.
        : <Isian jenis={d.jenis === "angka" ? "angka" : d.jenis} kosongNol nilai={Number(v) || 0}
                 desimal={d.jenis === "persen" ? 2 : /^(lt|lb)$|^atribut\.(lt|lb)/.test(d.kunci) ? 1 : undefined}
                 lebar={d.lebar} disabled={ro} ubah={ganti} />;
    },
  });
  const hitung = (kunci: string, judul: ReactNode, f: (i: number) => number, tebal = false): Kolom => ({
    kunci, judul, kelas: "kolom-harga",
    sel: (_, i) => <span className="n">{tebal ? <b>{rp(f(i))}</b> : rp(f(i))}</span>,
    total: (b) => rp(b.reduce((a, { i }) => a + (f(i) || 0), 0)),
  });
  const kolom: Kolom[] = [
    ...KOLOM_TSC_AWAL.map(isi),
    { kunci: "kategori", judul: "Kategory", sel: (u) => <span className="kategori-tsc">{kategoriTsc(u)}</span> },
    ...KOLOM_TSC_TENGAH.map((d) => {
      const k = isi(d);
      return d.kunci === "lt" || d.kunci === "lb"
        ? { ...k, total: (b: { u: UnitData }[]) => luas(b.reduce((a, { u }) => a + (d.kunci === "lt" ? u.lt : u.lb), 0)) }
        : k;
    }),
    // Harga per m² Belum PPN = harga Termasuk PPN ÷ (1 + PPN); keterangan saja.
    ...(excl ? [{ kunci: "tanahExcl", judul: <>Harga Tanah (Dasar)<br />(Belum Termasuk PPN {lp})</>,
                  sel: (u: UnitData) => <span className="n">{polos(u.hargaTanah / ppn)}</span> }] : []),
    { ...isi(KOLOM_TSC_TANAH), judul: <>Harga Tanah (Dasar)<br />(Termasuk PPN {lp})</> },
    isi(KOLOM_TSC_TANAH_TAMBAHAN),
    ...(excl ? [{ kunci: "gfaExcl", judul: <>Harga Bangunan (Dasar)<br />(Belum Termasuk PPN {lp})</>,
                  sel: (u: UnitData) => <span className="n">{polos(u.hargaBangunan / ppn)}</span> }] : []),
    { ...isi(KOLOM_TSC_BANGUNAN), judul: <>Harga Bangunan (Dasar)<br />(Termasuk PPN {lp})</> },
    ...KOLOM_TSC_FAKTOR.map(isi),
    ...KOLOM_TSC_AKHIR.map(isi),
    ...(excl ? [hitung("dasarExcl", <>Harga Dasar<br />(Belum Termasuk PPN {lp})<br />(Terendah)</>,
                       (i) => (h(i)?.base ?? NaN) / ppn)] : []),
    ...(incl ? [hitung("dasar", <>Harga Dasar<br />(Termasuk PPN {lp})<br />(Terendah)</>, (i) => h(i)?.base ?? NaN)] : []),
    // Faktor Penyesuaian Harga = Harga Setelah Penyesuaian − Harga Dasar.
    ...(excl ? [hitung("faktorPenyesuaianExcl", <>Faktor Penyesuaian Harga<br />(Belum Termasuk PPN {lp})</>,
                       (i) => ((h(i)?.factoredR ?? NaN) - (h(i)?.base ?? NaN)) / ppn)] : []),
    ...(incl ? [hitung("faktorPenyesuaian", <>Faktor Penyesuaian Harga<br />(Termasuk PPN {lp})</>,
                       (i) => (h(i)?.factoredR ?? NaN) - (h(i)?.base ?? NaN))] : []),
    ...(excl ? [hitung("penyesuaianExcl", <>Harga Setelah Penyesuaian<br />(Belum Termasuk PPN {lp})<br />(Terendah)</>,
                       (i) => (h(i)?.factoredR ?? NaN) / ppn)] : []),
    ...(incl ? [hitung("penyesuaian", <>Harga Setelah Penyesuaian<br />(Termasuk PPN {lp})<br />(Terendah)</>,
                       (i) => h(i)?.factoredR ?? NaN)] : []),
    {
      kunci: "kenaikanFaktor", judul: "", th: kepalaKenaikan,
      sel: (u, i) => <Isian jenis="persen" kosongNol desimal={2} nilai={u.kenaikanFaktor ?? 0} lebar={60} disabled={ro}
                            ubah={(n) => ubahUnit(i, (x) => ({ ...x, kenaikanFaktor: n || undefined }))} />,
    },
    ...(excl ? [hitung("kenaikanExcl", <>Harga Setelah Kenaikan<br />(Belum Termasuk PPN {lp})</>,
                       (i) => (h(i)?.factored ?? NaN) / ppn, true)] : []),
    ...(incl ? [hitung("kenaikan", <>Harga Setelah Kenaikan<br />(Termasuk PPN {lp})</>, (i) => h(i)?.factored ?? NaN, true)] : []),
    { ...isi(KOLOM_TSC_HARGA_LAMA),
      total: (b) => rp(b.reduce((a, { u }) => a + (Number(u.atribut?.hargaLama) || 0), 0)) },
    hitung("naik", "Harga Naik", (i) => {
      const lama = Number(data.unit[i]?.atribut?.hargaLama) || 0;
      return lama ? (h(i)?.factored ?? NaN) - lama : 0;
    }),
  ];

  return (
    <div className="tscroll" style={{ maxHeight: 620, overflowY: "auto" }}>
      <table className="tabel-ringkas tabel-isian kepala-lekat tabel-unit tabel-tsc"><thead>
        <tr>
          {bolehUbah && (
            <th className="aksi-unit">
              <input type="checkbox" checked={tampil.length > 0 && tampil.every(({ i }) => pilih.has(i))}
                     onChange={(e) => pilihSemua(e.target.checked)} />
            </th>
          )}
          <th className="no-unit">{label.no}</th>
          {kolom.map((k) => k.th ? <Fragment key={k.kunci}>{k.th}</Fragment>
            : <th key={k.kunci} className={k.kelas}>{k.judul}</th>)}
        </tr>
      </thead><tbody>
        {tampil.map(({ u, i }) => (
          <tr key={i} className={pilih.has(i) ? "terpilih" : undefined}>
            {bolehUbah && (
              <td className="aksi-unit">
                <span className="row" style={{ margin: 0, flexWrap: "nowrap", gap: 4 }}>
                  <input type="checkbox" checked={pilih.has(i)} onChange={(e) => tandai(i, e.target.checked)} />
                  {yakin === i ? (
                    <>
                      <button className="kecil bahaya" onClick={() => { setYakin(null); hapus(i); }}>{label.yaHapus}</button>
                      <button className="kecil" onClick={() => setYakin(null)}>{label.batal}</button>
                    </>
                  ) : (
                    <>
                      <button className="kecil" onClick={() => tambah(i)}>{label.salin}</button>
                      <button className="kecil" onClick={() => setYakin(i)}>{label.hapus}</button>
                    </>
                  )}
                </span>
              </td>
            )}
            <td className="n no-unit">{i + 1}</td>
            {kolom.map((k) => <td key={k.kunci} className={k.kelas ? "n" : k.kunci === "kategori" ? "hitung" : undefined}>
              {k.sel(u, i)}</td>)}
          </tr>
        ))}
      </tbody><tfoot>
        <tr className="total-unit">
          <td className="aksi-unit">{label.total(tampil.length)}</td>
          {bolehUbah && <td />}
          {kolom.map((k) => <td key={k.kunci} className="n">{k.total?.(tampil)}</td>)}
        </tr>
      </tfoot></table>
    </div>
  );
}

"use client";

/**
 * Kelima langkah penyusunan pricelist, masing-masing satu komponen yang
 * menerima isian lengkap (`data`), hasil hitungannya (`hasil`), dan cara
 * mengubahnya (`ubah`). Hitungannya ada di src/lib/susun-pricelist.ts dan
 * dijalankan ulang oleh halamannya setiap kali satu angka berubah, sehingga
 * langkah sesudahnya selalu membaca angka terbaru — seperti rumus Excel yang
 * saling merujuk antarlembar.
 */

import { useEffect, useState } from "react";

import { formatRupiah } from "@/lib/money";
import {
  FAKTOR, HARGA_KAS_AWAL, namaTahap, unitKosong,
  type HasilSusun, type SusunPricelist, type UnitData,
} from "@/lib/susun-pricelist";
import type { UnitHarga } from "@/lib/simulasi";
import { PilihBerkas } from "../pilih-berkas";
import { TabelHarga } from "../simulasi/unggah-pricelist";

export type PropsLangkah = {
  data: SusunPricelist;
  hasil: HasilSusun;
  ubah: (f: (d: SusunPricelist) => SusunPricelist) => void;
  bolehUbah: boolean;
};

// ── Kotak angka ────────────────────────────────────────────────────────────

type Jenis = "rp" | "persen" | "angka";

const tampilAngka = (n: number, jenis: Jenis) => {
  if (!Number.isFinite(n)) return "";
  const v = jenis === "persen" ? +(n * 100).toFixed(6) : n;
  return v.toLocaleString("id-ID", { maximumFractionDigits: jenis === "rp" ? 0 : 6 });
};

/** "1.817.000.000" / "9,5" / "146.5" → angka; null bila bukan angka. */
function bacaAngka(s: string, jenis: Jenis): number | null {
  let t = s.trim().replace(/^rp\.?/i, "").replace(/%$/, "").replace(/\s/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return jenis === "persen" ? n / 100 : n;
}

/**
 * Kotak isian angka. Selama diketik, isinya teks apa adanya; angkanya baru
 * dibaca saat kotak ditinggalkan atau Enter ditekan — supaya "9," yang baru
 * setengah diketik tidak langsung dibulatkan menjadi 9.
 */
export function Isian({ nilai, ubah, jenis = "angka", lebar = 90, disabled, id }: {
  nilai: number; ubah: (n: number) => void; jenis?: Jenis; lebar?: number;
  disabled?: boolean; id?: string;
}) {
  const [teks, setTeks] = useState<string | null>(null);
  const [salah, setSalah] = useState(false);
  const simpan = () => {
    if (teks == null) return;
    const n = bacaAngka(teks, jenis);
    if (n == null) { setSalah(true); return; }
    setSalah(false); setTeks(null);
    if (n !== nilai) ubah(n);
  };
  return (
    <span className="isian-angka">
      <input id={id} value={teks ?? tampilAngka(nilai, jenis)} disabled={disabled}
             inputMode="decimal" aria-invalid={salah || undefined}
             style={{ width: lebar }}
             onChange={(e) => setTeks(e.target.value)} onBlur={simpan}
             onKeyDown={(e) => { if (e.key === "Enter") simpan(); }} />
      {jenis === "persen" && <span className="satuan">%</span>}
    </span>
  );
}

function IsianTeks({ nilai, ubah, lebar = 110, disabled, id }: {
  nilai: string; ubah: (s: string) => void; lebar?: number; disabled?: boolean; id?: string;
}) {
  return <input id={id} value={nilai} disabled={disabled} style={{ width: lebar }}
                onChange={(e) => ubah(e.target.value)} />;
}

const rp = (n: number) => (Number.isFinite(n) ? formatRupiah(n) : "—");
const persen = (n: number, d = 2) =>
  Number.isFinite(n) ? `${(n * 100).toLocaleString("id-ID", { maximumFractionDigits: d })}%` : "—";

// ── 1. Data (IRR) ──────────────────────────────────────────────────────────


export function LangkahIrr({ data, hasil, ubah, bolehUbah }: PropsLangkah) {
  const irr = data.irr;
  const TAHAP = namaTahap(irr);
  // Cash Price diubah lewat tombol Edit, supaya tidak tergeser tanpa sengaja.
  const [editKas, setEditKas] = useState(false);
  const ro = !bolehUbah;
  const ubahSkema = (i: number, f: (s: SusunPricelist["irr"]["skema"][0]) => typeof s) =>
    ubah((d) => ({ ...d, irr: { ...d.irr, skema: d.irr.skema.map((s, j) => j === i ? f(s) : s) } }));
  const ganti = (i: number, nama: string) => ubah((d) => {
    const lama = d.irr.skema[i].nama;
    return {
      ...d,
      irr: { ...d.irr, skema: d.irr.skema.map((s, j) => j === i ? { ...s, nama } : s) },
      // Kolom Data Pricelist yang merujuk cara bayar ini ikut berganti nama.
      dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.map((k) =>
        k.skema === lama ? { ...k, skema: nama } : k) },
    };
  });

  return (
    <>
      <p className="hint kiri">
        Koefisien tiap cara bayar adalah harga yang membuat IRR arus kasnya sama
        dengan bunga target, dibagi harga Cash Keras. DP dicicil rata pada bulan
        1 sampai n; sisanya (1 − DP) cair pada bulan tiap tahap pembangunan.
      </p>
      <div className="filters rapat" style={{ maxWidth: 760 }}>
        <div>
          <div className="lbl">Target interest rate (setahun)</div>
          <Isian id="irr-target" jenis="persen" nilai={irr.target} disabled={ro}
                 ubah={(n) => ubah((d) => ({ ...d, irr: { ...d.irr, target: n } }))} />
        </div>
        {TAHAP.map((t, i) => (
          <div key={t}>
            <div className="lbl">Porsi {t}</div>
            <Isian id={`irr-porsi-${i}`} jenis="persen" nilai={irr.porsiTahap[i]} disabled={ro}
                   ubah={(n) => ubah((d) => {
                     const p = [...d.irr.porsiTahap] as typeof irr.porsiTahap; p[i] = n;
                     return { ...d, irr: { ...d.irr, porsiTahap: p } };
                   })} />
          </div>
        ))}
      </div>
      {Math.abs(irr.porsiTahap.reduce((a, b) => a + b, 0) - 1) > 1e-9 && (
        <div className="banner warn">Jumlah porsi keempat tahap harus 100%.</div>
      )}

      <div className="tscroll sp">
        <table className="tabel-ringkas tabel-isian"><tbody>
          <tr>
            <th />
            {irr.skema.map((s, i) => (
              <th key={i}>
                <IsianTeks id={`irr-nama-${i}`} nilai={s.nama} disabled={ro} lebar={120}
                           ubah={(v) => ganti(i, v)} />
              </th>
            ))}
          </tr>
          <tr><td>Kelompok</td>{irr.skema.map((s, i) => (
            <td key={i}><IsianTeks nilai={s.kelompok} lebar={70} disabled={ro}
                                   ubah={(v) => ubahSkema(i, (x) => ({ ...x, kelompok: v }))} /></td>))}</tr>
          <tr><td>Allocation</td>{irr.skema.map((s, i) => (
            <td key={i}><Isian jenis="persen" nilai={s.alokasi} lebar={60} disabled={ro}
                               ubah={(n) => ubahSkema(i, (x) => ({ ...x, alokasi: n }))} /></td>))}</tr>
          <tr><td>DP</td>{irr.skema.map((s, i) => (
            <td key={i}><Isian jenis="persen" nilai={s.dp} lebar={60} disabled={ro}
                               ubah={(n) => ubahSkema(i, (x) => ({ ...x, dp: n }))} /></td>))}</tr>
          <tr><td>Installments (x)</td>{irr.skema.map((s, i) => (
            <td key={i}><Isian nilai={s.kali} lebar={60} disabled={ro}
                               ubah={(n) => ubahSkema(i, (x) => ({ ...x, kali: Math.max(1, Math.round(n)) }))} /></td>))}</tr>
          {TAHAP.map((t, ti) => (
            <tr key={t}><td>Bulan {t}</td>{irr.skema.map((s, i) => (
              <td key={i}><Isian nilai={s.bulan[ti]} lebar={60} disabled={ro}
                                 ubah={(n) => ubahSkema(i, (x) => {
                                   const b = [...x.bulan] as typeof x.bulan; b[ti] = Math.round(n);
                                   return { ...x, bulan: b };
                                 })} /></td>))}</tr>
          ))}
          <tr>
            <td>
              Cash Price
              {bolehUbah && (
                <button className="kecil" style={{ display: "block", marginTop: 4 }}
                        onClick={() => setEditKas((x) => !x)}>
                  {editKas ? "Selesai" : "Edit"}</button>
              )}
            </td>
            {irr.skema.map((s, i) => (
              <td key={i} className="n">
                {editKas && bolehUbah
                  ? <Isian id={`irr-kas-${i}`} jenis="rp" nilai={s.hargaKas ?? HARGA_KAS_AWAL} lebar={120}
                           ubah={(n) => ubahSkema(i, (x) => ({ ...x, hargaKas: n }))} />
                  : rp(s.hargaKas ?? HARGA_KAS_AWAL)}
              </td>))}
          </tr>
          <tr><td>Acuan (Cash Keras)</td>{irr.skema.map((s, i) => (
            <td key={i}><input type="radio" name="acuan" checked={!!s.acuan} disabled={ro}
                               onChange={() => ubah((d) => ({ ...d, irr: { ...d.irr,
                                 skema: d.irr.skema.map((x, j) => ({ ...x, acuan: j === i || undefined })) } }))} /></td>))}</tr>
          <tr className="hasil"><td>Coefficient</td>{irr.skema.map((s, i) => (
            <td key={i} className="n"><b>{Number.isFinite(hasil.irr.koef[s.nama])
              ? hasil.irr.koef[s.nama].toFixed(5) : "—"}</b></td>))}</tr>
          <tr className="hasil"><td>IRR</td>{irr.skema.map((s, i) => (
            <td key={i} className="n">{s.acuan ? "acuan" : persen(hasil.irr.irr[s.nama])}</td>))}</tr>
          <tr className="hasil"><td>Adjusted Price</td>{irr.skema.map((s, i) => (
            <td key={i} className="n"><b>{rp(Math.round((s.hargaKas ?? HARGA_KAS_AWAL) * hasil.irr.koef[s.nama]))}</b></td>))}</tr>
          {bolehUbah && (
            <tr><td />{irr.skema.map((s, i) => (
              <td key={i}>
                <button className="kecil" disabled={irr.skema.length <= 1 || !!s.acuan}
                        onClick={() => ubah((d) => ({ ...d, irr: { ...d.irr,
                          skema: d.irr.skema.filter((_, j) => j !== i) } }))}>Hapus</button>
              </td>))}</tr>
          )}
        </tbody></table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="hint" style={{ margin: 0 }}>
          Total alokasi <b>{persen(hasil.irr.totalAlokasi)}</b> · WA coefficient{" "}
          <b>{hasil.irr.koefRata.toFixed(5)}</b>
        </span>
        {bolehUbah && (
          <button onClick={() => ubah((d) => ({ ...d, irr: { ...d.irr, skema: [...d.irr.skema, {
            nama: `Cara bayar ${d.irr.skema.length + 1}`, kelompok: "Cash", alokasi: 0,
            dp: 1, kali: 1, bulan: [12, 18, 19, 20] }] } }))}>+ Tambah cara bayar</button>
        )}
      </div>
    </>
  );
}

// ── 2. Unit Data ───────────────────────────────────────────────────────────

const TEKS_UNIT = [
  ["kode", "Code", 100], ["alamat", "Address", 130], ["view", "View", 85],
  ["no", "No", 40], ["ukuran", "Ukuran", 75], ["phase", "Phase", 45],
  ["tipe", "Tipe PL", 45], ["tipeBangunan", "Type", 45], ["bentuk", "Bentuk", 85],
  ["subTipe", "Sub-Tipe", 110],
] as const;

export function LangkahUnit({ data, hasil, ubah, bolehUbah }: PropsLangkah) {
  const ro = !bolehUbah;
  const [cari, setCari] = useState("");
  const ubahUnit = (i: number, f: (u: UnitData) => UnitData) =>
    ubah((d) => ({ ...d, unit: d.unit.map((u, j) => j === i ? f(u) : u) }));
  const q = cari.trim().toLowerCase();
  const tampil = data.unit.map((u, i) => ({ u, i, b: hasil.baris[i] }))
    .filter(({ u }) => !q || [u.kode, u.alamat, u.view, u.subTipe].join(" ").toLowerCase().includes(q));
  const total = hasil.baris.reduce((a, b) => a + b.hasilUnit.factored, 0);

  // Menambah dan mengurangi unit. Unit baru disisipkan tepat di bawah baris
  // asalnya (Salin) atau di akhir tabel (Tambah unit), dengan isian yang
  // biasanya sama untuk satu cluster sudah terisi; kotak Code-nya langsung
  // disorot supaya kode unit barunya dapat segera diketik.
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [yakin, setYakin] = useState<number | "pilihan" | null>(null);
  const [fokus, setFokus] = useState<number | null>(null);
  useEffect(() => {
    if (fokus == null) return;
    const el = document.getElementById(`unit-kode-${fokus}`) as HTMLInputElement | null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus();
    setFokus(null);
  }, [fokus, data.unit.length]);
  const tambah = (dari?: number) => {
    const asal = dari != null ? data.unit[dari] : data.unit[data.unit.length - 1];
    const baru: UnitData = dari != null
      ? { ...asal, kode: "", no: "", faktor: { ...asal.faktor } }
      : { ...unitKosong(), ...(asal && {
          alamat: asal.alamat, hargaTanah: asal.hargaTanah, hargaBangunan: asal.hargaBangunan,
          lb: asal.lb, tipe: asal.tipe, tipeBangunan: asal.tipeBangunan, phase: asal.phase,
          kenaikan: asal.kenaikan, faktorTambah: asal.faktorTambah }) };
    const posisi = dari != null ? dari + 1 : data.unit.length;
    setCari(""); setPilih(new Set()); setYakin(null);
    ubah((d) => ({ ...d, unit: [...d.unit.slice(0, posisi), baru, ...d.unit.slice(posisi)] }));
    setFokus(posisi);
  };
  const hapus = (hapusIni: Set<number>) => {
    ubah((d) => ({ ...d, unit: d.unit.filter((_, j) => !hapusIni.has(j)) }));
    setPilih(new Set()); setYakin(null);
  };
  const tandai = (i: number, on: boolean) => setPilih((p) => {
    const n = new Set(p); if (on) n.add(i); else n.delete(i); return n;
  });

  // Impor lembar UNIT DATA saja: daftar unit diganti seluruhnya dengan isi
  // berkas, sedangkan Data (IRR), susunan kolom, dan T&C tetap seperti di layar.
  const [buka, setBuka] = useState(false);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const imporUnit = async () => {
    if (!berkas) return;
    setSibuk(true); setPesan(null);
    try {
      const fd = new FormData(); fd.append("file", berkas);
      const res = await fetch("/api/pricelist/susun/impor?bagian=unit", { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setPesan({ ok: false, teks: b.detail ?? b.title ?? `HTTP ${res.status}` }); return; }
      const unit: UnitData[] = b.unit ?? [];
      if (!unit.length) {
        setPesan({ ok: false, teks: (b.peringatan ?? []).join(" ") ||
          "Tidak ada unit di lembar UNIT DATA berkas ini." });
        return;
      }
      // Phase dan Tipe pricelist tidak selalu tertulis di UNIT DATA; untuk
      // unit yang sudah ada di tabel, isian lamanya dipertahankan.
      ubah((d) => {
        const lama = new Map(d.unit.map((u) => [u.kode, u]));
        return { ...d, unit: unit.map((u) => ({
          ...u,
          phase: u.phase || lama.get(u.kode)?.phase || "1",
          tipe: u.tipe || lama.get(u.kode)?.tipe || "",
        })) };
      });
      setPesan({ ok: true, teks: `${unit.length} unit dimuat dari lembar UNIT DATA ${berkas.name}. ` +
        "Periksa tabelnya, lalu Simpan." });
      setBuka(false); setBerkas(null);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <>
      <p className="hint kiri">
        Base Price = ROUNDUP((Land × harga tanah + GFA × harga bangunan) × 1,11 ×
        (1 + kenaikan), juta). Factored Price = Base × (1 + jumlah faktor posisi)
        × (1 + (+) Factor) + Special + Show Unit × (1 + kenaikan). Harga per m²
        ditulis sebelum PPN 11%; faktor dan kenaikan dalam persen.
      </p>
      <div className="row">
        <input id="unit-cari" type="search" placeholder="Cari code, address, view…"
               value={cari} onChange={(e) => setCari(e.target.value)} style={{ width: 240 }} />
        <span className="hint" style={{ margin: 0 }}>
          {data.unit.length} unit · total Factored Price <b>{rp(total)}</b>
        </span>
        {bolehUbah && <button className="pri" onClick={() => tambah()}>+ Tambah unit</button>}
        {bolehUbah && pilih.size > 0 && (yakin === "pilihan" ? (
          <span className="yakin-hapus">
            Hapus {pilih.size} unit terpilih?
            <button className="kecil bahaya" onClick={() => hapus(pilih)}>Ya, hapus</button>
            <button className="kecil" onClick={() => setYakin(null)}>Batal</button>
          </span>
        ) : (
          <button onClick={() => setYakin("pilihan")}>− Hapus terpilih ({pilih.size})</button>
        ))}
        {bolehUbah && (
          <button onClick={() => { setBuka((x) => !x); setPesan(null); }}>
            Impor Unit Data dari Excel</button>
        )}
      </div>
      {buka && (
        <div className="form-blok">
          <p className="hint kiri" style={{ marginTop: 0 }}>
            Berkas Excel dengan lembar <b>UNIT DATA</b> (kolom Code Unit, Address,
            View, Ukuran, Land, Land Price, GFA, dan seterusnya). Seluruh unit di
            tabel ini diganti dengan isi berkas; langkah lain tidak berubah.
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            <PilihBerkas accept=".xlsx" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
            <button className="pri" disabled={!berkas || sibuk} onClick={() => void imporUnit()}>
              {sibuk ? "Membaca…" : "Muat unit"}</button>
            <button onClick={() => { setBuka(false); setBerkas(null); }}>Batal</button>
          </div>
        </div>
      )}
      {pesan && <div className={`banner ${pesan.ok ? "ok" : "stop"}`}>{pesan.teks}</div>}
      {!data.unit.length ? (
        <div className="banner info">
          Belum ada unit. Muat dari lembar UNIT DATA dengan <b>Impor Unit Data
          dari Excel</b>, tambahkan satu per satu, atau isi seluruh langkah
          sekaligus dengan <b>Impor dari Excel</b> di atas.
        </div>
      ) : (
        <div className="tscroll" style={{ maxHeight: 620, overflowY: "auto" }}>
          <table className="tabel-ringkas tabel-isian kepala-lekat"><thead>
            <tr>
              {bolehUbah && (
                <th className="aksi-unit">
                  <input type="checkbox" aria-label="Pilih semua unit yang tampil"
                         checked={tampil.length > 0 && tampil.every(({ i }) => pilih.has(i))}
                         onChange={(e) => setPilih(e.target.checked ? new Set(tampil.map(({ i }) => i)) : new Set())} />
                </th>
              )}
              <th>#</th>
              {TEKS_UNIT.map(([, l]) => <th key={l}>{l}</th>)}
              <th>Land (m²)</th><th>Harga tanah /m²</th><th>GFA (m²)</th>
              <th>Harga bangunan /m²</th><th>Increase</th>
              {FAKTOR.map(([, l]) => <th key={l}>{l}</th>)}
              <th>(+) Factor</th><th>Special (Rp)</th><th>Show Unit (Rp)</th>
              <th>Base Price</th><th>Factored Price</th>
            </tr>
          </thead><tbody>
            {tampil.map(({ u, i, b }) => (
              <tr key={i} className={pilih.has(i) ? "terpilih" : undefined}>
                {bolehUbah && (
                  <td className="aksi-unit">
                    <span className="row" style={{ margin: 0, flexWrap: "nowrap", gap: 4 }}>
                      <input type="checkbox" aria-label={`Pilih ${u.kode || `baris ${i + 1}`}`}
                             checked={pilih.has(i)} onChange={(e) => tandai(i, e.target.checked)} />
                      {yakin === i ? (
                        <>
                          <button className="kecil bahaya" onClick={() => hapus(new Set([i]))}>Ya, hapus</button>
                          <button className="kecil" onClick={() => setYakin(null)}>Batal</button>
                        </>
                      ) : (
                        <>
                          <button className="kecil" title="Tambah unit baru di bawah baris ini dengan isian yang sama"
                                  onClick={() => tambah(i)}>Salin</button>
                          <button className="kecil" title="Hapus unit ini" onClick={() => setYakin(i)}>Hapus</button>
                        </>
                      )}
                    </span>
                  </td>
                )}
                <td className="n">{i + 1}</td>
                {TEKS_UNIT.map(([k, , w]) => (
                  <td key={k}><IsianTeks id={k === "kode" ? `unit-kode-${i}` : undefined}
                                         nilai={u[k]} lebar={w} disabled={ro}
                                         ubah={(v) => ubahUnit(i, (x) => ({ ...x, [k]: v }))} /></td>
                ))}
                <td><Isian nilai={u.lt} lebar={70} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, lt: n }))} /></td>
                <td><Isian jenis="rp" nilai={u.hargaTanah} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, hargaTanah: n }))} /></td>
                <td><Isian nilai={u.lb} lebar={60} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, lb: n }))} /></td>
                <td><Isian jenis="rp" nilai={u.hargaBangunan} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, hargaBangunan: n }))} /></td>
                <td><Isian jenis="persen" nilai={u.kenaikan} lebar={55} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, kenaikan: n }))} /></td>
                {FAKTOR.map(([k]) => (
                  <td key={k}><Isian jenis="persen" nilai={u.faktor[k] ?? 0} lebar={55} disabled={ro}
                                     ubah={(n) => ubahUnit(i, (x) => ({ ...x, faktor: { ...x.faktor, [k]: n } }))} /></td>
                ))}
                <td><Isian jenis="persen" nilai={u.faktorTambah} lebar={55} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, faktorTambah: n }))} /></td>
                <td><Isian jenis="rp" nilai={u.special} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, special: n }))} /></td>
                <td><Isian jenis="rp" nilai={u.showUnit} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, showUnit: n }))} /></td>
                <td className="n">{rp(b?.hasilUnit.base ?? NaN)}</td>
                <td className="n"><b>{rp(b?.hasilUnit.factored ?? NaN)}</b></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
      {bolehUbah && data.unit.length > 0 && (
        <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
          <button onClick={() => tambah()}>+ Tambah unit di akhir tabel</button>
          <span className="hint" style={{ margin: 0 }}>
            Unit yang ditambah atau dihapus baru tersimpan setelah <b>Simpan</b>, dan baru
            dipakai Simulasi setelah diberlakukan di langkah 4.
          </span>
        </div>
      )}
    </>
  );
}

// ── 3. Data Pricelist ──────────────────────────────────────────────────────

export function LangkahDataPl({ data, hasil, ubah, bolehUbah }: PropsLangkah) {
  const ro = !bolehUbah;
  const kolom = data.dataPricelist.kolom;
  const ubahKolom = (i: number, f: (k: (typeof kolom)[0]) => (typeof kolom)[0]) =>
    ubah((d) => ({ ...d, dataPricelist: { ...d.dataPricelist,
      kolom: d.dataPricelist.kolom.map((k, j) => j === i ? f(k) : k) } }));

  return (
    <>
      <p className="hint kiri">
        Harga per cara bayar = ROUNDUP(Factored Price × koefisien Data (IRR), juta)
        + tambahan. Kolom turunan dihitung dari kolom lain di sebelah kirinya:
        ROUNDUP(kolom itu × pengali, juta), tanpa tambahan.
      </p>
      <div className="filters rapat" style={{ maxWidth: 300 }}>
        <div>
          <div className="lbl">Tambahan per unit (Rp)</div>
          <Isian id="dp-tambahan" jenis="rp" nilai={data.dataPricelist.tambahan} lebar={140} disabled={ro}
                 ubah={(n) => ubah((d) => ({ ...d, dataPricelist: { ...d.dataPricelist, tambahan: n } }))} />
        </div>
      </div>

      <div className="tscroll sp">
        <table className="tabel-ringkas tabel-isian"><tbody>
          <tr><th>Kolom</th><th>Dihitung dari</th><th>Koefisien / pengali</th></tr>
          {kolom.map((k, i) => (
            <tr key={i}>
              <td><IsianTeks nilai={k.nama} lebar={190} disabled={ro}
                             ubah={(v) => ubah((d) => {
                               const lama = d.dataPricelist.kolom[i].nama;
                               return { ...d,
                                 dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.map((x, j) =>
                                   j === i ? { ...x, nama: v } : x.dari === lama ? { ...x, dari: v } : x) },
                                 pricelist: { ...d.pricelist, kolom: d.pricelist.kolom.map((x) =>
                                   x.dari === lama ? { ...x, dari: v } : x) } };
                             })} /></td>
              <td>
                <select value={k.skema ? `s:${k.skema}` : `k:${k.dari ?? ""}`} disabled={ro}
                        onChange={(e) => {
                          const [jenis, nama] = [e.target.value.slice(0, 1), e.target.value.slice(2)];
                          ubahKolom(i, (x) => jenis === "s" ? { nama: x.nama, skema: nama }
                            : { nama: x.nama, dari: nama, kali: x.kali ?? 1 });
                        }}>
                  <optgroup label="Koefisien Data (IRR)">
                    {data.irr.skema.map((s) => <option key={s.nama} value={`s:${s.nama}`}>{s.nama}</option>)}
                  </optgroup>
                  <optgroup label="Turunan kolom">
                    {kolom.slice(0, i).map((x) => <option key={x.nama} value={`k:${x.nama}`}>{x.nama}</option>)}
                  </optgroup>
                </select>
              </td>
              <td className="n">
                {k.skema ? (Number.isFinite(hasil.irr.koef[k.skema]) ? hasil.irr.koef[k.skema].toFixed(5) : "—")
                  : <Isian jenis="persen" nilai={k.kali ?? 1} lebar={70} disabled={ro}
                           ubah={(n) => ubahKolom(i, (x) => ({ ...x, kali: n }))} />}
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>

      <div className="tscroll" style={{ maxHeight: 560, overflowY: "auto" }}>
        <table className="tabel-ringkas kepala-lekat" style={{ whiteSpace: "nowrap" }}><thead>
          <tr>
            <th>No</th><th>Code</th><th>Phase</th><th>Address</th><th>View</th><th>Ukuran</th>
            <th>Tipe</th><th>Sub-Tipe</th><th>Land</th><th>Build</th><th>Factored Price</th>
            {kolom.map((k) => <th key={k.nama}>{k.nama}</th>)}
          </tr>
        </thead><tbody>
          {hasil.baris.map((b, i) => (
            <tr key={i}>
              <td className="n">{i + 1}</td><td><b>{b.unit.kode}</b></td><td>{b.unit.phase}</td>
              <td>{b.unit.alamat}</td><td>{b.unit.view}</td><td>{b.unit.ukuran}</td>
              <td>{b.unit.tipe}</td><td>{b.unit.subTipe}</td>
              <td className="n">{b.unit.lt.toLocaleString("id-ID")}</td>
              <td className="n">{b.unit.lb.toLocaleString("id-ID")}</td>
              <td className="n">{rp(b.hasilUnit.factored)}</td>
              {kolom.map((k) => <td key={k.nama} className="n">{rp(b.dataPl[k.nama])}</td>)}
            </tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}

// ── 4. Pricelist ───────────────────────────────────────────────────────────

export function LangkahPricelist({ data, hasil, ubah, bolehUbah, aksi }: PropsLangkah & {
  /** Panel memberlakukan, disediakan halamannya. */
  aksi?: React.ReactNode;
}) {
  const ro = !bolehUbah;
  const [pajak, setPajak] = useState(true);
  const pl = data.pricelist;
  const ubahPl = (f: (p: typeof pl) => typeof pl) => ubah((d) => ({ ...d, pricelist: f(d.pricelist) }));
  const kolomDp = data.dataPricelist.kolom.map((k) => k.nama);

  const unit: UnitHarga[] = hasil.baris.map((b) => ({
    kode: b.unit.kode, alamat: b.unit.alamat, tipe: b.unit.tipe,
    lt: b.unit.lt, lb: b.unit.lb, phase: b.unit.phase, ukuran: b.unit.ukuran,
    view: b.unit.view, subTipe: b.unit.subTipe,
    harga: Object.fromEntries(pl.kolom.map((k) => [k.nama, b.pricelist[k.nama]?.harga])),
    pajak: Object.fromEntries(pl.kolom.map((k) => [k.nama,
      { dpp: b.pricelist[k.nama]?.dpp ?? null, dtp: b.pricelist[k.nama]?.dtp ?? null }])),
  }));

  return (
    <>
      <p className="hint kiri">
        Kolom dengan pengali 100% mengambil harga Data Pricelist apa adanya; selain
        itu ROUND(harga × pengali, juta) — di Excel 111,5% untuk kolom KPR.
        DPP = harga / 1,11; Nilai Free PPN DTP = harga − DPP, paling banyak PPN
        atas pagu harga.
      </p>
      <div className="filters rapat">
        <div><div className="lbl">Judul</div>
          <IsianTeks id="pl-judul" nilai={pl.judul} lebar={200} disabled={ro}
                     ubah={(v) => ubahPl((p) => ({ ...p, judul: v }))} /></div>
        <div><div className="lbl">Tanggal berlaku</div>
          <IsianTeks id="pl-tanggal" nilai={pl.tanggal} lebar={160} disabled={ro}
                     ubah={(v) => ubahPl((p) => ({ ...p, tanggal: v }))} /></div>
        <div><div className="lbl">Pagu harga PPN DTP (Rp)</div>
          <Isian id="pl-pagu" jenis="rp" nilai={pl.batasDtp} lebar={150} disabled={ro}
                 ubah={(n) => ubahPl((p) => ({ ...p, batasDtp: n }))} /></div>
        <div style={{ gridColumn: "span 2" }}><div className="lbl">Catatan kolom KPR</div>
          <input id="pl-catatan" value={pl.catatan} disabled={ro}
                 onChange={(e) => ubahPl((p) => ({ ...p, catatan: e.target.value }))} /></div>
      </div>

      <details className="sp" style={{ marginTop: 12 }}>
        <summary className="hint kiri" style={{ cursor: "pointer" }}>Susunan kolom harga ({pl.kolom.length})</summary>
        <div className="tscroll" style={{ marginTop: 8 }}>
          <table className="tabel-ringkas tabel-isian"><tbody>
            <tr><th>Kolom Pricelist</th><th>Dari kolom Data Pricelist</th><th>Pengali</th>{bolehUbah && <th />}</tr>
            {pl.kolom.map((k, i) => (
              <tr key={i}>
                <td><IsianTeks nilai={k.nama} lebar={230} disabled={ro}
                               ubah={(v) => ubahPl((p) => ({ ...p, kolom: p.kolom.map((x, j) => j === i ? { ...x, nama: v } : x) }))} /></td>
                <td><select value={k.dari} disabled={ro}
                            onChange={(e) => ubahPl((p) => ({ ...p, kolom: p.kolom.map((x, j) => j === i ? { ...x, dari: e.target.value } : x) }))}>
                  {!kolomDp.includes(k.dari) && <option value={k.dari}>{k.dari} (tidak ada)</option>}
                  {kolomDp.map((n) => <option key={n} value={n}>{n}</option>)}
                </select></td>
                <td><Isian jenis="persen" nilai={k.kali} lebar={70} disabled={ro}
                           ubah={(n) => ubahPl((p) => ({ ...p, kolom: p.kolom.map((x, j) => j === i ? { ...x, kali: n } : x) }))} /></td>
                {bolehUbah && <td><button className="kecil" disabled={pl.kolom.length <= 1}
                  onClick={() => ubahPl((p) => ({ ...p, kolom: p.kolom.filter((_, j) => j !== i) }))}>Hapus</button></td>}
              </tr>
            ))}
          </tbody></table>
        </div>
        {bolehUbah && (
          <button style={{ marginTop: 8 }} onClick={() => ubahPl((p) => ({ ...p, kolom: [...p.kolom,
            { nama: kolomDp[0] ?? "Kolom baru", dari: kolomDp[0] ?? "", kali: 1 }] }))}>+ Tambah kolom</button>
        )}
      </details>

      <div className="kepala-pl">
        <b>{pl.judul}</b>
        <span>{pl.tanggal}</span>
        {pl.catatan && <small>{pl.catatan}</small>}
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input id="pl-pajak" type="checkbox" checked={pajak} onChange={(e) => setPajak(e.target.checked)} />
          Tampilkan DPP &amp; Nilai Free PPN DTP
        </label>
        <span className="hint" style={{ margin: 0 }}>{unit.length} unit · {pl.kolom.length} cara bayar</span>
      </div>
      {unit.length ? (
        <TabelHarga skema={pl.kolom.map((k) => k.nama)} unit={unit} pajak={pajak} tinggi={560} />
      ) : (
        <div className="banner info">Belum ada unit di langkah Unit Data.</div>
      )}
      {aksi}
    </>
  );
}

// ── 5. Terms & Conditions ──────────────────────────────────────────────────

export function LangkahTnc({ data, ubah, bolehUbah }: PropsLangkah) {
  const ro = !bolehUbah;
  const t = data.tnc;
  const ubahT = (f: (x: typeof t) => typeof t) => ubah((d) => ({ ...d, tnc: f(d.tnc) }));
  const ubahCb = (i: number, f: (c: (typeof t.caraBayar)[0]) => (typeof t.caraBayar)[0]) =>
    ubahT((x) => ({ ...x, caraBayar: x.caraBayar.map((c, j) => j === i ? f(c) : c) }));

  return (
    <>
      <div className="filters rapat" style={{ maxWidth: 420 }}>
        <div><div className="lbl">Judul</div>
          <IsianTeks id="tnc-judul" nilai={t.judul} lebar={260} disabled={ro}
                     ubah={(v) => ubahT((x) => ({ ...x, judul: v }))} /></div>
      </div>

      <h3 className="sub-judul">Cara bayar</h3>
      <div className="tnc-grid">
        {t.caraBayar.map((c, i) => (
          <div key={i} className="tnc-kartu">
            <div className="row" style={{ marginBottom: 6 }}>
              <b className="no">{i + 1}.</b>
              <IsianTeks nilai={c.judul} lebar={240} disabled={ro}
                         ubah={(v) => ubahCb(i, (x) => ({ ...x, judul: v }))} />
              {bolehUbah && <button className="kecil" onClick={() => ubahT((x) => ({
                ...x, caraBayar: x.caraBayar.filter((_, j) => j !== i) }))}>Hapus</button>}
            </div>
            <table className="tabel-ringkas tabel-isian"><tbody>
              {c.baris.map((b, j) => (
                <tr key={j}>
                  <td className="no">{String.fromCharCode(97 + j)}.</td>
                  <td><IsianTeks nilai={b.label} lebar={120} disabled={ro}
                                 ubah={(v) => ubahCb(i, (x) => ({ ...x, baris: x.baris.map((y, k) => k === j ? { ...y, label: v } : y) }))} /></td>
                  <td><IsianTeks nilai={b.nilai} lebar={140} disabled={ro}
                                 ubah={(v) => ubahCb(i, (x) => ({ ...x, baris: x.baris.map((y, k) => k === j ? { ...y, nilai: v } : y) }))} /></td>
                  <td><IsianTeks nilai={b.waktu} lebar={210} disabled={ro}
                                 ubah={(v) => ubahCb(i, (x) => ({ ...x, baris: x.baris.map((y, k) => k === j ? { ...y, waktu: v } : y) }))} /></td>
                  {bolehUbah && <td><button className="kecil" aria-label="Hapus baris"
                    onClick={() => ubahCb(i, (x) => ({ ...x, baris: x.baris.filter((_, k) => k !== j) }))}>×</button></td>}
                </tr>
              ))}
            </tbody></table>
            <input value={c.catatan ?? ""} placeholder="Catatan (opsional)" disabled={ro}
                   style={{ width: "100%", marginTop: 6 }}
                   onChange={(e) => ubahCb(i, (x) => ({ ...x, catatan: e.target.value || undefined }))} />
            {bolehUbah && <button className="kecil" style={{ marginTop: 6 }}
              onClick={() => ubahCb(i, (x) => ({ ...x, baris: [...x.baris, { label: "", nilai: "", waktu: "" }] }))}>
              + Baris</button>}
          </div>
        ))}
      </div>
      {bolehUbah && <button style={{ marginTop: 8 }} onClick={() => ubahT((x) => ({ ...x,
        caraBayar: [...x.caraBayar, { judul: "", baris: [{ label: "Booking Fee", nilai: "10 Juta", waktu: "" }] }] }))}>
        + Tambah cara bayar</button>}

      <h3 className="sub-judul">Catatan</h3>
      <ol className="tnc-catatan">
        {t.catatan.map((c, i) => (
          <li key={i}><div className="tnc-baris">
            <TeksPanjang nilai={c} disabled={ro}
                         ubah={(v) => ubahT((x) => ({ ...x, catatan: x.catatan.map((y, j) => j === i ? v : y) }))} />
            {bolehUbah && <button className="kecil" onClick={() => ubahT((x) => ({
              ...x, catatan: x.catatan.filter((_, j) => j !== i) }))}>Hapus</button>}
          </div></li>
        ))}
      </ol>
      {bolehUbah && <button onClick={() => ubahT((x) => ({ ...x, catatan: [...x.catatan, ""] }))}>
        + Tambah catatan</button>}

      <h3 className="sub-judul">Rekening pembayaran</h3>
      <input value={t.pengantarRekening} disabled={ro} style={{ width: "100%", maxWidth: 640 }}
             onChange={(e) => ubahT((x) => ({ ...x, pengantarRekening: e.target.value }))} />
      <div className="tscroll" style={{ marginTop: 8 }}>
        <table className="tabel-ringkas tabel-isian"><tbody>
          <tr><th>Bank</th><th>No. Rekening</th><th>Cabang</th>{bolehUbah && <th />}</tr>
          {t.rekening.map((r, i) => (
            <tr key={i}>
              {(["bank", "noRek", "cabang"] as const).map((f) => (
                <td key={f}><IsianTeks nilai={r[f]} lebar={190} disabled={ro}
                                       ubah={(v) => ubahT((x) => ({ ...x, rekening: x.rekening.map((y, j) => j === i ? { ...y, [f]: v } : y) }))} /></td>
              ))}
              {bolehUbah && <td><button className="kecil" onClick={() => ubahT((x) => ({
                ...x, rekening: x.rekening.filter((_, j) => j !== i) }))}>Hapus</button></td>}
            </tr>
          ))}
        </tbody></table>
      </div>
      {bolehUbah && <button style={{ marginTop: 8 }} onClick={() => ubahT((x) => ({ ...x,
        rekening: [...x.rekening, { bank: "", noRek: "", cabang: "" }] }))}>+ Tambah rekening</button>}
    </>
  );
}

/** Kotak teks yang tingginya mengikuti isinya. */
function TeksPanjang({ nilai, ubah, disabled }: {
  nilai: string; ubah: (s: string) => void; disabled?: boolean;
}) {
  const [baris, setBaris] = useState(2);
  useEffect(() => {
    setBaris(Math.min(10, Math.max(2, Math.ceil(nilai.length / 110) + nilai.split("\n").length - 1)));
  }, [nilai]);
  return <textarea value={nilai} rows={baris} disabled={disabled}
                   onChange={(e) => ubah(e.target.value)} />;
}

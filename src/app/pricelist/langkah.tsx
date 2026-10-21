"use client";

/**
 * Kelima langkah penyusunan pricelist, masing-masing satu komponen yang
 * menerima isian lengkap (`data`), hasil hitungannya (`hasil`), dan cara
 * mengubahnya (`ubah`). Hitungannya ada di src/lib/susun-pricelist.ts dan
 * dijalankan ulang oleh halamannya setiap kali satu angka berubah, sehingga
 * langkah sesudahnya selalu membaca angka terbaru — seperti rumus Excel yang
 * saling merujuk antarlembar.
 */

import { Fragment, useEffect, useState } from "react";

import { formatRupiah } from "@/lib/money";
import {
  FAKTOR, hargaKasIrr, hargaSesuaiSkema, labelPpn, namaTahap, tarifPpn, unitKosong,
  kunciTnc, tingkatNaik, type BarisTnc, type HasilSusun, type SusunPricelist, type UnitData,
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
/**
 * Lebar kotak isian: sekurang-kurangnya `lebar`, dan melebar mengikuti isinya
 * bila isinya lebih panjang — supaya isian tidak terpotong dan kolom tabelnya
 * ikut melebar dengan sendirinya.
 */
const lebarIsi = (teks: string, lebar: number) =>
  `max(${lebar}px, calc(${teks.length + 1}ch + 14px))`;

export function Isian({ nilai, ubah, jenis = "angka", lebar = 90, disabled, id, kosongNol, desimal }: {
  nilai: number; ubah: (n: number) => void; jenis?: Jenis; lebar?: number;
  disabled?: boolean; id?: string;
  /** Tampilkan 0 sebagai kotak kosong (kolom yang biasanya tidak diisi). */
  kosongNol?: boolean;
  /**
   * Jumlah angka di belakang koma saat kotak tidak sedang disunting. Hanya
   * tampilan: nilainya tetap utuh, dan saat kotak diklik angka lengkapnya
   * muncul untuk disunting.
   */
  desimal?: number;
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
  const tampil = teks ?? (kosongNol && nilai === 0 ? ""
    : desimal != null && Number.isFinite(nilai)
      ? (jenis === "persen" ? nilai * 100 : nilai)
          .toLocaleString("id-ID", { minimumFractionDigits: desimal, maximumFractionDigits: desimal })
      : tampilAngka(nilai, jenis));
  return (
    <span className="isian-angka">
      <input id={id} value={tampil}
             disabled={disabled}
             onFocus={desimal != null ? () => setTeks(tampilAngka(nilai, jenis)) : undefined}
             inputMode="decimal" aria-invalid={salah || undefined}
             style={{ width: lebarIsi(tampil, lebar) }}
             onChange={(e) => setTeks(e.target.value)} onBlur={simpan}
             onKeyDown={(e) => { if (e.key === "Enter") simpan(); }} />
      <span className="satuan">{jenis === "persen" && !(kosongNol && nilai === 0 && teks == null) ? "%" : ""}</span>
    </span>
  );
}

function IsianTeks({ nilai, ubah, lebar = 110, disabled, id }: {
  nilai: string; ubah: (s: string) => void; lebar?: number; disabled?: boolean; id?: string;
}) {
  return <input id={id} value={nilai} disabled={disabled}
                style={{ width: lebarIsi(nilai, lebar) }}
                onChange={(e) => ubah(e.target.value)} />;
}

const rp = (n: number) => (Number.isFinite(n) ? formatRupiah(n) : "—");
/** Harga per m² tanpa "Rp", sejajar dengan kotak isian harga di sebelahnya. */
const rpPolos = (n?: number) =>
  n != null && Number.isFinite(n) ? Math.round(n).toLocaleString("id-ID") : "—";
const luas = (n: number, d?: number) =>
  `${n.toLocaleString("id-ID", d == null ? { maximumFractionDigits: 2 }
    : { minimumFractionDigits: d, maximumFractionDigits: d })} m²`;
const persen = (n: number, d = 2, min = 0) =>
  Number.isFinite(n)
    ? `${(n * 100).toLocaleString("id-ID", { minimumFractionDigits: min, maximumFractionDigits: d })}%`
    : "—";

// ── 1. Data (IRR) ──────────────────────────────────────────────────────────

/**
 * Bagi `total` basis poin (10000 = 100%) sebanding dengan `bobot`, dengan
 * metode sisa terbesar supaya jumlahnya tepat `total`. Bobot nol semua →
 * dibagi rata.
 */
function bagiSebanding(bobot: number[], total: number): number[] {
  if (!bobot.length) return [];
  const jml = bobot.reduce((a, b) => a + Math.max(0, b), 0);
  const dasar = jml > 0 ? bobot.map((b) => (Math.max(0, b) / jml) * total) : bobot.map(() => total / bobot.length);
  const bulat = dasar.map(Math.floor);
  let sisa = total - bulat.reduce((a, b) => a + b, 0);
  dasar.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (sisa > 0) { bulat[i]++; sisa--; } });
  return bulat;
}

/**
 * Allocation selalu berjumlah 100%: cara bayar ke-`i` diberi `nilai`, sisanya
 * dibagi ke cara bayar lain sebanding dengan allocation lamanya.
 */
function aturAlokasi<T extends { alokasi: number }>(skema: T[], i: number, nilai: number): T[] {
  const bp = Math.round(Math.min(1, Math.max(0, nilai)) * 10000);
  const lain = skema.map((s, j) => ({ s, j })).filter(({ j }) => j !== i);
  const bagian = bagiSebanding(lain.map(({ s }) => s.alokasi), 10000 - bp);
  const baru = skema.map((s) => ({ ...s }));
  baru[i].alokasi = bp / 10000;
  lain.forEach(({ j }, k) => { baru[j].alokasi = bagian[k] / 10000; });
  return baru;
}

/**
 * Allocation otomatis untuk cara bayar yang baru ditambah di ujung: ia
 * mendapat bagian rata (100% / jumlah cara bayar), dan
 * cara bayar lain menyesuaikan sebanding — total tetap 100%. Allocation hanya
 * dipakai untuk WA Coefficient, tidak memengaruhi harga.
 */
function denganAlokasiBaru<T extends { alokasi: number }>(skema: T[]): T[] {
  return skema.length ? aturAlokasi(skema, skema.length - 1, 1 / skema.length) : skema;
}

/** Sesuaikan semua allocation sebanding supaya berjumlah 100%. */
function genapkanAlokasi<T extends { alokasi: number }>(skema: T[]): T[] {
  const bagian = bagiSebanding(skema.map((s) => s.alokasi), 10000);
  return skema.map((s, j) => ({ ...s, alokasi: bagian[j] / 10000 }));
}


/**
 * Draf dengan satu cara bayar baru di ujung kanan: kolom di Data (IRR) (DP,
 * cicilan dan bulan tahap disalin dari cara bayar pertama, diubah di sana),
 * kolom Data Pricelist berkoefisien IRR-nya sendiri, kolom Pricelist, dan
 * satu blok T&C — supaya tidak ada langkah yang tertinggal. Dipakai tombol
 * + Tambah Cara Bayar di langkah 1 dan langkah 3.
 */
function denganCaraBayarBaru(d: SusunPricelist): SusunPricelist {
  const ada = new Set([...d.irr.skema.map((x) => x.nama), ...d.dataPricelist.kolom.map((k) => k.nama)]);
  let no = d.irr.skema.length + 1;
  while (ada.has(`Cara bayar ${no}`)) no++;
  const nama = `Cara bayar ${no}`;
  return {
    ...d,
    irr: { ...d.irr, skema: denganAlokasiBaru([...d.irr.skema, {
      nama, kelompok: "Cash", alokasi: 0, dp: 1, kali: 1, otomatis: true,
      bulan: [...(d.irr.skema[0]?.bulan ?? [12, 18, 19, 20])] as [number, number, number, number],
    }]) },
    dataPricelist: { ...d.dataPricelist, kolom: [...d.dataPricelist.kolom, { nama, skema: nama }] },
    pricelist: { ...d.pricelist, kolom: [...d.pricelist.kolom, { nama, dari: nama, kali: 1 }] },
    tnc: { ...d.tnc, caraBayar: [...d.tnc.caraBayar, { judul: nama.toUpperCase(),
      baris: [{ label: "Booking Fee", nilai: "10 Juta", waktu: "" }] }] },
  };
}

/**
 * Draf lama: cara bayar yang dulu ditambah tanpa Allocation (Allocation 0%
 * atau tanda "tambahan" di Data (IRR), atau kolom "Cara bayar baru N" di Data Pricelist
 * yang dulu tidak masuk Data (IRR)) kini mendapat Allocation otomatis seperti
 * cara bayar baru; parameternya diisi dari namanya.
 */
export function rapikanCaraBayar(d: SusunPricelist): SusunPricelist {
  // Hanya yang pengalinya masih 100% (harganya sama dengan cara bayar asal).
  const pindah = d.dataPricelist.kolom.filter((k) => k.dari && (k.kali ?? 1) === 1
    && /^cara bayar baru \d+$/i.test(k.nama)
    && !d.irr.skema.some((x) => x.nama === k.nama));
  const nol = (x: SusunPricelist["irr"]["skema"][0]) =>
    x.tambahan || (!x.acuan && !x.alokasi && d.irr.skema.some((y) => y.alokasi > 0));
  if (!pindah.length && !d.irr.skema.some(nol)) return d;
  let skema = d.irr.skema.map((x) => (nol(x) ? { ...x, tambahan: undefined, alokasi: 0, baru: true }
                                                  : { ...x, baru: false }));
  const dasar = skema.filter((x) => !x.baru);
  skema = [...dasar, ...skema.filter((x) => x.baru)];
  const urut = skema.map((x) => x.nama);
  for (const k of pindah) {
    skema.push({ nama: k.nama, kelompok: "Cash", alokasi: 0, dp: 1, kali: 1, otomatis: true, baru: true,
                 bulan: [...(d.irr.skema[0]?.bulan ?? [12, 18, 19, 20])] as [number, number, number, number] });
  }
  // Bagian rata untuk tiap cara bayar baru, satu per satu, seperti saat ditambah.
  let hasil = skema.slice(0, dasar.length);
  for (const x of skema.slice(dasar.length)) hasil = denganAlokasiBaru([...hasil, x]);
  // Urutan kolom Data (IRR) semula dipertahankan; yang dipindah di ujung.
  const posisi = (n: string) => { const j = urut.indexOf(n); return j < 0 ? urut.length : j; };
  hasil.sort((a, b) => posisi(a.nama) - posisi(b.nama));
  const namaPindah = new Set(pindah.map((k) => k.nama));
  return isiOtomatisCaraBayar({
    ...d,
    irr: { ...d.irr, skema: hasil.map(({ baru: _, ...x }) => x) },
    dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.map((k) => {
      if (!namaPindah.has(k.nama)) return k;
      const { dari: _d, kali: _k, ...sisa } = k;
      return { ...sisa, skema: k.nama };
    }) },
  });
}

/**
 * Parameter cara bayar dibaca dari namanya: "KPR …" / "BANK …" / "DP x%" →
 * kelompok KPR; "DP x%" → DP; "Nx" → Installments; tanpa DP: Cash 100%,
 * KPR 10%. Bulan tahap disalin dari cara bayar lama yang paling mirip
 * (kelompok sama, Express atau bukan, DP terdekat).
 */
function parameterDariNama(nama: string, skema: SusunPricelist["irr"]["skema"]) {
  const t = nama.toUpperCase();
  const dpCocok = /DP\s*(\d+(?:[.,]\d+)?)\s*%/.exec(t);
  const dp = dpCocok ? Number(dpCocok[1].replace(",", ".")) / 100 : null;
  const kpr = /\b(KPR|BANK|KREDIT)\b/.test(t) || (dp != null && dp < 1);
  const kali = Number(/(\d+)\s*X\b/.exec(t)?.[1]) || 1;
  const express = /EXPRESS/.test(t);
  const kelompok = kpr ? "KPR" : "Cash";
  const dpAkhir = dp ?? (kpr ? 0.1 : 1);
  const calon = skema.filter((x) => !x.otomatis && x.kelompok === kelompok);
  const mirip = [...calon].sort((a, b) =>
    (Number(/EXPRESS/i.test(a.nama) !== express) - Number(/EXPRESS/i.test(b.nama) !== express))
    || Math.abs(a.dp - dpAkhir) - Math.abs(b.dp - dpAkhir))[0] ?? skema.find((x) => !x.otomatis);
  return { kelompok, dp: dpAkhir, kali,
           bulan: [...(mirip?.bulan ?? [12, 18, 19, 20])] as [number, number, number, number] };
}

/**
 * Isi otomatis parameter cara bayar baru dari namanya, sesudah setiap
 * perubahan draf. Nama diambil dari kolom Data Pricelist-nya bila nama di
 * Data (IRR) masih nama bawaan ("Cara bayar N").
 */
export function isiOtomatisCaraBayar(d: SusunPricelist): SusunPricelist {
  if (!d.irr.skema.some((x) => x.otomatis)) return d;
  let ubah = false;
  const skema = d.irr.skema.map((x) => {
    if (!x.otomatis) return x;
    const namaDp = d.dataPricelist.kolom.find((k) => k.skema === x.nama)?.nama;
    const nama = /^cara bayar \d+$/i.test(x.nama) && namaDp ? namaDp : x.nama;
    const p = parameterDariNama(nama, d.irr.skema);
    if (x.kelompok === p.kelompok && x.dp === p.dp && x.kali === p.kali
        && x.bulan.every((b, j) => b === p.bulan[j])) return x;
    ubah = true;
    return { ...x, ...p };
  });
  return ubah ? { ...d, irr: { ...d.irr, skema } } : d;
}

export function LangkahIrr({ data, hasil, ubah, bolehUbah, baru }: PropsLangkah & {
  /**
   * Jumlah cara bayar yang baru ditambah di ujung kanan, disimpan halamannya
   * supaya tetap ada walau berpindah langkah (untuk "Batalkan tambah").
   */
  baru?: [number, (f: (n: number) => number) => void];
}) {
  const irr = data.irr;
  const TAHAP = namaTahap(irr);
  // Cash Price diubah lewat tombol Edit, supaya tidak tergeser tanpa sengaja.
  const [editKas, setEditKas] = useState(false);
  const ro = !bolehUbah;
  // Mengubah arus kas cara bayar (DP, cicilan, bulan, Cash Price) membuat
  // Adjusted Price tersimpan tidak berlaku lagi — seperti di Excel yang
  // harus di-Goal Seek ulang; di sini langsung dihitung ulang tepat.
  const ubahArus = (i: number, f: (s: SusunPricelist["irr"]["skema"][0]) => typeof s) =>
    ubahSkema(i, (x) => ({ ...f(x), hargaSesuai: undefined }));
  const tanpaSimpanan = (d: SusunPricelist) =>
    d.irr.skema.map((x) => ({ ...x, hargaSesuai: undefined }));
  // Cara bayar yang IRR-nya belum tepat pada target (mis. Adjusted Price
  // hasil Goal Seek dari berkas Excel lama). Tombol Goal Seek hanya muncul
  // bila ada; bila semuanya sudah sesuai rumus, tidak ada yang perlu disamakan.
  const belumSesuai = new Set(irr.skema.filter((s) => !s.acuan
    && Number.isFinite(hasil.irr.irr[s.nama])
    && Math.abs(hasil.irr.irr[s.nama] - irr.target) > 1e-7).map((s) => s.nama));
  // Mengubah parameter cara bayar secara manual menghentikan pengisian otomatis.
  const ubahSkema = (i: number, f: (s: SusunPricelist["irr"]["skema"][0]) => typeof s) =>
    ubah((d) => ({ ...d, irr: { ...d.irr, skema: d.irr.skema.map((s, j) =>
      j === i ? { ...f(s), otomatis: undefined } : s) } }));
  const ganti = (i: number, nama: string) => ubah((d) => {
    const lama = d.irr.skema[i].nama;
    // Kolom Data Pricelist yang merujuk cara bayar ini ikut berganti; bila
    // namanya sama dengan nama cara bayarnya (kolom yang dibuat bersama
    // cara bayar itu), namanya juga berganti, begitu pula rujukan kolom
    // Pricelist dan kolom turunan kepadanya.
    const ubahNamaDp = new Set(d.dataPricelist.kolom
      .filter((k) => k.skema === lama && k.nama === lama).map((k) => k.nama));
    const n = (x: string) => (ubahNamaDp.has(x) ? nama : x);
    return {
      ...d,
      irr: { ...d.irr, skema: d.irr.skema.map((s, j) => j === i ? { ...s, nama } : s) },
      dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.map((k) => ({
        ...k, nama: n(k.nama),
        ...(k.skema === lama && { skema: nama }),
        ...(k.dari && { dari: n(k.dari) }),
      })) },
      pricelist: { ...d.pricelist, kolom: d.pricelist.kolom.map((k) => ({
        ...k, dari: n(k.dari), nama: k.nama === lama && ubahNamaDp.has(lama) ? nama : k.nama,
      })) },
    };
  });

  /**
   * Cara bayar baru: kolom di Data (IRR), dan kolomnya langsung ikut di Data
   * Pricelist (Factored Price × koefisien + tambahan), di Pricelist (pengali
   * 100%), dan satu blok ketentuan di T&C — supaya tidak ada langkah yang
   * tertinggal. Isiannya dapat diubah sesudahnya.
   */
  const [yakinHapus, setYakinHapus] = useState<number | null>(null);
  /** Jumlah cara bayar yang baru ditambah di ujung kanan (untuk "Batalkan tambah"). */
  const [baruLokal, setBaruLokal] = useState(0);
  const [baruDitambah, setBaruDitambah] = baru ?? [baruLokal, setBaruLokal];
  const tambahSkema = () => { setBaruDitambah((n) => n + 1); tambahSkemaData(); };
  const batalTambah = () => {
    if (!baruDitambah || irr.skema.length <= 1) return;
    setBaruDitambah((n) => n - 1);
    hapusSkema(irr.skema.length - 1);
  };
  const tambahSkemaData = () => ubah(denganCaraBayarBaru);
  /** Hapus cara bayar beserta kolom Data Pricelist dan Pricelist yang bersumber darinya. */
  const hapusSkema = (i: number) => {
    setYakinHapus(null);
    ubah((d) => {
      const nama = d.irr.skema[i].nama;
      const hilang = new Set(d.dataPricelist.kolom.filter((k) => k.skema === nama).map((k) => k.nama));
      // Kolom turunan dari kolom yang hilang ikut hilang.
      d.dataPricelist.kolom.forEach((k) => { if (k.dari && hilang.has(k.dari)) hilang.add(k.nama); });
      return {
        ...d,
        // Allocation cara bayar yang dihapus dibagi ke yang lain (tetap 100%).
        irr: { ...d.irr, skema: genapkanAlokasi(d.irr.skema.filter((_, j) => j !== i)) },
        dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.filter((k) => !hilang.has(k.nama)) },
        pricelist: { ...d.pricelist, kolom: d.pricelist.kolom.filter((k) => !hilang.has(k.dari)) },
      };
    });
  };

  return (
    <>
      <p className="hint kiri">
        Koefisien tiap cara bayar adalah harga yang membuat IRR arus kasnya sama
        dengan bunga target, dibagi harga Cash Keras. DP dicicil rata pada bulan
        1 sampai n; sisanya (1 − DP) cair pada bulan tiap tahap pembangunan.
      </p>
      <div className="filters rapat param-irr">
        <div>
          <div className="lbl">Target interest rate (setahun)</div>
          <Isian id="irr-target" jenis="persen" nilai={irr.target} disabled={ro}
                 ubah={(n) => ubah((d) => ({ ...d, irr: { ...d.irr, target: n, skema: tanpaSimpanan(d) } }))} />
        </div>
      </div>
      <div className="filters rapat param-irr">
        {TAHAP.map((t, i) => (
          <div key={t}>
            <div className="lbl">Porsi {t}</div>
            <Isian id={`irr-porsi-${i}`} jenis="persen" nilai={irr.porsiTahap[i]} disabled={ro}
                   ubah={(n) => ubah((d) => {
                     const p = [...d.irr.porsiTahap] as typeof irr.porsiTahap; p[i] = n;
                     return { ...d, irr: { ...d.irr, porsiTahap: p, skema: tanpaSimpanan(d) } };
                   })} />
          </div>
        ))}
      </div>
      {Math.abs(irr.porsiTahap.reduce((a, b) => a + b, 0) - 1) > 1e-9 && (
        <div className="banner warn">Jumlah porsi keempat tahap harus 100%.</div>
      )}

      {bolehUbah && (
        <div className="row" style={{ justifyContent: "flex-end", margin: "12px 0 6px" }}>
          {baruDitambah > 0 && irr.skema.length > 1 && (
            <button onClick={batalTambah}
                    title="Hapus cara bayar yang baru ditambah (paling kanan)">
              ↶ Batalkan tambah ({irr.skema[irr.skema.length - 1].nama})</button>
          )}
          <button className="pri" onClick={tambahSkema}
                  title="Tambah kolom cara bayar baru di Data (IRR), Data Pricelist, Pricelist dan T&C">
            + Tambah cara bayar</button>
        </div>
      )}
      {/* Grid tetap: setiap cara bayar selebar sama, kotak isian memenuhi
          kolomnya, tanda % sejajar, dan baris dikelompokkan. */}
      <div className="tscroll">
        <table className="tabel-ringkas tabel-isian tabel-irr">
          <colgroup>
            <col className="k-label" />
            {irr.skema.map((_, i) => <col key={i} className="k-skema" />)}
          </colgroup>
          <tbody>
          <tr className="kepala-skema">
            <th />
            {irr.skema.map((s, i) => (
              <th key={i}>
                <span className="kepala-cb">
                  <IsianTeks id={`irr-nama-${i}`} nilai={s.nama} disabled={ro} lebar={120}
                             ubah={(v) => ganti(i, v)} />
                  {/* Hapus langsung dari judul kolom; konfirmasi di baris bawah tabel. */}
                  {bolehUbah && irr.skema.length > 1 && !s.acuan && (
                    <button className="kecil hapus-cb" aria-label={`Hapus ${s.nama}`}
                            title="Hapus cara bayar ini (konfirmasi di bawah kolom)"
                            onClick={() => setYakinHapus(i)}>×</button>
                  )}
                </span>
                {yakinHapus === i && (
                  <span className="row" style={{ margin: "4px 0 0", gap: 4, flexWrap: "nowrap", justifyContent: "center" }}>
                    <button className="kecil bahaya" onClick={() => hapusSkema(i)}>Ya, hapus</button>
                    <button className="kecil" onClick={() => setYakinHapus(null)}>Batal</button>
                  </span>
                )}
              </th>
            ))}
          </tr>
          <tr className="grup"><td colSpan={irr.skema.length + 1}>Parameter cara bayar</td></tr>
          <tr><td>Kelompok</td>{irr.skema.map((s, i) => (
            <td key={i}><IsianTeks nilai={s.kelompok} lebar={70} disabled={ro}
                                   ubah={(v) => ubahSkema(i, (x) => ({ ...x, kelompok: v }))} /></td>))}</tr>
          <tr><td>Allocation{" "}
            {/* Total allocation di samping labelnya; merah bila belum 100%. */}
            <b className={Math.abs(hasil.irr.totalAlokasi - 1) > 1e-9 ? "alokasi-kurang" : "alokasi-pas"}>
              {persen(hasil.irr.totalAlokasi, 1, 1)}</b></td>{irr.skema.map((s, i) => (
            <td key={i}>
              <Isian jenis="persen" desimal={1} nilai={s.alokasi} lebar={60} disabled={ro}
                     ubah={(n) => ubah((d) => ({ ...d, irr: { ...d.irr,
                       skema: aturAlokasi(d.irr.skema, i, n) } }))} />
            </td>))}</tr>
          <tr><td>DP</td>{irr.skema.map((s, i) => (
            <td key={i}><Isian jenis="persen" nilai={s.dp} lebar={60} disabled={ro}
                               ubah={(n) => ubahArus(i, (x) => ({ ...x, dp: n }))} /></td>))}</tr>
          <tr><td>Installments (x)</td>{irr.skema.map((s, i) => (
            <td key={i}><Isian nilai={s.kali} lebar={60} disabled={ro}
                               ubah={(n) => ubahArus(i, (x) => ({ ...x, kali: Math.max(1, Math.round(n)) }))} /></td>))}</tr>
          <tr className="grup"><td colSpan={irr.skema.length + 1}>
            Bulan pencairan sisa (1 − DP) per tahap</td></tr>
          {TAHAP.map((t, ti) => (
            <tr key={t}><td>{t}</td>{irr.skema.map((s, i) => (
              <td key={i}><Isian nilai={s.bulan[ti]} lebar={60} disabled={ro}
                                 ubah={(n) => ubahArus(i, (x) => {
                                   const b = [...x.bulan] as typeof x.bulan; b[ti] = Math.round(n);
                                   return { ...x, bulan: b };
                                 })} /></td>))}</tr>
          ))}
          <tr className="grup"><td colSpan={irr.skema.length + 1}>Hasil</td></tr>
          <tr>
            <td>
              Cash Price
              {bolehUbah && (
                <button className="kecil" style={{ display: "block", marginTop: 4 }}
                        onClick={() => setEditKas((x) => !x)}>
                  {editKas ? "Selesai" : "Edit"}</button>
              )}
            </td>
            {/* Satu Cash Price untuk semua cara bayar; Adjusted Price tiap
                cara bayar = angka ini × koefisiennya. */}
            <td colSpan={irr.skema.length} className="kas-tunggal">
              {editKas && bolehUbah
                ? <Isian id="irr-kas" jenis="rp" nilai={hargaKasIrr(irr)} lebar={160}
                         ubah={(n) => ubah((d) => ({ ...d, irr: { ...d.irr, hargaKas: n } }))} />
                : <b>{rp(hargaKasIrr(irr))}</b>}
              <span className="hint" style={{ margin: "0 0 0 10px" }}>
                dipakai semua cara bayar · Adjusted Price = Cash Price × Coefficient
              </span>
            </td>
          </tr>
          {/* Baris pilihan acuan dihapus atas permintaan pemakai: acuannya selalu
              Cash Keras (koefisien 1), dan baris IRR sudah menandainya. */}
          <tr className="hasil"><td>Coefficient</td>{irr.skema.map((s, i) => (
            <td key={i} className="n" title={hasil.irr.koef[s.nama]?.toFixed(5)}><b>{Number.isFinite(hasil.irr.koef[s.nama])
              ? hasil.irr.koef[s.nama].toFixed(3) : "—"}</b></td>))}</tr>
          <tr className="hasil"><td>IRR</td>{irr.skema.map((s, i) => (
            <td key={i} className={`n${belumSesuai.has(s.nama) ? " belum-sesuai" : ""}`}
                title={belumSesuai.has(s.nama) ? "Belum tepat sesuai target" : undefined}>
              {s.acuan ? "0,0%" : belumSesuai.has(s.nama) ? persen(hasil.irr.irr[s.nama], 5)
                : persen(hasil.irr.irr[s.nama], 1, 1)}
            </td>))}</tr>
          <tr className="hasil"><td>Adjusted Price</td>{irr.skema.map((s, i) => (
            <td key={i} className="n"
                title={s.hargaSesuai && !s.acuan ? "Tersimpan dari Excel (hasil Goal Seek)" : "Dihitung tepat dari target"}>
              <b>{rp(hargaSesuaiSkema(irr, hasil.irr.koef[s.nama]))}</b>
              {s.hargaSesuai && !s.acuan ? <small className="asal">Excel</small> : null}
            </td>))}</tr>
          {bolehUbah && (
            <tr><td />{irr.skema.map((s, i) => (
              <td key={i}>
                {yakinHapus === i ? (
                  <span className="row" style={{ margin: 0, gap: 4, flexWrap: "nowrap" }}>
                    <button className="kecil bahaya" onClick={() => hapusSkema(i)}>Ya, hapus</button>
                    <button className="kecil" onClick={() => setYakinHapus(null)}>Batal</button>
                  </span>
                ) : (
                  <button className="kecil" disabled={irr.skema.length <= 1 || !!s.acuan}
                          title="Hapus cara bayar ini beserta kolomnya di Data Pricelist dan Pricelist"
                          onClick={() => setYakinHapus(i)}>Hapus</button>
                )}
              </td>))}</tr>
          )}
        </tbody></table>
      </div>
      {belumSesuai.size > 0 && (
        <div className="banner warn" style={{ marginTop: 10, marginBottom: 0 }}>
          <b>IRR {belumSesuai.size} cara bayar belum tepat {persen(irr.target)}</b>
          Ditandai kuning di baris IRR — biasanya karena Adjusted Price diambil apa adanya
          dari berkas Excel (hasil Goal Seek). Harga unitnya tetap mengikuti angka itu.
          {bolehUbah && (
            <div style={{ marginTop: 8 }}>
              <button className="pri"
                      onClick={() => ubah((d) => ({ ...d, irr: { ...d.irr, skema: tanpaSimpanan(d) } }))}>
                Samakan ke {persen(irr.target)} (Goal Seek)</button>
            </div>
          )}
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <span className="hint" style={{ margin: 0 }}>
          Total alokasi <b>{persen(hasil.irr.totalAlokasi)}</b> · WA coefficient{" "}
          <b>{hasil.irr.koefRata.toFixed(3)}</b> · Allocation otomatis berjumlah 100%: mengubah
          satu cara bayar menyesuaikan yang lain secara sebanding, dan cara bayar baru langsung
          mendapat bagian rata. Allocation hanya untuk WA Coefficient, tidak memengaruhi harga.
        </span>
        {bolehUbah && Math.abs(hasil.irr.totalAlokasi - 1) > 1e-9 && (
          <button onClick={() => ubah((d) => ({ ...d, irr: { ...d.irr, skema: genapkanAlokasi(d.irr.skema) } }))}>
            Genapkan ke 100%</button>
        )}
        {bolehUbah && (
          <button onClick={() => ubah((d) => ({ ...d, irr: { ...d.irr,
            skema: d.irr.skema.map((s, j, a) => ({ ...s, alokasi: bagiSebanding(a.map(() => 0), 10000)[j] / 10000 })) } }))}>
            Bagi rata</button>
        )}
        {bolehUbah && <button onClick={tambahSkema}>+ Tambah cara bayar</button>}
        {bolehUbah && baruDitambah > 0 && irr.skema.length > 1 && (
          <button onClick={batalTambah}>↶ Batalkan tambah</button>
        )}
      </div>
    </>
  );
}

// ── 2. Unit Data ───────────────────────────────────────────────────────────

const TEKS_UNIT = [
  ["kode", "Code", 130], ["alamat", "Address", 130], ["view", "View", 85],
  ["no", "No", 40], ["ukuran", "Ukuran", 100], ["phase", "Phase", 45],
  ["tipeBangunan", "Type", 45], ["view2", "View", 85], ["bentuk", "Sub-Tipe Kavling/Irr/Irr Hoek", 110],
  ["subTipe", "Sub-Tipe", 110],
] as const;

export function LangkahUnit({ data, hasil, ubah, bolehUbah }: PropsLangkah) {
  const ro = !bolehUbah;
  const ppn = tarifPpn(data), lp = labelPpn(ppn);
  // Base dan Factored Price dalam dua bentuk, sebelum dan sesudah PPN. Yang
  // dihitung adalah basis project-nya (Incl PPN, atau Excl PPN untuk Permai
  // Indah); bentuk satunya diturunkan dengan tarif PPN yang sama.
  const ppnDua = (n: number) => data.basisExclPpn
    ? { excl: n, incl: Math.round(n * (1 + ppn)) } : { excl: Math.round(n / (1 + ppn)), incl: n };
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
  // Increase massal: satu persen untuk semua unit atau hanya unit terpilih.
  const [kenaikan, setKenaikan] = useState(0);
  const [pesanKenaikan, setPesanKenaikan] = useState<string | null>(null);
  const terapkanKenaikan = (hanyaTerpilih: boolean) => {
    const n = hanyaTerpilih ? pilih.size : data.unit.length;
    ubah((d) => ({ ...d, unit: d.unit.map((u, j) =>
      !hanyaTerpilih || pilih.has(j) ? { ...u, kenaikan } : u) }));
    setPesanKenaikan(`Increase ${persen(kenaikan)} diterapkan ke ${n} unit${hanyaTerpilih ? " terpilih" : ""}. Simpan untuk menyimpannya.`);
  };
  // (+) Factor massal (mis. Gimmick 1%), sama caranya dengan Increase massal.
  const [faktorTambah, setFaktorTambah] = useState(0);
  const [pesanFaktor, setPesanFaktor] = useState<string | null>(null);
  const terapkanFaktor = (hanyaTerpilih: boolean) => {
    const n = hanyaTerpilih ? pilih.size : data.unit.length;
    ubah((d) => ({ ...d, unit: d.unit.map((u, j) =>
      !hanyaTerpilih || pilih.has(j) ? { ...u, faktorTambah } : u) }));
    setPesanFaktor(`(+) Factor ${persen(faktorTambah, 2, 1)} diterapkan ke ${n} unit${hanyaTerpilih ? " terpilih" : ""}. Simpan untuk menyimpannya.`);
  };
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
        "Periksa tabelnya, lalu Simpan." +
        (b.peringatan?.length ? ` Perhatikan: ${b.peringatan.join(" ")}` : "") });
      setBuka(false); setBerkas(null);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <>
      <p className="hint kiri">
        Base Price = {data.bulatBiasa ? "ROUND" : "ROUNDUP"}((Land × harga tanah + GFA × harga bangunan){data.basisExclPpn
          ? " (Excl PPN)" : " × (1 + PPN)"} ×
        (1 + kenaikan), {(data.bulatBase ?? 6) === 6 ? "juta"
          : `${(10 ** (data.bulatBase ?? 6)).toLocaleString("id-ID")}`}). Factored Price = Base × (1 + jumlah faktor posisi)
        × (1 + (+) Factor) + Special + Show Unit × (1 + kenaikan). Harga per m²
        ditulis sebelum PPN {lp}; faktor dan kenaikan dalam persen.
      </p>
      <div className="filters rapat param-irr" style={{ marginBottom: 12 }}>
        <div>
          <div className="lbl">Tarif PPN</div>
          <Isian id="unit-ppn" jenis="persen" nilai={ppn} lebar={70} disabled={ro}
                 ubah={(n) => ubah((d) => ({ ...d, ppn: n }))} />
        </div>
        <p className="hint kiri" style={{ margin: 0, alignSelf: "flex-end", maxWidth: 520 }}>
          Ubah bila tarif PPN dari pemerintah berubah. Dipakai untuk kolom Incl PPN
          di sini serta DPP dan Nilai Free PPN DTP di langkah 4a.
        </p>
      </div>
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
        <button onClick={() => { location.href = "/api/pricelist/susun/template-unit"; }}>
          Unduh Template Unit Data</button>
      </div>
      {bolehUbah && data.unit.length > 0 && (
        <div className="row increase-massal">
          <b>Increase</b>
          <Isian id="unit-increase-massal" jenis="persen" nilai={kenaikan} lebar={70}
                  ubah={(n) => { setKenaikan(n); setPesanKenaikan(null); }} />
          <button onClick={() => terapkanKenaikan(false)}>Semua Unit ({data.unit.length})</button>
          <button disabled={!pilih.size} onClick={() => terapkanKenaikan(true)}
                  title={pilih.size ? undefined : "Centang unit di tabel lebih dulu"}>
            Unit Terpilih ({pilih.size})</button>
          <span className="hint" style={{ margin: 0 }}>
            {pesanKenaikan ?? "Isi persen, lalu terapkan ke semua unit atau ke unit yang dicentang di tabel."}
          </span>
        </div>
      )}
      {bolehUbah && data.unit.length > 0 && (
        <div className="row increase-massal">
          <b>(+) Factor</b>
          <Isian id="unit-faktor-massal" jenis="persen" desimal={1} nilai={faktorTambah} lebar={70}
                  ubah={(n) => { setFaktorTambah(n); setPesanFaktor(null); }} />
          <button onClick={() => terapkanFaktor(false)}>Semua Unit ({data.unit.length})</button>
          <button disabled={!pilih.size} onClick={() => terapkanFaktor(true)}
                  title={pilih.size ? undefined : "Centang unit di tabel lebih dulu"}>
            Unit Terpilih ({pilih.size})</button>
          <span className="hint" style={{ margin: 0 }}>
            {pesanFaktor ?? "Mis. Gimmick (Trip, BPHTB, AKAD, Repair) 1%: nilai (+) Factor unit diganti dengan angka ini."}
          </span>
        </div>
      )}
      {buka && (
        <div className="form-blok">
          <p className="hint kiri" style={{ marginTop: 0 }}>
            Berkas Excel dengan lembar <b>UNIT DATA</b> (kolom Code Unit, Address,
            View, Ukuran, Land, Land Price, GFA, dan seterusnya). Seluruh unit di
            tabel ini diganti dengan isi berkas; langkah lain tidak berubah.
            Untuk project baru, isi <a href="/api/pricelist/susun/template-unit" download>template
            Unit Data</a> supaya kolomnya pasti terbaca.
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
          <table className="tabel-ringkas tabel-isian kepala-lekat tabel-unit"><thead>
            <tr>
              {bolehUbah && (
                <th className="aksi-unit">
                  <input type="checkbox" aria-label="Pilih semua unit yang tampil"
                         checked={tampil.length > 0 && tampil.every(({ i }) => pilih.has(i))}
                         onChange={(e) => setPilih(e.target.checked ? new Set(tampil.map(({ i }) => i)) : new Set())} />
                </th>
              )}
              <th className="no-unit">#</th>
              {TEKS_UNIT.map(([k, l]) => <th key={k}>{l}</th>)}
              <th>Land (m²)</th>
              <th>Land Price (base)<br />(Excl PPN. {lp})</th><th className="incl">Land Price (base)<br />(Incl PPN. {lp})</th>
              <th>GFA (m²)</th>
              <th>GFA (base)<br />(Excl PPN. {lp})</th><th className="incl">GFA (base)<br />(Incl PPN. {lp})</th>
              <th>Increase</th>
              {FAKTOR.map(([, l]) => <th key={l}>{l}</th>)}
              <th>(+) Factor</th><th>Special (Rp)</th><th>Show Unit (Rp)</th>
              <th>Base Price<br />(Excl PPN. {lp})</th><th>Factored Price<br />(Excl PPN. {lp})</th>
              <th className="incl">Base Price<br />(Incl PPN. {lp})</th><th className="incl">Factored Price<br />(Incl PPN. {lp})</th>
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
                <td className="n no-unit">{i + 1}</td>
                {TEKS_UNIT.map(([k, , w]) => (
                  <td key={k}><IsianTeks id={k === "kode" ? `unit-kode-${i}` : undefined}
                                         nilai={u[k] ?? ""} lebar={w} disabled={ro}
                                         ubah={(v) => ubahUnit(i, (x) => ({ ...x, [k]: v }))} /></td>
                ))}
                <td><Isian nilai={u.lt} desimal={1} lebar={70} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, lt: n }))} /></td>
                <td><Isian jenis="rp" nilai={u.hargaTanah} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, hargaTanah: n }))} /></td>
                <td className="n">{rpPolos(b?.hasilUnit.hargaTanahPpn)}</td>
                <td><Isian nilai={u.lb} lebar={60} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, lb: n }))} /></td>
                <td><Isian jenis="rp" nilai={u.hargaBangunan} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, hargaBangunan: n }))} /></td>
                <td className="n">{rpPolos(b?.hasilUnit.hargaBangunanPpn)}</td>
                <td><Isian jenis="persen" kosongNol desimal={1} nilai={u.kenaikan} lebar={55} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, kenaikan: n }))} /></td>
                {FAKTOR.map(([k]) => (
                  <td key={k}><Isian jenis="persen" kosongNol nilai={u.faktor[k] ?? 0} lebar={55} disabled={ro}
                                     ubah={(n) => ubahUnit(i, (x) => ({ ...x, faktor: { ...x.faktor, [k]: n } }))} /></td>
                ))}
                <td><Isian jenis="persen" desimal={1} nilai={u.faktorTambah} lebar={55} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, faktorTambah: n }))} /></td>
                <td><Isian jenis="rp" kosongNol nilai={u.special} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, special: n }))} /></td>
                <td><Isian jenis="rp" kosongNol nilai={u.showUnit} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, showUnit: n }))} /></td>
                <td className="n">{rp(ppnDua(b?.hasilUnit.base ?? NaN).excl)}</td>
                <td className="n"><b>{rp(ppnDua(b?.hasilUnit.factored ?? NaN).excl)}</b></td>
                <td className="n">{rp(ppnDua(b?.hasilUnit.base ?? NaN).incl)}</td>
                <td className="n"><b>{rp(ppnDua(b?.hasilUnit.factored ?? NaN).incl)}</b></td>
              </tr>
            ))}
          </tbody><tfoot>
            {/* Jumlah unit yang tampil (ikut pencarian), total Land, GFA, Base dan Factored Price. */}
            <tr className="total-unit">
              <td className="aksi-unit">
                Total {tampil.length} unit{q ? ` (dari ${data.unit.length})` : ""}</td>
              <td colSpan={(bolehUbah ? 0 : -1) + 1 + TEKS_UNIT.length} />
              <td className="n">{luas(tampil.reduce((a, { u }) => a + u.lt, 0), 1)}</td><td /><td />
              <td className="n">{luas(tampil.reduce((a, { u }) => a + u.lb, 0))}</td><td /><td /><td />
              {FAKTOR.map(([k]) => <td key={k} />)}
              <td />
              <td /><td />
              {(["excl", "incl"] as const).map((j) => (
                <Fragment key={j}>
                  <td className="n">{rp(ppnDua(tampil.reduce((a, { b }) => a + (b?.hasilUnit.base ?? 0), 0))[j])}</td>
                  <td className="n">{rp(ppnDua(tampil.reduce((a, { b }) => a + (b?.hasilUnit.factored ?? 0), 0))[j])}</td>
                </Fragment>
              ))}
            </tr>
          </tfoot></table>
        </div>
      )}
      {bolehUbah && data.unit.length > 0 && (
        <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
          <button onClick={() => tambah()}>+ Tambah unit di akhir tabel</button>
          <span className="hint" style={{ margin: 0 }}>
            Unit yang ditambah atau dihapus baru tersimpan setelah <b>Simpan</b>, dan baru
            dipakai Simulasi setelah diberlakukan di langkah 4a.
          </span>
        </div>
      )}
      <CatatanUnit data={data} ubah={ubah} ro={ro} />
    </>
  );
}

/** Paling banyak sekian gambar per catatan (sama dengan batas di server). */
const MAKS_GAMBAR = 10;

/**
 * Perkecil gambar besar sebelum diunggah: screenshot penuh layar atau foto
 * kamera bisa beberapa MB. Gambar di atas 1,5 MB atau lebih lebar/tinggi dari
 * 2000 px diubah menjadi JPEG 2000 px; gambar kecil diunggah apa adanya.
 */
async function perkecilGambar(f: File): Promise<File> {
  if (f.type === "image/gif") return f;
  const bmp = await createImageBitmap(f).catch(() => null);
  if (!bmp) return f;
  const skala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  if (f.size <= 1.5 * 1024 * 1024 && skala === 1) return f;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * skala); c.height = Math.round(bmp.height * skala);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
  if (!blob) return f;
  return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

/**
 * Catatan Unit Data: tulisan dan gambar (mis. screenshot persetujuan harga).
 * Gambar dipilih lewat tombol atau ditempel (Ctrl + V) di kotak catatan;
 * gambar langsung diunggah, dan rujukannya ikut tersimpan saat Simpan.
 */
function CatatanUnit({ data, ubah, ro }: {
  data: SusunPricelist; ubah: PropsLangkah["ubah"]; ro: boolean;
}) {
  const gambar = data.catatanGambar ?? [];
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const unggah = async (files: File[]) => {
    const sisa = MAKS_GAMBAR - gambar.length;
    if (!files.length) return;
    if (sisa <= 0) { setGalat(`Paling banyak ${MAKS_GAMBAR} gambar per catatan.`); return; }
    setSibuk(true); setGalat(null);
    try {
      for (const asli of files.slice(0, sisa)) {
        const f = await perkecilGambar(asli);
        const fd = new FormData(); fd.append("file", f, f.name);
        const res = await fetch("/api/pricelist/susun/gambar", { method: "POST", body: fd });
        const b = await res.json().catch(() => ({}));
        if (res.status === 401) { location.href = "/login"; return; }
        if (!res.ok) { setGalat(`${asli.name}: ${b.detail ?? b.title ?? `HTTP ${res.status}`}`); continue; }
        ubah((d) => ({ ...d, catatanGambar: [...(d.catatanGambar ?? []), { id: b.id, nama: b.nama }] }));
      }
      if (files.length > sisa) setGalat(`Hanya ${sisa} gambar yang ditambahkan: paling banyak ${MAKS_GAMBAR} gambar per catatan.`);
    } finally {
      setSibuk(false);
    }
  };

  // Tempel screenshot (Windows + Shift + S lalu Ctrl + V). Bila papan klip
  // juga berisi tulisan (mis. salinan sel Excel), yang ditempel tulisannya.
  const tempel = (e: React.ClipboardEvent) => {
    if (ro || e.clipboardData.getData("text/plain")) return;
    const files = [...e.clipboardData.items]
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it, i) => {
        const f = it.getAsFile()!;
        const jam = new Date().toLocaleString("sv-SE").replace(/[: ]/g, "-");
        return new File([f], `screenshot-${jam}${i ? `-${i + 1}` : ""}.${f.type.split("/")[1] || "png"}`,
                        { type: f.type });
      });
    if (!files.length) return;
    e.preventDefault();
    void unggah(files);
  };

  return (
    <div style={{ marginTop: 14 }}>
      <label className="lbl" htmlFor="unit-catatan">Catatan</label>
      <textarea id="unit-catatan" className="catatan-unit" rows={3} maxLength={5000}
                disabled={ro} value={data.catatanUnit ?? ""} onPaste={tempel}
                onChange={(e) => { const v = e.target.value; ubah((d) => ({ ...d, catatanUnit: v })); }} />
      {gambar.length > 0 && (
        <div className="gambar-catatan">
          {gambar.map((g) => (
            <figure key={g.id}>
              <a href={`/api/pricelist/susun/gambar/${g.id}`} target="_blank" rel="noreferrer"
                 title="Buka gambar ukuran penuh">
                <img src={`/api/pricelist/susun/gambar/${g.id}`} alt={g.nama} loading="lazy" />
              </a>
              <figcaption>
                <span title={g.nama}>{g.nama}</span>
                {!ro && (
                  <button className="kecil bahaya" aria-label={`Hapus ${g.nama}`}
                          onClick={() => ubah((d) => ({ ...d,
                            catatanGambar: (d.catatanGambar ?? []).filter((x) => x.id !== g.id) }))}>
                    Hapus</button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {galat && <div className="banner stop" style={{ marginTop: 8 }}>{galat}</div>}
      <div className="row" style={{ margin: "6px 0 0", alignItems: "center" }}>
        {!ro && (
          <label className="tombol-berkas">
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
                   disabled={sibuk || gambar.length >= MAKS_GAMBAR}
                   onChange={(e) => { void unggah([...(e.target.files ?? [])]); e.target.value = ""; }} />
            {sibuk ? "Mengunggah…" : "+ Tambah gambar"}
          </label>
        )}
        <span className="hint" style={{ margin: 0 }}>
          Tempel screenshot langsung dengan <b>Ctrl + V</b> di kotak catatan, atau pilih lewat
          <b> + Tambah gambar</b> (paling banyak {MAKS_GAMBAR}). Tulisan dan gambar ikut tersimpan
          setelah <b>Simpan</b>.
        </span>
      </div>
    </div>
  );
}

/**
 * Kenaikan bertingkat satu cara bayar: tiap tingkat punya % dan Nilai (Rp),
 * dan dihitung dari hasil tingkat sebelumnya.
 */
function KenaikanBertingkat({ tingkat, ubah, disabled }: {
  tingkat: { persen: number; rp: number }[];
  ubah: (t: { persen: number; rp: number }[]) => void; disabled?: boolean;
}) {
  const ganti = (j: number, p: Partial<{ persen: number; rp: number }>) =>
    ubah(tingkat.map((t, m) => m === j ? { ...t, ...p } : t));
  return (
    <div className="naik-tingkat">
      {tingkat.map((t, j) => (
        <div key={j} className="row" style={{ margin: 0, gap: 4, flexWrap: "nowrap", alignItems: "center" }}>
          {tingkat.length > 1 && <span className="hint" style={{ margin: 0, minWidth: 18 }}>{j + 1}.</span>}
          <Isian jenis="persen" kosongNol desimal={1} nilai={t.persen} lebar={60} disabled={disabled}
                 ubah={(n) => ganti(j, { persen: n })} />
          <Isian jenis="rp" kosongNol nilai={t.rp} lebar={110} disabled={disabled}
                 ubah={(n) => ganti(j, { rp: n })} />
          {!disabled && (
            <button className="kecil" aria-label={`Hapus tingkat ${j + 1}`}
                    onClick={() => ubah(tingkat.filter((_, m) => m !== j))}>×</button>
          )}
        </div>
      ))}
      {!disabled && (
        <button className="kecil" title="Tambah tingkat kenaikan (dihitung dari hasil tingkat sebelumnya)"
                onClick={() => ubah([...tingkat, { persen: 0, rp: 0 }])}>
          {tingkat.length ? "+ Tingkat" : "+ Kenaikan"}</button>
      )}
    </div>
  );
}

// ── 3. Data Pricelist ──────────────────────────────────────────────────────

export function LangkahDataPl({ data, hasil, ubah, bolehUbah }: PropsLangkah) {
  const ro = !bolehUbah;
  const kolom = data.dataPricelist.kolom;
  const ubahKolom = (i: number, f: (k: (typeof kolom)[0]) => (typeof kolom)[0]) =>
    ubah((d) => ({ ...d, dataPricelist: { ...d.dataPricelist,
      kolom: d.dataPricelist.kolom.map((k, j) => j === i ? f(k) : k) } }));
  const [yakin, setYakin] = useState<number | null>(null);
  const x0 = (i: number) => kolom[i];

  // Cara bayar baru ditambah di sini saja, tidak masuk Data (IRR), supaya
  // cara bayar normal dan Allocation-nya tidak berubah. Harganya dihitung
  // dari cara bayar lain × pengali (bawaan Cash Keras × 100%) lalu kenaikan
  // bertingkat bila perlu; kolom Pricelist dan blok T&C-nya ikut dibuat.
  const tambahTurunan = () => ubah((d) => {
    const ada = new Set([...d.dataPricelist.kolom.map((k) => k.nama),
                         ...d.pricelist.kolom.map((k) => k.nama), ...d.irr.skema.map((x) => x.nama)]);
    let no = 1;
    while (ada.has(`Kolom turunan ${no}`)) no++;
    const nama = `Kolom turunan ${no}`;
    const dari = d.dataPricelist.kolom[d.dataPricelist.kolom.length - 1]?.nama ?? "";
    return { ...d,
      dataPricelist: { ...d.dataPricelist, kolom: [...d.dataPricelist.kolom, { nama, dari, kali: 1 }] },
      pricelist: { ...d.pricelist, kolom: [...d.pricelist.kolom, { nama, dari: nama, kali: 1 }] } };
  });
  /**
   * Geser kolom i satu langkah (arah -1 naik, +1 turun). Kolom turunan tidak
   * boleh berada di atas kolom sumbernya. Urutan kolom Pricelist ikut urutan
   * kolom sumbernya di sini.
   */
  const bolehTukar = (a: number) =>
    a >= 0 && a + 1 < kolom.length && kolom[a + 1].dari !== kolom[a].nama;
  const geser = (i: number, arah: -1 | 1) => ubah((d) => {
    const k = [...d.dataPricelist.kolom];
    const a = arah < 0 ? i - 1 : i;
    if (a < 0 || a + 1 >= k.length || k[a + 1].dari === k[a].nama) return d;
    [k[a], k[a + 1]] = [k[a + 1], k[a]];
    const posisi = new Map(k.map((x, j) => [x.nama, j]));
    const pl = d.pricelist.kolom.map((x, j) => ({ x, j }))
      .sort((p, q) => (posisi.get(p.x.dari) ?? 1e9) - (posisi.get(q.x.dari) ?? 1e9) || p.j - q.j)
      .map(({ x }) => x);
    return { ...d, dataPricelist: { ...d.dataPricelist, kolom: k },
             pricelist: { ...d.pricelist, kolom: pl } };
  });
  /** Hapus kolom turunan beserta turunannya dan kolom Pricelist yang bersumber darinya. */
  const hapusTurunan = (i: number) => {
    setYakin(null);
    ubah((d) => {
      const hilang = new Set([d.dataPricelist.kolom[i].nama]);
      d.dataPricelist.kolom.forEach((k) => { if (k.dari && hilang.has(k.dari)) hilang.add(k.nama); });
      return { ...d,
        dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.filter((k) => !hilang.has(k.nama)) },
        pricelist: { ...d.pricelist, kolom: d.pricelist.kolom.filter((k) => !hilang.has(k.dari)) } };
    });
  };

  return (
    <>
      <p className="hint kiri">
        Harga per cara bayar = ROUNDUP(Factored Price × koefisien Data (IRR), juta)
        + tambahan; lalu kenaikan bertingkat khusus cara bayar itu bila diisi — tiap tingkat dari
        hasil tingkat sebelumnya: ROUNDUP(harga × (1 + %), juta) + Nilai (Rp). Kolom turunan dihitung dari kolom lain di sebelah kirinya:
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
        <table className="tabel-ringkas tabel-isian tabel-rapat"><tbody>
          <tr className="kepala-tengah"><th>Kolom</th><th>Dihitung dari</th><th>Koefisien / pengali</th>
            <th title="Kenaikan khusus cara bayar ini. Tiap tingkat dihitung dari hasil tingkat sebelumnya: ROUNDUP(harga × (1 + %), juta) + Nilai (Rp)">
              Kenaikan bertingkat<br /><span style={{ fontWeight: 400 }}>% · Nilai (Rp)</span></th>
            <th title="Nama kolom yang tampil di Pricelist dan cetakan; hitungannya tetap dari kolom ini">
              Perubahan Metode Pembayaran</th>{!ro && <th />}</tr>
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
                          // Kenaikan khusus cara bayar ini ikut terbawa saat sumbernya diganti.
                          const naik = { naikPersen: x0(i).naikPersen, naikRp: x0(i).naikRp, naikTingkat: x0(i).naikTingkat };
                          ubahKolom(i, (x) => jenis === "s" ? { nama: x.nama, skema: nama, ...naik }
                            : { nama: x.nama, dari: nama, kali: x.kali ?? 1, ...naik });
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
                {k.skema ? (Number.isFinite(hasil.irr.koef[k.skema]) ? hasil.irr.koef[k.skema].toFixed(3) : "—")
                  : <Isian jenis="persen" nilai={k.kali ?? 1} lebar={70} disabled={ro}
                           ubah={(n) => ubahKolom(i, (x) => ({ ...x, kali: n }))} />}
              </td>
              <td>
                <KenaikanBertingkat tingkat={tingkatNaik(k)} disabled={ro}
                                    ubah={(t) => ubahKolom(i, (x) => ({ ...x, naikPersen: undefined,
                                      naikRp: undefined, naikTingkat: t.length ? t : undefined }))} />
              </td>
              {/* Ganti nama yang tampil di Pricelist saja: kolom Pricelist yang
                  bersumber dari kolom ini diganti namanya, hitungannya tetap. */}
              <td>
                {data.pricelist.kolom.map((p, j) => p.dari !== k.nama ? null : (
                  <IsianTeks key={j} nilai={p.nama} lebar={230} disabled={ro}
                             ubah={(v) => ubah((d) => ({ ...d, pricelist: { ...d.pricelist,
                               kolom: d.pricelist.kolom.map((x, m) => m === j ? { ...x, nama: v } : x) } }))} />
                ))}
                {!data.pricelist.kolom.some((p) => p.dari === k.nama) && (
                  <span className="hint" style={{ margin: 0 }}>tidak dipakai di Pricelist</span>
                )}
              </td>
              {!ro && (
                <td style={{ whiteSpace: "nowrap" }}>
                  <span className="row" style={{ margin: "0 6px 0 0", gap: 4, display: "inline-flex" }}>
                    <button className="kecil" title="Geser ke atas" aria-label={`Geser ${k.nama} ke atas`}
                            disabled={!bolehTukar(i - 1)} onClick={() => geser(i, -1)}>▲</button>
                    <button className="kecil" title="Geser ke bawah" aria-label={`Geser ${k.nama} ke bawah`}
                            disabled={!bolehTukar(i)} onClick={() => geser(i, 1)}>▼</button>
                  </span>
                  {/* Kolom dari cara bayar dihapus di Data (IRR); di sini hanya turunan. */}
                  {k.skema ? (
                    <span className="hint" style={{ margin: 0 }} title="Hapus cara bayarnya di langkah 1 Data (IRR)">
                      hapus di Data (IRR)</span>
                  ) : yakin === i ? (
                    <span className="row" style={{ margin: 0, flexWrap: "nowrap", gap: 4 }}>
                      <button className="kecil bahaya" onClick={() => hapusTurunan(i)}>Ya, hapus</button>
                      <button className="kecil" onClick={() => setYakin(null)}>Batal</button>
                    </span>
                  ) : (
                    <button className="kecil" title="Hapus cara bayar ini (dan kolom yang dihitung darinya)"
                            onClick={() => setYakin(i)}>Hapus</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody></table>
      </div>
      {!ro && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="pri" onClick={() => ubah(denganCaraBayarBaru)}
                  title="Cara bayar baru masuk Data (IRR): koefisien dihitung otomatis dari DP, cicilan dan bulan tahap; Allocation dibagi otomatis">
            + Tambah Cara Bayar</button>
          <button onClick={tambahTurunan}
                  title="Kolom yang dihitung dari kolom lain × pengali (mis. BANK KPR = KPR Express × 112%), tidak masuk Data (IRR)">
            + Tambah kolom turunan</button>
          <span className="hint" style={{ margin: 0 }}>
            Cara bayar baru <b>masuk Data (IRR)</b>: isi DP, cicilan dan bulan tahapnya di langkah 1 —
            koefisiennya dihitung otomatis, Allocation dibagi otomatis (tidak memengaruhi harga), dan
            kolomnya langsung ada di langkah 4a dan 5.
          </span>
        </div>
      )}

      <div className="tscroll" style={{ maxHeight: 560, overflowY: "auto" }}>
        {/* Kolom harga sama lebar; judul cara bayar yang panjang dilipat. */}
        <table className="tabel-ringkas kepala-lekat tabel-harga-rata" style={{ whiteSpace: "nowrap" }}><thead>
          <tr>
            <th>No</th><th>Code</th><th>Phase</th><th>Address</th><th>View</th><th>Ukuran</th>
            <th>Tipe</th><th>Sub-Tipe</th><th>Land</th><th>Build</th><th className="kol-harga">Factored Price</th>
            {kolom.map((k) => <th key={k.nama} className="kol-harga">{k.nama}</th>)}
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

export function LangkahPricelist({ data, hasil, ubah, bolehUbah, aksi, slug }: PropsLangkah & {
  /** Panel memberlakukan, disediakan halamannya. */
  aksi?: React.ReactNode;
  slug?: string | null;
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

  // Cetak A4: isinya (termasuk yang belum disimpan) diserahkan ke tab cetak
  // lewat localStorage, lalu tab itu dibuka.
  const cetak = () => {
    try {
      localStorage.setItem("cetak-pl", JSON.stringify({
        judul: pl.judul, tanggal: pl.tanggal, catatan: pl.catatan, slug: slug ?? null,
        kolom: pl.kolom.map((k) => k.nama), unit }));
    } catch { /* penyimpanan peramban penuh atau diblokir */ }
    open("/pricelist/cetak-pl", "_blank");
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", margin: 0 }}>
        <button className="pri" onClick={cetak} disabled={!unit.length}
                title="Pratinjau dan cetak Pricelist di kertas A4 (atau simpan sebagai PDF)">
          🖨 Cetak A4</button>
      </div>
      <p className="hint kiri">
        Kolom dengan pengali 100% mengambil harga Data Pricelist apa adanya; selain
        itu ROUND(harga × pengali, juta) — di Excel 111,5% untuk kolom KPR — atau ROUNDUP
        bila dipilih di kolom Pembulatan (Susunan kolom harga).
        DPP = harga / (1 + PPN {labelPpn(tarifPpn(data))}); Nilai Free PPN DTP = harga − DPP.
        Tarif PPN diubah di langkah 2.
      </p>
      <div className="filters rapat">
        <div><div className="lbl">Judul</div>
          <IsianTeks id="pl-judul" nilai={pl.judul} lebar={200} disabled={ro}
                     ubah={(v) => ubahPl((p) => ({ ...p, judul: v }))} /></div>
        <div><div className="lbl">Tanggal berlaku</div>
          <IsianTeks id="pl-tanggal" nilai={pl.tanggal} lebar={160} disabled={ro}
                     ubah={(v) => ubahPl((p) => ({ ...p, tanggal: v }))} /></div>
        <div style={{ gridColumn: "span 2" }}><div className="lbl">Catatan kolom KPR</div>
          <input id="pl-catatan" value={pl.catatan} disabled={ro}
                 onChange={(e) => ubahPl((p) => ({ ...p, catatan: e.target.value }))} /></div>
      </div>

      <details className="sp" style={{ marginTop: 12 }}>
        <summary className="hint kiri" style={{ cursor: "pointer" }}>Susunan kolom harga ({pl.kolom.length})</summary>
        <div className="tscroll" style={{ marginTop: 8 }}>
          <table className="tabel-ringkas tabel-isian tabel-rapat"><tbody>
            <tr><th>Kolom Pricelist</th><th>Dari kolom Data Pricelist</th><th>Pengali</th>
              <th title="Pembulatan ke jutaan untuk pengali selain 100%: ROUND (biasa) atau ROUNDUP (ke atas)">Pembulatan</th>
              {bolehUbah && <th />}</tr>
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
                <td><select value={k.bulatAtas ? "atas" : "biasa"} disabled={ro || k.kali === 1}
                            title={k.kali === 1 ? "Pengali 100%: harga diambil apa adanya" : undefined}
                            onChange={(e) => ubahPl((p) => ({ ...p, kolom: p.kolom.map((x, j) =>
                              j === i ? { ...x, bulatAtas: e.target.value === "atas" || undefined } : x) }))}>
                  <option value="biasa">ROUND</option>
                  <option value="atas">ROUNDUP</option>
                </select></td>
                {bolehUbah && <td><button className="kecil" disabled={pl.kolom.length <= 1}
                  onClick={() => ubahPl((p) => ({ ...p, kolom: p.kolom.filter((_, j) => j !== i) }))}>Hapus</button></td>}
              </tr>
            ))}
          </tbody></table>
        </div>
        {bolehUbah && (
          <button style={{ marginTop: 8 }} onClick={() => ubahPl((p) => {
            // Nama unik, supaya blok T&C-nya langsung terbentuk dan ikut saat diganti.
            const ada = new Set(p.kolom.map((k) => k.nama));
            let no = 1;
            while (ada.has(`Kolom baru ${no}`)) no++;
            return { ...p, kolom: [...p.kolom,
              { nama: `Kolom baru ${no}`, dari: kolomDp[0] ?? "", kali: 1 }] };
          })}>+ Tambah kolom</button>
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

/**
 * Teks awal kolom waktu satu baris T&C, dari labelnya dan cara bayar Data
 * (IRR) di belakangnya. Hanya titik awal; ketentuan sebenarnya diketik orang.
 */
function waktuAwal(label: string, s?: { dp: number; kali: number }): string {
  const l = label.toUpperCase();
  if (/BOOKING|\bBF\b|TANDA JADI|UTJ/.test(l)) return "";
  if (/AKAD/.test(l)) return "Saat akad kredit";
  if (/CICIL/.test(l)) {
    const n = s?.kali ?? (Number(/(\d+)\s*X/.exec(l)?.[1]) || 0);
    return n > 1 ? `Setiap bulan selama ${n} bulan, mulai 1 bulan setelah BF`
      : "Setiap bulan, mulai 1 bulan setelah BF";
  }
  if (/\bDP\b|UANG MUKA/.test(l)) {
    return s && s.dp < 1 && s.kali > 1
      ? `Dicicil ${s.kali}x setiap bulan, mulai 1 bulan setelah BF` : "1 bulan setelah BF";
  }
  if (/PELUNASAN|LUNAS/.test(l)) return "1 bulan setelah BF";
  return "";
}

/**
 * Isi kolom waktu yang masih kosong di setiap blok T&C dengan teks awalnya.
 * Isian yang sudah ditulis tidak disentuh.
 */
export function denganWaktuAwal(d: SusunPricelist): SusunPricelist {
  const kolomDp = new Map(d.dataPricelist.kolom.map((k) => [k.nama, k]));
  const skemaKolom = (nama: string) => {
    let k = kolomDp.get(nama);
    for (let n = 0; k && !k.skema && n < 50; n++) k = k.dari ? kolomDp.get(k.dari) : undefined;
    return d.irr.skema.find((x) => x.nama === k?.skema);
  };
  // Cara bayar di belakang tiap blok: lewat kolom Pricelist yang judulnya cocok.
  const skemaBlok = (judul: string) => {
    const p = d.pricelist.kolom.find((k) => kunciTnc(k.nama) === kunciTnc(judul)
      || kunciTnc(k.dari) === kunciTnc(judul));
    return p ? skemaKolom(p.dari) : undefined;
  };
  let berubah = false;
  const caraBayar = d.tnc.caraBayar.map((c) => {
    const s = skemaBlok(c.judul);
    return { ...c, baris: c.baris.map((b) => {
      if (b.waktu.trim()) return b;
      const w = waktuAwal(b.label, s);
      if (!w) return b;
      berubah = true;
      return { ...b, waktu: w };
    }) };
  });
  return berubah ? { ...d, tnc: { ...d.tnc, caraBayar } } : d;
}

/**
 * Blok T&C untuk setiap kolom Pricelist yang belum punya blok (dicocokkan
 * dengan nama tampilan maupun nama kolom asalnya). Barisnya disusun dari
 * cara bayar di Data (IRR) di belakang kolom itu — Booking Fee, lalu
 * pelunasan, cicilan, atau DP dan sisa KPR — sebagai titik awal yang diubah
 * sesudahnya. Blok yang sudah ada tidak disentuh.
 */

function denganTncLengkap(d: SusunPricelist, hanya?: Set<string>): SusunPricelist {
  const kunci = kunciTnc;
  const ada = new Set(d.tnc.caraBayar.map((c) => kunci(c.judul)));
  const kolomDp = new Map(d.dataPricelist.kolom.map((k) => [k.nama, k]));
  const skemaDari = (nama: string) => {
    let k = kolomDp.get(nama);
    for (let n = 0; k && !k.skema && n < 50; n++) k = k.dari ? kolomDp.get(k.dari) : undefined;
    return d.irr.skema.find((x) => x.nama === k?.skema);
  };
  const pc = (n: number) => `${(n * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
  const baru = d.pricelist.kolom.flatMap((k) => {
    if (hanya && !hanya.has(k.nama)) return [];
    // Kolom yang baru ditambah dicocokkan dengan namanya saja: ia boleh
    // bersumber dari kolom yang sudah punya blok (mis. Cash Keras).
    if (ada.has(kunci(k.nama)) || (!hanya && ada.has(kunci(k.dari)))) return [];
    ada.add(kunci(k.nama));
    const s = skemaDari(k.dari);
    const baris: BarisTnc[] = [{ label: "Booking Fee", nilai: "10 Juta", waktu: "" }];
    if (s && s.dp < 1) {
      baris.push({ label: "DP", nilai: pc(s.dp), waktu: "" });
      baris.push({ label: "Pelunasan / Akad", nilai: pc(1 - s.dp), waktu: "" });
    } else if (s && s.kali > 1) {
      baris.push({ label: "Cicilan", nilai: `${s.kali}x`, waktu: "" });
    } else {
      baris.push({ label: "Pelunasan", nilai: "100%", waktu: "" });
    }
    baris.forEach((b) => { b.waktu = waktuAwal(b.label, s); });
    return [{ judul: k.nama.toUpperCase(), baris }];
  });
  return baru.length ? { ...d, tnc: { ...d.tnc, caraBayar: [...d.tnc.caraBayar, ...baru] } } : d;
}

/**
 * Jaga T&C tetap mengikuti kolom Pricelist sesudah setiap perubahan draf:
 * kolom Pricelist baru (dari langkah mana pun) langsung mendapat blok, dan
 * kolom yang namanya diganti membawa judul bloknya. Blok tidak pernah
 * dihapus otomatis — isinya ditulis orang.
 */
export function sinkronTnc(lama: SusunPricelist, baru: SusunPricelist): SusunPricelist {
  if (lama.pricelist.kolom === baru.pricelist.kolom) return baru;
  const namaLama = new Set(lama.pricelist.kolom.map((k) => kunciTnc(k.nama)));
  const namaBaru = new Set(baru.pricelist.kolom.map((k) => kunciTnc(k.nama)));
  let d = baru;
  const tambah = new Set<string>();
  baru.pricelist.kolom.forEach((k, i) => {
    // Nama yang sedang dikosongkan tidak mengubah apa pun.
    if (!kunciTnc(k.nama) || namaLama.has(kunciTnc(k.nama))) return;
    // Ganti nama: kolom di posisi yang sama dulu bernama lain, dan nama lama
    // itu tidak lagi dipakai kolom mana pun — judul bloknya ikut diganti.
    const asal = lama.pricelist.kolom[i];
    const j = asal && !namaBaru.has(kunciTnc(asal.nama))
      ? d.tnc.caraBayar.findIndex((c) => kunciTnc(c.judul) === kunciTnc(asal.nama)) : -1;
    if (j >= 0 && kunciTnc(asal!.nama)) {
      d = { ...d, tnc: { ...d.tnc, caraBayar: d.tnc.caraBayar.map((c, m) =>
        m === j ? { ...c, judul: k.nama.toUpperCase() } : c) } };
    } else {
      tambah.add(k.nama);
    }
  });
  return tambah.size ? denganTncLengkap(d, tambah) : d;
}

export function LangkahTnc({ data, ubah, bolehUbah, slug }: PropsLangkah & { slug?: string | null }) {
  const ro = !bolehUbah;
  const t = data.tnc;
  // Cetak A4: isinya (termasuk yang belum disimpan) diserahkan ke tab cetak
  // lewat localStorage, lalu tab itu dibuka.
  const cetak = () => {
    try {
      localStorage.setItem("cetak-tnc", JSON.stringify({
        tnc: data.tnc, tanggal: data.pricelist.tanggal, slug: slug ?? null }));
    } catch { /* penyimpanan peramban penuh atau diblokir */ }
    open("/pricelist/cetak-tnc", "_blank");
  };
  const ubahT = (f: (x: typeof t) => typeof t) => ubah((d) => ({ ...d, tnc: f(d.tnc) }));
  const ubahCb = (i: number, f: (c: (typeof t.caraBayar)[0]) => (typeof t.caraBayar)[0]) =>
    ubahT((x) => ({ ...x, caraBayar: x.caraBayar.map((c, j) => j === i ? f(c) : c) }));

  // Salin T&C dari project lain: format dan cara bayarnya sering sama, jadi
  // tidak perlu diketik ulang. Rekening project ini tidak ikut diganti.
  const [lain, setLain] = useState<{ slug: string; nama: string; jumlah: number }[]>([]);
  const [dari, setDari] = useState("");
  const [pesanSalin, setPesanSalin] = useState<string | null>(null);
  useEffect(() => {
    if (ro) return;
    fetch("/api/pricelist/susun/tnc").then((r) => r.ok ? r.json() : null)
      .then((b) => setLain(b?.project ?? [])).catch(() => {});
  }, [ro]);
  const salin = async () => {
    const p = lain.find((x) => x.slug === dari);
    if (!p) return;
    setPesanSalin(null);
    const r = await fetch(`/api/pricelist/susun/tnc?slug=${encodeURIComponent(p.slug)}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok || !b.tnc) { setPesanSalin(b.detail ?? b.title ?? `HTTP ${r.status}`); return; }
    const x = b.tnc as typeof t;
    const daftar = x.caraBayar.map((c, i) => `${i + 1}. ${c.judul}`).join("\n");
    if (!confirm(`Terms & Conditions ${p.nama}:\n\n${daftar}\n\n${x.catatan.length} catatan.\n\n` +
                 "Judul, cara bayar dan catatan di layar diganti dengan isi di atas (rekening project ini " +
                 "tetap). Lanjutkan?")) return;
    ubahT((y) => ({ ...y, judul: x.judul, caraBayar: x.caraBayar, catatan: x.catatan }));
    setPesanSalin(`T&C disalin dari ${p.nama}. Periksa nama PT, nominal dan cara bayar yang berbeda, lalu Simpan.`);
  };

  return (
    <>
      <div className="row" style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
        <div className="filters rapat" style={{ maxWidth: 420, margin: 0 }}>
          <div><div className="lbl">Judul</div>
            <IsianTeks id="tnc-judul" nilai={t.judul} lebar={260} disabled={ro}
                       ubah={(v) => ubahT((x) => ({ ...x, judul: v }))} /></div>
        </div>
        <button className="pri" onClick={cetak}
                title="Pratinjau dan cetak Term of Payment di kertas A4 (atau simpan sebagai PDF)">
          🖨 Cetak A4</button>
      </div>
      {!ro && lain.length > 0 && (
        <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
          <span className="lbl" style={{ margin: 0 }}>Salin T&C dari project</span>
          <select id="tnc-salin" value={dari} onChange={(e) => setDari(e.target.value)}>
            <option value="">— pilih —</option>
            {lain.map((x) => <option key={x.slug} value={x.slug}>{x.nama} ({x.jumlah} cara bayar)</option>)}
          </select>
          <button disabled={!dari} onClick={() => void salin()}>Salin</button>
        </div>
      )}
      {pesanSalin && <div className="banner info" style={{ marginTop: 8 }}>{pesanSalin}</div>}

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
      {bolehUbah && (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => ubahT((x) => ({ ...x,
            caraBayar: [...x.caraBayar, { judul: "", baris: [{ label: "Booking Fee", nilai: "10 Juta", waktu: "" }] }] }))}>
            + Tambah cara bayar</button>
          <button className="pri" disabled={denganTncLengkap(data) === data}
                  title="Buat blok untuk setiap cara bayar di Pricelist yang belum ada di sini; blok yang sudah ada tidak diubah"
                  onClick={() => ubah(denganTncLengkap)}>
            Buat semua cara bayar dari Pricelist</button>
          <button disabled={denganWaktuAwal(data) === data}
                  title="Isi kolom waktu yang masih kosong dengan teks awal; yang sudah diisi tidak diubah"
                  onClick={() => ubah(denganWaktuAwal)}>
            Isi teks awal waktu yang kosong</button>
          <span className="hint" style={{ margin: 0 }}>
            {denganTncLengkap(data) === data ? "Semua cara bayar di Pricelist sudah punya blok di sini."
              : `${denganTncLengkap(data).tnc.caraBayar.length - t.caraBayar.length} cara bayar di Pricelist belum punya blok.`}
            {" "}Angka dan waktunya diisi dari Data (IRR) sebagai awal — periksa dan lengkapi.
          </span>
        </div>
      )}

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

      <LampiranTnc ro={ro} />
    </>
  );
}

/**
 * Lampiran gambar T&C — mis. tabel "Data konsumen yang harus dilengkapi" —
 * dicetak di halaman terakhir Term of Payment. Satu daftar untuk semua
 * project, dan langsung tersimpan (tidak menunggu Simpan draf).
 */
function LampiranTnc({ ro }: { ro: boolean }) {
  const [lampiran, setLampiran] = useState<{ id: string; nama: string }[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/pricelist/tnc-lampiran").then((r) => r.ok ? r.json() : null)
      .then((b) => setLampiran(b?.lampiran ?? [])).catch(() => {});
  }, []);

  const simpan = async (ids: string[]) => {
    const r = await fetch("/api/pricelist/tnc-lampiran", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${r.status}`); return; }
    setLampiran(b.lampiran ?? []);
  };
  const unggah = async (files: File[]) => {
    const sisa = MAKS_GAMBAR - lampiran.length;
    if (!files.length) return;
    if (sisa <= 0) { setGalat(`Paling banyak ${MAKS_GAMBAR} gambar.`); return; }
    setSibuk(true); setGalat(null);
    try {
      const ids = lampiran.map((x) => x.id);
      for (const asli of files.slice(0, sisa)) {
        const f = await perkecilGambar(asli);
        const fd = new FormData(); fd.append("file", f, f.name);
        const res = await fetch("/api/pricelist/susun/gambar", { method: "POST", body: fd });
        const b = await res.json().catch(() => ({}));
        if (res.status === 401) { location.href = "/login"; return; }
        if (!res.ok) { setGalat(`${asli.name}: ${b.detail ?? b.title ?? `HTTP ${res.status}`}`); continue; }
        ids.push(b.id);
      }
      await simpan(ids);
    } finally {
      setSibuk(false);
    }
  };
  // Tempel screenshot (Windows + Shift + S lalu Ctrl + V) di kotak tempel.
  const tempel = (e: React.ClipboardEvent) => {
    if (ro) return;
    const files = [...e.clipboardData.items]
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it, i) => {
        const f = it.getAsFile()!;
        const jam = new Date().toLocaleString("sv-SE").replace(/[: ]/g, "-");
        return new File([f], `lampiran-${jam}${i ? `-${i + 1}` : ""}.${f.type.split("/")[1] || "png"}`,
                        { type: f.type });
      });
    e.preventDefault();
    if (files.length) void unggah(files);
  };
  const geser = (i: number, arah: -1 | 1) => {
    const ids = lampiran.map((x) => x.id);
    const j = i + arah;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void simpan(ids);
  };

  return (
    <>
      <h3 className="sub-judul">Lampiran gambar</h3>
      <p className="hint kiri" style={{ marginTop: 0 }}>
        Dicetak di halaman terakhir Term of Payment, <b>berlaku untuk semua project</b>, dan langsung
        tersimpan (tidak perlu Simpan draf).
      </p>
      {lampiran.length > 0 && (
        <div className="gambar-catatan">
          {lampiran.map((g, i) => (
            <figure key={g.id}>
              <a href={`/api/pricelist/tnc-lampiran/${g.id}`} target="_blank" rel="noreferrer"
                 title="Buka gambar ukuran penuh">
                <img src={`/api/pricelist/tnc-lampiran/${g.id}`} alt={g.nama} loading="lazy" />
              </a>
              <figcaption>
                <span title={g.nama}>{i + 1}. {g.nama}</span>
                {!ro && (
                  <span className="row" style={{ margin: 0, gap: 4, flexWrap: "nowrap" }}>
                    <button className="kecil" disabled={i === 0} aria-label="Geser ke depan"
                            onClick={() => geser(i, -1)}>▲</button>
                    <button className="kecil" disabled={i === lampiran.length - 1} aria-label="Geser ke belakang"
                            onClick={() => geser(i, 1)}>▼</button>
                    <button className="kecil bahaya" aria-label={`Hapus ${g.nama}`}
                            onClick={() => void simpan(lampiran.filter((x) => x.id !== g.id).map((x) => x.id))}>
                      Hapus</button>
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {galat && <div className="banner stop" style={{ marginTop: 8 }}>{galat}</div>}
      {!ro && (
        <div className="row" style={{ margin: "6px 0 0", alignItems: "center" }}>
          <input id="tnc-tempel" readOnly value="" onPaste={tempel} style={{ width: 300 }}
                 placeholder="Klik di sini lalu Ctrl + V untuk menempel screenshot" />
          <label className="tombol-berkas">
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
                   disabled={sibuk || lampiran.length >= MAKS_GAMBAR}
                   onChange={(e) => { void unggah([...(e.target.files ?? [])]); e.target.value = ""; }} />
            {sibuk ? "Mengunggah…" : "+ Tambah gambar"}
          </label>
        </div>
      )}
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

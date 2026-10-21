"use client";

/**
 * Lembar Harga A4 beserta alat penyusunnya — dipakai dua layar sekaligus:
 * tab Cetak Harga (A4) yang dibuka dari langkah 4a, dan langkah 4b. Harga
 * Spesial, yang menyusun tampilan cetakannya sambil melihat pratinjaunya.
 *
 * Bentuknya mengikuti lembar Pricelist berkas PL Excel: logo, judul,
 * tanggal, lalu tabel unit dengan harga tiap cara bayar (dan kolom PPN DTP
 * serta Harga Excld. PPN bila dicentang).
 *
 * Cara bayar, klaster, dan kolom keterangan yang tidak dicentang hanya
 * disembunyikan dari cetakan — isian Harga tidak berubah. Pilihannya
 * diingat peramban per proyek, jadi apa yang disusun di langkah 4b itu pula
 * yang keluar saat Cetak A4 ditekan.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { UnitHarga } from "@/lib/simulasi";
import { useKata } from "../bahasa";
import { TeksBergaya } from "./gaya-teks";

export const KATA = {
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
    hurufJudul: "Huruf judul", hurufAsal: "Seperti diketik",
    hurufKapital: "Kapital Awal", hurufBesar: "HURUF BESAR",
    namaJudul: "Nama judul kolom",
    namaInfo: "Ganti tulisan pada kepala tabel — mis. \"Tipe\" menjadi \"Type\" atau " +
      "\"Cash Keras\" menjadi \"Harga Jual All In (Include PPN)\". Dikosongkan berarti memakai nama asalnya.",
    namaReset: "Kembalikan nama asal",
    namaCaraBayar: "Nama cara bayar pada cetakan",
    namaIlustrasi: "Judul kelompok ilustrasi KPR",
    warnaJudul: "Warna judul kolom",
    warnaInfo: "Warna kepala tabel pada cetakan. Tiap cara bayar boleh berwarna sendiri.",
    warnaKepala: "Kepala tabel", warnaTeks: "Tulisan kepala",
    warnaCb: "Judul cara bayar", warnaKpr: "Judul ilustrasi KPR",
    warnaSelang: "Baris selang-seling", warnaReset: "Kembalikan warna asal",
    warnaPerKolom: "Warna sendiri per cara bayar",
    kprJudul: "Ilustrasi cicilan KPR",
    kprInfo: "Angsuran bulanan anuitas dari harga cara bayar yang dicentang — sebagai ilustrasi di samping harganya.",
    kprBunga: "Bunga (% per tahun)", kprTenor: "Tenor (tahun, dipisah koma)",
    kprUntuk: "Ilustrasi untuk cara bayar",
    kprKepala: (nama: string, bunga: string) => `Ilustrasi ${nama} (Cicilan KPR Bunga ${bunga}%)`,
    kprTahun: (n: number) => `${n} tahun`,
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
    hurufJudul: "Header case", hurufAsal: "As typed",
    hurufKapital: "Capitalised", hurufBesar: "UPPERCASE",
    namaJudul: "Header wording",
    namaInfo: "Change the wording in the table head — e.g. \"Tipe\" to \"Type\", or " +
      "\"Cash Keras\" to \"Harga Jual All In (Include PPN)\". Leave empty to keep the original.",
    namaReset: "Restore original wording",
    namaCaraBayar: "Payment scheme wording on the printout",
    namaIlustrasi: "Mortgage illustration group heading",
    warnaJudul: "Header colours",
    warnaInfo: "Colours of the table head on the printout. Each payment scheme may have its own.",
    warnaKepala: "Table head", warnaTeks: "Head text",
    warnaCb: "Scheme heading", warnaKpr: "Illustration heading",
    warnaSelang: "Alternating rows", warnaReset: "Restore default colours",
    warnaPerKolom: "Own colour per payment scheme",
    kprJudul: "Mortgage instalment illustration",
    kprInfo: "Monthly annuity instalment from the price of each ticked payment scheme — an illustration beside its price.",
    kprBunga: "Interest (% per year)", kprTenor: "Tenor (years, comma separated)",
    kprUntuk: "Illustration for payment schemes",
    kprKepala: (nama: string, bunga: string) => `${nama} illustration (mortgage at ${bunga}%)`,
    kprTahun: (n: number) => `${n} years`,
    no: "No", unitNo: "Unit No", area: "Area (m²)",
    harga: "Price Incl. VAT", dpp: "Price Excl. VAT", dtp: "VAT DTP",
    kol: { alamat: "Address", phase: "Phase", ukuran: "Size", view: "View", tipe: "Type",
           subTipe: "Sub-type", lt: "Land", lb: "Build" } as Record<string, string>,
  },
};

export const KUNCI = "cetak-pl";

export type Isi = {
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
export type Pilihan = {
  kolom: string[]; alamat: string[]; pajak: boolean;
  hrg?: boolean; dpp?: boolean; dtp?: boolean; info?: string[];
  /**
   * Ilustrasi cicilan KPR di samping harga: bunga setahun, tenor dalam
   * tahun, dan cara bayar mana yang diberi ilustrasi. Daftar cara bayar
   * kosong berarti tidak ada ilustrasi yang dicetak.
   */
  kpr?: { bunga: number; tenor: number[]; kolom: string[] };
  /**
   * Warna kepala tabel pada cetakan. `kolom` memberi warna sendiri kepada
   * judul cara bayar tertentu — lembar yang dibagikan ke konsumen kerap
   * membedakan kelompok harganya dengan warna.
   */
  warna?: {
    kepala?: string; teks?: string; cb?: string; kpr?: string; selang?: string;
    kolom?: Record<string, string>;
  };
  /**
   * Judul kolom yang diganti sendiri, menurut kuncinya: kolom keterangan
   * ("alamat", "lt", …), kolom tetap ("no", "unitNo", "area"), kolom harga
   * ("harga", "dtp", "dpp"), nama cara bayar ("cb:<nama>"), dan judul
   * kelompok ilustrasi ("ilus:<nama>"). Yang kosong memakai nama asalnya.
   */
  judul?: Record<string, string>;
  /** Huruf judul kolom: seperti diketik, Kapital Awal (bawaan), atau besar semua. */
  huruf?: "asal" | "kapital" | "besar";
};
const HURUF_CSS = { asal: "none", kapital: "capitalize", besar: "uppercase" };

export const WARNA_AWAL = {
  kepala: "#e8e8e8", teks: "#000000", cb: "#d9d9d9", kpr: "#d9d9d9",
  selang: "#f6f6f6", kolom: {} as Record<string, string>,
};

export const KPR_AWAL = { bunga: 2.75, tenor: [25, 20, 15], kolom: [] as string[] };

/**
 * Angsuran bulanan anuitas: pokok, bunga setahun (persen), tenor (tahun).
 *
 * Rumus yang sama dengan lembar PL yang dibagikan ke konsumen — bunga
 * setahun dibagi dua belas, lalu anuitas biasa. Bunga nol berarti pokoknya
 * dibagi rata sebanyak bulannya.
 */
export function angsuranKpr(pokok: number, bungaTahun: number, tahun: number): number {
  const n = Math.round(tahun * 12);
  if (!(pokok > 0) || !(n > 0)) return 0;
  const i = bungaTahun / 100 / 12;
  if (!(i > 0)) return pokok / n;
  return pokok * i / (1 - Math.pow(1 + i, -n));
}

/**
 * Kolom keterangan unit yang dapat disembunyikan dari cetakan. Makin sedikit
 * kolom, makin besar tulisannya saat tabel dipaskan selebar kertas.
 */
export const INFO: [keyof UnitHarga, string, string][] = [
  ["alamat", "Address", ""], ["phase", "Phase", "c"], ["ukuran", "Ukuran", "c"],
  ["view", "View", ""], ["tipe", "Tipe", "c"], ["subTipe", "Sub-Tipe", ""],
];
export const AREA: [keyof UnitHarga, string][] = [["lt", "Land"], ["lb", "Build"]];

/** Ukuran isi halaman A4 dalam px CSS (96 dpi) dikurangi margin 8 mm. */
const MM = 96 / 25.4;
export const LEBAR = { lanskap: (297 - 16) * MM, potret: (210 - 16) * MM };
/** Tinggi isi halaman A4 (dikurangi margin 8 mm dan sedikit cadangan). */
export const TINGGI = { lanskap: (210 - 16) * MM - 4, potret: (297 - 16) * MM - 4 };

/** Land selalu satu angka di belakang koma, seperti di Unit Data (70,0 · 107,2). */
const satuDesimal = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? ""
    : n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const angka = (n: number | null | undefined, d = 0) =>
  n == null || !Number.isFinite(n) ? "" : n.toLocaleString("id-ID", { maximumFractionDigits: d });

export type Tata = {
  arah: "lanskap" | "potret";
  huruf: number;
  /** Jarak atas-bawah isi tiap baris (em). */
  baris: number;
  /**
   * Penyesuaian ukuran lembar (zoom yang sama ke kedua arah):
   * "lebar" — pas selebar kertas, ke bawah boleh beberapa halaman (bawaan);
   * "halaman" — seluruhnya pas satu halaman A4; "asli" — tanpa penyesuaian.
   */
  pas: "lebar" | "halaman" | "asli";
};
export const TATA_AWAL: Tata = { arah: "lanskap", huruf: 7.5, baris: 0.15, pas: "lebar" };
export const PILIHAN_AWAL: Pilihan = { kolom: [], alamat: [], pajak: true };
export const kunciPilihan = (slug?: string | null) => `${KUNCI}-pilihan-${slug ?? "-"}`;

/**
 * Pilihan tampilan satu lembar, diingat peramban per proyek.
 *
 * Dipakai bersama oleh tab Cetak Harga (A4) dan langkah 4b: keduanya
 * menulis ke kunci yang sama, jadi susunan yang dibuat di layar 4b itu
 * juga yang keluar dari tombol Cetak A4.
 */
export function useLembar(slug?: string | null) {
  const [pilihan, setPilihanIsi] = useState<Pilihan>(PILIHAN_AWAL);
  const [tata, setTata] = useState<Tata>(TATA_AWAL);
  const [muatkan, setMuatkan] = useState(false);
  const [ukur, setUkur] = useState({ terlalu: false, zoom: 1 });
  useEffect(() => {
    try {
      const p = localStorage.getItem(kunciPilihan(slug));
      if (p) setPilihanIsi((x) => ({ ...x, ...JSON.parse(p) }));
    } catch { /* penyimpanan peramban diblokir */ }
  }, [slug]);
  const setPilihan = (n: Pilihan) => {
    setPilihanIsi(n);
    try { localStorage.setItem(kunciPilihan(slug), JSON.stringify(n)); }
    catch { /* abaikan */ }
  };
  return { pilihan, setPilihan, tata, setTata, muatkan, setMuatkan, ukur, setUkur };
}
export type Lembar = ReturnType<typeof useLembar>;

/** Isi lembar setelah pilihan diterapkan: yang tercetak, bukan yang tersimpan. */
export function susunLembar(isi: Isi, p: Pilihan) {
  const hrg = !p.hrg;
  const dpp = !(p.dpp ?? p.pajak);
  const dtp = !(p.dtp ?? p.pajak);
  // Urutan kolom angka di bawah tiap cara bayar: harga termasuk PPN, PPN
  // DTP-nya, lalu harga tanpa PPN di ujung kanan. Kosong berarti cara
  // bayarnya tidak dicetak sama sekali.
  const kolPajak: ("harga" | "dpp" | "dtp")[] = [
    ...(hrg ? ["harga" as const] : []),
    ...(dtp ? ["dtp" as const] : []),
    ...(dpp ? ["dpp" as const] : [])];
  const kpr = { ...KPR_AWAL, ...(p.kpr ?? {}) };
  const warna = { ...WARNA_AWAL, ...(p.warna ?? {}) };
  /** Judul kolom: yang diketik orang, atau nama asalnya bila dikosongkan. */
  const jud = (kunci: string, bawaan: string) => (p.judul ?? {})[kunci]?.trim() || bawaan;
  const kolom = isi.kolom.filter((k) => !p.kolom.includes(k));
  // Ilustrasi hanya untuk cara bayar yang memang ikut dicetak.
  const ilustrasi = kpr.kolom.filter((k) => kolom.includes(k));
  return {
    hrg, dpp, dtp, kolPajak, kpr, ilustrasi, kolom, warna, jud,
    unit: isi.unit.filter((u) => !p.alamat.includes(u.alamat || "(tanpa address)")),
    info: INFO.filter(([k]) => !(p.info ?? []).includes(k)),
    area: AREA.filter(([k]) => !(p.info ?? []).includes(k)),
    semuaAlamat: [...new Set(isi.unit.map((u) => u.alamat || "(tanpa address)"))],
    jumlahSembunyi: p.kolom.length + p.alamat.length + (p.info ?? []).length,
  };
}

/**
 * Bilah alat penyusun lembar: arah kertas, kolom harga yang tampil, tinggi
 * baris, ukuran huruf, ukuran cetak, dan daftar isi yang dicetak. Tombol
 * yang hanya berlaku di satu layar (Cetak, Tutup) disisipkan lewat
 * `children`.
 */
export function AlatLembar({ isi, lembar, judul, children }: {
  isi: Isi; lembar: Lembar; judul?: React.ReactNode; children?: React.ReactNode;
}) {
  const kt = useKata(KATA);
  const { pilihan, setPilihan, tata, setTata, ukur, setMuatkan } = lembar;
  const { kolom, unit, semuaAlamat, jumlahSembunyi, hrg, dpp, dtp, kpr, warna, jud } =
    susunLembar(isi, pilihan);
  const setJudul = (kunci: string, teks: string) =>
    setPilihan({ ...pilihan, judul: { ...(pilihan.judul ?? {}), [kunci]: teks } });
  const kotakJudul = (kunci: string, bawaan: string) => (
    <label key={`j-${kunci}`} style={{ display: "block" }}>
      <input style={{ width: 230 }} placeholder={bawaan} aria-label={`Judul ${bawaan}`}
             value={(pilihan.judul ?? {})[kunci] ?? ""}
             onChange={(e) => setJudul(kunci, e.target.value)} />
      {" "}<span className="hint" style={{ margin: 0 }}>{bawaan}</span>
    </label>
  );
  const setKpr = (n: Partial<typeof kpr>) => setPilihan({ ...pilihan, kpr: { ...kpr, ...n } });
  const setWarna = (n: Partial<typeof warna>) =>
    setPilihan({ ...pilihan, warna: { ...warna, ...n } });
  const kotakWarna = (label: string, kunci: "kepala" | "teks" | "cb" | "kpr" | "selang") => (
    <label style={{ display: "block" }}>
      <input type="color" value={warna[kunci]} aria-label={label}
             onChange={(e) => setWarna({ [kunci]: e.target.value })} /> {label}
    </label>
  );
  /** "25, 20, 15" → [25, 20, 15]; yang bukan angka diabaikan. */
  const bacaTenor = (teks: string) => teks.split(/[^\d.,]+/)
    .map((x) => Number(x.replace(",", "."))).filter((n) => n > 0 && n <= 40);
  const satuHalaman = tata.pas !== "asli";
  /**
   * Centang salah satu kolom harga. `pajak` ikut ditulis supaya pilihan ini
   * tetap terbaca benar oleh versi layar yang lama.
   */
  const gantiPajak = (jenis: "hrg" | "dpp" | "dtp", tampil: boolean) => {
    const n = { ...pilihan, [jenis]: !tampil };
    setPilihan({ ...n, pajak: (n.dpp ?? n.pajak) && (n.dtp ?? n.pajak) });
  };
  const ganti = (jenis: "kolom" | "alamat", k: string, tampil: boolean) =>
    setPilihan({ ...pilihan, [jenis]: tampil ? pilihan[jenis].filter((x) => x !== k)
                                             : [...pilihan[jenis], k] });

  return (
    <div className="cetak-alat">
      {judul !== undefined ? judul : <b>{kt.judul}</b>}
      <label>{kt.orientasi}
        <select value={tata.arah}
                onChange={(e) => setTata({ ...tata, arah: e.target.value as Tata["arah"] })}>
          <option value="lanskap">{kt.lanskap}</option>
          <option value="potret">{kt.potret}</option>
        </select>
      </label>
      <label><input type="checkbox" checked={hrg}
                    onChange={(e) => gantiPajak("hrg", e.target.checked)} />
        {kt.pajakHarga}</label>
      <label><input type="checkbox" checked={dtp}
                    onChange={(e) => gantiPajak("dtp", e.target.checked)} />
        {kt.pajakDtp}</label>
      <label><input type="checkbox" checked={dpp}
                    onChange={(e) => gantiPajak("dpp", e.target.checked)} />
        {kt.pajakDpp}</label>
      <span className="cetak-huruf">{kt.tinggiBaris}
        <button onClick={() => setTata({ ...tata, baris: Math.max(0.05, +(tata.baris - 0.1).toFixed(2)) })}
                aria-label={kt.rapatkan}>−</button>
        <b>{Math.round((tata.baris - 0.15) / 0.1) + 1}</b>
        <button onClick={() => setTata({ ...tata, baris: Math.min(1.25, +(tata.baris + 0.1).toFixed(2)) })}
                aria-label={kt.renggangkan}>+</button>
      </span>
      <span className="cetak-huruf">{kt.ukuranHuruf}
        <button onClick={() => setTata({ ...tata, huruf: Math.max(5, +(tata.huruf - 0.5).toFixed(1)) })}
                aria-label={kt.perkecil}>A−</button>
        <b>{tata.huruf.toLocaleString("id-ID")} pt</b>
        <button onClick={() => setTata({ ...tata, huruf: Math.min(12, +(tata.huruf + 0.5).toFixed(1)) })}
                aria-label={kt.perbesar}>A+</button>
      </span>
      <label>{kt.ukuranCetak}
        <select value={tata.pas}
                onChange={(e) => setTata({ ...tata, pas: e.target.value as Tata["pas"] })}>
          <option value="lebar">{kt.pasLebar}</option>
          <option value="halaman">{kt.pasHalaman}</option>
          <option value="asli">{kt.asli}</option>
        </select>
        {satuHalaman && <b>{Math.round(ukur.zoom * 100)}%</b>}</label>
      {!satuHalaman && <>
        <span className={`pill ${ukur.terlalu ? "warn" : "ok"}`}>
          {ukur.terlalu ? kt.terlalu : kt.muat}</span>
        {ukur.terlalu && <button onClick={() => setMuatkan(true)}>{kt.muatkan}</button>}
      </>}
      <details className="cetak-pilih">
        <summary>{kt.pilihIsi}{jumlahSembunyi ? kt.disembunyikan(jumlahSembunyi) : ""}</summary>
        <div className="cetak-pilih-isi">
          <p className="hint">{kt.pilihInfo}</p>
          <b>{kt.kolKet}</b>
          <span className="hint" style={{ textAlign: "left", margin: 0 }}>{kt.kolKetInfo}</span>
          {[...INFO.map(([k, , c]) => [k, kt.kol[k], c] as [keyof UnitHarga, string, string]),
            ...AREA.map(([k]) => [k, `${kt.kol[k]} (m²)`, ""] as [keyof UnitHarga, string, string])].map(([k, l]) => (
            <label key={k}><input type="checkbox" checked={!(pilihan.info ?? []).includes(k)}
              onChange={(e) => setPilihan({ ...pilihan, info: e.target.checked
                ? (pilihan.info ?? []).filter((x) => x !== k) : [...(pilihan.info ?? []), k] })} /> {l}</label>
          ))}
          <b>{kt.caraBayar}</b>
          <div className="row" style={{ margin: "0 0 4px" }}>
            <button className="kecil" onClick={() => setPilihan({ ...pilihan, kolom: [] })}>{kt.centangSemua}</button>
            <button className="kecil" onClick={() => setPilihan({ ...pilihan, kolom: [...isi.kolom] })}>{kt.kosongkan}</button>
          </div>
          {isi.kolom.map((k) => (
            <label key={k}><input type="checkbox" checked={!pilihan.kolom.includes(k)}
              onChange={(e) => ganti("kolom", k, e.target.checked)} /> {k}</label>
          ))}
          {/* Nama judul kolom: lembar tiap proyek memakai istilah sendiri,
              jadi judulnya boleh diketik ulang tanpa mengubah isian Harga. */}
          <b>{kt.namaJudul}</b>
          <label style={{ display: "block" }}>{kt.hurufJudul}{" "}
            <select value={pilihan.huruf ?? "kapital"}
                    onChange={(e) => setPilihan({ ...pilihan, huruf: e.target.value as Pilihan["huruf"] })}>
              <option value="kapital">{kt.hurufKapital}</option>
              <option value="asal">{kt.hurufAsal}</option>
              <option value="besar">{kt.hurufBesar}</option>
            </select>
          </label>
          <span className="hint" style={{ textAlign: "left", margin: 0 }}>{kt.namaInfo}</span>
          {kotakJudul("no", kt.no)}
          {kotakJudul("unitNo", kt.unitNo)}
          {[...INFO, ...AREA].map(([k]) => kotakJudul(String(k), kt.kol[k]))}
          {kotakJudul("area", kt.area)}
          {kotakJudul("harga", kt.harga)}
          {kotakJudul("dtp", kt.dtp)}
          {kotakJudul("dpp", kt.dpp)}
          <span className="hint" style={{ textAlign: "left", margin: 0 }}>{kt.namaCaraBayar}</span>
          {isi.kolom.map((k) => kotakJudul(`cb:${k}`, k))}
          {kpr.kolom.length > 0 && <>
            <span className="hint" style={{ textAlign: "left", margin: 0 }}>{kt.namaIlustrasi}</span>
            {kpr.kolom.map((k) => kotakJudul(`ilus:${k}`,
              kt.kprKepala(jud(`cb:${k}`, k), String(kpr.bunga).replace(".", ","))))}
          </>}
          <div className="row" style={{ margin: "0 0 4px" }}>
            <button className="kecil" onClick={() => setPilihan({ ...pilihan, judul: undefined })}>
              {kt.namaReset}</button>
          </div>
          {/* Warna kepala tabel: bawaannya abu-abu, boleh disetel per lembar
              dan per cara bayar. */}
          <b>{kt.warnaJudul}</b>
          <span className="hint" style={{ textAlign: "left", margin: 0 }}>{kt.warnaInfo}</span>
          {kotakWarna(kt.warnaKepala, "kepala")}
          {kotakWarna(kt.warnaTeks, "teks")}
          {kotakWarna(kt.warnaCb, "cb")}
          {kotakWarna(kt.warnaKpr, "kpr")}
          {kotakWarna(kt.warnaSelang, "selang")}
          <span className="hint" style={{ textAlign: "left", margin: 0 }}>{kt.warnaPerKolom}</span>
          {isi.kolom.map((k) => (
            <label key={`w-${k}`} style={{ display: "block" }}>
              <input type="color" aria-label={`${kt.warnaCb} — ${k}`}
                     value={warna.kolom[k] ?? warna.cb}
                     onChange={(e) => setWarna({ kolom: { ...warna.kolom, [k]: e.target.value } })} />
              {" "}{k}
              {warna.kolom[k] && (
                <button className="kecil" style={{ marginLeft: 6 }}
                        onClick={() => {
                          const sisa = { ...warna.kolom };
                          delete sisa[k];
                          setWarna({ kolom: sisa });
                        }}>×</button>)}
            </label>
          ))}
          <div className="row" style={{ margin: "0 0 4px" }}>
            <button className="kecil" onClick={() => setPilihan({ ...pilihan, warna: undefined })}>
              {kt.warnaReset}</button>
          </div>
          {/* Ilustrasi cicilan KPR: kolom tambahan di samping harga, seperti
              pada lembar yang dibagikan ke konsumen. */}
          <b>{kt.kprJudul}</b>
          <span className="hint" style={{ textAlign: "left", margin: 0 }}>{kt.kprInfo}</span>
          <label style={{ display: "block" }}>{kt.kprBunga}{" "}
            <input className="n" inputMode="decimal" style={{ width: 70 }}
                   value={String(kpr.bunga).replace(".", ",")}
                   onChange={(e) => setKpr({ bunga: Number(e.target.value.replace(",", ".")) || 0 })} />
          </label>
          <label style={{ display: "block" }}>{kt.kprTenor}{" "}
            <input style={{ width: 110 }} value={kpr.tenor.join(", ")}
                   onChange={(e) => setKpr({ tenor: bacaTenor(e.target.value) })} />
          </label>
          <span className="hint" style={{ textAlign: "left", margin: 0 }}>{kt.kprUntuk}</span>
          {isi.kolom.map((k) => (
            <label key={`kpr-${k}`}><input type="checkbox" checked={kpr.kolom.includes(k)}
              onChange={(e) => setKpr({ kolom: e.target.checked
                ? [...kpr.kolom, k] : kpr.kolom.filter((x) => x !== k) })} /> {k}</label>
          ))}
          {semuaAlamat.length > 1 && <>
            <b>{kt.cluster}</b>
            {semuaAlamat.map((a) => (
              <label key={a}><input type="checkbox" checked={!pilihan.alamat.includes(a)}
                onChange={(e) => ganti("alamat", a, e.target.checked)} />
                {" "}{a === "(tanpa address)" ? kt.tanpaAlamat : a} ({kt.nUnit(isi.unit.filter((u) => (u.alamat || "(tanpa address)") === a).length)})</label>
            ))}
          </>}
        </div>
      </details>
      {children}
      <span className="hint">{kt.ringkas(unit.length, kolom.length)}{" "}
        <b>A4</b>{kt.pdf}</span>
    </div>
  );
}

/** Lembarnya sendiri, di atas kertas A4 dan dengan zoom yang dipilih. */
export function LembarHarga({ isi, lembar }: { isi: Isi; lembar: Lembar }) {
  const kt = useKata(KATA);
  const { pilihan, tata, setTata, muatkan, setMuatkan, setUkur } = lembar;
  const { kolom, unit, info, area, kolPajak, kpr, ilustrasi, warna, jud } = susunLembar(isi, pilihan);
  const satuHalaman = tata.pas !== "asli";
  const [skala, setSkala] = useState({ zoom: 1, lebar: 0 });
  const tabel = useRef<HTMLTableElement>(null);
  const kertas = useRef<HTMLDivElement>(null);
  const judulPajak = { harga: jud("harga", kt.harga), dpp: jud("dpp", kt.dpp), dtp: jud("dtp", kt.dtp) };
  const angkaPajak = (u: UnitHarga, k: string, jenis: "harga" | "dpp" | "dtp") =>
    jenis === "harga" ? angka(u.harga[k]) : angka(u.pajak?.[k]?.[jenis]);

  // Tabel harus muat selebar kertas; "Muatkan lebar kertas" mengecilkan
  // huruf setengah poin demi setengah poin sampai muat (paling kecil 5 pt).
  useEffect(() => {
    const el = tabel.current;
    if (!el) return;
    const lewat = el.scrollWidth > LEBAR[tata.arah] + 1;
    setUkur((u) => (u.terlalu === lewat ? u : { ...u, terlalu: lewat }));
    if (muatkan) {
      if (lewat && tata.huruf > 5) setTata({ ...tata, huruf: +(tata.huruf - 0.5).toFixed(1) });
      else setMuatkan(false);
    }
    // setTata/setMuatkan/setUkur tetap sama sepanjang hidup layar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isi, tata.arah, tata.huruf, pilihan, muatkan]);

  // Ukur lembar pada ukuran aslinya, lalu perbesar/perkecil seluruhnya dengan
  // zoom yang sama ke kedua arah: pas selebar kertas, atau (pilihan "1
  // halaman") sekaligus pas setinggi satu halaman A4.
  useLayoutEffect(() => {
    const el = kertas.current;
    if (!el) return;
    if (!satuHalaman) { setSkala({ zoom: 1, lebar: 0 }); setUkur((u) => ({ ...u, zoom: 1 })); return; }
    const simpan = { zoom: el.style.zoom, width: el.style.width };
    el.style.zoom = "1"; el.style.width = "max-content";
    const w = el.scrollWidth;
    el.style.width = `${w}px`;
    const h = el.scrollHeight;
    el.style.zoom = simpan.zoom; el.style.width = simpan.width;
    // Pas lebar: boleh diperbesar sampai 1,6× supaya tabel memenuhi kertas.
    // Pas 1 halaman: juga dibatasi tinggi (cadangan 5%: hasil cetak sedikit
    // lebih tinggi dari ukuran di layar).
    const zLebar = Math.min(1.6, LEBAR[tata.arah] / w);
    const z = tata.pas === "halaman" ? Math.min(zLebar, (TINGGI[tata.arah] * 0.95) / h) : zLebar;
    setSkala((s) => (Math.abs(s.zoom - z) < 0.001 && s.lebar === w ? s : { zoom: z, lebar: w }));
    setUkur((u) => (Math.abs(u.zoom - z) < 0.001 ? u : { ...u, zoom: z }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isi, tata, pilihan]);

  return (
    <div className="cetak-latar">
      <div className="cetak-kertas"
           style={{ width: LEBAR[tata.arah] + 2 * 30, minHeight: TINGGI[tata.arah] + 2 * 30, padding: 30 }}>
        <div ref={kertas} className="pl-lembar"
             style={{ fontSize: `${tata.huruf}pt`, ["--pad" as string]: `${tata.baris}em`,
                      ["--kepala" as string]: warna.kepala,
                      ["--kepala-teks" as string]: warna.teks,
                      ["--cb" as string]: warna.cb,
                      ["--selang" as string]: warna.selang,
                      ["--huruf-judul" as string]: HURUF_CSS[pilihan.huruf ?? "kapital"],
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
                <th rowSpan={2}>{jud("no", kt.no)}</th>
                {info.filter(([k]) => k === "alamat").map(([k]) =>
                  <th key={k} rowSpan={2}>{jud(String(k), kt.kol[k])}</th>)}
                <th rowSpan={2}>{jud("unitNo", kt.unitNo)}</th>
                {info.filter(([k]) => k !== "alamat").map(([k]) =>
                  <th key={k} rowSpan={2}>{jud(String(k), kt.kol[k])}</th>)}
                {area.length > 0 && <th colSpan={area.length}>{jud("area", kt.area)}</th>}
                {/* Judul cara bayar: kolom sama lebar, judul panjang dilipat.
                    Dengan satu kolom angka saja judulnya dua baris tinggi
                    (tidak perlu baris judul kedua). */}
                {/* Cara bayar yang diberi warna sendiri cukup menyetel ulang
                    variabelnya pada selnya. */}
                {kolom.map((k) => kolPajak.length > 1
                  ? <th key={k} colSpan={kolPajak.length} className="cb"
                        style={{ ["--cb" as string]: warna.kolom[k] ?? warna.cb }}>{jud(`cb:${k}`, k)}</th>
                  : kolPajak.length === 1
                    ? <th key={k} rowSpan={2} className="cb harga"
                          style={{ ["--cb" as string]: warna.kolom[k] ?? warna.cb }}>{jud(`cb:${k}`, k)}</th>
                    : null)}
                {/* Ilustrasi cicilan KPR: satu kelompok per cara bayar yang
                    dicentang, berisi satu kolom untuk tiap tenor. */}
                {ilustrasi.map((k) => (
                  <th key={`kpr-${k}`} colSpan={kpr.tenor.length} className="cb"
                      style={{ ["--cb" as string]: warna.kpr }}>
                    {jud(`ilus:${k}`,
                         kt.kprKepala(jud(`cb:${k}`, k), String(kpr.bunga).replace(".", ",")))}</th>
                ))}
              </tr>
              <tr>
                {area.map(([k]) => <th key={k}>{jud(String(k), kt.kol[k])}</th>)}
                {kolom.map((k) => kolPajak.length > 1
                  ? kolPajak.map((j) =>
                      <th key={`${k}-${j}`} className="harga">{judulPajak[j]}</th>)
                  : null)}
                {ilustrasi.map((k) => kpr.tenor.map((t) =>
                  <th key={`kpr-${k}-${t}`} className="harga">{kt.kprTahun(t)}</th>))}
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
                  {ilustrasi.map((k) => kpr.tenor.map((t) =>
                    <td key={`kpr-${k}-${t}`} className="n harga">
                      {angka(angsuranKpr(u.harga[k] ?? 0, kpr.bunga, t))}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

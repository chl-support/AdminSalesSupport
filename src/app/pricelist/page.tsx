"use client";

/**
 * Pricelist — penyusunan pricelist dalam lima langkah yang saling terhubung,
 * mengikuti lembar-lembar berkas Excel PL bagian penjualan:
 *
 *   1. Data (IRR)  2. Unit Data  3. Data Pricelist  4. Pricelist  5. T&C
 *
 * Isiannya dapat diketik langsung atau diisi sekaligus dari berkas Excel
 * (Impor dari Excel). Setiap perubahan dihitung ulang seketika di layar
 * (src/lib/susun-pricelist.ts); "Simpan" menyimpannya sebagai draf project.
 * Pricelist baru dipakai layar Simulasi / NPV sesudah diberlakukan di langkah
 * 4 — sebelum itu, pricelist yang berlaku tetap yang lama.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { TautanLayar } from "../nav";
import { PilihBerkas } from "../pilih-berkas";
import { PanelPricelist } from "./panel-pricelist";
import { ringkasXlsx } from "./ringkas-xlsx";
import { RiwayatSusun } from "./riwayat-susun";
import { BilahGaya } from "./gaya-teks";
import { useSesi } from "../session";
import { PENGUNGGAH } from "../simulasi/unggah-pricelist";
import { RUMUS_TSC, basisProject, hitungSemua, samakanTsc, unitBelumBerharga, type SusunPricelist } from "@/lib/susun-pricelist";
import { periksaSusun, type Temuan } from "@/lib/susun-pricelist-periksa";
import {
  LangkahDataPl, LangkahIrr, LangkahPricelist, LangkahTnc, LangkahUnit, isiOtomatisCaraBayar, rapikanCaraBayar, sinkronTnc, terapkanNamaOtomatis,
} from "./langkah";
import { LangkahHargaSpesial } from "./langkah-spesial";

const KATA = {
  id: {
    judul: "Harga",
    langkah: ["Data (IRR)", "Data Unit", "Data Harga", "Harga", "Harga Spesial", "Syarat dan Ketentuan"],
    kosong4b: "Halaman Harga Spesial masih kosong — isinya akan disusun kemudian.",
    folder: "Data & Master Harga", folderUraian: "Master Harga & riwayat perubahan",
    uraian: [
      "Koefisien harga tiap cara bayar",
      "Harga dasar tiap unit",
      "Harga per cara bayar",
      "Harga jual, DPP & PPN DTP",
      "Harga khusus",
      "Ketentuan pembayaran",
    ],
    pilihProject: "Pilih proyek lebih dulu.",
    memuat: "Memuat…",
    impor: "Impor dari Excel", imporInfo: "Berkas PL dengan lembar Data (IRR), Unit Data, Data Pricelist, Pricelist dan T&C.",
    membaca: "Membaca…", baca: "Baca berkas", batal: "Batal",
    terimpor: (u: number) => `${u} unit dan seluruh langkah terisi dari berkas. Periksa tiap langkah, lalu Simpan.`,
    simpan: "Simpan", menyimpan: "Menyimpan…", tersimpan: "Tersimpan",
    belumSimpan: "Ada perubahan yang belum disimpan",
    drafBaru: "Belum ada draf untuk proyek ini. Isi langkah-langkahnya atau impor dari Excel.",
    terakhir: (o: string, t: string) => `Disimpan ${o} · ${t}`,
    unduh: "Unduh Excel", unduhSyarat: "Simpan dulu supaya berkasnya berisi perubahan terakhir.",
    hanyaBaca: "Hanya Admin Sales dan Admin IT yang dapat mengubah harga.",
    galatJudul: "Belum dapat diberlakukan",
    tandaJudul: { ok: "Langkah ini sudah lengkap", stop: "kesalahan", cek: "perlu dicek" },
    tunjukkan: "Tunjukkan →",
    temuanJudul: (n: number) => `Pemeriksaan otomatis: ${n} hal di langkah ini`,
    berlakuJudul: "Simpan / berlakukan harga",
    belumBerharga: "Unit tanpa luas / harga tanah — isi catatan bila harganya memang belum dikeluarkan; unit ini tidak ikut harga yang disimpan.",
    catatanUnit: "Catatan, mis. harga belum ditentukan manajemen",
    berlakuInfo: "Harga ini menggantikan harga yang berlaku dan langsung dipakai layar Simulasi / NPV. Harga lama tetap ada di riwayatnya.",
    yakinBuka: "Isian di layar belum disimpan dan akan diganti. Lanjutkan?",
    dibuka: (n: string) => `Harga "${n}" dibuka untuk diubah. Setelah selesai, beri nama baru di langkah 4a lalu Simpan & berlakukan — harga "${n}" tetap ada di riwayat.`,
    fNama: "Nama harga (juga nama berkas Excel-nya)", berlakukan: "Simpan & berlakukan", memberlakukan: "Memberlakukan…",
    fHarga: "Harga yang diberlakukan",
    hargaDasar: "Harga Dasar (langkah 4a)",
    hargaSpesial: "Harga spesial langkah 4b",
    diberlakukan: (n: string) => `Harga "${n}" berlaku. Buka Simulasi / NPV untuk memakainya.`,
    simpanSbg: "Simpan dengan nama baru (tanpa memberlakukan)",
    simpanSbgInfo: "Simpan dengan nama baru: tersimpan di Master Harga untuk dibuka lagi nanti, harga yang berlaku tidak berganti.",
    tersimpanSbg: (n: string) => `Harga "${n}" tersimpan di Master Harga (belum berlaku). Harga yang berlaku tidak berubah.`,
    keSimulasi: "Buka Simulasi / NPV",
    tncTakAda: (n: string) => `Harga "${n}" tidak menyimpan Syarat dan Ketentuan sendiri. Pilih harga lain.`,
    tanpaJudul: "(tanpa judul)",
    yakinTnc: (n: string, daftar: string, c: number) => `Syarat dan Ketentuan dari "${n}":\n\n${daftar}\n\n${c} catatan.\n\n` +
      "S&K di layar diganti dengan isi di atas; langkah 1–4 tidak berubah. Lanjutkan?",
    tncKembali: (n: string, c: number) => `Syarat dan Ketentuan dari "${n}" dikembalikan (${c} cara bayar). Periksa di langkah 5, lalu Simpan.`,
    legManual: "Manual", legSistem: "Otomatis",
  },
  en: {
    judul: "Price List",
    langkah: ["Data (IRR)", "Unit Data", "Price Data", "Price List", "Special Price", "Terms & Conditions"],
    kosong4b: "The Special Price page is still empty — its content will be built later.",
    folder: "Price List Data & Master", folderUraian: "Master price list & change history",
    uraian: [
      "Price coefficient per payment scheme",
      "Base price per unit",
      "Price per payment scheme",
      "Selling price, DPP & VAT DTP",
      "Special prices",
      "Payment terms",
    ],
    pilihProject: "Select a project first.",
    memuat: "Loading…",
    impor: "Import from Excel", imporInfo: "A PL file with the sheets Data (IRR), Unit Data, Data Pricelist, Pricelist and T&C.",
    membaca: "Reading…", baca: "Read file", batal: "Cancel",
    terimpor: (u: number) => `${u} units and every step filled from the file. Review each step, then Save.`,
    simpan: "Save", menyimpan: "Saving…", tersimpan: "Saved",
    belumSimpan: "Unsaved changes",
    drafBaru: "No draft for this project yet. Fill in the steps or import from Excel.",
    terakhir: (o: string, t: string) => `Saved by ${o} · ${t}`,
    unduh: "Download Excel", unduhSyarat: "Save first so the file contains the latest changes.",
    hanyaBaca: "Only Sales Admin and IT Admin can change the price list.",
    galatJudul: "Cannot be applied yet",
    tandaJudul: { ok: "This step is complete", stop: "errors", cek: "to check" },
    tunjukkan: "Show →",
    temuanJudul: (n: number) => `Automatic check: ${n} item(s) in this step`,
    berlakuJudul: "Apply price list",
    belumBerharga: "Units without land area / price — add a note if their price is not released yet; these units are left out of the saved price list.",
    catatanUnit: "Note, e.g. price not yet set by management",
    berlakuInfo: "This price list replaces the one in force and is used by Simulation / NPV right away. The old one stays in the history.",
    yakinBuka: "Unsaved changes on screen will be replaced. Continue?",
    dibuka: (n: string) => `Price list "${n}" opened for editing. When done, give it a new name in step 4a and Save & apply — "${n}" stays in the history.`,
    fNama: "Price list name (also its Excel file name)", berlakukan: "Save & apply", memberlakukan: "Applying…",
    fHarga: "Prices to apply",
    hargaDasar: "Base prices (step 4a)",
    hargaSpesial: "Special prices from step 4b",
    diberlakukan: (n: string) => `Price list "${n}" is in force. Open Simulation / NPV to use it.`,
    simpanSbg: "Save under a new name (without applying)",
    simpanSbgInfo: "Save under a new name: kept in the upload history to reopen later; the price list in force does not change.",
    tersimpanSbg: (n: string) => `Price list "${n}" saved to the upload history (not in force). The price list in force is unchanged.`,
    keSimulasi: "Open Simulation / NPV",
    tncTakAda: (n: string) => `Price list "${n}" does not store its own Terms & Conditions. Choose another price list.`,
    tanpaJudul: "(untitled)",
    yakinTnc: (n: string, daftar: string, c: number) => `Terms & Conditions from "${n}":\n\n${daftar}\n\n${c} notes.\n\n` +
      "The T&C on screen will be replaced with the content above; steps 1–4 are unchanged. Continue?",
    tncKembali: (n: string, c: number) => `Terms & Conditions from "${n}" restored (${c} payment schemes). Review them in step 5, then Save.`,
    legManual: "Manual", legSistem: "Automatic",
  },
};

type Draf = {
  baru: boolean; data: SusunPricelist;
  diubah_oleh: string | null; diubah_pada: string | null;
};

/** Nomor tampil tiap langkah: Pricelist (4a) dan Harga Special (4b) berdampingan. */
const NOMOR = ["1", "2", "3", "4a", "4b", "5"];

/** Nomor "langkah" untuk folder Data & Master Pricelist di depan langkah 1. */
const FOLDER = -1;

/**
 * Tanda di bilah langkah: ✓ bila tidak ada temuan, ✕ n bila ada kesalahan
 * yang membuat pricelist belum dapat diberlakukan, ⚠ n bila ada yang patut
 * dicek.
 */
function TandaLangkah({ temuan, judul }: {
  temuan: { jenis: "stop" | "cek" }[]; judul: { ok: string; stop: string; cek: string };
}) {
  const stop = temuan.filter((x) => x.jenis === "stop").length, cek = temuan.length - stop;
  if (!temuan.length) return <span className="tanda-langkah ok" title={judul.ok}>✓</span>;
  return (
    <>
      {stop > 0 && <span className="tanda-langkah stop" title={`${stop} ${judul.stop}`}>✕ {stop}</span>}
      {cek > 0 && <span className="tanda-langkah cek" title={`${cek} ${judul.cek}`}>⚠ {cek}</span>}
    </>
  );
}

export default function PricelistPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);

  const [draf, setDraf] = useState<Draf | null>(null);
  // Dinaikkan sesudah memberlakukan, supaya daftar pricelist tersimpan dibaca ulang.
  const [versiPl, setVersiPl] = useState(0);
  /** Cara bayar yang baru ditambah dan belum disimpan (untuk "Batalkan tambah"). */
  const [baruCb, setBaruCb] = useState(0);
  const [data, setData] = useState<SusunPricelist | null>(null);
  const [langkah, setLangkah] = useState(0);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<"simpan" | "impor" | "berlaku" | "simpanSbg" | null>(null);
  const [bukaImpor, setBukaImpor] = useState(false);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [peringatan, setPeringatan] = useState<string[]>([]);
  const [namaPl, setNamaPl] = useState("");
  /** Set harga spesial yang akan diberlakukan; kosong = harga dasar 4a. */
  const [hargaSet, setHargaSet] = useState("");
  const [berlaku, setBerlaku] = useState<string | null>(null);
  /** Nama pricelist yang baru disimpan tanpa diberlakukan. */
  const [tersimpanSbg, setTersimpanSbg] = useState<string | null>(null);

  // Slug project untuk muat(), yang sengaja tidak bergantung pada sesi.
  const slugRef = useRef<string | null | undefined>(null);
  slugRef.current = sesi?.project_slug;

  const muat = useCallback(async () => {
    const res = await fetch("/api/pricelist/susun");
    const b = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = "/login"; return; }
    if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    // Aturan basis harga project (Permai Indah: Excl PPN) untuk draf baru.
    // Nama cara bayar otomatis (standar semua project): langsung mengikuti
    // parameternya, juga untuk draf lama yang belum pernah mematikannya.
    // The Sanctuary Collection: Data (IRR) yang masih isian awal lama diganti
    // cara bayar standar (Data_Irr_TSC.xlsx); tersimpan setelah Simpan.
    const isi = RUMUS_TSC.has(slugRef.current ?? "") ? samakanTsc(b.data) : b.data;
    const awal = rapikanCaraBayar(basisProject(slugRef.current, isi));
    setDraf(b); setData(sinkronTnc(awal, terapkanNamaOtomatis(awal)));
  }, []);

  useEffect(() => { if (sesi?.project_slug) void muat(); }, [sesi, muat]);

  const hasil = useMemo(() => (data ? hitungSemua(data) : null), [data]);
  // Daftar cek per langkah: kesalahan (stop) dan hal yang patut dicek.
  const { bahasa } = useBahasa();
  const temuan = useMemo(() => (data && hasil ? periksaSusun(data, hasil) : []), [data, hasil]);
  /**
   * Tunjukkan isian yang perlu dicek: pindah ke langkahnya, gulir ke isian
   * itu dan sorot sebentar (kotak isiannya juga langsung dipilih).
   */
  const tunjuk = (x: Temuan) => {
    setLangkah(x.langkah);
    if (!x.sasaran) return;
    setTimeout(() => {
      const el = document.getElementById(x.sasaran!);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      el.classList.add("sorot-temuan");
      const isian = el.matches("input, select") ? el : el.querySelector("input, select");
      (isian as HTMLElement | null)?.focus({ preventScroll: true });
      setTimeout(() => el.classList.remove("sorot-temuan"), 3000);
    }, 150);
  };
  const berubah = !!data && !!draf && (draf.baru || JSON.stringify(data) !== JSON.stringify(draf.data));

  // Peringatan sebelum meninggalkan halaman dengan perubahan yang belum disimpan.
  useEffect(() => {
    if (!berubah) return;
    const tahan = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    addEventListener("beforeunload", tahan);
    return () => removeEventListener("beforeunload", tahan);
  }, [berubah]);

  if (memuat || !sesi) return <MemeriksaSesi />;
  const bolehUbah = PENGUNGGAH.includes(sesi.role);

  const kirim = async (url: string, init: RequestInit) => {
    const res = await fetch(url, init);
    const b = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = "/login"; return null; }
    if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return null; }
    return b;
  };

  const simpan = async () => {
    if (!data) return false;
    setSibuk("simpan"); setGalat(null); setInfo(null);
    const b = await kirim("/api/pricelist/susun", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    });
    setSibuk(null);
    if (b) { setDraf(b); setData(b.data); setVersiPl((v) => v + 1); setBaruCb(0); }
    return !!b;
  };

  const impor = async () => {
    if (!berkas) return;
    setSibuk("impor"); setGalat(null); setInfo(null);
    const fd = new FormData(); fd.append("file", await ringkasXlsx(berkas));
    const b = await kirim("/api/pricelist/susun/impor", { method: "POST", body: fd });
    setSibuk(null);
    if (!b) return;
    // Tanda T&C sudah disamakan dengan patokan ikut terbawa, supaya T&C
    // dari berkas tidak ditimpa patokan lagi saat halaman dibuka ulang.
    setData(basisProject(sesi?.project_slug,
      { ...b.susun, tncPatokan: b.susun.tncPatokan ?? data?.tncPatokan })); setPeringatan(b.peringatan ?? []);
    setInfo(k.terimpor(b.susun.unit.length));
    setBukaImpor(false); setBerkas(null);
  };

  // Buka pricelist tersimpan untuk diedit. Isinya menggantikan isian di
  // layar (belum tersimpan); pricelist lamanya tetap ada di riwayat, dan
  // hasil suntingan disimpan sebagai pricelist baru dengan nama lain.
  const bukaEdit = async (id: string, nama: string) => {
    if (berubah && !confirm(k.yakinBuka)) return;
    setSibuk("impor"); setGalat(null); setInfo(null); setBerlaku(null);
    const b = await kirim(`/api/pricelist/${id}/susun`, { method: "GET" });
    setSibuk(null);
    if (!b) return;
    // Tanda T&C sudah disamakan dengan patokan ikut terbawa, supaya T&C
    // dari berkas tidak ditimpa patokan lagi saat halaman dibuka ulang.
    const impor = rapikanCaraBayar(basisProject(sesi?.project_slug,
      { ...b.susun, tncPatokan: b.susun.tncPatokan ?? data?.tncPatokan }));
    setData(sinkronTnc(impor, terapkanNamaOtomatis(impor))); setPeringatan(b.peringatan ?? []); setNamaPl("");
    setInfo(k.dibuka(nama)); setLangkah(0);
  };

  /**
   * Ambil hanya Terms & Conditions pricelist tersimpan ke draf — untuk
   * mengembalikan blok T&C yang terhapus tanpa mengubah langkah 1–4. Isinya
   * diperlihatkan dulu; draf baru tersimpan sesudah orang menekan Simpan.
   */
  const ambilTnc = async (id: string, nama: string) => {
    setGalat(null); setInfo(null);
    const b = await kirim(`/api/pricelist/${id}/susun`, { method: "GET" });
    if (!b?.susun?.tnc) return;
    const tnc = b.susun.tnc as SusunPricelist["tnc"];
    // Berkas tanpa lembar T&C (mis. unggahan Simulation TOP) terbaca sebagai
    // T&C bawaan — itu bukan isi pricelist tersebut, jadi tidak ditawarkan.
    if ((b.peringatan ?? []).some((x: string) => /lembar t&c tidak ada/i.test(x))) {
      setGalat(k.tncTakAda(nama));
      return;
    }
    const daftar = tnc.caraBayar.map((c, i) => `${i + 1}. ${c.judul || k.tanpaJudul}`).join("\n");
    if (!confirm(k.yakinTnc(nama, daftar, tnc.catatan.length))) return;
    ubah((d) => ({ ...d, tnc }));
    setInfo(k.tncKembali(nama, tnc.caraBayar.length));
  };

  /**
   * Simpan draf sebagai pricelist baru bernama `namaPl`: diberlakukan
   * (menggantikan yang berlaku) atau hanya disimpan ke riwayat.
   */
  const berlakukan = async (aktifkan = true) => {
    if (berubah && !(await simpan())) return;
    setSibuk(aktifkan ? "berlaku" : "simpanSbg"); setGalat(null);
    setBerlaku(null); setTersimpanSbg(null);
    const b = await kirim("/api/pricelist/susun/berlakukan", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ nama: namaPl, berlakukan: aktifkan, spesial: hargaSet || null }),
    });
    setSibuk(null);
    if (!b) return;
    if (aktifkan) setBerlaku(b.nama); else setTersimpanSbg(b.nama);
    setVersiPl((v) => v + 1);
  };

  const ubah = (f: (d: SusunPricelist) => SusunPricelist) => {
    setInfo(null); setBerlaku(null); setTersimpanSbg(null);
    // T&C mengikuti kolom Pricelist: kolom baru mendapat blok, ganti nama ikut.
    // Parameter cara bayar baru diisi otomatis dari namanya.
    setData((d) => (d ? isiOtomatisCaraBayar(sinkronTnc(d, terapkanNamaOtomatis(f(d)))) : d));
  };

  /** Harga yang diberlakukan: kosong = harga dasar langkah 4a. */
  const setSpesial = data?.spesial?.set ?? [];
  const hargaSetAda = setSpesial.some((x) => x.id === hargaSet);

  const tgl = (s: string) => new Date(s).toLocaleString("id-ID",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const panelBerlaku = bolehUbah && hasil && (
    <div className="form-blok sp" style={{ marginTop: 16 }}>
      <h3>{k.berlakuJudul}</h3>
      {data!.unit.some(unitBelumBerharga) && (
        <div className="banner warn">
          <p style={{ margin: "0 0 6px" }}>{k.belumBerharga}</p>
          <table className="tabel-catatan-unit" style={{ width: "auto" }}><tbody>
            {data!.unit.map((u, i) => unitBelumBerharga(u) && (
              <tr key={i}>
                <td style={{ paddingRight: 12, whiteSpace: "nowrap" }}><b>{u.kode || `#${i + 1}`}</b></td>
                <td>
                  <input value={u.catatan ?? ""} maxLength={300} style={{ width: 420 }}
                         placeholder={k.catatanUnit} aria-label={`${k.catatanUnit} ${u.kode}`}
                         onChange={(e) => {
                           const v = e.target.value;
                           ubah((d) => ({ ...d, unit: d.unit.map((x, j) => j === i ? { ...x, catatan: v } : x) }));
                         }} />
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
      {hasil.galat.length > 0 ? (
        <div className="banner stop">
          <b>{k.galatJudul}</b>
          <ul style={{ margin: "4px 0 0 16px" }}>{temuan.filter((x) => x.jenis === "stop").map((x) => (
            <li key={x.id}>{bahasa === "en" ? x.en : x.id}
              <button className="kecil tunjuk-temuan" onClick={() => tunjuk(x)}>{k.tunjukkan}</button></li>
          ))}</ul>
        </div>
      ) : (
        <>
          <p className="hint kiri" style={{ marginTop: 0 }}>{k.berlakuInfo}</p>
          {/* Harga mana yang dijadikan pricelist: dasar langkah 4a, atau
              salah satu set harga spesial langkah 4b. */}
          {setSpesial.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <label className="lbl" htmlFor="pl-harga">{k.fHarga}</label>
              <select id="pl-harga" value={hargaSetAda ? hargaSet : ""}
                      onChange={(e) => setHargaSet(e.target.value)}>
                <option value="">{k.hargaDasar}</option>
                {setSpesial.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
              </select>
              {hargaSetAda && <span className="pill warn" style={{ marginLeft: 8 }}>{k.hargaSpesial}</span>}
            </div>
          )}
          <label className="lbl" htmlFor="pl-nama">{k.fNama}</label>
          <div className="row">
            <input id="pl-nama" value={namaPl} maxLength={120} style={{ width: 320 }}
                   placeholder={`${data!.pricelist.judul} ${data!.pricelist.tanggal}`.trim()}
                   aria-label={k.fNama} onChange={(e) => setNamaPl(e.target.value)} />
            <button className="pri" disabled={!!sibuk} onClick={() => void berlakukan()}>
              {sibuk === "berlaku" ? k.memberlakukan : k.berlakukan}</button>
            <button disabled={!!sibuk} onClick={() => void berlakukan(false)}
                    title={k.simpanSbgInfo}>
              {sibuk === "simpanSbg" ? k.menyimpan : k.simpanSbg}</button>
          </div>
          <p className="hint kiri" style={{ margin: "6px 0 0" }}>{k.simpanSbgInfo}</p>
          {tersimpanSbg && <div className="banner ok">{k.tersimpanSbg(tersimpanSbg)}</div>}
          {berlaku && (
            <div className="banner ok">{k.diberlakukan(berlaku)}{" "}
              <TautanLayar href="/simulasi">{k.keSimulasi}</TautanLayar></div>
          )}
        </>
      )}
    </div>
  );

  const props = data && hasil ? { data, hasil, ubah, bolehUbah } : null;

  return (
    <Kerangka sesi={sesi} lebar judul={<div><h1>{k.judul}</h1></div>}>
      {!sesi.project_slug && <div className="banner warn">{k.pilihProject}</div>}
      {galat && <div className="banner stop">{galat}</div>}

      {sesi.project_slug && !props && !galat && <p className="hint">{k.memuat}</p>}

      {props && (
        <>
          <div className="panel sp susun-alat">
            <div className="row" style={{ margin: 0 }}>
              {bolehUbah && (
                <>
                  <button onClick={() => setBukaImpor((x) => !x)}>{k.impor}</button>
                  <button className="pri" disabled={!berubah || !!sibuk} onClick={() => void simpan()}>
                    {sibuk === "simpan" ? k.menyimpan : k.simpan}</button>
                </>
              )}
              <button disabled={draf!.baru || berubah}
                      title={berubah ? k.unduhSyarat : undefined}
                      onClick={() => { location.href = "/api/pricelist/susun/excel"; }}>{k.unduh}</button>
              <span className={`pill ${berubah ? "warn" : "ok"}`}>
                {berubah ? k.belumSimpan : k.tersimpan}</span>
              <span className="hint" style={{ margin: 0 }}>
                {draf!.baru ? k.drafBaru
                  : draf!.diubah_pada && k.terakhir(draf!.diubah_oleh ?? "—", tgl(draf!.diubah_pada))}
              </span>
            </div>
            {!bolehUbah && <p className="hint kiri" style={{ marginBottom: 0 }}>{k.hanyaBaca}</p>}
            {bukaImpor && (
              <div className="form-blok" style={{ marginTop: 12 }}>
                <p className="hint kiri" style={{ marginTop: 0 }}>{k.imporInfo}</p>
                <div className="row" style={{ marginBottom: 0 }}>
                  <PilihBerkas accept=".xlsx" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
                  <button className="pri" disabled={!berkas || !!sibuk} onClick={() => void impor()}>
                    {sibuk === "impor" ? k.membaca : k.baca}</button>
                  <button onClick={() => { setBukaImpor(false); setBerkas(null); }}>{k.batal}</button>
                </div>
              </div>
            )}
            {info && <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>{info}</div>}
            {peringatan.length > 0 && (
              <div className="banner warn" style={{ marginTop: 12, marginBottom: 0 }}>
                <ul style={{ margin: 0, paddingLeft: 16 }}>{peringatan.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
          </div>

          {/* Satu langkah tampil sekali waktu, seperti lembar-lembar Excel-nya:
              klik langkah di bilah atas untuk berpindah. Isian semua langkah
              tetap satu draf, jadi berpindah langkah tidak menghilangkan apa
              pun. Bilahnya menempel di atas saat halaman digulir. */}
          <nav className="langkah langkah-pl lekat" aria-label={k.judul}>
            {/* Folder di depan langkah 1: pricelist tersimpan dan riwayatnya. */}
            <button className={`lk folder-pl ${langkah === FOLDER ? "kini" : ""}`}
                    aria-current={langkah === FOLDER ? "page" : undefined}
                    onClick={() => setLangkah(FOLDER)}>
              <b><span aria-hidden>📁</span> {k.folder}</b>{k.folderUraian}
            </button>
            {k.langkah.map((l, i) => (
              <button key={l} className={`lk ${i === langkah ? "kini" : ""}`}
                      aria-current={i === langkah ? "step" : undefined}
                      onClick={() => {
                        setLangkah(i);
                        document.querySelector(".langkah-pl")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}>
                <b><span className="no-langkah">{NOMOR[i]}.</span> {l}{" "}
                  <TandaLangkah temuan={temuan.filter((x) => x.langkah === i)} judul={k.tandaJudul} /></b>{k.uraian[i]}
              </button>
            ))}
          </nav>
          {langkah !== FOLDER && (
            <div className="row" style={{ margin: "0 0 8px", justifyContent: "space-between" }}>
              {bolehUbah ? <BilahGaya /> : <span />}
              {/* Warna: abu muda = diisi manual, abu lebih tua = dihitung sistem. */}
              <span className="legenda-isian">
                <span><i className="manual" />{k.legManual}</span>
                <span><i className="sistem" />{k.legSistem}</span>
              </span>
            </div>
          )}

          {[
            <LangkahIrr key={0} {...props} baru={[baruCb, setBaruCb]} slug={sesi.project_slug} />,
            <LangkahUnit key={1} {...props} slug={sesi.project_slug} />,
            <LangkahDataPl key={2} {...props} slug={sesi.project_slug} />,
            <LangkahPricelist key={3} {...props} aksi={panelBerlaku} slug={sesi.project_slug} />,
            // 4b. Harga Spesial: harga permintaan di atas harga 4a.
            <LangkahHargaSpesial key={4} {...props} />,
            <LangkahTnc key={5} {...props} slug={sesi.project_slug} />,
          ].map((isi, i) => i !== langkah ? null : (
            <section key={i} id={`langkah-${NOMOR[i]}`} className="panel sp bagian-langkah">
              <h2>{NOMOR[i]}. {k.langkah[i]}<span className="hint" style={{ margin: 0 }}>{k.uraian[i]}</span></h2>
              {temuan.some((x) => x.langkah === i) && (
                <details className={`banner ${temuan.some((x) => x.langkah === i && x.jenis === "stop") ? "stop" : "warn"} temuan-langkah`} open>
                  <summary><b>{k.temuanJudul(temuan.filter((x) => x.langkah === i).length)}</b></summary>
                  <ul style={{ margin: "4px 0 0 16px" }}>
                    {temuan.filter((x) => x.langkah === i).map((x) => (
                      <li key={x.id}>{x.jenis === "stop" ? "✕ " : "⚠ "}{bahasa === "en" ? x.en : x.id}
                        {x.sasaran && (
                          <button className="kecil tunjuk-temuan" onClick={() => tunjuk(x)}>{k.tunjukkan}</button>
                        )}</li>
                    ))}
                  </ul>
                </details>
              )}
              {isi}
            </section>
          ))}

          {/* Data & Riwayat Pricelist: pricelist yang berlaku dan yang
              tersimpan (dapat dibuka, diunduh, diganti nama, Buka & edit),
              beserta riwayat perubahannya. */}
          {langkah === FOLDER && sesi.project_slug && (
            <>
              <PanelPricelist sesi={sesi} versi={versiPl} onBerubah={() => setVersiPl((v) => v + 1)}
                              onEdit={bolehUbah ? (id, nama) => void bukaEdit(id, nama) : undefined}
                              onAmbilTnc={bolehUbah ? (id, nama) => void ambilTnc(id, nama) : undefined} />
              <RiwayatSusun versi={versiPl} />
            </>
          )}
        </>
      )}
    </Kerangka>
  );
}

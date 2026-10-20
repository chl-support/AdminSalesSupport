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

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { PilihBerkas } from "../pilih-berkas";
import { PanelPricelist } from "./panel-pricelist";
import { RiwayatSusun } from "./riwayat-susun";
import { useSesi } from "../session";
import { PENGUNGGAH } from "../simulasi/unggah-pricelist";
import { basisProject, hitungSemua, type SusunPricelist } from "@/lib/susun-pricelist";
import {
  LangkahDataPl, LangkahIrr, LangkahPricelist, LangkahTnc, LangkahUnit, sinkronTnc,
} from "./langkah";

const KATA = {
  id: {
    judul: "Pricelist",
    langkah: ["Data (IRR)", "Unit Data", "Data Pricelist", "Pricelist", "Terms & Conditions"],
    folder: "Data & Riwayat Pricelist", folderUraian: "Pricelist tersimpan & riwayat perubahan",
    uraian: [
      "Koefisien harga tiap cara bayar",
      "Harga dasar tiap unit",
      "Harga per cara bayar",
      "Harga jual, DPP & PPN DTP",
      "Ketentuan pembayaran",
    ],
    pilihProject: "Pilih project lebih dulu.",
    memuat: "Memuat…",
    impor: "Impor dari Excel", imporInfo: "Berkas PL dengan lembar Data (IRR), Unit Data, Data Pricelist, Pricelist dan T&C.",
    membaca: "Membaca…", baca: "Baca berkas", batal: "Batal",
    terimpor: (u: number) => `${u} unit dan seluruh langkah terisi dari berkas. Periksa tiap langkah, lalu Simpan.`,
    simpan: "Simpan", menyimpan: "Menyimpan…", tersimpan: "Tersimpan",
    belumSimpan: "Ada perubahan yang belum disimpan",
    drafBaru: "Belum ada draf untuk project ini. Isi langkah-langkahnya atau impor dari Excel.",
    terakhir: (o: string, t: string) => `Disimpan ${o} · ${t}`,
    unduh: "Unduh Excel", unduhSyarat: "Simpan dulu supaya berkasnya berisi perubahan terakhir.",
    hanyaBaca: "Hanya Admin Sales dan Admin IT yang dapat mengubah pricelist.",
    galatJudul: "Belum dapat diberlakukan",
    berlakuJudul: "Simpan / berlakukan pricelist",
    berlakuInfo: "Pricelist ini menggantikan pricelist yang berlaku dan langsung dipakai layar Simulasi / NPV. Pricelist lama tetap ada di riwayatnya.",
    yakinBuka: "Isian di layar belum disimpan dan akan diganti. Lanjutkan?",
    dibuka: (n: string) => `Pricelist "${n}" dibuka untuk diedit. Setelah selesai, beri nama baru di langkah 4 lalu Simpan & berlakukan — pricelist "${n}" tetap ada di riwayat.`,
    fNama: "Nama pricelist (juga nama file Excel-nya)", berlakukan: "Simpan & berlakukan", memberlakukan: "Memberlakukan…",
    diberlakukan: (n: string) => `Pricelist "${n}" berlaku. Buka Simulasi / NPV untuk memakainya.`,
    simpanSbg: "Simpan dengan nama baru (tanpa memberlakukan)",
    simpanSbgInfo: "Simpan dengan nama baru: tersimpan di Riwayat Unggahan untuk dibuka lagi nanti, pricelist yang berlaku tidak berganti.",
    tersimpanSbg: (n: string) => `Pricelist "${n}" tersimpan di Riwayat Unggahan (belum berlaku). Pricelist yang berlaku tidak berubah.`,
    keSimulasi: "Buka Simulasi / NPV",
  },
  en: {
    judul: "Price List",
    langkah: ["Data (IRR)", "Unit Data", "Price Data", "Price List", "Terms & Conditions"],
    folder: "Price List Data & History", folderUraian: "Saved price lists & change history",
    uraian: [
      "Price coefficient per payment scheme",
      "Base price per unit",
      "Price per payment scheme",
      "Selling price, DPP & VAT DTP",
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
    berlakuJudul: "Apply price list",
    berlakuInfo: "This price list replaces the one in force and is used by Simulation / NPV right away. The old one stays in the history.",
    yakinBuka: "Unsaved changes on screen will be replaced. Continue?",
    dibuka: (n: string) => `Price list "${n}" opened for editing. When done, give it a new name in step 4 and Save & apply — "${n}" stays in the history.`,
    fNama: "Price list name (also its Excel file name)", berlakukan: "Save & apply", memberlakukan: "Applying…",
    diberlakukan: (n: string) => `Price list "${n}" is in force. Open Simulation / NPV to use it.`,
    simpanSbg: "Save under a new name (without applying)",
    simpanSbgInfo: "Save under a new name: kept in the upload history to reopen later; the price list in force does not change.",
    tersimpanSbg: (n: string) => `Price list "${n}" saved to the upload history (not in force). The price list in force is unchanged.`,
    keSimulasi: "Open Simulation / NPV",
  },
};

type Draf = {
  baru: boolean; data: SusunPricelist;
  diubah_oleh: string | null; diubah_pada: string | null;
};

/** Nomor "langkah" untuk folder Data & Riwayat Pricelist di depan langkah 1. */
const FOLDER = -1;

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
  const [berlaku, setBerlaku] = useState<string | null>(null);
  /** Nama pricelist yang baru disimpan tanpa diberlakukan. */
  const [tersimpanSbg, setTersimpanSbg] = useState<string | null>(null);
  /** "Mulai dari awal" ikut menghapus pricelist yang sedang berlaku. */
  const [resetBerlaku, setResetBerlaku] = useState(false);

  // Slug project untuk muat(), yang sengaja tidak bergantung pada sesi.
  const slugRef = useRef<string | null | undefined>(null);
  slugRef.current = sesi?.project_slug;

  const muat = useCallback(async () => {
    const res = await fetch("/api/pricelist/susun");
    const b = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = "/login"; return; }
    if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    // Aturan basis harga project (Permai Indah: Excl PPN) untuk draf baru.
    setDraf(b); setData(basisProject(slugRef.current, b.data));
  }, []);

  useEffect(() => { if (sesi?.project_slug) void muat(); }, [sesi, muat]);

  const hasil = useMemo(() => (data ? hitungSemua(data) : null), [data]);
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
    const fd = new FormData(); fd.append("file", berkas);
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
    setData(basisProject(sesi?.project_slug,
      { ...b.susun, tncPatokan: b.susun.tncPatokan ?? data?.tncPatokan })); setPeringatan(b.peringatan ?? []); setNamaPl("");
    setInfo(k.dibuka(nama)); setLangkah(0);
  };

  /** Mulai dari awal: hapus draf, riwayat, dan pricelist tersimpan project ini. */
  const mulaiAwal = async () => {
    const nama = sesi?.project_name ?? "";
    const ketik = prompt(`Semua data Pricelist ${nama} akan dihapus` +
      `${resetBerlaku ? ", TERMASUK pricelist yang sedang berlaku" : ""}. ` +
      `Ketik nama project "${nama}" untuk melanjutkan:`);
    if (ketik == null) return;
    setGalat(null); setInfo(null);
    const b = await kirim("/api/pricelist/susun/kosongkan", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ konfirmasi: ketik, termasukBerlaku: resetBerlaku }),
    });
    if (!b) return;
    setResetBerlaku(false); setBaruCb(0); setNamaPl("");
    await muat();
    setVersiPl((v) => v + 1);
    setInfo(`Pricelist ${nama} dimulai dari awal (${b.pricelist} pricelist tersimpan dihapus).`);
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
      setGalat(`Pricelist "${nama}" tidak menyimpan Terms & Conditions sendiri. Pilih pricelist lain.`);
      return;
    }
    const daftar = tnc.caraBayar.map((c, i) => `${i + 1}. ${c.judul || "(tanpa judul)"}`).join("\n");
    if (!confirm(`Terms & Conditions dari "${nama}":\n\n${daftar}\n\n${tnc.catatan.length} catatan.\n\n` +
                 "T&C di layar diganti dengan isi di atas; langkah 1–4 tidak berubah. Lanjutkan?")) return;
    ubah((d) => ({ ...d, tnc }));
    setInfo(`Terms & Conditions dari "${nama}" dikembalikan (${tnc.caraBayar.length} cara bayar). Periksa di langkah 5, lalu Simpan.`);
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
      body: JSON.stringify({ nama: namaPl, berlakukan: aktifkan }),
    });
    setSibuk(null);
    if (!b) return;
    if (aktifkan) setBerlaku(b.nama); else setTersimpanSbg(b.nama);
    setVersiPl((v) => v + 1);
  };

  const ubah = (f: (d: SusunPricelist) => SusunPricelist) => {
    setInfo(null); setBerlaku(null); setTersimpanSbg(null);
    // T&C mengikuti kolom Pricelist: kolom baru mendapat blok, ganti nama ikut.
    setData((d) => (d ? sinkronTnc(d, f(d)) : d));
  };

  const tgl = (s: string) => new Date(s).toLocaleString("id-ID",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const panelBerlaku = bolehUbah && hasil && (
    <div className="form-blok sp" style={{ marginTop: 16 }}>
      <h3>{k.berlakuJudul}</h3>
      {hasil.galat.length > 0 ? (
        <div className="banner stop">
          <b>{k.galatJudul}</b>
          <ul style={{ margin: "4px 0 0 16px" }}>{hasil.galat.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      ) : (
        <>
          <p className="hint kiri" style={{ marginTop: 0 }}>{k.berlakuInfo}</p>
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
              <a href="/simulasi">{k.keSimulasi}</a></div>
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
                <b>{i + 1}. {l}</b>{k.uraian[i]}
              </button>
            ))}
          </nav>

          {[
            <LangkahIrr key={0} {...props} baru={[baruCb, setBaruCb]} />,
            <LangkahUnit key={1} {...props} />,
            <LangkahDataPl key={2} {...props} />,
            <LangkahPricelist key={3} {...props} aksi={panelBerlaku} slug={sesi.project_slug} />,
            <LangkahTnc key={4} {...props} slug={sesi.project_slug} />,
          ].map((isi, i) => i !== langkah ? null : (
            <section key={i} id={`langkah-${i + 1}`} className="panel sp bagian-langkah">
              <h2>{i + 1}. {k.langkah[i]}<span className="hint" style={{ margin: 0 }}>{k.uraian[i]}</span></h2>
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
              {bolehUbah && (
                <div className="panel sp">
                  <h2>Mulai dari awal</h2>
                  <p className="hint kiri" style={{ marginTop: 0 }}>
                    Menghapus draf kelima langkah, riwayat perubahan, dan pricelist tersimpan
                    project <b>{sesi.project_name}</b>. Tidak dapat dibatalkan. Project lain dan
                    Lampiran T&amp;C tidak tersentuh.
                  </p>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                    <input type="checkbox" checked={resetBerlaku}
                           onChange={(e) => setResetBerlaku(e.target.checked)} />
                    Hapus juga pricelist yang sedang berlaku (Simulasi / NPV project ini kosong
                    sampai ada pricelist baru yang diberlakukan)
                  </label>
                  <button className="bahaya" disabled={!!sibuk} onClick={() => void mulaiAwal()}>
                    Mulai dari awal</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Kerangka>
  );
}

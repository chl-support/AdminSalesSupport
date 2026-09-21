"use client";

/**
 * Memo Approval — berkas memo sebagai lampiran rujukan.
 *
 * Yang disimpan di sini tidak dibaca sistem: tarif yang dipakai menghitung
 * tetap berasal dari skema insentif. Memo ini dasar tertulisnya, yang dapat
 * dibuka saat ada yang mempertanyakan sebuah angka — tanpa mencari-cari di
 * percakapan atau surel, dan tanpa bergantung pada satu orang yang kebetulan
 * menyimpannya.
 *
 * Karena itu tidak ada tombol "setujui" di layar ini. Tombol persetujuan yang
 * tidak menggerakkan apa pun justru berbahaya: orang akan mengira perhitungan
 * pada layar berikutnya sudah mengikuti memo yang baru saja disetujui.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const KATA = {
  id: {
    judul: "Memo Approval",
    pengantar:
      "Memo Skema Dan Persetujuan Tersimpan Sebagai Dasar Tertulis Sesuai " +
      "Project Terkait. Perhitungan Tarif Tetap Mengacu Pada Skema Insentif.",
    galat: "Tidak dapat dikerjakan",
    unggahJudul: "UNGGAH MEMO",
    fJudul: "Judul", cJudul: "mis. Skema Komisi Triwulan I",
    fNomor: "Nomor memo", cNomor: "mis. 002/SBL-BD/SM/XI/2025",
    fDari: "Berlaku dari", fSampai: "Berlaku sampai",
    fKeterangan: "Keterangan",
    cKeterangan: "Catatan singkat: apa yang diatur memo ini.",
    fBerkas: "Berkas (PDF, gambar, Excel, atau Word — maksimal 10 MB)",
    unggah: "Unggah memo", mengunggah: "Mengunggah…",
    tersimpan: (j: string) => `Memo "${j}" tersimpan.`,
    dihapus: (j: string) =>
      `Memo "${j}" dihapus. Judulnya tetap tercatat pada jejak audit.`,
    daftar: "Memo tersimpan",
    berkasN: (n: number) => `${n} berkas`,
    fTanggal: "Tanggal memo",
    fDariSiapa: "Pengajuan (Dari)", cDariSiapa: "mis. Ir. Hendry Sulaiman",
    fKepada: "Kepada (Yth)",
    cKepada: "mis. Bpk. Johannes Tanuwijaya, Bpk. Setia Iskandar & Bpk. Al Imron",
    fNilai: "Nilai / Skema Fee",
    cNilai: "mis. 2,5% dari harga sewa unit (setelah dikurangi biaya operasional)",
    fDokumen: "Dokumen pendukung wajib",
    cDokumen: "Satu baris satu dokumen — mis. Form Referensi / Kwitansi / " +
              "Dokumen transaksi sewa",
    fDiajukan: "Diajukan oleh", fDiketahui: "Diketahui oleh",
    fDisetujui: "Disetujui oleh",
    kNo: "No", kNomor: "Nomor Memo", kTanggal: "Tanggal Memo",
    kDari: "Pengajuan (Dari)", kKepada: "Kepada (Yth)",
    kPerihal: "Perihal / Program", kNilai: "Nilai / Skema Fee",
    kPeriode: "Periode Program", kDokumen: "Dokumen Pendukung Wajib",
    kPihak: "Diajukan / Diketahui / Disetujui Oleh",
    kBerkas: "Berkas", kLampiran: "Lampiran", kTindakan: "Tindakan",
    lDiajukan: "Diajukan:", lDiketahui: "Diketahui:", lDisetujui: "Disetujui:",
    seterusnya: "seterusnya", hapus: "Hapus",
    kosong: "Belum ada memo pada project ini.",
    unduhRekap: "Unduh rekap (.xlsx)",
    nLampiran: (n: number) => `${n} lampiran`,
    takAdaLampiran: "Belum ada lampiran",
    tambahLampiran: "Tambah lampiran",
    tutupLampiran: "Tutup",
    fLabel: "Keterangan lampiran (boleh kosong)",
    cLabel: "mis. Kwitansi, Form Referensi, Dokumen transaksi sewa",
    fLampiran: "Berkas lampiran (PDF, gambar, Excel, atau Word — maksimal 10 MB)",
    lampirkan: "Lampirkan", melampirkan: "Melampirkan…",
    lampiranTersimpan: (f: string) => `Lampiran "${f}" tersimpan.`,
    lampiranDihapus: (f: string) =>
      `Lampiran "${f}" dihapus. Namanya tetap tercatat pada jejak audit.`,
  },
  en: {
    judul: "Approval Memo",
    pengantar:
      "The written basis for the project concerned; rates still refer to the " +
      "Incentive Scheme",
    galat: "Could not be completed",
    unggahJudul: "UPLOAD MEMO",
    fJudul: "Title", cJudul: "e.g. Commission Scheme Q1",
    fNomor: "Memo number", cNomor: "e.g. 002/SBL-BD/SM/XI/2025",
    fDari: "Valid from", fSampai: "Valid until",
    fKeterangan: "Notes",
    cKeterangan: "A short note: what this memo governs.",
    fBerkas: "File (PDF, image, Excel, or Word — 10 MB maximum)",
    unggah: "Upload memo", mengunggah: "Uploading…",
    tersimpan: (j: string) => `Memo "${j}" saved.`,
    dihapus: (j: string) =>
      `Memo "${j}" deleted. Its title remains in the audit trail.`,
    daftar: "Stored memos",
    berkasN: (n: number) => `${n} files`,
    fTanggal: "Memo date",
    fDariSiapa: "Submitted by", cDariSiapa: "e.g. Ir. Hendry Sulaiman",
    fKepada: "Addressed to",
    cKepada: "e.g. Mr Johannes Tanuwijaya, Mr Setia Iskandar & Mr Al Imron",
    fNilai: "Value / fee scheme",
    cNilai: "e.g. 2.5% of the unit rent (net of operating costs)",
    fDokumen: "Required supporting documents",
    cDokumen: "One document per line — e.g. Referral form / Receipt / " +
              "Lease transaction document",
    fDiajukan: "Submitted by", fDiketahui: "Noted by", fDisetujui: "Approved by",
    kNo: "No", kNomor: "Memo number", kTanggal: "Memo date",
    kDari: "Submitted by", kKepada: "Addressed to",
    kPerihal: "Subject / programme", kNilai: "Value / fee scheme",
    kPeriode: "Programme period", kDokumen: "Required supporting documents",
    kPihak: "Submitted / noted / approved by",
    kBerkas: "File", kLampiran: "Attachments", kTindakan: "Action",
    lDiajukan: "Submitted:", lDiketahui: "Noted:", lDisetujui: "Approved:",
    seterusnya: "onwards", hapus: "Delete",
    kosong: "No memos on this project yet.",
    unduhRekap: "Download recap (.xlsx)",
    nLampiran: (n: number) => `${n} attachments`,
    takAdaLampiran: "No attachments yet",
    tambahLampiran: "Add attachment",
    tutupLampiran: "Close",
    fLabel: "Attachment label (optional)",
    cLabel: "e.g. Receipt, Referral form, Lease transaction document",
    fLampiran: "Attachment file (PDF, image, Excel, or Word — 10 MB maximum)",
    lampirkan: "Attach", melampirkan: "Attaching…",
    lampiranTersimpan: (f: string) => `Attachment "${f}" saved.`,
    lampiranDihapus: (f: string) =>
      `Attachment "${f}" deleted. Its name remains in the audit trail.`,
  },
};

type Memo = {
  id: string; nomor: string | null; judul: string; keterangan: string | null;
  berlaku_dari: string | null; berlaku_sampai: string | null;
  tanggal_memo: string | null; dari: string | null; kepada: string | null;
  nilai_skema: string | null; dokumen_wajib: string | null;
  diajukan_oleh: string | null; diketahui_oleh: string | null;
  disetujui_oleh: string | null;
  file_name: string; content_type: string; size_bytes: number;
  uploaded_by: string; uploaded_at: string;
};

type Lampiran = {
  id: string; memo_id: string; label: string | null; file_name: string;
  content_type: string; size_bytes: number;
  uploaded_by: string; uploaded_at: string;
};

const tgl = (v?: string | null) => (v ? String(v).slice(0, 10) : "—");
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

const BULAN = {
  id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
       "Agustus", "September", "Oktober", "November", "Desember"],
  en: ["January", "February", "March", "April", "May", "June", "July",
       "August", "September", "October", "November", "December"],
};

/** "30 Juli 2026" — bukan "2026-07-30". Rekapitulasi ini dibaca orang, bukan
 *  mesin, dan tanggal berformat mesin memaksa pembacanya menerjemahkan. */
function tglPanjang(v: string | null, b: "id" | "en") {
  if (!v) return null;
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return b === "id" ? `${d} ${BULAN.id[m - 1]} ${y}`
                    : `${d} ${BULAN.en[m - 1]} ${y}`;
}

/**
 * "Agustus s.d. Desember 2026" — tahunnya ditulis sekali bila sama.
 *
 * Periode program dibaca sebagai rentang bulan, bukan sebagai dua tanggal.
 * Tanggal awal dan akhir yang persis jarang menjadi pertanyaan; yang
 * ditanyakan "berlaku bulan apa sampai bulan apa".
 */
function periode(dari: string | null, sampai: string | null, b: "id" | "en",
                 seterusnya: string) {
  if (!dari && !sampai) return null;
  const pecah = (v: string | null) => {
    if (!v) return null;
    const [y, m] = String(v).slice(0, 10).split("-").map(Number);
    return y && m ? { y, nama: BULAN[b][m - 1] } : null;
  };
  const a = pecah(dari), z = pecah(sampai);
  const sd = b === "id" ? "s.d." : "to";
  if (a && z) {
    return a.y === z.y ? `${a.nama} ${sd} ${z.nama} ${z.y}`
                       : `${a.nama} ${a.y} ${sd} ${z.nama} ${z.y}`;
  }
  if (a) return `${a.nama} ${a.y} ${sd} ${seterusnya}`;
  return `${sd} ${z!.nama} ${z!.y}`;
}

export default function MemoPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();
  const [daftar, setDaftar] = useState<Memo[]>([]);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const [berkas, setBerkas] = useState<File | null>(null);
  const [judul, setJudul] = useState("");
  const [nomor, setNomor] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [tanggalMemo, setTanggalMemo] = useState("");
  const [dariSiapa, setDariSiapa] = useState("");
  const [kepada, setKepada] = useState("");
  const [nilai, setNilai] = useState("");
  const [dokumen, setDokumen] = useState("");
  const [diajukan, setDiajukan] = useState("");
  const [diketahui, setDiketahui] = useState("");
  const [disetujui, setDisetujui] = useState("");

  // Lampiran: daftarnya, baris mana yang sedang terbuka, dan isian unggahnya.
  const [lampiran, setLampiran] = useState<Lampiran[]>([]);
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [lBerkas, setLBerkas] = useState<File | null>(null);
  const [lLabel, setLLabel] = useState("");

  const muat = useCallback(async () => {
    try {
      const res = await fetch("/api/memos");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setDaftar(b.memos ?? []);
      setLampiran(b.lampiran ?? []);
      setGalat(null);
    } catch (e: any) { setGalat(String(e?.message ?? e)); }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  const unggah = async () => {
    if (!berkas) return;
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const fd = new FormData();
      fd.append("file", berkas);
      // Judul kosong diisi nama berkasnya, bukan ditolak: yang mengunggah
      // sedang memegang berkasnya, dan namanya biasanya sudah menjelaskan.
      fd.append("judul", judul.trim() || berkas.name);
      fd.append("nomor", nomor);
      fd.append("keterangan", keterangan);
      fd.append("berlaku_dari", dari);
      fd.append("berlaku_sampai", sampai);
      fd.append("tanggal_memo", tanggalMemo);
      fd.append("dari", dariSiapa);
      fd.append("kepada", kepada);
      fd.append("nilai_skema", nilai);
      fd.append("dokumen_wajib", dokumen);
      fd.append("diajukan_oleh", diajukan);
      fd.append("diketahui_oleh", diketahui);
      fd.append("disetujui_oleh", disetujui);
      const res = await fetch("/api/memos", { method: "POST", body: fd });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.tersimpan(b.judul));
      setBerkas(null); setJudul(""); setNomor(""); setKeterangan("");
      setDari(""); setSampai(""); setTanggalMemo(""); setDariSiapa("");
      setKepada(""); setNilai(""); setDokumen(""); setDiajukan("");
      setDiketahui(""); setDisetujui("");
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  const hapus = async (m: Memo) => {
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/memos/${m.id}`, { method: "DELETE" });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.dihapus(m.judul));
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  /** Lampirkan satu berkas pada memo yang barisnya sedang terbuka. */
  const lampirkan = async (memoId: string) => {
    if (!lBerkas) return;
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const fd = new FormData();
      fd.append("file", lBerkas);
      fd.append("label", lLabel);
      const res = await fetch(`/api/memos/${memoId}/lampiran`,
                              { method: "POST", body: fd });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.lampiranTersimpan(b.file_name ?? lBerkas.name));
      setLBerkas(null); setLLabel("");
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  const hapusLampiran = async (f: Lampiran) => {
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/memos/lampiran/${f.id}`,
                              { method: "DELETE" });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.lampiranDihapus(f.file_name));
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  const bolehHapus = sesi.role === "admin_sales" || sesi.role === "admin_system";
  const lampiranDari = (memoId: string) =>
    lampiran.filter((f) => f.memo_id === memoId);

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      {galat && (
        <div className="banner stop"><b>{k.galat}</b>{galat}</div>
      )}
      {kabar && <div className="banner ok">{kabar}</div>}

      <div className="panel sp">
        <div className="form-blok">
          <h3>{k.unggahJudul}</h3>
          <div className="filters">
            <div>
              <div className="lbl">{k.fJudul}</div>
              <input value={judul} placeholder={k.cJudul}
                     onChange={(e) => setJudul(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fNomor}</div>
              <input value={nomor} placeholder={k.cNomor}
                     onChange={(e) => setNomor(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fTanggal}</div>
              <input type="date" value={tanggalMemo}
                     onChange={(e) => setTanggalMemo(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fDari}</div>
              <input type="date" value={dari}
                     onChange={(e) => setDari(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fSampai}</div>
              <input type="date" value={sampai}
                     onChange={(e) => setSampai(e.target.value)} />
            </div>
          </div>

          {/* Pihak-pihaknya. Tiga baris terpisah, bukan satu kolom bebas:
              rekapitulasinya membedakan yang mengajukan, yang mengetahui, dan
              yang menyetujui — dan perbedaan itu yang ditanyakan orang ketika
              sebuah angka dipersoalkan. */}
          <div className="filters" style={{ marginTop: 12 }}>
            <div>
              <div className="lbl">{k.fDariSiapa}</div>
              <input value={dariSiapa} placeholder={k.cDariSiapa}
                     onChange={(e) => setDariSiapa(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fKepada}</div>
              <input value={kepada} placeholder={k.cKepada}
                     onChange={(e) => setKepada(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fNilai}</div>
              <input value={nilai} placeholder={k.cNilai}
                     onChange={(e) => setNilai(e.target.value)} />
            </div>
          </div>

          <div className="filters" style={{ marginTop: 12 }}>
            <div>
              <div className="lbl">{k.fDiajukan}</div>
              <input value={diajukan}
                     onChange={(e) => setDiajukan(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fDiketahui}</div>
              <input value={diketahui}
                     onChange={(e) => setDiketahui(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fDisetujui}</div>
              <input value={disetujui}
                     onChange={(e) => setDisetujui(e.target.value)} />
            </div>
          </div>

          <div className="lbl" style={{ marginTop: 12 }}>{k.fDokumen}</div>
          <textarea value={dokumen} style={{ width: "100%", minHeight: 54 }}
                    placeholder={k.cDokumen}
                    onChange={(e) => setDokumen(e.target.value)} />

          <div className="lbl" style={{ marginTop: 12 }}>{k.fKeterangan}</div>
          <textarea value={keterangan} style={{ width: "100%", minHeight: 54 }}
                    placeholder={k.cKeterangan}
                    onChange={(e) => setKeterangan(e.target.value)} />

          <div className="lbl" style={{ marginTop: 12 }}>
            {k.fBerkas}
          </div>
          <input type="file" style={{ width: "100%" }}
                 accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx"
                 onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />

          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="pri" disabled={!berkas || busy}
                    onClick={() => void unggah()}>
              {busy ? k.mengunggah : k.unggah}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          {k.daftar}
          <span>
            {/* Unduhan, bukan tombol: berkasnya dibangkitkan server dan
                langsung disimpan peramban, tanpa layar perantara. */}
            {daftar.length > 0 && (
              <a className="tautan-klaim" href="/api/memos/rekap"
                 style={{ marginRight: 8 }}>
                {k.unduhRekap}
              </a>
            )}
            <span className="pill">{k.berkasN(daftar.length)}</span>
          </span>
        </h2>

        {/* Rekapitulasi ke samping, mengikuti bentuk cetakannya: satu memo
            satu baris, sepuluh kolom. Lebarnya melampaui layar mana pun, jadi
            ia digulir di dalam bidangnya sendiri — bukan memaksa seluruh
            halaman ikut melebar. */}
        <div className="tscroll">
          <table className="rekap-memo"><tbody>
            <tr>
              <th>{k.kNo}</th><th>{k.kNomor}</th><th>{k.kTanggal}</th>
              <th>{k.kDari}</th><th>{k.kKepada}</th><th>{k.kPerihal}</th>
              <th>{k.kNilai}</th><th>{k.kPeriode}</th><th>{k.kDokumen}</th>
              <th>{k.kPihak}</th><th>{k.kBerkas}</th>
              <th>{k.kLampiran}</th>
              {bolehHapus && <th>{k.kTindakan}</th>}
            </tr>

            {daftar.map((m, i) => (
              <tr key={m.id}>
                <td className="no">{i + 1}</td>
                <td className="nomor">{m.nomor ?? "—"}</td>
                <td>{tglPanjang(m.tanggal_memo, bahasa) ?? "—"}</td>
                <td>{m.dari ?? "—"}</td>
                <td>{m.kepada ?? "—"}</td>
                <td>
                  {m.judul}
                  {m.keterangan && <span className="sisip">{m.keterangan}</span>}
                </td>
                <td>{m.nilai_skema ?? "—"}</td>
                <td>
                  {periode(m.berlaku_dari, m.berlaku_sampai, bahasa,
                           k.seterusnya) ?? "—"}
                </td>
                <td>
                  {/* Satu baris satu dokumen, dinomori saat ditampilkan —
                      bukan saat diketik. Yang mengetik cukup menulis
                      daftarnya; penomorannya urusan layar. */}
                  {m.dokumen_wajib
                    ? <ol className="dok">
                        {m.dokumen_wajib.split("\n")
                          .map((d) => d.trim()).filter(Boolean)
                          .map((d, j) => <li key={j}>{d}</li>)}
                      </ol>
                    : "—"}
                </td>
                <td>
                  {m.diajukan_oleh || m.diketahui_oleh || m.disetujui_oleh
                    ? <div className="pihak">
                        {m.diajukan_oleh && (
                          <div><b>{k.lDiajukan}</b> {m.diajukan_oleh}</div>)}
                        {m.diketahui_oleh && (
                          <div><b>{k.lDiketahui}</b> {m.diketahui_oleh}</div>)}
                        {m.disetujui_oleh && (
                          <div><b>{k.lDisetujui}</b> {m.disetujui_oleh}</div>)}
                      </div>
                    : "—"}
                </td>
                <td>
                  <a href={`/api/memos/${m.id}`} target="_blank" rel="noreferrer">
                    {m.file_name}
                  </a>
                  <span className="sisip">
                    {kb(m.size_bytes)} · {tgl(m.uploaded_at)} · {m.uploaded_by}
                  </span>
                </td>
                <td>
                  {/* Jumlahnya yang ditampilkan, bukan daftarnya: nama berkas
                      pendukung panjang-panjang, dan tiga di antaranya akan
                      menenggelamkan sembilan kolom lain di sebelahnya. Yang
                      ingin melihatnya membuka barisnya. */}
                  <button className="tombol-lampiran"
                          onClick={() => {
                            setTerbuka(terbuka === m.id ? null : m.id);
                            setLBerkas(null); setLLabel("");
                          }}>
                    {lampiranDari(m.id).length
                      ? k.nLampiran(lampiranDari(m.id).length)
                      : k.takAdaLampiran}
                    <span className="anak-panah">
                      {terbuka === m.id ? "▾" : "▸"}
                    </span>
                  </button>
                </td>
                {bolehHapus && (
                  <td>
                    <button disabled={busy} onClick={() => void hapus(m)}>
                      {k.hapus}
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {/* Baris lampiran menyisip tepat di bawah memonya, selebar
                tabel. Ditaruh di kolomnya sendiri, ia akan memaksa kolom itu
                selebar daftar berkasnya pada seluruh baris lain. */}
            {daftar.map((m) => terbuka === m.id && (
              <tr key={`${m.id}-lampiran`} className="terbuka">
                <td colSpan={bolehHapus ? 13 : 12}>
                  <div className="rincian lampiran-memo">
                    <b>{m.nomor ?? m.judul}</b>

                    {lampiranDari(m.id).length > 0 && (
                      <ul className="berkas-lampiran">
                        {lampiranDari(m.id).map((f) => (
                          <li key={f.id}>
                            <a href={`/api/memos/lampiran/${f.id}`}
                               target="_blank" rel="noreferrer">
                              {f.label ? `${f.label} — ` : ""}{f.file_name}
                            </a>
                            <span className="sisip">
                              {kb(f.size_bytes)} · {tgl(f.uploaded_at)} ·{" "}
                              {f.uploaded_by}
                            </span>
                            {bolehHapus && (
                              <button disabled={busy}
                                      onClick={() => void hapusLampiran(f)}>
                                {k.hapus}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="unggah-lampiran">
                      <div>
                        <div className="lbl">{k.fLabel}</div>
                        <input value={lLabel} placeholder={k.cLabel}
                               onChange={(e) => setLLabel(e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">{k.fLampiran}</div>
                        <input type="file"
                               accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx"
                               onChange={(e) =>
                                 setLBerkas(e.target.files?.[0] ?? null)} />
                      </div>
                      <button className="pri" disabled={!lBerkas || busy}
                              onClick={() => void lampirkan(m.id)}>
                        {busy ? k.melampirkan : k.lampirkan}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}

            {!daftar.length && (
              <tr>
                <td colSpan={bolehHapus ? 13 : 12} style={{ color: "var(--mut)" }}>
                  {k.kosong}
                </td>
              </tr>
            )}
          </tbody></table>
        </div>
      </div>
    </Kerangka>
  );
}

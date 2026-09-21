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

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const KATA = {
  id: {
    judul: "Memo Approval",
    pengantar:
      "Dasar tertulis sesuai project terkait; tarif tetap mengacu Skema " +
      "Insentif",
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
    kMemo: "Memo", kNomor: "Nomor", kBerlaku: "Masa berlaku",
    kBerkas: "Berkas", kDiunggah: "Diunggah", kTindakan: "Tindakan",
    seterusnya: "seterusnya", hapus: "Hapus",
    kosong: "Belum ada memo pada project ini.",
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
    kMemo: "Memo", kNomor: "Number", kBerlaku: "Validity",
    kBerkas: "File", kDiunggah: "Uploaded", kTindakan: "Action",
    seterusnya: "onwards", hapus: "Delete",
    kosong: "No memos on this project yet.",
  },
};

type Memo = {
  id: string; nomor: string | null; judul: string; keterangan: string | null;
  berlaku_dari: string | null; berlaku_sampai: string | null;
  file_name: string; content_type: string; size_bytes: number;
  uploaded_by: string; uploaded_at: string;
};

const tgl = (v?: string | null) => (v ? String(v).slice(0, 10) : "—");
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

export default function MemoPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
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

  const muat = useCallback(async () => {
    try {
      const res = await fetch("/api/memos");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setDaftar(b.memos ?? []);
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
      const res = await fetch("/api/memos", { method: "POST", body: fd });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.tersimpan(b.judul));
      setBerkas(null); setJudul(""); setNomor(""); setKeterangan("");
      setDari(""); setSampai("");
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

  if (memuat || !sesi) return <MemeriksaSesi />;

  const bolehHapus = sesi.role === "admin_sales" || sesi.role === "admin_system";

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
          <span className="pill">{k.berkasN(daftar.length)}</span>
        </h2>

        <div className="tscroll">
          <table><tbody>
            <tr>
              <th>{k.kMemo}</th><th>{k.kNomor}</th><th>{k.kBerlaku}</th>
              <th>{k.kBerkas}</th><th>{k.kDiunggah}</th>
              {bolehHapus && <th style={{ width: 90 }}>{k.kTindakan}</th>}
            </tr>

            {daftar.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.judul}</b>
                  {m.keterangan && (
                    <>
                      <br />
                      <span style={{ fontSize: 11, color: "var(--mut)" }}>
                        {m.keterangan}
                      </span>
                    </>
                  )}
                </td>
                <td>{m.nomor ?? "—"}</td>
                <td>
                  {m.berlaku_dari || m.berlaku_sampai
                    ? `${tgl(m.berlaku_dari)} — ${m.berlaku_sampai
                        ? tgl(m.berlaku_sampai) : k.seterusnya}`
                    : "—"}
                </td>
                <td>
                  <a href={`/api/memos/${m.id}`} target="_blank" rel="noreferrer">
                    {m.file_name}
                  </a>
                  <br />
                  <span style={{ fontSize: 11, color: "var(--mut)" }}>
                    {kb(m.size_bytes)}
                  </span>
                </td>
                <td>
                  {String(m.uploaded_at).slice(0, 10)}
                  <br />
                  <span style={{ fontSize: 11, color: "var(--mut)" }}>
                    {m.uploaded_by}
                  </span>
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

            {!daftar.length && (
              <tr>
                <td colSpan={bolehHapus ? 6 : 5} style={{ color: "var(--mut)" }}>
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

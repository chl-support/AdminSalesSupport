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

import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

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
      setKabar(`Memo "${b.judul}" tersimpan.`);
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
      setKabar(`Memo "${m.judul}" dihapus. Judulnya tetap tercatat pada jejak audit.`);
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
        <h1>Memo Approval</h1>
        <p>
          Berkas memo skema dan persetujuannya, tersimpan bersama project
          {sesi.project_name ? ` ${sesi.project_name}` : ""}. Isinya tidak
          dibaca sistem — tarif yang dipakai menghitung tetap berasal dari skema
          insentif; memo ini dasar tertulisnya.
        </p>
      </div>
    }>

      {galat && (
        <div className="banner stop"><b>Tidak dapat dikerjakan</b>{galat}</div>
      )}
      {kabar && <div className="banner ok">{kabar}</div>}

      <div className="panel sp">
        <div className="form-blok">
          <h3>UNGGAH MEMO</h3>
          <div className="filters">
            <div>
              <div className="lbl">Judul</div>
              <input value={judul} placeholder="mis. Skema Komisi Triwulan I"
                     onChange={(e) => setJudul(e.target.value)} />
            </div>
            <div>
              <div className="lbl">Nomor memo</div>
              <input value={nomor} placeholder="mis. 002/SBL-BD/SM/XI/2025"
                     onChange={(e) => setNomor(e.target.value)} />
            </div>
            <div>
              <div className="lbl">Berlaku dari</div>
              <input type="date" value={dari}
                     onChange={(e) => setDari(e.target.value)} />
            </div>
            <div>
              <div className="lbl">Berlaku sampai</div>
              <input type="date" value={sampai}
                     onChange={(e) => setSampai(e.target.value)} />
            </div>
          </div>

          <div className="lbl" style={{ marginTop: 12 }}>Keterangan</div>
          <textarea value={keterangan} style={{ width: "100%", minHeight: 54 }}
                    placeholder="Catatan singkat: apa yang diatur memo ini."
                    onChange={(e) => setKeterangan(e.target.value)} />

          <div className="lbl" style={{ marginTop: 12 }}>
            Berkas (PDF, gambar, Excel, atau Word — maksimal 10 MB)
          </div>
          <input type="file" style={{ width: "100%" }}
                 accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx"
                 onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />

          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="pri" disabled={!berkas || busy}
                    onClick={() => void unggah()}>
              {busy ? "Mengunggah…" : "Unggah memo"}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          Memo tersimpan
          <span className="pill">{daftar.length} berkas</span>
        </h2>

        <div className="tscroll">
          <table><tbody>
            <tr>
              <th>Memo</th><th>Nomor</th><th>Masa berlaku</th>
              <th>Berkas</th><th>Diunggah</th>
              {bolehHapus && <th style={{ width: 90 }}>Tindakan</th>}
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
                        ? tgl(m.berlaku_sampai) : "seterusnya"}`
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
                      Hapus
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {!daftar.length && (
              <tr>
                <td colSpan={bolehHapus ? 6 : 5} style={{ color: "var(--mut)" }}>
                  Belum ada memo pada project ini.
                </td>
              </tr>
            )}
          </tbody></table>
        </div>
      </div>
    </Kerangka>
  );
}

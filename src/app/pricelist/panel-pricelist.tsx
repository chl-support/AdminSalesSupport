"use client";

/**
 * Pricelist yang berlaku untuk project terpilih, beserta riwayat unggahannya.
 *
 * Ditempatkan di layar Simulasi / NPV, tepat di bawah panel Upload
 * D-Pricelist: orang yang mengunggah langsung melihat hasilnya di layar yang
 * sama, dan yang menyusun simulasi tahu pricelist mana yang dipakai.
 *
 * Pricelist yang berlaku tampil sebagai satu berkas di dalam folder: tabel
 * harganya (bersusun seperti lembar Pricelist di Excel, dengan saringan unit
 * di atasnya) baru dibuka bila diminta, dan berkas Excel aslinya dapat
 * diunduh. Pricelist lama di riwayat dapat diunduh, diberlakukan kembali,
 * atau dihapus.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import type { Sesi } from "../session";
import { PENGUNGGAH, TabelHarga } from "../simulasi/unggah-pricelist";
import type { UnitHarga } from "@/lib/simulasi";
import { bagiRiwayat, TabelRiwayat, type Baris } from "./riwayat-susun";

const KATA = {
  id: {
    berlaku: "Pricelist yang berlaku",
    sumber: "Sumber angka", sOtomatis: "Otomatis", sManual: "Manual",
    sOtomatisInfo: "Otomatis: angka dari layar Pricelist, yang terakhir Anda Simpan & berlakukan.",
    sManualInfo: "Manual: angka dari berkas Excel yang diunggah dan diberlakukan.",
    sKosongSusun: "Belum ada pricelist dari layar Pricelist. Susun isiannya lalu tekan Simpan & berlakukan.",
    sKosongUnggah: "Belum ada pricelist dari berkas unggahan pada project ini.",
    sBerpindah: "Memindahkan…",
    tidakAda: "Project ini belum punya pricelist.",
    ringkas: (u: number, s: number) => `${u} unit · ${s} cara bayar`,
    riwayat: "Log impor data",
    buka: "Buka Tabel", tutup: "Tutup Tabel", unduh: "Unduh Berkas",
    takAdaBerkas: "Berkas asli tidak tersimpan (diunggah sebelum fitur unduh ada).",
    riwayatKosong: "Belum ada unggahan untuk project ini.",
    lihatRiwayat: (n: number) => `Log impor data (${n})`,
    folderSimpan: (n: number) => `Master Pricelist (${n})`,
    tglBerlaku: (t: string) => `Diberlakukan ${t}`,
    folderSimpanInfo: "Semua pricelist yang sudah disimpan dengan nama (bukan draf), terbaru di atas.",
    riwayatPl: (n: number) => `Riwayat perubahan (${n})`,
    folderKosong: "Belum ada pricelist yang disimpan dengan nama. Isi nama di langkah 4a lalu Simpan.",
    rNama: "Nama", rBerkas: "Berkas", rUnit: "Unit", rSkema: "Cara bayar",
    rOleh: "Diunggah oleh", rPada: "Tanggal", rStatus: "Status",
    sBerlaku: "Berlaku",
    berlakukan: "Berlakukan", hapus: "Hapus",
    yakinHapus: "Hapus pricelist ini?", ya: "Ya, hapus", batal: "Batal",
    gantiNama: "Ganti nama", simpanNama: "Simpan nama", edit: "Buka & edit",
    ambilTnc: "Ambil T&C saja",
    ambilTncInfo: "Kembalikan hanya Terms & Conditions dari pricelist ini ke draf; langkah 1–4 tidak berubah",
    fCari: "Cari unit", fCariContoh: "mis. NR1-05 atau 8,5x10",
    fAlamat: "Address", fPhase: "Phase", fView: "View", fSub: "Sub-Tipe",
    semua: "Semua", pajak: "Tampilkan DPP & Nilai Free PPN DTP",
    reset: "Reset saringan",
    tersaring: (n: number, t: number) => `${n} dari ${t} unit tampil`,
    kosongSaring: "Tidak ada unit yang cocok dengan saringan.",
  },
  en: {
    berlaku: "Price list in force",
    sumber: "Source", sOtomatis: "Automatic", sManual: "Manual",
    sOtomatisInfo: "Automatic: figures from the Price List screen, the last one you saved and applied.",
    sManualInfo: "Manual: figures from the Excel file you uploaded and applied.",
    sKosongSusun: "No price list from the Price List screen yet. Fill it in, then press Save & apply.",
    sKosongUnggah: "No uploaded price list for this project yet.",
    sBerpindah: "Switching…",
    tidakAda: "This project has no price list yet.",
    ringkas: (u: number, s: number) => `${u} units · ${s} payment schemes`,
    riwayat: "Data import log",
    buka: "Open Table", tutup: "Close Table", unduh: "Download File",
    takAdaBerkas: "Original file not stored (uploaded before downloads existed).",
    riwayatKosong: "No uploads for this project yet.",
    lihatRiwayat: (n: number) => `Data import log (${n})`,
    folderSimpan: (n: number) => `Master Price List (${n})`,
    tglBerlaku: (t: string) => `Applied ${t}`,
    folderSimpanInfo: "Every price list saved under a name (not drafts), newest first.",
    riwayatPl: (n: number) => `Change history (${n})`,
    folderKosong: "No price list saved under a name yet. Enter a name in step 4a, then save.",
    rNama: "Name", rBerkas: "File", rUnit: "Units", rSkema: "Schemes",
    rOleh: "Uploaded by", rPada: "Date", rStatus: "Status",
    sBerlaku: "In force",
    berlakukan: "Apply", hapus: "Delete",
    yakinHapus: "Delete this price list?", ya: "Yes, delete", batal: "Cancel",
    gantiNama: "Rename", simpanNama: "Save name", edit: "Open & edit",
    ambilTnc: "Take T&C only",
    ambilTncInfo: "Restore only the Terms & Conditions of this price list into the draft; steps 1–4 are unchanged",
    fCari: "Search unit", fCariContoh: "e.g. NR1-05 or 8,5x10",
    fAlamat: "Address", fPhase: "Phase", fView: "View", fSub: "Sub-type",
    semua: "All", pajak: "Show DPP & free VAT (DTP)",
    reset: "Reset filters",
    tersaring: (n: number, t: number) => `${n} of ${t} units shown`,
    kosongSaring: "No units match the filters.",
  },
};

type Berlaku = {
  id: string; nama: string;
  skema: string[]; unit: UnitHarga[];
};
/** Kolom unit yang dapat disaring, dalam urutan tampilnya. */
const SARING = ["alamat", "phase", "view", "subTipe"] as const;
type Saring = (typeof SARING)[number];
const SARING_KOSONG = { alamat: "", phase: "", view: "", subTipe: "" };

type Ringkas = {
  id: string; nama: string; nama_berkas: string | null; jumlah_unit: number;
  jumlah_skema: number; aktif: boolean; diunggah_oleh: string | null;
  diunggah_pada: string; ada_berkas: boolean;
  /** Terakhir diberlakukan; null bila belum pernah. */
  diberlakukan_pada?: string | null;
  /** "susun": dari layar Pricelist; "unggah": berkas Excel. */
  sumber?: "susun" | "unggah";
};

const LABEL_SARING = {
  alamat: "fAlamat", phase: "fPhase", view: "fView", subTipe: "fSub",
} as const;

export function PanelPricelist({ sesi, versi, onBerubah, onEdit, onAmbilTnc }: {
  sesi: Sesi;
  /** Dinaikkan induknya bila ada unggahan baru, supaya dibaca ulang. */
  versi: number;
  /** Dipanggil sesudah pricelist lain diberlakukan atau dihapus. */
  onBerubah?: () => void;
  /** Bila ada (halaman Pricelist): buka pricelist tersimpan untuk diedit. */
  onEdit?: (id: string, nama: string) => void;
  /** Bila ada: ambil hanya Terms & Conditions pricelist tersimpan ke draf. */
  onAmbilTnc?: (id: string, nama: string) => void;
}) {
  const k = useKata(KATA);
  const { bahasa } = useBahasa();

  const [berlaku, setBerlaku] = useState<Berlaku | null>(null);
  const [riwayat, setRiwayat] = useState<Ringkas[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [namaId, setNamaId] = useState<string | null>(null);
  const [namaBaru, setNamaBaru] = useState("");
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Record<Saring, string>>(SARING_KOSONG);
  const [pajak, setPajak] = useState(false);
  const [pindah, setPindah] = useState(false);
  const [riwayatPl, setRiwayatPl] = useState<Map<string, Baris[]>>(new Map());
  const adaEdit = !!onEdit;

  // Pilihan tiap saringan diambil dari isi pricelist-nya sendiri; saringan
  // yang kolomnya tidak ada di berkas tidak ditampilkan.
  const pilihan = useMemo(() => {
    const unit = berlaku?.unit ?? [];
    const ambil = (f: Saring) => [...new Set(unit.map((u) => String(u[f] ?? "").trim())
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
    return Object.fromEntries(SARING.map((f) => [f, ambil(f)])) as Record<Saring, string[]>;
  }, [berlaku]);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (berlaku?.unit ?? []).filter((u) =>
      SARING.every((f) => !saring[f] || String(u[f] ?? "").trim() === saring[f]) &&
      (!q || [u.kode, u.alamat, u.ukuran, u.view, u.subTipe]
        .some((v) => v && String(v).toLowerCase().includes(q))));
  }, [berlaku, cari, saring]);
  const [bukaTabel, setBukaTabel] = useState(false);

  const muat = useCallback(async () => {
    const res = await fetch("/api/pricelist");
    const b = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = "/login"; return; }
    if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    setBerlaku(b.berlaku ?? null);
    setRiwayat(b.riwayat ?? []);
    // Layar Pricelist: riwayat perubahan dibagi ke tiap pricelist tersimpan.
    if (adaEdit) {
      const rs = await fetch("/api/pricelist/susun/riwayat");
      const br = await rs.json().catch(() => ({}));
      if (rs.ok) setRiwayatPl(bagiRiwayat(br.riwayat ?? [], b.riwayat ?? []).perPl);
    }
  }, [adaEdit]);

  // `versi` naik setiap kali layar induknya menyimpan unggahan baru.
  useEffect(() => { void muat(); }, [muat, versi]);

  const ubah = async (id: string, metode: "POST" | "DELETE") => {
    setGalat(null);
    const res = await fetch(`/api/pricelist/${id}`, { method: metode });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`);
    setHapusId(null);
    await muat();
    onBerubah?.();
  };

  /**
   * Berpindah sumber angka: Otomatis (layar Pricelist) atau Manual (berkas
   * unggahan). Yang berpindah hanya penunjuknya — pricelist terbaru dari
   * sumber itu diberlakukan kembali, dan tidak ada angka yang dihitung ulang.
   */
  const pilihSumber = async (sumber: "susun" | "unggah") => {
    setGalat(null); setPindah(true);
    const res = await fetch("/api/pricelist/sumber", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sumber }),
    });
    const b = await res.json().catch(() => ({}));
    setPindah(false);
    if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    await muat();
    onBerubah?.();
  };

  const gantiNama = async (id: string) => {
    setGalat(null);
    const res = await fetch(`/api/pricelist/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ nama: namaBaru }),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    setNamaId(null);
    await muat();
    onBerubah?.();
  };
  const mulaiGanti = (r: { id: string; nama: string }) => { setNamaId(r.id); setNamaBaru(r.nama); };
  /** Kotak nama yang sedang diganti, atau null bila baris ini tidak sedang diganti. */
  const kotakNama = (id: string) => namaId !== id ? null : (
    <span className="row" style={{ margin: 0, flexWrap: "nowrap" }}>
      <input id={`pl-nama-${id}`} value={namaBaru} maxLength={120} autoFocus style={{ width: 260 }}
             onChange={(e) => setNamaBaru(e.target.value)}
             onKeyDown={(e) => {
               if (e.key === "Enter") void gantiNama(id);
               if (e.key === "Escape") setNamaId(null);
             }} />
      <button className="pri" disabled={!namaBaru.trim()} onClick={() => void gantiNama(id)}>
        {k.simpanNama}</button>
      <button onClick={() => setNamaId(null)}>{k.batal}</button>
    </span>
  );

  const bolehUbah = PENGUNGGAH.includes(sesi.role);
  const tgl = (s: string) => new Date(s).toLocaleString(
    bahasa === "id" ? "id-ID" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const aktif = riwayat.find((r) => r.aktif);
  const unduh = (id: string) => { location.href = `/api/pricelist/${id}`; };
  /** Ada tidaknya pricelist dari tiap sumber; tombol tanpa isi dimatikan. */
  const ada = (s: "susun" | "unggah") =>
    riwayat.some((r) => (r.sumber ?? "unggah") === s);
  const sumberAktif = aktif ? (aktif.sumber ?? "unggah") : null;
  const tombolSumber = (s: "susun" | "unggah", label: string, info: string) => (
    <button className={sumberAktif === s ? "pri" : undefined}
            aria-pressed={sumberAktif === s}
            disabled={pindah || !ada(s) || sumberAktif === s}
            title={ada(s) ? info : (s === "susun" ? k.sKosongSusun : k.sKosongUnggah)}
            onClick={() => void pilihSumber(s)}>
      {pindah ? k.sBerpindah : label}
    </button>
  );

  /** Tombol tiap pricelist tersimpan: edit, ambil T&C, berlakukan, hapus. */
  const aksiBaris = (r: Ringkas) => (
    <span className="row" style={{ margin: 0, flexWrap: "nowrap", justifyContent: "flex-end" }}>
      {bolehUbah && onEdit && r.ada_berkas && (
        <button onClick={() => onEdit(r.id, r.nama)}>{k.edit}</button>)}
      {bolehUbah && onAmbilTnc && r.ada_berkas && (
        <button title={k.ambilTncInfo} onClick={() => onAmbilTnc(r.id, r.nama)}>{k.ambilTnc}</button>)}
      {r.aktif ? (
        <span className="pill ok">{k.sBerlaku}</span>
      ) : !bolehUbah ? null : hapusId === r.id ? (
        <span className="row" style={{ margin: 0, flexWrap: "nowrap" }}>
          {k.yakinHapus}
          <button onClick={() => void ubah(r.id, "DELETE")}>{k.ya}</button>
          <button onClick={() => setHapusId(null)}>{k.batal}</button>
        </span>
      ) : (
        <span className="row" style={{ margin: 0, flexWrap: "nowrap" }}>
          <button onClick={() => void ubah(r.id, "POST")}>
            {k.berlakukan}
          </button>
          <button onClick={() => setHapusId(r.id)}>{k.hapus}</button>
        </span>
      )}
    </span>
  );

  const logImpor = (<>
    {/* Riwayat dilipat: yang dibuka sehari-hari hanya pricelist yang
        berlaku; riwayatnya dibuka bila hendak memberlakukan kembali
        atau menghapus unggahan lama. */}
    <details className={adaEdit ? "riwayat-pl judul-sama log-impor" : "riwayat-pl"}>
      <summary>{k.lihatRiwayat(riwayat.length)}</summary>
      {riwayat.length === 0 ? (
        <p className="hint" style={{ textAlign: "left" }}>{k.riwayatKosong}</p>
      ) : (
        <div className="tscroll">
          <table className="tabel-ringkas"><tbody>
            <tr>
              <th>{k.rNama}</th><th>{k.rBerkas}</th><th>{k.rUnit}</th>
              <th>{k.rSkema}</th><th>{k.rOleh}</th><th>{k.rPada}</th>
              <th>{k.rStatus}</th>
            </tr>
            {riwayat.map((r) => (
              <tr key={r.id} className={r.aktif ? "terpilih" : undefined}>
                <td>{kotakNama(r.id) ?? (
                  <span className="row" style={{ margin: 0, flexWrap: "nowrap" }}>
                    {r.nama}
                    {bolehUbah && (
                      <button className="kecil" onClick={() => mulaiGanti(r)}>{k.gantiNama}</button>)}
                  </span>)}</td>
                <td>
                  {r.ada_berkas
                    ? <button className="tautan" onClick={() => unduh(r.id)}
                              title={k.unduh}>{r.nama_berkas ?? r.nama}</button>
                    : (r.nama_berkas ?? "—")}
                </td>
                <td className="n">{r.jumlah_unit}</td>
                <td className="n">{r.jumlah_skema}</td>
                <td>{r.diunggah_oleh ?? "—"}</td>
                <td>{tgl(r.diunggah_pada)}</td>
                <td>
                  {aksiBaris(r)}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </details>
  </>);

  return (
    <>
    <div className="panel sp">
      {/* Judul pricelist yang berlaku dan Sumber angka hanya di layar
          Simulasi; di layar Pricelist yang berlaku ditandai di Master Pricelist. */}
      {!adaEdit && (<>
      <h2>
        {k.berlaku}
        {berlaku && <span className="pill ok">{berlaku.nama}</span>}
        {/* Sumber angka: dari layar Pricelist, atau dari berkas yang
            diunggah. Keduanya pricelist yang pernah diberlakukan — tombol ini
            menunjuk mana yang dipakai Simulasi, bukan menghitung ulang. */}
        {bolehUbah && (
          <span className="row" style={{ margin: 0, flexWrap: "nowrap" }}>
            <small className="hint" style={{ margin: 0 }}>{k.sumber}:</small>
            {tombolSumber("unggah", k.sManual, k.sManualInfo)}
            {tombolSumber("susun", k.sOtomatis, k.sOtomatisInfo)}
          </span>
        )}
      </h2>
      {bolehUbah && sumberAktif && (
        <p className="hint kiri" style={{ marginTop: 0 }}>
          {sumberAktif === "susun" ? k.sOtomatisInfo : k.sManualInfo}
        </p>
      )}
      </>)}
      {galat && <div className="banner stop">{galat}</div>}
      {/* Layar Pricelist: berkas yang berlaku sudah ada di folder Master
          Pricelist, jadi kartunya hanya di layar Simulasi. */}
      {!berlaku ? (
        <div className="banner info">{k.tidakAda}</div>
      ) : adaEdit ? null : (
        <>
          {/* Pricelist tampil sebagai berkas di dalam folder; tabelnya
              baru dibuka bila diminta. */}
          {aktif && kotakNama(aktif.id)}
          <div className="berkas-pl" hidden={!!aktif && namaId === aktif.id}>
            <button className="berkas-pl-nama" aria-expanded={bukaTabel}
                    onClick={() => setBukaTabel((x) => !x)}>
              <span className="berkas-pl-ikon" aria-hidden>{bukaTabel ? "📂" : "📁"}</span>
              <span>
                <b>{aktif?.nama_berkas ?? berlaku.nama}</b>
                <small>{k.ringkas(berlaku.unit.length, berlaku.skema.length)}
                  {aktif && ` · ${aktif.diunggah_oleh ?? "—"} · ${tgl(aktif.diunggah_pada)}`}</small>
              </span>
            </button>
            <span className="row" style={{ margin: 0 }}>
              <button onClick={() => setBukaTabel((x) => !x)}>
                {bukaTabel ? k.tutup : k.buka}</button>
              {bolehUbah && aktif && (
                <button onClick={() => mulaiGanti(aktif)}>{k.gantiNama}</button>)}
              {bolehUbah && onAmbilTnc && aktif?.ada_berkas && (
                <button title={k.ambilTncInfo} onClick={() => onAmbilTnc(aktif.id, aktif.nama)}>{k.ambilTnc}</button>)}
              <button className="pri" disabled={!aktif?.ada_berkas}
                      title={aktif?.ada_berkas ? undefined : k.takAdaBerkas}
                      onClick={() => aktif && unduh(aktif.id)}>{k.unduh}</button>
            </span>
          </div>
          {bukaTabel && (<>
          <div className="filters rapat">
            <div>
              <div className="lbl">{k.fCari}</div>
              <input id="pl-cari" type="search" value={cari}
                     placeholder={k.fCariContoh}
                     onChange={(e) => setCari(e.target.value)} />
            </div>
            {SARING.filter((f) => pilihan[f].length > 1).map((f) => (
              <div key={f}>
                <div className="lbl">{k[LABEL_SARING[f]]}</div>
                <select id={`pl-${f}`} value={saring[f]}
                        onChange={(e) => setSaring({ ...saring, [f]: e.target.value })}>
                  <option value="">{k.semua}</option>
                  {pilihan[f].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="row" style={{ alignItems: "center", margin: "10px 0" }}>
            {berlaku.unit.some((u) => u.pajak) && (
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input id="pl-pajak" type="checkbox" checked={pajak}
                       onChange={(e) => setPajak(e.target.checked)} />
                {k.pajak}
              </label>
            )}
            <span className="hint" style={{ margin: 0 }}>
              {k.tersaring(tersaring.length, berlaku.unit.length)}
            </span>
            {(cari || SARING.some((f) => saring[f])) && (
              <button onClick={() => { setCari(""); setSaring(SARING_KOSONG); }}>
                {k.reset}
              </button>
            )}
          </div>
          {tersaring.length ? (
            <TabelHarga skema={berlaku.skema} unit={tersaring}
                        pajak={pajak} tinggi={640} />
          ) : (
            <div className="banner info">{k.kosongSaring}</div>
          )}
          </>)}
        </>
      )}

      {/* Folder pricelist tersimpan (layar Pricelist): semua pricelist yang
          disimpan dengan nama dari layar ini, masing-masing sebagai berkas. */}
      {onEdit && (() => {
        // Semua pricelist tersimpan (bukan draf), dari layar ini maupun unggahan.
        const tersimpan = riwayat;
        return (
          <details className="riwayat-pl folder-pl" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <summary><span aria-hidden>📁</span> {k.folderSimpan(tersimpan.length)}</summary>
            <p className="hint kiri" style={{ marginTop: 0 }}>
              {tersimpan.length ? k.folderSimpanInfo : k.folderKosong}</p>
            {tersimpan.map((r) => (
              <div key={r.id}>
                {kotakNama(r.id) ?? (
                  <div className={`berkas-pl${r.aktif ? " berlaku" : ""}`}>
                    <button className="berkas-pl-nama"
                            title={r.ada_berkas ? k.unduh : k.takAdaBerkas}
                            onClick={() => r.ada_berkas && unduh(r.id)}>
                      <span className="berkas-pl-ikon" aria-hidden>📄</span>
                      <span>
                        <b>{r.nama}</b>
                        <small>{k.ringkas(r.jumlah_unit, r.jumlah_skema)}
                          {` · ${r.diunggah_oleh ?? "—"} · ${tgl(r.diunggah_pada)}`}</small>
                        {/* Tanggal terakhir diberlakukan (tercatat sejak fitur ini ada). */}
                        {r.diberlakukan_pada && (
                          <small className={r.aktif ? "tgl-berlaku aktif" : "tgl-berlaku"}>
                            {k.tglBerlaku(tgl(r.diberlakukan_pada))}</small>)}
                      </span>
                    </button>
                    <span className="row" style={{ margin: 0 }}>
                      {bolehUbah && <button onClick={() => mulaiGanti(r)}>{k.gantiNama}</button>}
                      {aksiBaris(r)}
                      <button className="pri" disabled={!r.ada_berkas}
                              onClick={() => unduh(r.id)}>{k.unduh}</button>
                    </span>
                    {/* Riwayat perubahan pricelist ini, dibuka bila diklik. */}
                    {!!riwayatPl.get(r.id)?.length && (
                      <details className="riwayat-berkas">
                        <summary>{k.riwayatPl(riwayatPl.get(r.id)!.length)}</summary>
                        <TabelRiwayat riwayat={riwayatPl.get(r.id)!} tinggi={360} />
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </details>
        );
      })()}

      {!adaEdit && logImpor}
    </div>
    {/* Layar Pricelist: Log Impor Data sebagai panel sendiri, berjarak dari
        Master Pricelist seperti Log Aktivitas Sistem. */}
    {adaEdit && <div className="panel sp">{logImpor}</div>}
    </>
  );
}

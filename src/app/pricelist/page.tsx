"use client";

/**
 * Pricelist — yang berlaku untuk project terpilih, beserta riwayat unggahannya.
 *
 * Tabelnya disusun seperti lembar Pricelist di Excel (No, Address, Unit No,
 * Phase, Ukuran, View, Tipe, Sub-Tipe, Area, lalu harga per cara bayar
 * beserta DPP dan Nilai Free PPN DTP-nya), dengan saringan unit di atasnya.
 *
 * Unggahannya sendiri dilakukan di layar Simulasi / NPV (panel Upload
 * Pricelist). Di sini pricelist yang berlaku dapat dibaca utuh, dan pricelist
 * lama dapat diberlakukan kembali atau dihapus.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { PENGUNGGAH, TabelHarga } from "../simulasi/unggah-pricelist";
import type { UnitHarga } from "@/lib/simulasi";

const KATA = {
  id: {
    judul: "Pricelist",
    berlaku: "Pricelist yang berlaku",
    tidakAda: "Project ini belum punya pricelist. Unggah berkasnya di layar ",
    ringkas: (u: number, s: number) => `${u} unit · ${s} cara bayar`,
    keSimulasi: "Simulasi / NPV",
    unggahDi: "Pricelist baru diunggah di layar ",
    riwayat: "Riwayat unggahan",
    riwayatKosong: "Belum ada unggahan untuk project ini.",
    rNama: "Nama", rBerkas: "Berkas", rUnit: "Unit", rSkema: "Cara bayar",
    rOleh: "Diunggah oleh", rPada: "Tanggal", rStatus: "Status",
    sBerlaku: "Berlaku",
    berlakukan: "Berlakukan", hapus: "Hapus",
    yakinHapus: "Hapus pricelist ini?", ya: "Ya, hapus", batal: "Batal",
    pilihProject: "Pilih project lebih dulu.",
    fCari: "Cari unit", fCariContoh: "mis. NR1-05 atau 8,5x10",
    fAlamat: "Address", fPhase: "Phase", fView: "View", fSub: "Sub-Tipe",
    semua: "Semua", pajak: "Tampilkan DPP & Nilai Free PPN DTP",
    reset: "Reset saringan",
    tersaring: (n: number, t: number) => `${n} dari ${t} unit tampil`,
    kosongSaring: "Tidak ada unit yang cocok dengan saringan.",
  },
  en: {
    judul: "Price List",
    berlaku: "Price list in force",
    tidakAda: "This project has no price list yet. Upload it on the screen ",
    ringkas: (u: number, s: number) => `${u} units · ${s} payment schemes`,
    keSimulasi: "Simulation / NPV",
    unggahDi: "New price lists are uploaded on the screen ",
    riwayat: "Upload history",
    riwayatKosong: "No uploads for this project yet.",
    rNama: "Name", rBerkas: "File", rUnit: "Units", rSkema: "Schemes",
    rOleh: "Uploaded by", rPada: "Date", rStatus: "Status",
    sBerlaku: "In force",
    berlakukan: "Apply", hapus: "Delete",
    yakinHapus: "Delete this price list?", ya: "Yes, delete", batal: "Cancel",
    pilihProject: "Select a project first.",
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
  diunggah_pada: string;
};

const LABEL_SARING = {
  alamat: "fAlamat", phase: "fPhase", view: "fView", subTipe: "fSub",
} as const;

export default function PricelistPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();

  const [berlaku, setBerlaku] = useState<Berlaku | null>(null);
  const [riwayat, setRiwayat] = useState<Ringkas[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Record<Saring, string>>(SARING_KOSONG);
  const [pajak, setPajak] = useState(false);

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

  const muat = useCallback(async () => {
    const res = await fetch("/api/pricelist");
    const b = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = "/login"; return; }
    if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    setBerlaku(b.berlaku ?? null);
    setRiwayat(b.riwayat ?? []);
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  const ubah = async (id: string, metode: "POST" | "DELETE") => {
    setGalat(null);
    const res = await fetch(`/api/pricelist/${id}`, { method: metode });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`);
    setHapusId(null);
    await muat();
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  const bolehUbah = PENGUNGGAH.includes(sesi.role);
  const tgl = (s: string) => new Date(s).toLocaleString(
    bahasa === "id" ? "id-ID" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const keSimulasi = <a href="/simulasi">{k.keSimulasi}</a>;

  return (
    <Kerangka sesi={sesi} lebar judul={<div><h1>{k.judul}</h1></div>}>

      {galat && <div className="banner stop">{galat}</div>}
      {!sesi.project_slug && <div className="banner warn">{k.pilihProject}</div>}

      {sesi.project_slug && (
        <div className="panel sp">
          <h2>
            {k.berlaku}
            {berlaku && <span className="pill ok">{berlaku.nama}</span>}
          </h2>
          {!berlaku ? (
            <div className="banner info">{k.tidakAda}{keSimulasi}.</div>
          ) : (
            <>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                {k.ringkas(berlaku.unit.length, berlaku.skema.length)}
                {" · "}{k.unggahDi}{keSimulasi}.
              </p>
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
            </>
          )}
        </div>
      )}

      {sesi.project_slug && (
        <div className="panel">
          <h2>{k.riwayat}</h2>
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
                    <td>{r.nama}</td>
                    <td>{r.nama_berkas ?? "—"}</td>
                    <td className="n">{r.jumlah_unit}</td>
                    <td className="n">{r.jumlah_skema}</td>
                    <td>{r.diunggah_oleh ?? "—"}</td>
                    <td>{tgl(r.diunggah_pada)}</td>
                    <td>
                      {r.aktif ? (
                        <span className="pill ok">{k.sBerlaku}</span>
                      ) : !bolehUbah ? null : hapusId === r.id ? (
                        <span className="row" style={{ margin: 0 }}>
                          {k.yakinHapus}
                          <button onClick={() => void ubah(r.id, "DELETE")}>{k.ya}</button>
                          <button onClick={() => setHapusId(null)}>{k.batal}</button>
                        </span>
                      ) : (
                        <span className="row" style={{ margin: 0 }}>
                          <button onClick={() => void ubah(r.id, "POST")}>
                            {k.berlakukan}
                          </button>
                          <button onClick={() => setHapusId(r.id)}>{k.hapus}</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </div>
      )}
    </Kerangka>
  );
}

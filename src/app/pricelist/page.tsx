"use client";

/**
 * Pricelist — unggah, periksa, dan berlakukan pricelist tiap project.
 *
 * Bentuk berkasnya sama dengan lembar pricelist pada "Simulation TOP": Unit
 * No, Address, Tipe, Area (Land, Build), lalu satu kolom harga per cara bayar.
 * Berkasnya selalu dibaca lebih dulu tanpa menulis apa pun (pratinjau), dan
 * baru disimpan sesudah orang melihat hasil pemeriksaannya — pricelist yang
 * keliru langsung terbawa ke setiap simulasi yang dicetak untuk konsumen.
 *
 * Pricelist melekat pada project yang sedang dipilih. Layar Simulasi / NPV
 * membaca pricelist yang berlaku untuk project yang sama.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { PilihBerkas } from "../pilih-berkas";
import { useSesi } from "../session";
import { formatRupiah } from "@/lib/money";
import type { UnitHarga } from "@/lib/simulasi";

const KATA = {
  id: {
    judul: "Pricelist",
    berlaku: "Pricelist yang berlaku",
    tidakAda: "Project ini belum punya pricelist. Unggah berkasnya di bawah; " +
              "layar Simulasi / NPV memakainya begitu tersimpan.",
    bawaan: "Pricelist bawaan (dari berkas Simulation TOP). Unggahan pertama " +
            "akan menggantikannya.",
    ringkas: (u: number, s: number) => `${u} unit · ${s} cara bayar`,
    kUnit: "Unit No", kAlamat: "Address", kTipe: "Tipe", kLt: "Land", kLb: "Build",
    unggah: "Unggah pricelist",
    unggahCatatan: "Berkas .xlsx dengan bentuk yang sama seperti lembar " +
      "pricelist Simulation TOP. Baris judul dicari otomatis (baris yang " +
      "memuat \"Unit No\"); kolom di kanan Build dibaca sebagai cara bayar.",
    template: "Unduh template .xlsx",
    fNama: "Nama pricelist",
    fNamaContoh: "mis. Pricelist Oktober 2026",
    fLembar: "Lembar",
    pratinjau: "Periksa berkas",
    membaca: "Membaca…",
    simpan: "Simpan & berlakukan",
    menyimpan: "Menyimpan…",
    galatJudul: "Belum dapat disimpan",
    peringatanJudul: "Perlu dilihat",
    lolos: "Berkas lolos pemeriksaan",
    pratinjauInfo: (u: number, s: number, b: number, l: string) =>
      `${u} unit dan ${s} cara bayar terbaca dari lembar "${l}", baris judul ke-${b}. ` +
      "Belum ada yang tersimpan.",
    caraBayar: "Cara bayar terbaca", jadwal: "Bentuk jadwal",
    sisanya: (n: number) => `… dan ${n} unit lainnya`,
    tersimpan: (n: string) => `Pricelist "${n}" tersimpan dan berlaku.`,
    gagal: "Gagal",
    riwayat: "Riwayat unggahan",
    riwayatKosong: "Belum ada unggahan untuk project ini.",
    rNama: "Nama", rBerkas: "Berkas", rUnit: "Unit", rSkema: "Cara bayar",
    rOleh: "Diunggah oleh", rPada: "Tanggal", rStatus: "Status",
    sBerlaku: "Berlaku",
    berlakukan: "Berlakukan", hapus: "Hapus",
    yakinHapus: "Hapus pricelist ini?", ya: "Ya, hapus", batal: "Batal",
    hanyaBaca: "Unggahan pricelist dilakukan Admin Sales atau Admin IT.",
    pilihProject: "Pilih project lebih dulu.",
  },
  en: {
    judul: "Price List",
    berlaku: "Price list in force",
    tidakAda: "This project has no price list yet. Upload it below; the " +
              "Simulation / NPV screen uses it as soon as it is saved.",
    bawaan: "Built-in price list (from the Simulation TOP file). The first " +
            "upload replaces it.",
    ringkas: (u: number, s: number) => `${u} units · ${s} payment schemes`,
    kUnit: "Unit No", kAlamat: "Address", kTipe: "Type", kLt: "Land", kLb: "Build",
    unggah: "Upload price list",
    unggahCatatan: "An .xlsx file shaped like the Simulation TOP price list " +
      "sheet. The header row is found automatically (the row containing " +
      "\"Unit No\"); columns right of Build are read as payment schemes.",
    template: "Download .xlsx template",
    fNama: "Price list name",
    fNamaContoh: "e.g. Price list October 2026",
    fLembar: "Sheet",
    pratinjau: "Check file",
    membaca: "Reading…",
    simpan: "Save & apply",
    menyimpan: "Saving…",
    galatJudul: "Cannot be saved yet",
    peringatanJudul: "Worth a look",
    lolos: "File passed the checks",
    pratinjauInfo: (u: number, s: number, b: number, l: string) =>
      `${u} units and ${s} payment schemes read from sheet "${l}", header row ${b}. ` +
      "Nothing has been saved yet.",
    caraBayar: "Payment scheme", jadwal: "Schedule shape",
    sisanya: (n: number) => `… and ${n} more units`,
    tersimpan: (n: string) => `Price list "${n}" saved and in force.`,
    gagal: "Failed",
    riwayat: "Upload history",
    riwayatKosong: "No uploads for this project yet.",
    rNama: "Name", rBerkas: "File", rUnit: "Units", rSkema: "Schemes",
    rOleh: "Uploaded by", rPada: "Date", rStatus: "Status",
    sBerlaku: "In force",
    berlakukan: "Apply", hapus: "Delete",
    yakinHapus: "Delete this price list?", ya: "Yes, delete", batal: "Cancel",
    hanyaBaca: "Price lists are uploaded by Admin Sales or Admin IT.",
    pilihProject: "Select a project first.",
  },
};

type Berlaku = {
  id: string | null; nama: string; sumber: "unggahan" | "bawaan";
  skema: string[]; unit: UnitHarga[];
};
type Ringkas = {
  id: string; nama: string; nama_berkas: string | null; jumlah_unit: number;
  jumlah_skema: number; aktif: boolean; diunggah_oleh: string | null;
  diunggah_pada: string;
};
type Pratinjau = {
  nama: string; lembar: string; daftarLembar: string[]; barisJudul: number;
  skema: { nama: string; uraian: string }[]; unit: UnitHarga[];
  galat: string[]; peringatan: string[];
};

const PENGUNGGAH = ["admin_sales", "admin_system"];

const luas = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

/** Tabel unit × cara bayar, dipakai untuk pricelist berlaku dan pratinjau. */
function TabelHarga({ skema, unit, batas, k }: {
  skema: string[]; unit: UnitHarga[]; batas?: number; k: typeof KATA.id;
}) {
  const tampil = batas ? unit.slice(0, batas) : unit;
  return (
    <div className="tscroll" style={{ maxHeight: 420, overflowY: "auto" }}>
      {/* Tanpa pindah baris: kode unit dan rupiah yang terpotong dua baris
          sulit dibaca berderet; tabelnya digulir ke samping saja. */}
      <table className="tabel-ringkas" style={{ whiteSpace: "nowrap" }}><tbody>
        <tr>
          <th>{k.kUnit}</th><th>{k.kAlamat}</th><th>{k.kTipe}</th>
          <th>{k.kLt}</th><th>{k.kLb}</th>
          {skema.map((s) => <th key={s}>{s}</th>)}
        </tr>
        {tampil.map((u) => (
          <tr key={u.kode}>
            <td>{u.kode}</td><td>{u.alamat}</td><td>{u.tipe}</td>
            <td className="n">{luas(u.lt)}</td><td className="n">{luas(u.lb)}</td>
            {skema.map((s) => (
              <td key={s} className="n">
                {u.harga[s] ? formatRupiah(u.harga[s]) : "—"}
              </td>
            ))}
          </tr>
        ))}
        {tampil.length < unit.length && (
          <tr><td colSpan={5 + skema.length} className="hint"
                  style={{ textAlign: "left" }}>
            {k.sisanya(unit.length - tampil.length)}
          </td></tr>
        )}
      </tbody></table>
    </div>
  );
}

export default function PricelistPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();

  const [berlaku, setBerlaku] = useState<Berlaku | null>(null);
  const [riwayat, setRiwayat] = useState<Ringkas[]>([]);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);

  const [berkas, setBerkas] = useState<File | null>(null);
  const [nama, setNama] = useState("");
  const [lembar, setLembar] = useState("");
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [selesai, setSelesai] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<string | null>(null);

  const muat = useCallback(async () => {
    const res = await fetch("/api/pricelist");
    const b = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = "/login"; return; }
    if (!res.ok) { setGalatMuat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    setGalatMuat(null);
    setBerlaku(b.berlaku ?? null);
    setRiwayat(b.riwayat ?? []);
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  const kirim = async (dryRun: boolean, lembarPilih = lembar) => {
    if (!berkas) return;
    setSibuk(true); setGalat(null); setSelesai(null);
    try {
      const fd = new FormData();
      fd.append("file", berkas);
      fd.append("nama", nama);
      if (lembarPilih) fd.append("lembar", lembarPilih);
      const res = await fetch(`/api/pricelist?dry_run=${dryRun}`,
                              { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      if (dryRun) {
        setPratinjau(b);
        setLembar(b.lembar);
        if (!nama) setNama(b.nama);
      } else {
        setSelesai(k.tersimpan(b.nama));
        setPratinjau(null); setBerkas(null); setNama(""); setLembar("");
        await muat();
      }
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setSibuk(false);
    }
  };

  const ubah = async (id: string, metode: "POST" | "DELETE") => {
    setGalat(null); setSelesai(null);
    const res = await fetch(`/api/pricelist/${id}`, { method: metode });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`);
    setHapusId(null);
    await muat();
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  const bolehUnggah = PENGUNGGAH.includes(sesi.role);
  const tgl = (s: string) => new Date(s).toLocaleString(
    bahasa === "id" ? "id-ID" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Kerangka sesi={sesi} lebar
              judul={<div><h1>{k.judul}</h1></div>}>

      {galatMuat && <div className="banner stop">{galatMuat}</div>}
      {!sesi.project_slug && !galatMuat && (
        <div className="banner warn">{k.pilihProject}</div>
      )}

      {/* ── Yang berlaku ── */}
      {!galatMuat && sesi.project_slug && (
        <div className="panel sp">
          <h2>
            {k.berlaku}
            {berlaku && <span className="pill ok">{berlaku.nama}</span>}
          </h2>
          {!berlaku ? (
            <div className="banner info">{k.tidakAda}</div>
          ) : (
            <>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                {k.ringkas(berlaku.unit.length, berlaku.skema.length)}
                {berlaku.sumber === "bawaan" && <> · {k.bawaan}</>}
              </p>
              <TabelHarga skema={berlaku.skema} unit={berlaku.unit} k={k} />
            </>
          )}
        </div>
      )}

      {/* ── Unggah ── */}
      {sesi.project_slug && (
        <div className="panel sp">
          <div className="form-blok">
            <h3>{k.unggah}</h3>
            <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
              {k.unggahCatatan}{" "}
              <a href="/api/pricelist/template">{k.template}</a>
            </p>
            {!bolehUnggah ? (
              <div className="banner info">{k.hanyaBaca}</div>
            ) : (
              <>
                <div className="filters">
                  <div>
                    <div className="lbl">.xlsx</div>
                    <PilihBerkas accept=".xlsx"
                                 onChange={(e) => {
                                   setBerkas(e.target.files?.[0] ?? null);
                                   setPratinjau(null); setLembar("");
                                   setGalat(null); setSelesai(null);
                                 }} />
                  </div>
                  <div>
                    <div className="lbl">{k.fNama}</div>
                    <input value={nama} maxLength={120}
                           placeholder={k.fNamaContoh}
                           onChange={(e) => setNama(e.target.value)} />
                  </div>
                  {pratinjau && pratinjau.daftarLembar.length > 1 && (
                    <div>
                      <div className="lbl">{k.fLembar}</div>
                      <select value={lembar}
                              onChange={(e) => {
                                setLembar(e.target.value);
                                void kirim(true, e.target.value);
                              }}>
                        {pratinjau.daftarLembar.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                  <button disabled={!berkas || sibuk}
                          onClick={() => void kirim(true)}>
                    {sibuk && !pratinjau ? k.membaca : k.pratinjau}
                  </button>
                  <button className="pri"
                          disabled={!pratinjau || pratinjau.galat.length > 0 || sibuk}
                          onClick={() => void kirim(false)}>
                    {sibuk && pratinjau ? k.menyimpan : k.simpan}
                  </button>
                </div>
              </>
            )}
          </div>

          {galat && <div className="banner stop"><b>{k.gagal}</b>{galat}</div>}
          {selesai && <div className="banner ok">{selesai}</div>}

          {pratinjau && (
            <>
              {pratinjau.galat.length > 0 ? (
                <div className="banner stop">
                  <b>{k.galatJudul}</b>
                  <ul style={{ margin: "4px 0 0 16px" }}>
                    {pratinjau.galat.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                </div>
              ) : (
                <div className="banner ok">
                  <b>{k.lolos}</b>
                  {k.pratinjauInfo(pratinjau.unit.length, pratinjau.skema.length,
                                   pratinjau.barisJudul, pratinjau.lembar)}
                </div>
              )}
              {pratinjau.peringatan.length > 0 && (
                <div className="banner warn">
                  <b>{k.peringatanJudul}</b>
                  <ul style={{ margin: "4px 0 0 16px" }}>
                    {pratinjau.peringatan.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                </div>
              )}
              {pratinjau.skema.length > 0 && (
                <div className="tscroll sp">
                  <table className="tabel-ringkas"><tbody>
                    <tr><th>{k.caraBayar}</th><th>{k.jadwal}</th></tr>
                    {pratinjau.skema.map((s) => (
                      <tr key={s.nama}><td>{s.nama}</td><td>{s.uraian}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              )}
              {pratinjau.unit.length > 0 && (
                <TabelHarga skema={pratinjau.skema.map((s) => s.nama)}
                            unit={pratinjau.unit} batas={50} k={k} />
              )}
            </>
          )}
        </div>
      )}

      {/* ── Riwayat ── */}
      {sesi.project_slug && !galatMuat && (
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
                      ) : !bolehUnggah ? null : hapusId === r.id ? (
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

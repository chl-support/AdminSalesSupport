"use client";

/**
 * Panel Tarif PPN DTP di layar Simulasi / NPV: periode, tarif, dan pagu PPN
 * yang ditanggung pemerintah. Tersembunyi secara bawaan — dibuka bila perlu
 * dilihat atau diubah. Admin Sales dan Admin IT dapat mengubah, menambah, dan
 * menghapus periode; perubahan berlaku untuk seluruh project.
 */

import { useState } from "react";

import { useKata } from "../bahasa";
import type { TarifDtp } from "@/lib/simulasi";
import { tglPendek, tanggalIso } from "./lembar-cetak";

const KATA = {
  id: {
    judul: "Tarif PPN DTP", tampil: "Tampilkan", sembunyi: "Sembunyikan",
    ubah: "Ubah", tambah: "Tambah Baris", hapus: "Hapus", simpan: "Simpan",
    menyimpan: "Menyimpan…", batal: "Batal", tersimpan: "Tarif PPN DTP tersimpan.",
    kPeriode: "Periode", kAwal: "Awal", kAkhir: "Akhir", kTarif: "Tarif (%)",
    kHarga: "Harga Jual Max", kMax: "Max PPN DTP", kPeraturan: "Dasar Peraturan",
    kosong: "Belum ada periode PPN DTP. Tanpa periode, tidak ada PPN yang ditanggung.",
    catatan: "Tarif dipilih menurut tanggal jatuh tempo terakhir jadwal. Di luar " +
      "semua periode tidak ada PPN DTP. Berlaku untuk seluruh project.",
    baru: "Tahap Baru",
  },
  en: {
    judul: "VAT Relief (PPN DTP) Rates", tampil: "Show", sembunyi: "Hide",
    ubah: "Edit", tambah: "Add Row", hapus: "Delete", simpan: "Save",
    menyimpan: "Saving…", batal: "Cancel", tersimpan: "VAT relief rates saved.",
    kPeriode: "Period", kAwal: "Start", kAkhir: "End", kTarif: "Rate (%)",
    kHarga: "Max Selling Price", kMax: "Max VAT Relief", kPeraturan: "Regulation",
    kosong: "No VAT relief periods. Without one, no VAT is borne by the government.",
    catatan: "The rate is chosen by the schedule's final due date. Outside every " +
      "period there is no relief. Applies to every project.",
    baru: "New Phase",
  },
};

/** Baris yang sedang disunting: angka sebagai teks agar dapat diketik bebas. */
type Baris = {
  nama: string; awal: string; akhir: string; tarif: string;
  hargaJualMax: string; maxDtp: string; peraturan: string;
};

const ribuan = (n: number) => Math.round(n).toLocaleString("id-ID");
const rapikan = (s: string) => {
  const bulat = s.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  return bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};
const bacaAngka = (s: string) =>
  Number(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;

export function PanelTarifDtp({ tarif, bolehUbah, onTersimpan }: {
  tarif: TarifDtp[]; bolehUbah: boolean; onTersimpan: (t: TarifDtp[]) => void;
}) {
  const k = useKata(KATA);
  const [buka, setBuka] = useState(false);
  const [ubah, setUbah] = useState<Baris[] | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  const mulai = () => {
    setPesan(null);
    setUbah(tarif.map((t) => ({
      nama: t.nama, awal: t.awal, akhir: t.akhir,
      tarif: String(+(t.tarif * 100).toFixed(4)).replace(".", ","),
      hargaJualMax: ribuan(t.hargaJualMax), maxDtp: ribuan(t.maxDtp),
      peraturan: t.peraturan ?? "",
    })));
  };
  const ganti = (i: number, p: Partial<Baris>) =>
    setUbah((u) => u && u.map((b, j) => j === i ? { ...b, ...p } : b));

  const simpan = async () => {
    if (!ubah) return;
    setSibuk(true); setPesan(null);
    try {
      const res = await fetch("/api/tarif-dtp", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tarif: ubah.map((b) => ({
          nama: b.nama, awal: b.awal, akhir: b.akhir,
          tarif: bacaAngka(b.tarif) / 100,
          hargaJualMax: bacaAngka(b.hargaJualMax), maxDtp: bacaAngka(b.maxDtp),
          peraturan: b.peraturan,
        })) }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPesan({ ok: false, teks: b.detail ?? b.title ?? `HTTP ${res.status}` });
        return;
      }
      onTersimpan(b.tarif ?? []);
      setUbah(null);
      setPesan({ ok: true, teks: k.tersimpan });
    } catch (e: any) {
      setPesan({ ok: false, teks: String(e?.message ?? e) });
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="panel sp">
      <h2>
        {k.judul}
        <span className="row" style={{ margin: 0 }}>
          {buka && bolehUbah && !ubah && <button onClick={mulai}>{k.ubah}</button>}
          <button onClick={() => { setBuka((x) => !x); setUbah(null); setPesan(null); }}>
            {buka ? k.sembunyi : k.tampil}
          </button>
        </span>
      </h2>
      {buka && (
        <>
          {pesan && <div className={`banner ${pesan.ok ? "ok" : "stop"}`}>{pesan.teks}</div>}
          <div className="tscroll">
            <table className="tabel-jadwal tarif-dtp"><tbody>
              <tr>
                <th>{k.kPeriode}</th><th>{k.kAwal}</th><th>{k.kAkhir}</th>
                <th>{k.kTarif}</th><th>{k.kHarga}</th><th>{k.kMax}</th>
                <th>{k.kPeraturan}</th>{ubah && <th />}
              </tr>
              {!ubah && tarif.length === 0 && (
                <tr><td colSpan={7} className="hint" style={{ textAlign: "left" }}>
                  {k.kosong}</td></tr>
              )}
              {!ubah && tarif.map((t, i) => (
                <tr key={i}>
                  <td>{t.nama}</td>
                  <td>{tglPendek(tanggalIso(t.awal, new Date()))}</td>
                  <td>{tglPendek(tanggalIso(t.akhir, new Date()))}</td>
                  <td className="n">{(t.tarif * 100).toLocaleString("id-ID")}%</td>
                  <td className="n">{ribuan(t.hargaJualMax)}</td>
                  <td className="n">{ribuan(t.maxDtp)}</td>
                  <td>{t.peraturan || "—"}</td>
                </tr>
              ))}
              {ubah && ubah.map((b, i) => (
                <tr key={i}>
                  <td><input value={b.nama} onChange={(e) => ganti(i, { nama: e.target.value })} /></td>
                  <td><input type="date" value={b.awal}
                             onChange={(e) => ganti(i, { awal: e.target.value })} /></td>
                  <td><input type="date" value={b.akhir}
                             onChange={(e) => ganti(i, { akhir: e.target.value })} /></td>
                  <td><input className="n" inputMode="decimal" value={b.tarif}
                             onChange={(e) => ganti(i, { tarif: e.target.value })} /></td>
                  <td><input className="n" inputMode="numeric" value={b.hargaJualMax}
                             onChange={(e) => ganti(i, { hargaJualMax: rapikan(e.target.value) })} /></td>
                  <td><input className="n" inputMode="numeric" value={b.maxDtp}
                             onChange={(e) => ganti(i, { maxDtp: rapikan(e.target.value) })} /></td>
                  <td><input value={b.peraturan}
                             onChange={(e) => ganti(i, { peraturan: e.target.value })} /></td>
                  <td><button onClick={() => setUbah((u) => u && u.filter((_, j) => j !== i))}>
                    {k.hapus}</button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
          {ubah && (
            <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
              <button onClick={() => setUbah((u) => {
                const akhir = u?.[u.length - 1];
                return [...(u ?? []), {
                  nama: k.baru, awal: "", akhir: "", tarif: "100",
                  hargaJualMax: akhir?.hargaJualMax ?? "5.550.000.000",
                  maxDtp: akhir?.maxDtp ?? "2.220.000.000", peraturan: "",
                }];
              })}>{k.tambah}</button>
              <button className="pri" disabled={sibuk} onClick={() => void simpan()}>
                {sibuk ? k.menyimpan : k.simpan}</button>
              <button onClick={() => { setUbah(null); setPesan(null); }}>{k.batal}</button>
            </div>
          )}
          <p className="hint" style={{ textAlign: "left" }}>{k.catatan}</p>
        </>
      )}
    </div>
  );
}

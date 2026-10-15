"use client";

/**
 * Pricelist — yang berlaku untuk project terpilih, beserta riwayat unggahannya.
 *
 * Unggahannya sendiri dilakukan di layar Simulasi / NPV (panel Upload
 * Pricelist). Di sini pricelist yang berlaku dapat dibaca utuh, dan pricelist
 * lama dapat diberlakukan kembali atau dihapus.
 */

import { useCallback, useEffect, useState } from "react";

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
  },
};

type Berlaku = {
  id: string; nama: string;
  skema: string[]; unit: UnitHarga[];
};
type Ringkas = {
  id: string; nama: string; nama_berkas: string | null; jumlah_unit: number;
  jumlah_skema: number; aktif: boolean; diunggah_oleh: string | null;
  diunggah_pada: string;
};

export default function PricelistPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();

  const [berlaku, setBerlaku] = useState<Berlaku | null>(null);
  const [riwayat, setRiwayat] = useState<Ringkas[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<string | null>(null);

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
              <TabelHarga skema={berlaku.skema} unit={berlaku.unit} />
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

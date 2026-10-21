"use client";

/**
 * Riwayat perubahan pricelist: siapa (username), kapan (tanggal & waktu),
 * dan apa yang diubah — dari setiap Simpan, Berlakukan, Ganti nama, dan
 * Hapus. Dilipat; dibuka bila hendak menelusuri perubahan.
 */

import { useEffect, useState } from "react";

import { useKata } from "../bahasa";

const KATA = {
  id: {
    tglWaktu: "Tanggal & waktu", user: "User", aksi: "Aksi", diubah: "Yang diubah",
    lihatSemua: (n: number) => `Lihat semua (${n})`,
    log: "Log Aktivitas Sistem",
    kosong: "Tidak ada perubahan yang belum masuk pricelist tersimpan. Riwayat tiap pricelist ada di folder Master Pricelist.",
  },
  en: {
    tglWaktu: "Date & time", user: "User", aksi: "Action", diubah: "Changes",
    lihatSemua: (n: number) => `Show all (${n})`,
    log: "System Activity Log",
    kosong: "No changes outside a saved price list. Each price list's history is in the Master Price List folder.",
  },
};

export type Baris = { id: string; oleh: string; pada: string; aksi: string; perubahan: string[] };

/** Pricelist tersimpan, sebatas yang dibutuhkan untuk membagi riwayat. */
type PlTersimpan = { id: string; diunggah_pada: string };

/**
 * Bagi riwayat ke pricelist tersimpan: setiap "Simpan sebagai" /
 * "Berlakukan" menutup perubahan sejak penyimpanan pricelist sebelumnya, dan
 * semuanya menjadi riwayat pricelist yang dibuat saat itu (yang tersimpan
 * paling dekat sebelum catatan itu). Sisanya — perubahan draf yang belum
 * disimpan sebagai pricelist, ganti nama, hapus — tetap di riwayat umum.
 */
export function bagiRiwayat(riwayat: Baris[], pricelist: PlTersimpan[]) {
  const perPl = new Map<string, Baris[]>();
  const terpakai = new Set<string>();
  const pl = pricelist.map((p) => ({ id: p.id, t: Date.parse(p.diunggah_pada) }));
  let tampung: Baris[] = [];
  for (const r of [...riwayat].sort((a, b) => Date.parse(a.pada) - Date.parse(b.pada))) {
    if (r.aksi === "Simpan") { tampung.push(r); continue; }
    if (r.aksi !== "Simpan sebagai" && r.aksi !== "Berlakukan") continue;
    const t = Date.parse(r.pada);
    const cocok = pl.filter((p) => p.t <= t + 1000 && t - p.t < 120_000)
      .sort((a, b) => b.t - a.t)[0];
    if (!cocok) continue;
    const isi = [...tampung, r];
    perPl.set(cocok.id, [...(perPl.get(cocok.id) ?? []), ...isi]);
    isi.forEach((x) => terpakai.add(x.id));
    tampung = [];
  }
  // Terbaru di atas, seperti riwayat umum.
  for (const [id, x] of perPl) perPl.set(id, x.reverse());
  return { perPl, terpakai };
}

const tglDetik = (s: string) => new Date(s).toLocaleString("id-ID",
  { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Tabel riwayat: tanggal & waktu, user, aksi, yang diubah. */
export function TabelRiwayat({ riwayat, tinggi = 480 }: { riwayat: Baris[]; tinggi?: number }) {
  const k = useKata(KATA);
  const [buka, setBuka] = useState<Set<string>>(new Set());
  return (
    <div className="tscroll riwayat-susun" style={{ maxHeight: tinggi, overflowY: "auto" }}>
      <table className="tabel-ringkas kepala-lekat"><thead>
        <tr><th>{k.tglWaktu}</th><th>{k.user}</th><th>{k.aksi}</th><th>{k.diubah}</th></tr>
      </thead><tbody>
        {riwayat.map((r) => {
          const semua = buka.has(r.id) || r.perubahan.length <= RINGKAS + 1;
          return (
            <tr key={r.id}>
              <td style={{ whiteSpace: "nowrap" }}>{tglDetik(r.pada)}</td>
              <td style={{ whiteSpace: "nowrap" }}><b>{r.oleh}</b></td>
              <td style={{ whiteSpace: "nowrap" }}><span className="pill">{r.aksi}</span></td>
              <td>
                <ul className="daftar-ubah">
                  {(semua ? r.perubahan : r.perubahan.slice(0, RINGKAS)).map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                {!semua && (
                  <button className="kecil" onClick={() => setBuka((s) => new Set(s).add(r.id))}>
                    {k.lihatSemua(r.perubahan.length)}</button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody></table>
    </div>
  );
}

/** Baris perubahan yang tampil sebelum "lihat semua" untuk satu catatan. */
const RINGKAS = 6;

/**
 * Riwayat umum: perubahan yang belum masuk ke pricelist tersimpan mana pun
 * (draf yang belum disimpan sebagai pricelist, ganti nama, hapus). Riwayat
 * tiap pricelist tersimpan ada di folder Pricelist tersimpan.
 */
export function RiwayatSusun({ versi }: { versi: number }) {
  const k = useKata(KATA);
  const [riwayat, setRiwayat] = useState<Baris[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    void (async () => {
      const [res, resPl] = await Promise.all([fetch("/api/pricelist/susun/riwayat"), fetch("/api/pricelist")]);
      const b = await res.json().catch(() => ({}));
      const bPl = await resPl.json().catch(() => ({}));
      if (batal) return;
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      const { terpakai } = bagiRiwayat(b.riwayat ?? [], bPl.riwayat ?? []);
      setGalat(null); setRiwayat((b.riwayat ?? []).filter((x: Baris) => !terpakai.has(x.id)));
    })();
    return () => { batal = true; };
  }, [versi]);

  return (
    <details className="panel sp riwayat-susun">
      <summary><b>{k.log}</b>{riwayat && <span className="hint" style={{ margin: 0 }}> ({riwayat.length})</span>}</summary>
      {galat && <div className="banner stop">{galat}</div>}
      {riwayat && riwayat.length === 0 && (
        <p className="hint kiri">{k.kosong}</p>
      )}
      {riwayat && riwayat.length > 0 && (
        <TabelRiwayat riwayat={riwayat} />
      )}
    </details>
  );
}

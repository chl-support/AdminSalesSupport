"use client";

/**
 * Riwayat perubahan pricelist: siapa (username), kapan (tanggal & waktu),
 * dan apa yang diubah — dari setiap Simpan, Berlakukan, Ganti nama, dan
 * Hapus. Dilipat; dibuka bila hendak menelusuri perubahan.
 */

import { useEffect, useState } from "react";

type Baris = { id: string; oleh: string; pada: string; aksi: string; perubahan: string[] };

/** Baris perubahan yang tampil sebelum "lihat semua" untuk satu catatan. */
const RINGKAS = 6;

export function RiwayatSusun({ versi }: { versi: number }) {
  const [riwayat, setRiwayat] = useState<Baris[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [buka, setBuka] = useState<Set<string>>(new Set());

  useEffect(() => {
    let batal = false;
    void (async () => {
      const res = await fetch("/api/pricelist/susun/riwayat");
      const b = await res.json().catch(() => ({}));
      if (batal) return;
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setGalat(null); setRiwayat(b.riwayat ?? []);
    })();
    return () => { batal = true; };
  }, [versi]);

  const tgl = (s: string) => new Date(s).toLocaleString("id-ID",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <details className="panel sp riwayat-susun">
      <summary><b>Riwayat perubahan</b>{riwayat && <span className="hint" style={{ margin: 0 }}> ({riwayat.length})</span>}</summary>
      {galat && <div className="banner stop">{galat}</div>}
      {riwayat && riwayat.length === 0 && (
        <p className="hint kiri">Belum ada perubahan yang tercatat. Setiap kali Simpan, perubahannya dicatat di sini.</p>
      )}
      {riwayat && riwayat.length > 0 && (
        <div className="tscroll" style={{ maxHeight: 480, overflowY: "auto" }}>
          <table className="tabel-ringkas kepala-lekat"><thead>
            <tr><th>Tanggal &amp; waktu</th><th>User</th><th>Aksi</th><th>Yang diubah</th></tr>
          </thead><tbody>
            {riwayat.map((r) => {
              const semua = buka.has(r.id) || r.perubahan.length <= RINGKAS + 1;
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{tgl(r.pada)}</td>
                  <td style={{ whiteSpace: "nowrap" }}><b>{r.oleh}</b></td>
                  <td style={{ whiteSpace: "nowrap" }}><span className="pill">{r.aksi}</span></td>
                  <td>
                    <ul className="daftar-ubah">
                      {(semua ? r.perubahan : r.perubahan.slice(0, RINGKAS)).map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                    {!semua && (
                      <button className="kecil" onClick={() => setBuka((s) => new Set(s).add(r.id))}>
                        Lihat semua ({r.perubahan.length})</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        </div>
      )}
    </details>
  );
}

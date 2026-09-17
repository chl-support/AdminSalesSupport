"use client";

/**
 * Report / Laporan — unduhan dan rekap.
 *
 * Tiga laporan yang sudah ada endpoint-nya dikumpulkan di satu tempat: Laporan
 * Master (Excel), rekap pembayaran per periode, dan rekonsiliasi bank.
 * Sebelumnya ketiganya hanya dapat dicapai dengan mengetikkan alamatnya, yang
 * berarti hanya orang yang pernah diberi tahu yang dapat memakainya.
 *
 * Tidak ada tombol yang menulis apa pun di layar ini. Laporan adalah cara
 * melihat data klaim; yang keliru diperbaiki pada klaimnya, bukan pada
 * laporannya — dan menyediakan jalan pintas untuk itu di sini akan membuat
 * angka pada laporan berbeda dari angka pada klaim yang menghasilkannya.
 */

import { useCallback, useEffect, useState } from "react";

import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const rp = (n?: number | null) => `Rp ${(Number(n) || 0).toLocaleString("id-ID")}`;

/** Awal dan akhir bulan berjalan, sebagai isian awal rekap. */
function bulanIni() {
  const t = new Date();
  const dua = (n: number) => String(n).padStart(2, "0");
  const awal = `${t.getFullYear()}-${dua(t.getMonth() + 1)}-01`;
  const akhir = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  const sampai = `${akhir.getFullYear()}-${dua(akhir.getMonth() + 1)}-` +
                 `${dua(akhir.getDate())}`;
  return { awal, sampai };
}

export default function LaporanPage() {
  const { sesi, memuat } = useSesi();
  const awalnya = bulanIni();

  const [dari, setDari] = useState(awalnya.awal);
  const [sampai, setSampai] = useState(awalnya.sampai);
  const [kelompok, setKelompok] = useState("claim_type");
  const [rekap, setRekap] = useState<any[] | null>(null);
  const [bank, setBank] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const ambilRekap = useCallback(async () => {
    setBusy(true); setGalat(null);
    try {
      const res = await fetch(
        `/api/reports/payment-recap?period_from=${dari}&period_to=${sampai}` +
        `&group_by=${kelompok}`);
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setRekap(Array.isArray(b) ? b : (b.rows ?? b.rekap ?? []));
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, [dari, sampai, kelompok]);

  const ambilBank = useCallback(async () => {
    setBusy(true); setGalat(null);
    try {
      const res = await fetch("/api/reports/bank-reconciliation?min_age_days=7");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setBank(Array.isArray(b) ? b : (b.rows ?? []));
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (sesi) void ambilRekap(); }, [sesi, ambilRekap]);

  if (memuat || !sesi) return <MemeriksaSesi />;

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>Report / Laporan</h1>
        <p>
          Unduhan dan rekap atas data klaim project
          {sesi.project_name ? ` ${sesi.project_name}` : ""}. Laporan hanya
          membaca — yang keliru diperbaiki pada klaimnya, bukan di sini.
        </p>
      </div>
    }>

      {galat && (
        <div className="banner stop"><b>Laporan tidak dapat dibaca</b>{galat}</div>
      )}

      <div className="panel sp">
        <div className="form-blok">
          <h3>LAPORAN MASTER</h3>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            Seluruh klaim beserta unit, penerima, perhitungan, dan statusnya
            dalam satu workbook Excel. Baris TOTAL-nya berformula, jadi angkanya
            ikut berubah bila Anda menyaring sendiri di Excel.
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            <a className="tombol-klaim" href="/api/reports/master-report">
              Unduh Laporan Master (.xlsx)
            </a>
          </div>
        </div>
      </div>

      <div className="panel sp">
        <div className="form-blok">
          <h3>REKAP PEMBAYARAN</h3>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            Dihitung memakai tanggal transfer, bukan tanggal klaim dibuat —
            yang dipertanggungjawabkan pada satu periode adalah uang yang
            benar-benar keluar pada periode itu.
          </p>

          <div className="filters">
            <div>
              <div className="lbl">Dari tanggal</div>
              <input type="date" value={dari}
                     onChange={(e) => setDari(e.target.value)} />
            </div>
            <div>
              <div className="lbl">Sampai tanggal</div>
              <input type="date" value={sampai}
                     onChange={(e) => setSampai(e.target.value)} />
            </div>
            <div>
              <div className="lbl">Dikelompokkan</div>
              <select value={kelompok}
                      onChange={(e) => setKelompok(e.target.value)}>
                <option value="claim_type">per jenis fee</option>
                <option value="recipient_role">per peran penerima</option>
                <option value="cluster">per cluster</option>
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="pri" disabled={busy}
                    onClick={() => void ambilRekap()}>
              {busy ? "Menghitung…" : "Tampilkan rekap"}
            </button>
          </div>
        </div>

        {rekap && (
          <div className="tscroll">
            <table><tbody>
              <tr>
                <th>Kelompok</th>
                <th style={{ textAlign: "right" }}>Klaim</th>
                <th style={{ textAlign: "right" }}>Bruto</th>
                <th style={{ textAlign: "right" }}>PPN</th>
                <th style={{ textAlign: "right" }}>PPh 23</th>
                <th style={{ textAlign: "right" }}>PPh 21</th>
                <th style={{ textAlign: "right" }}>Dibayarkan</th>
              </tr>
              {rekap.map((r: any, i: number) => (
                <tr key={`${r.k ?? r.key ?? i}`}>
                  <td><b>{r.k ?? r.key ?? "—"}</b></td>
                  <td className="n">{r.n ?? r.claim_count ?? 0}</td>
                  <td className="n">{rp(r.g ?? r.gross_amount)}</td>
                  <td className="n">{rp(r.v ?? r.vat)}</td>
                  <td className="n">{rp(r.p23 ?? r.pph23)}</td>
                  <td className="n">{rp(r.p21 ?? r.pph21)}</td>
                  <td className="n">{rp(r.net ?? r.net_amount)}</td>
                </tr>
              ))}
              {!rekap.length && (
                <tr>
                  <td colSpan={7} style={{ color: "var(--mut)" }}>
                    Tidak ada pembayaran pada periode ini.
                  </td>
                </tr>
              )}
            </tbody></table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="form-blok">
          <h3>REKONSILIASI BANK</h3>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            Instruksi transfer yang sudah diterbitkan tetapi belum tercatat
            lunas lebih dari tujuh hari. Yang muncul di sini bukan selalu
            kesalahan — kadang transfernya sudah jalan tetapi belum dicocokkan.
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            <button disabled={busy} onClick={() => void ambilBank()}>
              {busy ? "Memeriksa…" : "Periksa yang tertunda"}
            </button>
          </div>
        </div>

        {bank && (
          <div className="tscroll">
            <table><tbody>
              <tr>
                <th>Nomor klaim</th><th>Penerima</th><th>Bank</th>
                <th style={{ textAlign: "right" }}>Nilai</th>
                <th style={{ textAlign: "right" }}>Umur</th>
              </tr>
              {bank.map((b: any, i: number) => (
                <tr key={b.id ?? i}>
                  <td><b>{b.claim_number ?? "—"}</b></td>
                  <td>{b.recipient_name ?? "—"}</td>
                  <td>{b.bank_name ?? "—"}</td>
                  <td className="n">{rp(b.amount)}</td>
                  <td className="n">
                    {b.age_days != null ? `${b.age_days} hari` : "—"}
                  </td>
                </tr>
              ))}
              {!bank.length && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--mut)" }}>
                    Tidak ada instruksi transfer yang tertunda.
                  </td>
                </tr>
              )}
            </tbody></table>
          </div>
        )}
      </div>
    </Kerangka>
  );
}

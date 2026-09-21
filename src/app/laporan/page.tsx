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

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const KATA = {
  id: {
    judul: "Report / Laporan",
    pengantar: (p: string) =>
      `Rekap Dan Unduhan Data Klaim Project ${p}. Laporan Bersifat Read-Only ` +
      "Dan Tidak Dapat Diedit; Setiap Koreksi Dilakukan Pada Data Klaim.",
    galat: "Laporan tidak dapat dibaca",
    masterJudul: "LAPORAN MASTER",
    masterIsi: "Seluruh klaim beserta unit, penerima, perhitungan, dan " +
               "statusnya dalam satu workbook Excel. Baris TOTAL-nya " +
               "berformula, jadi angkanya ikut berubah bila Anda menyaring " +
               "sendiri di Excel.",
    masterUnduh: "Unduh Laporan Master (.xlsx)",
    rekapJudul: "REKAP PEMBAYARAN",
    rekapIsi: "Dihitung memakai tanggal transfer, bukan tanggal klaim dibuat " +
              "— yang dipertanggungjawabkan pada satu periode adalah uang yang " +
              "benar-benar keluar pada periode itu.",
    dari: "Dari tanggal", sampai: "Sampai tanggal", kelompok: "Dikelompokkan",
    perJenis: "per jenis fee", perPeran: "per peran penerima",
    perCluster: "per cluster",
    tampilkan: "Tampilkan rekap", menghitung: "Menghitung…",
    kKelompok: "Kelompok", kKlaim: "Klaim", kBruto: "Bruto", kPpn: "PPN",
    kPph23: "PPh 23", kPph21: "PPh 21", kBayar: "Dibayarkan",
    rekapKosong: "Tidak ada pembayaran pada periode ini.",
    bankJudul: "REKONSILIASI BANK",
    bankIsi: "Instruksi transfer yang sudah diterbitkan tetapi belum tercatat " +
             "lunas lebih dari tujuh hari. Yang muncul di sini bukan selalu " +
             "kesalahan — kadang transfernya sudah jalan tetapi belum " +
             "dicocokkan.",
    bankPeriksa: "Periksa yang tertunda", memeriksa: "Memeriksa…",
    kNomor: "Nomor klaim", kPenerima: "Penerima", kBank: "Bank",
    kNilai: "Nilai", kUmur: "Umur",
    hari: (n: number) => `${n} hari`,
    bankKosong: "Tidak ada instruksi transfer yang tertunda.",
  },
  en: {
    judul: "Marketing Report",
    pengantar: (p: string) =>
      `Summaries and downloads of Project ${p}'s claim data. Reports are ` +
      "read-only and cannot be edited; every correction is made on the " +
      "claim data.",
    galat: "The report could not be read",
    masterJudul: "MASTER REPORT",
    masterIsi: "Every claim with its unit, recipient, calculation and status " +
               "in one Excel workbook. The TOTAL row carries formulas, so the " +
               "figures follow along when you filter it yourself in Excel.",
    masterUnduh: "Download Master Report (.xlsx)",
    rekapJudul: "PAYMENT SUMMARY",
    rekapIsi: "Counted by transfer date, not by the date the claim was " +
              "created — what a period answers for is the money that actually " +
              "left in that period.",
    dari: "From date", sampai: "To date", kelompok: "Grouped by",
    perJenis: "by fee type", perPeran: "by recipient role",
    perCluster: "by cluster",
    tampilkan: "Show summary", menghitung: "Calculating…",
    kKelompok: "Group", kKlaim: "Claims", kBruto: "Gross", kPpn: "VAT",
    kPph23: "PPh 23", kPph21: "PPh 21", kBayar: "Paid out",
    rekapKosong: "No payments in this period.",
    bankJudul: "BANK RECONCILIATION",
    bankIsi: "Transfer instructions issued but not recorded as settled for " +
             "more than seven days. What appears here is not always an error " +
             "— sometimes the transfer has gone out but has not been matched.",
    bankPeriksa: "Check the outstanding ones", memeriksa: "Checking…",
    kNomor: "Claim number", kPenerima: "Recipient", kBank: "Bank",
    kNilai: "Amount", kUmur: "Age",
    hari: (n: number) => `${n} days`,
    bankKosong: "No transfer instructions are outstanding.",
  },
};

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
  const k = useKata(KATA);
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
        <h1>{k.judul}</h1>
        <p>{k.pengantar(sesi.project_name ?? "—")}</p>
      </div>
    }>

      {galat && (
        <div className="banner stop"><b>{k.galat}</b>{galat}</div>
      )}

      <div className="panel sp">
        <div className="form-blok">
          <h3>{k.masterJudul}</h3>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            {k.masterIsi}
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            <a className="tombol-klaim" href="/api/reports/master-report">
              {k.masterUnduh}
            </a>
          </div>
        </div>
      </div>

      <div className="panel sp">
        <div className="form-blok">
          <h3>{k.rekapJudul}</h3>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            {k.rekapIsi}
          </p>

          <div className="filters">
            <div>
              <div className="lbl">{k.dari}</div>
              <input type="date" value={dari}
                     onChange={(e) => setDari(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.sampai}</div>
              <input type="date" value={sampai}
                     onChange={(e) => setSampai(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.kelompok}</div>
              <select value={kelompok}
                      onChange={(e) => setKelompok(e.target.value)}>
                <option value="claim_type">{k.perJenis}</option>
                <option value="recipient_role">{k.perPeran}</option>
                <option value="cluster">{k.perCluster}</option>
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="pri" disabled={busy}
                    onClick={() => void ambilRekap()}>
              {busy ? k.menghitung : k.tampilkan}
            </button>
          </div>
        </div>

        {rekap && (
          <div className="tscroll">
            <table><tbody>
              <tr>
                <th>{k.kKelompok}</th>
                <th style={{ textAlign: "right" }}>{k.kKlaim}</th>
                <th style={{ textAlign: "right" }}>{k.kBruto}</th>
                <th style={{ textAlign: "right" }}>{k.kPpn}</th>
                <th style={{ textAlign: "right" }}>{k.kPph23}</th>
                <th style={{ textAlign: "right" }}>{k.kPph21}</th>
                <th style={{ textAlign: "right" }}>{k.kBayar}</th>
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
                    {k.rekapKosong}
                  </td>
                </tr>
              )}
            </tbody></table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="form-blok">
          <h3>{k.bankJudul}</h3>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            {k.bankIsi}
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            <button disabled={busy} onClick={() => void ambilBank()}>
              {busy ? k.memeriksa : k.bankPeriksa}
            </button>
          </div>
        </div>

        {bank && (
          <div className="tscroll">
            <table><tbody>
              <tr>
                <th>{k.kNomor}</th><th>{k.kPenerima}</th><th>{k.kBank}</th>
                <th style={{ textAlign: "right" }}>{k.kNilai}</th>
                <th style={{ textAlign: "right" }}>{k.kUmur}</th>
              </tr>
              {bank.map((b: any, i: number) => (
                <tr key={b.id ?? i}>
                  <td><b>{b.claim_number ?? "—"}</b></td>
                  <td>{b.recipient_name ?? "—"}</td>
                  <td>{b.bank_name ?? "—"}</td>
                  <td className="n">{rp(b.amount)}</td>
                  <td className="n">
                    {b.age_days != null ? k.hari(b.age_days) : "—"}
                  </td>
                </tr>
              ))}
              {!bank.length && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--mut)" }}>
                    {k.bankKosong}
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

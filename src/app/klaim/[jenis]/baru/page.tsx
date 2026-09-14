"use client";

/**
 * Langkah 3: formulir pengajuan klaim.
 *
 * Nominal tidak diisi di sini, dan itu disengaja. Gross, PPN, PPh, dan nilai
 * bersih dihitung server dari skema insentif dan matriks tarif pajak yang
 * berlaku pada tanggal kontrak (lihat lib/calc.ts). Membiarkannya diketik akan
 * membuat dua sumber kebenaran untuk angka yang sama, dan selisih di antara
 * keduanya baru ketahuan di meja Finance.
 *
 * Penerimanya pun tidak dipilih di sini: ia diambil dari marketing yang tercatat
 * pada data penjualan. Siapa yang berhak atas fee sebuah unit ditentukan saat
 * penjualan terjadi, bukan saat klaimnya diketik — memilihnya ulang di formulir
 * membuka peluang fee mendarat pada orang yang tidak menjual unit itu.
 *
 * Yang tersisa untuk diisi hanyalah yang benar-benar tidak dapat disimpulkan
 * sistem: dalam peran apa fee itu diterima, dan pada tingkat overriding mana.
 * Hasil perhitungannya diperlihatkan segera setelah tersimpan.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { Nav } from "../../../nav";
import { BilahPengguna, useSesi } from "../../../session";
import {
  LABEL_PERAN, PERAN_PENERIMA, TINGKAT_OVERRIDING, jenisDari,
} from "../../jenis";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;

type Unit = {
  id: string; code: string; project_name: string; cluster_code: string;
  buyer_name: string | null; unit_type: string | null;
  payment_scheme: string | null; contract_number: string | null;
  contract_date: string | null; contract_value_incl_vat: number;
  eligible: boolean; missing_requirements: string[];
  marketing_id: string | null; marketing_name: string | null;
  marketing_type: string | null; agency_name: string | null;
  recipient: { id: string | null; name: string | null;
               status: string | null; source: string };
  marketing_missing: boolean; marketing_inactive: boolean;
  claimable: boolean;
  claim: { claim_number: string; status: string } | null;
};

export default function FormKlaimPage() {
  const { sesi, memuat } = useSesi();
  const params = useParams<{ jenis: string }>();
  const search = useSearchParams();
  const jenis = jenisDari(params.jenis);
  const unitId = search.get("unit") ?? "";

  const [unit, setUnit] = useState<Unit | null>(null);
  const [peran, setPeran] = useState("");
  const [tingkat, setTingkat] = useState("");
  const [busy, setBusy] = useState(true);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kurang, setKurang] = useState<string[]>([]);
  const [hasil, setHasil] = useState<any>(null);

  const muat = useCallback(async () => {
    if (!jenis || !unitId) { setBusy(false); return; }
    setBusy(true);
    try {
      const u = await fetch(`/api/units?eligible_for=${jenis.slug}`);
      if (u.status === 401) { location.href = "/login"; return; }
      const units: Unit[] = await u.json();
      setUnit(units.find((x) => x.id === unitId) ?? null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [jenis, unitId]);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  // Peran bawaan mengikuti jenis marketing pada data penjualan: agent menerima
  // sebagai agent, in-house sebagai sales in-house. Tetap dapat diubah, karena
  // satu orang dapat menerima dalam peran berbeda (mis. markom).
  useEffect(() => {
    if (!unit?.marketing_type || !jenis) return;
    const usul = jenis.slug === "overriding"
      ? "sales_manager_inhouse"
      : unit.marketing_type === "agent" ? "agent" : "sales_inhouse";
    if (PERAN_PENERIMA[jenis.slug].includes(usul)) setPeran(usul);
  }, [unit, jenis]);

  const ajukan = async () => {
    if (!jenis) return;
    setKirim(true);
    setGalat(null);
    setKurang([]);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: unitId,
          marketing_id: unit?.recipient.id,
          claim_type: jenis.slug,
          recipient_role: peran,
          overriding_level: jenis.slug === "overriding" ? tingkat : null,
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) {
        setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`);
        setKurang(Array.isArray(b.missing) ? b.missing : []);
        return;
      }
      setHasil(b);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setKirim(false);
    }
  };

  if (memuat || !sesi) {
    return (
      <div className="wrap narrow">
        <p className="hint" style={{ marginTop: 40 }}>Memeriksa sesi…</p>
      </div>
    );
  }

  if (!jenis || !unitId) {
    return (
      <div className="wrap narrow">
        <div className="banner stop" style={{ marginTop: 30 }}>
          <b>Unit atau jenis klaim tidak disebutkan</b>
          <Link href="/klaim">Kembali ke pilihan jenis</Link>
        </div>
      </div>
    );
  }

  const siap = Boolean(unit?.claimable && peran &&
                       (jenis.slug !== "overriding" || tingkat));

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Klaim {jenis.nama}</h1>
          <p>
            Nominal dihitung sistem dari skema insentif dan tarif pajak yang
            berlaku pada tanggal kontrak — tidak diisi di sini.
          </p>
        </div>
        <div className="row" style={{ marginBottom: 0, alignItems: "flex-end" }}>
          <Nav />
          <BilahPengguna sesi={sesi} />
        </div>
      </header>

      <div className="row sp">
        <Link href={`/klaim/${jenis.slug}`}>← Kembali ke data penjualan</Link>
      </div>

      {busy && <p className="hint">Memuat data unit…</p>}

      {!busy && !unit && (
        <div className="banner stop">
          <b>Unit tidak ditemukan</b>
          Unit yang diminta tidak ada pada daftar penjualan.
        </div>
      )}

      {unit && (
        <>
          <div className="panel sp">
            <h2>Data penjualan</h2>
            <table><tbody>
              <tr><td>Kode unit</td><td className="n">{unit.code}</td></tr>
              <tr><td>Proyek / cluster</td>
                  <td className="n">{unit.project_name} · {unit.cluster_code}</td></tr>
              <tr><td>Pembeli</td><td className="n">{unit.buyer_name ?? "—"}</td></tr>
              <tr><td>Tipe unit</td><td className="n">{unit.unit_type ?? "—"}</td></tr>
              <tr><td>Skema pembayaran</td>
                  <td className="n">{unit.payment_scheme ?? "—"}</td></tr>
              <tr><td>Nomor kontrak</td>
                  <td className="n">{unit.contract_number ?? "—"}</td></tr>
              <tr><td>Tanggal kontrak</td>
                  <td className="n">
                    {unit.contract_date ? String(unit.contract_date).slice(0, 10) : "—"}
                  </td></tr>
              <tr><td>Nilai kontrak (termasuk PPN)</td>
                  <td className="n">{rp(unit.contract_value_incl_vat)}</td></tr>
              <tr><td>Sales</td>
                  <td className="n">
                    {unit.marketing_name ?? "— belum tercatat —"}
                    {unit.agency_name ? <><br />{unit.agency_name}</> : null}
                  </td></tr>
            </tbody></table>
          </div>

          {unit.claim && (
            <div className="banner warn sp">
              <b>Unit ini sudah punya klaim {jenis.nama} yang aktif</b>
              {unit.claim.claim_number} · {unit.claim.status}. Satu unit hanya boleh
              punya satu klaim aktif per jenis dan peran penerima (BR-05).
            </div>
          )}

          {unit.marketing_missing && (
            <div className="banner stop sp">
              <b>Data penjualan ini belum menyebut {unit.recipient.source}</b>
              Penerima klaim {jenis.nama} diambil dari kolom{" "}
              {unit.recipient.source} pada data penjualan, jadi klaim tidak dapat
              dibuat sebelum unit ini dikaitkan dengan orangnya.
            </div>
          )}

          {unit.marketing_inactive && (
            <div className="banner stop sp">
              <b>Penerima pada penjualan ini belum aktif</b>
              {unit.recipient.name} berstatus {unit.recipient.status}. Pendaftaran
              dan perekaman spesimen tanda tangan harus selesai lebih dulu sebelum
              ia dapat menerima pembayaran.
            </div>
          )}

          {!unit.eligible && (
            <div className="banner stop sp">
              <b>Prasyarat pencairan belum terpenuhi</b>
              <ul style={{ margin: "4px 0 0 16px" }}>
                {unit.missing_requirements.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}

          {!hasil && (
            <div className="panel sp">
              <h2>Penerima</h2>

              <div className="lbl">
                Penerima fee — dari kolom {unit.recipient.source} pada data penjualan
              </div>
              <p style={{ margin: "2px 0 0", fontSize: 14 }}>
                <b>{unit.recipient.name ?? "— belum tercatat —"}</b>
              </p>
              <p className="hint" style={{ textAlign: "left", marginTop: 2 }}>
                Tidak dapat diubah di sini. Yang berhak atas fee sebuah unit
                ditentukan saat penjualan tercatat.
                {jenis.slug === "overriding"
                  ? " Overriding dibayarkan kepada tingkat di atas Sales."
                  : ""}
              </p>

              <div className="lbl" style={{ marginTop: 12 }}>Peran penerima</div>
              <select value={peran} style={{ width: "100%" }}
                      onChange={(e) => setPeran(e.target.value)}>
                <option value="">— pilih peran —</option>
                {PERAN_PENERIMA[jenis.slug].map((r) => (
                  <option key={r} value={r}>{LABEL_PERAN[r] ?? r}</option>
                ))}
              </select>

              {jenis.slug === "overriding" && (
                <>
                  <div className="lbl" style={{ marginTop: 12 }}>Tingkat overriding</div>
                  <select value={tingkat} style={{ width: "100%" }}
                          onChange={(e) => setTingkat(e.target.value)}>
                    <option value="">— pilih tingkat —</option>
                    {TINGKAT_OVERRIDING.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </>
              )}

              <div className="row" style={{ marginTop: 14, marginBottom: 0 }}>
                <button className="pri" disabled={!siap || kirim}
                        onClick={() => void ajukan()}>
                  {kirim ? "Menyimpan…" : "Ajukan klaim"}
                </button>
              </div>

              <p className="hint" style={{ textAlign: "left", marginTop: 8 }}>
                Klaim tersimpan sebagai draft. Nominalnya dihitung saat itu juga dan
                baru dikunci setelah Finance (Pajak) memverifikasinya.
              </p>
            </div>
          )}

          {galat && (
            <div className="banner stop">
              <b>Klaim tidak dapat dibuat</b>
              {galat}
              {kurang.length > 0 && (
                <ul style={{ margin: "4px 0 0 16px" }}>
                  {kurang.map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
            </div>
          )}

          {hasil && (
            <div className="panel">
              <div className="banner ok">
                <b>Klaim {hasil.claim_number} tersimpan sebagai draft</b>
                Nominal di bawah dihitung sistem dan belum dikunci — Finance (Pajak)
                yang memverifikasinya.
              </div>
              <table><tbody>
                <tr><td>Nomor klaim</td><td className="n">{hasil.claim_number}</td></tr>
                <tr><td>Bruto</td><td className="n">{rp(hasil.gross_amount)}</td></tr>
                <tr><td>PPN</td><td className="n">{rp(hasil.vat)}</td></tr>
                <tr><td>PPh dipotong</td>
                    <td className="n">− {rp(hasil.withholding_tax)}</td></tr>
                <tr><td>Nilai bersih</td><td className="n">{rp(hasil.net_amount)}</td></tr>
              </tbody></table>
              {hasil.amount_in_words && (
                <p className="hint" style={{ textAlign: "left" }}>
                  Terbilang: {hasil.amount_in_words}
                </p>
              )}
              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <Link href={`/klaim/${jenis.slug}`}>
                  <button>Ajukan klaim lain</button>
                </Link>
                <Link href="/"><button className="pri">Buka konsol</button></Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

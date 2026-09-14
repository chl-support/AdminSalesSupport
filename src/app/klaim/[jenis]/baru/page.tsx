"use client";

/**
 * Langkah 3: formulir pengajuan klaim.
 *
 * Susunannya mengikuti Form Pengajuan yang dipakai BIO District — Informasi Data
 * Marketing, Informasi Data Pemesanan, Perhitungan, Penjelasan Pengajuan,
 * Syarat/Dokumen, Tujuan Transfer, Pengesahan — supaya yang mengisi di layar
 * melihat urutan yang sama dengan yang selama ini ditandatangani di kertas.
 *
 * Yang berbeda dari kertasnya, dan disengaja:
 *
 *   - **Nominal tidak diketik.** Bruto, PPN, PPh, dan nilai bersih dihitung
 *     server dari skema insentif pada memo yang berlaku di tanggal kontrak
 *     (lihat lib/calc.ts). Pada kertas, angka itu diisi tangan dan setiap
 *     salinannya bisa berbeda.
 *   - **Penerima tidak dipilih.** Ia diambil dari data penjualan: Sales untuk
 *     Closing Fee, Komisi, dan Cash Reward; Sub Koordinator untuk Overriding.
 *   - **Data marketing dan pemesanan tidak diketik ulang**, melainkan dibaca
 *     dari basis data. Mengetik ulang berarti dua versi dari fakta yang sama.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { Nav } from "../../../nav";
import { BilahPengguna, useSesi } from "../../../session";
import {
  DOKUMEN, JUDUL_HITUNG, LABEL_PERAN, PERAN_PENERIMA, TINGKAT_OVERRIDING,
  jenisDari,
} from "../../jenis";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;
const tgl = (v?: string | null) => (v ? String(v).slice(0, 10) : "—");

type Rekening = {
  holder_name: string; holder_type: "individual" | "company";
  account_number: string; bank_name: string; branch: string | null;
};

type Penerima = {
  id: string | null; name: string | null; status: string | null; source: string;
  type: string | null; npwp: string | null; phone: string | null;
  email: string | null; office: string | null; office_address: string | null;
  bank: Rekening | null;
};

type Unit = {
  id: string; code: string; project_name: string; cluster_code: string;
  buyer_name: string | null; unit_type: string | null; land_area: number | null;
  building_area: number | null; payment_scheme: string | null;
  contract_number: string | null; contract_date: string | null;
  contract_value_incl_vat: number; received_amount: number;
  eligible: boolean; missing_requirements: string[];
  recipient: Penerima;
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
  const [penjelasan, setPenjelasan] = useState("");
  const [ceklis, setCeklis] = useState<Record<string, boolean>>({});
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

  // Peran bawaan mengikuti jenis marketing pada data penjualan. Tetap dapat
  // diubah, karena satu orang dapat menerima dalam peran berbeda (mis. markom).
  useEffect(() => {
    if (!unit?.recipient.type || !jenis) return;
    const usul = jenis.slug === "overriding"
      ? "sales_manager_inhouse"
      : unit.recipient.type === "agent" ? "agent" : "sales_inhouse";
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
          notes: penjelasan,
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

  const dokumen = DOKUMEN[jenis.slug];
  const dokumenLengkap = dokumen.every((d) => ceklis[d]);
  const siap = Boolean(unit?.claimable && peran && dokumenLengkap &&
                       (jenis.slug !== "overriding" || tingkat));

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Form Pengajuan {jenis.nama}</h1>
          <p>
            PT. Serpong Bangun Lestari — BIO District. Nominal dihitung sistem
            dari memo skema yang berlaku pada tanggal kontrak, tidak diisi tangan.
          </p>
        </div>
        <div className="row" style={{ marginBottom: 0, alignItems: "flex-end" }}>
          <Nav peran={sesi.role} />
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
              Penerima klaim {jenis.nama} diambil dari kolom {unit.recipient.source}{" "}
              pada data penjualan, jadi klaim tidak dapat dibuat sebelum unit ini
              dikaitkan dengan orangnya.
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

          <div className="grid sp">
            <div className="panel">
              <div className="form-blok">
                <h3>INFORMASI DATA MARKETING</h3>
                <table><tbody>
                  <tr><td>Nama Marketing</td>
                      <td>{unit.recipient.name ?? "—"}</td></tr>
                  <tr><td>Status</td>
                      <td>{unit.recipient.type === "agent" ? "Agent" :
                           unit.recipient.type === "inhouse" ? "Inhouse" : "—"}</td></tr>
                  <tr><td>Nama Kantor Marketing</td>
                      <td>{unit.recipient.office ?? "PT. Serpong Bangun Lestari"}</td></tr>
                  <tr><td>Alamat Kantor</td>
                      <td>{unit.recipient.office_address ?? "—"}</td></tr>
                  <tr><td>NPWP</td><td>{unit.recipient.npwp || "—"}</td></tr>
                  <tr><td>No. Telepon / HP</td>
                      <td>{unit.recipient.phone || "—"}</td></tr>
                  <tr><td>Email</td><td>{unit.recipient.email || "—"}</td></tr>
                </tbody></table>
                {jenis.slug === "overriding" && (
                  <p className="hint" style={{ textAlign: "left" }}>
                    Overriding dibayarkan kepada {unit.recipient.source}, bukan
                    kepada Sales yang menutup penjualannya.
                  </p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="form-blok">
                <h3>INFORMASI DATA PEMESANAN</h3>
                <table><tbody>
                  <tr><td>Project</td><td>{unit.project_name}</td></tr>
                  <tr><td>Nama Pemesan</td><td>{unit.buyer_name ?? "—"}</td></tr>
                  <tr><td>Kluster</td><td>{unit.cluster_code}</td></tr>
                  <tr><td>No. Unit</td><td><b>{unit.code}</b></td></tr>
                  <tr><td>Tipe</td><td>{unit.unit_type ?? "—"}</td></tr>
                  <tr><td>Luas Tanah</td>
                      <td>{unit.land_area ? `${unit.land_area} m²` : "—"}</td></tr>
                  <tr><td>Luas Bangunan</td>
                      <td>{unit.building_area ? `${unit.building_area} m²` : "—"}</td></tr>
                  <tr><td>No. Kontrak</td><td>{unit.contract_number ?? "—"}</td></tr>
                  <tr><td>Tanggal Penjualan</td><td>{tgl(unit.contract_date)}</td></tr>
                  <tr><td>Skema Cara Bayar</td>
                      <td>{unit.payment_scheme ?? "—"}</td></tr>
                  <tr><td>Harga Transaksi</td>
                      <td>{rp(unit.contract_value_incl_vat)}</td></tr>
                </tbody></table>
              </div>
            </div>
          </div>

          {!hasil && (
            <>
              <div className="panel sp">
                <div className="form-blok">
                  <h3>PERAN PENERIMA</h3>
                  <div className="lbl">Diterima dalam peran</div>
                  <select value={peran} style={{ width: "100%" }}
                          onChange={(e) => setPeran(e.target.value)}>
                    <option value="">— pilih peran —</option>
                    {PERAN_PENERIMA[jenis.slug].map((r) => (
                      <option key={r} value={r}>{LABEL_PERAN[r] ?? r}</option>
                    ))}
                  </select>
                  <p className="hint" style={{ textAlign: "left", marginTop: 4 }}>
                    Menentukan tarif mana yang dipakai pada memo skema.
                  </p>

                  {jenis.slug === "overriding" && (
                    <>
                      <div className="lbl" style={{ marginTop: 12 }}>
                        Tingkat overriding
                      </div>
                      <select value={tingkat} style={{ width: "100%" }}
                              onChange={(e) => setTingkat(e.target.value)}>
                        <option value="">— pilih tingkat —</option>
                        {TINGKAT_OVERRIDING.map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>

                <div className="form-blok">
                  <h3>TUJUAN TRANSFER</h3>
                  {unit.recipient.bank ? (
                    <>
                      <table><tbody>
                        <tr><td>Nama Penerima</td>
                            <td>{unit.recipient.bank.holder_name}</td></tr>
                        <tr><td>BANK</td>
                            <td>{unit.recipient.bank.bank_name}</td></tr>
                        <tr><td>No. Rekening</td>
                            <td>{unit.recipient.bank.account_number}</td></tr>
                        <tr><td>Kantor Cabang</td>
                            <td>{unit.recipient.bank.branch ?? "—"}</td></tr>
                        <tr><td>Atas nama</td>
                            <td>{unit.recipient.bank.holder_type === "company"
                                  ? "Badan usaha (PT)" : "Perorangan"}</td></tr>
                      </tbody></table>
                      <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                        Rekening tujuan inilah yang menentukan jenis PPh:
                        ditransfer ke PT dipotong <b>PPh 23</b>, ke perorangan
                        dipotong <b>PPh 21</b>. Rekening ini atas nama{" "}
                        {unit.recipient.bank.holder_type === "company"
                          ? "badan usaha, jadi dipotong PPh 23"
                          : "perorangan, jadi dipotong PPh 21"}.
                      </p>
                    </>
                  ) : (
                    <div className="banner warn" style={{ marginBottom: 0 }}>
                      <b>Belum ada rekening tujuan yang terverifikasi</b>
                      Jenis PPh ditentukan oleh rekening tujuan transfer, jadi
                      tanpa rekening itu potongan pajaknya hanya diperkirakan dari
                      status marketing. Klaim tetap dapat diajukan, tetapi tidak
                      dapat dibayarkan sebelum rekeningnya diverifikasi.
                    </div>
                  )}
                </div>

                <div className="form-blok">
                  <h3>PENJELASAN PENGAJUAN {jenis.nama.toUpperCase()}</h3>
                  <textarea className="reason" value={penjelasan}
                            placeholder="mis. Full Payment. Pembayaran sudah mencapai 20%."
                            onChange={(e) => setPenjelasan(e.target.value)} />
                  <p className="hint" style={{ textAlign: "left" }}>
                    Ikut tercetak pada paket dokumen yang diedarkan untuk
                    persetujuan — bukan catatan internal.
                  </p>
                </div>

                {dokumen.length > 0 && (
                  <div className="form-blok">
                    <h3>SYARAT / DOKUMEN PENGAJUAN {jenis.nama.toUpperCase()}</h3>
                    <ul className="ceklis">
                      {dokumen.map((d, i) => (
                        <li key={d}>
                          <label>
                            <input type="checkbox" checked={Boolean(ceklis[d])}
                                   onChange={(e) =>
                                     setCeklis({ ...ceklis, [d]: e.target.checked })} />
                            <span>{i + 1}. {d}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {!dokumenLengkap && (
                      <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                        Seluruh dokumen harus dicentang sebelum klaim dapat diajukan.
                      </p>
                    )}
                  </div>
                )}

                <div className="row" style={{ marginTop: 4, marginBottom: 0 }}>
                  <button className="pri" disabled={!siap || kirim}
                          onClick={() => void ajukan()}>
                    {kirim ? "Menyimpan…" : "Ajukan klaim"}
                  </button>
                </div>
                <p className="hint" style={{ textAlign: "left", marginTop: 8 }}>
                  Klaim tersimpan sebagai draft. Nominalnya dihitung saat itu juga
                  dan baru dikunci setelah Finance (Pajak) memverifikasinya.
                </p>
              </div>
            </>
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

              <div className="form-blok hitung">
                <h3>{JUDUL_HITUNG[jenis.slug]}</h3>
                <table><tbody>
                  {jenis.slug === "commission" && (
                    <tr><td>Total Pembayaran / Persen Pembayaran</td>
                        <td>{rp(hasil.total_payment)} ·{" "}
                            {(Number(hasil.payment_percent ?? 0) * 100).toFixed(2)}%
                        </td></tr>
                  )}
                  <tr><td>Jumlah {jenis.nama}</td>
                      <td>{rp(hasil.gross_amount)}</td></tr>
                  <tr><td>PPN</td><td>{rp(hasil.vat)}</td></tr>
                  <tr><td>Potongan PPh
                          {hasil.withholding_tax_type
                            ? ` (${String(hasil.withholding_tax_type)
                                .replace("pph", "PPh ").toUpperCase()
                                .replace("PPH ", "PPh ")})`
                            : ""}</td>
                      <td>− {rp(hasil.withholding_tax)}</td></tr>
                  <tr className="total">
                      <td>{jenis.nama} yang Dibayarkan</td>
                      <td>{rp(hasil.net_amount)}</td></tr>
                  {hasil.amount_in_words && (
                    <tr><td>Terbilang</td>
                        <td style={{ fontStyle: "italic" }}>
                          # {hasil.amount_in_words} #
                        </td></tr>
                  )}
                </tbody></table>
                {hasil.snapshot?.withholding_basis && (
                  <p className="hint" style={{ textAlign: "left" }}>
                    Dasar jenis PPh: {String(hasil.snapshot.withholding_basis)}.
                  </p>
                )}
                {hasil.snapshot?.scheme_memo && (
                  <p className="hint" style={{ textAlign: "left" }}>
                    Dasar perhitungan: memo {String(hasil.snapshot.scheme_memo)},{" "}
                    {/* Skema bernominal tetap tidak punya persentase — menampilkan
                        "tarif 0,000%" untuk Closing Fee Rp 10 juta hanya
                        membingungkan pembacanya. */}
                    {hasil.snapshot.flat_amount
                      ? `${rp(Number(hasil.snapshot.flat_amount))} per unit` +
                        (hasil.snapshot.flat_amount_is_net
                          ? " (nilai bersih, exclude PPh — bruto dinaikkan agar " +
                            "setelah potongan pajak sisanya persis sebesar itu)"
                          : "")
                      : `tarif ${(Number(hasil.snapshot.percentage ?? 0) * 100)
                          .toFixed(3)}%` +
                        (hasil.snapshot.tier_unit_count
                          ? ` (jenjang dari ${hasil.snapshot.tier_unit_count} unit pada bulan kontrak)`
                          : "")}.
                  </p>
                )}
              </div>

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

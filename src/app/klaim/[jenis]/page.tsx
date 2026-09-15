"use client";

/**
 * Langkah 2: data penjualan, dengan kolom klaim di kanan.
 *
 * Tiga keadaan per baris, dan ketiganya sengaja ditampilkan — bukan disaring
 * habis menjadi "yang bisa diklaim saja":
 *
 *   - belum diklaim dan prasyaratnya terpenuhi  → tombol Klaim
 *   - sudah ada klaim aktif                     → nomor dan statusnya
 *   - prasyaratnya belum terpenuhi              → apa yang kurang
 *
 * Menyembunyikan dua keadaan terakhir membuat unit yang hilang dari daftar tidak
 * dapat dijelaskan: orang yang mencarinya tidak punya cara tahu apakah unitnya
 * sudah diklaim orang lain atau memang belum memenuhi syarat.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Kerangka, MemeriksaSesi } from "../../kerangka";
import { useSesi } from "../../session";
import { jenisDari } from "../jenis";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;

type Unit = {
  id: string; code: string; project_name: string; cluster_code: string;
  buyer_name: string | null; unit_type: string | null;
  payment_scheme: string | null; contract_date: string | null;
  contract_value_incl_vat: number; received_amount: number; status: string;
  eligible: boolean; missing_requirements: string[];
  marketing_name: string | null; agency_name: string | null;
  recipient: { id: string | null; name: string | null;
               status: string | null; source: string };
  marketing_missing: boolean; marketing_inactive: boolean;
  claimable: boolean;
  claim: { id: string; claim_number: string; status: string;
           net_amount: number; recipient_role: string } | null;
};

type Saring = "semua" | "bisa" | "sudah" | "belum_syarat";

export default function DaftarPenjualanPage() {
  const { sesi, memuat } = useSesi();
  const params = useParams<{ jenis: string }>();
  const jenis = jenisDari(params.jenis);

  const [units, setUnits] = useState<Unit[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Saring>("semua");

  const muat = useCallback(async () => {
    if (!jenis) return;
    setBusy(true);
    setGalat(null);
    try {
      const res = await fetch(`/api/units?eligible_for=${jenis.slug}`);
      if (res.status === 401) { location.href = "/login"; return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? body.title ?? `HTTP ${res.status}`);
      setUnits(body);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [jenis]);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

  if (!jenis) {
    return (
      <div className="wrap narrow">
        <div className="banner stop" style={{ marginTop: 30 }}>
          <b>Jenis klaim tidak dikenal</b>
          <Link href="/klaim">Kembali ke pilihan jenis</Link>
        </div>
      </div>
    );
  }

  const q = cari.trim().toLowerCase();
  const terlihat = units.filter((u) => {
    if (q && ![u.code, u.buyer_name, u.project_name, u.cluster_code]
                .some((v) => v?.toLowerCase().includes(q))) return false;
    if (saring === "bisa") return u.claimable;
    if (saring === "sudah") return Boolean(u.claim);
    if (saring === "belum_syarat") return !u.claim && !u.claimable;
    return true;
  });

  const bisa = units.filter((u) => u.claimable).length;

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{jenis.nama}</h1>
        <p>
          {jenis.prasyarat} Penjualan yang memenuhi syarat dan belum diklaim
          dapat diajukan lewat kolom paling kanan.
        </p>
      </div>
    }>

      <div className="row sp">
        <Link href="/klaim">← Ganti jenis fee</Link>
        <span className="pill">{bisa} dapat diklaim</span>
        <span className="pill">{units.length} penjualan</span>
      </div>

      {galat && (
        <div className="banner stop">
          <b>Data penjualan tidak dapat dibaca</b>
          {galat}
        </div>
      )}

      <div className="panel sp">
        <div className="filters">
          <div>
            <div className="lbl">Cari (kode unit, pembeli, proyek, cluster)</div>
            <input value={cari} placeholder="mis. BIOBA2"
                   onChange={(e) => setCari(e.target.value)} />
          </div>
          <div>
            <div className="lbl">Tampilkan</div>
            <select value={saring} onChange={(e) => setSaring(e.target.value as Saring)}>
              <option value="semua">semua penjualan</option>
              <option value="bisa">yang dapat diklaim</option>
              <option value="sudah">yang sudah diklaim</option>
              <option value="belum_syarat">yang belum dapat diklaim</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          Data penjualan
          <span className="pill">{terlihat.length} baris ditampilkan</span>
        </h2>

        <div className="tscroll">
          <table>
            <tbody>
              <tr>
                <th>Unit</th>
                <th>Pembeli</th>
                <th>Penerima fee</th>
                <th>Skema / tanggal</th>
                <th style={{ textAlign: "right" }}>Nilai kontrak</th>
                <th style={{ textAlign: "right" }}>Penerimaan</th>
                <th style={{ width: 230 }}>Klaim</th>
              </tr>

              {terlihat.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.code}</b><br />
                    <span style={{ color: "var(--mut)" }}>
                      {u.cluster_code} · {u.unit_type ?? "—"}
                    </span>
                  </td>
                  <td>{u.buyer_name ?? "—"}</td>
                  <td>
                    {u.recipient.name ?? (
                      <span style={{ color: "var(--mut)" }}>belum tercatat</span>
                    )}
                    <br />
                    <span style={{ color: "var(--mut)", fontSize: 11 }}>
                      {u.recipient.source}
                      {u.agency_name && u.recipient.source === "Sales"
                        ? ` · ${u.agency_name}` : ""}
                    </span>
                  </td>
                  <td>
                    {u.payment_scheme ?? "—"}<br />
                    <span style={{ color: "var(--mut)" }}>
                      {u.contract_date ? String(u.contract_date).slice(0, 10) : "—"}
                    </span>
                  </td>
                  <td className="n">{rp(u.contract_value_incl_vat)}</td>
                  {/* Penerimaan ditampilkan bersama persentasenya terhadap nilai
                      kontrak: Komisi dihitung dari persentase pembayaran, jadi
                      angka rupiahnya sendiri belum menjawab pertanyaan yang
                      dibawa orang ke layar ini. */}
                  <td className="n">
                    {rp(u.received_amount)}<br />
                    <span style={{ color: "var(--mut)", fontSize: 11 }}>
                      {u.contract_value_incl_vat
                        ? `${((u.received_amount / u.contract_value_incl_vat) * 100)
                             .toFixed(1)}% dari kontrak`
                        : "—"}
                    </span>
                  </td>
                  <td>
                    {u.claim ? (
                      <>
                        <span className="pill ok">sudah diklaim</span><br />
                        <span style={{ fontSize: 11 }}>
                          {u.claim.claim_number} · {u.claim.status}
                        </span>
                      </>
                    ) : u.claimable ? (
                      <Link className="tombol-klaim"
                            href={`/klaim/${jenis.slug}/baru?unit=${u.id}`}>
                        Klaim
                      </Link>
                    ) : (
                      <>
                        <span className="pill warn">belum dapat diklaim</span>
                        <ul className="kurang">
                          {u.missing_requirements.map((m) => <li key={m}>{m}</li>)}
                          {u.marketing_missing && (
                            <li>
                              Data penjualan belum menyebut {u.recipient.source}.
                            </li>
                          )}
                          {u.marketing_inactive && (
                            <li>
                              {u.recipient.name} berstatus {u.recipient.status},
                              belum aktif.
                            </li>
                          )}
                        </ul>
                      </>
                    )}
                  </td>
                </tr>
              ))}

              {!terlihat.length && !busy && (
                <tr>
                  <td colSpan={7} style={{ color: "var(--mut)" }}>
                    Tidak ada penjualan yang cocok dengan penyaringan ini.
                  </td>
                </tr>
              )}
              {busy && (
                <tr><td colSpan={7} style={{ color: "var(--mut)" }}>Memuat…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Kerangka>
  );
}

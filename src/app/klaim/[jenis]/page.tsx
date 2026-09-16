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

/** Prasyarat pencairan, sama urutannya dengan yang dicatat di basis data. */
const PRASYARAT = [
  ["spu_signed", "SPU sudah ditandatangani pemesan",
   "Syarat Closing Fee, Komisi, dan Cash Reward."],
  ["ppjb_signed", "PPJB sudah ditandatangani pemesan",
   "Syarat Komisi dan Cash Reward."],
  ["dp_received", "DP / angsuran pertama sudah diterima",
   "Syarat Cash Reward."],
  ["sign_p3u", "Unit sudah Sign P3U", "Syarat Overriding."],
] as const;

type Unit = {
  spu_signed: boolean; ppjb_signed: boolean;
  dp_received: boolean; sign_p3u: boolean;
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
  // Unit yang sedang dicatat dokumennya, beserta isian pop-upnya.
  const [catat, setCatat] = useState<Unit | null>(null);
  const [isian, setIsian] = useState<Record<string, any>>({});
  const [simpan, setSimpan] = useState(false);
  const [kabar, setKabar] = useState<{ kind: string; teks: string } | null>(null);
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

  const bukaCatat = (u: Unit) => {
    setKabar(null);
    setCatat(u);
    setIsian({
      spu_signed: u.spu_signed, ppjb_signed: u.ppjb_signed,
      dp_received: u.dp_received, sign_p3u: u.sign_p3u,
      received_amount: String(u.received_amount ?? 0),
    });
  };

  const simpanCatat = async () => {
    if (!catat) return;
    setSimpan(true);
    try {
      const res = await fetch(`/api/units/${catat.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...isian,
          received_amount: Number(String(isian.received_amount).replace(/[^\d]/g, "")) || 0,
        }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? body.title ?? `HTTP ${res.status}`);
      setKabar({ kind: "ok",
                 teks: `Dokumen unit ${catat.code} tercatat.` });
      setCatat(null);
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", teks: String(e?.message ?? e) });
    } finally { setSimpan(false); }
  };

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
  // Penanda prasyarat membuka pembayaran atas unit, jadi hanya Admin Sales dan
  // Admin IT yang boleh mencatatnya — bukan yang mengajukan klaimnya.
  const boleh = sesi.role === "admin_sales" || sesi.role === "admin_system";

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

      {kabar && (
        <div className={`banner ${kabar.kind}`}>{kabar.teks}</div>
      )}

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
                        {boleh && (
                          <button style={{ marginLeft: 6, padding: "2px 8px",
                                           fontSize: 11 }}
                                  onClick={() => bukaCatat(u)}>
                            Catat dokumen
                          </button>
                        )}
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

      {/* Pencatatan dokumen. Keempat penanda ini tidak ada di Laporan Penjualan
          — impor sengaja tidak menyentuhnya — sehingga tanpa layar ini setiap
          unit hasil impor berhenti pada "belum dapat diklaim" tanpa jalan
          keluar. Yang mencatat adalah Admin Sales yang memegang berkasnya. */}
      {catat && (
        <div className="tirai"
             onMouseDown={(e) => {
               if (e.target === e.currentTarget && !simpan) setCatat(null);
             }}>
          <div className="popup lebar" role="dialog" aria-modal="true"
               aria-label="Catat dokumen unit" style={{ maxWidth: 520 }}>
            <div className="popup-kepala">
              <h2>
                Dokumen unit {catat.code}
                <span className="pill">{catat.buyer_name ?? "—"}</span>
              </h2>
              <button className="tautan" aria-label="Tutup"
                      onClick={() => setCatat(null)}>✕</button>
            </div>

            <div className="popup-isi">
              <p className="hint" style={{ textAlign: "left", margin: "0 0 12px" }}>
                Tandai yang berkasnya sudah ada di tangan Anda. Penanda inilah
                yang membuka pengajuan atas unit ini, dan setiap perubahannya
                tercatat pada jejak audit beserta nama Anda.
              </p>

              {PRASYARAT.map(([kolom, label, ket]) => (
                <label key={kolom} className="tandai-syarat">
                  <input type="checkbox" checked={Boolean(isian[kolom])}
                         onChange={(e) =>
                           setIsian({ ...isian, [kolom]: e.target.checked })} />
                  <span>
                    {label}
                    <span className="lbl" style={{ margin: 0 }}>{ket}</span>
                  </span>
                </label>
              ))}

              {/* Penerimaan ikut di sini: Komisi dihitung dari persentase
                  pembayaran, dan angkanya pun tidak ada di laporan penjualan. */}
              <div className="lbl" style={{ marginTop: 14 }}>
                Penerimaan sampai hari ini (Rp)
              </div>
              <input value={isian.received_amount ?? ""} inputMode="numeric"
                     style={{ width: "100%" }}
                     onChange={(e) =>
                       setIsian({ ...isian, received_amount: e.target.value })} />
              <div className="lbl" style={{ marginTop: 4 }}>
                Nilai kontrak {rp(catat.contract_value_incl_vat)}.
              </div>
              {/* Diperingatkan, bukan ditolak: pembayaran melebihi nilai kontrak
                  memang terjadi (denda, penyesuaian), tetapi jauh lebih sering
                  ia adalah angka yang salah ketik — dan Komisi dihitung dari
                  persentase pembayaran, jadi salah ketiknya ikut terbawa. */}
              {Number(String(isian.received_amount).replace(/[^\d]/g, "")) >
                 catat.contract_value_incl_vat && (
                <div className="banner warn" style={{ marginTop: 8 }}>
                  <b>Penerimaan melebihi nilai kontrak</b>
                  Periksa sekali lagi sebelum disimpan.
                </div>
              )}
            </div>

            <div className="popup-kaki">
              <div className="row">
                <button className="pri" disabled={simpan}
                        onClick={() => void simpanCatat()}>
                  {simpan ? "Menyimpan…" : "Simpan"}
                </button>
                <button disabled={simpan}
                        onClick={() => setCatat(null)}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Kerangka>
  );
}

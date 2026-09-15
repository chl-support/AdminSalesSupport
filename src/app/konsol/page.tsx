"use client";

import { useCallback, useEffect, useState } from "react";

import { FormPengajuan } from "../klaim/form-pengajuan";
import { Nav } from "../nav";
import { BilahPengguna, useSesi } from "../session";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;

const STATUS_PILL: Record<string, string> = {
  paid: "ok", completed: "ok", rejected: "stop",
  pending_tax_verification: "warn", signature_review_required: "warn",
  awaiting_signature: "warn", awaiting_settlement_date: "warn",
};

const NEXT_HANDOFF: Record<string, string> = {
  printed: "handed_to_head_finance",
  circulating_head_finance: "handed_to_management",
  circulating_management: "returned_from_management",
};

type Claim = any;
type Note = { html: string; kind: "info" | "ok" | "warn" | "stop" } | null;

export default function Console() {
  const { sesi, memuat } = useSesi();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [circulating, setCirculating] = useState<any[]>([]);
  const [recon, setRecon] = useState<any[]>([]);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [lastHash, setLastHash] = useState<string | null>(null);
  const [lihatForm, setLihatForm] = useState(false);

  // Identitas ikut sendiri lewat cookie sesi; tidak ada lagi header yang dapat
  // dikarang untuk mengaku sebagai orang lain.
  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`/api${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; }
      if (!res.ok) throw Object.assign(new Error(body.title ?? "Gagal"), { body, status: res.status });
      return body;
    },
    [],
  );

  const refresh = useCallback(async () => {
    // Jejak audit tidak lagi ikut diambil di sini: ia punya menunya sendiri, dan
    // 40 baris terakhir tanpa penyaringan bukan jawaban atas pertanyaan apa pun
    // yang membuat orang membukanya.
    const [c, circ, rec] = await Promise.all([
      api("/claims"),
      api("/claims/circulating"),
      api("/reports/bank-reconciliation?min_age_days=0"),
    ]);
    setClaims(c);
    setCirculating(circ);
    setRecon(rec);
    setSelected((prev) => (c.some((x: Claim) => x.id === prev) ? prev : c[0]?.id ?? ""));
  }, [api]);

  // Menunggu sesi: memanggil API sebelum identitasnya pasti hanya menghasilkan
  // 401 dan pengalihan yang tidak perlu.
  useEffect(() => {
    if (sesi) refresh().catch(console.error);
  }, [sesi, refresh]);

  const current = claims.find((c) => c.id === selected);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e: any) {
      setNote({ kind: "stop",
                html: `<b>${e.body?.title ?? "Gagal"}</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const act = (path: string, body: unknown, ok = "Berhasil.") =>
    run(async () => {
      await api(`/claims/${selected}/${path}`,
                { method: "POST", body: JSON.stringify(body) });
      setNote({ kind: "ok", html: ok });
      await refresh();
    });

  const demo = () => run(async () => {
    const r = await api("/demo/run-flow", { method: "POST" });
    if (r.error) { setNote({ kind: "warn", html: `<b>Tidak dapat dijalankan</b>${r.error}` }); return; }
    setNote({ kind: "ok", html:
      `<b>Klaim ${r.claim_number} siap ditandatangani</b>
       Link WhatsApp: <a href="/sign/${r.token}" target="_blank">/sign/${r.token}</a><br>
       Kode OTP (hanya demo): <b>${r.otp}</b><br>
       Nominal dikoreksi Finance — agent akan melihat selisih dan alasannya sebelum tanda tangan.` });
    await refresh();
  });

  const testGate = () => run(async () => {
    const target = claims.find((c) => c.status === "pending_tax_verification")
                ?? claims.find((c) => c.status === "draft");
    if (!target) { setNote({ kind: "warn", html: "Tidak ada klaim yang belum diverifikasi pajak." }); return; }
    try {
      await api(`/claims/${target.id}/signature-requests`, { method: "POST", body: "{}" });
      setNote({ kind: "stop", html: "<b>Gate gagal menahan — ini bug</b>Seharusnya ditolak 409." });
    } catch (e: any) {
      setNote({ kind: "ok",
                html: `<b>Gate menahan sesuai BR-13 (HTTP ${e.status})</b>${e.body?.detail}` });
    }
  });

  const issueLink = () => run(async () => {
    const r = await api(`/claims/${selected}/signature-requests`,
                        { method: "POST", body: "{}" });
    setNote({ kind: "ok", html:
      `<b>Link terkirim ke ${r.masked_phone}</b>
       Pesan WhatsApp tidak memuat nominal maupun nama konsumen.<br>
       Buka: <a href="/sign/${r.token}" target="_blank">/sign/${r.token}</a><br>
       Kode OTP (hanya demo): <b>${r.otp_demo}</b>` });
    await refresh();
  });

  const printPkg = () => run(async () => {
    const r = await api(`/claims/${selected}/print-package`,
                        { method: "POST", body: "{}" });
    setLastHash(r.document_hash);
    setNote({ kind: "ok", html:
      `<b>Salinan #${r.copy_number} diterbitkan</b>${r.watermark}<br>
       Hash: <code>${String(r.document_hash).slice(0, 24)}…</code>
       ${r.superseded ? `<br>Salinan #${r.superseded} otomatis dibatalkan.` : ""}` });
    await refresh();
  });

  const settle = (dateStr?: string) => run(async () => {
    const all = await api("/payment-instructions");
    const open = all.filter((i: any) => i.claim_id === selected && i.status !== "paid");
    if (!open.length) { setNote({ kind: "warn", html: "Tidak ada instruksi transfer terbuka." }); return; }
    const r = await api("/payment-instructions/settlements", {
      method: "POST",
      body: JSON.stringify({
        instruction_ids: open.map((i: any) => i.id),
        transfer_date: dateStr ?? new Date().toISOString().slice(0, 10),
        proof_file: "bukti_transfer.pdf", reference_number: "TRF/DEMO/001" }),
    });
    setNote({ kind: "ok", html:
      `<b>Tanggal transfer tersimpan — periode ${r.recap_period}</b>
       ${r.overriding_rows_updated.length} baris rekap Overriding diperbarui otomatis.` });
    await refresh();
  });

  const actions: React.ReactNode[] = [];
  if (current) {
    const s = current.status;
    if (s === "pending_admin_review")
      actions.push(<button key="fw" className="pri" onClick={() => act("admin-review", { decision: "forward_to_tax" })}>Teruskan ke Finance Pajak</button>);
    if (s === "pending_tax_verification") {
      actions.push(<button key="tv" className="pri" onClick={() => act("tax-verification", { decision: "approve" })}>Setujui &amp; kunci nilai</button>);
      actions.push(<button key="tc" onClick={() => act("tax-verification", {
        decision: "approve_with_correction",
        corrected_amounts: { withholding_tax: current.withholding_tax * 2 },
        reason: "Penerima tidak memiliki NPWP aktif, tarif PPh menyesuaikan.",
      })}>Setujui dengan koreksi</button>);
    }
    if (s === "tax_verified")
      actions.push(<button key="lk" className="pri" onClick={issueLink}>Verifikasi &amp; kirim tautan ke Agent</button>);
    if (s === "signature_review_required")
      actions.push(<button key="sr" className="pri" onClick={() => act("signature-review", {
        decision: "approve_manually",
        reason: "Pola goresan konsisten dengan baseline, skor menaik tiap percobaan.",
      })}>Setujui manual</button>);
    if (s === "crosscheck_in_progress") {
      if (current.crosscheck_admin !== "completed")
        actions.push(<button key="ca" onClick={() => act("crosscheck", { party: "admin_sales", decision: "complete" })}>Crosscheck Admin Sales</button>);
      if (current.crosscheck_finance !== "completed")
        actions.push(<button key="cf" onClick={() => act("crosscheck", { party: "finance", decision: "complete" })}>Crosscheck Finance</button>);
      actions.push(<button key="ff" onClick={() => act("financial-findings", {
        reason: "Basis perhitungan keliru, PPN tidak seharusnya dikenakan.",
        affected_fields: ["vat"],
      }, "Tanda tangan dibatalkan. Klaim kembali ke antrean Finance (Pajak).")}>Laporkan temuan finansial</button>);
    }
    if (s === "ready_to_print" || s === "printed")
      actions.push(<button key="pp" className="pri" onClick={printPkg}>Terbitkan paket cetak</button>);
    if (NEXT_HANDOFF[s])
      actions.push(<button key="ho" onClick={() => act("offline-approval/handoffs", { event: NEXT_HANDOFF[s], received_by: "—" })}>Catat serah terima berikutnya</button>);
    if (s === "awaiting_scan_upload") {
      actions.push(<button key="sb" className="pri" onClick={() => act("offline-approval/return", {
        outcome: "approved", scanned_hash: lastHash ?? current.document_hash,
        copy_number: current.print_copy_number,
        head_finance_name: "Sri Handayani", management_name: "Andreas Lim",
      })}>Unggah pindaian bertanda tangan</button>);
      actions.push(<button key="sw" onClick={() => act("offline-approval/return", {
        outcome: "approved", scanned_hash: "hash-yang-salah",
        copy_number: current.print_copy_number,
        head_finance_name: "Sri Handayani", management_name: "Andreas Lim",
      })}>Uji: pindaian hash keliru</button>);
    }
    if (s === "awaiting_settlement_date") {
      actions.push(<button key="st" className="pri" onClick={() => settle()}>Input tanggal transfer</button>);
      actions.push(<button key="sf" onClick={() =>
        settle(new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10))
      }>Uji: tanggal masa depan</button>);
    }
  }

  // Tanpa sesi, useSesi sudah mengalihkan ke /login; jangan sempat menampilkan
  // kerangka halaman yang kosong sementara itu berlangsung.
  if (memuat || !sesi) {
    return (
      <div className="wrap narrow">
        <p className="hint" style={{ marginTop: 40 }}>Memeriksa sesi…</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Konsol Klaim Insentif</h1>
          <p>
            Next.js + PostgreSQL. Empat gate ditegakkan di server, bukan di layar ini —
            menyembunyikan tombol tidak menghentikan siapa pun yang memanggil API langsung.
          </p>
        </div>
        <div className="row" style={{ marginBottom: 0, alignItems: "flex-end" }}>
          <Nav peran={sesi.role} />
          <BilahPengguna sesi={sesi} />
        </div>
      </header>

      <div className="banner info sp">
        <b>Alur pengajuan</b>
        Admin mengajukan klaim → Form Pengajuan terbentuk → tim pajak memeriksa
        nilainya → setelah disetujui, Admin mengirim tautan ke Agent → Agent
        membaca formulirnya, mengunggah Kwitansi dan Invoice, lalu menandatangani
        pada kolom Pemohon. Tombol di bawah menjalankan satu klaim sampai langkah
        tanda tangan untuk keperluan pengujian.
      </div>

      <div className="row sp">
        <button className="pri" onClick={demo} disabled={busy}>Jalankan alur sampai tanda tangan</button>
        <button onClick={testGate} disabled={busy}>Uji gate: kirim link tanpa verifikasi pajak</button>
        <button onClick={() => { location.href = "/api/reports/master-report?format=xlsx"; }}>Unduh Laporan Master (.xlsx)</button>
        <button onClick={() => refresh()} disabled={busy}>Muat ulang</button>
      </div>

      {note && (
        <div className={`banner ${note.kind}`} dangerouslySetInnerHTML={{ __html: note.html }} />
      )}

      <div className="grid sp">
        <div className="panel">
          <h2>Daftar klaim <span className="pill">{claims.length} klaim</span></h2>
          <table>
            <tbody>
              <tr><th>Nomor</th><th>Jenis / peran</th><th>Unit</th><th>Nilai</th><th>Status</th></tr>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.claim_number}</b></td>
                  <td>{c.claim_type}<br /><span style={{ color: "var(--mut)" }}>{c.recipient_role}</span></td>
                  <td>{c.unit?.code ?? "-"}</td>
                  <td className="n">{rp(c.net_amount)}</td>
                  <td><span className={`pill ${STATUS_PILL[c.status] ?? ""}`}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Aksi pada klaim terpilih</h2>
          <div className="lbl">Klaim</div>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}
                  style={{ width: "100%", marginBottom: 10 }}>
            {claims.map((c) => (
              <option key={c.id} value={c.id}>{c.claim_number} — {c.status}</option>
            ))}
          </select>
          {current ? (
            <>
              <table>
                <tbody>
                  <tr><td>Nilai bersih</td><td className="n">{rp(current.net_amount)}</td></tr>
                  <tr><td>Verifikasi pajak</td><td className="n">{current.tax_verified_by ?? "—"}</td></tr>
                  <tr><td>Tanda tangan</td><td className="n">{current.signature_score ? `skor ${current.signature_score}` : "—"}</td></tr>
                  <tr><td>Crosscheck</td><td className="n">{current.crosscheck_admin} / {current.crosscheck_finance}</td></tr>
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 12 }}>{actions}</div>

              {/* Lampiran yang diunggah agent lewat tautan tanda tangan.
                  Ditampilkan di sini, bukan hanya di dalam formulir, karena
                  inilah yang dibuka Finance sebelum membayar. */}
              <div className="lbl" style={{ marginTop: 12 }}>
                Lampiran dari Agent
              </div>
              <ul className="lampiran">
                {(current.documents ?? []).filter((d: any) => d.file_name).length ? (
                  current.documents.filter((d: any) => d.file_name).map((d: any) => (
                    <li key={d.id}>
                      <span>
                        {d.has_content ? (
                          <a href={`/api/claims/${current.id}/documents/${d.id}`}>
                            {d.file_name}
                          </a>
                        ) : d.file_name}
                        <br />
                        <span className="meta">{d.checklist_item}</span>
                      </span>
                      <span className="meta">
                        {d.has_content
                          ? `${Math.max(1, Math.round((d.size_bytes ?? 0) / 1024))} KB`
                          : "isi tidak tersimpan"}
                        {d.source === "agent" ? " · agent" : " · konsol"}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="kosong">
                    Belum ada lampiran. Agent mengunggahnya saat membuka tautan
                    tanda tangan.
                  </li>
                )}
              </ul>
              <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button onClick={() => setLihatForm((v) => !v)}>
                  {lihatForm ? "Tutup form pengajuan" : "Lihat form pengajuan"}
                </button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12 }}>
                <a href={`/audit?entity_id=${selected}`}>
                  Lihat jejak audit klaim ini →
                </a>
              </p>
            </>
          ) : <p style={{ color: "var(--mut)" }}>Belum ada klaim.</p>}
        </div>
      </div>

      {lihatForm && current && (
        <div className="panel sp">
          <h2>
            Form pengajuan
            <span className="pill">{current.claim_number}</span>
          </h2>
          <FormPengajuan klaim={current} />
          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button onClick={() => window.print()}>Cetak formulir</button>
          </div>
        </div>
      )}

      <div className="grid sp">
        <div className="panel">
          <h2>Dokumen beredar fisik</h2>
          <table><tbody>
            {circulating.length ? (
              <>
                <tr><th>Nomor</th><th>Salinan</th><th>Posisi</th><th>Umur</th></tr>
                {circulating.map((c) => (
                  <tr key={c.id}>
                    <td>{c.claim_number}</td><td>#{c.print_copy_number}</td>
                    <td>{c.physical_location ?? "-"}</td>
                    <td className="n">{c.age_days ?? 0} hari</td>
                  </tr>
                ))}
              </>
            ) : <tr><td style={{ color: "var(--mut)" }}>Tidak ada dokumen beredar.</td></tr>}
          </tbody></table>
        </div>

        <div className="panel">
          <h2>Rekonsiliasi bank <span className="pill warn">belum dikonfirmasi</span></h2>
          <table><tbody>
            {recon.length ? (
              <>
                <tr><th>Nomor</th><th>Penerima</th><th>Nilai</th><th>Umur</th></tr>
                {recon.map((r) => (
                  <tr key={r.id}>
                    <td>{r.claim_number}</td><td>{r.recipient_name ?? "-"}</td>
                    <td className="n">{rp(r.amount)}</td><td className="n">{r.age} hari</td>
                  </tr>
                ))}
              </>
            ) : <tr><td style={{ color: "var(--ok)" }}>Semua instruksi sudah dikonfirmasi tanggalnya.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

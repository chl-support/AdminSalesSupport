"use client";

import { useCallback, useEffect, useState } from "react";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;

const STATUS_PILL: Record<string, string> = {
  paid: "ok", completed: "ok", rejected: "stop",
  pending_tax_verification: "warn", signature_review_required: "warn",
  awaiting_signature: "warn", awaiting_settlement_date: "warn",
};

const USERS = [
  ["admin", "Admin Sales"], ["ratna", "Finance (Pajak)"],
  ["ratih", "Finance (Pembayaran)"], ["fmanager", "Finance Manager"],
  ["mgmt", "Management"], ["sysadmin", "Admin Sistem"],
];

const NEXT_HANDOFF: Record<string, string> = {
  printed: "handed_to_head_finance",
  circulating_head_finance: "handed_to_management",
  circulating_management: "returned_from_management",
};

type Claim = any;
type Note = { html: string; kind: "info" | "ok" | "warn" | "stop" } | null;

export default function Console() {
  const [user, setUser] = useState("admin");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [circulating, setCirculating] = useState<any[]>([]);
  const [recon, setRecon] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [lastHash, setLastHash] = useState<string | null>(null);

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`/api${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", "X-User": user,
                   ...(init.headers ?? {}) },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.title ?? "Gagal"), { body, status: res.status });
      return body;
    },
    [user],
  );

  const refresh = useCallback(async () => {
    const [c, circ, rec, audit] = await Promise.all([
      api("/claims"),
      api("/claims/circulating"),
      api("/reports/bank-reconciliation?min_age_days=0"),
      api("/audit?limit=40"),
    ]);
    setClaims(c);
    setCirculating(circ);
    setRecon(rec);
    setLog(audit);
    setSelected((prev) => (c.some((x: Claim) => x.id === prev) ? prev : c[0]?.id ?? ""));
  }, [api]);

  useEffect(() => { refresh().catch(console.error); }, [refresh]);

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
      actions.push(<button key="lk" className="pri" onClick={issueLink}>Kirim link tanda tangan</button>);
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

  return (
    <div className="wrap">
      <header style={{ padding: "34px 0 20px", borderBottom: "2px solid var(--ink)",
                       marginBottom: 22, display: "flex", justifyContent: "space-between",
                       alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h1>Konsol Klaim Insentif</h1>
          <p style={{ margin: "4px 0 0", color: "var(--sub)", fontSize: 13.5, maxWidth: "60ch" }}>
            Next.js + PostgreSQL. Empat gate ditegakkan di server, bukan di layar ini —
            menyembunyikan tombol tidak menghentikan siapa pun yang memanggil API langsung.
          </p>
        </div>
        <div>
          <div className="lbl">Masuk sebagai</div>
          <select value={user} onChange={(e) => setUser(e.target.value)}>
            {USERS.map(([u, label]) => <option key={u} value={u}>{u} — {label}</option>)}
          </select>
        </div>
      </header>

      <div className="banner info sp">
        <b>Demo alur penuh</b>
        Tombol di bawah menjalankan satu klaim dari pengajuan sampai siap tanda tangan,
        lalu menampilkan tautan WhatsApp yang biasanya dikirim ke agent.
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
            </>
          ) : <p style={{ color: "var(--mut)" }}>Belum ada klaim.</p>}
        </div>
      </div>

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

      <div className="panel">
        <h2>Jejak audit <span className="pill">append-only</span></h2>
        <div className="log">
          {log.length
            ? log.map((a) =>
                `${String(a.occurred_at).slice(0, 19).replace("T", " ")}  ` +
                `${(a.actor ?? "system").padEnd(10)} ${a.action}` +
                `${a.reason ? `  // ${a.reason}` : ""}`).join("\n")
            : "belum ada entri"}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { useKata } from "../bahasa";
import { FormPengajuan } from "../klaim/form-pengajuan";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

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

/**
 * Kata-kata layar ini. Yang dikirim ke server sebagai data — misalnya `reason`
 * pada koreksi pajak dan temuan finansial — sengaja tidak ikut: nilainya
 * tersimpan di basis data dan terbaca kembali oleh siapa pun yang membuka
 * jejak audit, jadi ia tidak boleh berubah mengikuti bahasa layar orang yang
 * kebetulan menekan tombolnya.
 */
const KATA = {
  id: {
    judul: "Approval / Persetujuan",
    pengantar:
      "Pengajuan Yang Sedang Dalam Proses Verifikasi Dan Persetujuan Oleh " +
      "Pihak Terkait Sebelum Dapat Dilanjutkan Ke Proses Berikutnya.",
    unduhMaster: "Unduh Laporan Master (.xlsx)",
    muatUlang: "Muat ulang",
    gagal: "Gagal",
    berhasil: "Berhasil.",
    otpDemo: "Kode OTP (hanya demo):",
    linkTerkirim: (nomor: string) => `Link terkirim ke ${nomor}`,
    pesanWaAman:
      "Pesan WhatsApp tidak memuat nominal maupun nama konsumen.",
    buka: "Buka:",
    salinanTerbit: (n: number) => `Salinan #${n} diterbitkan`,
    hash: "Hash:",
    salinanDibatalkan: (n: number) => `Salinan #${n} otomatis dibatalkan.`,
    takAdaInstruksi: "Tidak ada instruksi transfer terbuka.",
    tanggalTersimpan: (periode: string) =>
      `Tanggal transfer tersimpan — periode ${periode}`,
    barisRekap: (n: number) =>
      `${n} baris rekap Overriding diperbarui otomatis.`,
    ttdDibatalkan:
      "Tanda tangan dibatalkan. Klaim kembali ke antrean Finance (Pajak).",
    aksiTeruskan: "Teruskan ke Finance Pajak",
    aksiSetujuiKunci: "Setujui & kunci nilai",
    aksiSetujuiKoreksi: "Setujui dengan koreksi",
    aksiKirimTautan: "Verifikasi & kirim tautan ke Agent",
    aksiSetujuiManual: "Setujui manual",
    aksiCrossAdmin: "Crosscheck Admin Sales",
    aksiCrossFinance: "Crosscheck Finance",
    aksiTemuan: "Laporkan temuan finansial",
    aksiCetak: "Terbitkan paket cetak",
    aksiSerahTerima: "Catat serah terima berikutnya",
    aksiUnggahPindaian: "Unggah pindaian bertanda tangan",
    aksiUjiHash: "Uji: pindaian hash keliru",
    aksiInputTanggal: "Input tanggal transfer",
    aksiUjiTanggal: "Uji: tanggal masa depan",
    daftarKlaim: "Daftar klaim",
    nKlaim: (n: number) => `${n} klaim`,
    thNomor: "Nomor", thJenisPeran: "Jenis / peran", thUnit: "Unit",
    thNilai: "Nilai", thStatus: "Status",
    aksiPada: "Aksi pada klaim terpilih",
    klaim: "Klaim",
    nilaiBersih: "Nilai bersih", verifPajak: "Verifikasi pajak",
    tandaTangan: "Tanda tangan", skor: (n: number) => `skor ${n}`,
    crosscheck: "Crosscheck",
    lampiranAgent: "Lampiran dari Agent",
    isiTakTersimpan: "isi tidak tersimpan",
    unduh: "unduh",
    dariAgent: " · agent", dariKonsol: " · konsol",
    belumAdaLampiran:
      "Belum ada lampiran. Agent mengunggahnya saat membuka tautan tanda tangan.",
    tutupForm: "Tutup form pengajuan", lihatForm: "Lihat form pengajuan",
    lihatAudit: "Lihat jejak audit klaim ini →",
    belumAdaKlaim: "Belum ada klaim.",
    formPengajuan: "Form pengajuan",
    cetakFormulir: "Cetak formulir",
    thPenerima: "Penerima",
  },
  en: {
    judul: "Approval Status",
    pengantar:
      "Submissions undergoing verification and approval by the parties " +
      "concerned",
    unduhMaster: "Download Master Report (.xlsx)",
    muatUlang: "Reload",
    gagal: "Failed",
    berhasil: "Done.",
    otpDemo: "OTP code (demo only):",
    linkTerkirim: (nomor: string) => `Link sent to ${nomor}`,
    pesanWaAman:
      "The WhatsApp message contains neither the amount nor the buyer's name.",
    buka: "Open:",
    salinanTerbit: (n: number) => `Copy #${n} issued`,
    hash: "Hash:",
    salinanDibatalkan: (n: number) => `Copy #${n} was cancelled automatically.`,
    takAdaInstruksi: "There is no open transfer instruction.",
    tanggalTersimpan: (periode: string) =>
      `Transfer date saved — period ${periode}`,
    barisRekap: (n: number) =>
      `${n} Overriding recap rows were updated automatically.`,
    ttdDibatalkan:
      "The signature was voided. The claim returns to the Finance (Tax) queue.",
    aksiTeruskan: "Forward to Finance Tax",
    aksiSetujuiKunci: "Approve & lock the amount",
    aksiSetujuiKoreksi: "Approve with correction",
    aksiKirimTautan: "Verify & send link to the Agent",
    aksiSetujuiManual: "Approve manually",
    aksiCrossAdmin: "Crosscheck Admin Sales",
    aksiCrossFinance: "Crosscheck Finance",
    aksiTemuan: "Report a financial finding",
    aksiCetak: "Issue print package",
    aksiSerahTerima: "Record the next handover",
    aksiUnggahPindaian: "Upload the signed scan",
    aksiUjiHash: "Test: scan with the wrong hash",
    aksiInputTanggal: "Enter transfer date",
    aksiUjiTanggal: "Test: future date",
    daftarKlaim: "Claim list",
    nKlaim: (n: number) => `${n} claims`,
    thNomor: "Number", thJenisPeran: "Type / role", thUnit: "Unit",
    thNilai: "Amount", thStatus: "Status",
    aksiPada: "Actions on the selected claim",
    klaim: "Claim",
    nilaiBersih: "Net amount", verifPajak: "Tax verification",
    tandaTangan: "Signature", skor: (n: number) => `score ${n}`,
    crosscheck: "Crosscheck",
    lampiranAgent: "Attachments from the Agent",
    isiTakTersimpan: "contents not stored",
    unduh: "download",
    dariAgent: " · agent", dariKonsol: " · console",
    belumAdaLampiran:
      "No attachments yet. The Agent uploads them when opening the signing link.",
    tutupForm: "Close submission form", lihatForm: "View submission form",
    lihatAudit: "View this claim's audit trail →",
    belumAdaKlaim: "No claims yet.",
    formPengajuan: "Submission form",
    cetakFormulir: "Print the form",
    thPenerima: "Recipient",
  },
};

type Claim = any;
type Note = { html: string; kind: "info" | "ok" | "warn" | "stop" } | null;

export default function Console() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selected, setSelected] = useState<string>("");
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
      if (!res.ok) throw Object.assign(new Error(body.title ?? "Gagal"),
                                       { body, status: res.status });
      return body;
    },
    [],
  );

  const refresh = useCallback(async () => {
    // Jejak audit tidak lagi ikut diambil di sini: ia punya menunya sendiri, dan
    // 40 baris terakhir tanpa penyaringan bukan jawaban atas pertanyaan apa pun
    // yang membuat orang membukanya.
    // Dua panel bawah — dokumen beredar fisik dan rekonsiliasi bank — dibuang
    // dari layar ini: yang pertama sudah punya menunya sendiri (Sirkulasi
    // Dokumen), yang kedua pekerjaan Finance, bukan pekerjaan siapa pun yang
    // membuka konsol klaim. Panggilan datanya ikut, supaya layar ini tidak
    // menarik dua kueri untuk isi yang tidak ditampilkannya.
    const c = await api("/claims");
    setClaims(c);
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
                html: `<b>${e.body?.title ?? k.gagal}</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const act = (path: string, body: unknown, ok = k.berhasil) =>
    run(async () => {
      await api(`/claims/${selected}/${path}`,
                { method: "POST", body: JSON.stringify(body) });
      setNote({ kind: "ok", html: ok });
      await refresh();
    });

  const issueLink = () => run(async () => {
    const r = await api(`/claims/${selected}/signature-requests`,
                        { method: "POST", body: "{}" });
    setNote({ kind: "ok", html:
      `<b>${k.linkTerkirim(r.masked_phone)}</b>
       ${k.pesanWaAman}<br>
       ${k.buka} <a href="/sign/${r.token}" target="_blank">/sign/${r.token}</a><br>
       ${k.otpDemo} <b>${r.otp_demo}</b>` });
    await refresh();
  });

  const printPkg = () => run(async () => {
    const r = await api(`/claims/${selected}/print-package`,
                        { method: "POST", body: "{}" });
    setLastHash(r.document_hash);
    setNote({ kind: "ok", html:
      `<b>${k.salinanTerbit(r.copy_number)}</b>${r.watermark}<br>
       ${k.hash} <code>${String(r.document_hash).slice(0, 24)}…</code>
       ${r.superseded ? `<br>${k.salinanDibatalkan(r.superseded)}` : ""}` });
    await refresh();
  });

  const settle = (dateStr?: string) => run(async () => {
    const all = await api("/payment-instructions");
    const open = all.filter((i: any) => i.claim_id === selected && i.status !== "paid");
    if (!open.length) { setNote({ kind: "warn", html: k.takAdaInstruksi }); return; }
    const r = await api("/payment-instructions/settlements", {
      method: "POST",
      body: JSON.stringify({
        instruction_ids: open.map((i: any) => i.id),
        transfer_date: dateStr ?? new Date().toISOString().slice(0, 10),
        proof_file: "bukti_transfer.pdf", reference_number: "TRF/DEMO/001" }),
    });
    setNote({ kind: "ok", html:
      `<b>${k.tanggalTersimpan(r.recap_period)}</b>
       ${k.barisRekap(r.overriding_rows_updated.length)}` });
    await refresh();
  });

  const actions: React.ReactNode[] = [];
  if (current) {
    const s = current.status;
    if (s === "pending_admin_review")
      actions.push(<button key="fw" className="pri" onClick={() => act("admin-review", { decision: "forward_to_tax" })}>{k.aksiTeruskan}</button>);
    if (s === "pending_tax_verification") {
      actions.push(<button key="tv" className="pri" onClick={() => act("tax-verification", { decision: "approve" })}>{k.aksiSetujuiKunci}</button>);
      actions.push(<button key="tc" onClick={() => act("tax-verification", {
        decision: "approve_with_correction",
        corrected_amounts: { withholding_tax: current.withholding_tax * 2 },
        reason: "Penerima tidak memiliki NPWP aktif, tarif PPh menyesuaikan.",
      })}>{k.aksiSetujuiKoreksi}</button>);
    }
    // Tautan ke Sales/Agent hanya dikirim Admin Sales. Tombolnya ikut hilang
    // bagi peran lain: tombol yang selalu berakhir 403 bukan pembatasan, itu
    // jebakan — yang menekannya mengira pekerjaannya sudah dilakukan.
    if (s === "tax_verified" && sesi?.role === "admin_sales")
      actions.push(<button key="lk" className="pri" onClick={issueLink}>{k.aksiKirimTautan}</button>);
    if (s === "signature_review_required")
      actions.push(<button key="sr" className="pri" onClick={() => act("signature-review", {
        decision: "approve_manually",
        reason: "Pola goresan konsisten dengan baseline, skor menaik tiap percobaan.",
      })}>{k.aksiSetujuiManual}</button>);
    if (s === "crosscheck_in_progress") {
      if (current.crosscheck_admin !== "completed")
        actions.push(<button key="ca" onClick={() => act("crosscheck", { party: "admin_sales", decision: "complete" })}>{k.aksiCrossAdmin}</button>);
      if (current.crosscheck_finance !== "completed")
        actions.push(<button key="cf" onClick={() => act("crosscheck", { party: "finance", decision: "complete" })}>{k.aksiCrossFinance}</button>);
      actions.push(<button key="ff" onClick={() => act("financial-findings", {
        reason: "Basis perhitungan keliru, PPN tidak seharusnya dikenakan.",
        affected_fields: ["vat"],
      }, k.ttdDibatalkan)}>{k.aksiTemuan}</button>);
    }
    if (s === "ready_to_print" || s === "printed")
      actions.push(<button key="pp" className="pri" onClick={printPkg}>{k.aksiCetak}</button>);
    if (NEXT_HANDOFF[s])
      actions.push(<button key="ho" onClick={() => act("offline-approval/handoffs", { event: NEXT_HANDOFF[s], received_by: "—" })}>{k.aksiSerahTerima}</button>);
    if (s === "awaiting_scan_upload") {
      actions.push(<button key="sb" className="pri" onClick={() => act("offline-approval/return", {
        outcome: "approved", scanned_hash: lastHash ?? current.document_hash,
        copy_number: current.print_copy_number,
        head_finance_name: "Sri Handayani", management_name: "Andreas Lim",
      })}>{k.aksiUnggahPindaian}</button>);
      actions.push(<button key="sw" onClick={() => act("offline-approval/return", {
        outcome: "approved", scanned_hash: "hash-yang-salah",
        copy_number: current.print_copy_number,
        head_finance_name: "Sri Handayani", management_name: "Andreas Lim",
      })}>{k.aksiUjiHash}</button>);
    }
    if (s === "awaiting_settlement_date") {
      actions.push(<button key="st" className="pri" onClick={() => settle()}>{k.aksiInputTanggal}</button>);
      actions.push(<button key="sf" onClick={() =>
        settle(new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10))
      }>{k.aksiUjiTanggal}</button>);
    }
  }

  // Tanpa sesi, useSesi sudah mengalihkan ke /login; jangan sempat menampilkan
  // kerangka halaman yang kosong sementara itu berlangsung.
  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      {/* Dua tombol saja. Yang dibuang: "Jalankan alur sampai tanda tangan"
          dan "Uji gate" — keduanya alat uji yang membuat klaim sungguhan pada
          basis data sungguhan, dan keterangan alur di atasnya yang menjelaskan
          cara memakainya. Keadaan tiap klaim sekarang terbaca sebagai kalimat
          di layar Approval / Persetujuan; konsol ini tempat menindaklanjuti,
          bukan tempat mempelajari alurnya. */}
      <div className="row sp">
        <button onClick={() => { location.href = "/api/reports/master-report?format=xlsx"; }}>{k.unduhMaster}</button>
        <button onClick={() => refresh()} disabled={busy}>{k.muatUlang}</button>
      </div>

      {note && (
        <div className={`banner ${note.kind}`} dangerouslySetInnerHTML={{ __html: note.html }} />
      )}

      <div className="grid sp">
        <div className="panel">
          <h2>{k.daftarKlaim} <span className="pill">{k.nKlaim(claims.length)}</span></h2>
          <table>
            <tbody>
              <tr><th>{k.thNomor}</th><th>{k.thJenisPeran}</th><th>{k.thUnit}</th>
                  <th>{k.thNilai}</th><th>{k.thStatus}</th></tr>
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
          <h2>{k.aksiPada}</h2>
          <div className="lbl">{k.klaim}</div>
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
                  <tr><td>{k.nilaiBersih}</td><td className="n">{rp(current.net_amount)}</td></tr>
                  <tr><td>{k.verifPajak}</td><td className="n">{current.tax_verified_by ?? "—"}</td></tr>
                  <tr><td>{k.tandaTangan}</td><td className="n">
                    {current.signature_score ? k.skor(current.signature_score) : "—"}
                  </td></tr>
                  <tr><td>{k.crosscheck}</td><td className="n">{current.crosscheck_admin} / {current.crosscheck_finance}</td></tr>
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 12 }}>{actions}</div>

              {/* Lampiran yang diunggah agent lewat tautan tanda tangan.
                  Ditampilkan di sini, bukan hanya di dalam formulir, karena
                  inilah yang dibuka Finance sebelum membayar. */}
              <div className="lbl" style={{ marginTop: 12 }}>
                {k.lampiranAgent}
              </div>
              <ul className="lampiran">
                {(current.documents ?? []).filter((d: any) => d.file_name).length ? (
                  current.documents.filter((d: any) => d.file_name).map((d: any) => (
                    <li key={d.id}>
                      <span>
                        {/* Dibuka di tab tersendiri, bukan diunduh: tim pajak
                            memeriksa sepuluh lampiran per klaim, dan sepuluh
                            berkas yang mendarat di folder Download lalu dibuka
                            satu per satu dari sana bukan pemeriksaan. Unduhannya
                            tetap ada, di sebelahnya. */}
                        {d.has_content ? (
                          <>
                            <a href={`/api/claims/${current.id}/documents/${d.id}?pratinjau=1`}
                               target="_blank" rel="noreferrer">
                              {d.file_name}
                            </a>
                            <a className="meta unduh"
                               href={`/api/claims/${current.id}/documents/${d.id}`}>
                              {k.unduh}
                            </a>
                          </>
                        ) : d.file_name}
                        <br />
                        <span className="meta">{d.checklist_item}</span>
                      </span>
                      <span className="meta">
                        {d.has_content
                          ? `${Math.max(1, Math.round((d.size_bytes ?? 0) / 1024))} KB`
                          : k.isiTakTersimpan}
                        {d.source === "agent" ? k.dariAgent : k.dariKonsol}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="kosong">
                    {k.belumAdaLampiran}
                  </li>
                )}
              </ul>
              <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button onClick={() => setLihatForm((v) => !v)}>
                  {lihatForm ? k.tutupForm : k.lihatForm}
                </button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12 }}>
                <a href={`/audit?entity_id=${selected}`}>
                  {k.lihatAudit}
                </a>
              </p>
            </>
          ) : <p style={{ color: "var(--mut)" }}>{k.belumAdaKlaim}</p>}
        </div>
      </div>

      {lihatForm && current && (
        <div className="panel sp">
          <h2>
            {k.formPengajuan}
            <span className="pill">{current.claim_number}</span>
          </h2>
          <FormPengajuan klaim={current} />
          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button onClick={() => window.print()}>{k.cetakFormulir}</button>
          </div>
        </div>
      )}

    </Kerangka>
  );
}

"use client";

/**
 * Layar tanda tangan agent.
 *
 * Dibuka orang luar dari tautan WhatsApp, biasanya di ponsel, oleh orang yang
 * tidak pernah melihat konsol. Karena itu urutannya dibuat kelihatan: ada empat
 * langkah, dan selalu jelas sedang di langkah mana.
 *
 * Yang ditandatangani ditampilkan utuh — Form Pengajuan yang sama persis dengan
 * yang akan dicetak, hanya untuk dibaca. Sebelumnya agent hanya melihat empat
 * baris nominal, jadi yang ia setujui bukan formulirnya melainkan ringkasan yang
 * dibuat layar ini sendiri. Tanda tangannya lalu ditempelkan pada kolom Pemohon
 * dan diperlihatkan menempel di situ sebelum dikirim, bukan sesudahnya.
 *
 * Lampiran diminta sebelum tanda tangan, bukan sesudah: begitu tanda tangan
 * diterima, dokumen disegel, dan berkas yang menyusul kemudian menempel pada
 * sesuatu yang sudah ditandatangani tanpa memuatnya.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { FormPengajuan } from "../../klaim/form-pengajuan";
import { KanvasTtd, usePadTtd } from "../../ttd-pad";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;
const kb = (n?: number | null) => `${Math.max(1, Math.round((n ?? 0) / 1024))} KB`;

/** Berkas yang diminta. Dua yang pertama wajib; Finance tidak dapat membayar
 *  tanpa kwitansi dan invoice-nya. */
const BERKAS = [
  { item: "Kwitansi", wajib: true },
  { item: "Invoice", wajib: true },
  { item: "Dokumen pendukung lainnya", wajib: false },
];

const BATAS = 3 * 1024 * 1024;

type Step = "loading" | "otp" | "review" | "berkas" | "sign" | "konfirmasi"
          | "dispute" | "done";

const LANGKAH: { key: Step; no: string; label: string }[] = [
  { key: "otp", no: "1", label: "Verifikasi" },
  { key: "review", no: "2", label: "Periksa formulir" },
  { key: "berkas", no: "3", label: "Unggah berkas" },
  { key: "sign", no: "4", label: "Tanda tangan" },
];

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>("loading");
  const [ctx, setCtx] = useState<any>(null);
  const [otp, setOtp] = useState("");
  const [otpHint, setOtpHint] = useState("");
  const [feedback, setFeedback] = useState<{ kind: string; html: string } | null>(null);
  const [done, setDone] = useState<{ kind: string; html: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dokumen, setDokumen] = useState<any[]>([]);
  const [unggahHint, setUnggahHint] = useState<string | null>(null);
  const [pratinjauTtd, setPratinjauTtd] = useState<string | null>(null);

  const pad = usePadTtd();

  const api = async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" }, ...init,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.title ?? "Gagal"), { body });
    return body;
  };

  const load = async () => {
    try {
      const d = await api(`/api/signing-sessions/${token}`);
      setCtx(d);
      setDokumen(d.claim?.documents ?? []);
      setStep((s) =>
        s === "loading" || s === "otp" ? (d.otp_verified ? "review" : "otp") : s);
    } catch (e: any) {
      setError(e.body?.detail ?? "Silakan minta tautan baru ke Admin.");
      setStep("done");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const verifyOtp = async () => {
    setBusy(true);
    try {
      await api(`/api/signing-sessions/${token}/otp/verify`,
                { method: "POST", body: JSON.stringify({ code: otp.trim() }) });
      await load();
      setStep("review");
    } catch (e: any) {
      setOtpHint(e.body?.detail ?? "Kode salah.");
    } finally { setBusy(false); }
  };

  /** Baca berkas menjadi data URL. Isinya ikut dikirim, bukan hanya namanya. */
  const unggah = async (item: string, file: File) => {
    setUnggahHint(null);
    if (file.size > BATAS) {
      setUnggahHint(`${file.name} berukuran ` +
        `${(file.size / 1024 / 1024).toFixed(1)} MB, melebihi batas 3 MB. ` +
        "Perkecil pindaian atau kirim per halaman.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(new Error("Berkas tidak dapat dibaca."));
        fr.readAsDataURL(file);
      });
      await api(`/api/signing-sessions/${token}/documents`, {
        method: "POST",
        body: JSON.stringify({
          checklist_item: item, file_name: file.name,
          content_type: file.type, content_base64: dataUrl }),
      });
      const d = await api(`/api/signing-sessions/${token}/documents`);
      setDokumen(d.documents ?? []);
    } catch (e: any) {
      setUnggahHint(e.body?.detail ?? "Berkas gagal diunggah.");
    } finally { setBusy(false); }
  };

  const tempel = () => {
    if (pad.kosong()) {
      setFeedback({ kind: "warn", html:
        "<b>Belum ada tanda tangan</b>Tanda tangani di dalam kotak terlebih dahulu." });
      return;
    }
    setFeedback(null);
    setPratinjauTtd(pad.dataUrl());
    setStep("konfirmasi");
  };

  const submit = async () => {
    if (!pratinjauTtd) return;
    setBusy(true);
    try {
      const r = await api(`/api/signing-sessions/${token}/signature`, {
        method: "POST",
        body: JSON.stringify({
          image_png: pratinjauTtd,
          strokes: pad.goresan(), input_method: pad.metode() }),
      });
      if (r.outcome === "verified") {
        setDone({ kind: "ok", html:
          `<b>Tanda tangan terverifikasi — skor ${r.score}</b>
           Tanda tangan Anda sudah menempel pada kolom Pemohon. Dokumen disegel
           dan diteruskan ke pemeriksaan Admin Sales dan Finance.` });
        setStep("done");
      } else if (r.outcome === "retry") {
        setFeedback({ kind: "stop", html:
          `<b>Belum cocok — skor ${r.score}, ambang ${r.threshold}</b>
           Tanda tangan Anda tersimpan dan tidak dikirim ke mana pun.
           Sisa percobaan: ${r.attempts_remaining}.<br>
           ${r.guidance.map((g: string) => `• ${g}`).join("<br>")}` });
        setPratinjauTtd(null);
        setStep("sign");
        pad.hapus();
        await load();
      } else {
        // Alasannya dibawa dari server bila ada: "setelah tiga percobaan" akan
        // keliru untuk penerima yang memang belum punya spesimen terdaftar.
        setDone({ kind: "warn", html: r.guidance?.length
          ? `<b>Diteruskan ke pemeriksaan Admin</b>
             ${r.guidance.map((g: string) => g).join("<br>")}`
          : `<b>Diteruskan ke pemeriksaan Admin</b>
             Setelah tiga percobaan, tanda tangan Anda diperiksa langsung oleh Admin Sales.
             Klaim Anda <b>tidak ditolak</b> — Anda akan dihubungi untuk langkah berikutnya.` });
        setStep("done");
      }
    } catch (e: any) {
      setFeedback({ kind: "stop", html:
        `<b>Gagal mengirim</b>${e.body?.detail ?? "Coba ulangi."}` });
      setStep("sign");
    } finally { setBusy(false); }
  };

  const sendDispute = async () => {
    setBusy(true);
    try {
      await api(`/api/signing-sessions/${token}/dispute`,
                { method: "POST", body: JSON.stringify({ reason }) });
      setDone({ kind: "ok", html:
        `<b>Sanggahan terkirim</b>
         Klaim dikembalikan ke Finance untuk diperiksa ulang. Anda akan menerima
         tautan baru bila nominalnya sudah disesuaikan.` });
      setStep("done");
    } catch (e: any) {
      setFeedback({ kind: "stop", html:
        `<b>Sanggahan gagal terkirim</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const claim = ctx?.claim;
  const tv = ctx?.tax_verification;

  const punya = (item: string) => dokumen.filter((d) => d.checklist_item === item);
  const kurang = BERKAS.filter((b) => b.wajib && !punya(b.item).length);

  // Penanda langkah. Yang sudah lewat ditandai selesai, bukan sekadar tidak
  // aktif: agent perlu tahu berkas yang tadi diunggah sudah benar-benar masuk.
  const urutan = LANGKAH.map((l) => l.key);
  const kini = step === "konfirmasi" ? "sign" : step;
  const idx = urutan.indexOf(kini as Step);

  return (
    <div className="wrap-narrow">
      <header style={{ padding: "22px 0 16px", borderBottom: "1px solid var(--line)",
                       marginBottom: 18 }}>
        <h1 style={{ fontSize: 19 }}>
          {error ? "Tautan tidak berlaku"
                 : claim ? `Klaim ${claim.claim_number}` : "Memuat…"}
        </h1>
        <p style={{ margin: "3px 0 0", color: "var(--sub)", fontSize: 13 }}>
          {error ?? (claim ? `${claim.unit?.code} — ${claim.unit?.buyer_name}` : "")}
        </p>
      </header>

      {!error && step !== "done" && step !== "loading" && (
        <div className="langkah">
          {LANGKAH.map((l, i) => (
            <div key={l.key}
                 className={`lk ${i === idx ? "kini" : i < idx ? "usai" : ""}`}>
              <b>{i < idx ? "✓" : l.no}</b>{l.label}
            </div>
          ))}
        </div>
      )}

      {step === "otp" && (
        <section className="panel">
          <div className="banner info">
            <b>Masukkan kode verifikasi</b>
            Kami mengirim kode ke nomor WhatsApp terdaftar. Kode ini yang memastikan
            hanya Anda yang dapat menandatangani, meskipun tautan diteruskan ke orang lain.
          </div>
          <div className="lbl">Kode 6 digit</div>
          <input value={otp} onChange={(e) => setOtp(e.target.value)}
                 inputMode="numeric" maxLength={6} placeholder="••••••"
                 style={{ width: "100%", fontSize: 17, letterSpacing: ".3em",
                          textAlign: "center", padding: 11 }} />
          <button className="pri" onClick={verifyOtp} disabled={busy}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>Lanjut</button>
          {otpHint && <p style={{ fontSize: 11.5, color: "var(--stop)",
                                  textAlign: "center" }}>{otpHint}</p>}
        </section>
      )}

      {step === "review" && claim && (
        <section className="panel">
          <div className="banner ok">
            <b>Nilai sudah diverifikasi tim pajak</b>
            {tv?.verified_by ?? "-"} — {String(tv?.verified_at ?? "").slice(0, 10)}
          </div>
          {tv?.was_corrected && (
            <div className="banner warn">
              <b>Nominal berubah dari pengajuan</b>
              Semula {rp(tv.original_amounts?.net_amount)} → kini {rp(claim.net_amount)}.
              <br />Alasan: {tv.correction_reason}
            </div>
          )}

          <div className="lbl">Form Pengajuan — hanya untuk dibaca</div>
          <div className="form-lihat">
            <FormPengajuan klaim={claim} />
          </div>

          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr><td>Jumlah bruto</td><td className="n">{rp(claim.gross_amount)}</td></tr>
              <tr><td>PPN</td><td className="n">{rp(claim.vat)}</td></tr>
              <tr><td>Potongan {String(claim.withholding_tax_type ?? "").toUpperCase()}</td>
                  <td className="n">({rp(claim.withholding_tax)})</td></tr>
              <tr><td><b>Dibayarkan</b></td><td className="n"><b>{rp(claim.net_amount)}</b></td></tr>
            </tbody>
          </table>

          <button className="pri" onClick={() => setStep("berkas")}
                  style={{ width: "100%", marginTop: 12, padding: 13 }}>
            Sesuai — lanjut unggah berkas
          </button>
          <button onClick={() => setStep("dispute")}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>
            Ajukan sanggahan atas nominal
          </button>
        </section>
      )}

      {step === "berkas" && (
        <section className="panel">
          <div className="banner info">
            <b>Unggah Kwitansi dan Invoice</b>
            Berkas ikut tersimpan pada klaim ini dan dibaca Finance sebelum
            pembayaran. PDF atau foto, maksimal 3 MB per berkas.
          </div>

          {BERKAS.map((b) => {
            const ada = punya(b.item);
            return (
              <div key={b.item} style={{ marginBottom: 14 }}>
                <div className="lbl">
                  {b.item} {b.wajib
                    ? <span style={{ color: "var(--stop)" }}>· wajib</span>
                    : <span style={{ color: "var(--mut)" }}>· bila ada</span>}
                </div>
                <ul className="lampiran">
                  {ada.length ? ada.map((d) => (
                    <li key={d.id}>
                      <span>{d.file_name}</span>
                      <span className="meta">{kb(d.size_bytes)} · terunggah</span>
                    </li>
                  )) : <li className="kosong">Belum ada berkas.</li>}
                </ul>
                <input type="file" disabled={busy}
                       accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*"
                       onChange={(e) => {
                         const f = e.target.files?.[0];
                         e.target.value = "";
                         if (f) unggah(b.item, f);
                       }}
                       style={{ width: "100%", marginTop: 6, fontSize: 12.5 }} />
              </div>
            );
          })}

          {unggahHint && (
            <div className="banner stop"><b>Berkas belum tersimpan</b>{unggahHint}</div>
          )}
          {kurang.length > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--mut)" }}>
              Masih diperlukan: {kurang.map((b) => b.item).join(", ")}.
            </p>
          )}

          <button className="pri" onClick={() => setStep("sign")}
                  disabled={busy || kurang.length > 0}
                  style={{ width: "100%", marginTop: 4, padding: 13 }}>
            Lanjut ke tanda tangan
          </button>
          <button onClick={() => setStep("review")} disabled={busy}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>
            Kembali ke formulir
          </button>
        </section>
      )}

      {step === "sign" && (
        <section className="panel">
          <div className="lbl">
            Percobaan {4 - (ctx?.attempts_remaining ?? 3)} dari 3
          </div>
          <KanvasTtd pad={pad} tampil={step === "sign"} />
          <p style={{ fontSize: 11.5, color: "var(--mut)", textAlign: "center",
                      marginTop: 6 }}>
            Tanda tangani di dalam kotak. Tanda tangan ini akan menempel pada kolom
            Pemohon di Form Pengajuan. Gunakan stylus bila ada — goresan jari lebih
            bervariasi dan lebih sering perlu diulang.
          </p>
          {feedback && (
            <div className={`banner ${feedback.kind}`}
                 dangerouslySetInnerHTML={{ __html: feedback.html }} />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={pad.hapus} disabled={busy}
                    style={{ flex: 1, padding: 13 }}>Hapus</button>
            <button className="pri" onClick={tempel} disabled={busy}
                    style={{ flex: 1, padding: 13 }}>
              Tempelkan ke formulir
            </button>
          </div>
          <button onClick={() => setStep("berkas")} disabled={busy}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>
            Kembali ke berkas
          </button>
        </section>
      )}

      {step === "konfirmasi" && claim && (
        <section className="panel">
          <div className="banner info">
            <b>Periksa sekali lagi sebelum dikirim</b>
            Tanda tangan Anda sudah menempel pada kolom Pemohon di bawah. Setelah
            dikirim, formulir disegel dan tidak dapat diubah.
          </div>
          <div className="form-lihat">
            <FormPengajuan klaim={{ ...claim, documents: dokumen }}
                           ttdPemohon={pratinjauTtd} />
          </div>
          <button className="pri" onClick={submit} disabled={busy}
                  style={{ width: "100%", marginTop: 12, padding: 13 }}>
            Kirim tanda tangan
          </button>
          <button onClick={() => { setPratinjauTtd(null); setStep("sign"); }}
                  disabled={busy}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>
            Ulangi tanda tangan
          </button>
        </section>
      )}

      {step === "dispute" && (
        <section className="panel">
          <div className="banner info">
            <b>Sanggahan atas nominal</b>
            Klaim akan dikembalikan ke Finance untuk diperiksa ulang. Anda tidak perlu
            menandatangani angka yang Anda anggap keliru.
          </div>
          <div className="lbl">Alasan (minimal 10 karakter)</div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                    style={{ width: "100%", minHeight: 80 }} />
          {feedback && (
            <div className={`banner ${feedback.kind}`}
                 dangerouslySetInnerHTML={{ __html: feedback.html }} />
          )}
          <button className="pri" onClick={sendDispute} disabled={busy}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>
            Kirim sanggahan
          </button>
          <button onClick={() => setStep("review")} disabled={busy}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>Batal</button>
        </section>
      )}

      {step === "done" && done && (
        <section className="panel">
          <div className={`banner ${done.kind}`}
               dangerouslySetInnerHTML={{ __html: done.html }} />
          {done.kind === "ok" && claim && (
            <div className="form-lihat" style={{ marginTop: 12 }}>
              <FormPengajuan klaim={{ ...claim, documents: dokumen }}
                             ttdPemohon={pratinjauTtd} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

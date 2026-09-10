"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;

type Step = "loading" | "otp" | "review" | "sign" | "dispute" | "done";
type Stroke = { points: { x: number; y: number; t: number }[] };

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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const drawing = useRef(false);
  const t0 = useRef(0);
  const inputMethod = useRef("mouse");

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
      setStep(d.otp_verified ? "review" : "otp");
    } catch (e: any) {
      setError(e.body?.detail ?? "Silakan minta tautan baru ke Admin.");
      setStep("done");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  useEffect(() => {
    if (step !== "sign") return;
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
    const c2d = cv.getContext("2d")!;
    c2d.scale(dpr, dpr);
    c2d.lineWidth = 2.4;
    c2d.lineCap = "round";
    c2d.lineJoin = "round";
    c2d.strokeStyle = "#15171A";
    clear();
  }, [step]);

  const clear = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height);
    strokes.current = [];
    current.current = null;
    t0.current = 0;
  };

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const p = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if ("touches" in e) {
      inputMethod.current =
        (e.touches[0] as any).touchType === "stylus" ? "stylus" : "finger";
    }
    drawing.current = true;
    if (!t0.current) t0.current = Date.now();
    const p = pos(e);
    current.current = { points: [{ x: p.x, y: p.y, t: 0 }] };
    const c2d = canvasRef.current!.getContext("2d")!;
    c2d.beginPath();
    c2d.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    current.current!.points.push({ x: p.x, y: p.y, t: Date.now() - t0.current });
    const c2d = canvasRef.current!.getContext("2d")!;
    c2d.lineTo(p.x, p.y);
    c2d.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current && current.current.points.length > 1) {
      strokes.current.push(current.current);
    }
    current.current = null;
  };

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

  const submit = async () => {
    if (!strokes.current.length) { alert("Belum ada tanda tangan."); return; }
    setBusy(true);
    try {
      const r = await api(`/api/signing-sessions/${token}/signature`, {
        method: "POST",
        body: JSON.stringify({
          image_png: canvasRef.current!.toDataURL("image/png"),
          strokes: strokes.current, input_method: inputMethod.current }),
      });
      if (r.outcome === "verified") {
        setDone({ kind: "ok", html:
          `<b>Tanda tangan terverifikasi — skor ${r.score}</b>
           Dokumen sudah disegel dan diteruskan ke pemeriksaan Admin Sales dan Finance.` });
        setStep("done");
      } else if (r.outcome === "retry") {
        setFeedback({ kind: "stop", html:
          `<b>Belum cocok — skor ${r.score}, ambang ${r.threshold}</b>
           Tanda tangan Anda tersimpan dan tidak dikirim ke mana pun.
           Sisa percobaan: ${r.attempts_remaining}.<br>
           ${r.guidance.map((g: string) => `• ${g}`).join("<br>")}` });
        clear();
        await load();
        setStep("sign");
      } else {
        setDone({ kind: "warn", html:
          `<b>Diteruskan ke pemeriksaan Admin</b>
           Setelah tiga percobaan, tanda tangan Anda diperiksa langsung oleh Admin Sales.
           Klaim Anda <b>tidak ditolak</b> — Anda akan dihubungi untuk langkah berikutnya.` });
        setStep("done");
      }
    } catch (e: any) {
      alert(e.body?.detail ?? "Gagal mengirim tanda tangan.");
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
      alert(e.body?.detail ?? "Gagal mengirim sanggahan.");
    } finally { setBusy(false); }
  };

  const claim = ctx?.claim;
  const tv = ctx?.tax_verification;

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
            <b>Terverifikasi pajak</b>
            {tv.verified_by ?? "-"} — {String(tv.verified_at ?? "").slice(0, 10)}
          </div>
          {tv.was_corrected && (
            <div className="banner warn">
              <b>Nominal berubah dari pengajuan</b>
              Semula {rp(tv.original_amounts?.net_amount)} → kini {rp(claim.net_amount)}.
              <br />Alasan: {tv.correction_reason}
            </div>
          )}
          <table>
            <tbody>
              <tr><td>Jumlah bruto</td><td className="n">{rp(claim.gross_amount)}</td></tr>
              <tr><td>PPN</td><td className="n">{rp(claim.vat)}</td></tr>
              <tr><td>Potongan {String(claim.withholding_tax_type ?? "").toUpperCase()}</td>
                  <td className="n">({rp(claim.withholding_tax)})</td></tr>
              <tr><td><b>Dibayarkan</b></td><td className="n"><b>{rp(claim.net_amount)}</b></td></tr>
            </tbody>
          </table>
          <button className="pri" onClick={() => setStep("sign")}
                  style={{ width: "100%", marginTop: 12, padding: 13 }}>
            Setuju &amp; tanda tangan
          </button>
          <button onClick={() => setStep("dispute")}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>
            Ajukan sanggahan
          </button>
        </section>
      )}

      {step === "sign" && (
        <section className="panel">
          <div className="lbl">
            Percobaan {4 - (ctx?.attempts_remaining ?? 3)} dari 3
          </div>
          <canvas ref={canvasRef}
                  onMouseDown={start} onMouseMove={move} onMouseUp={end}
                  onMouseLeave={end} onTouchStart={start} onTouchMove={move}
                  onTouchEnd={end}
                  style={{ width: "100%", height: 180,
                           border: "1.5px dashed var(--sub)", background: "#FCFCFB",
                           touchAction: "none", display: "block" }} />
          <p style={{ fontSize: 11.5, color: "var(--mut)", textAlign: "center",
                      marginTop: 6 }}>
            Tanda tangani di dalam kotak. Gunakan stylus bila ada — goresan jari lebih
            bervariasi dan lebih sering perlu diulang.
          </p>
          {feedback && (
            <div className={`banner ${feedback.kind}`}
                 dangerouslySetInnerHTML={{ __html: feedback.html }} />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={clear} style={{ flex: 1, padding: 13 }}>Hapus</button>
            <button className="pri" onClick={submit} disabled={busy}
                    style={{ flex: 1, padding: 13 }}>Kirim</button>
          </div>
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
          <button className="pri" onClick={sendDispute} disabled={busy}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>
            Kirim sanggahan
          </button>
          <button onClick={() => setStep("review")}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>Batal</button>
        </section>
      )}

      {step === "done" && done && (
        <section className="panel">
          <div className={`banner ${done.kind}`}
               dangerouslySetInnerHTML={{ __html: done.html }} />
        </section>
      )}
    </div>
  );
}

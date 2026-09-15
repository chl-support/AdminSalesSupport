"use client";

/**
 * Pendaftaran spesimen tanda tangan, dibuka agent dari tautan.
 *
 * Inilah yang selama ini hilang: tanpa spesimen, tanda tangan agent pada klaim
 * tidak punya pembanding, skornya selalu 0, dan setiap klaim berakhir di
 * pemeriksaan manual. Layar ini yang mengumpulkan pembandingnya.
 *
 * Urutannya dibuat kelihatan, sama seperti layar tanda tangan klaim — tetapi di
 * sini ada satu langkah yang tidak ada di sana: persetujuan pemakaian data.
 * Tanda tangan adalah data pribadi, dan yang diambil di layar ini akan dipakai
 * menilai tanda tangannya berikutnya. Orangnya berhak tahu itu sebelum menggores,
 * bukan sesudah.
 *
 * Tiap goresan dicocokkan dengan goresan sebelumnya sebelum disimpan. Sepuluh
 * tanda tangan yang saling berbeda jauh bukan baseline — ia hanya memindahkan
 * ketidakpastian ke tahap tempat orangnya tidak hadir lagi untuk mengulang.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { KanvasTtd, usePadTtd } from "../../ttd-pad";

type Step = "loading" | "otp" | "setuju" | "rekam" | "done";

const LANGKAH: { key: Step; no: string; label: string }[] = [
  { key: "otp", no: "1", label: "Verifikasi" },
  { key: "setuju", no: "2", label: "Persetujuan" },
  { key: "rekam", no: "3", label: "Rekam tanda tangan" },
];

export default function DaftarTtdPage() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>("loading");
  const [ctx, setCtx] = useState<any>(null);
  const [otp, setOtp] = useState("");
  const [otpHint, setOtpHint] = useState("");
  const [setuju, setSetuju] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kabar, setKabar] = useState<{ kind: string; html: string } | null>(null);
  const [done, setDone] = useState<{ kind: string; html: string } | null>(null);

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
      const d = await api(`/api/enrollment-sessions/${token}`);
      setCtx(d);
      setStep(!d.otp_verified ? "otp" : !d.consent_at ? "setuju" : "rekam");
    } catch (e: any) {
      setError(e.body?.detail ?? "Silakan minta tautan baru ke Admin.");
      setStep("done");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const verifikasi = async () => {
    setBusy(true);
    try {
      await api(`/api/enrollment-sessions/${token}/otp/verify`,
                { method: "POST", body: JSON.stringify({ code: otp.trim() }) });
      await load();
    } catch (e: any) {
      setOtpHint(e.body?.detail ?? "Kode salah.");
    } finally { setBusy(false); }
  };

  const kirimPersetujuan = async () => {
    setBusy(true);
    try {
      await api(`/api/enrollment-sessions/${token}/consent`, {
        method: "POST",
        body: JSON.stringify({ version: ctx?.versi_persetujuan ?? "1.0" }) });
      await load();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>Persetujuan gagal tersimpan</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const rekam = async () => {
    if (pad.kosong()) {
      setKabar({ kind: "warn", html:
        "<b>Belum ada tanda tangan</b>Tanda tangani di dalam kotak terlebih dahulu." });
      return;
    }
    setBusy(true);
    try {
      const r = await api(`/api/enrollment-sessions/${token}/specimens`, {
        method: "POST",
        body: JSON.stringify({ image_png: pad.dataUrl(), strokes: pad.goresan(),
                               input_method: pad.metode() }) });
      if (!r.diterima) {
        setKabar({ kind: "stop", html:
          `<b>Belum cukup mirip dengan yang sebelumnya — skor ${r.skor}, ` +
          `ambang ${r.ambang}</b>${r.guidance.map((g: string) => g).join("<br>")}` });
        pad.hapus();
        return;
      }
      pad.hapus();
      setCtx((c: any) => ({ ...c, terkumpul: r.terkumpul }));
      if (r.terkumpul >= r.target) {
        const f = await api(`/api/enrollment-sessions/${token}/finish`,
                            { method: "POST", body: "{}" });
        setDone({ kind: "ok", html:
          `<b>Terima kasih — ${f.jumlah} tanda tangan tersimpan</b>
           Kemiripan antar tanda tangan Anda: ${f.konsistensi} dari 100.
           Admin Sales akan memeriksanya sebelum diaktifkan. Anda tidak perlu
           melakukan apa pun lagi.` });
        setStep("done");
      } else {
        setKabar({ kind: "ok", html:
          `<b>Tersimpan — ${r.terkumpul} dari ${r.target}</b>
           Tanda tangani sekali lagi, seperti biasa Anda menandatangani dokumen.` });
      }
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>Gagal menyimpan</b>${e.body?.detail ?? "Coba ulangi."}` });
    } finally { setBusy(false); }
  };

  const idx = LANGKAH.findIndex((l) => l.key === step);

  return (
    <div className="wrap-narrow">
      <header style={{ padding: "22px 0 16px", borderBottom: "1px solid var(--line)",
                       marginBottom: 18 }}>
        <h1 style={{ fontSize: 19 }}>
          {error ? "Tautan tidak berlaku" : "Pendaftaran tanda tangan"}
        </h1>
        <p style={{ margin: "3px 0 0", color: "var(--sub)", fontSize: 13 }}>
          {error ?? (ctx ? `${ctx.nama}${ctx.agensi ? ` — ${ctx.agensi}` : ""}` : "Memuat…")}
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
            Kami mengirim kode ke nomor WhatsApp terdaftar. Kode ini yang
            memastikan tanda tangan yang didaftarkan benar-benar milik Anda.
          </div>
          <div className="lbl">Kode 6 digit</div>
          <input value={otp} onChange={(e) => setOtp(e.target.value)}
                 inputMode="numeric" maxLength={6} placeholder="••••••"
                 style={{ width: "100%", fontSize: 17, letterSpacing: ".3em",
                          textAlign: "center", padding: 11 }} />
          <button className="pri" onClick={verifikasi} disabled={busy}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>Lanjut</button>
          {otpHint && <p style={{ fontSize: 11.5, color: "var(--stop)",
                                  textAlign: "center" }}>{otpHint}</p>}
        </section>
      )}

      {step === "setuju" && (
        <section className="panel">
          <div className="lbl">Persetujuan pemakaian data tanda tangan</div>
          <div style={{ border: "1px solid var(--line)", padding: "12px 14px",
                        fontSize: 12.5, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              Dengan melanjutkan, Anda menyetujui PT. Serpong Bangun Lestari
              merekam <b>{ctx?.target ?? 10} contoh tanda tangan</b> Anda dan
              menyimpannya sebagai pembanding.
            </p>
            <p>Yang perlu Anda ketahui:</p>
            <ul style={{ margin: "0 0 10px 16px", padding: 0 }}>
              <li style={{ marginBottom: 4 }}>
                Contoh ini dipakai untuk menilai keaslian tanda tangan Anda pada
                dokumen klaim insentif — dan hanya untuk itu.
              </li>
              <li style={{ marginBottom: 4 }}>
                Penilaiannya tidak pernah menolak klaim Anda sendirian. Bila
                tanda tangan tidak cocok, dokumen diperiksa manusia, bukan
                dibatalkan.
              </li>
              <li style={{ marginBottom: 4 }}>
                Contoh yang Anda rekam hari ini diperiksa Admin Sales sebelum
                dipakai, dan diarsipkan — tidak dihapus — bila kelak diganti,
                agar penilaian lama tetap dapat ditelusuri.
              </li>
              <li>
                Anda dapat meminta pendaftaran ulang kapan saja lewat Admin Sales.
              </li>
            </ul>
            <p style={{ marginBottom: 0, color: "var(--mut)" }}>
              Versi persetujuan {ctx?.versi_persetujuan ?? "1.0"}. Persetujuan ini
              dicatat beserta waktunya.
            </p>
          </div>
          <label className="row" style={{ marginTop: 12, alignItems: "flex-start",
                                          gap: 8, marginBottom: 0 }}>
            <input type="checkbox" checked={setuju} style={{ width: "auto" }}
                   onChange={(e) => setSetuju(e.target.checked)} />
            <span style={{ fontSize: 12.5 }}>
              Saya membaca dan menyetujui keterangan di atas.
            </span>
          </label>
          {kabar && (
            <div className={`banner ${kabar.kind}`} style={{ marginTop: 12 }}
                 dangerouslySetInnerHTML={{ __html: kabar.html }} />
          )}
          <button className="pri" onClick={kirimPersetujuan}
                  disabled={busy || !setuju}
                  style={{ width: "100%", marginTop: 12, padding: 13 }}>
            Lanjut ke perekaman
          </button>
        </section>
      )}

      {step === "rekam" && ctx && (
        <section className="panel">
          <div className="banner info">
            <b>Tanda tangan {(ctx.terkumpul ?? 0) + 1} dari {ctx.target}</b>
            Tanda tangani seperti biasa Anda menandatangani dokumen — jangan
            dibuat lebih rapi dari biasanya, karena inilah yang akan dijadikan
            pembanding nanti.
          </div>

          <div className="lbl">
            Terkumpul {ctx.terkumpul ?? 0} dari {ctx.target}
          </div>
          <div className="bar">
            <span style={{ width: `${((ctx.terkumpul ?? 0) / ctx.target) * 100}%` }} />
          </div>

          <KanvasTtd pad={pad} tampil={step === "rekam"} />
          <p style={{ fontSize: 11.5, color: "var(--mut)", textAlign: "center",
                      marginTop: 6 }}>
            Gunakan stylus bila ada. Goresan jari lebih bervariasi dan lebih
            sering perlu diulang.
          </p>

          {kabar && (
            <div className={`banner ${kabar.kind}`}
                 dangerouslySetInnerHTML={{ __html: kabar.html }} />
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={pad.hapus} disabled={busy}
                    style={{ flex: 1, padding: 13 }}>Hapus</button>
            <button className="pri" onClick={rekam} disabled={busy}
                    style={{ flex: 1, padding: 13 }}>
              {busy ? "Menyimpan…" : "Simpan tanda tangan ini"}
            </button>
          </div>
        </section>
      )}

      {step === "done" && (done || error) && (
        <section className="panel">
          <div className={`banner ${done?.kind ?? "stop"}`}
               dangerouslySetInnerHTML={{
                 __html: done?.html ?? `<b>Tautan tidak berlaku</b>${error}` }} />
        </section>
      )}
    </div>
  );
}

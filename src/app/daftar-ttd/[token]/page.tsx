"use client";

/**
 * Pendaftaran spesimen tanda tangan, dibuka agent dari tautan.
 *
 * Pembandingnya diambil dari tanda tangan yang tercetak pada KTP, bukan dari
 * goresan yang dibuat ulang di layar: satu berkas yang memang sudah dipegang
 * setiap orang, diambil sekali, tanpa menuntut siapa pun menandatangani
 * berulang kali dengan jari di ponsel.
 *
 * Urutannya dibuat kelihatan, sama seperti layar tanda tangan klaim — tetapi di
 * sini ada satu langkah yang tidak ada di sana: persetujuan pemakaian data.
 * Tanda tangan dan KTP adalah data pribadi, dan yang diserahkan di layar ini
 * akan dipakai menilai tanda tangannya berikutnya. Orangnya berhak tahu itu
 * sebelum mengunggah, bukan sesudah.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

type Step = "loading" | "otp" | "setuju" | "ktp" | "done";

const LANGKAH: { key: Step; no: string; label: string }[] = [
  { key: "otp", no: "1", label: "Verifikasi" },
  { key: "setuju", no: "2", label: "Persetujuan" },
  { key: "ktp", no: "3", label: "Tanda tangan KTP" },
];

const BATAS_KTP = 3 * 1024 * 1024;

/**
 * Contoh foto KTP, digambar sendiri — bukan foto kartu siapa pun.
 *
 * Yang sering membuat potongan tanda tangan tidak terpakai bukan kesalahan
 * memakai layar ini, melainkan fotonya: kartu terpotong, miring, gelap, atau
 * tanda tangannya tertutup jempol. Menjelaskannya dengan kalimat saja tidak
 * cukup — orang membandingkan foto dengan gambar, bukan dengan paragraf.
 *
 * Sengaja skematis dan diberi cap CONTOH beserta data karangan: ia petunjuk
 * bentuk foto yang benar, dan tidak boleh dapat dikira kartu sungguhan.
 */
function ContohKtp() {
  return (
    <svg viewBox="0 0 340 214" className="contoh-ktp" role="img"
         aria-label="Contoh foto KTP yang benar: kartu utuh, lurus, dan terang">
      <rect x="4" y="4" width="332" height="206" rx="8"
            fill="#EDF2F7" stroke="#8B9198" />
      <text x="170" y="26" textAnchor="middle" fontSize="11" fontWeight="700"
            fill="#5B6167">PROVINSI CONTOH</text>
      <text x="170" y="40" textAnchor="middle" fontSize="8" fill="#8B9198">
        KABUPATEN CONTOH
      </text>
      {[["NIK", "0000 0000 0000 0000"], ["Nama", "BUDI CONTOH"],
        ["Tempat/Tgl Lahir", "CONTOH, 01-01-1990"],
        ["Alamat", "JL. CONTOH NO. 1"]].map(([k, v], i) => (
        <g key={k}>
          <text x="18" y={62 + i * 15} fontSize="7" fill="#8B9198">{k}</text>
          <text x="92" y={62 + i * 15} fontSize="7.5" fill="#15171A">: {v}</text>
        </g>
      ))}
      {/* Pas foto dan tanda tangan: dua blok kanan yang harus ikut terpotret. */}
      <rect x="244" y="52" width="66" height="84" fill="#D8DBDE" />
      <text x="277" y="98" textAnchor="middle" fontSize="7" fill="#8B9198">
        PAS FOTO
      </text>
      <text x="277" y="150" textAnchor="middle" fontSize="6.5" fill="#8B9198">
        CONTOH, 01-01-2026
      </text>
      {/* Goresan tanda tangan, dilingkari sebagai bagian yang ditandai. */}
      <path d="M250 176 C262 162, 270 186, 280 172 C288 161, 296 182, 306 170"
            fill="none" stroke="#15171A" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="242" y="156" width="74" height="32" fill="none"
            stroke="#8C2F2F" strokeWidth="2" strokeDasharray="4 3" />
      <text x="234" y="178" textAnchor="end" fontSize="7.5" fill="#8C2F2F">
        bagian yang ditandai →
      </text>
      <text x="170" y="120" textAnchor="middle" fontSize="34" fontWeight="700"
            fill="#15171A" opacity="0.08" transform="rotate(-12 170 120)">
        CONTOH
      </text>
    </svg>
  );
}

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

  // Foto KTP dan kotak tanda tangan yang ditandai di atasnya.
  const [ktpUrl, setKtpUrl] = useState<string | null>(null);
  const [ktpTipe, setKtpTipe] = useState<string>("");
  const [kotak, setKotak] = useState<
    { x: number; y: number; w: number; h: number } | null>(null);
  const gambarRef = useRef<HTMLImageElement | null>(null);
  const seretDari = useRef<{ x: number; y: number } | null>(null);

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
      setStep(!d.otp_verified ? "otp"
              : !d.consent_at ? "setuju" : "ktp");
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

  const pilihKtp = (f: File) => {
    setKabar(null);
    if (!/^image\//.test(f.type)) {
      setKabar({ kind: "stop", html:
        "<b>Berkas bukan gambar</b>Foto KTP harus berupa JPG, PNG, WEBP, atau HEIC." });
      return;
    }
    if (f.size > BATAS_KTP) {
      setKabar({ kind: "stop", html:
        `<b>Foto terlalu besar</b>${(f.size / 1024 / 1024).toFixed(1)} MB, ` +
        "sedangkan batasnya 3 MB. Perkecil fotonya lalu ulangi." });
      return;
    }
    const fr = new FileReader();
    fr.onload = () => { setKtpUrl(String(fr.result)); setKotak(null); };
    fr.readAsDataURL(f);
    setKtpTipe(f.type);
  };

  /** Titik pada gambar, dalam satuan tampilan (bukan piksel asli). */
  const titik = (e: React.MouseEvent | React.TouchEvent) => {
    const r = gambarRef.current!.getBoundingClientRect();
    const p = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };

  const mulaiSeret = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    seretDari.current = titik(e);
    setKotak(null);
  };

  const seret = (e: React.MouseEvent | React.TouchEvent) => {
    if (!seretDari.current) return;
    e.preventDefault();
    const a = seretDari.current, b = titik(e);
    setKotak({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
               w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
  };

  const selesaiSeret = () => { seretDari.current = null; };

  /**
   * Potong bagian yang ditandai dari gambar aslinya.
   *
   * Dipotong dari piksel asli, bukan dari gambar yang sudah dikecilkan ke layar:
   * tanda tangan pada KTP tercetak kecil, dan memotong dari versi layar ponsel
   * membuang justru detail yang hendak dibandingkan.
   */
  const potong = (): string | null => {
    const img = gambarRef.current;
    if (!img || !kotak || kotak.w < 12 || kotak.h < 8) return null;
    const sx = img.naturalWidth / img.clientWidth;
    const sy = img.naturalHeight / img.clientHeight;
    const cv = document.createElement("canvas");
    cv.width = Math.round(kotak.w * sx);
    cv.height = Math.round(kotak.h * sy);
    const c2d = cv.getContext("2d")!;
    c2d.fillStyle = "#fff";
    c2d.fillRect(0, 0, cv.width, cv.height);
    c2d.drawImage(img, Math.round(kotak.x * sx), Math.round(kotak.y * sy),
                  cv.width, cv.height, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/png");
  };

  const kirimKtp = async () => {
    if (!ktpUrl) {
      setKabar({ kind: "warn", html:
        "<b>Foto KTP belum dipilih</b>Unggah fotonya terlebih dahulu." });
      return;
    }
    const crop = potong();
    if (!crop) {
      setKabar({ kind: "warn", html:
        "<b>Bagian tanda tangan belum ditandai</b>Tarik kotak di atas tanda " +
        "tangan yang tercetak pada KTP." });
      return;
    }
    setBusy(true);
    try {
      await api(`/api/enrollment-sessions/${token}/ktp`, {
        method: "POST",
        body: JSON.stringify({ image_base64: ktpUrl, content_type: ktpTipe,
                               signature_png: crop }) });
      // Langsung dikirim ke pemeriksaan: tidak ada langkah lain sesudahnya, dan
      // meninggalkan tombol "kirim" tersendiri hanya menambah satu tempat
      // pendaftaran dapat berhenti setengah jalan.
      await api(`/api/enrollment-sessions/${token}/finish`,
                { method: "POST", body: "{}" });
      setKabar(null);
      setDone({ kind: "ok", html:
        `<b>Terima kasih — tanda tangan pada KTP Anda tersimpan</b>
         Admin Sales akan memeriksanya sebelum diaktifkan. Anda tidak perlu
         melakukan apa pun lagi.` });
      setStep("done");
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>Foto KTP gagal tersimpan</b>${e.body?.detail ?? ""}` });
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
              menerima <b>foto KTP</b> Anda dan menyimpan <b>potongan tanda
              tangan</b> yang tercetak pada kartu itu.
            </p>
            <p>Yang perlu Anda ketahui:</p>
            <ul style={{ margin: "0 0 10px 16px", padding: 0 }}>
              <li style={{ marginBottom: 4 }}>
                Potongan itu dipakai sebagai pembanding tanda tangan Anda pada
                dokumen klaim insentif — dan hanya untuk itu.
              </li>
              <li style={{ marginBottom: 4 }}>
                Perbandingannya tidak pernah menolak klaim Anda sendirian. Yang
                memutuskan tetap Admin Sales yang melihat kedua tanda tangan.
              </li>
              <li style={{ marginBottom: 4 }}>
                Dari foto KTP, yang disimpan seterusnya <b>hanya potongan tanda
                tangannya</b>. Fotonya sendiri dihapus begitu Admin Sales selesai
                memeriksa — NIK, alamat, dan foto wajah Anda tidak disimpan.
              </li>
              <li style={{ marginBottom: 4 }}>
                Yang Anda kirim hari ini diperiksa Admin Sales sebelum dipakai,
                dan diarsipkan — tidak dihapus — bila kelak diganti, agar
                penilaian lama tetap dapat ditelusuri.
              </li>
              <li>
                Pendaftaran ini dilakukan sekali. Penggantian hanya atas
                permintaan Anda lewat Admin Sales, dan alasannya dicatat.
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
            Lanjut ke unggah KTP
          </button>
        </section>
      )}

      {step === "ktp" && (
        <section className="panel">
          <div className="banner info">
            <b>Unggah foto KTP, lalu tandai tanda tangannya</b>
            Tanda tangan yang tercetak pada KTP itulah yang menjadi pembanding
            Anda seterusnya. Setelah Admin memeriksa, fotonya dihapus — yang
            disimpan hanya potongan tanda tangan yang Anda tandai.
          </div>

          {/* Contoh ditaruh sebelum tombol pilih berkas, bukan sesudahnya:
              sesudah dipilih, fotonya sudah terlanjur diambil. */}
          {!ktpUrl && (
            <>
              <div className="lbl" style={{ marginTop: 12 }}>
                Contoh foto yang benar
              </div>
              <ContohKtp />
              <ul className="syarat-foto">
                <li>Seluruh kartu masuk ke dalam foto, tidak ada sisi terpotong.</li>
                <li>Lurus menghadap kamera, tidak miring, tidak terbalik.</li>
                <li>Terang dan fokus — tulisannya terbaca, tidak silau kena lampu.</li>
                <li>Tanda tangan di kanan bawah tidak tertutup jari atau benda lain.</li>
              </ul>
            </>
          )}

          <input type="file" accept="image/*" capture="environment"
                 disabled={busy} style={{ width: "100%", fontSize: 12.5 }}
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   e.target.value = "";
                   if (f) pilihKtp(f);
                 }} />

          {ktpUrl && (
            <>
              <div className="lbl" style={{ marginTop: 12 }}>
                Tarik kotak di atas tanda tangan pada KTP
              </div>
              {/* Gambar dan kotak penanda menumpuk; kotaknya digambar dengan
                  posisi mutlak di atas gambarnya, bukan di dalam kanvas, supaya
                  fotonya tetap tajam saat diperbesar peramban. */}
              <div className="tandai"
                   onMouseDown={mulaiSeret} onMouseMove={seret}
                   onMouseUp={selesaiSeret} onMouseLeave={selesaiSeret}
                   onTouchStart={mulaiSeret} onTouchMove={seret}
                   onTouchEnd={selesaiSeret}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={gambarRef} src={ktpUrl} alt="Foto KTP" draggable={false} />
                {kotak && (
                  <div className="kotak-tandai"
                       style={{ left: kotak.x, top: kotak.y,
                                width: kotak.w, height: kotak.h }} />
                )}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--mut)", textAlign: "center",
                          marginTop: 6 }}>
                Pada e-KTP, tanda tangan tercetak kecil di bawah foto, sebelah
                kanan bawah kartu.
              </p>
            </>
          )}

          {kabar && (
            <div className={`banner ${kabar.kind}`}
                 dangerouslySetInnerHTML={{ __html: kabar.html }} />
          )}

          <button className="pri" onClick={kirimKtp}
                  disabled={busy || !ktpUrl || !kotak}
                  style={{ width: "100%", marginTop: 8, padding: 13 }}>
            {busy ? "Mengirim…" : "Kirim untuk diperiksa"}
          </button>
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

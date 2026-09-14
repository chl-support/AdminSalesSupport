"use client";

/**
 * Halaman penyiapan sekali jalan.
 *
 * Ada karena menjalankan POST dengan header khusus dari dashboard hosting itu
 * merepotkan: butuh terminal, dan pengutipan `curl` di Windows kerap gagal diam-diam.
 * Halaman ini memanggil endpoint yang sama dengan pengaman yang sama — rahasia tetap
 * wajib, dan endpoint tetap membalas 404 bila SETUP_SECRET tidak dipasang.
 *
 * Rahasia hanya disimpan di state komponen, tidak pernah masuk URL agar tidak
 * tercatat di riwayat peramban maupun log akses.
 */

import { useCallback, useEffect, useState } from "react";

type Status = {
  tables: number; migrated: boolean; users: number; seeded: boolean;
  next_step: string;
};

export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [secret, setSecret] = useState("");
  const [seed, setSeed] = useState(true);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { cls: string; title: string; lines: string[] } | null
  >(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/admin/setup");
    if (res.status === 404) { setDisabled(true); return; }
    if (res.ok) setStatus(await res.json());
    else setStatus(null);
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const run = async () => {
    if (!secret) { setResult({ cls: "stop", title: "Rahasia belum diisi", lines: [] }); return; }
    setBusy(true);
    setResult(null);
    try {
      const qs = new URLSearchParams();
      if (seed) qs.set("seed", "true");
      if (force) qs.set("force", "true");
      const res = await fetch(`/api/admin/setup?${qs}`, {
        method: "POST",
        headers: { "x-setup-secret": secret },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({
          cls: "ok",
          title: "Penyiapan selesai",
          lines: [...(body.steps ?? []), body.reminder ?? ""].filter(Boolean),
        });
      } else if (res.status === 401) {
        setResult({ cls: "stop", title: "Rahasia tidak cocok",
                    lines: ["Nilainya harus sama persis dengan SETUP_SECRET di Environment Variables."] });
      } else if (res.status === 409) {
        setResult({ cls: "warn", title: "Basis data sudah berisi data",
                    lines: [body.detail ?? "", "Centang 'timpa data yang ada' bila memang ingin melanjutkan."].filter(Boolean) });
      } else {
        setResult({ cls: "stop", title: "Penyiapan gagal",
                    lines: [body.detail ?? `HTTP ${res.status}`,
                            body.pgCode ? `Kode PostgreSQL: ${body.pgCode}` : ""].filter(Boolean) });
      }
    } catch (e: any) {
      setResult({ cls: "stop", title: "Permintaan gagal", lines: [String(e?.message ?? e)] });
    } finally {
      setBusy(false);
      void loadStatus();
    }
  };

  if (disabled) {
    return (
      <div className="wrap narrow">
        <div className="sign-head"><h1>Penyiapan tidak aktif</h1></div>
        <div className="card">
          <div className="banner info">
            <b>Endpoint penyiapan sedang mati</b>
            Ini kondisi yang benar untuk sistem yang sudah berjalan. Untuk
            mengaktifkannya, tambahkan <code>SETUP_SECRET</code> pada Environment
            Variables lalu jalankan Redeploy.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap narrow">
      <div className="sign-head">
        <h1>Penyiapan basis data</h1>
        <p>Menjalankan migrasi skema dan, bila dipilih, mengisi data contoh.</p>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 10px", fontSize: 14 }}>Kondisi saat ini</h2>
        {status ? (
          <>
            <table><tbody>
              <tr><td>Tabel</td><td>{status.tables}</td></tr>
              <tr><td>Skema</td><td>{status.migrated ? "sudah ada" : "belum dibuat"}</td></tr>
              <tr><td>Pengguna</td><td>{status.users}</td></tr>
            </tbody></table>
            <div className="banner info" style={{ marginTop: 10 }}>{status.next_step}</div>
          </>
        ) : (
          <div className="banner warn">
            <b>Status belum terbaca</b>
            Basis data mungkin belum dapat dijangkau. Periksa <code>/api/health</code>.
          </div>
        )}
      </div>

      <div className="card">
        <div className="lbl">SETUP_SECRET</div>
        <input type="password" value={secret} autoComplete="off"
               style={{ width: "100%", letterSpacing: "normal", fontSize: 14,
                        textAlign: "left" }}
               onChange={(e) => setSecret(e.target.value)}
               placeholder="nilai yang Anda isi di Environment Variables" />

        <label style={{ display: "flex", gap: 8, alignItems: "center",
                        marginTop: 12, fontSize: 13 }}>
          <input type="checkbox" checked={seed} style={{ width: "auto" }}
                 onChange={(e) => setSeed(e.target.checked)} />
          Isi data contoh sekalian
        </label>
        <p className="hint" style={{ textAlign: "left", marginTop: 4 }}>
          Data contoh juga membuat tujuh pengguna dan konfigurasi skema insentif.
          Tanpa itu konsol tidak dapat dipakai karena belum ada pengguna yang dikenali.
        </p>

        {status?.seeded && (
          <label style={{ display: "flex", gap: 8, alignItems: "center",
                          marginTop: 8, fontSize: 13, color: "var(--stop)" }}>
            <input type="checkbox" checked={force} style={{ width: "auto" }}
                   onChange={(e) => setForce(e.target.checked)} />
            Timpa data yang ada (seluruh tabel dikosongkan)
          </label>
        )}

        <button className="pri" onClick={run} disabled={busy}>
          {busy ? "Menjalankan…" : "Jalankan penyiapan"}
        </button>
      </div>

      {result && (
        <div className="card">
          <div className={`banner ${result.cls}`}>
            <b>{result.title}</b>
            {result.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          {result.cls === "ok" && (
            <button onClick={() => { location.href = "/"; }}>Buka konsol</button>
          )}
        </div>
      )}
    </div>
  );
}

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

type SecretShape = {
  present: boolean; length?: number; has_whitespace?: boolean;
  looks_like_pasted_command?: boolean; hint?: string;
};

type Health = {
  status?: string;
  detail?: string;
  pgCode?: string | null;
  config?: {
    database_url: {
      present: boolean; raw_length: number; trimmed: boolean;
      host: string | null; pooled: boolean | null; sslmode: string | null;
    };
    setup_secret: SecretShape;
    vercel: {
      env: string | null; url: string | null;
      branch: string | null; commit: string | null;
    };
  };
};

/**
 * Satu kalimat tindakan dari blok `config` health check.
 *
 * Urutannya mengikuti seberapa sering penyebabnya terjadi, dan tiap cabang
 * menyebut apa yang harus diubah — bukan hanya apa yang salah. "Periksa
 * DATABASE_URL" tidak menuntun ke mana pun bagi orang yang sedang menatap
 * dashboard Vercel dan yakin variabelnya sudah diisi.
 */
function nasihat(h: Health | null): string {
  const c = h?.config;
  if (!c) {
    return "Respons /api/health tidak terbaca. Fungsi mungkin gagal dijalankan " +
           "sama sekali — periksa Runtime Logs pada dashboard.";
  }
  const d = c.database_url;
  const env = c.vercel.env ?? "lokal";

  if (!d.present) {
    return `Fungsi yang sedang berjalan tidak melihat DATABASE_URL sama sekali ` +
           `(environment: ${env}). Variabel baru tidak berlaku surut pada ` +
           `deployment yang sudah ada: jalankan Redeploy. Bila setelah Redeploy ` +
           `masih kosong, variabelnya belum dicentang untuk environment ` +
           `"${env}" — buka Settings > Environment Variables dan centang ` +
           `Production, Preview, dan Development.`;
  }
  if (!d.host) {
    return "DATABASE_URL terbaca tetapi bukan connection string yang sah. " +
           "Bentuknya harus postgres://pengguna:sandi@host:5432/basisdata — " +
           "salin ulang utuh dari dashboard penyedia basis data.";
  }
  if (h?.pgCode === "42P01") {
    return "Basis data terhubung, hanya skemanya yang belum dibuat. Isi " +
           "SETUP_SECRET di bawah lalu jalankan penyiapan.";
  }
  if (h?.pgCode === "ENOTFOUND") {
    return `Host "${d.host}" tidak ada di DNS. Yang lazim: nilainya terpotong ` +
           `saat disalin, atau proyek basis datanya sudah dihapus. Bandingkan ` +
           `dengan connection string di dashboard penyedia.`;
  }
  if (h?.pgCode === "ECONNREFUSED" || h?.pgCode === "ETIMEDOUT") {
    return `Host "${d.host}" tidak menerima koneksi dari luar. Pada Neon dan ` +
           `Supabase ini biasanya berarti Anda memakai connection string ` +
           `langsung, bukan yang pooled.`;
  }
  if (h?.pgCode === "28P01" || h?.pgCode === "28000") {
    return "Host benar, tetapi pengguna atau kata sandinya ditolak. Ambil ulang " +
           "connection string — kata sandi sering ikut terpotong pada karakter " +
           "khusus saat disalin manual.";
  }
  if (h?.pgCode === "3D000") {
    return "Host dan kredensial benar, tetapi nama basis datanya tidak ada. " +
           "Periksa bagian setelah tanda / terakhir pada connection string.";
  }
  if (d.trimmed) {
    return "Ada spasi atau tanda petik yang ikut tersalin ke DATABASE_URL. " +
           "Aplikasi membersihkannya, tetapi sebaiknya diperbaiki di dashboard.";
  }
  if (d.pooled === false) {
    return `Koneksi ke "${d.host}" gagal dan string ini bukan yang pooled. Pada ` +
           `Neon pakai yang mengandung -pooler; pada Supabase pakai Transaction ` +
           `pooler (port 6543).`;
  }
  return "DATABASE_URL terbaca dan bentuknya wajar, tetapi koneksinya tetap " +
         "gagal. Pesan lengkap dari PostgreSQL ada di bawah.";
}

/**
 * Apa yang benar-benar terbaca oleh fungsi yang sedang berjalan.
 *
 * Kredensial tidak pernah ikut — hanya bentuk dan asal nilainya. Commit dan
 * environment ikut ditampilkan karena keduanya yang membedakan "variabel belum
 * diisi" dari "variabel sudah diisi tetapi deployment ini lebih tua".
 */
function Diagnosis({ health }: { health: Health | null }) {
  const c = health?.config;
  const d = c?.database_url;
  return (
    <div className="card">
      <div className="banner stop">
        <b>Basis data tidak dapat dijangkau</b>
        {nasihat(health)}
      </div>

      {health?.detail && (
        <p className="hint" style={{ textAlign: "left", marginTop: 10 }}>
          Pesan dari server: {health.detail}
          {health.pgCode ? ` (kode ${health.pgCode})` : ""}
        </p>
      )}

      {c && (
        <>
          <h2 style={{ margin: "14px 0 8px", fontSize: 14 }}>
            Yang terbaca oleh fungsi ini
          </h2>
          <table><tbody>
            <tr><td>DATABASE_URL</td>
                <td>{d?.present ? "terbaca" : "TIDAK terbaca"}</td></tr>
            {d?.present && (
              <>
                <tr><td>Host</td><td>{d.host ?? "(tidak dapat diurai)"}</td></tr>
                <tr><td>Pooled</td>
                    <td>{d.pooled === null ? "—" : d.pooled ? "ya" : "tidak"}</td></tr>
                <tr><td>sslmode</td><td>{d.sslmode ?? "—"}</td></tr>
                <tr><td>Spasi/petik ikut tersalin</td>
                    <td>{d.trimmed ? "ya" : "tidak"}</td></tr>
              </>
            )}
            <tr><td>SETUP_SECRET</td>
                <td>{c.setup_secret?.present ? "terpasang" : "belum dipasang"}</td></tr>
            <tr><td>Environment</td><td>{c.vercel.env ?? "lokal"}</td></tr>
            <tr><td>Branch</td><td>{c.vercel.branch ?? "—"}</td></tr>
            <tr><td>Commit</td><td>{c.vercel.commit ?? "—"}</td></tr>
          </tbody></table>
          <p className="hint" style={{ textAlign: "left", marginTop: 8 }}>
            Angka-angka ini berasal dari deployment yang sedang Anda buka, bukan
            dari dashboard. Bila berbeda dari yang Anda isi di Settings,
            deployment ini dibuat sebelum perubahan itu — jalankan Redeploy.
          </p>
        </>
      )}
    </div>
  );
}

export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [shape, setShape] = useState<SecretShape | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [secret, setSecret] = useState("");
  const [seed, setSeed] = useState(true);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { cls: string; title: string; lines: string[] } | null
  >(null);

  const loadStatus = useCallback(async () => {
    // Health dibaca lebih dulu dan tanpa syarat: ia satu-satunya sumber diagnosis
    // ketika basis data tidak terjangkau, dan tetap menjawab walau endpoint
    // penyiapan dimatikan. Membacanya belakangan berarti kegagalan yang paling
    // perlu dijelaskan justru yang paling sedikit keterangannya.
    const h: Health | null = await fetch("/api/health")
      .then((r) => r.json()).catch(() => null);
    setHealth(h);
    setShape(h?.config?.setup_secret ?? null);

    const res = await fetch("/api/admin/setup");
    if (res.status === 404) { setDisabled(true); setStatus(null); return; }
    setDisabled(false);
    setStatus(res.ok ? await res.json() : null);
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

  // Basis data tidak terjangkau: health menjawab selain "ok", atau tidak menjawab.
  const dbMati = health !== null && health.status !== "ok";

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
        {/* Penyiapan dimatikan bukan berarti basis datanya sehat. Tanpa blok ini,
            deployment yang SETUP_SECRET-nya sudah dihapus tidak punya satu pun
            layar yang menjelaskan mengapa konsolnya kosong. */}
        {dbMati && <Diagnosis health={health} />}
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
            Skema tidak dapat diperiksa karena basis datanya belum terhubung.
            Keterangannya ada di bawah.
          </div>
        )}
      </div>

      {dbMati && <Diagnosis health={health} />}

      {shape?.looks_like_pasted_command && (
        <div className="card">
          <div className="banner stop">
            <b>Nilai SETUP_SECRET di server tampaknya keliru</b>
            Panjangnya {shape.length} karakter
            {shape.has_whitespace ? " dan mengandung spasi" : ""}. {shape.hint}
            <br /><br />
            Perbaiki di Settings &gt; Environment Variables, lalu Redeploy.
          </div>
        </div>
      )}

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

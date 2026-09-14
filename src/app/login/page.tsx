"use client";

/**
 * Halaman masuk.
 *
 * Tidak memuat daftar akun maupun petunjuk sandi. Layar masuk yang menampilkan
 * "coba admin/demo" berguna saat demo dan berbahaya begitu sistemnya dipakai
 * sungguhan — dan versi yang dipakai sungguhan selalu versi yang sama.
 */

import { useEffect, useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sisa, setSisa] = useState<number | null>(null);

  // Sudah punya sesi hidup: tidak perlu memperlihatkan layar masuk lagi.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => { if (r.ok) location.href = tujuan(); })
      .catch(() => { /* biarkan formulirnya tampil */ });
  }, []);

  /**
   * Kembali ke halaman yang tadi diminta, bukan selalu ke beranda.
   *
   * Hanya lintasan relatif yang diterima. Menerima URL utuh akan mengubah
   * halaman ini menjadi pengalih terbuka: tautan bermuatan ?next=https://… yang
   * mengantar orang ke situs lain tepat setelah mereka mengetikkan sandinya.
   */
  const tujuan = () => {
    // Bawaannya /klaim, bukan beranda: yang pertama dikerjakan setelah masuk
    // adalah mengajukan klaim, bukan menindaklanjuti yang sudah ada.
    const n = new URLSearchParams(window.location.search).get("next") ?? "/klaim";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/klaim";
  };

  const masuk = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setGalat(null);
    setSisa(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(b.detail ?? `Gagal masuk (HTTP ${res.status})`);
        setSisa(typeof b.sisa_percobaan === "number" ? b.sisa_percobaan : null);
        return;
      }
      location.href = tujuan();
    } catch (err: any) {
      setGalat(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap narrow">
      <div className="sign-head">
        <h1>Konsol Klaim Insentif</h1>
        <p>BIO District — masuk dengan akun tim Anda.</p>
      </div>

      <form className="card" onSubmit={masuk}>
        <div className="lbl">Username</div>
        <input type="text" value={username} autoFocus autoComplete="username"
               style={{ width: "100%", letterSpacing: "normal", fontSize: 14,
                        textAlign: "left" }}
               onChange={(e) => setUsername(e.target.value)} />

        <div className="lbl" style={{ marginTop: 12 }}>Kata sandi</div>
        <input type="password" value={password} autoComplete="current-password"
               style={{ width: "100%", letterSpacing: "normal", fontSize: 14,
                        textAlign: "left" }}
               onChange={(e) => setPassword(e.target.value)} />

        <button className="pri" type="submit" disabled={busy}>
          {busy ? "Memeriksa…" : "Masuk"}
        </button>

        {galat && (
          <div className="banner stop" style={{ marginTop: 12, marginBottom: 0 }}>
            <b>Tidak dapat masuk</b>
            {galat}
            {sisa !== null && (
              <div style={{ marginTop: 4 }}>
                Sisa percobaan sebelum akun dikunci sementara: {sisa}.
              </div>
            )}
          </div>
        )}
      </form>

      <p className="hint">
        Lupa kata sandi atau akun terkunci? Hubungi Admin Sistem — pengaturan
        ulang sandi mandiri belum tersedia.
      </p>
    </div>
  );
}

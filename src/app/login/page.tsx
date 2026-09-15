"use client";

/**
 * Halaman masuk.
 *
 * Tidak memuat daftar akun maupun petunjuk sandi. Layar masuk yang menampilkan
 * "coba admin/demo" berguna saat demo dan berbahaya begitu sistemnya dipakai
 * sungguhan — dan versi yang dipakai sungguhan selalu versi yang sama.
 */

import { useEffect, useState } from "react";

import { Logo } from "../logo";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sisa, setSisa] = useState<number | null>(null);
  const [kontak, setKontak] = useState<{ wa: string | null; email: string | null } | null>(null);
  const [lihatKontak, setLihatKontak] = useState(false);

  // Sudah punya sesi hidup: tidak perlu memperlihatkan layar masuk lagi.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => { if (r.ok) location.href = tujuan(); })
      .catch(() => { /* biarkan formulirnya tampil */ });
  }, []);

  // Kontak Admin Sistem diambil di awal supaya tautannya langsung menampilkan
  // isinya saat diklik, bukan berpikir dulu.
  useEffect(() => {
    fetch("/api/kontak-admin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setKontak(d))
      .catch(() => { /* biarkan kosong */ });
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
    <div className="masuk">
      {/* Sisi kiri menerangkan sistem apa ini sebelum orang mengetikkan
          sandinya. Layar masuk tanpa keterangan apa pun sama saja meminta
          kredensial dari halaman yang tidak memperkenalkan diri — persis bentuk
          yang diajarkan untuk dicurigai. */}
      <aside className="masuk-merek">
        <div>
          <Logo tinggi={118} />
          <div className="wordmark">CHL Support</div>
          <p className="tagline">
            Klaim insentif marketing — Closing Fee, Komisi, Cash Reward, dan
            Overriding dalam satu alur.
          </p>
        </div>

        <ul className="poin">
          <li>Nilai pengajuan diperiksa tim pajak sebelum tautan dikirim.</li>
          <li>Tanda tangan agent menempel langsung pada Form Pengajuan.</li>
          <li>Setiap langkah tercatat di jejak audit yang tidak dapat disunting.</li>
        </ul>

        <div className="kaki">PT. Serpong Bangun Lestari</div>
      </aside>

      <main className="masuk-isi">
        <form className="masuk-kartu" onSubmit={masuk}>
          <h1>Masuk</h1>
          <p className="pengantar">Gunakan akun tim yang diberikan Admin Sistem.</p>

          <label className="lbl" htmlFor="username">Username</label>
          <input id="username" type="text" value={username} autoFocus
                 autoComplete="username" className="isian"
                 onChange={(e) => setUsername(e.target.value)} />

          <label className="lbl" htmlFor="sandi">Kata sandi</label>
          <input id="sandi" type="password" value={password}
                 autoComplete="current-password" className="isian"
                 onChange={(e) => setPassword(e.target.value)} />

          <button className="pri masuk-tombol" type="submit"
                  disabled={busy || !username || !password}>
            {busy ? "Memeriksa…" : "Masuk"}
          </button>

          {galat && (
            <div className="banner stop" style={{ marginTop: 14, marginBottom: 0 }}>
              <b>Tidak dapat masuk</b>
              {galat}
              {sisa !== null && (
                <div style={{ marginTop: 4 }}>
                  Sisa percobaan sebelum akun dikunci sementara: {sisa}.
                </div>
              )}
            </div>
          )}

          <div className="masuk-bantuan">
            Lupa kata sandi atau akun terkunci?{" "}
            <button type="button" className="tautan"
                    onClick={() => setLihatKontak((v) => !v)}>
              Hubungi Admin Sistem
            </button>

            {lihatKontak && (
              <div className="kontak">
                {kontak?.wa && (
                  <a href={`https://wa.me/${kontak.wa.replace(/\D/g, "")}`}
                     target="_blank" rel="noreferrer">
                    WhatsApp {kontak.wa}
                  </a>
                )}
                {kontak?.email && (
                  <a href={`mailto:${kontak.email}`}>{kontak.email}</a>
                )}
                {!kontak?.wa && !kontak?.email && (
                  <span>
                    Kontak Admin Sistem belum diisi. Hubungi lewat jalur yang
                    biasa Anda pakai.
                  </span>
                )}
              </div>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

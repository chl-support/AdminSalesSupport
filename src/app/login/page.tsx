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

  // Kontak Admin IT diambil di awal supaya tautannya langsung menampilkan
  // isinya saat diklik, bukan berpikir dulu.
  useEffect(() => {
    fetch("/api/kontak-admin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setKontak(d))
      .catch(() => { /* biarkan kosong */ });
  }, []);

  /**
   * Nomor WhatsApp menjadi bentuk yang diterima wa.me.
   *
   * Nomor Indonesia hampir selalu ditulis diawali 0 — dan wa.me tidak mengenal
   * bentuk itu: tautannya terbuka, lalu WhatsApp menjawab nomornya tidak
   * terdaftar. Yang salah bukan nomornya, melainkan cara menuliskannya, jadi
   * diperbaiki di sini alih-alih dituntut dari yang mengisinya.
   */
  const nomorWa = (nomor: string) => {
    const angka = nomor.replace(/\D/g, "");
    if (angka.startsWith("62")) return angka;
    if (angka.startsWith("0")) return `62${angka.slice(1)}`;
    if (angka.startsWith("8")) return `62${angka}`;
    return angka;
  };

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
          <div className="wordmark">CHL Admin Sales</div>
          <p className="tagline">
            KLAIM INSENTIF MARKETING
            <span>Closing Fee, Komisi, Cash Reward, dan Overriding.</span>
          </p>
        </div>

        <div className="kaki">PT. Serpong Bangun Lestari</div>
      </aside>

      <main className="masuk-isi">
        <form className="masuk-kartu" onSubmit={masuk}>
          <h1>Masuk</h1>
          <p className="pengantar">Gunakan akun tim yang diberikan Admin IT.</p>

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
            {/* Tautannya turun ke barisnya sendiri: sebaris dengan
                pertanyaannya, ia terbaca sebagai lanjutan kalimat, bukan sebagai
                sesuatu yang dapat ditekan. */}
            <p>Lupa kata sandi atau akun terkunci?</p>
            <button type="button" className="tautan"
                    onClick={() => setLihatKontak((v) => !v)}>
              Hubungi Admin IT
            </button>

            {lihatKontak && (
              <div className="kontak">
                {kontak?.wa && (
                  <a href={`https://wa.me/${nomorWa(kontak.wa)}`}
                     target="_blank" rel="noreferrer">
                    WhatsApp {kontak.wa}
                  </a>
                )}
                {kontak?.email && (
                  <a href={`mailto:${kontak.email}`}>{kontak.email}</a>
                )}
                {!kontak?.wa && !kontak?.email && (
                  <span>
                    Kontak Admin IT belum diisi. Hubungi lewat jalur yang
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

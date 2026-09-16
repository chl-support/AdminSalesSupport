"use client";

/**
 * Halaman masuk.
 *
 * Tidak memuat daftar akun maupun petunjuk sandi. Layar masuk yang menampilkan
 * "coba admin/demo" berguna saat demo dan berbahaya begitu sistemnya dipakai
 * sungguhan — dan versi yang dipakai sungguhan selalu versi yang sama.
 */

import { useEffect, useRef, useState } from "react";

import { Logo } from "../logo";

/**
 * Ikon digambar sebagai SVG sebaris, bukan diambil dari pustaka ikon.
 *
 * Halaman masuk dibuka sebelum siapa pun terbukti berhak, jadi ia sebaiknya
 * tidak menarik apa pun dari luar — satu permintaan ke server ikon adalah satu
 * pihak lagi yang tahu siapa membuka halaman masuk ini dan kapan.
 */
function IkonWa() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
         fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.84-.85 2.03 0 1.2.87 2.35.99 2.51.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

function IkonSurel() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
         fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="m3 6.5 9 6 9-6" />
    </svg>
  );
}

/**
 * Mata terbuka/tercoret untuk tombol lihat sandi.
 *
 * Satu komponen dengan satu sakelar, bukan dua komponen terpisah: kedua
 * gambarnya berbagi bentuk mata yang sama, dan yang membedakan hanya garis
 * coretannya.
 */
function IkonMata({ tertutup }: { tertutup: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
         fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.2 12S5.9 5.5 12 5.5 21.8 12 21.8 12 18.1 18.5 12 18.5 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {tertutup && <path d="m4 20 16-16" />}
    </svg>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Sandi tersembunyi secara bawaan; tombol di dalam kolomnya membukanya
  // sementara. Layar masuk sering dibuka di meja terbuka, jadi yang dipilih
  // adalah tersembunyi dulu — bukan terbuka dulu lalu ditutup.
  const [lihatSandi, setLihatSandi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sisa, setSisa] = useState<number | null>(null);
  const [kontak, setKontak] = useState<{ wa: string | null; email: string | null } | null>(null);
  const [lihatKontak, setLihatKontak] = useState(false);
  const tutupRef = useRef<HTMLButtonElement | null>(null);

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

  // Pop-up ditutup dengan Esc, dan begitu terbuka fokus papan ketik pindah ke
  // tombol tutupnya. Lapisan yang menutupi halaman tetapi tidak dapat ditutup
  // dari papan ketik mengunci orang yang tidak memakai tetikus.
  useEffect(() => {
    if (!lihatKontak) return;
    tutupRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setLihatKontak(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [lihatKontak]);

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
      {/* Sisi kiri memuat lambang perusahaan saja. Yang memperkenalkan halaman
          ini adalah kartu di sebelah kanan — lambangnya di sini bekerja sebagai
          pengenal, bukan sebagai keterangan. */}
      <aside className="masuk-merek">
        {/* Lambang di atas, nama sistem di bawahnya, keduanya rata kiri
            sebagai satu blok. Lambangnya lebih kecil daripada saat ia berdiri
            sendirian: di sini ia kepala dari nama di bawahnya, dan kepala yang
            seukuran badannya membuat mata tidak tahu mulai dari mana. */}
        <div className="isi-merek">
          <Logo tinggi={88} />
          {/* Pemenggalan barisnya ditentukan di sini, bukan diserahkan pada
              pembungkusan otomatis: dengan background-clip:text, bagian kata
              yang meluber keluar kotaknya tidak ikut tergambar sama sekali,
              jadi kata yang tidak muat hilang separuh alih-alih turun baris. */}
          <div className="wordmark">
            <span>CHL Sales</span>
            <span>Admin System</span>
          </div>
        </div>
      </aside>

      <main className="masuk-isi">
        <form className="masuk-kartu" onSubmit={masuk}>
          {/* Nama sistemnya tidak diulang di sini: ia sudah tertulis besar di
              bidang sebelah kiri, dan dua penyebutan dalam satu layar membuat
              orang membaca hal yang sama dua kali. Di layar sempit bidang itu
              berpindah ke atas kartu — tetap terbaca lebih dulu. */}
          <p className="eyebrow">Portal Internal</p>
          <h1>Masuk</h1>
          <p className="pengantar">
            Gunakan akun yang diberikan Admin IT untuk melanjutkan.
          </p>

          <label className="lbl" htmlFor="username">Username</label>
          <input id="username" type="text" value={username} autoFocus
                 autoComplete="username" className="isian"
                 onChange={(e) => setUsername(e.target.value)} />

          <label className="lbl" htmlFor="sandi">Password</label>
          <div className="isian-sandi">
            <input id="sandi" type={lihatSandi ? "text" : "password"}
                   value={password} autoComplete="current-password"
                   className="isian"
                   onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setLihatSandi((v) => !v)}
                    aria-label={lihatSandi ? "Sembunyikan kata sandi"
                                           : "Tampilkan kata sandi"}>
              <IkonMata tertutup={lihatSandi} />
            </button>
          </div>

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

          </div>

          {/* Kontak muncul sebagai pop-up, bukan menyisip di bawah tautannya:
              menyisip mendorong turun isi kartu dan membuat halaman bergeser
              tepat saat orangnya hendak membaca nomornya. */}
          {lihatKontak && (
            <div className="tirai" onMouseDown={(e) => {
              if (e.target === e.currentTarget) setLihatKontak(false);
            }}>
              <div className="popup" role="dialog" aria-modal="true"
                   aria-label="Kontak Admin IT">
                {/* Tanpa judul: tautan yang membukanya sudah berbunyi
                    "Hubungi Admin IT", dan mengulanginya di dalam kotak membuat
                    orang membaca hal yang sama dua kali. Nama kotaknya tetap
                    ada untuk pembaca layar lewat aria-label. */}
                <p className="pengantar">
                  Silakan menghubungi kontak di bawah ini untuk mengatur ulang
                  username atau kata sandi Anda:
                </p>

                <div className="kontak">
                  {kontak?.wa && (
                    <a href={`https://wa.me/${nomorWa(kontak.wa)}`}
                       target="_blank" rel="noreferrer">
                      <IkonWa />
                      <span>{kontak.wa}</span>
                    </a>
                  )}
                  {kontak?.email && (
                    <a href={`mailto:${kontak.email}`}>
                      <IkonSurel />
                      <span>{kontak.email}</span>
                    </a>
                  )}
                  {!kontak?.wa && !kontak?.email && (
                    <span>
                      Kontak Admin IT belum diisi. Hubungi lewat jalur yang
                      biasa Anda pakai.
                    </span>
                  )}
                </div>

                <button type="button" ref={tutupRef} className="pri"
                        onClick={() => setLihatKontak(false)}>
                  Tutup
                </button>
              </div>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}

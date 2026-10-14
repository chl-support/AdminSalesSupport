"use client";

/**
 * Pendaftaran alamat email oleh pemilik akunnya sendiri.
 *
 * Muncul sesudah masuk, hanya bagi yang belum punya alamat terdaftar. Ada
 * supaya Admin IT tidak perlu mengetik alamat siapa pun — dan supaya alamat
 * itu ditetapkan oleh orang yang baru saja membuktikan tahu Password-nya,
 * bukan oleh orang yang sedang mengaku lupa.
 *
 * Dapat dilewati: tidak semua orang siap mengetik alamatnya saat itu juga, dan
 * kotak yang tidak dapat ditutup akan diisi asal-asalan hanya agar hilang.
 * Yang melewatinya ditanya lagi pada masuk berikutnya — kecuali ia menekan
 * "Jangan tanya lagi", yang disimpan di peramban ini saja.
 */

import { useEffect, useState } from "react";

import { useKata } from "./bahasa";
import type { Sesi } from "./session";

const PENANDA_LEWAT = "chl.email-nanti";

const KATA = {
  id: {
    judul: "Daftarkan email Anda",
    pengantar:
      "Sekali saja. Email ini dipakai untuk dua hal: mengirim kode bila Anda " +
      "lupa Password, dan mengabari bila ada pekerjaan yang menunggu Anda. " +
      "Tanpa email, keduanya harus lewat Admin IT.",
    labelEmail: "Alamat email Anda",
    kirim: "Kirim kode",
    mengirim: "Mengirim…",
    labelKode: "Kode 6 digit dari email",
    simpan: "Simpan",
    menyimpan: "Menyimpan…",
    nanti: "Nanti saja",
    jangan: "Jangan tanya lagi",
    terkirim: (menit: number) =>
      `Kode dikirim ke alamat itu. Berlaku ${menit} menit — periksa juga ` +
      `folder spam.`,
    selesai: (email: string) =>
      `Email ${email} sudah terdaftar pada akun Anda.`,
    gagal: "Tidak dapat melanjutkan",
    tutup: "Tutup",
    ganti: "Ganti alamat",
  },
  en: {
    judul: "Register your email",
    pengantar:
      "Just once. It is used for two things: sending a code if you forget " +
      "your password, and telling you when work is waiting for you. Without " +
      "an email both have to go through the IT Admin.",
    labelEmail: "Your email address",
    kirim: "Send code",
    mengirim: "Sending…",
    labelKode: "6-digit code from the email",
    simpan: "Save",
    menyimpan: "Saving…",
    nanti: "Later",
    jangan: "Do not ask again",
    terkirim: (menit: number) =>
      `A code was sent to that address. Valid for ${menit} minutes — check ` +
      `the spam folder too.`,
    selesai: (email: string) => `${email} is now registered to your account.`,
    gagal: "Cannot continue",
    tutup: "Close",
    ganti: "Change address",
  },
};

export function DaftarEmail({ sesi }: { sesi: Sesi }) {
  const k = useKata(KATA);
  const [tampil, setTampil] = useState(false);
  const [langkah, setLangkah] = useState<"email" | "kode" | "selesai">("email");
  const [email, setEmail] = useState("");
  const [kode, setKode] = useState("");
  const [kabar, setKabar] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  // Hanya bagi yang belum punya alamat, dan hanya bila ia belum menolak
  // ditanya. Pemeriksaannya di sini, bukan di pemanggilnya, supaya tidak ada
  // layar yang lupa memeriksanya.
  useEffect(() => {
    if (sesi.email) return;
    try {
      if (localStorage.getItem(PENANDA_LEWAT) === "1") return;
    } catch { /* penyimpanan ditutup; tetap ditawarkan */ }
    setTampil(true);
  }, [sesi.email]);

  if (!tampil) return null;

  const mintaKode = async () => {
    setGalat(null);
    setSibuk(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setKabar(k.terkirim(b.berlaku_menit ?? 15));
      setLangkah("kode");
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setSibuk(false); }
  };

  const simpan = async () => {
    setGalat(null);
    setSibuk(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kode: kode.trim() }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setKabar(k.selesai(b.email));
      setLangkah("selesai");
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setSibuk(false); }
  };

  const tutup = (selamanya = false) => {
    if (selamanya) {
      try { localStorage.setItem(PENANDA_LEWAT, "1"); } catch { /* biarkan */ }
    }
    setTampil(false);
  };

  return (
    <div className="tirai" onMouseDown={(e) => {
      if (e.target === e.currentTarget) tutup();
    }}>
      <div className="popup" role="dialog" aria-modal="true"
           aria-label={k.judul} style={{ maxWidth: 420 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 15 }}>{k.judul}</h2>

        {langkah === "email" && (
          <>
            <p className="pengantar">{k.pengantar}</p>
            <div className="lbl">{k.labelEmail}</div>
            <input type="email" value={email} autoComplete="email"
                   style={{ width: "100%" }}
                   onChange={(e) => setEmail(e.target.value)} />
            <button className="pri" disabled={sibuk || !email.includes("@")}
                    style={{ width: "100%", marginTop: 10 }}
                    onClick={() => void mintaKode()}>
              {sibuk ? k.mengirim : k.kirim}
            </button>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={() => tutup()}>{k.nanti}</button>
              <button onClick={() => tutup(true)}>{k.jangan}</button>
            </div>
          </>
        )}

        {langkah === "kode" && (
          <>
            <div className="banner ok">{kabar}</div>
            <div className="lbl">{k.labelKode}</div>
            <input value={kode} inputMode="numeric" maxLength={6}
                   style={{ width: "100%", letterSpacing: ".3em",
                            textAlign: "center", fontSize: 17 }}
                   onChange={(e) => setKode(e.target.value)} />
            <button className="pri" disabled={sibuk || kode.trim().length !== 6}
                    style={{ width: "100%", marginTop: 10 }}
                    onClick={() => void simpan()}>
              {sibuk ? k.menyimpan : k.simpan}
            </button>
            <button style={{ width: "100%", marginTop: 8 }}
                    onClick={() => { setLangkah("email"); setGalat(null); }}>
              {k.ganti}
            </button>
          </>
        )}

        {langkah === "selesai" && <div className="banner ok">{kabar}</div>}

        {galat && (
          <div className="banner stop" style={{ marginTop: 10 }}>
            <b>{k.gagal}</b>{galat}
          </div>
        )}

        {langkah === "selesai" && (
          <button className="pri" style={{ width: "100%", marginTop: 10 }}
                  onClick={() => tutup()}>{k.tutup}</button>
        )}
      </div>
    </div>
  );
}

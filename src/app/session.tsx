"use client";

/**
 * Penjaga sesi di sisi layar, dan tampilan siapa yang sedang masuk.
 *
 * Menggantikan pemilih "Masuk sebagai" yang lama. Pemilih itu membiarkan siapa
 * pun menjadi siapa pun dengan satu klik; identitas kini berasal dari cookie
 * sesi yang tidak dapat dibaca maupun dikarang dari JavaScript halaman.
 *
 * Pengalihan di sini hanya kenyamanan. Yang menjaga data adalah pemeriksaan di
 * setiap endpoint — melewati atau menonaktifkan halaman ini tidak memberi akses
 * apa pun, karena tidak ada satu pun data yang diambil tanpa cookie yang sah.
 */

import { useEffect, useRef, useState } from "react";

import { TombolBahasa, useBahasa } from "./bahasa";

export type Sesi = {
  username: string; full_name: string; role: string;
  /** Alamat surelnya sendiri, bila sudah ia daftarkan. */
  email?: string | null;
  project_slug?: string | null;
  project_name?: string | null;
  project_company?: string | null;
};

/** Label yang dibaca manusia untuk tiap peran di basis data. */
export const PERAN: Record<string, string> = {
  admin_sales: "Admin Sales",
  finance_tax: "Finance (Pajak)",
  finance_payment: "Finance (Pembayaran)",
  finance_manager: "Finance Manager",
  head_finance: "Head Finance",
  management: "Management",
  admin_system: "Admin IT",
};

/**
 * Nama peran dalam bahasa Inggris.
 *
 * Lima dari tujuh sudah berbahasa Inggris sejak awal — itu memang sebutan yang
 * dipakai di kantor. Yang perlu diterjemahkan hanya keterangan di dalam kurung
 * pada dua peran Finance, dan singkatan IT pada Admin IT.
 */
const PERAN_EN: Record<string, string> = {
  ...PERAN,
  finance_tax: "Finance (Tax)",
  finance_payment: "Finance (Payment)",
  admin_system: "IT Admin",
};

export const labelPeran = (r: string, bahasa: "id" | "en" = "id") =>
  (bahasa === "en" ? PERAN_EN : PERAN)[r] ?? r;

/**
 * Sesi yang sedang berjalan, atau pengalihan ke /login bila tidak ada.
 *
 * `memuat` dibedakan dari "tidak ada sesi" supaya halaman tidak sempat
 * memperlihatkan keadaan kosong sekejap sebelum pemeriksaannya selesai.
 */
export function useSesi(): { sesi: Sesi | null; memuat: boolean } {
  const [sesi, setSesi] = useState<Sesi | null>(null);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    let batal = false;
    fetch("/api/auth/me")
      .then(async (r) => {
        if (batal) return;
        if (r.ok) {
          const s: Sesi = await r.json();
          // Hampir seluruh layar konsol menyaring datanya menurut project.
          // Tanpa project terpilih, yang tampil adalah layar kosong yang tidak
          // menjelaskan sebabnya — jadi dialihkan ke pemilihnya, membawa serta
          // halaman yang tadi dituju.
          if (!s.project_slug && window.location.pathname !== "/project") {
            const next = encodeURIComponent(
              window.location.pathname + window.location.search);
            location.href = `/project?next=${next}`;
            return;
          }
          setSesi(s);
        } else {
          // Halaman yang diminta dibawa serta, supaya setelah masuk orangnya
          // mendarat di tempat yang tadi dituju, bukan selalu di beranda.
          const next = encodeURIComponent(
            window.location.pathname + window.location.search);
          location.href = `/login?next=${next}`;
        }
      })
      .catch(() => { if (!batal) location.href = "/login"; })
      .finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, []);

  return { sesi, memuat };
}

export async function keluar(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.href = "/login";
}

/** Nama, peran, dan tombol keluar. */
/** Inisial dari nama, untuk lencana profil. */
function inisial(nama: string) {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (!kata.length) return "?";
  return (kata[0][0] + (kata.length > 1 ? kata[kata.length - 1][0] : "")).toUpperCase();
}

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
 * Lencana profil di kanan atas: inisial yang bila diklik memperlihatkan nama,
 * peran, dan tombol keluar.
 *
 * Nama dan peran terbaca hanya saat dibutuhkan, sementara tombol keluar tidak
 * lagi berdiri sepanjang hari di sebelah nama — tombol yang hanya dipakai
 * sekali sehari tidak perlu selalu terlihat, dan yang selalu terlihat cepat
 * atau lambat tertekan tanpa sengaja.
 */
const KATA = {
  id: { profil: (n: string) => `Profil ${n}`, keluar: "Keluar",
        gantiProject: "Ganti project", bahasa: "Bahasa",
        hubungi: "Jika ada kendala, silahkan hubungi Admin IT:",
        kontakKosong: "Kontak Admin IT belum diisi." },
  en: { profil: (n: string) => `${n} profile`, keluar: "Sign out",
        gantiProject: "Switch project", bahasa: "Language",
        hubungi: "If anything goes wrong, contact the IT Admin:",
        kontakKosong: "No IT Admin contact has been set." },
};

/**
 * Nomor WhatsApp menjadi bentuk yang diterima wa.me.
 *
 * Nomor Indonesia hampir selalu ditulis diawali 0, dan wa.me tidak mengenal
 * bentuk itu: tautannya terbuka, lalu WhatsApp menjawab nomornya tidak
 * terdaftar. Yang salah bukan nomornya melainkan cara menuliskannya.
 */
const nomorWa = (nomor: string) =>
  nomor.replace(/\D/g, "").replace(/^0/, "62");

export function BilahPengguna({ sesi }: { sesi: Sesi }) {
  const { bahasa } = useBahasa();
  const k = KATA[bahasa];
  const [buka, setBuka] = useState(false);
  const kotak = useRef<HTMLDivElement | null>(null);
  const [kontak, setKontak] = useState<{ wa: string | null;
                                         email: string | null } | null>(null);

  // Diambil sekali, saat panel dibuka. Bukan saat halaman dimuat: kontak Admin
  // IT dibaca beberapa kali setahun, dan tiap layar tidak perlu memintanya.
  useEffect(() => {
    if (!buka || kontak) return;
    let hidup = true;
    fetch("/api/kontak-admin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (hidup) setKontak(d ?? { wa: null, email: null }); })
      .catch(() => { if (hidup) setKontak({ wa: null, email: null }); });
    return () => { hidup = false; };
  }, [buka, kontak]);

  // Tutup saat menekan di luar atau menekan Esc. Panel yang hanya dapat ditutup
  // lewat lencananya sendiri akan menghalangi isi halaman di belakangnya.
  useEffect(() => {
    if (!buka) return;
    const diLuar = (e: MouseEvent) => {
      if (kotak.current && !kotak.current.contains(e.target as Node)) setBuka(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setBuka(false); };
    document.addEventListener("mousedown", diLuar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", diLuar);
      document.removeEventListener("keydown", esc);
    };
  }, [buka]);

  return (
    <div className="bilah" ref={kotak}>
      <button className="lencana" onClick={() => setBuka((v) => !v)}
              aria-haspopup="menu" aria-expanded={buka}
              aria-label={k.profil(sesi.full_name)}>
        {inisial(sesi.full_name)}
      </button>

      {buka && (
        <div className="profil" role="menu">
          <div className="siapa">
            <b>{sesi.full_name}</b>
            <span className="pill">{labelPeran(sesi.role, bahasa)}</span>
          </div>
          {/* Bahasa berdiri di sini, bukan di bilah atas. Ia pilihan orang,
              sekelas dengan project yang sedang dibuka dan dengan keluar —
              ketiganya tentang orangnya, bukan tentang halaman yang sedang
              dilihat. Bilah atas pun sudah memuat judul, lencana project dan
              lencana nama; satu kotak lagi di sana akan menambah benda yang
              harus dilewati mata sebelum sampai ke judulnya.

              Sebelumnya pilihan ini hanya ada di halaman masuk, dan yang salah
              pilih harus keluar dulu untuk membetulkannya — keluar dari
              pekerjaan yang sedang berjalan, hanya untuk mengganti bahasa. */}
          <div className="baris-bahasa">
            <span>{k.bahasa}</span>
            <TombolBahasa className="dalam-menu" />
          </div>
          {/* Berganti project berarti berganti seluruh isi layar, jadi ia
              berada di tempat yang sama dengan keluar — keduanya mengakhiri apa
              yang sedang dikerjakan. */}
          <button onClick={() => { location.href = "/project"; }}>
            {k.gantiProject}
          </button>
          <button onClick={() => void keluar()}>{k.keluar}</button>

          {/* Kontak Admin IT, dipindahkan ke sini dari layar masuk. Bukan
              tombol: ia bukan tindakan sekelas Keluar atau Ganti project,
              melainkan keterangan — satu kalimat kecil dengan nomor yang
              langsung dapat ditekan di bawahnya. */}
          {kontak && (
            <div className="kontak-menu">
              <p className="ket-kontak">{k.hubungi}</p>
              {kontak?.wa && (
                <a href={`https://wa.me/${nomorWa(kontak.wa)}`}
                   target="_blank" rel="noreferrer">
                  <IkonWa /><span>{kontak.wa}</span>
                </a>
              )}
              {kontak?.email && (
                <a href={`mailto:${kontak.email}`}>
                  <IkonSurel /><span>{kontak.email}</span>
                </a>
              )}
              {!kontak?.wa && !kontak?.email && <span>{k.kontakKosong}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

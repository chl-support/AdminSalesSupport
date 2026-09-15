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

export type Sesi = { username: string; full_name: string; role: string };

/** Label yang dibaca manusia untuk tiap peran di basis data. */
export const PERAN: Record<string, string> = {
  admin_sales: "Admin Sales",
  finance_tax: "Finance (Pajak)",
  finance_payment: "Finance (Pembayaran)",
  finance_manager: "Finance Manager",
  head_finance: "Head Finance",
  management: "Management",
  admin_system: "Admin Sistem",
};

export const labelPeran = (r: string) => PERAN[r] ?? r;

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
          setSesi(await r.json());
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

/**
 * Lencana profil di kanan atas: inisial yang bila diklik memperlihatkan nama,
 * peran, dan tombol keluar.
 *
 * Nama dan peran terbaca hanya saat dibutuhkan, sementara tombol keluar tidak
 * lagi berdiri sepanjang hari di sebelah nama — tombol yang hanya dipakai
 * sekali sehari tidak perlu selalu terlihat, dan yang selalu terlihat cepat
 * atau lambat tertekan tanpa sengaja.
 */
export function BilahPengguna({ sesi }: { sesi: Sesi }) {
  const [buka, setBuka] = useState(false);
  const kotak = useRef<HTMLDivElement | null>(null);

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
              aria-label={`Profil ${sesi.full_name}`}>
        {inisial(sesi.full_name)}
      </button>

      {buka && (
        <div className="profil" role="menu">
          <div className="siapa">
            <b>{sesi.full_name}</b>
            <span className="pill">{labelPeran(sesi.role)}</span>
          </div>
          <button onClick={() => void keluar()}>Keluar</button>
        </div>
      )}
    </div>
  );
}

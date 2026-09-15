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

import { useEffect, useState } from "react";

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
export function BilahPengguna({ sesi }: { sesi: Sesi }) {
  return (
    <div className="bilah">
      <div className="lbl">Masuk sebagai</div>
      <div className="row" style={{ marginBottom: 0, alignItems: "center" }}>
        <span style={{ fontSize: 13 }}>
          <b>{sesi.full_name}</b>{" "}
          <span className="pill">{labelPeran(sesi.role)}</span>
        </span>
        <button style={{ padding: "4px 9px", fontSize: 12 }}
                onClick={() => void keluar()}>
          Keluar
        </button>
      </div>
    </div>
  );
}

/**
 * Pengiriman surel.
 *
 * Konsol ini sampai sekarang tidak pernah mengirim surel sendiri: tautan tanda
 * tangan dan kodenya diserahkan Admin lewat WhatsApp, dengan tangannya sendiri.
 * "Lupa kata sandi" tidak dapat ditempuh begitu — kodenya justru harus sampai
 * ke orangnya tanpa melewati siapa pun, sebab yang hendak dihindari adalah
 * ketergantungan pada Admin.
 *
 * Dikirim lewat Resend karena ia satu panggilan HTTPS biasa: tidak ada SMTP,
 * tidak ada pustaka tambahan, dan Vercel tidak mengizinkan koneksi SMTP keluar
 * dari fungsi serverless-nya.
 *
 * Dua nilai yang harus dipasang di Environment Variables, lewat dashboard:
 *
 *   RESEND_API_KEY   kunci dari dasbor Resend
 *   SUREL_PENGIRIM   alamat pengirim pada domain yang sudah diverifikasi di
 *                    sana, mis. "CHL Sales Admin <noreply@domain-anda.com>"
 *
 * Tanpa keduanya, fungsi di bawah menolak dengan kalimat yang menyebutkan apa
 * yang kurang — bukan diam-diam berhasil. Kode verifikasi yang tidak pernah
 * terkirim tetapi dilaporkan "terkirim" membuat orang menunggu sesuatu yang
 * tidak pernah datang.
 */

import { query } from "./db";
import { WorkflowError } from "./galat";

export function surelSiap(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.SUREL_PENGIRIM);
}

/**
 * Mencatat satu pengiriman ke riwayat.
 *
 * Kegagalan pencatatannya ditelan: surel yang sudah terkirim tidak boleh
 * dilaporkan gagal hanya karena catatannya tidak tertulis — dan tabelnya
 * mungkin belum terpasang pada basis data yang belum menerima pemasangan
 * kolom.
 */
async function catat(p: {
  kepada: string; perihal: string; jenis: string; userId?: string | null;
  berhasil: boolean; galat?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO surel_log (kepada, perihal, jenis, user_id, berhasil, galat)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [p.kepada, p.perihal, p.jenis, p.userId ?? null, p.berhasil,
       p.galat ?? null]);
  } catch { /* tabelnya menyusul pada pemasangan berikutnya */ }
}

export async function kirimSurel(p: {
  kepada: string; perihal: string; isi: string;
  /** Untuk riwayat: jenis surel dan pemiliknya, bila diketahui. */
  jenis?: string; userId?: string | null;
}): Promise<void> {
  if (!surelSiap()) {
    throw new WorkflowError(
      "Pengiriman surel belum dikonfigurasi, jadi kode verifikasi tidak dapat " +
      "dikirim. Admin IT perlu memasang RESEND_API_KEY dan SUREL_PENGIRIM " +
      "pada Environment Variables.", "surel_belum_siap", 503);
  }

  // Alamatnya dapat dialihkan lewat SUREL_URL: dipakai menguji alur ini tanpa
  // benar-benar mengirim surel, dan membuka jalan bagi penyedia lain yang
  // menerima bentuk permintaan yang sama.
  const alamat = process.env.SUREL_URL || "https://api.resend.com/emails";
  const res = await fetch(alamat, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.SUREL_PENGIRIM,
      to: [p.kepada],
      subject: p.perihal,
      text: p.isi,
    }),
  });

  if (!res.ok) {
    // Isi jawabannya ikut disebut: "gagal mengirim" tanpa sebab membuat Admin
    // IT menebak antara kunci yang salah, domain yang belum diverifikasi, dan
    // alamat tujuan yang keliru — tiga hal dengan tiga perbaikan berbeda.
    const detail = await res.text().catch(() => "");
    await catat({ kepada: p.kepada, perihal: p.perihal,
                  jenis: p.jenis ?? "lain", userId: p.userId,
                  berhasil: false,
                  galat: `HTTP ${res.status} ${detail.slice(0, 200)}` });
    throw new WorkflowError(
      `Surel gagal dikirim (HTTP ${res.status}). ${detail.slice(0, 200)}`,
      "surel_gagal", 502);
  }

  await catat({ kepada: p.kepada, perihal: p.perihal,
                jenis: p.jenis ?? "lain", userId: p.userId, berhasil: true });
}

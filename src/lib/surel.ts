/**
 * Pengiriman surel.
 *
 * Konsol ini sampai sekarang tidak pernah mengirim surel sendiri: tautan tanda
 * tangan dan kodenya diserahkan Admin lewat WhatsApp, dengan tangannya sendiri.
 * "Lupa Password" tidak dapat ditempuh begitu — kodenya justru harus sampai ke
 * orangnya tanpa melewati siapa pun, sebab yang hendak dihindari adalah
 * ketergantungan pada Admin.
 *
 * Dua jalan, dan yang terpasang dipilih dari environment:
 *
 * 1. SMTP — dipakai bila SUREL_SMTP_USER dan SUREL_SMTP_PASS terisi. Inilah
 *    jalannya bila alamat pengirimnya Gmail: surat yang benar-benar keluar
 *    dari Gmail lolos pemeriksaan SPF/DKIM atas nama gmail.com, sedangkan
 *    penyedia pihak ketiga tidak dapat mengirim atas nama domain yang bukan
 *    miliknya — dan surat semacam itu berakhir di folder spam. Vercel
 *    memblokir port 25 saja; 587 dan 465 terbuka.
 *
 *      SUREL_SMTP_USER   alamat Gmail-nya, mis. admin.chl@gmail.com
 *      SUREL_SMTP_PASS   App Password 16 huruf dari Google (bukan sandi akun;
 *                        hanya muncul setelah Verifikasi 2 Langkah menyala)
 *      SUREL_SMTP_HOST   bawaan smtp.gmail.com
 *      SUREL_SMTP_PORT   bawaan 587
 *      SUREL_PENGIRIM    mis. "Admin CHL <admin.chl@gmail.com>" — alamat di
 *                        dalamnya harus sama dengan SUREL_SMTP_USER; Gmail
 *                        menolak mengirim atas nama alamat lain.
 *
 * 2. Resend — dipakai bila RESEND_API_KEY terisi dan SMTP tidak. Satu
 *    panggilan HTTPS biasa, dan pengirimnya harus domain yang diverifikasi di
 *    sana.
 *
 * Tanpa keduanya, fungsi di bawah menolak dengan kalimat yang menyebutkan apa
 * yang kurang — bukan diam-diam berhasil. Kode verifikasi yang tidak pernah
 * terkirim tetapi dilaporkan "terkirim" membuat orang menunggu sesuatu yang
 * tidak pernah datang.
 */

import { query } from "./db";
import { WorkflowError } from "./galat";

/** Jalan pengiriman yang sedang terpasang, atau null bila belum ada. */
export function jalurSurel(): "smtp" | "resend" | null {
  if (!process.env.SUREL_PENGIRIM) return null;
  if (process.env.SUREL_SMTP_USER && process.env.SUREL_SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

export function surelSiap(): boolean {
  return jalurSurel() !== null;
}

/** Alamat pengirim yang sedang terbaca, untuk ditampilkan di layar Admin IT. */
export function alamatPengirim(): string | null {
  return process.env.SUREL_PENGIRIM ?? null;
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

/**
 * Mengirim lewat SMTP — jalannya Gmail.
 *
 * nodemailer dimuat saat dipakai, bukan di kepala berkas: yang memasang Resend
 * tidak perlu ikut menanggung pustaka ini pada tiap permintaan.
 */
async function lewatSmtp(p: { kepada: string; perihal: string; isi: string }) {
  const { createTransport } = await import("nodemailer");
  const port = Number(process.env.SUREL_SMTP_PORT || 587);
  const kurir = createTransport({
    host: process.env.SUREL_SMTP_HOST || "smtp.gmail.com",
    port,
    // 465 memakai TLS sejak detik pertama; 587 memulai polos lalu naik ke TLS
    // lewat STARTTLS. Keduanya terenkripsi — yang salah hanya bila keduanya
    // ditukar.
    secure: port === 465,
    auth: {
      user: process.env.SUREL_SMTP_USER!,
      pass: process.env.SUREL_SMTP_PASS!,
    },
  });
  await kurir.sendMail({
    from: process.env.SUREL_PENGIRIM!,
    to: p.kepada,
    subject: p.perihal,
    text: p.isi,
  });
}

/** Mengirim lewat Resend — satu panggilan HTTPS. */
async function lewatResend(p: { kepada: string; perihal: string; isi: string }) {
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
    const detail = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
}

export async function kirimSurel(p: {
  kepada: string; perihal: string; isi: string;
  /** Untuk riwayat: jenis surel dan pemiliknya, bila diketahui. */
  jenis?: string; userId?: string | null;
}): Promise<void> {
  const jalur = jalurSurel();
  if (!jalur) {
    throw new WorkflowError(
      "Pengiriman email belum dikonfigurasi, jadi kode verifikasi tidak dapat " +
      "dikirim. Admin IT perlu memasang SUREL_PENGIRIM beserta SUREL_SMTP_USER " +
      "dan SUREL_SMTP_PASS (Gmail), atau RESEND_API_KEY, pada Environment " +
      "Variables.", "surel_belum_siap", 503);
  }

  try {
    if (jalur === "smtp") await lewatSmtp(p);
    else await lewatResend(p);
  } catch (err: any) {
    // Sebabnya ikut dicatat: "gagal mengirim" tanpa sebab membuat Admin IT
    // menebak antara sandi aplikasi yang salah, alamat pengirim yang tidak
    // sama dengan akun SMTP-nya, dan alamat tujuan yang keliru — tiga hal
    // dengan tiga perbaikan berbeda.
    const sebab = String(err?.message ?? err).slice(0, 200);
    await catat({ kepada: p.kepada, perihal: p.perihal,
                  jenis: p.jenis ?? "lain", userId: p.userId,
                  berhasil: false, galat: `${jalur}: ${sebab}` });
    throw new WorkflowError(`Email gagal dikirim. ${sebab}`, "surel_gagal", 502);
  }

  await catat({ kepada: p.kepada, perihal: p.perihal,
                jenis: p.jenis ?? "lain", userId: p.userId, berhasil: true });
}

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

import { one, query } from "./db";
import { buka } from "./sandi-terlihat";
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
  projectId?: string | null; berhasil: boolean; galat?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO surel_log (kepada, perihal, jenis, user_id, project_id,
                              berhasil, galat)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p.kepada, p.perihal, p.jenis, p.userId ?? null, p.projectId ?? null,
       p.berhasil, p.galat ?? null]);
  } catch { /* tabelnya menyusul pada pemasangan berikutnya */ }
}

/**
 * Pengirim yang berlaku untuk sebuah email.
 *
 * Project boleh punya pengirimnya sendiri — tiap project diurus orang yang
 * berbeda, dan surat yang datang dari alamat project itulah yang dikenali
 * Sales/Agent-nya. Yang tidak mengisinya memakai pengirim bawaan dari
 * Environment Variables; email yang bukan milik project mana pun (kode Lupa
 * Password, verifikasi email) selalu memakai yang bawaan.
 */
export type Pengirim = {
  jalur: "smtp" | "resend";
  dari: string;
  smtpUser?: string; smtpPass?: string; smtpHost?: string; smtpPort?: number;
};

async function pengirimProject(projectId: string): Promise<Pengirim | null> {
  const p = await one<{ surel_pengirim: string | null; smtp_user: string | null;
                        smtp_pass_enc: string | null; smtp_host: string | null;
                        smtp_port: number | null }>(
    `SELECT NULLIF(to_jsonb(projects) ->> 'surel_pengirim','') AS surel_pengirim,
            NULLIF(to_jsonb(projects) ->> 'smtp_user','')      AS smtp_user,
            NULLIF(to_jsonb(projects) ->> 'smtp_pass_enc','')  AS smtp_pass_enc,
            NULLIF(to_jsonb(projects) ->> 'smtp_host','')      AS smtp_host,
            NULLIF(to_jsonb(projects) ->> 'smtp_port','')::int AS smtp_port
       FROM projects WHERE id = $1`, [projectId]).catch(() => null);
  if (!p?.surel_pengirim || !p.smtp_user || !p.smtp_pass_enc) return null;

  const sandi = await buka(p.smtp_pass_enc);
  if (!sandi) return null;   // kuncinya berganti; jatuh ke pengirim bawaan
  return {
    jalur: "smtp", dari: p.surel_pengirim,
    smtpUser: p.smtp_user, smtpPass: sandi,
    smtpHost: p.smtp_host ?? "smtp.gmail.com",
    smtpPort: p.smtp_port ?? 587,
  };
}

function pengirimBawaan(): Pengirim | null {
  const jalur = jalurSurel();
  if (!jalur) return null;
  return {
    jalur,
    dari: process.env.SUREL_PENGIRIM!,
    smtpUser: process.env.SUREL_SMTP_USER,
    smtpPass: process.env.SUREL_SMTP_PASS,
    smtpHost: process.env.SUREL_SMTP_HOST || "smtp.gmail.com",
    smtpPort: Number(process.env.SUREL_SMTP_PORT || 587),
  };
}

/**
 * Mengirim lewat SMTP — jalannya Gmail.
 *
 * nodemailer dimuat saat dipakai, bukan di kepala berkas: yang memasang Resend
 * tidak perlu ikut menanggung pustaka ini pada tiap permintaan.
 */
async function lewatSmtp(p: { kepada: string; perihal: string; isi: string },
                         dari: Pengirim) {
  const { createTransport } = await import("nodemailer");
  const port = dari.smtpPort ?? 587;
  const kurir = createTransport({
    host: dari.smtpHost ?? "smtp.gmail.com",
    port,
    // 465 memakai TLS sejak detik pertama; 587 memulai polos lalu naik ke TLS
    // lewat STARTTLS. Keduanya terenkripsi — yang salah hanya bila keduanya
    // ditukar.
    secure: port === 465,
    auth: { user: dari.smtpUser!, pass: dari.smtpPass! },
  });
  await kurir.sendMail({
    from: dari.dari,
    to: p.kepada,
    subject: p.perihal,
    text: p.isi,
  });
}

/** Mengirim lewat Resend — satu panggilan HTTPS. */
async function lewatResend(p: { kepada: string; perihal: string; isi: string },
                           dari: Pengirim) {
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
      from: dari.dari,
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
  /** Bila diisi, pengirim project itulah yang dipakai — bila ia mengisinya. */
  projectId?: string | null;
}): Promise<void> {
  const dari = (p.projectId ? await pengirimProject(p.projectId) : null)
            ?? pengirimBawaan();
  if (!dari) {
    throw new WorkflowError(
      "Pengiriman email belum dikonfigurasi, jadi kode verifikasi tidak dapat " +
      "dikirim. Admin IT perlu memasang SUREL_PENGIRIM beserta SUREL_SMTP_USER " +
      "dan SUREL_SMTP_PASS (Gmail), atau RESEND_API_KEY, pada Environment " +
      "Variables.", "surel_belum_siap", 503);
  }

  try {
    if (dari.jalur === "smtp") await lewatSmtp(p, dari);
    else await lewatResend(p, dari);
  } catch (err: any) {
    // Sebabnya ikut dicatat: "gagal mengirim" tanpa sebab membuat Admin IT
    // menebak antara sandi aplikasi yang salah, alamat pengirim yang tidak
    // sama dengan akun SMTP-nya, dan alamat tujuan yang keliru — tiga hal
    // dengan tiga perbaikan berbeda.
    const sebab = String(err?.message ?? err).slice(0, 200);
    await catat({ kepada: p.kepada, perihal: p.perihal,
                  jenis: p.jenis ?? "lain", userId: p.userId,
                  projectId: p.projectId, berhasil: false,
                  galat: `${dari.jalur}: ${sebab}` });
    throw new WorkflowError(`Email gagal dikirim. ${sebab}`, "surel_gagal", 502);
  }

  await catat({ kepada: p.kepada, perihal: p.perihal,
                jenis: p.jenis ?? "lain", userId: p.userId,
                projectId: p.projectId, berhasil: true });
}

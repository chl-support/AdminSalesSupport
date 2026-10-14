import { handler, requireRole } from "@/lib/api";
import { alamatPengirim, jalurSurel } from "@/lib/surel";

/**
 * Keadaan pengiriman email, sebagaimana terbaca oleh fungsi yang sedang
 * berjalan — bukan sebagaimana tertulis di dashboard.
 *
 * Ada karena keduanya kerap berbeda: variabel yang baru diisi belum terbaca
 * sampai deployment berikutnya dibuat, dan tanpa layar yang menyebutkannya,
 * satu-satunya cara mengetahuinya adalah mencoba mengirim lalu menebak sebab
 * kegagalannya.
 *
 * Yang dikembalikan hanya bentuknya: jalur mana yang terpasang dan alamat
 * pengirimnya. Sandi aplikasi dan kunci API tidak pernah ikut.
 */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_system");
  const jalur = jalurSurel();
  return {
    aktif: jalur !== null,
    jalur,                       // "smtp" | "resend" | null
    pengirim: alamatPengirim(),
    smtp_host: jalur === "smtp"
      ? (process.env.SUREL_SMTP_HOST || "smtp.gmail.com") : null,
    smtp_port: jalur === "smtp"
      ? Number(process.env.SUREL_SMTP_PORT || 587) : null,
    // Alamat akun SMTP-nya ikut disebut: Gmail menolak mengirim atas nama
    // alamat lain, jadi beda antara keduanya adalah sebab kegagalan yang
    // paling sering dan paling tidak terlihat.
    smtp_user: jalur === "smtp" ? (process.env.SUREL_SMTP_USER ?? null) : null,
  };
});

import { handler, requireRole } from "@/lib/api";
import { query } from "@/lib/db";

/**
 * Riwayat pengiriman email.
 *
 * Tanpa catatan ini, "emailnya tidak sampai" hanya dapat dijawab dengan
 * tebakan: tidak ada cara membedakan email yang tidak pernah dikirim dari
 * email yang terkirim ke alamat yang keliru, atau dari email yang ditolak
 * penyedianya. Ketiganya punya perbaikan yang berbeda.
 *
 * Hanya Admin IT. Alamat email orang lain bukan bacaan umum.
 */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_system");
  return query(
    `SELECT l.kepada, l.perihal, l.jenis, l.berhasil, l.galat, l.created_at,
            u.username
       FROM surel_log l
       LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
      LIMIT 100`);
});

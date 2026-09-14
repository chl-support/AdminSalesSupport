import { handler, requireRole } from "@/lib/api";
import { audit, one, query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { WorkflowError } from "@/lib/workflow";

/**
 * Pengelolaan akun oleh Admin Sistem.
 *
 * Ada karena mengganti sandi sebelumnya hanya mungkin lewat baris perintah,
 * sementara sandi bawaan hasil seed tertulis di repositori publik. Jalur yang
 * hanya dapat ditempuh sebagian orang membuat penggantian sandi tertunda — dan
 * sandi yang tertunda penggantiannya adalah sandi yang bocor.
 */

const MIN_PANJANG = 8;

export const GET = handler(async (req) => {
  await requireRole(req, "admin_system");
  return query(
    `SELECT u.username, u.full_name, u.role, u.active,
            (SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = u.id
              AND s.expires_at > now()) AS sesi_aktif,
            (SELECT MAX(attempted_at) FROM login_attempts l
              WHERE l.username = u.username AND l.succeeded) AS terakhir_masuk
       FROM users u ORDER BY u.username`);
});

export const POST = handler(async (req) => {
  const admin = await requireRole(req, "admin_system");
  const p = await req.json().catch(() => ({} as any));

  const username = String(p.username ?? "").trim().toLowerCase();
  const sandi = String(p.password ?? "");

  if (!username) {
    throw new WorkflowError("Pengguna belum dipilih.", "validation", 422);
  }
  if (sandi.length < MIN_PANJANG) {
    throw new WorkflowError(
      `Kata sandi minimal ${MIN_PANJANG} karakter.`, "validation", 422);
  }

  const target = await one<{ id: string; username: string; full_name: string }>(
    "SELECT id, username, full_name FROM users WHERE username = $1", [username]);
  if (!target) {
    throw new WorkflowError(`Pengguna '${username}' tidak ada.`, "not_found", 404);
  }

  await query("UPDATE users SET password_hash = $1 WHERE id = $2",
              [await hashPassword(sandi), target.id]);

  // Seluruh sesi yang sedang berjalan diputus. Mengganti sandi tanpa memutusnya
  // tidak mengusir siapa pun — dan mengganti sandi justru paling sering
  // dilakukan karena ada yang perlu diusir.
  const sesi = await query("DELETE FROM sessions WHERE user_id = $1 RETURNING id",
                           [target.id]);

  await audit({
    entityType: "user", entityId: target.id, action: "password_reset",
    actor: admin.username,
    reason: `Sandi ${target.username} diganti oleh ${admin.username}.`,
  });

  return {
    ok: true,
    username: target.username,
    full_name: target.full_name,
    sesi_diputus: sesi.length,
  };
});

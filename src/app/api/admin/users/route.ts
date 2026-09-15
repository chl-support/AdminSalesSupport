import { handler, requireRole } from "@/lib/api";
import { audit, one, query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { WorkflowError } from "@/lib/workflow";

/**
 * Pengelolaan akun oleh Admin IT.
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

/**
 * Ganti username.
 *
 * Username adalah nama yang tercatat sebagai pelaku pada jejak audit, dan jejak
 * itu tidak dapat disunting. Entri lama karenanya tetap menyebut nama lama —
 * bukan cacat, melainkan sifat catatan yang append-only. Yang dijaga di sini
 * adalah tersedianya jembatan: penggantiannya sendiri dicatat beserta nama lama
 * dan barunya, sehingga riwayat sebelum dan sesudahnya masih dapat dirangkai.
 *
 * Sesi yang sedang berjalan tidak diputus: sesi menempel pada id pengguna, bukan
 * pada namanya, jadi orangnya tetap masuk sebagai dirinya sendiri. Yang berubah
 * hanya nama yang ia ketik saat masuk berikutnya.
 */
export const PATCH = handler(async (req) => {
  const admin = await requireRole(req, "admin_system");
  const p = await req.json().catch(() => ({} as any));

  const lama = String(p.username ?? "").trim().toLowerCase();
  const baru = String(p.new_username ?? "").trim().toLowerCase();

  if (!lama) throw new WorkflowError("Pengguna belum dipilih.", "validation", 422);
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(baru)) {
    throw new WorkflowError(
      "Username baru: 3–32 karakter, huruf kecil, angka, titik, garis bawah, " +
      "atau strip, diawali huruf atau angka.", "validation", 422);
  }
  if (lama === baru) {
    throw new WorkflowError("Username baru sama dengan yang lama.",
                            "validation", 422);
  }

  const target = await one<{ id: string; full_name: string }>(
    "SELECT id, full_name FROM users WHERE username = $1", [lama]);
  if (!target) {
    throw new WorkflowError(`Pengguna '${lama}' tidak ada.`, "not_found", 404);
  }
  const bentrok = await one("SELECT id FROM users WHERE username = $1", [baru]);
  if (bentrok) {
    throw new WorkflowError(`Username '${baru}' sudah dipakai.`, "conflict", 409);
  }

  await query("UPDATE users SET username = $1 WHERE id = $2", [baru, target.id]);

  // Riwayat percobaan masuk menempel pada username, bukan pada id. Dibiarkan
  // apa adanya, penguncian akibat salah sandi berpindah ke nama lama yang sudah
  // tidak dipakai siapa pun — dan hitungan gagal pada nama baru mulai dari nol
  // tanpa alasan. Ikut dipindahkan.
  await query("UPDATE login_attempts SET username = $1 WHERE username = $2",
              [baru, lama]);

  await audit({
    entityType: "user", entityId: target.id, action: "username_changed",
    actor: admin.username, before: { username: lama }, after: { username: baru },
    reason: `Username ${lama} diganti menjadi ${baru} oleh ${admin.username}.`,
  });

  return { ok: true, username: baru, username_lama: lama,
           full_name: target.full_name };
});

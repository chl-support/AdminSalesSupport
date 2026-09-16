import { handler, requireRole, body } from "@/lib/api";
import { isiTabel, kosongkan } from "@/lib/kosongkan";

/** Isi tiap tabel operasional, untuk diperlihatkan sebelum pengosongan. */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_system");
  return { isi: await isiTabel() };
});

/**
 * Kosongkan data operasional.
 *
 * Hanya Admin IT, dan hanya dengan kata penegasan yang diketik ulang. Tindakan
 * ini tidak dapat dibatalkan: yang terhapus tidak ada salinannya di sistem ini.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_system");
  const p = await body(req);
  return kosongkan(user.username, String(p.penegasan ?? ""));
});

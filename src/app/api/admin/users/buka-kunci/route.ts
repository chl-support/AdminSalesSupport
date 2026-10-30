import { handler, requireRole } from "@/lib/api";
import { bukaKunci } from "@/lib/auth";
import { audit, one } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";

/**
 * Buka kunci akun yang tertahan setelah beberapa kali salah Password.
 *
 * Penguncian sengaja berakhir sendiri setelah 15 menit — ia menahan penebak,
 * bukan menghukum pemiliknya. Tetapi yang terkunci kerap orang yang sedang
 * ditunggu pekerjaannya, dan menyuruhnya menunggu seperempat jam padahal
 * Admin IT sudah memastikan itu memang dia hanyalah menunda pekerjaan. Jadi
 * Admin IT dapat membukanya sekarang.
 *
 * Yang dihapus hanya percobaan gagal yang sedang terhitung — yang di luar
 * jendela penguncian atau sebelum keberhasilan terakhir memang sudah tidak
 * menahan siapa pun, dan tetap tersimpan sebagai jejak. Pembukaannya sendiri
 * tercatat di jejak audit beserta siapa yang membukanya.
 */
export const POST = handler(async (req) => {
  const admin = await requireRole(req, "admin_system");
  const p = await req.json().catch(() => ({} as any));
  const username = String(p.username ?? "").trim().toLowerCase();
  if (!username) {
    throw new WorkflowError("Pengguna belum dipilih.", "validation", 422);
  }

  const target = await one<{ id: string; username: string; full_name: string }>(
    "SELECT id, username, full_name FROM users WHERE username = $1", [username]);
  if (!target) {
    throw new WorkflowError(`Pengguna '${username}' tidak ada.`, "not_found", 404);
  }

  const dibuka = await bukaKunci(username);

  await audit({
    entityType: "user", entityId: target.id, action: "login_unlocked",
    actor: admin.username, after: { username: target.username, percobaan: dibuka },
  });

  return { username: target.username, nama: target.full_name, dibuka };
});

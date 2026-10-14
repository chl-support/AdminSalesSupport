import { handler, requireRole } from "@/lib/api";
import { audit, one, query } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";

/**
 * Alamat surel pengguna, diisi Admin IT.
 *
 * Ke alamat inilah kode verifikasi "lupa kata sandi" dikirim, jadi ia yang
 * menentukan apakah seseorang punya jalan kembali tanpa menghubungi siapa pun.
 * Pengguna tidak dapat mengubahnya sendiri: alamat surel yang dapat diganti
 * dari dalam akun berarti siapa pun yang sempat memakai komputer orang lain
 * dapat memindahkan jalan masuk itu ke alamatnya sendiri.
 *
 * Boleh dikosongkan — tidak setiap akun punya surel, dan memaksanya berarti
 * mengarang alamat yang tidak ada.
 */

const BENTUK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST = handler(async (req) => {
  const admin = await requireRole(req, "admin_system");
  const p = await req.json().catch(() => ({} as any));

  const username = String(p.username ?? "").trim().toLowerCase();
  const email = String(p.email ?? "").trim().toLowerCase();

  if (!username) {
    throw new WorkflowError("Pengguna belum dipilih.", "validation", 422);
  }
  if (email && !BENTUK.test(email)) {
    throw new WorkflowError("Alamat surel tidak sah.", "validation", 422);
  }

  const target = await one<{ id: string; username: string; full_name: string;
                             email: string | null }>(
    `SELECT id, username, full_name,
            NULLIF(to_jsonb(users) ->> 'email', '') AS email
       FROM users WHERE username = $1`, [username]);
  if (!target) {
    throw new WorkflowError(`Pengguna '${username}' tidak ada.`, "not_found", 404);
  }

  try {
    await query("UPDATE users SET email = $1 WHERE id = $2",
                [email || null, target.id]);
  } catch (err: any) {
    // Indeks unik atas lower(email): satu alamat tidak boleh menerima kode
    // untuk dua akun sekaligus, sebab yang memegangnya lalu dapat mengganti
    // sandi keduanya.
    if (err?.code === "23505") {
      throw new WorkflowError(
        "Alamat surel itu sudah dipakai akun lain.", "surel_ganda", 409);
    }
    throw err;
  }

  await audit({
    entityType: "user", entityId: target.id, action: "email_changed",
    actor: admin.username,
    before: { email: target.email }, after: { email: email || null },
    reason: `Surel ${target.username} diubah oleh ${admin.username}.`,
  });

  return { ok: true, username: target.username, full_name: target.full_name,
           email: email || null };
});

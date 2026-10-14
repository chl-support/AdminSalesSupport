import { handler, requireRole } from "@/lib/api";
import { audit, one } from "@/lib/db";
import { buka, asalKunci } from "@/lib/sandi-terlihat";
import { WorkflowError } from "@/lib/workflow";

/**
 * Memunculkan sandi seorang pengguna untuk Admin IT.
 *
 * Dipanggil satu pengguna setiap kali, atas permintaan tegas — bukan ikut
 * terbawa pada daftar akun. Bedanya nyata: daftar akun dimuat setiap kali layar
 * Administrasi dibuka, sehingga seluruh sandi akan melintas di jaringan dan
 * tersimpan di riwayat peramban tanpa seorang pun memintanya.
 *
 * Setiap pemunculan tercatat di jejak audit yang tidak dapat disunting: siapa
 * yang melihat, sandi siapa, dan kapan. Itu yang membuat kemampuan ini dapat
 * dipertanggungjawabkan — bukan sekadar dibatasi perannya.
 */
export const GET = handler(async (req) => {
  const admin = await requireRole(req, "admin_system");

  const username = (new URL(req.url).searchParams.get("username") ?? "")
    .trim().toLowerCase();
  if (!username) {
    throw new WorkflowError("Pengguna belum disebut.", "validation", 422);
  }

  const u = await one<{ id: string; username: string; full_name: string;
                        password_enc: string | null }>(
    `SELECT id, username, full_name,
            NULLIF(to_jsonb(users) ->> 'password_enc', '') AS password_enc
       FROM users WHERE username = $1`, [username]);
  if (!u) {
    throw new WorkflowError(`Pengguna '${username}' tidak ada.`, "not_found", 404);
  }

  const sandi = await buka(u.password_enc);

  await audit({
    entityType: "user", entityId: u.id, action: "password_viewed",
    actor: admin.username,
    reason: `Sandi ${u.username} dilihat oleh ${admin.username}.`,
    after: { terbaca: Boolean(sandi) },
  });

  return {
    username: u.username,
    full_name: u.full_name,
    password: sandi,
    // Dua sebab berbeda bila sandinya tidak dapat dimunculkan, dan layar
    // menyebutkannya apa adanya supaya tidak disangka kerusakan.
    sebab: sandi ? null
      : u.password_enc
        ? "kunci_berganti"
        : "belum_tercatat",
    asal_kunci: await asalKunci(),
  };
});

import { handler, requireRole } from "@/lib/api";
import { audit, one, query } from "@/lib/db";
import { sandikan } from "@/lib/sandi-terlihat";
import { WorkflowError } from "@/lib/workflow";

/**
 * Pengirim per project: nomor WhatsApp dan alamat email yang dipakai mengirim
 * tautan tanda tangan kepada Sales/Agent.
 *
 * Berada di basis data, bukan di Environment Variables: nilainya berbeda tiap
 * project, sementara environment hanya punya satu nilai untuk seluruh
 * aplikasi — dan menambah project baru tidak boleh menuntut deployment baru.
 *
 * Sandi aplikasi Gmail-nya disandikan dengan kunci yang sama seperti salinan
 * Password (src/lib/sandi-terlihat.ts) dan TIDAK PERNAH dikembalikan oleh
 * GET — yang dikembalikan hanya "sudah terisi atau belum". Sandi yang dapat
 * dibaca kembali lewat layar berarti satu sesi Admin IT yang bocor
 * menyerahkan kotak surat seluruh project.
 */

const BENTUK_SUREL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const GET = handler(async (req) => {
  await requireRole(req, "admin_system");
  return query(
    `SELECT id, name, company_name,
            NULLIF(to_jsonb(projects) ->> 'wa_pengirim','')    AS wa_pengirim,
            NULLIF(to_jsonb(projects) ->> 'surel_pengirim','') AS surel_pengirim,
            NULLIF(to_jsonb(projects) ->> 'smtp_user','')      AS smtp_user,
            (NULLIF(to_jsonb(projects) ->> 'smtp_pass_enc','') IS NOT NULL)
              AS ada_sandi
       FROM projects WHERE active ORDER BY urutan, name`);
});

export const POST = handler(async (req) => {
  const admin = await requireRole(req, "admin_system");
  const p = await req.json().catch(() => ({} as any));

  const projectId = String(p.project_id ?? "").trim();
  const wa = String(p.wa_pengirim ?? "").trim();
  const surel = String(p.surel_pengirim ?? "").trim();
  const smtpUser = String(p.smtp_user ?? "").trim().toLowerCase();
  // Kosong berarti "jangan diubah": layar tidak pernah menerima sandi lama,
  // jadi ia tidak dapat mengirimkannya kembali.
  const smtpPass = String(p.smtp_pass ?? "");

  if (!projectId) {
    throw new WorkflowError("Project belum dipilih.", "validation", 422);
  }
  const project = await one<{ id: string; name: string }>(
    "SELECT id, name FROM projects WHERE id = $1", [projectId]);
  if (!project) {
    throw new WorkflowError("Project tidak ditemukan.", "not_found", 404);
  }
  if (surel && !BENTUK_SUREL.test(surel.replace(/^.*</, "").replace(/>.*$/, ""))) {
    throw new WorkflowError("Alamat email pengirim tidak sah.", "validation", 422);
  }
  if (smtpUser && !BENTUK_SUREL.test(smtpUser)) {
    throw new WorkflowError("Alamat akun Gmail tidak sah.", "validation", 422);
  }
  // Gmail menolak mengirim atas nama alamat lain: beda antara keduanya adalah
  // sebab kegagalan yang paling sering dan paling tidak terlihat, jadi ia
  // ditahan di sini — bukan nanti sebagai galat SMTP yang tidak terbaca.
  if (surel && smtpUser && !surel.toLowerCase().includes(smtpUser)) {
    throw new WorkflowError(
      `Alamat pengirim harus memuat alamat akun Gmail-nya (${smtpUser}). ` +
      `Gmail menolak mengirim atas nama alamat lain.`, "validation", 422);
  }

  await query(
    `UPDATE projects
        SET wa_pengirim = $2, surel_pengirim = $3, smtp_user = $4
      WHERE id = $1`,
    [projectId, wa || null, surel || null, smtpUser || null]);

  if (smtpPass) {
    await query("UPDATE projects SET smtp_pass_enc = $2 WHERE id = $1",
                [projectId, await sandikan(smtpPass.replace(/\s+/g, ""))]);
  }
  // Akun dikosongkan berarti sandinya ikut dibuang: sandi yang tertinggal
  // tanpa akun hanya menunggu dipakai akun lain tanpa ada yang menyadarinya.
  if (!smtpUser) {
    await query("UPDATE projects SET smtp_pass_enc = NULL WHERE id = $1",
                [projectId]);
  }

  await audit({
    entityType: "project", entityId: projectId, action: "pengirim_updated",
    actor: admin.username,
    after: { wa_pengirim: wa || null, surel_pengirim: surel || null,
             smtp_user: smtpUser || null, sandi_diganti: Boolean(smtpPass) },
    reason: `Pengirim project ${project.name} diubah oleh ${admin.username}.`,
  });

  return { ok: true, project: project.name };
});

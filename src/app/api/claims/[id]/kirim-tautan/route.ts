import { body, handler, requireRole } from "@/lib/api";
import { audit, one } from "@/lib/db";
import { kirimSurel } from "@/lib/surel";
import { WorkflowError } from "@/lib/workflow";

/**
 * Mengirim surat berisi tautan tanda tangan ke email Sales/Agent — dikirim
 * sistem, atas nama project yang bersangkutan.
 *
 * Sebelumnya tombol di layar membuka aplikasi email Admin sendiri (mailto).
 * Itu berarti suratnya keluar dari alamat pribadi Admin yang kebetulan
 * bertugas, berbeda-beda menurut siapa yang menekannya, dan tidak
 * meninggalkan jejak apa pun di sistem ini. Kini ia keluar dari alamat
 * project — yang memang dikenali Sales/Agent-nya — dan tercatat di riwayat
 * pengiriman.
 *
 * Isi suratnya disusun layar yang memanggil, bukan di sini: surat yang sama
 * persis itulah yang juga disalin dan dikirim lewat WhatsApp, dan menyusunnya
 * dua kali di dua tempat berarti dua bentuk yang lambat laun berbeda.
 */
export const POST = handler(async (req, { params }) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const { id } = await params;
  const p = await body<{ perihal?: string; isi?: string }>(req);

  const perihal = String(p.perihal ?? "").trim();
  const isi = String(p.isi ?? "").trim();
  if (!perihal || !isi) {
    throw new WorkflowError("Isi surat belum lengkap.", "validation", 422);
  }

  const klaim = await one<{ id: string; claim_number: string;
                            project_id: string | null;
                            marketing_id: string; nama: string;
                            email: string | null }>(
    `SELECT c.id, c.claim_number, c.project_id, c.marketing_id,
            m.full_name AS nama, NULLIF(m.email,'') AS email
       FROM claims c JOIN marketings m ON m.id = c.marketing_id
      WHERE c.id = $1`, [id]);
  if (!klaim) {
    throw new WorkflowError("Pengajuan tidak ditemukan.", "not_found", 404);
  }
  if (!klaim.email) {
    throw new WorkflowError(
      `${klaim.nama} belum punya alamat email pada Data Marketing, jadi ` +
      `tautannya tidak dapat dikirim lewat email.`, "tanpa_email", 422);
  }

  await kirimSurel({
    kepada: klaim.email,
    perihal,
    isi,
    jenis: "tautan_tanda_tangan",
    projectId: klaim.project_id,
  });

  await audit({
    entityType: "claim", entityId: klaim.id, action: "signature_link_emailed",
    actor: user.username, after: { kepada: klaim.email },
    reason: `Tautan tanda tangan ${klaim.claim_number} dikirim ke ` +
            `${klaim.email} oleh ${user.username}.`,
  });

  return { ok: true, kepada: klaim.email, nama: klaim.nama };
});

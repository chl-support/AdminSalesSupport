import { handler, requireRole, body, idemKey, projectAktif } from "@/lib/api";
import { idempotent } from "@/lib/db";
import { unggahManual } from "@/lib/spesimen";

/**
 * Unggah spesimen tanda tangan secara manual, oleh Admin.
 *
 * Jalur kedua di samping tautan pendaftaran, untuk berkas yang sudah dipegang
 * Admin di luar sistem. Aturannya ada di lib/spesimen — termasuk bahwa hasilnya
 * tetap menunggu pemeriksaan, dan bahwa mengganti spesimen yang sudah berlaku
 * tetap menuntut alasan tertulis.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);
  const proyek = await projectAktif(req);
  return idempotent(idemKey(req), "POST specimen-upload", () =>
    unggahManual(id, user.username, {
      image_base64: p.image_base64, content_type: p.content_type,
      signature_png: p.signature_png, alasan: p.alasan, projectId: proyek,
    }));
});

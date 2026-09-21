import { handler, requireRole, claimView } from "@/lib/api";
import { submit } from "@/lib/workflow";

/**
 * Ajukan klaim — langkah pertama dari "Kirim ke Pajak".
 *
 * Hanya Admin Sales. Merekalah yang memeriksa formulir dan menyatakan berkasnya
 * lengkap sebelum klaimnya berjalan; peran lain tidak pernah mengerjakan
 * langkah ini, dan yang tidak pernah dikerjakan sebaiknya juga tidak diizinkan.
 * Penerusan ke tim pajak sesudahnya (admin-review) sudah dibatasi begitu, jadi
 * membiarkan langkah ini terbuka hanya menghasilkan klaim yang berhenti
 * setengah jalan di tangan yang tidak dapat melanjutkannya.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales");
  return claimView(await submit(id, user.username));
});

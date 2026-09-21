import { handler, requireRole, body, idemKey } from "@/lib/api";
import { idempotent } from "@/lib/db";
import { issueSignatureLink } from "@/lib/workflow";

/**
 * Terbitkan tautan tanda tangan untuk Sales/Agent.
 *
 * Hanya Admin Sales. Merekalah yang berhubungan dengan Sales/Agent dan yang
 * mengirimkan tautannya lewat WhatsApp; tim pajak memeriksa berkas, bukan
 * menghubungi penerima fee. Sebelumnya finance_tax juga diizinkan — sisa dari
 * alur lama, ketika penerbitan tautan menempel pada langkah verifikasi pajak.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales");
  const p = await body(req);
  return idempotent(idemKey(req), "POST signature-requests", () =>
    issueSignatureLink(id, user.username, p.channel ?? "whatsapp"));
});

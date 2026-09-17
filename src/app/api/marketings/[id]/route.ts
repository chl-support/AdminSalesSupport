import { handler, requireRole, body, projectAktif } from "@/lib/api";
import { ubahNomor } from "@/lib/spesimen";

/** Sunting data marketing. Untuk sekarang hanya nomor teleponnya. */
export const PATCH = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);
  return ubahNomor(id, String(p.phone ?? ""), user.username,
                   await projectAktif(req));
});

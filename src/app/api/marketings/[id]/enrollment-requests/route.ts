import { handler, requireRole, body, idemKey, projectAktif } from "@/lib/api";
import { idempotent } from "@/lib/db";
import { terbitkanTautan } from "@/lib/spesimen";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);
  const proyek = await projectAktif(req);
  return idempotent(idemKey(req), "POST enrollment-requests", () =>
    terbitkanTautan(id, user.username,
                    { revisi: Boolean(p.revisi), alasan: p.alasan,
                      projectId: proyek }));
});

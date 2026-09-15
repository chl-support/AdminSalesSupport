import { handler, requireRole, body, idemKey } from "@/lib/api";
import { idempotent } from "@/lib/db";
import { terbitkanTautan } from "@/lib/spesimen";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  await body(req);
  return idempotent(idemKey(req), "POST enrollment-requests", () =>
    terbitkanTautan(id, user.username));
});

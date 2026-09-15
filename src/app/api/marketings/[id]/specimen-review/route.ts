import { handler, requireRole, body } from "@/lib/api";
import { putuskanSet } from "@/lib/spesimen";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);
  return putuskanSet(id, p.set_id, p.decision, user.username, p.reason);
});

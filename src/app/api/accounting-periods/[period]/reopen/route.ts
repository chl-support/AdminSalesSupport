import { handler, requireRole, body } from "@/lib/api";
import { reopenPeriod } from "@/lib/settlement";

export const POST = handler(async (req, { params }) => {
  const { period } = await params;
  const user = await requireRole(req, "finance_manager");
  const p = await body(req);
  return reopenPeriod(period, user.username, p.reason);
});

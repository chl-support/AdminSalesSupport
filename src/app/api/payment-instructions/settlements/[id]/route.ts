import { handler, requireRole, body } from "@/lib/api";
import { correctSettlement } from "@/lib/settlement";

export const PATCH = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "finance_manager");
  const p = await body(req);
  return correctSettlement({
    settlementId: id, transferDate: p.transfer_date, actor: user.username,
    actorRole: user.role, reason: p.reason,
  });
});

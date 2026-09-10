import { handler, requireRole, body, claimView } from "@/lib/api";
import { invalidateTaxVerification } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "finance_tax", "finance_manager");
  const p = await body(req);
  return claimView(await invalidateTaxVerification(id, user.username, p.reason));
});

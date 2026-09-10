import { handler, requireRole, body, claimView } from "@/lib/api";
import { adminReview } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales");
  const p = await body(req);
  return claimView(await adminReview(id, p.decision, user.username, p.reason));
});

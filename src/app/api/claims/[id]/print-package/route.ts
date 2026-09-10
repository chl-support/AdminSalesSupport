import { handler, requireRole, body } from "@/lib/api";
import { printPackage } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales");
  const p = await body(req);
  return printPackage(id, user.username, p.reason);
});

import { handler, requireRole, body, idemKey } from "@/lib/api";
import { idempotent } from "@/lib/db";
import { issueSignatureLink } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "finance_tax");
  const p = await body(req);
  return idempotent(idemKey(req), "POST signature-requests", () =>
    issueSignatureLink(id, user.username, p.channel ?? "whatsapp"));
});

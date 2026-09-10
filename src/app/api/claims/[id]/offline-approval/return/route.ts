import { handler, requireRole, body, claimView } from "@/lib/api";
import { scanReturn } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales");
  const p = await body(req);
  return claimView(await scanReturn({
    claimId: id, outcome: p.outcome, actor: user.username,
    scannedHash: p.scanned_hash, copyNumber: Number(p.copy_number),
    headFinanceName: p.head_finance_name, managementName: p.management_name,
    rejectionReason: p.rejection_reason,
  }));
});

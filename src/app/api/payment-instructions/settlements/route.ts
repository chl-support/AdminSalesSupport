import { handler, requireRole, body, idemKey } from "@/lib/api";
import { idempotent } from "@/lib/db";
import { settle } from "@/lib/settlement";

export const POST = handler(async (req) => {
  const user = await requireRole(req, "finance_payment", "finance_manager");
  const p = await body(req);
  return idempotent(idemKey(req), "POST settlements", () => settle({
    instructionIds: p.instruction_ids, transferDate: p.transfer_date,
    actor: user.username, actorRole: user.role, proofFile: p.proof_file,
    referenceNumber: p.reference_number, partialAmounts: p.partial_amounts,
    backdateReason: p.backdate_reason,
  }));
});

import { handler, currentUser, body, claimView } from "@/lib/api";
import { query } from "@/lib/db";
import { changesSinceTaxVerification, crosscheck, getClaim } from "@/lib/workflow";

export const GET = handler(async (_req, { params }) => {
  const { id } = await params;
  const claim = await getClaim(id);
  const changes = await changesSinceTaxVerification(id);
  const dup = await query(
    `SELECT claim_number FROM claims
     WHERE unit_id=$1 AND claim_type=$2 AND recipient_role=$3 AND id<>$4
       AND status IN ('paid','completed','awaiting_settlement_date')`,
    [claim.unit_id, claim.claim_type, claim.recipient_role, id]);
  return {
    claim: await claimView(claim),
    document_hash: claim.document_hash,
    signed_at: claim.signed_at,
    signature_score: claim.signature_score,
    changes_since_tax_verification: changes,
    no_changes: changes.length === 0,
    duplicate_payment_check: {
      passed: dup.length === 0, conflicts: dup.map((d) => d.claim_number),
    },
    admin_sales_status: claim.crosscheck_admin,
    finance_status: claim.crosscheck_finance,
  };
});

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await currentUser(req);
  const p = await body(req);
  return claimView(
    await crosscheck(id, p.party, p.decision, user.username, p.notes));
});

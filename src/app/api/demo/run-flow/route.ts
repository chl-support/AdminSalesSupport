import { handler, currentUser } from "@/lib/api";
import { one, query } from "@/lib/db";
import * as wf from "@/lib/workflow";
import { WorkflowError } from "@/lib/workflow";

/** Jalankan satu klaim dari draf sampai siap ditandatangani. Hanya untuk demo. */
export const POST = handler(async (req) => {
  const user = await currentUser(req);
  const unit = await one(
    `SELECT u.* FROM units u WHERE u.status='booked' AND NOT EXISTS (
       SELECT 1 FROM claims c WHERE c.unit_id=u.id AND c.claim_type='commission'
         AND c.status NOT IN ('rejected','cancelled')) LIMIT 1`);
  if (!unit) {
    return { error: "Semua unit yang layak sudah memiliki klaim komisi aktif. " +
                    "Jalankan `npm run db:seed` untuk mengosongkan." };
  }
  const mkt = await one(
    "SELECT * FROM marketings WHERE status='active' AND marketing_type='agent' LIMIT 1");

  try {
    const claim = await wf.createClaim({
      unitId: unit.id, marketingId: mkt.id, claimType: "commission",
      recipientRole: "agent", actor: user.username });
    for (const item of ["fpu", "spu", "ppjb", "kwitansi", "invoice", "ktp", "npwp",
                        "bank_account", "non_pkp_statement"]) {
      await query(
        "INSERT INTO claim_documents (claim_id, checklist_item) VALUES ($1,$2)",
        [claim.id, item]);
    }
    await wf.submit(claim.id, user.username);
    await wf.adminReview(claim.id, "forward_to_tax", user.username);
    await wf.taxVerify({
      claimId: claim.id, decision: "approve_with_correction", actor: "ratna",
      corrected: { withholding_tax: claim.withholding_tax * 2 },
      reason: "Penerima tidak memiliki NPWP aktif, tarif PPh menyesuaikan." });
    const link = await wf.issueSignatureLink(claim.id, user.username);
    return { claim_id: claim.id, claim_number: claim.claim_number,
             token: link.token, otp: link.otp_demo, corrected: true };
  } catch (e) {
    if (e instanceof WorkflowError) return { error: e.message };
    throw e;
  }
});

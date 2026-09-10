import { handler, requireRole } from "@/lib/api";
import { one, query, setting } from "@/lib/db";
import { getClaim } from "@/lib/workflow";

export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  await requireRole(req, "admin_sales");
  const claim = await getClaim(id);
  return {
    attempts: await query(
      "SELECT * FROM signature_attempts WHERE claim_id=$1 ORDER BY attempt_number",
      [id]),
    baseline_specimens: await query(
      `SELECT image_png, sequence FROM signature_specimens
       WHERE marketing_id=$1 AND NOT archived`, [claim.marketing_id]),
    reference_signature: await one(
      `SELECT reference_signature_png, reference_signature_source
       FROM marketings WHERE id=$1`, [claim.marketing_id]),
    threshold: Number(await setting("signature_threshold_claim")),
  };
});

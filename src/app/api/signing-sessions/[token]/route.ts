import { handler, claimView } from "@/lib/api";
import { setting } from "@/lib/db";
import { getClaim, openSession } from "@/lib/workflow";

export const GET = handler(async (_req, { params }) => {
  const { token } = await params;
  const s = await openSession(token);
  const claim = await getClaim(s.claim_id);
  const maxAttempts = Number(await setting("signature_max_attempts"));
  return {
    claim: await claimView(claim),
    tax_verification: {
      verified_by: claim.tax_verified_by,
      verified_at: claim.tax_verified_at,
      was_corrected: claim.tax_corrected,
      correction_reason: claim.tax_correction_reason,
      original_amounts: claim.original_amounts,
    },
    attempts_remaining: Math.max(0, maxAttempts - s.attempts),
    expires_at: s.expires_at,
    otp_verified: s.otp_verified,
  };
});

import { handler, currentUser, body, idemKey, claimView } from "@/lib/api";
import { idempotent, query } from "@/lib/db";
import { createClaim } from "@/lib/workflow";

export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const claimType = url.searchParams.get("claim_type");
  const conds: string[] = ["1=1"]; const args: any[] = [];
  if (status) { args.push(status.split(",")); conds.push(`status = ANY($${args.length}::claim_status[])`); }
  if (claimType) { args.push(claimType); conds.push(`claim_type = $${args.length}`); }
  const rows = await query(
    `SELECT * FROM claims WHERE ${conds.join(" AND ")} ORDER BY created_at DESC`, args);
  return Promise.all(rows.map(claimView));
});

export const POST = handler(async (req) => {
  const user = await currentUser(req);
  const p = await body(req);
  return idempotent(idemKey(req), "POST /api/claims", async () =>
    claimView(await createClaim({
      unitId: p.unit_id, marketingId: p.marketing_id, claimType: p.claim_type,
      recipientRole: p.recipient_role, overridingLevel: p.overriding_level ?? null,
      actor: user.username,
    })));
});

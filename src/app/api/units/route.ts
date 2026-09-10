import { handler } from "@/lib/api";
import { query } from "@/lib/db";
import { eligibility, type ClaimType } from "@/lib/calc";

export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const cluster = url.searchParams.get("cluster");
  const eligibleFor = url.searchParams.get("eligible_for") as ClaimType | null;
  const rows = await query(
    cluster ? "SELECT * FROM units WHERE cluster_code=$1 ORDER BY code"
            : "SELECT * FROM units ORDER BY code",
    cluster ? [cluster] : []);
  if (!eligibleFor) return rows;
  return rows.map((u) => {
    const { ok, missing } = eligibility(u, eligibleFor);
    return { ...u, eligible: ok, missing_requirements: missing };
  });
});

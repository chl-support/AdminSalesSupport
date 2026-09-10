import { handler } from "@/lib/api";
import { bankReconciliation } from "@/lib/settlement";

export const GET = handler(async (req) => {
  const min = Number(new URL(req.url).searchParams.get("min_age_days") ?? 7);
  return bankReconciliation(min);
});

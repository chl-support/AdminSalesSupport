import { handler } from "@/lib/api";
import { paymentRecap } from "@/lib/settlement";

export const GET = handler(async (req) => {
  const q = new URL(req.url).searchParams;
  return paymentRecap(q.get("period_from")!, q.get("period_to")!,
                      q.get("group_by") ?? "claim_type");
});

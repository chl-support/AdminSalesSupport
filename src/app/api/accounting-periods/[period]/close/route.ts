import { handler, requireRole } from "@/lib/api";
import { closePeriod } from "@/lib/settlement";

export const POST = handler(async (req, { params }) => {
  const { period } = await params;
  const user = await requireRole(req, "finance_manager");
  return closePeriod(period, user.username);
});

import { handler, currentUser, body, claimView } from "@/lib/api";
import { financialFinding } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await currentUser(req);
  const p = await body(req);
  return claimView(await financialFinding(
    id, user.username, p.reason, p.affected_fields ?? []));
});

import { handler, requireRole, body } from "@/lib/api";
import { handoff } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales");
  const p = await body(req);
  const claim = await handoff(id, p.event, user.username, p.received_by, p.note);
  return { current_location: claim.physical_location,
           since_at: claim.physical_since, status: claim.status };
});

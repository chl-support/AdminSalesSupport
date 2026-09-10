import { handler, body, claimView } from "@/lib/api";
import { dispute } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { token } = await params;
  const p = await body(req);
  return claimView(await dispute(token, p.reason, p.expected_amount));
});

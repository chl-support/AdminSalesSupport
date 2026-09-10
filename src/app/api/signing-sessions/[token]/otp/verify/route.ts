import { handler, body } from "@/lib/api";
import { verifyOtp } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { token } = await params;
  const p = await body(req);
  return verifyOtp(token, p.code);
});

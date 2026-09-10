import { handler, claimView } from "@/lib/api";
import { getClaim } from "@/lib/workflow";

export const GET = handler(async (_req, { params }) => {
  const { id } = await params;
  return claimView(await getClaim(id));
});

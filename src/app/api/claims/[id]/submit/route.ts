import { handler, currentUser, claimView } from "@/lib/api";
import { submit } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await currentUser(req);
  return claimView(await submit(id, user.username));
});

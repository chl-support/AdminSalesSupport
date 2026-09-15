import { handler } from "@/lib/api";
import { kirimSet } from "@/lib/spesimen";

export const POST = handler(async (_req, { params }) => {
  const { token } = await params;
  return kirimSet(token);
}, { publik: true });

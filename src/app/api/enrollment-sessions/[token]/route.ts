import { handler } from "@/lib/api";
import { konteks } from "@/lib/spesimen";

export const GET = handler(async (_req, { params }) => {
  const { token } = await params;
  return konteks(token);
}, { publik: true });

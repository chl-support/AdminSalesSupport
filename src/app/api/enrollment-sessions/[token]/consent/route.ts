import { handler, body } from "@/lib/api";
import { setujuiPemakaian, VERSI_PERSETUJUAN } from "@/lib/spesimen";

export const POST = handler(async (req, { params }) => {
  const { token } = await params;
  const p = await body(req);
  return setujuiPemakaian(token, String(p.version ?? VERSI_PERSETUJUAN));
}, { publik: true });

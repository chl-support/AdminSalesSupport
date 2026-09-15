import { handler, body } from "@/lib/api";
import { verifikasiOtp } from "@/lib/spesimen";

export const POST = handler(async (req, { params }) => {
  const { token } = await params;
  const p = await body(req);
  return verifikasiOtp(token, String(p.code ?? "").trim());
}, { publik: true });

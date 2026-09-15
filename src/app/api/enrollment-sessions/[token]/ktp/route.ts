import { handler, body } from "@/lib/api";
import { simpanKtp } from "@/lib/spesimen";

export const POST = handler(async (req, { params }) => {
  const { token } = await params;
  const p = await body(req);
  return simpanKtp(token, { image_base64: p.image_base64,
                            content_type: p.content_type,
                            signature_png: p.signature_png });
}, { publik: true });

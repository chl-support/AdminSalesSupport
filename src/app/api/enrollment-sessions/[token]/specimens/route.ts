import { handler, body } from "@/lib/api";
import { simpanSpesimen } from "@/lib/spesimen";

export const POST = handler(async (req, { params }) => {
  const { token } = await params;
  const p = await body(req);
  return simpanSpesimen(token, { image_png: p.image_png, strokes: p.strokes,
                                 input_method: p.input_method });
}, { publik: true });

import { handler, body, clientIp } from "@/lib/api";
import { submitSignature } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { token } = await params;
  const p = await body(req);
  return submitSignature({
    token, imagePng: p.image_png, strokes: p.strokes,
    inputMethod: p.input_method ?? "finger",
    ip: clientIp(req), userAgent: req.headers.get("user-agent"),
  });
});

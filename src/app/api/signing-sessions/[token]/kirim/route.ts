import { handler } from "@/lib/api";
import { kirimKeAdmin } from "@/lib/workflow";

/**
 * Dipanggil dari layar tanda tangan, oleh orang luar yang memegang tautannya —
 * karena itu publik, sebagaimana endpoint tanda tangan dan sanggahan. Yang
 * menjaganya tokennya sendiri: tanpa sesi yang sah, openSession() menolak.
 */
export const POST = handler(async (_req, { params }) => {
  const { token } = await params;
  return kirimKeAdmin(token);
}, { publik: true });

import { handler, requireRole } from "@/lib/api";
import { spesimenSet } from "@/lib/spesimen";

/** Citra spesimen satu set, untuk diperiksa Admin sebelum disetujui. */
export const GET = handler(async (req, { params }) => {
  const { setId } = await params;
  await requireRole(req, "admin_sales", "admin_system");
  return spesimenSet(setId);
});

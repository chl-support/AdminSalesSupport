import { handler, requireRole } from "@/lib/api";
import { templatUnitData } from "@/lib/susun-pricelist-xlsx";

/** Unduh template kosong lembar UNIT DATA (langkah 2). */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  const isi = await templatUnitData();
  return new Response(new Uint8Array(isi), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Template Unit Data.xlsx"`,
    },
  });
});

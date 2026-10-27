import { handler, projectAktif, requireRole } from "@/lib/api";
import { one } from "@/lib/db";
import { templatUnitData, templatUnitTsc } from "@/lib/susun-pricelist-xlsx";
import { unitTsc } from "@/lib/unit-sanctuary";

/**
 * Unduh template kosong lembar UNIT DATA (langkah 2). The Sanctuary
 * Collection mendapat template berkas Unit Data-nya sendiri.
 */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  const p = await one<{ slug: string }>("SELECT slug FROM projects WHERE id=$1", [await projectAktif(req)]);
  const tsc = unitTsc(p?.slug);
  const isi = tsc ? await templatUnitTsc() : await templatUnitData();
  return new Response(new Uint8Array(isi), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Template Unit Data${tsc ? " TSC" : ""}.xlsx"`,
    },
  });
});

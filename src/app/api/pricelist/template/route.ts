import { handler } from "@/lib/api";
import { templatePricelist } from "@/lib/pricelist";

/** Template pricelist .xlsx, dalam bentuk yang diterima unggahan. */
export const GET = handler(async () => {
  const isi = await templatePricelist();
  return new Response(new Uint8Array(isi), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="Template Pricelist.xlsx"',
    },
  });
});

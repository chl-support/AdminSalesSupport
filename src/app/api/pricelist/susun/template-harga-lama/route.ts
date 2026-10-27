import { body, handler, requireRole } from "@/lib/api";
import { templatHargaLama } from "@/lib/susun-pricelist-xlsx";

/**
 * Template unggah Harga Lama (eProperty) untuk unit di layar (termasuk yang
 * belum disimpan): kode unit dikirim layar, harga lamanya diisi orang.
 */
export const POST = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  const p = await body<{ baris?: { kode?: unknown; harga?: unknown }[] }>(req);
  const baris = (Array.isArray(p.baris) ? p.baris : []).slice(0, 5000).flatMap((b) =>
    typeof b?.kode === "string" && b.kode.trim()
      ? [{ kode: b.kode.trim().slice(0, 60), harga: typeof b.harga === "number" && b.harga > 0 ? b.harga : undefined }]
      : []);
  const isi = await templatHargaLama(baris);
  return new Response(new Uint8Array(isi), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Template Harga Lama.xlsx"`,
    },
  });
});

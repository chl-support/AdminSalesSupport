import { body, handler, requireRole } from "@/lib/api";
import { audit } from "@/lib/db";
import { daftarLampiranTnc, simpanLampiranTnc } from "@/lib/susun-pricelist-gambar";

/** Lampiran gambar Terms & Conditions, sama untuk semua project. */
export const GET = handler(async () => ({ lampiran: await daftarLampiranTnc() }));

/**
 * Ganti daftar lampiran (urutan = urutan cetak). Gambarnya diunggah lebih
 * dulu lewat /api/pricelist/susun/gambar. Admin Sales dan Admin IT.
 */
export const PUT = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body<{ ids?: unknown }>(req);
  const ids = Array.isArray(p.ids) ? p.ids.map(String) : [];
  const lampiran = await simpanLampiranTnc(ids);
  await audit({ entityType: "tnc_lampiran", action: "tnc_lampiran_updated", actor: user.username,
                after: lampiran.map((x) => x.nama) });
  return { lampiran };
});

import { handler, requireRole, body } from "@/lib/api";
import { catatPrasyarat } from "@/lib/penjualan";

/**
 * Catat prasyarat pencairan sebuah unit.
 *
 * Hanya Admin Sales dan Admin IT: penanda inilah yang membuka pembayaran atas
 * unit tersebut, jadi ia tidak boleh dapat diubah oleh yang mengajukan klaimnya.
 */
export const PATCH = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  return catatPrasyarat(id, await body(req), user.username);
});

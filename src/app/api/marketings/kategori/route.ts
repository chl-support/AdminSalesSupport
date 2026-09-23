import { handler, requireRole, projectAktif } from "@/lib/api";
import { daftarPerKategori } from "@/lib/spesimen";

/**
 * Nama yang terdaftar per kategori penerima fee.
 *
 * Dibuat terpisah dari GET /api/marketings, yang menjawab layar Data Marketing
 * dengan spesimen tanda tangan dan keadaan pendaftaran setiap orang. Dialog
 * pengajuan fee membukanya tiap kali sebuah unit diklaim, dan tidak membaca
 * satu pun kolom itu.
 */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  return { marketings: await daftarPerKategori(await projectAktif(req)) };
});

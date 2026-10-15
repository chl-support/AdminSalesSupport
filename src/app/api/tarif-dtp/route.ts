import { handler, body, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { daftarTarifDtp, periksaTarifDtp, simpanTarifDtp } from "@/lib/tarif-dtp";

/** Tabel Tarif PPN DTP yang berlaku. Semua peran yang masuk boleh membaca. */
export const GET = handler(async () => ({ tarif: await daftarTarifDtp() }));

/**
 * Ganti tabel Tarif PPN DTP. Admin Sales dan Admin IT: tarif ini menentukan
 * tagihan yang tercetak untuk konsumen di setiap project.
 */
export const PUT = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);
  let daftar;
  try {
    daftar = periksaTarifDtp(p.tarif);
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
  await simpanTarifDtp(daftar, user.username);
  return { tarif: await daftarTarifDtp() };
});

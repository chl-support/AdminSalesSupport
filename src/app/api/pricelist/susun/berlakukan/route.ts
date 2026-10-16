import { body, handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { berlakukanSusun } from "@/lib/susun-pricelist-simpan";

/**
 * Jadikan draf yang tersimpan pricelist yang berlaku untuk project ini —
 * sesudahnya layar Simulasi / NPV memakai harganya.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const { nama } = await body<{ nama?: string }>(req);
  try {
    return await berlakukanSusun(projectId, String(nama ?? "").slice(0, 120), user.username);
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});

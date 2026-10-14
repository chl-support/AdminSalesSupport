import { handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { berlakukanPricelist, hapusPricelist } from "@/lib/pricelist";

/** Berlakukan kembali pricelist lama — mis. bila unggahan terbaru keliru. */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  try {
    await berlakukanPricelist(id, projectId, user.username);
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "not_found", 404);
  }
  return { ok: true };
});

/** Hapus pricelist yang tidak sedang berlaku. */
export const DELETE = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  try {
    await hapusPricelist(id, projectId, user.username);
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 409);
  }
  return { ok: true };
});

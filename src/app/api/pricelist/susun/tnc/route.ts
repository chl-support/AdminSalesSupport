import { handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { tncProject, tncProjectLain } from "@/lib/susun-pricelist-simpan";

/**
 * Terms & Conditions draf project lain, untuk disalin ke draf project ini.
 * Tanpa `?slug=`: daftar project yang punya T&C; dengan `?slug=`: isinya.
 * Admin Sales dan Admin IT, sama dengan yang boleh menyunting draf.
 */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return { project: await tncProjectLain(projectId) };
  const tnc = await tncProject(slug);
  if (!tnc) throw new WorkflowError("Project itu belum punya Terms & Conditions.", "not_found", 404);
  return { tnc };
});

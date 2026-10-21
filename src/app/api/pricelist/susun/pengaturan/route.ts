import { handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { pengaturanProject, pengaturanProjectLain } from "@/lib/susun-pricelist-simpan";

/**
 * Pengaturan harga draf project lain — Data (IRR), susunan kolom Data Harga
 * dan Harga — untuk disalin ke draf project ini (langkah 3).
 * Tanpa `?slug=`: daftar project yang punya pengaturan; dengan `?slug=`: isinya.
 * Admin Sales dan Admin IT, sama dengan yang boleh menyunting draf.
 */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return { project: await pengaturanProjectLain(projectId) };
  const pengaturan = await pengaturanProject(slug);
  if (!pengaturan) throw new WorkflowError("Project itu belum punya pengaturan harga.", "not_found", 404);
  return { pengaturan };
});

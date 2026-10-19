import { handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { simpanGambar } from "@/lib/susun-pricelist-gambar";

/** Unggah satu gambar untuk Catatan Unit Data; mengembalikan rujukannya. */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const form = await req.formData().catch(() => null);
  const berkas = form?.get("file");
  if (!berkas || typeof berkas === "string") {
    throw new WorkflowError("Gambar belum dipilih.", "validation", 422);
  }
  const f = berkas as File;
  try {
    return await simpanGambar(projectId, f.name, f.type, Buffer.from(await f.arrayBuffer()), user.username);
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});

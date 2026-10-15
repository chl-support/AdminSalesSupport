import { handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { berkasPricelist, berlakukanPricelist, hapusPricelist } from "@/lib/pricelist";

/** Unduh berkas Excel asli sebuah unggahan. Semua peran boleh, sama dengan GET daftarnya. */
export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  const projectId = await projectAktif(req);
  const b = await berkasPricelist(id, projectId);
  if (!b) throw new WorkflowError("Berkas pricelist ini tidak tersimpan.", "not_found", 404);
  return new Response(new Uint8Array(b.isi), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":
        `attachment; filename*=UTF-8''${encodeURIComponent(b.nama)}`,
    },
  });
});

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

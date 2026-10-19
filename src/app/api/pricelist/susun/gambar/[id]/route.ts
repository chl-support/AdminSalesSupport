import { handler, projectAktif } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { bacaGambar } from "@/lib/susun-pricelist-gambar";

/** Tampilkan gambar Catatan Unit Data milik project yang sedang dipilih. */
export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  const projectId = await projectAktif(req);
  const g = await bacaGambar(projectId, id);
  if (!g) throw new WorkflowError("Gambar tidak ditemukan.", "not_found", 404);
  return new Response(new Uint8Array(g.isi), {
    headers: {
      "content-type": g.tipe,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(g.nama)}`,
      "cache-control": "private, max-age=86400",
    },
  });
});

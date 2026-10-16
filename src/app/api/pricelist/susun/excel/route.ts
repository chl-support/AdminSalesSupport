import { handler, projectAktif } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { eksporSusun } from "@/lib/susun-pricelist-xlsx";
import { bacaSusun, namaBerkasSusun } from "@/lib/susun-pricelist-simpan";

/** Unduh draf yang tersimpan sebagai berkas Excel lima lembar. */
export const GET = handler(async (req) => {
  const projectId = await projectAktif(req);
  const draf = await bacaSusun(projectId);
  if (!draf) {
    throw new WorkflowError("Belum ada isian pricelist yang tersimpan.", "not_found", 404);
  }
  const isi = await eksporSusun(draf.data);
  return new Response(new Uint8Array(isi), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":
        `attachment; filename*=UTF-8''${encodeURIComponent(namaBerkasSusun(draf.data))}`,
    },
  });
});

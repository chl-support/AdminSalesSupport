import { handler } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { bacaLampiranTnc } from "@/lib/susun-pricelist-gambar";

/** Tampilkan satu gambar lampiran T&C (berlaku untuk semua project). */
export const GET = handler(async (_req, { params }) => {
  const { id } = await params;
  const g = await bacaLampiranTnc(id);
  if (!g) throw new WorkflowError("Gambar tidak ditemukan.", "not_found", 404);
  return new Response(new Uint8Array(g.isi), {
    headers: {
      "content-type": g.tipe,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(g.nama)}`,
      "cache-control": "private, max-age=86400",
    },
  });
});

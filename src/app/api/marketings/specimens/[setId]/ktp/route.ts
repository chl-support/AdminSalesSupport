/**
 * Foto KTP satu sesi pendaftaran, untuk diperiksa Admin.
 *
 * Tidak inline: foto yang diunggah orang luar tidak dijalankan di origin konsol.
 * Tersedia hanya selama pendaftarannya belum diputus — sesudah itu 404, karena
 * fotonya memang sudah dihapus.
 */

import { handler, requireRole } from "@/lib/api";
import { fotoKtp } from "@/lib/spesimen";

export const GET = handler(async (req, { params }) => {
  const { setId } = await params;
  await requireRole(req, "admin_sales", "admin_system");
  const { buf, tipe } = await fotoKtp(setId);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": tipe,
      "content-disposition": 'attachment; filename="ktp.jpg"',
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

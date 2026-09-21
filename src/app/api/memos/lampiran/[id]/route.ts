import { NextResponse } from "next/server";

import { handler, requireRole, projectAktif } from "@/lib/api";
import { berkasLampiran, hapusLampiran } from "@/lib/memo";

/**
 * Satu lampiran, dibuka atau diunduh.
 *
 * Lintasannya /api/memos/lampiran/<id>, bukan /api/memos/<memo>/lampiran/<id>:
 * id lampiran sudah unik, dan kepemilikannya atas project tetap diperiksa di
 * dalam — jadi menyebut memonya lagi pada alamat hanya menambah bagian yang
 * bisa keliru tanpa menambah pengamanan apa pun.
 */
export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  const f = await berkasLampiran(id, await projectAktif(req));
  return new NextResponse(new Uint8Array(f.content), {
    headers: {
      "content-type": f.content_type,
      "content-disposition":
        `inline; filename="${f.file_name.replace(/"/g, "")}"`,
    },
  });
});

/** Hapus lampiran. Dibatasi seperti penghapusan memonya. */
export const DELETE = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  return hapusLampiran(id, await projectAktif(req), user.username);
});

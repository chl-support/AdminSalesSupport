import { NextResponse } from "next/server";

import { handler, requireRole, projectAktif } from "@/lib/api";
import { berkasMemo, hapusMemo } from "@/lib/memo";

/** Berkas memo, dibuka di tab baru atau diunduh. */
export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  const m = await berkasMemo(id, await projectAktif(req));
  return new NextResponse(new Uint8Array(m.content), {
    headers: {
      "content-type": m.content_type,
      // inline: memo paling sering hanya dilihat sekilas untuk memastikan
      // angkanya, bukan disimpan ulang ke komputer yang sudah punya salinannya.
      "content-disposition":
        `inline; filename="${m.file_name.replace(/"/g, "")}"`,
    },
  });
});

/**
 * Hapus memo.
 *
 * Dibatasi Admin Sales dan Admin IT: memo adalah dasar tertulis angka yang
 * sudah dibayarkan, dan menghapusnya menghilangkan jawaban atas pertanyaan
 * "mana dasarnya". Judul dan nomornya tetap tercatat pada jejak audit.
 */
export const DELETE = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  return hapusMemo(id, await projectAktif(req), user.username);
});

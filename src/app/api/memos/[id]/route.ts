import { NextResponse } from "next/server";

import { handler, requireRole, projectAktif } from "@/lib/api";
import { berkasMemo, hapusMemo, ubahMemo } from "@/lib/memo";

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

/**
 * Membetulkan kolom memo yang sudah tersimpan.
 *
 * Dibatasi Admin Sales dan Admin IT, sama seperti penghapusan: yang diubah di
 * sini adalah keterangan yang menyertai dasar tertulis sebuah pembayaran.
 * Berkas memonya sendiri tidak dapat diganti dari sini — lihat ubahMemo().
 */
export const PATCH = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const b = await req.json().catch(() => ({}));

  // Hanya medan yang benar-benar dikirim yang diteruskan. Medan yang tidak
  // disebut tidak boleh terhapus hanya karena formulirnya tidak memuatnya.
  const ambil = (k: string) =>
    k in (b ?? {}) ? (typeof b[k] === "string" ? b[k] : null) : undefined;

  return ubahMemo(id, projectId, user.username, {
    nomor: ambil("nomor"), judul: ambil("judul"),
    keterangan: ambil("keterangan"), dari: ambil("dari"),
    tanggal_memo: ambil("tanggal_memo"),
    berlaku_dari: ambil("berlaku_dari"),
    berlaku_sampai: ambil("berlaku_sampai"),
  });
});

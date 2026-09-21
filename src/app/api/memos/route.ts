import { handler, currentUser, projectAktif } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { daftarMemo, simpanMemo } from "@/lib/memo";

/** Memo pada project yang sedang dikerjakan. */
export const GET = handler(async (req) =>
  ({ memos: await daftarMemo(await projectAktif(req)) }));

/**
 * Unggah memo.
 *
 * Terbuka bagi semua peran yang sudah masuk: memo adalah rujukan bersama, dan
 * yang memegang berkasnya belum tentu Admin IT. Penghapusannya yang dibatasi.
 */
export const POST = handler(async (req) => {
  const user = await currentUser(req);
  const projectId = await projectAktif(req);

  const form = await req.formData().catch(() => null);
  const berkas = form?.get("file");
  if (!berkas || typeof berkas === "string") {
    throw new WorkflowError("Berkas memo belum dipilih.", "file_required", 422);
  }
  const f = berkas as File;
  const teks = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  return simpanMemo(projectId, user.username, {
    judul: teks("judul") ?? f.name,
    nomor: teks("nomor"),
    keterangan: teks("keterangan"),
    berlaku_dari: teks("berlaku_dari"),
    berlaku_sampai: teks("berlaku_sampai"),
    tanggal_memo: teks("tanggal_memo"),
    dari: teks("dari"),
    kepada: teks("kepada"),
    nilai_skema: teks("nilai_skema"),
    dokumen_wajib: teks("dokumen_wajib"),
    diajukan_oleh: teks("diajukan_oleh"),
    diketahui_oleh: teks("diketahui_oleh"),
    disetujui_oleh: teks("disetujui_oleh"),
    file_name: f.name,
    content_type: f.type || "application/octet-stream",
    buf: Buffer.from(await f.arrayBuffer()),
  });
});

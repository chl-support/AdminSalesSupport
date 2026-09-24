import { handler, body, claimView, projectAktif,
         requireRole } from "@/lib/api";
import { getClaim, hapusKlaim } from "@/lib/workflow";

export const GET = handler(async (_req, { params }) => {
  const { id } = await params;
  return claimView(await getClaim(id));
});

/**
 * Menghapus pengajuan yang terlanjur salah input.
 *
 * Hanya Admin Sales dan Admin IT: merekalah yang membuat pengajuan, dan
 * pembetulan salah input adalah pekerjaan yang sama. Aturan selebihnya —
 * alasan wajib, dan pengajuan yang uangnya sudah keluar tidak dapat dihapus —
 * ditegakkan hapusKlaim().
 */
export const DELETE = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req).catch(() => ({} as any));
  return hapusKlaim(id, user.username, p.reason ?? "",
                    await projectAktif(req));
});

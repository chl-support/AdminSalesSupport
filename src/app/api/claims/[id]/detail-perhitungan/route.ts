import { handler, currentUser } from "@/lib/api";
import { detailFee } from "@/lib/detail-fee";
import { WorkflowError } from "@/lib/workflow";

/**
 * Detail Perhitungan satu klaim Closing Fee, Cash Reward, atau Komisi.
 *
 * Terbuka bagi semua peran yang sudah masuk, sama seperti rekap Overriding:
 * lembar ini beredar bersama formulirnya, dan yang memeriksa angkanya belum
 * tentu yang mengajukannya.
 */
export const GET = handler(async (req, { params }) => {
  await currentUser(req);
  const { id } = await params;
  const detail = await detailFee(id);
  if (!detail) {
    throw new WorkflowError(
      "Klaim tidak ditemukan, atau jenisnya tidak memakai lembar ini.",
      "not_found", 404);
  }
  return detail;
});

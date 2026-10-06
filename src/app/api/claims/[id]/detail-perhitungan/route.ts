import { handler, jagaBukaDokumen } from "@/lib/api";
import { detailFee } from "@/lib/detail-fee";
import { getClaim, WorkflowError } from "@/lib/workflow";

/**
 * Detail Perhitungan satu klaim Closing Fee, Cash Reward, atau Komisi.
 *
 * Terbuka bagi semua peran yang sudah masuk, sama seperti rekap Overriding:
 * lembar ini beredar bersama formulirnya, dan yang memeriksa angkanya belum
 * tentu yang mengajukannya.
 */
export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  await jagaBukaDokumen(req, await getClaim(id));
  const detail = await detailFee(id);
  if (!detail) {
    throw new WorkflowError(
      "Klaim tidak ditemukan, atau jenisnya tidak memakai lembar ini.",
      "not_found", 404);
  }
  return detail;
});

import { handler, currentUser } from "@/lib/api";
import { rekapOverriding } from "@/lib/overriding";
import { WorkflowError } from "@/lib/workflow";

/**
 * Rekap Overriding satu Sales Manager, sebagaimana dicetak.
 *
 * Terbuka bagi siapa pun yang sudah masuk, sama seperti pratinjau formulir
 * jenis lain: yang membacanya adalah orang yang memang memegang dokumennya
 * pada tahap itu — pajak, finance, manajemen — dan masing-masing tidak dapat
 * mengubah apa pun dari sini.
 */
export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  await currentUser(req);
  const rekap = await rekapOverriding(id);
  if (!rekap) {
    throw new WorkflowError(
      "Klaim ini bukan Overriding, jadi tidak punya rekap perhitungan.",
      "bukan_overriding", 404);
  }
  return rekap;
});

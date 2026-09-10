import { handler } from "@/lib/api";
import { one, query } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";

/**
 * Tujuan pemindaian QR pada cetakan. Terbuka tanpa autentikasi supaya siapa pun
 * yang memegang kertas dapat memverifikasinya, tetapi hanya mengembalikan
 * metadata keaslian — tidak pernah nominal maupun nama konsumen.
 */
export const GET = handler(async (req, { params }) => {
  const { hash } = await params;
  const copy = Number(new URL(req.url).searchParams.get("copy") ?? 0) || null;
  const claim = await one(
    "SELECT claim_number, sealed FROM claims WHERE document_hash=$1", [hash]);
  if (!claim) {
    throw new WorkflowError(
      "Hash tidak dikenal — dokumen tidak diterbitkan sistem ini.", "not_found", 404);
  }
  const pkgs = await query(
    `SELECT copy_number, status, printed_at FROM print_packages
     WHERE document_hash=$1 ORDER BY copy_number`, [hash]);
  const active = pkgs.find((p) => p.status === "active")?.copy_number ?? null;
  const current = pkgs.find((p) => p.copy_number === copy);
  return {
    authentic: true, claim_number: claim.claim_number, copy_number: copy,
    copy_status: current?.status ?? "unknown", active_copy_number: active,
    warning: current?.status === "superseded"
      ? "Salinan ini sudah digantikan oleh cetakan yang lebih baru." : null,
  };
});

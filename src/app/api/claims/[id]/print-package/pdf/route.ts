import { NextResponse } from "next/server";

import { handler, requireRole } from "@/lib/api";
import { one, query } from "@/lib/db";
import { buildPrintPdf } from "@/lib/pdf";
import { getClaim, WorkflowError } from "@/lib/workflow";

/**
 * Unduh paket cetak sebagai PDF.
 *
 * Tanpa parameter `copy`, yang diambil adalah salinan aktif. Menyebut nomor
 * salinan lama tetap dilayani — kadang perlu memeriksa kembali lembar yang sudah
 * beredar — namun PDF-nya menandai dirinya sebagai salinan tersebut, sehingga
 * verifikasi QR akan memperingatkan bahwa ia sudah digantikan.
 */
export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  await requireRole(req, "admin_sales", "finance_payment", "finance_manager",
                    "head_finance", "management");

  const claim = await getClaim(id);
  if (!claim.document_hash) {
    throw new WorkflowError(
      "Dokumen belum ditandatangani, jadi belum ada yang dapat dicetak.",
      "not_sealed");
  }

  const requested = Number(new URL(req.url).searchParams.get("copy") ?? 0);
  const pkg = requested
    ? await one("SELECT * FROM print_packages WHERE claim_id=$1 AND copy_number=$2",
                [id, requested])
    : await one("SELECT * FROM print_packages WHERE claim_id=$1 AND status='active' " +
                "ORDER BY copy_number DESC LIMIT 1", [id]);
  if (!pkg) {
    throw new WorkflowError(
      "Paket cetak belum diterbitkan. Jalankan POST /api/claims/{id}/print-package " +
      "terlebih dahulu.", "no_print_package", 409);
  }

  const unit = await one("SELECT * FROM units WHERE id=$1", [claim.unit_id]);
  const marketing = await one("SELECT * FROM marketings WHERE id=$1",
                              [claim.marketing_id]);
  const agency = marketing.agency_id
    ? await one("SELECT * FROM agencies WHERE id=$1", [marketing.agency_id]) : null;
  const bank = claim.bank_account_id
    ? await one("SELECT * FROM bank_accounts WHERE id=$1", [claim.bank_account_id])
    : null;
  const documents = await query(
    "SELECT checklist_item FROM claim_documents WHERE claim_id=$1 ORDER BY uploaded_at",
    [id]);
  const attempt = await one(
    `SELECT image_png FROM signature_attempts
     WHERE claim_id=$1 AND outcome='verified' ORDER BY attempt_number DESC LIMIT 1`,
    [id]);

  const origin = new URL(req.url).origin;
  const pdf = await buildPrintPdf({
    claim, unit, marketing, agency, bank, documents,
    signatureImagePng: attempt?.image_png ?? null,
    copyNumber: pkg.copy_number,
    documentHash: pkg.document_hash,
    printedBy: pkg.printed_by ?? "—",
    verifyUrl: `${origin}/api/documents/verify/${pkg.document_hash}` +
               `?copy=${pkg.copy_number}`,
    crosscheck: { admin: claim.crosscheck_admin, finance: claim.crosscheck_finance },
  });

  const name = `${claim.claim_number}-salinan-${pkg.copy_number}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${name}"`,
    },
  });
});

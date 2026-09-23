import { handler, requireRole, body, claimView } from "@/lib/api";
import { one } from "@/lib/db";
import { WorkflowError, getClaim } from "@/lib/workflow";
import { settle } from "@/lib/settlement";
import { simpanLampiran } from "@/lib/lampiran";
import { tahapDari } from "@/lib/tahap";

/** Menulis bukti transfer ke basis data; beri waktu yang cukup. */
export const maxDuration = 60;

/** Penanda lampiran bagi bukti transfernya. */
export const ITEM_BUKTI = "bukti_transfer";

/**
 * Mencatat pembayaran: tanggal transfer beserta bukti transfernya.
 *
 * Tidak menulis status sendiri. Yang dipanggil settle(), fungsi yang memang
 * sudah mengurus pembayaran — dan yang sudah mewajibkan bukti transfer,
 * menolak tanggal di masa depan, serta meminta alasan tertulis bila
 * tanggalnya mundur melampaui toleransi. Aturan itu tidak diulang di sini;
 * aturan yang ditulis dua kali akan berbeda cepat atau lambat.
 *
 * Buktinya disimpan pula sebagai lampiran klaim, supaya ia ikut terbawa
 * bersama dokumen full sign-nya dan tidak hanya hidup di dalam catatan
 * penyelesaian pembayaran.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "finance_payment", "finance_manager",
                                 "head_finance", "admin_system");
  const p = await body(req);

  const klaim = await getClaim(id);
  if ((tahapDari(klaim.status) ?? 0) < 3) {
    throw new WorkflowError(
      "Klaim ini belum sampai Persetujuan Final, jadi belum dapat dibayarkan.",
      "belum_disetujui", 422);
  }

  const inst = await one<{ id: string }>(
    `SELECT id FROM payment_instructions
      WHERE claim_id=$1 AND status <> 'paid' ORDER BY issued_at LIMIT 1`,
    [id]);
  if (!inst) {
    throw new WorkflowError(
      "Tidak ada instruksi pembayaran yang menunggu pada klaim ini.",
      "tanpa_instruksi", 422);
  }

  // Buktinya dilampirkan lebih dulu: pembayaran yang tercatat lunas tetapi
  // buktinya gagal tersimpan adalah angka tanpa dasar.
  if (p.content_base64) {
    await simpanLampiran(id, {
      checklist_item: ITEM_BUKTI,
      file_name: p.file_name ?? "bukti-transfer.pdf",
      content_base64: p.content_base64,
      content_type: p.content_type,
    }, { source: "pembayaran", uploadedBy: user.username });
  }

  await settle({
    instructionIds: [inst.id],
    transferDate: String(p.transfer_date ?? ""),
    actor: user.username, actorRole: user.role,
    proofFile: p.file_name ?? (p.content_base64 ? "bukti-transfer.pdf" : undefined),
    referenceNumber: p.reference_number ?? undefined,
    backdateReason: p.backdate_reason ?? undefined,
  });

  return claimView(await getClaim(id));
});

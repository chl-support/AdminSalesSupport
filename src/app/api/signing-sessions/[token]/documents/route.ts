/**
 * Lampiran yang diunggah agent dari tautan tanda tangan.
 *
 * Publik, dengan pengaman yang sama seperti tanda tangannya sendiri: token yang
 * masih berlaku dan kode OTP yang sudah diverifikasi. Tanpa syarat kedua, siapa
 * pun yang tautannya diteruskan di grup WhatsApp dapat menitipkan berkas ke
 * klaim orang lain.
 *
 * Hanya sampai tanda tangan diterima. Setelah itu dokumen disegel, dan berkas
 * yang masuk belakangan akan mengubah lampiran dari sesuatu yang ikut
 * ditandatangani menjadi sesuatu yang menempel sesudahnya.
 */

import { handler, body, clientIp } from "@/lib/api";
import { audit } from "@/lib/db";
import { openSession, WorkflowError } from "@/lib/workflow";
import { daftarLampiran, simpanLampiran } from "@/lib/lampiran";

async function sesiTerbuka(token: string) {
  const s = await openSession(token);
  if (!s.otp_verified) {
    throw new WorkflowError("Verifikasi kode terlebih dahulu.", "otp_required", 401);
  }
  return s;
}

export const GET = handler(async (_req, { params }) => {
  const { token } = await params;
  const s = await sesiTerbuka(token);
  return { documents: await daftarLampiran(s.claim_id) };
}, { publik: true });

export const POST = handler(async (req, { params }) => {
  const { token } = await params;
  const s = await sesiTerbuka(token);
  const doc = await simpanLampiran(s.claim_id, await body(req),
                                   { source: "agent", uploadedBy: s.marketing_id });
  await audit({
    entityType: "claim", entityId: s.claim_id, action: "document_upload:agent",
    actor: s.marketing_id, ip: clientIp(req),
    after: { item: doc.checklist_item, file: doc.file_name,
             size_bytes: doc.size_bytes },
  });
  return doc;
}, { publik: true });

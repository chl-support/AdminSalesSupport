import { handler, currentUser, body } from "@/lib/api";
import { audit, one } from "@/lib/db";
import { assertNotSealed, getClaim } from "@/lib/workflow";
import { daftarLampiran, simpanLampiran } from "@/lib/lampiran";

export const GET = handler(async (_req, { params }) => {
  const { id } = await params;
  return { documents: await daftarLampiran(id) };
});

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await currentUser(req);
  assertNotSealed(await getClaim(id));
  const p = await body(req);

  // Unggahan tanpa isi berkas masih diterima demi jalur lama yang hanya mencatat
  // nama dokumen; yang punya isi disimpan utuh lewat jalur yang sama dengan
  // lampiran agent, supaya keduanya tervalidasi dengan aturan yang sama.
  const doc = p.content_base64
    ? await simpanLampiran(id, p, { source: "console", uploadedBy: user.username })
    : await one(
        `INSERT INTO claim_documents (claim_id, checklist_item, file_name,
                                      uploaded_by, source)
         VALUES ($1,$2,$3,$4,'console') RETURNING id, checklist_item, file_name`,
        [id, p.checklist_item, p.file_name ?? "dokumen.pdf", user.username]);

  await audit({ entityType: "claim", entityId: id, action: "document_upload",
                actor: user.username,
                after: { item: doc.checklist_item, file: doc.file_name } });
  return doc;
});

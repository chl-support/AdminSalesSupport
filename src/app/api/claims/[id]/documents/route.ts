import { handler, currentUser, body } from "@/lib/api";
import { audit, one } from "@/lib/db";
import { assertNotSealed, getClaim } from "@/lib/workflow";

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await currentUser(req);
  assertNotSealed(await getClaim(id));
  const p = await body(req);
  const doc = await one(
    `INSERT INTO claim_documents (claim_id, checklist_item, file_name)
     VALUES ($1,$2,$3) RETURNING id, checklist_item`,
    [id, p.checklist_item, p.file_name ?? "dokumen.pdf"]);
  await audit({ entityType: "claim", entityId: id, action: "document_upload",
                actor: user.username, after: { item: p.checklist_item } });
  return doc;
});

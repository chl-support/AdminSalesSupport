import { handler, currentUser, body } from "@/lib/api";
import { audit, one, query } from "@/lib/db";
import { COOKIE } from "@/lib/auth";
import { createHash } from "node:crypto";
import { WorkflowError } from "@/lib/workflow";

/** Project yang dapat dikerjakan, beserta yang sedang dipilih. */
export const GET = handler(async (req) => {
  const user = await currentUser(req);
  return {
    projects: await query(
      "SELECT id, slug, name, company_name FROM projects WHERE active " +
      "ORDER BY urutan, name"),
    dipilih: user.project_id ?? null,
  };
});

/**
 * Pilih project yang akan dikerjakan.
 *
 * Disimpan pada sesinya, bukan pada peramban: seluruh penyaringan data terjadi
 * di server, dan pilihan yang hanya hidup di peramban berarti server tetap
 * harus mempercayai apa yang dikirimkan layar.
 */
export const POST = handler(async (req) => {
  const user = await currentUser(req);
  const p = await body(req);
  const proyek = await one<{ id: string; name: string }>(
    "SELECT id, name FROM projects WHERE slug=$1 AND active", [String(p.slug ?? "")]);
  if (!proyek) {
    throw new WorkflowError("Project tidak dikenal.", "not_found", 404);
  }

  const token = req.cookies.get(COOKIE)?.value ?? "";
  await query("UPDATE sessions SET project_id=$1 WHERE token_hash=$2",
              [proyek.id, createHash("sha256").update(token).digest("hex")]);
  await audit({
    entityType: "session", entityId: proyek.id, action: "project_selected",
    actor: user.username, after: { project: proyek.name },
  });
  return { ok: true, project: proyek.name };
});

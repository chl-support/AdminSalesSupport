import { handler } from "@/lib/api";
import { query } from "@/lib/db";

export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const entityId = url.searchParams.get("entity_id");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
  return entityId
    ? query("SELECT * FROM audit_log WHERE entity_id=$1 ORDER BY occurred_at DESC LIMIT $2",
            [entityId, limit])
    : query("SELECT * FROM audit_log ORDER BY occurred_at DESC LIMIT $1", [limit]);
});

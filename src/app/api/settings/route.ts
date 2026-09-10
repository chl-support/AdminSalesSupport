import { handler, requireRole, body } from "@/lib/api";
import { query, setSetting } from "@/lib/db";

export const GET = handler(async () => {
  const rows = await query<{ key: string; value: string }>("SELECT * FROM settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
});

export const PUT = handler(async (req) => {
  await requireRole(req, "admin_system");
  const { key, value } = await body(req);
  await setSetting(key, String(value));
  return { key, value };
});

import { handler, body, requireRole } from "@/lib/api";
import { setSetting, setting } from "@/lib/db";
import { audit } from "@/lib/db";

/**
 * Apakah memo skema insentif menjadi dasar penolakan klaim.
 *
 * Hanya Admin IT, dan berlaku menyeluruh — bukan per project. Selama mati,
 * klaim yang tanggal kontraknya tidak tercakup memo mana pun tetap dapat
 * dihitung memakai skema terdekat, dan ditandai pada klaimnya.
 */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_system");
  return { wajib: (await setting("skema_wajib")) === "true" };
});

export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_system");
  const p = await body(req);
  const wajib = p.wajib === true || p.wajib === "true";
  const sebelum = (await setting("skema_wajib")) === "true";

  await setSetting("skema_wajib", wajib ? "true" : "false");
  await audit({
    entityType: "setting", entityId: "skema_wajib",
    action: wajib ? "scheme_requirement_enabled" : "scheme_requirement_disabled",
    actor: user.username,
    before: { wajib: sebelum }, after: { wajib },
  });
  return { wajib };
});

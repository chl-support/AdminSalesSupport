/**
 * Kontak Admin IT, untuk orang yang terkunci di luar.
 *
 * GET-nya publik dengan sengaja: yang membutuhkannya justru orang yang belum
 * dapat masuk. Yang dikembalikan hanya nomor dan alamat surel yang memang
 * dipasang untuk diumumkan — tidak ada data pengguna, dan bila Admin IT
 * belum mengisinya, yang keluar kosong, bukan tebakan.
 */

import { handler, requireRole, body } from "@/lib/api";
import { audit, setSetting, setting } from "@/lib/db";

export const GET = handler(async () => ({
  wa: (await setting("kontak_admin_wa")) || null,
  email: (await setting("kontak_admin_email")) || null,
}), { publik: true });

export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_system");
  const p = await body(req);
  const wa = String(p.wa ?? "").trim();
  const email = String(p.email ?? "").trim();

  await setSetting("kontak_admin_wa", wa);
  await setSetting("kontak_admin_email", email);
  await audit({ entityType: "setting", entityId: "kontak_admin",
                action: "contact_updated", actor: user.username,
                after: { wa, email } });
  return { wa: wa || null, email: email || null };
});

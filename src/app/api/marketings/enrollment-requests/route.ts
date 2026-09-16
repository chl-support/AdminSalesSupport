import { handler, requireRole, body } from "@/lib/api";
import { revisiMassal } from "@/lib/spesimen";

/**
 * Terbitkan tautan penggantian untuk semua marketing yang spesimennya berasal
 * dari perekaman lama di layar.
 *
 * Sengaja tanpa idempotensi otomatis: tiap penerbitan memang mematikan tautan
 * sebelumnya dan membuat yang baru, dan pemanggil yang menekan dua kali memang
 * bermaksud menerbitkan ulang.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);
  return revisiMassal(user.username, String(p.alasan ?? ""));
});

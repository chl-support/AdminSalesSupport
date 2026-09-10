import { handler } from "@/lib/api";
import { one, setting } from "@/lib/db";

export const GET = handler(async () => {
  const row = await one<{ count: number }>("SELECT COUNT(*)::int AS count FROM claims");
  return {
    status: "ok",
    database: "postgres",
    claims: row?.count ?? 0,
    signature_threshold: await setting("signature_threshold_claim"),
    warning: "Ambang tanda tangan belum dikalibrasi. Jalankan protokol PRD 12.2 " +
             "sebelum dipakai produksi.",
  };
});

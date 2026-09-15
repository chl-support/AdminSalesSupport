import { handler, requireRole } from "@/lib/api";
import { settingInt } from "@/lib/db";
import { ambangOnboarding, daftarMarketing } from "@/lib/spesimen";

/** Daftar marketing beserta keadaan pendaftaran tanda tangannya. */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  return {
    marketings: await daftarMarketing(),
    ambang: await ambangOnboarding(),
    jumlah_spesimen: await settingInt("onboarding_specimen_count"),
  };
});

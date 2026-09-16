import { handler, requireRole, projectAktif } from "@/lib/api";
import { ambangOnboarding, daftarMarketing } from "@/lib/spesimen";

/** Daftar marketing beserta keadaan pendaftaran tanda tangannya. */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  return {
    marketings: await daftarMarketing(await projectAktif(req)),
    ambang: await ambangOnboarding(),
  };
});

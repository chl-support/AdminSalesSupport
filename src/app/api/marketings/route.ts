import { handler, requireRole, body, projectAktif } from "@/lib/api";
import { ambangOnboarding, daftarMarketing, tambahMarketing } from "@/lib/spesimen";

/** Daftar marketing beserta keadaan pendaftaran tanda tangannya. */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  return {
    marketings: await daftarMarketing(await projectAktif(req)),
    ambang: await ambangOnboarding(),
  };
});

/**
 * Daftarkan orang baru.
 *
 * Diperlukan untuk kategori yang tidak pernah tertulis pada berkas penjualan
 * maupun laporan keagenan — Markom, Sales Manager, Sales Koordinator, dan BGB.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);
  return tambahMarketing({
    nama: String(p.full_name ?? ""), kategori: String(p.category ?? ""),
    jenis: p.marketing_type ?? null, telepon: String(p.phone ?? ""),
    email: p.email ?? null, npwp: p.npwp ?? null,
  }, user.username, await projectAktif(req));
});

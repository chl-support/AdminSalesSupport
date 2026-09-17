import { handler, projectAktif, requireRole } from "@/lib/api";
import { cabutSkemaUji, pasangSkemaUji, statusSkemaUji } from "@/lib/skema-uji";

/**
 * Skema insentif uji coba — dipasang dan dicabut per project.
 *
 * Hanya Admin IT. Yang dipasang di sini menentukan besaran uang pada setiap
 * klaim yang dibuat sesudahnya, jadi ia bukan penyetelan tampilan melainkan
 * konfigurasi pembayaran, sekalipun sifatnya sementara.
 */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_system");
  return statusSkemaUji(await projectAktif(req));
});

export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_system");
  return pasangSkemaUji(await projectAktif(req), user.username);
});

export const DELETE = handler(async (req) => {
  const user = await requireRole(req, "admin_system");
  return cabutSkemaUji(await projectAktif(req), user.username);
});

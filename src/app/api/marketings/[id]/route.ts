import { handler, requireRole, body, projectAktif } from "@/lib/api";
import { hapusMarketing, ubahKategori, ubahNomor } from "@/lib/spesimen";

/** Sunting data marketing: nomor teleponnya, atau kategori penerima feenya. */
export const PATCH = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);
  const project = await projectAktif(req);
  // Kategori dan nomor tidak pernah dikirim bersama — keduanya disunting dari
  // tempatnya masing-masing di layar Data Marketing.
  if (p.category !== undefined) {
    return ubahKategori(id, String(p.category ?? ""), user.username, project);
  }
  return ubahNomor(id, String(p.phone ?? ""), user.username, project);
});

/**
 * Hapus satu baris Data Marketing — untuk salah input.
 *
 * Aturannya ada di hapusMarketing(): yang sudah dipakai pengajuan fee, data
 * penjualan, sesi tanda tangan, atau batch overriding ditolak beserta
 * sebabnya.
 */
export const DELETE = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  return hapusMarketing(id, user.username, await projectAktif(req));
});

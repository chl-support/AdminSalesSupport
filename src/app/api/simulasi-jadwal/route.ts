import { handler, body, currentUser, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { hapusJadwal, periksaBaris, riwayatJadwal, simpanJadwal }
  from "@/lib/simulasi-jadwal";

/** Riwayat jadwal tersimpan untuk satu unit dan cara bayar, project terpilih. */
export const GET = handler(async (req) => {
  const projectId = await projectAktif(req);
  const q = new URL(req.url).searchParams;
  return {
    riwayat: await riwayatJadwal(projectId, q.get("kode") ?? "", q.get("skema") ?? ""),
  };
});

/**
 * Simpan jadwal suntingan sebagai versi baru. Terbuka bagi semua peran yang
 * dapat membuka layar Simulasi: menyusun simulasi untuk konsumen memang
 * pekerjaan mereka, dan tiap versi mencatat siapa yang menyimpannya.
 */
export const POST = handler(async (req) => {
  const user = await currentUser(req);
  const projectId = await projectAktif(req);
  const p = await body(req);
  try {
    const catatan = String(p.catatan ?? "").trim().slice(0, 200) || null;
    return await simpanJadwal({
      projectId, aktor: user.username, catatan,
      kodeUnit: String(p.kode ?? ""), skema: String(p.skema ?? ""),
      tanggal: String(p.tanggal ?? ""),
      diskon: Number(p.diskon) || 0, bunga: Number(p.bunga) || 0,
      baris: periksaBaris(p.baris),
    });
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});

/**
 * Hapus riwayat: `?id=` untuk satu versi, atau `?kode=&skema=&semua=1` untuk
 * seluruh versi satu unit dan cara bayar. Admin Sales dan Admin IT, sama
 * dengan pagar unggah pricelist.
 */
export const DELETE = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const q = new URL(req.url).searchParams;
  try {
    return await hapusJadwal({
      projectId, aktor: user.username,
      id: q.get("id") ?? undefined,
      semua: q.get("semua") === "1"
        ? { kodeUnit: q.get("kode") ?? "", skema: q.get("skema") ?? "" } : undefined,
    });
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "not_found", 404);
  }
});

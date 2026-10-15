import { handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { bacaPricelist, daftarPricelist, pricelistBerlaku,
         simpanPricelist } from "@/lib/pricelist";

/**
 * Pricelist project yang sedang dipilih: yang berlaku beserta riwayat
 * unggahannya. Dibaca layar Simulasi / NPV dan layar Pricelist; semua peran
 * boleh membacanya — harga jual bukan rahasia di dalam kantor.
 */
export const GET = handler(async (req) => {
  const projectId = await projectAktif(req);
  return {
    berlaku: await pricelistBerlaku(projectId),
    riwayat: await daftarPricelist(projectId),
  };
});

/** Batas ukuran berkas. Pricelist ratusan unit pun jauh di bawahnya. */
const BATAS = 5 * 1024 * 1024;

/**
 * Unggah pricelist untuk project yang sedang dipilih.
 *
 * `dry_run=true` hanya membaca dan memeriksa berkasnya — layar memakainya
 * untuk pratinjau sebelum apa pun tertulis. Tanpa itu, pricelist yang lolos
 * pemeriksaan disimpan dan langsung berlaku.
 *
 * Admin Sales dan Admin IT: pricelist menentukan harga yang ditawarkan ke
 * konsumen di layar simulasi.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);

  const form = await req.formData().catch(() => null);
  const berkas = form?.get("file");
  if (!berkas || typeof berkas === "string") {
    throw new WorkflowError("Berkas pricelist belum dipilih.", "validation", 422);
  }
  const f = berkas as File;
  if (f.size > BATAS) {
    throw new WorkflowError("Berkas pricelist lebih dari 5 MB.", "validation", 422);
  }
  const lembar = String(form?.get("lembar") ?? "") || undefined;
  const nama = String(form?.get("nama") ?? "").trim().slice(0, 120)
    || f.name.replace(/\.[^.]+$/, "");

  const isi = await f.arrayBuffer();
  let hasil;
  try {
    hasil = await bacaPricelist(isi, lembar);
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "true";
  if (dryRun) return { dry_run: true, nama, ...hasil };

  if (hasil.galat.length) {
    throw new WorkflowError(
      "Pricelist masih memuat galat. Perbaiki berkasnya lalu unggah ulang.",
      "validation", 422, { galat: hasil.galat });
  }
  const { id } = await simpanPricelist({
    projectId, nama, namaBerkas: f.name, isi: Buffer.from(isi), hasil,
    aktor: user.username,
  });
  return { dry_run: false, id, nama, jumlah_unit: hasil.unit.length };
});

import { handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { bacaHargaLama, imporSusun, imporUnitData } from "@/lib/susun-pricelist-xlsx";

const BATAS = 5 * 1024 * 1024;

// Berkas Excel besar (mis. Unit Data BIO DISTRICT, 2,5 MB) butuh beberapa
// detik untuk dibaca; batas waktu bawaan dapat terlewati.
export const maxDuration = 60;

/**
 * Baca berkas Excel PL (lembar Data (IRR), Unit Data, Data Pricelist,
 * Pricelist, T&C) menjadi isian kelima langkah. Tidak menyimpan apa pun:
 * layar menampilkan hasilnya, lalu orang menyimpannya sebagai draf.
 *
 * `?bagian=unit` hanya membaca lembar UNIT DATA yang terbuka (langkah 2);
 * `?bagian=hargaLama` hanya Harga Lama (eProperty) per kode unit.
 */
export const POST = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  await projectAktif(req);
  const form = await req.formData().catch(() => null);
  const berkas = form?.get("file");
  if (!berkas || typeof berkas === "string") {
    throw new WorkflowError("Berkas Excel belum dipilih.", "validation", 422);
  }
  if ((berkas as File).size > BATAS) {
    throw new WorkflowError("Berkas lebih dari 5 MB.", "validation", 422);
  }
  try {
    const isi = await (berkas as File).arrayBuffer();
    const bagian = new URL(req.url).searchParams.get("bagian");
    // ?bagian=hargaLama: hanya Harga Lama (eProperty) per kode unit.
    return bagian === "unit" ? await imporUnitData(isi)
      : bagian === "hargaLama" ? await bacaHargaLama(isi) : await imporSusun(isi);
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});

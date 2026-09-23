import { handler, requireRole, projectAktif } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { imporLaporan } from "@/lib/penjualan";
import { ensureKolomMarketing } from "@/lib/kolom";

/**
 * Unggah Laporan Penjualan lewat konsol.
 *
 * Ada karena impor sebelumnya hanya dapat dijalankan dari baris perintah, dan
 * orang yang mengurus data penjualan tidak selalu punya akses ke sana. Selama
 * jalurnya hanya terminal, data bulanan bergantung pada satu orang yang kebetulan
 * bisa menjalankannya.
 *
 * `dry_run=true` membaca berkas dan melaporkan apa yang AKAN terjadi tanpa
 * menulis apa pun. Layar memakainya untuk pratinjau — mengunggah berkas keliru
 * lalu baru menyadarinya setelah 52 baris tertulis bukan kesalahan yang mudah
 * dibereskan.
 *
 * Dibatasi Admin IT: impor menimpa data penjualan seluruh proyek.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_system");

  const form = await req.formData().catch(() => null);
  const berkas = form?.get("file");
  if (!berkas || typeof berkas === "string") {
    throw new WorkflowError(
      "Berkas laporan belum dipilih.", "validation", 422);
  }

  const teks = await (berkas as File).text();
  if (!teks.trim()) {
    throw new WorkflowError("Berkas laporan kosong.", "validation", 422);
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "true";

  // Kolom marketings.category dan nilai enum recipient_role yang dipakai
  // impor ini hanya ditambahkan lewat db/schema.sql. Dipasang di sini, sebelum
  // transaksi impornya dibuka: ALTER TABLE di tengah transaksi yang sudah
  // memegang kunci atas tabel marketings akan saling menunggu. Lihat
  // src/lib/kolom.ts.
  await ensureKolomMarketing();

  try {
    return await imporLaporan(teks, {
      dryRun,
      aktor: user.username,
      namaBerkas: (berkas as File).name,
      projectId: await projectAktif(req),
    });
  } catch (e: any) {
    // Berkas yang salah bentuk adalah kekeliruan pemanggil, bukan kegagalan
    // server — dan pesannya sudah menjelaskan apa yang diharapkan.
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});

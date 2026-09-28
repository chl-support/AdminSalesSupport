import { handler, currentUser, projectAktif } from "@/lib/api";
import { setting } from "@/lib/db";
import { daftarRujukan } from "@/lib/rujukan";

/**
 * Referensi Pengajuan: baris memo beserta keadaan pemberlakuannya.
 *
 * Terbuka bagi semua peran yang sudah masuk — rujukan adalah dasar bersama,
 * dan yang memeriksa sebuah angka belum tentu yang mengunggah memonya. Yang
 * dibatasi pemberlakuannya, bukan pembacaannya.
 */
export const GET = handler(async (req) => {
  await currentUser(req);
  const projectId = await projectAktif(req);
  return {
    baris: await daftarRujukan(projectId),
    // Kunci pengajuan: selama menyala, klaim tanpa skema yang berlaku pada
    // tanggal kontraknya tidak dapat dihitung sama sekali.
    kunci: (await setting("skema_wajib")) === "true",
  };
});

import { handler, requireRole, body, claimView } from "@/lib/api";
import { audit } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";
import { getClaim, transition } from "@/lib/workflow";
import { TAHAP, bolehGerak, tahapDari } from "@/lib/tahap";
import { jalurKe } from "@/lib/tahap-alur";

/**
 * Menggerakkan klaim ke salah satu tahap peredaran dokumen.
 *
 * Hanya dua tahap pertama yang dapat dipilih dari sini. Dua tahap berikutnya
 * membawa serta berkasnya masing-masing — dokumen full sign dan bukti
 * transfer — dan punya endpoint tersendiri yang mewajibkan berkas itu. Tanpa
 * pemisahan ini, klaim dapat dinyatakan sudah disetujui final maupun sudah
 * dibayar tanpa satu lembar pun bukti di belakangnya.
 *
 * Perpindahannya ditempuh langkah demi langkah lewat jalur yang memang
 * diizinkan mesin alur, bukan dengan menulis status baru langsung ke basis
 * data. Setiap langkahnya tercatat pada jejak audit seperti perpindahan lain.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system",
                                 "finance_manager", "head_finance");
  const p = await body(req);
  const n = Number(p.tahap);

  const tahap = TAHAP.find((t) => t.n === n);
  if (!tahap) {
    throw new WorkflowError("Tahap tidak dikenal.", "validation", 422);
  }
  if (n >= 3) {
    throw new WorkflowError(
      "Tahap ini tidak dapat dipilih langsung. Persetujuan Final menunggu " +
      "dokumen full sign, dan Pembayaran Selesai menunggu tanggal serta " +
      "bukti transfernya.", "berkas_required", 422);
  }

  const klaim = await getClaim(id);
  if (tahapDari(klaim.status) === n) return claimView(await getClaim(id));

  if (!bolehGerak(klaim.status)) {
    throw new WorkflowError(
      "Dokumennya belum ditandatangani, jadi belum memasuki tahap peredaran.",
      "belum_beredar", 422);
  }

  const jalur = jalurKe(klaim.status, tahap.tuju);
  if (!jalur) {
    throw new WorkflowError(
      `Tidak ada jalur dari keadaan sekarang ke "${tahap.nama}". ` +
      "Tahap hanya dapat maju, tidak dapat mundur.", "tanpa_jalur", 422);
  }

  for (const langkah of jalur) {
    await transition(id, langkah, user.username);
  }
  await audit({
    entityType: "claim", entityId: id, action: "tahap_dipilih",
    actor: user.username,
    before: { status: klaim.status, tahap: tahapDari(klaim.status) },
    after: { tahap: n, nama: tahap.nama, lewat: jalur },
  });
  return claimView(await getClaim(id));
});

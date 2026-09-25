import { handler, requireRole, body } from "@/lib/api";
import { audit, one, query } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";

/**
 * Dua isian Tabel Sirkulasi Dokumen yang diisi tangan.
 *
 * Nomor Internal Office Memo terbit di luar sistem ini, dan tanggal diterima
 * hanya diketahui orang yang menyerahkan berkasnya — serah terima tercatat
 * sebagai satu peristiwa pada satu waktu, tanpa pengakuan terima tersendiri.
 * Keduanya tidak dapat disusun dari data yang ada, jadi disediakan tempatnya
 * alih-alih dikarang.
 *
 * Yang boleh mengisi sama dengan yang boleh menggerakkan dokumennya: Admin
 * Sales. Isian yang dapat diubah siapa saja bukan catatan peredaran lagi.
 *
 * Keduanya boleh dikosongkan kembali — string kosong dan null sama-sama
 * berarti "belum diisi", sebab yang salah ketik harus dapat menghapusnya
 * tanpa mengarang nilai pengganti.
 *
 * Yang tidak disebut dalam permintaan tidak disentuh. Menulis keduanya setiap
 * kali akan membuat permintaan yang hanya membetulkan nomor memo ikut
 * menghapus tanggal yang sudah benar — diam-diam, tanpa ada yang memintanya.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);

  const klaim = await one<any>("SELECT id FROM claims WHERE id=$1", [id]);
  if (!klaim) throw new WorkflowError("Klaim tidak ditemukan.", "not_found", 404);

  const adaMemo = Object.prototype.hasOwnProperty.call(p, "office_memo_no");
  const adaTgl = Object.prototype.hasOwnProperty.call(p, "received_at");
  if (!adaMemo && !adaTgl) {
    throw new WorkflowError("Tidak ada isian yang dikirim.", "validation", 422);
  }

  const memo = typeof p.office_memo_no === "string"
    ? p.office_memo_no.trim().slice(0, 100) || null : null;

  // Tanggal ditolak di sini bila bentuknya bukan YYYY-MM-DD: PostgreSQL akan
  // menerima banyak bentuk lain dan menafsirkannya sendiri, dan tafsir itu
  // berbeda antara "03/04" yang dimaksud 3 April dan yang dimaksud 4 Maret.
  const tgl = typeof p.received_at === "string" && p.received_at.trim()
    ? p.received_at.trim() : null;
  if (tgl && !/^\d{4}-\d{2}-\d{2}$/.test(tgl)) {
    throw new WorkflowError("Tanggal diterima harus berbentuk YYYY-MM-DD.",
                            "validation", 422);
  }

  const baru = await one<any>(
    `UPDATE claims
        SET office_memo_no = CASE WHEN $1 THEN $2 ELSE office_memo_no END,
            received_at    = CASE WHEN $3 THEN $4::date ELSE received_at END
      WHERE id = $5
     RETURNING office_memo_no, received_at`,
    [adaMemo, memo, adaTgl, tgl, id]);

  await audit({
    entityType: "claim", entityId: id, action: "sirkulasi_isian",
    actor: user.username,
    after: {
      ...(adaMemo ? { office_memo_no: memo } : {}),
      ...(adaTgl ? { received_at: tgl } : {}),
    },
  });

  return { office_memo_no: baru.office_memo_no,
           received_at: baru.received_at
             ? String(baru.received_at instanceof Date
                 ? baru.received_at.toISOString() : baru.received_at).slice(0, 10)
             : null };
});

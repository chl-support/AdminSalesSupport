import { handler, requireRole, body } from "@/lib/api";
import { audit, one } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";

/**
 * Empat isian Tabel Sirkulasi Dokumen yang diisi tangan.
 *
 * Nomor Internal Office Memo terbit di luar sistem ini, dan tanggal diterima
 * hanya diketahui orang yang menyerahkan berkasnya — serah terima tercatat
 * sebagai satu peristiwa pada satu waktu, tanpa pengakuan terima tersendiri.
 * Kepada siapa berkasnya diserahkan dan kapan pun begitu: keduanya punya
 * bayangannya pada physical_location dan physical_since, tetapi bayangan itu
 * hanya terisi bila serah terimanya dicatat lewat layar Approval, sedangkan
 * berkas yang diantar langsung ke meja orang tidak pernah melewatinya.
 * Keempatnya tidak dapat disusun dari data yang ada, jadi disediakan
 * tempatnya alih-alih dikarang.
 *
 * Yang boleh mengisi sama dengan yang boleh menggerakkan dokumennya: Admin
 * Sales. Isian yang dapat diubah siapa saja bukan catatan peredaran lagi.
 *
 * Semuanya boleh dikosongkan kembali — string kosong dan null sama-sama
 * berarti "belum diisi", sebab yang salah ketik harus dapat menghapusnya
 * tanpa mengarang nilai pengganti.
 *
 * Yang tidak disebut dalam permintaan tidak disentuh. Menulis keempatnya
 * setiap kali akan membuat permintaan yang hanya membetulkan nomor memo ikut
 * menghapus tanggal yang sudah benar — diam-diam, tanpa ada yang memintanya.
 */

/** Isian teks: namanya di basis data dan panjang terpanjang yang masuk akal. */
const TEKS: Record<string, number> = { office_memo_no: 100, handed_to: 100 };
/** Isian tanggal; semuanya kolom DATE. */
const TANGGAL = ["received_at", "distributed_at"];

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);

  const klaim = await one<any>("SELECT id FROM claims WHERE id=$1", [id]);
  if (!klaim) throw new WorkflowError("Klaim tidak ditemukan.", "not_found", 404);

  const nilai: Record<string, string | null> = {};
  for (const medan of [...Object.keys(TEKS), ...TANGGAL]) {
    if (!Object.prototype.hasOwnProperty.call(p, medan)) continue;
    const isi = typeof p[medan] === "string" ? p[medan].trim() : "";
    if (!isi) { nilai[medan] = null; continue; }
    // Tanggal ditolak di sini bila bentuknya bukan YYYY-MM-DD: PostgreSQL akan
    // menerima banyak bentuk lain dan menafsirkannya sendiri, dan tafsir itu
    // berbeda antara "03/04" yang dimaksud 3 April dan yang dimaksud 4 Maret.
    if (TANGGAL.includes(medan) && !/^\d{4}-\d{2}-\d{2}$/.test(isi)) {
      throw new WorkflowError(`Isian ${medan} harus berbentuk YYYY-MM-DD.`,
                              "validation", 422);
    }
    nilai[medan] = TEKS[medan] ? isi.slice(0, TEKS[medan]) : isi;
  }

  const medan = Object.keys(nilai);
  if (!medan.length) {
    throw new WorkflowError("Tidak ada isian yang dikirim.", "validation", 422);
  }

  // Hanya medan yang benar-benar dikirim yang masuk SET-nya; sisanya tidak
  // disebut sama sekali, sehingga tidak ada jalan ia tertimpa tanpa sengaja.
  const set = medan.map((m, i) => TANGGAL.includes(m)
    ? `${m} = $${i + 1}::date` : `${m} = $${i + 1}`).join(", ");
  const baru = await one<any>(
    `UPDATE claims SET ${set} WHERE id = $${medan.length + 1}
      RETURNING office_memo_no, handed_to,
                to_char(received_at, 'YYYY-MM-DD')    AS received_at,
                to_char(distributed_at, 'YYYY-MM-DD') AS distributed_at`,
    [...medan.map((m) => nilai[m]), id]);

  await audit({
    entityType: "claim", entityId: id, action: "sirkulasi_isian",
    actor: user.username, after: nilai,
  });

  return {
    office_memo_no: baru.office_memo_no, handed_to: baru.handed_to,
    received_at: baru.received_at, distributed_at: baru.distributed_at,
  };
});

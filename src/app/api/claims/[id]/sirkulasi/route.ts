import { handler, requireRole, body } from "@/lib/api";
import { audit, one } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";

/**
 * Lima isian Tabel Sirkulasi Dokumen yang diisi tangan.
 *
 * Nomor Internal Office Memo terbit di luar sistem ini, dan tanggal diterima
 * hanya diketahui orang yang menyerahkan berkasnya — serah terima tercatat
 * sebagai satu peristiwa pada satu waktu, tanpa pengakuan terima tersendiri.
 * Divisi pengirim, divisi penerima dan tanggal distribusinya pun begitu:
 * ketiganya punya
 * bayangannya pada physical_location dan physical_since, tetapi bayangan itu
 * hanya terisi bila serah terimanya dicatat lewat layar Approval, sedangkan
 * berkas yang diantar langsung ke meja orang tidak pernah melewatinya.
 * Kelimanya tidak dapat disusun dari data yang ada, jadi disediakan
 * tempatnya alih-alih dikarang.
 *
 * Yang boleh mengisi sama dengan yang boleh menggerakkan dokumennya: Admin
 * Sales. Isian yang dapat diubah siapa saja bukan catatan peredaran lagi.
 *
 * Semuanya boleh dikosongkan kembali — string kosong dan null sama-sama
 * berarti "belum diisi", sebab yang salah ketik harus dapat menghapusnya
 * tanpa mengarang nilai pengganti.
 *
 * Yang tidak disebut dalam permintaan tidak disentuh. Menulis kelimanya
 * setiap kali akan membuat permintaan yang hanya membetulkan nomor memo ikut
 * menghapus tanggal yang sudah benar — diam-diam, tanpa ada yang memintanya.
 */

/**
 * Divisi penerima, tanggal distribusi dan tanggal penerima bertempat empat.
 *
 * Satu berkas berpindah beberapa kali sebelum selesai, dan Tabel Sirkulasi
 * Dokumen di kantor menyediakan empat baris untuk itu. Yang pertama tetap
 * bernama handed_to, distributed_at dan received_at tanpa akhiran: ketiga
 * kolom itu sudah terisi, dan menamainya ulang berarti memindahkan data yang
 * sudah ada tanpa sebab.
 */
const URUT = [2, 3, 4];

/** Isian teks: namanya di basis data dan panjang terpanjang yang masuk akal. */
const TEKS: Record<string, number> = {
  office_memo_no: 100, sender_division: 100, handed_to: 100,
  ...Object.fromEntries(URUT.map((n) => [`handed_to_${n}`, 100])),
};
/** Isian tanggal; semuanya kolom DATE. */
const TANGGAL = ["received_at", "distributed_at",
                 ...URUT.flatMap((n) =>
                   [`distributed_at_${n}`, `received_at_${n}`])];

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
  // Yang dikembalikan disusun dari daftar medan yang sama dengan yang
  // diterima, bukan ditulis ulang satu per satu. Daftar kedua yang ditulis
  // tangan akan ketinggalan begitu satu medan ditambahkan — layar menyimpan
  // isiannya, jawabannya tidak menyebut medan itu, dan sel yang baru diisi
  // berubah kosong di depan mata yang mengisinya.
  const dibaca = [...Object.keys(TEKS),
                  ...TANGGAL.map((m) => `to_char(${m}, 'YYYY-MM-DD') AS ${m}`)];
  const baru = await one<any>(
    `UPDATE claims SET ${set} WHERE id = $${medan.length + 1}
      RETURNING ${dibaca.join(", ")}`,
    [...medan.map((m) => nilai[m]), id]);

  await audit({
    entityType: "claim", entityId: id, action: "sirkulasi_isian",
    actor: user.username, after: nilai,
  });

  return Object.fromEntries(
    [...Object.keys(TEKS), ...TANGGAL].map((m) => [m, baru[m] ?? null]));
});

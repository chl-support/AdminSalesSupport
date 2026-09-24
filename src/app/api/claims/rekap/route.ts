import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { claimView, handler, projectAktif } from "@/lib/api";
import { one, query } from "@/lib/db";

/** Menyusun workbook dari seluruh klaim project; beri waktu yang cukup. */
export const maxDuration = 60;

/**
 * Dokumen pengajuan sebagai workbook Excel.
 *
 * Kolomnya sama persis dengan tabel di layar, dengan urutan yang sama —
 * sebagaimana rekap memo. Rekap yang berisi kolom lain daripada yang dilihat
 * orang di layar membuat keduanya tidak dapat dicocokkan.
 *
 * Yang tidak ikut hanya kolom Tindakan: isinya tombol, bukan data.
 */
type Baris = Record<string, any>;

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
               "Agustus", "September", "Oktober", "November", "Desember"];

/**
 * Tanggal menjadi "dd/mm/yyyy", sebagaimana tertulis di layar.
 *
 * Kolom tanggal kembali dari PostgreSQL sebagai objek Date, bukan teks;
 * String(Date) menghasilkan "Thu Jul 30 2026 …" yang sepuluh huruf pertamanya
 * bukan tanggal.
 */
const tgl = (v: any) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const JENIS: Record<string, string> = {
  commission: "Komisi", cash_reward: "Cash Reward",
  closing_fee: "Closing Fee", overriding: "Overriding",
};

const KEADAAN: Record<string, string> = {
  draft: "Di Admin Sales", submitted: "Di Admin Sales",
  pending_admin_review: "Di Admin Sales",
  pending_tax_verification: "Di tim pajak",
  tax_verified: "Kembali di Admin Sales",
  signature_link_sent: "Di Sales/Agent", awaiting_signature: "Di Sales/Agent",
  signature_review_required: "Di Admin Sales", signed: "Di Admin Sales",
  crosscheck_in_progress: "Di Admin Sales", ready_to_print: "Di Admin Sales",
  printed: "Di Admin Sales",
  circulating_head_finance: "Di Head Finance",
  circulating_management: "Di Manajemen",
  awaiting_scan_upload: "Di Admin Sales",
  approved: "Di Finance", awaiting_settlement_date: "Di Finance",
  partially_paid: "Di Finance", paid: "Di Finance",
  completed: "Selesai", returned: "Kembali ke Admin Sales",
  rejected: "Ditolak", cancelled: "Dibatalkan", clawback: "Penarikan kembali",
};

export const GET = handler(async (req) => {
  const projectId = await projectAktif(req);
  const baris = await query(
    "SELECT * FROM claims WHERE project_id=$1 ORDER BY created_at DESC",
    [projectId]);
  const klaim = (await Promise.all(baris.map(claimView))) as Baris[];
  const proyek = await one<{ name: string }>(
    "SELECT name FROM projects WHERE id=$1", [projectId]);

  const KOLOM: [string, number, (c: Baris, i: number) => string | number][] = [
    ["No.", 6, (_c, i) => i + 1],
    ["Tanggal Pengajuan", 18, (c) => tgl(c.created_at)],
    ["Unit", 16, (c) => c.unit?.code ?? ""],
    ["Perihal/Topik", 20, (c) => JENIS[c.claim_type] ?? c.claim_type],
    ["Kategori", 16, (c) => c.marketing?.marketing_type === "agent" ? "Agent"
                           : c.marketing?.marketing_type === "inhouse"
                             ? "Sales Inhouse" : ""],
    ["Penerima", 28, (c) => c.marketing?.full_name ?? ""],
    ["Diajukan Oleh", 28, (c) => c.diajukan_oleh_nama
        ? `${c.diajukan_oleh_nama} (${c.diajukan_oleh})`
        : (c.diajukan_oleh ?? "")],
    ["Jumlah Komisi", 18, (c) => Number(c.gross_amount ?? 0)],
    ["PPN", 16, (c) => Number(c.vat ?? 0)],
    ["PPh", 16, (c) => Number(c.withholding_tax ?? 0)],
    ["Komisi Yang Dibayarkan", 22, (c) => Number(c.net_amount ?? 0)],
    // Tanggal uang keluar menurut bukti bank, bukan tanggal persetujuannya.
    // Kosong selama belum ada pelunasan yang tercatat: pada lembar kerja,
    // sel kosong lebih berguna daripada tanda pisah yang dipakai di layar —
    // ia tidak ikut terbaca saat kolomnya disaring atau diurutkan.
    ["Tanggal Pembayaran", 20, (c) => tgl(c.tanggal_bayar)],
    ["Status", 26, (c) => KEADAAN[c.status] ?? c.status],
    // Nomor klaim tercetak kecil di bawah tanggal pada layar; di sini ia
    // mendapat kolomnya sendiri, sebab lembar kerja tidak mengenal baris kecil
    // di dalam sel. Ia satu-satunya kolom yang tidak ada padanan di layar, dan
    // karena itu berdiri di ujung kanan — sesudah seluruh kolom yang berpadanan
    // habis, supaya urutan keduanya tetap dapat ditelusuri berdampingan.
    ["Nomor Klaim", 22, (c) => c.claim_number ?? ""],
  ];

  /**
   * Kolom yang isinya rupiah, dicari dari judulnya.
   *
   * Dulu nomornya ditulis tangan sebagai [7, 8, 9, 10]. Nomor semacam itu
   * diam-diam salah begitu ada yang menyisipkan satu kolom di sebelah kiri —
   * formatnya berpindah ke kolom tetangga, dan yang membuka rekapnya melihat
   * tanggal berformat ribuan sementara angka rupiahnya kehilangan pemisahnya.
   * Tidak ada yang gagal, tidak ada yang memberi tahu.
   */
  const kolomUang = KOLOM
    .map(([judul], i) => ["Jumlah Komisi", "PPN", "PPh",
                          "Komisi Yang Dibayarkan"].includes(judul) ? i + 1 : 0)
    .filter((n) => n > 0);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Dokumen Pengajuan");
  ws.addRow([`Dokumen Pengajuan — ${proyek?.name ?? ""}`]);
  ws.mergeCells(1, 1, 1, KOLOM.length);
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.addRow([]);

  const kepala = ws.addRow(KOLOM.map(([j]) => j));
  kepala.font = { bold: true };
  kepala.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  KOLOM.forEach(([, l], i) => { ws.getColumn(i + 1).width = l; });

  klaim.forEach((c, i) => {
    const r = ws.addRow(KOLOM.map(([, , ambil]) => ambil(c, i)));
    r.alignment = { vertical: "top", wrapText: true };
    // Angka rupiah diberi format ribuan, bukan ditulis sebagai teks: yang
    // membuka rekap ini menjumlah kolomnya.
    for (const kol of kolomUang) r.getCell(kol).numFmt = "#,##0";
  });

  const tepi = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
  for (let r = 3; r <= ws.rowCount; r++)
    for (let c = 1; c <= KOLOM.length; c++)
      ws.getCell(r, c).border =
        { top: tepi, left: tepi, bottom: tepi, right: tepi };

  const buf = await wb.xlsx.writeBuffer();
  const nama = `Dokumen_Pengajuan_${(proyek?.name ?? "project")
    .replace(/[^A-Za-z0-9]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nama}"`,
    },
  });
});

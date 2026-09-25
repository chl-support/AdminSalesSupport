import { handler, projectAktif } from "@/lib/api";
import { query } from "@/lib/db";
import { HANDOFF_NEXT } from "@/lib/workflow";

/**
 * Dokumen yang sedang beredar, dengan kolom sebagaimana Tabel Sirkulasi
 * Dokumen yang dipakai kantor.
 *
 * Unit dan jenis dokumennya ikut dibaca: yang mencari berkas di meja orang
 * menyebutnya "berkas unit NS-NR3-01", bukan nomor klaimnya.
 *
 * Nomor Internal Office Memo dan tanggal diterima diisi tangan — keduanya
 * tidak dapat disusun dari data yang ada. Lihat /api/claims/[id]/sirkulasi.
 *
 * "Dari" tidak tersimpan pada klaimnya — yang tersimpan hanya pemegang
 * sekarang. Ia disusun dari riwayat serah terima: pemegang sebelumnya adalah
 * tujuan perpindahan sebelumnya. Klaim yang baru sekali berpindah datang dari
 * Admin Sales, sebab di sanalah dokumen dicetak sebelum diedarkan.
 */
export const GET = handler(async (req) => {
  const baris = await query<any>(
    `SELECT c.id, c.claim_number, c.print_copy_number, c.claim_type, c.status,
            c.physical_location, c.physical_since,
            c.office_memo_no,
            to_char(c.received_at, 'YYYY-MM-DD') AS received_at,
            u.code AS unit_code,
            EXTRACT(DAY FROM now() - c.physical_since)::int AS age_days,
            (SELECT h.event FROM handoffs h
              WHERE h.claim_id = c.id
              ORDER BY h.occurred_at DESC OFFSET 1 LIMIT 1) AS prev_event
       FROM claims c
       LEFT JOIN units u ON u.id = c.unit_id
      WHERE c.project_id = $1
        AND c.status IN ('printed','circulating_head_finance',
                         'circulating_management','awaiting_scan_upload')
      ORDER BY age_days DESC NULLS LAST`,
    [await projectAktif(req)]);

  return baris.map((b) => ({
    ...b,
    dari: b.prev_event ? HANDOFF_NEXT[b.prev_event]?.[1] ?? null : "Admin Sales",
  }));
});

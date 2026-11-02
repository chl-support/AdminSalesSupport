import { handler, projectAktif, requireRole } from "@/lib/api";
import { query } from "@/lib/db";

/**
 * Status jual tiap unit pada proyek yang sedang dibuka, untuk kolom Status di
 * langkah 4a dan 4b.
 *
 * Sumbernya Data Penjualan yang sudah ada — tabel units — bukan daftar
 * tersendiri yang harus dirawat dua kali. Unit yang pernah dipesan lalu batal
 * atau pindah unit kembali terhitung tersedia: pemesanannya memang sudah
 * tidak berlaku. Unit milik management disebut apa adanya, sebab ia tidak
 * terjual tetapi juga tidak ditawarkan.
 *
 * Satu kode unit dapat punya lebih dari satu baris (mis. pesanan batal lalu
 * dipesan lagi); yang dipakai baris terakhir yang masih berlaku.
 */
export const GET = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system", "finance_tax",
                    "finance_payment", "finance_manager", "head_finance", "management");
  const projectId = await projectAktif(req);
  const baris = await query<{
    code: string; status: string; buyer_name: string | null;
    contract_date: string | null; contract_number: string | null;
  }>(
    `SELECT DISTINCT ON (upper(btrim(u.code)))
            upper(btrim(u.code)) AS code, u.status::text AS status,
            u.buyer_name, u.contract_date, u.contract_number
       FROM units u
      WHERE u.project_id = $1
        AND u.status NOT IN ('cancelled','moved_to_other_unit')
      ORDER BY upper(btrim(u.code)), u.contract_date DESC NULLS LAST, u.id`,
    [projectId]);
  return { unit: baris };
});

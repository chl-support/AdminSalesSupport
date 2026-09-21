import { handler, currentUser, projectAktif } from "@/lib/api";
import { query } from "@/lib/db";
import { dapatDiklaim, type ClaimType } from "@/lib/calc";

/**
 * Berapa dokumen yang sedang menunggu orang ini.
 *
 * Dipakai untuk pemberitahuan saat masuk. Selama ini klaim yang sudah dikirim
 * ke tim pajak hanya diam di daftar sampai ada yang kebetulan membuka layarnya;
 * tidak ada apa pun yang memberi tahu tim pajak bahwa ada yang menunggu
 * diverifikasi. Pekerjaan yang hanya terlihat oleh yang mencarinya adalah
 * pekerjaan yang tertunda berhari-hari tanpa ada yang tahu.
 *
 * Yang dihitung adalah status tempat klaim benar-benar berhenti menunggu peran
 * ini, bukan seluruh klaim yang boleh dilihatnya. Angka yang mencampur
 * keduanya tidak dapat ditindaklanjuti: yang membacanya tidak tahu berapa yang
 * sebenarnya menjadi gilirannya.
 */
const MENUNGGU: Record<string, string[]> = {
  // Pemeriksaan sebelum diteruskan ke pajak, tautan tanda tangan yang belum
  // dikirim setelah pajak selesai, dan tanda tangan yang jatuh ke pemeriksaan
  // manual — ketiganya berhenti di Admin Sales.
  admin_sales: ["pending_admin_review", "tax_verified",
                "signature_review_required", "awaiting_scan_upload"],
  finance_tax: ["pending_tax_verification"],
  // Finance Manager dapat memverifikasi pajak dan menangani pembayaran.
  finance_manager: ["pending_tax_verification", "approved",
                    "awaiting_settlement_date"],
  finance_payment: ["approved", "awaiting_settlement_date"],
  head_finance: ["circulating_head_finance"],
  management: ["circulating_management"],
  // Admin IT tidak menyetujui klaim apa pun. Memberinya angka di sini berarti
  // memberinya pekerjaan yang bukan haknya untuk dikerjakan.
  admin_system: [],
};

/** Layar tempat pekerjaan itu dikerjakan. */
const LAYAR: Record<string, string> = {
  // Pengajuan Fee: di sana fee yang sudah dapat diklaim diajukan, dan di sana
  // pula tautan tanda tangan dikirim ke Sales/Agent setelah pajak selesai.
  admin_sales: "/klaim",
  head_finance: "/sirkulasi",
  management: "/sirkulasi",
};

const SEMUA_FEE: ClaimType[] =
  ["closing_fee", "cash_reward", "commission", "overriding"];

/**
 * Fee yang sudah boleh diajukan tapi belum diajukan siapa pun.
 *
 * Pekerjaan yang tidak punya dokumen sama sekali — karenanya tidak muncul pada
 * daftar klaim mana pun. Penerimaan sebuah unit melewati 20% pada laporan bulan
 * ini, dan sejak itu feenya menunggu tanpa meninggalkan jejak; yang mengetahui
 * hanya yang membuka daftar penjualan dan membacanya baris demi baris.
 */
async function siapDiklaim(projectId: string): Promise<number> {
  const unit = await query<any>(
    `SELECT u.id, u.status, u.contract_value_incl_vat, u.received_amount,
            u.marketing_id, u.sub_coordinator_id, u.coordinator_id,
            m.status  AS marketing_status,
            sk.status AS sub_coordinator_status,
            ko.status AS coordinator_status
       FROM units u
       LEFT JOIN marketings m  ON m.id  = u.marketing_id
       LEFT JOIN marketings sk ON sk.id = u.sub_coordinator_id
       LEFT JOIN marketings ko ON ko.id = u.coordinator_id
      WHERE u.project_id = $1 AND u.status <> 'cancelled'`, [projectId]);

  // Klaim yang ditolak, dibatalkan, atau di-clawback sengaja tidak dihitung
  // sebagai "sudah diajukan" — unitnya memang boleh diajukan ulang, sama
  // seperti pada daftar penjualan.
  const klaim = await query<{ unit_id: string; claim_type: ClaimType }>(
    `SELECT unit_id, claim_type FROM claims
      WHERE project_id = $1
        AND status NOT IN ('rejected','cancelled','clawback')`, [projectId]);
  const sudah = new Set(klaim.map((k) => `${k.unit_id}:${k.claim_type}`));

  let n = 0;
  for (const u of unit) {
    for (const jenis of SEMUA_FEE) {
      if (dapatDiklaim(u, jenis, sudah.has(`${u.id}:${jenis}`))) n++;
    }
  }
  return n;
}

export const GET = handler(async (req) => {
  const user = await currentUser(req);
  const status = MENUNGGU[user.role] ?? [];
  const layar = LAYAR[user.role] ?? "/konsol";
  const projectId = await projectAktif(req);

  const rincian = status.length
    ? await query(
        `SELECT status, count(*)::int AS jumlah
           FROM claims
          WHERE project_id = $1 AND status = ANY($2::claim_status[])
          GROUP BY status`, [projectId, status])
    : [];

  // Hanya Admin Sales: merekalah yang mengajukan fee, dan angka ini menjadi
  // pekerjaan hanya di tangan mereka.
  const dapatDiajukan = user.role === "admin_sales"
    ? await siapDiklaim(projectId) : 0;

  return {
    role: user.role,
    status,
    rincian,
    dapat_diajukan: dapatDiajukan,
    jumlah: rincian.reduce((t: number, r: any) => t + r.jumlah, 0) +
            dapatDiajukan,
    layar,
  };
});

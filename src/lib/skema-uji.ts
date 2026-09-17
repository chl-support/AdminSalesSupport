/**
 * Skema insentif uji coba.
 *
 * Perhitungan klaim berhenti bila tidak ada skema insentif yang berlaku untuk
 * jenis fee, peran penerima, dan tanggal kontrak unitnya. Itu perilaku yang
 * benar: memakai tarif bawaan diam-diam berarti membayar dengan angka yang
 * tidak pernah diputuskan siapa pun.
 *
 * Tetapi selama sistemnya masih diuji, penghentian itu menutup seluruh alur —
 * tidak ada satu pun klaim yang dapat dibuat, sehingga langkah-langkah
 * sesudahnya (pajak, tanda tangan, cetak, serah terima) tidak pernah dapat
 * dicoba. Modul ini membuka jalan itu, dengan tiga syarat yang membuatnya tidak
 * bisa menyamar sebagai konfigurasi sungguhan:
 *
 *   1. **Tarifnya bukan karangan.** Yang dipasang adalah salinan skema yang
 *      sudah ada di basis data, dengan masa berlaku dilebarkan. Tidak ada angka
 *      baru yang diciptakan di sini.
 *   2. **Namanya menyebut dirinya sendiri.** `memo_reference` setiap baris
 *      diawali "UJI COBA", jadi nomor memo pada formulir klaim yang dihasilkan
 *      akan terbaca sebagai uji coba oleh siapa pun yang memeriksanya.
 *   3. **Dapat dicabut.** Satu tombol menghapus seluruhnya, dan pencabutannya
 *      tercatat pada jejak audit sama seperti pemasangannya.
 *
 * Klaim yang terlanjur dibuat dengan skema ini tidak ikut terhapus — angkanya
 * sudah tersimpan pada klaimnya. Itu sebabnya nomor memonya penting: ia
 * satu-satunya penanda yang tertinggal pada klaim lama.
 */

import { audit, one, query } from "./db";
import { WorkflowError } from "./workflow";

/** Awalan nomor memo yang menandai baris ini uji coba, bukan memo sungguhan. */
export const TANDA = "UJI COBA";

/** Sejak kapan skema uji coba dianggap berlaku. */
const SEJAK = "2000-01-01";

export type StatusUji = {
  terpasang: number;
  sumber: number;
  contoh: { claim_type: string; peran: string; tarif: string }[];
};

/** Berapa skema uji coba yang terpasang pada project ini, dan apa isinya. */
export async function statusSkemaUji(projectId: string): Promise<StatusUji> {
  const rows = await query<{
    claim_type: string; recipient_role: string | null;
    overriding_level: string | null;
    percentage: string | null; flat_amount: string | null;
  }>(
    `SELECT claim_type, recipient_role, overriding_level, percentage, flat_amount
       FROM incentive_schemes
      WHERE project_id = $1 AND memo_reference LIKE $2
      ORDER BY claim_type, recipient_role, overriding_level`,
    [projectId, `${TANDA}%`]);

  const sumber = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM incentive_schemes
      WHERE memo_reference IS NULL OR memo_reference NOT LIKE $1`,
    [`${TANDA}%`]);

  return {
    terpasang: rows.length,
    sumber: sumber?.n ?? 0,
    contoh: rows.map((r) => ({
      claim_type: r.claim_type,
      peran: r.recipient_role ?? r.overriding_level ?? "—",
      tarif: r.percentage
        ? `${(Number(r.percentage) * 100).toFixed(2)}%`
        : `Rp ${Number(r.flat_amount ?? 0).toLocaleString("id-ID")}`,
    })),
  };
}

/**
 * Pasang skema uji coba pada satu project.
 *
 * Sumbernya skema yang sudah ada — yang paling baru untuk tiap kombinasi jenis
 * fee, peran, dan tingkat overriding, dari project mana pun. Masa berlakunya
 * dilebarkan supaya unit dengan tanggal kontrak lama pun ikut terhitung; itulah
 * yang selama ini menghentikan uji coba, karena kontrak 2023 tidak tercakup
 * memo yang berlaku sejak 2025.
 */
export async function pasangSkemaUji(projectId: string, aktor: string) {
  const ada = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM incentive_schemes
      WHERE project_id = $1 AND memo_reference LIKE $2`,
    [projectId, `${TANDA}%`]);
  if ((ada?.n ?? 0) > 0) {
    throw new WorkflowError(
      "Skema uji coba sudah terpasang pada project ini. Cabut dulu bila ingin " +
      "memasangnya ulang.", "already_installed", 409);
  }

  // DISTINCT ON mengambil satu baris per kombinasi: yang berlaku paling akhir.
  // Tanpa itu, satu kombinasi yang pernah berganti memo akan tersalin dua kali
  // dan findScheme memilih salah satunya tanpa aturan yang dapat dijelaskan.
  const hasil = await query<{ id: string }>(
    `INSERT INTO incentive_schemes
       (project_id, memo_reference, claim_type, recipient_role, overriding_level,
        scheme_type, basis, percentage, flat_amount, tiers, flat_amount_is_net,
        effective_from, effective_to)
     SELECT $1,
            $2 || ' — ' || COALESCE(s.memo_reference, 'tanpa nomor memo'),
            s.claim_type, s.recipient_role, s.overriding_level,
            s.scheme_type, s.basis, s.percentage, s.flat_amount, s.tiers,
            s.flat_amount_is_net, $3::date, NULL
       FROM (
         SELECT DISTINCT ON (claim_type, recipient_role, overriding_level) *
           FROM incentive_schemes
          WHERE memo_reference IS NULL OR memo_reference NOT LIKE $4
          ORDER BY claim_type, recipient_role, overriding_level,
                   effective_from DESC
       ) s
     RETURNING id`,
    [projectId, TANDA, SEJAK, `${TANDA}%`]);

  if (!hasil.length) {
    throw new WorkflowError(
      "Tidak ada skema yang dapat disalin. Basis data ini belum memuat satu pun " +
      "skema insentif sungguhan.", "no_source", 422);
  }

  await audit({
    entityType: "incentive_scheme", entityId: projectId,
    action: "trial_schemes_installed", actor: aktor,
    after: { jumlah: hasil.length, berlaku_sejak: SEJAK, tanda: TANDA },
  });
  return { dipasang: hasil.length };
}

/** Cabut seluruh skema uji coba pada satu project. */
export async function cabutSkemaUji(projectId: string, aktor: string) {
  const hasil = await query<{ id: string }>(
    `DELETE FROM incentive_schemes
      WHERE project_id = $1 AND memo_reference LIKE $2 RETURNING id`,
    [projectId, `${TANDA}%`]);

  await audit({
    entityType: "incentive_scheme", entityId: projectId,
    action: "trial_schemes_removed", actor: aktor,
    before: { jumlah: hasil.length },
  });
  return { dicabut: hasil.length };
}

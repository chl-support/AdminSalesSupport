/**
 * Sebutan pada lembar Detail Perhitungan.
 *
 * Berdiri terpisah dari @/lib/detail-fee karena layar pratinjau memakainya
 * di peramban, sedangkan berkas itu menyentuh basis data. Satu import saja
 * dari sana akan menarik pg ke dalam bundel peramban.
 */

/** Jenis fee yang punya lembar ini; Overriding punya rekapnya sendiri. */
export const JENIS_DETAIL = ["closing_fee", "cash_reward", "commission",
                             "continuity_reward"];

/** Judul lembarnya, sebagaimana tertulis pada berkas acuan kantor. */
export const JUDUL_DETAIL: Record<string, string> = {
  closing_fee: "Detail Perhitungan Closing Fee",
  cash_reward: "Detail Perhitungan Cash Reward",
  commission: "Detail Perhitungan Komisi",
  continuity_reward: "Detail Perhitungan Continuity Reward",
};

/** Judul kelompok kolom skemanya. */
export const SKEMA_DETAIL: Record<string, string> = {
  closing_fee: "Skema Closing Fee",
  cash_reward: "Skema Cash Reward",
  commission: "Skema Komisi",
  continuity_reward: "Skema Continuity Reward",
};

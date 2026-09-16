/**
 * Pengosongan data operasional.
 *
 * Masa uji coba meninggalkan campuran: data contoh, penjualan yang diimpor
 * setengah jalan, marketing yang namanya lahir dari kolom Sales, klaim yang
 * dibuat untuk mencoba. Membereskannya satu per satu lewat layar tidak mungkin —
 * dan menyisakan sebagian justru berbahaya, karena angka lama bercampur angka
 * sungguhan tanpa ada yang dapat membedakannya lagi.
 *
 * Yang dikosongkan hanya data operasional. Tiga golongan sengaja tidak
 * disentuh:
 *
 *   1. Akun pengguna dan sesinya — yang menekan tombol ini sedang memakainya.
 *   2. Konfigurasi: skema insentif, tarif pajak, periode akuntansi, pengaturan,
 *      kontak Admin IT. Itu hasil pembacaan memo, bukan data uji coba, dan
 *      menghapusnya berarti klaim berikutnya tidak dapat dihitung sama sekali.
 *   3. Jejak audit. Ia append-only dan dijaga RULE di basis data; percobaan
 *      menghapusnya tidak akan berbunyi galat, ia hanya tidak terjadi. Justru
 *      di sanalah pengosongan ini tercatat.
 */

import { audit, one, query, tx } from "./db";
import { WorkflowError } from "./workflow";

/** Kata yang harus diketik ulang. Sengaja bukan "ya" atau "ok". */
export const PENEGASAN = "KOSONGKAN";

/**
 * Urutan penghapusan mengikuti arah kunci asing, dari yang menunjuk ke yang
 * ditunjuk. Ditulis apa adanya, bukan TRUNCATE ... CASCADE: cascade akan ikut
 * mengosongkan tabel yang kebetulan menunjuk ke sini tanpa disebutkan, dan
 * daftar yang tidak tertulis adalah daftar yang tidak dapat diperiksa siapa pun.
 */
const URUTAN = [
  "settlement_lines",
  "settlements",
  "payment_instructions",
  "print_packages",
  "handoffs",
  "signature_attempts",
  "signing_sessions",
  "claim_documents",
  "claims",
  "overriding_rows",
  "overriding_batches",
  "non_cash_incentives",
  "signature_specimens",
  "enrollment_sessions",
  "bank_accounts",
  "units",
  "marketings",
  "agencies",
  "idempotency_keys",
];

export type HasilKosong = {
  sebelum: Record<string, number>;
  terhapus: Record<string, number>;
  dipertahankan: string[];
};

/** Hitung isi tiap tabel, untuk diperlihatkan sebelum dan sesudah. */
export async function isiTabel(): Promise<Record<string, number>> {
  const hasil: Record<string, number> = {};
  for (const t of URUTAN) {
    const r = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${t}`);
    hasil[t] = r?.n ?? 0;
  }
  return hasil;
}

export async function kosongkan(
  aktor: string, penegasan: string,
): Promise<HasilKosong> {
  if (penegasan.trim() !== PENEGASAN) {
    throw new WorkflowError(
      `Ketik ${PENEGASAN} persis untuk melanjutkan.`, "confirmation_required", 422);
  }

  const sebelum = await isiTabel();

  // Satu transaksi: pengosongan yang berhenti di tengah meninggalkan klaim
  // tanpa unit dan unit tanpa marketing — keadaan yang tidak dapat dibereskan
  // lewat layar mana pun.
  await tx(async (c) => {
    for (const t of URUTAN) {
      await query(`DELETE FROM ${t}`, [], c);
    }
  });

  await audit({
    entityType: "system", action: "data_wipe", actor: aktor,
    reason: "Pengosongan data operasional sebelum pemakaian sungguhan.",
    before: sebelum, after: await isiTabel(),
  });

  return {
    sebelum,
    terhapus: sebelum,
    dipertahankan: [
      "users", "sessions", "settings", "incentive_schemes", "tax_rates",
      "accounting_periods", "audit_log", "login_attempts",
    ],
  };
}

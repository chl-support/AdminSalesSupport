/**
 * Pengosongan data operasional.
 *
 * Masa uji coba meninggalkan campuran: data contoh, penjualan yang diimpor
 * setengah jalan, marketing yang namanya lahir dari kolom Sales, klaim yang
 * dibuat untuk mencoba. Membereskannya satu per satu lewat layar tidak mungkin —
 * dan menyisakan sebagian justru berbahaya, karena angka lama bercampur angka
 * sungguhan tanpa ada yang dapat membedakannya lagi.
 *
 * Sejak satu pemasangan melayani beberapa project, pengosongan dibatasi pada
 * project yang sedang dikerjakan. Tombol yang menghapus seluruh project sekaligus
 * karena satu di antaranya perlu diulang adalah kesalahan yang tidak dapat
 * dibatalkan — dan yang menekannya tidak akan tahu sampai project lain dibuka.
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
const KLAIM = "SELECT id FROM claims WHERE project_id = $1";
const MKT = "SELECT id FROM marketings WHERE project_id = $1";
const UNIT = "SELECT id FROM units WHERE project_id = $1";

const URUTAN: { tabel: string; hapus: string }[] = [
  { tabel: "settlement_lines",
    hapus: `DELETE FROM settlement_lines WHERE instruction_id IN (
              SELECT id FROM payment_instructions WHERE claim_id IN (${KLAIM}))` },
  { tabel: "payment_instructions",
    hapus: `DELETE FROM payment_instructions WHERE claim_id IN (${KLAIM})` },
  { tabel: "print_packages",
    hapus: `DELETE FROM print_packages WHERE claim_id IN (${KLAIM})` },
  { tabel: "handoffs", hapus: `DELETE FROM handoffs WHERE claim_id IN (${KLAIM})` },
  { tabel: "signature_attempts",
    hapus: `DELETE FROM signature_attempts WHERE claim_id IN (${KLAIM})` },
  { tabel: "signing_sessions",
    hapus: `DELETE FROM signing_sessions WHERE claim_id IN (${KLAIM})` },
  { tabel: "claim_documents",
    hapus: `DELETE FROM claim_documents WHERE claim_id IN (${KLAIM})` },
  { tabel: "claims", hapus: "DELETE FROM claims WHERE project_id = $1" },
  { tabel: "overriding_rows",
    hapus: `DELETE FROM overriding_rows WHERE unit_id IN (${UNIT})` },
  { tabel: "overriding_batches",
    hapus: `DELETE FROM overriding_batches WHERE recipient_id IN (${MKT})` },
  { tabel: "non_cash_incentives",
    hapus: `DELETE FROM non_cash_incentives WHERE unit_id IN (${UNIT})` },
  { tabel: "signature_specimens",
    hapus: `DELETE FROM signature_specimens WHERE marketing_id IN (${MKT})` },
  { tabel: "enrollment_sessions",
    hapus: `DELETE FROM enrollment_sessions WHERE marketing_id IN (${MKT})` },
  { tabel: "bank_accounts",
    hapus: `DELETE FROM bank_accounts WHERE marketing_id IN (${MKT})` },
  { tabel: "units", hapus: "DELETE FROM units WHERE project_id = $1" },
  { tabel: "marketings", hapus: "DELETE FROM marketings WHERE project_id = $1" },
];

/**
 * Isi tiap tabel dalam lingkup satu project.
 *
 * Dihitung dengan syarat yang sama persis dengan penghapusannya — angka yang
 * diperlihatkan sebelum menekan tombol harus angka yang benar-benar akan
 * hilang, bukan perkiraan yang disusun dengan cara lain.
 */
const HITUNG: Record<string, string> = Object.fromEntries(
  URUTAN.map((u) => [u.tabel,
    u.hapus.replace(/^DELETE FROM (\w+)/, "SELECT COUNT(*)::int AS n FROM $1")]));

export type HasilKosong = {
  project?: string | null;
  sebelum: Record<string, number>;
  terhapus: Record<string, number>;
  dipertahankan: string[];
};

/** Hitung isi tiap tabel, untuk diperlihatkan sebelum dan sesudah. */
export async function isiTabel(projectId: string): Promise<Record<string, number>> {
  const hasil: Record<string, number> = {};
  for (const u of URUTAN) {
    const r = await one<{ n: number }>(HITUNG[u.tabel], [projectId]);
    hasil[u.tabel] = r?.n ?? 0;
  }
  return hasil;
}

export async function kosongkan(
  aktor: string, penegasan: string, projectId: string,
): Promise<HasilKosong> {
  if (penegasan.trim() !== PENEGASAN) {
    throw new WorkflowError(
      `Ketik ${PENEGASAN} persis untuk melanjutkan.`, "confirmation_required", 422);
  }

  const sebelum = await isiTabel(projectId);

  // Satu transaksi: pengosongan yang berhenti di tengah meninggalkan klaim
  // tanpa unit dan unit tanpa marketing — keadaan yang tidak dapat dibereskan
  // lewat layar mana pun.
  await tx(async (c) => {
    for (const u of URUTAN) {
      await query(u.hapus, [projectId], c);
    }
  });

  const proyek = await one<{ name: string }>(
    "SELECT name FROM projects WHERE id=$1", [projectId]);
  await audit({
    entityType: "project", entityId: projectId, action: "data_wipe", actor: aktor,
    reason: `Pengosongan data operasional project ${proyek?.name ?? projectId}.`,
    before: sebelum, after: await isiTabel(projectId),
  });

  return {
    sebelum,
    terhapus: sebelum,
    project: proyek?.name ?? null,
    dipertahankan: [
      "project lain", "users", "sessions", "settings", "incentive_schemes",
      "tax_rates", "accounting_periods", "agencies", "audit_log",
    ],
  };
}

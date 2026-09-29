/**
 * Detail Perhitungan untuk Closing Fee, Cash Reward, dan Komisi.
 *
 * Formulir pengajuan menyebutkan hasilnya — berapa yang dibayarkan kepada
 * siapa — tetapi tidak memperlihatkan dari mana angka itu datang. Yang
 * diperiksa Keuangan justru asalnya: nilai kontrak unitnya, berapa yang sudah
 * diterima, tarif mana yang dipakai, lalu DPP, PPN dan potongan pajaknya.
 * Selama itu tidak ikut tercetak, pemeriksaannya dikerjakan di luar sistem
 * dengan berkas Excel yang disusun tangan.
 *
 * Lembar ini persis tabel yang sudah dipakai Overriding — kolomnya sama,
 * sebab yang diperiksa memang hal yang sama — hanya isinya satu unit: unit
 * yang sedang diajukan. Karena itu tabelnya, rumusnya, dan kolomnya diambil
 * dari @/lib/overriding, bukan ditulis ulang: dua salinan rumus pajak yang
 * sama adalah dua kesempatan keduanya berbeda diam-diam.
 *
 * Kolom Selisih dikosongkan di sini, dan itu disengaja. "Selisih Overiding"
 * adalah bagian hak yang belum terbayar kepada tingkat di atas penjualnya —
 * pengertian yang tidak punya padanan pada Closing Fee, Cash Reward maupun
 * Komisi. Kolomnya tetap dicetak supaya lembarnya sebangun dengan lembar
 * Overriding yang beredar berdampingan dengannya, tetapi tidak diisi angka
 * yang tidak berarti apa-apa.
 */

import { one, query } from "./db";
import { namaKluster } from "./projects";
import { barisDari, namaBulan, tgl, totalkan,
         type BagianRekap, type Rekap } from "./overriding";
import { JENIS_DETAIL, SKEMA_DETAIL } from "./detail-label";

export { JENIS_DETAIL, JUDUL_DETAIL, SKEMA_DETAIL } from "./detail-label";

export async function detailFee(claimId: string): Promise<Rekap | null> {
  const klaim = await one<any>(
    `SELECT * FROM claims WHERE id=$1 AND claim_type = ANY($2::claim_type[])`,
    [claimId, JENIS_DETAIL]);
  if (!klaim) return null;

  const penerima = await one<any>(
    "SELECT id, full_name, marketing_type FROM marketings WHERE id=$1",
    [klaim.marketing_id]);
  const proyek = klaim.project_id
    ? await one<any>("SELECT slug, name, company_name FROM projects WHERE id=$1",
                     [klaim.project_id])
    : null;

  // Satu unit: unit yang sedang diajukan, beserta angka klaimnya sendiri.
  // Tanggal transfernya diambil bila uangnya memang sudah keluar; selama
  // belum, kolomnya kosong — bukan diisi tanggal hari ini.
  const baris = await query<any>(
    `SELECT u.*, m.full_name AS marketing_name, m.marketing_type,
            a.name AS agency_name,
            ko.full_name AS coordinator_name,
            c.id AS claim_id, c.status AS claim_status, c.gross_amount, c.vat,
            c.withholding_tax, c.net_amount, c.snapshot,
            s.transfer_date
       FROM claims c
       JOIN units u ON u.id = c.unit_id
       LEFT JOIN marketings m  ON m.id = u.marketing_id
       LEFT JOIN agencies    a ON a.id = m.agency_id
       LEFT JOIN marketings ko ON ko.id = COALESCE(u.sub_coordinator_id,
                                                   u.coordinator_id)
       LEFT JOIN LATERAL (
         SELECT st.transfer_date
           FROM settlements st
           JOIN settlement_lines sl ON sl.settlement_id = st.id
           JOIN payment_instructions pi ON pi.id = sl.instruction_id
          WHERE pi.claim_id = c.id
          ORDER BY st.transfer_date DESC LIMIT 1
       ) s ON TRUE
      WHERE c.id = $1`,
    [claimId]);
  if (!baris.length) return null;

  // persenTotal null: kolom Selisih memang tidak berlaku bagi jenis ini.
  const isi = baris.map((r, i) =>
    barisDari(r, i + 1, null, penerima?.full_name ?? null));
  const kontrak = tgl(baris[0].contract_date);

  const bagian: BagianRekap[] = [{
    judul: `PERIODE ${namaBulan(kontrak)}`,
    baris: isi, total: totalkan(isi),
  }];

  // Catatan kaki: tarif yang BENAR-BENAR dipakai menghitung klaim ini,
  // dibaca dari snapshot-nya — bukan tarif yang berlaku hari ini. Keduanya
  // dapat berbeda pada klaim lama, dan yang menjelaskan angka di atasnya
  // adalah tarif yang dipakai saat itu.
  const snap = klaim.snapshot ?? {};
  const persen = snap.rate ?? snap.percentage ?? null;
  const catatan: { teks: string; nilai: string | null }[] = [];
  const sebutan = SKEMA_DETAIL[klaim.claim_type] ?? "Skema";
  const memo = snap.scheme_memo ? ` (Memo ${snap.scheme_memo})` : "";
  // Satu baris, bukan dua: tarif yang dipakai berupa persentase ATAU nominal
  // tetap, tidak pernah keduanya, dan menuliskan dua-duanya membuat lembar
  // ini seolah menyebut dua tarif untuk satu pembayaran.
  if (persen != null) {
    catatan.push({ teks: `${sebutan}${memo}`, nilai: String(persen) });
  } else if (snap.flat_amount != null || snap.scheme_memo) {
    catatan.push({ teks: `${sebutan} — nominal tetap${memo}`, nilai: null });
  }

  return {
    nomor: klaim.claim_number,
    project: proyek,
    cluster: namaKluster(baris[0]?.cluster_code),
    // Periode penjualannya satu unit saja, jadi ia tanggal kontraknya sendiri
    // — kecuali bila formulirnya memang mengetikkan periodenya.
    periode_awal: tgl(klaim.sales_period_start) ?? kontrak,
    periode_akhir: tgl(klaim.sales_period_end) ?? kontrak,
    cut_off: tgl(baris[0].transfer_date)
             ?? new Date().toISOString().slice(0, 10),
    sales_manager: penerima
      ? { full_name: penerima.full_name, marketing_type: penerima.marketing_type }
      : null,
    bagian,
    catatan,
  };
}

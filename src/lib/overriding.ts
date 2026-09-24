/**
 * Rekap Overriding satu periode untuk satu Sales Manager.
 *
 * Overriding tidak punya formulir pengajuan per klaim. Dokumen aslinya —
 * "Detail Perhitungan Overiding" — adalah satu tabel yang memuat SELURUH unit
 * milik seorang Sales Manager sampai tanggal cut off, dipilah menjadi yang
 * sedang diajukan, yang sudah dibayar, yang tidak dibayarkan, dan yang batal.
 * Lembar per unit yang dipakai Closing Fee dan Cash Reward tidak pernah ada
 * pada Overriding: yang ditandatangani Dibuat/Diperiksa/Disetujui adalah
 * rekapnya, bukan lembar satuannya.
 *
 * Yang TIDAK dikerjakan di sini: mengarang kolom yang datanya tidak ada.
 * Beberapa kolom pada berkas acuannya — "Selisih Overiding" dan tanggal
 * transfer per unit sebelum uangnya keluar — memang belum punya sumber di
 * basis data. Kolomnya tetap dicetak, isinya dikosongkan. Diisi angka hasil
 * tebakan, ia akan terbaca sebagai perhitungan yang sudah dilakukan.
 */

import { one, query } from "./db";
import { ratio, stripVat } from "./money";

/**
 * DPP Nilai Lain: 11/12 dari nilai tanpa PPN.
 *
 * Dasar pengenaan pajak untuk penyerahan tertentu sejak 2025 — bukan
 * pembulatan, melainkan aturannya sendiri. Ditulis sebagai pecahan supaya
 * terlihat asalnya; 0,9166666 yang ditulis langsung tidak dapat ditelusuri
 * siapa pun.
 */
const DPP_NILAI_LAIN = 11 / 12;

export type BarisRekap = {
  no: number;
  sales_group: string | null;
  no_kontrak: string | null;
  tgl_kontrak: string | null;
  unit: string;
  nama_konsumen: string | null;
  marketing: string | null;
  kategori_marketing: string | null;
  luas_tanah: number | null;
  luas_bangunan: number | null;
  skema_cara_bayar: string | null;
  status_unit: string;
  tgl_batal: string | null;
  type: string | null;
  arah_hadap: string | null;
  nilai_incl: number;
  nilai_excl: number;
  dpp_nilai_lain: number;
  penerimaan: number;
  penerimaan_persen: string;
  persen_overriding: string | null;
  sign_ppjb: boolean;
  skema: string | null;
  amount: number;
  dpp: number;
  ppn: number;
  pph23: number;
  net: number;
  tgl_transfer: string | null;
  keterangan: string | null;
};

export type BagianRekap = {
  judul: string;
  baris: BarisRekap[];
  total: { amount: number; dpp: number; ppn: number; pph23: number; net: number };
};

export type Rekap = {
  nomor: string;
  project: { name: string; company_name: string | null } | null;
  cluster: string | null;
  periode_awal: string | null;
  periode_akhir: string | null;
  cut_off: string;
  sales_manager: { full_name: string; marketing_type: string | null } | null;
  bagian: BagianRekap[];
  catatan: { teks: string; nilai: string | null }[];
};

const tgl = (v: any): string | null =>
  !v ? null
     : v instanceof Date ? v.toISOString().slice(0, 10)
     : String(v).slice(0, 10);

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
               "Agustus", "September", "Oktober", "November", "Desember"];

/** "2025-07-22" menjadi "Juli 2025", untuk judul bagian per bulan. */
function namaBulan(t: string | null): string {
  if (!t) return "TANPA TANGGAL KONTRAK";
  const [th, bl] = t.split("-").map(Number);
  return `${BULAN[(bl ?? 1) - 1] ?? bl} ${th}`;
}

/** Status unit sebagaimana tertulis pada berkas acuannya. */
const STATUS_UNIT: Record<string, string> = {
  cancelled: "Batal", moved_to_other_unit: "Pindah Unit",
  management: "Management",
};

function barisDari(r: any, urut: number): BarisRekap {
  const incl = Number(r.contract_value_incl_vat ?? 0);
  // Tarif PPN mengikuti tanggal kontraknya, sebagaimana seluruh sistem ini:
  // penjualan sebelum 1 April 2022 memakai 10%.
  const t = tgl(r.contract_date);
  const tarif = t && t < "2022-04-01" ? "0.10" : "0.11";
  const excl = stripVat(incl, tarif);
  return {
    no: urut,
    // "Sales Group": agensi yang menaungi penjualannya, atau — pada penjualan
    // inhouse — Sales Manager-nya sendiri, persis seperti pada acuannya.
    sales_group: r.agency_name ?? r.coordinator_name ?? null,
    no_kontrak: r.contract_number ?? null,
    tgl_kontrak: t,
    unit: r.code,
    nama_konsumen: r.buyer_name ?? null,
    marketing: r.agency_name
      ? `${r.marketing_name ?? "—"} / ${r.agency_name}`
      : r.marketing_name ?? null,
    kategori_marketing: r.marketing_type === "agent" ? "Agent"
      : r.marketing_type ? "Inhouse" : null,
    luas_tanah: r.land_area ?? null,
    luas_bangunan: r.building_area ?? null,
    skema_cara_bayar: r.payment_scheme ?? null,
    status_unit: STATUS_UNIT[r.status] ?? "Terjual",
    tgl_batal: tgl(r.cancelled_at),
    type: r.unit_type ?? null,
    arah_hadap: r.orientation ?? null,
    nilai_incl: incl,
    nilai_excl: excl,
    dpp_nilai_lain: Math.round(excl * DPP_NILAI_LAIN),
    penerimaan: Number(r.received_amount ?? 0),
    penerimaan_persen: ratio(Number(r.received_amount ?? 0), incl),
    // Persen dan skemanya diambil dari snapshot klaimnya — itulah tarif yang
    // benar-benar dipakai menghitung, bukan tarif yang berlaku hari ini.
    persen_overriding: r.snapshot?.rate ?? r.snapshot?.percentage ?? null,
    sign_ppjb: Boolean(r.ppjb_signed),
    skema: r.snapshot?.scheme_type === "progressive" ? "Progresif"
      : r.claim_id ? "Reguler" : null,
    amount: Number(r.gross_amount ?? 0),
    dpp: Math.round(Number(r.gross_amount ?? 0) * DPP_NILAI_LAIN),
    ppn: Number(r.vat ?? 0),
    pph23: Number(r.withholding_tax ?? 0),
    net: Number(r.net_amount ?? 0),
    tgl_transfer: tgl(r.transfer_date),
    keterangan: r.remarks ?? null,
  };
}

/**
 * Sebutan tingkat overriding pada catatan kaki dokumen.
 *
 * Kodenya — sales_manager_inhouse, lead_agent — adalah nama kolom basis data,
 * bukan sebutan yang dipakai kantor. Tercetak apa adanya, catatan kakinya
 * terbaca seperti potongan kode yang tersasar ke dokumen resmi.
 */
const NAMA_TINGKAT: Record<string, string> = {
  sales_manager_inhouse: "Sales Manager (reguler) Inhouse",
  kantor_agent: "Kantor Agent",
  lead_agent: "Lead Agent",
  coordinator_agent_1: "Koordinator Agent 1",
  coordinator_agent_2: "Koordinator Agent 2",
};

function totalkan(baris: BarisRekap[]) {
  return baris.reduce((t, b) => ({
    amount: t.amount + b.amount, dpp: t.dpp + b.dpp, ppn: t.ppn + b.ppn,
    pph23: t.pph23 + b.pph23, net: t.net + b.net,
  }), { amount: 0, dpp: 0, ppn: 0, pph23: 0, net: 0 });
}

/**
 * Status klaim yang dianggap sudah dibayar, dan yang tidak jadi dibayarkan.
 *
 * Dipisah sebagai daftar agar kedua bagian pada dokumen memakai batas yang
 * sama dengan yang dipakai layar mana pun — bukan tafsiran tersendiri yang
 * cepat atau lambat berbeda.
 */
const SUDAH_DIBAYAR = ["paid", "completed"];
const TIDAK_DIBAYAR = ["rejected", "cancelled", "clawback"];

/**
 * Susun rekap Overriding untuk penerima sebuah klaim.
 *
 * Yang menentukan isinya adalah penerimanya, bukan klaim yang kebetulan
 * dibuka: dokumen ini memang dokumen seorang Sales Manager, dan klaim itu
 * hanya salah satu barisnya.
 */
export async function rekapOverriding(claimId: string): Promise<Rekap | null> {
  const klaim = await one<any>(
    "SELECT * FROM claims WHERE id=$1 AND claim_type='overriding'", [claimId]);
  if (!klaim) return null;

  const penerima = await one<any>(
    "SELECT id, full_name, marketing_type FROM marketings WHERE id=$1",
    [klaim.marketing_id]);
  const proyek = klaim.project_id
    ? await one<any>("SELECT name, company_name FROM projects WHERE id=$1",
                     [klaim.project_id])
    : null;

  // Seluruh unit yang menjadikan orang ini tingkat di atasnya, beserta klaim
  // Overriding-nya bila ada. LEFT JOIN, bukan INNER: unit yang batal dan unit
  // yang belum diklaim tetap tercetak pada bagiannya masing-masing.
  const baris = await query<any>(
    `SELECT u.*, m.full_name AS marketing_name, m.marketing_type,
            a.name AS agency_name,
            ko.full_name AS coordinator_name,
            c.id AS claim_id, c.status AS claim_status, c.gross_amount, c.vat,
            c.withholding_tax, c.net_amount, c.snapshot,
            s.transfer_date
       FROM units u
       LEFT JOIN marketings m  ON m.id = u.marketing_id
       LEFT JOIN agencies    a ON a.id = m.agency_id
       LEFT JOIN marketings ko ON ko.id = COALESCE(u.sub_coordinator_id,
                                                   u.coordinator_id)
       LEFT JOIN LATERAL (
         SELECT * FROM claims c2
          WHERE c2.unit_id = u.id AND c2.claim_type = 'overriding'
          ORDER BY c2.created_at DESC LIMIT 1
       ) c ON TRUE
       LEFT JOIN LATERAL (
         SELECT st.transfer_date
           FROM settlements st
           JOIN settlement_lines sl ON sl.settlement_id = st.id
           JOIN payment_instructions pi ON pi.id = sl.instruction_id
          WHERE pi.claim_id = c.id
          ORDER BY st.transfer_date DESC LIMIT 1
       ) s ON TRUE
      WHERE COALESCE(u.sub_coordinator_id, u.coordinator_id) = $1
        AND ($2::uuid IS NULL OR u.project_id = $2)
      ORDER BY u.contract_date, u.code`,
    [klaim.marketing_id, klaim.project_id ?? null]);

  const batal = baris.filter((r) =>
    ["cancelled", "moved_to_other_unit"].includes(r.status));
  const hidup = baris.filter((r) => !batal.includes(r));
  const dibayar = hidup.filter((r) => SUDAH_DIBAYAR.includes(r.claim_status));
  const ditolak = hidup.filter((r) => TIDAK_DIBAYAR.includes(r.claim_status));
  const berjalan = hidup.filter((r) =>
    !dibayar.includes(r) && !ditolak.includes(r));

  // Yang sedang diajukan dipilah per bulan kontraknya, sebagaimana acuannya
  // menuliskan "PERIODE Juli 2025", "PERIODE Agustus 2025".
  const perBulan = new Map<string, any[]>();
  for (const r of berjalan) {
    const kunci = tgl(r.contract_date)?.slice(0, 7) ?? "";
    if (!perBulan.has(kunci)) perBulan.set(kunci, []);
    perBulan.get(kunci)!.push(r);
  }

  const bagian: BagianRekap[] = [];
  for (const [kunci, isi] of [...perBulan.entries()].sort()) {
    const b = isi.map((r, i) => barisDari(r, i + 1));
    bagian.push({
      judul: `PERIODE ${namaBulan(kunci ? `${kunci}-01` : null)}`,
      baris: b, total: totalkan(b),
    });
  }
  for (const [judul, isi] of [
    ["OVERIDING (Sudah Dibayar)", dibayar],
    ["OVERIDING (Yang Tidak Dibayarkan)", ditolak],
    ["BATAL", batal],
  ] as [string, any[]][]) {
    if (!isi.length) continue;
    const b = isi.map((r, i) => barisDari(r, i + 1));
    bagian.push({ judul, baris: b, total: totalkan(b) });
  }

  const tglBerjalan = berjalan.map((r) => tgl(r.contract_date))
    .filter(Boolean).sort() as string[];

  // Catatan kaki: tarif yang berlaku, dibaca dari memo skema yang benar-benar
  // dipakai — bukan angka yang ditulis tetap di dalam kode.
  // Memo project ini, DAN memo yang berlaku menyeluruh: sebagian skema memang
  // tidak diikat ke satu project, dan menyaringnya habis membuat catatan kaki
  // dokumen ini kosong padahal tarifnya ada.
  //
  // Hanya yang masih berlaku pada tanggal cut off. Tarif yang sudah dicabut
  // tetap tersimpan — klaim lama dihitung dengannya — tetapi mencetaknya di
  // kaki dokumen hari ini berarti menyatakan ia masih berlaku.
  const skema = await query<any>(
    `SELECT recipient_role, overriding_level, percentage, memo_reference
       FROM incentive_schemes
      WHERE claim_type='overriding'
        AND (project_id IS NULL OR $1::uuid IS NULL OR project_id = $1)
        AND effective_from <= CURRENT_DATE
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY effective_from DESC, percentage DESC`,
    [klaim.project_id ?? null]);
  const catatan = skema.map((s) => ({
    teks: `Overiding ${NAMA_TINGKAT[s.overriding_level] ?? s.overriding_level
           ?? s.recipient_role ?? "semua tingkat"}` +
          (s.memo_reference ? ` (Memo ${s.memo_reference})` : ""),
    nilai: s.percentage != null ? String(s.percentage) : null,
  }));

  return {
    nomor: klaim.claim_number,
    project: proyek,
    cluster: baris[0]?.cluster_code ?? null,
    periode_awal: tglBerjalan[0] ?? null,
    periode_akhir: tglBerjalan[tglBerjalan.length - 1] ?? null,
    cut_off: new Date().toISOString().slice(0, 10),
    sales_manager: penerima
      ? { full_name: penerima.full_name, marketing_type: penerima.marketing_type }
      : null,
    bagian,
    catatan,
  };
}

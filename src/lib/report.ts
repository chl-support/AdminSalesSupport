/**
 * Penyusun Laporan Closing Fee, Reward & Komisi.
 *
 * Laporan ini adalah **view**, bukan tabel. Setiap sel diturunkan dari klaim yang
 * sudah ada, lalu disusun ulang menjadi satu baris per unit (PRD 7.B).
 *
 * Tidak ada fungsi tulis di modul ini, dan tidak boleh ada: laporan yang dapat
 * disunting langsung akan berbeda dari klaim yang mendasarinya, dan perbedaan itu
 * tidak ketahuan sampai ada yang merekonsiliasi manual.
 *
 * Baris TOTAL ditulis sebagai formula SUM, bukan konstanta. Penerima laporan akan
 * menyaring dan menyembunyikan baris; total berupa angka mati akan diam-diam salah.
 *
 * ── Susunan kolomnya ──────────────────────────────────────────────────────
 *
 * Bentuknya mengikuti berkas laporan yang dipakai di lapangan, sel demi sel:
 * 56 kolom (A sampai BD), kepala empat baris bertingkat, empat seksi, dan baris
 * TOTAL yang hanya menjumlah seksi terakhir. Yang ditiru bukan hanya urutan
 * kolomnya melainkan juga penggabungan selnya, lebar tiap kolom, rupa huruf,
 * dan bentuk tampilan angkanya — sebab laporan ini dibaca berdampingan dengan
 * berkas yang sudah beredar, dan kolom yang bergeser satu petak membuat
 * pembacanya membandingkan dua angka yang bukan pasangannya.
 *
 * Susunan ini menggantikan susunan sebelumnya yang 87 kolom: lima blok
 * Overiding menjadi dua, dua kolom Trip dihapus, PIC Proyek dan Keterangan
 * ditambahkan. Kolom yang hilang bukan kolom yang kosong — lihat catatan pada
 * OVERIDING di bawah.
 */

import ExcelJS from "exceljs";
import { query } from "./db";

const FONT = "Twentieth Century";

/** Akuntansi rupiah dengan lambang berkode wilayah, seperti pada berkasnya. */
const RP = '_-[$Rp-421]* #,##0_-;-[$Rp-421]* #,##0_-;_-[$Rp-421]* "-"_-;_-@';
/** Akuntansi rupiah dengan lambang biasa — dipakai pada kolom komisi. */
const RP2 = '_-"Rp"* #,##0_-;-"Rp"* #,##0_-;_-"Rp"* "-"_-;_-@';
const PCT = "0.00%";
/**
 * Bentuk tanggal yang dipakai seluruh kolom tanggal.
 *
 * Berkas acuannya sendiri campur — dari 173 sel yang benar-benar bertipe
 * tanggal, 119 memakai bentuk ini, 34 memakai dd"-"mmm"-"yy, dan 20 memakai
 * [$-C09]dd-mmm-yy; sebagiannya bahkan diketik sebagai teks, bukan tanggal.
 * Campuran itu tidak ditiru: yang ditiru bentuk yang paling banyak dipakainya,
 * dan dipakai seragam. Tanggal yang tersimpan sebagai teks tidak dapat diurut
 * maupun disaring, dan itu kelemahan berkasnya, bukan bagian dari susunannya.
 */
const TGL = "d-mmm-yy";
const LUAS = "#,##0.00";

const STATUS_LABEL: Record<string, string> = {
  belum_pengajuan: "Belum Pengajuan Komisi",
  sudah_dibayarkan: "Sudah Dibayarkan",
  proses_finance: "Proses Finance",
  management: "Management (No Closing Fee, Reward & Komisi)",
  batal_unit: "BATAL UNIT",
};

/**
 * Nomor kolom, memakai nama agar tidak ada angka telanjang di dalam kode.
 *
 * Angkanya adalah nomor kolom Excel: 1 = A, 56 = BD.
 */
const K = {
  no: 1, tglKontrak: 2, tglBatal: 3, konsumen: 4, unit: 5,
  tanah: 6, bangunan: 7, caraBayar: 8, nilaiKontrak: 9,
  inhouseFee: 10, inhouseTgl: 11,
  managerFee: 12, managerTgl: 13,
  marcommFee: 14, marcommTgl: 15,
  picFee: 16, picTgl: 17,
  bonus: 18, bonusTgl: 19,
  voucher: 20, hadiah: 21, hadiahTgl: 22,
  reward: 23, rewardTgl: 24,
  terimaRp: 25, terimaPct: 26,
  komisiPct: 27, komisiNominal: 28,
  ppn: 29, pph21: 30, pph23: 31, komisiBayar: 32,
  statusKomisi: 33, tglTransferKomisi: 34,
  agen: 35, subKoordinator: 36,
  gimmickTrip: 37, gimmickHadiah: 38, gimmickTgl: 39,
  orManager: 40,      // 40..46, tujuh kolom
  orKoordinator: 47,  // 47..55, sembilan kolom
  keterangan: 56,
} as const;

const KOLOM_TERAKHIR = K.keterangan;

/** Lebar tiap kolom, persis seperti pada berkas acuannya. */
const LEBAR: number[] = [
  4.7, 11.7, 11.7, 38.7, 10.7, 9.7, 9.7, 29.1, 22.7, 17.7, 19.7, 17.2, 19.7,
  19.7, 19.7, 19.7, 19.7, 18.7, 19.7, 15.7, 82.1, 19.1, 15.7, 24.1, 18.7, 7.7,
  7.7, 20.7, 15.7, 22.1, 26.4, 18.7, 39.7, 22.5, 52.7, 29.7, 8.7, 11.7, 17.7,
  7.7, 19.7, 16.7, 20.6, 13.7, 16.7, 10.7, 7.7, 24.7, 16.7, 16.7, 15.7, 13.7,
  16.7, 16.7, 15.7, 80.7,
];

/** Bentuk tampilan angka tiap kolom; yang tidak disebut ditulis apa adanya. */
const FORMAT: Record<number, string> = {
  [K.tglKontrak]: TGL, [K.tglBatal]: TGL,
  [K.tanah]: LUAS, [K.bangunan]: LUAS,
  [K.nilaiKontrak]: RP,
  [K.inhouseFee]: RP, [K.inhouseTgl]: TGL,
  [K.managerFee]: RP, [K.managerTgl]: TGL,
  [K.marcommFee]: RP, [K.marcommTgl]: TGL,
  [K.picFee]: RP, [K.picTgl]: TGL,
  [K.bonus]: RP, [K.bonusTgl]: TGL,
  [K.hadiahTgl]: TGL,
  [K.reward]: RP, [K.rewardTgl]: TGL,
  [K.terimaRp]: RP2, [K.terimaPct]: PCT,
  [K.komisiPct]: PCT, [K.komisiNominal]: RP2,
  [K.ppn]: RP2, [K.pph21]: RP2, [K.pph23]: RP2, [K.komisiBayar]: RP2,
  [K.tglTransferKomisi]: TGL,
  [K.gimmickTgl]: TGL,
  40: PCT, 42: RP2, 43: RP2, 44: RP2, 45: TGL, 46: TGL,
  47: PCT, 49: RP2, 50: RP2, 51: RP2, 52: RP2, 54: TGL, 55: TGL,
};

/**
 * Kepala tabel, empat baris bertingkat.
 *
 * Ditulis sebagai daftar penggabungan sel apa adanya — [teks, baris awal, kolom
 * awal, baris akhir, kolom akhir] — bukan diturunkan dari pengelompokan kolom.
 * Kepalanya tidak beraturan: sebagiannya membentang empat baris, sebagiannya
 * dua lalu bercabang, dan "Luas (m2)" membentang tiga baris di atas dua kolom.
 * Aturan yang dipaksakan menutupi yang tidak ikut aturan, dan yang tertutup
 * itulah yang bergeser diam-diam.
 */
const KEPALA: [string, number, number, number, number][] = [
  ["No.", 5, 1, 8, 1],
  ["Tanggal", 5, 2, 6, 3], ["Kontrak", 7, 2, 8, 2], ["Batal", 7, 3, 8, 3],
  ["Konsumen", 5, 4, 8, 4],
  ["Unit", 5, 5, 8, 5],
  ["Luas (m2)", 5, 6, 7, 7], ["Tanah", 8, 6, 8, 6], ["Bangunan", 8, 7, 8, 7],
  ["Cara Bayar", 5, 8, 8, 8],
  ["Nilai Kontrak (Incl. VAT)", 5, 9, 8, 9],
  ["Sales Inhouse", 5, 10, 6, 11],
  ["Closing Fee (Rp.)", 7, 10, 8, 10], ["Tanggal Transfer", 7, 11, 8, 11],
  ["Sales Manager (Inhouse)", 5, 12, 6, 13],
  ["Closing Fee (Rp.)", 7, 12, 8, 12], ["Tanggal Transfer", 7, 13, 8, 13],
  ["Sales Marcomm", 5, 14, 6, 15],
  ["Closing Fee (Rp.)", 7, 14, 8, 14], ["Tanggal Transfer", 7, 15, 8, 15],
  ["PIC Proyek", 5, 16, 6, 17],
  ["Closing Fee (Rp.)", 7, 16, 8, 16], ["Tanggal Transfer", 7, 17, 8, 17],
  ["Bonus Penjualan", 5, 18, 6, 19],
  ["Bonus", 7, 18, 8, 18], ["Tanggal Transfer", 7, 19, 8, 19],
  ["Konsumen", 5, 20, 6, 22],
  ["Hadiah Promosi Konsumen", 7, 20, 7, 21],
  ["Voucher", 8, 20, 8, 20], ["Hadiah", 8, 21, 8, 21],
  ["Tanggal Realisasi", 7, 22, 8, 22],
  ["Reward (Rp.)", 5, 23, 8, 23],
  ["Tanggal Transfer Reward", 5, 24, 8, 24],
  ["Penerimaan", 5, 25, 6, 26], ["(Rp.)", 7, 25, 8, 25], ["%", 7, 26, 8, 26],
  ["Komisi Agent/InHouse/Member", 5, 27, 6, 28],
  ["%", 7, 27, 8, 27], ["Nominal", 7, 28, 8, 28],
  ["PPn", 5, 29, 8, 29],
  ["PPh 21 (NPWP Pribadi)", 5, 30, 8, 30],
  ["PPh 23 (NPWP Perusahaan)", 5, 31, 8, 31],
  ["Komisi Dibayarkan", 5, 32, 8, 32],
  ["Status Pembayaran Komisi Agent/InHouse", 5, 33, 8, 33],
  ["Tanggal Transfer Komisi", 5, 34, 8, 34],
  ["Agent/Sales InHouse", 5, 35, 8, 35],
  ["Sub Koordinator", 5, 36, 8, 36],
  ["Gimmick Agent/Sales InHouse", 5, 37, 7, 38],
  ["Trip", 8, 37, 8, 37], ["Hadiah", 8, 38, 8, 38],
  ["Tanggal Realisasi Hadiah Promosi Agent/Sales InHouse", 5, 39, 8, 39],

  ["OVERIDING Sales Manager (InHouse)", 5, 40, 5, 46],
  ["Status Pembayaran", 6, 40, 6, 46],
  ["%", 7, 40, 8, 40], ["Remarks", 7, 41, 8, 41],
  ["Nominal Unit (Rp.)", 7, 42, 8, 42],
  ["PPh 21 (NPWP Pribadi)", 7, 43, 8, 43], ["Net", 7, 44, 8, 44],
  ["Tanggal", 7, 45, 7, 46], ["Proses", 8, 45, 8, 45], ["Transfer", 8, 46, 8, 46],

  ["OVERIDING Coordinator Agent", 5, 47, 5, 55],
  ["Status Pembayaran", 6, 47, 6, 55],
  ["%", 7, 47, 8, 47], ["Remarks", 7, 48, 8, 48],
  ["Nominal Unit (Rp.)", 7, 49, 8, 49],
  ["PPn", 7, 50, 8, 50], ["PPh 23", 7, 51, 8, 51], ["Net", 7, 52, 8, 52],
  ["Tahap", 7, 53, 8, 53],
  ["Tanggal", 7, 54, 7, 55], ["Proses", 8, 54, 8, 54], ["Transfer", 8, 55, 8, 55],

  ["Keterangan", 5, 56, 8, 56],
];

/**
 * Kolom yang dijumlahkan pada baris TOTAL.
 *
 * Hanya kolom uang yang memang dijumlahkan pada berkas acuannya. Bonus, Reward,
 * dan seluruh blok Overiding Coordinator Agent sengaja tidak ikut — berkasnya
 * pun tidak menjumlahkannya, dan menambahkan total yang tidak ada di sana akan
 * membuat dua laporan yang seharusnya sama berbeda pada baris paling bawah.
 */
const KOLOM_TOTAL = [
  K.nilaiKontrak, K.inhouseFee, K.managerFee, K.marcommFee, K.picFee,
  K.terimaRp, K.komisiNominal, K.ppn, K.pph21, K.pph23, K.komisiBayar,
  42, 43, 44,
];

const CLOSING_FEE_COLS: Record<string, [number, number]> = {
  sales_inhouse: [K.inhouseFee, K.inhouseTgl],
  sales_manager_inhouse: [K.managerFee, K.managerTgl],
  sales_markom: [K.marcommFee, K.marcommTgl],
  markom: [K.marcommFee, K.marcommTgl],
};

/**
 * Blok Overiding beserta urutan kolomnya.
 *
 * Bentuk laporan ini hanya menyediakan dua blok, sedangkan basis data mengenal
 * lima tingkat overriding. Tingkat yang tidak punya blok di sini —
 * kantor_agent, lead_agent, dan coordinator_agent_2 — tidak dipaksakan masuk ke
 * blok milik tingkat lain: angkanya akan tertimpa atau terbaca sebagai milik
 * orang yang salah. Barisnya tetap ada di basis data dan tetap terlihat pada
 * layar Overriding; yang tidak memuatnya adalah laporan ini.
 */
const OVERRIDING_COLS: Record<string, [number, string[]]> = {
  sales_manager_inhouse: [K.orManager,
    ["pct", "remarks", "amount", "wht", "net", "process", "transfer"]],
  coordinator_agent_1: [K.orKoordinator,
    ["pct", "remarks", "amount", "vat", "wht", "net", "stage", "process",
     "transfer"]],
};

const STATUS_TEXT: Record<string, string> = {
  draft: "Blm Pengajuan", pending_admin_review: "Review Admin Sales",
  pending_tax_verification: "Verifikasi Pajak", tax_verified: "Siap Tanda Tangan",
  awaiting_signature: "Menunggu TTD Agent", signature_review_required: "Tinjauan TTD",
  crosscheck_in_progress: "Crosscheck", ready_to_print: "Siap Cetak",
  printed: "Beredar Fisik", circulating_head_finance: "Di Head Finance",
  circulating_management: "Di Management", awaiting_scan_upload: "Menunggu Pindaian",
  approved: "Disetujui", awaiting_settlement_date: "Menunggu Tgl Transfer",
  partially_paid: "Dibayar Sebagian", paid: "Sudah Dibayarkan",
  completed: "Selesai", rejected: "Ditolak",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "belum_pengajuan", submitted: "belum_pengajuan",
  pending_admin_review: "belum_pengajuan",
  pending_tax_verification: "proses_finance", tax_verified: "proses_finance",
  signature_link_sent: "proses_finance", awaiting_signature: "proses_finance",
  signature_review_required: "proses_finance", signed: "proses_finance",
  crosscheck_in_progress: "proses_finance", ready_to_print: "proses_finance",
  printed: "proses_finance", circulating_head_finance: "proses_finance",
  circulating_management: "proses_finance", awaiting_scan_upload: "proses_finance",
  approved: "proses_finance", awaiting_settlement_date: "proses_finance",
  partially_paid: "proses_finance", paid: "sudah_dibayarkan",
  completed: "sudah_dibayarkan",
};

const SECTION_ORDER = [
  "BATAL UNIT",
  "(Pindah Unit ke Unit lain)",
  "MANAGEMENT (NO CLOSING FEE, REWARD & KOMISI)",
  "CLOSING FEE, REWARD & KOMISI",
];

type ReportRow = { status: string; cells: Record<number, unknown> };
type Section = { label: string; rows: ReportRow[] };

const asDate = (v: unknown) => (v ? new Date(v as string) : null);
const asPct = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export type Saringan = {
  projectId?: string | null; clusterCode?: string | null;
  contractFrom?: string | null; contractTo?: string | null;
};

export async function collect(filters: Saringan = {}): Promise<Section[]> {
  const conds: string[] = ["1=1"];
  const args: any[] = [];
  if (filters.projectId) { args.push(filters.projectId); conds.push(`project_id=$${args.length}`); }
  if (filters.clusterCode) { args.push(filters.clusterCode); conds.push(`cluster_code=$${args.length}`); }
  if (filters.contractFrom) { args.push(filters.contractFrom); conds.push(`contract_date >= $${args.length}::date`); }
  if (filters.contractTo) { args.push(filters.contractTo); conds.push(`contract_date <= $${args.length}::date`); }

  const units = await query(
    `SELECT * FROM units WHERE ${conds.join(" AND ")} ORDER BY cluster_code, code`,
    args);

  const sections: Record<string, ReportRow[]> =
    Object.fromEntries(SECTION_ORDER.map((s) => [s, []]));

  for (const u of units) {
    const cells: Record<number, unknown> = {
      [K.tglKontrak]: asDate(u.contract_date), [K.tglBatal]: asDate(u.cancelled_at),
      [K.konsumen]: u.buyer_name, [K.unit]: u.code,
      [K.tanah]: u.land_area, [K.bangunan]: u.building_area,
      [K.caraBayar]: u.payment_scheme,
      [K.nilaiKontrak]: u.contract_value_incl_vat,
      [K.terimaRp]: u.received_amount,
      [K.terimaPct]: u.contract_value_incl_vat
        ? u.received_amount / u.contract_value_incl_vat : null,
      [K.keterangan]: u.remarks,
    };

    const claims = await query(
      `SELECT * FROM claims WHERE unit_id=$1 AND status NOT IN ('rejected','cancelled')`,
      [u.id]);

    let colour: string | null = null;
    // Berkas acuannya hanya menyediakan satu kolom Reward, sedangkan klaim
    // Cash Reward dicatat per peran penerima. Yang dituliskan jumlahnya, dan
    // tanggal transfer terakhir di antaranya — memilih salah satu peran saja
    // akan menghilangkan reward peran yang lain tanpa jejak.
    let reward = 0;
    let rewardTgl: Date | null = null;

    for (const c of claims) {
      const settle = await query(
        `SELECT s.transfer_date FROM settlement_lines sl
         JOIN settlements s ON s.id = sl.settlement_id
         JOIN payment_instructions pi ON pi.id = sl.instruction_id
         WHERE pi.claim_id=$1 ORDER BY s.transfer_date LIMIT 1`, [c.id]);
      const tdate = settle[0] ? asDate(settle[0].transfer_date) : null;

      if (c.claim_type === "closing_fee") {
        const pair = CLOSING_FEE_COLS[c.recipient_role];
        if (pair) { cells[pair[0]] = c.net_amount; cells[pair[1]] = tdate; }
      } else if (c.claim_type === "cash_reward") {
        reward += Number(c.net_amount ?? 0);
        if (tdate && (!rewardTgl || tdate > rewardTgl)) rewardTgl = tdate;
      } else if (c.claim_type === "commission") {
        const mkt = await query(
          `SELECT m.full_name, a.name AS agency FROM marketings m
           LEFT JOIN agencies a ON a.id = m.agency_id WHERE m.id=$1`,
          [c.marketing_id]);
        Object.assign(cells, {
          [K.komisiPct]: asPct(c.snapshot?.percentage),
          [K.komisiNominal]: c.gross_amount, [K.ppn]: c.vat,
          [K.pph21]: c.withholding_tax_type !== "pph23" ? c.withholding_tax : 0,
          [K.pph23]: c.withholding_tax_type === "pph23" ? c.withholding_tax : 0,
          [K.komisiBayar]: c.net_amount,
          [K.statusKomisi]: STATUS_TEXT[c.status] ?? c.status,
          [K.tglTransferKomisi]: tdate,
          [K.agen]: mkt[0]?.full_name ?? null,
          [K.subKoordinator]: mkt[0]?.agency ?? null,
        });
      }
      if (!colour || STATUS_COLOR[c.status] === "proses_finance") {
        colour = STATUS_COLOR[c.status] ?? "belum_pengajuan";
      }
    }
    if (reward) { cells[K.reward] = reward; cells[K.rewardTgl] = rewardTgl; }

    const orRows = await query(
      `SELECT r.*, b.level FROM overriding_rows r
       JOIN overriding_batches b ON b.id = r.batch_id WHERE r.unit_id=$1`, [u.id]);
    for (const r of orRows) {
      const spec = OVERRIDING_COLS[r.level];
      if (!spec) continue;
      const [start, layout] = spec;
      const values: Record<string, unknown> = {
        pct: asPct(r.percentage), remarks: r.remarks, amount: r.amount,
        vat: r.vat, wht: r.withholding_tax, net: r.net_amount, stage: r.stage,
        process: asDate(r.process_date), transfer: asDate(r.transfer_date),
      };
      layout.forEach((key, i) => {
        const v = values[key];
        if (v !== null && v !== undefined) cells[start + i] = v;
      });
    }

    // Kolom laporan yang belum punya form sumber (PRD 7.B.3).
    const nonCash = await query(
      "SELECT * FROM non_cash_incentives WHERE unit_id=$1", [u.id]);
    for (const n of nonCash) {
      if (n.kind === "bonus_penjualan") {
        cells[K.bonus] = n.value; cells[K.bonusTgl] = asDate(n.realization_date);
      } else if (n.kind === "trip") {
        cells[K.gimmickTrip] = n.label;
        cells[K.gimmickTgl] = asDate(n.realization_date);
      } else if (n.kind === "voucher") {
        cells[K.voucher] = n.label; cells[K.hadiahTgl] = asDate(n.realization_date);
      } else if (n.kind === "hadiah") {
        const agentSide = n.beneficiary !== "konsumen";
        cells[agentSide ? K.gimmickHadiah : K.hadiah] = n.label;
        cells[agentSide ? K.gimmickTgl : K.hadiahTgl] = asDate(n.realization_date);
      }
    }

    let section: string;
    if (u.status === "cancelled") { section = SECTION_ORDER[0]; colour = "batal_unit"; }
    else if (u.status === "moved_to_other_unit") {
      section = SECTION_ORDER[1]; colour = "batal_unit";
    } else if (u.status === "management") {
      section = SECTION_ORDER[2]; colour = "management";
    } else {
      section = SECTION_ORDER[3]; colour = colour ?? "belum_pengajuan";
    }
    sections[section].push({ status: colour, cells });
  }

  return SECTION_ORDER.map((label) => ({ label, rows: sections[label] }));
}

export async function buildWorkbook(
  sections: Section[], namaProject = "—",
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistem Klaim Insentif";
  const ws = wb.addWorksheet("Closing Fee, Reward & Komisi", {
    views: [{ showGridLines: false, state: "frozen", xSplit: 5, ySplit: 8,
              zoomScale: 72 }],
  });

  for (let c = 1; c <= KOLOM_TERAKHIR; c++) ws.getColumn(c).width = LEBAR[c - 1];

  const asOf = new Date();
  const judul = (baris: number, teks: string, ukuran: number, nama = FONT) => {
    const sel = ws.getCell(baris, K.konsumen);
    sel.value = teks;
    sel.font = { name: nama, size: ukuran, bold: true };
  };
  judul(1, namaProject.toUpperCase(), 16);
  judul(2, "CLOSING FEE, REWARD & KOMISI", 16);
  judul(3, `As of ${asOf.toLocaleDateString("id-ID",
    { day: "2-digit", month: "long", year: "numeric" })}`, 10, "Arial");

  const garis: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FF808080" } },
    left: { style: "thin", color: { argb: "FF808080" } },
    bottom: { style: "thin", color: { argb: "FF808080" } },
    right: { style: "thin", color: { argb: "FF808080" } },
  };
  const isi = (argb: string): ExcelJS.Fill =>
    ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  // Kepala tabel. Seluruh petaknya diberi latar dan garis lebih dulu, termasuk
  // petak yang nanti tertutup penggabungan: sel yang digabung mewarisi rupa sel
  // kirinya saja, sehingga petak yang dilewati akan tampak bolong pada cetakan.
  for (let r = 5; r <= 8; r++) {
    ws.getRow(r).height = 14.25;
    for (let c = 1; c <= KOLOM_TERAKHIR; c++) {
      const sel = ws.getCell(r, c);
      sel.fill = isi("FFBFBFBF");
      sel.border = garis;
      sel.font = { name: FONT, size: 11, bold: true };
      sel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
  }
  for (const [teks, r1, c1, r2, c2] of KEPALA) {
    ws.getCell(r1, c1).value = teks;
    if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  }
  // "Luas (m2)" ditulis dengan angka dua superskrip pada berkas acuannya —
  // satuan meter persegi, bukan huruf m diikuti angka 2. Ditulis datar, ia
  // terbaca sebagai nama kolom yang berbeda.
  {
    const rupa = { bold: true, size: 11, name: FONT };
    ws.getCell(5, K.tanah).value = { richText: [
      { text: "Luas (m" },
      { font: { ...rupa, vertAlign: "superscript" }, text: "2" },
      { font: rupa, text: ")" },
    ] } as any;
  }

  let baris = 9;
  let rentangAkhir: [number, number] | null = null;

  for (const seksi of sections) {
    const sel = ws.getCell(baris, 1);
    sel.value = seksi.label;
    for (let c = 1; c <= KOLOM_TERAKHIR; c++) {
      const s = ws.getCell(baris, c);
      s.fill = isi("FFD8D8D8");
      s.font = { name: FONT, size: 10, bold: true };
      s.border = garis;
    }
    ws.mergeCells(baris, 1, baris, KOLOM_TERAKHIR);
    baris++;

    const awal = baris;
    seksi.rows.forEach((rec, n) => {
      ws.getCell(baris, K.no).value = n + 1;
      for (const [kolomStr, nilai] of Object.entries(rec.cells)) {
        const kolom = Number(kolomStr);
        if (nilai === null || nilai === undefined) continue;
        ws.getCell(baris, kolom).value = nilai as any;
      }
      for (let c = 1; c <= KOLOM_TERAKHIR; c++) {
        const s = ws.getCell(baris, c);
        s.font = { name: FONT, size: 10 };
        s.border = garis;
        const fmt = FORMAT[c];
        if (fmt) s.numFmt = fmt;
      }
      baris++;
    });
    if (seksi.rows.length) rentangAkhir = [awal, baris - 1];
  }

  // Baris TOTAL: formula, bukan konstanta (FR-9.11). Yang dijumlah hanya seksi
  // terakhir — seperti pada berkas acuannya, sebab unit yang batal, pindah,
  // maupun milik management memang bukan uang yang keluar.
  ws.getCell(baris, 1).value = "TOTAL";
  for (let c = 1; c <= KOLOM_TERAKHIR; c++) {
    const s = ws.getCell(baris, c);
    s.fill = isi("FFBFBFBF");
    s.font = { name: FONT, size: 10, bold: true };
    s.border = garis;
  }
  ws.mergeCells(baris, 1, baris, K.konsumen);
  if (rentangAkhir) {
    for (const kolom of KOLOM_TOTAL) {
      const huruf = ws.getColumn(kolom).letter;
      const s = ws.getCell(baris, kolom);
      s.value = {
        formula: `SUM(${huruf}${rentangAkhir[0]}:${huruf}${rentangAkhir[1]})`,
      } as any;
      s.numFmt = FORMAT[kolom] ?? RP;
      s.font = { name: FONT, size: 10, bold: true };
    }
  }

  return wb;
}

export async function exportBuffer(
  filters: Saringan = {}, namaProject = "—",
): Promise<Buffer> {
  const wb = await buildWorkbook(await collect(filters), namaProject);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function preview(filters: Saringan = {}) {
  const sections = await collect(filters);
  return {
    as_of: new Date().toISOString().slice(0, 10),
    sections: sections.map((s) => ({ label: s.label, row_count: s.rows.length })),
    status_label: STATUS_LABEL,
    note: "Laporan ini adalah view atas data klaim. Tidak ada endpoint untuk " +
          "menulis ke laporan — perubahan selalu dilakukan pada klaimnya.",
  };
}

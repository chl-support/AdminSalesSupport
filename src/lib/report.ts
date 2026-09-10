/**
 * Penyusun Laporan Master.
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
 */

import ExcelJS from "exceljs";
import { query } from "./db";

const FONT = "Arial";
const CUR = "#,##0;(#,##0);-";
const PCT = "0.00%;(0.00%);-";
const DATE_FMT = "dd-mmm-yy";

const STATUS_FILL: Record<string, string> = {
  belum_pengajuan: "FF00B0F0",
  sudah_dibayarkan: "FFFFFF00",
  proses_finance: "FF00B050",
  management: "FF7030A0",
  batal_unit: "FFFF0000",
};
const STATUS_LABEL: Record<string, string> = {
  belum_pengajuan: "Belum Pengajuan Komisi",
  sudah_dibayarkan: "Sudah Dibayarkan",
  proses_finance: "Proses Finance",
  management: "Management (No Closing Fee & Commission)",
  batal_unit: "BATAL UNIT",
};

type Col = [col: number, t1: string | null, t2: string, width: number,
            fmt: string | null];

const COLS: Col[] = [
  [4, null, "Grup", 5, null],
  [5, null, "No.", 5, null],
  [6, "Tanggal", "Kontrak", 11, DATE_FMT],
  [7, "Tanggal", "Batal", 11, DATE_FMT],
  [8, null, "Konsumen", 26, null],
  [9, null, "Unit", 13, null],
  [10, "Luas (m2)", "Tanah", 8, null],
  [11, "Luas (m2)", "Bangunan", 9, null],
  [12, null, "Cara Bayar", 18, null],
  [13, null, "Nilai Kontrak (Incl. VAT)", 18, CUR],
  [14, "Sales Inhouse", "Closing Fee (Rp.)", 15, CUR],
  [15, "Sales Inhouse", "Tanggal Transfer", 15, DATE_FMT],
  [16, "Sales Manager (Inhouse)", "Closing Fee (Rp.)", 15, CUR],
  [17, "Sales Manager (Inhouse)", "Tanggal Transfer", 15, DATE_FMT],
  [18, "Sales Markom", "Closing Fee (Rp.)", 15, CUR],
  [19, "Sales Markom", "Tanggal Transfer", 15, DATE_FMT],
  [20, "Bonus Penjualan", "Bonus", 14, CUR],
  [21, "Bonus Penjualan", "Tanggal Transfer", 15, DATE_FMT],
  [22, "Trip Australia", "Nilai", 13, CUR],
  [23, "Trip Australia", "Tanggal Realisasi / Berangkat", 20, DATE_FMT],
  [24, "Trip New Zealand", "Nilai", 13, CUR],
  [25, "Trip New Zealand", "Tanggal Realisasi / Berangkat", 20, DATE_FMT],
  [26, "Gimmick Konsumen", "Voucher", 20, null],
  [27, "Gimmick Konsumen", "Hadiah", 24, null],
  [28, "Gimmick Konsumen", "Tanggal Realisasi", 15, DATE_FMT],
  [29, "Cash Reward — Sales Inhouse", "Cash Reward (Rp.)", 15, CUR],
  [30, "Cash Reward — Sales Inhouse", "Tanggal Transfer", 15, DATE_FMT],
  [31, "Cash Reward — Markom", "Cash Reward (Rp.)", 15, CUR],
  [32, "Cash Reward — Markom", "Tanggal Transfer", 15, DATE_FMT],
  [33, "Penerimaan", "(Rp.)", 16, CUR],
  [34, "Penerimaan", "%", 9, PCT],
  [35, "Komisi Agent/InHouse/Member", "%", 9, PCT],
  [36, "Komisi Agent/InHouse/Member", "Nominal", 16, CUR],
  [37, null, "PPn", 14, CUR],
  [38, null, "PPh 21 (NPWP Pribadi)", 16, CUR],
  [39, null, "PPh 23 (NPWP Perusahaan)", 17, CUR],
  [40, null, "Komisi Dibayarkan", 16, CUR],
  [41, null, "Status Pembayaran Komisi Agent", 24, null],
  [42, null, "Tanggal Transfer Komisi", 16, DATE_FMT],
  [43, null, "Agent/Sales InHouse", 26, null],
  [44, null, "Sub Koordinator", 24, null],
  [45, "Gimmick Agent/Sales InHouse", "Trip", 16, null],
  [46, "Gimmick Agent/Sales InHouse", "Hadiah", 20, null],
  [47, null, "Tanggal Realisasi Gimmick Agent", 18, DATE_FMT],
];

const OR_BLOCKS: [string, number, [string, number, string | null][]][] = [
  ["OVERIDING Sales Manager (InHouse)", 48, [
    ["%", 8, PCT], ["Remarks", 18, null], ["Amount Unit (Rp.)", 15, CUR],
    ["PPh 21 (NPWP Pribadi)", 14, CUR], ["Net", 15, CUR],
    ["Tanggal Proses", 13, DATE_FMT], ["Tanggal Transfer", 13, DATE_FMT]]],
  ["Overiding Kantor Agent", 55, [
    ["%", 8, PCT], ["Amount Unit (Rp.)", 15, CUR], ["Ppn", 13, CUR],
    ["PPh 23", 13, CUR], ["Net", 15, CUR],
    ["Tanggal Proses", 13, DATE_FMT], ["Tanggal Transfer", 13, DATE_FMT]]],
  ["Overiding Lead Agent", 62, [
    ["%", 8, PCT], ["Amount Unit (Rp.)", 15, CUR], ["Ppn", 13, CUR],
    ["PPh 23", 13, CUR], ["Net", 15, CUR],
    ["Tanggal Proses", 13, DATE_FMT], ["Tanggal Transfer", 13, DATE_FMT]]],
  ["OVERIDING Coordinator Agent I", 69, [
    ["%", 8, PCT], ["Remarks", 18, null], ["Amount Unit (Rp.)", 15, CUR],
    ["Ppn", 13, CUR], ["PPh 23", 13, CUR], ["Net", 15, CUR],
    ["Tahap", 9, null], ["Tanggal Proses", 13, DATE_FMT],
    ["Tanggal Transfer", 13, DATE_FMT]]],
  ["OVERIDING Coordinator Agent II", 78, [
    ["%", 8, PCT], ["Remarks", 18, null], ["Amount Unit (Rp.)", 15, CUR],
    ["Ppn", 13, CUR], ["PPh 23", 13, CUR], ["Net", 15, CUR],
    ["Tahap", 9, null], ["Tanggal Proses", 13, DATE_FMT],
    ["Tanggal Transfer", 13, DATE_FMT]]],
];

const LAST_COL = 87;
const SUM_COLS = [13, 14, 16, 18, 20, 22, 24, 29, 31, 33, 36, 37, 38, 39, 40,
  50, 51, 52, 56, 57, 58, 59, 63, 64, 65, 66, 71, 72, 73, 74, 80, 81, 82, 83];

const CLOSING_FEE_COLS: Record<string, [number, number]> = {
  sales_inhouse: [14, 15], sales_manager_inhouse: [16, 17], sales_markom: [18, 19],
};
const CASH_REWARD_COLS: Record<string, [number, number]> = {
  sales_inhouse: [29, 30], markom: [31, 32],
};
const OVERRIDING_COLS: Record<string, [number, string[]]> = {
  sales_manager_inhouse: [48, ["pct", "remarks", "amount", "wht", "net",
                               "process", "transfer"]],
  kantor_agent: [55, ["pct", "amount", "vat", "wht", "net", "process", "transfer"]],
  lead_agent: [62, ["pct", "amount", "vat", "wht", "net", "process", "transfer"]],
  coordinator_agent_1: [69, ["pct", "remarks", "amount", "vat", "wht", "net",
                             "stage", "process", "transfer"]],
  coordinator_agent_2: [78, ["pct", "remarks", "amount", "vat", "wht", "net",
                             "stage", "process", "transfer"]],
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

const SECTION_ORDER = [
  "BATAL UNIT",
  "(Pindah Unit ke Unit lain)",
  "MANAGEMENT (NO CLOSING FEE, REWARD & COMMISSION)",
  "CLOSING FEE, REWARD & COMMISSION",
];

type ReportRow = { status: string; cells: Record<number, unknown> };
type Section = { label: string; rows: ReportRow[] };

const asDate = (v: unknown) => (v ? new Date(v as string) : null);
const asPct = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function collect(filters: {
  clusterCode?: string | null; contractFrom?: string | null;
  contractTo?: string | null;
} = {}): Promise<Section[]> {
  const conds: string[] = ["1=1"];
  const args: any[] = [];
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
      6: asDate(u.contract_date), 7: asDate(u.cancelled_at),
      8: u.buyer_name, 9: u.code, 10: u.land_area, 11: u.building_area,
      12: u.payment_scheme, 13: u.contract_value_incl_vat,
      33: u.received_amount,
      34: u.contract_value_incl_vat
        ? u.received_amount / u.contract_value_incl_vat : null,
      87: u.remarks,
    };

    const claims = await query(
      `SELECT * FROM claims WHERE unit_id=$1 AND status NOT IN ('rejected','cancelled')`,
      [u.id]);

    let colour: string | null = null;
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
        const pair = CASH_REWARD_COLS[c.recipient_role];
        if (pair) { cells[pair[0]] = c.net_amount; cells[pair[1]] = tdate; }
      } else if (c.claim_type === "commission") {
        const mkt = await query(
          `SELECT m.full_name, a.name AS agency FROM marketings m
           LEFT JOIN agencies a ON a.id = m.agency_id WHERE m.id=$1`,
          [c.marketing_id]);
        Object.assign(cells, {
          35: asPct(c.snapshot?.percentage), 36: c.gross_amount, 37: c.vat,
          38: c.withholding_tax_type !== "pph23" ? c.withholding_tax : 0,
          39: c.withholding_tax_type === "pph23" ? c.withholding_tax : 0,
          40: c.net_amount, 41: STATUS_TEXT[c.status] ?? c.status, 42: tdate,
          43: mkt[0]?.full_name ?? null, 44: mkt[0]?.agency ?? null,
        });
      }
      if (!colour || STATUS_COLOR[c.status] === "proses_finance") {
        colour = STATUS_COLOR[c.status] ?? "belum_pengajuan";
      }
    }

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
      const label = (n.label ?? "").toLowerCase();
      if (n.kind === "bonus_penjualan") {
        cells[20] = n.value; cells[21] = asDate(n.realization_date);
      } else if (n.kind === "trip" && label.includes("australia")) {
        cells[22] = n.value; cells[23] = asDate(n.realization_date);
      } else if (n.kind === "trip" && label.includes("zealand")) {
        cells[24] = n.value; cells[25] = asDate(n.realization_date);
      } else if (n.kind === "trip") {
        cells[45] = n.label; cells[47] = asDate(n.realization_date);
      } else if (n.kind === "voucher") {
        cells[26] = n.label; cells[28] = asDate(n.realization_date);
      } else if (n.kind === "hadiah") {
        const agentSide = n.beneficiary !== "konsumen";
        cells[agentSide ? 46 : 27] = n.label;
        cells[agentSide ? 47 : 28] = asDate(n.realization_date);
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

function formatFor(col: number): string | null {
  const c = COLS.find((x) => x[0] === col);
  if (c) return c[4];
  for (const [, start, subs] of OR_BLOCKS) {
    const idx = col - start;
    if (idx >= 0 && idx < subs.length) return subs[idx][2];
  }
  return null;
}

export async function buildWorkbook(sections: Section[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistem Klaim Insentif — BIO District";
  const ws = wb.addWorksheet("Closing Fee, Reward & Komisi", {
    views: [{ showGridLines: false, state: "frozen", xSplit: 9, ySplit: 11 }],
  });

  const asOf = new Date();
  ws.getCell(3, 7).value = "BIO DISTRICT";
  ws.getCell(3, 7).font = { name: FONT, size: 14, bold: true };
  ws.getCell(4, 7).value = "CLOSING FEE, REWARD & KOMISI";
  ws.getCell(4, 7).font = { name: FONT, size: 13, bold: true };
  ws.getCell(5, 7).value = `As of ${asOf.toLocaleDateString("id-ID",
    { day: "numeric", month: "long", year: "numeric" })}`;
  ws.getCell(5, 7).font = { name: FONT, size: 11, italic: true };

  const hdrFont: Partial<ExcelJS.Font> = { name: FONT, size: 8, bold: true };
  const centre: Partial<ExcelJS.Alignment> =
    { horizontal: "center", vertical: "middle", wrapText: true };
  const hdrFill: ExcelJS.Fill =
    { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  const box: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FF808080" } },
    left: { style: "thin", color: { argb: "FF808080" } },
    bottom: { style: "thin", color: { argb: "FF808080" } },
    right: { style: "thin", color: { argb: "FF808080" } },
  };

  const put = (row: number, col: number, text: string) => {
    const cell = ws.getCell(row, col);
    cell.value = text;
    cell.font = hdrFont; cell.alignment = centre; cell.fill = hdrFill;
    cell.border = box;
    return cell;
  };

  let i = 0;
  while (i < COLS.length) {
    const [col, t1, t2, width] = COLS[i];
    ws.getColumn(col).width = width;
    if (t1 === null) {
      put(8, col, t2);
      ws.mergeCells(8, col, 11, col);
      i++;
      continue;
    }
    let j = i;
    while (j < COLS.length && COLS[j][1] === t1) j++;
    const span = COLS.slice(i, j);
    put(8, col, t1);
    ws.mergeCells(8, col, 9, span[span.length - 1][0]);
    for (const [c2, , sub, w] of span) {
      ws.getColumn(c2).width = w;
      put(10, c2, sub);
      ws.mergeCells(10, c2, 11, c2);
    }
    i = j;
  }

  for (const [title, start, subs] of OR_BLOCKS) {
    put(8, start, title);
    ws.mergeCells(8, start, 9, start + subs.length - 1);
    subs.forEach(([sub, w], k) => {
      ws.getColumn(start + k).width = w;
      put(10, start + k, sub);
      ws.mergeCells(10, start + k, 11, start + k);
    });
  }
  put(8, LAST_COL, "Keterangan");
  ws.mergeCells(8, LAST_COL, 11, LAST_COL);
  ws.getColumn(LAST_COL).width = 34;
  for (const r of [8, 9, 10, 11]) ws.getRow(r).height = 22;

  let row = 12;
  const ranges: [number, number][] = [];

  for (const section of sections) {
    const sc = ws.getCell(row, 5);
    sc.value = section.label;
    sc.font = { name: FONT, size: 9, bold: true };
    for (let c = 4; c <= LAST_COL; c++) {
      ws.getCell(row, c).fill =
        { type: "pattern", pattern: "solid", fgColor: { argb: "FFBFBFBF" } };
    }
    row++;

    const first = row;
    section.rows.forEach((rec, n) => {
      ws.getCell(row, 5).value = n + 1;
      for (const [colStr, value] of Object.entries(rec.cells)) {
        const col = Number(colStr);
        if (value === null || value === undefined) continue;
        const cell = ws.getCell(row, col);
        cell.value = value as any;
        const fmt = formatFor(col);
        if (fmt) cell.numFmt = fmt;
      }
      for (let c = 4; c <= LAST_COL; c++) {
        const cell = ws.getCell(row, c);
        cell.font = { name: FONT, size: 8 };
        cell.border = box;
      }
      const fill = STATUS_FILL[rec.status];
      if (fill) {
        ws.getCell(row, 9).fill =
          { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      }
      row++;
    });
    if (section.rows.length) ranges.push([first, row - 1]);
    row++;
  }

  // Baris TOTAL: formula, bukan konstanta (FR-9.11).
  ws.getCell(row, 5).value = "TOTAL";
  for (let c = 4; c <= LAST_COL; c++) {
    const cell = ws.getCell(row, c);
    cell.font = { name: FONT, size: 9, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF9" } };
    cell.border = box;
  }
  for (const col of SUM_COLS) {
    const letter = ws.getColumn(col).letter;
    const parts = ranges.filter(([a, b]) => b >= a)
      .map(([a, b]) => `${letter}${a}:${letter}${b}`);
    if (!parts.length) continue;
    const cell = ws.getCell(row, col);
    cell.value = { formula: `SUM(${parts.join(",")})` } as any;
    cell.numFmt = formatFor(col) ?? CUR;
    cell.font = { name: FONT, size: 9, bold: true };
  }
  row += 3;

  ws.getCell(row, 9).value = "Keterangan";
  ws.getCell(row, 9).font = { name: FONT, size: 9, bold: true };
  row++;
  for (const [key, label] of Object.entries(STATUS_LABEL)) {
    const swatch = ws.getCell(row, 9);
    swatch.fill =
      { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[key] } };
    swatch.border = box;
    ws.getCell(row, 10).value = label;
    ws.getCell(row, 10).font = { name: FONT, size: 9 };
    row += 2;
  }

  row++;
  const notes: [string, string, string][] = [
    ["*", "Pakai SKB :", ""],
    ["", "", "Nominal Komisi 3%"],
    ["", "", "PPN 10%"],
    ["", "(Nominal Komisi 3% + PPN 10%) - PPh 2%", ""],
    ["", "", ""],
    ["*", "NPWP PRIBADI (PPh Final 0,5%)", ""],
    ["", "", ""],
    ["*", "NON PKP → (Pribadi)  2,5%", ""],
    ["", "                            (PT)            2%", ""],
  ];
  ws.getCell(row, 6).value = "Note:";
  ws.getCell(row, 6).font = { name: FONT, size: 9, bold: true };
  row++;
  for (const [a, b, c] of notes) {
    if (a) { ws.getCell(row, 5).value = a; ws.getCell(row, 5).font = { name: FONT, size: 9 }; }
    if (b) { ws.getCell(row, 6).value = b; ws.getCell(row, 6).font = { name: FONT, size: 9 }; }
    if (c) { ws.getCell(row, 8).value = c; ws.getCell(row, 8).font = { name: FONT, size: 9 }; }
    row++;
  }
  row++;
  ws.getCell(row, 6).value =
    "Sumber angka: dihasilkan sistem dari data klaim terverifikasi. Tarif pajak " +
    "mengikuti konfigurasi berversi yang berlaku pada Tanggal Penjualan tiap unit " +
    "(PRD FR-1.5), bukan tarif tetap.";
  ws.getCell(row, 6).font = { name: FONT, size: 8, italic: true };
  row++;
  ws.getCell(row, 6).value =
    "Catatan: file acuan mencantumkan PPN 10%, sedangkan Form Klaim Komisi " +
    "menyiratkan 11%. Perlu konfirmasi Finance sebelum export dipakai sebagai " +
    "dasar pelaporan (PRD Q38).";
  ws.getCell(row, 6).font = { name: FONT, size: 8, italic: true };

  return wb;
}

export async function exportBuffer(filters = {}): Promise<Buffer> {
  const wb = await buildWorkbook(await collect(filters));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function preview(filters = {}) {
  const sections = await collect(filters);
  return {
    as_of: new Date().toISOString().slice(0, 10),
    project_name: "BIO District",
    sections: sections.map((s) => ({ label: s.label, row_count: s.rows.length })),
    note: "Laporan ini adalah view atas data klaim. Tidak ada endpoint untuk " +
          "menulis ke laporan — perubahan selalu dilakukan pada klaimnya.",
  };
}

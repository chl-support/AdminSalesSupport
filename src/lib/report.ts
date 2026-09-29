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
import {
  BULAN_SINGKAT, FORMAT, K, KEPALA, KOLOM_TERAKHIR, KOLOM_TOTAL, LEBAR,
  LUAS, PCT, RP, RP2, TGL,
} from "./report-susunan";

const FONT = "Twentieth Century";

const STATUS_LABEL: Record<string, string> = {
  belum_pengajuan: "Belum Pengajuan Komisi",
  sudah_dibayarkan: "Sudah Dibayarkan",
  proses_finance: "Proses Finance",
  management: "Management (No Closing Fee, Reward & Komisi)",
  batal_unit: "BATAL UNIT",
};

const CLOSING_FEE_COLS: Record<string, [number, number]> = {
  sales_inhouse: [K.inhouseFee, K.inhouseTgl],
  sales_manager_inhouse: [K.managerFee, K.managerTgl],
  sales_markom: [K.marcommFee, K.marcommTgl],
  markom: [K.marcommFee, K.marcommTgl],
  // PIC Proyek pada berkas acuannya adalah Sales Koordinator.
  sales_coordinator: [K.picFee, K.picTgl],
};

/**
 * Blok Overiding beserta urutan kolomnya.
 *
 * Dua blok, sama persis dengan dua tingkat yang dipakai: Sales Manager
 * (InHouse) dan Coordinator Agent. Tidak ada tingkat yang dipakai tetapi tidak
 * tercetak.
 *
 * Kantor Agent, Lead Agent, dan Koordinator Agent 2 sudah tidak dipakai lagi
 * dan tidak punya blok di sini. Barisnya yang lama tidak dipaksakan masuk ke
 * blok milik tingkat lain — angkanya akan tertimpa atau terbaca sebagai milik
 * orang yang salah; datanya tetap tersimpan dan tetap terlihat pada layar
 * Overriding.
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

/**
 * Satu sel sebagaimana tampil, untuk layar.
 *
 * Diubah menjadi tulisan di sini, di tempat yang sama dengan yang menyusun
 * workbook-nya, dan mengikuti bentuk tampilan kolom yang sama pula. Dibiarkan
 * ke layar sebagai angka mentah, layar akan menuliskannya dengan aturannya
 * sendiri, dan dua tempat yang menuliskan angka yang sama dengan aturan yang
 * berbeda cepat atau lambat menampilkan dua angka yang berbeda.
 */
function tampil(kolom: number, nilai: unknown): string {
  if (nilai === null || nilai === undefined || nilai === "") return "";
  const fmt = FORMAT[kolom];

  if (fmt === TGL || fmt === 'dd"-"mmm"-"yy') {
    const d = nilai instanceof Date ? nilai : new Date(String(nilai));
    if (Number.isNaN(d.getTime())) return String(nilai);
    return `${d.getDate()}-${BULAN_SINGKAT[d.getMonth()]}-` +
           `${String(d.getFullYear()).slice(2)}`;
  }
  const n = Number(nilai);
  if (Number.isNaN(n)) return String(nilai);
  if (fmt === PCT) {
    return `${(n * 100).toLocaleString("id-ID", { minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2 })}%`;
  }
  if (fmt === RP || fmt === RP2) {
    return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  }
  if (fmt === LUAS) {
    return n.toLocaleString("id-ID", { minimumFractionDigits: 2,
                                       maximumFractionDigits: 2 });
  }
  return String(nilai);
}

export type BarisLayar = { no: number; sel: Record<number, string> };
export type SeksiLayar = { label: string; baris: BarisLayar[] };

/**
 * Isi laporan untuk ditampilkan di layar.
 *
 * Sel yang kosong tidak ikut dikirim. Laporan ini 56 kolom dan sebagian
 * besarnya memang kosong pada tiap barisnya; mengirim seluruh petaknya berarti
 * menyeberangkan ribuan tulisan kosong pada tiap kali layar dibuka.
 */
export async function rincian(filters: Saringan = {}): Promise<{
  as_of: string; seksi: SeksiLayar[]; total: Record<number, string>;
}> {
  const sections = await collect(filters);

  const seksi: SeksiLayar[] = sections.map((s) => ({
    label: s.label,
    baris: s.rows.map((r, i) => {
      const sel: Record<number, string> = {};
      for (const [kolomStr, nilai] of Object.entries(r.cells)) {
        const t = tampil(Number(kolomStr), nilai);
        if (t) sel[Number(kolomStr)] = t;
      }
      return { no: i + 1, sel };
    }),
  }));

  // TOTAL menjumlah seksi terakhir saja, sama seperti baris TOTAL pada
  // workbook-nya — unit yang batal, pindah, maupun milik management memang
  // bukan uang yang keluar.
  const terakhir = sections[sections.length - 1]?.rows ?? [];
  const total: Record<number, string> = {};
  for (const kolom of KOLOM_TOTAL) {
    let jumlah = 0;
    for (const r of terakhir) jumlah += Number(r.cells[kolom] ?? 0) || 0;
    total[kolom] = tampil(kolom, jumlah);
  }

  return { as_of: new Date().toISOString().slice(0, 10), seksi, total };
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

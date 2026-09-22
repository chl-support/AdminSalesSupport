/**
 * Penyusun PDF paket cetak.
 *
 * Menghasilkan dokumen yang disirkulasikan fisik untuk tanda tangan basah Head
 * Finance dan Management (PRD Tahap 5). Tata letaknya mengikuti form klaim
 * eksisting supaya tetap dikenali semua pihak.
 *
 * Tiga hal yang membuat dokumen ini dapat direkonsiliasi kembali (PRD FR-6.18,
 * FR-6.19):
 *
 *  - **QR dan potongan hash di setiap halaman**, bukan hanya di sampul, sehingga
 *    halaman yang tertukar atau disisipkan ikut terdeteksi.
 *  - **Nomor salinan dan identitas pencetak** sebagai watermark, agar cetakan lama
 *    yang beredar bersamaan langsung terlihat.
 *  - **Tanda tangan digital Pemohon ditempel** dari citra yang tersimpan, bukan
 *    kotak kosong, supaya kertas memuat bukti persetujuan yang sama dengan yang
 *    tersegel di sistem.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

import { formatRupiah, terbilang } from "./money";

const A4 = { w: 595.28, h: 841.89 };
const M = 42;                          // margin
const FOOT_LIMIT = 58;                 // batas bawah isi; di bawahnya milik kaki halaman
const CONTENT_TOP = A4.h - M - 56;     // baris pertama setelah kop
const INK = rgb(0.08, 0.09, 0.1);
const SUB = rgb(0.36, 0.38, 0.4);
const LINE = rgb(0.78, 0.8, 0.82);
const OK = rgb(0.18, 0.42, 0.31);
const WARN = rgb(0.54, 0.35, 0.0);

export type PrintPayload = {
  claim: any;
  unit: any;
  marketing: any;
  agency: any | null;
  bank: any | null;
  documents: { checklist_item: string }[];
  signatureImagePng: string | null;
  copyNumber: number;
  documentHash: string;
  printedBy: string;
  verifyUrl: string;
  crosscheck: { admin: string; finance: string };
};

const CLAIM_TITLE: Record<string, string> = {
  closing_fee: "FORM KLAIM CLOSING FEE",
  commission: "FORM KLAIM KOMISI",
  cash_reward: "FORM KLAIM CASH REWARD",
  continuity_reward: "FORM KLAIM CONTINUITY REWARD",
  overriding: "REKAP OVERRIDING",
};

const WHT_LABEL: Record<string, string> = {
  pph21: "PPh 21", pph23: "PPh 23", pph_final: "PPh Final", none: "PPh",
};

const ROLE_LABEL: Record<string, string> = {
  agent: "Agent",
  sales_inhouse: "Sales Inhouse",
  sales_manager_inhouse: "Sales Manager (Inhouse)",
  sales_markom: "Sales Markom",
  markom: "Markom",
};

const DOC_LABEL: Record<string, string> = {
  fpu: "Formulir Pemesanan Unit (FPU)",
  spu: "Surat Pemesanan Unit (SPU)",
  ppjb: "PPJB",
  kwitansi: "Kwitansi",
  invoice: "Invoice",
  non_pkp_statement: "Surat Pernyataan Non PKP",
  tax_invoice: "Faktur Pajak PPN",
  ktp: "KTP",
  npwp: "NPWP",
  bank_account: "Rekening Bank",
  booking_fee_proof: "Bukti Bayar Booking Fee",
};

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("id-ID",
    { day: "2-digit", month: "long", year: "numeric" });
}

type Ctx = {
  page: PDFPage; font: PDFFont; bold: PDFFont; y: number;
  doc: PDFDocument; qr: any; payload: PrintPayload; pageNo: number;
};

function text(c: Ctx, s: string, x: number, y: number,
              opts: { size?: number; bold?: boolean; color?: any } = {}) {
  c.page.drawText(s, {
    x, y, size: opts.size ?? 9,
    font: opts.bold ? c.bold : c.font,
    color: opts.color ?? INK,
  });
}

/** Kop, watermark salinan, QR, dan potongan hash — dibubuhkan di tiap halaman. */
async function decoratePage(c: Ctx) {
  const p = c.payload;
  const top = A4.h - M;

  text(c, "PT. SERPONG BANGUN LESTARI", M, top, { size: 11, bold: true });
  text(c, "Jl. BSD Raya Utama, Ruko Mendrisio III Blok B No. 11", M, top - 12,
       { size: 7.5, color: SUB });
  text(c, "Paramount Gading Serpong, Tangerang, Banten 15312", M, top - 21,
       { size: 7.5, color: SUB });

  // QR menuju halaman verifikasi keaslian dokumen.
  const png = await c.doc.embedPng(c.qr);
  const size = 54;
  c.page.drawImage(png, { x: A4.w - M - size, y: top - size + 10, width: size, height: size });
  text(c, `Salinan #${p.copyNumber}`, A4.w - M - size, top - size + 2,
       { size: 6.5, color: SUB });

  c.page.drawLine({
    start: { x: M, y: top - 34 }, end: { x: A4.w - M - size - 8, y: top - 34 },
    thickness: 1, color: INK,
  });

  // Kaki halaman: identitas salinan dan potongan hash.
  const foot = `SALINAN CETAK #${p.copyNumber} — ${p.printedBy} — ` +
               `${new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`;
  text(c, foot, M, 30, { size: 6.5, color: SUB });
  text(c, `Hash: ${p.documentHash.slice(0, 32)}…  ·  Halaman ${c.pageNo}`,
       M, 21, { size: 6.5, color: SUB });
  text(c, "Pindai QR untuk memverifikasi keaslian dokumen ini.",
       A4.w - M - 200, 21, { size: 6.5, color: SUB });
}

/** Pindah ke halaman baru bila ruang tersisa tidak cukup untuk blok berikutnya. */
async function ensureSpace(c: Ctx, needed: number) {
  if (c.y - needed >= FOOT_LIMIT) return;
  c.page = c.doc.addPage([A4.w, A4.h]);
  c.pageNo += 1;
  c.y = CONTENT_TOP;
  await decoratePage(c);
  text(c, `Lanjutan — ${c.payload.claim.claim_number}`, M, c.y,
       { size: 9, bold: true, color: SUB });
  c.y -= 20;
}

function sectionHeader(c: Ctx, title: string) {
  c.page.drawRectangle({ x: M, y: c.y - 4, width: A4.w - M * 2, height: 15,
                         color: rgb(0.92, 0.93, 0.94) });
  text(c, title, M + 6, c.y, { size: 8.5, bold: true });
  c.y -= 22;
}

function row(c: Ctx, label: string, value: string, opts: { bold?: boolean } = {}) {
  text(c, label, M + 6, c.y, { size: 8, color: SUB });
  text(c, value, M + 175, c.y, { size: 8.5, bold: opts.bold });
  c.y -= 14;
}

function money(c: Ctx, label: string, value: number,
               opts: { bold?: boolean; negative?: boolean } = {}) {
  text(c, label, M + 6, c.y, { size: 8, color: SUB });
  const s = opts.negative ? `(${formatRupiah(value)})` : formatRupiah(value);
  const w = (opts.bold ? c.bold : c.font).widthOfTextAtSize(s, 8.5);
  c.page.drawText(s, { x: A4.w - M - 6 - w, y: c.y, size: 8.5,
                       font: opts.bold ? c.bold : c.font, color: INK });
  c.y -= 14;
}

export async function buildPrintPdf(p: PrintPayload): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${p.claim.claim_number} — salinan #${p.copyNumber}`);
  doc.setProducer("CHL Sales Admin System — BIO District");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const qr = await QRCode.toBuffer(p.verifyUrl, {
    type: "png", margin: 0, width: 220,
    color: { dark: "#15171A", light: "#FFFFFF" },
  });

  const page = doc.addPage([A4.w, A4.h]);
  const c: Ctx = { page, font, bold, y: CONTENT_TOP, doc, qr, payload: p, pageNo: 1 };
  await decoratePage(c);

  const title = CLAIM_TITLE[p.claim.claim_type] ?? "FORM KLAIM";
  text(c, title, M, c.y, { size: 13, bold: true });
  text(c, `No. ${p.claim.claim_number}`, A4.w - M - 140, c.y, { size: 9, color: SUB });
  c.y -= 26;

  // ── Cap verifikasi pajak ──
  const stampH = p.claim.tax_corrected ? 42 : 28;
  c.page.drawRectangle({ x: M, y: c.y - stampH + 10, width: A4.w - M * 2,
                         height: stampH, borderColor: OK, borderWidth: 1,
                         color: rgb(0.91, 0.95, 0.92) });
  text(c, "TERVERIFIKASI PAJAK", M + 8, c.y, { size: 8.5, bold: true, color: OK });
  text(c, `${p.claim.tax_verified_by ?? "—"} · ${fmtDate(p.claim.tax_verified_at)}`,
       M + 150, c.y, { size: 8, color: OK });
  if (p.claim.tax_corrected) {
    text(c, `Nominal dikoreksi: ${p.claim.tax_correction_reason ?? ""}`.slice(0, 110),
         M + 8, c.y - 13, { size: 7.5, color: WARN });
  }
  c.y -= stampH + 12;

  // ── Informasi data marketing ──
  sectionHeader(c, "INFORMASI DATA MARKETING");
  row(c, "Nama Marketing", p.marketing.full_name);
  row(c, "Peran Penerima", ROLE_LABEL[p.claim.recipient_role] ?? p.claim.recipient_role);
  row(c, "Status", (p.marketing.marketing_type ?? "").toUpperCase());
  row(c, "Nama Kantor Marketing", p.agency?.name ?? "—");
  row(c, "Alamat Kantor", (p.agency?.address ?? "—").slice(0, 70));
  row(c, "NPWP", p.marketing.npwp ?? "—");
  row(c, "No. Telepon / HP", p.marketing.phone ?? "—");
  row(c, "Email", p.marketing.email ?? "—");
  c.y -= 6;

  // ── Informasi data pemesanan ──
  await ensureSpace(c, 130);
  sectionHeader(c, "INFORMASI DATA PEMESANAN");
  row(c, "Nama Pemesan", p.unit.buyer_name ?? "—");
  row(c, "Kluster / No. Unit", `${p.unit.cluster_code} / ${p.unit.code}`);
  row(c, "Tipe", p.unit.unit_type ?? "—");
  row(c, "Luas Tanah / Bangunan",
      `${p.unit.land_area ?? "—"} m2 / ${p.unit.building_area ?? "—"} m2`);
  row(c, "Skema Cara Bayar", p.unit.payment_scheme ?? "—");
  row(c, "Tanggal Penjualan", fmtDate(p.unit.contract_date));
  row(c, "Harga Transaksi", formatRupiah(p.unit.contract_value_incl_vat));
  c.y -= 6;

  // ── Perhitungan ──
  await ensureSpace(c, 120);
  sectionHeader(c, "PERHITUNGAN");
  const pct = p.claim.payment_percent
    ? `${(Number(p.claim.payment_percent) * 100).toFixed(2)}%` : "—";
  row(c, "Total Pembayaran / Persen",
      `${formatRupiah(p.claim.total_payment)}  ·  ${pct}`);
  money(c, "Jumlah Bruto", p.claim.gross_amount);
  money(c, "PPN", p.claim.vat);
  money(c, `Potongan ${WHT_LABEL[p.claim.withholding_tax_type] ?? "PPh"}`,
        p.claim.withholding_tax, { negative: true });
  c.page.drawLine({ start: { x: M + 6, y: c.y + 9 },
                    end: { x: A4.w - M - 6, y: c.y + 9 },
                    thickness: 0.6, color: LINE });
  c.y -= 4;
  money(c, "Yang Dibayarkan", p.claim.net_amount, { bold: true });
  c.y -= 2;
  text(c, "Terbilang", M + 6, c.y, { size: 8, color: SUB });
  const words = p.claim.amount_in_words ??
    `${terbilang(p.claim.net_amount)} rupiah`;
  text(c, words.length > 78 ? words.slice(0, 78) + "…" : words, M + 175, c.y,
       { size: 8 });
  c.y -= 20;

  // ── Kelengkapan dokumen & tujuan transfer ──
  const checklistH = Math.ceil(p.documents.length / 2) * 12 + 80;
  await ensureSpace(c, checklistH);
  sectionHeader(c, "KELENGKAPAN DOKUMEN & TUJUAN TRANSFER");
  const items = p.documents.map((d) => DOC_LABEL[d.checklist_item] ?? d.checklist_item);
  const half = Math.ceil(items.length / 2);
  items.forEach((label, i) => {
    const col = i < half ? M + 6 : M + 265;
    const yy = c.y - (i < half ? i : i - half) * 12;
    c.page.drawRectangle({ x: col, y: yy - 1, width: 7, height: 7,
                           borderColor: INK, borderWidth: 0.7 });
    text(c, "v", col + 1.5, yy, { size: 6.5, bold: true });
    text(c, label, col + 12, yy, { size: 7.5, color: SUB });
  });
  c.y -= half * 12 + 10;
  row(c, "Nama Penerima", p.bank?.holder_name ?? p.marketing.full_name);
  row(c, "Bank / Cabang",
      `${p.bank?.bank_name ?? "—"} — ${p.bank?.branch ?? "—"}`);
  row(c, "No. Rekening", p.bank?.account_number ?? "—");
  c.y -= 10;

  // ── Catatan untuk penandatangan, sebelum blok pengesahan ──
  await ensureSpace(c, 175);
  text(c, `Crosscheck digital — Admin Sales: ${p.crosscheck.admin} · ` +
          `Finance: ${p.crosscheck.finance}`, M + 6, c.y, { size: 7, color: SUB });
  c.y -= 10;
  text(c, "Koreksi tulisan tangan atas nilai finansial tidak dapat diterima. " +
          "Perubahan nilai membatalkan tanda", M + 6, c.y, { size: 7, color: WARN });
  c.y -= 9;
  text(c, "tangan elektronik dan mengulang proses dari verifikasi pajak.",
       M + 6, c.y, { size: 7, color: WARN });
  c.y -= 16;

  // ── Pengesahan ──
  sectionHeader(c, "PENGESAHAN");
  const boxW = (A4.w - M * 2 - 16) / 3;
  const boxH = 92;
  const boxY = c.y - boxH + 10;
  const labels: [string, string, boolean][] = [
    ["Pemohon", p.marketing.full_name, true],
    ["Diperiksa — Head Finance", "", false],
    ["Disetujui — Management", "", false],
  ];

  for (const [i, [label, name, signed]] of labels.entries()) {
    const x = M + i * (boxW + 8);
    c.page.drawRectangle({ x, y: boxY, width: boxW, height: boxH,
                           borderColor: LINE, borderWidth: 0.8 });
    text(c, label, x + 6, boxY + boxH - 14, { size: 7.5, bold: true, color: SUB });

    // Tata letak dihitung dari dasar kotak ke atas agar tidak saling tindih:
    // tanggal (8) · nama (20) · garis (30) · keterangan (34) · area goresan (40+).
    const yDate = boxY + 8;
    const yName = boxY + 20;
    const yRule = boxY + 30;
    const yNote = boxY + 34;
    const sigBottom = boxY + 44;
    const sigTop = boxY + boxH - 20;

    if (signed && p.signatureImagePng) {
      try {
        const raw = p.signatureImagePng.includes(",")
          ? p.signatureImagePng.slice(p.signatureImagePng.indexOf(",") + 1)
          : p.signatureImagePng;
        const img = await doc.embedPng(Buffer.from(raw, "base64"));
        const scale = Math.min((boxW - 28) / img.width,
                               (sigTop - sigBottom) / img.height);
        c.page.drawImage(img, {
          x: x + 14, y: sigBottom,
          width: img.width * scale, height: img.height * scale,
        });
      } catch {
        // Citra rusak tidak boleh menggagalkan seluruh dokumen; kotak dibiarkan
        // kosong agar dapat ditandatangani basah sebagai jalur cadangan.
      }
      text(c, `Elektronik · skor ${p.claim.signature_score ?? "—"}`,
           x + 8, yNote, { size: 5.8, color: OK });
    }

    c.page.drawLine({ start: { x: x + 10, y: yRule },
                      end: { x: x + boxW - 10, y: yRule },
                      thickness: 0.6, color: LINE });
    text(c, name || "(   nama jelas   )", x + 10, yName,
         { size: 7.5, color: name ? INK : SUB });
    text(c, signed ? fmtDate(p.claim.signed_at) : "Tanggal: ……………………",
         x + 10, yDate, { size: 6.5, color: SUB });
  }
  return Buffer.from(await doc.save());
}

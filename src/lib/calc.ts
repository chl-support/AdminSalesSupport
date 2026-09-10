/**
 * Mesin perhitungan insentif dan pajak.
 *
 * Skema dan tarif dipilih menurut tanggal penjualan unit, bukan tanggal pengajuan
 * (PRD BR-06). Setiap hasil menyimpan snapshot parameter yang dipakai, agar angka
 * lama tetap dapat ditelusuri setelah tarif berubah (PRD FR-4.9).
 */

import type { PoolClient } from "pg";
import { one, query } from "./db";
import { applyRate, ratio, rupiahWords, stripVat } from "./money";

export type ClaimType = "closing_fee" | "commission" | "cash_reward" | "overriding";
export type RecipientRole =
  | "agent" | "sales_inhouse" | "sales_manager_inhouse" | "sales_markom" | "markom";
export type OverridingLevel =
  | "sales_manager_inhouse" | "kantor_agent" | "lead_agent"
  | "coordinator_agent_1" | "coordinator_agent_2";

export type TaxContext = {
  pkp_status: string;
  recipient_type: string;
  npwp_type: string;
  has_skb: boolean;
  overriding_level: OverridingLevel | null;
};

export function recipientContext(
  marketing: any, agency: any | null, level: OverridingLevel | null = null,
): TaxContext {
  return {
    pkp_status: agency?.pkp_status ?? "non_pkp",
    recipient_type: marketing.recipient_type ?? "individual",
    npwp_type: marketing.npwp_type ?? "none",
    has_skb: Boolean(agency?.has_skb),
    overriding_level: level,
  };
}

export async function findScheme(
  claimType: ClaimType, role: RecipientRole | null,
  level: OverridingLevel | null, onDate: string, client?: PoolClient,
) {
  const rows = await query(
    `SELECT * FROM incentive_schemes
     WHERE claim_type = $1 AND effective_from <= $2::date
       AND (effective_to IS NULL OR effective_to >= $2::date)`,
    [claimType, onDate], client,
  );
  let best: any = null, bestRank = -1;
  for (const r of rows) {
    let rank = 0;
    if (r.recipient_role) {
      if (r.recipient_role !== role) continue;
      rank += 2;
    }
    if (r.overriding_level) {
      if (r.overriding_level !== level) continue;
      rank += 2;
    }
    if (rank > bestRank) { best = r; bestRank = rank; }
  }
  return best;
}

/**
 * Ambil tarif paling spesifik yang cocok dengan konteks penerima.
 *
 * Kekhususan dihitung dari jumlah syarat yang benar-benar diisi, sehingga baris
 * "Non-PKP + badan usaha" menang atas baris "berlaku untuk semua".
 */
export async function findTaxRate(
  taxType: string, ctx: TaxContext, onDate: string, client?: PoolClient,
) {
  const rows = await query(
    `SELECT * FROM tax_rates
     WHERE tax_type = $1 AND effective_from <= $2::date
       AND (effective_to IS NULL OR effective_to >= $2::date)`,
    [taxType, onDate], client,
  );
  let best: any = null, bestRank = -1;
  for (const r of rows) {
    let rank = 0, ok = true;
    const pairs: [string, keyof TaxContext][] = [
      ["pkp_status", "pkp_status"],
      ["recipient_type", "recipient_type"],
      ["npwp_type", "npwp_type"],
      ["overriding_level", "overriding_level"],
    ];
    for (const [col, key] of pairs) {
      const val = r[col];
      if (val === null || val === "any" || val === "") continue;
      if (ctx[key] !== val) { ok = false; break; }
      rank++;
    }
    if (!ok) continue;
    if (r.has_skb !== null) {
      if (Boolean(ctx.has_skb) !== Boolean(r.has_skb)) continue;
      rank++;
    }
    if (rank > bestRank) { best = r; bestRank = rank; }
  }
  return best;
}

export type CalculationResult = {
  total_payment: number;
  payment_percent: string;
  gross_amount: number;
  vat: number;
  withholding_tax: number;
  withholding_tax_type: string;
  net_amount: number;
  amount_in_words: string;
  snapshot: Record<string, unknown>;
};

export async function calculate(
  unit: any, marketing: any, agency: any | null,
  claimType: ClaimType, role: RecipientRole,
  level: OverridingLevel | null = null, client?: PoolClient,
): Promise<CalculationResult> {
  const onDate = (unit.contract_date instanceof Date
    ? unit.contract_date.toISOString().slice(0, 10)
    : String(unit.contract_date ?? "1970-01-01").slice(0, 10));
  const ctx = recipientContext(marketing, agency, level);

  const scheme = await findScheme(claimType, role, level, onDate, client);
  if (!scheme) {
    throw new Error(
      `Tidak ada skema insentif berlaku untuk ${claimType}/${role} pada ${onDate}. ` +
      `Lengkapi konfigurasi sebelum klaim dapat dihitung.`,
    );
  }

  const incl = Number(unit.contract_value_incl_vat ?? 0);
  const vatRow = await findTaxRate("vat", ctx, onDate, client);
  const vatRate = vatRow?.rate ?? "0";
  const excl = stripVat(incl, vatRate);
  const basisValue = scheme.basis === "contract_value_incl_vat" ? incl : excl;

  const gross = scheme.flat_amount !== null
    ? Number(scheme.flat_amount)
    : applyRate(basisValue, scheme.percentage);

  // PPN hanya bagi penerima PKP.
  const vat = ctx.pkp_status === "pkp" ? applyRate(gross, vatRate) : 0;

  let whtType: string;
  if (ctx.recipient_type === "company") whtType = "pph23";
  else if (ctx.npwp_type === "personal" &&
           await findTaxRate("pph_final", ctx, onDate, client)) whtType = "pph_final";
  else whtType = "pph21";

  const whtRow = await findTaxRate(whtType, ctx, onDate, client);
  const wht = whtRow ? applyRate(gross, whtRow.rate) : 0;
  const net = gross + vat - wht;

  const received = Number(unit.received_amount ?? 0);

  return {
    total_payment: received,
    payment_percent: ratio(received, incl),
    gross_amount: gross,
    vat,
    withholding_tax: wht,
    withholding_tax_type: whtType,
    net_amount: net,
    amount_in_words: rupiahWords(net),
    snapshot: {
      scheme_id: scheme.id,
      scheme_memo: scheme.memo_reference,
      scheme_type: scheme.scheme_type,
      basis: scheme.basis,
      basis_value: basisValue,
      percentage: scheme.percentage,
      flat_amount: scheme.flat_amount,
      vat_rate: vatRate,
      withholding_type: whtType,
      withholding_rate: whtRow?.rate ?? "0",
      withholding_note: whtRow?.note ?? null,
      recipient_context: ctx,
      rounding: "round_half_up_rupiah",
      calculated_on_contract_date: onDate,
    },
  };
}

// ─────────────────────── Prasyarat pencairan ───────────────────────

export function eligibility(unit: any, claimType: ClaimType): {
  ok: boolean; missing: string[];
} {
  const missing: string[] = [];
  if (unit.status === "cancelled") missing.push("Unit sudah dibatalkan.");
  if (unit.status === "moved_to_other_unit")
    missing.push("Unit sudah dipindahkan ke unit lain.");
  if (unit.status === "management")
    missing.push("Unit management — tidak menghasilkan insentif.");

  if (claimType === "closing_fee") {
    if (!unit.spu_signed) missing.push("SPU belum ditandatangani pemesan (BR-01).");
  } else if (claimType === "commission") {
    if (!unit.spu_signed) missing.push("SPU belum ditandatangani pemesan (BR-02).");
    if (!unit.ppjb_signed) missing.push("PPJB belum ditandatangani pemesan (BR-02).");
  } else if (claimType === "cash_reward") {
    if (!unit.dp_received) missing.push("DP / angsuran 1 belum diterima (BR-03).");
    if (!unit.spu_signed) missing.push("SPU belum ditandatangani pemesan (BR-03).");
    if (!unit.ppjb_signed) missing.push("PPJB belum ditandatangani pemesan (BR-03).");
  } else if (claimType === "overriding") {
    if (!unit.sign_p3u) missing.push("Unit belum Sign P3U (BR-04).");
  }
  return { ok: missing.length === 0, missing };
}

export const REQUIRED_DOCS: Record<ClaimType, string[]> = {
  closing_fee: ["fpu", "spu", "ktp", "npwp", "booking_fee_proof"],
  commission: ["fpu", "spu", "ppjb", "kwitansi", "invoice", "ktp", "npwp",
               "bank_account"],
  cash_reward: ["fpu", "spu", "ppjb", "kwitansi", "ktp", "npwp", "bank_account"],
  overriding: [],
};

export function missingDocuments(
  claimType: ClaimType, uploaded: string[], pkpStatus: string,
): string[] {
  const need = [...REQUIRED_DOCS[claimType]];
  if (claimType === "commission") {
    need.push(pkpStatus === "pkp" ? "tax_invoice" : "non_pkp_statement");
  }
  return need.filter((d) => !uploaded.includes(d));
}

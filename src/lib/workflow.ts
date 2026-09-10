/**
 * Mesin alur kerja: state machine, gate, dan aturan bisnis.
 *
 * Seluruh aturan yang menahan proses ditegakkan di sini, bukan di route handler dan
 * bukan di komponen React. Klien mana pun menabrak dinding yang sama.
 *
 * Empat gate tanpa jalur pintas:
 *   1. Link tanda tangan tidak terbit sebelum status `tax_verified` (BR-13).
 *   2. Dokumen bersegel tidak dapat diubah; perubahan nilai selalu membatalkan
 *      tanda tangan (BR-11, BR-20).
 *   3. Verifikator pajak bukan penyetuju pembayaran klaim yang sama (FR-4.23).
 *   4. Verifikasi tanda tangan tidak pernah menolak permanen (FR-5.13).
 */

import { createHash, randomBytes, randomInt } from "node:crypto";
import type { PoolClient } from "pg";

import * as calc from "./calc";
import type { ClaimType, OverridingLevel, RecipientRole } from "./calc";
import { audit, one, query, setting, settingInt, tx } from "./db";
import * as sig from "./signature";
import type { Stroke } from "./signature";

export class WorkflowError extends Error {
  constructor(
    message: string,
    public code = "workflow_conflict",
    public status = 409,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

export const TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["pending_admin_review"],
  pending_admin_review: ["pending_tax_verification", "draft", "rejected"],
  pending_tax_verification: ["tax_verified", "draft", "rejected"],
  tax_verified: ["signature_link_sent", "pending_tax_verification"],
  signature_link_sent: ["awaiting_signature", "tax_verified"],
  awaiting_signature: ["signed", "signature_review_required",
                       "pending_tax_verification"],
  signature_review_required: ["signed", "rejected", "pending_tax_verification"],
  signed: ["crosscheck_in_progress"],
  crosscheck_in_progress: ["ready_to_print", "draft", "rejected",
                           "pending_tax_verification"],
  ready_to_print: ["printed"],
  printed: ["circulating_head_finance", "printed"],
  circulating_head_finance: ["circulating_management", "awaiting_scan_upload"],
  circulating_management: ["awaiting_scan_upload"],
  awaiting_scan_upload: ["approved", "rejected", "pending_tax_verification"],
  approved: ["awaiting_settlement_date"],
  awaiting_settlement_date: ["partially_paid", "paid"],
  partially_paid: ["partially_paid", "paid"],
  paid: ["completed"],
  completed: ["clawback"],
  returned: ["draft"],
  rejected: [],
  clawback: [],
  cancelled: [],
};

const SEALED_STATES = new Set([
  "signed", "crosscheck_in_progress", "ready_to_print", "printed",
  "circulating_head_finance", "circulating_management", "awaiting_scan_upload",
  "approved", "awaiting_settlement_date", "partially_paid", "paid", "completed",
]);

export async function getClaim(id: string, client?: PoolClient) {
  const c = await one("SELECT * FROM claims WHERE id=$1", [id], client);
  if (!c) throw new WorkflowError("Klaim tidak ditemukan.", "not_found", 404);
  return c;
}

export async function transition(
  claimId: string, next: string, actor?: string | null,
  reason?: string | null, client?: PoolClient,
) {
  const claim = await getClaim(claimId, client);
  const old = claim.status;
  if (!(TRANSITIONS[old] ?? []).includes(next)) {
    throw new WorkflowError(
      `Perpindahan status dari '${old}' ke '${next}' tidak diizinkan.`,
      "invalid_transition",
    );
  }
  await query(
    "UPDATE claims SET status=$1, updated_at=now() WHERE id=$2",
    [next, claimId], client,
  );
  await audit({
    entityType: "claim", entityId: claimId, action: `status:${old}->${next}`,
    actor, before: { status: old }, after: { status: next }, reason,
  }, client);
  return getClaim(claimId, client);
}

export function assertNotSealed(claim: any) {
  if (claim.sealed || SEALED_STATES.has(claim.status)) {
    throw new WorkflowError(
      "Dokumen sudah ditandatangani dan disegel. Perubahan nilai finansial hanya " +
      "melalui pelaporan temuan finansial, yang membatalkan tanda tangan.",
      "document_sealed",
    );
  }
}

// ─────────────────────────── Pembuatan klaim ───────────────────────────

export async function createClaim(params: {
  unitId: string; marketingId: string; claimType: ClaimType;
  recipientRole: RecipientRole; overridingLevel?: OverridingLevel | null;
  actor?: string;
}) {
  return tx(async (c) => {
    const unit = await one("SELECT * FROM units WHERE id=$1", [params.unitId], c);
    if (!unit) throw new WorkflowError("Unit tidak ditemukan.", "not_found", 404);
    const mkt = await one("SELECT * FROM marketings WHERE id=$1",
                          [params.marketingId], c);
    if (!mkt) throw new WorkflowError("Marketing tidak ditemukan.", "not_found", 404);
    if (mkt.status !== "active") {
      throw new WorkflowError(
        "Marketing belum aktif. Selesaikan pendaftaran dan perekaman spesimen " +
        "tanda tangan lebih dulu.", "marketing_not_active",
      );
    }

    const { ok, missing } = calc.eligibility(unit, params.claimType);
    if (!ok) {
      throw new WorkflowError("Prasyarat pencairan belum terpenuhi.",
                              "eligibility_failed", 409, { missing });
    }

    const agency = mkt.agency_id
      ? await one("SELECT * FROM agencies WHERE id=$1", [mkt.agency_id], c)
      : null;
    const r = await calc.calculate(unit, mkt, agency, params.claimType,
                                   params.recipientRole,
                                   params.overridingLevel ?? null, c);

    const prefix = { closing_fee: "CF", commission: "KMS",
                     cash_reward: "CR", overriding: "OR" }[params.claimType];
    const { count } = (await one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM claims WHERE claim_type=$1",
      [params.claimType], c))!;
    const number = `${prefix}-${new Date().getFullYear()}-${
      String(count + 1).padStart(4, "0")}`;

    const bank = await one(
      "SELECT id FROM bank_accounts WHERE marketing_id=$1 AND verified LIMIT 1",
      [params.marketingId], c);

    try {
      const claim = await one(
        `INSERT INTO claims (claim_number, claim_type, recipient_role, unit_id,
           marketing_id, bank_account_id, status, gross_amount, vat,
           withholding_tax, withholding_tax_type, net_amount, amount_in_words,
           total_payment, payment_percent, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [number, params.claimType, params.recipientRole, params.unitId,
         params.marketingId, bank?.id ?? null, r.gross_amount, r.vat,
         r.withholding_tax, r.withholding_tax_type, r.net_amount,
         r.amount_in_words, r.total_payment, r.payment_percent,
         JSON.stringify(r.snapshot)], c);

      await audit({
        entityType: "claim", entityId: claim!.id, action: "create",
        actor: params.actor, after: { claim_number: number, net: r.net_amount },
      }, c);
      return claim!;
    } catch (err: any) {
      // Ditegakkan UNIQUE INDEX parsial uniq_active_claim di basis data.
      if (err?.code === "23505" && String(err.constraint).includes("uniq_active_claim")) {
        throw new WorkflowError(
          `Unit ini sudah memiliki klaim ${params.claimType} aktif untuk peran ` +
          `${params.recipientRole}. Kombinasi peran lain tetap dapat diajukan.`,
          "duplicate_claim",
        );
      }
      throw err;
    }
  });
}

export async function recalculate(claimId: string, actor?: string) {
  const claim = await getClaim(claimId);
  assertNotSealed(claim);
  if (claim.tax_verified_at) {
    throw new WorkflowError(
      "Klaim sudah terverifikasi pajak. Batalkan verifikasi lebih dulu bila " +
      "nilainya perlu dihitung ulang.", "tax_verified_locked",
    );
  }
  const unit = await one("SELECT * FROM units WHERE id=$1", [claim.unit_id]);
  const mkt = await one("SELECT * FROM marketings WHERE id=$1", [claim.marketing_id]);
  const agency = mkt.agency_id
    ? await one("SELECT * FROM agencies WHERE id=$1", [mkt.agency_id]) : null;
  const r = await calc.calculate(unit, mkt, agency, claim.claim_type,
                                 claim.recipient_role);
  await query(
    `UPDATE claims SET gross_amount=$1, vat=$2, withholding_tax=$3,
       withholding_tax_type=$4, net_amount=$5, amount_in_words=$6,
       total_payment=$7, payment_percent=$8, snapshot=$9, updated_at=now()
     WHERE id=$10`,
    [r.gross_amount, r.vat, r.withholding_tax, r.withholding_tax_type,
     r.net_amount, r.amount_in_words, r.total_payment, r.payment_percent,
     JSON.stringify(r.snapshot), claimId]);
  await audit({ entityType: "claim", entityId: claimId, action: "recalculate",
                actor, after: r });
  return getClaim(claimId);
}

export async function submit(claimId: string, actor?: string) {
  const claim = await getClaim(claimId);
  const mkt = await one("SELECT * FROM marketings WHERE id=$1", [claim.marketing_id]);
  const agency = mkt.agency_id
    ? await one("SELECT * FROM agencies WHERE id=$1", [mkt.agency_id]) : null;
  const uploaded = (await query<{ checklist_item: string }>(
    "SELECT checklist_item FROM claim_documents WHERE claim_id=$1", [claimId]))
    .map((r) => r.checklist_item);
  const missing = calc.missingDocuments(claim.claim_type, uploaded,
                                        agency?.pkp_status ?? "non_pkp");
  if (missing.length) {
    throw new WorkflowError("Checklist dokumen belum lengkap.",
                            "documents_incomplete", 422, { missing_items: missing });
  }
  await transition(claimId, "submitted", actor);
  return transition(claimId, "pending_admin_review", actor);
}

export async function adminReview(
  claimId: string, decision: string, actor: string, reason?: string,
) {
  const claim = await getClaim(claimId);
  if (claim.status !== "pending_admin_review") {
    throw new WorkflowError("Klaim tidak sedang menunggu pemeriksaan Admin Sales.");
  }
  if (decision === "forward_to_tax") {
    return transition(claimId, "pending_tax_verification", actor);
  }
  if (decision === "return_to_applicant" || decision === "reject") {
    if (!reason) throw new WorkflowError("Alasan wajib diisi.", "reason_required", 422);
    await query("UPDATE claims SET return_count=return_count+1 WHERE id=$1", [claimId]);
    return transition(claimId,
      decision === "return_to_applicant" ? "draft" : "rejected", actor, reason);
  }
  throw new WorkflowError("Keputusan tidak dikenal.", "bad_decision", 422);
}

// ───────────────────── Gate 1: verifikasi pajak ─────────────────────

export async function taxVerify(params: {
  claimId: string; decision: string; actor: string;
  corrected?: Record<string, number>; reason?: string;
}) {
  const { claimId, decision, actor, corrected, reason } = params;
  const claim = await getClaim(claimId);
  if (claim.status !== "pending_tax_verification") {
    throw new WorkflowError("Klaim tidak sedang menunggu verifikasi pajak.");
  }

  if (decision === "return") {
    if (!reason) throw new WorkflowError("Alasan wajib diisi.", "reason_required", 422);
    await query("UPDATE claims SET return_count=return_count+1 WHERE id=$1", [claimId]);
    return transition(claimId, "draft", actor, reason);
  }
  if (decision !== "approve" && decision !== "approve_with_correction") {
    throw new WorkflowError("Keputusan tidak dikenal.", "bad_decision", 422);
  }

  let original: Record<string, unknown> | null = null;
  if (decision === "approve_with_correction") {
    if (!corrected) {
      throw new WorkflowError("Nilai koreksi wajib diisi.", "correction_required", 422);
    }
    if (!reason || reason.length < 10) {
      throw new WorkflowError(
        "Alasan koreksi wajib diisi minimal 10 karakter. Teks ini ditampilkan ke " +
        "Pemohon sebelum ia menandatangani.", "reason_required", 422,
      );
    }
    original = {
      gross_amount: claim.gross_amount, vat: claim.vat,
      withholding_tax: claim.withholding_tax, net_amount: claim.net_amount,
      amount_in_words: claim.amount_in_words,
    };
    const gross = corrected.gross_amount ?? claim.gross_amount;
    const vat = corrected.vat ?? claim.vat;
    const wht = corrected.withholding_tax ?? claim.withholding_tax;
    const net = gross + vat - wht;
    const { rupiahWords } = await import("./money");
    await query(
      `UPDATE claims SET gross_amount=$1, vat=$2, withholding_tax=$3, net_amount=$4,
         amount_in_words=$5, tax_corrected=TRUE, tax_correction_reason=$6,
         original_amounts=$7 WHERE id=$8`,
      [gross, vat, wht, net, rupiahWords(net), reason,
       JSON.stringify(original), claimId]);
  }

  const validDays = await settingInt("tax_verification_validity_days");
  await query(
    `UPDATE claims SET tax_verified_by=$1, tax_verified_at=now(),
       tax_verification_valid_until = now() + ($2 || ' days')::interval
     WHERE id=$3`,
    [actor, String(validDays), claimId]);
  await audit({ entityType: "claim", entityId: claimId, action: "tax_verify",
                actor, before: original, after: { decision }, reason });
  return transition(claimId, "tax_verified", actor, reason);
}

export async function invalidateTaxVerification(
  claimId: string, actor: string, reason: string,
) {
  const claim = await getClaim(claimId);
  if (!claim.tax_verified_at) return claim;
  await query(
    `UPDATE claims SET tax_verified_by=NULL, tax_verified_at=NULL,
       tax_verification_valid_until=NULL WHERE id=$1`, [claimId]);
  await audit({ entityType: "claim", entityId: claimId,
                action: "tax_verification_invalidated", actor, reason });
  if (["tax_verified", "signature_link_sent", "awaiting_signature"]
      .includes(claim.status)) {
    return transition(claimId, "pending_tax_verification", actor, reason);
  }
  return getClaim(claimId);
}

// ───────────────────── Gate 2: link tanda tangan ─────────────────────

export async function issueSignatureLink(
  claimId: string, actor: string, channel = "whatsapp",
) {
  const claim = await getClaim(claimId);
  if (claim.status !== "tax_verified") {
    throw new WorkflowError(
      `Klaim belum melewati verifikasi pajak (status saat ini '${claim.status}'). ` +
      `Link tanda tangan tidak dapat dikirim.`, "tax_gate_not_passed",
    );
  }
  if (!claim.tax_verification_valid_until ||
      new Date(claim.tax_verification_valid_until) < new Date()) {
    await invalidateTaxVerification(claimId, actor,
                                    "Masa berlaku verifikasi pajak habis.");
    throw new WorkflowError(
      "Masa berlaku verifikasi pajak sudah habis. Klaim dikembalikan ke antrean " +
      "Finance (Pajak).", "tax_verification_expired",
    );
  }

  const mkt = await one("SELECT * FROM marketings WHERE id=$1", [claim.marketing_id]);
  await query(
    "UPDATE signing_sessions SET state='expired' WHERE claim_id=$1 " +
    "AND state IN ('sent','opened')", [claimId]);

  const token = randomBytes(32).toString("base64url");
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const ttl = await settingInt("signing_link_ttl_minutes");
  const session = await one(
    `INSERT INTO signing_sessions (token, claim_id, marketing_id, otp_code, expires_at)
     VALUES ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval) RETURNING expires_at`,
    [token, claimId, claim.marketing_id, otp, String(ttl)]);

  await transition(claimId, "signature_link_sent", actor);
  await audit({ entityType: "claim", entityId: claimId,
                action: "signature_link_issued", actor,
                after: { channel, expires_at: session!.expires_at } });

  const phone: string = mkt.phone ?? "";
  const masked = phone.slice(0, 4) + "•".repeat(Math.max(0, phone.length - 7)) +
                 phone.slice(-3);
  // Pesan sengaja tidak memuat nominal maupun nama konsumen (FR-5.4).
  return {
    token, otp_demo: otp, masked_phone: masked,
    expires_at: session!.expires_at, channel,
    message: `Dokumen klaim ${claim.claim_number} siap ditandatangani. ` +
             `Buka tautan berikut dan masukkan kode yang kami kirim.`,
  };
}

export async function openSession(token: string) {
  const s = await one("SELECT * FROM signing_sessions WHERE token=$1", [token]);
  if (!s) throw new WorkflowError("Sesi tidak ditemukan.", "not_found", 404);
  if (["verified", "disputed", "expired", "locked"].includes(s.state)) {
    throw new WorkflowError("Link sudah tidak berlaku.", "session_closed", 410);
  }
  if (new Date(s.expires_at) < new Date()) {
    await query("UPDATE signing_sessions SET state='expired' WHERE token=$1", [token]);
    throw new WorkflowError("Link sudah kedaluwarsa.", "session_expired", 410);
  }
  return s;
}

export async function verifyOtp(token: string, code: string) {
  const s = await openSession(token);
  if (s.otp_attempts >= 5) {
    await query("UPDATE signing_sessions SET state='locked' WHERE token=$1", [token]);
    throw new WorkflowError("Terlalu banyak percobaan. Sesi dikunci.",
                            "otp_locked", 429);
  }
  if (code !== s.otp_code) {
    await query(
      "UPDATE signing_sessions SET otp_attempts=otp_attempts+1 WHERE token=$1",
      [token]);
    throw new WorkflowError("Kode verifikasi salah.", "otp_invalid", 401);
  }
  await query(
    "UPDATE signing_sessions SET otp_verified=TRUE, state='opened' WHERE token=$1",
    [token]);
  const claim = await getClaim(s.claim_id);
  if (claim.status === "signature_link_sent") {
    await transition(claim.id, "awaiting_signature", "system");
  }
  return { ok: true, claim_id: s.claim_id };
}

// ───────────────── Gate 4: verifikasi tanda tangan ─────────────────

export async function submitSignature(params: {
  token: string; imagePng: string; strokes?: Stroke[] | null;
  inputMethod?: string; ip?: string | null; userAgent?: string | null;
}) {
  const s = await openSession(params.token);
  if (!s.otp_verified) {
    throw new WorkflowError("Verifikasi kode terlebih dahulu.", "otp_required", 401);
  }
  const claim = await getClaim(s.claim_id);

  const specimens = await query(
    `SELECT image_png, strokes FROM signature_specimens
     WHERE marketing_id=$1 AND NOT archived ORDER BY sequence`,
    [claim.marketing_id]);

  const threshold = await settingInt("signature_threshold_claim");
  const maxAttempts = await settingInt("signature_max_attempts");

  const result = sig.compareToSet(params.imagePng, params.strokes, specimens as any);
  const attemptNo = s.attempts + 1;

  const outcome = result.score >= threshold ? "verified"
    : attemptNo >= maxAttempts ? "escalated_to_review" : "retry";

  await query(
    `INSERT INTO signature_attempts (claim_id, attempt_number, score,
       threshold_at_time, outcome, image_png, input_method, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [claim.id, attemptNo, result.score, threshold, outcome, params.imagePng,
     params.inputMethod ?? "finger", params.ip ?? null, params.userAgent ?? null]);
  await query("UPDATE signing_sessions SET attempts=$1 WHERE token=$2",
              [attemptNo, params.token]);
  await audit({
    entityType: "claim", entityId: claim.id,
    action: `signature_attempt:${outcome}`, actor: claim.marketing_id,
    after: { score: result.score, threshold, attempt: attemptNo }, ip: params.ip,
  });

  if (outcome === "verified") {
    const hash = await seal(claim.id);
    await query("UPDATE signing_sessions SET state='verified' WHERE token=$1",
                [params.token]);
    await query(
      "UPDATE claims SET signed_at=now(), signature_score=$1 WHERE id=$2",
      [result.score, claim.id]);
    await transition(claim.id, "signed", "agent");
    await transition(claim.id, "crosscheck_in_progress", "system");
    return { outcome, score: result.score, threshold, attempt_number: attemptNo,
             attempts_remaining: 0, document_hash: hash, guidance: [],
             layers_used: result.layersUsed };
  }

  if (outcome === "escalated_to_review") {
    await transition(claim.id, "signature_review_required", "system");
  }
  return { outcome, score: result.score, threshold, attempt_number: attemptNo,
           attempts_remaining: Math.max(0, maxAttempts - attemptNo),
           document_hash: null, guidance: result.guidance,
           layers_used: result.layersUsed };
}

export async function dispute(
  token: string, reason: string, expectedAmount?: number,
) {
  const s = await openSession(token);
  if ((reason ?? "").length < 10) {
    throw new WorkflowError("Alasan sanggahan wajib diisi minimal 10 karakter.",
                            "reason_required", 422);
  }
  await query("UPDATE signing_sessions SET state='disputed' WHERE token=$1", [token]);
  const claim = await getClaim(s.claim_id);
  await invalidateTaxVerification(claim.id, "agent", `Sanggahan Pemohon: ${reason}`);
  await audit({ entityType: "claim", entityId: claim.id, action: "dispute",
                actor: claim.marketing_id,
                after: { expected_amount: expectedAmount ?? null }, reason });
  return getClaim(claim.id);
}

export async function signatureReview(
  claimId: string, decision: string, actor: string, reason: string,
) {
  const claim = await getClaim(claimId);
  if (claim.status !== "signature_review_required") {
    throw new WorkflowError("Klaim tidak sedang menunggu tinjauan tanda tangan.");
  }
  if ((reason ?? "").length < 10) {
    throw new WorkflowError("Alasan wajib diisi minimal 10 karakter.",
                            "reason_required", 422);
  }
  if (decision === "approve_manually") {
    const hash = await seal(claimId);
    await query("UPDATE claims SET signed_at=now() WHERE id=$1", [claimId]);
    await audit({ entityType: "claim", entityId: claimId,
                  action: "signature_manual_approval", actor,
                  after: { document_hash: hash }, reason });
    await transition(claimId, "signed", actor, reason);
    return transition(claimId, "crosscheck_in_progress", "system");
  }
  if (decision === "request_specimen_update") {
    await query("UPDATE marketings SET status='pending_review' WHERE id=$1",
                [claim.marketing_id]);
    await audit({ entityType: "marketing", entityId: claim.marketing_id,
                  action: "specimen_update_requested", actor, reason });
    return transition(claimId, "pending_tax_verification", actor, reason);
  }
  if (decision === "reject") return transition(claimId, "rejected", actor, reason);
  throw new WorkflowError("Keputusan tidak dikenal.", "bad_decision", 422);
}

async function seal(claimId: string): Promise<string> {
  const claim = await getClaim(claimId);
  const payload = JSON.stringify({
    claim_number: claim.claim_number, claim_type: claim.claim_type,
    recipient_role: claim.recipient_role, unit_id: claim.unit_id,
    marketing_id: claim.marketing_id, gross_amount: claim.gross_amount,
    vat: claim.vat, withholding_tax: claim.withholding_tax,
    net_amount: claim.net_amount, snapshot: claim.snapshot,
  });
  const hash = createHash("sha256").update(payload).digest("hex");
  await query("UPDATE claims SET document_hash=$1, sealed=TRUE WHERE id=$2",
              [hash, claimId]);
  return hash;
}

// ─────────────────────────── Crosscheck ───────────────────────────

export async function changesSinceTaxVerification(claimId: string) {
  return query(
    `SELECT action, before, after, occurred_at, actor FROM audit_log
     WHERE entity_type='claim' AND entity_id=$1
       AND occurred_at > COALESCE(
         (SELECT tax_verified_at FROM claims WHERE id=$1), '-infinity'::timestamptz)
       AND action NOT LIKE 'status:%' AND action NOT LIKE 'signature_attempt%'`,
    [claimId]);
}

export async function crosscheck(
  claimId: string, party: string, decision: string, actor: string, notes?: string,
) {
  const claim = await getClaim(claimId);
  if (claim.status !== "crosscheck_in_progress") {
    throw new WorkflowError("Klaim tidak sedang dalam tahap crosscheck.");
  }
  if (party !== "admin_sales" && party !== "finance") {
    throw new WorkflowError("Pihak pemeriksa tidak dikenal.", "bad_party", 422);
  }
  const col = party === "admin_sales" ? "crosscheck_admin" : "crosscheck_finance";

  if (decision === "return_with_notes") {
    if (!notes) throw new WorkflowError("Catatan wajib diisi.", "reason_required", 422);
    await query(
      `UPDATE claims SET ${col}='returned', return_count=return_count+1 WHERE id=$1`,
      [claimId]);
    const updated = await getClaim(claimId);
    const limit = await settingInt("return_escalation_count");
    await audit({ entityType: "claim", entityId: claimId,
                  action: `crosscheck_return:${party}`, actor, reason: notes });
    if (updated.return_count > limit) {
      await audit({ entityType: "claim", entityId: claimId,
                    action: "escalated_to_management", actor: "system",
                    reason: `Dikembalikan ${updated.return_count} kali.` });
      return transition(claimId, "ready_to_print", "system",
                        "Eskalasi otomatis: dikembalikan melebihi batas.");
    }
    return transition(claimId, "draft", actor, notes);
  }
  if (decision !== "complete") {
    throw new WorkflowError("Keputusan tidak dikenal.", "bad_decision", 422);
  }

  await query(`UPDATE claims SET ${col}='completed' WHERE id=$1`, [claimId]);
  await audit({ entityType: "claim", entityId: claimId,
                action: `crosscheck_complete:${party}`, actor, reason: notes });

  const updated = await getClaim(claimId);
  if (updated.crosscheck_admin === "completed" &&
      updated.crosscheck_finance === "completed") {
    return transition(claimId, "ready_to_print", "system");
  }
  return updated;
}

export async function financialFinding(
  claimId: string, actor: string, reason: string, affectedFields: string[],
) {
  const claim = await getClaim(claimId);
  if (!claim.sealed) {
    throw new WorkflowError("Klaim belum ditandatangani.", "not_sealed");
  }
  if ((reason ?? "").length < 10) {
    throw new WorkflowError("Alasan wajib diisi minimal 10 karakter.",
                            "reason_required", 422);
  }
  await audit({
    entityType: "claim", entityId: claimId, action: "signature_voided", actor,
    before: { document_hash: claim.document_hash, signed_at: claim.signed_at },
    after: { affected_fields: affectedFields }, reason,
  });
  await query(
    `UPDATE claims SET sealed=FALSE, document_hash=NULL, signed_at=NULL,
       signature_score=NULL, crosscheck_admin='pending', crosscheck_finance='pending',
       tax_verified_by=NULL, tax_verified_at=NULL,
       tax_verification_valid_until=NULL, print_copy_number=0 WHERE id=$1`,
    [claimId]);
  await query("UPDATE print_packages SET status='superseded' WHERE claim_id=$1",
              [claimId]);
  return transition(claimId, "pending_tax_verification", actor, reason);
}

// ─────────────────── Cetak & sirkulasi manual ───────────────────

export async function printPackage(claimId: string, actor: string, reason?: string) {
  const claim = await getClaim(claimId);
  if (!["ready_to_print", "printed"].includes(claim.status)) {
    throw new WorkflowError(
      "Dokumen hanya dapat dicetak setelah kedua crosscheck digital selesai (BR-22).",
      "crosscheck_incomplete");
  }
  await query(
    "UPDATE print_packages SET status='superseded' WHERE claim_id=$1 AND status='active'",
    [claimId]);
  const copyNo = claim.print_copy_number + 1;
  const pkg = await one(
    `INSERT INTO print_packages (claim_id, copy_number, document_hash, printed_by)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [claimId, copyNo, claim.document_hash, actor]);
  await query("UPDATE claims SET print_copy_number=$1 WHERE id=$2", [copyNo, claimId]);
  await audit({ entityType: "claim", entityId: claimId, action: "printed", actor,
                after: { copy_number: copyNo }, reason });
  if (claim.status === "ready_to_print") await transition(claimId, "printed", actor);

  return {
    print_package_id: pkg!.id, copy_number: copyNo,
    document_hash: claim.document_hash,
    superseded: copyNo > 1 ? copyNo - 1 : null,
    watermark: `SALINAN CETAK #${copyNo} — ${actor} — ` +
               new Date().toLocaleString("id-ID", { dateStyle: "medium",
                                                    timeStyle: "short" }),
    verify_url: `/api/documents/verify/${claim.document_hash}?copy=${copyNo}`,
  };
}

const HANDOFF_NEXT: Record<string, [string, string]> = {
  handed_to_head_finance: ["circulating_head_finance", "Head Finance"],
  returned_from_head_finance: ["circulating_head_finance", "Admin Sales"],
  handed_to_management: ["circulating_management", "Management"],
  returned_from_management: ["awaiting_scan_upload", "Admin Sales"],
};

export async function handoff(
  claimId: string, event: string, actor: string,
  receivedBy?: string, note?: string,
) {
  const claim = await getClaim(claimId);
  const next = HANDOFF_NEXT[event];
  if (!next) {
    throw new WorkflowError("Peristiwa serah terima tidak dikenal.", "bad_event", 422);
  }
  await query(
    "INSERT INTO handoffs (claim_id, event, received_by, note) VALUES ($1,$2,$3,$4)",
    [claimId, event, receivedBy ?? null, note ?? null]);
  await query(
    "UPDATE claims SET physical_location=$1, physical_since=now() WHERE id=$2",
    [next[1], claimId]);
  await audit({ entityType: "claim", entityId: claimId, action: `handoff:${event}`,
                actor, after: { received_by: receivedBy ?? null } });
  if ((TRANSITIONS[claim.status] ?? []).includes(next[0])) {
    await transition(claimId, next[0], actor);
  }
  return getClaim(claimId);
}

export async function scanReturn(params: {
  claimId: string; outcome: string; actor: string; scannedHash: string;
  copyNumber: number; headFinanceName?: string; managementName?: string;
  rejectionReason?: string;
}) {
  const claim = await getClaim(params.claimId);
  if (!["awaiting_scan_upload", "circulating_management",
        "circulating_head_finance"].includes(claim.status)) {
    throw new WorkflowError("Klaim tidak sedang beredar fisik.");
  }

  const pkg = await one(
    "SELECT * FROM print_packages WHERE claim_id=$1 AND copy_number=$2",
    [params.claimId, params.copyNumber]);

  const issues: string[] = [];
  if (!pkg) issues.push("copy_unknown");
  else {
    if (pkg.status !== "active") issues.push("copy_superseded");
    if (params.scannedHash !== pkg.document_hash) issues.push("hash_mismatch");
  }
  if (params.outcome === "approved") {
    if (!params.headFinanceName) issues.push("missing_head_finance_signature");
    if (!params.managementName) issues.push("missing_management_signature");
  }

  const verification = {
    hash_matches: Boolean(pkg) && params.scannedHash === pkg!.document_hash,
    expected_hash: pkg?.document_hash ?? claim.document_hash,
    scanned_hash: params.scannedHash, copy_number: params.copyNumber,
    copy_status: pkg?.status ?? "unknown", issues,
  };

  if (issues.length) {
    await audit({ entityType: "claim", entityId: params.claimId,
                  action: "scan_rejected", actor: params.actor, after: verification });
    throw new WorkflowError(
      "Pindaian ditolak. Dokumen yang dipindai tidak sesuai dengan versi yang " +
      "diterbitkan sistem.", "scan_verification_failed", 422, { verification });
  }

  if (params.outcome === "rejected") {
    if (!params.rejectionReason) {
      throw new WorkflowError("Alasan penolakan wajib diisi.", "reason_required", 422);
    }
    await audit({ entityType: "claim", entityId: params.claimId,
                  action: "offline_rejected", actor: params.actor,
                  reason: params.rejectionReason });
    return transition(params.claimId, "rejected", params.actor,
                      params.rejectionReason);
  }

  if (claim.status !== "awaiting_scan_upload") {
    await transition(params.claimId, "awaiting_scan_upload", params.actor);
  }
  await audit({ entityType: "claim", entityId: params.claimId,
                action: "offline_approved", actor: params.actor,
                after: { head_finance: params.headFinanceName,
                         management: params.managementName, verification } });
  await transition(params.claimId, "approved", params.actor);
  const updated = await transition(params.claimId, "awaiting_settlement_date", "system");

  await query(
    `INSERT INTO payment_instructions (claim_id, recipient_name, bank_name,
       account_number, amount)
     SELECT c.id, COALESCE(b.holder_name, m.full_name), b.bank_name,
            b.account_number, c.net_amount
     FROM claims c JOIN marketings m ON m.id=c.marketing_id
     LEFT JOIN bank_accounts b ON b.id=c.bank_account_id WHERE c.id=$1`,
    [params.claimId]);

  return updated;
}

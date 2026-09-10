/**
 * Penginputan tanggal pembayaran, penguncian periode, dan rekap.
 *
 * `transfer_date` dan `recorded_at` disimpan terpisah. Seluruh rekap memakai yang
 * pertama. Query rekap yang mengelompokkan berdasarkan `recorded_at` adalah bug,
 * bukan pilihan implementasi.
 */

import { audit, one, query, settingInt, tx } from "./db";
import { transition, WorkflowError } from "./workflow";

const periodOf = (d: string) => d.slice(0, 7);

export async function periodStatus(period: string): Promise<string> {
  const row = await one<{ status: string }>(
    "SELECT status FROM accounting_periods WHERE period=$1", [period]);
  return row?.status ?? "open";
}

export async function closePeriod(period: string, actor: string) {
  await query(
    `INSERT INTO accounting_periods (period, status, closed_by, closed_at)
     VALUES ($1,'closed',$2, now())
     ON CONFLICT (period) DO UPDATE SET status='closed',
       closed_by=EXCLUDED.closed_by, closed_at=EXCLUDED.closed_at`,
    [period, actor]);
  await audit({ entityType: "accounting_period", entityId: period,
                action: "close", actor });
  return { period, status: "closed", closed_by: actor };
}

export async function reopenPeriod(period: string, actor: string, reason: string) {
  if ((reason ?? "").length < 10) {
    throw new WorkflowError("Alasan wajib diisi minimal 10 karakter.",
                            "reason_required", 422);
  }
  await query(
    `INSERT INTO accounting_periods (period, status, reopened_by, reopen_reason)
     VALUES ($1,'reopened',$2,$3)
     ON CONFLICT (period) DO UPDATE SET status='reopened',
       reopened_by=EXCLUDED.reopened_by, reopen_reason=EXCLUDED.reopen_reason`,
    [period, actor, reason]);
  await audit({ entityType: "accounting_period", entityId: period,
                action: "reopen", actor, reason });
  return { period, status: "reopened", reopened_by: actor, reason,
           affected_reports_marked_revised: ["payment_recap", "overriding_batches"] };
}

/**
 * Cari periode terbuka berikutnya.
 *
 * Bila periode berjalan sendiri sudah ditutup, entri tidak boleh dialihkan ke
 * periode yang sama — itu akan mengembalikannya ke periode terkunci.
 */
async function nextOpenPeriod(period: string, maxSteps = 24): Promise<string> {
  let [y, m] = [Number(period.slice(0, 4)), Number(period.slice(5, 7))];
  for (let i = 0; i < maxSteps; i++) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    const candidate = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
    if (await periodStatus(candidate) !== "closed") return candidate;
  }
  throw new WorkflowError(
    "Tidak ditemukan periode terbuka dalam 24 bulan ke depan. Buka salah satu " +
    "periode sebelum mencatat pembayaran.", "no_open_period", 409);
}

export async function settle(params: {
  instructionIds: string[]; transferDate: string; actor: string; actorRole: string;
  proofFile?: string; referenceNumber?: string;
  partialAmounts?: Record<string, number>; backdateReason?: string;
}) {
  const { instructionIds, transferDate, actor, actorRole } = params;

  if (!params.proofFile) {
    throw new WorkflowError(
      "Bukti transfer wajib dilampirkan. Tidak ada jalur penginputan tanggal tanpa " +
      "bukti (FR-7.8).", "proof_required", 422);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) {
    throw new WorkflowError("Format tanggal tidak valid (YYYY-MM-DD).",
                            "bad_date", 422);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const td = new Date(`${transferDate}T00:00:00Z`);
  if (td > today) {
    throw new WorkflowError(
      "Tanggal transfer tidak boleh di masa depan. Pembayaran yang belum terjadi " +
      "tidak masuk rekap (BR-29).", "future_date", 422);
  }

  const tolerance = await settingInt("backdate_tolerance_days");
  const lag = Math.round((today.getTime() - td.getTime()) / 86_400_000);
  if (lag > tolerance) {
    if (!params.backdateReason) {
      throw new WorkflowError(
        `Tanggal mundur ${lag} hari, melebihi toleransi ${tolerance} hari. ` +
        `Alasan tertulis wajib diisi (BR-30).`, "backdate_reason_required", 422);
    }
    if (actorRole !== "finance_manager") {
      throw new WorkflowError(
        `Tanggal mundur ${lag} hari memerlukan persetujuan Finance Manager (BR-30).`,
        "backdate_forbidden", 403);
    }
  }

  let targetPeriod = periodOf(transferDate);
  let redirectedFrom: string | null = null;
  if (await periodStatus(targetPeriod) === "closed") {
    redirectedFrom = targetPeriod;
    targetPeriod = await nextOpenPeriod(redirectedFrom);
    await audit({ entityType: "accounting_period", entityId: redirectedFrom,
                  action: "late_entry_redirected", actor,
                  after: { redirected_to: targetPeriod } });
  }

  return tx(async (c) => {
    const settlement = await one(
      `INSERT INTO settlements (transfer_date, recorded_by, recap_period,
         redirected_from_period, reference_number, proof_file, backdate_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [transferDate, actor, targetPeriod, redirectedFrom,
       params.referenceNumber ?? null, params.proofFile,
       params.backdateReason ?? null], c);

    const settled: any[] = [];
    const overridingUpdated: any[] = [];

    for (const iid of instructionIds) {
      const inst = await one("SELECT * FROM payment_instructions WHERE id=$1",
                             [iid], c);
      if (!inst) {
        throw new WorkflowError(`Instruksi ${iid} tidak ditemukan.`, "not_found", 404);
      }
      const amount = params.partialAmounts?.[iid] ?? (inst.amount - inst.paid_amount);
      if (amount <= 0) {
        throw new WorkflowError("Nominal pembayaran harus lebih dari nol.",
                                "bad_amount", 422);
      }
      const paid = inst.paid_amount + amount;
      const remaining = inst.amount - paid;
      const status = remaining <= 0 ? "paid" : "partially_paid";

      await query(
        "UPDATE payment_instructions SET paid_amount=$1, status=$2 WHERE id=$3",
        [paid, status, iid], c);
      await query(
        "INSERT INTO settlement_lines (settlement_id, instruction_id, amount) " +
        "VALUES ($1,$2,$3)", [settlement!.id, iid, amount], c);

      const claim = await one("SELECT * FROM claims WHERE id=$1", [inst.claim_id], c);
      const nextStatus = status === "paid" ? "paid" : "partially_paid";
      if (nextStatus !== claim.status) {
        await transition(claim.id, nextStatus, actor, null, c);
      }
      if (nextStatus === "paid") {
        await transition(claim.id, "completed", "system", null, c);
      }

      // Pembaruan rekap Overriding terjadi sebagai efek, bukan entri terpisah.
      const rows = await query(
        `SELECT r.id, u.code FROM overriding_rows r
         JOIN units u ON u.id = r.unit_id
         WHERE r.unit_id=$1 AND r.transfer_date IS NULL`, [claim.unit_id], c);
      for (const r of rows) {
        await query(
          "UPDATE overriding_rows SET transfer_date=$1, section='already_paid' " +
          "WHERE id=$2", [transferDate, r.id], c);
        overridingUpdated.push({ row_id: r.id, unit_code: r.code,
                                 transfer_date: transferDate });
      }

      const auditId = await audit({
        entityType: "claim", entityId: claim.id, action: "settled", actor,
        after: { transfer_date: transferDate, amount },
      }, c);

      settled.push({ claim_id: claim.id, claim_number: claim.claim_number, amount,
                     status: nextStatus, remaining_amount: Math.max(0, remaining),
                     audit_id: auditId });
    }

    return {
      settlement_id: settlement!.id, transfer_date: transferDate,
      recorded_at: settlement!.recorded_at, recorded_by: actor,
      recap_period: targetPeriod, redirected_from_period: redirectedFrom,
      backdate_approved: Boolean(params.backdateReason),
      settled_claims: settled, overriding_rows_updated: overridingUpdated,
    };
  });
}

export async function correctSettlement(params: {
  settlementId: string; transferDate: string; actor: string;
  actorRole: string; reason: string;
}) {
  if (params.actorRole !== "finance_manager") {
    throw new WorkflowError("Koreksi tanggal transfer memerlukan Finance Manager.",
                            "forbidden", 403);
  }
  if ((params.reason ?? "").length < 10) {
    throw new WorkflowError("Alasan wajib diisi minimal 10 karakter.",
                            "reason_required", 422);
  }
  const s = await one("SELECT * FROM settlements WHERE id=$1", [params.settlementId]);
  if (!s) throw new WorkflowError("Settlement tidak ditemukan.", "not_found", 404);

  const prev = s.transfer_date;
  await query(
    `UPDATE settlements SET previous_transfer_date=$1, transfer_date=$2,
       recap_period=$3, revised=TRUE WHERE id=$4`,
    [prev, params.transferDate, periodOf(params.transferDate), params.settlementId]);
  await query("UPDATE overriding_rows SET transfer_date=$1 WHERE transfer_date=$2",
              [params.transferDate, prev]);
  await audit({ entityType: "settlement", entityId: params.settlementId,
                action: "correct", actor: params.actor,
                before: { transfer_date: prev },
                after: { transfer_date: params.transferDate },
                reason: params.reason });
  return { settlement_id: params.settlementId, transfer_date: params.transferDate,
           previous_transfer_date: prev, revised: true };
}

const GROUP_COLUMNS: Record<string, string> = {
  claim_type: "c.claim_type::text",
  cluster: "u.cluster_code",
  recipient: "m.full_name",
  sales_group: "c.recipient_role::text",
};

export async function paymentRecap(
  periodFrom: string, periodTo: string, groupBy = "claim_type",
) {
  const col = GROUP_COLUMNS[groupBy] ?? GROUP_COLUMNS.claim_type;
  const rows = await query(
    `SELECT ${col} AS k, COUNT(*)::int AS n,
            SUM(c.gross_amount)::bigint AS g, SUM(c.vat)::bigint AS v,
            SUM(CASE WHEN c.withholding_tax_type='pph23'
                     THEN c.withholding_tax ELSE 0 END)::bigint AS p23,
            SUM(CASE WHEN c.withholding_tax_type<>'pph23'
                     THEN c.withholding_tax ELSE 0 END)::bigint AS p21,
            SUM(sl.amount)::bigint AS net
     FROM settlement_lines sl
     JOIN settlements s ON s.id = sl.settlement_id
     JOIN payment_instructions pi ON pi.id = sl.instruction_id
     JOIN claims c ON c.id = pi.claim_id
     JOIN units u ON u.id = c.unit_id
     JOIN marketings m ON m.id = c.marketing_id
     WHERE s.transfer_date BETWEEN $1::date AND $2::date
     GROUP BY k`,
    [periodFrom, periodTo]);

  const totals = { claim_count: 0, gross_amount: 0, vat: 0, pph21: 0, pph23: 0,
                   net_amount: 0 };
  const groups = rows.map((r) => {
    totals.claim_count += r.n;
    totals.gross_amount += Number(r.g ?? 0);
    totals.vat += Number(r.v ?? 0);
    totals.pph21 += Number(r.p21 ?? 0);
    totals.pph23 += Number(r.p23 ?? 0);
    totals.net_amount += Number(r.net ?? 0);
    return { key: r.k, claim_count: r.n, gross_amount: Number(r.g ?? 0),
             vat: Number(r.v ?? 0), pph21: Number(r.p21 ?? 0),
             pph23: Number(r.p23 ?? 0), net_amount: Number(r.net ?? 0) };
  });

  return { period_from: periodFrom, period_to: periodTo,
           period_status: await periodStatus(periodOf(periodFrom)), totals, groups };
}

/** Instruksi transfer yang tidak pernah dikonfirmasi tanggal pembayarannya. */
export async function bankReconciliation(minAgeDays = 7) {
  return query(
    `SELECT pi.id, c.claim_number, pi.recipient_name, pi.amount, pi.issued_at,
            EXTRACT(DAY FROM now() - pi.issued_at)::int AS age
     FROM payment_instructions pi JOIN claims c ON c.id = pi.claim_id
     WHERE pi.status IN ('pending','exported')
       AND now() - pi.issued_at >= ($1 || ' days')::interval
     ORDER BY age DESC`, [String(minAgeDays)]);
}

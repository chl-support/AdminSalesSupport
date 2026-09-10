/**
 * Uji alur ujung-ke-ujung dan penegakan gate, dijalankan langsung terhadap
 * PostgreSQL.
 *
 *   npm run test
 *
 * Yang diuji bukan hanya jalur mulus, tetapi juga bahwa gate benar-benar menahan
 * dan bahwa batasan basis data ikut bekerja.
 */

import { one, pool, query } from "../src/lib/db";
import * as calc from "../src/lib/calc";
import * as settlement from "../src/lib/settlement";
import * as wf from "../src/lib/workflow";
import { WorkflowError } from "../src/lib/workflow";
import { applyRate, ratio, rupiahWords, terbilang } from "../src/lib/money";
import { collect, preview } from "../src/lib/report";
import { seed } from "./seed";
import { signaturePng, strokes } from "./synthetic-signature";

const pass: string[] = [];
const fail: [string, string][] = [];

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass.push(name);
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    fail.push([name, e?.message ?? String(e)]);
    console.log(`  FAIL  ${name}: ${e?.message ?? e}`);
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function expectError(code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e: any) {
    if (e instanceof WorkflowError) {
      assert(e.code === code, `kode '${e.code}' bukan '${code}' (${e.message})`);
      return e;
    }
    throw e;
  }
  throw new Error(`seharusnya gagal dengan '${code}'`);
}

/** Goresan lurus — sengaja tidak mirip spesimen mana pun. */
function wrongSignature(): string {
  return signaturePng(999, 3.5);
}

async function main() {
  console.log("\n=== Menyiapkan basis data ===");
  const info = await seed();
  const unit = info.units["BIOBA2-017"];
  const agentId = info.marketings[0].id;
  const inhouseId = info.marketings[1].id;

  async function runToSettlement(claimId: string, seedIndex: number, docs: string[]) {
    for (const item of docs) {
      await query(
        "INSERT INTO claim_documents (claim_id, checklist_item) VALUES ($1,$2)",
        [claimId, item]);
    }
    await wf.submit(claimId, "admin");
    await wf.adminReview(claimId, "forward_to_tax", "admin");
    await wf.taxVerify({ claimId, decision: "approve", actor: "ratna" });
    const link = await wf.issueSignatureLink(claimId, "admin");
    await wf.verifyOtp(link.token, link.otp_demo);
    const r = await wf.submitSignature({
      token: link.token, imagePng: signaturePng(seedIndex, 0.06),
      strokes: strokes(seedIndex, 0.06), inputMethod: "stylus" });
    assert(r.outcome === "verified", `tanda tangan gagal: skor ${r.score}`);
    await wf.crosscheck(claimId, "admin_sales", "complete", "admin");
    await wf.crosscheck(claimId, "finance", "complete", "ratih");
    const pkg = await wf.printPackage(claimId, "admin");
    await wf.handoff(claimId, "handed_to_head_finance", "admin", "Sri Handayani");
    await wf.handoff(claimId, "handed_to_management", "admin", "Andreas Lim");
    await wf.handoff(claimId, "returned_from_management", "admin", "Dimas Prasetya");
    await wf.scanReturn({
      claimId, outcome: "approved", actor: "admin",
      scannedHash: pkg.document_hash!, copyNumber: pkg.copy_number,
      headFinanceName: "Sri Handayani", managementName: "Andreas Lim" });
    return pkg;
  }

  // ─────────── Uang & perhitungan ───────────
  console.log("\n=== Aritmetika uang ===");

  await check("terbilang menghasilkan kata yang benar", () => {
    assert(rupiahWords(5018125).startsWith("Lima juta"), rupiahWords(5018125));
    assert(terbilang(0) === "nol", terbilang(0));
    assert(terbilang(1000) === "seribu", terbilang(1000));
    assert(terbilang(2_500_000_000).includes("miliar"), terbilang(2_500_000_000));
  });

  await check("persentase dihitung eksak tanpa floating point", () => {
    // 185_000_000 * 0.0025 pada IEEE-754 menghasilkan 462499.99999999994.
    assert(applyRate(185_000_000, "0.0025") === 462_500,
           String(applyRate(185_000_000, "0.0025")));
    assert(applyRate(210_000_000, "0.004") === 840_000,
           String(applyRate(210_000_000, "0.004")));
    assert(ratio(163_212_500, 185_000_000).startsWith("0.88222"),
           ratio(163_212_500, 185_000_000));
  });

  await check("uang selalu integer dan PPN hanya untuk PKP", async () => {
    const u = await one("SELECT * FROM units WHERE id=$1", [unit]);
    const m = await one("SELECT * FROM marketings WHERE id=$1", [agentId]);
    const a = await one("SELECT * FROM agencies WHERE id=$1", [m.agency_id]);
    const r = await calc.calculate(u, m, a, "commission", "agent");
    for (const k of ["gross_amount", "vat", "withholding_tax", "net_amount"] as const) {
      assert(Number.isInteger(r[k]), `${k} bukan integer: ${r[k]}`);
    }
    assert(r.gross_amount === 4_625_000, String(r.gross_amount));
    assert(r.vat === 0, "penerima Non-PKP tidak dikenai PPN");
    assert(r.withholding_tax_type === "pph23", r.withholding_tax_type);
    assert(r.net_amount === r.gross_amount + r.vat - r.withholding_tax, "net keliru");
  });

  await check("matriks tarif memilih baris paling spesifik", async () => {
    const m = await one("SELECT * FROM marketings WHERE id=$1", [inhouseId]);
    const ctx = calc.recipientContext(m, null);
    const final = await calc.findTaxRate("pph_final", ctx, "2026-06-14");
    assert(final && Number(final.rate) === 0.005,
           "NPWP pribadi seharusnya PPh final 0,5%");
    const vat2021 = await calc.findTaxRate("vat", ctx, "2021-01-01");
    assert(Number(vat2021.rate) === 0.1, "kontrak 2021 seharusnya PPN 10%");
    const vat2026 = await calc.findTaxRate("vat", ctx, "2026-01-01");
    assert(Number(vat2026.rate) === 0.11, "kontrak 2026 seharusnya PPN 11%");
  });

  await check("prasyarat pencairan menahan unit yang belum layak", async () => {
    const u = await one("SELECT * FROM units WHERE code='BIOBA7-021'");
    const a = calc.eligibility(u, "overriding");
    assert(!a.ok && a.missing.some((m) => m.includes("Sign P3U")),
           JSON.stringify(a.missing));
    const u2 = await one("SELECT * FROM units WHERE code='BIOBB-07'");
    const b = calc.eligibility(u2, "commission");
    assert(!b.ok && b.missing.some((m) => m.toLowerCase().includes("management")),
           JSON.stringify(b.missing));
  });

  // ─────────── Kardinalitas ───────────
  console.log("\n=== Kardinalitas klaim (PRD 7.B.2) ===");
  const claims: Record<string, string> = {};

  await check("satu unit boleh punya beberapa Closing Fee dengan peran berbeda",
    async () => {
      const c1 = await wf.createClaim({ unitId: unit, marketingId: inhouseId,
        claimType: "closing_fee", recipientRole: "sales_inhouse", actor: "admin" });
      const c2 = await wf.createClaim({ unitId: unit, marketingId: inhouseId,
        claimType: "closing_fee", recipientRole: "sales_manager_inhouse",
        actor: "admin" });
      claims.cf1 = c1.id; claims.cf2 = c2.id;
      assert(c1.id !== c2.id, "dua klaim harus berbeda");
      await expectError("duplicate_claim", () => wf.createClaim({
        unitId: unit, marketingId: inhouseId, claimType: "closing_fee",
        recipientRole: "sales_inhouse", actor: "admin" }));
    });

  await check("UNIQUE INDEX parsial menegakkan anti-duplikat di basis data",
    async () => {
      const idx = await one(
        `SELECT indexdef FROM pg_indexes WHERE indexname='uniq_active_claim'`);
      assert(idx, "indeks uniq_active_claim tidak ada");
      assert(idx.indexdef.includes("recipient_role"),
             "indeks harus mencakup recipient_role");
    });

  await check("klaim komisi terbentuk dengan nilai terhitung", async () => {
    const c = await wf.createClaim({ unitId: unit, marketingId: agentId,
      claimType: "commission", recipientRole: "agent", actor: "admin" });
    claims.kms = c.id;
    assert(c.net_amount === 4_625_000 - 92_500, String(c.net_amount));
  });

  await check("CHECK constraint menolak nilai bersih yang tidak konsisten",
    async () => {
      let rejected = false;
      try {
        await query("UPDATE claims SET net_amount = net_amount + 1 WHERE id=$1",
                    [claims.kms]);
      } catch (e: any) {
        rejected = String(e.constraint ?? e.message).includes("net_amount_consistent");
      }
      assert(rejected, "basis data seharusnya menolak net_amount yang tidak konsisten");
    });

  // ─────────── Alur utama ───────────
  console.log("\n=== Alur pengajuan sampai tanda tangan ===");
  const cid = claims.kms;

  await check("pengajuan ditolak bila checklist belum lengkap", async () => {
    const e = await expectError("documents_incomplete", () => wf.submit(cid, "admin"));
    assert((e.extra.missing_items as string[]).length > 0, "daftar kurang kosong");
  });

  await check("klaim lengkap maju ke antrean verifikasi pajak", async () => {
    for (const item of ["fpu", "spu", "ppjb", "kwitansi", "invoice", "ktp", "npwp",
                        "bank_account", "non_pkp_statement"]) {
      await query(
        "INSERT INTO claim_documents (claim_id, checklist_item) VALUES ($1,$2)",
        [cid, item]);
    }
    let c = await wf.submit(cid, "admin");
    assert(c.status === "pending_admin_review", c.status);
    c = await wf.adminReview(cid, "forward_to_tax", "admin");
    assert(c.status === "pending_tax_verification", c.status);
  });

  await check("GATE: link tanda tangan ditahan sebelum verifikasi pajak", () =>
    expectError("tax_gate_not_passed", () => wf.issueSignatureLink(cid, "admin"))
      .then(() => undefined));

  await check("koreksi pajak wajib disertai alasan", () =>
    expectError("reason_required", () => wf.taxVerify({
      claimId: cid, decision: "approve_with_correction", actor: "ratna",
      corrected: { withholding_tax: 231250 }, reason: "pendek" }))
      .then(() => undefined));

  await check("verifikasi pajak mengunci nilai dan mencatat koreksi", async () => {
    const c = await wf.taxVerify({
      claimId: cid, decision: "approve_with_correction", actor: "ratna",
      corrected: { withholding_tax: 231_250 },
      reason: "Penerima tidak memiliki NPWP aktif, tarif PPh menyesuaikan." });
    assert(c.status === "tax_verified", c.status);
    assert(c.tax_corrected === true, "flag koreksi tidak terpasang");
    assert(c.net_amount === 4_393_750, String(c.net_amount));
    assert(Boolean(c.tax_verification_valid_until), "masa berlaku tidak diisi");
  });

  let token = "", otp = "", docHash = "";

  await check("link terbit setelah gate pajak terlewati", async () => {
    const r = await wf.issueSignatureLink(cid, "admin");
    token = r.token; otp = r.otp_demo;
    assert(token.length > 20 && otp.length === 6, "token atau OTP tidak wajar");
    assert(!/\d{3}\.\d{3}/.test(r.message), "pesan tidak boleh memuat nominal");
  });

  await check("tanda tangan ditolak sebelum OTP diverifikasi", () =>
    expectError("otp_required", () => wf.submitSignature({
      token, imagePng: wrongSignature() })).then(() => undefined));

  await check("OTP salah ditolak, OTP benar membuka sesi", async () => {
    await expectError("otp_invalid", () => wf.verifyOtp(token, "000000"));
    const r = await wf.verifyOtp(token, otp);
    assert(r.ok, "OTP benar seharusnya diterima");
  });

  await check("tanda tangan tidak cocok meminta ulang, bukan menolak", async () => {
    const r = await wf.submitSignature({
      token, imagePng: wrongSignature(), inputMethod: "mouse" });
    assert(r.outcome === "retry", `outcome ${r.outcome}, skor ${r.score}`);
    assert(r.attempts_remaining === 2, String(r.attempts_remaining));
    assert(r.guidance.length > 0, "kegagalan harus disertai saran perbaikan");
    assert(r.score < r.threshold, "skor seharusnya di bawah ambang");
  });

  await check("tanda tangan cocok terverifikasi dan menyegel dokumen", async () => {
    const r = await wf.submitSignature({
      token, imagePng: signaturePng(1, 0.06), strokes: strokes(1, 0.06),
      inputMethod: "stylus" });
    assert(r.outcome === "verified", `outcome ${r.outcome}, skor ${r.score}`);
    assert(Boolean(r.document_hash), "dokumen harus tersegel");
    assert(r.layers_used.includes("dynamic"), JSON.stringify(r.layers_used));
    docHash = r.document_hash!;
  });

  await check("GATE: dokumen bersegel tidak dapat dihitung ulang", async () => {
    const c = await wf.getClaim(cid);
    assert(c.sealed === true, "flag sealed tidak terpasang");
    await expectError("document_sealed", () => wf.recalculate(cid, "admin"));
  });

  // ─────────── Crosscheck & cetak ───────────
  console.log("\n=== Crosscheck & cetak ===");

  await check("klaim maju hanya setelah kedua crosscheck selesai", async () => {
    let c = await wf.crosscheck(cid, "admin_sales", "complete", "admin");
    assert(c.status === "crosscheck_in_progress", "seharusnya menunggu Finance");
    c = await wf.crosscheck(cid, "finance", "complete", "ratih");
    assert(c.status === "ready_to_print", c.status);
  });

  let copyNo = 0;

  await check("cetak ulang menerbitkan salinan baru dan membatalkan yang lama",
    async () => {
      const r1 = await wf.printPackage(cid, "admin");
      assert(r1.copy_number === 1, String(r1.copy_number));
      assert(r1.document_hash === docHash, "hash cetakan tidak cocok");
      const r2 = await wf.printPackage(cid, "admin", "cetakan pertama tertinggal");
      assert(r2.copy_number === 2 && r2.superseded === 1, JSON.stringify(r2));
      copyNo = r2.copy_number;
    });

  await check("titik serah terima tercatat dan mengubah posisi dokumen", async () => {
    await wf.handoff(cid, "handed_to_head_finance", "admin", "Sri Handayani");
    let c = await wf.getClaim(cid);
    assert(c.physical_location === "Head Finance", c.physical_location);
    await wf.handoff(cid, "handed_to_management", "admin", "Andreas Lim");
    await wf.handoff(cid, "returned_from_management", "admin", "Dimas Prasetya");
    c = await wf.getClaim(cid);
    assert(c.status === "awaiting_scan_upload", c.status);
  });

  await check("GATE: pindaian dengan hash keliru ditolak", async () => {
    const e = await expectError("scan_verification_failed", () => wf.scanReturn({
      claimId: cid, outcome: "approved", actor: "admin",
      scannedHash: "hash-yang-salah", copyNumber: copyNo,
      headFinanceName: "Sri Handayani", managementName: "Andreas Lim" }));
    assert((e.extra.verification as any).issues.includes("hash_mismatch"),
           JSON.stringify(e.extra));
  });

  await check("GATE: salinan yang sudah digantikan ditolak", async () => {
    const e = await expectError("scan_verification_failed", () => wf.scanReturn({
      claimId: cid, outcome: "approved", actor: "admin", scannedHash: docHash,
      copyNumber: 1, headFinanceName: "Sri Handayani",
      managementName: "Andreas Lim" }));
    assert((e.extra.verification as any).issues.includes("copy_superseded"),
           JSON.stringify(e.extra));
  });

  await check("GATE: tanda tangan basah tidak lengkap menahan klaim", async () => {
    const e = await expectError("scan_verification_failed", () => wf.scanReturn({
      claimId: cid, outcome: "approved", actor: "admin", scannedHash: docHash,
      copyNumber: copyNo, headFinanceName: "Sri Handayani" }));
    assert((e.extra.verification as any).issues
      .includes("missing_management_signature"), JSON.stringify(e.extra));
  });

  await check("pindaian benar menyetujui klaim dan menerbitkan instruksi transfer",
    async () => {
      const c = await wf.scanReturn({
        claimId: cid, outcome: "approved", actor: "admin", scannedHash: docHash,
        copyNumber: copyNo, headFinanceName: "Sri Handayani",
        managementName: "Andreas Lim" });
      assert(c.status === "awaiting_settlement_date", c.status);
      const inst = await one("SELECT * FROM payment_instructions WHERE claim_id=$1",
                             [cid]);
      assert(inst && inst.amount === 4_393_750, JSON.stringify(inst));
    });

  // ─────────── Settlement ───────────
  console.log("\n=== Tanggal pembayaran & rekap ===");
  const instId = (await one("SELECT id FROM payment_instructions WHERE claim_id=$1",
                            [cid]))!.id;
  const today = new Date().toISOString().slice(0, 10);

  await check("GATE: tanggal transfer wajib disertai bukti", () =>
    expectError("proof_required", () => settlement.settle({
      instructionIds: [instId], transferDate: today, actor: "ratih",
      actorRole: "finance_payment" })).then(() => undefined));

  await check("GATE: tanggal transfer di masa depan ditolak", () => {
    const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    return expectError("future_date", () => settlement.settle({
      instructionIds: [instId], transferDate: future, actor: "ratih",
      actorRole: "finance_payment", proofFile: "bukti.pdf" })).then(() => undefined);
  });

  await check("GATE: mundur melebihi toleransi perlu alasan dan Finance Manager",
    async () => {
      const old = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      await expectError("backdate_reason_required", () => settlement.settle({
        instructionIds: [instId], transferDate: old, actor: "ratih",
        actorRole: "finance_payment", proofFile: "bukti.pdf" }));
      await expectError("backdate_forbidden", () => settlement.settle({
        instructionIds: [instId], transferDate: old, actor: "ratih",
        actorRole: "finance_payment", proofFile: "bukti.pdf",
        backdateReason: "terlambat dicatat" }));
    });

  await check("tanggal transfer tersimpan dan klaim selesai", async () => {
    const r = await settlement.settle({
      instructionIds: [instId], transferDate: today, actor: "ratih",
      actorRole: "finance_payment", proofFile: "bukti_transfer.pdf",
      referenceNumber: "TRF/09/0001" });
    assert(r.settled_claims[0].status === "paid", JSON.stringify(r.settled_claims));
    assert(r.recap_period === today.slice(0, 7), r.recap_period);
    const c = await wf.getClaim(cid);
    assert(c.status === "completed", c.status);
  });

  await check("rekap memakai tanggal transfer, bukan tanggal input", async () => {
    const rec = await settlement.paymentRecap("2020-01-01", "2100-01-01");
    assert(rec.totals.net_amount === 4_393_750, JSON.stringify(rec.totals));
    assert(rec.totals.claim_count === 1, String(rec.totals.claim_count));
  });

  await check("periode tertutup mengalihkan entri terlambat ke periode terbuka",
    async () => {
      const p = today.slice(0, 7);
      await settlement.closePeriod(p, "fmanager");
      const c2 = await wf.createClaim({ unitId: unit, marketingId: inhouseId,
        claimType: "cash_reward", recipientRole: "sales_inhouse", actor: "admin" });
      await runToSettlement(c2.id, 2,
        ["fpu", "spu", "ppjb", "kwitansi", "ktp", "npwp", "bank_account"]);
      const inst2 = (await one(
        "SELECT id FROM payment_instructions WHERE claim_id=$1", [c2.id]))!.id;
      const r = await settlement.settle({
        instructionIds: [inst2], transferDate: today, actor: "fmanager",
        actorRole: "finance_manager", proofFile: "bukti.pdf" });
      assert(r.redirected_from_period === p, JSON.stringify(r));
      assert(r.recap_period !== p,
             "entri terlambat tidak boleh dialihkan kembali ke periode terkunci");
      assert(r.recap_period > p, r.recap_period);
    });

  // ─────────── Sanggahan & temuan finansial ───────────
  console.log("\n=== Sanggahan dan temuan finansial ===");

  await check("sanggahan mengembalikan klaim ke antrean pajak tanpa menandatangani",
    async () => {
      const id = claims.cf1;
      for (const item of ["fpu", "spu", "ktp", "npwp", "booking_fee_proof"]) {
        await query(
          "INSERT INTO claim_documents (claim_id, checklist_item) VALUES ($1,$2)",
          [id, item]);
      }
      await wf.submit(id, "admin");
      await wf.adminReview(id, "forward_to_tax", "admin");
      await wf.taxVerify({ claimId: id, decision: "approve", actor: "ratna" });
      const link = await wf.issueSignatureLink(id, "admin");
      await wf.verifyOtp(link.token, link.otp_demo);
      const after = await wf.dispute(link.token,
        "Nominal tidak sesuai perhitungan saya.");
      assert(after.status === "pending_tax_verification", after.status);
      assert(after.tax_verified_at === null, "verifikasi pajak harus dibatalkan");
    });

  await check("temuan finansial membatalkan tanda tangan dan mengulang alur",
    async () => {
      const id = claims.cf2;
      for (const item of ["fpu", "spu", "ktp", "npwp", "booking_fee_proof"]) {
        await query(
          "INSERT INTO claim_documents (claim_id, checklist_item) VALUES ($1,$2)",
          [id, item]);
      }
      await wf.submit(id, "admin");
      await wf.adminReview(id, "forward_to_tax", "admin");
      await wf.taxVerify({ claimId: id, decision: "approve", actor: "ratna" });
      const link = await wf.issueSignatureLink(id, "admin");
      await wf.verifyOtp(link.token, link.otp_demo);
      const r = await wf.submitSignature({
        token: link.token, imagePng: signaturePng(2, 0.06),
        strokes: strokes(2, 0.06), inputMethod: "stylus" });
      assert(r.outcome === "verified", `outcome ${r.outcome}, skor ${r.score}`);
      await wf.crosscheck(id, "admin_sales", "complete", "admin");
      const after = await wf.financialFinding(id, "ratih",
        "Basis perhitungan keliru, PPN tidak seharusnya dikenakan.", ["vat"]);
      assert(after.status === "pending_tax_verification", after.status);
      assert(after.sealed === false && after.document_hash === null,
             "segel harus dilepas");
      const voided = await one<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM audit_log
         WHERE entity_id=$1 AND action='signature_voided'`, [id]);
      assert(voided!.n === 1, "pembatalan tanda tangan harus tercatat di audit");
    });

  // ─────────── Audit & laporan ───────────
  console.log("\n=== Audit & laporan ===");

  await check("audit_log menolak UPDATE dan DELETE", async () => {
    const row = await one<{ id: string }>("SELECT id FROM audit_log LIMIT 1");
    const before = await one<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM audit_log");
    await query("UPDATE audit_log SET action='diubah' WHERE id=$1", [row!.id]);
    await query("DELETE FROM audit_log WHERE id=$1", [row!.id]);
    const after = await one<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM audit_log");
    const still = await one("SELECT action FROM audit_log WHERE id=$1", [row!.id]);
    assert(before!.n === after!.n, "jumlah entri berubah — DELETE tidak tertahan");
    assert(still && still.action !== "diubah", "UPDATE tidak tertahan");
  });

  await check("export laporan master menghasilkan seksi yang benar", async () => {
    const prev = await preview();
    const labels = Object.fromEntries(
      prev.sections.map((s) => [s.label, s.row_count]));
    assert(labels["BATAL UNIT"] === 1, JSON.stringify(labels));
    assert(labels["(Pindah Unit ke Unit lain)"] === 1, JSON.stringify(labels));
    assert(labels["MANAGEMENT (NO CLOSING FEE, REWARD & COMMISSION)"] === 1,
           JSON.stringify(labels));
    assert(labels["CLOSING FEE, REWARD & COMMISSION"] === 3, JSON.stringify(labels));
  });

  await check("workbook berisi baris TOTAL berformula, bukan konstanta", async () => {
    const { buildWorkbook } = await import("../src/lib/report");
    const wb = await buildWorkbook(await collect());
    const ws = wb.worksheets[0];
    let found = false;
    ws.eachRow((row) => {
      if (row.getCell(5).value === "TOTAL") {
        const cell = row.getCell(13);
        found = typeof cell.value === "object" && cell.value !== null &&
                "formula" in (cell.value as any);
      }
    });
    assert(found, "baris TOTAL harus memakai formula SUM");
  });

  await check("modul laporan tidak menyediakan jalur tulis", async () => {
    const mod: Record<string, unknown> = await import("../src/lib/report");
    const writers = Object.keys(mod).filter((k) =>
      /^(write|update|save|insert)/i.test(k));
    assert(writers.length === 0,
           `laporan adalah view, tidak boleh punya: ${writers.join(", ")}`);
  });

  console.log("\n" + "=".repeat(62));
  console.log(`  LULUS ${pass.length}   GAGAL ${fail.length}`);
  if (fail.length) {
    console.log("\n  Yang gagal:");
    for (const [n, e] of fail) console.log(`   - ${n}: ${e}`);
  }
  console.log("=".repeat(62));

  await pool.end();
  process.exit(fail.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});

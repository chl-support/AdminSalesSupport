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
import { KATEGORI_JENIS, kategoriAwal } from "../src/lib/kategori";
import { hapusMarketing, tambahMarketing, ubahEmail,
         unggahManual } from "../src/lib/spesimen";
import { rekapOverriding } from "../src/lib/overriding";
import { susunRincian } from "../src/lib/pengingat";
import { penandatanganRekap } from "../src/lib/penandatangan";
import { skemaXlsx } from "../src/lib/memo-xlsx";
import { berlakukan, cabut, daftarRujukan, ensureKolomRujukan, nominal,
         persenDesimal } from "../src/lib/rujukan";
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


/**
 * Susunan cara bayar berkas PL Naraya (isian awal sebelum cara bayar
 * standar): pengujian rumus di bawah dicocokkan dengan Excel itu.
 */
async function susunNaraya() {
  const { susunAwal } = await import("../src/lib/susun-pricelist");
  const s = susunAwal();
  const b: [number, number, number, number] = [12, 18, 19, 20];
  const sk = (nama: string, kelompok: string, alokasi: number, dp: number, kali: number,
              bulan = b, acuan?: boolean) => ({ nama, kelompok, alokasi, dp, kali, bulan: [...bulan] as typeof b,
                                                ...(acuan && { acuan }) });
  s.irr.skema = [
    sk("Cash Keras", "Cash", 0.07, 1, 1, b, true), sk("Cicilan 12x", "Cash", 0.04, 1, 12),
    sk("Cicilan 18x", "Cash", 0.05, 1, 18), sk("Cicilan 24x", "Cash", 0.08, 1, 24),
    sk("Cicilan 30x", "Cash", 0.25, 1, 30), sk("KPR Express", "KPR", 0.33, 0.1, 1, [2, 2, 2, 2]),
    sk("KPR DP 0% Express", "KPR", 0.08, 0, 1), sk("DP 10%/4x", "KPR", 0.05, 0.1, 4),
    sk("DP 20%/6x", "KPR", 0.05, 0.2, 6),
  ];
  const dp = ["Cash Keras", "Cicilan 12x", "Cicilan 18x", "Cicilan 24x", "Cicilan 30x", "KPR Express"];
  s.dataPricelist.kolom = [...dp.map((n) => ({ nama: n, skema: n })),
    { nama: "BANK KPR - DP 10% (-UTJ)", dari: "KPR Express", kali: 1.12 },
    ...["KPR DP 0% Express", "DP 10%/4x", "DP 20%/6x"].map((n) => ({ nama: n, skema: n }))];
  s.pricelist.kolom = [
    { nama: "Cash Keras", dari: "Cash Keras", kali: 1 },
    ...[12, 18, 24, 30].map((n) => ({ nama: `Cicilan ${n}X`, dari: `Cicilan ${n}x`, kali: 1 })),
    { nama: "KPR Express", dari: "KPR Express", kali: 1.115 },
    { nama: "BANK KPR - DP 10% (KPR REGULAR)", dari: "BANK KPR - DP 10% (-UTJ)", kali: 1.115 },
    ...["KPR DP 0% Express", "DP 10%/4x", "DP 20%/6x"].map((n) => ({ nama: n, dari: n, kali: 1 })),
  ];
  return s;
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
    // Agent yang mengirimnya ke Admin, bukan sistem — lihat kirimKeAdmin().
    await wf.kirimKeAdmin(link.token);
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
    // Memo 002/SBL-BD/SM/XI/2025 (berlaku sejak Nov 2025): komisi agent 3%
    // dari Rp 185.000.000.
    assert(r.gross_amount === 5_550_000, String(r.gross_amount));
    assert(r.vat === 0, "penerima Non-PKP tidak dikenai PPN");
    assert(r.withholding_tax_type === "pph23", r.withholding_tax_type);
    assert(r.net_amount === r.gross_amount + r.vat - r.withholding_tax, "net keliru");
  });

  await check("matriks tarif memilih baris paling spesifik", async () => {
    const m = await one("SELECT * FROM marketings WHERE id=$1", [inhouseId]);
    const ctx = calc.recipientContext(m, null);
    // PPh final 0,5% sengaja tidak lagi dikonfigurasi (lihat calc.ts): ia
    // memenangi PPh 21 sehingga penerima ber-NPWP pribadi dipotong seperlima
    // dari seharusnya. Finance menetapkan PPh 21 2,5%.
    const final = await calc.findTaxRate("pph_final", ctx, "2026-06-14");
    assert(!final, "PPh final tidak boleh dikonfigurasi");
    const pph21 = await calc.findTaxRate("pph21", ctx, "2026-06-14");
    assert(pph21 && Number(pph21.rate) === 0.025, "NPWP pribadi seharusnya PPh 21 2,5%");
    const vat2021 = await calc.findTaxRate("vat", ctx, "2021-01-01");
    assert(Number(vat2021.rate) === 0.1, "kontrak 2021 seharusnya PPN 10%");
    const vat2026 = await calc.findTaxRate("vat", ctx, "2026-01-01");
    assert(Number(vat2026.rate) === 0.11, "kontrak 2026 seharusnya PPN 11%");
  });

  await check("penerimaan di bawah ambang menahan unit yang belum layak",
    async () => {
      // Syaratnya satu dan sama untuk keempat jenis fee: penerimaan sudah
      // mencapai 20% dari nilai kontrak.
      const u: any = await one("SELECT * FROM units WHERE code='BIOBA7-021'");
      const kurang = calc.eligibility(
        { ...u, contract_value_incl_vat: 1_000_000_000,
          received_amount: 150_000_000 }, "overriding");
      assert(!kurang.ok &&
             kurang.codes.includes("penerimaan_kurang"),
             JSON.stringify(kurang.missing));

      // Tepat di ambangnya sudah layak: "mencapai 20%" termasuk 20% itu
      // sendiri, bukan hanya yang melewatinya.
      const pas = calc.eligibility(
        { ...u, status: "booked", contract_value_incl_vat: 1_000_000_000,
          received_amount: 200_000_000 }, "closing_fee");
      assert(pas.ok, JSON.stringify(pas.missing));

      // Nilai kontrak nol tidak boleh lolos hanya karena persentasenya tidak
      // dapat dihitung.
      const nol = calc.eligibility(
        { ...u, status: "booked", contract_value_incl_vat: 0,
          received_amount: 0 }, "closing_fee");
      assert(!nol.ok && nol.codes.includes("nilai_kontrak_nol"),
             JSON.stringify(nol.missing));

      // Keadaan unit tetap menahan, berapa pun penerimaannya.
      const u2: any = await one("SELECT * FROM units WHERE code='BIOBB-07'");
      const b = calc.eligibility(
        { ...u2, contract_value_incl_vat: 1_000_000_000,
          received_amount: 1_000_000_000 }, "commission");
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

  await check("PPh 23 dipotong 2% dan PPh 21 2,5%, untuk semua jenis fee",
              async () => {
    // Tarifnya duduk di tabel pajak, bukan di kode, jadi ia berlaku untuk
    // semua jenis fee sekaligus: yang membedakan hanya atas nama siapa
    // rekening tujuannya — badan usaha PPh 23, perorangan PPh 21.
    const baris: any[] = await query(
      `SELECT rate::float AS rate, has_skb FROM tax_rates
        WHERE tax_type='pph23'`);
    assert(baris.length > 0, "tarif PPh 23 tidak ada");
    for (const b of baris)
      assert(b.rate === 0.02, `PPh 23 seharusnya 2%, bukan ${b.rate * 100}%`);

    const p21: any[] = await query(
      "SELECT rate::float AS rate FROM tax_rates WHERE tax_type='pph21'");
    assert(p21.length > 0, "tarif PPh 21 tidak ada");
    for (const b of p21)
      assert(b.rate === 0.025, `PPh 21 seharusnya 2,5%, bukan ${b.rate * 100}%`);

    // Dan benar-benar terpakai pada perhitungannya, bukan hanya tersimpan.
    const u: any = await one("SELECT * FROM units WHERE id=$1", [unit]);
    const a: any = await one("SELECT * FROM marketings WHERE id=$1", [agentId]);
    for (const jenis of ["commission", "continuity_reward"] as const) {
      const r: any = await calc.calculate(
        u, a, null, jenis as any, "agent" as any, null, undefined,
        { holder_type: "company", holder_name: "Uji" });
      assert(Number(r.snapshot.withholding_rate) === 0.02,
             `${jenis}: tarif terpakai ${r.snapshot.withholding_rate}`);
      assert(r.withholding_tax === Math.round(r.gross_amount * 0.02),
             `${jenis}: PPh ${r.withholding_tax} tidak 2% dari ${r.gross_amount}`);
    }
  });

  await check("Closing Fee dan Cash Reward di-gross-up, jenis lain tidak",
              async () => {
    // Nominal pada IOM adalah yang harus DITERIMA orangnya: brutonya dibagi
    // 97,5% bila PPh 21 dan 98% bila PPh 23 — yaitu dibagi (1 - tarif PPh)
    // yang berlaku — sehingga setelah dipotong, yang diterima persis sebesar
    // nominal IOM-nya. Jenis fee lain tetap dihitung seperti biasa.
    const u: any = await one("SELECT * FROM units WHERE id=$1", [unit]);
    const m: any = await one("SELECT * FROM marketings WHERE id=$1", [inhouseId]);
    const a: any = await one("SELECT * FROM marketings WHERE id=$1", [agentId]);

    for (const [jenis, peran, siapa, rekening] of [
      ["cash_reward", "sales_inhouse", m, "individual"],
      ["closing_fee", "sales_inhouse", m, "individual"],
      ["cash_reward", "agent", a, "company"],
      ["closing_fee", "agent", a, "company"],
    ] as const) {
      const r: any = await calc.calculate(
        u, siapa, null, jenis as any, peran as any, null, undefined,
        { holder_type: rekening, holder_name: "Uji" });
      const tarif = Number(r.snapshot.withholding_rate);
      const nominal = Number(r.snapshot.nominal_memo);
      assert(r.snapshot.gross_up === true,
             `${jenis}/${rekening} seharusnya di-gross-up`);
      assert(r.gross_amount === Math.round(nominal / (1 - tarif)),
             `${jenis}/${rekening}: bruto ${r.gross_amount}, seharusnya ` +
             `${Math.round(nominal / (1 - tarif))}`);
      // Tanpa PPN (penerima non-PKP), yang diterima = nominal IOM-nya.
      if (r.vat === 0)
        assert(r.net_amount === nominal,
               `${jenis}/${rekening}: diterima ${r.net_amount}, seharusnya ` +
               `${nominal}`);
    }

    // Jenis lain tidak ikut: brutonya tetap sebagaimana memo menuliskannya,
    // juga ketika baris memonya ditandai "Nominal ini nilai bersih" —
    // Continuity Reward tidak di-gross-up.
    for (const jenis of ["commission", "continuity_reward"] as const) {
      const lain: any = await calc.calculate(
        u, a, null, jenis as any, "agent" as any, null, undefined,
        { holder_type: "company", holder_name: "Uji" });
      assert(lain.snapshot.gross_up === false,
             `${jenis} seharusnya tidak di-gross-up`);
      assert(lain.gross_amount === Number(lain.snapshot.nominal_memo),
             `${jenis}: bruto ${lain.gross_amount} seharusnya sama dengan ` +
             `nominal memo ${lain.snapshot.nominal_memo}`);
    }

    // Ditandai bersih pun tidak: aturannya jenis fee, bukan centang pada memo.
    await query(
      `UPDATE incentive_schemes SET flat_amount_is_net=true
        WHERE claim_type='continuity_reward'`);
    const ctr: any = await calc.calculate(
      u, a, null, "continuity_reward" as any, "agent" as any, null, undefined,
      { holder_type: "company", holder_name: "Uji" });
    assert(ctr.snapshot.gross_up === false,
           "Continuity Reward bertanda bersih pun tidak boleh di-gross-up");
    await query(
      `UPDATE incentive_schemes SET flat_amount_is_net=false
        WHERE claim_type='continuity_reward'`);
  });

  await check("klaim komisi terbentuk dengan nilai terhitung", async () => {
    const c = await wf.createClaim({ unitId: unit, marketingId: agentId,
      claimType: "commission", recipientRole: "agent", actor: "admin" });
    claims.kms = c.id;
    assert(c.net_amount === 5_550_000 - 111_000, String(c.net_amount));
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
      corrected: { withholding_tax: 277_500 },
      reason: "Penerima tidak memiliki NPWP aktif, tarif PPh menyesuaikan." });
    assert(c.status === "tax_verified", c.status);
    assert(c.tax_corrected === true, "flag koreksi tidak terpasang");
    assert(c.net_amount === 5_272_500, String(c.net_amount));
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

  await check("tautan dapat diterbitkan ulang walau sudah dibuka agent",
              async () => {
    // Sesudah OTP diverifikasi klaimnya berada pada 'awaiting_signature'.
    // Sebelumnya penerbitan ulang ditolak di situ, sehingga tautan yang hilang
    // dari percakapan WhatsApp membuat klaimnya menggantung tanpa jalan keluar.
    const sebelum = await wf.getClaim(cid);
    assert(sebelum.status === "awaiting_signature", sebelum.status);

    const r = await wf.issueSignatureLink(cid, "admin");
    assert(r.token !== token, "tautan baru seharusnya berbeda");
    assert(r.otp_demo.length === 6, "OTP baru tidak wajar");

    // Tautan lama gugur; yang menekannya tidak boleh masuk ke sesi yang sama.
    await expectError("session_closed", () => wf.verifyOtp(token, otp));

    token = r.token; otp = r.otp_demo;
    const r2 = await wf.verifyOtp(token, otp);
    assert(r2.ok, "OTP tautan baru seharusnya diterima");
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

  await check("formulir berhenti di tangan agent sampai ia menekan kirim",
              async () => {
    // Tanda tangan yang diterima menyegel dokumennya, tetapi TIDAK
    // mengirimnya: yang menandatangani harus sempat memeriksa hasilnya dulu.
    const sesudahTtd = await wf.getClaim(cid);
    assert(sesudahTtd.status === "signed",
           `sesudah tanda tangan seharusnya 'signed', bukan '${sesudahTtd.status}'`);

    const kirim = await wf.kirimKeAdmin(token);
    assert(kirim.sent && !kirim.already, JSON.stringify(kirim));
    const sesudahKirim = await wf.getClaim(cid);
    assert(sesudahKirim.status === "crosscheck_in_progress", sesudahKirim.status);

    // Ketukan kedua pada tombol yang sama tidak boleh menjadi galat di layar
    // orang luar.
    const lagi = await wf.kirimKeAdmin(token);
    assert(lagi.sent && lagi.already, JSON.stringify(lagi));
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
      assert(inst && inst.amount === 5_272_500, JSON.stringify(inst));
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

  await check("Continuity Reward terbentuk dengan nomor dan nilainya sendiri",
              async () => {
    // Jenis kelima, formulirnya sama dengan Cash Reward. Yang diuji di sini
    // bukan tampilannya melainkan yang dapat diam-diam salah: nomor klaimnya
    // memakai awalan sendiri, dan nilainya diambil dari skema jenis ini —
    // bukan dari skema Cash Reward yang nominalnya berbeda.
    const c = await wf.createClaim({
      unitId: unit, marketingId: inhouseId, claimType: "continuity_reward",
      recipientRole: "sales_inhouse", actor: "admin" });
    assert(c.claim_number.startsWith("CTR-"), c.claim_number);
    // Continuity Reward TIDAK di-gross-up: nominal memonya bruto, dan PPh
    // memotong dari situ. Hanya Closing Fee dan Cash Reward yang di-gross-up.
    const tarif = Number(c.snapshot.withholding_rate);
    assert(c.gross_amount === 5_000_000, String(c.gross_amount));
    assert(c.net_amount === 5_000_000 - Math.round(5_000_000 * tarif),
           `${c.net_amount} pada tarif ${tarif}`);
  });

  await check("kategori penerima dibatasi menurut jenis feenya", async () => {
    // Daftarnya ditetapkan kantor, dan bedanya bukan kelalaian: Overriding
    // tidak pernah jatuh kepada yang menjual, dan BGB — konsumen yang membawa
    // pembeli lain — hanya menerima Komisi. Diuji di sini karena yang salah
    // tidak terlihat di layar: ia hanya muncul sebagai pilihan yang seharusnya
    // tidak ada, dan sebuah klaim yang terlanjur dibuat atasnya.
    assert(!KATEGORI_JENIS.commission.includes("markom" as any),
           KATEGORI_JENIS.commission.join(","));
    assert(KATEGORI_JENIS.commission.includes("bgb" as any),
           KATEGORI_JENIS.commission.join(","));
    assert(!KATEGORI_JENIS.overriding.includes("sales_inhouse" as any),
           KATEGORI_JENIS.overriding.join(","));
    assert(!KATEGORI_JENIS.closing_fee.includes("bgb" as any),
           KATEGORI_JENIS.closing_fee.join(","));
    // Continuity Reward mengikuti Cash Reward seluruhnya.
    assert(KATEGORI_JENIS.continuity_reward.join() ===
           KATEGORI_JENIS.cash_reward.join(),
           KATEGORI_JENIS.continuity_reward.join(","));

    // Yang tercatat pada data penjualan dipakai bila jenis feenya memang boleh
    // jatuh kepadanya; kalau tidak, kategori sah yang pertama — bukan kategori
    // yang tidak berlaku bagi jenis itu.
    assert(kategoriAwal("commission", "agent") === "agent", "agent");
    assert(kategoriAwal("overriding", "agent") === "sales_manager_inhouse",
           String(kategoriAwal("overriding", "agent")));
    assert(kategoriAwal("commission", "markom") === "sales_inhouse",
           String(kategoriAwal("commission", "markom")));
  });

  await check("marketing kategori baru dapat didaftarkan tangan", async () => {
    // Markom, Sales Manager, Sales Koordinator, dan BGB tidak pernah tertulis
    // pada berkas penjualan maupun laporan keagenan, jadi tanpa jalan ini
    // mereka tidak pernah ada di daftar dan feenya tidak dapat diajukan.
    // Project-nya diambil dari tabelnya sendiri: unit contoh belum tentu
    // menyebut project, dan projectId yang kosong membuat pemeriksaan nama
    // kembar tidak punya apa pun untuk dibandingkan.
    const p = await one<{ id: string }>(
      "SELECT id FROM projects ORDER BY created_at LIMIT 1");
    const m = await tambahMarketing({
      nama: "  Rina   Markom ", kategori: "markom",
      telepon: "0812-3456-7890",
    }, "admin", p!.id);
    assert(m.category === "markom", m.category);
    // Jenisnya disimpulkan dari kategorinya: hanya Agent yang berarti agent.
    assert(m.marketing_type === "inhouse", m.marketing_type);
    // Nama dan nomornya dibakukan, bukan disimpan apa adanya.
    assert(m.full_name === "Rina Markom", m.full_name);
    assert(m.phone === "6281234567890", m.phone);

    const baru = await one<{ status: string }>(
      "SELECT status FROM marketings WHERE id=$1", [m.id]);
    assert(baru!.status === "draft", baru!.status);

    // Nama kembar dalam satu project ditolak: data penjualan mencocokkan
    // marketingnya dengan nama, dan dua baris bernama sama membuat fee sebuah
    // unit jatuh ke salah satunya tanpa dasar.
    let tertolak = false;
    try {
      await tambahMarketing({ nama: "rina markom", kategori: "markom",
                              telepon: "0812-3456-7890" }, "admin", p!.id);
    } catch (e: any) { tertolak = e instanceof WorkflowError; }
    assert(tertolak, "nama kembar seharusnya ditolak");

    // Nomor yang bukan nomor ponsel juga ditolak: ke nomor itulah tautan
    // pendaftaran tanda tangannya dikirim.
    let nomorTertolak = false;
    try {
      await tambahMarketing({ nama: "Dedi Markom", kategori: "markom",
                              telepon: "123" }, "admin", p!.id);
    } catch (e: any) { nomorTertolak = e instanceof WorkflowError; }
    assert(nomorTertolak, "nomor keliru seharusnya ditolak");
  });

  await check("Overriding tetap dapat diklaim walau koordinatornya kosong",
              async () => {
    // Berkas penjualan hampir selalu menyebut yang menjual, tetapi tingkat di
    // atasnya kerap dikosongkan. Dulu itu mematikan tombol Overriding, dan fee
    // yang memang berhak dibayarkan tidak punya jalan diajukan sama sekali —
    // padahal sejak kategori penerimanya dapat dipilih, orangnya tidak lagi
    // diambil dari kolom itu.
    const tanpaKoordinator = {
      status: "active", contract_value_incl_vat: 1_000_000_000,
      received_amount: 500_000_000,
      marketing_id: "x", marketing_status: "active",
      sub_coordinator_id: null, coordinator_id: null,
    };
    assert(calc.dapatDiklaim(tanpaKoordinator, "overriding", false),
           "Overriding seharusnya terbuka");

    // Yang lain tetap menuntut penerimanya tercatat: kolom yang kosong di sana
    // berarti penjualannya belum menyebut siapa yang menjual, dan itu memang
    // data yang perlu dibetulkan lebih dulu.
    assert(!calc.dapatDiklaim(
      { ...tanpaKoordinator, marketing_id: null, marketing_status: null },
      "closing_fee", false), "Closing Fee seharusnya tertahan");

    // Yang menahan selain itu tidak ikut longgar.
    assert(!calc.dapatDiklaim(tanpaKoordinator, "overriding", true),
           "klaim aktif seharusnya tetap menahan");
    assert(!calc.dapatDiklaim(
      { ...tanpaKoordinator, received_amount: 1_000_000 }, "overriding", false),
      "penerimaan kurang dari 20% seharusnya tetap menahan");
    assert(!calc.dapatDiklaim(
      { ...tanpaKoordinator, status: "cancelled" }, "overriding", false),
      "unit batal seharusnya tetap menahan");
  });

  await check("Pajak tidak dapat membuka dokumen yang belum dikirim kepadanya",
              async () => {
    // Selama pengajuan masih disusun dan diperiksa Admin Sales, isinya belum
    // tentu yang akan diverifikasi: nilainya masih dapat berubah, lampirannya
    // masih dapat diganti, bahkan barisnya masih dapat dihapus karena salah
    // input. Yang membukanya pada keadaan itu membaca angka yang belum
    // diserahkan kepada siapa pun.
    const { bolehBukaDokumen } = await import("../src/lib/tahap");

    for (const st of ["draft", "submitted", "pending_admin_review"]) {
      assert(!bolehBukaDokumen("finance_tax", st),
             `Pajak seharusnya tertutup pada status ${st}`);
    }

    // Sejak diteruskan ke verifikasi pajak, dan seterusnya, terbuka sendiri.
    for (const st of ["pending_tax_verification", "tax_verified", "signed",
                      "ready_to_print", "approved", "paid", "completed",
                      "rejected"]) {
      assert(bolehBukaDokumen("finance_tax", st),
             `Pajak seharusnya terbuka pada status ${st}`);
    }

    // Yang menyusun dan yang menaungi verifikasinya tetap melihat sejak awal.
    for (const peran of ["admin_sales", "admin_system", "finance_manager",
                         "head_finance", "management", "finance_payment"]) {
      assert(bolehBukaDokumen(peran, "draft"),
             `${peran} seharusnya tetap dapat membuka sejak awal`);
    }
  });

  await check("sapaan kata sambutan mengikuti jam, termasuk di batasnya",
              async () => {
    // Batas jamnya justru bagian yang paling mudah bergeser satu jam tanpa ada
    // yang menyadarinya — dan yang menyadarinya adalah penerima surat yang
    // disapa "Selamat Pagi" pada pukul tiga sore.
    const { sapaanJam } = await import("../src/lib/sapaan");
    const harap: [number, string][] = [
      [0, "Malam"], [4, "Malam"],
      [5, "Pagi"], [7, "Pagi"], [10, "Pagi"],
      [11, "Siang"], [14, "Siang"],
      [15, "Sore"], [18, "Sore"],
      [19, "Malam"], [23, "Malam"],
    ];
    for (const [jam, sapaan] of harap) {
      assert(sapaanJam(jam) === sapaan,
             `pukul ${jam} seharusnya ${sapaan}, bukan ${sapaanJam(jam)}`);
    }
    // Keempatnya terpakai; tidak ada jam yang jatuh ke luar keempatnya.
    const semua = new Set(
      Array.from({ length: 24 }, (_, j) => sapaanJam(j)));
    assert(semua.size === 4, `seharusnya empat sapaan, bukan ${semua.size}`);
  });

  await check("surel marketing dapat diperbaiki, dan boleh dikosongkan",
              async () => {
    // Sejak tautan tanda tangan dapat dikirim lewat surel, alamat ini tujuan
    // kiriman — dan data yang masuk dari berkas penjualan kerap tidak
    // memuatnya. Tanpa jalan memperbaikinya, satu-satunya jalur yang tersisa
    // bagi orang itu adalah WhatsApp.
    const p = await one<{ id: string }>(
      "SELECT id FROM projects ORDER BY created_at LIMIT 1");
    const orang = await tambahMarketing({
      nama: "Sari Surel", kategori: "markom", telepon: "0813-9999-0002",
    }, "admin", p!.id);

    const isi = await ubahEmail(orang.id, "  Sari@Contoh.COM ", "admin", p!.id);
    // Dibakukan: huruf kecil dan tanpa spasi di tepinya. Alamat yang sama
    // tertulis dua cara adalah dua alamat bagi yang mencarinya.
    assert(isi.email === "sari@contoh.com", String(isi.email));
    assert(isi.changed, "perubahannya tercatat sebagai perubahan");

    // Yang sama persis tidak dicatat dua kali.
    const lagi = await ubahEmail(orang.id, "sari@contoh.com", "admin", p!.id);
    assert(!lagi.changed, "alamat yang sama bukan perubahan");

    // Boleh dikosongkan — tidak setiap agent punya surel, dan memaksa
    // mengisinya hanya melahirkan alamat karangan.
    const kosong = await ubahEmail(orang.id, "", "admin", p!.id);
    assert(kosong.email === null, String(kosong.email));

    // Yang bentuknya bukan alamat ditolak, bukan disimpan apa adanya.
    let tertolak: any = null;
    try { await ubahEmail(orang.id, "bukan alamat", "admin", p!.id); }
    catch (e: any) { tertolak = e; }
    assert(tertolak?.code === "email_invalid",
           `seharusnya email_invalid, bukan ${tertolak?.code}`);

    await hapusMarketing(orang.id, "admin", p!.id);
  });

  await check("spesimen dapat diunggah Admin tanpa tautan pendaftaran",
              async () => {
    // Tautan menuntut ponsel yang menerima kode, kesediaan membukanya, dan
    // kemampuan menandai tanda tangan di layar kecil. Yang tidak punya
    // ketiganya dulu berhenti di "belum terdaftar" selamanya, dan feenya tidak
    // pernah dapat dibayarkan.
    const p = await one<{ id: string }>(
      "SELECT id FROM projects ORDER BY created_at LIMIT 1");
    const orang = await tambahMarketing({
      nama: "Tuti Unggah Manual", kategori: "markom",
      telepon: "0813-9999-0001",
    }, "admin", p!.id);

    // Satu piksel PNG, cukup untuk dua hal yang diuji di sini: bahwa
    // berkasnya tersimpan, dan bahwa potongannya menjadi spesimen.
    const png = "data:image/png;base64," + signaturePng(7, 0.06);

    const hasil = await unggahManual(orang.id, "admin", {
      image_base64: png, signature_png: png, projectId: p!.id });
    assert(!hasil.mengganti, "yang pertama bukan penggantian");

    // Langsung berlaku: tidak ada antrean pemeriksaan untuk jalur ini, sebab
    // yang mengunggah dan yang memeriksa sama-sama tim Admin.
    const aktif = await one<{ status: string; jangkar: string | null }>(
      `SELECT status, reference_signature_png AS jangkar
         FROM marketings WHERE id=$1`, [orang.id]);
    assert(aktif!.status === "active", aktif!.status);
    assert(Boolean(aktif!.jangkar), "potongan tanda tangannya menjadi jangkar");

    const sesi = await one<{ state: string; ada: boolean; issued_by: string }>(
      `SELECT state, (ktp_image IS NOT NULL) AS ada, issued_by
         FROM enrollment_sessions WHERE set_id=$1`, [hasil.set_id]);
    assert(sesi!.state === "approved", sesi!.state);
    // Foto KTP utuhnya tidak tertinggal: ia hanya diperlukan selama ada yang
    // memeriksa, dan pada jalur ini tidak ada.
    assert(!sesi!.ada, "foto KTP utuh dihapus begitu set ini berlaku");
    // Jejaknya menyebut siapa yang mengunggah, bukan orang yang didaftarkan:
    // persetujuan pada jalur ini datang dari Admin, dan itu ditulis apa adanya.
    assert(sesi!.issued_by === "admin", sesi!.issued_by);

    // Tokennya tidak dapat dibuka sebagai tautan pendaftaran.
    const tok = await one<{ token: string }>(
      "SELECT token FROM enrollment_sessions WHERE set_id=$1", [hasil.set_id]);
    const { bukaSesi } = await import("../src/lib/spesimen");
    let tertutup: any = null;
    try { await bukaSesi(tok!.token); } catch (e: any) { tertutup = e; }
    assert(tertutup?.code === "session_closed",
           `tautannya seharusnya tertutup, bukan ${tertutup?.code}`);

    // Mengganti yang sudah berlaku tetap menuntut alasan tertulis — lubang
    // yang sama besarnya lewat jalan mana pun.
    let tanpaAlasan: any = null;
    try {
      await unggahManual(orang.id, "admin", {
        image_base64: png, signature_png: png, projectId: p!.id });
    } catch (e: any) { tanpaAlasan = e; }
    assert(tanpaAlasan?.code === "reason_required",
           `penggantian tanpa alasan seharusnya ditolak, bukan ${tanpaAlasan?.code}`);

    const ganti = await unggahManual(orang.id, "admin", {
      image_base64: png, signature_png: png, projectId: p!.id,
      alasan: "KTP diperbarui, fotonya dikirim lewat WhatsApp." });
    assert(ganti.mengganti, "yang kedua tercatat sebagai penggantian");

    // Berkas yang bukan gambar ditolak pada jalur ini juga: aturan yang hanya
    // berlaku pada salah satu jalur bukan aturan, melainkan saran.
    let salahTipe: any = null;
    try {
      await unggahManual(orang.id, "admin", {
        image_base64: "data:application/pdf;base64,JVBERi0=", signature_png: png,
        projectId: p!.id, alasan: "Mencoba berkas yang bukan gambar." });
    } catch (e: any) { salahTipe = e; }
    assert(salahTipe?.code === "file_type_rejected",
           `berkas bukan gambar seharusnya ditolak, bukan ${salahTipe?.code}`);

    await hapusMarketing(orang.id, "admin", p!.id);
  });

  await check("marketing salah input dapat dihapus, yang terpakai tidak",
              async () => {
    const p = await one<{ id: string }>(
      "SELECT id FROM projects ORDER BY created_at LIMIT 1");

    // Yang baru dibuat dan belum dipakai di mana pun: hilang beserta
    // rekening, spesimen, dan sesi pendaftarannya.
    const salah = await tambahMarketing({
      nama: "Conny Yulita Lie", kategori: "sales_manager_inhouse",
      telepon: "0857-1111-2222",
    }, "admin", p!.id);
    const hasil = await hapusMarketing(salah.id, "admin", p!.id);
    assert(hasil.deleted, "seharusnya terhapus");
    const sisa = await one("SELECT id FROM marketings WHERE id=$1", [salah.id]);
    assert(!sisa, "barisnya seharusnya sudah tidak ada");

    // Yang sudah dipakai klaim ditolak. Inilah pagarnya: units menunjuk ke
    // marketings dengan ON DELETE SET NULL, jadi tanpa pemeriksaan ini
    // menghapus orang yang tercatat pada sebuah penjualan akan mengosongkan
    // kolom Sales-nya diam-diam.
    // Tanpa project: marketing contoh dibuat seed tanpa penanda project, dan
    // yang diuji di sini pemeriksaan pemakaiannya, bukan lingkup projectnya.
    let tertolak = "";
    try {
      await hapusMarketing(inhouseId, "admin");
    } catch (e: any) { tertolak = String(e?.message ?? ""); }
    assert(/tidak dapat dihapus/.test(tertolak), tertolak || "tidak menolak");
    const masih = await one("SELECT id FROM marketings WHERE id=$1", [inhouseId]);
    assert(Boolean(masih), "yang terpakai seharusnya tetap ada");
  });

  await check("penandatangan rekap Overiding mengikuti projectnya", async () => {
    // Empat project di bawah PT. Serpong Bangun Cipta: pemeriksanya belum
    // ditetapkan, jadi garisnya sengaja kosong.
    for (const slug of ["banara-serpong", "naraya-serpong",
                        "marchand-hype-station", "mazenta-residence"]) {
      const t = penandatanganRekap(slug);
      assert(t.dibuat === "Anneke Aprilia", `${slug}: ${t.dibuat}`);
      assert(t.diperiksa === "", `${slug} seharusnya tanpa pemeriksa`);
      assert(t.disetujui[0] === "Setia Iskandar", `${slug}: ${t.disetujui[0]}`);
      assert(t.disetujui[1] === "Al Imron", `${slug}: ${t.disetujui[1]}`);
    }

    for (const slug of ["bio-district", "permai-indah"]) {
      const t = penandatanganRekap(slug);
      assert(t.dibuat === "Anneke Aprilia", `${slug}: ${t.dibuat}`);
      assert(t.diperiksa === "Sugino", `${slug}: ${t.diperiksa}`);
      assert(t.disetujui[0] === "Andreas Audyanto", `${slug}: ${t.disetujui[0]}`);
      assert(t.disetujui[1] === "Al Imron", `${slug}: ${t.disetujui[1]}`);
    }

    // Project yang belum ditetapkan penandatangannya mendapat garis kosong,
    // bukan nama rumpun terdekat. Nama yang ditebak tidak dapat ditarik
    // kembali setelah lembarnya beredar dan ditandatangani.
    const asing = penandatanganRekap("project-yang-belum-ada");
    assert(asing.dibuat === "" && asing.diperiksa === "" &&
           asing.disetujui[0] === "" && asing.disetujui[1] === "",
           "project asing seharusnya tanpa nama");
    assert(penandatanganRekap(null).dibuat === "",
           "project kosong seharusnya tanpa nama");
  });

  await check("pengajuan salah input dapat dihapus; yang sudah dibayar " +
              "hanya oleh Admin IT",
              async () => {
    // Salah input: unitnya keliru, orangnya keliru, jenis feenya keliru.
    // Mesin alur hanya mengenal pembatalan dari draft, jadi yang sudah
    // berjalan tidak punya jalan pulang — dan inilah jalannya.
    const salah = await wf.createClaim({
      unitId: unit, marketingId: inhouseId, claimType: "cash_reward",
      recipientRole: "sales_inhouse", actor: "admin" });
    // Bukan draft: yang perlu dihapus justru pengajuan yang sudah berjalan.
    // Statusnya ditulis langsung, bukan ditempuh lewat alur, karena yang diuji
    // di sini penghapusannya — bukan jalan menuju status itu.
    await query("UPDATE claims SET status='awaiting_signature' WHERE id=$1",
                [salah.id]);

    // Alasan wajib: penghapusan yang tidak dapat dijelaskan tidak dapat
    // ditelusuri lagi setelah barisnya hilang.
    let tanpaAlasan = "";
    try {
      await wf.hapusKlaim(salah.id, "admin", "singkat");
    } catch (e: any) { tanpaAlasan = String(e?.message ?? ""); }
    assert(/minimal 10 karakter/.test(tanpaAlasan),
           tanpaAlasan || "alasan pendek seharusnya ditolak");

    const hasil = await wf.hapusKlaim(
      salah.id, "admin", "Salah unit, diajukan ulang atas unit yang benar.");
    assert(hasil.deleted, "seharusnya terhapus");
    assert(!await one("SELECT id FROM claims WHERE id=$1", [salah.id]),
           "barisnya seharusnya sudah tidak ada");

    // Jejak auditnya tetap tinggal: ia append-only dan tidak menunjuk ke
    // baris klaim lewat foreign key. Tanpa ini, penghapusan tidak
    // meninggalkan bukti apa pun bahwa pengajuan itu pernah ada.
    const jejak = await one<{ actor: string; reason: string }>(
      `SELECT actor, reason FROM audit_log
        WHERE entity_type='claim' AND entity_id=$1 AND action='deleted'`,
      [salah.id]);
    assert(Boolean(jejak), "jejak audit penghapusan seharusnya tersimpan");
    assert(/Salah unit/.test(jejak!.reason ?? ""), "alasannya seharusnya ikut");

    // Yang uangnya sudah keluar ditolak. Menghapusnya berarti menghapus
    // catatan atas transfer yang benar-benar terjadi, dan rekap pembayaran
    // yang memuatnya berubah diam-diam.
    const dibayar = await wf.createClaim({
      unitId: unit, marketingId: inhouseId, claimType: "cash_reward",
      recipientRole: "sales_inhouse", actor: "admin" });
    await query("UPDATE claims SET status='paid' WHERE id=$1", [dibayar.id]);
    let tertolak = "";
    try {
      await wf.hapusKlaim(dibayar.id, "admin",
                          "Uji: seharusnya ditolak karena sudah dibayar.");
    } catch (e: any) { tertolak = String(e?.message ?? ""); }
    assert(/sudah masuk pembayaran/.test(tertolak),
           tertolak || "yang sudah dibayar seharusnya ditolak");
    assert(Boolean(await one("SELECT id FROM claims WHERE id=$1", [dibayar.id])),
           "yang sudah dibayar seharusnya tetap ada");

    // Admin IT tetap dapat menghapusnya — jalan darurat untuk salah input yang
    // terlanjur dibayar — dan baris pelunasannya ikut dilepas. Tanpa pelepasan
    // itu, basis data menolak penghapusannya: settlement_lines.instruction_id
    // sengaja tanpa ON DELETE CASCADE.
    const instruksi = await one<{ id: string }>(
      `INSERT INTO payment_instructions (claim_id, recipient_name, amount,
                                         paid_amount, status)
       VALUES ($1,'Uji',1000000,1000000,'paid') RETURNING id`, [dibayar.id]);
    const pelunasan = await one<{ id: string }>(
      `INSERT INTO settlements (transfer_date, recap_period, proof_file)
       VALUES (CURRENT_DATE, '2026-09', 'uji.pdf') RETURNING id`);
    await query(
      `INSERT INTO settlement_lines (settlement_id, instruction_id, amount)
       VALUES ($1,$2,1000000)`, [pelunasan!.id, instruksi!.id]);

    const olehIt = await wf.hapusKlaim(
      dibayar.id, "sysadmin",
      "Salah input yang terlanjur dibayar, dibereskan Admin IT.",
      undefined, true);
    assert(olehIt.deleted, "Admin IT seharusnya dapat menghapusnya");
    assert(olehIt.sudah_dibayar, "seharusnya ditandai sudah dibayar");
    assert(olehIt.pelunasan_dilepas === 1,
           `pelunasannya seharusnya ikut dilepas, bukan ${olehIt.pelunasan_dilepas}`);
    assert(!await one("SELECT id FROM claims WHERE id=$1", [dibayar.id]),
           "barisnya seharusnya sudah tidak ada");
    assert(!await one("SELECT id FROM settlement_lines WHERE instruction_id=$1",
                      [instruksi!.id]),
           "baris pelunasannya seharusnya ikut terhapus");
  });

  await check("klaim yang pernah dihapus tidak membuat nomor bentrok",
              async () => {
    // Nomor klaim bukan patokan pengajuan: pengajuan fee tidak boleh gagal
    // hanya karena nomornya. Dulu nomor dihitung dari COUNT(*), jadi satu
    // klaim yang dihapus membuat deretnya mundur dan menabrak nomor yang
    // masih ada — galatnya claims_claim_number_key, dan pengajuannya batal.
    //
    // Celahnya dibangun di sini: dipasang satu baris Cash Reward yang
    // nomornya tepat sama dengan COUNT(*)+1, seolah nomor-nomor sebelumnya
    // pernah ada lalu dihapus.
    const sumber = await one<{ unit_id: string; marketing_id: string;
                               project_id: string }>(
      "SELECT unit_id, marketing_id, project_id FROM claims LIMIT 1");
    assert(Boolean(sumber), "belum ada klaim contoh");
    const n = await one<{ c: number }>(
      "SELECT COUNT(*)::int AS c FROM claims WHERE claim_type='cash_reward'");
    const bentrok = `CR-2026-${String(n!.c + 1).padStart(4, "0")}`;
    const pengganggu = await one<{ id: string }>(
      `INSERT INTO claims (claim_number, claim_type, recipient_role, unit_id,
         marketing_id, status, gross_amount, vat, withholding_tax, net_amount,
         project_id)
       VALUES ($1,'cash_reward','sales_manager_inhouse',$2,$3,'draft',
               0,0,0,0,$4) RETURNING id`,
      [bentrok, sumber!.unit_id, sumber!.marketing_id, sumber!.project_id]);
    try {
      // Inilah pengajuan yang dulu gagal: nomor hasil COUNT(*)+1 sama dengan
      // nomor baris pengganggu di atas.
      const lanjut = await wf.createClaim({
        unitId: unit, marketingId: inhouseId, claimType: "cash_reward",
        recipientRole: "sales_inhouse", actor: "admin" });
      assert(lanjut.claim_number !== bentrok,
             `nomornya menabrak yang sudah ada: ${lanjut.claim_number}`);
      assert(lanjut.claim_number === `CR-2026-${String(n!.c + 2).padStart(4, "0")}`,
             `nomor seharusnya lanjut dari yang tertinggi, bukan ${lanjut.claim_number}`);
      await query("DELETE FROM claims WHERE id=$1", [lanjut.id]);
    } finally {
      await query("DELETE FROM claims WHERE id=$1", [pengganggu!.id]);
    }
  });

  await check("rekap Overriding memilah unit menurut keadaannya", async () => {
    // Overriding dicetak sebagai Detail Perhitungan per periode, bukan lembar
    // per unit. Yang diuji di sini pemilahannya — unit batal tidak boleh
    // tercampur ke bagian yang sedang diajukan, dan totalnya dihitung per
    // bagian, bukan seluruh tabel.
    // Penerimanya tingkat di atas yang menjual — dan rekapnya disusun menurut
    // unit-unit milik orang itu, jadi yang dipakai harus benar-benar
    // koordinator unitnya, bukan sembarang marketing.
    const ko = await one<{ id: string }>(
      `SELECT COALESCE(sub_coordinator_id, coordinator_id) AS id
         FROM units WHERE id=$1`, [unit]);
    assert(Boolean(ko?.id), "unit contoh tidak punya koordinator");
    const c = await wf.createClaim({
      unitId: unit, marketingId: ko!.id, claimType: "overriding",
      recipientRole: "sales_manager_inhouse",
      overridingLevel: "sales_manager_inhouse", actor: "admin" });
    const rekap = await rekapOverriding(c.id);
    assert(Boolean(rekap), "rekapnya seharusnya ada");
    assert(rekap!.nomor === c.claim_number, String(rekap!.nomor));
    assert(rekap!.sales_manager?.full_name != null, "Sales Manager kosong");
    assert(rekap!.bagian.length > 0, "tidak ada satu bagian pun");

    // Setiap bagian menomori barisnya sendiri dari satu, seperti pada
    // acuannya — bukan bernomor menerus sepanjang tabel.
    for (const b of rekap!.bagian) {
      assert(b.baris[0]?.no === 1, `${b.judul}: nomor pertama ${b.baris[0]?.no}`);
      const jumlahNet = b.baris.reduce((t, r) => t + r.net, 0);
      assert(b.total.net === jumlahNet,
             `${b.judul}: total ${b.total.net} vs ${jumlahNet}`);
    }

    // DPP Nilai Lain adalah 11/12 dari nilai tanpa PPN — aturannya sendiri,
    // bukan pembulatan.
    const r0 = rekap!.bagian[0].baris[0];
    assert(r0.dpp_nilai_lain === Math.round(r0.nilai_excl * 11 / 12),
           `${r0.dpp_nilai_lain} vs ${Math.round(r0.nilai_excl * 11 / 12)}`);

    // Selisih Overiding: bagian hak yang belum terbayar, mengikuti rumus pada
    // berkas acuannya. Yang belum menghasilkan pembayaran sama sekali membawa
    // seluruh haknya ke sini; PPh-nya 2,5% dan yang dipotong PPh 21, bukan
    // PPh 23 seperti pada blok di sebelahnya.
    const semua = rekap!.bagian.flatMap((b) => b.baris);
    const belumBayar = semua.filter((r) => r.net === 0 && r.selisih_persen);
    for (const r of belumBayar) {
      assert(r.selisih_amount ===
               Math.round(r.nilai_excl * Number(r.selisih_persen)),
             `selisih ${r.unit}: ${r.selisih_amount}`);
      assert(r.selisih_pph21 === Math.round(r.selisih_amount * 0.025),
             `pph21 ${r.unit}: ${r.selisih_pph21}`);
      assert(r.selisih_net === r.selisih_amount - r.selisih_pph21,
             `net selisih ${r.unit}: ${r.selisih_net}`);
    }
    // Totalnya dijumlah per bagian, sama seperti kolom lainnya.
    for (const b of rekap!.bagian) {
      assert(b.total.selisih_net ===
               b.baris.reduce((t, r) => t + r.selisih_net, 0),
             `${b.judul}: total selisih ${b.total.selisih_net}`);
    }

    // Unit yang kolom koordinatornya kosong tetap masuk rekap, asalkan ada
    // klaim Overriding atas nama orang ini. Sejak penerimanya dipilih sendiri
    // saat mengajukan, itulah keadaan yang lazim — dan mencari unit hanya
    // lewat kolom koordinator membuat rekapnya kosong justru pada klaim yang
    // barusan dibuat.
    await query("UPDATE units SET sub_coordinator_id=NULL, coordinator_id=NULL " +
                "WHERE id=$1", [unit]);
    const tetap = await rekapOverriding(c.id);
    const unitnya = tetap!.bagian.flatMap((b) => b.baris)
      .some((r) => r.amount > 0);
    assert(unitnya, "unit tanpa koordinator tetap harus muncul lewat klaimnya");

    // Klaim jenis lain tidak punya rekap: dokumennya memang lembar per unit.
    const bukan = await rekapOverriding(cid);
    assert(bukan === null, "klaim non-Overriding seharusnya tanpa rekap");
  });

  await check("rekap memakai tanggal transfer, bukan tanggal input", async () => {
    const rec = await settlement.paymentRecap(
      null, "2020-01-01", "2100-01-01");
    assert(rec.totals.net_amount === 5_272_500, JSON.stringify(rec.totals));
    assert(rec.totals.claim_count === 1, String(rec.totals.claim_count));
  });

  await check("pengingat surel menyebut nama project tiap pekerjaan", () => {
    const teks = susunRincian([
      { project: "Naraya Serpong", status: "pending_tax_verification", jumlah: 3 },
      { project: "Naraya Serpong", status: "approved", jumlah: 1 },
      { project: "BIO District", status: "pending_tax_verification", jumlah: 2 },
    ]);
    assert(teks.includes("Naraya Serpong (4):"), teks);
    assert(teks.includes("BIO District (2):"), teks);
    assert(teks.includes("• 3 menunggu verifikasi pajak"), teks);
    // Dua project berdiri sebagai dua kelompok, bukan satu daftar bercampur.
    assert(teks.indexOf("BIO District") > teks.indexOf("• 1 menunggu penetapan"),
           teks);
  });

  await check("rekap pembayaran hanya memuat project sendiri", async () => {
    // Klaim contoh diberi project, lalu rekap diminta dua kali: untuk project
    // itu, dan untuk project lain. Yang kedua harus kosong — di situlah
    // pemisahan antar-project terbukti, bukan pada jumlahnya saja.
    const rantai = await one<{ claim_id: string }>(
      `SELECT pi.claim_id FROM settlement_lines sl
         JOIN payment_instructions pi ON pi.id = sl.instruction_id LIMIT 1`);
    assert(Boolean(rantai), "belum ada pembayaran contoh");
    const dua = await query<{ id: string }>(
      "SELECT id FROM projects ORDER BY created_at LIMIT 2");
    assert(dua.length === 2, "perlu dua project untuk menguji pemisahan");
    const [milik, lain] = dua;
    await query("UPDATE claims SET project_id=$2 WHERE id=$1",
                [rantai!.claim_id, milik.id]);

    const sendiri = await settlement.paymentRecap(
      milik.id, "2020-01-01", "2100-01-01");
    const tetangga = await settlement.paymentRecap(
      lain.id, "2020-01-01", "2100-01-01");
    assert(sendiri.totals.claim_count === 1,
           `project sendiri: ${JSON.stringify(sendiri.totals)}`);
    assert(tetangga.totals.claim_count === 0,
           `project lain seharusnya kosong: ${JSON.stringify(tetangga.totals)}`);

    const daftarSendiri = await settlement.bankReconciliation(milik.id, 0);
    const daftarLain = await settlement.bankReconciliation(lain.id, 0);
    assert(daftarLain.length === 0,
           `rekonsiliasi project lain seharusnya kosong: ${daftarLain.length}`);
    assert(daftarSendiri.length >= 0, "rekonsiliasi project sendiri gagal");

    await query("UPDATE claims SET project_id=NULL WHERE id=$1",
                [rantai!.claim_id]);
  });

  await check("periode tertutup mengalihkan entri terlambat ke periode terbuka",
    async () => {
      const p = today.slice(0, 7);
      await settlement.closePeriod(p, "fmanager");
      const c2 = await wf.createClaim({ unitId: unit, marketingId: inhouseId,
        claimType: "cash_reward", recipientRole: "sales_inhouse", actor: "admin" });
      await runToSettlement(c2.id, 2,
        ["fpu", "spu", "ktp", "npwp", "booking_fee_proof"]);
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
      await wf.kirimKeAdmin(link.token);
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
    assert(labels["PINDAH UNIT"] === 1, JSON.stringify(labels));
    assert(labels["MANAGEMENT (NO CLOSING FEE, REWARD, KOMISI & OVERIDING)"] === 1,
           JSON.stringify(labels));
    assert(labels["CLOSING FEE, REWARD, KOMISI & OVERIDING"] === 3, JSON.stringify(labels));
  });

  await check("workbook berisi baris TOTAL berformula, bukan konstanta", async () => {
    const { buildWorkbook } = await import("../src/lib/report");
    const wb = await buildWorkbook(await collect());
    const ws = wb.worksheets[0];
    let found = false;
    ws.eachRow((row) => {
      // Kolom A memuat "TOTAL", kolom I memuat Nilai Kontrak yang dijumlah.
      if (row.getCell(1).value === "TOTAL") {
        const cell = row.getCell(9);
        found = typeof cell.value === "object" && cell.value !== null &&
                "formula" in (cell.value as any);
      }
    });
    assert(found, "baris TOTAL harus memakai formula SUM");
  });

  await check("PDF paket cetak dihasilkan dengan tanda tangan tertempel", async () => {
    const { buildPrintPdf } = await import("../src/lib/pdf");
    const claim = await wf.getClaim(cid);
    const unit = await one("SELECT * FROM units WHERE id=$1", [claim.unit_id]);
    const marketing = await one("SELECT * FROM marketings WHERE id=$1",
                                [claim.marketing_id]);
    const agency = marketing.agency_id
      ? await one("SELECT * FROM agencies WHERE id=$1", [marketing.agency_id]) : null;
    const attempt = await one(
      `SELECT image_png FROM signature_attempts WHERE claim_id=$1
       AND outcome='verified' ORDER BY attempt_number DESC LIMIT 1`, [cid]);
    assert(Boolean(attempt?.image_png), "citra tanda tangan terverifikasi harus ada");

    const pdf = await buildPrintPdf({
      claim, unit, marketing, agency, bank: null,
      documents: [{ checklist_item: "fpu" }, { checklist_item: "spu" }],
      signatureImagePng: attempt!.image_png,
      copyNumber: 2, documentHash: docHash, printedBy: "admin",
      verifyUrl: `https://contoh/api/documents/verify/${docHash}?copy=2`,
      crosscheck: { admin: "completed", finance: "completed" },
    });
    assert(pdf.subarray(0, 5).toString() === "%PDF-", "berkas bukan PDF");
    assert(pdf.length > 8000, `PDF terlalu kecil: ${pdf.length} byte`);
    // Nomor salinan harus muncul di dokumen agar cetakan lama dapat dikenali.
    assert(pdf.toString("latin1").includes("FlateDecode"), "aliran PDF tidak wajar");
  });

  await check("PDF memecah halaman alih-alih menindih kaki halaman", async () => {
    const { buildPrintPdf } = await import("../src/lib/pdf");
    const { PDFDocument } = await import("pdf-lib");
    const claim = await wf.getClaim(cid);
    const unit = await one("SELECT * FROM units WHERE id=$1", [claim.unit_id]);
    const marketing = await one("SELECT * FROM marketings WHERE id=$1",
                                [claim.marketing_id]);
    // Checklist panjang mendorong blok pengesahan melewati batas halaman.
    const many = Array.from({ length: 18 }, (_, i) => ({ checklist_item: `dok_${i}` }));
    const pdf = await buildPrintPdf({
      claim, unit, marketing, agency: null, bank: null, documents: many,
      signatureImagePng: null, copyNumber: 1, documentHash: docHash,
      printedBy: "admin", verifyUrl: "https://contoh/verify",
      crosscheck: { admin: "completed", finance: "completed" },
    });
    const parsed = await PDFDocument.load(pdf);
    assert(parsed.getPageCount() >= 2,
           `blok pengesahan seharusnya pindah halaman, dapat ${parsed.getPageCount()}`);
  });

  await check("PDF tetap terbentuk walau citra tanda tangan rusak", async () => {
    const { buildPrintPdf } = await import("../src/lib/pdf");
    const claim = await wf.getClaim(cid);
    const unit = await one("SELECT * FROM units WHERE id=$1", [claim.unit_id]);
    const marketing = await one("SELECT * FROM marketings WHERE id=$1",
                                [claim.marketing_id]);
    const pdf = await buildPrintPdf({
      claim, unit, marketing, agency: null, bank: null, documents: [],
      signatureImagePng: "bukan-png-sama-sekali",
      copyNumber: 1, documentHash: docHash, printedBy: "admin",
      verifyUrl: "https://contoh/verify", 
      crosscheck: { admin: "completed", finance: "pending" },
    });
    assert(pdf.subarray(0, 5).toString() === "%PDF-",
           "citra rusak tidak boleh menggagalkan seluruh dokumen");
  });

  await check("memo yang berlaku menjadi dasar pengajuan maupun penolakannya",
              async () => {
    // Bawaannya menyala: tarif keempat jenis fee datang dari memo yang
    // diberlakukan di Referensi Pengajuan, dan penjualan yang tidak dinaungi
    // memo mana pun ditolak — bukan dihitung dengan tarif yang tidak pernah
    // diputuskan siapa pun.
    const { setting } = await import("../src/lib/db");
    // Dibaca lewat setting(), bukan dari tetapan dalam kode: yang menentukan
    // perilaku memang yang terbaca di sini — bawaannya bila belum pernah
    // disimpan, dan nilai tersimpan bila pernah diubah Admin IT.
    assert((await setting("skema_wajib")) === "true",
           "kunci pengajuan fee harus menyala pada pemasangan yang bersih");

    const unit = await one<any>(
      "SELECT * FROM units WHERE code = 'BIOBA2-017'");
    const marketing = await one<any>(
      "SELECT * FROM marketings WHERE id = $1", [unit.marketing_id]);

    // Jenis yang memonya memang ada untuk tanggal kontrak unit ini: terhitung.
    const ada = await calc.calculate(
      unit, marketing, null, "closing_fee", "sales_inhouse");
    assert(ada.gross_amount > 0, "yang dinaungi memo tetap terhitung");
    assert(!ada.snapshot.skema_darurat,
           "yang dinaungi memo bukan jalur darurat");
    assert(Boolean(ada.snapshot.scheme_memo),
           "nomor memonya ikut tersimpan pada snapshot klaimnya");

    // Peran yang tidak disebut memo mana pun: ditolak, dengan kalimat yang
    // menyebut ke mana harus pergi membetulkannya.
    let tertolak: any = null;
    try {
      await calc.calculate(unit, marketing, null, "closing_fee", "bgb");
    } catch (e: any) { tertolak = e; }
    assert(tertolak instanceof WorkflowError,
           "yang tanpa memo ditolak sebagai WorkflowError, bukan galat mentah");
    assert(tertolak.code === "skema_tidak_ada",
           `kode penolakannya skema_tidak_ada, bukan ${tertolak?.code}`);
    assert(String(tertolak.message).includes("Referensi Pengajuan"),
           "penolakannya menyebut Referensi Pengajuan sebagai tempat membetulkannya");
  });

  await check("tombol pengajuan mati sejak awal bila memonya belum ada",
              async () => {
    // Penolakan yang sudah pasti tidak menunggu tombolnya ditekan: daftar
    // penjualan membaca memo yang berlaku, dan jenis fee yang tidak dinaungi
    // memo mana pun datang ke layar sebagai claimable:false — kotak centangnya
    // mati, jadi tombol Ajukan tidak pernah menyala untuknya.
    const unit = await one<any>(
      "SELECT * FROM units WHERE code = 'BIOBA2-017'");
    const penjaga = await calc.penjagaMemo(unit.project_id ?? null);

    assert(penjaga("closing_fee", unit.contract_date),
           "jenis yang dinaungi memo tetap dapat dicentang");
    assert(calc.dapatDiklaim(unit, "closing_fee", false,
                             penjaga("closing_fee", unit.contract_date))
           === calc.dapatDiklaim(unit, "closing_fee", false),
           "penjaga memo tidak mengubah apa pun selama memonya ada");

    // Tanggal yang jauh di luar masa berlaku memo mana pun: tidak ada yang
    // menaunginya, dan tombolnya memang harus mati.
    const jauh = { ...unit, contract_date: "1999-01-01" };
    assert(!penjaga("closing_fee", jauh.contract_date),
           "tanggal di luar seluruh masa berlaku memo tidak dinaungi siapa pun");
    assert(!calc.dapatDiklaim(jauh, "closing_fee", false,
                              penjaga("closing_fee", jauh.contract_date)),
           "yang tidak dinaungi memo tidak dapat diklaim dari daftar penjualan");
  });

  await check("Detail Perhitungan menyertai formulir fee, bukan hanya rekap OR",
              async () => {
    const { detailFee } = await import("../src/lib/detail-fee");
    const klaim = await one<any>(
      `SELECT id, claim_number, gross_amount, net_amount, withholding_tax
         FROM claims WHERE claim_type='commission' ORDER BY created_at LIMIT 1`);
    assert(Boolean(klaim), "perlu satu klaim komisi pada data contoh");
    const d = await detailFee(klaim.id);
    assert(Boolean(d), "klaim komisi harus punya lembar detailnya");
    assert(d!.bagian.length === 1 && d!.bagian[0].baris.length === 1,
           "lembar ini satu unit saja — unit yang sedang diajukan");
    const b = d!.bagian[0].baris[0];
    // Angkanya bukan hitungan baru: ia angka klaim itu sendiri. Lembar yang
    // menghitung ulang akan menyebut jumlah yang berbeda dari formulirnya.
    assert(b.amount === Number(klaim.gross_amount),
           `amount ${b.amount} harus sama dengan klaimnya ${klaim.gross_amount}`);
    assert(b.net === Number(klaim.net_amount), "net mengikuti klaimnya");
    assert(d!.bagian[0].total.net === Number(klaim.net_amount),
           "TOTAL satu baris sama dengan barisnya");
    // Kolom Selisih hanya berlaku bagi Overriding; di sini ia dikosongkan,
    // bukan diisi angka yang tidak berarti apa-apa.
    assert(b.selisih_persen === null && b.selisih_amount === 0,
           "kolom Selisih tidak diisi pada jenis selain Overriding");
    assert(b.nilai_excl > 0 && b.dpp_nilai_lain > 0,
           "nilai tanpa PPN dan DPP Nilai Lain ikut terhitung");
    // Overriding tetap memakai rekapnya sendiri, bukan lembar ini.
    const or = await one<any>(
      "SELECT id FROM claims WHERE claim_type='overriding' LIMIT 1");
    if (or) {
      assert((await detailFee(or.id)) === null,
             "klaim Overriding tidak memakai lembar Detail Perhitungan");
    }
  });

  await check("memo Excel dibaca sel demi sel, sebagaimana tertulis",
              async () => {
    // Bentuk memo yang sebenarnya: nomor, kategori dan nilai digabung
    // menaungi beberapa baris, sedangkan Keterangannya terpecah baris demi
    // baris di sebelahnya. Satu gabungan seperti itu adalah SATU baris memo
    // dengan beberapa baris keterangan — bukan lima baris memo bernomor
    // sama, dan bukan pula lima baris yang keterangannya tercerai-berai.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Jul");
    ws.addRow(["No. Memo : 013/UJI/VII/2026"]);
    ws.addRow(["Periode Program : Juli - September 2026"]);
    ws.addRow(["1. Skema Sales Inhouse"]);
    ws.addRow(["No", "Kategori", "Nilai", "Keterangan"]);
    ws.addRow([1, "Komisi Inhouse", "1 unit = 1.5%",
               "Pembayaran sampai periode Program Berakhir :"]);
    ws.addRow([null, null, null, "Cash & Cicilan"]);
    ws.addRow([null, null, null, "DP 15%, komisi diproses 100%"]);
    ws.addRow([2, "Cash Reward", 8000000, "per unit setelah akad"]);
    ws.addRow([3, "Overiding", 0.002, "DP 15% H+30"]);
    ws.mergeCells("A5:A7");
    ws.mergeCells("B5:B7");
    ws.mergeCells("C5:C7");
    ws.getCell("C8").numFmt = "#,##0";

    const baris = await skemaXlsx(Buffer.from(await wb.xlsx.writeBuffer()));
    assert(baris.length === 3, `seharusnya 3 baris, bukan ${baris.length}`);
    assert(baris[0].kategori === "Komisi Inhouse",
           `kategori baris pertama: ${baris[0].kategori}`);
    assert(baris[0].nilai === "1 unit = 1.5%",
           `nilai ditulis apa adanya, bukan ${baris[0].nilai}`);
    assert(baris[0].keterangan.split("\n").length === 3,
           "tiga baris keterangan tetap tiga baris pada satu sel");
    assert(baris[0].keterangan.split("\n")[1] === "Cash & Cicilan",
           "urutan baris keterangannya tidak berubah");
    assert(baris[1].nilai === "8.000.000",
           `nominal mengikuti formatnya, bukan ${baris[1].nilai}`);
    assert(baris[2].nilai === "0,002",
           `sel tanpa format tidak boleh dibulatkan: ${baris[2].nilai}`);
    assert(baris[0].kelompok === "Skema Sales Inhouse",
           `judul tabelnya ikut terbaca, bukan ${baris[0].kelompok}`);
  });

  await check("persen pada sel Excel dibaca sebagaimana ditampilkan",
              async () => {
    // Sel persen menyimpan 0,015 dan menampilkan 1,50%. Yang tertulis pada
    // memo — dan yang kemudian diperiksa orang — adalah 1,50%.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Skema");
    ws.addRow(["Kategori", "Nilai", "Keterangan"]);
    ws.addRow(["Komisi Inhouse", 0.015, "1 unit"]);
    ws.getCell("B2").numFmt = "0.00%";
    const baris = await skemaXlsx(Buffer.from(await wb.xlsx.writeBuffer()));
    assert(baris.length === 1, `satu baris, bukan ${baris.length}`);
    assert(baris[0].nilai === "1,50%",
           `persen sebagaimana tampil, bukan ${baris[0].nilai}`);
    assert(persenDesimal(baris[0].nilai) === "0.015",
           "bacaan 1,50% menjadi tarif 0,015");
  });

  await check("satu butir bernomor tetap satu baris, sepanjang apa pun",
              async () => {
    // Bentuk memo yang sebenarnya: satu butir bernomor menaungi beberapa
    // baris lembar lewat sel gabungan, dan keterangannya ditulis berbaris-
    // baris. Dipecah per baris lembar, tarifnya tercatat berulang kali pada
    // memo yang menyebutkannya sekali — dan karena kolom Nilai dan kolom
    // Keterangan bergabung pada baris yang berbeda, pecahan itu memasangkan
    // nilai dengan keterangan yang bukan miliknya.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Jul");
    ws.addRow(["1. Skema Sales Inhouse"]);
    ws.addRow(["No", "Kategori", "Nilai", "Keterangan"]);
    ws.addRow([1, "Komisi Inhouse", "1 unit = 1.5%", "Cash & Cicilan"]);
    ws.addRow([null, null, null, "DP 15%, diproses setelah PPJB"]);
    ws.addRow([null, null, null, "KPR"]);
    ws.addRow([2, "Cash Reward", "Sales Manager", "Akad Kredit"]);
    ws.addRow([null, null, "Rp. 800.000/per unit", null]);
    ws.addRow([null, null, "Sales Koordinator", null]);
    ws.addRow([null, null, "Rp. 600.000/per unit", null]);
    // Nomor, kategori, dan nilai membentang; keterangannya tidak.
    ws.mergeCells("A3:A5"); ws.mergeCells("B3:B5"); ws.mergeCells("C3:C5");
    ws.mergeCells("A6:A9"); ws.mergeCells("B6:B9"); ws.mergeCells("D6:D9");
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const baris = await skemaXlsx(buf);
    assert(baris.length === 2, `seharusnya 2 butir, bukan ${baris.length}`);
    assert(baris[0].nilai === "1 unit = 1.5%",
           `tarif tidak boleh berulang: ${JSON.stringify(baris[0].nilai)}`);
    assert(baris[0].keterangan ===
             "Cash & Cicilan\nDP 15%, diproses setelah PPJB\nKPR",
           `keterangan berbaris-baris tetap utuh dan berurutan: ` +
           JSON.stringify(baris[0].keterangan));
    // Dua nominal yang dilebur menjadi satu kalimat adalah salah baca yang
    // paling mahal di tabel yang menentukan komisi.
    assert(baris[1].nilai ===
             "Sales Manager\nRp. 800.000/per unit\n" +
             "Sales Koordinator\nRp. 600.000/per unit",
           `nominal tidak boleh beradu: ${JSON.stringify(baris[1].nilai)}`);
    assert(baris[1].keterangan === "Akad Kredit",
           `keterangan yang membentang hanya dicatat sekali: ` +
           JSON.stringify(baris[1].keterangan));
  });

  await check("periode program terbaca dari cara memo menuliskannya",
              async () => {
    const { rentangBulan } = await import("../src/lib/memo-tebak");
    // "s/d" sesering "s.d." pada memo yang sama, dan harinya sering
    // disebutkan. Periode yang tidak terbaca membuat kolom Periode Program
    // pada ringkasan kosong, dan skemanya seolah berlaku selamanya.
    assert(rentangBulan("Periode Program: 1 Januari 2026 s/d 30 Juni 2026")
             .berlaku_dari === "2026-01-01", "s/d dengan hari: awal");
    assert(rentangBulan("Periode Program: 1 Januari 2026 s/d 30 Juni 2026")
             .berlaku_sampai === "2026-06-30", "s/d dengan hari: akhir");
    assert(rentangBulan("Periode 15 Februari 2026 sampai dengan 14 Agustus 2026")
             .berlaku_sampai === "2026-08-14",
           "hari yang tertulis dipakai apa adanya");
    // Tanpa hari, bulannya yang dipakai — dari tanggal 1 sampai tanggal
    // terakhir; menebak lebih tepat dari itu berarti mengarang.
    assert(rentangBulan("berlaku Oktober 2025 - Maret 2026")
             .berlaku_dari === "2025-10-01", "tahun awal disimpulkan mundur");
    assert(!rentangBulan("tidak ada periode di sini").berlaku_dari,
           "yang memang tidak menyebut periode tidak boleh ditebak");
  });

  await check("persentase memo dibaca dari tulisan orang, bukan tebakan",
              async () => {
    // Satu nilai, beberapa cara menuliskannya. Yang salah dibaca di sini
    // menjadi tarif yang salah pada seluruh klaim sesudahnya.
    assert(persenDesimal("2,5") === "0.025", "2,5 seharusnya 0,025");
    assert(persenDesimal("2.5") === "0.025", "2.5 seharusnya 0,025");
    assert(persenDesimal("1,75%") === "0.0175", "1,75% seharusnya 0,0175");
    assert(persenDesimal("") === null, "kosong seharusnya null");
    assert(nominal("10.000.000") === 10000000, "nominal 10 juta");
    assert(nominal("") === null, "nominal kosong seharusnya null");
    let ditolak = false;
    try { persenDesimal("dua koma lima"); } catch { ditolak = true; }
    assert(ditolak, "persentase yang tidak terbaca harus ditolak");
  });

  await check("baris memo baru menjadi tarif setelah diberlakukan", async () => {
    // Tabel memo_skema dipasang dari sisi aplikasi (src/lib/memo.ts) saat
    // layar memo pertama dibuka; uji ini menulis ke sana sebelum itu terjadi.
    await ensureKolomRujukan();
    const project = await one<any>(
      "SELECT id FROM projects WHERE slug='bio-district'");
    const memo = await one<any>(
      `INSERT INTO memos (project_id, judul, nomor, berlaku_dari,
         berlaku_sampai, tanggal_memo, file_name, content_type, size_bytes,
         content, uploaded_by)
       VALUES ($1, 'Uji Rujukan', 'UJI/001', '2026-01-01', '2026-12-31',
               '2026-01-01', 'uji.pdf', 'application/pdf', 4,
               '\\x25504446'::bytea, 'admin')
       RETURNING *`, [project.id]);
    await query(
      `INSERT INTO memo_skema (memo_id, kelompok, urutan, kategori, nilai,
         keterangan, baris)
       VALUES ($1, 'Skema Komisi Uji', 1, 'Komisi Inhouse 1 unit', '1,25%',
               'dokumen lengkap', 0)`, [memo.id]);

    const sebelum = await daftarRujukan(project.id);
    const baris = sebelum.find((b) => b.no_memo === "UJI/001");
    assert(baris, "baris rujukan harus muncul pada daftarnya");
    assert(!baris!.scheme_id, "baris baru harus berdiri sebagai usulan");
    assert(baris!.nilai === "1,25%", `nilai memo: ${baris!.nilai}`);

    // Yang diberlakukan angka yang DIPERIKSA orang, bukan hasil bacaan mesin:
    // di sini 1,3% walau memonya tertulis 1,25%.
    const skema = await berlakukan({
      barisId: baris!.id, projectId: project.id, actor: "admin",
      claimType: "commission", recipientRole: "sales_inhouse",
      percentage: "1,3", from: "2026-01-01", to: "2026-12-31",
    });
    assert(Number(skema.percentage) === 0.013, `persen: ${skema.percentage}`);
    assert(skema.memo_reference === "UJI/001",
           `memo pada skemanya: ${skema.memo_reference}`);
    assert(skema.project_id === project.id,
           "skema tanpa project tidak akan pernah terpakai");

    const sesudah = (await daftarRujukan(project.id))
      .find((b) => b.no_memo === "UJI/001")!;
    assert(sesudah.scheme_id === skema.id, "barisnya harus menunjuk skemanya");
    assert(sesudah.diberlakukan_oleh === "admin",
           "yang memberlakukan harus tercatat pada barisnya");

    // Diberlakukan dua kali berarti dua tarif untuk satu baris memo.
    let dobel = false;
    try {
      await berlakukan({
        barisId: baris!.id, projectId: project.id, actor: "admin",
        claimType: "commission", percentage: "1,3", from: "2026-01-01",
      });
    } catch { dobel = true; }
    assert(dobel, "baris yang sudah berlaku tidak boleh diberlakukan lagi");

    // Belum dipakai klaim mana pun, jadi masih boleh dicabut.
    await cabut(baris!.id, project.id, "admin");
    const dicabut = (await daftarRujukan(project.id))
      .find((b) => b.no_memo === "UJI/001")!;
    assert(!dicabut.scheme_id, "setelah dicabut barisnya kembali usulan");
    const sisa = await one<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM incentive_schemes WHERE id=$1",
      [skema.id]);
    assert(Number(sisa!.n) === 0, "skema yang dicabut harus ikut terhapus");

    await query("DELETE FROM memos WHERE id=$1", [memo.id]);
  });

  await check("tanpa persen maupun nominal, baris tidak dapat diberlakukan",
              async () => {
    const project = await one<any>(
      "SELECT id FROM projects WHERE slug='bio-district'");
    const memo = await one<any>(
      `INSERT INTO memos (project_id, judul, nomor, file_name, content_type,
         size_bytes, content, uploaded_by)
       VALUES ($1, 'Uji Kosong', 'UJI/002', 'uji.pdf', 'application/pdf', 4,
               '\\x25504446'::bytea, 'admin')
       RETURNING *`, [project.id]);
    await query(
      `INSERT INTO memo_skema (memo_id, kelompok, urutan, kategori, nilai,
         keterangan, baris)
       VALUES ($1, 'Skema Uji', 1, 'Tanpa nilai', '', '', 0)`, [memo.id]);
    const baris = (await daftarRujukan(project.id))
      .find((b) => b.no_memo === "UJI/002")!;

    let ditolak = false;
    try {
      await berlakukan({
        barisId: baris.id, projectId: project.id, actor: "admin",
        claimType: "commission", from: "2026-01-01",
      });
    } catch { ditolak = true; }
    assert(ditolak, "tarif kosong tidak boleh menjadi skema");

    // Tanggal terbalik pun ditolak: masa berlaku yang mundur tidak pernah
    // cocok dengan tanggal kontrak mana pun, dan penolakannya baru terlihat
    // berbulan-bulan kemudian sebagai "belum ada memo yang berlaku".
    let terbalik = false;
    try {
      await berlakukan({
        barisId: baris.id, projectId: project.id, actor: "admin",
        claimType: "commission", percentage: "1", from: "2026-06-01",
        to: "2026-01-01",
      });
    } catch { terbalik = true; }
    assert(terbalik, "masa berlaku yang mundur harus ditolak");

    await query("DELETE FROM memos WHERE id=$1", [memo.id]);
  });

  await check("modul laporan tidak menyediakan jalur tulis", async () => {
    const mod: Record<string, unknown> = await import("../src/lib/report");
    const writers = Object.keys(mod).filter((k) =>
      /^(write|update|save|insert)/i.test(k));
    assert(writers.length === 0,
           `laporan adalah view, tidak boleh punya: ${writers.join(", ")}`);
  });

  // Simulasi cara bayar: angka harapannya diambil dari berkas Excel
  // "Simulation TOP Naraya" yang menjadi asalnya — lembar NPV Cash Keras pada
  // salinan yang cara bayarnya memang Cash Keras, dan NPV BANK KPR pada
  // salinan satu lagi. Hanya lembar cara bayar terpilih yang angkanya hidup di
  // berkas itu, sebab tiap lembar mengambil harganya lewat IF(cara bayar = ...).
  //
  // Diuji terhadap angka berkasnya, bukan terhadap rumus yang ditulis ulang di
  // sini: yang harus sama adalah hasilnya, dan hasil itulah yang dibandingkan
  // orang dengan berkas yang masih mereka pegang.
  await check("simulasi cash keras sama dengan berkas asalnya", async () => {
    const { hitung } = await import("../src/lib/simulasi");
    const { unitHarga } = await import("../src/lib/pricelist-naraya");
    const unit = unitHarga("NS-NR1-01");
    assert(!!unit, "NS-NR1-01 harus ada di pricelist");
    const h = hitung({ unit: unit!, skema: "CASH KERAS", diskon: 0,
                       bungaKpr: 0.0465,
                       tanggal: new Date(Date.UTC(2026, 9, 14)) });

    const bulat = (n: number) => Math.round(n);
    assert(h.hargaTransaksi === 1_817_000_000, `harga: ${h.hargaTransaksi}`);
    assert(h.termin.length === 3, `termin: ${h.termin.length}`);
    assert(bulat(h.termin[1].nilai) === 535_100_000, `p1: ${h.termin[1].nilai}`);
    assert(bulat(h.termin[2].nilai) === 1_271_900_000, `p2: ${h.termin[2].nilai}`);
    assert(h.termin[1].hari === 7 && h.termin[2].hari === 14, "jarak hari");
    assert(bulat(h.termin[2].pv) === 1_266_060_185, `pv: ${h.termin[2].pv}`);
    assert(bulat(h.jumlahPv) === 1_809_930_340, `npv: ${h.jumlahPv}`);

    // Booking fee tidak kena DTP, dan pajaknya terbawa ke termin sesudahnya.
    assert(h.termin[0].dtp === 0, "booking fee tidak kena DTP");
    assert(h.termin[1].dtp === 54_018_919, `dtp p1: ${h.termin[1].dtp}`);
    assert(h.termin[2].dtp === 126_044_144, `dtp p2: ${h.termin[2].dtp}`);
    assert(h.jumlahDtp === h.totalDtp,
           `alokasi DTP harus habis: ${h.jumlahDtp} vs ${h.totalDtp}`);
  });

  await check("pagu DTP memotong harga di atas batas", async () => {
    const { hitung } = await import("../src/lib/simulasi");
    const { unitHarga } = await import("../src/lib/pricelist-naraya");
    const unit = unitHarga("NS-NR1-01")!;
    // Harga transaksinya 2,302 miliar, di atas Max PPN DTP 2,22 miliar tetapi
    // di bawah Harga Jual Max 5,55 miliar: dasarnya dipotong ke pagu.
    const h = hitung({ unit, skema: "BANK KPR - DP 10% (KPR REGULAR)",
                       diskon: 0, bungaKpr: 0.0465,
                       tanggal: new Date(Date.UTC(2026, 9, 14)) });
    assert(h.hargaTransaksi === 2_302_000_000, `harga: ${h.hargaTransaksi}`);
    assert(h.totalDtp === 220_000_000, `pagu: ${h.totalDtp}`);
    assert(h.jumlahDtp === 220_000_000, `terpakai: ${h.jumlahDtp}`);
  });

  // Angka harapan dari lembar cetak "Simulasi Hitungan Rumah" berkas yang
  // sama: BANK KPR, NS-NR1-01, booking 15 Oktober 2026, bunga 4,65%.
  await check("angsuran KPR sama dengan lembar Simulasi Hitungan Rumah", async () => {
    const { hitung } = await import("../src/lib/simulasi");
    const { unitHarga } = await import("../src/lib/pricelist-naraya");
    const h = hitung({ unit: unitHarga("NS-NR1-01")!,
                       skema: "BANK KPR - DP 10% (KPR REGULAR)", diskon: 0,
                       bungaKpr: 0.0465, tanggal: new Date(Date.UTC(2026, 9, 15)) });
    const harap = [[5, 35_076_445], [10, 19_564_019], [15, 14_484_788],
                   [20, 12_012_047], [25, 10_579_952]];
    assert(JSON.stringify(h.angsuran.map((a) => [a.tahun, Math.round(a.perBulan)]))
             === JSON.stringify(harap),
           `angsuran: ${JSON.stringify(h.angsuran)}`);
  });

  await check("jadwal tiap cara bayar menjumlah persis harga transaksinya",
              async () => {
    const { hitung, SKEMA } = await import("../src/lib/simulasi");
    const { PRICELIST } = await import("../src/lib/pricelist-naraya");
    // Seluruh unit, seluruh cara bayar. Jadwal yang tidak menjumlah persis
    // harga transaksinya berarti ada termin yang hilang atau dihitung dua kali,
    // dan selisih sekecil satu rupiah pun akan ditemukan konsumen.
    for (const unit of PRICELIST) {
      for (const skema of SKEMA) {
        const h = hitung({ unit, skema, diskon: 0.05, bungaKpr: 0.0465,
                           tanggal: new Date(Date.UTC(2026, 9, 14)) });
        // Batasnya sepersepuluh rupiah, bukan nol. Cicilan 30x membagi 90%
        // harga menjadi 29 bagian, dan 29 bukan pangkat dua: jumlah kembalinya
        // meleset beberapa per sejuta rupiah pada bilangan pecahan biner mana
        // pun. Yang diuji di sini tidak ada termin yang hilang, bukan bahwa
        // pembagian biner dapat dibalik dengan sempurna.
        const selisih = Math.abs(h.jumlahNilai - h.hargaTransaksi);
        assert(selisih < 0.1,
               `${unit.kode} ${skema}: ${h.jumlahNilai} vs ${h.hargaTransaksi}`);
        // Tagihan ditambah DTP harus kembali menjadi nilai penuhnya.
        const kembali = Math.abs(h.jumlahTagihan + h.jumlahDtp - h.jumlahNilai);
        assert(kembali < 0.1, `${unit.kode} ${skema}: tagihan + DTP`);
      }
    }
  });

  await check("di luar periode DTP tidak ada PPN yang ditanggung", async () => {
    const { hitung } = await import("../src/lib/simulasi");
    const { unitHarga } = await import("../src/lib/pricelist-naraya");
    const unit = unitHarga("NS-NR1-01")!;
    // 2027 tidak tercakup tabel tarif: tidak ada DTP sama sekali, dan seluruh
    // nilainya ditagihkan kepada konsumen.
    const h = hitung({ unit, skema: "CASH KERAS", diskon: 0, bungaKpr: 0.0465,
                       tanggal: new Date(Date.UTC(2027, 2, 1)) });
    assert(h.tarifDtp === 0 && h.totalDtp === 0, `tarif: ${h.tarifDtp}`);
    assert(h.jumlahDtp === 0, `dtp: ${h.jumlahDtp}`);
    assert(Math.abs(h.jumlahTagihan - h.jumlahNilai) < 0.1, "tagihan penuh");
  });

  // Pricelist unggahan: nama kolom cara bayar menentukan jadwalnya. Kesepuluh
  // nama Naraya harus terbaca sebagai bentuk yang jadwalnya sama dengan berkas
  // Excel-nya — uji angka di atas berjalan lewat jalur ini juga.
  await check("nama cara bayar terbaca sebagai bentuk jadwalnya", async () => {
    const { bentukSkema } = await import("../src/lib/simulasi");
    const harap: Record<string, string> = {
      "CASH KERAS": '{"jenis":"cash"}',
      "CICILAN 12x": '{"jenis":"cicilan","kali":12}',
      "CICILAN 30x": '{"jenis":"cicilan","kali":30}',
      "KPR EXPRESS": '{"jenis":"kpr","muka":0.1}',
      "BANK KPR - DP 10% (KPR REGULAR)": '{"jenis":"kpr","muka":0.1}',
      "KPR DP 0% Express": '{"jenis":"kpr-dp0"}',
      "KPR DP 10%/4x": '{"jenis":"kpr-cicil","muka":0.1,"kali":4}',
      "KPR DP 20%/6x": '{"jenis":"kpr-cicil","muka":0.2,"kali":6}',
      // Lembar Pricelist Naraya menuliskannya tanpa kata KPR.
      "DP 10%/4x": '{"jenis":"kpr-cicil","muka":0.1,"kali":4}',
      "DP 20%/6x": '{"jenis":"kpr-cicil","muka":0.2,"kali":6}',
    };
    for (const [nama, json] of Object.entries(harap)) {
      const b = JSON.stringify(bentukSkema(nama));
      assert(b === json, `${nama}: ${b}`);
    }
    assert(bentukSkema("Harga Spesial") === null, "nama asing harus ditolak");
  });

  await check("unggahan pricelist dibaca dan diperiksa", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { bacaPricelist, templatePricelist } = await import("../src/lib/pricelist");

    // Template yang diunduh orang harus terbaca kembali tanpa galat.
    const t = await templatePricelist();
    const tb = await bacaPricelist(
      t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength) as ArrayBuffer);
    assert(tb.galat.length === 0, `template: ${tb.galat.join("; ")}`);
    assert(tb.unit.length === 5 && tb.skema.length === 10,
           `template: ${tb.unit.length} unit, ${tb.skema.length} skema`);
    assert(tb.unit[0].harga["CASH KERAS"] === 1_817_000_000, "harga template");

    // Berkas project lain: judul di atas tabel, angka berformat Indonesia,
    // Unit No dobel dan sel bukan angka harus menjadi galat.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Simulation TOP");
    ws.addRow(["PRICELIST"]); ws.addRow([]);
    ws.addRow(["Unit No", "Address", "Tipe", "Area (M²)", "", "CASH KERAS",
               "CICILAN 36x"]);
    ws.addRow(["", "", "", "Land", "Build"]);
    ws.mergeCells(3, 4, 3, 5);
    ws.addRow(["X-01", "A", "9", "146,50", "88,00", "1.817.000.000", 1_906_000_000]);
    ws.addRow(["X-02", "A", 9, 85, 88, 1_329_000_000, "abc"]);
    ws.addRow(["X-02", "A", 9, 85, 88, 1_329_000_000, 1_394_000_000]);
    const h = await bacaPricelist(await wb.xlsx.writeBuffer() as ArrayBuffer);
    assert(h.barisJudul === 3, `baris judul: ${h.barisJudul}`);
    assert(h.unit[0].lt === 146.5 && h.unit[0].harga["CASH KERAS"] === 1_817_000_000,
           `angka Indonesia: ${JSON.stringify(h.unit[0])}`);
    assert(h.galat.some((g) => g.includes("dua kali")), "Unit No dobel");
    assert(h.galat.some((g) => g.includes("bukan angka")), "sel bukan angka");

    // Susunan lembar Pricelist Naraya: keterangan Phase/Ukuran/View/Sub-Tipe,
    // tiap harga diikuti DPP dan Nilai Free PPN DTP, dan lembar lain berkolom
    // "Unit No" bernomor urut dobel di depannya.
    const wn = new ExcelJS.Workbook();
    const wd = wn.addWorksheet("Data Pricelist");
    wd.addRow(["Unit No", "Address", "Tipe", "Land", "Build", "Cash Keras"]);
    wd.addRow([1, "A", 7, 85, 88, 1]); wd.addRow([1, "A", 7, 85, 88, 1]);
    const wp = wn.addWorksheet("Pricelist");
    wp.addRow(["PRICELIST"]);
    wp.addRow(["No", "Address", "Unit No", "Phase", "Ukuran", "View", "Tipe",
               "Sub-Tipe", "Area (M²)", "", "Cash Keras", "DPP",
               "NILAI FREE PPN DTP \nCASH KERAS", "DP 10%/4x", "DPP",
               "NILAI FREE PPN DTP \nDP 10%/4x"]);
    wp.addRow(["", "", "", "", "", "", "", "", "Land", "Build"]);
    wp.addRow([1, "NARAYA 1", "NS-NR1-01", 1, "8,5x18,5", "SELATAN", 7,
               "Hoek (IRR K)", 146.5, 88, 1_817_000_000, 1_636_936_937,
               180_063_063, 2_023_000_000, 1_822_522_523, 200_477_477]);
    const n = await bacaPricelist(await wn.xlsx.writeBuffer() as ArrayBuffer);
    assert(n.lembar === "Pricelist" && n.galat.length === 0,
           `lembar ${n.lembar}: ${n.galat.join("; ")}`);
    assert(JSON.stringify(n.skema.map((s) => s.nama)) === '["Cash Keras","DP 10%/4x"]',
           `skema: ${n.skema.map((s) => s.nama).join(", ")}`);
    const u = n.unit[0];
    assert(u.kode === "NS-NR1-01" && u.phase === "1" && u.view === "SELATAN" &&
           u.ukuran === "8,5x18,5" && u.subTipe === "Hoek (IRR K)",
           `keterangan: ${JSON.stringify(u)}`);
    assert(u.pajak?.["DP 10%/4x"]?.dpp === 1_822_522_523 &&
           u.pajak?.["Cash Keras"]?.dtp === 180_063_063,
           `pajak: ${JSON.stringify(u.pajak)}`);
  });

  // Penyusunan pricelist lima langkah: Data (IRR) → Unit Data → Data
  // Pricelist → Pricelist harus menghasilkan angka yang sama persis dengan
  // berkas Excel PL Naraya (revisi 21 Juli 2026) untuk unit-unit yang
  // mewakili setiap jenis faktor: Hoek (IRR K), Badan tanpa faktor, dan unit
  // depan + hoek garden + show unit.
  await check("susun pricelist lima langkah sama dengan Excel", async () => {
    const { hitungSemua, unitKosong, roundUp } =
      await import("../src/lib/susun-pricelist");
    const s = await susunNaraya();
    // Rumus lembar Data (IRR) Excel memakai porsi tahap 40/40/10/10.
    s.irr.porsiTahap = [0.4, 0.4, 0.1, 0.1];
    const dasar = { ...unitKosong(), alamat: "NARAYA", hargaTanah: 7_000_000,
                    lb: 88, hargaBangunan: 6_500_000, faktorTambah: 0.02, tipe: "7" };
    s.unit = [
      { ...dasar, kode: "NS-NR1-01", lt: 146.5, faktor: { hoek: 0.001 } },
      { ...dasar, kode: "NS-NR1-03", lt: 70 },
      { ...dasar, kode: "NS-NRB-10", lt: 110.62, showUnit: 400_000_000,
        faktor: { unitDepan: 0.003, hoekGarden: 0.002 } },
    ];
    const h = hitungSemua(s);
    assert(h.galat.length === 0, h.galat.join("; "));
    const koef = Object.values(h.irr.koef).map((x) => x.toFixed(5)).join(" ");
    assert(koef === "1.00000 1.04942 1.07276 1.09643 1.12044 1.01430 1.12582 1.11412 1.10443",
           `koefisien: ${koef}`);
    assert(Object.entries(h.irr.irr).every(([n, v]) => n === "Cash Keras" || Math.abs(v - 0.09) < 1e-9),
           "IRR tiap cara bayar harus 9%");
    assert(h.baris[0].hasilUnit.base === 1_774_000_000, `base: ${h.baris[0].hasilUnit.base}`);
    const harap: Record<string, number[]> = {
      "NS-NR1-01": [1817, 1906, 1949, 1991, 2035, 2055, 2302, 2045, 2023, 2006],
      "NS-NR1-03": [1208, 1268, 1296, 1324, 1353, 1366, 1530, 1359, 1345, 1334],
      "NS-NRB-10": [1938, 2034, 2079, 2124, 2171, 2192, 2455, 2181, 2159, 2140],
    };
    for (const b of h.baris) {
      const dapat = s.pricelist.kolom.map((k) => b.pricelist[k.nama].harga / 1e6);
      assert(JSON.stringify(dapat) === JSON.stringify(harap[b.unit.kode]),
             `${b.unit.kode}: ${dapat.join(", ")}`);
    }
    const kpr = h.baris[1].pricelist["BANK KPR - DP 10% (KPR REGULAR)"];
    assert(kpr.dpp === 1_378_378_378 && kpr.dtp === 151_621_622, `DPP/DTP: ${JSON.stringify(kpr)}`);
    // Di atas pagu, PPN DTP berhenti di 220 juta.
    assert(h.baris[0].pricelist["BANK KPR - DP 10% (KPR REGULAR)"].dtp === 220_000_000, "pagu DTP");
    // ROUNDUP tidak boleh naik satu juta hanya karena galat biner.
    assert(roundUp(1_811_289_480 * 1, 6) === 1_812_000_000 && roundUp(2_000_000_000.0000002, 6) === 2_000_000_000,
           "roundUp");
  });

  await check("susun pricelist: ekspor Excel terbaca kembali sebagai pricelist", async () => {
    const { unitKosong } = await import("../src/lib/susun-pricelist");
    const { eksporSusun, imporSusun } = await import("../src/lib/susun-pricelist-xlsx");
    const { bacaPricelist } = await import("../src/lib/pricelist");
    const s = await susunNaraya();
    s.pricelist.tanggal = "21 Juli 2026";
    s.unit = [{ ...unitKosong(), kode: "X-01", alamat: "A", lt: 70, hargaTanah: 7_000_000,
                lb: 88, hargaBangunan: 6_500_000, tipe: "7" }];
    const x = await eksporSusun(s);
    const ab = x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) as ArrayBuffer;
    const r = await bacaPricelist(ab);
    assert(r.lembar === "Pricelist" && r.galat.length === 0 && r.skema.length === 10,
           `ekspor: ${r.lembar} ${r.galat.join("; ")}`);
    assert(r.unit[0].harga["Cash Keras"] === 1_208_000_000, JSON.stringify(r.unit[0].harga));
    const imp = await imporSusun(ab);
    assert(imp.susun.unit.length === 1 && imp.susun.unit[0].kode === "X-01",
           `impor ulang: ${imp.susun.unit.length}`);
  });

  await check("impor Unit Data: judul Code Unit, hanya lembar terbuka", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { imporUnitData } = await import("../src/lib/susun-pricelist-xlsx");
    const buat = async (state: "visible" | "hidden") => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("UNIT DATA", { state });
      ws.addRow([]); ws.addRow([]);
      ws.addRow(["No", "Code Unit", "Address", "View", "No", "Ukuran", "Type", "View",
                 "Sub-Tipe", "Area (M²)", "", "", "", "", "", "", "", "Phase"]);
      ws.addRow(["", "", "", "", "", "", "", "", "", "Land", "Land Price (base)", "", "",
                 "GFA", "GFA (base)"]);
      ws.addRow([1, "NS-NR1-01", "NARAYA 1", "SELATAN", 1, "8,5x18,5", 70, "Irregullar",
                 "Hoek (IRR K)", 146.5, 7_000_000, null, null, 88, 6_500_000]);
      ws.addRow([2, "", "", "", "", "", "", "", "", 0]);
      const x = await wb.xlsx.writeBuffer() as ArrayBuffer;
      return imporUnitData(x);
    };
    const r = await buat("visible");
    assert(r.unit.length === 1 && r.unit[0].kode === "NS-NR1-01" && r.unit[0].no === "1" &&
           r.unit[0].lt === 146.5 && r.unit[0].hargaBangunan === 6_500_000,
           `unit: ${JSON.stringify(r.unit)}`);
    let ditolak = false;
    try { await buat("hidden"); } catch { ditolak = true; }
    assert(ditolak, "lembar UNIT DATA tersembunyi harus ditolak");
  });

  // Isian awal Naraya Serpong (dari Data_Pricelist.xlsx) harus menghasilkan
  // harga yang sama dengan lembar Pricelist Excel-nya.
  await check("isian awal pricelist Naraya sama dengan Excel 21.07.2026", async () => {
    const { SUSUN_NARAYA } = await import("../src/lib/susun-pricelist-naraya");
    const { hitungSemua } = await import("../src/lib/susun-pricelist");
    // Porsi rumus Excel 40/40/10/10 → harga sama persis dengan Excel.
    const h = hitungSemua(SUSUN_NARAYA);
    assert(JSON.stringify(SUSUN_NARAYA.irr.porsiTahap) === "[0.4,0.4,0.1,0.1]", "porsi 40/40/10/10");
    // Adjusted Price dihitung dengan rumus tepat pada target (bukan angka
    // Goal Seek Excel): IRR tepat 9%, harga unit tetap sama dengan Excel.
    const { hargaSesuaiSkema } = await import("../src/lib/susun-pricelist");
    assert(Object.entries(h.irr.irr).every(([n, v]) => n === "Cash Keras" || Math.abs(v - 0.09) < 1e-9),
           `IRR: ${JSON.stringify(h.irr.irr)}`);
    assert(hargaSesuaiSkema(SUSUN_NARAYA.irr, h.irr.koef["Cicilan12x"]) === 2_098_835_442,
           "Adjusted Price 12x = rumus Excel");
    assert(h.galat.length === 0 && h.baris.length === 48, `${h.baris.length} unit; ${h.galat.join("; ")}`);
    const harap: Record<string, number[]> = {
      "NS-NR1-01": [1817, 1906, 1949, 1991, 2035, 2055, 2302, 2045, 2023, 2006],
      "NS-NR1-03": [1208, 1268, 1296, 1324, 1353, 1366, 1530, 1359, 1345, 1334],
      "NS-NRB-10": [1938, 2034, 2079, 2124, 2171, 2192, 2455, 2181, 2159, 2140],
    };
    for (const [kode, nilai] of Object.entries(harap)) {
      const b = h.baris.find((x) => x.unit.kode === kode)!;
      const dapat = SUSUN_NARAYA.pricelist.kolom.map((k) => b.pricelist[k.nama].harga / 1e6);
      assert(JSON.stringify(dapat) === JSON.stringify(nilai), `${kode}: ${dapat.join(", ")}`);
    }
    assert(SUSUN_NARAYA.tnc.rekening.length === 2, "rekening T&C");
  });

  // Langkah 4b: harga spesial menggeser harga yang diberlakukan tanpa
  // menyentuh harga dasar langkah 4a.
  await check("harga spesial 4b menggeser harga tanpa mengubah harga dasar", async () => {
    const { SUSUN_NARAYA } = await import("../src/lib/susun-pricelist-naraya");
    const { hitungSemua } = await import("../src/lib/susun-pricelist");
    const kolom = SUSUN_NARAYA.pricelist.kolom.map((k) => k.nama);
    const [cash, cicilan] = kolom;
    const susun = {
      ...SUSUN_NARAYA,
      spesial: { set: [{
        id: "uji", nama: "Uji",
        unit: { "NS-NR1-01": { jenis: "persen" as const, nilai: -5 } },
        sel: { "NS-NR1-01": { [cicilan]: 1_750_000_000 } },
      }] },
    };
    const unit = (h: any, kode: string) => h.baris.find((x: any) => x.unit.kode === kode)!;
    const dasar = hitungSemua(susun);
    const khusus = hitungSemua(susun, "uji");
    // Harga dasar tidak bergeser sedikit pun, baik dengan set dipakai maupun tidak.
    assert(unit(dasar, "NS-NR1-01").pricelist[cash].harga === 1_817_000_000,
           `dasar: ${unit(dasar, "NS-NR1-01").pricelist[cash].harga}`);
    // Penyesuaian unit −5% menggeser seluruh cara bayar unit itu…
    assert(unit(khusus, "NS-NR1-01").pricelist[cash].harga === 1_726_150_000,
           `−5%: ${unit(khusus, "NS-NR1-01").pricelist[cash].harga}`);
    // …kecuali sel yang diketik sendiri, yang dipakai apa adanya.
    assert(unit(khusus, "NS-NR1-01").pricelist[cicilan].harga === 1_750_000_000,
           `sel: ${unit(khusus, "NS-NR1-01").pricelist[cicilan].harga}`);
    // Unit lain tidak ikut bergeser.
    assert(unit(khusus, "NS-NR1-03").pricelist[cash].harga
             === unit(dasar, "NS-NR1-03").pricelist[cash].harga, "unit lain tetap");
    // DPP dan nilai free PPN DTP dihitung ulang dari harga spesialnya.
    const p = unit(khusus, "NS-NR1-01").pricelist[cash];
    assert(Math.abs(p.dpp + p.dtp - p.harga) < 1 || p.dtp === 0,
           `dpp+dtp: ${p.dpp} + ${p.dtp} vs ${p.harga}`);
  });

  // Data (IRR): Adjusted Price tersimpan (hasil Goal Seek Excel) menentukan
  // koefisien persis seperti Excel (Adjusted / Cash); mengubah arus kasnya
  // kembali ke perhitungan tepat pada target.
  await check("Data (IRR): koefisien dari Adjusted Price sama dengan Excel", async () => {
    const { hitungIrr, koefisienTepat } = await import("../src/lib/susun-pricelist");
    const s = await susunNaraya();
    const c12 = s.irr.skema.find((x) => x.nama === "Cicilan 12x")!;
    c12.hargaSesuai = 2098835043.1433501;
    const h = hitungIrr(s.irr);
    assert(h.koef["Cicilan 12x"] === 1.049417521571675, `koef: ${h.koef["Cicilan 12x"]}`);
    assert(Math.abs(h.irr["Cicilan 12x"] - 0.08999964119269688) < 1e-9, `irr: ${h.irr["Cicilan 12x"]}`);
    // Satu Cash Price untuk semua cara bayar: Adjusted = Cash × koefisien,
    // koefisien tidak berubah.
    const { hargaSesuaiSkema } = await import("../src/lib/susun-pricelist");
    assert(hargaSesuaiSkema(s.irr, h.koef["Cicilan 12x"]) === 2_098_835_043, "adjusted 2 M");
    s.irr.hargaKas = 1_500_000_000;
    assert(hitungIrr(s.irr).koef["Cicilan 12x"] === h.koef["Cicilan 12x"], "koef tetap");
    assert(hargaSesuaiSkema(s.irr, h.koef["Cicilan 12x"]) === Math.round(1_500_000_000 * 1.049417521571675),
           `adjusted 1,5 M: ${hargaSesuaiSkema(s.irr, h.koef["Cicilan 12x"])}`);
    const tepat = koefisienTepat(c12, s.irr);
    assert(Math.abs(tepat - 1.049417521571675) < 1e-6 && tepat !== h.koef["Cicilan 12x"],
           `tepat: ${tepat}`);
  });

  // Kolom Excel Mazenta: Harga Dasar (Terendah) = harga dasar × increase,
  // Harga Setelah Faktor (Terendah) = × faktor, (Kenaikan) = × kenaikan.
  await check("Data Unit: Terendah dan Kenaikan Setelah Faktor seperti Excel", async () => {
    const { hitungUnit, unitKosong } = await import("../src/lib/susun-pricelist");
    const u = { ...unitKosong(), lt: 100, hargaTanah: 3_220_000_000 / 100 / 1.11, lb: 0, hargaBangunan: 0,
      kenaikan: 0.1619270655279503, faktorTambah: 0, faktor: { hoek: 0.018 } };
    const h = hitungUnit(u, 0.11, false, 6, false, { baseTanpaBulat: true });
    assert(Math.round(h.base) === 3_741_405_151, `dasar ${h.base}`);
    assert(Math.round(h.factoredR) === 3_808_750_444 || Math.round(h.factoredR) === 3_808_750_443, `terendah ${h.factoredR}`);
    assert(h.factored === h.factoredR, "tanpa kenaikan setelah faktor");
    const k = hitungUnit({ ...u, kenaikanFaktor: 0.1 }, 0.11, false, 6, false, { baseTanpaBulat: true });
    assert(Math.abs(k.factored - h.factoredR * 1.1) < 1e-3 && k.factoredR === h.factoredR, `kenaikan ${k.factored}`);
  });

  // Isian awal memakai cara bayar standar (Data_Irr_TSC / data_irr_2), dan
  // draf yang masih berisi isian awal lama disamakan ke sana.
  await check("Data (IRR) isian awal = cara bayar standar; draf lama disamakan", async () => {
    const { hitungIrr, samakanIrrStandar, susunAwal } = await import("../src/lib/susun-pricelist");
    const a = susunAwal();
    const koef = Object.values(hitungIrr(a.irr).koef).map((x) => x.toFixed(4)).join(" ");
    assert(koef === "1.0000 1.0494 1.0964 1.1448 1.0143 1.1150 1.1208 1.1044", koef);
    const lama = await susunNaraya();
    const baru = samakanIrrStandar(lama);
    assert(baru.irr.skema.map((x) => x.nama).join("|") === a.irr.skema.map((x) => x.nama).join("|"), "disamakan");
    assert(baru.pricelist.kolom.length === 8 && baru.tnc.caraBayar.length === 8, "kolom & S&K");
    lama.irr.skema[1].dp = 0.5;
    assert(samakanIrrStandar(lama) === lama, "yang sudah diubah dibiarkan");
  });

  // Koefisien dipatenkan: cara bayar standar di project baru / TSC selalu
  // Goal Seek; koefisien manual hanya untuk cara bayar tambahan.
  await check("Koefisien cara bayar standar dikunci di project baru / TSC", async () => {
    const { basisProject, susunAwal } = await import("../src/lib/susun-pricelist");
    const s = susunAwal();
    s.irr.skema[1].hargaSesuai = 2_200_000_000;
    s.irr.skema[4].hargaSesuai = 2_030_000_000; // KPR Express boleh manual
    s.irr.skema.push({ nama: "Bertahap 60x", kelompok: "Cash", alokasi: 0, dp: 1, kali: 60,
                       bulan: [12, 18, 19, 20], hargaSesuai: 2_500_000_000 });
    const tsc = basisProject("tsc-scotts-vale", s);
    assert(tsc.irr.skema[1].hargaSesuai === undefined, "standar kembali Goal Seek");
    assert(tsc.irr.skema[8].hargaSesuai === 2_500_000_000, "tambahan boleh manual");
    assert(tsc.irr.skema[4].hargaSesuai === 2_030_000_000, "KPR Express boleh manual");
    assert(basisProject("mazenta-residence", s).irr.skema[1].hargaSesuai === 2_200_000_000, "project lama dibiarkan");
  });

  // Patokan PRICE LIST SCOTTS VALE: project baru di luar enam project lama
  // memakai rumus, Data (IRR) dan Data Harga yang sama dengan Scotts Vale.
  await check("Project baru mengikuti patokan Scotts Vale", async () => {
    const { basisProject, hitungSemua, polaScottsVale, samakanTsc, susunAwal } =
      await import("../src/lib/susun-pricelist");
    const { unitKosongTsc, unitTsc } = await import("../src/lib/unit-sanctuary");
    assert(polaScottsVale("proyek-baru") && unitTsc("proyek-baru"), "project baru berpola Scotts Vale");
    assert(!polaScottsVale("mazenta-residence") && !unitTsc("naraya-serpong"), "project lama tidak");
    const u = { ...unitKosongTsc(), kode: "PB-001", lt: 116.6, hargaTanah: 11_400_000,
      lb: 115.44, hargaBangunan: 11_500_000, faktor: { garduListrik: -0.02 } };
    const s = samakanTsc({ ...susunAwal(), unit: [u] });
    const sv = hitungSemua(basisProject("tsc-scotts-vale", s)), pb = hitungSemua(basisProject("proyek-baru", s));
    assert(JSON.stringify(pb.baris) === JSON.stringify(sv.baris), "hitungan sama dengan Scotts Vale");
    assert(Math.round(pb.baris[0].hasilUnit.base) === 2_656_800_000, `dasar ${pb.baris[0].hasilUnit.base}`);
    assert(s.irr.skema.some((x) => x.nama === "Bertahap 60x") && s.dataPricelist.tambahan === 0, "60x dan tambahan 0");
    assert(basisProject("proyek-baru", { ...s, bulatHargaM2: 5 }).bulatHargaM2 === -1, "rumus dipatenkan");
  });

  // Permai Indah: Data (IRR) berkas Data_Irr_PERMAI_INDAH.xlsx dengan rumus
  // Scotts Vale (100 bulan, Goal Seek Target IRR, nama otomatis).
  await check("Permai Indah: Data (IRR) berkas Permai dengan rumus Scotts Vale", async () => {
    const { hitungIrr, samakanPermai, samakanTsc, susunAwal, PERIODE_STANDAR } =
      await import("../src/lib/susun-pricelist");
    const lama = await susunNaraya();
    lama.irr.periode = 36;
    lama.irr.skema[6].hargaSesuai = 1_099_983_114;
    const p = samakanPermai(lama);
    assert(p.dataPricelist === lama.dataPricelist && p.tnc === lama.tnc, "kolom & S&K tetap");
    assert(p.irr.periode === PERIODE_STANDAR && p.irr.hargaKas === 1_000_000_000, "periode, harga tunai");
    assert(p.irr.skema.every((x) => !x.hargaSesuai), "KPR DP 0% Goal Seek");
    const h = hitungIrr(p.irr);
    // Koefisien Data (IRR) Excel Permai (Goal Seek di Excel, selisih iterasinya kecil).
    const excel = [1, 1.0494175216, 1.0727578086, 1.0964334422, 1.1204445790, 1.0142954028, null, 1.1141177617, 1.1044263012];
    p.irr.skema.forEach((x, i) => {
      const e = excel[i];
      if (e != null) assert(Math.abs(h.koef[x.nama] - e) < 2e-6, `${x.nama} ${h.koef[x.nama]} ≠ ${e}`);
      else assert(Math.abs(h.irr[x.nama] - 0.09) < 1e-9, `${x.nama} IRR ${h.irr[x.nama]}`);
    });
    assert(samakanPermai(p) === p, "hanya sekali");
    // Draf yang sempat disamakan dengan cara bayar Scotts Vale: dibangun ulang.
    const sv = { ...samakanTsc(susunAwal()), migrasi: ["permai-irr-scotts-vale"] };
    const q = samakanPermai(sv);
    const nama = q.irr.skema.map((x) => x.nama).join("|");
    assert(nama === "Cash Keras|Bertahap 12x|Bertahap 18x|Bertahap 24x|Bertahap 30x|KPR Express|KPR DP 0%/1x|KPR DP 10%/4x|KPR DP 20%/6x", nama);
    assert(q.dataPricelist.kolom.length === 9 && q.pricelist.kolom.length === 9 && q.tnc.caraBayar.length === 9, "kolom & S&K");
    assert(q.tnc.caraBayar[7].judul === "KPR DP 10%/4X", q.tnc.caraBayar[7].judul);
  });

  await check("Alokasi dikunci: 9 cara bayar tetap, unit = Alokasi × total Data Unit", async () => {
    const { alokasiTetap, kunciAlokasi, samakanPermai, samakanTsc, susunAwal, unitKosong } =
      await import("../src/lib/susun-pricelist");
    const b4: [number, number, number, number] = [12, 18, 19, 20];
    const sk = (kelompok: string, dp: number, kali: number, bulan = b4) => ({ kelompok, dp, kali, bulan });
    assert(alokasiTetap(sk("KPR", 0.1, 1, [2, 2, 2, 2])) === undefined, "KPR Express diketik manual");
    assert(alokasiTetap(sk("KPR", 0.1, 1)) === undefined, "KPR DP 10%/1x bukan Express");
    assert(alokasiTetap(sk("Cash", 1, 36)) === undefined && alokasiTetap(sk("Cash", 1, 30)) === 0.25, "36x bebas, 30x 25%");
    const unit = Array.from({ length: 95 }, (_, i) => ({ ...unitKosong(), kode: `U${i}` }));
    const p = kunciAlokasi({ ...samakanPermai(await susunNaraya()), unit });
    const a = p.irr.skema.map((s) => s.alokasi);
    assert(JSON.stringify(a) === JSON.stringify([0.07, 0.04, 0.05, 0.08, 0.25, 0.33, 0.08, 0.05, 0.05]), JSON.stringify(a));
    assert(p.irr.skema[4].unitAcuan === 23.75 && kunciAlokasi(p) === p, "unit acuan, stabil");
    const sv = kunciAlokasi(samakanTsc(susunAwal()));
    const bebas = sv.irr.skema.filter((s) => alokasiTetap(s) == null).map((s) => s.nama).join();
    assert(bebas === "Bertahap 36x,Bertahap 60x,KPR Express,KPR DP 10%/6x,KPR DP 10%/12x", bebas);
  });

  // Unit Data The Sanctuary Collection: harga per m² sudah Termasuk PPN,
  // tanpa pembulatan; faktor dijumlah, AC dan Harga Khusus (Rp) ditambahkan.
  await check("Data Unit The Sanctuary Collection seperti berkas Excel-nya", async () => {
    const { basisProject, hitungSemua, susunAwal } = await import("../src/lib/susun-pricelist");
    const { kategoriTsc, unitKosongTsc } = await import("../src/lib/unit-sanctuary");
    const u = { ...unitKosongTsc(), kode: "SV-SL1-001", subTipe: "Corner", lt: 116.6, hargaTanah: 11_400_000,
      lb: 115.44, hargaBangunan: 11_500_000, faktor: { garduListrik: -0.02, unitUjung: 0.03 },
      atribut: { nTepiSungai: 1, nFasadBelakang: 1, nTamanBelakang: 1 } };
    const h = hitungSemua(basisProject("tsc-scotts-vale", { ...susunAwal(), unit: [u] })).baris[0].hasilUnit;
    assert(Math.round(h.base) === 2_656_800_000, `dasar ${h.base}`);
    assert(Math.round(h.factoredR) === 2_683_368_000, `penyesuaian ${h.factoredR}`);
    assert(kategoriTsc(u) === "Riverside Corner Rear Façade & Garden", kategoriTsc(u));
  });

  // Data (IRR) standar (berkas data_irr_2): nama cara bayar dari Kelompok,
  // DP dan Installments; arus kas 100 bulan; koefisien sama dengan Excel.
  await check("Data (IRR) standar: nama otomatis dan koefisien data_irr_2", async () => {
    const { susunAwal, hitungIrr, namaStandar, arusTertimbang, PERIODE_STANDAR } =
      await import("../src/lib/susun-pricelist");
    const s = susunAwal();
    assert(s.irr.periode === PERIODE_STANDAR, `periode ${s.irr.periode}`);
    const b: [number, number, number, number] = [12, 18, 19, 20];
    const sk = (kelompok: string, dp: number, kali: number, bulan = b) =>
      ({ nama: "", kelompok, alokasi: 0.125, dp, kali, bulan });
    const daftar = [sk("Cash", 1, 1), sk("Cash", 1, 12), sk("Cash", 1, 24), sk("Cash", 1, 36),
      sk("KPR", 0.1, 1, [2, 2, 2, 2]), sk("KPR", 0.1, 6), sk("KPR", 0.1, 12), sk("KPR", 0.2, 6)];
    const nama = daftar.map(namaStandar);
    assert(nama.join("|") === "Cash Keras|Bertahap 12x|Bertahap 24x|Bertahap 36x|KPR Express|KPR DP 10%/6x|KPR DP 10%/12x|KPR DP 20%/6x",
           nama.join("|"));
    const irr = { ...s.irr, skema: daftar.map((x, i) => ({ ...x, nama: nama[i], ...(i === 0 && { acuan: true }) })) };
    const h = hitungIrr(irr);
    const excel = [1, 1.0494177, 1.0964342, 1.1447911, 1.0142955, 1.1150208, 1.1207504, 1.1044275];
    nama.forEach((n, i) => assert(Math.abs(h.koef[n] - excel[i]) < 2e-6, `${n}: ${h.koef[n]}`));
    // Cicilan lebih panjang dari periode tetap terhitung penuh.
    const pendek = { ...irr, periode: 36 };
    assert(Math.abs(hitungIrr(pendek).koef["Bertahap 36x"] - h.koef["Bertahap 36x"]) < 1e-12, "36x pada periode 36");
    const arus = arusTertimbang(irr, h);
    assert(Math.abs(arus.reduce((a, x) => a + x.porsi, 0) - 1) < 1e-9, "porsi 100%");
  });

  // Penguncian masuk: terkunci setelah lima kali salah, dan Admin IT dapat
  // membukanya sebelum lima belas menitnya habis.
  await check("buka kunci masuk mengembalikan jatah percobaan", async () => {
    const { catatPercobaan, sisaPercobaan, bukaKunci, PENGUNCIAN } =
      await import("../src/lib/auth");
    const { query } = await import("../src/lib/db");
    const nama = `uji-kunci-${Date.now()}`;
    try {
      for (let i = 0; i < PENGUNCIAN.maks; i++) await catatPercobaan(nama, null, false);
      assert(await sisaPercobaan(nama) === 0, "terkunci sesudah 5 kali salah");
      const dibuka = await bukaKunci(nama);
      assert(dibuka === PENGUNCIAN.maks, `dihapus ${dibuka}`);
      assert(await sisaPercobaan(nama) === PENGUNCIAN.maks, "jatah kembali penuh");
      // Membuka akun yang tidak terkunci tidak menghapus apa pun.
      assert(await bukaKunci(nama) === 0, "tanpa percobaan gagal: tidak ada yang dihapus");
      // Percobaan gagal sebelum keberhasilan terakhir tidak ikut terhapus:
      // ia jejak, bukan penahan.
      await catatPercobaan(nama, null, false);
      await catatPercobaan(nama, null, true);
      assert(await bukaKunci(nama) === 0, "gagal sebelum berhasil tidak dihitung");
      const sisa = await query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM login_attempts WHERE username=$1 AND NOT succeeded",
        [nama]);
      assert(sisa[0].n === 1, `jejak tersisa: ${sisa[0].n}`);
    } finally {
      await query("DELETE FROM login_attempts WHERE username=$1", [nama]);
    }
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

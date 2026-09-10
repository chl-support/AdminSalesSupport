/**
 * Isi basis data dengan konfigurasi dan data contoh.
 *
 * Angka tarif diambil dari catatan pada laporan master dan Form Klaim Komisi.
 * Keduanya belum sejalan — laporan menulis PPN 10%, form klaim menyiratkan 11%.
 * Seed memakai 10% untuk kontrak sebelum April 2022 dan 11% sesudahnya, sebagai
 * dugaan paling masuk akal. Konfirmasi Finance tetap diperlukan (PRD Q38).
 */

import { ensureDefaultSettings, pool, query } from "../src/lib/db";
import { pwHash, signaturePng, strokes } from "./synthetic-signature";

const USERS: [string, string, string][] = [
  ["admin", "Dimas Prasetya", "admin_sales"],
  ["ratna", "Ratna Wulandari", "finance_tax"],
  ["ratih", "Ratih Anggraini", "finance_payment"],
  ["fmanager", "Bagas Nugroho", "finance_manager"],
  ["headfin", "Sri Handayani", "head_finance"],
  ["mgmt", "Andreas Lim", "management"],
  ["sysadmin", "IT Support", "admin_system"],
];

const MARKETINGS: [string, string, string, string, boolean][] = [
  // nama, jenis, jenis penerima, jenis NPWP, punya agensi
  ["Fransisca Yolanda", "agent", "company", "company", true],
  ["Budi Santoso", "inhouse", "individual", "personal", false],
  ["Hendra Kusuma", "inhouse", "individual", "personal", false],
  ["Michael Junior", "agent", "company", "company", true],
];

const UNITS = [
  ["BIOBA2-017", "BA2", "Dwi Prasetyo", 72, 60, "KPR", "2026-06-14",
   185_000_000, 163_212_500, true, true, true, true, "booked", null,
   "Akad KPR BTN 26 Jun 2026"],
  ["BIOBA5-004", "BA5", "Maria Sari", 90, 75, "Cash Bertahap", "2026-06-28",
   210_000_000, 210_000_000, true, true, true, true, "booked", null, null],
  ["BIOBA7-021", "BA7", "Rudi Wibowo", 84, 70, "KPR", "2026-07-19",
   198_000_000, 63_360_000, false, true, false, true, "booked", null,
   "Belum Sign P3U"],
  ["BIOA3-11", "BA3", "Frangky Septian", 72, 92, "KPR Extra Express", "2024-07-26",
   2_906_000_000, 25_000_000, true, true, true, true, "cancelled", "2024-11-20",
   "Pengajuan KPR ditolak bank"],
  ["BIOBA1-04", "BA1", "Andri Kurniawan", 72, 60, "Cash Bertahap", "2025-02-11",
   1_850_000_000, 1_632_125_000, true, true, true, true, "moved_to_other_unit",
   null, "Pindah ke unit BIOBA2-017"],
  ["BIOBB-07", "BB", "PT. Sinar Abadi", 120, 140, "Cash", "2025-05-03",
   4_200_000_000, 4_200_000_000, true, true, true, true, "management", null,
   "Unit management"],
] as const;

const SCHEMES: [string, string | null, string | null, string][] = [
  ["closing_fee", "sales_inhouse", null, "0.027"],
  ["closing_fee", "sales_manager_inhouse", null, "0.0135"],
  ["closing_fee", "sales_markom", null, "0.0216"],
  ["commission", "agent", null, "0.025"],
  ["cash_reward", "sales_inhouse", null, "0.0162"],
  ["cash_reward", "markom", null, "0.0108"],
  ["overriding", null, "sales_manager_inhouse", "0.0025"],
  ["overriding", null, "kantor_agent", "0.005"],
  ["overriding", null, "lead_agent", "0.004"],
  ["overriding", null, "coordinator_agent_1", "0.0025"],
  ["overriding", null, "coordinator_agent_2", "0.002"],
];

// tax_type, rate, pkp, recipient, has_skb, npwp, level, from, to, note
const RATES: [string, string, string, string, boolean | null, string,
              string | null, string, string | null, string][] = [
  ["vat", "0.10", "any", "any", null, "any", null, "2020-01-01", "2022-03-31",
   "PPN 10% sesuai catatan laporan master"],
  ["vat", "0.11", "any", "any", null, "any", null, "2022-04-01", null,
   "PPN 11% — perlu konfirmasi Finance (PRD Q38)"],
  ["pph21", "0.025", "any", "individual", null, "any", null, "2020-01-01", null,
   "Non-PKP perorangan 2,5%"],
  ["pph_final", "0.005", "any", "individual", null, "personal", null,
   "2020-01-01", null, "NPWP pribadi — PPh final 0,5%"],
  ["pph23", "0.02", "any", "company", null, "any", null, "2020-01-01", null,
   "Non-PKP badan usaha 2%"],
  ["pph23", "0.02", "any", "company", true, "any", null, "2020-01-01", null,
   "Pakai SKB: (Komisi + PPN) - PPh 2%"],
  ["pph21", "0.025", "any", "individual", null, "any", "sales_manager_inhouse",
   "2020-01-01", null, "Overriding Sales Manager dipotong PPh 21"],
];

export async function seed(reset = true) {
  if (reset) {
    await query(`TRUNCATE users, agencies, marketings, signature_specimens,
      bank_accounts, units, incentive_schemes, tax_rates, claims, claim_documents,
      signing_sessions, signature_attempts, print_packages, handoffs,
      overriding_batches, overriding_rows, payment_instructions, settlements,
      settlement_lines, accounting_periods, non_cash_incentives,
      idempotency_keys, settings RESTART IDENTITY CASCADE`);
    // audit_log sengaja tidak di-truncate: RULE append-only menolak DELETE, dan
    // itu memang perilaku yang diinginkan.
  }
  await ensureDefaultSettings();

  for (const [username, name, role] of USERS) {
    await query(
      `INSERT INTO users (username, full_name, role, password_hash)
       VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO NOTHING`,
      [username, name, role, pwHash("demo")]);
  }

  const agency = await query(
    `INSERT INTO agencies (name, address, npwp, pkp_status, has_skb)
     VALUES ($1,$2,$3,'non_pkp',FALSE) RETURNING id`,
    ["PT. Sunly Realty Indonesia", "Jl. BSD Raya Utama, Gading Serpong",
     "01.234.567.8-901.000"]);
  const agencyId = agency[0].id;

  const marketings: { id: string; name: string }[] = [];
  for (const [i, [name, type, recipient, npwp, hasAgency]] of MARKETINGS.entries()) {
    const rows = await query(
      `INSERT INTO marketings (full_name, marketing_type, agency_id, npwp,
         npwp_type, recipient_type, phone, email, status,
         reference_signature_source, reference_signature_png, consent_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active','ktp',$9,'consent-2026-03')
       RETURNING id`,
      [name, type, hasAgency ? agencyId : null, "0".repeat(15), npwp, recipient,
       `08121234${String(800 + i).padStart(3, "0")}`, `user${i}@example.com`,
       signaturePng(i + 1, 0.35)]);
    const id = rows[0].id;

    const setRows = await query("SELECT gen_random_uuid() AS id");
    const setId = setRows[0].id;
    for (let s = 0; s < 3; s++) {
      await query(
        `INSERT INTO signature_specimens (marketing_id, set_id, sequence,
           image_png, strokes, input_method)
         VALUES ($1,$2,$3,$4,$5,'stylus')`,
        [id, setId, s + 1, signaturePng(i + 1, 0.05 * s),
         JSON.stringify(strokes(i + 1, 0.05 * s))]);
    }
    await query("UPDATE marketings SET baseline_specimen_set_id=$1 WHERE id=$2",
                [setId, id]);
    await query(
      `INSERT INTO bank_accounts (marketing_id, holder_name, account_number,
         bank_name, branch, verified) VALUES ($1,$2,$3,'BCA','Gading Serpong',TRUE)`,
      [id, hasAgency ? "PT. Sunly Realty Indonesia" : name,
       `12345${String(i).padStart(5, "0")}`]);
    marketings.push({ id, name });
  }

  const units: Record<string, string> = {};
  for (const u of UNITS) {
    const [code, cluster, buyer, lt, lb, scheme, cdate, value, received,
           p3u, spu, ppjb, dp, status, cancelled, remarks] = u as any;
    const rows = await query(
      `INSERT INTO units (code, project_name, cluster_code, buyer_name, unit_type,
         land_area, building_area, orientation, payment_scheme, contract_number,
         contract_date, contract_value_incl_vat, received_amount, sign_p3u,
         spu_signed, ppjb_signed, dp_received, status, cancelled_at, remarks)
       VALUES ($1,'BIO District',$2,$3,$4,$5,$6,'Utara',$7,$8,$9,$10,$11,$12,$13,
               $14,$15,$16,$17,$18) RETURNING id`,
      [code, cluster, buyer, `${lt}/${lb}`, lt, lb, scheme,
       `K-${code.slice(-4)}`, cdate, value, received, p3u, spu, ppjb, dp,
       status, cancelled, remarks]);
    units[code] = rows[0].id;
  }

  for (const [claimType, role, level, pct] of SCHEMES) {
    await query(
      `INSERT INTO incentive_schemes (memo_reference, claim_type, recipient_role,
         overriding_level, basis, percentage, effective_from)
       VALUES ('002/BMM-MS/XI/2025',$1,$2,$3,'contract_value_incl_vat',$4,'2020-01-01')`,
      [claimType, role, level, pct]);
  }

  for (const [tt, rate, pkp, recipient, skb, npwp, level, from, to, note] of RATES) {
    await query(
      `INSERT INTO tax_rates (tax_type, rate, pkp_status, recipient_type, has_skb,
         npwp_type, overriding_level, effective_from, effective_to, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tt, rate, pkp, recipient, skb, npwp, level, from, to, note]);
  }

  // Kolom laporan yang belum punya form sumber (PRD 7.B.3).
  await query(
    `INSERT INTO non_cash_incentives (unit_id, kind, label, beneficiary, value,
       realization_date, recorded_by)
     VALUES ($1,'trip','Australia','agent',15000000,'2026-11-04','admin')`,
    [units["BIOBA5-004"]]);
  await query(
    `INSERT INTO non_cash_incentives (unit_id, kind, label, beneficiary, recorded_by)
     VALUES ($1,'voucher','Voucher Informa Rp 5 Jt','konsumen','admin')`,
    [units["BIOBA7-021"]]);

  return { marketings, units };
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed()
    .then((info) => {
      console.log("Seed selesai.");
      console.log(`  ${Object.keys(info.units).length} unit, ` +
                  `${info.marketings.length} marketing`);
      console.log(`  Pengguna: ${USERS.map((u) => u[0]).join(", ")} (sandi: demo)`);
      return pool.end();
    })
    .catch((e) => { console.error(e); process.exit(1); });
}

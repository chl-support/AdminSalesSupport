/**
 * Isi basis data dengan konfigurasi dan data contoh.
 *
 * Angka tarif diambil dari catatan pada laporan master dan Form Klaim Komisi.
 * Keduanya belum sejalan — laporan menulis PPN 10%, form klaim menyiratkan 11%.
 * Seed memakai 10% untuk kontrak sebelum April 2022 dan 11% sesudahnya, sebagai
 * dugaan paling masuk akal. Konfirmasi Finance tetap diperlukan (PRD Q38).
 */

import { ensureDefaultSettings, pool, query } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { signaturePng, strokes } from "./synthetic-signature";

/**
 * Akun awal: username, nama, peran, dan kata sandi awal.
 *
 * Sandinya berbeda per akun. Satu sandi yang sama untuk semua orang membuat
 * jejak audit berhenti membuktikan siapa yang bertindak — setiap orang yang
 * tahu sandi itu dapat masuk sebagai siapa pun, dan catatannya tetap terlihat
 * sah.
 *
 * Nilai-nilai ini tetap sandi awal untuk demo: dapat ditebak, dan tertulis di
 * repositori publik. Sebelum dipakai sungguhan, ganti seluruhnya (dan lihat
 * catatan MFA pada src/lib/auth.ts).
 */
const USERS: [string, string, string, string][] = [
  ["admin", "Dimas Prasetya", "admin_sales", "sales-2026"],
  ["ratna", "Ratna Wulandari", "finance_tax", "pajak-2026"],
  ["ratih", "Ratih Anggraini", "finance_payment", "bayar-2026"],
  ["fmanager", "Bagas Nugroho", "finance_manager", "fmanager-2026"],
  ["headfin", "Sri Handayani", "head_finance", "headfin-2026"],
  ["mgmt", "Andreas Lim", "management", "mgmt-2026"],
  ["sysadmin", "IT Support", "admin_system", "sysadmin-2026"],
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
   "Akad KPR BTN 26 Jun 2026", "Fransisca Yolanda"],
  ["BIOBA5-004", "BA5", "Maria Sari", 90, 75, "Cash Bertahap", "2026-06-28",
   210_000_000, 210_000_000, true, true, true, true, "booked", null, null,
   "Budi Santoso"],
  ["BIOBA7-021", "BA7", "Rudi Wibowo", 84, 70, "KPR", "2026-07-19",
   198_000_000, 63_360_000, false, true, false, true, "booked", null,
   "Belum Sign P3U", "Hendra Kusuma"],
  ["BIOA3-11", "BA3", "Frangky Septian", 72, 92, "KPR Extra Express", "2024-07-26",
   2_906_000_000, 25_000_000, true, true, true, true, "cancelled", "2024-11-20",
   "Pengajuan KPR ditolak bank", "Michael Junior"],
  ["BIOBA1-04", "BA1", "Andri Kurniawan", 72, 60, "Cash Bertahap", "2025-02-11",
   1_850_000_000, 1_632_125_000, true, true, true, true, "moved_to_other_unit",
   null, "Pindah ke unit BIOBA2-017", "Fransisca Yolanda"],
  ["BIOBB-07", "BB", "PT. Sinar Abadi", 120, 140, "Cash", "2025-05-03",
   4_200_000_000, 4_200_000_000, true, true, true, true, "management", null,
   "Unit management"],
] as const;

/**
 * Skema insentif menurut memo resminya, bukan angka karangan.
 *
 * Dua memo berlaku berurutan, dan keduanya dimasukkan lengkap dengan masa
 * berlakunya karena klaim dihitung memakai skema yang berlaku pada TANGGAL
 * KONTRAK — kontrak Oktober 2025 tetap memakai memo lama meski diklaim hari ini:
 *
 *   001/SBL-BD/SM/IX/2025  berlaku September 2025, menggantikan 118/SBL-BD/V/2025
 *   002/SBL-BD/SM/XI/2025  berlaku November 2025, menggantikan 001
 *
 * Bentuk baris: [memo, claim_type, recipient_role, overriding_level,
 *                percentage|null, flat_amount|null, tiers|null, from, to]
 *
 * Yang TIDAK ada di kedua memo, jadi tidak dimasukkan: Closing Fee untuk agent
 * dan sales in-house (keduanya menyebut "Mengikuti IOM kebijakan terpisah"), dan
 * Cash Reward sama sekali. Mengarang tarifnya berarti sistem membayar angka yang
 * tidak pernah disetujui siapa pun.
 */
type Skema = [string, string, string | null, string | null,
              string | null, number | null, unknown | null, string, string | null,
              boolean?];

const SCHEMES: Skema[] = [
  // ── 001/SBL-BD/SM/IX/2025 — berlaku Sep 2025 s.d. Okt 2025 ──
  ["001/SBL-BD/SM/IX/2025", "commission", "agent", null,
   "0.04", null, null, "2025-09-01", "2025-10-31"],
  // Komisi in-house berjenjang per bulan: 1 unit 1,25%, mulai unit ke-2 1,5%.
  ["001/SBL-BD/SM/IX/2025", "commission", "sales_inhouse", null,
   "0.0125", null, [{ min_units: 1, percentage: "0.0125" },
                    { min_units: 2, percentage: "0.015" }],
   "2025-09-01", "2025-10-31"],
  ["001/SBL-BD/SM/IX/2025", "overriding", null, "lead_agent",
   "0.01", null, [{ min_units: 1, percentage: "0.01" },
                  { min_units: 6, percentage: "0.0125" },
                  { min_units: 11, percentage: "0.015" },
                  { min_units: 16, percentage: "0.02" }],
   "2025-09-01", "2025-10-31"],
  // Overriding Sales Manager pada memo 001 dibedakan per asal penjualannya.
  ["001/SBL-BD/SM/IX/2025", "overriding", null, "sales_manager_inhouse",
   "0.002", null, null, "2025-09-01", "2025-10-31"],
  ["001/SBL-BD/SM/IX/2025", "overriding", null, "kantor_agent",
   "0.001", null, null, "2025-09-01", "2025-10-31"],
  // Closing Fee Sales Manager dan Marcom: nominal tetap per unit, bukan persen.
  ["001/SBL-BD/SM/IX/2025", "closing_fee", "sales_manager_inhouse", null,
   null, 800_000, null, "2025-09-01", "2025-10-31"],
  ["001/SBL-BD/SM/IX/2025", "closing_fee", "sales_markom", null,
   null, 500_000, null, "2025-09-01", "2025-10-31"],

  // ── 002/SBL-BD/SM/XI/2025 — berlaku sejak Nov 2025 ──
  ["002/SBL-BD/SM/XI/2025", "commission", "agent", null,
   "0.03", null, null, "2025-11-01", null],
  ["002/SBL-BD/SM/XI/2025", "commission", "sales_inhouse", null,
   "0.0125", null, [{ min_units: 1, percentage: "0.0125" },
                    { min_units: 2, percentage: "0.015" }],
   "2025-11-01", null],
  ["002/SBL-BD/SM/XI/2025", "commission", "sales_manager_inhouse", null,
   "0.0125", null, [{ min_units: 1, percentage: "0.0125" },
                    { min_units: 2, percentage: "0.015" }],
   "2025-11-01", null],
  ["002/SBL-BD/SM/XI/2025", "overriding", null, "lead_agent",
   "0.01", null, [{ min_units: 1, percentage: "0.01" },
                  { min_units: 6, percentage: "0.0125" },
                  { min_units: 11, percentage: "0.015" },
                  { min_units: 16, percentage: "0.02" }],
   "2025-11-01", null],
  // Memo 002 menyatukan tarifnya: 0,25% untuk setiap penjualan sales in-house.
  ["002/SBL-BD/SM/XI/2025", "overriding", null, "sales_manager_inhouse",
   "0.0025", null, null, "2025-11-01", null],

  // ── Closing Fee: IOM 008/SBL-BD/PM/MS/I/2026, berlaku 1 Jan s.d. 31 Mar 2026 ──
  //
  // Nominal tetap per unit dan "Exclude PPh" — nilainya bersih, brutonya
  // di-gross-up (argumen terakhir true). Diberikan H+7 setelah Booking Fee
  // diterima dan Surat Pesanan ditandatangani.
  ["008/SBL-BD/PM/MS/I/2026", "closing_fee", "sales_inhouse", null,
   null, 10_000_000, null, "2026-01-01", "2026-03-31", true],
  ["008/SBL-BD/PM/MS/I/2026", "closing_fee", "agent", null,
   null, 10_000_000, null, "2026-01-01", "2026-03-31", true],
  ["008/SBL-BD/PM/MS/I/2026", "closing_fee", "markom", null,
   null, 2_000_000, null, "2026-01-01", "2026-03-31", true],
  ["008/SBL-BD/PM/MS/I/2026", "closing_fee", "sales_markom", null,
   null, 2_000_000, null, "2026-01-01", "2026-03-31", true],

  // ── Cash Reward: memo 002/SBL-BD/MS/III/2026, berlaku 1 Apr s.d. 30 Jun 2026 ──
  //
  // Booking Fee turun dari Rp 25 juta menjadi Rp 5 juta, dan karena itu gimmick
  // Closing Fee untuk Sales Inhouse, Tim Marcomm, dan Agent BERUBAH MENJADI Cash
  // Reward dengan nominal yang sama. Closing Fee sengaja tidak diperpanjang ke
  // periode ini: keduanya berlaku bersamaan berarti satu unit dapat diklaim dua
  // kali untuk hadiah yang sama.
  //
  // Dibayarkan setelah pembayaran mencapai 20% atau akad kredit — sejalan dengan
  // prasyarat cash_reward pada eligibility().
  ["002/SBL-BD/MS/III/2026", "cash_reward", "sales_inhouse", null,
   null, 10_000_000, null, "2026-04-01", "2026-06-30", true],
  ["002/SBL-BD/MS/III/2026", "cash_reward", "agent", null,
   null, 10_000_000, null, "2026-04-01", "2026-06-30", true],
  ["002/SBL-BD/MS/III/2026", "cash_reward", "markom", null,
   null, 2_000_000, null, "2026-04-01", "2026-06-30", true],
  ["002/SBL-BD/MS/III/2026", "cash_reward", "sales_markom", null,
   null, 2_000_000, null, "2026-04-01", "2026-06-30", true],

  // Continuity Reward: contoh saja, supaya jenis ini dapat dicoba tanpa
  // menunggu memonya. Nominal sungguhannya datang dari memo, seperti jenis
  // lain — yang di sini hanya data contoh.
  ["002/SBL-BD/MS/III/2026", "continuity_reward", "sales_inhouse", null,
   null, 5_000_000, null, "2026-04-01", "2026-12-31", true],
  ["002/SBL-BD/MS/III/2026", "continuity_reward", "agent", null,
   null, 5_000_000, null, "2026-04-01", "2026-12-31", true],
  ["002/SBL-BD/MS/III/2026", "continuity_reward", "markom", null,
   null, 1_000_000, null, "2026-04-01", "2026-12-31", true],
  ["002/SBL-BD/MS/III/2026", "continuity_reward", "sales_markom", null,
   null, 1_000_000, null, "2026-04-01", "2026-12-31", true],
];

// tax_type, rate, pkp, recipient, has_skb, npwp, level, from, to, note
const RATES: [string, string, string, string, boolean | null, string,
              string | null, string, string | null, string][] = [
  ["vat", "0.10", "any", "any", null, "any", null, "2020-01-01", "2022-03-31",
   "PPN 10% sesuai catatan laporan master"],
  ["vat", "0.11", "any", "any", null, "any", null, "2022-04-01", null,
   "PPN 11% — perlu konfirmasi Finance (PRD Q38)"],
  // Tarif PPh diambil dari perhitungan pada Form Pengajuan dan lampiran Detail
  // Perhitungan yang berjalan, bukan dari tarif umum. Empat contoh terpisah
  // memotong 2,5% atas Amount Unit:
  //
  //   Form Cash Reward   256.410,25 / 10.256.410      = 2,5%  (PPh 21)
  //   Form Komisi        470.158    / 18.806.306      = 2,5%  (PPh 21)
  //   Lampiran Overiding  95.765,77 /  3.830.630,63   = 2,5%  (PPh 23)
  //   Lampiran Overiding 132.601,35 /  5.304.054,05   = 2,5%  (PPh 23)
  //
  // PPh 23 atas jasa umumnya 2%, jadi 2,5% di sini perlu dikonfirmasi Finance
  // sebelum dipakai membayar. Yang jelas: angka inilah yang selama ini dipakai,
  // dan memakai 2% akan membuat sistem tidak cocok dengan berkas yang sudah ada.
  ["pph21", "0.025", "any", "individual", null, "any", null, "2020-01-01", null,
   "2,5% sesuai Form Pengajuan Komisi dan Cash Reward"],
  ["pph23", "0.025", "any", "company", null, "any", null, "2020-01-01", null,
   "2,5% sesuai lampiran Detail Perhitungan Overiding"],
  ["pph23", "0.025", "any", "company", true, "any", null, "2020-01-01", null,
   "Pakai SKB: (Komisi + PPN) - PPh 2,5%"],
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

  for (const [username, name, role, password] of USERS) {
    // ON CONFLICT DO UPDATE, bukan DO NOTHING: seed yang dijalankan ulang atas
    // basis data lama harus benar-benar memasang sandi baru ini. DO NOTHING akan
    // meninggalkan hash lama diam-diam, dan sandi yang dicetak di bawah menjadi
    // keterangan yang salah.
    await query(
      `INSERT INTO users (username, full_name, role, password_hash)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (username) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             role = EXCLUDED.role,
             password_hash = EXCLUDED.password_hash,
             active = TRUE`,
      [username, name, role, await hashPassword(password)]);
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
    // Agent dibayar ke rekening agensinya (badan usaha) — PPh 23; in-house ke
    // rekening pribadinya — PPh 21.
    await query(
      `INSERT INTO bank_accounts (marketing_id, holder_name, account_number,
         bank_name, branch, verified, holder_type)
       VALUES ($1,$2,$3,'BCA','Gading Serpong',TRUE,$4)`,
      [id, hasAgency ? "PT. Sunly Realty Indonesia" : name,
       `12345${String(i).padStart(5, "0")}`,
       hasAgency ? "company" : "individual"]);
    marketings.push({ id, name });
  }

  const units: Record<string, string> = {};
  for (const u of UNITS) {
    const [code, cluster, buyer, lt, lb, scheme, cdate, value, received,
           p3u, spu, ppjb, dp, status, cancelled, remarks, marketingName] =
      u as any;
    // Unit management tidak menghasilkan insentif, jadi tidak punya marketing.
    const marketingId =
      marketings.find((m) => m.name === marketingName)?.id ?? null;
    // Sub koordinator: penerima Overriding. Pada data contoh, Michael Junior
    // menaungi para agent — cukup untuk membuat klaim Overriding punya penerima.
    const subKoordinatorId = marketingId
      ? marketings.find((m) => m.name === "Michael Junior")?.id ?? null
      : null;
    const rows = await query(
      `INSERT INTO units (code, project_name, cluster_code, buyer_name, unit_type,
         land_area, building_area, orientation, payment_scheme, contract_number,
         contract_date, contract_value_incl_vat, received_amount, sign_p3u,
         spu_signed, ppjb_signed, dp_received, status, cancelled_at, remarks,
         marketing_id, sub_coordinator_id)
       VALUES ($1,'BIO District',$2,$3,$4,$5,$6,'Utara',$7,$8,$9,$10,$11,$12,$13,
               $14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [code, cluster, buyer, `${lt}/${lb}`, lt, lb, scheme,
       `K-${code.slice(-4)}`, cdate, value, received, p3u, spu, ppjb, dp,
       status, cancelled, remarks, marketingId, subKoordinatorId]);
    units[code] = rows[0].id;
  }

  for (const [memo, claimType, role, level, pct, flat, tiers, from, to, netto]
       of SCHEMES) {
    await query(
      `INSERT INTO incentive_schemes (memo_reference, claim_type, recipient_role,
         overriding_level, scheme_type, basis, percentage, flat_amount, tiers,
         effective_from, effective_to, flat_amount_is_net)
       VALUES ($1,$2,$3,$4,$5,'contract_value_incl_vat',$6,$7,$8,$9,$10,$11)`,
      [memo, claimType, role, level, tiers ? "progressive" : "regular",
       pct, flat, tiers ? JSON.stringify(tiers) : null, from, to,
       Boolean(netto)]);
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
      console.log("  Akun dan sandi awal:");
      for (const [username, name, role, password] of USERS) {
        console.log(`    ${username.padEnd(9)} ${password.padEnd(15)} ` +
                    `${role.padEnd(16)} ${name}`);
      }
      console.log("  Ganti seluruh sandi ini sebelum dipakai sungguhan.");
      return pool.end();
    })
    .catch((e) => { console.error(e); process.exit(1); });
}

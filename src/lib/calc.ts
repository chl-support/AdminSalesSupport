/**
 * Mesin perhitungan insentif dan pajak.
 *
 * Skema dan tarif dipilih menurut tanggal penjualan unit, bukan tanggal pengajuan
 * (PRD BR-06). Setiap hasil menyimpan snapshot parameter yang dipakai, agar angka
 * lama tetap dapat ditelusuri setelah tarif berubah (PRD FR-4.9).
 */

import type { PoolClient } from "pg";
import { one, query, setting } from "./db";
import { applyRate, ratio, rupiahWords, stripVat } from "./money";

export type ClaimType = "closing_fee" | "commission" | "cash_reward"
                      | "continuity_reward" | "overriding";
/**
 * Peran penerima fee — sama persis dengan enum recipient_role di basis data.
 *
 * Lima yang pertama ada sejak awal; 'bgb' dan 'sales_coordinator' menyusul
 * bersama pemilih kategori pada dialog pengajuan. Daftar yang ditawarkan di
 * layar ada di @/lib/kategori — ia enam dari tujuh nilai ini, karena
 * 'sales_markom' tidak pernah dipakai dan tidak ditambahkan ke pilihannya.
 */
export type RecipientRole =
  | "agent" | "sales_inhouse" | "sales_manager_inhouse" | "sales_markom"
  | "markom" | "bgb" | "sales_coordinator";
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

/**
 * Konteks pajak penerima.
 *
 * `recipient_type` — yang menentukan PPh 23 atau PPh 21 — diambil dari REKENING
 * TUJUAN TRANSFER, bukan dari status marketing-nya. Ditransfer ke PT dipotong
 * PPh 23; ditransfer ke perorangan dipotong PPh 21. Seorang agent yang bernaung
 * di bawah agensi tetapi dibayar ke rekening pribadinya tetap dipotong PPh 21,
 * dan memakai status marketing akan salah memotongnya.
 *
 * Bila rekening tujuannya belum ada, status marketing dipakai sebagai perkiraan
 * — tetapi klaim tanpa rekening terverifikasi memang belum dapat dibayarkan,
 * jadi perkiraan itu tidak pernah menjadi pemotongan yang sesungguhnya.
 */
export function recipientContext(
  marketing: any, agency: any | null, level: OverridingLevel | null = null,
  bankAccount: any | null = null,
): TaxContext {
  return {
    pkp_status: agency?.pkp_status ?? "non_pkp",
    recipient_type: bankAccount?.holder_type
      ?? marketing.recipient_type ?? "individual",
    npwp_type: marketing.npwp_type ?? "none",
    has_skb: Boolean(agency?.has_skb),
    overriding_level: level,
  };
}

/**
 * Skema yang berlaku, dalam lingkup satu project.
 *
 * Project-nya wajib: memo skema berbeda per project, dan mencari tanpa
 * menyebutkannya akan memungut memo project lain begitu tanggal kontraknya
 * kebetulan bertumpang tindih — kesalahan yang berakhir pada angka pembayaran,
 * bukan pada layar.
 */
export async function findScheme(
  claimType: ClaimType, role: RecipientRole | null,
  level: OverridingLevel | null, onDate: string | null, client?: PoolClient,
  projectId?: string | null,
) {
  // `onDate` null berarti masa berlakunya diabaikan — dipakai hanya oleh jalur
  // darurat saat memo belum wajib, dan barisnya diurutkan dari yang paling baru
  // supaya yang terpilih adalah tarif terakhir yang pernah diputuskan, bukan
  // tarif lama yang kebetulan lebih dulu terbaca.
  const rows = await query(
    `SELECT * FROM incentive_schemes
     WHERE claim_type = $1
       AND ($2::date IS NULL OR (effective_from <= $2::date
            AND (effective_to IS NULL OR effective_to >= $2::date)))
       AND ($3::uuid IS NULL OR project_id = $3)
     ORDER BY effective_from DESC`,
    [claimType, onDate, projectId ?? null], client,
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

/**
 * Tarif untuk skema berjenjang, ditentukan oleh jumlah unit terjual.
 *
 * Memo 002/SBL-BD/SM/XI/2025 menetapkan dua bentuk berjenjang: komisi Sales
 * In-house (1 unit 1,25%, mulai unit ke-2 1,5%) dan Overriding Lead Agent
 * (1% untuk penjualan 1-5, lalu 1,25%, 1,5%, dan 2%). Keduanya dihitung per
 * bulan — "cut off / bulan" pada catatan memo — dan catatan yang sama menegaskan
 * penjualan yang dihitung adalah "penjualan diluar pembatalan".
 *
 * Yang dihitung adalah penjualan milik penerima pada bulan kontrak unit ini,
 * bukan sepanjang masa: tanpa batas bulan, tarif sebuah klaim akan berubah
 * sendiri setiap ada penjualan baru bertahun-tahun kemudian.
 *
 * Tanpa `tiers` yang terisi, fungsi ini melempar alih-alih diam-diam memakai
 * `percentage`. Skema yang ditandai berjenjang tetapi tidak punya jenjang adalah
 * konfigurasi yang belum selesai, dan membayar dengan tarif dasar diam-diam
 * adalah kekeliruan yang tidak terlihat siapa pun sampai ada yang mengaudit.
 */
async function tarifBerjenjang(
  scheme: any, unit: any, marketing: any,
  level: OverridingLevel | null, onDate: string, client?: PoolClient,
): Promise<{ rate: string; jumlah_unit: number }> {
  const tiers = scheme.tiers as { min_units: number; percentage: string }[] | null;
  if (!Array.isArray(tiers) || !tiers.length) {
    throw new Error(
      `Skema ${scheme.claim_type} ditandai berjenjang tetapi belum punya daftar ` +
      `jenjang (kolom tiers). Lengkapi konfigurasinya — memakai tarif dasar ` +
      `diam-diam akan membayar dengan nilai yang salah.`);
  }

  // Kolom yang menautkan unit ke penerima berbeda menurut jenis klaimnya:
  // Overriding dibayarkan kepada tingkat di atas Sales.
  const kolom = level ? "sub_coordinator_id" : "marketing_id";
  const row = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM units
      WHERE ${kolom} = $1
        AND status NOT IN ('cancelled','moved_to_other_unit')
        AND date_trunc('month', contract_date) = date_trunc('month', $2::date)`,
    [marketing.id, onDate], client);
  const jumlah = row?.n ?? 1;

  // Jenjang tertinggi yang ambang minimumnya sudah tercapai.
  const urut = [...tiers].sort((a, b) => a.min_units - b.min_units);
  let dipakai = urut[0];
  for (const t of urut) if (jumlah >= t.min_units) dipakai = t;

  return { rate: String(dipakai.percentage), jumlah_unit: jumlah };
}

export async function calculate(
  unit: any, marketing: any, agency: any | null,
  claimType: ClaimType, role: RecipientRole,
  level: OverridingLevel | null = null, client?: PoolClient,
  bankAccount: any | null = null,
): Promise<CalculationResult> {
  const onDate = (unit.contract_date instanceof Date
    ? unit.contract_date.toISOString().slice(0, 10)
    : String(unit.contract_date ?? "1970-01-01").slice(0, 10));
  const ctx = recipientContext(marketing, agency, level, bankAccount);

  let scheme = await findScheme(claimType, role, level, onDate, client,
                                unit.project_id ?? null);

  /**
   * Memo yang belum lengkap tidak menolak klaim, untuk sementara.
   *
   * Selama `skema_wajib` mati, tidak adanya memo yang berlaku pada tanggal
   * kontrak unitnya bukan alasan menolak: dipakai skema terdekat yang ada,
   * dengan masa berlakunya diabaikan. Klaimnya ditandai `skema_darurat` pada
   * snapshot, sehingga angka yang lahir dari jalur ini dapat ditemukan kembali
   * setelah memonya lengkap.
   *
   * Yang diabaikan hanya tanggalnya. Jenis fee, peran penerima, dan tingkat
   * overriding tetap harus cocok — memakai tarif Closing Fee untuk Komisi bukan
   * kelonggaran, melainkan angka yang salah.
   */
  let darurat = false;
  if (!scheme && (await setting("skema_wajib")) !== "true") {
    scheme = await findScheme(claimType, role, level, null, client,
                              unit.project_id ?? null)
          ?? await findScheme(claimType, role, level, null, client, null);
    darurat = Boolean(scheme);
  }

  if (!scheme) {
    throw new Error(
      `Tidak ada skema insentif berlaku untuk ${claimType}/${role} pada ${onDate}. ` +
      `Lengkapi konfigurasi sebelum klaim dapat dihitung.`,
    );
  }

  // Skema berjenjang: tarifnya bergantung pada berapa unit yang terjual, bukan
  // hanya pada nilai kontraknya. Diselesaikan di sini agar pemanggil tidak perlu
  // tahu bedanya.
  const persen = scheme.scheme_type === "progressive"
    ? await tarifBerjenjang(scheme, unit, marketing, level, onDate, client)
    : { rate: scheme.percentage, jumlah_unit: null as number | null };

  const incl = Number(unit.contract_value_incl_vat ?? 0);
  const vatRow = await findTaxRate("vat", ctx, onDate, client);
  const vatRate = vatRow?.rate ?? "0";
  const excl = stripVat(incl, vatRate);
  const basisValue = scheme.basis === "contract_value_incl_vat" ? incl : excl;

  // PPh dihitung lebih dulu karena nominal "Exclude PPh" perlu di-gross-up.
  // PPh final hanya dipakai bila tarifnya benar-benar dikonfigurasi. Seed tidak
  // lagi memuatnya: tidak satu pun Form Pengajuan yang ada memotong PPh final,
  // dan tarif 0,5% yang sempat ada di sini memenangi PPh 21 sehingga setiap
  // penerima ber-NPWP pribadi dipotong seperlima dari yang seharusnya.
  let whtType: string;
  if (ctx.recipient_type === "company") whtType = "pph23";
  else if (ctx.npwp_type === "personal" &&
           await findTaxRate("pph_final", ctx, onDate, client)) whtType = "pph_final";
  else whtType = "pph21";
  const whtRow = await findTaxRate(whtType, ctx, onDate, client);
  const whtRate = Number(whtRow?.rate ?? 0);

  /**
   * Nominal tetap yang ditulis "Exclude PPh" adalah nilai bersih.
   *
   * Brutonya dinaikkan sampai setelah dipotong PPh sisanya persis sebesar
   * nominal itu: bruto = bersih / (1 - tarif). Memperlakukannya sebagai bruto
   * membuat penerimanya kekurangan sebesar PPh pada setiap klaim — pada Closing
   * Fee Rp 10 juta, selisihnya Rp 256.410 per unit.
   */
  const gross = scheme.flat_amount !== null
    ? (scheme.flat_amount_is_net && whtRate < 1
        ? Math.round(Number(scheme.flat_amount) / (1 - whtRate))
        : Number(scheme.flat_amount))
    : applyRate(basisValue, persen.rate);

  // PPN hanya bagi penerima PKP.
  const vat = ctx.pkp_status === "pkp" ? applyRate(gross, vatRate) : 0;

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
      // Benar berarti tarifnya dipakai tanpa memo yang berlaku pada tanggal
      // kontrak unit ini. Dicatat pada klaimnya, bukan hanya di layar, supaya
      // tetap dapat ditemukan setelah memonya lengkap dan penyaringnya kembali
      // dinyalakan.
      skema_darurat: darurat,
      scheme_type: scheme.scheme_type,
      basis: scheme.basis,
      basis_value: basisValue,
      percentage: persen.rate,
      percentage_base: scheme.percentage,
      tier_unit_count: persen.jumlah_unit,
      flat_amount: scheme.flat_amount,
      flat_amount_is_net: scheme.flat_amount_is_net ?? false,
      vat_rate: vatRate,
      withholding_type: whtType,
      withholding_rate: whtRow?.rate ?? "0",
      withholding_note: whtRow?.note ?? null,
      recipient_context: ctx,
      // Dicatat supaya pemeriksa dapat melihat dari mana jenis PPh-nya berasal,
      // bukan hanya hasilnya.
      withholding_basis: bankAccount
        ? `rekening tujuan atas nama ${bankAccount.holder_type === "company"
            ? "badan usaha" : "perorangan"} (${bankAccount.holder_name})`
        : "status marketing — rekening tujuan belum ditetapkan",
      rounding: "round_half_up_rupiah",
      calculated_on_contract_date: onDate,
    },
  };
}

// ─────────────────────── Prasyarat pencairan ───────────────────────

/**
 * Sebab sebuah unit belum dapat diklaim, sebagai kode yang bukan kalimat.
 *
 * Layar daftar penjualan dua bahasa, dan kalimat berbahasa Indonesia yang
 * dirakit di sini tidak dapat diterjemahkan lagi setelah sampai di peramban.
 * Kodenya yang dikirim ke sana; kalimatnya tetap dirakit juga karena ia dipakai
 * pada pesan galat yang dikembalikan endpoint pembuatan klaim.
 */
export type SebabTakLayak =
  | "unit_cancelled" | "unit_moved" | "unit_management"
  | "penerimaan_kurang" | "nilai_kontrak_nol";

/**
 * Ambang penerimaan yang membuka pengajuan fee: 20% dari nilai kontrak.
 *
 * Satu angka untuk keempat jenis fee dan seluruh cara bayar. Sebelumnya
 * prasyaratnya berupa empat penanda dokumen (SPU, PPJB, DP, Sign P3U) yang
 * dicentang tangan, berbeda-beda per jenis fee. Penanda itu tidak ada di satu
 * pun laporan yang diunggah, sehingga harus dicatat satu per satu untuk tiap
 * unit — dan selama belum dicatat, setiap unit hasil impor berhenti pada
 * "belum dapat diklaim" tanpa ada yang tahu kenapa.
 *
 * Penerimaan sebaliknya datang sendiri dari Laporan Penerimaan Customer yang
 * memang diunggah tiap bulan. Syarat yang terisi sendiri dari laporan resmi
 * tidak bisa lupa dicentang, dan tidak bisa dicentang lebih awal.
 */
export const AMBANG_PENERIMAAN = 0.20;

export function eligibility(unit: any, claimType: ClaimType): {
  ok: boolean; missing: string[]; codes: SebabTakLayak[];
} {
  const missing: string[] = [];
  const codes: SebabTakLayak[] = [];
  const tambah = (kode: SebabTakLayak, kalimat: string) => {
    codes.push(kode);
    missing.push(kalimat);
  };

  if (unit.status === "cancelled")
    tambah("unit_cancelled", "Unit sudah dibatalkan.");
  if (unit.status === "moved_to_other_unit")
    tambah("unit_moved", "Unit sudah dipindahkan ke unit lain.");
  if (unit.status === "management")
    tambah("unit_management", "Unit management — tidak menghasilkan insentif.");

  // Satu syarat, sama untuk keempat jenis fee dan seluruh cara bayar:
  // penerimaan sudah mencapai 20% dari nilai kontrak.
  //
  // `claimType` sengaja tidak lagi dipakai di sini. Parameternya dipertahankan
  // karena seluruh pemanggilnya menyebut jenis klaim yang sedang diperiksa, dan
  // membuangnya berarti menyentuh belasan tempat demi perbedaan yang mungkin
  // kembali besok.
  const nilai = Number(unit.contract_value_incl_vat ?? 0);
  const terima = Number(unit.received_amount ?? 0);

  if (nilai <= 0) {
    // Tanpa nilai kontrak, persentasenya tidak dapat dihitung sama sekali.
    // Membiarkannya lolos berarti unit yang nilainya belum terisi tampak
    // memenuhi syarat justru karena datanya kurang.
    tambah("nilai_kontrak_nol",
           "Nilai kontrak belum tercatat, persentase penerimaan tidak dapat " +
           "dihitung.");
  } else if (terima < nilai * AMBANG_PENERIMAAN) {
    const persen = ((terima / nilai) * 100).toFixed(1);
    tambah("penerimaan_kurang",
           `Penerimaan baru ${persen}% dari nilai kontrak, belum mencapai ` +
           `${AMBANG_PENERIMAAN * 100}%.`);
  }

  return { ok: missing.length === 0, missing, codes };
}

/**
 * Siapa yang menerima fee jenis ini pada satu unit — identitas dan statusnya.
 *
 * Closing Fee, Komisi, dan Cash Reward dibayarkan kepada yang menjual.
 * Overriding justru membayar tingkat di atasnya; memakai Sales untuk Overriding
 * berarti membayar orang yang sama dua kali atas satu unit.
 *
 * Di sini, bukan di layar atau di endpoint yang memakainya: aturan yang ditulis
 * dua kali akan berbeda pada salah satunya cepat atau lambat, dan bedanya
 * berupa fee yang dibayarkan kepada orang yang salah.
 */
export function penerimaFee(unit: any, claimType: ClaimType): {
  id: string | null; status: string | null;
} {
  return claimType === "overriding"
    ? { id: unit.sub_coordinator_id ?? unit.coordinator_id ?? null,
        status: unit.sub_coordinator_status ?? unit.coordinator_status ?? null }
    : { id: unit.marketing_id ?? null, status: unit.marketing_status ?? null };
}

/**
 * Unit ini dapat diklaim untuk jenis fee ini, dan klaimnya belum dibuat.
 *
 * Tiga syarat sekaligus: prasyarat pencairannya terpenuhi, belum ada klaim
 * aktif, dan penerimanya ada serta berstatus aktif. Ketiganya digabung di satu
 * tempat supaya tombol "Klaim" pada daftar penjualan, dan angka "sudah dapat
 * diklaim tapi belum diajukan" pada pemberitahuan saat masuk, tidak pernah
 * menyebut jumlah yang berbeda atas keadaan yang sama.
 */
export function dapatDiklaim(
  unit: any, claimType: ClaimType, adaKlaimAktif: boolean,
): boolean {
  if (!eligibility(unit, claimType).ok || adaKlaimAktif) return false;

  /**
   * Overriding tidak menuntut penerimanya sudah tercatat pada data penjualan.
   *
   * Dulu menuntut, dan syarat itu masuk akal selama penerima sebuah fee memang
   * selalu diambil dari kolom pada baris penjualannya. Sejak kategori penerima
   * dapat dipilih saat mengajukan — Sales Manager, Markom, atau Sales
   * Koordinator — yang menentukan bukan lagi apa yang tertulis di berkas itu.
   *
   * Bedanya nyata di lapangan: berkas penjualan hampir selalu menyebut yang
   * menjual, tetapi tingkat di atasnya kerap dikosongkan. Menahan Overriding
   * karenanya berarti fee yang memang berhak dibayarkan tidak punya jalan
   * diajukan sama sekali, sementara orangnya jelas dan dapat dipilih.
   *
   * Yang tidak dilonggarkan adalah pengajuannya sendiri: createClaim() tetap
   * menuntut marketing yang sah dan berstatus aktif. Yang berubah hanya
   * tombolnya — ia tidak lagi mati sebelum orangnya sempat dipilih.
   */
  if (claimType === "overriding") return true;

  const p = penerimaFee(unit, claimType);
  return Boolean(p.id) && p.status === "active";
}

/**
 * Dokumen wajib per jenis klaim, menurut checklist pada formulir pengajuannya.
 *
 * Cash Reward sebelumnya menuntut PPJB, kwitansi, dan rekening bank. Formulir
 * Pengajuan Cash Reward yang sebenarnya tidak meminta ketiganya — checklist-nya
 * sama persis dengan Closing Fee: FPU, SPU, dan kelengkapan data (KTP, NPWP,
 * bukti bayar booking fee). Menuntut dokumen yang tidak diminta formulirnya
 * menahan klaim yang sebenarnya sudah lengkap.
 *
 * Overriding tidak punya formulir pengajuan per klaim — ia disusun sebagai
 * lampiran perhitungan per periode, jadi tidak ada checklist dokumennya.
 */
export const REQUIRED_DOCS: Record<ClaimType, string[]> = {
  closing_fee: ["fpu", "spu", "ktp", "npwp", "booking_fee_proof"],
  commission: ["fpu", "spu", "ppjb", "kwitansi", "invoice", "ktp", "npwp",
               "bank_account"],
  cash_reward: ["fpu", "spu", "ktp", "npwp", "booking_fee_proof"],
  // Continuity Reward memakai formulir dan kelengkapan yang sama dengan Cash
  // Reward; yang berbeda hanya namanya dan skema nilainya.
  continuity_reward: ["fpu", "spu", "ktp", "npwp", "booking_fee_proof"],
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

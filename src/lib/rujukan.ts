/**
 * Referensi Pengajuan — baris memo yang menjadi acuan pengajuan fee.
 *
 * Yang dibaca di sini bukan tabel baru: memo beserta rincian skemanya sudah
 * tersimpan lewat layar Memo Approval (memos + memo_skema). Berkas ini
 * menyatukan keduanya menjadi satu daftar yang dapat dibaca sebagai
 * rekapitulasi — nomor memo, tanggal, perihal, periode program, skema,
 * kategori, nilai komisi, keterangan — lalu menghubungkan tiap barisnya ke
 * skema insentif yang benar-benar dipakai menghitung uang.
 *
 * Hubungan itu tidak dibuat sendiri oleh mesin. Nilai pada memo dibaca OCR,
 * dan OCR salah baca satu digit tanpa memberi tanda apa pun. Karena itu baris
 * hasil bacaan berhenti sebagai USULAN sampai ada orang yang memeriksanya dan
 * menekan "Berlakukan" — di sanalah ia diterjemahkan menjadi baris
 * incentive_schemes, jalur yang sudah dipakai seluruh perhitungan.
 *
 * Yang menolak pengajuan bukan berkas ini melainkan setelan `skema_wajib`:
 * selama menyala, klaim tanpa skema yang berlaku pada tanggal kontraknya
 * tidak dapat dihitung. Lihat calc.calculate().
 */

import { audit, one, query } from "./db";
import { ensureKolomMemo } from "./memo";
import { WorkflowError } from "./workflow";

/**
 * Kolom penghubung ke skema insentif.
 *
 * Dipasang sendiri seperti kolom memo lainnya: migrasi menuntut SETUP_SECRET,
 * yang sengaja dicabut dari Vercel sesudah dipakai.
 */
export async function ensureKolomRujukan(): Promise<void> {
  await ensureKolomMemo();
  await query(
    "ALTER TABLE memo_skema ADD COLUMN IF NOT EXISTS scheme_id UUID");
  await query(
    "ALTER TABLE memo_skema ADD COLUMN IF NOT EXISTS diberlakukan_oleh TEXT");
  await query(
    `ALTER TABLE memo_skema
       ADD COLUMN IF NOT EXISTS diberlakukan_pada TIMESTAMPTZ`);
}

export type BarisRujukan = {
  id: string;
  memo_id: string;
  no_memo: string | null;
  tanggal: string | null;
  perihal: string | null;
  periode_awal: string | null;
  periode_akhir: string | null;
  skema: string;
  kategori: string | null;
  nilai: string | null;
  keterangan: string | null;
  /** Skema insentif yang lahir dari baris ini; null selama masih usulan. */
  scheme_id: string | null;
  diberlakukan_oleh: string | null;
  diberlakukan_pada: string | null;
  claim_type: string | null;
  recipient_role: string | null;
  overriding_level: string | null;
  percentage: string | null;
  flat_amount: string | null;
};

/**
 * Seluruh baris rujukan satu project, memo terbaru lebih dulu.
 *
 * scheme_id diambil dari skemanya lewat JOIN, BUKAN dari kolom penghubung
 * pada barisnya. Keduanya sama selama skemanya masih ada; bedanya muncul
 * ketika skema itu terhapus dari tempat lain — dan barisnya, bila membaca
 * kolom penghubungnya sendiri, akan tetap mengaku "Berlaku" sementara tidak
 * ada satu tarif pun yang menaunginya.
 */
export async function daftarRujukan(projectId: string) {
  await ensureKolomRujukan();
  return query<BarisRujukan>(
    `SELECT s.id, s.memo_id, s.kelompok AS skema, s.kategori, s.nilai,
            s.keterangan, i.id AS scheme_id, s.diberlakukan_oleh,
            to_char(s.diberlakukan_pada, 'YYYY-MM-DD') AS diberlakukan_pada,
            m.nomor AS no_memo, m.judul AS perihal,
            to_char(m.tanggal_memo, 'YYYY-MM-DD')    AS tanggal,
            to_char(m.berlaku_dari, 'YYYY-MM-DD')    AS periode_awal,
            to_char(m.berlaku_sampai, 'YYYY-MM-DD')  AS periode_akhir,
            i.claim_type::text, i.recipient_role::text,
            i.overriding_level::text,
            i.percentage::text, i.flat_amount::text
       FROM memo_skema s
       JOIN memos m ON m.id = s.memo_id
       LEFT JOIN incentive_schemes i ON i.id = s.scheme_id
      WHERE m.project_id = $1
      ORDER BY m.uploaded_at DESC, s.baris`,
    [projectId]);
}

/**
 * Persen dari isian layar: "2,5", "2.5", dan "2,5%" sama-sama berarti 0,025.
 *
 * Titik tidak selalu pemisah ribuan. Orang Indonesia menulis "2,5" dan orang
 * yang terbiasa dengan papan angka menulis "2.5" — keduanya dua setengah
 * persen. Membuang seluruh titik seperti pemisah ribuan mengubah "2.5"
 * menjadi 25: sepuluh kali lipat, pada tarif yang menentukan pembayaran.
 *
 * Aturannya karena itu bertingkat:
 *
 *  - Ada koma → koma pemisah desimal, titik pemisah ribuan. "1.234,5".
 *  - Titiknya lebih dari satu → seluruhnya pemisah ribuan. "1.234.567".
 *  - Satu titik saja → pemisah desimal. Persentase tidak pernah ribuan:
 *    tarif fee berkisar sepersekian sampai belasan persen, sehingga "2.500"
 *    yang dimaksud dua setengah jauh lebih mungkin daripada dua ribu lima
 *    ratus persen.
 */
export function persenDesimal(v: unknown): string | null {
  const bersih = String(v ?? "").replace(/%/g, "").replace(/\s/g, "").trim();
  const t = bersih.includes(",")
    ? bersih.replace(/\./g, "").replace(",", ".")
    : (bersih.match(/\./g) ?? []).length > 1
      ? bersih.replace(/\./g, "")
      : bersih;
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    throw new WorkflowError("Persentase tidak dapat dibaca.", "validation", 422);
  }
  return String(n / 100);
}

/** Nominal tetap: "10.000.000" menjadi 10000000. */
export function nominal(v: unknown): number | null {
  const t = String(v ?? "").replace(/[^\d]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) {
    throw new WorkflowError("Nominal tidak dapat dibaca.", "validation", 422);
  }
  return n;
}

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Berlakukan satu baris rujukan: menerbitkan skema insentif dari isinya.
 *
 * Yang ditulis ke incentive_schemes adalah angka yang DIPERIKSA orang pada
 * layar, bukan angka hasil OCR apa adanya. Keduanya kerap sama, tetapi yang
 * menanggung akibatnya bila berbeda adalah orang yang menekan tombol ini —
 * karena itu namanya ikut tercatat pada barisnya dan pada jejak audit.
 */
export async function berlakukan(p: {
  barisId: string; projectId: string; actor: string;
  claimType: string; recipientRole?: string | null;
  overridingLevel?: string | null;
  basis?: string | null;
  percentage?: unknown; flatAmount?: unknown; flatAmountIsNet?: boolean;
  from: string; to?: string | null;
}) {
  await ensureKolomRujukan();

  const baris = await one<any>(
    `SELECT s.*, m.nomor, m.project_id
       FROM memo_skema s JOIN memos m ON m.id = s.memo_id
      WHERE s.id = $1 AND m.project_id = $2`,
    [p.barisId, p.projectId]);
  if (!baris) {
    throw new WorkflowError("Baris rujukan tidak ditemukan.", "not_found", 404);
  }
  if (baris.scheme_id) {
    throw new WorkflowError("Baris ini sudah diberlakukan.",
                            "sudah_berlaku", 409);
  }

  const persen = persenDesimal(p.percentage);
  const tetap = nominal(p.flatAmount);
  if (!persen && !tetap) {
    throw new WorkflowError(
      "Isi persentase atau nominal tetapnya lebih dulu.", "validation", 422);
  }
  if (!TANGGAL.test(String(p.from ?? ""))) {
    throw new WorkflowError("Berlaku dari harus berbentuk YYYY-MM-DD.",
                            "validation", 422);
  }
  const sampai = p.to && String(p.to).trim() ? String(p.to).trim() : null;
  if (sampai && !TANGGAL.test(sampai)) {
    throw new WorkflowError("Berlaku sampai harus berbentuk YYYY-MM-DD.",
                            "validation", 422);
  }
  if (sampai && sampai < p.from) {
    throw new WorkflowError(
      "Berlaku sampai tidak boleh lebih awal daripada berlaku dari.",
      "validation", 422);
  }

  // project_id ikut ditulis. Tanpanya skemanya memang tersimpan, tetapi
  // findScheme() menyaring `project_id = $3` begitu unitnya punya project —
  // sehingga tarif yang baru saja diberlakukan tidak pernah terpakai, dan
  // yang terlihat di layar hanya penolakan "belum ada memo yang berlaku".
  const skema = await one<any>(
    `INSERT INTO incentive_schemes
       (memo_reference, claim_type, recipient_role, overriding_level,
        scheme_type, basis, percentage, flat_amount, flat_amount_is_net,
        effective_from, effective_to, project_id)
     VALUES ($1, $2::claim_type, $3::recipient_role, $4::overriding_level,
             'regular', $5, $6, $7, $8, $9::date, $10::date, $11::uuid)
     RETURNING *`,
    [baris.nomor ?? null, p.claimType, p.recipientRole || null,
     p.overridingLevel || null,
     p.basis === "contract_value_excl_vat"
       ? "contract_value_excl_vat" : "contract_value_incl_vat",
     persen, tetap, Boolean(p.flatAmountIsNet), p.from, sampai,
     p.projectId]);

  await query(
    `UPDATE memo_skema
        SET scheme_id = $1, diberlakukan_oleh = $2, diberlakukan_pada = now()
      WHERE id = $3`,
    [skema.id, p.actor, p.barisId]);

  await audit({
    entityType: "memo_skema", entityId: p.barisId, action: "rujukan:berlaku",
    actor: p.actor,
    after: {
      memo: baris.nomor, kategori: baris.kategori, nilai_memo: baris.nilai,
      claim_type: p.claimType, recipient_role: p.recipientRole ?? null,
      percentage: persen, flat_amount: tetap,
      effective_from: p.from, effective_to: sampai,
    },
  });

  return skema;
}

/**
 * Cabut pemberlakuan: skemanya dihapus, barisnya kembali menjadi usulan.
 *
 * Skema yang sudah dipakai sebuah klaim tidak dihapus. Klaim menyimpan hasil
 * hitungnya sendiri pada snapshot, tetapi memo_reference pada snapshot itu
 * menunjuk ke baris ini — dan rujukan yang hilang membuat angka yang sudah
 * dibayarkan tidak dapat ditelusuri lagi.
 */
export async function cabut(barisId: string, projectId: string, actor: string) {
  await ensureKolomRujukan();
  const baris = await one<any>(
    `SELECT s.*, m.nomor FROM memo_skema s JOIN memos m ON m.id = s.memo_id
      WHERE s.id = $1 AND m.project_id = $2`,
    [barisId, projectId]);
  if (!baris) {
    throw new WorkflowError("Baris rujukan tidak ditemukan.", "not_found", 404);
  }
  if (!baris.scheme_id) {
    throw new WorkflowError("Baris ini belum diberlakukan.",
                            "belum_berlaku", 409);
  }

  const dipakai = await one<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM claims
      WHERE snapshot->>'scheme_id' = $1`, [baris.scheme_id]);
  if (Number(dipakai?.n ?? 0) > 0) {
    throw new WorkflowError(
      "Skema ini sudah dipakai menghitung klaim, jadi tidak dapat dicabut. " +
      "Terbitkan memo penggantinya dan berlakukan barisnya.",
      "sudah_dipakai", 409);
  }

  await query("DELETE FROM incentive_schemes WHERE id=$1", [baris.scheme_id]);
  await query(
    `UPDATE memo_skema
        SET scheme_id = NULL, diberlakukan_oleh = NULL,
            diberlakukan_pada = NULL
      WHERE id = $1`, [barisId]);

  await audit({
    entityType: "memo_skema", entityId: barisId, action: "rujukan:cabut",
    actor, before: { scheme_id: baris.scheme_id, memo: baris.nomor },
  });
  return { id: barisId };
}

/**
 * Pendaftaran spesimen tanda tangan.
 *
 * Tanpa spesimen, mesin pencocokan tidak punya pembanding: skornya selalu 0,
 * setiap klaim agent jatuh ke pemeriksaan manual Admin Sales, dan ambang berapa
 * pun tidak ada artinya karena tidak ada yang diukur. Modul ini yang mengisi
 * kekosongan itu — dan sekaligus yang membuat kalibrasi PRD 12.2 mungkin
 * dijalankan atas tanda tangan sungguhan, bukan atas data contoh.
 *
 * Bentuknya sengaja meniru tautan tanda tangan yang sudah ada: satu tautan
 * sekali pakai, OTP ke nomor terdaftar, masa berlaku. Yang didaftarkan di sini
 * justru yang akan dipakai membuktikan identitas orang itu berikutnya, jadi
 * pengambilannya tidak boleh lebih longgar daripada pemakaiannya.
 *
 * Tiga hal yang ditegakkan di sini, bukan di layar:
 *
 *   1. Persetujuan direkam terpisah, dengan versinya. Data tanda tangan adalah
 *      data pribadi; "dia toh menandatangani" bukan catatan persetujuan.
 *   2. Tiap goresan diperiksa terhadap goresan sebelumnya. Sepuluh tanda tangan
 *      yang saling berbeda jauh bukan baseline — ia hanya memindahkan
 *      ketidakpastian ke tahap berikutnya, tempat orangnya tidak hadir lagi
 *      untuk mengulang.
 *   3. Yang terkumpul masuk sebagai 'pending_review'. Admin yang memutuskan
 *      sebuah baseline sah, bukan orang yang baru saja membuatnya.
 */

import { randomBytes, randomInt } from "node:crypto";

import { audit, one, query, settingInt, setting } from "./db";
import * as sig from "./signature";
import { WorkflowError } from "./workflow";

/** Versi teks persetujuan. Naikkan bila kalimatnya berubah. */
export const VERSI_PERSETUJUAN = "1.0";

export async function terbitkanTautan(marketingId: string, aktor: string) {
  const mkt = await one("SELECT * FROM marketings WHERE id=$1", [marketingId]);
  if (!mkt) throw new WorkflowError("Marketing tidak ditemukan.", "not_found", 404);
  if (!mkt.phone) {
    throw new WorkflowError(
      `${mkt.full_name} belum punya nomor telepon terdaftar, sehingga kode ` +
      "verifikasi tidak dapat dikirim.", "phone_missing", 422);
  }

  // Tautan lama dimatikan. Dua tautan hidup untuk orang yang sama berarti dua
  // baseline dapat terbentuk bersamaan, dan yang belakangan diam-diam menimpa.
  await query(
    "UPDATE enrollment_sessions SET state='expired' WHERE marketing_id=$1 " +
    "AND state IN ('sent','opened','capturing')", [marketingId]);

  const token = randomBytes(32).toString("base64url");
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const ttl = await settingInt("onboarding_link_ttl_hours");
  const target = await settingInt("onboarding_specimen_count");
  const setId = (await one<{ id: string }>("SELECT gen_random_uuid() AS id"))!.id;

  const sesi = await one(
    `INSERT INTO enrollment_sessions (token, marketing_id, set_id, otp_code,
       target, issued_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' hours')::interval)
     RETURNING expires_at`,
    [token, marketingId, setId, otp, target, aktor, String(ttl)]);

  await audit({ entityType: "marketing", entityId: marketingId,
                action: "enrollment_link_issued", actor: aktor,
                after: { expires_at: sesi!.expires_at, target } });

  const phone: string = mkt.phone ?? "";
  const masked = phone.slice(0, 4) + "•".repeat(Math.max(0, phone.length - 7)) +
                 phone.slice(-3);
  return {
    token, otp_demo: otp, masked_phone: masked, target,
    expires_at: sesi!.expires_at,
    message: `Pendaftaran tanda tangan untuk ${mkt.full_name}. Buka tautan ` +
             "berikut dan masukkan kode yang kami kirim.",
  };
}

export async function bukaSesi(token: string) {
  const s = await one("SELECT * FROM enrollment_sessions WHERE token=$1", [token]);
  if (!s) throw new WorkflowError("Tautan tidak ditemukan.", "not_found", 404);
  if (["submitted", "approved", "rejected", "expired", "locked"].includes(s.state)) {
    throw new WorkflowError(
      s.state === "submitted"
        ? "Tanda tangan Anda sudah terkirim dan sedang diperiksa Admin."
        : "Tautan sudah tidak berlaku.", "session_closed", 410);
  }
  if (new Date(s.expires_at) < new Date()) {
    await query("UPDATE enrollment_sessions SET state='expired' WHERE token=$1",
                [token]);
    throw new WorkflowError("Tautan sudah kedaluwarsa.", "session_expired", 410);
  }
  return s;
}

export async function konteks(token: string) {
  const s = await bukaSesi(token);
  const mkt = await one(
    `SELECT m.full_name, m.marketing_type, a.name AS agency_name
       FROM marketings m LEFT JOIN agencies a ON a.id = m.agency_id
      WHERE m.id=$1`, [s.marketing_id]);
  return {
    nama: mkt?.full_name ?? "—",
    agensi: mkt?.agency_name ?? null,
    target: s.target,
    terkumpul: s.captured,
    otp_verified: s.otp_verified,
    consent_at: s.consent_at,
    versi_persetujuan: VERSI_PERSETUJUAN,
    expires_at: s.expires_at,
    ambang: await settingInt("signature_threshold_onboarding"),
  };
}

export async function verifikasiOtp(token: string, kode: string) {
  const s = await bukaSesi(token);
  if (s.otp_attempts >= 5) {
    await query("UPDATE enrollment_sessions SET state='locked' WHERE token=$1",
                [token]);
    throw new WorkflowError("Terlalu banyak percobaan. Tautan dikunci.",
                            "otp_locked", 429);
  }
  if (kode !== s.otp_code) {
    await query(
      "UPDATE enrollment_sessions SET otp_attempts=otp_attempts+1 WHERE token=$1",
      [token]);
    throw new WorkflowError("Kode verifikasi salah.", "otp_invalid", 401);
  }
  await query(
    "UPDATE enrollment_sessions SET otp_verified=TRUE, state='opened' WHERE token=$1",
    [token]);
  return { ok: true };
}

export async function setujuiPemakaian(token: string, versi: string) {
  const s = await bukaSesi(token);
  if (!s.otp_verified) {
    throw new WorkflowError("Verifikasi kode terlebih dahulu.", "otp_required", 401);
  }
  if (versi !== VERSI_PERSETUJUAN) {
    throw new WorkflowError("Versi persetujuan tidak sesuai.", "consent_version", 409);
  }
  await query(
    `UPDATE enrollment_sessions SET consent_at=now(), consent_version=$1,
            state='capturing' WHERE token=$2`, [versi, token]);
  await audit({ entityType: "marketing", entityId: s.marketing_id,
                action: "enrollment_consent", actor: s.marketing_id,
                after: { version: versi } });
  return { ok: true };
}

/**
 * Simpan satu spesimen.
 *
 * Yang pertama diterima apa adanya — belum ada pembandingnya. Berikutnya
 * dicocokkan dengan yang sudah terkumpul memakai ambang onboarding, yang memang
 * lebih longgar daripada ambang klaim: pada tahap ini orangnya sedang membentuk
 * kebiasaan tanda tangannya di layar, bukan membuktikan identitasnya.
 */
export async function simpanSpesimen(token: string, p: {
  image_png: string; strokes?: sig.Stroke[] | null; input_method?: string;
}) {
  const s = await bukaSesi(token);
  if (!s.otp_verified) {
    throw new WorkflowError("Verifikasi kode terlebih dahulu.", "otp_required", 401);
  }
  if (!s.consent_at) {
    throw new WorkflowError("Persetujuan pemakaian data belum diberikan.",
                            "consent_required", 409);
  }
  if (!p.image_png) {
    throw new WorkflowError("Tanda tangan belum digoreskan.", "signature_empty", 422);
  }
  if (s.captured >= s.target) {
    throw new WorkflowError("Jumlah spesimen sudah terpenuhi.", "already_complete", 409);
  }

  const sudah = await query<{ image_png: string; strokes: any }>(
    `SELECT image_png, strokes FROM signature_specimens
      WHERE set_id=$1 ORDER BY sequence`, [s.set_id]);

  const ambang = await settingInt("signature_threshold_onboarding");
  if (sudah.length) {
    const r = sig.compareToSet(p.image_png, p.strokes, sudah as any);
    if (r.score < ambang) {
      // Tidak disimpan, dan tidak dihitung sebagai kegagalan yang menutup sesi:
      // yang diminta memang mengulang sampai konsisten.
      return {
        diterima: false, skor: r.score, ambang,
        terkumpul: sudah.length, target: s.target,
        guidance: r.guidance.length ? r.guidance : [
          "Tanda tangan ini berbeda cukup jauh dari yang sebelumnya. " +
          "Tanda tangani seperti biasa Anda menandatangani dokumen.",
        ],
      };
    }
  }

  await query(
    `INSERT INTO signature_specimens (marketing_id, set_id, sequence, image_png,
       strokes, input_method)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [s.marketing_id, s.set_id, sudah.length + 1, p.image_png,
     p.strokes ? JSON.stringify(p.strokes) : null, p.input_method ?? "finger"]);
  const terkumpul = sudah.length + 1;
  await query("UPDATE enrollment_sessions SET captured=$1 WHERE token=$2",
              [terkumpul, token]);

  return { diterima: true, skor: null, ambang, terkumpul, target: s.target,
           guidance: [] };
}

/** Kirim set yang sudah lengkap ke pemeriksaan Admin. */
export async function kirimSet(token: string) {
  const s = await bukaSesi(token);
  if (s.captured < s.target) {
    throw new WorkflowError(
      `Baru ${s.captured} dari ${s.target} tanda tangan terkumpul.`,
      "incomplete", 409);
  }
  const spesimen = await query(
    "SELECT image_png, strokes FROM signature_specimens WHERE set_id=$1",
    [s.set_id]);
  const konsistensi = sig.consistency(spesimen as any);

  await query(
    "UPDATE enrollment_sessions SET state='submitted', consistency=$1 WHERE token=$2",
    [konsistensi, token]);
  await query("UPDATE marketings SET status='pending_review' WHERE id=$1 " +
              "AND status IN ('draft','rejected')", [s.marketing_id]);
  await audit({ entityType: "marketing", entityId: s.marketing_id,
                action: "enrollment_submitted", actor: s.marketing_id,
                after: { set_id: s.set_id, jumlah: s.captured,
                         konsistensi } });

  return { konsistensi, jumlah: s.captured };
}

/** Daftar pendaftaran untuk layar Admin. */
export async function daftarMarketing() {
  return query(
    `SELECT m.id, m.full_name, m.marketing_type, m.status, m.phone,
            a.name AS agency_name,
            COUNT(s.id) FILTER (WHERE NOT s.archived)::int AS spesimen,
            m.baseline_specimen_set_id,
            e.token AS sesi_token, e.state AS sesi_state, e.captured, e.target,
            e.consistency, e.set_id AS sesi_set_id, e.expires_at
       FROM marketings m
       LEFT JOIN agencies a ON a.id = m.agency_id
       LEFT JOIN signature_specimens s ON s.marketing_id = m.id
       LEFT JOIN LATERAL (
         SELECT * FROM enrollment_sessions e2
          WHERE e2.marketing_id = m.id ORDER BY e2.created_at DESC LIMIT 1
       ) e ON TRUE
      GROUP BY m.id, a.name, e.token, e.state, e.captured, e.target,
               e.consistency, e.set_id, e.expires_at
      ORDER BY m.full_name`);
}

export async function spesimenSet(setId: string) {
  return query(
    `SELECT id, sequence, image_png, input_method, created_at
       FROM signature_specimens WHERE set_id=$1 ORDER BY sequence`, [setId]);
}

/**
 * Putusan Admin atas satu set.
 *
 * Menyetujui berarti set ini menjadi baseline, dan set lama diarsipkan — bukan
 * dihapus: percobaan tanda tangan lama dinilai terhadap baseline yang berlaku
 * saat itu, dan menghapusnya membuat riwayat penilaian tidak dapat ditelusuri.
 */
export async function putuskanSet(
  marketingId: string, setId: string,
  keputusan: "approve" | "reject", aktor: string, alasan?: string,
) {
  const jumlah = await one<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM signature_specimens WHERE set_id=$1 AND marketing_id=$2",
    [setId, marketingId]);
  if (!jumlah?.n) {
    throw new WorkflowError("Set spesimen tidak ditemukan.", "not_found", 404);
  }

  if (keputusan === "approve") {
    await query(
      "UPDATE signature_specimens SET archived=TRUE WHERE marketing_id=$1 AND set_id<>$2",
      [marketingId, setId]);
    await query(
      `UPDATE marketings SET status='active', baseline_specimen_set_id=$1,
              consent_version=$2 WHERE id=$3`,
      [setId, VERSI_PERSETUJUAN, marketingId]);
    await query(
      "UPDATE enrollment_sessions SET state='approved' WHERE set_id=$1", [setId]);
  } else {
    if (!alasan || alasan.trim().length < 10) {
      throw new WorkflowError("Alasan penolakan wajib diisi minimal 10 karakter.",
                              "reason_required", 422);
    }
    await query(
      "UPDATE signature_specimens SET archived=TRUE WHERE set_id=$1", [setId]);
    await query("UPDATE marketings SET status='rejected' WHERE id=$1", [marketingId]);
    await query(
      "UPDATE enrollment_sessions SET state='rejected' WHERE set_id=$1", [setId]);
  }

  await audit({
    entityType: "marketing", entityId: marketingId,
    action: `enrollment_${keputusan === "approve" ? "approved" : "rejected"}`,
    actor: aktor, after: { set_id: setId, jumlah: jumlah.n }, reason: alasan,
  });
  return { marketing_id: marketingId, set_id: setId, keputusan };
}

/** Ambang onboarding, untuk ditampilkan apa adanya di layar Admin. */
export async function ambangOnboarding() {
  return Number(await setting("signature_threshold_onboarding"));
}

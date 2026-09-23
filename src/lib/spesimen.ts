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
 * Spesimennya adalah tanda tangan pada KTP, bukan goresan yang dibuat ulang di
 * layar. Satu berkas yang memang sudah dipegang setiap orang, diambil sekali,
 * dan tidak menuntut siapa pun menandatangani lima kali dengan jari — sebuah
 * tuntutan yang pada praktiknya menghentikan pendaftaran di langkah terakhir.
 *
 * Akibatnya disebutkan terang-terangan, karena ia nyata: pembandingnya kini
 * goresan pulpen di kertas hasil foto, sedangkan tanda tangan pada klaim dibuat
 * dengan jari di layar. Skor kecocokan antara dua media itu rendah dengan
 * sendirinya, jadi keputusan atas tanda tangan klaim jatuh ke tangan Admin
 * Sales. Yang dijaga modul ini bukan lagi angka kecocokan, melainkan bahwa ada
 * pembanding sah yang berasal dari kartu identitas orang tersebut.
 *
 * Dua hal yang ditegakkan di sini, bukan di layar:
 *
 *   1. Persetujuan direkam terpisah, dengan versinya. Data tanda tangan adalah
 *      data pribadi; "dia toh mengunggah KTP" bukan catatan persetujuan.
 *   2. Yang terkumpul masuk sebagai 'pending_review'. Admin yang memutuskan
 *      sebuah baseline sah, bukan orang yang baru saja mengirimkannya.
 */

import { randomBytes, randomInt } from "node:crypto";

import { audit, one, query, settingInt, setting } from "./db";
import { WorkflowError } from "./workflow";
import { SEMUA_KATEGORI } from "./kategori";
import { ensureKolomMarketing } from "./kolom";

/** Versi teks persetujuan. Naikkan bila kalimatnya berubah. */
export const VERSI_PERSETUJUAN = "3.0";

/** Batas ukuran foto KTP. Sama dengan batas lampiran klaim. */
export const BATAS_KTP = 3 * 1024 * 1024;

/**
 * Terbitkan tautan pendaftaran.
 *
 * Sekali per orang. Spesimen yang sudah disetujui dipakai terus-menerus sebagai
 * pembanding, dan menerbitkan tautan baru diam-diam berarti seseorang dapat
 * mengganti pembanding pembayaran dirinya sendiri — cukup dengan meminta tautan
 * sekali lagi. Pendaftaran ulang karenanya menuntut alasan tertulis dari Admin,
 * dan alasannya ikut tercatat.
 */
export async function terbitkanTautan(
  marketingId: string, aktor: string,
  opsi: { revisi?: boolean; alasan?: string; projectId?: string } = {},
) {
  // Project ikut disertakan pada pencariannya: id yang diketikkan langsung ke
  // alamat tidak boleh menerbitkan tautan bagi marketing project lain.
  const mkt = await one(
    "SELECT * FROM marketings WHERE id=$1 AND ($2::uuid IS NULL OR project_id=$2)",
    [marketingId, opsi.projectId ?? null]);
  if (!mkt) throw new WorkflowError("Marketing tidak ditemukan.", "not_found", 404);

  const sudah = await one<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM signature_specimens " +
    "WHERE marketing_id=$1 AND NOT archived", [marketingId]);
  if ((sudah?.n ?? 0) > 0) {
    if (!opsi.revisi) {
      throw new WorkflowError(
        `${mkt.full_name} sudah punya ${sudah!.n} spesimen yang berlaku. ` +
        "Pendaftaran hanya sekali; untuk merekam ulang, mintalah revisi " +
        "beserta alasannya.", "already_enrolled", 409);
    }
    if (!opsi.alasan || opsi.alasan.trim().length < 10) {
      throw new WorkflowError(
        "Alasan revisi wajib diisi minimal 10 karakter.", "reason_required", 422);
    }
  }
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
  // Satu: tanda tangan pada KTP. Pengaturan onboarding_specimen_count tidak
  // dipakai lagi — jumlahnya tidak lagi dapat dipilih, ia ditentukan bentuk
  // kartunya.
  const target = 1;
  const setId = (await one<{ id: string }>("SELECT gen_random_uuid() AS id"))!.id;

  const sesi = await one(
    `INSERT INTO enrollment_sessions (token, marketing_id, set_id, otp_code,
       target, issued_by, revision_reason, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' hours')::interval)
     RETURNING expires_at`,
    [token, marketingId, setId, otp, target, aktor,
     opsi.revisi ? opsi.alasan!.trim() : null, String(ttl)]);

  await audit({
    entityType: "marketing", entityId: marketingId,
    action: opsi.revisi ? "enrollment_revision_issued" : "enrollment_link_issued",
    actor: aktor, reason: opsi.revisi ? opsi.alasan!.trim() : undefined,
    after: { expires_at: sesi!.expires_at, target },
  });

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
    ktp_terkirim: Boolean(s.ktp_at),
    otp_verified: s.otp_verified,
    consent_at: s.consent_at,
    ktp_at: s.ktp_at,
    revisi: Boolean(s.revision_reason),
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
 * Simpan foto KTP beserta potongan tanda tangan yang ditunjuk agent.
 *
 * Dua-duanya disimpan pada sesi, bukan langsung pada marketing: keduanya belum
 * disetujui siapa pun. Foto utuhnya diperlukan Admin untuk memastikan potongan
 * itu memang berasal dari KTP orang tersebut, dan dihapus begitu putusannya
 * diambil.
 */
export async function simpanKtp(token: string, p: {
  image_base64: string; content_type?: string; signature_png?: string;
}) {
  const s = await bukaSesi(token);
  if (!s.otp_verified) {
    throw new WorkflowError("Verifikasi kode terlebih dahulu.", "otp_required", 401);
  }
  if (!s.consent_at) {
    throw new WorkflowError("Persetujuan pemakaian data belum diberikan.",
                            "consent_required", 409);
  }

  const raw = p.image_base64 ?? "";
  const koma = raw.indexOf(",");
  const dataUrl = raw.startsWith("data:");
  const tipe = (dataUrl ? raw.slice(5, koma).split(";")[0] : p.content_type ?? "")
    .toLowerCase().trim();
  if (!/^image\/(jpeg|png|webp|heic)$/.test(tipe)) {
    throw new WorkflowError(
      "Foto KTP harus berupa gambar (JPG, PNG, WEBP, atau HEIC).",
      "file_type_rejected", 415);
  }
  const buf = Buffer.from(dataUrl ? raw.slice(koma + 1) : raw, "base64");
  if (!buf.length) {
    throw new WorkflowError("Foto KTP belum dipilih.", "file_required", 422);
  }
  if (buf.length > BATAS_KTP) {
    throw new WorkflowError(
      `Foto ${(buf.length / 1024 / 1024).toFixed(1)} MB melebihi batas 3 MB. ` +
      "Perkecil fotonya lalu ulangi.", "file_too_large", 413);
  }
  if (!p.signature_png) {
    throw new WorkflowError(
      "Bagian tanda tangan pada KTP belum ditandai.", "crop_required", 422);
  }

  await query(
    `UPDATE enrollment_sessions
        SET ktp_image=$1, ktp_content_type=$2, ktp_signature_png=$3, ktp_at=now(),
            captured=1, target=1
      WHERE token=$4`,
    [buf, tipe, p.signature_png, token]);

  // Potongan tanda tangan itu sendiri yang menjadi spesimen. Disimpan pada
  // tabel yang sama dengan spesimen mana pun supaya seluruh sistem — pemeriksaan
  // Admin, pencocokan klaim, pengarsipan set lama — tidak perlu tahu dari mana
  // asalnya. Unggah ulang menggantikan yang sebelumnya: yang berlaku adalah
  // kartu yang terakhir dikirim, bukan tumpukan percobaan.
  await query("DELETE FROM signature_specimens WHERE set_id=$1", [s.set_id]);
  await query(
    `INSERT INTO signature_specimens (marketing_id, set_id, sequence, image_png,
       strokes, input_method)
     VALUES ($1,$2,1,$3,NULL,'ktp')`,
    [s.marketing_id, s.set_id, p.signature_png]);
  await audit({ entityType: "marketing", entityId: s.marketing_id,
                action: "enrollment_ktp_uploaded", actor: s.marketing_id,
                after: { size_bytes: buf.length, content_type: tipe } });

  return { ok: true };
}

/** Kirim tanda tangan KTP ke pemeriksaan Admin. */
export async function kirimSet(token: string) {
  const s = await bukaSesi(token);
  if (!s.ktp_at) {
    throw new WorkflowError(
      "Foto KTP belum diunggah.", "ktp_required", 409);
  }

  // Kemiripan antar goresan tidak lagi diukur: hanya ada satu contoh, dan
  // angka kemiripan satu contoh terhadap dirinya sendiri tidak mengatakan apa
  // pun. Yang dinilai Admin adalah apakah potongan itu memang tanda tangan
  // pada KTP orang tersebut — dan itu dilihat, bukan dihitung.
  await query(
    "UPDATE enrollment_sessions SET state='submitted', consistency=NULL " +
    "WHERE token=$1", [token]);
  await query("UPDATE marketings SET status='pending_review' WHERE id=$1 " +
              "AND status IN ('draft','rejected')", [s.marketing_id]);
  await audit({ entityType: "marketing", entityId: s.marketing_id,
                action: "enrollment_submitted", actor: s.marketing_id,
                after: { set_id: s.set_id, sumber: "ktp" } });

  return { konsistensi: null, jumlah: 1 };
}

/**
 * Nama yang sudah terdaftar, dikelompokkan menurut kategori penerima fee.
 *
 * Dipakai pemilih nama pada dialog pengajuan fee, di bawah pemilih
 * kategorinya. Sengaja ringkas — hanya id, nama, kategori, dan rekening
 * terakhirnya: dialog itu dibuka berkali-kali dalam satu sesi, dan
 * daftarMarketing() membawa serta spesimen tanda tangan dan sesi pendaftaran
 * yang tidak satu pun dibacanya.
 *
 * Hanya yang berstatus aktif. Yang belum menyelesaikan pendaftaran tanda
 * tangan memang akan ditolak createClaim(); memunculkannya di pemilih hanya
 * menawarkan pilihan yang pasti gagal.
 */
export async function daftarPerKategori(projectId: string) {
  await ensureKolomMarketing();
  return query(
    `SELECT m.id, m.full_name, m.category, m.marketing_type,
            b.holder_name, b.bank_name, b.account_number, b.branch,
            b.holder_type
       FROM marketings m
       LEFT JOIN LATERAL (
         SELECT * FROM bank_accounts b2
          WHERE b2.marketing_id = m.id
          ORDER BY b2.verified DESC, b2.id DESC LIMIT 1
       ) b ON TRUE
      WHERE m.project_id = $1 AND m.status = 'active'
      ORDER BY m.full_name`, [projectId]);
}

/** Daftar pendaftaran untuk layar Admin, dalam lingkup satu project. */
export async function daftarMarketing(projectId: string) {
  await ensureKolomMarketing();
  return query(
    `SELECT m.id, m.full_name, m.marketing_type, m.category, m.status, m.phone,
            a.name AS agency_name,
            COUNT(s.id) FILTER (WHERE NOT s.archived)::int AS spesimen,
            -- Spesimen lama berasal dari perekaman di layar; yang sekarang dari
            -- potongan KTP. Bedanya perlu terlihat: yang lama tidak dapat
            -- dibandingkan Admin dengan tanda tangan pada kartu.
            COUNT(s.id) FILTER (
              WHERE NOT s.archived AND s.input_method <> 'ktp')::int AS spesimen_lama,
            m.baseline_specimen_set_id,
            (m.reference_signature_png IS NOT NULL) AS punya_ktp,
            m.reference_signature_source, m.reference_signature_at,
            e.token AS sesi_token, e.state AS sesi_state, e.captured, e.target,
            e.consistency, e.set_id AS sesi_set_id, e.expires_at,
            e.ktp_at AS sesi_ktp_at, e.revision_reason
       FROM marketings m
       LEFT JOIN agencies a ON a.id = m.agency_id
       LEFT JOIN signature_specimens s ON s.marketing_id = m.id
       LEFT JOIN LATERAL (
         SELECT * FROM enrollment_sessions e2
          WHERE e2.marketing_id = m.id ORDER BY e2.created_at DESC LIMIT 1
       ) e ON TRUE
      WHERE m.project_id = $1
      GROUP BY m.id, a.name, e.token, e.state, e.captured, e.target,
               e.consistency, e.set_id, e.expires_at, e.ktp_at,
               e.revision_reason
      ORDER BY m.full_name`, [projectId]);
}

export async function spesimenSet(setId: string) {
  const spesimen = await query(
    `SELECT id, sequence, image_png, input_method, created_at
       FROM signature_specimens WHERE set_id=$1 ORDER BY sequence`, [setId]);
  const sesi = await one<{
    ktp_signature_png: string | null; ktp_at: string | null;
    revision_reason: string | null; ada_foto: boolean;
  }>(`SELECT ktp_signature_png, ktp_at, revision_reason,
             (ktp_image IS NOT NULL) AS ada_foto
        FROM enrollment_sessions WHERE set_id=$1`, [setId]);
  return {
    specimens: spesimen,
    ktp_signature_png: sesi?.ktp_signature_png ?? null,
    ktp_at: sesi?.ktp_at ?? null,
    ada_foto_ktp: Boolean(sesi?.ada_foto),
    revision_reason: sesi?.revision_reason ?? null,
  };
}

/** Foto KTP utuh, hanya selama sesinya belum diputus. */
export async function fotoKtp(setId: string) {
  const s = await one<{ ktp_image: Buffer | null; ktp_content_type: string | null }>(
    "SELECT ktp_image, ktp_content_type FROM enrollment_sessions WHERE set_id=$1",
    [setId]);
  if (!s?.ktp_image) {
    throw new WorkflowError(
      "Foto KTP tidak tersedia. Ia dihapus begitu pendaftarannya diputus.",
      "not_found", 404);
  }
  return { buf: s.ktp_image, tipe: s.ktp_content_type ?? "image/jpeg" };
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

  const sesi = await one<{ ktp_signature_png: string | null }>(
    "SELECT ktp_signature_png FROM enrollment_sessions WHERE set_id=$1", [setId]);

  if (keputusan === "approve") {
    await query(
      "UPDATE signature_specimens SET archived=TRUE WHERE marketing_id=$1 AND set_id<>$2",
      [marketingId, setId]);
    // Potongan tanda tangan KTP dicatat dua kali dengan maksud berbeda: sebagai
    // spesimen pembanding pada set ini, dan sebagai jangkar identitas pada
    // marketing-nya — bukti bahwa pembandingnya berasal dari kartu identitas
    // orang yang namanya terdaftar, bukan dari goresan yang dibuat entah siapa.
    await query(
      `UPDATE marketings SET status='active', baseline_specimen_set_id=$1,
              consent_version=$2,
              reference_signature_png=COALESCE($3, reference_signature_png),
              reference_signature_source=CASE WHEN $3 IS NULL
                THEN reference_signature_source ELSE 'ktp' END,
              reference_signature_at=CASE WHEN $3 IS NULL
                THEN reference_signature_at ELSE now() END
        WHERE id=$4`,
      [setId, VERSI_PERSETUJUAN, sesi?.ktp_signature_png ?? null, marketingId]);
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

  // Foto KTP utuh dihapus begitu putusannya diambil, apa pun putusannya. Ia
  // dipegang hanya selama Admin membutuhkannya untuk memeriksa; menyimpannya
  // lebih lama berarti menumpuk NIK, alamat, dan foto wajah yang tidak dipakai
  // lagi oleh apa pun di sistem ini.
  await query(
    `UPDATE enrollment_sessions
        SET ktp_image=NULL, ktp_content_type=NULL WHERE set_id=$1`, [setId]);

  await audit({
    entityType: "marketing", entityId: marketingId,
    action: `enrollment_${keputusan === "approve" ? "approved" : "rejected"}`,
    actor: aktor, reason: alasan,
    after: { set_id: setId, jumlah: jumlah.n,
             jangkar_ktp: keputusan === "approve" && Boolean(sesi?.ktp_signature_png),
             foto_ktp_dihapus: true },
  });
  return { marketing_id: marketingId, set_id: setId, keputusan };
}

/**
 * Terbitkan tautan penggantian untuk semua yang spesimennya dari perekaman lama.
 *
 * Peralihan ke tanda tangan KTP meninggalkan satu golongan di tengah: mereka
 * yang sudah merekam goresan di layar sebelum aturannya berubah. Spesimen itu
 * tidak salah, tetapi tidak dapat lagi dibandingkan Admin dengan tanda tangan
 * pada kartu — jadi seluruhnya perlu diganti, dan menerbitkan tautannya satu per
 * satu untuk puluhan orang adalah pekerjaan yang akan berhenti di tengah jalan.
 *
 * Alasannya tetap wajib dan tercatat pada tiap sesi, sama seperti penggantian
 * satuan: yang membedakan hanya bahwa alasannya diketik sekali.
 */
export async function revisiMassal(
  aktor: string, alasan: string, projectId: string,
) {
  if (!alasan || alasan.trim().length < 10) {
    throw new WorkflowError(
      "Alasan penggantian wajib diisi minimal 10 karakter.",
      "reason_required", 422);
  }

  const sasaran = await query<{ id: string; full_name: string; phone: string }>(
    `SELECT m.id, m.full_name, m.phone
       FROM marketings m
       JOIN signature_specimens s ON s.marketing_id = m.id
      WHERE NOT s.archived AND s.input_method <> 'ktp' AND m.project_id = $1
      GROUP BY m.id
      ORDER BY m.full_name`, [projectId]);

  const terbit: any[] = [];
  const gagal: { nama: string; sebab: string }[] = [];

  for (const m of sasaran) {
    try {
      const r = await terbitkanTautan(m.id, aktor,
                                      { revisi: true, alasan: alasan.trim(),
                                        projectId });
      terbit.push({ marketing_id: m.id, nama: m.full_name, ...r });
    } catch (e: any) {
      // Satu yang gagal tidak menghentikan sisanya: yang paling sering
      // menggagalkan adalah nomor telepon kosong, dan itu urusan per orang.
      gagal.push({ nama: m.full_name, sebab: e?.detail ?? e?.message ?? "gagal" });
    }
  }

  await audit({
    entityType: "marketing", action: "enrollment_revision_bulk", actor: aktor,
    reason: alasan.trim(),
    after: { sasaran: sasaran.length, terbit: terbit.length, gagal: gagal.length },
  });

  return { sasaran: sasaran.length, terbit, gagal };
}

/** Ambang onboarding, untuk ditampilkan apa adanya di layar Admin. */
export async function ambangOnboarding() {
  return Number(await setting("signature_threshold_onboarding"));
}

/**
 * Perbaiki nomor telepon marketing.
 *
 * Kolomnya NOT NULL tetapi boleh berisi teks kosong, dan data yang masuk dari
 * berkas penjualan kerap memang kosong. Akibatnya tautan pendaftaran tidak
 * dapat diterbitkan sama sekali — OTP tidak punya tujuan — tanpa ada satu pun
 * layar yang dapat memperbaikinya. Karena itu nomornya dapat disunting dari
 * layar Data Marketing, dan setiap perubahannya tercatat: nomor inilah yang
 * menerima kode verifikasi pendaftaran spesimen, jadi menggantinya sama dengan
 * memindahkan tujuan bukti identitas orang tersebut.
 */
export async function ubahNomor(
  marketingId: string, nomor: string, aktor: string, projectId?: string,
) {
  const mkt = await one<{ full_name: string; phone: string }>(
    "SELECT full_name, phone FROM marketings WHERE id=$1 " +
    "AND ($2::uuid IS NULL OR project_id=$2)", [marketingId, projectId ?? null]);
  if (!mkt) throw new WorkflowError("Marketing tidak ditemukan.", "not_found", 404);

  const rapi = rapikanNomor(nomor);
  if (!rapi) {
    throw new WorkflowError(
      "Nomor telepon tidak dikenali. Tuliskan nomor ponsel Indonesia, " +
      "misalnya 0812xxxxxxx.", "phone_invalid", 422);
  }
  if (rapi === mkt.phone) return { phone: rapi, changed: false };

  await query("UPDATE marketings SET phone=$2 WHERE id=$1", [marketingId, rapi]);
  await audit({
    entityType: "marketing", entityId: marketingId, action: "phone_changed",
    actor: aktor, before: { phone: mkt.phone }, after: { phone: rapi },
  });
  return { phone: rapi, changed: true };
}

/**
 * Kategori penerima fee seseorang.
 *
 * Yang masuk dari berkas penjualan hanya mengenal dua kategori — agent dan
 * sales inhouse — karena hanya itu yang tertulis di sana. Markom, Sales
 * Manager, Sales Koordinator, dan BGB ditetapkan di sini, dan sampai
 * ditetapkan, fee yang jatuh kepada mereka tidak muncul di pemilih nama pada
 * dialog pengajuan.
 *
 * Tercatat di audit: kategorinya menentukan jenis fee apa yang boleh diajukan
 * atas nama orang ini, dan tarif mana pada memo skema yang dipakai
 * menghitungnya.
 */
export async function ubahKategori(
  marketingId: string, kategori: string, aktor: string, projectId?: string,
) {
  if (!SEMUA_KATEGORI.includes(kategori as any)) {
    throw new WorkflowError(
      "Kategori tidak dikenali.", "category_invalid", 422);
  }
  await ensureKolomMarketing();
  const mkt = await one<{ full_name: string; category: string | null }>(
    "SELECT full_name, category FROM marketings WHERE id=$1 " +
    "AND ($2::uuid IS NULL OR project_id=$2)", [marketingId, projectId ?? null]);
  if (!mkt) throw new WorkflowError("Marketing tidak ditemukan.", "not_found", 404);
  if (mkt.category === kategori) return { category: kategori, changed: false };

  await query("UPDATE marketings SET category=$2 WHERE id=$1",
              [marketingId, kategori]);
  await audit({
    entityType: "marketing", entityId: marketingId, action: "category_changed",
    actor: aktor, before: { category: mkt.category },
    after: { category: kategori },
  });
  return { category: kategori, changed: true };
}

/**
 * Bakukan nomor ponsel ke bentuk 62xxxxxxxxxx, atau null bila bukan nomor.
 *
 * Satu bentuk saja yang disimpan supaya nomor yang sama tidak tersimpan dalam
 * tiga ejaan berbeda (0812…, +62812…, 62812…) dan terbaca sebagai tiga orang.
 */
function rapikanNomor(masuk: string): string | null {
  const angka = (masuk ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  const nomor = angka.startsWith("62") ? angka
              : angka.startsWith("0") ? "62" + angka.slice(1)
              : angka.startsWith("8") ? "62" + angka
              : angka;
  if (!/^62\d{8,13}$/.test(nomor)) return null;
  return nomor;
}

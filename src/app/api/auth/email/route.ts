import { randomInt } from "node:crypto";

import { body, clientIp, currentUser, handler } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { audit, one, query } from "@/lib/db";
import { kirimSurel, surelSiap } from "@/lib/surel";
import { WorkflowError } from "@/lib/workflow";

/**
 * Pendaftaran alamat surel oleh pemilik akunnya sendiri.
 *
 * Inilah yang membuat Admin IT tidak perlu mengetik alamat siapa pun — dan
 * inilah pula yang membedakannya dari membiarkan orang menyebut alamat tujuan
 * pada saat mengaku lupa Password. Bedanya satu hal, dan menentukan: di sini
 * alamat ditetapkan oleh orang yang BARU SAJA membuktikan tahu Password-nya.
 * Bila alamat boleh disebut saat mengaku lupa, siapa pun yang mengetahui
 * sebuah username dapat menyebut alamatnya sendiri, menerima kodenya, lalu
 * masuk sebagai orang itu.
 *
 * Alamatnya tetap dibuktikan: kode dikirim ke sana, dan hanya yang dapat
 * membuka kotak masuknya yang bisa menyelesaikan pendaftaran. Alamat yang
 * salah ketik karena itu tidak pernah tersimpan.
 *
 * POST  — minta kode ke alamat yang diketik.
 * PUT   — kode diperiksa, alamatnya disimpan.
 */

const MENIT_BERLAKU = 15;
const MAKS_SALAH = 5;
const MAKS_PER_JAM = 5;
const BENTUK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST = handler(async (req) => {
  const user = await currentUser(req);
  const p = await body<{ email?: string }>(req);
  const email = String(p.email ?? "").trim().toLowerCase();
  const ip = clientIp(req);

  if (!BENTUK.test(email)) {
    throw new WorkflowError("Alamat email tidak sah.", "validation", 422);
  }
  if (!surelSiap()) {
    throw new WorkflowError(
      "Pengiriman email belum dikonfigurasi pada sistem ini. Hubungi Admin IT.",
      "surel_belum_siap", 503);
  }

  // Satu alamat untuk satu akun: alamat yang menerima kode bagi dua akun
  // membuat yang memegangnya dapat mengganti Password keduanya.
  const dipakai = await one<{ username: string }>(
    `SELECT username FROM users
      WHERE lower(NULLIF(to_jsonb(users) ->> 'email','')) = $1 AND id <> $2`,
    [email, user.id]);
  if (dipakai) {
    throw new WorkflowError(
      "Alamat email itu sudah dipakai akun lain.", "surel_ganda", 409);
  }

  const banyak = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM email_verifications
      WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
    [user.id]);
  if ((banyak?.n ?? 0) >= MAKS_PER_JAM) {
    throw new WorkflowError(
      `Sudah ${MAKS_PER_JAM} kali kode diminta dalam satu jam terakhir. ` +
      `Coba lagi nanti.`, "terlalu_sering", 429);
  }

  const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await query(
    `INSERT INTO email_verifications (user_id, email, code_hash, expires_at,
                                      ip_address)
     VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval, $5)`,
    [user.id, email, await hashPassword(kode), String(MENIT_BERLAKU), ip]);

  await kirimSurel({
    kepada: email,
    jenis: "verifikasi_email",
    userId: user.id,
    perihal: `Kode verifikasi email — ${kode}`,
    isi:
      `Halo ${user.full_name},\n\n` +
      `Kode untuk mendaftarkan alamat email ini pada akun "${user.username}" ` +
      `adalah:\n\n    ${kode}\n\n` +
      `Kode berlaku ${MENIT_BERLAKU} menit. Masukkan pada layar yang sedang ` +
      `Anda buka.\n\n` +
      `Alamat ini nanti dipakai untuk dua hal: mengirim kode bila Anda lupa ` +
      `Password, dan mengabari bila ada pekerjaan yang menunggu Anda.\n\n` +
      `Bila bukan Anda yang meminta, abaikan email ini.\n`,
  });

  return { ok: true, email, berlaku_menit: MENIT_BERLAKU };
});

export const PUT = handler(async (req) => {
  const user = await currentUser(req);
  const p = await body<{ kode?: string }>(req);
  const kode = String(p.kode ?? "").trim();
  const ip = clientIp(req);

  if (!kode) {
    throw new WorkflowError("Kode wajib diisi.", "validation", 422);
  }

  const minta = await one<{ id: string; email: string; code_hash: string;
                            attempts: number; kedaluwarsa: boolean }>(
    `SELECT id, email, code_hash, attempts, (expires_at < now()) AS kedaluwarsa
       FROM email_verifications
      WHERE user_id = $1 AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1`, [user.id]);

  if (!minta) {
    throw new WorkflowError(
      "Tidak ada kode yang masih berlaku. Minta kode baru.",
      "tidak_ada_permintaan", 404);
  }
  if (minta.kedaluwarsa) {
    throw new WorkflowError("Kode sudah kedaluwarsa. Minta kode baru.",
                            "kode_kedaluwarsa", 410);
  }
  if (minta.attempts >= MAKS_SALAH) {
    throw new WorkflowError(
      "Kode sudah salah terlalu banyak kali. Minta kode baru.",
      "kode_hangus", 429);
  }

  const { verifyPassword } = await import("@/lib/auth");
  const { ok } = await verifyPassword(kode, minta.code_hash);
  if (!ok) {
    await query(
      "UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1",
      [minta.id]);
    const sisa = MAKS_SALAH - (minta.attempts + 1);
    throw new WorkflowError(
      sisa > 0 ? `Kode salah. Sisa percobaan: ${sisa}.`
               : "Kode salah, dan percobaannya habis. Minta kode baru.",
      "kode_salah", 401);
  }

  try {
    await query("UPDATE users SET email = $1 WHERE id = $2",
                [minta.email, user.id]);
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new WorkflowError(
        "Alamat email itu sudah dipakai akun lain.", "surel_ganda", 409);
    }
    throw err;
  }
  await query("UPDATE email_verifications SET used_at = now() WHERE id = $1",
              [minta.id]);

  await audit({
    entityType: "user", entityId: user.id, action: "email_verified",
    actor: user.username, ip, after: { email: minta.email },
    reason: "Alamat email didaftarkan dan dibuktikan oleh pemilik akunnya.",
  });

  return { ok: true, email: minta.email };
});

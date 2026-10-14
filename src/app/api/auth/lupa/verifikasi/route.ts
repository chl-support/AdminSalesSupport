import { body, clientIp, handler } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { audit, one, query } from "@/lib/db";
import { catatSandi } from "@/lib/sandi-terlihat";
import { WorkflowError } from "@/lib/workflow";

/**
 * Langkah kedua "lupa kata sandi": kode diperiksa, sandi baru dipasang.
 *
 * Yang dijaga di sini:
 *
 *  * **Lima kali salah menghanguskan kodenya.** Enam angka hanya sejuta
 *    kemungkinan; tanpa batas, menebaknya adalah pekerjaan beberapa menit.
 *  * **Kode hangus sekali pakai**, ditandai used_at. Kode yang masih berlaku
 *    di kotak masuk orang tidak boleh dapat dipakai dua kali.
 *  * **Seluruh sesi diputus dan penguncian dibuka.** Yang sampai di sini
 *    umumnya sedang terkunci karena salah berkali-kali; sandi baru yang tetap
 *    ditolak layar masuk tidak menolong siapa pun.
 *  * **Pesan salahnya tidak membedakan** kode keliru dari kode kedaluwarsa
 *    bagi pihak luar? Justru dibedakan — keduanya punya langkah lanjutan yang
 *    berbeda (coba lagi vs minta kode baru), dan keduanya sama-sama hanya
 *    berguna bagi orang yang memang memegang surelnya.
 */

const MIN_PANJANG = 10;
const MAKS_SALAH = 5;

export const POST = handler(async (req) => {
  const p = await body<{ email?: string; kode?: string; password?: string }>(req);
  const email = String(p.email ?? "").trim().toLowerCase();
  const kode = String(p.kode ?? "").trim();
  const sandi = String(p.password ?? "");
  const ip = clientIp(req);

  if (!email || !kode) {
    throw new WorkflowError("Surel dan kode wajib diisi.", "validation", 422);
  }
  if (sandi.length < MIN_PANJANG) {
    throw new WorkflowError(
      `Kata sandi baru minimal ${MIN_PANJANG} karakter.`, "validation", 422);
  }

  const minta = await one<{
    id: string; user_id: string; code_hash: string; attempts: number;
    kedaluwarsa: boolean;
  }>(
    `SELECT id, user_id, code_hash, attempts, (expires_at < now()) AS kedaluwarsa
       FROM password_resets
      WHERE lower(email) = $1 AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1`, [email]);

  if (!minta) {
    throw new WorkflowError(
      "Tidak ada permintaan ganti sandi yang masih berlaku untuk alamat ini. " +
      "Minta kode baru.", "tidak_ada_permintaan", 404);
  }
  if (minta.kedaluwarsa) {
    throw new WorkflowError(
      "Kode sudah kedaluwarsa. Minta kode baru.", "kode_kedaluwarsa", 410);
  }
  if (minta.attempts >= MAKS_SALAH) {
    throw new WorkflowError(
      "Kode sudah salah terlalu banyak kali dan tidak berlaku lagi. Minta " +
      "kode baru.", "kode_hangus", 429);
  }

  const { ok } = await verifyPassword(kode, minta.code_hash);
  if (!ok) {
    await query(
      "UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1",
      [minta.id]);
    const sisa = MAKS_SALAH - (minta.attempts + 1);
    throw new WorkflowError(
      sisa > 0
        ? `Kode salah. Sisa percobaan: ${sisa}.`
        : "Kode salah, dan percobaannya habis. Minta kode baru.",
      "kode_salah", 401);
  }

  const user = await one<{ id: string; username: string; full_name: string }>(
    "SELECT id, username, full_name FROM users WHERE id = $1", [minta.user_id]);
  if (!user) {
    throw new WorkflowError("Pengguna tidak ditemukan.", "not_found", 404);
  }

  await query("UPDATE users SET password_hash = $1 WHERE id = $2",
              [await hashPassword(sandi), user.id]);
  await catatSandi(user.id, sandi);
  await query("UPDATE password_resets SET used_at = now() WHERE id = $1",
              [minta.id]);
  // Permintaan lain yang masih menggantung ikut dihanguskan: dua kode hidup
  // sekaligus berarti yang lama masih dapat dipakai orang lain yang sempat
  // membacanya.
  await query(
    `UPDATE password_resets SET used_at = now()
      WHERE user_id = $1 AND used_at IS NULL`, [user.id]);

  const sesi = await query<{ id: string }>(
    "DELETE FROM sessions WHERE user_id = $1 RETURNING id", [user.id]);
  const kunci = await query<{ id: string }>(
    `DELETE FROM login_attempts
      WHERE username = $1 AND NOT succeeded RETURNING id`, [user.username]);

  await audit({
    entityType: "user", entityId: user.id, action: "password_reset",
    actor: user.username, ip,
    reason: "Diganti sendiri lewat kode verifikasi ke surel terdaftar.",
  });

  return {
    ok: true,
    username: user.username,
    sesi_diputus: sesi.length,
    penguncian_dibuka: kunci.length,
  };
  // Publik: pemanggilnya belum punya sesi. Yang menjaganya kode enam angka
  // yang hanya sampai ke surel terdaftar, berumur 15 menit, lima kali salah,
  // dan sekali pakai.
}, { publik: true });

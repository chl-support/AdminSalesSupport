import { randomInt } from "node:crypto";

import { body, clientIp, handler } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { audit, one, query } from "@/lib/db";
import { kirimSurel, surelSiap } from "@/lib/surel";
import { WorkflowError } from "@/lib/workflow";

/**
 * Langkah pertama "lupa kata sandi": meminta kode verifikasi ke surel sendiri.
 *
 * Tiga hal yang sengaja dilakukan:
 *
 *  1. **Jawabannya selalu sama**, ada maupun tidak ada akun dengan surel itu.
 *     Membedakannya menjadikan layar ini alat memeriksa alamat surel siapa saja
 *     yang terdaftar di perusahaan — cuma-cuma, tanpa perlu satu pun sandi.
 *  2. **Kodenya disimpan sebagai hash**, sama seperti sandi. Yang membaca basis
 *     data tidak mendapat kode yang sedang berlaku.
 *  3. **Dibatasi tiga permintaan per jam per alamat.** Tanpa itu, satu orang
 *     dapat membanjiri kotak masuk orang lain lewat layar ini.
 *
 * Masa berlaku kodenya 15 menit: cukup untuk membuka surel di ponsel, terlalu
 * pendek untuk ditebak satu per satu.
 */

const MENIT_BERLAKU = 15;
const MAKS_PER_JAM = 3;

export const POST = handler(async (req) => {
  const p = await body<{ email?: string }>(req);
  const email = String(p.email ?? "").trim().toLowerCase();
  const ip = clientIp(req);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new WorkflowError("Alamat surel tidak sah.", "validation", 422);
  }

  // Diperiksa lebih dulu: ini keadaan sistem, bukan keterangan tentang siapa
  // yang terdaftar, jadi menyebutkannya tidak membocorkan apa pun — sedangkan
  // membiarkannya membuat orang menunggu surel yang tidak mungkin datang.
  if (!surelSiap()) {
    throw new WorkflowError(
      "Pengiriman surel belum dikonfigurasi pada sistem ini. Hubungi Admin IT.",
      "surel_belum_siap", 503);
  }

  const banyak = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM password_resets
      WHERE lower(email) = $1 AND created_at > now() - interval '1 hour'`,
    [email]);
  if ((banyak?.n ?? 0) >= MAKS_PER_JAM) {
    throw new WorkflowError(
      `Sudah ${MAKS_PER_JAM} kali kode diminta untuk alamat ini dalam satu ` +
      `jam terakhir. Coba lagi nanti.`, "terlalu_sering", 429);
  }

  const user = await one<{ id: string; username: string; full_name: string }>(
    `SELECT id, username, full_name FROM users
      WHERE lower(email) = $1 AND active`, [email]);

  if (user) {
    const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await query(
      `INSERT INTO password_resets (user_id, email, code_hash, expires_at,
                                    ip_address)
       VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval, $5)`,
      [user.id, email, await hashPassword(kode), String(MENIT_BERLAKU), ip]);

    await kirimSurel({
      kepada: email,
      perihal: `Kode verifikasi ganti Password — ${kode}`,
      isi:
        `Halo ${user.full_name},\n\n` +
        `Kode verifikasi untuk mengganti Password akun "${user.username}" ` +
        `adalah:\n\n    ${kode}\n\n` +
        `Kode ini berlaku ${MENIT_BERLAKU} menit. Masukkan pada layar masuk, ` +
        `lalu tentukan Password baru Anda.\n\n` +
        `Bila bukan Anda yang meminta, abaikan surel ini — Password Anda ` +
        `tidak berubah selama kode ini tidak dipakai. Beri tahu Admin IT bila ` +
        `surel seperti ini datang berulang kali.\n`,
    });

    await audit({
      entityType: "user", entityId: user.id, action: "password_reset_requested",
      actor: user.username, ip,
      reason: "Kode verifikasi ganti Password dikirim ke surel terdaftar.",
    });
  }

  // Jawaban yang sama, ada maupun tidak ada akunnya.
  return {
    ok: true,
    detail: "Bila alamat itu terdaftar, kode verifikasi sudah dikirim ke sana.",
    berlaku_menit: MENIT_BERLAKU,
  };
  // Publik, mau tidak mau: yang memanggilnya justru orang yang tidak dapat
  // masuk. Yang menjaganya pembatasan tiga kali per jam dan jawaban yang sama
  // untuk alamat yang ada maupun yang tidak.
}, { publik: true });

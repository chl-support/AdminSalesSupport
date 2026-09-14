import { handler, currentUser } from "@/lib/api";
import { audit, one, query } from "@/lib/db";
import { COOKIE, hashPassword, verifyPassword } from "@/lib/auth";
import { WorkflowError } from "@/lib/workflow";

/**
 * Ganti sandi sendiri.
 *
 * Terpisah dari pengelolaan akun oleh Admin Sistem, dan sengaja terbuka bagi
 * semua peran: tanpa ini setiap penggantian sandi harus lewat satu orang, dan
 * antrean itu sendiri menjadi alasan orang menunda menggantinya.
 *
 * Sandi lama tetap diminta meski penggunanya sudah masuk. Perangkat yang
 * ditinggalkan tanpa terkunci adalah kejadian sehari-hari, dan tanpa sandi lama
 * siapa pun yang menemukannya dapat mengunci pemiliknya keluar dari akunnya
 * sendiri.
 */

const MIN_PANJANG = 8;

export const POST = handler(async (req) => {
  const user = await currentUser(req);
  const p = await req.json().catch(() => ({} as any));

  const lama = String(p.current_password ?? "");
  const baru = String(p.new_password ?? "");

  if (baru.length < MIN_PANJANG) {
    throw new WorkflowError(
      `Kata sandi baru minimal ${MIN_PANJANG} karakter.`, "validation", 422);
  }
  if (baru === lama) {
    throw new WorkflowError(
      "Kata sandi baru sama dengan yang lama.", "validation", 422);
  }

  const row = await one<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1", [user.id]);
  const { ok } = await verifyPassword(lama, row?.password_hash ?? "");
  if (!ok) {
    throw new WorkflowError("Kata sandi lama salah.", "unauthenticated", 401);
  }

  await query("UPDATE users SET password_hash = $1 WHERE id = $2",
              [await hashPassword(baru), user.id]);

  // Sesi lain diputus, sesi ini dipertahankan: mengganti sandi sendiri tidak
  // seharusnya mengeluarkan orangnya dari layar yang sedang ia pakai, tetapi
  // perangkat lain yang masih terbuka memang harus ikut terputus.
  const token = req.cookies.get(COOKIE)?.value ?? "";
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(token).digest("hex");
  const sesi = await query(
    "DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2 RETURNING id",
    [user.id, hash]);

  await audit({
    entityType: "user", entityId: user.id, action: "password_changed",
    actor: user.username,
    reason: "Sandi diganti sendiri oleh pemiliknya.",
  });

  return { ok: true, sesi_lain_diputus: sesi.length };
});

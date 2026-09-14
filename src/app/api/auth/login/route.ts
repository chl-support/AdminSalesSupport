import { NextResponse } from "next/server";

import { body, clientIp, handler } from "@/lib/api";
import { audit, one, query } from "@/lib/db";
import {
  COOKIE, PENGUNCIAN, catatPercobaan, cookieOptions, hashPassword,
  sapuSesiKedaluwarsa, sisaPercobaan, startSession, verifyPassword,
} from "@/lib/auth";

/**
 * Masuk.
 *
 * Tiga hal yang sengaja dilakukan dan mudah terlewat:
 *
 *  1. **Pesan gagal tidak membedakan** "pengguna tidak ada" dari "sandi salah".
 *     Membedakannya memberi penebak daftar username yang sah secara cuma-cuma.
 *  2. **Pemeriksaan sandi tetap dijalankan** walau penggunanya tidak ada, memakai
 *     hash umpan. Tanpa itu, username yang tidak ada dijawab jauh lebih cepat
 *     daripada yang ada, dan selisih waktu itu sendiri sudah menjadi jawaban.
 *  3. **Percobaan dicatat sebelum hasilnya dikembalikan**, sehingga penguncian
 *     tetap berlaku meski pemanggilnya memutus koneksi lebih awal.
 */

// Hash umpan: scrypt atas nilai acak tetap, hanya untuk menghabiskan waktu yang
// kira-kira sama seperti memeriksa sandi sungguhan.
const UMPAN =
  "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

export const POST = handler(async (req) => {
  const p = await body<{ username?: string; password?: string }>(req);
  const username = p.username?.trim().toLowerCase() ?? "";
  const password = p.password ?? "";
  const ip = clientIp(req);

  const gagal = (detail: string, status = 401, extra: object = {}) =>
    NextResponse.json({ title: detail, detail, status, ...extra }, { status });

  if (!username || !password) {
    return gagal("Username dan kata sandi wajib diisi.", 422);
  }

  const sisa = await sisaPercobaan(username);
  if (sisa <= 0) {
    await catatPercobaan(username, ip, false);
    return gagal(
      `Akun dikunci sementara setelah ${PENGUNCIAN.maks} percobaan gagal. ` +
      `Coba lagi setelah ${PENGUNCIAN.menit} menit, atau hubungi Admin Sistem.`,
      429);
  }

  const user = await one<{
    id: string; username: string; full_name: string; role: string;
    password_hash: string;
  }>(`SELECT id, username, full_name, role, password_hash
        FROM users WHERE username = $1 AND active`, [username]);

  const { ok, perluDimutakhirkan } =
    await verifyPassword(password, user?.password_hash ?? UMPAN);

  if (!user || !ok) {
    await catatPercobaan(username, ip, false);
    const tersisa = await sisaPercobaan(username);
    return gagal(
      "Username atau kata sandi salah.", 401,
      tersisa > 0 ? { sisa_percobaan: tersisa } : {});
  }

  // Hash lama (SHA-256 tanpa garam) ditulis ulang ke scrypt saat pemiliknya
  // terbukti tahu sandinya — satu-satunya saat sandi aslinya ada di tangan kita.
  if (perluDimutakhirkan) {
    await query("UPDATE users SET password_hash = $1 WHERE id = $2",
                [await hashPassword(password), user.id]);
  }

  await sapuSesiKedaluwarsa();
  const { token, expiresAt } = await startSession(
    user.id, ip, req.headers.get("user-agent"));

  await catatPercobaan(username, ip, true);
  await audit({
    entityType: "user",
    entityId: user.id,
    action: "login",
    actor: user.username,
    ip,
  });

  const res = NextResponse.json({
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    expires_at: expiresAt.toISOString(),
  });
  res.cookies.set(COOKIE, token, cookieOptions(expiresAt));
  return res;
}, { publik: true });

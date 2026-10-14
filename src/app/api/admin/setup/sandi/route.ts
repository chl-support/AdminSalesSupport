import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { handler, body } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { audit, one, query } from "@/lib/db";
import { catatSandi } from "@/lib/sandi-terlihat";

/**
 * Memasang sandi baru untuk satu pengguna, lewat rahasia penyiapan.
 *
 * Ada untuk satu keadaan yang tidak punya jalan keluar lain: sandi sysadmin
 * lupa. Peran lain dapat ditolong sysadmin dari layar Admin IT, tetapi sysadmin
 * sendiri tidak punya siapa-siapa di atasnya — dan konsol ini dikelola dari
 * dashboard Vercel, tanpa terminal, jadi scripts/set-password.ts pun tidak
 * terjangkau.
 *
 * Pengamannya sama persis dengan endpoint penyiapan di sebelahnya, dan itu
 * disengaja: keduanya sama-sama berbahaya, jadi keduanya dijaga hal yang sama.
 *
 *  1. Tanpa SETUP_SECRET di environment, route ini membalas 404 — tidak ada
 *     jejak bahwa ia ada. Inilah sebabnya SETUP_SECRET wajib dicabut kembali
 *     sesudah dipakai: selama ia terpasang, siapa pun yang mengetahui nilainya
 *     dapat mengganti sandi siapa pun.
 *  2. Rahasianya dibandingkan secara constant-time.
 *  3. Sandi barunya tidak pernah dikembalikan dalam respons dan tidak pernah
 *     masuk URL — ia hanya ada di badan permintaan.
 *
 * Seluruh sesi pengguna itu diputus: mengganti sandi tanpa memutusnya tidak
 * mengusir siapa pun, padahal justru itu yang kerap dituju.
 */

function berwenang(diberikan: string | null): boolean {
  const seharusnya = process.env.SETUP_SECRET;
  if (!seharusnya || !diberikan) return false;
  const a = Buffer.from(diberikan);
  const b = Buffer.from(seharusnya);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const POST = handler(async (req) => {
  if (!process.env.SETUP_SECRET) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  if (!berwenang(req.headers.get("x-setup-secret"))) {
    return NextResponse.json(
      { detail: "Rahasia penyiapan tidak cocok." }, { status: 401 });
  }

  const p = await body(req);
  const username = String(p.username ?? "").trim().toLowerCase();
  const sandi = String(p.password ?? "");

  if (!username) {
    return NextResponse.json({ detail: "Username wajib diisi." }, { status: 422 });
  }
  // Sepuluh karakter, bukan delapan: sandi yang dipasang lewat jalur darurat
  // ini biasanya dipakai berbulan-bulan sesudahnya.
  if (sandi.length < 10) {
    return NextResponse.json(
      { detail: "Password baru minimal 10 karakter." }, { status: 422 });
  }

  const user = await one<{ id: string; username: string; full_name: string;
                           role: string }>(
    "SELECT id, username, full_name, role FROM users WHERE username=$1",
    [username]);
  if (!user) {
    const ada = await query<{ username: string }>(
      "SELECT username FROM users ORDER BY username");
    return NextResponse.json({
      detail: `Pengguna '${username}' tidak ada. Yang ada: ` +
              ada.map((u) => u.username).join(", "),
    }, { status: 404 });
  }

  await query("UPDATE users SET password_hash=$1, active=TRUE WHERE id=$2",
              [await hashPassword(sandi), user.id]);
  await catatSandi(user.id, sandi);
  const sesi = await query<{ id: string }>(
    "DELETE FROM sessions WHERE user_id=$1 RETURNING id", [user.id]);

  // Penguncian sesudah lima percobaan gagal ikut dibuka. Sandi baru yang
  // dipasang sementara akunnya masih terkunci tidak menolong siapa pun: yang
  // memegangnya tetap ditolak di layar masuk, dan mengira sandi barunya salah.
  const gagal = await query<{ id: string }>(
    "DELETE FROM login_attempts WHERE username=$1 AND NOT succeeded RETURNING id",
    [user.username]);

  await audit({
    entityType: "user", entityId: user.id, action: "password_reset",
    actor: "setup", reason: "Diganti lewat halaman penyiapan (SETUP_SECRET)",
  });

  return {
    ok: true,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    sessions_closed: sesi.length,
    lockout_cleared: gagal.length,
    reminder: "Password terpasang. Hapus SETUP_SECRET dari Environment Variables " +
              "lalu Redeploy, agar jalur ini kembali tidak aktif.",
  };
}, { publik: true });

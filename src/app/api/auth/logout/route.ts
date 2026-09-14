import { NextResponse } from "next/server";

import { clientIp, handler } from "@/lib/api";
import { audit } from "@/lib/db";
import { COOKIE, endSession, userFromToken } from "@/lib/auth";

/**
 * Keluar.
 *
 * Sesi dihapus di basis data, bukan hanya cookie-nya dibuang di peramban.
 * Membuang cookie saja meninggalkan token yang masih sah — siapa pun yang
 * sempat menyalinnya tetap dapat memakainya sampai kedaluwarsa.
 *
 * Selalu membalas 200: keluar dari sesi yang sudah tidak ada bukan kegagalan
 * yang perlu ditangani pemanggilnya.
 */
export const POST = handler(async (req) => {
  const token = req.cookies.get(COOKIE)?.value ?? "";
  const user = await userFromToken(token);
  await endSession(token);

  if (user) {
    await audit({
      entityType: "user",
      entityId: user.id,
      action: "logout",
      actor: user.username,
      ip: clientIp(req),
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
}, { publik: true });

import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { COOKIE, userFromToken } from "@/lib/auth";

/**
 * Siapa yang sedang masuk.
 *
 * Dipakai tiap halaman konsol untuk memutuskan menampilkan isinya atau
 * mengalihkan ke /login. Ini kenyamanan tampilan, bukan penjaga: setiap endpoint
 * lain tetap memeriksa sesinya sendiri, sehingga melewati halamannya tidak
 * memberi akses apa pun.
 */
export const GET = handler(async (req) => {
  const user = await userFromToken(req.cookies.get(COOKIE)?.value ?? "");
  if (!user) {
    return NextResponse.json(
      { title: "Belum masuk", detail: "Belum masuk", status: 401 },
      { status: 401 });
  }
  return {
    username: user.username,
    full_name: user.full_name,
    role: user.role,
  };
}, { publik: true });

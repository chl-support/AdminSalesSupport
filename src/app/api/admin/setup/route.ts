import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { handler } from "@/lib/api";
import { ensureDefaultSettings, explainDbError, one, pool, query } from "@/lib/db";
import { ensureProjects } from "@/lib/projects";

/**
 * Endpoint penyiapan sekali jalan: menjalankan migrasi dan, bila diminta, mengisi
 * data contoh.
 *
 * Ada supaya penyiapan pertama di Vercel tidak mengharuskan meng-clone repositori
 * dan memasang Node di mesin lokal. Setelah basis data siap, endpoint ini
 * sebaiknya dimatikan.
 *
 * Tiga pengaman:
 *
 *  1. **Mati secara bawaan.** Tanpa `SETUP_SECRET` di environment, route membalas
 *     404 — tidak ada jejak bahwa endpoint ini ada.
 *  2. **Rahasia dibandingkan secara constant-time**, agar panjang cocokan tidak
 *     bocor lewat selisih waktu respons.
 *  3. **Menolak menimpa data yang sudah ada.** Seed mengosongkan tabel, jadi bila
 *     sudah ada klaim tersimpan, permintaan ditolak kecuali `force` diisi eksplisit.
 *
 * Migrasi sendiri idempoten: seluruh DDL memakai IF NOT EXISTS atau OR REPLACE.
 */

function authorised(provided: string | null): boolean {
  const expected = process.env.SETUP_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual melempar bila panjang berbeda, jadi panjangnya disamakan dulu.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const GET = handler(async () => {
  if (!process.env.SETUP_SECRET) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  // Status ringkas, tanpa memerlukan rahasia: cukup untuk tahu apakah perlu setup.
  try {
    const t = await one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema='public'`);
    const users = await one<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM users").catch(() => null);
    return {
      tables: t?.n ?? 0,
      migrated: (t?.n ?? 0) > 0,
      users: users?.n ?? 0,
      seeded: (users?.n ?? 0) > 0,
      next_step: (t?.n ?? 0) === 0
        ? "Jalankan POST dengan header x-setup-secret untuk memigrasikan."
        : (users?.n ?? 0) === 0
          ? "Skema sudah ada tetapi belum ada pengguna. POST dengan seed=true."
          : "Sudah siap. Hapus SETUP_SECRET dari environment.",
    };
  } catch (err: any) {
    return NextResponse.json(
      { detail: explainDbError(err), pgCode: err?.code ?? null }, { status: 503 });
  }
}, { publik: true });

export const POST = handler(async (req) => {
  if (!process.env.SETUP_SECRET) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  if (!authorised(req.headers.get("x-setup-secret"))) {
    return NextResponse.json(
      { detail: "Rahasia penyiapan tidak cocok." }, { status: 401 });
  }

  const url = new URL(req.url);
  const wantSeed = url.searchParams.get("seed") === "true";
  const force = url.searchParams.get("force") === "true";
  const steps: string[] = [];

  try {
    const sql = await readFile(join(process.cwd(), "db", "schema.sql"), "utf8");
    await pool.query(sql);
    await ensureDefaultSettings();
    await ensureProjects();

    const tables = await one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema='public'`);
    steps.push(`migrasi selesai — ${tables?.n ?? 0} tabel`);

    if (wantSeed) {
      const existing = await one<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM claims");
      if ((existing?.n ?? 0) > 0 && !force) {
        return NextResponse.json({
          steps,
          detail: `Basis data sudah berisi ${existing!.n} klaim. Seed akan ` +
                  `mengosongkan seluruh tabel. Tambahkan &force=true bila memang ` +
                  `ingin menimpanya.`,
        }, { status: 409 });
      }
      const { seed } = await import("../../../../../scripts/seed");
      const info = await seed();
      steps.push(`seed selesai — ${Object.keys(info.units).length} unit, ` +
                 `${info.marketings.length} marketing, 7 pengguna`);
    }

    return {
      ok: true,
      steps,
      reminder: "Penyiapan selesai. Hapus SETUP_SECRET dari Environment Variables " +
                "lalu redeploy, agar endpoint ini kembali tidak aktif.",
      next: "/api/health",
    };
  } catch (err: any) {
    return NextResponse.json(
      { steps, detail: explainDbError(err), pgCode: err?.code ?? null },
      { status: 500 });
  }
}, { publik: true });

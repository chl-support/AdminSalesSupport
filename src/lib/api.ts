/**
 * Helper bersama untuk route handler.
 *
 * Autentikasi disederhanakan untuk prototipe: header `X-User` berisi username.
 * Sebelum produksi, ganti dengan OIDC/JWT dan MFA sesuai PRD. Pemeriksaan peran
 * tetap dijalankan di server supaya penggantian lapisan auth tidak mengubah
 * kebijakan wewenangnya.
 */

import { NextResponse, type NextRequest } from "next/server";
import { explainDbError, one } from "./db";
import { WorkflowError } from "./workflow";

export type User = {
  id: string; username: string; full_name: string; role: string;
};

export async function currentUser(req: NextRequest): Promise<User> {
  const username = req.headers.get("x-user") ?? "admin";
  const user = await one<User>(
    "SELECT id, username, full_name, role FROM users WHERE username=$1 AND active",
    [username]);
  if (!user) {
    throw new WorkflowError(`Pengguna '${username}' tidak dikenal.`,
                            "unauthenticated", 401);
  }
  return user;
}

export async function requireRole(
  req: NextRequest, ...roles: string[]
): Promise<User> {
  const user = await currentUser(req);
  if (roles.length && !roles.includes(user.role)) {
    throw new WorkflowError(
      `Peran '${user.role}' tidak berwenang. Diperlukan: ${roles.join(", ")}.`,
      "forbidden", 403);
  }
  return user;
}

/** Bungkus handler: ubah WorkflowError menjadi respons problem+json (RFC 9457). */
export function handler<T>(fn: (req: NextRequest, ctx: any) => Promise<T>) {
  return async (req: NextRequest, ctx: any) => {
    try {
      const result = await fn(req, ctx);
      if (result instanceof NextResponse || result instanceof Response) return result;
      return NextResponse.json(result as any);
    } catch (err: any) {
      if (err instanceof WorkflowError) {
        return NextResponse.json(
          {
            type: `https://klaim.sbl.co.id/problems/${err.code}`,
            title: err.message, status: err.status, detail: err.message,
            ...err.extra,
          },
          { status: err.status, headers: { "content-type": "application/problem+json" } },
        );
      }
      console.error(err);
      // Galat basis data diterjemahkan menjadi pesan yang menyebut langkah
      // perbaikannya — tanpa ini, kegagalan konfigurasi di produksi muncul sebagai
      // kode pg mentah yang tidak menuntun ke mana pun.
      const isDbError = typeof err?.code === "string" &&
        /^[0-9A-Z]{5}$/.test(err.code) || ["ECONNREFUSED", "ENOTFOUND",
        "ETIMEDOUT"].includes(err?.code);
      return NextResponse.json(
        {
          type: isDbError ? "https://klaim.sbl.co.id/problems/database"
                          : "about:blank",
          title: isDbError ? "Basis data tidak dapat diakses" : "Kesalahan internal",
          status: 500,
          detail: isDbError ? explainDbError(err) : String(err?.message ?? err),
          ...(isDbError ? { pgCode: err.code } : {}),
        },
        { status: 500, headers: { "content-type": "application/problem+json" } },
      );
    }
  };
}

export async function body<T = any>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export const idemKey = (req: NextRequest) => req.headers.get("idempotency-key");

export function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Tampilan klaim beserta unit dan marketing-nya. */
export async function claimView(claim: any) {
  const unit = await one("SELECT * FROM units WHERE id=$1", [claim.unit_id]);
  const mkt = await one(
    "SELECT id, full_name, marketing_type, phone, npwp FROM marketings WHERE id=$1",
    [claim.marketing_id]);
  return { ...claim, unit, marketing: mkt };
}

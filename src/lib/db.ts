/**
 * Koneksi PostgreSQL, jejak audit, konfigurasi, dan idempotensi.
 *
 * `pg` secara bawaan mengembalikan BIGINT sebagai string agar tidak kehilangan
 * presisi. Nilai rupiah kita jauh di bawah 2^53, jadi parser diubah menjadi angka
 * supaya tidak perlu konversi manual di setiap pemanggil. NUMERIC tetap dibiarkan
 * sebagai string — persentase tidak boleh menyentuh floating point (lihat money.ts).
 */

import { Pool, types, type PoolClient } from "pg";

types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
// 1700 (numeric) sengaja tidak diubah: tetap string.

/**
 * Konfigurasi koneksi.
 *
 * Di lingkungan serverless (Vercel, Lambda) tiap instance fungsi membuat pool
 * sendiri. Pool besar per-instance akan menghabiskan kuota koneksi Postgres
 * terkelola begitu ada beberapa instance menyala bersamaan — Neon free tier
 * hanya mengizinkan puluhan koneksi. Karena itu ukuran pool dikecilkan otomatis
 * saat terdeteksi serverless, dan pool di-cache pada objek global agar dipakai
 * ulang lintas invocation pada instance yang sama.
 */

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);

const connectionString = process.env.DATABASE_URL;

export const MISSING_DATABASE_URL =
  "DATABASE_URL belum diisi. Aplikasi ini memerlukan PostgreSQL yang dapat " +
  "dijangkau dari lingkungan tempatnya berjalan.\n\n" +
  "Pengembangan lokal: salin .env.example menjadi .env lalu sesuaikan.\n" +
  "Vercel: Settings > Environment Variables, tambahkan DATABASE_URL untuk " +
  "Production, Preview, dan Development.\n\n" +
  "Vercel tidak menyediakan PostgreSQL secara otomatis — gunakan Neon, Supabase, " +
  "Vercel Postgres, atau instance lain yang dapat diakses publik.";

/**
 * TLS diaktifkan otomatis untuk host non-lokal.
 *
 * Hampir seluruh Postgres terkelola mewajibkan TLS dan menolak koneksi polos.
 * Menyerahkan ini ke variabel manual berarti kegagalan pertama di produksi berupa
 * pesan "no pg_hba.conf entry" yang tidak jelas hubungannya dengan TLS.
 */
function sslConfig(url: string) {
  if (process.env.PGSSL === "disable") return {};
  if (process.env.PGSSL === "require") return { ssl: { rejectUnauthorized: false } };
  const local = /(^|@|\/\/)(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(url);
  return local ? {} : { ssl: { rejectUnauthorized: false } };
}

declare global {
  // eslint-disable-next-line no-var
  var __klaimPool: Pool | undefined;
}

/**
 * Pool dibuat saat pertama dipakai, bukan saat modul dimuat.
 *
 * Melempar galat pada waktu impor akan mematikan seluruh route termasuk
 * /api/health — padahal justru itu yang dibutuhkan untuk mendiagnosis deploy yang
 * variabel lingkungannya belum lengkap.
 */
function getPool(): Pool {
  if (global.__klaimPool) return global.__klaimPool;
  if (!connectionString) throw new Error(MISSING_DATABASE_URL);

  const p = new Pool({
    connectionString,
    max: Number(process.env.PGPOOL_MAX ?? (isServerless ? 2 : 10)),
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    ...sslConfig(connectionString),
  });

  p.on("error", (err) => {
    // Koneksi menganggur yang diputus Postgres terkelola tidak boleh
    // menjatuhkan proses.
    console.error("Pool PostgreSQL: galat pada koneksi menganggur:", err.message);
  });

  global.__klaimPool = p;
  return p;
}

/** Akses pool melalui proxy agar pemanggil lama tetap bekerja tanpa perubahan. */
export const pool = new Proxy({} as Pool, {
  get(_t, prop) {
    const target = getPool() as any;
    const value = target[prop];
    return typeof value === "function" ? value.bind(target) : value;
  },
});

/** Pesan yang lebih jelas ketika skema belum pernah dimigrasikan. */
export function explainDbError(err: any): string {
  if (err?.code === "42P01") {
    return "Tabel belum ada. Jalankan migrasi sekali terhadap basis data ini: " +
           "DATABASE_URL='<url>' npm run db:migrate";
  }
  if (err?.code === "ECONNREFUSED") {
    return "Koneksi ditolak. Periksa DATABASE_URL dan apakah host mengizinkan " +
           "akses dari luar.";
  }
  if (err?.code === "ENOTFOUND") {
    return "Host pada DATABASE_URL tidak ditemukan.";
  }
  if (String(err?.message).startsWith("DATABASE_URL belum diisi")) {
    return err.message;
  }
  if (String(err?.message).includes("no pg_hba.conf entry")) {
    return "Server menolak koneksi tanpa TLS. Set PGSSL=require.";
  }
  return err?.message ?? String(err);
}

export async function query<T = any>(
  text: string,
  params: any[] = [],
  client?: PoolClient,
): Promise<T[]> {
  const runner = client ?? pool;
  const res = await runner.query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(
  text: string,
  params: any[] = [],
  client?: PoolClient,
): Promise<T | null> {
  const rows = await query<T>(text, params, client);
  return rows[0] ?? null;
}

/** Jalankan dalam transaksi. Rollback otomatis bila melempar. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type AuditInput = {
  entityType: string;
  entityId?: string | null;
  action: string;
  actor?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
};

/** Tulis satu entri audit. Tabelnya append-only di sisi basis data. */
export async function audit(
  input: AuditInput,
  client?: PoolClient,
): Promise<string> {
  const row = await one<{ id: string }>(
    `INSERT INTO audit_log (entity_type, entity_id, action, actor, before, after,
                            reason, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      input.entityType,
      input.entityId ?? null,
      input.action,
      input.actor ?? null,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.reason ?? null,
      input.ip ?? null,
    ],
    client,
  );
  return row!.id;
}

const DEFAULT_SETTINGS: Record<string, string> = {
  signature_threshold_claim: "75",
  signature_threshold_onboarding: "55",
  signature_max_attempts: "3",
  signing_link_ttl_minutes: "30",
  onboarding_link_ttl_hours: "24",
  tax_verification_validity_days: "30",
  backdate_tolerance_days: "7",
  return_escalation_count: "2",
  rounding: "round_half_up_rupiah",
};

export async function setting(key: string): Promise<string> {
  const row = await one<{ value: string }>(
    "SELECT value FROM settings WHERE key=$1",
    [key],
  );
  return row?.value ?? DEFAULT_SETTINGS[key] ?? "";
}

export async function settingInt(key: string): Promise<number> {
  return Number(await setting(key));
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

export async function ensureDefaultSettings(): Promise<void> {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await query(
      "INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [k, v],
    );
  }
}

/**
 * Jalankan sekali per Idempotency-Key.
 *
 * Bukan formalitas: agent yang menandatangani di jaringan seluler tidak stabil akan
 * menekan tombol dua kali. Tanpa ini, percobaan tanda tangan terhitung dua kali dan
 * kuota tiga percobaan habis lebih cepat dari semestinya.
 */
export async function idempotent<T>(
  key: string | null | undefined,
  endpoint: string,
  produce: () => Promise<T>,
): Promise<T> {
  if (!key) return produce();
  const existing = await one<{ response: T }>(
    "SELECT response FROM idempotency_keys WHERE key=$1",
    [key],
  );
  if (existing) return existing.response;
  const result = await produce();
  await query(
    `INSERT INTO idempotency_keys (key, endpoint, response) VALUES ($1,$2,$3)
     ON CONFLICT (key) DO NOTHING`,
    [key, endpoint, JSON.stringify(result)],
  );
  return result;
}

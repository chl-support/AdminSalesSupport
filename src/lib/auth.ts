/**
 * Autentikasi berbasis sesi: kata sandi, token, dan penahan tebakan beruntun.
 *
 * Menggantikan header `X-User`, yang membiarkan siapa pun mengaku sebagai siapa
 * pun hanya dengan mengganti satu baris pada permintaan. Selama header itu masih
 * diterima, halaman masuk tidak menambah keamanan apa pun — ia hanya menambah
 * satu layar di depan pintu yang tetap terbuka. Karena itu header tersebut
 * dihapus, bukan disimpan sebagai cadangan.
 *
 * Yang masih kurang untuk produksi (PRD 14): MFA bagi peran Finance, Management,
 * dan Admin Sistem; kebijakan usia dan kerumitan kata sandi; serta alur ganti
 * sandi mandiri. Semuanya di luar cakupan perubahan ini dan belum ada di sini.
 */

import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { one, query } from "./db";

const scryptAsync = promisify(scrypt) as (
  password: string, salt: Buffer, keylen: number,
) => Promise<Buffer>;

export const COOKIE = "klaim_session";

/** Umur sesi. Satu hari kerja — cukup panjang untuk tidak mengganggu, cukup
 *  pendek agar perangkat yang ditinggalkan tidak terbuka semalaman. */
const UMUR_SESI_JAM = 12;

/** Ambang penguncian: sekian gagal beruntun dalam jendela waktu di bawah. */
const MAKS_GAGAL = 5;
const JENDELA_MENIT = 15;

const KEYLEN = 64;

/**
 * scrypt dengan garam per pengguna.
 *
 * SHA-256 polos — yang dipakai seed sebelumnya — tidak layak untuk kata sandi:
 * ia dirancang cepat, sehingga justru mempercepat penebak. scrypt mahal secara
 * sengaja, dan garam per pengguna membuat dua orang bersandi sama tidak terlihat
 * sama di basis data.
 *
 * Formatnya menyebutkan algoritmanya sendiri supaya pemeriksaan di bawah dapat
 * membedakan hash lama dari yang baru tanpa kolom tambahan.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Hash lama: SHA-256 polos tanpa garam, 64 karakter heksadesimal. */
const hashLama = (p: string) => createHash("sha256").update(p).digest("hex");

function samaAman(a: Buffer, b: Buffer): boolean {
  // timingSafeEqual melempar bila panjang berbeda, jadi disamakan lebih dulu.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Mengembalikan apakah sandi cocok, dan apakah hash-nya perlu dimutakhirkan.
 *
 * Basis data yang sudah berjalan masih menyimpan hash lama. Menolaknya akan
 * mengunci semua orang di luar; membiarkannya selamanya berarti bentuk lemah itu
 * tidak pernah hilang. Karena itu hash lama tetap diterima sekali, lalu ditulis
 * ulang ke scrypt saat pemiliknya berhasil masuk.
 */
export async function verifyPassword(
  password: string, stored: string,
): Promise<{ ok: boolean; perluDimutakhirkan: boolean }> {
  if (stored.startsWith("scrypt$")) {
    const [, saltHex, keyHex] = stored.split("$");
    if (!saltHex || !keyHex) return { ok: false, perluDimutakhirkan: false };
    const key = await scryptAsync(password, Buffer.from(saltHex, "hex"), KEYLEN);
    return {
      ok: samaAman(key, Buffer.from(keyHex, "hex")),
      perluDimutakhirkan: false,
    };
  }
  const ok = samaAman(
    Buffer.from(hashLama(password), "utf8"), Buffer.from(stored, "utf8"));
  return { ok, perluDimutakhirkan: ok };
}

export type SessionUser = {
  id: string; username: string; full_name: string; role: string;
};

/** Token disimpan sebagai hash; nilai aslinya hanya dikembalikan sekali. */
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function startSession(
  userId: string, ip: string | null, userAgent: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + UMUR_SESI_JAM * 3600_000);
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5)`,
    [hashToken(token), userId, expiresAt.toISOString(), ip, userAgent?.slice(0, 300) ?? null]);
  return { token, expiresAt };
}

/**
 * Pengguna pemilik token, bila sesinya masih hidup dan akunnya masih aktif.
 *
 * Keaktifan diperiksa di sini, bukan hanya saat masuk: menonaktifkan akun harus
 * berlaku seketika, bukan menunggu sesi yang sedang berjalan kedaluwarsa sendiri.
 */
export async function userFromToken(token: string): Promise<SessionUser | null> {
  if (!token) return null;
  return await one<SessionUser>(
    `SELECT u.id, u.username, u.full_name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [hashToken(token)]);
}

export async function endSession(token: string): Promise<void> {
  if (!token) return;
  await query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
}

/** Buang sesi kedaluwarsa. Dipanggil saat masuk — tidak perlu penjadwal. */
export async function sapuSesiKedaluwarsa(): Promise<void> {
  await query("DELETE FROM sessions WHERE expires_at < now()");
}

export async function catatPercobaan(
  username: string, ip: string | null, succeeded: boolean,
): Promise<void> {
  await query(
    "INSERT INTO login_attempts (username, ip_address, succeeded) VALUES ($1,$2,$3)",
    [username, ip, succeeded]);
}

/**
 * Sisa percobaan sebelum akun terkunci sementara.
 *
 * Dihitung sejak keberhasilan terakhir: satu kali masuk yang benar mengembalikan
 * jatahnya, sehingga salah ketik sesekali selama berbulan-bulan tidak menumpuk
 * menjadi penguncian.
 */
export async function sisaPercobaan(username: string): Promise<number> {
  const row = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM login_attempts
      WHERE username = $1
        AND attempted_at > now() - ($2 || ' minutes')::interval
        AND NOT succeeded
        AND attempted_at > COALESCE(
              (SELECT MAX(attempted_at) FROM login_attempts
                WHERE username = $1 AND succeeded), '-infinity'::timestamptz)`,
    [username, String(JENDELA_MENIT)]);
  return Math.max(MAKS_GAGAL - (row?.n ?? 0), 0);
}

export const PENGUNCIAN = { maks: MAKS_GAGAL, menit: JENDELA_MENIT };

/** Atribut cookie sesi. */
export function cookieOptions(expires: Date) {
  return {
    httpOnly: true,          // tidak terbaca JavaScript, jadi XSS tidak memanennya
    sameSite: "lax" as const, // menahan pengiriman lintas situs
    secure: process.env.NODE_ENV === "production", // HTTPS saja di produksi
    path: "/",
    expires,
  };
}

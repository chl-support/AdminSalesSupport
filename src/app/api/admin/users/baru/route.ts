import { handler, requireRole } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { audit, one, query } from "@/lib/db";
import { catatSandi } from "@/lib/sandi-terlihat";
import { WorkflowError } from "@/lib/workflow";

/**
 * Buat akun baru — pekerjaan Admin IT.
 *
 * Sebelumnya akun hanya lahir dari seed, jadi orang yang masuk kemudian
 * harus menunggu seseorang membuka terminal. Peran yang boleh diberikan
 * dibaca dari basis data (enum user_role), bukan didaftar ulang di sini:
 * peran baru cukup ditambahkan sekali, di tempat yang sama dengan yang
 * menegakkan aturannya.
 *
 * Password awalnya disimpan sebagaimana Password yang diganti Admin IT —
 * hash untuk masuk, dan salinan terbaca supaya dapat diserahkan kembali
 * kepada pemiliknya yang lupa. Pembuatannya tercatat di jejak audit.
 */

const MIN_PANJANG = 8;
const POLA_USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Peran yang ada pada basis data, urut seperti enum-nya. */
export async function peranTersedia(): Promise<string[]> {
  const baris = await query<{ nama: string }>(
    "SELECT unnest(enum_range(NULL::user_role))::text AS nama");
  return baris.map((b) => b.nama);
}

export const GET = handler(async (req) => {
  await requireRole(req, "admin_system");
  return { peran: await peranTersedia() };
});

export const POST = handler(async (req) => {
  const admin = await requireRole(req, "admin_system");
  const p = await req.json().catch(() => ({} as any));

  const username = String(p.username ?? "").trim().toLowerCase();
  const nama = String(p.full_name ?? "").trim();
  const peran = String(p.role ?? "").trim();
  const sandi = String(p.password ?? "");
  const email = String(p.email ?? "").trim().toLowerCase() || null;

  if (!POLA_USERNAME.test(username)) {
    throw new WorkflowError(
      "Username: 3–32 karakter, huruf kecil, angka, titik, garis bawah, atau " +
      "strip, diawali huruf atau angka.", "validation", 422);
  }
  if (nama.length < 2) {
    throw new WorkflowError("Nama lengkap belum diisi.", "validation", 422);
  }
  if (!(await peranTersedia()).includes(peran)) {
    throw new WorkflowError("Peran belum dipilih.", "validation", 422);
  }
  if (sandi.length < MIN_PANJANG) {
    throw new WorkflowError(
      `Password minimal ${MIN_PANJANG} karakter.`, "validation", 422);
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new WorkflowError("Email tidak berbentuk alamat surel.", "validation", 422);
  }

  if (await one("SELECT id FROM users WHERE username = $1", [username])) {
    throw new WorkflowError(`Username '${username}' sudah dipakai.`, "conflict", 409);
  }
  if (email && await one("SELECT id FROM users WHERE lower(email) = $1", [email])) {
    throw new WorkflowError(`Email '${email}' sudah dipakai akun lain.`, "conflict", 409);
  }

  const baru = await one<{ id: string }>(
    `INSERT INTO users (username, full_name, role, password_hash, active, email)
     VALUES ($1,$2,$3::user_role,$4,true,$5) RETURNING id`,
    [username, nama, peran, await hashPassword(sandi), email]);
  // Salinan terbaca, sama seperti pada penggantian Password oleh Admin IT.
  await catatSandi(baru!.id, sandi);

  await audit({
    entityType: "user", entityId: baru!.id, action: "user_created",
    actor: admin.username,
    after: { username, full_name: nama, role: peran, email },
    reason: `Akun ${username} (${peran}) dibuat oleh ${admin.username}.`,
  });

  return { ok: true, username, full_name: nama, role: peran, email };
});

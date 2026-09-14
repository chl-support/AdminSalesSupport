/**
 * Ganti kata sandi satu pengguna, tanpa menyentuh data lain.
 *
 * Ada karena `db:seed` mengosongkan tabel sebelum mengisi. Pada basis data yang
 * sudah berisi klaim sungguhan, menjalankannya hanya demi memperbarui sandi
 * berarti menghapus pekerjaan orang — jadi jalur itu tidak boleh menjadi
 * satu-satunya cara memasang sandi baru.
 *
 * Pemakaian:
 *   DATABASE_URL='<url>' npx tsx scripts/set-password.ts <username> '<sandi baru>'
 *
 * Sandi tidak dibaca dari argumen bila tidak diberikan: argumen baris perintah
 * terlihat oleh proses lain dan tersimpan di riwayat shell. Tanpa argumen kedua,
 * skrip ini membangkitkan sandi acak dan mencetaknya sekali.
 */

import { randomBytes } from "node:crypto";

import { hashPassword } from "../src/lib/auth";
import { audit, one, pool, query } from "../src/lib/db";

async function main() {
  const [username, sandiArg] = process.argv.slice(2);
  if (!username) {
    console.error(
      "Pemakaian: DATABASE_URL='<url>' npx tsx scripts/set-password.ts " +
      "<username> ['<sandi baru>']");
    process.exit(2);
  }

  const user = await one<{ id: string; username: string; full_name: string; role: string }>(
    "SELECT id, username, full_name, role FROM users WHERE username = $1",
    [username.toLowerCase()]);
  if (!user) {
    console.error(`Pengguna '${username}' tidak ada.`);
    const daftar = await query<{ username: string; role: string }>(
      "SELECT username, role FROM users ORDER BY username");
    console.error("Yang ada: " +
      daftar.map((u) => `${u.username} (${u.role})`).join(", "));
    process.exit(1);
  }

  const sandi = sandiArg ?? randomBytes(9).toString("base64url");

  await query("UPDATE users SET password_hash = $1 WHERE id = $2",
              [await hashPassword(sandi), user.id]);

  // Seluruh sesi yang sedang berjalan diputus. Mengganti sandi tanpa memutusnya
  // tidak mengusir siapa pun — dan mengganti sandi justru paling sering
  // dilakukan karena ada yang perlu diusir.
  const sesi = await query<{ id: string }>(
    "DELETE FROM sessions WHERE user_id = $1 RETURNING id", [user.id]);

  await audit({
    entityType: "user",
    entityId: user.id,
    action: "password_reset",
    actor: "cli",
    reason: "Diganti lewat scripts/set-password.ts",
  });

  console.log(`Sandi ${user.username} (${user.full_name}, ${user.role}) diganti.`);
  if (!sandiArg) console.log(`  Sandi baru: ${sandi}`);
  console.log(`  ${sesi.length} sesi yang sedang berjalan diputus.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

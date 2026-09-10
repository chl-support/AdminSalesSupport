/** Terapkan skema. Idempoten: seluruh DDL memakai IF NOT EXISTS / OR REPLACE. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDefaultSettings, pool } from "../src/lib/db";

async function main() {
  const sql = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool.query(sql);
  await ensureDefaultSettings();
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
  console.log(`Migrasi selesai. ${rows[0].n} tabel.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });

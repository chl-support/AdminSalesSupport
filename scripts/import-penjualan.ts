/**
 * Impor Laporan Penjualan dari baris perintah.
 *
 * Pemakaian:
 *   DATABASE_URL='<url>' npm run db:import -- '<berkas laporan>'
 *   DATABASE_URL='<url>' npm run db:import -- '<berkas>' --dry-run
 *
 * Logikanya ada di src/lib/penjualan.ts, dipakai bersama menu unggah di konsol
 * (/admin). Skrip ini hanya membaca berkas dan mencetak hasilnya — supaya
 * keduanya tidak pernah berbeda perilaku.
 */

import { readFileSync } from "node:fs";

import { pool } from "../src/lib/db";
import { imporLaporan } from "../src/lib/penjualan";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error(
      "Pemakaian: DATABASE_URL='<url>' npm run db:import -- " +
      "'<berkas laporan>' [--dry-run]");
    process.exit(2);
  }

  const hasil = await imporLaporan(readFileSync(path, "utf8"),
                                   { dryRun, namaBerkas: path });

  console.log(`Berkas  : ${path}`);
  for (const s of hasil.seksi) console.log(`  ${s.nama}: ${s.baris} baris`);

  if (dryRun) {
    console.log("\n--dry-run: tidak ada yang ditulis ke basis data.\n");
    for (const p of hasil.pratinjau) {
      console.log(`  ${p.unit.padEnd(12)} ${String(p.tanggal).padEnd(11)} ` +
                  `${p.status.padEnd(9)} ` +
                  `${p.nilai.toLocaleString("id-ID").padStart(16)}  ` +
                  `${p.tindakan.padEnd(11)} ${p.sales}`);
    }
  }

  console.log(`\n${hasil.baru} penjualan baru, ${hasil.diperbarui} diperbarui, ` +
              `${hasil.dilewati} dilewati.`);
  console.log(`${hasil.marketing} marketing dikenali.`);
  if (!dryRun) for (const c of hasil.catatan) console.log(`\n${c}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

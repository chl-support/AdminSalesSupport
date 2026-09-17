/**
 * Daftar project yang dilayani pemasangan ini.
 *
 * Daftarnya tinggal di sini, bukan di dalam db/schema.sql, karena penambahan
 * project ternyata tidak sampai ke layar: barisnya hanya masuk ketika migrasi
 * dijalankan ulang, sementara endpoint penyiapan mematikan dirinya sendiri
 * setelah pemasangan pertama. Project keenam sudah tertulis di dalam kode,
 * sudah ter-deploy, dan tetap tidak muncul di pemilih project — karena basis
 * datanya tidak pernah diminta membacanya lagi.
 *
 * Karena itu daftar ini diterapkan dari sisi aplikasi, bukan dari migrasi:
 * satu deploy sudah cukup untuk memunculkan project baru.
 *
 * Yang diselaraskan hanya nama, nama PT, dan urutan. Project yang pernah ada
 * lalu hilang dari daftar tidak dihapus — datanya masih menggantung padanya —
 * melainkan tinggal dimatikan lewat kolom `active`.
 */

import { query } from "./db";

export type ProjectBawaan = {
  slug: string; name: string; company_name: string; urutan: number;
};

export const PROJECT_BAWAAN: ProjectBawaan[] = [
  { slug: "banara-serpong", name: "Banara Serpong",
    company_name: "PT. Serpong Bangun Cipta", urutan: 1 },
  { slug: "marchand-hype-station", name: "Marchand Hype Station",
    company_name: "PT. Serpong Bangun Cipta", urutan: 2 },
  { slug: "mazenta-residence", name: "Mazenta Residence",
    company_name: "PT. Serpong Bangun Cipta", urutan: 3 },
  { slug: "naraya-serpong", name: "Naraya Serpong",
    company_name: "PT. Serpong Bangun Cipta", urutan: 4 },
  { slug: "bio-district", name: "BIO District",
    company_name: "PT. Serpong Bangun Lestari", urutan: 5 },
  { slug: "permai-indah", name: "Permai Indah",
    company_name: "PT. Bumi Mahardika Makmur", urutan: 6 },
];

/** Terapkan daftar di atas. Idempoten, aman dipanggil berulang kali. */
export async function ensureProjects(): Promise<void> {
  for (const p of PROJECT_BAWAAN) {
    await query(
      `INSERT INTO projects (slug, name, company_name, urutan)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, company_name = EXCLUDED.company_name,
             urutan = EXCLUDED.urutan`,
      [p.slug, p.name, p.company_name, p.urutan],
    );
  }
}

/**
 * Sekali per proses, bukan sekali per permintaan.
 *
 * Pemilih project dibuka sekali per sesi, jadi enam UPSERT di tiap permintaan
 * tidak akan terasa — tetapi juga tidak ada gunanya. Kegagalannya sengaja
 * ditelan: bila basis data belum termigrasi, daftar project bukan galat yang
 * pertama-tama perlu dilihat orang.
 */
let sekali: Promise<void> | null = null;
export function ensureProjectsSekali(): Promise<void> {
  sekali ??= ensureProjects().catch(() => { sekali = null; });
  return sekali;
}

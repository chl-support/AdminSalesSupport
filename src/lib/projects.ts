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

import { query, tx } from "./db";

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
  { slug: "the-sanctuary-collection", name: "The Sanctuary Collection",
    company_name: "PT. Bhakti Bangun Harmoni", urutan: 7 },
];

/**
 * Project yang dibuang dari pemilih project. Barisnya tidak dihapus (data
 * yang sempat diisi tetap ada), hanya dimatikan lewat kolom `active`.
 */
export const PROJECT_DIBUANG: string[] = [];

/**
 * Project yang dihapus permanen atas permintaan, beserta SEMUA datanya:
 * setiap baris yang merujuk project itu (dan baris yang merujuk baris itu,
 * dan seterusnya) dihapus, dibaca dari katalog basis data. Sesi yang sedang
 * memilihnya hanya dilepas. Gambar catatan yang dipakai Lampiran T&C (milik
 * semua project) dipindah ke Naraya Serpong supaya project lain tetap utuh.
 * Bila gagal, semuanya dibatalkan dan project hanya dimatikan.
 */
export const PROJECT_DIHAPUS: string[] = [
  "scotts-vale", // Scotts Vale (The Sanctuary Collection), 26 Okt 2026
];

type Klien = Parameters<Parameters<typeof tx>[0]>[0];
const nama = (x: string) => `"${x.replace(/"/g, '""')}"`;

/** Hapus baris `tabel` yang memenuhi `kondisi`, beserta baris yang merujuknya. */
async function hapusBerantai(c: Klien, tabel: string, kondisi: string, nilai: unknown[], dalam = 0): Promise<void> {
  if (dalam > 8) throw new Error(`rujukan terlalu dalam di ${tabel}`);
  const anak = (await c.query<{ tabel: string; kolom: string; induk: string }>(
    `SELECT cl.relname AS tabel, a.attname AS kolom, pa.attname AS induk
       FROM pg_constraint k
       JOIN pg_class cl ON cl.oid = k.conrelid
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
       JOIN pg_attribute pa ON pa.attrelid = k.confrelid AND pa.attnum = k.confkey[1]
      WHERE k.contype = 'f' AND k.confrelid = $1::regclass`, [tabel])).rows;
  for (const r of anak) {
    if (r.tabel === tabel) continue;
    const sub = `${nama(r.kolom)} IN (SELECT ${nama(r.induk)} FROM ${nama(tabel)} WHERE ${kondisi})`;
    if (r.tabel === "sessions") {
      await c.query(`UPDATE sessions SET ${nama(r.kolom)} = NULL WHERE ${sub}`, nilai);
    } else {
      await hapusBerantai(c, r.tabel, sub, nilai, dalam + 1);
    }
  }
  await c.query(`DELETE FROM ${nama(tabel)} WHERE ${kondisi}`, nilai);
}

async function hapusPermanen(slug: string): Promise<void> {
  try {
    await tx(async (c) => {
      const p = (await c.query<{ id: string }>("SELECT id FROM projects WHERE slug=$1", [slug])).rows[0];
      if (!p) return;
      const ada = async (t: string) => !!(await c.query("SELECT to_regclass($1) AS r", [t])).rows[0]?.r;
      if (await ada("tnc_lampiran") && await ada("pricelist_susun_gambar")) {
        await c.query(
          `UPDATE pricelist_susun_gambar SET project_id = (SELECT id FROM projects WHERE slug = 'naraya-serpong')
            WHERE project_id = $1 AND id IN (SELECT gambar_id FROM tnc_lampiran)`, [p.id]);
      }
      await hapusBerantai(c, "projects", "id = $1", [p.id]);
    });
  } catch (e) {
    console.error(`Hapus permanen project ${slug} gagal, project dimatikan saja:`, e);
    await query("UPDATE projects SET active = false WHERE slug = $1", [slug]);
  }
}

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
  if (PROJECT_DIBUANG.length) {
    await query("UPDATE projects SET active = false WHERE slug = ANY($1) AND active", [PROJECT_DIBUANG]);
  }
  for (const slug of PROJECT_DIHAPUS) await hapusPermanen(slug);
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

/**
 * Nama panjang sebuah kode kluster, mis. "NS" → "Naraya Serpong".
 *
 * Kolom `units.cluster_code` berisi kode yang dipakai orang dalam — "NS",
 * "BIO" — dan kode itulah yang selama ini tercetak apa adanya pada kepala
 * rekap Overriding. Yang membacanya bukan orang dalam saja: rekapnya
 * ditandatangani sampai tingkat direksi, dan "Cluster NS" tidak memberi tahu
 * mereka kluster mana yang dimaksud.
 *
 * Pemetaannya diturunkan dari daftar project di atas, bukan ditulis satu per
 * satu, supaya kluster yang baru tidak perlu menunggu deploy untuk terbaca:
 * kodenya dicocokkan dengan huruf awal tiap kata pada nama project ("NS" =
 * Naraya Serpong) atau dengan kata pertamanya ("BIO" = BIO District).
 *
 * Yang tidak cocok dengan keduanya dikembalikan apa adanya. Kluster memang
 * tidak selalu sama dengan project — satu project dapat berisi beberapa
 * kluster — dan menebak nama untuk kode yang tidak dikenal lebih buruk
 * daripada menampilkan kodenya.
 */
export function namaKluster(kode: string | null | undefined): string | null {
  const k = (kode ?? "").trim();
  if (!k) return null;
  const cocok = PROJECT_BAWAAN.find((p) => {
    const kata = p.name.split(/\s+/).filter(Boolean);
    const singkatan = kata.map((w) => w[0]).join("");
    return singkatan.toUpperCase() === k.toUpperCase()
        || kata[0].toUpperCase() === k.toUpperCase();
  });
  return cocok ? cocok.name : k;
}

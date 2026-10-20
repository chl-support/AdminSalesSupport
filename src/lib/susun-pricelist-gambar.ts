/**
 * Gambar pada Catatan Unit Data (mis. screenshot persetujuan harga).
 *
 * Isi gambarnya disimpan di tabel sendiri, terpisah dari draf, supaya draf
 * JSON tetap ringan; draf hanya memuat rujukannya ({ id, nama }) di
 * `catatanGambar`. Gambar diunggah begitu dipilih atau ditempel, lalu ikut
 * "tersimpan" bersama draf saat Simpan.
 */

import { one, query } from "./db";

let sekali: Promise<void> | null = null;
function ensureTabel(): Promise<void> {
  sekali ??= query(`
    CREATE TABLE IF NOT EXISTS pricelist_susun_gambar (
      id          BIGSERIAL PRIMARY KEY,
      project_id  UUID NOT NULL REFERENCES projects(id),
      nama        TEXT NOT NULL,
      tipe        TEXT NOT NULL,
      isi         BYTEA NOT NULL,
      dibuat_oleh TEXT NOT NULL,
      dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).then(() => undefined).catch((e) => { sekali = null; throw e; });
  return sekali;
}

/** Jenis gambar yang diterima. */
export const TIPE_GAMBAR = ["image/png", "image/jpeg", "image/gif", "image/webp"];
/** Batas ukuran satu gambar (di bawah batas badan permintaan Vercel 4,5 MB). */
export const BATAS_GAMBAR = 4 * 1024 * 1024;
/** Paling banyak sekian gambar per catatan. */
export const MAKS_GAMBAR = 10;

export async function simpanGambar(
  projectId: string, nama: string, tipe: string, isi: Buffer, oleh: string,
): Promise<{ id: string; nama: string }> {
  if (!TIPE_GAMBAR.includes(tipe)) throw new Error("Berkas harus gambar PNG, JPG, GIF, atau WEBP.");
  if (isi.length > BATAS_GAMBAR) throw new Error("Gambar lebih dari 4 MB.");
  await ensureTabel();
  const bersih = (nama || "gambar").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
  const row = await one<{ id: string }>(
    `INSERT INTO pricelist_susun_gambar (project_id, nama, tipe, isi, dibuat_oleh)
     VALUES ($1,$2,$3,$4,$5) RETURNING id::text`,
    [projectId, bersih, tipe, isi, oleh]);
  return { id: row!.id, nama: bersih };
}

export async function bacaGambar(
  projectId: string, id: string,
): Promise<{ nama: string; tipe: string; isi: Buffer } | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  await ensureTabel();
  return one<{ nama: string; tipe: string; isi: Buffer }>(
    "SELECT nama, tipe, isi FROM pricelist_susun_gambar WHERE id=$1 AND project_id=$2",
    [id, projectId]);
}

// ── Lampiran T&C (semua project) ───────────────────────────────────────────
//
// Gambar yang dicetak di halaman terakhir Terms & Conditions, mis. tabel
// "Data konsumen yang harus dilengkapi". Isinya sama untuk semua project,
// jadi daftarnya satu untuk seluruh aplikasi: diunggah sekali dari project
// mana pun, tampil di cetakan T&C setiap project.

let sekaliLampiran: Promise<void> | null = null;
function ensureLampiran(): Promise<void> {
  sekaliLampiran ??= ensureTabel().then(() => query(`
    CREATE TABLE IF NOT EXISTS tnc_lampiran (
      gambar_id BIGINT PRIMARY KEY REFERENCES pricelist_susun_gambar(id),
      urutan    INT NOT NULL
    )`)).then(() => undefined).catch((e) => { sekaliLampiran = null; throw e; });
  return sekaliLampiran;
}

export async function daftarLampiranTnc(): Promise<{ id: string; nama: string }[]> {
  await ensureLampiran();
  return query<{ id: string; nama: string }>(
    `SELECT g.id::text, g.nama FROM tnc_lampiran l
       JOIN pricelist_susun_gambar g ON g.id = l.gambar_id ORDER BY l.urutan`);
}

/** Ganti seluruh daftar lampiran; id harus gambar yang sudah diunggah. */
export async function simpanLampiranTnc(ids: string[]): Promise<{ id: string; nama: string }[]> {
  await ensureLampiran();
  const bersih = [...new Set(ids.filter((x) => /^\d{1,18}$/.test(x)))].slice(0, MAKS_GAMBAR);
  await query("DELETE FROM tnc_lampiran");
  for (const [i, id] of bersih.entries()) {
    await query(
      `INSERT INTO tnc_lampiran (gambar_id, urutan)
       SELECT id, $2 FROM pricelist_susun_gambar WHERE id=$1`, [id, i]);
  }
  return daftarLampiranTnc();
}

/** Isi gambar lampiran — boleh dibaca dari project mana pun. */
export async function bacaLampiranTnc(
  id: string,
): Promise<{ nama: string; tipe: string; isi: Buffer } | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  await ensureLampiran();
  return one<{ nama: string; tipe: string; isi: Buffer }>(
    `SELECT g.nama, g.tipe, g.isi FROM tnc_lampiran l
       JOIN pricelist_susun_gambar g ON g.id = l.gambar_id WHERE l.gambar_id=$1`, [id]);
}

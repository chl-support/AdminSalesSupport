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

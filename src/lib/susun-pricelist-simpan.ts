/**
 * Penyimpanan penyusunan pricelist lima langkah: satu draf per project.
 *
 * Drafnya disimpan utuh sebagai satu baris JSON, sama alasannya dengan
 * pricelist (src/lib/pricelist.ts): isinya selalu dibaca dan dihitung
 * seluruhnya sekaligus. Draf bukan pricelist yang berlaku — ia baru menjadi
 * pricelist (dan dipakai layar Simulasi) sesudah diberlakukan, yaitu dengan
 * menyusun berkas Excel-nya lalu menyimpannya lewat jalur unggahan biasa.
 */

import { z } from "zod";

import { audit, one, query } from "./db";
import { bacaPricelist, simpanPricelist } from "./pricelist";
import { hitungSemua, type SusunPricelist } from "./susun-pricelist";
import { SUSUN_NARAYA } from "./susun-pricelist-naraya";
import { eksporSusun } from "./susun-pricelist-xlsx";

const angka = z.number().finite();
const teks = z.string().max(2000);

const SKEMA = z.object({
  irr: z.object({
    target: angka,
    porsiTahap: z.tuple([angka, angka, angka, angka]),
    namaTahap: z.tuple([teks, teks, teks, teks]).optional(),
    periode: z.number().int().min(1).max(240),
    skema: z.array(z.object({
      nama: teks.min(1), kelompok: teks, alokasi: angka, dp: angka.min(0).max(1),
      kali: z.number().int().min(1).max(240),
      bulan: z.tuple([angka, angka, angka, angka]),
      acuan: z.boolean().optional(),
      hargaKas: angka.optional(),
      hargaSesuai: angka.optional(),
    })).min(1).max(30),
  }),
  unit: z.array(z.object({
    kode: teks, alamat: teks, view: teks, no: teks, ukuran: teks, phase: teks,
    tipe: teks, tipeBangunan: teks, bentuk: teks, subTipe: teks,
    lt: angka, hargaTanah: angka, lb: angka, hargaBangunan: angka, kenaikan: angka,
    faktor: z.record(angka), faktorTambah: angka, special: angka, showUnit: angka,
  })).max(5000),
  dataPricelist: z.object({
    tambahan: angka,
    kolom: z.array(z.object({
      nama: teks.min(1), skema: teks.optional(), dari: teks.optional(), kali: angka.optional(),
    })).min(1).max(30),
  }),
  pricelist: z.object({
    judul: teks, tanggal: teks, catatan: teks, batasDtp: angka,
    kolom: z.array(z.object({ nama: teks.min(1), dari: teks.min(1), kali: angka }))
      .min(1).max(30),
  }),
  tnc: z.object({
    judul: teks,
    caraBayar: z.array(z.object({
      judul: teks,
      baris: z.array(z.object({ label: teks, nilai: teks, waktu: teks })).max(30),
      catatan: teks.optional(),
    })).max(30),
    catatan: z.array(z.string().max(5000)).max(50),
    pengantarRekening: teks,
    rekening: z.array(z.object({ bank: teks, noRek: teks, cabang: teks })).max(10),
  }),
});

/** Periksa bentuk draf kiriman layar; pesan galatnya untuk dibaca orang. */
export function periksaSusun(data: unknown): SusunPricelist {
  const h = SKEMA.safeParse(data);
  if (!h.success) {
    const g = h.error.issues[0];
    throw new Error(`Isian pricelist tidak valid (${g.path.join(".")}): ${g.message}`);
  }
  return h.data as SusunPricelist;
}

let sekali: Promise<void> | null = null;
function ensureTabel(): Promise<void> {
  sekali ??= query(`
    CREATE TABLE IF NOT EXISTS pricelist_susun (
      project_id  UUID PRIMARY KEY REFERENCES projects(id),
      data        JSONB NOT NULL,
      diubah_oleh TEXT,
      diubah_pada TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).then(() => undefined).catch((e) => { sekali = null; throw e; });
  return sekali;
}

export type DrafSusun = {
  data: SusunPricelist; diubah_oleh: string | null; diubah_pada: string;
};

export async function bacaSusun(projectId: string): Promise<DrafSusun | null> {
  await ensureTabel();
  return one<DrafSusun>(
    "SELECT data, diubah_oleh, diubah_pada FROM pricelist_susun WHERE project_id=$1",
    [projectId]);
}

const AKTOR_AWAL = "isian awal (Data_Pricelist.xlsx)";

/** Isian awal per project (slug), bila ada; lihat src/lib/susun-pricelist-naraya.ts. */
const ISIAN_AWAL: Record<string, SusunPricelist> = { "naraya-serpong": SUSUN_NARAYA };

/**
 * Draf project, atau — bila belum ada draf berisi unit dan project itu punya
 * isian awal — isian awal itu, langsung disimpan sebagai drafnya. Dengan
 * begitu layar Pricelist Naraya Serpong terbuka dengan data PL-nya tanpa
 * orang harus mengimpor berkas Excel lebih dulu.
 */
export async function bacaAtauIsiSusun(projectId: string): Promise<DrafSusun | null> {
  const draf = await bacaSusun(projectId);
  // Isian awal yang belum pernah disunting orang mengikuti isian awal
  // terbaru (mis. porsi tahap Greenfield 25/25/40/10). Draf yang sudah
  // disimpan seseorang tidak pernah ditimpa.
  if (draf?.data.unit.length && draf.diubah_oleh === AKTOR_AWAL) {
    const p = await one<{ slug: string }>("SELECT slug FROM projects WHERE id=$1", [projectId]);
    const awal = p && ISIAN_AWAL[p.slug];
    if (awal && JSON.stringify(awal) !== JSON.stringify(draf.data)) {
      return simpanSusun(projectId, structuredClone(awal), AKTOR_AWAL);
    }
  }
  if (draf?.data.unit.length) return draf;
  const p = await one<{ slug: string }>("SELECT slug FROM projects WHERE id=$1", [projectId]);
  const awal = p && ISIAN_AWAL[p.slug];
  if (!awal) return draf;
  return simpanSusun(projectId, structuredClone(awal), AKTOR_AWAL);
}

export async function simpanSusun(
  projectId: string, data: SusunPricelist, aktor: string,
): Promise<DrafSusun> {
  await ensureTabel();
  const row = await one<DrafSusun>(
    `INSERT INTO pricelist_susun (project_id, data, diubah_oleh, diubah_pada)
     VALUES ($1,$2,$3,now())
     ON CONFLICT (project_id) DO UPDATE
       SET data=EXCLUDED.data, diubah_oleh=EXCLUDED.diubah_oleh, diubah_pada=now()
     RETURNING data, diubah_oleh, diubah_pada`,
    [projectId, JSON.stringify(data), aktor]);
  await audit({
    entityType: "pricelist_susun", entityId: projectId, action: "pricelist_draft_saved",
    actor: aktor, after: { unit: data.unit.length, skema: data.irr.skema.length },
  });
  return row!;
}

/** Nama berkas Excel hasil susunan, mis. "Pricelist 21 Juli 2026.xlsx". */
export const namaBerkasSusun = (s: SusunPricelist) =>
  `${[s.pricelist.judul.trim() || "Pricelist", s.pricelist.tanggal.trim()]
    .filter(Boolean).join(" ").replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`;

/**
 * Berlakukan draf: susun berkas Excel-nya, baca kembali lembar Pricelist-nya
 * dengan pemeriksa unggahan biasa, lalu simpan sebagai pricelist yang
 * berlaku. Lewat jalur yang sama dengan unggahan, pricelist hasil susunan
 * diperiksa dengan aturan yang sama dan berkasnya dapat diunduh kembali.
 */
export async function berlakukanSusun(
  projectId: string, nama: string, aktor: string,
): Promise<{ id: string; nama: string }> {
  const draf = await bacaSusun(projectId);
  if (!draf) throw new Error("Belum ada isian pricelist untuk project ini.");
  const galat = hitungSemua(draf.data).galat;
  if (galat.length) throw new Error(`Pricelist belum dapat diberlakukan: ${galat[0]}`);
  const isi = await eksporSusun(draf.data);
  const hasil = await bacaPricelist(
    isi.buffer.slice(isi.byteOffset, isi.byteOffset + isi.byteLength) as ArrayBuffer,
    "Pricelist");
  if (hasil.galat.length) {
    throw new Error(`Pricelist belum dapat diberlakukan: ${hasil.galat[0]}`);
  }
  const namaBerkas = namaBerkasSusun(draf.data);
  const judul = nama.trim() || namaBerkas.replace(/\.xlsx$/, "");
  const { id } = await simpanPricelist({
    projectId, nama: judul, namaBerkas, isi, hasil, aktor,
  });
  return { id, nama: judul };
}

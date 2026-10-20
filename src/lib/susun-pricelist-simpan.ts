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

import { audit, one, query, tx } from "./db";
import { bacaPricelist, simpanPricelist } from "./pricelist";
import { basisProject, hitungSemua, kunciTnc, type SusunPricelist } from "./susun-pricelist";
import { SUSUN_NARAYA } from "./susun-pricelist-naraya";
import { eksporSusun } from "./susun-pricelist-xlsx";
import { bedaSusun, catatRiwayat } from "./susun-pricelist-riwayat";

const angka = z.number().finite();
const teks = z.string().max(2000);

const SKEMA = z.object({
  ppn: angka.min(0).max(1).optional(),
  basisExclPpn: z.boolean().optional(),
  tncPatokan: z.string().max(40).optional(),
  bulatBase: z.number().int().min(0).max(9).optional(),
  bulatBiasa: z.boolean().optional(),
  catatanUnit: z.string().max(5000).optional(),
  catatanGambar: z.array(z.object({ id: z.string().regex(/^\d{1,18}$/), nama: teks }))
    .max(10).optional(),
  irr: z.object({
    target: angka,
    hargaKas: angka.optional(),
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
    tipe: teks, tipeBangunan: teks, view2: teks.optional(), bentuk: teks, subTipe: teks,
    lt: angka, hargaTanah: angka, lb: angka, hargaBangunan: angka, kenaikan: angka,
    faktor: z.record(angka), faktorTambah: angka, special: angka, showUnit: angka,
  })).max(5000),
  dataPricelist: z.object({
    tambahan: angka,
    kolom: z.array(z.object({
      nama: teks.min(1), skema: teks.optional(), dari: teks.optional(), kali: angka.optional(),
      naikPersen: angka.min(-1).max(10).optional(), naikRp: angka.optional(),
      naikTingkat: z.array(z.object({ persen: angka.min(-1).max(10), rp: angka })).max(20).optional(),
    })).min(1).max(30),
  }),
  pricelist: z.object({
    judul: teks, tanggal: teks, catatan: teks, batasDtp: angka,
    kolom: z.array(z.object({ nama: teks.min(1), dari: teks.min(1), kali: angka,
                              bulatAtas: z.boolean().optional() }))
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
  const draf = await one<DrafSusun & { slug: string }>(
    `SELECT s.data, s.diubah_oleh, s.diubah_pada, p.slug
       FROM pricelist_susun s JOIN projects p ON p.id = s.project_id
      WHERE s.project_id=$1`, [projectId]);
  if (!draf) return null;
  const { slug, ...isi } = draf;
  return { ...isi, data: basisProject(slug, isi.data) };
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
  // terbaru (mis. porsi tahap atau Adjusted Price Excel). Draf yang sudah
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
  // Isian awal yang diperbarui otomatis tidak dicatat di riwayat; simpanan
  // orang dicatat beserta daftar perubahannya.
  const lama = aktor === AKTOR_AWAL ? null : await bacaSusun(projectId);
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
  if (aktor !== AKTOR_AWAL) {
    const beda = bedaSusun(lama?.data ?? null, data);
    if (beda.length) await catatRiwayat(projectId, aktor, "Simpan", beda);
  }
  return row!;
}

/**
 * Terms & Conditions draf project lain, untuk disalin: format dan cara bayar
 * T&C sering sama antarproject. Tanpa `slug`: daftar project yang drafnya
 * punya blok T&C; dengan `slug`: T&C draf project itu.
 */
export async function tncProjectLain(projectId: string): Promise<
  { slug: string; nama: string; jumlah: number }[]> {
  await ensureTabel();
  return query<{ slug: string; nama: string; jumlah: number }>(
    `SELECT p.slug, p.name AS nama,
            jsonb_array_length(COALESCE(s.data->'tnc'->'caraBayar', '[]'::jsonb))::int AS jumlah
       FROM pricelist_susun s JOIN projects p ON p.id = s.project_id
      WHERE s.project_id <> $1
        AND jsonb_array_length(COALESCE(s.data->'tnc'->'caraBayar', '[]'::jsonb)) > 0
      ORDER BY p.name`, [projectId]);
}

export async function tncProject(slug: string): Promise<SusunPricelist["tnc"] | null> {
  await ensureTabel();
  const row = await one<{ tnc: SusunPricelist["tnc"] }>(
    `SELECT s.data->'tnc' AS tnc FROM pricelist_susun s JOIN projects p ON p.id = s.project_id
      WHERE p.slug = $1`, [slug]);
  return row?.tnc ?? null;
}

/** Project patokan T&C: format dan cara bayarnya dipakai semua project. */
const SLUG_PATOKAN_TNC = "naraya-serpong";
/** Versi penyamaan; dinaikkan bila suatu saat semua project perlu disamakan ulang. */
export const VERSI_PATOKAN_TNC = "naraya-1";
const AKTOR_PATOKAN = "sistem (T&C disamakan dengan Naraya Serpong)";

/** T&C patokan: draf Naraya Serpong yang tersimpan, atau isian awalnya. */
async function tncPatokan(): Promise<SusunPricelist["tnc"]> {
  return (await tncProject(SLUG_PATOKAN_TNC)) ?? SUSUN_NARAYA.tnc;
}

/**
 * Samakan T&C dengan patokan: judul dan catatan diambil dari patokan; blok
 * cara bayar hanya untuk cara bayar yang ada di Pricelist project ini (urut
 * kolom Pricelist) — blok patokan untuk cara bayar yang tidak ada di sini
 * diabaikan. Blok project untuk cara bayar yang tidak ada di patokan
 * dibiarkan (dibuat atau diubah manual). Rekening project tetap.
 */
export async function denganTncPatokan(data: SusunPricelist): Promise<SusunPricelist> {
  const p = await tncPatokan();
  const cocok = (blok: SusunPricelist["tnc"]["caraBayar"], nama: string[]) =>
    blok.find((c) => nama.some((n) => kunciTnc(n) && kunciTnc(c.judul) === kunciTnc(n)));
  const dipakai = new Set<unknown>();
  const caraBayar = data.pricelist.kolom.flatMap((k) => {
    // Nama kolomnya dulu (patokan, lalu blok project sendiri); nama kolom
    // sumbernya hanya bila tidak ada yang cocok — kolom turunan dari Cash
    // Keras bukan blok Cash Keras.
    const b = cocok(p.caraBayar, [k.nama]) ?? cocok(data.tnc.caraBayar, [k.nama])
      ?? cocok(p.caraBayar, [k.dari]) ?? cocok(data.tnc.caraBayar, [k.dari]);
    if (!b || dipakai.has(b)) return [];
    dipakai.add(b);
    return [structuredClone(b)];
  });
  // Blok project yang tidak tergantikan dibiarkan apa adanya (tidak dihapus).
  const sisa = data.tnc.caraBayar.filter((c) => !dipakai.has(c)
    && !caraBayar.some((x) => kunciTnc(x.judul) === kunciTnc(c.judul)));
  return { ...data, tncPatokan: VERSI_PATOKAN_TNC,
           tnc: { ...data.tnc, judul: p.judul, caraBayar: [...caraBayar, ...sisa],
                  catatan: [...p.catatan] } };
}

/**
 * Samakan T&C draf project dengan patokan (Naraya Serpong), sekali per
 * project: draf yang belum bertanda disamakan dan disimpan (tercatat di
 * riwayat); sesudahnya T&C hanya diubah manual. Naraya Serpong sendiri
 * tidak disentuh.
 */
export async function samakanTncPatokan(
  projectId: string, draf: DrafSusun | null,
): Promise<DrafSusun | null> {
  if (!draf || draf.data.tncPatokan === VERSI_PATOKAN_TNC) return draf;
  const p = await one<{ slug: string }>("SELECT slug FROM projects WHERE id=$1", [projectId]);
  if (!p || p.slug === SLUG_PATOKAN_TNC) return draf;
  return simpanSusun(projectId, await denganTncPatokan(draf.data), AKTOR_PATOKAN);
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
  /** false: simpan sebagai pricelist baru di riwayat tanpa memberlakukannya. */
  aktifkan = true,
): Promise<{ id: string; nama: string; aktif: boolean }> {
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
  // Nama yang diketik orang saat memberlakukan menjadi nama pricelist
  // sekaligus nama berkasnya; bila kosong, dari Judul + Tanggal langkah 4.
  const judul = nama.replace(/\s+/g, " ").trim() || namaBerkasSusun(draf.data).replace(/\.xlsx$/, "");
  const namaBerkas = `${judul.replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`;
  const { id } = await simpanPricelist({
    projectId, nama: judul, namaBerkas, isi, hasil, aktor, aktif: aktifkan,
  });
  await catatRiwayat(projectId, aktor, aktifkan ? "Berlakukan" : "Simpan sebagai",
    [aktifkan
      ? `Diberlakukan sebagai "${judul}" (file ${namaBerkas}, ${hasil.unit.length} unit)`
      : `Disimpan sebagai "${judul}" tanpa diberlakukan (file ${namaBerkas}, ${hasil.unit.length} unit)`]);
  return { id, nama: judul, aktif: aktifkan };
}

/**
 * Mulai dari awal: hapus draf kelima langkah, riwayat perubahannya, gambar
 * catatannya, dan pricelist tersimpan project ini. Pricelist yang sedang
 * berlaku ikut dihapus hanya bila diminta — tanpanya layar Simulasi / NPV
 * project ini tidak punya pricelist sampai ada yang diberlakukan lagi.
 * Gambar yang dipakai Lampiran T&C (semua project) tidak dihapus.
 */
export async function mulaiDariAwal(
  projectId: string, aktor: string, termasukBerlaku: boolean,
): Promise<{ pricelist: number }> {
  await ensureTabel();
  const ada = async (t: string) =>
    !!(await one<{ r: string | null }>("SELECT to_regclass($1)::text AS r", [t]))?.r;
  let pricelist = 0;
  await tx(async (c) => {
    await c.query("DELETE FROM pricelist_susun WHERE project_id=$1", [projectId]);
    if (await ada("pricelist_susun_riwayat")) {
      await c.query("DELETE FROM pricelist_susun_riwayat WHERE project_id=$1", [projectId]);
    }
    if (await ada("pricelists")) {
      const r = await c.query(
        `DELETE FROM pricelists WHERE project_id=$1 AND ($2 OR NOT aktif)`, [projectId, termasukBerlaku]);
      pricelist = r.rowCount ?? 0;
    }
    if (await ada("pricelist_susun_gambar")) {
      await c.query(
        (await ada("tnc_lampiran"))
          ? `DELETE FROM pricelist_susun_gambar WHERE project_id=$1
               AND id NOT IN (SELECT gambar_id FROM tnc_lampiran)`
          : "DELETE FROM pricelist_susun_gambar WHERE project_id=$1", [projectId]);
    }
    await audit({ entityType: "pricelist_susun", entityId: projectId, action: "pricelist_reset",
                  actor: aktor, after: { pricelist, termasukBerlaku } }, c);
  });
  return { pricelist };
}

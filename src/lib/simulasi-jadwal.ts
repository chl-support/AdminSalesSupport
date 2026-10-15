/**
 * Jadwal pembayaran suntingan yang disimpan dari layar Simulasi / NPV.
 *
 * Satu simulasi untuk satu konsumen sering melewati beberapa putaran tawar:
 * termin digeser, dipecah, atau disembunyikan dari lembar yang dicetak.
 * Tiap kali Simpan ditekan, satu versi baru ditambahkan — tidak pernah
 * menimpa yang lama — sehingga riwayatnya dapat dibaca dan versi mana pun
 * dapat dibuka kembali.
 *
 * Yang disimpan masukan simulasinya (unit, cara bayar, tanggal booking,
 * diskon, bunga KPR) beserta baris jadwalnya, bukan hasil hitungnya: PV, DTP,
 * dan tagihan dihitung ulang saat versinya dibuka, dengan pricelist yang
 * berlaku saat itu.
 */

import { audit, query, tx } from "./db";

export type BarisJadwal = {
  ket: string;
  /** YYYY-MM-DD. */
  tgl: string;
  nilai: number;
  sembunyi: boolean;
  tambahan: boolean;
};

export type VersiJadwal = {
  id: string;
  kode_unit: string;
  skema: string;
  /** Kolom pricelist asal harganya; null = harga cara bayar itu sendiri. */
  skema_harga: string | null;
  tanggal_booking: string;
  /** Penambahan harga dalam rupiah; 0 bila tidak ada. */
  tambahan: number;
  diskon: number;
  bunga: number;
  baris: BarisJadwal[];
  catatan: string | null;
  disimpan_oleh: string | null;
  disimpan_pada: string;
};

/**
 * Tabelnya dipasang dari sisi aplikasi, sekali per proses, seperti tabel
 * pricelist — migrasi tidak selalu dijalankan ulang di pemasangan yang
 * sudah berjalan.
 */
let sekali: Promise<void> | null = null;
export function ensureTabelJadwal(): Promise<void> {
  sekali ??= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS simulasi_jadwal (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id      UUID NOT NULL REFERENCES projects(id),
        kode_unit       TEXT NOT NULL,
        skema           TEXT NOT NULL,
        tanggal_booking DATE NOT NULL,
        diskon          NUMERIC NOT NULL DEFAULT 0,
        bunga           NUMERIC NOT NULL DEFAULT 0,
        baris           JSONB NOT NULL,
        catatan         TEXT,
        disimpan_oleh   TEXT,
        disimpan_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await query(`ALTER TABLE simulasi_jadwal ADD COLUMN IF NOT EXISTS skema_harga TEXT`);
    // Penambahan harga di luar pricelist; versi lama tidak punya kolom ini dan
    // terbaca sebagai nol, yang memang keadaannya waktu itu.
    await query(`ALTER TABLE simulasi_jadwal
                   ADD COLUMN IF NOT EXISTS tambahan NUMERIC NOT NULL DEFAULT 0`);
    await query(`CREATE INDEX IF NOT EXISTS simulasi_jadwal_unit
                   ON simulasi_jadwal (project_id, kode_unit, skema, disimpan_pada DESC)`);
  })().catch((e) => { sekali = null; throw e; });
  return sekali;
}

const TGL = /^\d{4}-\d{2}-\d{2}$/;

/** Periksa kiriman layar; kembalikan baris yang bersih atau lempar galat. */
export function periksaBaris(masuk: unknown): BarisJadwal[] {
  if (!Array.isArray(masuk) || masuk.length < 1 || masuk.length > 200) {
    throw new Error("Jadwal harus berisi 1 sampai 200 baris.");
  }
  return masuk.map((b: any, i) => {
    const nilai = Number(b?.nilai);
    const tgl = String(b?.tgl ?? "");
    if (!TGL.test(tgl)) throw new Error(`Baris ${i + 1}: tanggal tidak sah.`);
    if (!Number.isFinite(nilai)) throw new Error(`Baris ${i + 1}: nilai bukan angka.`);
    return {
      ket: String(b?.ket ?? "").slice(0, 120),
      tgl, nilai,
      sembunyi: Boolean(b?.sembunyi),
      tambahan: Boolean(b?.tambahan),
    };
  });
}

/** Riwayat versi untuk satu unit dan cara bayar, yang terbaru lebih dulu. */
export async function riwayatJadwal(
  projectId: string, kodeUnit: string, skema: string,
): Promise<VersiJadwal[]> {
  await ensureTabelJadwal();
  return query<VersiJadwal>(
    `SELECT id, kode_unit, skema, skema_harga, to_char(tanggal_booking, 'YYYY-MM-DD') AS tanggal_booking,
            tambahan::float8 AS tambahan,
            diskon::float8 AS diskon, bunga::float8 AS bunga, baris, catatan,
            disimpan_oleh, disimpan_pada
       FROM simulasi_jadwal
      WHERE project_id=$1 AND kode_unit=$2 AND skema=$3
      ORDER BY disimpan_pada DESC
      LIMIT 100`, [projectId, kodeUnit, skema]);
}

/** Tambahkan satu versi baru. Versi lama tidak pernah diubah. */
export async function simpanJadwal(input: {
  projectId: string; kodeUnit: string; skema: string; skemaHarga: string | null;
  tanggal: string; tambahan: number; diskon: number; bunga: number;
  baris: BarisJadwal[]; catatan: string | null;
  aktor: string;
}): Promise<{ id: string }> {
  if (!input.kodeUnit || !input.skema) throw new Error("Unit dan cara bayar wajib diisi.");
  if (!TGL.test(input.tanggal)) throw new Error("Tanggal booking tidak sah.");
  await ensureTabelJadwal();
  return tx(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO simulasi_jadwal (project_id, kode_unit, skema, tanggal_booking,
                                    diskon, bunga, baris, catatan, disimpan_oleh,
                                    skema_harga, tambahan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [input.projectId, input.kodeUnit, input.skema, input.tanggal,
       input.diskon, input.bunga, JSON.stringify(input.baris),
       input.catatan, input.aktor, input.skemaHarga, input.tambahan]);
    await audit({
      entityType: "simulasi_jadwal", entityId: rows[0].id,
      action: "simulasi_jadwal_saved", actor: input.aktor,
      after: { unit: input.kodeUnit, skema: input.skema, tanggal: input.tanggal,
               baris: input.baris.length, catatan: input.catatan },
    }, c);
    return { id: rows[0].id };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hapus versi tersimpan: satu versi (`id`), atau seluruh versi satu unit dan
 * cara bayar (`semua`). Hanya dalam project yang sedang dipilih. Isi yang
 * dihapus dicatat di jejak audit, supaya penghapusan tetap dapat ditelusuri
 * meskipun riwayatnya sendiri sudah tidak ada.
 */
export async function hapusJadwal(input: {
  projectId: string; aktor: string;
  id?: string; semua?: { kodeUnit: string; skema: string };
}): Promise<{ terhapus: number }> {
  await ensureTabelJadwal();
  if (input.id && !UUID.test(input.id)) throw new Error("Versi jadwal tidak ditemukan.");
  if (!input.id && !(input.semua?.kodeUnit && input.semua?.skema)) {
    throw new Error("Sebutkan versi yang dihapus, atau unit dan cara bayarnya.");
  }
  return tx(async (c) => {
    const { rows } = input.id
      ? await c.query(
          `DELETE FROM simulasi_jadwal WHERE id=$1 AND project_id=$2
           RETURNING id, kode_unit, skema, tanggal_booking, catatan, disimpan_oleh, disimpan_pada`,
          [input.id, input.projectId])
      : await c.query(
          `DELETE FROM simulasi_jadwal WHERE project_id=$1 AND kode_unit=$2 AND skema=$3
           RETURNING id, kode_unit, skema, tanggal_booking, catatan, disimpan_oleh, disimpan_pada`,
          [input.projectId, input.semua!.kodeUnit, input.semua!.skema]);
    if (input.id && !rows.length) throw new Error("Versi jadwal tidak ditemukan.");
    for (const r of rows) {
      await audit({
        entityType: "simulasi_jadwal", entityId: r.id,
        action: "simulasi_jadwal_deleted", actor: input.aktor, before: r,
      }, c);
    }
    return { terhapus: rows.length };
  });
}

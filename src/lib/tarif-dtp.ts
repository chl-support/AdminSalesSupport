/**
 * Tabel Tarif PPN DTP (PPN Ditanggung Pemerintah), disunting dari layar
 * Simulasi / NPV.
 *
 * Sebelumnya tertulis tetap di src/lib/simulasi.ts, sehingga periode baru dari
 * pemerintah baru berlaku setelah kodenya diubah dan di-deploy. Kini disimpan
 * di basis data dan berlaku untuk seluruh project: PPN DTP aturan nasional,
 * bukan aturan project.
 *
 * Disimpan utuh sebagai satu daftar dan diganti utuh pula: periode-periodenya
 * dibaca bersama (tidak boleh tumpang tindih), dan yang disunting orang
 * memang tabelnya, bukan satu baris lepas.
 */

import { audit, query, tx } from "./db";
import { TARIF_PPN_DTP, type TarifDtp } from "./simulasi";

let sekali: Promise<void> | null = null;
export function ensureTabelTarifDtp(): Promise<void> {
  sekali ??= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS tarif_ppn_dtp (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        urutan         INT NOT NULL,
        nama           TEXT NOT NULL,
        awal           DATE NOT NULL,
        akhir          DATE NOT NULL,
        tarif          NUMERIC NOT NULL,
        harga_jual_max NUMERIC NOT NULL,
        max_dtp        NUMERIC NOT NULL,
        peraturan      TEXT
      )`);
    // Isi awal dari daftar bawaan, hanya bila tabelnya belum pernah diisi.
    const [jumlah] = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM tarif_ppn_dtp");
    if (!jumlah?.n) {
      for (const [i, t] of TARIF_PPN_DTP.entries()) {
        await query(
          `INSERT INTO tarif_ppn_dtp (urutan, nama, awal, akhir, tarif,
                                      harga_jual_max, max_dtp, peraturan)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [i, t.nama, t.awal, t.akhir, t.tarif, Math.round(t.hargaJualMax),
           Math.round(t.maxDtp), t.peraturan ?? null]);
      }
    }
  })().catch((e) => { sekali = null; throw e; });
  return sekali;
}

export async function daftarTarifDtp(): Promise<TarifDtp[]> {
  await ensureTabelTarifDtp();
  return query<TarifDtp>(
    `SELECT nama, to_char(awal, 'YYYY-MM-DD') AS awal,
            to_char(akhir, 'YYYY-MM-DD') AS akhir, tarif::float8 AS tarif,
            harga_jual_max::float8 AS "hargaJualMax", max_dtp::float8 AS "maxDtp",
            peraturan
       FROM tarif_ppn_dtp ORDER BY awal, urutan`);
}

const TGL = /^\d{4}-\d{2}-\d{2}$/;

/** Periksa kiriman layar; kembalikan daftar yang bersih atau lempar galat. */
export function periksaTarifDtp(masuk: unknown): TarifDtp[] {
  if (!Array.isArray(masuk) || masuk.length > 50) {
    throw new Error("Daftar tarif tidak sah (paling banyak 50 baris).");
  }
  const daftar = masuk.map((x: any, i) => {
    const b = `Baris ${i + 1}`;
    const nama = String(x?.nama ?? "").trim().slice(0, 60);
    const awal = String(x?.awal ?? ""), akhir = String(x?.akhir ?? "");
    const tarif = Number(x?.tarif), hargaJualMax = Number(x?.hargaJualMax);
    const maxDtp = Number(x?.maxDtp);
    if (!nama) throw new Error(`${b}: nama periode wajib diisi.`);
    if (!TGL.test(awal) || !TGL.test(akhir)) throw new Error(`${b}: tanggal tidak sah.`);
    if (akhir < awal) throw new Error(`${b}: tanggal akhir sebelum tanggal awal.`);
    if (!(tarif >= 0 && tarif <= 1)) throw new Error(`${b}: tarif harus 0–100%.`);
    if (!(hargaJualMax > 0) || !(maxDtp > 0)) {
      throw new Error(`${b}: Harga Jual Max dan Max PPN DTP harus lebih dari nol.`);
    }
    return { nama, awal, akhir, tarif, hargaJualMax, maxDtp,
             peraturan: String(x?.peraturan ?? "").trim().slice(0, 200) || null };
  });
  // Satu tanggal hanya boleh jatuh pada satu periode: bila tumpang tindih,
  // tarif mana yang berlaku bergantung pada urutan baris, dan itu tidak
  // terlihat oleh siapa pun yang membaca tabelnya.
  const urut = [...daftar].sort((a, b) => a.awal.localeCompare(b.awal));
  for (let i = 1; i < urut.length; i++) {
    if (urut[i].awal <= urut[i - 1].akhir) {
      throw new Error(`Periode ${urut[i - 1].nama} dan ${urut[i].nama} tumpang tindih.`);
    }
  }
  return daftar;
}

/** Ganti seluruh tabel dengan daftar baru. */
export async function simpanTarifDtp(daftar: TarifDtp[], aktor: string): Promise<void> {
  await ensureTabelTarifDtp();
  const sebelum = await daftarTarifDtp();
  await tx(async (c) => {
    await c.query("DELETE FROM tarif_ppn_dtp");
    for (const [i, t] of daftar.entries()) {
      await c.query(
        `INSERT INTO tarif_ppn_dtp (urutan, nama, awal, akhir, tarif,
                                    harga_jual_max, max_dtp, peraturan)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [i, t.nama, t.awal, t.akhir, t.tarif, t.hargaJualMax, t.maxDtp,
         t.peraturan ?? null]);
    }
    await audit({ entityType: "tarif_ppn_dtp", action: "tarif_ppn_dtp_updated",
                  actor: aktor, before: sebelum, after: daftar }, c);
  });
}

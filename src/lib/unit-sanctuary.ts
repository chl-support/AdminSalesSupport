/**
 * Lembar Unit Data The Sanctuary Collection: kolomnya berbeda dari enam
 * project lain, jadi langkah 2 project ini memakai susunan kolom berkas
 * Excel-nya (Unit_Data_TSC.xlsx), urut kolom A sampai BE.
 *
 * Rumusnya (kolom AY–BC Excel) dihitung oleh hitungUnit seperti project
 * lain, dengan aturan RUMUS_TSC (harga per m² sudah Termasuk PPN, tanpa
 * pembulatan):
 *   Harga Dasar (Batas Bawah)        = Luas Tanah × Harga Tanah + Luas Bangunan × Harga Bangunan
 *   Harga Setelah Penyesuaian (B. B.) = Harga Dasar × (1 + jumlah faktor %) × (1 + Harga Khusus %)
 *                                      + Pendingin Ruangan (AC) + Harga Khusus (Rp)
 *   Harga Setelah Kenaikan           = Harga Setelah Penyesuaian × (1 + Persentase Kenaikan Harga)
 *
 * Kolom keterangan yang tidak dipakai rumus (Kavling, tanda posisi,
 * Status, Harga Lama, …) disimpan di `UnitData.atribut`.
 */

import { RUMUS_TSC, unitKosong, type KunciFaktor, type UnitData } from "./susun-pricelist";

export const unitTsc = (slug: string | null | undefined) => !!slug && RUMUS_TSC.has(slug);

export type JenisKolomTsc = "teks" | "angka" | "persen" | "rp";

/**
 * Satu kolom isian. `kunci`: nama isian UnitData, "atribut.x" atau
 * "faktor.x". `excel`: judul kolom di berkas, `ke`: kemunculan ke berapa
 * judul itu (berkasnya memakai beberapa judul dua kali, mis. Fasad Belakang
 * sebagai tanda dan sebagai persen faktor).
 */
export type KolomTsc = {
  kunci: string; excel: string; ke?: number; jenis: JenisKolomTsc; lebar: number;
  /** Judul di layar bila berbeda dari judul Excel. */
  judul?: string;
};

const k = (kunci: string, excel: string, jenis: JenisKolomTsc, lebar: number,
           lain: Partial<KolomTsc> = {}): KolomTsc => ({ kunci, excel, jenis, lebar, ...lain });

/** Kolom A–G. */
export const KOLOM_TSC_AWAL: KolomTsc[] = [
  k("kode", "Kode", "teks", 120),
  k("atribut.kavling", "Kavling", "teks", 110),
  k("phase", "Tahap", "teks", 50),
  k("alamat", "Jalan", "teks", 130),
  k("no", "No", "teks", 45),
  k("tipeBangunan", "Tipe", "teks", 45),
  k("atribut.unitContoh", "Unit Contoh", "teks", 80),
];

/** Kolom I–AA (sesudah Kategory). */
export const KOLOM_TSC_TENGAH: KolomTsc[] = [
  k("subTipe", "Subtipe", "teks", 90),
  k("atribut.posisi", "Unit Tengah / Ujung", "teks", 80),
  k("atribut.nFasadSamping", "Fasad Samping", "angka", 50),
  k("atribut.nFasadBelakang", "Fasad Belakang", "angka", 50),
  k("atribut.nTamanBelakang", "Taman Belakang", "angka", 50),
  k("atribut.nTepiSungai", "Tepi Sungai", "angka", 50),
  k("atribut.nGarduListrik", "Gardu Listrik", "angka", 50),
  k("atribut.nPenangkalPetir", "Penangkal Petir", "angka", 50),
  k("atribut.nWargaSekitar", "Warga Sekitar", "angka", 50),
  k("atribut.nPertigaan", "Posisi Menghadap Pertigaan Jalan", "angka", 50),
  k("atribut.nUnitUjung", "Unit Ujung", "angka", 50),
  k("atribut.nFasilitas", "Fasilitas", "angka", 50),
  k("atribut.nGedungFasilitas", "Gedung Fasilitas", "angka", 50),
  k("atribut.nTanahTakBeraturan", "Bentuk Tanah Tidak Beraturan", "angka", 50),
  k("view", "Arah Hadap", "teks", 70),
  k("lt", "Luas Tanah", "angka", 65),
  k("atribut.ltStandar", "Luas Tanah Standar", "angka", 65),
  k("atribut.ltTambahan", "Luas Tanah Tambahan", "angka", 65),
  k("lb", "Luas Bangunan", "angka", 65),
];

/** Harga per m² (AB–AD), Termasuk PPN. */
export const KOLOM_TSC_TANAH = k("hargaTanah", "Harga Tanah", "rp", 100);
export const KOLOM_TSC_TANAH_TAMBAHAN = k("atribut.hargaTanahTambahan", "Harga Tanah Tambahan", "rp", 100);
export const KOLOM_TSC_BANGUNAN = k("hargaBangunan", "Harga Bangunan", "rp", 100);

/** Faktor % (AE–AQ), urut seperti berkas. */
export const FAKTOR_TSC: [KunciFaktor, string, string, number?][] = [
  // Kolom AE: judul "Harga Bangunan" kedua (yang pertama, AD, harga per m²);
  // isinya persen faktor yang ikut dijumlah seperti faktor lain.
  ["hargaBangunanPersen", "Harga Bangunan", "Harga Bangunan", 2],
  ["fasadBelakang", "Fasad Belakang", "Fasad Belakang", 2],
  ["backGarden", "Taman Belakang", "Taman Belakang", 2],
  ["tepiSungai", "Tepi Sungai", "Tepi Sungai", 2],
  ["garduListrik", "Gardu Listrik", "Gardu Listrik", 2],
  ["penangkalPetir", "Penangkal Petir", "Penangkal Petir", 2],
  ["wargaSekitar", "Warga Sekitar", "Warga Sekitar", 2],
  ["pertigaan", "Posisi Menghadap Pertigaan Jalan", "Posisi Menghadap Pertigaan Jalan", 2],
  ["unitUjung", "Unit Ujung", "Unit Ujung", 2],
  ["fasilitas", "Fasilitas", "Fasilitas", 2],
  ["areaTerbuka", "Menghadap Area Terbuka", "Menghadap Area Terbuka"],
  ["tanahTakBeraturan", "Bentuk Tanah Tidak Beraturan", "Bentuk Tanah Tidak Beraturan", 2],
  ["luckyNumber", "Nomor Hoki", "Nomor Hoki"],
];
export const KOLOM_TSC_FAKTOR: KolomTsc[] = FAKTOR_TSC.map(([kf, excel, judul, ke]) =>
  k(`faktor.${kf}`, excel, "persen", 60, { judul: `${judul} (%)`, ...(ke && { ke }) }));

/** Kolom AR–AX. */
export const KOLOM_TSC_AKHIR: KolomTsc[] = [
  k("specialPersen", "Harga Khusus (%)", "persen", 60),
  k("faktorTambahRp", "Pendingin Ruangan (AC)", "rp", 100),
  k("special", "Harga Khusus (Rp)", "rp", 100),
  k("atribut.ltEp", "Luas Tanah", "angka", 65, { ke: 2, judul: "Luas Tanah (eProperty)" }),
  k("atribut.lbEp", "Luas Bangunan", "angka", 65, { ke: 2, judul: "Luas Bangunan (eProperty)" }),
  k("atribut.kenaikanHargaTanah", "Kenaikan Harga Tanah", "rp", 100),
  k("atribut.status", "Status", "teks", 80),
];

/** BB dan BD. */
export const KOLOM_TSC_KENAIKAN = k("kenaikanFaktor", "Persentase Kenaikan Harga", "persen", 60);
export const KOLOM_TSC_HARGA_LAMA = k("atribut.hargaLama", "Harga Lama (eProperty)", "rp", 110);

/** Semua kolom isian, urut seperti berkas (untuk impor dan template). */
export const KOLOM_TSC: KolomTsc[] = [
  ...KOLOM_TSC_AWAL, ...KOLOM_TSC_TENGAH, KOLOM_TSC_TANAH, KOLOM_TSC_TANAH_TAMBAHAN, KOLOM_TSC_BANGUNAN,
  ...KOLOM_TSC_FAKTOR, ...KOLOM_TSC_AKHIR, KOLOM_TSC_KENAIKAN, KOLOM_TSC_HARGA_LAMA,
];

export function ambilTsc(u: UnitData, kunci: string): string | number {
  const [a, b] = kunci.split(".");
  const v = a === "atribut" ? u.atribut?.[b] : a === "faktor" ? u.faktor[b as KunciFaktor]
    : (u as Record<string, unknown>)[a];
  return typeof v === "number" || typeof v === "string" ? v : "";
}

/** Unit dengan satu isian diganti; kosong / 0 menghapus isian pilihan. */
export function isiTsc(u: UnitData, kunci: string, v: string | number): UnitData {
  const [a, b] = kunci.split(".");
  const kosong = v === "" || v === 0;
  if (a === "atribut") {
    const atribut = { ...u.atribut };
    if (kosong) delete atribut[b]; else atribut[b] = v;
    return { ...u, atribut: Object.keys(atribut).length ? atribut : undefined };
  }
  if (a === "faktor") {
    const faktor = { ...u.faktor };
    if (kosong) delete faktor[b as KunciFaktor]; else faktor[b as KunciFaktor] = Number(v);
    return { ...u, faktor };
  }
  const opsional = ["specialPersen", "faktorTambahRp", "kenaikanFaktor"].includes(a);
  return { ...u, [a]: opsional && kosong ? undefined : v };
}

/** Unit kosong project ini: tanpa (+) Factor bawaan 2% project lain. */
export const unitKosongTsc = (): UnitData => ({ ...unitKosong(), faktorTambah: 0 });

/**
 * Kategory (kolom H Excel): "Riverside " bila di tepi sungai, Subtipe, lalu
 * Rear Façade & Garden / Rear Façade / Rear Garden (bukan untuk Bungalow).
 */
export function kategoriTsc(u: UnitData): string {
  const a = u.atribut ?? {};
  const fasad = a.nFasadBelakang === 1, taman = a.nTamanBelakang === 1;
  const belakang = u.subTipe === "Bungalow" ? ""
    : fasad && taman ? "Rear Façade & Garden" : fasad ? "Rear Façade" : taman ? "Rear Garden" : "";
  return `${a.nTepiSungai === 1 ? "Riverside " : ""}${u.subTipe} ${belakang}`.trim();
}

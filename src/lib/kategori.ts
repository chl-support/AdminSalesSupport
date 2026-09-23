/**
 * Kategori penerima fee, dan jenis fee mana yang boleh memakainya.
 *
 * Sebelumnya penerima sebuah fee tidak dipilih sama sekali: ia diambil dari
 * kolom marketing pada data penjualan, dan dialog pengajuan hanya
 * memberitahukannya — "Sales: Agnes Rini Tri Forestianti". Itu benar selama
 * yang menerima fee memang yang menjual. Markom, Sales Manager, Sales
 * Koordinator, dan BGB tidak pernah tertulis di kolom itu, sehingga fee yang
 * jatuh kepada mereka tidak punya jalan diajukan.
 *
 * Daftarnya berbeda menurut jenis fee, dan bedanya bukan kelalaian: Overriding
 * memang tidak pernah jatuh kepada yang menjual, dan BGB — konsumen yang
 * membawa pembeli lain — hanya menerima Komisi.
 *
 * Kodenya sama persis dengan enum recipient_role di basis data, bukan
 * kosakata kedua yang sejajar dengannya. Satu kategori yang dipilih di layar
 * tersimpan apa adanya sebagai peran penerima pada klaimnya, dan tarif pada
 * memo skema dicari dengan kode yang sama.
 */

export type Kategori =
  | "sales_inhouse" | "agent" | "bgb"
  | "markom" | "sales_manager_inhouse" | "sales_coordinator";

export const SEMUA_KATEGORI: Kategori[] = [
  "sales_inhouse", "agent", "bgb",
  "markom", "sales_manager_inhouse", "sales_coordinator",
];

/** Sebutan yang dipakai kantor, dalam dua bahasa layar. */
export const NAMA_KATEGORI: Record<"id" | "en", Record<Kategori, string>> = {
  id: {
    sales_inhouse: "Sales Inhouse",
    agent: "Agent",
    bgb: "BGB (Customer)",
    markom: "Markom",
    sales_manager_inhouse: "Sales Manager",
    sales_coordinator: "Sales Koordinator",
  },
  en: {
    sales_inhouse: "In-house Sales",
    agent: "Agent",
    bgb: "BGB (Customer)",
    markom: "Marcomm",
    sales_manager_inhouse: "Sales Manager",
    sales_coordinator: "Sales Coordinator",
  },
};

export const namaKategori = (k: string, bahasa: "id" | "en" = "id") =>
  NAMA_KATEGORI[bahasa][k as Kategori] ?? k;

/**
 * Kategori yang boleh menerima tiap jenis fee.
 *
 * Continuity Reward mengikuti Cash Reward, sebagaimana seluruh bentuknya yang
 * lain: ia memang Cash Reward dengan nama dan skema nilai tersendiri.
 */
export const KATEGORI_JENIS: Record<string, Kategori[]> = {
  commission: ["sales_inhouse", "agent", "bgb"],
  closing_fee: ["sales_inhouse", "agent", "markom", "sales_manager_inhouse"],
  cash_reward: ["sales_inhouse", "agent", "markom", "sales_manager_inhouse"],
  continuity_reward:
    ["sales_inhouse", "agent", "markom", "sales_manager_inhouse"],
  overriding: ["sales_manager_inhouse", "markom", "sales_coordinator"],
};

/** Kategori itu memang boleh menerima jenis fee ini. */
export function kategoriBoleh(jenis: string, kategori: string): boolean {
  return (KATEGORI_JENIS[jenis] ?? []).includes(kategori as Kategori);
}

/**
 * Kategori yang terpilih lebih dulu saat dialog pengajuan dibuka.
 *
 * Yang tercatat pada data penjualan didahulukan selama jenis fee ini memang
 * boleh jatuh kepadanya; itulah yang benar pada sebagian besar pengajuan, dan
 * memaksa orang memilihnya sendiri setiap kali hanya mengundang salah pilih.
 * Bila tidak boleh — Overriding, misalnya, tidak pernah jatuh kepada yang
 * menjual — yang terpilih adalah kategori pertama yang sah bagi jenis itu.
 */
export function kategoriAwal(jenis: string, kategoriPenerima?: string | null):
    Kategori | null {
  const daftar = KATEGORI_JENIS[jenis] ?? [];
  if (kategoriPenerima && daftar.includes(kategoriPenerima as Kategori)) {
    return kategoriPenerima as Kategori;
  }
  return daftar[0] ?? null;
}

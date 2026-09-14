/**
 * Keempat jenis klaim, beserta yang membedakannya di layar.
 *
 * Disimpan terpisah karena dipakai oleh layar pilihan, layar daftar penjualan,
 * dan formulirnya. Slug-nya sengaja sama persis dengan nilai enum claim_type di
 * basis data — menerjemahkannya bolak-balik hanya menambah satu tempat lagi yang
 * bisa tidak sinkron.
 */

export type Jenis = "closing_fee" | "commission" | "cash_reward" | "overriding";

export const JENIS: {
  slug: Jenis; nama: string; ringkas: string; prasyarat: string;
}[] = [
  {
    slug: "closing_fee",
    nama: "Closing Fee",
    ringkas: "Imbalan penutupan penjualan.",
    prasyarat: "SPU sudah ditandatangani pemesan (BR-01).",
  },
  {
    slug: "commission",
    nama: "Komisi",
    ringkas: "Komisi atas nilai kontrak.",
    prasyarat: "SPU dan PPJB sudah ditandatangani pemesan (BR-02).",
  },
  {
    slug: "cash_reward",
    nama: "Cash Reward",
    ringkas: "Penghargaan tunai atas pencapaian.",
    prasyarat: "SPU, PPJB, dan DP/angsuran pertama sudah diterima (BR-03).",
  },
  {
    slug: "overriding",
    nama: "Overriding",
    ringkas: "Insentif berjenjang bagi atasan dan koordinator.",
    prasyarat: "Unit sudah Sign P3U (BR-04).",
  },
];

export const jenisDari = (slug: string) =>
  JENIS.find((j) => j.slug === slug) ?? null;

/** Peran penerima yang masuk akal per jenis klaim. */
export const PERAN_PENERIMA: Record<Jenis, string[]> = {
  closing_fee: ["agent", "sales_inhouse", "sales_markom", "markom"],
  commission: ["agent", "sales_inhouse", "sales_markom", "markom"],
  cash_reward: ["agent", "sales_inhouse", "sales_markom", "markom"],
  overriding: ["sales_manager_inhouse", "agent"],
};

export const LABEL_PERAN: Record<string, string> = {
  agent: "Agent",
  sales_inhouse: "Sales In-house",
  sales_manager_inhouse: "Sales Manager In-house",
  sales_markom: "Sales Markom",
  markom: "Markom",
};

/** Tingkat overriding, hanya dipakai bila jenisnya overriding. */
export const TINGKAT_OVERRIDING: [string, string][] = [
  ["sales_manager_inhouse", "Sales Manager In-house"],
  ["kantor_agent", "Kantor Agent"],
  ["lead_agent", "Lead Agent"],
  ["coordinator_agent_1", "Koordinator Agent 1"],
  ["coordinator_agent_2", "Koordinator Agent 2"],
];

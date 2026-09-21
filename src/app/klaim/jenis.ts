/**
 * Keempat jenis klaim, beserta yang membedakannya di layar.
 *
 * Disimpan terpisah karena dipakai oleh layar pilihan, layar daftar penjualan,
 * dan formulirnya. Slug-nya sengaja sama persis dengan nilai enum claim_type di
 * basis data — menerjemahkannya bolak-balik hanya menambah satu tempat lagi yang
 * bisa tidak sinkron.
 */

export type Jenis = "closing_fee" | "commission" | "cash_reward" | "overriding";

/**
 * Keempat jenis fee, dalam urutan tampilnya.
 *
 * Satu daftar untuk menu di kiri dan untuk kartu pada layar Pengajuan Fee.
 * Dua daftar terpisah berarti urutan keduanya berbeda cepat atau lambat, dan
 * orang yang hafal posisi menunya salah klik.
 */
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
    slug: "cash_reward",
    nama: "Cash Reward",
    ringkas: "Penghargaan tunai atas pencapaian.",
    prasyarat: "SPU, PPJB, dan DP/angsuran pertama sudah diterima (BR-03).",
  },
  {
    slug: "commission",
    nama: "Komisi",
    ringkas: "Komisi atas nilai kontrak.",
    prasyarat: "SPU dan PPJB sudah ditandatangani pemesan (BR-02).",
  },
  {
    slug: "overriding",
    nama: "Overriding",
    ringkas: "Insentif berjenjang bagi atasan dan koordinator.",
    prasyarat: "Unit sudah Sign P3U (BR-04).",
  },
];

/**
 * Nama keempat jenis dalam bahasa Inggris.
 *
 * Terpisah dari JENIS, bukan menggantikan kolom `nama` di sana: `nama` dipakai
 * belasan tempat, termasuk judul blok pada formulir cetak, dan mengubah
 * bentuknya menjadi dua bahasa berarti menyentuh semuanya sekaligus.
 *
 * Tiga dari empat memang sama dalam kedua bahasa — istilahnya diserap apa
 * adanya di formulir perusahaan. Yang berbeda hanya Komisi. Ketiganya tetap
 * ditulis di sini alih-alih dibiarkan jatuh ke nilai bawaan, supaya daftar ini
 * lengkap dan tidak perlu ditebak saat dibaca.
 */
export const NAMA_EN: Record<Jenis, string> = {
  closing_fee: "Closing Fee",
  commission: "Commission",
  cash_reward: "Cash Reward",
  overriding: "Overriding",
};

/** Nama satu jenis dalam bahasa yang sedang dipakai. */
export const namaJenis = (slug: Jenis, bahasa: "id" | "en") =>
  bahasa === "en" ? NAMA_EN[slug] : (JENIS.find((j) => j.slug === slug)?.nama ?? slug);

/** Keterangan sebaris tiap jenis pada layar pilihan, dalam bahasa Inggris. */
export const RINGKAS_EN: Record<Jenis, string> = {
  closing_fee: "Reward for closing a sale.",
  commission: "Commission on the contract value.",
  cash_reward: "Cash award for hitting a target.",
  overriding: "Tiered incentive for supervisors and coordinators.",
};

/** Prasyarat pencairan tiap jenis, dalam bahasa Inggris. */
export const PRASYARAT_EN: Record<Jenis, string> = {
  closing_fee: "The SPU has been signed by the buyer (BR-01).",
  commission: "The SPU and PPJB have been signed by the buyer (BR-02).",
  cash_reward:
    "The SPU, PPJB, and the down payment or first instalment have been " +
    "received (BR-03).",
  overriding: "The unit has been Sign P3U (BR-04).",
};

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

/**
 * Sebutan peran dan tingkat dalam bahasa Inggris.
 *
 * Hampir semuanya sudah berbahasa Inggris — itu memang sebutan yang dipakai di
 * kantor, dan mengindonesiakannya justru membuat orang tidak mengenalinya.
 * Yang berbeda hanya "Kantor Agent" dan "Koordinator Agent".
 */
export const LABEL_PERAN_EN: Record<string, string> = { ...LABEL_PERAN };

export const TINGKAT_EN: Record<string, string> = {
  sales_manager_inhouse: "Sales Manager In-house",
  kantor_agent: "Agent Office",
  lead_agent: "Lead Agent",
  coordinator_agent_1: "Agent Coordinator 1",
  coordinator_agent_2: "Agent Coordinator 2",
};

/** Tingkat overriding, hanya dipakai bila jenisnya overriding. */
export const TINGKAT_OVERRIDING: [string, string][] = [
  ["sales_manager_inhouse", "Sales Manager In-house"],
  ["kantor_agent", "Kantor Agent"],
  ["lead_agent", "Lead Agent"],
  ["coordinator_agent_1", "Koordinator Agent 1"],
  ["coordinator_agent_2", "Koordinator Agent 2"],
];

/**
 * Checklist dokumen persis seperti pada formulir pengajuan masing-masing.
 *
 * Overriding tidak punya checklist: ia diajukan sebagai lampiran perhitungan
 * per periode, bukan formulir per klaim.
 */
export const DOKUMEN: Record<Jenis, string[]> = {
  closing_fee: [
    "Formulir Pemesanan Unit (FPU)",
    "Surat Pemesanan Unit (SPU)",
    "Kelengkapan Data (KTP, NPWP & Bukti Bayar BF)",
  ],
  cash_reward: [
    "Formulir Pemesanan Unit (FPU)",
    "Surat Pemesanan Unit (SPU)",
    "Kelengkapan Data (KTP, NPWP & Bukti Bayar BF)",
  ],
  commission: [
    "Formulir Pemesanan Unit (FPU)",
    "Surat Pemesanan Unit (SPU)",
    "Perjanjian Pengikatan Jual Beli (PPJB)",
    "Kelengkapan Data (Kwitansi, Invoice, Surat Pernyataan Non PKP/Faktur " +
      "Pajak PPN, KTP, NPWP & Rekening BANK)",
  ],
  overriding: [],
};

/** Judul blok perhitungan, mengikuti judul pada formulirnya. */
export const JUDUL_HITUNG: Record<Jenis, string> = {
  closing_fee: "PERHITUNGAN CLOSING FEE",
  commission: "PERHITUNGAN KOMISI",
  cash_reward: "PERHITUNGAN CASH REWARD",
  overriding: "PERHITUNGAN OVERRIDING",
};


/**
 * Catatan kaki formulir, sebagaimana tertulis pada cetakan aslinya.
 *
 * Ikut dicetak karena ia bagian dari dokumen yang ditandatangani: yang
 * menandatangani membaca syarat pada catatan ini, dan formulir tanpa catatannya
 * bukan formulir yang sama.
 */
export const CATATAN: Record<Jenis, string[]> = {
  closing_fee: [
    "Form Pengajuan Closing Fee hanya berlaku untuk 1 (satu) unit.",
    "Closing Fee hanya dapat di proses setelah Data-data Konsumen dilengkapi " +
      "& Surat Pemesanan Unit (SPU) di tanda tangani oleh pemesan.",
    "Nominal Closing Fee & Persyaratan pembayaran yang dikeluarkan sesuai " +
      "dengan ketentuan yang berlaku(*).",
  ],
  cash_reward: [
    "Form Pengajuan Cash Reward hanya berlaku untuk 1 (satu) unit.",
    "Cash Reward hanya dapat di proses setelah Data-data Konsumen dilengkapi " +
      "& Surat Pemesanan Unit (SPU) di tanda tangani oleh pemesan.",
    "Nominal Cash Reward & Persyaratan pembayaran yang dikeluarkan sesuai " +
      "dengan ketentuan yang berlaku(*).",
  ],
  commission: [
    "Form Pengajuan Komisi hanya berlaku untuk 1 (satu) unit.",
    "Komisi hanya dapat di proses setelah Data-data Konsumen dilengkapi, " +
      "Surat Pemesanan Unit (SPU) & Perjanjian Pengikatan Jual Beli (PPJB) " +
      "di tandatangani oleh pemesan.",
    "Nominal Komisi & Persyaratan pembayaran yang dikeluarkan sesuai dengan " +
      "ketentuan yang berlaku(*).",
  ],
  // Overriding tidak punya formulir pengajuan per unit — ia disusun sebagai
  // lampiran perhitungan per periode, dan berkas aslinya pun berupa tabel
  // periode, bukan formulir.
  overriding: [],
};

/**
 * Alamat kantor pada kop formulir.
 *
 * Disalin apa adanya dari cetakan aslinya. Nomor bloknya sempat tertulis
 * "27–29" di sini, padahal formulir yang berlaku menulis "No. 11".
 */
export const KOP = [
  "Jl. BSD Raya Utama Ruko Mendrisio III Blok B No. 11",
  "Paramount Gading Serpong, Tangerang Banten 15312",
  "Telp. +62 21 2222 0080 Fax. +62 21 2222 0081",
];


/**
 * Kode dokumen yang diwakili tiap baris checklist, urut sama dengan DOKUMEN.
 *
 * Yang tampil pada formulir adalah kalimat cetakannya, sedangkan yang ditagih
 * server adalah kode (lihat REQUIRED_DOCS pada src/lib/calc.ts). Keduanya tidak
 * satu-lawan-satu: satu baris "Kelengkapan Data (KTP, NPWP & Bukti Bayar BF)"
 * mewakili tiga kode sekaligus, persis seperti pada kertasnya.
 *
 * Dipetakan lewat urutan, bukan lewat kalimatnya. Kalimat yang disalin sebagai
 * kunci akan diam-diam tidak cocok lagi begitu satu kata pada DOKUMEN diubah,
 * dan akibatnya baru terasa sebagai "Checklist dokumen belum lengkap" yang
 * menyebut kode yang tidak pernah muncul di layar mana pun.
 */
export const DOKUMEN_KODE: Record<Jenis, string[][]> = {
  closing_fee: [["fpu"], ["spu"], ["ktp", "npwp", "booking_fee_proof"]],
  cash_reward: [["fpu"], ["spu"], ["ktp", "npwp", "booking_fee_proof"]],
  // Baris terakhir Komisi memuat Faktur Pajak bagi yang PKP dan Surat
  // Pernyataan bagi yang bukan — sama seperti kalimatnya pada cetakan.
  // Keduanya dicatat sekaligus: yang tidak ditagih server tidak menghalangi,
  // sedangkan menebak status PKP-nya dari layar ini akan sering keliru.
  commission: [["fpu"], ["spu"], ["ppjb"],
               ["kwitansi", "invoice", "ktp", "npwp", "bank_account",
                "tax_invoice", "non_pkp_statement"]],
  overriding: [],
};

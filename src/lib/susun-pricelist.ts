/**
 * Penyusunan pricelist dalam lima langkah, mengikuti berkas Excel PL Naraya
 * (lembar Data (IRR) → Unit Data → Data Pricelist → Pricelist → T&C).
 *
 * Setiap langkah membaca hasil langkah sebelumnya, persis seperti rumus yang
 * saling merujuk di Excel:
 *
 *   1. Data (IRR)      — koefisien tiap cara bayar: harga yang membuat IRR
 *                        arus kas cara bayar itu sama dengan bunga target,
 *                        dibagi harga Cash Keras.
 *   2. Unit Data       — Base Price dan Factored Price tiap unit dari luas,
 *                        harga per m², kenaikan, dan faktor posisinya.
 *   3. Data Pricelist  — Factored Price × koefisien, dibulatkan ke atas per
 *                        juta, ditambah tambahan tetap (Rp 5 juta).
 *   4. Pricelist       — harga jual per cara bayar (kolom KPR dikali 111,5%),
 *                        DPP, dan Nilai Free PPN DTP.
 *   5. T&C             — ketentuan cara bayar, catatan, dan rekening.
 *
 * Berkas ini hanya menghitung: tanpa basis data, tanpa Excel, sehingga layar
 * dapat menghitung ulang seketika setiap kali satu angka diubah, dan server
 * memakai perhitungan yang sama persis saat pricelist diberlakukan.
 */

// ── Bentuk data ────────────────────────────────────────────────────────────

/** Satu cara bayar pada lembar Data (IRR). */
export type SkemaIrr = {
  nama: string;
  /** "Cash" atau "KPR" — baris pertama lembar Data (IRR); hanya keterangan. */
  kelompok: string;
  /** Porsi penjualan yang diperkirakan; dipakai rata-rata tertimbang. */
  alokasi: number;
  /** Tanda lama (tidak dipakai lagi); dibiarkan supaya draf lama tetap terbaca. */
  tambahan?: boolean;
  /**
   * Cara bayar baru yang Kelompok, DP, Installments dan bulan tahapnya masih
   * diisi otomatis dari namanya (mis. "KPR DP 10%/4x"). Hilang begitu salah
   * satunya diubah manual.
   */
  otomatis?: boolean;
  /** Porsi yang dibayar konsumen sendiri (DP), 1 = seluruhnya. */
  dp: number;
  /** Berapa kali DP itu dicicil, bulan ke-1 sampai ke-n. */
  kali: number;
  /**
   * Bulan pencairan sisa (1 − DP) pada tiap tahap pembangunan: Foundation,
   * Tutup Atap, BAST, AJB + SPHTB. Pencairan tidak pernah lebih awal dari
   * bulan sesudah cicilan DP terakhir.
   */
  bulan: [number, number, number, number];
  /**
   * Cara bayar acuan (Cash Keras): koefisiennya 1, harga cara bayar lain
   * dibandingkan terhadapnya.
   */
  acuan?: boolean;
  /**
   * Cash Price cara bayar ini pada lembar Data (IRR) Excel — pembagi
   * Adjusted Price tersimpan (koefisien = hargaSesuai / hargaKas). Yang
   * tampil dan dapat diubah di layar adalah satu Cash Price bersama,
   * `DataIrr.hargaKas`. Kosong berarti Rp 2 M.
   */
  hargaKas?: number;
  /**
   * Adjusted Price tersimpan, seperti baris 8 lembar Data (IRR) Excel: di
   * sana angkanya hasil Goal Seek yang ditulis sebagai nilai, dan koefisien =
   * Adjusted Price / Cash Price. Dengan angka yang sama, koefisien dan harga
   * di sini sama persis dengan Excel. Kosong berarti dihitung tepat dari
   * bunga target (setara Goal Seek tanpa sisa iterasi) — terjadi saat
   * parameter cara bayar diubah atau tombol Goal Seek ditekan.
   */
  hargaSesuai?: number;
};

/** Nama baris tahap pada lembar Data (IRR) Excel. */
export const TAHAP_EXCEL: [string, string, string, string] =
  ["Foundation", "Tutup Atap", "BAST", "AJB + SPHTB"];

/**
 * Tahap dan porsi yang dipakai rumus arus kas lembar Data (IRR) (sel
 * B22:J57: 40%, 40%, 10%, 10%) — dan karena itu harga di lembar Pricelist.
 * Tabel 25/25/40/10 di samping lembar itu (T2:W5) tidak dipakai rumus mana
 * pun; atas keputusan pemakainya, yang dipakai porsi rumusnya.
 */
export const TAHAP_AWAL: [string, string, string, string] = [...TAHAP_EXCEL];
export const PORSI_AWAL: [number, number, number, number] = [0.4, 0.4, 0.1, 0.1];

export const namaTahap = (irr: { namaTahap?: [string, string, string, string] }) =>
  irr.namaTahap ?? TAHAP_EXCEL;

export const HARGA_KAS_AWAL = 2_000_000_000;

/**
 * Cash Price yang dipakai bersama semua cara bayar: Adjusted Price tiap
 * cara bayar = Cash Price ini × koefisiennya. Kosong pada isian lama: Cash
 * Price cara bayar pertama, atau Rp 2 M.
 */
export const hargaKasIrr = (irr: { hargaKas?: number; skema: { hargaKas?: number }[] }) =>
  irr.hargaKas ?? irr.skema[0]?.hargaKas ?? HARGA_KAS_AWAL;

/** Adjusted Price satu cara bayar: Cash Price × koefisien. */
export const hargaSesuaiSkema = (irr: Parameters<typeof hargaKasIrr>[0], koef: number) =>
  Math.round(hargaKasIrr(irr) * koef);

export type DataIrr = {
  /** Bunga target setahun, mis. 0,09. */
  target: number;
  /** Cash Price bersama semua cara bayar; lihat `hargaKasIrr`. */
  hargaKas?: number;
  /** Porsi sisa (1 − DP) yang cair pada keempat tahap; jumlahnya 1. */
  porsiTahap: [number, number, number, number];
  /**
   * Nama keempat tahap. Kosong pada isian lama: nama baris lembar Data (IRR)
   * Excel (Foundation, Tutup Atap, BAST, AJB + SPHTB); lihat `namaTahap`.
   */
  namaTahap?: [string, string, string, string];
  /**
   * Panjang arus kas dalam bulan. Standar 100 bulan (lembar Data (IRR)
   * standar: baris 21–121); berkas lama 36. Arus kas tidak pernah dipotong
   * sebelum cicilan dan tahap terakhir cara bayarnya — lihat `arusKas`.
   */
  periode: number;
  /**
   * Nama cara bayar dibuat otomatis dari Kelompok, DP dan Installments,
   * seperti baris 2 lembar Data (IRR) standar — lihat `namaStandar`.
   * Standar untuk semua project: kosong berarti aktif; false bila
   * dimatikan di layar.
   */
  namaOtomatis?: boolean;
  skema: SkemaIrr[];
};

/** Nama cara bayar otomatis aktif (bawaan semua project), lihat `DataIrr.namaOtomatis`. */
export const namaOtomatisAktif = (irr: Pick<DataIrr, "namaOtomatis">) => irr.namaOtomatis !== false;

/** Panjang arus kas standar, dalam bulan. */
export const PERIODE_STANDAR = 100;

/**
 * Nama cara bayar menurut rumus baris 2 lembar Data (IRR) standar: Cash 1x
 * "Cash Keras", Cash Nx "Installment Nx", KPR "KPR DP x%/Nx"; KPR 1x yang
 * semua tahapnya cair bulan 2 "KPR Express".
 */
export function namaStandar(s: Pick<SkemaIrr, "kelompok" | "dp" | "kali" | "bulan">): string {
  const kali = Math.max(1, Math.round(s.kali));
  if (/^kpr$/i.test(s.kelompok.trim())) {
    if (kali === 1 && s.bulan.every((b) => b <= 2)) return "KPR Express";
    return `KPR DP ${Math.round(s.dp * 100)}%/${kali}x`;
  }
  return kali === 1 ? "Cash Keras" : `Installment ${kali}x`;
}

/** Faktor posisi unit pada lembar Unit Data, masing-masing pecahan. */
export const FAKTOR = [
  ["singleRow", "Single Row"],
  ["unitDepan", "Unit Depan"],
  ["hdpUtara", "Hdp Utara"],
  ["hdpSelatan", "Hdp Selatan"],
  ["hdpBarat", "Hdp Barat"],
  ["hdpTimur", "Hdp Timur"],
  ["hoek", "Hoek"],
  ["hoekGarden", "Taman Sudut"],
  ["sideGarden", "Taman Samping"],
  ["backGarden", "Taman Belakang"],
  ["tusukSate", "Tusuk Sate"],
  ["roundAround", "Round Around"],
  ["luckyNumber", "Lucky Number"],
  // Faktor berkas Unit Data The Sanctuary Collection (lihat unit-sanctuary.ts).
  ["hargaBangunanPersen", "Harga Bangunan (%)"],
  ["fasadBelakang", "Fasad Belakang"],
  ["tepiSungai", "Tepi Sungai"],
  ["garduListrik", "Gardu Listrik"],
  ["penangkalPetir", "Penangkal Petir"],
  ["wargaSekitar", "Warga Sekitar"],
  ["pertigaan", "Posisi Menghadap Pertigaan Jalan"],
  ["unitUjung", "Unit Ujung"],
  ["fasilitas", "Fasilitas"],
  ["areaTerbuka", "Menghadap Area Terbuka"],
  ["tanahTakBeraturan", "Bentuk Tanah Tidak Beraturan"],
] as const;
export type KunciFaktor = (typeof FAKTOR)[number][0];

/**
 * Nama Inggris faktor yang judulnya kini berbahasa Indonesia: judul kolom
 * berkas Excel lama tetap dikenali saat impor, dan dipakai di tampilan
 * bahasa Inggris.
 */
export const FAKTOR_INGGRIS: Partial<Record<KunciFaktor, string>> = {
  hoekGarden: "Hoek Garden", sideGarden: "Side Garden", backGarden: "Back Garden",
};

/**
 * Faktor yang hanya dipakai sebagian proyek (mis. BIO DISTRICT). Kolomnya di
 * langkah 2 tampil bila ada unit yang mengisinya, dan tidak ada di template.
 */
export const FAKTOR_OPSIONAL: ReadonlySet<KunciFaktor> = new Set(["tusukSate", "roundAround", "luckyNumber",
  "hargaBangunanPersen", "fasadBelakang", "tepiSungai", "garduListrik", "penangkalPetir", "wargaSekitar",
  "pertigaan", "unitUjung", "fasilitas", "areaTerbuka", "tanahTakBeraturan"]);

/** Faktor yang kolomnya ditampilkan untuk daftar unit ini. */
export const faktorTampil = (unit: UnitData[]) =>
  FAKTOR.filter(([k]) => !FAKTOR_OPSIONAL.has(k) || unit.some((u) => u.faktor[k]));

export type UnitData = {
  kode: string;
  alamat: string;
  view: string;
  /** Nomor kaveling pada lembar Unit Data (kolom No). */
  no: string;
  ukuran: string;
  phase: string;
  /** Tipe yang tertulis di pricelist, mis. 7. */
  tipe: string;
  /** Tipe bangunan pada lembar Unit Data, mis. 70. */
  tipeBangunan: string;
  /** Kolom View kedua, sesudah Type; bebas diisi. */
  view2?: string;
  /** Keterangan bentuk kaveling, mis. "Irregullar". */
  bentuk: string;
  subTipe: string;
  /** Luas tanah, m². */
  lt: number;
  /** Harga tanah per m², belum termasuk PPN 11%. */
  hargaTanah: number;
  /** Luas bangunan (GFA), m². */
  lb: number;
  /** Harga bangunan per m², belum termasuk PPN 11%. */
  hargaBangunan: number;
  /** Kenaikan harga, pecahan. */
  kenaikan: number;
  /**
   * Catatan asal angka kenaikan, mis. rumus "1,025*1,025*1,01*1,002-1".
   * Rumus yang dapat dihitung mengisi kenaikan; teks biasa hanya catatan.
   */
  kenaikanCatatan?: string;
  faktor: Partial<Record<KunciFaktor, number>>;
  /** (+) Factor, pecahan; di Excel =1%+1%. */
  faktorTambah: number;
  /** Special, rupiah. */
  special: number;
  /**
   * (+) Faktor dalam rupiah (Termasuk PPN), mis. Gimmick senilai tertentu;
   * ditambahkan sesudah faktor persen. Melengkapi faktorTambah (persen).
   */
  faktorTambahRp?: number;
  /**
   * (−) Faktor: pengurang harga, persen (pecahan positif; harga × (1 − x))
   * dan/atau rupiah (positif; dikurangkan). Kebalikan (+) Faktor.
   */
  faktorKurang?: number;
  faktorKurangRp?: number;
  /**
   * Kenaikan sesudah faktor (pecahan): Harga Setelah Faktor (Kenaikan) =
   * Harga Setelah Faktor (Terendah) × (1 + ini), seperti kolom Kenaikan
   * Excel. Harga per cara bayar dihitung dari harga sesudah kenaikan ini.
   */
  kenaikanFaktor?: number;
  /** Show Unit, rupiah; ikut naik sebesar kenaikan. */
  showUnit: number;
  /** Floor (luas lantai), m²; keterangan saja (berkas BIO DISTRICT). */
  floor?: number;
  /**
   * Kolom keterangan yang hanya ada di berkas Unit Data project tertentu
   * (The Sanctuary Collection: Kavling, Unit Tengah / Ujung, tanda posisi,
   * Status, Harga Lama, …); tidak memengaruhi harga.
   */
  atribut?: Record<string, string | number>;
  /** Biaya AJB + BPHTB, pecahan; pengali (1 + x) seperti (+) Factor. */
  biayaAjb?: number;
  /** Special %, pecahan; pengali (1 + x) seperti (+) Factor. */
  specialPersen?: number;
  /**
   * Pembagi Harga Dasar Termasuk PPN, mis. 1,005 (berkas BIO DISTRICT menulis
   * ROUNDUP(…)/1,005 untuk beberapa unit). Kosong = tidak dibagi.
   */
  pembagiIncl?: number;
  /**
   * Penyesuaian harga unit ini, pecahan: Harga Setelah Faktor × (1 + x);
   * minus = turun, mis. -0,05 = turun 5%. Diisi dari "Penyesuaian harga"
   * di langkah 2 (semua unit atau unit terpilih).
   */
  penyesuaian?: number;
  /** Penyesuaian rupiah (Termasuk PPN) sesudah persen di atas; minus = potongan. */
  penyesuaianRp?: number;
  /**
   * Alasan unit tanpa luas / harga tanah, mis. "Harga belum ditentukan
   * management". Unit itu tidak ikut pricelist yang disimpan.
   */
  catatan?: string;
};

/** Unit yang luas atau harga tanahnya belum diisi: harganya belum dikeluarkan. */
export const unitBelumBerharga = (u: UnitData) => !(u.lt > 0) || !(u.hargaTanah > 0);

/** Satu kolom lembar Data Pricelist. */
export type KolomDataPl = {
  nama: string;
  /**
   * Cara bayar Data (IRR) yang koefisiennya dipakai:
   * harga = ROUNDUP(Factored Price × koefisien × kali, juta) + tambahan.
   * `kali` (kosong = 100%) dikalikan sebelum dibulatkan, seperti Excel BIO
   * DISTRICT: KPR Extra Ultra Express = ROUNDUP(harga × koefisien × 124%, -6).
   */
  skema?: string;
  /**
   * Atau turunan kolom Data Pricelist lain:
   * harga = ROUNDUP(kolom itu × kali, juta), tanpa tambahan.
   * Di Excel: BANK KPR - DP 10% (-UTJ) = ROUNDUP(KPR Express × 112%, -6).
   */
  dari?: string;
  kali?: number;
  /**
   * Kenaikan khusus cara bayar ini, sesudah harganya dihitung: persen
   * (pecahan; harga × (1 + persen), dibulatkan ke atas ke jutaan) lalu rupiah
   * tetap. Kolom turunannya ikut naik karena dihitung dari harga ini.
   */
  naikPersen?: number;
  naikRp?: number;
  /**
   * Kenaikan bertingkat (beruntun): tiap tingkat diterapkan pada hasil
   * tingkat sebelumnya — ROUNDUP(harga × (1 + persen), juta) + rupiah. Bila
   * ada, menggantikan naikPersen / naikRp.
   */
  naikTingkat?: { persen: number; rp: number }[];
};

/** Tingkat kenaikan kolom: daftar bertingkat, atau satu tingkat dari isian lama. */
export const tingkatNaik = (k: Pick<KolomDataPl, "naikPersen" | "naikRp" | "naikTingkat">) =>
  k.naikTingkat ?? (k.naikPersen || k.naikRp ? [{ persen: k.naikPersen ?? 0, rp: k.naikRp ?? 0 }] : []);

/** Satu kolom harga pada lembar Pricelist. */
export type KolomPricelist = {
  nama: string;
  /** Kolom Data Pricelist sumbernya. */
  dari: string;
  /**
   * Pengali. 1 berarti harganya diambil apa adanya; selain itu
   * ROUND(harga × kali, juta) — di Excel 111,5% untuk kolom KPR.
   */
  kali: number;
  /**
   * Pembulatan pengalinya ke atas (ROUNDUP), bukan ROUND. Mis. BANK KPR
   * Banara: ROUNDUP(KPR Express × 112% × 111,5%, juta) = KPR Express × 124,88%.
   */
  bulatAtas?: boolean;
};

export type SusunPricelist = {
  /**
   * Tarif PPN, pecahan; kosong = 11% (PPN). Dipakai untuk harga per m²
   * termasuk PPN di Unit Data serta DPP dan Nilai Free PPN DTP di Pricelist,
   * supaya perubahan tarif dari pemerintah cukup diubah di satu tempat.
   */
  ppn?: number;
  /**
   * Base Price dihitung dari harga per m² sebelum PPN (Excl PPN), bukan
   * sesudahnya. Hanya Permai Indah yang memakainya (lihat basisProject);
   * kosong = Incl PPN, seperti berkas PL Naraya.
   */
  basisExclPpn?: boolean;
  /**
   * Base Price dibulatkan ke 10^n rupiah; kosong = 6 (jutaan).
   * Permai Indah: 4 (puluhan ribu).
   */
  bulatBase?: number;
  /**
   * Base Price dibulatkan biasa (Excel ROUND), bukan ke atas (ROUNDUP).
   * Permai Indah: ya; kosong = ke atas.
   */
  bulatBiasa?: boolean;
  /**
   * Harga per m² sesudah PPN dibulatkan ke atas ke 10^n rupiah sebelum dikali
   * luas; kosong atau -1 = tidak dibulatkan (-1: dipilih tegas di layar,
   * supaya aturan bawaan project tidak memasangnya lagi). BIO DISTRICT dan
   * Mazenta: 5 (ratusan ribu).
   */
  bulatHargaM2?: number;
  /**
   * Harga Belum PPN dihitung sendiri dari harga per m² Excl PPN dan
   * dibulatkan seperti Base Price, bukan Termasuk PPN dibagi (1 + PPN).
   * BIO DISTRICT: ya.
   */
  exclTerpisah?: boolean;
  /**
   * Base Price tidak dibulatkan: (LT × tanah + GFA × bangunan) × (1 +
   * kenaikan) apa adanya. Mazenta Residence: ya (Excel-nya tanpa ROUNDUP).
   */
  baseTanpaBulat?: boolean;
  /**
   * Harga tanah dan bangunan per m² yang diketik sudah Termasuk PPN, jadi
   * tidak dikali (1 + PPN): Harga Dasar = Luas × harga apa adanya. The
   * Sanctuary Collection: ya (berkas Unit Data-nya).
   */
  hargaM2Termasuk?: boolean;
  /**
   * Pembulatan harga per cara bayar di Data Pricelist: ROUNDUP ke 10^n
   * rupiah, dipilih di langkah 3. Kosong = 6 (juta); The Sanctuary
   * Collection bawaannya 4 (Rp 10.000), seperti ROUNDUP(…, -4) Excel-nya.
   */
  bulatDataPl?: number;
  /**
   * Penyesuaian sekali jalan yang sudah diterapkan pada draf ini (lihat
   * samakanTsc), supaya tidak diterapkan lagi bila orang mengubahnya.
   */
  migrasi?: string[];
  /**
   * Tanda bahwa T&C draf ini sudah disamakan dengan patokan (T&C Naraya
   * Serpong) — sekali saja; sesudahnya T&C disunting manual dan tidak
   * ditimpa lagi. Lihat samakanTncPatokan.
   */
  tncPatokan?: string;
  /** Catatan bebas di langkah 2 Unit Data, ikut tersimpan bersama draf. */
  catatanUnit?: string;
  /** Gambar pada Catatan Unit Data; isinya di tabel pricelist_susun_gambar. */
  catatanGambar?: { id: string; nama: string }[];
  irr: DataIrr;
  unit: UnitData[];
  dataPricelist: {
    /** Tambahan tetap per unit, rupiah (Excel: +5.000.000). */
    tambahan: number;
    kolom: KolomDataPl[];
  };
  pricelist: {
    judul: string;
    /** Tanggal berlaku, ditulis apa adanya (mis. "21 Juli 2026"). */
    tanggal: string;
    /** Catatan di atas kolom harga, mis. keterangan subsidi KPR. */
    catatan: string;
    /** Pagu harga PPN DTP termasuk PPN (Excel: 2.220.000.000). */
    batasDtp: number;
    kolom: KolomPricelist[];
  };
  tnc: Tnc;
  /**
   * Harga spesial (langkah 4b): harga permintaan yang berangkat dari harga
   * langkah 4a tanpa mengubahnya. Tiap set berdiri sendiri — satu untuk
   * promo, satu untuk permintaan seorang konsumen — dan dipilih saat
   * memberlakukan harga.
   */
  spesial?: { set: SetSpesial[] };
};

/**
 * Satu set harga spesial.
 *
 * Dua lapis, dibaca berurutan: `unit` menggeser seluruh cara bayar sebuah
 * unit sekaligus (diskon atau penambahan, rupiah atau persen), lalu `sel`
 * menimpa harga satu cara bayar unit itu dengan angka yang diketik langsung.
 * Yang tidak disebut mengikuti harga langkah 4a apa adanya.
 */
export type SetSpesial = {
  id: string;
  nama: string;
  catatan?: string;
  /** Kode unit → penggeseran; `nilai` negatif berarti diskon. */
  unit: Record<string, { jenis: "rp" | "persen"; nilai: number }>;
  /** Kode unit → nama cara bayar → harga rupiah yang diketik. */
  sel: Record<string, Record<string, number>>;
};

export type BarisTnc = { label: string; nilai: string; waktu: string };
export type Tnc = {
  judul: string;
  caraBayar: { judul: string; baris: BarisTnc[]; catatan?: string }[];
  catatan: string[];
  /** Kalimat pengantar daftar rekening. */
  pengantarRekening: string;
  rekening: { bank: string; noRek: string; cabang: string }[];
};

// ── Pembulatan seperti Excel ───────────────────────────────────────────────

/**
 * Hasil kali pecahan seperti 1811289480 × 1,0494 membawa galat biner di
 * digit ke-16. Excel menghitung dengan 15 digit bermakna, jadi angka yang di
 * Excel tepat 1.812.000.000 tidak boleh dibulatkan ke atas menjadi 1.813 juta
 * hanya karena tertulis 1812000000,0000002 di sini.
 */
const rapikan = (x: number) => Number(x.toPrecision(15));

/** ROUNDUP(x, -digit): menjauhi nol ke kelipatan 10^digit. */
export function roundUp(x: number, digit: number): number {
  const s = 10 ** digit, v = rapikan(x) / s;
  return (v >= 0 ? Math.ceil(rapikan(v)) : Math.floor(rapikan(v))) * s;
}

/** ROUND(x, -digit): setengah menjauhi nol, seperti Excel. */
export function roundExcel(x: number, digit: number): number {
  const s = 10 ** digit, v = rapikan(rapikan(x) / s);
  return Math.sign(v) * Math.round(Math.abs(v)) * s;
}

// ── 1. Data (IRR) ──────────────────────────────────────────────────────────

/**
 * Arus kas masuk bulan 1..periode untuk harga 1, seperti baris 22–57 lembar
 * Data (IRR): DP dicicil rata pada bulan 1..kali, lalu sisanya cair pada
 * bulan tiap tahap pembangunan (tidak sebelum bulan kali + 1).
 */
export function arusKas(s: SkemaIrr, irr: DataIrr): number[] {
  const kali = Math.max(1, Math.round(s.kali));
  const arus: number[] = [];
  // Bulan terakhir yang menerima pembayaran selalu ikut, walau melebihi
  // periode (berkas lama 36 bulan dengan cicilan lebih panjang).
  const akhir = Math.max(irr.periode, kali + 1, ...s.bulan);
  for (let t = 1; t <= akhir; t++) {
    let v = t <= kali ? s.dp / kali : 0;
    s.bulan.forEach((b, i) => {
      if (t === Math.max(b, kali + 1)) v += (1 - s.dp) * irr.porsiTahap[i];
    });
    arus.push(v);
  }
  return arus;
}

/**
 * Koefisien cara bayar: Adjusted Price / Cash Price.
 *
 * Di Excel, Adjusted Price dicari dengan Goal Seek sampai IRR(arus) × 12
 * sama dengan bunga target. Arusnya sebanding dengan harga, maka harga itu
 * dapat dihitung langsung: Cash Price dibagi nilai sekarang arus untuk harga
 * 1 pada bunga target/12 per bulan. Hasilnya sama dengan Goal Seek, tanpa
 * selisih pembulatan iterasi.
 */
export function koefisien(s: SkemaIrr, irr: DataIrr): number {
  if (s.acuan) return 1;
  const kas = s.hargaKas ?? HARGA_KAS_AWAL;
  if (s.hargaSesuai && kas) return s.hargaSesuai / kas;
  return koefisienTepat(s, irr);
}

/** Koefisien dari bunga target, tanpa Adjusted Price tersimpan. */
export function koefisienTepat(s: SkemaIrr, irr: DataIrr): number {
  if (s.acuan) return 1;
  const r = irr.target / 12;
  const nilai = arusKas(s, irr).reduce((a, v, i) => a + v / (1 + r) ** (i + 1), 0);
  return nilai > 0 ? 1 / nilai : NaN;
}

/** IRR tahunan (bulanan × 12) arus kas skema pada harga × koefisien. */
export function irrTahunan(s: SkemaIrr, irr: DataIrr, koef: number): number {
  const arus = [-1, ...arusKas(s, irr).map((v) => v * koef)];
  const npv = (r: number) => arus.reduce((a, v, t) => a + v / (1 + r) ** t, 0);
  let lo = -0.99, hi = 1;
  if (npv(lo) * npv(hi) > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 12;
}

export type HasilIrr = {
  koef: Record<string, number>;
  irr: Record<string, number>;
  totalAlokasi: number;
  /** WA Coefficient: rata-rata koefisien tertimbang alokasi. */
  koefRata: number;
};

/**
 * Arus kas tertimbang per bulan (kolom K–L lembar Data (IRR) standar):
 * jumlah arus kas semua cara bayar dikali Allocation-nya, dan porsinya
 * terhadap seluruh arus. Analisa saja, tidak memengaruhi harga.
 */
export function arusTertimbang(irr: DataIrr, h: HasilIrr): { bulan: number; jumlah: number; porsi: number }[] {
  const kas = hargaKasIrr(irr);
  const jumlah: number[] = [];
  for (const s of irr.skema) {
    const k = h.koef[s.nama];
    if (!Number.isFinite(k)) continue;
    arusKas(s, irr).forEach((v, i) => { jumlah[i] = (jumlah[i] ?? 0) + v * k * kas * s.alokasi; });
  }
  const total = jumlah.reduce((a, v) => a + (v ?? 0), 0);
  let akhir = jumlah.length;
  while (akhir > 0 && !jumlah[akhir - 1]) akhir--;
  return Array.from({ length: akhir }, (_, i) => ({
    bulan: i + 1, jumlah: jumlah[i] ?? 0, porsi: total ? (jumlah[i] ?? 0) / total : 0,
  }));
}

export function hitungIrr(irr: DataIrr): HasilIrr {
  const koef: Record<string, number> = {}, hasilIrr: Record<string, number> = {};
  for (const s of irr.skema) {
    koef[s.nama] = koefisien(s, irr);
    hasilIrr[s.nama] = s.acuan ? 0 : irrTahunan(s, irr, koef[s.nama]);
  }
  return {
    koef, irr: hasilIrr,
    totalAlokasi: irr.skema.reduce((a, s) => a + s.alokasi, 0),
    koefRata: irr.skema.reduce((a, s) => a + (koef[s.nama] || 0) * s.alokasi, 0),
  };
}

// ── 2. Unit Data ───────────────────────────────────────────────────────────

export const PPN = 0.11;

/** Tarif PPN yang berlaku untuk susunan ini. */
export const tarifPpn = (s: Pick<SusunPricelist, "ppn">) =>
  s.ppn != null && Number.isFinite(s.ppn) ? s.ppn : PPN;

/** Project yang Base Price-nya dihitung dari harga Excl PPN (slug). */
const BASIS_EXCL_PPN = new Set(["permai-indah"]);
/** Project yang mengikuti rumus berkas Unit Data BIO DISTRICT (slug). */
const RUMUS_BIO = new Set(["bio-district"]);
/**
 * Project yang mengikuti rumus berkas PL Mazenta: harga per m² Termasuk PPN
 * dibulatkan ke atas ke ratusan ribu, Base Price tidak dibulatkan.
 */
const RUMUS_MAZENTA = new Set(["mazenta-residence"]);
/**
 * Project yang mengikuti berkas Unit Data The Sanctuary Collection: Harga
 * Dasar = Luas Tanah × Harga Tanah + Luas Bangunan × Harga Bangunan (harga
 * per m² sudah Termasuk PPN), tanpa pembulatan. Rumusnya tetap, tidak dapat
 * diubah di layar.
 */
export const RUMUS_TSC: ReadonlySet<string> = new Set([
  "tsc-tanglin-parc", "tsc-newton-springs", "tsc-orchard-riviera", "tsc-scotts-vale",
]);
const ATURAN_TSC = {
  bulatHargaM2: -1, bulatBase: 6, bulatBiasa: false, baseTanpaBulat: true, basisExclPpn: false,
  exclTerpisah: false, hargaM2Termasuk: true,
} as const;

/**
 * Pasang aturan basis harga project pada draf yang belum menyatakannya:
 * Permai Indah memakai harga Excl PPN dan membulatkan Base Price biasa
 * (ROUND) ke puluhan ribu; project lain Incl PPN, dibulatkan ke atas ke
 * jutaan. Aturan yang sudah dinyatakan draf dibiarkan.
 */
/**
 * Project yang sudah berjalan sebelum rumus standar dipatenkan (lihat
 * PROJECT_BAWAAN di projects.ts). Aturan pembulatannya mengikuti Excel
 * masing-masing dan tetap dapat diubah di langkah 2.
 */
const PROJECT_LAMA = new Set([
  "banara-serpong", "marchand-hype-station", "mazenta-residence",
  "naraya-serpong", "bio-district", "permai-indah",
]);

/**
 * Rumus dipatenkan: project baru di luar enam project lama selalu memakai
 * ATURAN_STANDAR — tidak dapat diubah di layar maupun lewat impor Excel.
 */
export const rumusDikunci = (slug: string | null | undefined) =>
  !!slug && !PROJECT_LAMA.has(slug) && !RUMUS_TSC.has(slug);

export function basisProject<
  T extends Pick<SusunPricelist, "basisExclPpn" | "bulatBase" | "bulatBiasa" | "bulatHargaM2" | "exclTerpisah" | "baseTanpaBulat" | "bulatDataPl">,
>(slug: string | null | undefined, data: T): T {
  // Pembulatan Data Harga TSC bawaan Rp 10.000 (ROUNDUP …, -4); dapat dipilih lain di langkah 3.
  if (slug && RUMUS_TSC.has(slug)) return { ...data, ...ATURAN_TSC, bulatDataPl: data.bulatDataPl ?? 4 };
  if (rumusDikunci(slug)) return { ...data, ...ATURAN_STANDAR, exclTerpisah: false };
  // BIO DISTRICT: harga per m² Termasuk PPN dibulatkan ke atas ke ratusan
  // ribu, dan harga Belum PPN dihitung sendiri — seperti berkas Excel-nya.
  if (slug && RUMUS_MAZENTA.has(slug)) {
    return { ...data, bulatHargaM2: data.bulatHargaM2 ?? 5, baseTanpaBulat: data.baseTanpaBulat ?? true };
  }
  if (slug && RUMUS_BIO.has(slug)) {
    return { ...data, bulatHargaM2: data.bulatHargaM2 ?? 5, exclTerpisah: data.exclTerpisah ?? true };
  }
  if (!slug || !BASIS_EXCL_PPN.has(slug)) return data;
  return { ...data, basisExclPpn: data.basisExclPpn ?? true,
           bulatBase: data.bulatBase ?? 4, bulatBiasa: data.bulatBiasa ?? true };
}

/** "11%", "12%", "11,5%" — untuk judul kolom dan keterangan. */
export const labelPpn = (ppn: number) =>
  `${(ppn * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

export type HasilUnit = {
  /** Harga tanah dan bangunan per m² termasuk PPN 11%. */
  hargaTanahPpn: number;
  hargaBangunanPpn: number;
  /** Base Price = ROUNDUP((LT × tanah + GFA × bangunan) × (1 + kenaikan), juta). */
  base: number;
  /** Jumlah faktor posisi. */
  faktor: number;
  /** Factored Price: Harga Setelah Faktor (Kenaikan), dasar harga per cara bayar. */
  factored: number;
  /** Harga Setelah Faktor (Terendah): sebelum `UnitData.kenaikanFaktor`. */
  factoredR: number;
  factoredExclR?: number;
  /** Base dan Factored Price Belum PPN yang dihitung sendiri (exclTerpisah). */
  baseExcl?: number;
  factoredExcl?: number;
};

export type OpsiHitungUnit = {
  bulatHargaM2?: number; exclTerpisah?: boolean; baseTanpaBulat?: boolean; hargaM2Termasuk?: boolean;
};

export function hitungUnit(u: UnitData, ppn = PPN, exclPpn = false, bulat = 6,
                           bulatBiasa = false, opsi: OpsiHitungUnit = {}): HasilUnit {
  const kaliPpn = opsi.hargaM2Termasuk ? 1 : 1 + ppn;
  const hargaTanahPpn = u.hargaTanah * kaliPpn;
  const hargaBangunanPpn = u.hargaBangunan * kaliPpn;
  const m2 = (x: number) => opsi.bulatHargaM2 != null && opsi.bulatHargaM2 >= 0 ? roundUp(x, opsi.bulatHargaM2) : x;
  // Pricelist Permai Indah mengalikan luas dengan harga Excl PPN.
  const [tanah, bangunan] = exclPpn ? [u.hargaTanah, u.hargaBangunan]
    : [m2(hargaTanahPpn), m2(hargaBangunanPpn)];
  const bulatkan = (x: number) => opsi.baseTanpaBulat ? x * (1 + u.kenaikan)
    : (bulatBiasa ? roundExcel : roundUp)(x * (1 + u.kenaikan), bulat);
  const base = bulatkan(u.lt * tanah + u.lb * bangunan)
    / (u.pembagiIncl && !exclPpn ? u.pembagiIncl : 1);
  const faktor = FAKTOR.reduce((a, [k]) => a + (u.faktor[k] ?? 0), 0);
  // skala: 1 untuk harga Termasuk PPN, 1 / (1 + PPN) untuk Belum PPN (exclTerpisah).
  const kaliFaktor = (b: number, skala = 1) => b * (1 + faktor) * (1 + u.faktorTambah)
                   * (1 - (u.faktorKurang ?? 0))
                   * (1 + (u.biayaAjb ?? 0)) * (1 + (u.specialPersen ?? 0)) + u.special
                   + ((u.faktorTambahRp ?? 0) - (u.faktorKurangRp ?? 0)) * skala
                   + u.showUnit * (1 + u.kenaikan);
  // Penyesuaian harga unit (turun/naik persen, lalu potongan/tambahan rupiah).
  const sesuaikan = (x: number, rp: number) => x * (1 + (u.penyesuaian ?? 0)) + rp;
  const naik = 1 + (u.kenaikanFaktor ?? 0);
  const factoredR = sesuaikan(kaliFaktor(base), u.penyesuaianRp ?? 0);
  const hasil: HasilUnit = { hargaTanahPpn, hargaBangunanPpn, base, faktor, factoredR, factored: factoredR * naik };
  if (opsi.exclTerpisah && !exclPpn) {
    // Seperti Excel BIO: ROUNDUP((Tanah × harga Excl + GFA × harga Excl) × (1 + kenaikan), juta).
    hasil.baseExcl = bulatkan(u.lt * u.hargaTanah + u.lb * u.hargaBangunan);
    hasil.factoredExclR = sesuaikan(kaliFaktor(hasil.baseExcl, 1 / (1 + ppn)), (u.penyesuaianRp ?? 0) / (1 + ppn));
    hasil.factoredExcl = hasil.factoredExclR * naik;
  }
  return hasil;
}

// ── 3. Data Pricelist ──────────────────────────────────────────────────────

/** Harga per kolom Data Pricelist untuk satu unit. */
export function hitungDataPl(
  susun: SusunPricelist, factored: number, koef: Record<string, number>,
): Record<string, number> {
  const bulat = susun.bulatDataPl ?? 6;
  const harga: Record<string, number> = {};
  for (const k of susun.dataPricelist.kolom) {
    if (k.skema) {
      const c = koef[k.skema];
      harga[k.nama] = Number.isFinite(c)
        ? roundUp(factored * c * (k.kali ?? 1), bulat) + susun.dataPricelist.tambahan : NaN;
    } else if (k.dari) {
      const asal = harga[k.dari];
      harga[k.nama] = asal == null ? NaN : roundUp(asal * (k.kali ?? 1), bulat);
    }
    // Kenaikan khusus cara bayar ini.
    const h = harga[k.nama];
    if (Number.isFinite(h)) {
      harga[k.nama] = tingkatNaik(k).reduce(
        (x, t) => (t.persen ? roundUp(x * (1 + t.persen), bulat) : x) + (t.rp || 0), h);
    }
  }
  return harga;
}

// ── 4. Pricelist ───────────────────────────────────────────────────────────

export type HargaPl = { harga: number; dpp: number; dtp: number };

/**
 * DPP = harga / 1,11; Nilai Free PPN DTP = harga − DPP, paling banyak PPN
 * atas pagu (Excel: 2.220.000.000 / 1,11 × 11% = 220.000.000).
 */
export function pajakDtp(
  harga: number, batasDtp: number, ppn = PPN,
): { dpp: number; dtp: number } {
  const dpp = roundExcel(harga / (1 + ppn), 0);
  const pagu = batasDtp / (1 + ppn);
  // Dibulatkan ke rupiah: 2 M × 11% tertulis 220000000,00000003 di sini.
  return { dpp, dtp: roundExcel(dpp < pagu ? harga - dpp : pagu * ppn, 0) };
}

export function hitungPricelist(
  susun: SusunPricelist, dataPl: Record<string, number>,
): Record<string, HargaPl> {
  const hasil: Record<string, HargaPl> = {};
  for (const k of susun.pricelist.kolom) {
    const asal = dataPl[k.dari];
    const harga = asal == null || !Number.isFinite(asal) ? NaN
      : k.kali === 1 ? asal : (k.bulatAtas ? roundUp : roundExcel)(asal * k.kali, 6);
    hasil[k.nama] = { harga, ...pajakDtp(harga, susun.pricelist.batasDtp, tarifPpn(susun)) };
  }
  return hasil;
}

// ── Seluruh rantai ─────────────────────────────────────────────────────────

export type BarisHasil = {
  unit: UnitData;
  hasilUnit: HasilUnit;
  dataPl: Record<string, number>;
  pricelist: Record<string, HargaPl>;
};

export type HasilSusun = {
  irr: HasilIrr;
  baris: BarisHasil[];
  /** Masalah yang membuat pricelist belum dapat diberlakukan. */
  galat: string[];
};

/**
 * Harga satu sel menurut set spesial: timpaan selnya bila ada, bila tidak
 * harga dasar yang digeser oleh penyesuaian unitnya. Hasil penggeseran
 * dibulatkan ke ribuan — angka yang dihitung layar, bukan yang diketik.
 */
export function hargaSpesial(
  set: SetSpesial, kode: string, kolom: string, dasar: number,
): number {
  const sel = set.sel[kode]?.[kolom];
  if (sel != null && Number.isFinite(sel)) return sel;
  const atur = set.unit[kode];
  if (!atur || !atur.nilai || !Number.isFinite(dasar)) return dasar;
  const n = atur.jenis === "persen" ? dasar * (1 + atur.nilai / 100) : dasar + atur.nilai;
  return Math.max(0, roundExcel(n, 3));
}

/** Set spesial dengan id itu, bila ada. */
export const setSpesial = (susun: SusunPricelist, id?: string | null) =>
  (id ? susun.spesial?.set.find((s) => s.id === id) : undefined);

export function hitungSemua(susun: SusunPricelist, spesial?: string | null): HasilSusun {
  const irr = hitungIrr(susun.irr);
  const set = setSpesial(susun, spesial);
  const baris = susun.unit.map((unit) => {
    const hasilUnit = hitungUnit(unit, tarifPpn(susun), !!susun.basisExclPpn,
                                 susun.bulatBase ?? 6, !!susun.bulatBiasa,
                                 { bulatHargaM2: susun.bulatHargaM2, exclTerpisah: susun.exclTerpisah,
                                   baseTanpaBulat: susun.baseTanpaBulat, hargaM2Termasuk: susun.hargaM2Termasuk });
    const dataPl = hitungDataPl(susun, hasilUnit.factored, irr.koef);
    const dasar = hitungPricelist(susun, dataPl);
    // Harga spesial menggantikan harganya; DPP dan nilai free PPN DTP
    // dihitung ulang dari harga itu, dengan pagu dan tarif yang sama.
    const pricelist = !set ? dasar : Object.fromEntries(
      Object.entries(dasar).map(([nama, h]) => {
        const harga = hargaSpesial(set, unit.kode, nama, h.harga);
        return [nama, harga === h.harga ? h
          : { harga, ...pajakDtp(harga, susun.pricelist.batasDtp, tarifPpn(susun)) }];
      }));
    return { unit, hasilUnit, dataPl, pricelist };
  });
  return { irr, baris, galat: periksa(susun, irr, baris) };
}

function periksa(susun: SusunPricelist, irr: HasilIrr, baris: BarisHasil[]): string[] {
  const galat: string[] = [];
  const namaSkema = new Set(susun.irr.skema.map((s) => s.nama));
  for (const s of susun.irr.skema) {
    if (!Number.isFinite(irr.koef[s.nama])) {
      galat.push(`Data (IRR): koefisien ${s.nama} tidak dapat dihitung. Periksa DP dan bulan tahapnya.`);
    }
  }
  if (!susun.irr.skema.some((s) => s.acuan)) {
    galat.push("Data (IRR): belum ada cara bayar acuan (Cash Keras).");
  }
  const kolomDp = new Set<string>();
  for (const k of susun.dataPricelist.kolom) {
    if (k.skema && !namaSkema.has(k.skema)) {
      galat.push(`Data Pricelist: kolom ${k.nama} merujuk cara bayar ${k.skema} yang tidak ada di Data (IRR).`);
    }
    if (k.dari && !kolomDp.has(k.dari)) {
      galat.push(`Data Pricelist: kolom ${k.nama} merujuk kolom ${k.dari} yang tidak ada di sebelah kirinya.`);
    }
    kolomDp.add(k.nama);
  }
  for (const k of susun.pricelist.kolom) {
    if (!kolomDp.has(k.dari)) {
      galat.push(`Pricelist: kolom ${k.nama} merujuk kolom Data Pricelist ${k.dari} yang tidak ada.`);
    }
  }
  if (!susun.unit.length) galat.push("Unit Data: belum ada unit.");
  const kode = new Map<string, number>();
  susun.unit.forEach((u, i) => {
    const n = i + 1;
    if (!u.kode.trim()) galat.push(`Unit Data baris ${n}: Code kosong.`);
    else if (kode.has(u.kode)) galat.push(`Unit Data: Code ${u.kode} tertulis dua kali (baris ${kode.get(u.kode)} dan ${n}).`);
    else kode.set(u.kode, n);
    // Unit yang harganya memang belum dikeluarkan cukup diberi catatan; ia
    // tidak ikut pricelist yang disimpan.
    if (unitBelumBerharga(u) && !u.catatan?.trim()) {
      galat.push(`Unit Data ${u.kode || `baris ${n}`}: luas atau harga tanah belum diisi. Isi harganya, atau isi catatan di bawah bila harganya memang belum dikeluarkan.`);
    }
  });
  if (baris.some((b) => !unitBelumBerharga(b.unit) && Object.values(b.pricelist).some((h) => !Number.isFinite(h.harga)))) {
    galat.push("Pricelist: ada harga yang tidak dapat dihitung.");
  }
  return galat;
}

// ── Isi awal ───────────────────────────────────────────────────────────────

/**
 * Susunan awal untuk project yang belum punya: sepuluh cara bayar dan
 * ketentuan seperti berkas PL Naraya, tanpa unit. Angka-angkanya patokan
 * bagian penjualan saat ini; semuanya dapat diubah di layarnya.
 */
/**
 * Aturan pembulatan standar untuk project baru (disepakati Oktober 2026,
 * mengikuti BIO DISTRICT): harga per m² Termasuk PPN ROUNDUP ke Rp 100.000,
 * Harga Dasar ROUNDUP ke juta, dihitung dari harga Termasuk PPN. Draf
 * project lama tidak diubah; aturannya tetap dapat diganti di langkah 2.
 */
export const ATURAN_STANDAR = {
  bulatHargaM2: 5, bulatBase: 6, bulatBiasa: false, baseTanpaBulat: false, basisExclPpn: false,
} as const satisfies Partial<SusunPricelist>;

/**
 * Hitung rumus sederhana yang ditulis orang, mis. catatan Kenaikan
 * "=1,025*1,025*1,01*1,002*1,01*1,02*1,03*1,03-1": angka (koma atau titik
 * desimal), + − × ÷ ^, kurung, dan persen. null bila bukan rumus (tanpa
 * operator, kecuali diawali "=") atau tidak dapat dihitung. Tanpa eval.
 */
export function hitungRumus(teks: string): number | null {
  let s = teks.trim().replace(/[×x]/g, "*").replace(/[÷:]/g, "/").replace(/[−–]/g, "-");
  const tegas = s.startsWith("=");
  if (tegas) s = s.slice(1);
  s = s.replace(/\s+/g, "");
  // Koma desimal Indonesia; titik ribuan tidak dipakai di rumus.
  if (s.includes(",")) s = s.replace(/,/g, ".");
  if (!s || /[^0-9.+\-*/^()%]/.test(s)) return null;
  if (!tegas && !/[0-9)%]\s*[+\-*/^]/.test(s)) return null;
  let i = 0;
  const lihat = () => s[i];
  const angkaAtauKurung = (): number => {
    if (lihat() === "(") { i++; const v = jumlah(); if (lihat() !== ")") throw 0; i++; return persen(v); }
    if (lihat() === "-") { i++; return -angkaAtauKurung(); }
    if (lihat() === "+") { i++; return angkaAtauKurung(); }
    const m = /^\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(s.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    return persen(Number(m[0]));
  };
  const persen = (v: number) => { if (lihat() === "%") { i++; return v / 100; } return v; };
  const pangkat = (): number => { const a = angkaAtauKurung(); if (lihat() === "^") { i++; return a ** pangkat(); } return a; };
  const kali = (): number => {
    let v = pangkat();
    while (lihat() === "*" || lihat() === "/") { const o = s[i++]; const b = pangkat(); v = o === "*" ? v * b : v / b; }
    return v;
  };
  const jumlah = (): number => {
    let v = kali();
    while (lihat() === "+" || lihat() === "-") { const o = s[i++]; const b = kali(); v = o === "+" ? v + b : v - b; }
    return v;
  };
  try {
    const v = jumlah();
    return i === s.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Cara bayar standar Data (IRR) (berkas data_irr_2 / Data_Irr_TSC): satu
 * kolom Data Pricelist dan satu kolom Pricelist per cara bayar.
 */
export const SKEMA_STANDAR: [string, string, number, number, number, [number, number, number, number]][] = [
  // nama, kelompok, alokasi, DP, cicilan, bulan tahap
  ["Cash Keras", "Cash", 0.07, 1, 1, [12, 18, 19, 20]],
  ["Installment 12x", "Cash", 0.04, 1, 12, [12, 18, 19, 20]],
  ["Installment 24x", "Cash", 0.08, 1, 24, [12, 18, 19, 20]],
  ["Installment 36x", "Cash", 0.25, 1, 36, [12, 18, 19, 20]],
  ["KPR Express", "KPR", 0.33, 0.1, 1, [2, 2, 2, 2]],
  ["KPR DP 10%/6x", "KPR", 0.14, 0.1, 6, [12, 18, 19, 20]],
  ["KPR DP 10%/12x", "KPR", 0.05, 0.1, 12, [12, 18, 19, 20]],
  ["KPR DP 20%/6x", "KPR", 0.04, 0.2, 6, [12, 18, 19, 20]],
];

/** Kelompok, DP dan cicilan isian awal lama (sebelum SKEMA_STANDAR). */
const SKEMA_AWAL_LAMA: [string, number, number][] = [
  ["Cash", 1, 1], ["Cash", 1, 12], ["Cash", 1, 18], ["Cash", 1, 24], ["Cash", 1, 30],
  ["KPR", 0.1, 1], ["KPR", 0, 1], ["KPR", 0.1, 4], ["KPR", 0.2, 6],
];

/**
 * Draf yang Data (IRR)-nya masih isian awal lama (dikenali dari Kelompok, DP
 * dan cicilan — namanya mungkin sudah diganti nama otomatis) mendapat cara
 * bayar standar: Data (IRR), kolom Data Pricelist, kolom Pricelist dan blok
 * S&K cara bayarnya diganti; Data Unit dan isian lain tetap.
 */
/**
 * The Sanctuary Collection saat drafnya dibuka: cara bayar standar (lihat
 * samakanIrrStandar), dan Data Harga tanpa tambahan per unit seperti lembar
 * Data Harga-nya (tambahan bawaan Rp 5 juta menjadi 0; nilai lain dibiarkan).
 */
export function samakanTsc(d: SusunPricelist): SusunPricelist {
  let s = samakanIrrStandar(d);
  const sudah = new Set(s.migrasi ?? []);
  const tandai = (x: SusunPricelist, m: string) => ({ ...x, migrasi: [...(x.migrasi ?? []), m] });
  if (!sudah.has("tsc-tambahan-0")) {
    s = tandai(s.dataPricelist.tambahan === 5_000_000
      ? { ...s, dataPricelist: { ...s.dataPricelist, tambahan: 0 } } : s, "tsc-tambahan-0");
  }
  // Installment 60x (ada di lembar Data Harga TSC): cara bayar Data (IRR)
  // Cash, DP 100%, 60x — koefisiennya dihitung tepat pada Target IRR seperti
  // cara bayar lain (atas keputusan pemakai, bukan 125% yang diketik di
  // Excel). Disisipkan sesudah Installment 36x; Allocation dibagi otomatis.
  if (!sudah.has("tsc-installment-60x")) {
    const nama = "Installment 60x";
    const ada = s.irr.skema.some((x) => x.kelompok === "Cash" && x.kali === 60)
      || s.dataPricelist.kolom.some((k) => k.nama.toLowerCase() === nama.toLowerCase());
    if (!ada) {
      const sisip = <T,>(a: T[], ke: (x: T) => boolean, x: T) => {
        const i = a.findIndex(ke);
        return i < 0 ? [...a, x] : [...a.slice(0, i + 1), x, ...a.slice(i + 1)];
      };
      const n = (x: string) => x.toLowerCase() === "installment 36x";
      s = {
        ...s,
        irr: { ...s.irr, skema: sisip(s.irr.skema, (x) => n(x.nama),
          { nama, kelompok: "Cash", alokasi: 0, dp: 1, kali: 60, bulan: [12, 18, 19, 20] }) },
        dataPricelist: { ...s.dataPricelist,
          kolom: sisip(s.dataPricelist.kolom, (k) => n(k.nama), { nama, skema: nama }) },
        pricelist: { ...s.pricelist,
          kolom: sisip(s.pricelist.kolom, (k) => n(k.nama), { nama, dari: nama, kali: 1 }) },
        tnc: { ...s.tnc, caraBayar: sisip(s.tnc.caraBayar, (c) => n(c.judul), {
          judul: "INSTALLMENT 60X", baris: [
            { label: "Booking Fee", nilai: "10 Juta", waktu: "" },
            { label: "Angsuran (DP) 1", nilai: "10% - BF", waktu: "Hari ke 14 setelah BF" },
            { label: "Angsuran 2 - 60", nilai: "90% / 59 bulan", waktu: "1 bulan setelah DP 1, dan seterusnya setiap bulan" },
          ] }) },
      };
    }
    s = tandai(s, "tsc-installment-60x");
  }
  return s;
}

export function samakanIrrStandar(d: SusunPricelist): SusunPricelist {
  const s = d.irr.skema;
  const lama = s.length === SKEMA_AWAL_LAMA.length && s.every((x, i) =>
    x.kelompok === SKEMA_AWAL_LAMA[i][0] && x.dp === SKEMA_AWAL_LAMA[i][1] && x.kali === SKEMA_AWAL_LAMA[i][2]
    && !x.hargaSesuai);
  if (!lama) return d;
  const a = susunAwal();
  return {
    ...d,
    irr: { ...d.irr, skema: a.irr.skema },
    dataPricelist: { ...d.dataPricelist, kolom: a.dataPricelist.kolom },
    pricelist: { ...d.pricelist, kolom: a.pricelist.kolom },
    tnc: { ...d.tnc, caraBayar: a.tnc.caraBayar },
  };
}

export function susunAwal(): SusunPricelist {
  const bf = (dp: string, waktuDp: string, lunas: string, waktuLunas: string,
              labelDp = "DP", labelLunas = "PELUNASAN"): BarisTnc[] => [
    { label: "Booking Fee", nilai: "10 Juta", waktu: "" },
    { label: labelDp, nilai: dp, waktu: waktuDp },
    { label: labelLunas, nilai: lunas, waktu: waktuLunas },
  ];
  const cicil = (n: number) => bf("10% - BF", "Hari ke 14 setelah BF",
    `90% / ${n - 1} bulan`, "1 bulan setelah DP 1, dan seterusnya setiap bulan",
    "Angsuran (DP) 1", `Angsuran 2 - ${n}`);
  const kprDp = (dp: number, n: number) => bf(`(${dp}% - BF) / ${n} bulan`,
    "Hari ke 14 setelah BF, dan seterusnya setiap bulan", `${100 - dp}%`, `1 bulan setelah DP ${n}`,
    `DP 1 - ${n}`, "PELUNASAN / AKAD");
  return {
    irr: {
      target: 0.09, porsiTahap: [...PORSI_AWAL], namaTahap: [...TAHAP_AWAL], periode: PERIODE_STANDAR,
      skema: SKEMA_STANDAR.map(([nama, kelompok, alokasi, dp, kali, bulan], i) =>
        ({ nama, kelompok, alokasi, dp, kali, bulan: [...bulan] as typeof bulan, ...(i === 0 && { acuan: true }) })),
    },
    unit: [],
    dataPricelist: {
      tambahan: 5_000_000,
      kolom: SKEMA_STANDAR.map(([nama]) => ({ nama, skema: nama })),
    },
    pricelist: {
      judul: "PRICELIST",
      tanggal: "",
      catatan: "Incld. Subsidi DP 10% + Biaya-biaya 7,5% (BPHTB, AJB, Notaris & Akad KPR Bank)",
      batasDtp: 2_220_000_000,
      kolom: SKEMA_STANDAR.map(([nama]) => ({ nama, dari: nama, kali: 1 })),
    },
    tnc: {
      judul: "TERM OF PAYMENT",
      caraBayar: [
        { judul: "CASH KERAS", baris: bf("30% - BF", "Hari ke 7 setelah BF", "70%", "Hari ke 7 setelah DP") },
        { judul: "INSTALLMENT 12X", baris: cicil(12) },
        { judul: "INSTALLMENT 24X", baris: cicil(24) },
        { judul: "INSTALLMENT 36X", baris: cicil(36) },
        { judul: "KPR EXPRESS", baris: bf("10% - BF", "Hari ke 14 setelah BF", "90%", "1 bulan setelah DP") },
        { judul: "KPR DP 10%/6X", baris: kprDp(10, 6) },
        { judul: "KPR DP 10%/12X", baris: kprDp(10, 12) },
        { judul: "KPR DP 20%/6X", baris: kprDp(20, 6),
          catatan: "*besaran DP ditentukan oleh plafon kredit yang diberikan oleh Bank" },
      ],
      catatan: [
        "Harga diatas sudah termasuk: PPN, Ijin Mendirikan Bangunan (IMB), biaya instalasi listrik, biaya instalasi air bersih.",
        "Harga diatas belum termasuk:\n- Cara Bayar Cash Keras, Installment 12x, Installment 24x & Installment 36x: AJB & Balik nama Sertifikat, notaris / PPAT, HGB, BPHTB, PBB, PPN BM tanah & bangunan akibat pengembangan luas bangunan sehingga masuk dalam kriteria bangunan mewah sesuai peraturan pemerintah, Iuran Pengelolaan Lingkungan; dan biaya aktivasi telepon, listrik, dan air.\n- Cara Bayar KPR: PPN, PBB, PPN BM tanah & bangunan akibat pengembangan luas bangunan sehingga masuk dalam kriteria bangunan mewah sesuai peraturan pemerintah, Iuran Pengelolaan Lingkungan, Biaya aktivasi listrik dan air.",
        "Nama blok, nomor yang tercantum pada saat tanda jadi sudah pasti dan tidak dapat diganti.",
        "Keterlambatan pembayaran akan dikenakan perhitungan denda sesuai ketentuan yang berlaku 1‰ (1 per mill) per hari.",
        "Cara pembayaran KPR harus melalui proses ke Bank yang bekerjasama dengan Pengembang.",
        "Jika terdapat selisih antara sisa hutang dengan plafon KPR yang disetujui, maka penambahan DP menjadi tanggung jawab pemesan dan dibayarkan maksimal satu minggu sebelum akad kredit.",
        "Apabila Pemesan membatalkan pemesanan dengan alasan apapun, maka seluruh jumlah uang yang telah dibayarkan oleh Pemesan kepada Penerima Pesanan tidak dapat dikembalikan dan akan diperhitungkan sebagai kompensasi ganti kerugian kepada Penerima Pesanan, Kecuali pembatalan karena KPR ditolak oleh minimal 2 (dua) pihak BANK, maka Booking Fee Hangus dan Angsuran/Down Payment dikembalikan setelah dipotong biaya Pajak yang sudah dibebankan berikut denda (apabila ada).",
        "Harga dan ketentuan diatas sewaktu-waktu dapat berubah tanpa pemberitahuan terlebih dahulu.",
      ],
      pengantarRekening: "Pembayaran dianggap sah apabila sudah masuk di rekening:",
      rekening: [],
    },
  };
}

/** Unit kosong untuk baris baru di Unit Data. */
export function unitKosong(): UnitData {
  return {
    kode: "", alamat: "", view: "", no: "", ukuran: "", phase: "1", tipe: "",
    tipeBangunan: "", view2: "", bentuk: "", subTipe: "", lt: 0, hargaTanah: 0, lb: 0,
    hargaBangunan: 0, kenaikan: 0, faktor: {}, faktorTambah: 0.02,
    special: 0, showUnit: 0,
  };
}

/**
 * Kunci pencocokan judul blok T&C dengan nama cara bayar: tanpa kata KPR,
 * spasi dan tanda baca ("KPR DP 10% - 4X" = "DP 10%/4x").
 */
export const kunciTnc = (t: string) =>
  t.replace(/\[\/?[biu]\]/gi, "").toUpperCase().replace(/\bKPR\b/g, "").replace(/[^A-Z0-9]/g, "");

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
  /** Panjang arus kas dalam bulan (lembar Excel: bulan 0 sampai 36). */
  periode: number;
  skema: SkemaIrr[];
};

/** Faktor posisi unit pada lembar Unit Data, masing-masing pecahan. */
export const FAKTOR = [
  ["singleRow", "Single Row"],
  ["unitDepan", "Unit Depan"],
  ["hdpUtara", "Hdp Utara"],
  ["hdpSelatan", "Hdp Selatan"],
  ["hdpBarat", "Hdp Barat"],
  ["hdpTimur", "Hdp Timur"],
  ["hoek", "Hoek"],
  ["hoekGarden", "Hoek Garden"],
  ["sideGarden", "Side Garden"],
  ["tusukSate", "Tusuk Sate"],
  ["roundAround", "Round Around"],
  ["luckyNumber", "Lucky Number"],
] as const;
export type KunciFaktor = (typeof FAKTOR)[number][0];

/**
 * Faktor yang hanya dipakai sebagian proyek (mis. BIO DISTRICT). Kolomnya di
 * langkah 2 tampil bila ada unit yang mengisinya, dan tidak ada di template.
 */
export const FAKTOR_OPSIONAL: ReadonlySet<KunciFaktor> = new Set(["tusukSate", "roundAround", "luckyNumber"]);

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
  faktor: Partial<Record<KunciFaktor, number>>;
  /** (+) Factor, pecahan; di Excel =1%+1%. */
  faktorTambah: number;
  /** Special, rupiah. */
  special: number;
  /** Show Unit, rupiah; ikut naik sebesar kenaikan. */
  showUnit: number;
  /** Floor (luas lantai), m²; keterangan saja (berkas BIO DISTRICT). */
  floor?: number;
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
   * harga = ROUNDUP(Factored Price × koefisien, juta) + tambahan.
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
   * luas; kosong = tidak dibulatkan. BIO DISTRICT: 5 (ratusan ribu).
   */
  bulatHargaM2?: number;
  /**
   * Harga Belum PPN dihitung sendiri dari harga per m² Excl PPN dan
   * dibulatkan seperti Base Price, bukan Termasuk PPN dibagi (1 + PPN).
   * BIO DISTRICT: ya.
   */
  exclTerpisah?: boolean;
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
  for (let t = 1; t <= irr.periode; t++) {
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
 * Pasang aturan basis harga project pada draf yang belum menyatakannya:
 * Permai Indah memakai harga Excl PPN dan membulatkan Base Price biasa
 * (ROUND) ke puluhan ribu; project lain Incl PPN, dibulatkan ke atas ke
 * jutaan. Aturan yang sudah dinyatakan draf dibiarkan.
 */
export function basisProject<
  T extends Pick<SusunPricelist, "basisExclPpn" | "bulatBase" | "bulatBiasa" | "bulatHargaM2" | "exclTerpisah">,
>(slug: string | null | undefined, data: T): T {
  // BIO DISTRICT: harga per m² Termasuk PPN dibulatkan ke atas ke ratusan
  // ribu, dan harga Belum PPN dihitung sendiri — seperti berkas Excel-nya.
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
  /** Factored Price. */
  factored: number;
  /** Base dan Factored Price Belum PPN yang dihitung sendiri (exclTerpisah). */
  baseExcl?: number;
  factoredExcl?: number;
};

export type OpsiHitungUnit = { bulatHargaM2?: number; exclTerpisah?: boolean };

export function hitungUnit(u: UnitData, ppn = PPN, exclPpn = false, bulat = 6,
                           bulatBiasa = false, opsi: OpsiHitungUnit = {}): HasilUnit {
  const hargaTanahPpn = u.hargaTanah * (1 + ppn);
  const hargaBangunanPpn = u.hargaBangunan * (1 + ppn);
  const m2 = (x: number) => opsi.bulatHargaM2 != null ? roundUp(x, opsi.bulatHargaM2) : x;
  // Pricelist Permai Indah mengalikan luas dengan harga Excl PPN.
  const [tanah, bangunan] = exclPpn ? [u.hargaTanah, u.hargaBangunan]
    : [m2(hargaTanahPpn), m2(hargaBangunanPpn)];
  const bulatkan = (x: number) => (bulatBiasa ? roundExcel : roundUp)(x * (1 + u.kenaikan), bulat);
  const base = bulatkan(u.lt * tanah + u.lb * bangunan)
    / (u.pembagiIncl && !exclPpn ? u.pembagiIncl : 1);
  const faktor = FAKTOR.reduce((a, [k]) => a + (u.faktor[k] ?? 0), 0);
  const kaliFaktor = (b: number) => b * (1 + faktor) * (1 + u.faktorTambah)
                   * (1 + (u.biayaAjb ?? 0)) * (1 + (u.specialPersen ?? 0)) + u.special
                   + u.showUnit * (1 + u.kenaikan);
  const factored = kaliFaktor(base);
  const hasil: HasilUnit = { hargaTanahPpn, hargaBangunanPpn, base, faktor, factored };
  if (opsi.exclTerpisah && !exclPpn) {
    // Seperti Excel BIO: ROUNDUP((Tanah × harga Excl + GFA × harga Excl) × (1 + kenaikan), juta).
    hasil.baseExcl = bulatkan(u.lt * u.hargaTanah + u.lb * u.hargaBangunan);
    hasil.factoredExcl = kaliFaktor(hasil.baseExcl);
  }
  return hasil;
}

// ── 3. Data Pricelist ──────────────────────────────────────────────────────

/** Harga per kolom Data Pricelist untuk satu unit. */
export function hitungDataPl(
  susun: SusunPricelist, factored: number, koef: Record<string, number>,
): Record<string, number> {
  const harga: Record<string, number> = {};
  for (const k of susun.dataPricelist.kolom) {
    if (k.skema) {
      const c = koef[k.skema];
      harga[k.nama] = Number.isFinite(c)
        ? roundUp(factored * c, 6) + susun.dataPricelist.tambahan : NaN;
    } else if (k.dari) {
      const asal = harga[k.dari];
      harga[k.nama] = asal == null ? NaN : roundUp(asal * (k.kali ?? 1), 6);
    }
    // Kenaikan khusus cara bayar ini.
    const h = harga[k.nama];
    if (Number.isFinite(h)) {
      harga[k.nama] = tingkatNaik(k).reduce(
        (x, t) => (t.persen ? roundUp(x * (1 + t.persen), 6) : x) + (t.rp || 0), h);
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
                                 { bulatHargaM2: susun.bulatHargaM2, exclTerpisah: susun.exclTerpisah });
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
export function susunAwal(): SusunPricelist {
  const sk = (nama: string, kelompok: string, alokasi: number, dp: number,
              kali: number, bulan: [number, number, number, number],
              acuan?: boolean): SkemaIrr =>
    ({ nama, kelompok, alokasi, dp, kali, bulan, ...(acuan && { acuan }) });
  const bangun: [number, number, number, number] = [12, 18, 19, 20];
  const bf = (dp: string, waktuDp: string, lunas: string, waktuLunas: string,
              labelDp = "DP", labelLunas = "PELUNASAN"): BarisTnc[] => [
    { label: "Booking Fee", nilai: "10 Juta", waktu: "" },
    { label: labelDp, nilai: dp, waktu: waktuDp },
    { label: labelLunas, nilai: lunas, waktu: waktuLunas },
  ];
  const cicil = (n: number) => bf("10% - BF", "Hari ke 14 setelah BF",
    `90% / ${n - 1} bulan`, "1 bulan setelah DP 1, dan seterusnya setiap bulan",
    "Angsuran (DP) 1", `Angsuran 2 - ${n}`);
  return {
    irr: {
      target: 0.09, porsiTahap: [...PORSI_AWAL], namaTahap: [...TAHAP_AWAL], periode: 36,
      skema: [
        sk("Cash Keras", "Cash", 0.07, 1, 1, bangun, true),
        sk("Cicilan 12x", "Cash", 0.04, 1, 12, bangun),
        sk("Cicilan 18x", "Cash", 0.05, 1, 18, bangun),
        sk("Cicilan 24x", "Cash", 0.08, 1, 24, bangun),
        sk("Cicilan 30x", "Cash", 0.25, 1, 30, bangun),
        sk("KPR Express", "KPR", 0.33, 0.1, 1, [2, 2, 2, 2]),
        sk("KPR DP 0% Express", "KPR", 0.08, 0, 1, bangun),
        sk("DP 10%/4x", "KPR", 0.05, 0.1, 4, bangun),
        sk("DP 20%/6x", "KPR", 0.05, 0.2, 6, bangun),
      ],
    },
    unit: [],
    dataPricelist: {
      tambahan: 5_000_000,
      kolom: [
        { nama: "Cash Keras", skema: "Cash Keras" },
        { nama: "Cicilan 12x", skema: "Cicilan 12x" },
        { nama: "Cicilan 18x", skema: "Cicilan 18x" },
        { nama: "Cicilan 24x", skema: "Cicilan 24x" },
        { nama: "Cicilan 30x", skema: "Cicilan 30x" },
        { nama: "KPR Express", skema: "KPR Express" },
        { nama: "BANK KPR - DP 10% (-UTJ)", dari: "KPR Express", kali: 1.12 },
        { nama: "KPR DP 0% Express", skema: "KPR DP 0% Express" },
        { nama: "DP 10%/4x", skema: "DP 10%/4x" },
        { nama: "DP 20%/6x", skema: "DP 20%/6x" },
      ],
    },
    pricelist: {
      judul: "PRICELIST",
      tanggal: "",
      catatan: "Incld. Subsidi DP 10% + Biaya-biaya 7,5% (BPHTB, AJB, Notaris & Akad KPR Bank)",
      batasDtp: 2_220_000_000,
      kolom: [
        { nama: "Cash Keras", dari: "Cash Keras", kali: 1 },
        { nama: "Cicilan 12X", dari: "Cicilan 12x", kali: 1 },
        { nama: "Cicilan 18X", dari: "Cicilan 18x", kali: 1 },
        { nama: "Cicilan 24X", dari: "Cicilan 24x", kali: 1 },
        { nama: "Cicilan 30X", dari: "Cicilan 30x", kali: 1 },
        { nama: "KPR Express", dari: "KPR Express", kali: 1.115 },
        { nama: "BANK KPR - DP 10% (KPR REGULAR)", dari: "BANK KPR - DP 10% (-UTJ)", kali: 1.115 },
        { nama: "KPR DP 0% Express", dari: "KPR DP 0% Express", kali: 1 },
        { nama: "DP 10%/4x", dari: "DP 10%/4x", kali: 1 },
        { nama: "DP 20%/6x", dari: "DP 20%/6x", kali: 1 },
      ],
    },
    tnc: {
      judul: "TERM OF PAYMENT",
      caraBayar: [
        { judul: "CASH KERAS", baris: bf("30% - BF", "Hari ke 7 setelah BF", "70%", "Hari ke 7 setelah DP") },
        { judul: "CICILAN 12X", baris: cicil(12) },
        { judul: "CICILAN 18X", baris: cicil(18) },
        { judul: "CICILAN 24X", baris: cicil(24) },
        { judul: "CICILAN 30X", baris: cicil(30) },
        { judul: "KPR EXPRESS", baris: bf("10% - BF", "Hari ke 14 setelah BF", "90%", "1 bulan setelah DP") },
        { judul: "BANK KPR - DP 10% (KPR REGULAR)", baris: bf("10% - BF", "Hari ke 14 setelah BF", "90%", "1 bulan setelah DP") },
        { judul: "KPR DP 10% - 4X", baris: bf("(10% - BF) / 4 bulan", "Hari ke 14 setelah BF, dan seterusnya setiap bulan", "90%", "1 bulan setelah DP 4", "DP 1 - 4", "PELUNASAN / AKAD") },
        { judul: "KPR DP 20% - 6X", baris: bf("(20% - BF) / 6 bulan", "Hari ke 14 setelah BF, dan seterusnya setiap bulan", "80%", "1 bulan setelah DP 6", "DP 1 - 6", "PELUNASAN / AKAD"),
          catatan: "*besaran DP ditentukan oleh plafon kredit yang diberikan oleh Bank" },
        { judul: "KPR DP 0% Express", baris: [
          { label: "Booking Fee", nilai: "10 Juta", waktu: "" },
          { label: "PELUNASAN / AKAD", nilai: "100% - BF", waktu: "1 bulan setelah BF" }] },
      ],
      catatan: [
        "Harga diatas sudah termasuk: PPN, Ijin Mendirikan Bangunan (IMB), biaya instalasi listrik, biaya instalasi air bersih.",
        "Harga diatas belum termasuk:\n- Cara Bayar Cash Keras, Cicilan 12x, Cicilan 18x, Cicilan 24x & Cicilan 30x: AJB & Balik nama Sertifikat, notaris / PPAT, HGB, BPHTB, PBB, PPN BM tanah & bangunan akibat pengembangan luas bangunan sehingga masuk dalam kriteria bangunan mewah sesuai peraturan pemerintah, Iuran Pengelolaan Lingkungan; dan biaya aktivasi telepon, listrik, dan air.\n- Cara Bayar KPR EXPRESS & BANK KPR - DP 10% (KPR REGULAR): PPN, PBB, PPN BM tanah & bangunan akibat pengembangan luas bangunan sehingga masuk dalam kriteria bangunan mewah sesuai peraturan pemerintah, Iuran Pengelolaan Lingkungan, Biaya aktivasi listrik dan air.",
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

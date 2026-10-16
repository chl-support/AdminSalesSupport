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
] as const;
export type KunciFaktor = (typeof FAKTOR)[number][0];

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
};

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
};

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
};

export type SusunPricelist = {
  /**
   * Tarif PPN, pecahan; kosong = 11% (PPN). Dipakai untuk harga per m²
   * termasuk PPN di Unit Data serta DPP dan Nilai Free PPN DTP di Pricelist,
   * supaya perubahan tarif dari pemerintah cukup diubah di satu tempat.
   */
  ppn?: number;
  /** Catatan bebas di langkah 2 Unit Data, ikut tersimpan bersama draf. */
  catatanUnit?: string;
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
};

export function hitungUnit(u: UnitData, ppn = PPN): HasilUnit {
  const hargaTanahPpn = u.hargaTanah * (1 + ppn);
  const hargaBangunanPpn = u.hargaBangunan * (1 + ppn);
  const base = roundUp((u.lt * hargaTanahPpn + u.lb * hargaBangunanPpn)
                       * (1 + u.kenaikan), 6);
  const faktor = FAKTOR.reduce((a, [k]) => a + (u.faktor[k] ?? 0), 0);
  const factored = base * (1 + faktor) * (1 + u.faktorTambah) + u.special
                   + u.showUnit * (1 + u.kenaikan);
  return { hargaTanahPpn, hargaBangunanPpn, base, faktor, factored };
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
      : k.kali === 1 ? asal : roundExcel(asal * k.kali, 6);
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

export function hitungSemua(susun: SusunPricelist): HasilSusun {
  const irr = hitungIrr(susun.irr);
  const baris = susun.unit.map((unit) => {
    const hasilUnit = hitungUnit(unit, tarifPpn(susun));
    const dataPl = hitungDataPl(susun, hasilUnit.factored, irr.koef);
    return { unit, hasilUnit, dataPl, pricelist: hitungPricelist(susun, dataPl) };
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
    if (!(u.lt > 0) || !(u.hargaTanah > 0)) galat.push(`Unit Data ${u.kode || `baris ${n}`}: luas atau harga tanah belum diisi.`);
  });
  if (baris.some((b) => Object.values(b.pricelist).some((h) => !Number.isFinite(h.harga)))) {
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

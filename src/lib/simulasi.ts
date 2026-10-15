/**
 * Simulasi cara bayar dan NPV — untuk seluruh project.
 *
 * Salinan model yang selama ini hidup di berkas Excel "Simulation TOP Naraya":
 * satu lembar masukan, sepuluh lembar jadwal pembayaran, dan sepuluh lembar
 * NPV yang berpasangan dengannya. Yang dipindahkan ke sini perhitungannya,
 * bukan tata letaknya — rumusnya disalin apa adanya, termasuk bagian yang
 * tampak ganjil, karena angka yang keluar dari layar ini dibandingkan orang
 * dengan angka yang keluar dari berkas itu.
 *
 * Dua hal yang sengaja ditiru persis, meskipun dapat ditulis lebih rapi:
 *
 *   1. PPN DTP dialokasikan per termin secara berurutan, dan termin yang
 *      pendahulunya belum kena DTP menghitung pajaknya atas gabungan dirinya
 *      dan pendahulunya. Itulah cara booking fee ikut terbawa.
 *   2. Alokasinya dipotong oleh sisa pagu, dan pagu itulah yang memberlakukan
 *      tarif — bukan tarif yang dikalikan pada tiap barisnya.
 *
 * Tenor simulasi KPR sempat ditulis 4, 9, 14, 19, dan 24 tahun — begitulah
 * sel-sel tenor di berkasnya terbaca, sebab tersimpan sebagai tanggal. Lembar
 * cetak "Simulasi Hitungan Rumah" dari berkas yang sama menuliskan 5, 10, 15,
 * 20, dan 25 tahun, dan angsurannya cocok sampai rupiah terakhir dengan tenor
 * itu (NS-NR1-01, BANK KPR, pokok 1.874.612.613, 4,65%: 5 tahun 35.076.445,
 * 25 tahun 10.579.952). Yang dipakai kini tenor cetakan itu.
 */

import { SKEMA } from "./pricelist-naraya";

export { SKEMA };

/**
 * Nama cara bayar, persis seperti kepala kolom pricelist-nya.
 *
 * Sengaja teks bebas, bukan daftar tetap: tiap project mengunggah
 * pricelist-nya sendiri, dan nama kolomnya ditulis bagian penjualan project
 * itu. Bentuk jadwalnya dibaca dari namanya lewat bentukSkema().
 */
export type Skema = string;

/** Satu baris pricelist: satu unit beserta harganya per cara bayar. */
export type UnitHarga = {
  kode: string;
  alamat: string;
  tipe: string | number;
  /** Luas tanah, m2. Kosong bila pricelist-nya tidak menuliskannya. */
  lt: number | null;
  /** Luas bangunan, m2. */
  lb: number | null;
  /** Harga per cara bayar. Cara bayar yang tidak tersedia tidak ada di sini. */
  harga: Record<string, number>;
  /**
   * Keterangan unit yang dituliskan pricelist di samping kolom wajibnya —
   * Phase, Ukuran, View, Sub-Tipe. Hanya ditampilkan; tidak ikut menghitung.
   */
  phase?: string;
  ukuran?: string;
  view?: string;
  subTipe?: string;
  /**
   * DPP dan nilai free PPN DTP per cara bayar, bila pricelist-nya menuliskan
   * kolom itu di sebelah kanan kolom harganya. Hanya ditampilkan; simulasi
   * menghitung PPN DTP-nya sendiri dari tarif yang berlaku.
   */
  pajak?: Record<string, { dpp: number | null; dtp: number | null }>;
};

/**
 * Bentuk jadwal sebuah cara bayar.
 *
 * Kesepuluh cara bayar Naraya dipetakan ke bentuk yang jadwalnya sama persis
 * dengan berkas Excel-nya. Project lain memakai nama yang mengikuti pola yang
 * sama — "CICILAN 36x", "KPR DP 15%/3x" — dan mendapat jadwal yang dibangun
 * dengan aturan yang sama.
 */
export type Bentuk =
  | { jenis: "cash" }
  /** Uang muka 10% lalu sisanya dicicil; `kali` = banyak termin seluruhnya. */
  | { jenis: "cicilan"; kali: number }
  /** Uang muka sekali, lalu pelunasan lewat bank. */
  | { jenis: "kpr"; muka: number }
  /** Tanpa uang muka: booking fee lalu pelunasan lewat bank. */
  | { jenis: "kpr-dp0" }
  /** Uang muka dicicil `kali` kali, lalu pelunasan lewat bank. */
  | { jenis: "kpr-cicil"; muka: number; kali: number };

/**
 * Bentuk jadwal dibaca dari nama kolomnya. null bila namanya tidak dikenali —
 * pricelist yang memuat kolom seperti itu ditolak saat diunggah, bukan
 * dihitung dengan jadwal tebakan.
 */
export function bentukSkema(nama: string): Bentuk | null {
  const n = nama.toLowerCase().replace(/\s+/g, " ");
  if (/\b(cash|tunai|keras)\b/.test(n) && !/kpr|kpa/.test(n)) return { jenis: "cash" };
  if (/cicilan|angsuran|installment|bertahap/.test(n) && !/kpr|kpa/.test(n)) {
    const x = /(\d+)\s*(x|kali)\b/.exec(n);
    const kali = x ? Number(x[1]) : 0;
    return kali >= 2 ? { jenis: "cicilan", kali } : null;
  }
  // "DP 10%/4x" tanpa kata KPR: DP yang dicicil lalu pelunasan bank, sama
  // dengan "KPR DP 10%/4x". Pricelist Naraya menuliskannya demikian.
  if (/\b(kpr|kpa)\b/.test(n) || /^dp\s*\d+(?:[.,]\d+)?\s*%\s*\/\s*\d+\s*x\b/.test(n)) {
    const dp = /dp\s*(\d+(?:[.,]\d+)?)\s*%/.exec(n);
    const muka = dp ? Number(dp[1].replace(",", ".")) / 100 : 0.1;
    if (muka === 0) return { jenis: "kpr-dp0" };
    if (!(muka > 0 && muka < 1)) return null;
    const x = /(\d+)\s*x\b/.exec(n);
    return x && Number(x[1]) >= 1
      ? { jenis: "kpr-cicil", muka, kali: Number(x[1]) }
      : { jenis: "kpr", muka };
  }
  return null;
}

/** Ringkasan bentuk jadwal untuk dibaca orang, mis. di pratinjau unggahan. */
export function uraianBentuk(b: Bentuk): string {
  const pct = (x: number) => `${+(x * 100).toFixed(2)}%`;
  switch (b.jenis) {
    case "cash": return "Cash: 30% di hari ke-7, pelunasan di hari ke-14";
    case "cicilan": return `Cicilan ${b.kali}x: DP 10% lalu ${b.kali - 1}x angsuran bulanan`;
    case "kpr": return `KPR: DP ${pct(b.muka)} sekali, pelunasan bank sebulan kemudian`;
    case "kpr-dp0": return "KPR DP 0%: booking fee, pelunasan bank sebulan kemudian";
    case "kpr-cicil": return `KPR: DP ${pct(b.muka)} dicicil ${b.kali}x, lalu pelunasan bank`;
  }
}

/**
 * Tarif PPN ditanggung pemerintah per periode, beserta pagunya.
 *
 * Disalin dari lembar "Tarif PPN DTP". Harga Jual Max dan Max PPN DTP di sana
 * ditulis sebagai 5 dan 2 miliar dikali 1,11 — yaitu batas sebelum PPN,
 * dinaikkan menjadi batas sesudah PPN. Dituliskan di sini sebagai hasilnya
 * supaya yang membaca tidak perlu menghitung 1,11 di kepalanya.
 */
/** Satu periode PPN DTP. Tarif sebagai pecahan: 1 berarti 100%. */
export type TarifDtp = {
  nama: string; awal: string; akhir: string; tarif: number;
  hargaJualMax: number; maxDtp: number;
  /** Dasar peraturannya, mis. nomor PMK. Hanya keterangan. */
  peraturan?: string | null;
};

/**
 * Isi awal tabel Tarif PPN DTP. Tabel yang berlaku disimpan di basis data dan
 * diubah dari layar Simulasi (src/lib/tarif-dtp.ts); daftar ini dipakai bila
 * tabelnya belum pernah diisi, dan oleh uji yang mencocokkan berkas Excel.
 */
export const TARIF_PPN_DTP: readonly TarifDtp[] = [
  { nama: "Tahap I", awal: "2025-01-01", akhir: "2025-06-30", tarif: 0.5,
    hargaJualMax: 5_000_000_000 * 1.11, maxDtp: 2_000_000_000 * 1.11 },
  { nama: "Tahap II", awal: "2026-01-01", akhir: "2026-12-31", tarif: 1,
    hargaJualMax: 5_000_000_000 * 1.11, maxDtp: 2_000_000_000 * 1.11 },
];

/** Bunga yang dipakai mendiskontokan arus kas. Tetap 12%, seperti di berkasnya. */
export const BUNGA_NPV = 0.12;

/** Tenor yang ditawarkan pada simulasi angsuran KPR, dalam tahun. */
export const TENOR_KPR = [5, 10, 15, 20, 25] as const;

/** Skema yang jadwalnya berujung pada pelunasan lewat bank. */
export const lewatKpr = (s: Skema) => {
  const b = bentukSkema(s);
  return !!b && b.jenis.startsWith("kpr");
};

export type Termin = {
  ket: string;
  /** Tanggal jatuh tempo, tengah malam UTC. */
  tgl: Date;
  /** Selisih hari dari tanggal booking. */
  hari: number;
  nilai: number;
  /** Nilai setelah didiskontokan ke tanggal booking. */
  pv: number;
  /** Bagian PPN yang ditanggung pemerintah. */
  dtp: number;
  /** Yang ditagihkan kepada konsumen: nilai dikurangi DTP. */
  tagihan: number;
};

export type Hasil = {
  unit: UnitHarga;
  skema: Skema;
  /** Kolom pricelist asal harganya; sama dengan `skema` kecuali diminta lain. */
  skemaHarga: Skema;
  hargaPricelist: number;
  /** Penambahan harga dalam rupiah, di luar pricelist. */
  tambahan: number;
  diskon: number;
  hargaTransaksi: number;
  bungaNpv: number;
  /** Tarif DTP yang berlaku pada periode jatuh tempo terakhir. */
  tarifDtp: number;
  /** Dasar pengenaan setelah dipotong pagu. */
  dasarDtp: number;
  /** Pagu PPN DTP untuk seluruh jadwal. */
  totalDtp: number;
  /** Jadwalnya disunting tangan, bukan jadwal bawaan cara bayarnya. */
  jadwalDisunting: boolean;
  termin: Termin[];
  jumlahNilai: number;
  jumlahPv: number;
  jumlahTagihan: number;
  jumlahDtp: number;
  /** jumlahPv / jumlahNilai — seberapa besar nilai sekarang terhadap nominalnya. */
  rasioPv: number;
  /** Angsuran bulanan per tenor, hanya untuk skema yang lewat KPR. */
  angsuran: { tahun: number; perBulan: number }[];
};

/** Tengah malam UTC pada tanggal yang sama, supaya selisih hari bulat. */
const hari0 = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/** Tanggal yang sudah tengah malam UTC dibiarkan; selainnya dibulatkan ke harinya. */
const hari0utc = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const tambahHari = (d: Date, n: number) =>
  new Date(d.getTime() + n * 86_400_000);

/**
 * EDATE: tanggal yang sama n bulan kemudian.
 *
 * Tanggal yang tidak ada pada bulan tujuan mundur ke hari terakhir bulan itu —
 * 31 Januari ditambah satu bulan menjadi 28 atau 29 Februari, bukan 2 atau 3
 * Maret. Tanpa aturan itu, jadwal yang dimulai akhir bulan melompat ke bulan
 * berikutnya dan satu termin hilang dari hitungan bulannya.
 */
const tambahBulan = (d: Date, n: number) => {
  const th = d.getUTCFullYear(), bl = d.getUTCMonth(), tg = d.getUTCDate();
  const akhir = new Date(Date.UTC(th, bl + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(th, bl + n, Math.min(tg, akhir)));
};

const selisihHari = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / 86_400_000);

/** Satu baris jadwal sebelum PV dan DTP dihitung. */
export type Kasar = { ket: string; tgl: Date; nilai: number };

/**
 * Jadwal pembayaran satu skema.
 *
 * Satu-satunya tempat yang mengetahui bentuk tiap skema. Ditulis sebagai
 * daftar termin, bukan rumus per sel seperti di berkasnya — tetapi angka,
 * persentase, dan jarak harinya sama persis.
 */
function jadwal(skema: Skema, h: number, booking: Date): Kasar[] {
  const bf = (n: number): Kasar => ({ ket: "Booking Fee", tgl: booking, nilai: n });

  // Cicilan bulanan: uang muka 10% pada hari ke-14, sisanya 90% dibagi rata
  // sebanyak termin yang tersisa, sebulan sekali sejak uang mukanya.
  const cicilan = (sisa: number): Kasar[] => {
    const p1 = tambahHari(booking, 14);
    const baris: Kasar[] = [
      bf(10_000_000),
      { ket: "Pembayaran 1", tgl: p1, nilai: h * 0.1 - 10_000_000 },
    ];
    for (let i = 1; i <= sisa; i++) {
      baris.push({
        ket: i === sisa ? "Pelunasan" : `Pembayaran ${i + 1}`,
        tgl: tambahBulan(p1, i),
        nilai: (h * 0.9) / sisa,
      });
    }
    return baris;
  };

  // Uang muka sekali di hari ke-14, lalu pelunasan lewat bank sebulan sesudahnya.
  const kprSekali = (muka: number): Kasar[] => {
    const p1 = tambahHari(booking, 14);
    return [
      bf(10_000_000),
      { ket: "Pembayaran 1", tgl: p1, nilai: h * muka - 10_000_000 },
      { ket: "Pelunasan KPR", tgl: tambahBulan(p1, 1), nilai: h * (1 - muka) },
    ];
  };

  // Uang muka dicicil n kali, lalu pelunasan lewat bank.
  const kprCicil = (muka: number, n: number): Kasar[] => {
    const p1 = tambahHari(booking, 14);
    const baris: Kasar[] = [bf(5_000_000)];
    for (let i = 0; i < n; i++) {
      baris.push({
        ket: `Pembayaran ${i + 1}`,
        tgl: i === 0 ? p1 : tambahBulan(p1, i),
        nilai: (h * muka - 5_000_000) / n,
      });
    }
    baris.push({
      ket: "Pelunasan KPR", tgl: tambahBulan(p1, n), nilai: h * (1 - muka),
    });
    return baris;
  };

  const b = bentukSkema(skema);
  if (!b) throw new Error(`Bentuk jadwal cara bayar "${skema}" tidak dikenali.`);
  switch (b.jenis) {
    case "cash": {
      const p1 = tambahHari(booking, 7);
      return [
        bf(10_000_000),
        { ket: "Pembayaran 1", tgl: p1, nilai: h * 0.3 - 10_000_000 },
        { ket: "Pelunasan", tgl: tambahHari(p1, 7), nilai: h * 0.7 },
      ];
    }
    // "CICILAN 12x" = uang muka ditambah 11 angsuran.
    case "cicilan": return cicilan(b.kali - 1);
    case "kpr": return kprSekali(b.muka);
    case "kpr-dp0": {
      const bf0 = 5_000_000;
      return [
        bf(bf0),
        { ket: "Pelunasan KPR", tgl: tambahBulan(booking, 1), nilai: h - bf0 },
      ];
    }
    case "kpr-cicil": return kprCicil(b.muka, b.kali);
  }
}

/**
 * Pagu PPN DTP untuk satu harga transaksi pada satu tanggal.
 *
 * Harga di atas Harga Jual Max tidak mendapat DTP sama sekali — bukan
 * mendapat DTP sebesar pagunya. Di antara Max PPN DTP dan Harga Jual Max,
 * yang dikenakan pagunya.
 */
function paguDtp(h: number, jatuhTempoTerakhir: Date, daftar: readonly TarifDtp[]) {
  const t = jatuhTempoTerakhir.toISOString().slice(0, 10);
  const p = daftar.find((x) => x.awal <= t && t <= x.akhir);
  if (!p) return { tarif: 0, dasar: 0, total: 0 };
  const dasar = h <= 0 ? 0
    : h > p.hargaJualMax ? 0
    : h > p.maxDtp ? p.maxDtp
    : h;
  return { tarif: p.tarif, dasar, total: Math.round((dasar / 1.11) * 0.11 * p.tarif) };
}

/** PMT Excel: angsuran tetap untuk pokok sebesar `pokok`. */
export function angsuranBulanan(pokok: number, bungaSetahun: number, tahun: number) {
  const r = bungaSetahun / 12, n = tahun * 12;
  if (n <= 0) return 0;
  if (r === 0) return pokok / n;
  return (pokok * r) / (1 - Math.pow(1 + r, -n));
}

export function hitung(
  { unit, skema, skemaHarga, tambahan = 0, diskon, bungaKpr, tanggal,
    jadwalManual, tarifDtp = TARIF_PPN_DTP }: {
    unit: UnitHarga;
    /** Cara bayar yang menentukan bentuk jadwalnya. */
    skema: Skema;
    /**
     * Kolom pricelist yang harganya dipakai, bila berbeda dari cara bayarnya —
     * mis. konsumen meminta jadwal BANK KPR dengan harga PL Cash Keras.
     * Kosong berarti harga cara bayar itu sendiri.
     */
    skemaHarga?: Skema;
    /**
     * Penambahan harga dalam rupiah — biaya di luar pricelist yang disepakati
     * pada unit ini. Ditambahkan pada harga pricelist, sedangkan diskon tetap
     * dihitung dari harga pricelist saja:
     *
     *     harga transaksi = harga PL + penambahan − (harga PL × diskon)
     *
     * Urutan itu diminta bagian penjualan: persentase diskon yang dijanjikan
     * kepada konsumen melekat pada harga pricelist, dan tidak boleh ikut
     * membesar hanya karena ada penambahan harga.
     */
    tambahan?: number;
    /** Potongan atas harga pricelist, sebagai pecahan: 0,05 berarti 5%. */
    diskon: number;
    /** Bunga KPR setahun, dipakai hanya untuk simulasi angsuran. */
    bungaKpr: number;
    tanggal: Date;
    /**
     * Jadwal yang disunting tangan di layar Simulasi, menggantikan jadwal
     * bawaan cara bayarnya. PV, DTP, tagihan, dan angsuran dihitung atasnya
     * dengan aturan yang sama; urutannya dipakai apa adanya, sebab alokasi
     * DTP berjalan menurut urutan termin.
     */
    jadwalManual?: Kasar[];
    /** Tabel Tarif PPN DTP yang berlaku; bawaan TARIF_PPN_DTP. */
    tarifDtp?: readonly TarifDtp[];
  },
): Hasil {
  const booking = hari0(tanggal);
  const kolomHarga = skemaHarga || skema;
  const hargaPricelist = unit.harga[kolomHarga];
  if (!(hargaPricelist > 0)) {
    throw new Error(`Unit ${unit.kode} tidak punya harga untuk ${kolomHarga}.`);
  }
  const potongan = hargaPricelist * diskon;
  const h = hargaPricelist + tambahan - potongan;

  const kasar = jadwalManual?.length
    ? jadwalManual.map((k) => ({ ...k, tgl: hari0utc(k.tgl) }))
    : jadwal(skema, h, booking);
  const terakhir = kasar.reduce((a, b) => (b.tgl > a ? b.tgl : a), kasar[0].tgl);
  const pagu = paguDtp(h, terakhir, tarifDtp);

  const termin: Termin[] = [];
  let terpakai = 0;
  kasar.forEach((k, i) => {
    const hari = selisihHari(k.tgl, booking);
    const pv = k.nilai / Math.pow(1 + BUNGA_NPV / 365, hari);

    // Booking fee tidak dikenai DTP; pajaknya ikut pada termin sesudahnya,
    // lewat cabang "pendahulunya nol" di bawah.
    let dtp = 0;
    if (i > 0) {
      const sebelum = termin[i - 1];
      const dasar = sebelum.dtp === 0 ? sebelum.nilai + k.nilai : k.nilai;
      const sisa = pagu.total - terpakai;
      dtp = Math.min(Math.round((dasar / 1.11) * 0.11), sisa);
    }
    terpakai += dtp;
    termin.push({ ket: k.ket, tgl: k.tgl, hari, nilai: k.nilai, pv, dtp,
                  tagihan: k.nilai - dtp });
  });

  const jumlah = (f: (t: Termin) => number) =>
    termin.reduce((a, t) => a + f(t), 0);
  const jumlahNilai = jumlah((t) => t.nilai);
  const jumlahPv = jumlah((t) => t.pv);

  // Pokok yang dibiayai bank: tagihan pada termin pelunasannya.
  const pelunasan = termin.find((t) => t.ket.startsWith("Pelunasan"));
  const angsuran = lewatKpr(skema) && pelunasan
    ? TENOR_KPR.map((tahun) => ({
        tahun, perBulan: angsuranBulanan(pelunasan.tagihan, bungaKpr, tahun),
      }))
    : [];

  return {
    unit, skema, skemaHarga: kolomHarga, hargaPricelist, tambahan,
    diskon: potongan, hargaTransaksi: h,
    bungaNpv: BUNGA_NPV,
    tarifDtp: pagu.tarif, dasarDtp: pagu.dasar, totalDtp: pagu.total,
    jadwalDisunting: !!jadwalManual?.length,
    termin, jumlahNilai, jumlahPv,
    jumlahTagihan: jumlah((t) => t.tagihan), jumlahDtp: jumlah((t) => t.dtp),
    rasioPv: jumlahNilai === 0 ? 0 : jumlahPv / jumlahNilai,
    angsuran,
  };
}

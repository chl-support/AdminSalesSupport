/**
 * Simulasi cara bayar dan NPV — Naraya Serpong.
 *
 * Salinan model yang selama ini hidup di berkas Excel "Simulation TOP Naraya":
 * satu lembar masukan, sepuluh lembar jadwal pembayaran, dan sepuluh lembar
 * NPV yang berpasangan dengannya. Yang dipindahkan ke sini perhitungannya,
 * bukan tata letaknya — rumusnya disalin apa adanya, termasuk bagian yang
 * tampak ganjil, karena angka yang keluar dari layar ini dibandingkan orang
 * dengan angka yang keluar dari berkas itu.
 *
 * Tiga hal yang sengaja ditiru persis, meskipun dapat ditulis lebih rapi:
 *
 *   1. PPN DTP dialokasikan per termin secara berurutan, dan termin yang
 *      pendahulunya belum kena DTP menghitung pajaknya atas gabungan dirinya
 *      dan pendahulunya. Itulah cara booking fee ikut terbawa.
 *   2. Alokasinya dipotong oleh sisa pagu, dan pagu itulah yang memberlakukan
 *      tarif — bukan tarif yang dikalikan pada tiap barisnya.
 *   3. Tenor simulasi KPR 4, 9, 14, 19, dan 24 tahun. Angka itu memang yang
 *      tertulis di berkasnya.
 */

import { SKEMA, type Skema, type UnitHarga } from "./pricelist-naraya";

export { SKEMA, type Skema };

/**
 * Tarif PPN ditanggung pemerintah per periode, beserta pagunya.
 *
 * Disalin dari lembar "Tarif PPN DTP". Harga Jual Max dan Max PPN DTP di sana
 * ditulis sebagai 5 dan 2 miliar dikali 1,11 — yaitu batas sebelum PPN,
 * dinaikkan menjadi batas sesudah PPN. Dituliskan di sini sebagai hasilnya
 * supaya yang membaca tidak perlu menghitung 1,11 di kepalanya.
 */
export const TARIF_PPN_DTP = [
  { nama: "Tahap I", awal: "2025-01-01", akhir: "2025-06-30", tarif: 0.5,
    hargaJualMax: 5_000_000_000 * 1.11, maxDtp: 2_000_000_000 * 1.11 },
  { nama: "Tahap II", awal: "2026-01-01", akhir: "2026-12-31", tarif: 1,
    hargaJualMax: 5_000_000_000 * 1.11, maxDtp: 2_000_000_000 * 1.11 },
] as const;

/** Bunga yang dipakai mendiskontokan arus kas. Tetap 12%, seperti di berkasnya. */
export const BUNGA_NPV = 0.12;

/** Tenor yang ditawarkan pada simulasi angsuran KPR, dalam tahun. */
export const TENOR_KPR = [4, 9, 14, 19, 24] as const;

/** Skema yang jadwalnya berujung pada pelunasan lewat bank. */
const LEWAT_KPR: readonly Skema[] = [
  "KPR EXPRESS", "BANK KPR - DP 10% (KPR REGULAR)", "KPR DP 0% Express",
  "KPR DP 10%/4x", "KPR DP 20%/6x",
];

export const lewatKpr = (s: Skema) => LEWAT_KPR.includes(s);

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
  hargaPricelist: number;
  diskon: number;
  hargaTransaksi: number;
  bungaNpv: number;
  /** Tarif DTP yang berlaku pada periode jatuh tempo terakhir. */
  tarifDtp: number;
  /** Dasar pengenaan setelah dipotong pagu. */
  dasarDtp: number;
  /** Pagu PPN DTP untuk seluruh jadwal. */
  totalDtp: number;
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
type Kasar = { ket: string; tgl: Date; nilai: number };

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
  const kprSekali = (): Kasar[] => {
    const p1 = tambahHari(booking, 14);
    return [
      bf(10_000_000),
      { ket: "Pembayaran 1", tgl: p1, nilai: h * 0.1 - 10_000_000 },
      { ket: "Pelunasan KPR", tgl: tambahBulan(p1, 1), nilai: h * 0.9 },
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

  switch (skema) {
    case "CASH KERAS": {
      const p1 = tambahHari(booking, 7);
      return [
        bf(10_000_000),
        { ket: "Pembayaran 1", tgl: p1, nilai: h * 0.3 - 10_000_000 },
        { ket: "Pelunasan", tgl: tambahHari(p1, 7), nilai: h * 0.7 },
      ];
    }
    case "CICILAN 12x": return cicilan(11);
    case "CICILAN 18x": return cicilan(17);
    case "CICILAN 24x": return cicilan(23);
    case "CICILAN 30x": return cicilan(29);
    case "KPR EXPRESS":
    case "BANK KPR - DP 10% (KPR REGULAR)": return kprSekali();
    case "KPR DP 0% Express": {
      const bf0 = 5_000_000;
      return [
        bf(bf0),
        { ket: "Pelunasan KPR", tgl: tambahBulan(booking, 1), nilai: h - bf0 },
      ];
    }
    case "KPR DP 10%/4x": return kprCicil(0.1, 4);
    case "KPR DP 20%/6x": return kprCicil(0.2, 6);
  }
}

/**
 * Pagu PPN DTP untuk satu harga transaksi pada satu tanggal.
 *
 * Harga di atas Harga Jual Max tidak mendapat DTP sama sekali — bukan
 * mendapat DTP sebesar pagunya. Di antara Max PPN DTP dan Harga Jual Max,
 * yang dikenakan pagunya.
 */
function paguDtp(h: number, jatuhTempoTerakhir: Date) {
  const t = jatuhTempoTerakhir.toISOString().slice(0, 10);
  const p = TARIF_PPN_DTP.find((x) => x.awal <= t && t <= x.akhir);
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
  { unit, skema, diskon, bungaKpr, tanggal }: {
    unit: UnitHarga;
    skema: Skema;
    /** Potongan atas harga pricelist, sebagai pecahan: 0,05 berarti 5%. */
    diskon: number;
    /** Bunga KPR setahun, dipakai hanya untuk simulasi angsuran. */
    bungaKpr: number;
    tanggal: Date;
  },
): Hasil {
  const booking = hari0(tanggal);
  const hargaPricelist = unit.harga[skema];
  const potongan = hargaPricelist * diskon;
  const h = hargaPricelist - potongan;

  const kasar = jadwal(skema, h, booking);
  const terakhir = kasar.reduce((a, b) => (b.tgl > a ? b.tgl : a), kasar[0].tgl);
  const pagu = paguDtp(h, terakhir);

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
    unit, skema, hargaPricelist, diskon: potongan, hargaTransaksi: h,
    bungaNpv: BUNGA_NPV,
    tarifDtp: pagu.tarif, dasarDtp: pagu.dasar, totalDtp: pagu.total,
    termin, jumlahNilai, jumlahPv,
    jumlahTagihan: jumlah((t) => t.tagihan), jumlahDtp: jumlah((t) => t.dtp),
    rasioPv: jumlahNilai === 0 ? 0 : jumlahPv / jumlahNilai,
    angsuran,
  };
}

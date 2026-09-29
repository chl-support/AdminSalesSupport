/**
 * Susunan kolom Laporan Closing Fee, Reward & Komisi.
 *
 * Terpisah dari penyusun workbook-nya di report.ts karena layar Laporan pun
 * memakainya: layar itu berjalan di peramban, sedangkan report.ts memuat
 * sambungan basis data. Disatukan, seluruh pustaka basis data ikut terbawa ke
 * peramban; dipisah dua salinan, kolom pada layar dan kolom pada berkas
 * unduhannya akan bergeser sendiri-sendiri — dan pergeseran itu tidak
 * kelihatan sampai ada yang membandingkan keduanya berdampingan.
 *
 * Bentuknya mengikuti berkas laporan yang dipakai di lapangan, sel demi sel:
 * 56 kolom (A sampai BD), kepala empat baris bertingkat, lebar tiap kolom, dan
 * bentuk tampilan angkanya.
 */

/** Akuntansi rupiah dengan lambang berkode wilayah, seperti pada berkasnya. */
export const RP = '_-[$Rp-421]* #,##0_-;-[$Rp-421]* #,##0_-;_-[$Rp-421]* "-"_-;_-@';
/** Akuntansi rupiah dengan lambang biasa — dipakai pada kolom komisi. */
export const RP2 = '_-"Rp"* #,##0_-;-"Rp"* #,##0_-;_-"Rp"* "-"_-;_-@';
export const PCT = "0.00%";
/**
 * Bentuk tanggal yang dipakai seluruh kolom tanggal.
 *
 * Berkas acuannya sendiri campur — dari 173 sel yang benar-benar bertipe
 * tanggal, 119 memakai bentuk ini, 34 memakai dd"-"mmm"-"yy, dan 20 memakai
 * [$-C09]dd-mmm-yy; sebagiannya bahkan diketik sebagai teks, bukan tanggal.
 * Campuran itu tidak ditiru: yang ditiru bentuk yang paling banyak dipakainya,
 * dan dipakai seragam. Tanggal yang tersimpan sebagai teks tidak dapat diurut
 * maupun disaring, dan itu kelemahan berkasnya, bukan bagian dari susunannya.
 */
export const TGL = "d-mmm-yy";
export const LUAS = "#,##0.00";

/**
 * Nomor kolom, memakai nama agar tidak ada angka telanjang di dalam kode.
 *
 * Angkanya adalah nomor kolom Excel: 1 = A, 56 = BD.
 */
export const K = {
  no: 1, tglKontrak: 2, tglBatal: 3, konsumen: 4, unit: 5,
  tanah: 6, bangunan: 7, caraBayar: 8, nilaiKontrak: 9,
  inhouseFee: 10, inhouseTgl: 11,
  managerFee: 12, managerTgl: 13,
  marcommFee: 14, marcommTgl: 15,
  picFee: 16, picTgl: 17,
  bonus: 18, bonusTgl: 19,
  voucher: 20, hadiah: 21, hadiahTgl: 22,
  reward: 23, rewardTgl: 24,
  terimaRp: 25, terimaPct: 26,
  komisiPct: 27, komisiNominal: 28,
  ppn: 29, pph21: 30, pph23: 31, komisiBayar: 32,
  statusKomisi: 33, tglTransferKomisi: 34,
  agen: 35, subKoordinator: 36,
  gimmickTrip: 37, gimmickHadiah: 38, gimmickTgl: 39,
  orManager: 40,      // 40..46, tujuh kolom
  orKoordinator: 47,  // 47..55, sembilan kolom
  keterangan: 56,
} as const;

export const KOLOM_TERAKHIR = K.keterangan;

/** Lebar tiap kolom, persis seperti pada berkas acuannya. */
export const LEBAR: number[] = [
  4.7, 11.7, 11.7, 38.7, 10.7, 9.7, 9.7, 29.1, 22.7, 17.7, 19.7, 17.2, 19.7,
  19.7, 19.7, 19.7, 19.7, 18.7, 19.7, 15.7, 82.1, 19.1, 15.7, 24.1, 18.7, 7.7,
  7.7, 20.7, 15.7, 22.1, 26.4, 18.7, 39.7, 22.5, 52.7, 29.7, 8.7, 11.7, 17.7,
  7.7, 19.7, 16.7, 20.6, 13.7, 16.7, 10.7, 7.7, 24.7, 16.7, 16.7, 15.7, 13.7,
  16.7, 16.7, 15.7, 80.7,
];

/** Bentuk tampilan angka tiap kolom; yang tidak disebut ditulis apa adanya. */
export const FORMAT: Record<number, string> = {
  [K.tglKontrak]: TGL, [K.tglBatal]: TGL,
  [K.tanah]: LUAS, [K.bangunan]: LUAS,
  [K.nilaiKontrak]: RP,
  [K.inhouseFee]: RP, [K.inhouseTgl]: TGL,
  [K.managerFee]: RP, [K.managerTgl]: TGL,
  [K.marcommFee]: RP, [K.marcommTgl]: TGL,
  [K.picFee]: RP, [K.picTgl]: TGL,
  [K.bonus]: RP, [K.bonusTgl]: TGL,
  [K.hadiahTgl]: TGL,
  [K.reward]: RP, [K.rewardTgl]: TGL,
  [K.terimaRp]: RP2, [K.terimaPct]: PCT,
  [K.komisiPct]: PCT, [K.komisiNominal]: RP2,
  [K.ppn]: RP2, [K.pph21]: RP2, [K.pph23]: RP2, [K.komisiBayar]: RP2,
  [K.tglTransferKomisi]: TGL,
  [K.gimmickTgl]: TGL,
  40: PCT, 42: RP2, 43: RP2, 44: RP2, 45: TGL, 46: TGL,
  47: PCT, 49: RP2, 50: RP2, 51: RP2, 52: RP2, 54: TGL, 55: TGL,
};

/**
 * Kepala tabel, empat baris bertingkat.
 *
 * Ditulis sebagai daftar penggabungan sel apa adanya — [teks, baris awal, kolom
 * awal, baris akhir, kolom akhir] — bukan diturunkan dari pengelompokan kolom.
 * Kepalanya tidak beraturan: sebagiannya membentang empat baris, sebagiannya
 * dua lalu bercabang, dan "Luas (m2)" membentang tiga baris di atas dua kolom.
 * Aturan yang dipaksakan menutupi yang tidak ikut aturan, dan yang tertutup
 * itulah yang bergeser diam-diam.
 */
export const KEPALA: [string, number, number, number, number][] = [
  ["No.", 5, 1, 8, 1],
  ["Tanggal", 5, 2, 6, 3], ["Kontrak", 7, 2, 8, 2], ["Batal", 7, 3, 8, 3],
  ["Konsumen", 5, 4, 8, 4],
  ["Unit", 5, 5, 8, 5],
  ["Luas (m2)", 5, 6, 7, 7], ["Tanah", 8, 6, 8, 6], ["Bangunan", 8, 7, 8, 7],
  ["Cara Bayar", 5, 8, 8, 8],
  ["Nilai Kontrak (Incl. VAT)", 5, 9, 8, 9],
  ["Sales Inhouse", 5, 10, 6, 11],
  ["Closing Fee (Rp.)", 7, 10, 8, 10], ["Tanggal Transfer", 7, 11, 8, 11],
  ["Sales Manager (Inhouse)", 5, 12, 6, 13],
  ["Closing Fee (Rp.)", 7, 12, 8, 12], ["Tanggal Transfer", 7, 13, 8, 13],
  ["Sales Marcomm", 5, 14, 6, 15],
  ["Closing Fee (Rp.)", 7, 14, 8, 14], ["Tanggal Transfer", 7, 15, 8, 15],
  ["PIC Proyek", 5, 16, 6, 17],
  ["Closing Fee (Rp.)", 7, 16, 8, 16], ["Tanggal Transfer", 7, 17, 8, 17],
  ["Bonus Penjualan", 5, 18, 6, 19],
  ["Bonus", 7, 18, 8, 18], ["Tanggal Transfer", 7, 19, 8, 19],
  ["Konsumen", 5, 20, 6, 22],
  ["Hadiah Promosi Konsumen", 7, 20, 7, 21],
  ["Voucher", 8, 20, 8, 20], ["Hadiah", 8, 21, 8, 21],
  ["Tanggal Realisasi", 7, 22, 8, 22],
  ["Reward (Rp.)", 5, 23, 8, 23],
  ["Tanggal Transfer Reward", 5, 24, 8, 24],
  ["Penerimaan", 5, 25, 6, 26], ["(Rp.)", 7, 25, 8, 25], ["%", 7, 26, 8, 26],
  ["Komisi Agent/InHouse/Member", 5, 27, 6, 28],
  ["%", 7, 27, 8, 27], ["Nominal", 7, 28, 8, 28],
  ["PPn", 5, 29, 8, 29],
  ["PPh 21 (NPWP Pribadi)", 5, 30, 8, 30],
  ["PPh 23 (NPWP Perusahaan)", 5, 31, 8, 31],
  ["Komisi Dibayarkan", 5, 32, 8, 32],
  ["Status Pembayaran Komisi Agent/InHouse", 5, 33, 8, 33],
  ["Tanggal Transfer Komisi", 5, 34, 8, 34],
  ["Agent/Sales InHouse", 5, 35, 8, 35],
  ["Sub Koordinator", 5, 36, 8, 36],
  ["Gimmick Agent/Sales InHouse", 5, 37, 7, 38],
  ["Trip", 8, 37, 8, 37], ["Hadiah", 8, 38, 8, 38],
  ["Tanggal Realisasi Hadiah Promosi Agent/Sales InHouse", 5, 39, 8, 39],

  ["OVERIDING Sales Manager (InHouse)", 5, 40, 5, 46],
  ["Status Pembayaran", 6, 40, 6, 46],
  ["%", 7, 40, 8, 40], ["Remarks", 7, 41, 8, 41],
  ["Nominal Unit (Rp.)", 7, 42, 8, 42],
  ["PPh 21 (NPWP Pribadi)", 7, 43, 8, 43], ["Net", 7, 44, 8, 44],
  ["Tanggal", 7, 45, 7, 46], ["Proses", 8, 45, 8, 45], ["Transfer", 8, 46, 8, 46],

  ["OVERIDING Coordinator Agent", 5, 47, 5, 55],
  ["Status Pembayaran", 6, 47, 6, 55],
  ["%", 7, 47, 8, 47], ["Remarks", 7, 48, 8, 48],
  ["Nominal Unit (Rp.)", 7, 49, 8, 49],
  ["PPn", 7, 50, 8, 50], ["PPh 23", 7, 51, 8, 51], ["Net", 7, 52, 8, 52],
  ["Tahap", 7, 53, 8, 53],
  ["Tanggal", 7, 54, 7, 55], ["Proses", 8, 54, 8, 54], ["Transfer", 8, 55, 8, 55],

  ["Keterangan", 5, 56, 8, 56],
];

/**
 * Kolom yang dijumlahkan pada baris TOTAL.
 *
 * Hanya kolom uang yang memang dijumlahkan pada berkas acuannya. Bonus, Reward,
 * dan seluruh blok Overiding Coordinator Agent sengaja tidak ikut — berkasnya
 * pun tidak menjumlahkannya, dan menambahkan total yang tidak ada di sana akan
 * membuat dua laporan yang seharusnya sama berbeda pada baris paling bawah.
 */
export const KOLOM_TOTAL = [
  K.nilaiKontrak, K.inhouseFee, K.managerFee, K.marcommFee, K.picFee,
  K.terimaRp, K.komisiNominal, K.ppn, K.pph21, K.pph23, K.komisiBayar,
  42, 43, 44,
];


/** Kolom yang isinya angka, supaya layar merapatkannya ke kanan. */
export const KOLOM_ANGKA: number[] = Object.entries(FORMAT)
  .filter(([, f]) => f === RP || f === RP2 || f === PCT || f === LUAS)
  .map(([c]) => Number(c));

/**
 * Sebutan bulan pada tanggal, sesingkat yang dipakai Excel dalam bahasa
 * Indonesia — Mei, Agu, Okt, Des, bukan May, Aug, Oct, Dec.
 */
export const BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
                              "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

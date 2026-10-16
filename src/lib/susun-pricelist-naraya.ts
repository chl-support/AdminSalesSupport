/**
 * Isian awal penyusunan pricelist Naraya Serpong, dibaca dari berkas
 * Data_Pricelist.xlsx (PL Naraya revisi 21 Juli 2026): parameter Data (IRR)
 * dengan porsi tahap rumus Excel 40/40/10/10 dan Adjusted Price hasil Goal
 * Seek Excel, 48 unit dari lembar UNIT DATA, susunan kolom Data Pricelist
 * dan Pricelist, serta T&C.
 *
 * Dipakai saat layar Pricelist project Naraya Serpong dibuka dan project itu
 * belum punya draf berisi unit — atas permintaan pemakainya, supaya datanya
 * langsung ada di layar tanpa harus diimpor lebih dulu. Sesudah tersimpan,
 * yang dibaca selalu draf di basis data; berkas ini tidak menimpanya lagi.
 * Seluruh hitungannya sama persis dengan Excel (diuji di
 * scripts/test-flow.ts).
 */

import type { SusunPricelist } from "./susun-pricelist";

export const SUSUN_NARAYA: SusunPricelist = {
  irr: {
    "target": 0.09,
    // Porsi tahap rumus arus kas Excel (sel B22:J57): 40/40/10/10.
    "porsiTahap": [0.4, 0.4, 0.1, 0.1],
    "namaTahap": ["Foundation", "Tutup Atap", "BAST", "AJB + SPHTB"],
    "periode": 36,
    "skema": [
      {
        "nama": "Cash Keras",
        "kelompok": "Cash",
        "alokasi": 0.07,
        "dp": 1,
        "kali": 1,
        "bulan": [
          12,
          18,
          19,
          20
        ],
        "acuan": true
      },
      {
        "nama": "Cicilan12x",
        "kelompok": "Cash",
        "alokasi": 0.04,
        "dp": 1,
        "kali": 12,
        "hargaSesuai": 2098835043.1433501,
        "bulan": [
          12,
          18,
          19,
          20
        ]
      },
      {
        "nama": "Cicilan 18x",
        "kelompok": "Cash",
        "alokasi": 0.05,
        "dp": 1,
        "kali": 18,
        "hargaSesuai": 2145515617.2706635,
        "bulan": [
          12,
          18,
          19,
          20
        ]
      },
      {
        "nama": "Cicilan 24x",
        "kelompok": "Cash",
        "alokasi": 0.08,
        "dp": 1,
        "kali": 24,
        "hargaSesuai": 2192866884.3272357,
        "bulan": [
          12,
          18,
          19,
          20
        ]
      },
      {
        "nama": "Cicilan 30x",
        "kelompok": "Cash",
        "alokasi": 0.25,
        "dp": 1,
        "kali": 30,
        "hargaSesuai": 2240888378.584534,
        "bulan": [
          12,
          18,
          19,
          20
        ]
      },
      {
        "nama": "KPR Express",
        "kelompok": "KPR",
        "alokasi": 0.33,
        "dp": 0.1,
        "kali": 1,
        "hargaSesuai": 2028590805.69366,
        "bulan": [
          2,
          2,
          2,
          2
        ]
      },
      {
        "nama": "KPR DP 0% Express",
        "kelompok": "KPR",
        "alokasi": 0.08,
        "dp": 0,
        "kali": 1,
        "hargaSesuai": 2251637205.288633,
        "bulan": [
          12,
          18,
          19,
          20
        ]
      },
      {
        "nama": "DP 10%/4x",
        "kelompok": "KPR",
        "alokasi": 0.05,
        "dp": 0.1,
        "kali": 4,
        "hargaSesuai": 2228236513.019287,
        "bulan": [
          12,
          18,
          19,
          20
        ]
      },
      {
        "nama": "DP 20%/6x",
        "kelompok": "KPR",
        "alokasi": 0.05,
        "dp": 0.2,
        "kali": 6,
        "hargaSesuai": 2208853147.662026,
        "bulan": [
          12,
          18,
          19,
          20
        ]
      }
    ]
  },
  unit: [
    {"kode": "NS-NR1-01", "alamat": "NARAYA 1", "view": "SELATAN", "no": "1", "ukuran": "8,5x18,5", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Hoek (IRR K)", "lt": 146.5, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-02", "alamat": "NARAYA 1", "view": "UTARA", "no": "1", "ukuran": "8,5x10", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Hoek", "lt": 85, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-03", "alamat": "NARAYA 1", "view": "SELATAN", "no": "2", "ukuran": "7x10", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Badan", "lt": 70, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-05", "alamat": "NARAYA 1", "view": "SELATAN", "no": "3", "ukuran": "7x10", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Badan", "lt": 70, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-06", "alamat": "NARAYA 1", "view": "UTARA", "no": "2", "ukuran": "7x10", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Badan", "lt": 70, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-07", "alamat": "NARAYA 1", "view": "SELATAN", "no": "4", "ukuran": "7x10", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Badan", "lt": 70, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-08", "alamat": "NARAYA 1", "view": "UTARA", "no": "3", "ukuran": "7x10", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Badan", "lt": 70, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-09", "alamat": "NARAYA 1", "view": "SELATAN", "no": "5", "ukuran": "7x10", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Badan", "lt": 70, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-10", "alamat": "NARAYA 1", "view": "UTARA", "no": "4", "ukuran": "7x10", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Badan", "lt": 70, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-11", "alamat": "NARAYA 1", "view": "SELATAN", "no": "6", "ukuran": "9,5x10", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Hoek", "lt": 95, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-12", "alamat": "NARAYA 1", "view": "UTARA", "no": "5", "ukuran": "7x16", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Badan (IRR K)", "lt": 107.16, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-16", "alamat": "NARAYA 1", "view": "UTARA", "no": "6", "ukuran": "7x14,5", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Badan (IRR K)", "lt": 95.95, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR1-18", "alamat": "NARAYA 1", "view": "UTARA", "no": "7", "ukuran": "8x13", "phase": "1", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Hoek (IRR K)", "lt": 115.06, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoekGarden": 0.002}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR2-01", "alamat": "NARAYA 2", "view": "SELATAN", "no": "1", "ukuran": "7,5x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Hoek", "lt": 75, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR2-02", "alamat": "NARAYA 2", "view": "UTARA", "no": "1", "ukuran": "8,3x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Hoek", "lt": 85.1, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR2-03", "alamat": "NARAYA 2", "view": "SELATAN", "no": "2", "ukuran": "6x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Badan", "lt": 60, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR2-05", "alamat": "NARAYA 2", "view": "SELATAN", "no": "3", "ukuran": "6x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Badan", "lt": 60, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR2-06", "alamat": "NARAYA 2", "view": "UTARA", "no": "2", "ukuran": "6x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Badan", "lt": 60, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR2-07", "alamat": "NARAYA 2", "view": "SELATAN", "no": "3", "ukuran": "6x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Badan", "lt": 86.5, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR2-08", "alamat": "NARAYA 2", "view": "UTARA", "no": "3", "ukuran": "6x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Badan", "lt": 60, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR2-10", "alamat": "NARAYA 2", "view": "UTARA", "no": "4", "ukuran": "6x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Badan", "lt": 60, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR2-12", "alamat": "NARAYA 2", "view": "UTARA", "no": "5", "ukuran": "8,15x11", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Hoek", "lt": 83.67, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR3-01", "alamat": "NARAYA 3", "view": "UTARA", "no": "1", "ukuran": "7x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "Irregullar", "subTipe": "Hoek", "lt": 94.43, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR3-02", "alamat": "NARAYA 3", "view": "UTARA", "no": "2", "ukuran": "6x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Badan", "lt": 60, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR3-03", "alamat": "NARAYA 3", "view": "UTARA", "no": "3", "ukuran": "6x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Badan", "lt": 60, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR3-05", "alamat": "NARAYA 3", "view": "UTARA", "no": "4", "ukuran": "6x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Badan", "lt": 60, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR3-06", "alamat": "NARAYA 3", "view": "UTARA", "no": "5", "ukuran": "6,2x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "Irregullar", "subTipe": "Hoek", "lt": 76.74, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR5-01", "alamat": "NARAYA 5", "view": "TIMUR", "no": "1", "ukuran": "7,2x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Hoek", "lt": 72.4, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR5-02", "alamat": "NARAYA 5", "view": "BARAT", "no": "1", "ukuran": "7,2x11", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "Irregullar", "subTipe": "Hoek", "lt": 79.38, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR5-03", "alamat": "NARAYA 5", "view": "TIMUR", "no": "2", "ukuran": "7,2x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Hoek", "lt": 72, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR5-05", "alamat": "NARAYA 5", "view": "TIMUR", "no": "3", "ukuran": "7,2x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Hoek", "lt": 72, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR5-06", "alamat": "NARAYA 5", "view": "BARAT", "no": "2", "ukuran": "7,2x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Hoek", "lt": 72, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR5-07", "alamat": "NARAYA 5", "view": "TIMUR", "no": "4", "ukuran": "7,2x10,4", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Hoek", "lt": 72, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoekGarden": 0.002}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR5-08", "alamat": "NARAYA 5", "view": "BARAT", "no": "3", "ukuran": "7,2X10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "", "subTipe": "Hoek", "lt": 72, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoekGarden": 0.002}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NR5-10", "alamat": "NARAYA 5", "view": "BARAT", "no": "4", "ukuran": "9x10", "phase": "1", "tipe": "6", "tipeBangunan": "60", "bentuk": "Irregullar", "subTipe": "Hoek", "lt": 81.62, "hargaTanah": 7000000, "lb": 71, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"hoekGarden": 0.002}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-01", "alamat": "NARAYA BOULEVARD", "view": "SELATAN", "no": "1", "ukuran": "9,3X10", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Hoek", "lt": 93, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003, "hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-02", "alamat": "NARAYA BOULEVARD", "view": "UTARA", "no": "1", "ukuran": "8,2x12", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Hoek (IRR K)", "lt": 100.87, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003, "hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-03", "alamat": "NARAYA BOULEVARD", "view": "SELATAN", "no": "2", "ukuran": "7x10", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Badan", "lt": 70, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-05", "alamat": "NARAYA BOULEVARD", "view": "SELATAN", "no": "3", "ukuran": "7x10", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Badan", "lt": 70, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-06", "alamat": "NARAYA BOULEVARD", "view": "UTARA", "no": "2", "ukuran": "7x13", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Badan (IRR K)", "lt": 90.07, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-07", "alamat": "NARAYA BOULEVARD", "view": "SELATAN", "no": "4", "ukuran": "9,35x10", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "", "subTipe": "Hoek", "lt": 93, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003, "hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-08", "alamat": "NARAYA BOULEVARD", "view": "UTARA", "no": "3", "ukuran": "7x 13,8", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Badan (IRR K)", "lt": 93.4, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-09", "alamat": "NARAYA BOULEVARD", "view": "TIMUR", "no": "1", "ukuran": "10,4x12,4", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Hoek (IRR K)", "lt": 127.7, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003, "hoek": 0.001}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-10", "alamat": "NARAYA BOULEVARD", "view": "UTARA", "no": "4", "ukuran": "10x13", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Hoek (IRR K)", "lt": 110.62, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003, "hoekGarden": 0.002}, "faktorTambah": 0.02, "special": 0, "showUnit": 400000000},
    {"kode": "NS-NRB-11", "alamat": "NARAYA BOULEVARD", "view": "BARAT", "no": "1", "ukuran": "7,6x13,4", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Hoek (IRR K)", "lt": 98.3, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-12", "alamat": "NARAYA BOULEVARD", "view": "TIMUR LAUT", "no": "5", "ukuran": "8,7x14,3", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Hoek (IRR K)", "lt": 137.77, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003, "hoekGarden": 0.002}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-15", "alamat": "NARAYA BOULEVARD", "view": "BARAT", "no": "2", "ukuran": "8x15,6", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Badan (IRR K)", "lt": 103.15, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
    {"kode": "NS-NRB-16", "alamat": "NARAYA BOULEVARD", "view": "TIMUR LAUT", "no": "6", "ukuran": "11,7x17", "phase": "2", "tipe": "7", "tipeBangunan": "70", "bentuk": "Irregullar", "subTipe": "Hoek (IRR K)", "lt": 138.84, "hargaTanah": 7000000, "lb": 88, "hargaBangunan": 6500000, "kenaikan": 0, "faktor": {"unitDepan": 0.003, "hoekGarden": 0.002}, "faktorTambah": 0.02, "special": 0, "showUnit": 0},
  ],
  dataPricelist: {
    "tambahan": 5000000,
    "kolom": [
      {
        "nama": "Cash Keras",
        "skema": "Cash Keras"
      },
      {
        "nama": "Cicilan12x",
        "skema": "Cicilan12x"
      },
      {
        "nama": "Cicilan 18x",
        "skema": "Cicilan 18x"
      },
      {
        "nama": "Cicilan 24x",
        "skema": "Cicilan 24x"
      },
      {
        "nama": "Cicilan 30x",
        "skema": "Cicilan 30x"
      },
      {
        "nama": "KPR Express",
        "skema": "KPR Express"
      },
      {
        "nama": "BANK KPR - DP 10% (-UTJ)",
        "dari": "KPR Express",
        "kali": 1.12
      },
      {
        "nama": "KPR DP 0% Express",
        "skema": "KPR DP 0% Express"
      },
      {
        "nama": "DP 10%/4x",
        "skema": "DP 10%/4x"
      },
      {
        "nama": "DP 20%/6x",
        "skema": "DP 20%/6x"
      }
    ]
  },
  pricelist: {
    "judul": "PRICELIST",
    "tanggal": "21 Juli 2026",
    "catatan": "Incld. Subsidi DP 10% + Biaya-biaya 7,5% (BPHTB, AJB, Notaris & Akad KPR Bank)",
    "batasDtp": 2220000000,
    "kolom": [
      {
        "nama": "Cash Keras",
        "dari": "Cash Keras",
        "kali": 1
      },
      {
        "nama": "Cicilan 12X",
        "dari": "Cicilan12x",
        "kali": 1
      },
      {
        "nama": "Cicilan 18X",
        "dari": "Cicilan 18x",
        "kali": 1
      },
      {
        "nama": "Cicilan 24X",
        "dari": "Cicilan 24x",
        "kali": 1
      },
      {
        "nama": "Cicilan 30X",
        "dari": "Cicilan 30x",
        "kali": 1
      },
      {
        "nama": "KPR Express",
        "dari": "KPR Express",
        "kali": 1.115
      },
      {
        "nama": "BANK KPR - DP 10% (KPR REGULAR)",
        "dari": "BANK KPR - DP 10% (-UTJ)",
        "kali": 1.115
      },
      {
        "nama": "KPR DP 0% Express",
        "dari": "KPR DP 0% Express",
        "kali": 1
      },
      {
        "nama": "DP 10%/4x",
        "dari": "DP 10%/4x",
        "kali": 1
      },
      {
        "nama": "DP 20%/6x",
        "dari": "DP 20%/6x",
        "kali": 1
      }
    ]
  },
  tnc: {
    "judul": "TERM OF PAYMENT",
    "caraBayar": [
      {
        "judul": "CASH KERAS",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "DP",
            "nilai": "30% - BF",
            "waktu": "Hari ke 7 setelah BF"
          },
          {
            "label": "PELUNASAN",
            "nilai": "70%",
            "waktu": "Hari ke 7 setelah DP"
          }
        ]
      },
      {
        "judul": "CICILAN 12X",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "Angsuran (DP) 1",
            "nilai": "10% - BF",
            "waktu": "Hari ke 14 setelah BF"
          },
          {
            "label": "Angsuran 2 - 12",
            "nilai": "90% / 11 bulan",
            "waktu": "1 bulan setelah DP 1, dan seterusnya setiap bulan"
          }
        ]
      },
      {
        "judul": "CICILAN 18X",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "Angsuran (DP) 1",
            "nilai": "10% - BF",
            "waktu": "Hari ke 14 setelah BF"
          },
          {
            "label": "Angsuran 2 - 18",
            "nilai": "90% / 17 bulan",
            "waktu": "1 bulan setelah DP 1, dan seterusnya setiap bulan"
          }
        ]
      },
      {
        "judul": "CICILAN 24X",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "Angsuran (DP) 1",
            "nilai": "10% - BF",
            "waktu": "Hari ke 14 setelah BF"
          },
          {
            "label": "Angsuran 2 - 24",
            "nilai": "90% / 23 bulan",
            "waktu": "1 bulan setelah DP 1, dan seterusnya setiap bulan"
          }
        ]
      },
      {
        "judul": "CICILAN 30X",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "Angsuran (DP) 1",
            "nilai": "10% - BF",
            "waktu": "Hari ke 14 setelah BF"
          },
          {
            "label": "Angsuran 2 - 30",
            "nilai": "90% / 29 bulan",
            "waktu": "1 bulan setelah DP 1, dan seterusnya setiap bulan"
          }
        ]
      },
      {
        "judul": "KPR EXPRESS",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "DP",
            "nilai": "10% - BF",
            "waktu": "Hari ke 14 setelah BF"
          },
          {
            "label": "PELUNASAN",
            "nilai": "90%",
            "waktu": "1 bulan setelah DP"
          }
        ]
      },
      {
        "judul": "BANK KPR - DP 10% (KPR REGULAR)",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "DP",
            "nilai": "10% - BF",
            "waktu": "Hari ke 14 setelah BF"
          },
          {
            "label": "PELUNASAN",
            "nilai": "90%",
            "waktu": "1 bulan setelah DP"
          }
        ]
      },
      {
        "judul": "KPR DP 10% - 4X",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "DP 1 - 4",
            "nilai": "(10% - BF) / 4 bulan",
            "waktu": "Hari ke 14 setelah BF, dan seterusnya setiap bulan"
          },
          {
            "label": "PELUNASAN / AKAD",
            "nilai": "90%",
            "waktu": "1 bulan setelah DP 4"
          }
        ]
      },
      {
        "judul": "KPR DP 20% - 6X",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "DP 1 - 6",
            "nilai": "(20% - BF) / 6 bulan",
            "waktu": "Hari ke 14 setelah BF, dan seterusnya setiap bulan"
          },
          {
            "label": "PELUNASAN / AKAD",
            "nilai": "80%",
            "waktu": "1 bulan setelah DP 6"
          }
        ],
        "catatan": "*besaran DP ditentukan oleh plafon kredit yang diberikan oleh Bank"
      },
      {
        "judul": "KPR DP 0% Express",
        "baris": [
          {
            "label": "Booking Fee",
            "nilai": "10 Juta",
            "waktu": ""
          },
          {
            "label": "PELUNASAN / AKAD",
            "nilai": "100% - BF",
            "waktu": "1 bulan setelah BF"
          }
        ]
      }
    ],
    "catatan": [
      "Harga diatas sudah termasuk :\nPPN, Ijin Mendirikan Bangunan (IMB), biaya instalasi listrik, biaya instalasi air bersih.",
      "Harga diatas belum termasuk :\n- Cara Bayar Cash Keras, Cicilan 12x, Cicilan 18x, Cicilan 24x & Cicilan 30x\nAJB & Balik nama Sertifikat, notaris / PPAT, HGB, BPHTB, PBB, PPN BM tanah & bangunan akibat pengembangan luas bangunan sehingga masuk dalam kriteria bangunan mewah sesuai peraturan pemerintah, Iuran Pengelolaan Lingkungan; dan biaya aktivasi telepon, listrik, dan air.\n- Cara Bayar KPR EXPRESS & BANK KPR - DP 10% (KPR REGULAR)\nPPN, PBB, PPN BM tanah & bangunan akibat pengembangan luas bangunan sehingga masuk dalam kriteria bangunan mewah sesuai peraturan pemerintah, Iuran Pengelolaan Lingkungan, Biaya aktivasi listrik dan air.",
      "Nama blok, nomor yang tercantum pada saat tanda jadi sudah pasti dan tidak dapat diganti.",
      "Keterlambatan pembayaran akan dikenakan perhitungan denda sesuai ketentuan yang berlaku 1‰ (1 per mill) per hari.",
      "Cara pembayaran KPR harus melalui proses ke Bank yang bekerjasama dengan Pengembang.",
      "Jika terdapat selisih antara sisa hutang dengan plafon KPR yang disetujui, maka penambahan DP menjadi tanggung jawab pemesan dan dibayarkan maksimal satu minggu sebelum akad kredit.\nApabila pemesan membatalkan pemesanan secara sepihak dan atau pemesanan menjadi batal, maka uang tanda jadi hangus dan pemesan dikenakan biaya 10% dari harga transaksi (diluar biaya pajak yang telah dibebankan) yang diperhitungkan sebagai kompensasi ganti kerugian kepada PT. Bhakti Bangun Harmoni.\nApabila pemesan membatalkan pemesanan karena KPR ditolak oleh minimal 2 Bank, maka uang tanda jadi hangus dan DP dikembalikan setelah dipotong biaya pajak yang sudah dibebankan berikut denda (apabila ada) dengan melampirkan surat penolakan dari Bank.",
      "Apabila Pemesan membatalkan pemesanan dengan alasan apapun, maka seluruh jumlah uang yang telah dibayarkan oleh Pemesan kepada Penerima Pesanan tidak dapat dikembalikan dan akan diperhitungkan sebagai kompensasi ganti kerugian kepada Penerima Pesanan, Kecuali pembatalan karena KPR ditolak oleh minimal 2 (dua) pihak BANK, maka Booking Fee Hangus dan Angsuran/Down Payment dikembalikan setelah dipotong biaya Pajak yang sudah dibebankan berikut denda (apabila ada).",
      "Harga dan ketentuan diatas sewaktu-waktu dapat berubah tanpa pemberitahuan terlebih dahulu."
    ],
    "pengantarRekening": "Pembayaran dianggap sah apabila sudah masuk di rekening PT. Serpong Bangun Cipta :",
    "rekening": [
      {
        "bank": "BANK MANDIRI",
        "noRek": "155.00.1232533.1",
        "cabang": "KCU Kisamaun"
      },
      {
        "bank": "BANK BCA",
        "noRek": "205 003 7676",
        "cabang": "KCK Menara BCA"
      }
    ]
  },
};

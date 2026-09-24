/**
 * Yang menandatangani rekap Overiding, menurut projectnya.
 *
 * Berkas tersendiri, bukan bagian dari ./projects: berkas itu mengimpor
 * penggerak basis data, dan lembar rekapnya digambar di peramban. Satu impor
 * dari sana menyeret `pg` ikut terbundel ke sisi klien — dan yang terjadi
 * bukan bundel yang membesar, melainkan build yang gagal mencari modul `dns`
 * dan `fs`. Pemisahan yang sama sudah dipakai ./tahap terhadap ./tahap-alur.
 *
 * Namanya dicetak di atas garis tanda tangan, sebagaimana lembar acuan kantor:
 * yang membubuhkan tanda tangan sudah ditentukan jabatannya, dan lembar yang
 * garisnya kosong kembali dari peredaran karena tidak ada yang tahu siapa yang
 * seharusnya menandatanganinya.
 *
 * Dua rumpun, bukan satu daftar: empat project di bawah PT. Serpong Bangun
 * Cipta disetujui Setia Iskandar, sedangkan BIO District dan Permai Indah —
 * yang PT-nya berbeda — disetujui Andreas Audyanto dan diperiksa Sugino.
 *
 * Project yang tidak tercantum mendapat garis kosong, bukan nama rumpun
 * terdekat. Menebak siapa yang menandatangani dokumen yang dibayar atas
 * dasarnya lebih buruk daripada garis yang diisi tangan.
 */
export type PenandatanganRekap = {
  dibuat: string;
  diperiksa: string;
  /** Dua garis berdampingan di bawah satu sebutan "Disetujui Oleh,". */
  disetujui: [string, string];
};

const KOSONG: PenandatanganRekap = {
  dibuat: "", diperiksa: "", disetujui: ["", ""],
};

const PENANDATANGAN: Record<string, PenandatanganRekap> = {
  "banara-serpong": {
    dibuat: "Anneke Aprilia", diperiksa: "",
    disetujui: ["Setia Iskandar", "Al Imron"],
  },
  "naraya-serpong": {
    dibuat: "Anneke Aprilia", diperiksa: "",
    disetujui: ["Setia Iskandar", "Al Imron"],
  },
  "marchand-hype-station": {
    dibuat: "Anneke Aprilia", diperiksa: "",
    disetujui: ["Setia Iskandar", "Al Imron"],
  },
  "mazenta-residence": {
    dibuat: "Anneke Aprilia", diperiksa: "",
    disetujui: ["Setia Iskandar", "Al Imron"],
  },
  "bio-district": {
    dibuat: "Anneke Aprilia", diperiksa: "Sugino",
    disetujui: ["Andreas Audyanto", "Al Imron"],
  },
  "permai-indah": {
    dibuat: "Anneke Aprilia", diperiksa: "Sugino",
    disetujui: ["Andreas Audyanto", "Al Imron"],
  },
};

export function penandatanganRekap(slug?: string | null): PenandatanganRekap {
  return PENANDATANGAN[(slug ?? "").trim()] ?? KOSONG;
}

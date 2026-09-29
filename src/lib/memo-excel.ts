/**
 * Membaca tabel skema dari memo yang dikirim sebagai lembar kerja Excel.
 *
 * Memo yang datang sebagai PDF atau pindaian dibedah dari kotak letak tiap
 * kata — lihat bedahSkema() pada memo-skema.ts. Lembar kerja tidak punya
 * halaman maupun koordinat kata: ia sudah berupa baris dan kolom, dan
 * memaksanya melewati OCR berarti membuang susunan yang sudah benar lalu
 * menebaknya kembali dari gambar.
 *
 * Dijalankan di server, bukan di peramban. exceljs berukuran sekitar satu
 * megabita; membawanya ke dalam bundel layar berarti setiap orang yang membuka
 * Referensi Pengajuan mengunduhnya, termasuk yang tidak pernah mengunggah
 * apa pun. Berkasnya sendiri toh sudah sampai di server.
 *
 * Susunan yang dibaca persis susunan memonya:
 *
 *   No. Memo : 013/SBC-MC-BNR/VII/2026     ← lima baris kepala, "label : isi"
 *   Dari : …
 *   Tanggal : 01 Juli 2026
 *   Perihal : …
 *   Periode Program : Juli - September 2026
 *
 *   1. Skema Sales Inhouse                 ← judul tabel
 *   No | Kategori | Nilai | Keterangan     ← kepala kolom, dilewati
 *   1  | Komisi Inhouse | 1 unit = 1.5% | Pembayaran sampai …
 *   1  | Komisi Inhouse | 1 unit = 1.5% | Cash & Cicilan
 *
 * Nomor pada kolom pertama itulah yang menyatukan beberapa baris menjadi satu
 * kategori: satu kategori yang keterangannya ditulis berbaris-baris tetap satu
 * kategori, sebagaimana terbaca pada memonya.
 *
 * Tidak ada kata yang diubah, dibuang, maupun dipindah urutannya. Baris yang
 * menyatu tetap menjadi baris terpisah di dalam selnya — dirangkai dengan
 * ganti baris, tidak dilebur menjadi satu kalimat — supaya yang membacanya
 * nanti melihat susunan yang sama dengan lembar aslinya, dan tidak ada angka
 * yang tersambung ke angka sebelahnya.
 *
 * Sel yang digabung di Excel tidak ditebak dari kesamaan teksnya melainkan
 * dibaca dari keterangan gabungan pada lembarnya: hanya sel induk yang membawa
 * isi, sel ikutannya kosong. Menebak dari kesamaan teks akan membuang baris
 * yang memang kebetulan tertulis sama dua kali.
 */

import ExcelJS, { ValueType } from "exceljs";

import type { BarisSkema } from "./memo-skema";

export type KolomMemo = {
  nomor?: string; judul?: string; dari?: string;
  tanggal_memo?: string; berlaku_dari?: string; berlaku_sampai?: string;
};

export type HasilExcel = { kolom: KolomMemo; skema: BarisSkema[] };

/** Judul tabel: "1. Skema Sales Inhouse". */
const KEPALA_TABEL = /^\s*\d{1,2}\s*[.)]\s*(Skema\b.*)$/i;

/** Baris kepala kolom, yang bukan data. */
const KEPALA_KOLOM = /^no\.?$/i;

const BULAN = ["januari", "februari", "maret", "april", "mei", "juni", "juli",
               "agustus", "september", "oktober", "november", "desember"];

const nomorBulan = (n: string) => {
  const i = BULAN.indexOf(n.trim().toLowerCase());
  return i < 0 ? null : i + 1;
};

const dd = (n: number) => String(n).padStart(2, "0");
const akhirBulan = (th: number, bl: number) => new Date(th, bl, 0).getDate();

/** "01 Juli 2026" menjadi "2026-07-01". */
function tanggalPanjang(v: string): string | null {
  const m = v.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const bl = nomorBulan(m[2]);
  if (!bl) return null;
  return `${m[3]}-${dd(bl)}-${dd(Number(m[1]))}`;
}

/**
 * "Juli - September 2026" menjadi 2026-07-01 sampai 2026-09-30.
 *
 * Tahun yang hanya ditulis sekali di ujung berlaku bagi kedua bulannya, dan
 * bulan penutup diambil sampai hari terakhirnya — periode program berakhir di
 * penghujung bulan, bukan di tanggal satu.
 */
function periodeProgram(v: string): { dari: string; sampai: string } | null {
  const m = v.match(
    /([A-Za-z]+)\s*(\d{4})?\s*[-–—]\s*([A-Za-z]+)\s*(\d{4})/);
  if (m) {
    const b1 = nomorBulan(m[1]), b2 = nomorBulan(m[3]);
    if (!b1 || !b2) return null;
    const th1 = Number(m[2] ?? m[4]), th2 = Number(m[4]);
    return { dari: `${th1}-${dd(b1)}-01`,
             sampai: `${th2}-${dd(b2)}-${dd(akhirBulan(th2, b2))}` };
  }
  const satu = v.match(/([A-Za-z]+)\s+(\d{4})/);
  if (satu) {
    const b = nomorBulan(satu[1]);
    if (!b) return null;
    const th = Number(satu[2]);
    return { dari: `${th}-${dd(b)}-01`,
             sampai: `${th}-${dd(b)}-${dd(akhirBulan(th, b))}` };
  }
  return null;
}

/**
 * Isi sel sebagaimana TERBACA di Excel, bukan sebagaimana tersimpan.
 *
 * Tanda persen mengikuti format selnya, tidak pernah ditambahkan sendiri:
 * angka berformat persen tersimpan sebagai 0,01 sementara yang dilihat orang
 * pada lembarnya adalah 1%, dan menyalin 0,01 apa adanya bukan kesetiaan pada
 * berkasnya melainkan penyimpangan seratus kali lipat, pada kolom yang
 * menentukan berapa uang keluar. Sebaliknya angka yang memang angka biasa
 * tetap ditulis sebagai angka, tanpa tanda persen — pemisah ribuan pun hanya
 * dipakai bila format selnya meminta.
 */
function isiSel(sel: ExcelJS.Cell): string {
  // Sel ikutan sebuah gabungan: isinya milik sel induk di baris teratas
  // gabungan itu, dan mengembalikannya di sini berarti menghitung satu isi
  // sebanyak baris yang digabung.
  if (sel.type === ValueType.Merge) return "";

  const v = sel.value;
  if (v === null || v === undefined) return "";

  if (typeof v === "object") {
    if ("richText" in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((t: any) => t.text).join("").trim();
    }
    if ("result" in v) return String((v as any).result ?? "").trim();
    if ("text" in v) return String((v as any).text ?? "").trim();
    if (v instanceof Date) {
      return `${v.getFullYear()}-${dd(v.getMonth() + 1)}-${dd(v.getDate())}`;
    }
  }

  if (typeof v === "number") {
    const fmt = String(sel.numFmt ?? "");
    // Banyaknya angka nol di belakang titik pada formatnya menentukan
    // banyaknya desimal yang tampak: "0%" menjadi 1%, "0,0%" menjadi 1,0%.
    const desimal = (fmt.split(".")[1]?.match(/0/g) ?? []).length;
    if (fmt.includes("%")) {
      return `${(v * 100).toLocaleString("id-ID", {
        minimumFractionDigits: desimal, maximumFractionDigits: desimal })}%`;
    }
    if (fmt.includes("#,#") || fmt.includes("0,0")) {
      return v.toLocaleString("id-ID", {
        minimumFractionDigits: desimal, maximumFractionDigits: desimal });
    }
    return String(v);
  }

  return String(v).trim();
}

/**
 * Merangkai beberapa baris satu sel menjadi satu isi.
 *
 * Urutannya persis urutan pada lembarnya, tidak ada yang dibuang — termasuk
 * baris yang kebetulan tertulis sama dengan baris di atasnya. Perangkainya
 * ganti baris, bukan spasi: "Rp. 800.000/per unit" dan "Rp. 600.000/per unit"
 * yang dilebur menjadi satu kalimat menjadi dua angka yang beradu, dan itu
 * jenis kesalahan baca yang paling mahal di tabel yang menentukan komisi.
 */
function gabung(bagian: string[]): string {
  return bagian.map((b) => b.trim()).filter(Boolean).join("\n");
}

export async function bedahSkemaExcel(buf: Buffer): Promise<HasilExcel> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);

  const kolom: KolomMemo = {};
  const skema: BarisSkema[] = [];
  let urutan = 0;

  for (const ws of wb.worksheets) {
    let kelompok: string | null = null;
    // Satu kategori yang sedang dikumpulkan, beserta nomornya pada kolom
    // pertama. Ia baru ditutup ketika nomornya berganti atau tabelnya habis.
    let kini: { no: string; kategori: string[]; nilai: string[];
                keterangan: string[] } | null = null;

    const tutup = () => {
      if (!kini || !kelompok) { kini = null; return; }
      const kategori = gabung(kini.kategori);
      const nilai = gabung(kini.nilai);
      const keterangan = gabung(kini.keterangan);
      // Baris tanpa kategori maupun nilai bukan baris skema — ia sisa baris
      // kosong yang ikut terbawa di antara dua tabel.
      if (kategori || nilai) {
        skema.push({ kelompok, urutan: ++urutan, kategori, nilai, keterangan });
      }
      kini = null;
    };

    ws.eachRow({ includeEmpty: false }, (row) => {
      const sel = [1, 2, 3, 4].map((n) => row.getCell(n));
      const s = sel.map(isiSel);
      // Baris yang seluruh selnya ikutan sebuah gabungan terbaca kosong di
      // sini, padahal pada lembarnya ia bagian dari kategori yang sedang
      // berjalan. Dibedakan dari baris yang memang kosong, yang menutup tabel.
      const ikutan = sel.some((c) => c.type === ValueType.Merge);

      // Kepala memo: "Label : isi" pada kolom pertama, sebelum tabel mana pun.
      if (!kelompok && s[0] && !s[1] && s[0].includes(":")) {
        const [label, ...sisa] = s[0].split(":");
        const isi = sisa.join(":").trim();
        const l = label.trim().toLowerCase();
        if (!isi) return;
        if (l.startsWith("no. memo") || l.startsWith("no memo")) kolom.nomor = isi;
        else if (l.startsWith("dari")) kolom.dari = isi;
        else if (l.startsWith("tanggal")) {
          const t = tanggalPanjang(isi); if (t) kolom.tanggal_memo = t;
        } else if (l.startsWith("perihal")) kolom.judul = isi;
        else if (l.startsWith("periode")) {
          const p = periodeProgram(isi);
          if (p) { kolom.berlaku_dari = p.dari; kolom.berlaku_sampai = p.sampai; }
        }
        return;
      }

      const judul = s[0].match(KEPALA_TABEL);
      if (judul) { tutup(); kelompok = judul[1].trim(); return; }
      if (!kelompok) return;

      // Kepala kolom tabelnya sendiri — "No | Kategori | Nilai | Keterangan".
      if (KEPALA_KOLOM.test(s[0]) && /kategori/i.test(s[1])) { tutup(); return; }

      if (!s[0] && !s[1] && !s[2] && !s[3]) { if (!ikutan) tutup(); return; }

      // Nomor yang berganti menutup kategori sebelumnya. Nomor yang kosong
      // berarti baris ini sambungan kategori yang sedang berjalan.
      if (s[0] && (!kini || kini.no !== s[0])) {
        tutup();
        kini = { no: s[0], kategori: [], nilai: [], keterangan: [] };
      }
      if (!kini) kini = { no: "", kategori: [], nilai: [], keterangan: [] };
      kini.kategori.push(s[1]);
      kini.nilai.push(s[2]);
      kini.keterangan.push(s[3]);
    });

    tutup();
  }

  return { kolom, skema };
}

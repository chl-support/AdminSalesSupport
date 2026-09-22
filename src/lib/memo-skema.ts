/**
 * Membedah tabel skema fee di dalam memo menjadi baris-baris berkategori.
 *
 * Kolom "Nilai / Skema Fee" pada satu memo bukan satu kalimat. Di dalam
 * memonya ia berupa beberapa tabel bernomor — "1. Skema Komisi & Reward Sales
 * Inhouse", "2. Skema Komisi Agent", dan seterusnya — yang masing-masing
 * berisi baris No | Kategori | Nilai | Keterangan. Disimpan sebagai satu
 * kalimat, isinya tidak bisa dicari, dijumlah, maupun dibandingkan antar
 * memo. Berkas ini mengubahnya menjadi baris.
 *
 * Yang dibaca BUKAN teks datar hasil OCR, melainkan kotak letak tiap katanya.
 * Pada teks datar, kolom-kolom sebuah tabel berjalin menjadi satu baris —
 * "1 Komisi Inhouse lunit - 1.596 lengkap ditandatangani." adalah tiga kolom
 * yang berbeda, dan tidak ada tanda pemisah apa pun di antaranya yang bisa
 * diandalkan. Dengan koordinat x tiap kata, kolomnya dapat dipulihkan: tabel
 * bergaris meninggalkan lorong kosong tegak di antara kolomnya, dan lorong
 * itulah yang dicari di sini.
 *
 * Tidak memakai API Node mana pun — dijalankan di peramban, bersama OCR-nya.
 */

/** Satu kata beserta kotak letaknya, sebagaimana dikembalikan mesin OCR. */
export type KataOCR = {
  /** Nomor halaman, dari 0. */ h: number;
  t: string; x0: number; y0: number; x1: number; y1: number;
};

/** Satu baris tabel skema. */
export type BarisSkema = {
  /** Judul tabelnya, mis. "Skema Komisi Agent". */ kelompok: string;
  urutan: number;
  kategori: string;
  nilai: string;
  keterangan: string;
};

/** Judul tabel: "1. Skema Komisi & Reward Sales Inhouse". */
const KEPALA = /^\s*(\d{1,2})\s*[.)]\s*(Skema\b.*)$/i;

/** Tabel terakhir berakhir di sini, bukan di ujung halaman: penutup surat dan
 *  blok tanda tangan bukan bagian dari tabel mana pun. */
const PENUTUP = /^\s*(Demikian|Diajukan|Diketahui|Disetujui|Hormat)\b/i;

/** Baris kepala tabel itu sendiri — "No | Kategori | Nilai | Keterangan" —
 *  bukan data. Dikenali longgar karena hasil OCR-nya kerap cacat
 *  ("INof — Kategori | Nilai p Keterangn"). */
const BARIS_KEPALA = /kategori/i;

/** Kata kepala kolom yang berdiri sendiri pada satu baris cetak — sisa baris
 *  kepala yang terpotong oleh OCR. Bukan data, dan bila dibiarkan ia menjadi
 *  pembuka palsu pada kolom Nilai. */
const KEPALA_KOLOM = /^[|\s.]*(no\.?|kategori|nilai|keterangan)[|\s.]*$/i;

type Baris = { y0: number; y1: number; kata: KataOCR[]; teks: string };

/**
 * Mengelompokkan kata menjadi baris menurut tumpang tindih tegaknya.
 *
 * Bukan menurut kesamaan y: huruf pada satu baris cetak tidak pernah duduk
 * pada satu koordinat yang persis sama, apalagi pada pindaian yang miring
 * sepersekian derajat.
 */
function keBaris(kata: KataOCR[]): Baris[] {
  const hasil: Baris[] = [];
  for (const w of [...kata].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const tinggi = w.y1 - w.y0;
    const b = hasil.find((r) =>
      Math.min(r.y1, w.y1) - Math.max(r.y0, w.y0) >
      0.45 * Math.min(r.y1 - r.y0, tinggi));
    if (b) { b.kata.push(w); b.y0 = Math.min(b.y0, w.y0); b.y1 = Math.max(b.y1, w.y1); }
    else hasil.push({ y0: w.y0, y1: w.y1, kata: [w], teks: "" });
  }
  hasil.sort((a, b) => a.y0 - b.y0);
  for (const b of hasil) {
    b.kata.sort((x, y) => x.x0 - y.x0);
    b.teks = b.kata.map((w) => w.t).join(" ");
  }
  return hasil;
}

/**
 * Lorong kosong tegak di dalam sebuah wilayah, sebagai [tengah, lebar].
 *
 * Ambang lebarnya dinyatakan sebagai pecahan dari lebar tabelnya, bukan
 * dalam piksel. Halaman yang sama digambar pada ukuran yang berbeda-beda —
 * pindaian aslinya 3507 piksel, hasil render PDF di peramban separuhnya —
 * dan ambang piksel yang pas pada yang satu menutup seluruh lorong pada
 * yang lain.
 */
const AMBANG_LORONG = 0.0045;

function lorong(kata: KataOCR[]): [number, number][] {
  const lebar = Math.max(...kata.map((w) => w.x1)) + 10;
  const kiriAwal = Math.min(...kata.map((w) => w.x0));
  const minimal = Math.max(3, Math.round(AMBANG_LORONG * (lebar - kiriAwal)));
  const isi = new Uint16Array(lebar + 1);
  for (const w of kata)
    for (let x = w.x0; x < Math.min(w.x1, lebar); x++) isi[x]++;
  const hasil: [number, number][] = [];
  let mulai: number | null = null;
  for (let x = 0; x <= lebar; x++) {
    if (x < lebar && isi[x] === 0) { if (mulai === null) mulai = x; continue; }
    if (mulai !== null && x - mulai >= minimal)
      hasil.push([Math.round((mulai + x) / 2), x - mulai]);
    mulai = null;
  }
  const kiri = Math.min(...kata.map((w) => w.x0));
  return hasil.filter(([t]) => t > kiri);
}

/**
 * Tiga garis pemisah antara keempat kolom tabel.
 *
 * Tidak diambil begitu saja sebagai "tiga lorong terlebar". Tabel yang
 * kolom Keterangan-nya hanya terisi sebaris meninggalkan lorong kosong
 * selebar ratusan piksel di sisi kanan, dan lorong itu akan mengalahkan
 * pemisah yang sebenarnya. Tiap pemisah karena itu dicari pada jangkauan
 * tempat ia memang seharusnya berada: kolom No sempit dan selalu di kiri,
 * kolom Kategori menyusul, dan sisanya milik Nilai dan Keterangan.
 */
/** Jangkauan tempat tiap pemisah dicari, sebagai pecahan lebar tabelnya. */
const JANGKAUAN_NO = 0.13;
const JANGKAUAN_KATEGORI = 0.24;

function pemisah(kata: KataOCR[]): number[] {
  const kiri = Math.min(...kata.map((w) => w.x0));
  const lebar = Math.max(...kata.map((w) => w.x1)) - kiri;
  const l = lorong(kata);
  const terlebar = (bawah: number, atas: number) => {
    let pilih: [number, number] | null = null;
    for (const c of l)
      if (c[0] > bawah && c[0] <= atas && (!pilih || c[1] > pilih[1])) pilih = c;
    return pilih?.[0] ?? null;
  };
  const b1 = terlebar(kiri, kiri + JANGKAUAN_NO * lebar);
  if (b1 === null) return [];
  const b2 = terlebar(b1, b1 + JANGKAUAN_KATEGORI * lebar);
  if (b2 === null) return [b1];
  const b3 = terlebar(b2, Number.MAX_SAFE_INTEGER);
  return b3 === null ? [b1, b2] : [b1, b2, b3];
}

/** Isi tiap kolom pada satu baris. */
function selBaris(b: Baris, batas: number[]): string[] {
  const sel = new Array(batas.length + 1).fill("");
  for (const w of b.kata) {
    const tengah = (w.x0 + w.x1) / 2;
    let i = 0;
    while (i < batas.length && tengah > batas[i]) i++;
    sel[i] = sel[i] ? `${sel[i]} ${w.t}` : w.t;
  }
  return sel;
}

/**
 * Membetulkan salah baca yang khas pada tabel semacam ini.
 *
 * Ketiganya berulang di seluruh berkas dan punya bentuk yang jelas, jadi
 * dibetulkan; salah baca yang tidak berpola dibiarkan, karena menebaknya
 * lebih berbahaya daripada membiarkannya terlihat salah.
 *
 *  - Tanda persen terbaca sebagai angka 96: "15%" menjadi "1596", "0,2%"
 *    menjadi "0,296". Hanya angka yang berdiri sendiri yang dibetulkan;
 *    nominal rupiah seperti "8.000.000" tidak pernah berbentuk demikian.
 *  - Tanda tambah pada "H+30" terbaca sebagai 4, 1, t, atau #.
 *  - Angka 1 di depan kata menempel: "lunit" untuk "1 unit".
 */
export function rapikanSkema(s: string): string {
  return s
    .replace(/\bl\s?[Uu]nit\b/g, "1 unit")
    .replace(/(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)96(?![\d.,])/g, "$1%")
    .replace(/\bH\s*[14t#]+\s*(\d{1,2})\b/g, "H+$1")
    .replace(/\bPerunit\b/g, "Per unit")
    // Garis tegak tabelnya kerap ikut terbaca sebagai huruf.
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s.,;:|-]+|[\s.,;:|-]+$/g, "")
    .trim();
}

/** Nilai yang tampak seperti nilai: angka, persen, atau rupiah. */
const TAMPAK_NILAI =
  /^(?:@?Rp\.?\s*)?\d[\d.,]*\s*%?|^\d{1,3}(?:[.,]\d{1,2})?%/;

/**
 * Membedah seluruh tabel skema di dalam satu memo.
 *
 * Nomor barisnya ditulis ulang berurutan, tidak diambil dari kolom No pada
 * memonya: angka setipis itu adalah yang paling sering salah terbaca, dan
 * nomor yang melompat lebih membingungkan daripada nomor yang dihitung
 * sendiri.
 */
export function bedahSkema(kata: KataOCR[]): BarisSkema[] {
  const hasil: BarisSkema[] = [];
  const halaman = Array.from(new Set(kata.map((w) => w.h))).sort((a, b) => a - b);

  for (const h of halaman) {
    const baris = keBaris(kata.filter((w) => w.h === h));
    const kepala = baris
      .map((b, i) => [i, KEPALA.exec(b.teks)] as const)
      .filter((x): x is readonly [number, RegExpExecArray] => !!x[1]);

    for (const [n, [i, cocok]] of kepala.entries()) {
      let akhir = n + 1 < kepala.length ? kepala[n + 1][0] : baris.length;
      for (let q = i + 1; q < akhir; q++)
        if (PENUTUP.test(baris[q].teks)) { akhir = q; break; }

      const isi = baris.slice(i + 1, akhir).filter(
        (b) => !BARIS_KEPALA.test(b.teks) && !KEPALA_KOLOM.test(b.teks));
      const kataIsi = isi.flatMap((b) => b.kata);
      if (kataIsi.length < 3) continue;
      const batas = pemisah(kataIsi);
      if (batas.length < 3) continue;

      const kelompok = cocok[2].trim();

      // Nomor baris dan nama kategorinya dicetak di TENGAH tinggi barisnya,
      // bukan di puncaknya — kolom Keterangan yang menjulang lima baris
      // membuat nomornya duduk di baris ketiga. Karena itu baris cetak
      // dibagikan ke nomor yang titik tengahnya paling dekat, bukan ditumpuk
      // ke nomor terakhir yang terlewati: yang terakhir akan menelan seluruh
      // keterangan baris sesudahnya, dan yang pertama akan menelan pembuka
      // tabelnya.
      const sel = isi.map((b) => selBaris(b, batas));
      const jangkar: number[] = [];
      for (const [q, s] of sel.entries())
        if (/^\d{1,2}\s*[.)]?$/.test(s[0].trim())) jangkar.push(q);
      if (!jangkar.length) continue;

      const tengah = (q: number) => (isi[q].y0 + isi[q].y1) / 2;
      const baru: BarisSkema[] = jangkar.map((_, n) => ({
        kelompok, urutan: n + 1, kategori: "", nilai: "", keterangan: "",
      }));
      for (const [q] of sel.entries()) {
        let dekat = 0;
        for (let n = 1; n < jangkar.length; n++)
          if (Math.abs(tengah(q) - tengah(jangkar[n])) <
              Math.abs(tengah(q) - tengah(jangkar[dekat]))) dekat = n;
        const t = baru[dekat];
        for (const [kolom, kunci] of
             [[1, "kategori"], [2, "nilai"], [3, "keterangan"]] as const)
          if (sel[q][kolom])
            t[kunci] = t[kunci] ? `${t[kunci]} ${sel[q][kolom]}` : sel[q][kolom];
      }

      for (const t of baru) {
        t.kategori = rapikanSkema(t.kategori);
        t.nilai = rapikanSkema(t.nilai);
        t.keterangan = rapikanSkema(t.keterangan);
        // Garis pemisah yang meleset beberapa piksel membuat nilai sesempit
        // "1%" jatuh ke kolom Keterangan. Bila Nilai kosong sedangkan
        // Keterangan justru dibuka oleh sesuatu yang berbentuk nilai,
        // pembukanya dikembalikan ke tempatnya.
        if (!t.nilai && TAMPAK_NILAI.test(t.keterangan)) {
          const m = TAMPAK_NILAI.exec(t.keterangan)!;
          t.nilai = m[0].trim();
          t.keterangan = t.keterangan.slice(m[0].length).trim();
        }
      }
      hasil.push(...baru.filter((t) => t.kategori || t.nilai || t.keterangan));
    }
  }
  return hasil;
}

/** Ringkasan satu baris untuk kolom "Nilai / Skema Fee" yang lama. */
export function ringkasSkema(baris: BarisSkema[]): string {
  return baris.map((b) =>
    `${b.kategori}: ${b.nilai}`.replace(/:\s*$/, "")).join("; ");
}

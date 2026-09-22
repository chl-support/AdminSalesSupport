/**
 * Menebak isian kolom memo dari teksnya.
 *
 * Dipisah dari pembacaan berkasnya karena dipakai di dua tempat: di server,
 * atas teks yang diambil dari lapisan teks PDF; dan di peramban, atas teks
 * hasil OCR sebuah pindaian. Berkas ini sengaja tidak menyentuh satu pun API
 * Node — begitu ia mengimpor node:zlib, ia tidak lagi dapat ikut ke peramban.
 */

export type Tebakan = {
  judul?: string; nomor?: string; tanggal_memo?: string;
  berlaku_dari?: string; berlaku_sampai?: string;
  dari?: string; kepada?: string; nilai_skema?: string;
  dokumen_wajib?: string; diajukan_oleh?: string; diketahui_oleh?: string;
  disetujui_oleh?: string;
};

export const BULAN: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7,
  agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agt: 8, ags: 8, agu: 8,
  sep: 9, sept: 9, okt: 10, nov: 11, des: 12,
};

/** "30 Juli 2026" menjadi "2026-07-30". */
export function keIso(hari: number, namaBulan: string, tahun: number) {
  const b = BULAN[namaBulan.toLowerCase().replace(/\.$/, "")];
  if (!b || !hari || !tahun) return undefined;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${tahun}-${p(b)}-${p(hari)}`;
}

// ── Menebak kolom dari teksnya ────────────────────────────────────────────

/** Sisa baris sesudah label, dengan titik dua dan titik pemisahnya dibuang. */
const sesudahLabel = (baris: string) =>
  baris.replace(/^[^:]*:\s*/, "").replace(/^[-–—.\s]+/, "").trim();

const rapikan = (v?: string | null) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t && t.length > 1 ? t : undefined;
};

/**
 * Nilai sebuah label, termasuk baris-baris lanjutannya.
 *
 * "Kepada Yth" kerap ditulis menurun — satu nama satu baris — dan mengambil
 * baris pertamanya saja menghasilkan satu dari tiga nama yang seharusnya.
 * Karena itu baris berikutnya ikut diambil selama ia belum menjadi label
 * baru, belum kosong, dan belum berupa butir bernomor.
 */
/**
 * Nilai yang justru berisi label lain ditolak.
 *
 * Pada memo yang sudah ditandatangani, ketiga label persetujuan berdiri
 * berdampingan sebagai kepala kolom tanda tangan — "Diajukan Oleh  Diketahui
 * Oleh  Disetujui Oleh" — dan namanya ada di baris bawahnya. Dibaca sebagai
 * teks datar, barisnya utuh seperti itu, dan yang tersimpan pada kolom
 * "Diajukan oleh" menjadi tiga kepala kolom, bukan nama siapa pun.
 *
 * Kolom kosong lebih baik daripada itu: kolom ini menyangkut siapa
 * bertanggung jawab atas sebuah angka.
 */
const BERISI_LABEL =
  /\b(diajukan|diketahui|disetujui|menyetujui|mengetahui|kepada|perihal|nomor)\b/i;

function nilaiLabel(baris: string[], i: number, labelLain: RegExp) {
  const bagian = [sesudahLabel(baris[i])];
  for (let j = i + 1; j < baris.length && j < i + 5; j++) {
    const b = baris[j].trim();
    if (!b || labelLain.test(b) || /^\d+[.)]\s/.test(b)) break;
    // Baris lanjutan hampir selalu sambungan nama; yang diawali huruf kapital
    // atau tanda sambung diterima, selebihnya dianggap alinea baru.
    if (!/^[A-Z(&,\/-]|^(dan|serta)\b/i.test(b)) break;
    bagian.push(b);
  }
  const nilai = rapikan(bagian.join(" "));
  return nilai && !BERISI_LABEL.test(nilai) ? nilai : undefined;
}

const LABEL = new RegExp(
  "^\\s*(nomor|no\\.?|tanggal|tgl\\.?|kepada|dari|perihal|hal|periode|" +
  "lampiran|dokumen|nilai|skema|diajukan|diketahui|disetujui|menyetujui|" +
  "mengetahui|pemohon)\\b", "i");

/**
 * Rentang bulan pada sebuah kalimat menjadi tanggal awal dan akhir.
 *
 * "Agustus–Desember 2026", "Agustus s.d. Desember 2026", dan "Jan–Des 2026"
 * ketiganya dipakai pada memo yang sama. Tanggalnya diambil sebagai hari
 * pertama bulan awal dan hari terakhir bulan akhir: yang dinyatakan memo
 * adalah bulannya, dan menebak tanggal yang lebih tepat dari itu berarti
 * mengarang.
 */
export function rentangBulan(teks: string) {
  const b = "(" + Object.keys(BULAN).join("|") + ")";
  const re = new RegExp(
    `${b}\\.?\\s*(?:(\\d{4})\\s*)?(?:s\\.?d\\.?|sampai(?:\\s+dengan)?|hingga|[–—-])\\s*` +
    `${b}\\.?\\s*(\\d{4})`, "i");
  const m = re.exec(teks);
  if (!m) return {};
  const b1 = BULAN[m[1].toLowerCase()], b2 = BULAN[m[3].toLowerCase()];
  const th2 = Number(m[4]);
  const th1 = m[2] ? Number(m[2]) : (b1 <= b2 ? th2 : th2 - 1);
  if (!b1 || !b2 || !th2) return {};
  const p = (n: number) => String(n).padStart(2, "0");
  const akhir = new Date(Date.UTC(th2, b2, 0)).getUTCDate();
  return {
    berlaku_dari: `${th1}-${p(b1)}-01`,
    berlaku_sampai: `${th2}-${p(b2)}-${p(akhir)}`,
  };
}

/**
 * Tanggal pertama yang ditulis panjang pada sepotong teks.
 *
 * Pemisah antar bagiannya dibiarkan longgar. Pada pindaian, spasi antara
 * angka dan nama bulan kerap hilang ("01Januari 2026") atau berganti menjadi
 * koma maupun titik; memaksakan satu spasi membuat tanggal yang sebenarnya
 * terbaca jelas oleh mata justru tidak terbaca oleh mesin.
 */
function tanggalPanjang(teks: string) {
  const b = "(" + Object.keys(BULAN).join("|") + ")";
  const m = new RegExp(`(\\d{1,2})[\\s.,-]*${b}\\.?[\\s.,-]*(\\d{4})`, "i")
    .exec(teks);
  return m ? keIso(Number(m[1]), m[2], Number(m[3])) : undefined;
}

/**
 * Tanggal yang ditulis serba angka: "02/01/2026", "2-1-2026", "2.1.26".
 *
 * Hari dulu, baru bulan — sebagaimana lazim ditulis di sini. Hanya dipakai
 * pada teks yang sudah dipastikan mengikuti label "Tanggal", tidak dicari
 * bebas di seluruh memo: nomor memo, nomor perjanjian, dan nomor telepon
 * semuanya berbentuk angka-berpemisah, dan salah satunya pasti tersangkut.
 */
function tanggalAngka(teks: string) {
  const m = /(?<![\d/.\-])(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?![\d/.\-])/
    .exec(teks);
  if (!m) return undefined;
  const hari = Number(m[1]), bulan = Number(m[2]);
  let tahun = Number(m[3]);
  if (hari < 1 || hari > 31 || bulan < 1 || bulan > 12) return undefined;
  // Tahun dua angka dianggap abad ini. Memo yang diurus sistem ini tidak
  // pernah berasal dari tahun 1900-an.
  if (tahun < 100) tahun += 2000;
  if (tahun < 2000 || tahun > 2100) return undefined;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${tahun}-${p(bulan)}-${p(hari)}`;
}

/** Tanggal pada sepotong teks, ditulis panjang maupun serba angka. */
function tanggalApaPun(teks: string) {
  return tanggalPanjang(teks) ?? tanggalAngka(teks);
}

/**
 * Isian kolom yang dapat dibaca dari teks sebuah memo.
 *
 * Yang tidak ditemukan tidak diisi — bukan diisi tebakan terdekat. Kolom
 * kosong meminta orang mengisinya; kolom berisi tebakan yang keliru tidak
 * meminta apa pun, dan justru itulah yang tersimpan.
 */
export function tebakKolom(teks: string): Tebakan {
  if (!teks.trim()) return {};
  const baris = teks.split(/\r?\n/).map((b) => b.replace(/\s+/g, " ").trim());
  const t: Tebakan = {};
  const dokumen: string[] = [];
  let dalamDokumen = false;

  baris.forEach((b, i) => {
    if (!b) { dalamDokumen = false; return; }

    if (!t.nomor && /^(nomor|no\.?)\s*[:.]/i.test(b)) {
      // Nomor memo dikenali dari garis miringnya, bukan dari panjangnya:
      // "009/GGI-MC-MARCHAND/VII/2026" selalu bergaris miring, dan tidak ada
      // kolom lain pada memo yang berbentuk begitu.
      const n = sesudahLabel(b);
      if (/\//.test(n)) t.nomor = rapikan(n);
    }
    // Labelnya dicari di mana pun pada barisnya, bukan hanya di awalnya. OCR
    // kerap menyatukan dua kolom sebuah kepala surat menjadi satu baris —
    // "Nomor : 002/SBC   Tanggal : 5 Maret 2026" — dan yang berpatokan pada
    // awal baris akan melewatkan seluruhnya.
    const berlabelTanggal = /(?:^|\s)(?:tanggal|tgl\.?)\s*[:.]/i.exec(b);
    if (!t.tanggal_memo && berlabelTanggal) {
      t.tanggal_memo =
        tanggalApaPun(b.slice(berlabelTanggal.index + berlabelTanggal[0].length))
        ?? undefined;
    }
    if (!t.kepada && /^kepada\b/i.test(b)) {
      t.kepada = nilaiLabel(baris, i, LABEL);
    }
    if (!t.dari && /^dari\s*[:.]/i.test(b)) {
      t.dari = nilaiLabel(baris, i, LABEL);
    }
    if (!t.judul && /^(perihal|hal)\s*[:.]/i.test(b)) {
      t.judul = nilaiLabel(baris, i, LABEL);
    }
    // Nilai: label eksplisit lebih dulu. Tanpa itu, baris Perihal ikut
    // tersangkut — "Program Fee Referensi 2,5%" juga memuat tanda persen,
    // dan ia yang terbaca lebih dulu karena letaknya di atas.
    if (/^(nilai|skema)\b/i.test(b)) {
      const v = nilaiLabel(baris, i, LABEL);
      if (v) t.nilai_skema = v;
    }
    for (const [pola, kolom] of [
      [/^diajukan\b/i, "diajukan_oleh"], [/^(diketahui|mengetahui)\b/i, "diketahui_oleh"],
      [/^(disetujui|menyetujui)\b/i, "disetujui_oleh"],
    ] as [RegExp, keyof Tebakan][]) {
      if (!t[kolom] && pola.test(b)) {
        (t as any)[kolom] = nilaiLabel(baris, i, LABEL);
      }
    }

    // Dokumen pendukung: labelnya membuka daftar, dan butir bernomor
    // sesudahnya ikut terbaca sampai daftarnya habis.
    if (/^(dokumen pendukung|lampiran|dokumen wajib)\b/i.test(b)) {
      dalamDokumen = true;
      const sisa = sesudahLabel(b);
      if (sisa && !/^\d+$/.test(sisa)) dokumen.push(sisa);
      return;
    }
    if (dalamDokumen) {
      const butir = b.replace(/^\d+[.)]\s*/, "").replace(/^[-•]\s*/, "").trim();
      if (butir && butir !== b) dokumen.push(butir);
      else if (LABEL.test(b)) dalamDokumen = false;
    }
  });

  // Tanpa label Nilai sama sekali, baris pertama yang menyebut persentase atau
  // rupiah dipakai — kecuali baris yang sudah menjadi kolom lain. Memo yang
  // menulis nilainya di tengah kalimat memang ada; yang tidak ada adalah memo
  // yang tidak menyebut nilainya di mana pun.
  if (!t.nilai_skema) {
    const dipakai = new Set([t.judul, t.kepada, t.dari, t.nomor]
      .filter(Boolean).map((v) => String(v)));
    const baik = baris.find((b) =>
      /(rp\s*[\d.]|\d\s*%)/i.test(b) &&
      !/^(nomor|no\.?|tanggal|tgl\.?|perihal|hal|kepada|dari)\b/i.test(b) &&
      !dipakai.has(rapikan(b) ?? ""));
    if (baik) t.nilai_skema = rapikan(baik);
  }

  // Blok tanda tangan di kaki memo: ketiga nama dibaca menurut letak
  // kolomnya. Hanya dipakai bila label persetujuan belum terisi dari badan
  // suratnya, yang memang lebih dapat dipercaya bila ada.
  const ttd = blokTandaTangan(baris);
  for (const kunci of
       ["diajukan_oleh", "diketahui_oleh", "disetujui_oleh"] as const) {
    if (!t[kunci] && ttd[kunci]) t[kunci] = ttd[kunci];
  }

  const rentang = rentangBulan(teks);
  if (rentang.berlaku_dari) t.berlaku_dari = rentang.berlaku_dari;
  if (rentang.berlaku_sampai) t.berlaku_sampai = rentang.berlaku_sampai;
  // Tanggal tanpa label hanya diterima dari kepala surat — "Serpong, 22
  // Desember 2021". Dicari bebas di dua belas baris pertama, yang tersangkut
  // bisa saja tanggal mulai berlakunya, dan tanggal memo yang keliru tersimpan
  // sebagai kapan sesuatu diputuskan.
  if (!t.tanggal_memo) {
    const kepala = baris.slice(0, 12)
      .find((b) => /^[A-Za-z .]{3,24},\s*\d{1,2}[\s.,-]/.test(b));
    if (kepala) t.tanggal_memo = tanggalPanjang(kepala);
  }
  // Masih kosong: tanggal panjang pertama pada kepala memo, di mana pun ia
  // berada. Baris perihal dilewati — di sanalah periode programnya ditulis,
  // dan tanggal mulai berlaku bukan tanggal memonya. Longgar memang, tetapi
  // kolom ini tampil di layar unggah dan dapat dibetulkan sebelum disimpan;
  // yang kosong sama sekali justru diam-diam terbawa ke rekapitulasi.
  if (!t.tanggal_memo) {
    for (const b of baris.slice(0, 12)) {
      if (/^(perihal|hal|lampiran|nomor|no\.?)\s*[:.]/i.test(b)) continue;
      const v = tanggalPanjang(b);
      if (v) { t.tanggal_memo = v; break; }
    }
  }
  if (dokumen.length) t.dokumen_wajib = dokumen.join("\n");

  // Kolom kosong dibuang, supaya layar tahu bedanya "tidak ditemukan" dengan
  // "ditemukan kosong".
  for (const kunci of Object.keys(t) as (keyof Tebakan)[]) {
    if (!t[kunci]) delete t[kunci];
  }
  return t;
}

// ── Blok tanda tangan di kaki memo ────────────────────────────────────────

/**
 * Ketiga nama pada blok tanda tangan, dibaca menurut letaknya.
 *
 * Pada memo yang sudah ditandatangani, ketiga label berdiri berdampingan
 * sebagai kepala kolom dan namanya ada di baris paling bawah — dipisahkan
 * garis kolom, coretan tanda tangan, dan apa pun yang tertangkap OCR di
 * antaranya:
 *
 *   Diajukan Oleh, Diketahui Oleh, Disetujui
 *   #96 4
 *   Ya "|. NI
 *   Setia Iskandar Rusli | Almonk ——  /1. / lehannesTanuwijaya
 *
 * Yang dipakai urutannya, bukan labelnya: kolom pertama yang mengajukan,
 * kedua yang mengetahui, ketiga yang menyetujui. Label pada kepala kolom
 * kerap terpotong — pada contoh di atas "Disetujui" kehilangan "Oleh" — dan
 * mencocokkan nama ke label yang rusak lebih rapuh daripada menghitung kolom.
 */
const LABEL_TTD = /diajukan|diketahui|disetujui|mengetahui|menyetujui/gi;

function potongNama(baris: string): string[] {
  return baris
    // Pemisah kolom pada cetakan: garis tegak, garis miring, tanda pisah
    // panjang, atau sekadar dua spasi atau lebih.
    .split(/[|\/\\—–]+|\s{2,}/)
    .map((x) => x
      // Angka dan tanda baca yang tertangkap dari coretan tanda tangan
      // dibuang; yang tersisa hanya huruf.
      .replace(/[^A-Za-z.'\s-]/g, " ")
      // "lehannesTanuwijaya" — dua kata yang menempel karena spasinya hilang
      // saat dipindai.
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ").trim())
    .filter((x) => x.replace(/[^A-Za-z]/g, "").length >= 3);
}

export function blokTandaTangan(baris: string[]): Tebakan {
  // Dicari dari belakang: blok tanda tangan ada di kaki memo, dan kata
  // "disetujui" bisa saja muncul lebih dulu di badan suratnya.
  for (let i = baris.length - 1; i >= 0; i--) {
    const cocok = baris[i].match(LABEL_TTD);
    if (!cocok || cocok.length < 2) continue;

    // Baris nama adalah baris terakhir yang berisi dua kolom atau lebih dalam
    // beberapa baris sesudah kepalanya. Diambil yang terakhir, bukan yang
    // pertama: di antaranya masih ada coretan tanda tangan yang sesekali
    // terbaca sebagai huruf.
    let nama: string[] = [];
    for (let j = i + 1; j < Math.min(i + 9, baris.length); j++) {
      const p = potongNama(baris[j]);
      if (p.length >= 2) nama = p;
    }
    if (nama.length < 2) return {};
    return {
      diajukan_oleh: nama[0],
      diketahui_oleh: nama[1],
      disetujui_oleh: nama[2],
    };
  }
  return {};
}

// ── Mencocokkan nama hasil OCR ke ejaan yang sudah benar ──────────────────

const bersihNama = (v: string) =>
  v.toLowerCase().replace(/[^a-z]/g, "");

/** Jarak sunting, untuk mengukur seberapa jauh dua ejaan. */
function jarak(a: string, b: string) {
  const d: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let atas = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const lama = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1,
                      atas + (a[i - 1] === b[j - 1] ? 0 : 1));
      atas = lama;
    }
  }
  return d[b.length];
}

/**
 * Nama hasil OCR diganti ejaan yang sudah pernah diketik orang.
 *
 * Tanda tangan menimpa tulisan di bawahnya, dan yang terbaca menjadi "Almonk"
 * untuk Al Imron atau "lehannesTanuwijaya" untuk Johannes Tanuwijaya. Nama
 * yang sama itu sudah tersimpan dengan ejaan benar pada memo-memo sebelumnya
 * di project ini — jadi yang diambil dari gambar cukup *siapa di kolom mana*,
 * sedangkan ejaannya diambil dari data yang sudah dikonfirmasi manusia.
 *
 * Yang tidak cukup mirip dibiarkan apa adanya. Memaksakan padanan terdekat
 * pada nama yang memang baru akan menyalin nama orang lain ke kolom
 * tanggung jawab — persis kekeliruan yang paling mahal di layar ini.
 */
const AMBANG = 0.55;

export function cocokkanNama(nilai: string | undefined, dikenal: string[]) {
  if (!nilai || !dikenal.length) return nilai;
  return nilai.split(",").map((bagian) => {
    const asli = bagian.trim();
    const a = bersihNama(asli);
    if (a.length < 3) return asli;

    let terbaik = ""; let nilaiTerbaik = 0;
    for (const d of dikenal) {
      const b = bersihNama(d);
      if (!b) continue;
      const mirip = 1 - jarak(a, b) / Math.max(a.length, b.length);
      if (mirip > nilaiTerbaik) { nilaiTerbaik = mirip; terbaik = d; }
    }
    return nilaiTerbaik >= AMBANG ? terbaik : asli;
  }).join(", ");
}

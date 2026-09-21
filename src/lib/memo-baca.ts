/**
 * Membaca memo yang diunggah, lalu menebak isian kolomnya.
 *
 * Mengetik ulang sepuluh kolom dari berkas yang sudah ada di tangan adalah
 * pekerjaan yang paling mudah keliru di layar ini: nomor memo panjang dan
 * penuh garis miring, tanggalnya ada tiga macam, dan nama orang ditulis
 * dengan gelar. Yang salah ketik baru ketahuan berbulan-bulan kemudian, saat
 * sebuah angka dipersoalkan dan memonya tidak ketemu.
 *
 * Karena itu isinya dibaca dari berkasnya. Hasilnya **usulan**, bukan
 * keputusan: layar mengisi kolom yang masih kosong dan menyebutkan apa saja
 * yang ditemukannya, dan yang mengunggah tetap membaca sebelum menyimpan.
 * Tebakan yang diam-diam tersimpan lebih berbahaya daripada kolom kosong —
 * kolom kosong terlihat, tebakan yang keliru tidak.
 *
 * Yang dapat dibaca hanya berkas yang memang punya lapisan teks: PDF terbitan
 * Word, dan berkas Word itu sendiri. Memo hasil pindaian adalah gambar, dan
 * tidak ada satu pun huruf di dalamnya yang dapat dibaca tanpa OCR — untuk
 * berkas seperti itu fungsi ini mengembalikan kosong, dan mengatakannya.
 */

import { inflateRawSync } from "node:zlib";

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

// ── Teks dari berkasnya ───────────────────────────────────────────────────

/**
 * Isi satu berkas di dalam arsip ZIP.
 *
 * DOCX adalah ZIP berisi word/document.xml. Pembacaannya ditulis di sini,
 * bukan lewat pustaka arsip: yang dibutuhkan hanya satu berkas dengan nama
 * yang sudah diketahui, dan menambah satu pustaka demi itu berarti menambah
 * satu hal lagi yang harus diperbarui ketika ada celah keamanan.
 */
function dariZip(buf: Buffer, namaDicari: string): Buffer | null {
  // Direktori pusatnya dibaca dari belakang, mengikuti bentuk arsipnya.
  let akhir = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { akhir = i; break; }
  }
  if (akhir < 0) return null;

  let p = buf.readUInt32LE(akhir + 16);
  const jumlah = buf.readUInt16LE(akhir + 10);
  for (let i = 0; i < jumlah && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const metode = buf.readUInt16LE(p + 10);
    const ukuran = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28);
    const eLen = buf.readUInt16LE(p + 30);
    const kLen = buf.readUInt16LE(p + 32);
    const awal = buf.readUInt32LE(p + 42);
    const nama = buf.subarray(p + 46, p + 46 + nLen).toString("utf8");

    if (nama === namaDicari) {
      const nLen2 = buf.readUInt16LE(awal + 26);
      const eLen2 = buf.readUInt16LE(awal + 28);
      const isi = buf.subarray(awal + 30 + nLen2 + eLen2,
                               awal + 30 + nLen2 + eLen2 + ukuran);
      return metode === 0 ? Buffer.from(isi) : inflateRawSync(isi);
    }
    p += 46 + nLen + eLen + kLen;
  }
  return null;
}

function teksDariDocx(buf: Buffer): string {
  const xml = dariZip(buf, "word/document.xml");
  if (!xml) return "";
  return xml.toString("utf8")
    // Akhir paragraf dan pemutus baris menjadi baris baru, supaya susunan
    // "Nomor: …" per baris tetap terbaca sebagai baris.
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function teksDariPdf(buf: Buffer): Promise<string> {
  // Muatan malas: pustaka PDF hanya dibutuhkan ketika ada PDF yang dibaca,
  // dan memuatnya di awal memperlambat seluruh route lain tanpa alasan.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const dok = await pdfjs.getDocument({
    data: new Uint8Array(buf), useSystemFonts: true,
    isEvalSupported: false, useWorkerFetch: false,
  }).promise;

  const baris: string[] = [];
  for (let h = 1; h <= dok.numPages; h++) {
    const halaman = await dok.getPage(h);
    const isi = await halaman.getTextContent();
    let baru = "";
    let yTerakhir: number | null = null;
    for (const item of isi.items as any[]) {
      if (typeof item.str !== "string") continue;
      const y = item.transform?.[5];
      // Potongan yang turun barisnya dipisah: tanpa ini seluruh halaman
      // menjadi satu baris panjang dan pola "Nomor: …" tidak pernah cocok.
      if (yTerakhir !== null && typeof y === "number" &&
          Math.abs(y - yTerakhir) > 3) {
        baris.push(baru.trim()); baru = "";
      }
      baru += item.str + (item.hasEOL ? "\n" : "");
      if (typeof y === "number") yTerakhir = y;
    }
    if (baru.trim()) baris.push(baru.trim());
  }
  await dok.destroy?.();
  return baris.join("\n");
}

/** Teks mentah sebuah berkas memo, atau kosong bila memang tidak ada. */
export async function teksBerkas(buf: Buffer, contentType: string,
                                 namaBerkas: string): Promise<string> {
  const tipe = String(contentType ?? "").toLowerCase();
  const nama = String(namaBerkas ?? "").toLowerCase();
  try {
    if (tipe.includes("pdf") || nama.endsWith(".pdf")) {
      return await teksDariPdf(buf);
    }
    if (tipe.includes("wordprocessingml") || nama.endsWith(".docx")) {
      return teksDariDocx(buf);
    }
  } catch {
    // Berkas rusak, terkunci sandi, atau bentuk yang tidak dikenali. Yang
    // gagal dibaca diperlakukan sama dengan yang tidak berisi teks: kosong.
    return "";
  }
  return "";
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
  return rapikan(bagian.join(" "));
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

/** Tanggal pertama yang ditulis panjang pada sepotong teks. */
function tanggalPanjang(teks: string) {
  const b = "(" + Object.keys(BULAN).join("|") + ")";
  const m = new RegExp(`(\\d{1,2})\\s+${b}\\.?\\s+(\\d{4})`, "i").exec(teks);
  return m ? keIso(Number(m[1]), m[2], Number(m[3])) : undefined;
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
    if (!t.tanggal_memo && /^(tanggal|tgl\.?)\s*[:.]/i.test(b)) {
      t.tanggal_memo = tanggalPanjang(b) ?? undefined;
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

  const rentang = rentangBulan(teks);
  if (rentang.berlaku_dari) t.berlaku_dari = rentang.berlaku_dari;
  if (rentang.berlaku_sampai) t.berlaku_sampai = rentang.berlaku_sampai;
  if (!t.tanggal_memo) t.tanggal_memo = tanggalPanjang(baris.slice(0, 12).join(" "));
  if (dokumen.length) t.dokumen_wajib = dokumen.join("\n");

  // Kolom kosong dibuang, supaya layar tahu bedanya "tidak ditemukan" dengan
  // "ditemukan kosong".
  for (const kunci of Object.keys(t) as (keyof Tebakan)[]) {
    if (!t[kunci]) delete t[kunci];
  }
  return t;
}

// ── Bila berkasnya pindaian: namanya yang dibaca ──────────────────────────

const ROMAWI: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6,
  vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
};

/**
 * Isian yang dapat dibaca dari nama berkasnya sendiri.
 *
 * Memo yang sudah ditandatangani hampir selalu berupa pindaian: gambar, tanpa
 * satu pun huruf yang dapat dibaca tanpa OCR. Tetapi namanya bukan gambar, dan
 * penamaannya taat pola:
 *
 *   013-SBC-MC-BNR-VII-2026_Pengajuan_Skema_Komisi_Banara_Serpong_Juli_-_Sept_2026
 *   └── nomor ──────────┘ └── perihal ───────────────────────┘ └─ periode ─┘
 *
 * Yang terbaca dari sana hanya nomor, perihal, dan periodenya. Nama orang —
 * yang mengajukan, yang mengetahui, yang menyetujui — tidak ada pada nama
 * berkas, dan tidak ditebak-tebak dari mana pun: ketiganya menyangkut siapa
 * bertanggung jawab atas sebuah angka.
 *
 * Tanggal memo juga tidak diisi. Angka Romawi pada nomornya menyatakan
 * bulannya, bukan harinya, dan hari yang dikarang akan tersimpan seolah-olah
 * dibaca dari memonya.
 */
export function tebakDariNama(namaBerkas: string): Tebakan {
  const nama = String(namaBerkas ?? "").replace(/\.[A-Za-z0-9]+$/, "");
  if (!nama) return {};
  const t: Tebakan = {};

  // Nomor dikenali dari ekornya — angka Romawi lalu tahun — bukan dari
  // pemisahnya.
  //
  // Pemisah antara nomor dan perihal berbeda-beda: berkas yang ditulis
  // langsung memakai spasi, yang pernah melewati jalur unggahan memakai garis
  // bawah, dan keduanya bercampur di satu map yang sama. Mencocokkan pemisah
  // berarti separuh berkas tidak terbaca hanya karena cara namanya diketik.
  //
  // Bagian sebelum angka Romawi diambil sependek mungkin, supaya perihal yang
  // kebetulan memuat tahun — "… Jan - Mar 2026" — tidak ikut tertelan.
  const m = /^(.*?)[-_\s]+([ivx]{1,4})[-_\s]+((?:19|20)\d{2})(?:[-_\s]+(.*))?$/i
    .exec(nama);

  let perihal = nama;
  if (m && ROMAWI[m[2].toLowerCase()] !== undefined) {
    const depan = m[1].split(/[-_\s]+/).filter(Boolean);
    const urut = depan[0];
    const kode = depan.slice(1).join("-");
    // Garis miring yang tidak boleh ada pada nama berkas dikembalikan ke
    // tempatnya.
    if (urut && /^\d+$/.test(urut) && kode) {
      t.nomor = `${urut}/${kode}/${m[2].toUpperCase()}/${m[3]}`;
      perihal = m[4] ?? "";
    }
  }

  const judul = perihal.replace(/[_]+/g, " ")
    .replace(/\s*-\s*/g, " – ").replace(/\s+/g, " ").trim();
  if (judul.length > 3) t.judul = judul;

  const rentang = rentangBulan(judul);
  if (rentang.berlaku_dari) t.berlaku_dari = rentang.berlaku_dari;
  if (rentang.berlaku_sampai) t.berlaku_sampai = rentang.berlaku_sampai;

  return t;
}

/**
 * Sumber tebakan, supaya layar dapat mengatakannya apa adanya.
 *
 * Bedanya penting bagi yang mengunggah: "dibaca dari isi memo" berarti
 * seluruh kolom memang berasal dari memonya, sedangkan "dibaca dari nama
 * berkas" berarti hanya tiga kolom yang terisi dan sisanya memang harus
 * diketik — bukan karena sistemnya gagal, melainkan karena memonya pindaian.
 */
export type HasilBaca = {
  sumber: "isi" | "nama" | "tidak-ada";
  kolom: Tebakan;
};

export async function bacaMemo(
  buf: Buffer, contentType: string, namaBerkas: string,
): Promise<HasilBaca> {
  const teks = await teksBerkas(buf, contentType, namaBerkas);
  const dariIsi = tebakKolom(teks);
  if (Object.keys(dariIsi).length >= 3) {
    // Nama berkas tetap dipakai untuk menambal kolom yang tidak terbaca dari
    // isinya — bukan untuk menimpa yang sudah terbaca.
    return { sumber: "isi", kolom: { ...tebakDariNama(namaBerkas), ...dariIsi } };
  }
  const dariNama = tebakDariNama(namaBerkas);
  const gabung = { ...dariNama, ...dariIsi };
  if (!Object.keys(gabung).length) return { sumber: "tidak-ada", kolom: {} };
  return { sumber: Object.keys(dariIsi).length ? "isi" : "nama", kolom: gabung };
}

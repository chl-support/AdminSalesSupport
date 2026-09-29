/**
 * Membaca memo yang datang sebagai berkas Excel, sel demi sel.
 *
 * Memo yang lahir sebagai PDF atau pindaian harus dibedah: kolomnya sudah
 * hilang menjadi tinta, dan satu-satunya jalan memulihkannya adalah menebak
 * dari koordinat tiap kata. Berkas Excel tidak begitu. Di dalamnya kolom dan
 * baris masih berupa kolom dan baris, lengkap dengan gabungan selnya dan
 * bentuk tampilan angkanya. Menebak-nebak di atas berkas yang sudah
 * menyebutkan letaknya adalah membuang keterangan yang sudah ada — dan itulah
 * yang membuat ringkasannya dahulu berbeda dari berkas aslinya.
 *
 * Maka berkas Excel dibaca lewat jalannya sendiri: selnya diambil pada
 * baris dan kolom yang sama seperti di layar Excel, nilai bergabung
 * disebarkan ke seluruh sel yang dinaunginya, dan angka ditulis sebagaimana
 * Excel menampilkannya — 1,5% tetap 1,5%, bukan 0.015.
 */

import ExcelJS from "exceljs";

import type { BarisSkema } from "./memo-skema";

/** Satu lembar kerja sebagai petak: baris berisi teks tiap kolom. */
export type Lembar = { nama: string; petak: string[][] };

// ── Menulis angka sebagaimana Excel menampilkannya ────────────────────────

/** Banyak angka di belakang koma yang diminta bentuk tampilannya. */
function desimalFormat(kode: string): number {
  const m = /[0#](?:[.,](0+))/.exec(kode.replace(/\\./g, ""));
  return m ? m[1].length : 0;
}

/** Sel tanpa bentuk tampilan: Excel menulis angkanya apa adanya. */
function umum(kode: string): boolean {
  return !kode || /^general$/i.test(kode.trim());
}

function angkaId(n: number, kode: string, kelompok: boolean): string {
  // Tanpa format, angkanya tidak dibulatkan sama sekali: 0,0025 yang
  // dibulatkan menjadi 0 adalah tarif yang hilang tanpa memberi tanda.
  if (umum(kode)) {
    return n.toLocaleString("id-ID",
      { maximumFractionDigits: 20, useGrouping: kelompok });
  }
  const desimal = desimalFormat(kode);
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: desimal,
    maximumFractionDigits: desimal,
    useGrouping: kelompok,
  });
}

function tanggalIso(d: Date): string {
  // Excel menyimpan tanggal tanpa zona; yang dibaca harus tanggal yang
  // tertulis di selnya, bukan tanggal itu digeser ke zona waktu peladen.
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

/**
 * Teks satu sel, sebagaimana orang membacanya di Excel.
 *
 * Yang dikembalikan bentuk tampilannya, bukan nilai mentahnya: sel berformat
 * persen menyimpan 0,015 dan menampilkan 1,5% — dan yang tertulis pada memo,
 * yang dibaca orang, dan yang kemudian diperiksa adalah 1,5%.
 */
export function teksSel(sel: ExcelJS.Cell): string {
  const kode = String(sel.numFmt ?? "");
  let v: unknown = sel.value;

  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[])
        .map((p) => p.text ?? "").join("").trim();
    }
    if ("result" in o) v = o.result;
    else if ("text" in o) v = o.text;
    else if ("hyperlink" in o) v = o.text ?? o.hyperlink;
    else if (o instanceof Date) v = o;
    else if ("error" in o) return String(o.error ?? "");
  }

  if (v === null || v === undefined) return "";
  if (v instanceof Date) return tanggalIso(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") {
    if (kode.includes("%")) return `${angkaId(v * 100, kode, false)}%`;
    return angkaId(v, kode, kode.includes(","));
  }
  return String(v).trim();
}

/** Seluruh lembar sebuah workbook sebagai petak teks. */
export async function lembarXlsx(buf: Buffer): Promise<Lembar[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const hasil: Lembar[] = [];
  wb.eachSheet((ws) => {
    const petak: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, nomor) => {
      const baris: string[] = [];
      row.eachCell({ includeEmpty: true }, (sel, kolom) => {
        // Sel yang tergabung hanya menyimpan isinya pada sel induk. Yang
        // dibaca orang pada baris di bawahnya tetap isi yang sama, jadi
        // isinya disebarkan — tanpa itu satu kategori yang menaungi empat
        // baris membuat tiga baris berikutnya kehilangan kategorinya.
        const induk = sel.isMerged && sel.master !== sel ? sel.master : sel;
        baris[kolom - 1] = teksSel(induk);
      });
      petak[nomor - 1] = baris;
    });
    for (let i = 0; i < petak.length; i++) petak[i] ??= [];
    hasil.push({ nama: ws.name, petak });
  });
  return hasil;
}

// ── Dari petak menjadi baris skema ────────────────────────────────────────

const KEPALA_KATEGORI = /^(kategori|uraian|keterangan skema|jenis|skema)$/i;
const KEPALA_NILAI = /^(nilai|nilai komisi|komisi|persentase|persen|tarif|besaran)/i;
const KEPALA_KET = /^(keterangan|catatan|syarat|ketentuan)/i;
const KEPALA_NO = /^(no\.?|nomor|urut)$/i;

/** Judul tabel: "1. Skema Komisi & Reward Sales Inhouse", atau "SKEMA …". */
const JUDUL = /^\s*(?:\d{1,2}\s*[.)]\s*)?(skema\b.*)$/i;

type Peta = { no: number; kategori: number; nilai: number; ket: number };

/** Baris kepala tabel, bila baris ini memang kepala. */
function petaKepala(baris: string[]): Peta | null {
  const peta: Peta = { no: -1, kategori: -1, nilai: -1, ket: -1 };
  baris.forEach((sel, i) => {
    const t = (sel ?? "").trim();
    if (!t) return;
    if (peta.no < 0 && KEPALA_NO.test(t)) peta.no = i;
    else if (peta.kategori < 0 && KEPALA_KATEGORI.test(t)) peta.kategori = i;
    else if (peta.nilai < 0 && KEPALA_NILAI.test(t)) peta.nilai = i;
    else if (peta.ket < 0 && KEPALA_KET.test(t)) peta.ket = i;
  });
  return peta.kategori >= 0 && peta.nilai >= 0 ? peta : null;
}

function isi(baris: string[], i: number): string {
  return i >= 0 ? (baris[i] ?? "").trim() : "";
}

/**
 * Baris skema pada satu petak, mengikuti letaknya di lembar aslinya.
 *
 * Kolomnya dikenali dari baris kepalanya — "Kategori | Nilai | Keterangan" —
 * bukan dari urutan tetap: lembar yang satu menaruh nomor di kolom pertama,
 * yang lain tidak, dan keduanya sah. Bila tidak ada baris kepala sama sekali,
 * barisnya dibaca menurut urutan kolom apa adanya, karena itulah satu-satunya
 * susunan yang tersisa.
 */
export function barisSkemaPetak(lembar: Lembar): BarisSkema[] {
  const hasil: BarisSkema[] = [];
  let peta: Peta | null = null;
  let kelompok = lembar.nama;
  let urutan = 0;

  for (const baris of lembar.petak) {
    const terisi = baris.filter((s) => (s ?? "").trim());
    if (!terisi.length) continue;

    const kepalaBaru = petaKepala(baris);
    if (kepalaBaru) { peta = kepalaBaru; urutan = 0; continue; }

    // Baris yang hanya berisi satu sel adalah judul tabelnya, bukan data.
    if (terisi.length === 1) {
      const j = JUDUL.exec(terisi[0].trim());
      if (j) { kelompok = j[1].trim(); urutan = 0; }
      else kelompok = terisi[0].trim();
      continue;
    }
    if (!peta) continue;

    const kategori = isi(baris, peta.kategori);
    const nilai = isi(baris, peta.nilai);
    const ket = isi(baris, peta.ket);
    if (!kategori && !nilai) continue;

    const noSel = isi(baris, peta.no);
    urutan += 1;
    hasil.push({
      kelompok,
      urutan: /^\d+$/.test(noSel) ? Number(noSel) : urutan,
      kategori, nilai, keterangan: ket,
    });
  }
  return hasil;
}

/** Baris skema seluruh lembar sebuah berkas Excel. */
export async function skemaXlsx(buf: Buffer): Promise<BarisSkema[]> {
  const lembar = await lembarXlsx(buf);
  return lembar.flatMap(barisSkemaPetak);
}

/**
 * Teks datar sebuah berkas Excel, untuk menebak kolom memonya.
 *
 * Tiap baris lembar menjadi satu baris teks; pemisahnya " | " supaya pola
 * "Nomor: …" tetap dikenali dan dua sel bertetangga tidak berdempet menjadi
 * satu kata yang tidak pernah ada.
 */
export async function teksXlsx(buf: Buffer): Promise<string> {
  const lembar = await lembarXlsx(buf);
  return lembar.map((l) => l.petak
    .map((b) => b.map((s) => (s ?? "").trim()).filter(Boolean).join(" | "))
    .filter(Boolean).join("\n")).join("\n").trim();
}

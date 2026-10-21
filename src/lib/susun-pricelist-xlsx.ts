/**
 * Berkas Excel untuk penyusunan pricelist lima langkah.
 *
 * `imporSusun` membaca berkas PL seperti PL_NARAYA_FS (lembar Data (IRR),
 * Unit Data, Data Pricelist, Pricelist, T&C) menjadi isian kelima langkah.
 * Yang dibaca adalah masukannya — parameter cara bayar, data unit, dan cara
 * kolom saling merujuk — bukan harga jadinya: harga dihitung ulang oleh
 * src/lib/susun-pricelist.ts, sehingga hasilnya dapat dicocokkan dengan
 * Excel aslinya.
 *
 * `eksporSusun` menulis kebalikannya: kelima lembar berisi angka hasil
 * hitungan. Lembar Pricelist-nya berbentuk sama dengan yang diterima unggahan
 * pricelist biasa (src/lib/pricelist.ts), sehingga pricelist yang disusun di
 * sini diberlakukan lewat jalur pemeriksaan yang sama.
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";

import {
  FAKTOR, FAKTOR_OPSIONAL, HARGA_KAS_AWAL, labelPpn, tarifPpn, hargaKasIrr, hargaSesuaiSkema, hitungSemua, namaTahap, susunAwal, unitKosong,
  type KolomDataPl, type KolomPricelist, type SkemaIrr, type SusunPricelist,
  type Tnc, type UnitData,
} from "./susun-pricelist";

// ── Membaca sel ────────────────────────────────────────────────────────────

function nilai(sel: ExcelJS.Cell): string | number | null {
  let v: any = sel.value;
  if (v && typeof v === "object") {
    if ("result" in v) v = v.result;
    else if ("richText" in v) v = v.richText.map((r: any) => r.text).join("");
    else if ("text" in v) v = v.text;
    else if (v instanceof Date) v = v.toLocaleDateString("id-ID");
    else if ("error" in v) v = null;
    else if ("formula" in v || "sharedFormula" in v) v = null;
  }
  if (v == null || v === "") return null;
  return typeof v === "number" ? v : String(v);
}

const teks = (sel: ExcelJS.Cell) => {
  const v = nilai(sel);
  return v == null ? "" : String(v).replace(/\s+/g, " ").trim();
};
const angka = (sel: ExcelJS.Cell) => {
  const v = nilai(sel);
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const rumus = (sel: ExcelJS.Cell): string => {
  const v: any = sel.value;
  return (v && typeof v === "object" && typeof v.formula === "string") ? v.formula
    : typeof sel.formula === "string" ? sel.formula : "";
};

/** Huruf kolom → nomor (A = 1). */
const noKolom = (huruf: string) =>
  huruf.toUpperCase().split("").reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);

const lembar = (wb: ExcelJS.Workbook, re: RegExp) =>
  wb.worksheets.find((w) => re.test(w.name.trim()));

/** Baris pertama (1–40) yang memuat sel bertuliskan `re`; kolomnya juga. */
function cari(ws: ExcelJS.Worksheet, re: RegExp, maks = 40): { r: number; c: number } | null {
  for (let r = 1; r <= Math.min(ws.rowCount, maks); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= ws.columnCount; c++) {
      if (re.test(teks(row.getCell(c)))) return { r, c };
    }
  }
  return null;
}

/** Lembar tersembunyi berisi isian lengkap, untuk impor ulang tanpa kehilangan. */
const LEMBAR_ISIAN = "_isian";

/**
 * Judul kolom kode unit. Berkas PL lama menulis "Code"; lembar UNIT DATA
 * terbaru menulis "Code Unit" (dengan kolom "No" urut di depannya).
 */
const KODE = /^(code|code unit|kode|kode unit)$/i;

/**
 * Baris unit pada lembar UNIT DATA. Judul kolomnya dicari, bukan dipatok:
 * berkas lama menulis "Code", berkas terbaru "Code Unit" dengan kolom "No"
 * urut di depannya.
 */
function bacaLembarUnit(ws: ExcelJS.Worksheet, peringatan: string[]): UnitData[] {
  const unit: UnitData[] = [];
  const j = cari(ws, KODE);
  if (!j) {
    peringatan.push("Lembar Unit Data: kolom Code tidak ditemukan.");
  } else {
    const H = (c: number) => teks(ws.getCell(j.r, c)).toLowerCase();
    const H2 = (c: number) => teks(ws.getCell(j.r + 1, c)).toLowerCase();
    const kol: Record<string, number> = {};
    const view: number[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const h = H(c), h2 = H2(c);
      // Judul Inggris (template, berkas PL) atau Indonesia (mis. BIO DISTRICT:
      // Alamat, Arah Hadap, Dimension, Tipe, Tanah (m²), GFA (m²)).
      if (KODE.test(h)) kol.kode = c;
      else if (h === "address" || h === "alamat") kol.alamat = c;
      else if (h === "view" || h === "arah hadap") view.push(c);
      else if (h === "no" && kol.kode) kol.no = c;
      else if (h === "ukuran" || h === "dimension") kol.ukuran = c;
      else if (h === "type" || h === "tipe") kol.tipeBangunan = c;
      else if (h === "tipe pl") kol.tipe = c;
      else if (h === "bentuk" || h.startsWith("sub-tipe kavling")) kol.bentuk = c;
      else if (h === "sub-tipe") kol.subTipe = c;
      else if (h === "phase") kol.phase = c;
      else if (h.startsWith("increase")) kol.kenaikan = c;
      else if (h.startsWith("(+) factor")) kol.faktorTambah = c;
      // Special % dan Biaya AJB + BPHTB berupa pengali (1 + x), sama seperti
      // (+) Factor; Special tanpa % adalah rupiah.
      else if (/^special\s*%/.test(h)) kol.specialPersen = c;
      else if (h.startsWith("biaya ajb")) kol.biayaAjb = c;
      else if (h.startsWith("special")) kol.special = c;
      else if (h.startsWith("show unit")) kol.showUnit = c;
      else if (h.startsWith("gimmick")) kol.gimmick = c;
      // Harga Dasar (Termasuk PPN): hanya rumusnya yang dibaca, untuk pembagi
      // seperti ROUNDUP(…)/1.005 pada sebagian unit BIO DISTRICT.
      if (h.startsWith("harga dasar") && h.includes("termasuk ppn")) kol.hargaDasarIncl = c;
      if (h2 === "floor") kol.floor = c;
      else if (h2 === "land" || /^tanah( \(m²\))?$/.test(h2)) kol.lt = c;
      // Kolom harga sesudah PPN (Incl PPN) hanya hasil hitungan; yang dibaca
      // harga sebelum PPN.
      else if (h2.startsWith("land price (base)") && !h2.includes("incl")) kol.hargaTanah = c;
      else if (h2 === "gfa" || h2 === "gfa (m²)") kol.lb = c;
      else if (h2.startsWith("gfa (base)") && !h2.includes("incl")) kol.hargaBangunan = c;
      for (const [k, label] of FAKTOR) if (h === label.toLowerCase()) kol[k] = c;
    }
    // View pertama adalah arah (UTARA/SELATAN). Berkas Data Pricelist lama
    // menjuduli kolom bentuk (Irregullar) dengan "View" kedua; bila ada kolom
    // Sub-Tipe Kavling tersendiri (template), View kedua adalah kolom View sesudah Type.
    if (view[0]) kol.view = view[0];
    if (view[1]) { if (kol.bentuk) kol.view2 = view[1]; else kol.bentuk = view[1]; }
    // Data mulai tepat di bawah judul; berkas PL dan template punya baris
    // judul kedua (Land / GFA …) yang kotak Code-nya kosong atau bergabung.
    let mulai = j.r + 1;
    { const k = teks(ws.getCell(mulai, kol.kode)); if (!k || KODE.test(k)) mulai++; }
    for (let r = mulai; r <= ws.rowCount; r++) {
      const kode = teks(ws.getCell(r, kol.kode));
      if (!kode) break;
      const t = (k: string) => kol[k] ? teks(ws.getCell(r, kol[k])) : "";
      const n = (k: string) => kol[k] ? angka(ws.getCell(r, kol[k])) : 0;
      const u: UnitData = {
        ...unitKosong(), kode, alamat: t("alamat"), view: t("view"), no: t("no"),
        ukuran: t("ukuran"), phase: t("phase"), tipeBangunan: t("tipeBangunan"),
        bentuk: t("bentuk"), subTipe: t("subTipe"), lt: n("lt"), hargaTanah: n("hargaTanah"),
        lb: n("lb"), hargaBangunan: n("hargaBangunan"), kenaikan: n("kenaikan"),
        // Gimmick (Trip, BPHTB, AKAD, Repair) di berkas Excel masuk ke (+) Factor;
        // Unit Data tidak punya kolom Gimmick tersendiri.
        faktorTambah: n("faktorTambah") + n("gimmick"),
        special: n("special"), showUnit: n("showUnit"),
        faktor: Object.fromEntries(FAKTOR.map(([k]) => [k, n(k)]).filter(([, v]) => v)),
      };
      if (kol.tipe) u.tipe = t("tipe");
      if (kol.view2) u.view2 = t("view2");
      if (kol.floor) u.floor = n("floor");
      if (kol.hargaDasarIncl) {
        const bagi = /\)\s*\/\s*([\d.]+)\s*$/.exec(rumus(ws.getCell(r, kol.hargaDasarIncl)));
        if (bagi && Number(bagi[1]) > 0 && Number(bagi[1]) !== 1) u.pembagiIncl = Number(bagi[1]);
      }
      if (kol.biayaAjb) u.biayaAjb = n("biayaAjb");
      if (kol.specialPersen) u.specialPersen = n("specialPersen");
      for (const k of ANGKA_UNIT) {
        const v = kol[k] ? nilai(ws.getCell(r, kol[k])) : null;
        if (typeof v === "string" && !/^\s*-?[\d.,]+\s*%?\s*$/.test(v)) {
          peringatan.push(`Baris ${r} (${kode}): isian "${v}" bukan angka, dibaca 0.`);
        }
      }
      unit.push(u);
    }
    const kosong = unit.filter((u) => !u.lt && !u.lb).map((u) => u.kode);
    if (kosong.length) {
      peringatan.push(`Unit tanpa luas tanah/bangunan (harga 0): ${kosong.join(", ")}.`);
    }
    const kembar = unit.map((u) => u.kode).filter((k, i, a) => a.indexOf(k) !== i);
    if (kembar.length) {
      peringatan.push(`Code ganda: ${[...new Set(kembar)].join(", ")}.`);
    }
  }
  return unit;
}

/** Kolom angka pada lembar UNIT DATA; isian teks di sana dibaca 0. */
const ANGKA_UNIT = ["lt", "hargaTanah", "lb", "hargaBangunan", "kenaikan",
  "faktorTambah", "specialPersen", "biayaAjb", "floor", "special", "showUnit", ...FAKTOR.map(([k]) => k)];

/**
 * Template kosong lembar UNIT DATA untuk tombol "Unduh Template" di langkah 2.
 * Judulnya persis yang dicari `bacaLembarUnit` (dua baris judul: baris kedua
 * memuat Land, Land Price (base), GFA, GFA (base)), sehingga berkas yang diisi
 * dari template ini selalu terbaca. Kolom angka diberi validasi Excel supaya
 * isian teks ditolak sejak diketik, dan Code ganda ditolak.
 */
export async function templatUnitData(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("UNIT DATA", { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  const persen = new Set(["kenaikan", "faktorTambah", ...FAKTOR.map(([k]) => k)]);
  // [kunci, judul baris 1, judul baris 2, lebar]
  const kolom: [string, string, string, number][] = [
    ["kode", "Code", "", 14], ["alamat", "Address", "", 16], ["view", "View", "", 11],
    ["no", "No", "", 6], ["ukuran", "Ukuran", "", 10], ["phase", "Phase", "", 7],
    ["tipeBangunan", "Type", "", 7], ["view2", "View", "", 11],
    ["bentuk", "Sub-Tipe Kavling/Irr/Irr Hoek", "", 16],
    ["subTipe", "Sub-Tipe", "", 14],
    ["lt", "Tanah", "Land", 9], ["hargaTanah", "", "Land Price (base) (Excl PPN. 11%)", 18],
    ["lb", "Bangunan", "GFA", 9], ["hargaBangunan", "", "GFA (base) (Excl PPN. 11%)", 18],
    ["kenaikan", "Increase (%)", "", 11],
    ...FAKTOR.filter(([k]) => !FAKTOR_OPSIONAL.has(k)).map(([k, l]) => [k, l, "", 11] as [string, string, string, number]),
    ["faktorTambah", "(+) Factor", "", 11], ["special", "Special", "", 14],
    ["showUnit", "Show Unit", "", 14],
  ];
  const r1 = ws.getRow(1), r2 = ws.getRow(2);
  kolom.forEach(([k, j1, j2, lebar], i) => {
    const c = i + 1;
    r1.getCell(c).value = j1 || null;
    r2.getCell(c).value = j2 || null;
    ws.getColumn(c).width = lebar;
    if (!j2 && j1) ws.mergeCells(1, c, 2, c);
    const huruf = ws.getColumn(c).letter, rentang = `${huruf}3:${huruf}2002`;
    if (persen.has(k)) ws.getColumn(c).numFmt = "0.00%";
    else if (["hargaTanah", "hargaBangunan", "special", "showUnit"].includes(k)) ws.getColumn(c).numFmt = "#,##0";
    if (ANGKA_UNIT.includes(k)) {
      (ws as any).dataValidations.add(rentang, {
        type: "decimal", operator: "between", allowBlank: true,
        formulae: [-1e15, 1e15], showErrorMessage: true, errorStyle: "stop",
        errorTitle: "Harus angka", error: persen.has(k)
          ? "Isi angka persen, mis. 5% (bukan teks)." : "Isi angka saja, tanpa huruf atau Rp.",
      });
    }
    if (k === "kode") {
      (ws as any).dataValidations.add(rentang, {
        type: "custom", allowBlank: true, formulae: [`COUNTIF($A$3:$A$2002,A3)=1`],
        showErrorMessage: true, errorStyle: "stop",
        errorTitle: "Code ganda", error: "Code ini sudah dipakai unit lain.",
      });
    }
  });
  const no = (k: string) => kolom.findIndex(([x]) => x === k) + 1;
  ws.mergeCells(1, no("lt"), 1, no("hargaTanah")); ws.mergeCells(1, no("lb"), 1, no("hargaBangunan"));
  for (const r of [r1, r2]) {
    r.font = { bold: true };
    r.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    r.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
      c.border = { bottom: { style: "thin" }, right: { style: "thin" } };
    });
  }

  const p = wb.addWorksheet("PETUNJUK");
  p.getColumn(1).width = 4; p.getColumn(2).width = 110;
  p.addRow(["", "Cara mengisi lembar UNIT DATA"]).getCell(2).font = { bold: true, size: 14 };
  [
    "Isi satu unit per baris mulai baris 3. Jangan mengubah, memindah, atau menghapus dua baris judul.",
    "Code wajib diisi dan tidak boleh sama. Pembacaan berhenti pada baris pertama yang Code-nya kosong, jadi jangan ada baris kosong di tengah.",
    "Land dan GFA dalam m². Land Price (base) dan GFA (base) adalah harga per m² sebelum PPN 11%, angka saja tanpa \"Rp\" atau titik ketik manual.",
    "Increase, faktor posisi (Single Row s.d. Side Garden) dan (+) Factor diisi persen, mis. ketik 5% atau 0,05. Kosongkan bila tidak ada.",
    "Special dan Show Unit dalam rupiah. Kosongkan bila tidak ada.",
    "Phase boleh kosong: dianggap 1, dan untuk unit yang Code-nya sudah ada di tabel, isian lamanya dipakai.",
    "Jangan ganti nama lembar UNIT DATA dan jangan sembunyikan (hide) lembarnya. Lembar PETUNJUK ini boleh dibiarkan.",
    "Unggah lewat langkah 2. Unit Data → Impor Unit Data dari Excel. Hasilnya tampil di tabel untuk diperiksa sebelum Simpan.",
  ].forEach((t, i) => {
    const row = p.addRow([`${i + 1}.`, t]);
    row.alignment = { wrapText: true, vertical: "top" };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Isi lembar tersembunyi dikosongkan sebelum berkas dibaca. Impor Unit Data
 * hanya membaca lembar yang terbuka, sedangkan berkas seperti Unit Data BIO
 * DISTRICT (2,5 MB, 28 lembar tersembunyi berisi simulasi dan pricelist
 * lama) terlalu lama dibaca utuh — di server bisa melewati batas waktu,
 * sehingga impor gagal. Nilai rumus di lembar terbuka tetap terbaca karena
 * hasilnya tersimpan di sel itu sendiri.
 */
async function kosongkanLembarTersembunyi(isi: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const zip = await JSZip.loadAsync(isi);
    const wbXml = await zip.file("xl/workbook.xml")?.async("string");
    const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
    if (!wbXml || !rels) return isi;
    const target = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /\bId="([^"]+)"/.exec(m[0])?.[1], t = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
      if (id && t) target.set(id, t.replace(/^\/?(xl\/)?/, "xl/"));
    }
    let ada = false;
    for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
      if (!/\bstate="(hidden|veryHidden)"/.test(m[0])) continue;
      const berkas = target.get(/\br:id="([^"]+)"/.exec(m[0])?.[1] ?? "");
      if (!berkas || !zip.file(berkas)) continue;
      zip.file(berkas, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>');
      zip.remove(berkas.replace(/([^/]+)$/, "_rels/$1.rels"));
      ada = true;
    }
    return ada ? await zip.generateAsync({ type: "arraybuffer", compression: "STORE" }) : isi;
  } catch {
    return isi;
  }
}

/**
 * Lembar UNIT DATA saja, untuk tombol "Impor Unit Data" di langkah 2.
 *
 * Hanya lembar yang terbuka (tidak disembunyikan) yang dibaca, atas
 * permintaan pemakainya: berkas Data Pricelist terbaru menyembunyikan lembar
 * lain dan hanya membiarkan UNIT DATA terlihat sebagai sumber data unit.
 */
export async function imporUnitData(isi: ArrayBuffer): Promise<{ unit: UnitData[]; peringatan: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await kosongkanLembarTersembunyi(isi) as any);
  } catch {
    throw new Error("Berkas tidak dapat dibaca sebagai Excel .xlsx.");
  }
  const terbuka = wb.worksheets.filter((w) => w.state === "visible");
  // Lembar UNIT DATA; bila tidak ada, lembar terbuka pertama yang punya kolom
  // Kode/Code (mis. berkas BIO DISTRICT yang lembarnya bernama Sheet1).
  const ws = terbuka.find((w) => /^unit data$/i.test(w.name.trim()))
    ?? terbuka.find((w) => cari(w, KODE, 10));
  if (!ws) {
    throw new Error("Berkas ini tidak punya lembar UNIT DATA (atau lembar berkolom Kode) yang terbuka. " +
                    "Buka (unhide) lembarnya di Excel, lalu unggah ulang.");
  }
  const peringatan: string[] = [];
  return { unit: bacaLembarUnit(ws, peringatan), peringatan };
}

// ── Impor ──────────────────────────────────────────────────────────────────

export type HasilImpor = { susun: SusunPricelist; peringatan: string[] };

export async function imporSusun(isi: ArrayBuffer): Promise<HasilImpor> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(isi as any);
  } catch {
    throw new Error("Berkas tidak dapat dibaca sebagai Excel .xlsx.");
  }
  // Berkas yang diunduh dari layar ini membawa isiannya utuh di lembar
  // tersembunyi; dengan itu impor ulangnya tidak kehilangan apa pun.
  const simpanan = wb.getWorksheet(LEMBAR_ISIAN);
  if (simpanan) {
    const json = simpanan.getColumn(1).values.slice(1).map((v) => String(v ?? "")).join("");
    try {
      const susun = JSON.parse(json) as SusunPricelist;
      // Kolom Gimmick yang ditambahkan orang di lembar Unit Data berkas
      // unduhan ini tetap terbaca: (+) Factor unit itu diambil dari lembarnya.
      const ws = wb.worksheets.find((w) => w.state === "visible" && /^unit data$/i.test(w.name.trim()));
      const j = ws && cari(ws, KODE);
      let adaGimmick = false;
      if (ws && j) {
        for (let c = 1; c <= ws.columnCount; c++) {
          if (teks(ws.getCell(j.r, c)).toLowerCase().startsWith("gimmick")) adaGimmick = true;
        }
      }
      if (ws && adaGimmick) {
        const dariLembar = new Map(bacaLembarUnit(ws, []).map((u) => [u.kode, u.faktorTambah]));
        susun.unit = susun.unit.map((u) => dariLembar.has(u.kode)
          ? { ...u, faktorTambah: dariLembar.get(u.kode)! } : u);
      }
      return { susun, peringatan: [] };
    } catch {
      // Lembarnya rusak (mis. disunting tangan): baca lembar-lembar biasanya.
    }
  }

  const susun = susunAwal();
  const peringatan: string[] = [];
  // Rumus arus kas lembar Data (IRR) memakai baris Foundation / Tutup Atap /
  // BAST / AJB + SPHTB dengan porsi 40/40/10/10; berkas Excel dibaca apa
  // adanya supaya hasilnya sama dengan Excel-nya.
  susun.irr.porsiTahap = [0.4, 0.4, 0.1, 0.1];
  delete susun.irr.namaTahap;

  // 1. Data (IRR)
  const wsIrr = lembar(wb, /irr/i);
  if (!wsIrr) {
    peringatan.push("Lembar Data (IRR) tidak ada; parameter cara bayar memakai isian awal.");
  } else {
    const label = new Map<string, number>();
    for (let r = 1; r <= Math.min(wsIrr.rowCount, 30); r++) {
      const t = teks(wsIrr.getCell(r, 1)).toLowerCase();
      if (t) label.set(t, r);
    }
    const rAlok = label.get("allocation"), rDp = label.get("dp"),
          rKali = label.get("installments"), rKas = label.get("cash price"),
          rAdj = label.get("adjusted price");
    const rTahap = ["foundation", "tutup atap", "bast", "ajb + sphtb"].map((l) => label.get(l));
    const rNama = rAlok ? rAlok - 1 : 2;
    const skema: SkemaIrr[] = [];
    for (let c = 2; c <= wsIrr.columnCount; c++) {
      const nama = teks(wsIrr.getCell(rNama, c));
      if (!nama || /total|target/i.test(nama)) break;
      if (rDp == null || rKali == null) break;
      const kas = rKas ? angka(wsIrr.getCell(rKas, c)) : 0;
      const adj = rAdj ? angka(wsIrr.getCell(rAdj, c)) : 0;
      skema.push({
        nama,
        kelompok: teks(wsIrr.getCell(rNama - 1, c)) || "",
        alokasi: rAlok ? angka(wsIrr.getCell(rAlok, c)) : 0,
        dp: angka(wsIrr.getCell(rDp, c)),
        kali: angka(wsIrr.getCell(rKali, c)) || 1,
        ...(kas && kas !== HARGA_KAS_AWAL ? { hargaKas: kas } : {}),
        // Adjusted Price hasil Goal Seek Excel, disimpan apa adanya supaya
        // koefisiennya (Adjusted / Cash) sama persis dengan Excel.
        ...(kas && adj && adj !== kas ? { hargaSesuai: adj } : {}),
        bulan: rTahap.map((r, i) => r ? angka(wsIrr.getCell(r, c))
                                      : susun.irr.skema[0].bulan[i]) as SkemaIrr["bulan"],
        // Acuan: harga yang tidak disesuaikan (Adjusted = Cash Price).
        ...((skema.length === 0 || (kas && adj && kas === adj)) && !skema.some((s) => s.acuan)
          ? { acuan: true } : {}),
      });
    }
    if (skema.length) susun.irr.skema = skema;
    else peringatan.push("Lembar Data (IRR): baris DP / Installments tidak ditemukan.");
    const tgt = cari(wsIrr, /^target interest rate$/i);
    if (tgt) susun.irr.target = angka(wsIrr.getCell(tgt.r, tgt.c + 1)) || susun.irr.target;
  }

  // 2. Unit Data
  const wsUnit = lembar(wb, /^unit data$/i);
  const unitPerKode = new Map<string, UnitData>();
  if (!wsUnit) {
    peringatan.push("Lembar Unit Data tidak ada; daftar unit kosong.");
  } else {
    for (const u of bacaLembarUnit(wsUnit, peringatan)) {
      unitPerKode.set(u.kode, u);
      susun.unit.push(u);
    }
  }

  // 3. Data Pricelist: Phase dan Tipe per unit, susunan kolom, tambahan.
  const wsDp = lembar(wb, /^data pricelist$/i);
  if (wsDp) {
    const j = cari(wsDp, KODE);
    if (j) {
      const hdr = (c: number) => teks(wsDp.getCell(j.r, c));
      const kol = (re: RegExp) => {
        for (let c = 1; c <= wsDp.columnCount; c++) if (re.test(hdr(c))) return c;
        return 0;
      };
      const kKode = kol(KODE), kPhase = kol(/^phase$/i), kTipe = kol(/^tipe$/i),
            kBuild = kol(/^build$/i);
      for (let r = j.r + 1; r <= wsDp.rowCount; r++) {
        const u = unitPerKode.get(teks(wsDp.getCell(r, kKode)));
        if (!u) continue;
        if (kPhase) u.phase = teks(wsDp.getCell(r, kPhase)) || u.phase;
        if (kTipe) u.tipe = teks(wsDp.getCell(r, kTipe));
      }
      const r1 = j.r + 1;
      const kolom: KolomDataPl[] = [];
      const namaKol = new Map<number, string>();
      // Tambahan per unit hanya bila rumusnya menambahkannya (mis. "+5000000");
      // berkas tanpa tambahan (mis. PL Banara) tidak mendapat tambahan bawaan.
      susun.dataPricelist.tambahan = 0;
      for (let c = (kBuild || 12) + 1; c <= wsDp.columnCount; c++) {
        const nama = hdr(c);
        if (!nama) continue;
        namaKol.set(c, nama);
        const f = rumus(wsDp.getCell(r1, c));
        const tambah = /\+\s*(\d{5,})\s*$/.exec(f);
        if (tambah) susun.dataPricelist.tambahan = Number(tambah[1]);
        // Turunan kolom lain, mis. =ROUNDUP((R4*112%),-6)
        const turun = /^ROUNDUP\(\(?\$?([A-Z]+)\$?\d+\s*\*\s*([\d.]+)%\)?\s*,\s*-6\)$/i.exec(f);
        if (turun && namaKol.has(noKolom(turun[1]))) {
          kolom.push({ nama, dari: namaKol.get(noKolom(turun[1]))!, kali: Number(turun[2]) / 100 });
          continue;
        }
        // Koefisien dari baris di atas judul: ='Data (IRR)'!C17
        const ref = /'?Data \(IRR\)'?!\$?([A-Z]+)\$?\d+/i.exec(rumus(wsDp.getCell(j.r - 1, c)));
        const skema = ref && wsIrr
          ? susun.irr.skema[noKolom(ref[1]) - 2]?.nama : undefined;
        kolom.push({ nama, skema: skema ?? susun.irr.skema.find((s) => s.nama === nama)?.nama ?? nama });
      }
      if (kolom.length) susun.dataPricelist.kolom = kolom;
    }
  } else {
    peringatan.push("Lembar Data Pricelist tidak ada; susunan kolomnya memakai isian awal.");
  }

  // Phase yang tidak tertulis di Unit Data maupun Data Pricelist: phase 1.
  for (const u of susun.unit) u.phase ||= "1";

  // 4. Pricelist: judul, tanggal, catatan, susunan kolom harga, pagu DTP.
  const wsPl = lembar(wb, /^pricelist$/i);
  if (wsPl) {
    const j = cari(wsPl, /^unit no$/i);
    if (j) {
      for (let r = 1; r < j.r; r++) {
        for (let c = 1; c <= wsPl.columnCount; c++) {
          const t = teks(wsPl.getCell(r, c));
          if (!t || typeof nilai(wsPl.getCell(r, c)) === "number") continue;
          if (/^pricelist/i.test(t)) susun.pricelist.judul = t;
          else if (/\d{4}/.test(t) && t.length < 30) susun.pricelist.tanggal = t;
          else if (t.length > 20) susun.pricelist.catatan = t;
        }
      }
      const r1 = j.r + 2;
      const kolom: KolomPricelist[] = [];
      for (let c = 1; c <= wsPl.columnCount; c++) {
        const nama = teks(wsPl.getCell(j.r, c));
        const f = rumus(wsPl.getCell(r1, c));
        const pagu = /<\s*\((\d{9,})\s*\/\s*1\.11\)/.exec(f);
        if (pagu) susun.pricelist.batasDtp = Number(pagu[1]);
        const ref = /'?Data Pricelist'?!\$?([A-Z]+)\$?\d+(\s*\*\s*([\d.]+)%)?/i.exec(f);
        if (!ref || !nama || /^(dpp|address|unit no|phase|ukuran|view|tipe|sub-tipe)/i.test(nama)) continue;
        if (wsDp) {
          const j2 = cari(wsDp, KODE);
          const dari = j2 ? teks(wsDp.getCell(j2.r, noKolom(ref[1]))) : "";
          // Semua pengali persen di rumus dikalikan (mis. =ROUNDUP((R4*112%)*111.5%,-6)
          // = 124,88%), dan ROUNDUP dibedakan dari ROUND.
          const kali = [...f.matchAll(/\*\s*([\d.]+)%/g)].reduce((a, m) => a * Number(m[1]) / 100, 1);
          const bulatAtas = /^ROUNDUP\(/i.test(f.trim()) && kali !== 1;
          if (dari) kolom.push({ nama, dari, kali: +kali.toFixed(10), ...(bulatAtas && { bulatAtas }) });
        }
      }
      if (kolom.length) susun.pricelist.kolom = kolom;
    }
  }

  // 5. T&C
  const wsTnc = lembar(wb, /^t\s*&\s*c|terms/i);
  if (wsTnc) susun.tnc = bacaTnc(wsTnc, susun.tnc);
  else peringatan.push("Lembar T&C tidak ada; ketentuannya memakai isian awal.");
  if (!susun.pricelist.tanggal && wsTnc) {
    const t = cari(wsTnc, /\d{1,2} \w+ \d{4}/);
    if (t) susun.pricelist.tanggal = teks(wsTnc.getCell(t.r, t.c));
  }

  return { susun, peringatan };
}

/**
 * Lembar T&C: cara bayar bernomor di dua lajur (kolom A/B dan G/H), butir
 * a./b./c. di bawahnya; lalu CATATAN bernomor; lalu rekening.
 */
function bacaTnc(ws: ExcelJS.Worksheet, awal: Tnc): Tnc {
  const tnc: Tnc = { judul: awal.judul, caraBayar: [], catatan: [],
                     pengantarRekening: awal.pengantarRekening, rekening: [] };
  const judul = cari(ws, /term of payment|syarat/i);
  if (judul) tnc.judul = teks(ws.getCell(judul.r, judul.c));
  const catatanMulai = cari(ws, /^catatan$/i, 200)?.r ?? ws.rowCount + 1;

  // Cara bayar per lajur; nomornya menentukan urutan.
  const blok: { no: number; judul: string; baris: Tnc["caraBayar"][0]["baris"]; catatan?: string }[] = [];
  for (const kiri of [1, 7]) {
    let kini: (typeof blok)[0] | null = null;
    for (let r = 1; r < catatanMulai; r++) {
      const no = teks(ws.getCell(r, kiri));
      const isi = teks(ws.getCell(r, kiri + 1));
      if (/^\d+\.$/.test(no) && isi) {
        kini = { no: Number(no.replace(".", "")), judul: isi, baris: [] };
        blok.push(kini);
      } else if (kini && /^[a-z]\.$/i.test(isi)) {
        kini.baris.push({
          label: teks(ws.getCell(r, kiri + 2)),
          nilai: teks(ws.getCell(r, kiri + 3)).replace(/^:\s*/, ""),
          waktu: teks(ws.getCell(r, kiri + 4)),
        });
      } else if (kini && isi.startsWith("*")) {
        kini.catatan = isi;
      }
    }
  }
  tnc.caraBayar = blok.sort((a, b) => a.no - b.no)
    .map(({ judul, baris, catatan }) => ({ judul, baris, ...(catatan && { catatan }) }));

  // Catatan bernomor; baris tanpa nomor menyambung butir sebelumnya.
  let r = catatanMulai + 1;
  for (; r <= ws.rowCount; r++) {
    const no = teks(ws.getCell(r, 1)), isi = teks(ws.getCell(r, 2));
    if (/pembayaran dianggap sah/i.test(no || isi)) break;
    if (!isi) continue;
    if (/^\d+\.$/.test(no) || !tnc.catatan.length) tnc.catatan.push(isi);
    else tnc.catatan[tnc.catatan.length - 1] += "\n" + isi;
  }
  if (r <= ws.rowCount) tnc.pengantarRekening = teks(ws.getCell(r, 1)) || teks(ws.getCell(r, 2));
  for (r++; r <= ws.rowCount; r++) {
    const label = teks(ws.getCell(r, 3)).toLowerCase(), isi = teks(ws.getCell(r, 4));
    if (label === "bank") tnc.rekening.push({ bank: isi, noRek: "", cabang: "" });
    else if (label.startsWith("no") && tnc.rekening.length) tnc.rekening[tnc.rekening.length - 1].noRek = isi;
    else if (label === "cabang" && tnc.rekening.length) tnc.rekening[tnc.rekening.length - 1].cabang = isi;
  }
  if (!tnc.caraBayar.length) tnc.caraBayar = awal.caraBayar;
  if (!tnc.catatan.length) tnc.catatan = awal.catatan;
  return tnc;
}

// ── Ekspor ─────────────────────────────────────────────────────────────────

const RP = "#,##0";
const tebal = (row: ExcelJS.Row) => row.eachCell((c) => {
  c.font = { bold: true };
  c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  c.border = { bottom: { style: "thin" } };
});

/** Kelima lembar berisi angka hasil hitungan, untuk diunduh dan diunggah. */
export async function eksporSusun(susun: SusunPricelist): Promise<Buffer> {
  const h = hitungSemua(susun);
  const wb = new ExcelJS.Workbook();

  // 1. Data (IRR)
  const w1 = wb.addWorksheet("Data (IRR)");
  const sk = susun.irr.skema;
  w1.addRow(["", ...sk.map((s) => s.kelompok)]);
  tebal(w1.addRow(["", ...sk.map((s) => s.nama)]));
  w1.addRow(["Allocation", ...sk.map((s) => s.alokasi)]);
  w1.addRow(["DP", ...sk.map((s) => s.dp)]);
  w1.addRow(["Installments", ...sk.map((s) => s.kali)]);
  w1.addRow(["Cash Price", ...sk.map(() => hargaKasIrr(susun.irr))]);
  w1.addRow(["Adjusted Price", ...sk.map((s) => hargaSesuaiSkema(susun.irr, h.irr.koef[s.nama]))]);
  namaTahap(susun.irr).forEach((l, i) =>
    w1.addRow([l, ...sk.map((s) => s.bulan[i])]));
  w1.addRow(["IRR", ...sk.map((s) => h.irr.irr[s.nama])]);
  w1.addRow(["Coefficient", ...sk.map((s) => h.irr.koef[s.nama])]);
  w1.addRow(["WA Coefficient", h.irr.koefRata]);
  w1.addRow(["Target Interest Rate", susun.irr.target]);
  w1.getColumn(1).width = 22;
  sk.forEach((_, i) => { w1.getColumn(i + 2).width = 16; });

  // 2. Unit Data
  const w2 = wb.addWorksheet("Unit Data");
  const lp = labelPpn(tarifPpn(susun));
  tebal(w2.addRow(["Code", "Address", "View", "No", "Ukuran", "Type", "View", "Sub-Tipe Kavling/Irr/Irr Hoek", "Sub-Tipe",
    "Phase", "Land", `Land Price (base) (Excl PPN. ${lp})`, `Land Price (base) (Incl PPN. ${lp})`,
    "GFA", `GFA (base) (Excl PPN. ${lp})`, `GFA (base) (Incl PPN. ${lp})`, "Increase (%)",
    ...FAKTOR.map(([, l]) => l), "(+) Factor", "Special", "Show Unit",
    "Base Price", "Factored Price"]));
  for (const b of h.baris) {
    const u = b.unit;
    w2.addRow([u.kode, u.alamat, u.view, u.no, u.ukuran, u.tipeBangunan, u.view2 ?? "", u.bentuk, u.subTipe,
      u.phase, u.lt, u.hargaTanah, b.hasilUnit.hargaTanahPpn,
      u.lb, u.hargaBangunan, b.hasilUnit.hargaBangunanPpn, u.kenaikan,
      ...FAKTOR.map(([k]) => u.faktor[k] ?? 0), u.faktorTambah, u.special, u.showUnit,
      b.hasilUnit.base, b.hasilUnit.factored]);
  }
  w2.columns.forEach((c) => { c.width = 13; });

  // 3. Data Pricelist — tanpa kolom "Unit No", supaya pembaca unggahan
  // memilih lembar Pricelist di bawah.
  const w3 = wb.addWorksheet("Data Pricelist");
  const kdp = susun.dataPricelist.kolom;
  tebal(w3.addRow(["No.", "Code", "Phase", "Address", "View", "Ukuran", "Tipe", "Sub-Tipe",
    "Land", "Build", ...kdp.map((k) => k.nama)]));
  h.baris.forEach((b, i) => {
    const u = b.unit;
    const row = w3.addRow([i + 1, u.kode, u.phase, u.alamat, u.view, u.ukuran, u.tipe,
      u.subTipe, u.lt, u.lb, ...kdp.map((k) => b.dataPl[k.nama])]);
    for (let c = 11; c <= 10 + kdp.length; c++) row.getCell(c).numFmt = RP;
  });
  w3.columns.forEach((c, i) => { c.width = i < 10 ? 12 : 18; });

  // 4. Pricelist — bentuk yang dibaca src/lib/pricelist.ts.
  const w4 = wb.addWorksheet("Pricelist", { views: [{ state: "frozen", ySplit: 5 }] });
  const kpl = susun.pricelist.kolom;
  w4.addRow([susun.pricelist.judul]).getCell(1).font = { bold: true, size: 16 };
  w4.addRow([susun.pricelist.tanggal, susun.pricelist.catatan]);
  w4.addRow([]);
  const kepala = ["No", "Address", "Unit No", "Phase", "Ukuran", "View", "Tipe", "Sub-Tipe",
    "Area (M²)", "", ...kpl.flatMap((k) => [k.nama, "DPP", `NILAI FREE PPN DTP ${k.nama}`])];
  tebal(w4.addRow(kepala));
  tebal(w4.addRow(["", "", "", "", "", "", "", "", "Land", "Build", ...kpl.flatMap(() => ["", "", ""])]));
  for (let c = 1; c <= kepala.length; c++) if (c !== 9 && c !== 10) w4.mergeCells(4, c, 5, c);
  w4.mergeCells(4, 9, 4, 10);
  h.baris.forEach((b, i) => {
    const u = b.unit;
    const row = w4.addRow([i + 1, u.alamat, u.kode, u.phase, u.ukuran, u.view, u.tipe,
      u.subTipe, u.lt, u.lb,
      ...kpl.flatMap((k) => [b.pricelist[k.nama].harga, b.pricelist[k.nama].dpp,
                             b.pricelist[k.nama].dtp])]);
    for (let c = 11; c <= kepala.length; c++) row.getCell(c).numFmt = RP;
  });
  w4.columns.forEach((c, i) => { c.width = i < 10 ? 12 : 17; });

  // 5. T&C
  const w5 = wb.addWorksheet("T&C");
  w5.addRow([susun.tnc.judul]).getCell(1).font = { bold: true, size: 14 };
  w5.addRow([susun.pricelist.tanggal]);
  w5.addRow([]);
  susun.tnc.caraBayar.forEach((cb, i) => {
    w5.addRow([`${i + 1}.`, cb.judul]).getCell(2).font = { bold: true };
    cb.baris.forEach((b, j) =>
      w5.addRow(["", `${String.fromCharCode(97 + j)}.`, b.label, `: ${b.nilai}`, b.waktu]));
    if (cb.catatan) w5.addRow(["", cb.catatan]);
    w5.addRow([]);
  });
  w5.addRow(["CATATAN"]).getCell(1).font = { bold: true };
  susun.tnc.catatan.forEach((c, i) => {
    const [pertama, ...lanjut] = c.split("\n");
    w5.addRow([`${i + 1}.`, pertama]);
    lanjut.forEach((l) => w5.addRow(["", l]));
  });
  w5.addRow([]);
  w5.addRow([susun.tnc.pengantarRekening]);
  susun.tnc.rekening.forEach((r, i) => {
    w5.addRow(["", `${i + 1})`, "Bank", r.bank]);
    w5.addRow(["", "", "No. Rekening", r.noRek]);
    w5.addRow(["", "", "Cabang", r.cabang]);
  });
  w5.getColumn(1).width = 5; w5.getColumn(2).width = 6;
  w5.getColumn(3).width = 22; w5.getColumn(4).width = 26; w5.getColumn(5).width = 48;

  const w6 = wb.addWorksheet(LEMBAR_ISIAN, { state: "veryHidden" });
  const json = JSON.stringify(susun);
  for (let i = 0; i < json.length; i += 30000) w6.addRow([json.slice(i, i + 30000)]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

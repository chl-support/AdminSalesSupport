import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { handler, projectAktif } from "@/lib/api";
import { one } from "@/lib/db";
import { daftarMemo, lampiranProject, skemaProject } from "@/lib/memo";

/**
 * Rekapitulasi Memo Approval sebagai workbook Excel.
 *
 * Isinya sama persis dengan tabel di layar — kolom yang sama, urutan yang
 * sama. Yang membedakan hanya satu kolom tambahan berisi daftar nama
 * lampirannya: berkasnya sendiri tidak ikut ke dalam workbook, tetapi
 * pembacanya tetap perlu tahu apa saja yang menempel pada tiap memo.
 *
 * Laporan ini hanya membaca. Tidak ada tombol yang mengubah data dari sini.
 */

type Baris = Record<string, any>;

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
               "Agustus", "September", "Oktober", "November", "Desember"];

/**
 * Tanggal menjadi "YYYY-MM-DD", dari mana pun asalnya.
 *
 * Kolom DATE kembali dari PostgreSQL sebagai objek Date, bukan teks. Di layar
 * hal itu tidak terasa — JSON mengubahnya menjadi teks ISO dalam perjalanan —
 * tetapi di sini datanya dibaca langsung, dan String(Date) menghasilkan "Thu
 * Jul 30 2026 …" yang sepuluh huruf pertamanya bukan tanggal. Akibatnya kolom
 * Tanggal Memo dan Periode Program terbit kosong pada workbook-nya.
 */
const iso = (v: any) => {
  if (!v) return "";
  if (v instanceof Date) {
    // Bagian tanggalnya diambil menurut waktu setempat, bukan UTC: tanggal
    // yang disimpan tanpa jam akan mundur sehari bila digeser ke UTC.
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
};

const tglPanjang = (v: any) => {
  const [y, m, d] = iso(v).split("-").map(Number);
  return y && m && d ? `${d} ${BULAN[m - 1]} ${y}` : "";
};

const periode = (dari: any, sampai: any) => {
  const pecah = (v: any) => {
    const [y, m] = iso(v).split("-").map(Number);
    return y && m ? { y, nama: BULAN[m - 1] } : null;
  };
  const a = pecah(dari), z = pecah(sampai);
  if (a && z) {
    return a.y === z.y ? `${a.nama} s.d. ${z.nama} ${z.y}`
                       : `${a.nama} ${a.y} s.d. ${z.nama} ${z.y}`;
  }
  if (a) return `${a.nama} ${a.y} s.d. seterusnya`;
  if (z) return `s.d. ${z.nama} ${z.y}`;
  return "";
};

/** Daftar bernomor, satu baris satu butir — seperti pada layarnya. */
const bernomor = (v: any) =>
  String(v ?? "").split("\n").map((x) => x.trim()).filter(Boolean)
    .map((x, i) => `${i + 1}. ${x}`).join("\n");

const pihak = (m: Baris) =>
  [m.diajukan_oleh && `Diajukan: ${m.diajukan_oleh}`,
   m.diketahui_oleh && `Diketahui: ${m.diketahui_oleh}`,
   m.disetujui_oleh && `Disetujui: ${m.disetujui_oleh}`]
    .filter(Boolean).join("\n");

const KOLOM: { judul: string; lebar: number; ambil: (m: Baris, i: number,
               lampiran: Baris[]) => string | number }[] = [
  { judul: "No", lebar: 5, ambil: (_m, i) => i + 1 },
  { judul: "Nomor Memo", lebar: 30, ambil: (m) => m.nomor ?? "" },
  { judul: "Tanggal Memo", lebar: 18, ambil: (m) => tglPanjang(m.tanggal_memo) },
  { judul: "Pengajuan (Dari)", lebar: 28, ambil: (m) => m.dari ?? "" },
  { judul: "Kepada (Yth)", lebar: 34, ambil: (m) => m.kepada ?? "" },
  { judul: "Perihal / Program", lebar: 40, ambil: (m) => m.judul ?? "" },
  { judul: "Nilai / Skema Fee", lebar: 34, ambil: (m) => m.nilai_skema ?? "" },
  { judul: "Periode Program", lebar: 26,
    ambil: (m) => periode(m.berlaku_dari, m.berlaku_sampai) },
  { judul: "Dokumen Pendukung Wajib", lebar: 28,
    ambil: (m) => bernomor(m.dokumen_wajib) },
  { judul: "Diajukan / Diketahui / Disetujui Oleh", lebar: 36, ambil: pihak },
  { judul: "Berkas Memo", lebar: 26, ambil: (m) => m.file_name ?? "" },
  { judul: "Lampiran", lebar: 34,
    ambil: (m, _i, lampiran) => lampiran
      .filter((f) => f.memo_id === m.id)
      .map((f, i) => `${i + 1}. ${f.label ? `${f.label} — ` : ""}${f.file_name}`)
      .join("\n") },
];

export const GET = handler(async (req) => {
  const projectId = await projectAktif(req);
  const memos = await daftarMemo(projectId) as Baris[];
  const lampiran = await lampiranProject(projectId) as Baris[];
  const skema = await skemaProject(projectId) as Baris[];
  const proyek = await one<{ name: string }>(
    "SELECT name FROM projects WHERE id=$1", [projectId]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rekap Memo Approval");

  ws.addRow([`Rekapitulasi Memo Approval — ${proyek?.name ?? ""}`]);
  ws.mergeCells(1, 1, 1, KOLOM.length);
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.addRow([]);

  const kepala = ws.addRow(KOLOM.map((k) => k.judul));
  kepala.font = { bold: true };
  kepala.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  KOLOM.forEach((k, i) => { ws.getColumn(i + 1).width = k.lebar; });

  memos.forEach((m, i) => {
    const baris = ws.addRow(KOLOM.map((k) => k.ambil(m, i, lampiran)));
    baris.alignment = { vertical: "top", wrapText: true };
  });

  // Garis pada seluruh sel terisi: tanpa itu kolom yang isinya membungkus
  // beberapa baris tidak terlihat batasnya, dan rekap ini justru dicetak.
  const tepi = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
  for (let r = 3; r <= ws.rowCount; r++) {
    for (let c = 1; c <= KOLOM.length; c++) {
      ws.getCell(r, c).border =
        { top: tepi, left: tepi, bottom: tepi, right: tepi };
    }
  }

  // Rincian skema fee mendapat lembarnya sendiri, tidak dijejalkan ke dalam
  // satu sel pada lembar pertama. Satu memo bisa memuat belasan baris skema,
  // dan sel yang memuat semuanya tidak dapat disaring, dijumlah, maupun
  // diurutkan — tiga hal yang justru dicari orang saat membuka rekap ini.
  if (skema.length) {
    const ks = wb.addWorksheet("Rincian Skema Fee");
    const KOLOM_SKEMA: [string, number][] = [
      ["Nomor Memo", 24], ["Tanggal Memo", 14], ["Skema", 30],
      ["No", 6], ["Kategori", 24], ["Nilai", 42], ["Keterangan", 52],
    ];
    ks.addRow([`Rincian Nilai / Skema Fee — ${proyek?.name ?? ""}`]);
    ks.mergeCells(1, 1, 1, KOLOM_SKEMA.length);
    ks.getCell(1, 1).font = { bold: true, size: 13 };
    ks.addRow([]);
    const kepalaS = ks.addRow(KOLOM_SKEMA.map(([j]) => j));
    kepalaS.font = { bold: true };
    kepalaS.alignment =
      { vertical: "middle", horizontal: "center", wrapText: true };
    KOLOM_SKEMA.forEach(([, l], i) => { ks.getColumn(i + 1).width = l; });

    const memoDari = new Map(memos.map((m) => [String(m.id), m]));
    for (const b of skema) {
      const m = memoDari.get(String(b.memo_id));
      const baris = ks.addRow([
        m?.nomor ?? m?.judul ?? "", iso(m?.tanggal_memo), b.kelompok ?? "",
        b.urutan ?? "", b.kategori ?? "", b.nilai ?? "", b.keterangan ?? "",
      ]);
      baris.alignment = { vertical: "top", wrapText: true };
    }
    for (let r = 3; r <= ks.rowCount; r++)
      for (let c = 1; c <= KOLOM_SKEMA.length; c++)
        ks.getCell(r, c).border =
          { top: tepi, left: tepi, bottom: tepi, right: tepi };
  }

  const buf = await wb.xlsx.writeBuffer();
  const nama = `Rekap_Memo_Approval_${(proyek?.name ?? "project")
    .replace(/[^A-Za-z0-9]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nama}"`,
    },
  });
});

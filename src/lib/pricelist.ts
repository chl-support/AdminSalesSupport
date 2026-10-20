/**
 * Pricelist per project, diunggah sebagai berkas Excel.
 *
 * Bentuk berkasnya sama dengan lembar pricelist pada "Simulation TOP": satu
 * baris judul berisi Unit No, Address, Tipe, Area (M²) yang dipecah menjadi
 * Land dan Build pada baris di bawahnya, lalu satu kolom harga untuk tiap
 * cara bayar. Baris judulnya dicari, bukan dipatok di baris pertama — berkas
 * dari bagian penjualan sering diawali logo dan nama project.
 *
 * Satu project dapat menyimpan beberapa pricelist (riwayat), tetapi hanya
 * satu yang berlaku. Unggahan baru langsung berlaku; yang lama tetap tersimpan
 * dan dapat diberlakukan kembali bila unggahan barunya ternyata keliru.
 *
 * Pricelist disimpan utuh sebagai satu baris JSON, bukan dipecah per unit:
 * ia selalu berganti serentak lewat satu berkas, tidak pernah disunting per
 * unit, dan yang dibaca layar simulasi selalu seluruh isinya sekaligus.
 */

import ExcelJS from "exceljs";

import { audit, one, query, tx } from "./db";
import { PRICELIST, SKEMA } from "./pricelist-naraya";
import { catatRiwayat } from "./susun-pricelist-riwayat";
import { bentukSkema, uraianBentuk, type UnitHarga } from "./simulasi";

// ── Membaca berkas ─────────────────────────────────────────────────────────

/** Isi sel sebagai nilai yang dibaca orang: angka, teks, atau kosong. */
function nilaiSel(sel: ExcelJS.Cell): string | number | null {
  let v: any = sel.value;
  if (v && typeof v === "object") {
    if ("result" in v) v = v.result;                       // rumus
    else if ("richText" in v) v = v.richText.map((r: any) => r.text).join("");
    else if ("text" in v) v = v.text;                      // tautan
    else if (v instanceof Date) v = null;
    else if ("error" in v) v = null;
  }
  if (v == null || v === "") return null;
  return typeof v === "number" ? v : String(v);
}

const teks = (v: string | number | null) =>
  v == null ? "" : String(v).replace(/\s+/g, " ").trim();

/**
 * Angka dari sel. Sel angka dipakai apa adanya; sel teks dibaca dalam bentuk
 * Indonesia (1.817.000.000 dan 146,50) maupun Inggris (1,817,000,000 dan
 * 146.50). NaN berarti selnya terisi tetapi bukan angka.
 */
export function angkaSel(v: string | number | null): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = v.trim().replace(/^rp\.?/i, "").replace(/\s/g, "");
  if (!s || s === "-") return null;
  const titik = s.includes("."), koma = s.includes(",");
  if (titik && koma) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (titik) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  } else if (koma) {
    s = /^-?\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const KEPALA_UNIT = /^(unit\s*no\.?|no\.?\s*unit|kode\s*unit|unit)$/i;

export type HasilBaca = {
  lembar: string;
  /** Nomor baris judul, sebagaimana tertulis di Excel (mulai 1). */
  barisJudul: number;
  skema: { nama: string; uraian: string }[];
  unit: UnitHarga[];
  /** Menghalangi penyimpanan. */
  galat: string[];
  /** Boleh disimpan, tetapi perlu dilihat orang lebih dulu. */
  peringatan: string[];
};

/** Satu lembar kerja; null bila lembar ini tidak memuat baris "Unit No". */
function bacaLembar(ws: ExcelJS.Worksheet): HasilBaca | null {
  const baris = (r: number) => {
    const row = ws.getRow(r);
    const isi: (string | number | null)[] = [];
    for (let c = 1; c <= ws.columnCount; c++) isi.push(nilaiSel(row.getCell(c)));
    return isi;
  };

  let judul = -1;
  for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
    if (baris(r).some((v) => KEPALA_UNIT.test(teks(v)))) { judul = r; break; }
  }
  if (judul < 0) return null;

  const H = baris(judul).map(teks), H2 = baris(judul + 1).map(teks);
  const cari = (re: RegExp) => {
    for (let i = 0; i < H.length; i++) {
      if (re.test(H[i]) || re.test(H2[i])) return i;
    }
    return -1;
  };
  const kUnit = H.findIndex((h) => KEPALA_UNIT.test(h));
  const kAlamat = cari(/^(address|alamat|blok|cluster|kluster)$/i);
  const kTipe = cari(/^(tipe|type)$/i);
  const kLt = cari(/^(land|tanah|lt|luas tanah)$/i);
  const kLb = cari(/^(build|building|bangunan|lb|luas bangunan)$/i);
  // Keterangan tambahan, ada pada pricelist lengkap (lembar "Pricelist"
  // Naraya): ikut dibaca bila ada, tidak dipersoalkan bila tidak ada.
  const kPhase = cari(/^(phase|fase|tahap)$/i);
  const kUkuran = cari(/^(ukuran|dimensi|size)$/i);
  const kView = cari(/^(view|hadap|arah hadap)$/i);
  const kSub = cari(/^sub[\s-]?(tipe|type)$/i);
  const adaSub = H2.some((h) => /^(land|build|tanah|bangunan|lt|lb)$/i.test(h));
  const mulai = judul + (adaSub ? 2 : 1);

  const galat: string[] = [], peringatan: string[] = [];
  const hilang = [kAlamat < 0 && "Address", kTipe < 0 && "Tipe",
                  kLt < 0 && "Land", kLb < 0 && "Build"].filter(Boolean);
  if (hilang.length) {
    peringatan.push(`Kolom ${hilang.join(", ")} tidak ditemukan; unit tetap ` +
                    "terbaca tanpa kolom itu.");
  }

  // Kolom harga: seluruh kolom berjudul di kanan kolom identitas unit. Sel yang
  // dinaungi gabungan vertikal (mis. "CASH KERAS" yang di-merge dua baris)
  // membawa nama yang sama pada baris kedua, maka nama diambil dari baris judul.
  //
  // Kolom DPP dan "NILAI FREE PPN DTP …" bukan cara bayar: keduanya milik
  // kolom harga di sebelah kirinya, seperti susunan lembar Pricelist Naraya
  // (Cash Keras | DPP | Nilai Free PPN DTP Cash Keras | Cicilan 12X | …).
  const terakhir = Math.max(kUnit, kAlamat, kTipe, kLt, kLb, kPhase, kUkuran, kView, kSub);
  const kolom: { i: number; nama: string; dpp?: number; dtp?: number }[] = [];
  for (let i = terakhir + 1; i < H.length; i++) {
    const nama = H[i] || H2[i];
    if (!nama) continue;
    const induk = kolom[kolom.length - 1];
    if (/^dpp\b/i.test(nama)) { if (induk && induk.dpp == null) induk.dpp = i; continue; }
    if (/ppn\s*dtp|free\s*ppn/i.test(nama)) { if (induk && induk.dtp == null) induk.dtp = i; continue; }
    if (!kolom.some((k) => k.nama === nama)) kolom.push({ i, nama });
  }
  if (!kolom.length) {
    galat.push("Tidak ada kolom harga di kanan kolom Build.");
  }
  for (const k of kolom) {
    if (!bentukSkema(k.nama)) {
      galat.push(`Cara bayar "${k.nama}" tidak dikenali. Nama kolom harus ` +
                 "memuat CASH, CICILAN …x, atau KPR (mis. KPR DP 10%/4x).");
    }
  }
  const tunai = kolom.filter((k) => bentukSkema(k.nama)?.jenis === "cash");
  if (!tunai.length) {
    galat.push("Kolom Cash Keras tidak ada. Ia menjadi pembanding NPV cara " +
               "bayar lainnya.");
  }

  const unit: UnitHarga[] = [];
  const dilihat = new Map<string, number>();
  let kosong = 0, kecil = 0;
  for (let r = mulai; r <= ws.rowCount; r++) {
    const isi = baris(r);
    const kode = teks(isi[kUnit]);
    const mentah = kolom.map((k) => angkaSel(isi[k.i]));
    if (!kode) {
      if (mentah.some((v) => v)) {
        galat.push(`Baris ${r}: harga terisi tetapi Unit No kosong.`);
      }
      continue;
    }
    if (/^(total|jumlah|keterangan|catatan|note)/i.test(kode)) continue;
    if (!mentah.some((v) => v)) continue;

    if (dilihat.has(kode)) {
      galat.push(`Unit No ${kode} tertulis dua kali (baris ${dilihat.get(kode)} ` +
                 `dan ${r}).`);
      continue;
    }
    dilihat.set(kode, r);

    const bukan = kolom.filter((_, j) => Number.isNaN(mentah[j])).map((k) => k.nama);
    if (bukan.length) {
      galat.push(`Baris ${r} (${kode}): bukan angka di kolom ${bukan.join(", ")}.`);
    }
    const harga: Record<string, number> = {};
    kolom.forEach((k, j) => {
      const v = mentah[j];
      if (v != null && !Number.isNaN(v) && v > 0) {
        harga[k.nama] = v;
        if (v < 1_000_000) kecil++;
      } else if (v == null) kosong++;
    });
    const luas = (i: number | undefined) => {
      if (i == null || i < 0) return null;
      const v = angkaSel(isi[i]);
      return v == null || Number.isNaN(v) ? null : v;
    };
    const pajak: NonNullable<UnitHarga["pajak"]> = {};
    for (const k of kolom) {
      if (k.dpp == null && k.dtp == null) continue;
      const dpp = luas(k.dpp), dtp = luas(k.dtp);
      if (dpp != null || dtp != null) {
        pajak[k.nama] = { dpp: dpp == null ? null : Math.round(dpp),
                          dtp: dtp == null ? null : Math.round(dtp) };
      }
    }
    const ket = (i: number) => (i < 0 ? "" : teks(isi[i]));
    unit.push({
      kode, alamat: ket(kAlamat), tipe: ket(kTipe),
      lt: luas(kLt), lb: luas(kLb), harga,
      ...(ket(kPhase) && { phase: ket(kPhase) }),
      ...(ket(kUkuran) && { ukuran: ket(kUkuran) }),
      ...(ket(kView) && { view: ket(kView) }),
      ...(ket(kSub) && { subTipe: ket(kSub) }),
      ...(Object.keys(pajak).length && { pajak }),
    });
  }

  if (!unit.length) galat.push("Tidak ada baris unit di bawah baris judul.");
  if (kosong) {
    peringatan.push(`${kosong} sel harga kosong; cara bayar itu tidak ` +
                    "ditawarkan untuk unitnya.");
  }
  if (kecil) {
    peringatan.push(`${kecil} harga di bawah Rp 1.000.000. Harga harus ditulis ` +
                    "dalam rupiah penuh, bukan dalam juta.");
  }
  if (tunai.length) {
    const murah = unit.filter((u) => {
      const t = u.harga[tunai[0].nama];
      return t && Object.entries(u.harga).some(([n, v]) => n !== tunai[0].nama && v < t);
    });
    if (murah.length) {
      peringatan.push(`${murah.length} unit punya harga cara bayar lain di bawah ` +
                      `Cash Keras (mis. ${murah[0].kode}).`);
    }
  }

  return {
    lembar: ws.name, barisJudul: judul,
    skema: kolom.map((k) => {
      const b = bentukSkema(k.nama);
      return { nama: k.nama, uraian: b ? uraianBentuk(b) : "Tidak dikenali" };
    }),
    unit, galat, peringatan,
  };
}

/**
 * Baca berkas pricelist. Lembar yang dipakai adalah lembar yang disebutkan
 * namanya, atau — bila tidak disebutkan — lembar pertama yang memuat baris
 * "Unit No" dan terbaca tanpa galat. Berkas dari bagian penjualan sering
 * memuat beberapa lembar berkolom Unit No (mis. "Data Pricelist" berisi
 * nomor urut, di samping lembar "Pricelist" yang sebenarnya); bila semuanya
 * bergalat, yang ditampilkan adalah yang pertama.
 */
export async function bacaPricelist(
  isi: ArrayBuffer, namaLembar?: string,
): Promise<HasilBaca & { daftarLembar: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(isi as any);
  } catch {
    throw new Error("Berkas tidak dapat dibaca sebagai Excel .xlsx. Berkas " +
                    ".xls lama perlu disimpan ulang sebagai .xlsx lebih dulu.");
  }
  const daftarLembar = wb.worksheets.map((w) => w.name);
  const calon = namaLembar
    ? wb.worksheets.filter((w) => w.name === namaLembar)
    : wb.worksheets;
  let pertama: HasilBaca | null = null;
  for (const ws of calon) {
    const h = bacaLembar(ws);
    if (!h) continue;
    if (!h.galat.length) return { ...h, daftarLembar };
    pertama ??= h;
  }
  if (pertama) return { ...pertama, daftarLembar };
  throw new Error(namaLembar
    ? `Lembar "${namaLembar}" tidak memuat kolom Unit No.`
    : "Tidak ada lembar yang memuat kolom Unit No. Pakai template dari layar " +
      "Pricelist.");
}

// ── Template ───────────────────────────────────────────────────────────────

/** Berkas contoh dengan bentuk yang diterima, berisi lima unit Naraya. */
export async function templatePricelist(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Price List", { views: [{ state: "frozen", ySplit: 2 }] });
  const kepala = ["Unit No", "Address", "Tipe", "Area (M²)", "", ...SKEMA];
  ws.addRow(kepala);
  ws.addRow(["", "", "", "Land", "Build", ...SKEMA.map(() => "")]);
  for (const c of [1, 2, 3, ...SKEMA.map((_, i) => 6 + i)]) ws.mergeCells(1, c, 2, c);
  ws.mergeCells(1, 4, 1, 5);
  for (const u of PRICELIST.slice(0, 5)) {
    ws.addRow([u.kode, u.alamat, u.tipe, u.lt, u.lb, ...SKEMA.map((s) => u.harga[s])]);
  }
  ws.columns.forEach((col, i) => {
    col.width = i < 3 ? 13 : i < 5 ? 9 : Math.max(16, String(kepala[i]).length + 2);
  });
  for (let r = 3; r <= 7; r++) {
    for (let c = 4; c <= 5; c++) ws.getCell(r, c).numFmt = "#,##0.00";
    for (let c = 6; c <= kepala.length; c++) ws.getCell(r, c).numFmt = "#,##0";
  }
  for (const r of [1, 2]) {
    ws.getRow(r).eachCell((c) => {
      c.font = { bold: true };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = { bottom: { style: "thin" } };
    });
  }

  const p = wb.addWorksheet("Petunjuk");
  p.getColumn(1).width = 110;
  [
    "Petunjuk pengisian pricelist",
    "",
    "1. Isi unit mulai baris 3 lembar Price List. Baris 3–7 hanya contoh; timpa atau hapus.",
    "2. Baris judul (baris 1–2) jangan diubah, kecuali nama kolom cara bayar.",
    "3. Kolom cara bayar boleh ditambah atau dikurangi di kanan kolom Build. Namanya menentukan jadwalnya:",
    "     CASH KERAS → cash;  CICILAN 24x → DP 10% lalu 23x angsuran;",
    "     KPR DP 10%/4x → DP 10% dicicil 4x lalu pelunasan bank;  KPR DP 0% → tanpa DP;",
    "     KPR atau KPR DP 20% → DP sekali lalu pelunasan bank.",
    "4. Kolom CASH KERAS wajib ada: ia menjadi pembanding NPV.",
    "5. Harga dalam rupiah penuh (1817000000). Unit No tidak boleh dobel. Sel harga boleh kosong.",
  ].forEach((t, i) => { p.getCell(i + 1, 1).value = t; });
  p.getCell(1, 1).font = { bold: true, size: 13 };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── Penyimpanan ────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tabelnya dipasang dari sisi aplikasi, sekali per proses — alasannya sama
 * dengan src/lib/kolom.ts: yang hanya tertulis di db/schema.sql baru sampai
 * ke basis data yang sudah berjalan bila migrasi dijalankan ulang.
 */
let sekali: Promise<void> | null = null;
export function ensureTabelPricelist(): Promise<void> {
  sekali ??= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS pricelists (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id    UUID NOT NULL REFERENCES projects(id),
        nama          TEXT NOT NULL,
        nama_berkas   TEXT,
        lembar        TEXT,
        skema         JSONB NOT NULL,
        unit          JSONB NOT NULL,
        jumlah_unit   INT NOT NULL,
        aktif         BOOLEAN NOT NULL DEFAULT false,
        diunggah_oleh TEXT,
        diunggah_pada TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS pricelists_satu_aktif
                   ON pricelists (project_id) WHERE aktif`);
    // Berkas Excel asli yang diunggah, supaya dapat diunduh kembali dari
    // layar Pricelist. Unggahan sebelum kolom ini ada tidak memilikinya.
    await query("ALTER TABLE pricelists ADD COLUMN IF NOT EXISTS berkas BYTEA");
    // Asal pricelist: "susun" bila lahir dari layar Pricelist lima langkah,
    // "unggah" bila berkas Excel yang diunggah orang. Dipakai tombol
    // Otomatis/Manual untuk berpindah sumber tanpa mencari-cari di riwayat.
    // Baris lama tidak punya penandanya; bawaannya "unggah", dan memang dari
    // sanalah seluruh pricelist berasal sebelum layar penyusun ada.
    await query(
      "ALTER TABLE pricelists ADD COLUMN IF NOT EXISTS sumber TEXT NOT NULL DEFAULT 'unggah'");
  })().catch((e) => { sekali = null; throw e; });
  return sekali;
}

/** Asal sebuah pricelist: disusun di layar Pricelist, atau berkas unggahan. */
export type SumberPricelist = "susun" | "unggah";

export type RingkasPricelist = {
  id: string; nama: string; nama_berkas: string | null; lembar: string | null;
  jumlah_unit: number; jumlah_skema: number; aktif: boolean;
  diunggah_oleh: string | null; diunggah_pada: string;
  /** Berkas Excel aslinya tersimpan dan dapat diunduh. */
  ada_berkas: boolean;
  sumber: SumberPricelist;
};

export type PricelistBerlaku = {
  id: string;
  nama: string;
  skema: string[];
  unit: UnitHarga[];
};

export async function daftarPricelist(projectId: string): Promise<RingkasPricelist[]> {
  await ensureTabelPricelist();
  return query<RingkasPricelist>(
    `SELECT id, nama, nama_berkas, lembar, jumlah_unit,
            jsonb_array_length(skema) AS jumlah_skema, aktif,
            diunggah_oleh, diunggah_pada, berkas IS NOT NULL AS ada_berkas,
            sumber
       FROM pricelists WHERE project_id=$1
      ORDER BY diunggah_pada DESC`, [projectId]);
}

/**
 * Pricelist yang berlaku bagi sebuah project: unggahan yang aktif, atau null.
 *
 * Tidak ada pricelist bawaan untuk project mana pun. Naraya Serpong sempat
 * memakai 48 unit dari src/lib/pricelist-naraya.ts selama belum ada unggahan;
 * atas permintaan pemakainya itu dihentikan, supaya setiap project mulai
 * kosong dan harga yang tampil selalu harga yang diunggah bagian penjualan.
 */
export async function pricelistBerlaku(
  projectId: string,
): Promise<PricelistBerlaku | null> {
  await ensureTabelPricelist();
  const row = await one<{ id: string; nama: string; skema: string[]; unit: UnitHarga[] }>(
    "SELECT id, nama, skema, unit FROM pricelists WHERE project_id=$1 AND aktif",
    [projectId]);
  return row ?? null;
}

/** Simpan hasil baca sebagai pricelist yang berlaku untuk project-nya. */
export async function simpanPricelist(input: {
  projectId: string; nama: string; namaBerkas: string;
  /** Isi berkas Excel aslinya, disimpan untuk diunduh kembali. */
  isi?: Buffer;
  hasil: HasilBaca; aktor: string;
  /** false: simpan ke riwayat saja, pricelist yang berlaku tidak berganti. */
  aktif?: boolean;
  /** Asalnya; bawaannya berkas unggahan. */
  sumber?: SumberPricelist;
}): Promise<{ id: string }> {
  const { hasil } = input;
  if (hasil.galat.length) {
    throw new Error("Pricelist masih memuat galat dan belum dapat disimpan.");
  }
  await ensureTabelPricelist();
  return tx(async (c) => {
    const aktif = input.aktif ?? true;
    if (aktif) {
      await c.query("UPDATE pricelists SET aktif=false WHERE project_id=$1 AND aktif",
                    [input.projectId]);
    }
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO pricelists (project_id, nama, nama_berkas, lembar, skema, unit,
                               jumlah_unit, aktif, diunggah_oleh, berkas, sumber)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$10,$8,$9,$11) RETURNING id`,
      [input.projectId, input.nama, input.namaBerkas, hasil.lembar,
       JSON.stringify(hasil.skema.map((s) => s.nama)), JSON.stringify(hasil.unit),
       hasil.unit.length, input.aktor, input.isi ?? null, aktif,
       input.sumber ?? "unggah"]);
    await audit({
      entityType: "pricelist", entityId: rows[0].id, action: "pricelist_uploaded",
      actor: input.aktor,
      after: { nama: input.nama, berkas: input.namaBerkas,
               unit: hasil.unit.length, skema: hasil.skema.length },
    }, c);
    return { id: rows[0].id };
  });
}

/** Berkas Excel asli sebuah unggahan milik project ini, atau null. */
export async function berkasPricelist(
  id: string, projectId: string,
): Promise<{ nama: string; isi: Buffer } | null> {
  await ensureTabelPricelist();
  if (!UUID.test(id)) return null;
  const row = await one<{ nama_berkas: string | null; nama: string; berkas: Buffer | null }>(
    "SELECT nama_berkas, nama, berkas FROM pricelists WHERE id=$1 AND project_id=$2",
    [id, projectId]);
  if (!row?.berkas) return null;
  return { nama: row.nama_berkas || `${row.nama}.xlsx`, isi: row.berkas };
}

/** Berlakukan kembali pricelist lama milik project yang sama. */
export async function berlakukanPricelist(
  id: string, projectId: string, aktor: string,
): Promise<void> {
  await ensureTabelPricelist();
  if (!UUID.test(id)) throw new Error("Pricelist tidak ditemukan pada project ini.");
  await tx(async (c) => {
    const { rows } = await c.query<{ nama: string }>(
      "SELECT nama FROM pricelists WHERE id=$1 AND project_id=$2", [id, projectId]);
    if (!rows.length) throw new Error("Pricelist tidak ditemukan pada project ini.");
    await c.query("UPDATE pricelists SET aktif=false WHERE project_id=$1 AND aktif",
                  [projectId]);
    await c.query("UPDATE pricelists SET aktif=true WHERE id=$1", [id]);
    await audit({ entityType: "pricelist", entityId: id,
                  action: "pricelist_activated", actor: aktor,
                  after: { nama: rows[0].nama } }, c);
  });
  const p = await one<{ nama: string }>("SELECT nama FROM pricelists WHERE id=$1", [id]);
  await catatRiwayat(projectId, aktor, "Berlakukan kembali",
    [`Pricelist "${p?.nama ?? id}" diberlakukan kembali`]);
}

/**
 * Ganti nama pricelist (yang berlaku maupun di riwayat), supaya mudah
 * dikenali dan dibuka kembali. Nama berkas unduhannya ikut berganti.
 */
/**
 * Berpindah sumber: berlakukan pricelist terbaru yang berasal dari layar
 * Pricelist ("susun") atau dari berkas unggahan ("unggah").
 *
 * Keduanya sudah pernah diperiksa dan disimpan; yang dilakukan di sini hanya
 * menunjuk salah satunya sebagai yang berlaku. Jadi berpindah bolak-balik
 * tidak menghitung ulang apa pun dan tidak dapat menghasilkan angka baru —
 * yang dipakai Simulasi tetap angka yang pernah diberlakukan orang.
 *
 * Bila project ini belum pernah punya pricelist dari sumber itu, galatnya
 * menyebutkannya; tidak ada yang diubah.
 */
export async function pilihSumberPricelist(
  projectId: string, sumber: SumberPricelist, aktor: string,
): Promise<{ id: string; nama: string; sumber: SumberPricelist }> {
  await ensureTabelPricelist();
  const baris = await one<{ id: string; nama: string; aktif: boolean }>(
    `SELECT id, nama, aktif FROM pricelists
      WHERE project_id=$1 AND sumber=$2
      ORDER BY diunggah_pada DESC LIMIT 1`, [projectId, sumber]);
  if (!baris) {
    throw new Error(sumber === "susun"
      ? "Belum ada pricelist yang diberlakukan dari layar Pricelist. " +
        "Susun isiannya lalu tekan Simpan & berlakukan."
      : "Belum ada pricelist dari berkas unggahan pada project ini. " +
        "Unggah berkas Excel-nya lebih dulu.");
  }
  if (!baris.aktif) await berlakukanPricelist(baris.id, projectId, aktor);
  return { id: baris.id, nama: baris.nama, sumber };
}

export async function gantiNamaPricelist(
  id: string, projectId: string, nama: string, aktor: string,
): Promise<void> {
  await ensureTabelPricelist();
  const baru = nama.replace(/\s+/g, " ").trim();
  if (!baru) throw new Error("Nama pricelist tidak boleh kosong.");
  if (baru.length > 120) throw new Error("Nama pricelist paling banyak 120 huruf.");
  if (!UUID.test(id)) throw new Error("Pricelist tidak ditemukan pada project ini.");
  let lamaNama = "";
  await tx(async (c) => {
    const { rows } = await c.query<{ nama: string; nama_berkas: string | null }>(
      "SELECT nama, nama_berkas FROM pricelists WHERE id=$1 AND project_id=$2",
      [id, projectId]);
    if (!rows.length) throw new Error("Pricelist tidak ditemukan pada project ini.");
    const berkas = `${baru.replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`;
    await c.query("UPDATE pricelists SET nama=$2, nama_berkas=$3 WHERE id=$1",
                  [id, baru, berkas]);
    await audit({ entityType: "pricelist", entityId: id, action: "pricelist_renamed",
                  actor: aktor, before: { nama: rows[0].nama, berkas: rows[0].nama_berkas },
                  after: { nama: baru, berkas } }, c);
    lamaNama = rows[0].nama;
  });
  await catatRiwayat(projectId, aktor, "Ganti nama", [`"${lamaNama}" → "${baru}"`]);
}

/**
 * Hapus pricelist yang tidak berlaku. Yang sedang berlaku tidak dapat
 * dihapus — layar simulasi project itu akan kosong seketika; berlakukan
 * pricelist lain lebih dulu.
 */
export async function hapusPricelist(
  id: string, projectId: string, aktor: string,
): Promise<void> {
  await ensureTabelPricelist();
  if (!UUID.test(id)) throw new Error("Pricelist tidak ditemukan pada project ini.");
  let lamaNama = "";
  await tx(async (c) => {
    const { rows } = await c.query<{ nama: string; aktif: boolean }>(
      "SELECT nama, aktif FROM pricelists WHERE id=$1 AND project_id=$2",
      [id, projectId]);
    if (!rows.length) throw new Error("Pricelist tidak ditemukan pada project ini.");
    if (rows[0].aktif) {
      throw new Error("Pricelist yang sedang berlaku tidak dapat dihapus. " +
                      "Berlakukan pricelist lain lebih dulu.");
    }
    await c.query("DELETE FROM pricelists WHERE id=$1", [id]);
    await audit({ entityType: "pricelist", entityId: id,
                  action: "pricelist_deleted", actor: aktor,
                  before: { nama: rows[0].nama } }, c);
    lamaNama = rows[0].nama;
  });
  await catatRiwayat(projectId, aktor, "Hapus", [`Pricelist "${lamaNama}" dihapus`]);
}

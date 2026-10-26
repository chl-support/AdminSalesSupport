/**
 * Pemeriksaan otomatis penyusunan pricelist, per langkah: kesalahan yang
 * membuat pricelist belum dapat diberlakukan (`stop`, dari `hasil.galat`)
 * dan hal janggal yang patut dicek sebelum Simpan / Berlakukan (`cek`),
 * mis. beberapa kolom Harga mengambil sumber yang sama — seperti kolom KPR
 * BIO DISTRICT yang semuanya merujuk KPR Extra Ultra Express.
 *
 * Dipakai untuk daftar cek di bilah langkah (tanda ✓ / jumlah temuan) dan
 * daftar temuan di atas tiap langkah.
 */

import { kunciTnc, tingkatNaik, type HasilSusun, type SusunPricelist } from "./susun-pricelist";

/**
 * Langkah 0..5: 1 Data (IRR), 2 Data Unit, 3 Data Harga, 4a Harga, 4b Harga
 * Spesial, 5 S&K. `sasaran`: id elemen isian yang perlu dicek, untuk tombol
 * "Tunjukkan" (pindah ke langkahnya, gulir ke isian itu dan menyorotnya).
 */
export type Temuan = { langkah: number; jenis: "stop" | "cek"; id: string; en: string; sasaran?: string };

/** Galat `hitungSemua` → langkah dan isian yang salah, dari pesannya. */
function letakGalat(g: string, s: SusunPricelist): { langkah: number; sasaran?: string } {
  const idx = <T,>(a: T[], f: (x: T) => boolean) => { const i = a.findIndex(f); return i < 0 ? undefined : i; };
  let m: RegExpExecArray | null;
  if (g.startsWith("Data (IRR)")) {
    m = /koefisien (.+) tidak dapat/.exec(g);
    const i = m ? idx(s.irr.skema, (x) => x.nama === m![1]) : 0;
    return { langkah: 0, sasaran: i == null ? undefined : `irr-nama-${i}` };
  }
  if (g.startsWith("Unit Data")) {
    m = /tertulis dua kali \(baris \d+ dan (\d+)\)/.exec(g) ?? /^Unit Data baris (\d+)/.exec(g);
    if (m) return { langkah: 1, sasaran: `unit-kode-${Number(m[1]) - 1}` };
    m = /^Unit Data (.+?): /.exec(g);
    const i = m ? idx(s.unit, (u) => u.kode === m![1]) : undefined;
    return { langkah: 1, sasaran: i == null ? undefined : `unit-kode-${i}` };
  }
  if (g.startsWith("Data Pricelist")) {
    m = /^Data Pricelist: kolom (.+?) merujuk/.exec(g);
    const i = m ? idx(s.dataPricelist.kolom, (k) => k.nama === m![1]) : undefined;
    return { langkah: 2, sasaran: i == null ? undefined : `dp-kolom-${i}` };
  }
  // Kolom Harga diatur di langkah 3 (kolom Perubahan Metode Pembayaran).
  m = /^Pricelist: kolom (.+?) merujuk/.exec(g);
  if (m) {
    const j = idx(s.pricelist.kolom, (k) => k.nama === m![1]);
    return { langkah: 2, sasaran: j == null ? undefined : `pl-kolom-${j}` };
  }
  return { langkah: 3 };
}

const persen = (x: number) => `${(x * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

export function periksaSusun(s: SusunPricelist, h: HasilSusun): Temuan[] {
  const t: Temuan[] = h.galat.map((g) => ({ ...letakGalat(g, s), jenis: "stop", id: g, en: g }));
  const cek = (langkah: number, id: string, en: string, sasaran?: string) =>
    t.push({ langkah, jenis: "cek", id, en, sasaran });

  // 1. Data (IRR)
  const alokasi = s.irr.skema.reduce((a, x) => a + (x.alokasi || 0), 0);
  if (s.irr.skema.length && Math.abs(alokasi - 1) > 0.0005) {
    cek(0, `Allocation berjumlah ${persen(alokasi)}, belum 100%.`,
           `Allocation adds up to ${persen(alokasi)}, not 100%.`, "irr-alokasi-0");
  }
  // Pengecualian manual (Koefisien / Harga Penyesuaian diketik, mis. dari
  // pricelist lama) tetap boleh, tetapi diingatkan: standarnya semua cara
  // bayar tepat pada Target IRR.
  s.irr.skema.forEach((x, i) => {
    const r = h.irr.irr[x.nama];
    if (x.acuan || !x.hargaSesuai || !Number.isFinite(r) || Math.abs(r - s.irr.target) < 0.0005) return;
    cek(0, `${x.nama} memakai koefisien manual: IRR ${persen(r)}, bukan Target IRR ${persen(s.irr.target)}. Abaikan bila memang pengecualian (mis. pricelist lama); tekan ↺ Target untuk kembali ke standar.`,
           `${x.nama} uses a manual coefficient: IRR ${persen(r)}, not the ${persen(s.irr.target)} target. Ignore if it is an intended exception; press ↺ Target to return to the standard.`,
           `irr-koef-${i}`);
  });

  // 3. Data Harga — termasuk susunan kolom Harga, yang diatur di sini.
  const dp = s.dataPricelist.kolom, pl = s.pricelist.kolom;
  if (!s.pricelist.judul.trim()) cek(2, "Judul Harga belum diisi.", "The Price List title is empty.", "pl-judul");
  if (!s.pricelist.tanggal.trim()) cek(2, "Tanggal Berlaku belum diisi.", "The effective date is empty.", "pl-tanggal");
  dp.forEach((k, i) => {
    const dariIni = pl.filter((p) => p.dari === k.nama);
    if (dariIni.length > 1) {
      const nama = dariIni.map((p) => p.nama).join(", ");
      cek(2, `Kolom Harga ${nama} semuanya mengambil harga ${k.nama}. Pastikan memang begitu; bila tidak, kolom Harga yang salah sumber harganya juga salah.`,
             `Price List columns ${nama} all take the price of ${k.nama}. Make sure that is intended; otherwise their prices are wrong.`,
             `dp-kolom-${i}`);
    }
    if (k.skema && (k.kali ?? 1) !== 1 && tingkatNaik(k).some((x) => x.persen)) {
      cek(2, `${k.nama} memakai pengali ${persen(k.kali ?? 1)} dan juga kenaikan bertingkat %. Pastikan kenaikannya tidak terhitung dua kali.`,
             `${k.nama} uses a ${persen(k.kali ?? 1)} multiplier and also a tiered % increase. Make sure the increase is not counted twice.`,
             `dp-kolom-${i}`);
    }
    const kali = k.kali ?? 1;
    if (kali < 0.8 || kali > 1.6) {
      cek(2, `Pengali ${k.nama} ${persen(kali)} tidak lazim. Periksa ketikannya.`,
             `${k.nama} multiplier ${persen(kali)} is unusual. Check the input.`, `dp-kolom-${i}`);
    }
  });
  const tidakDipakai = dp.filter((k) => !pl.some((p) => p.dari === k.nama)).map((k) => k.nama);
  if (tidakDipakai.length) {
    cek(2, `Tidak tampil di Harga: ${tidakDipakai.join(", ")}. Abaikan bila memang tidak dijual.`,
           `Not shown in the Price List: ${tidakDipakai.join(", ")}. Ignore if intended.`,
           `dp-kolom-${dp.findIndex((k) => k.nama === tidakDipakai[0])}`);
  }
  const ganda = pl.map((p) => p.nama).filter((n, i, a) => a.indexOf(n) !== i);
  if (ganda.length) {
    cek(2, `Nama kolom Harga dipakai dua kali: ${[...new Set(ganda)].join(", ")}.`,
           `Price List column name used twice: ${[...new Set(ganda)].join(", ")}.`,
           `pl-kolom-${pl.map((p) => p.nama).lastIndexOf(ganda[0])}`);
  }
  pl.forEach((p, j) => {
    if (p.kali < 0.8 || p.kali > 1.6) {
      cek(2, `Pengali kolom Harga ${p.nama} ${persen(p.kali)} tidak lazim. Periksa ketikannya.`,
             `Price List column ${p.nama} multiplier ${persen(p.kali)} is unusual. Check the input.`, `pl-kolom-${j}`);
    }
  });

  // 5. Syarat dan Ketentuan: tiap kolom Harga punya blok cara bayarnya.
  const blok = new Set(s.tnc.caraBayar.map((c) => kunciTnc(c.judul)));
  const tanpaTnc = pl.filter((p) => !blok.has(kunciTnc(p.nama))).map((p) => p.nama);
  if (tanpaTnc.length) {
    cek(5, `Belum ada ketentuan pembayaran untuk: ${tanpaTnc.join(", ")}.`,
           `No payment terms yet for: ${tanpaTnc.join(", ")}.`, "tnc-judul");
  }
  return t;
}

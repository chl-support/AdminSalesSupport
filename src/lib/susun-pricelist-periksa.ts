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

/** Langkah 0..5: 1 Data (IRR), 2 Data Unit, 3 Data Harga, 4a Harga, 4b Harga Spesial, 5 S&K. */
export type Temuan = { langkah: number; jenis: "stop" | "cek"; id: string; en: string };

/** Galat `hitungSemua` → langkahnya, dari awalan pesannya. */
function langkahGalat(g: string): number {
  if (g.startsWith("Data (IRR)")) return 0;
  if (g.startsWith("Unit Data")) return 1;
  if (g.startsWith("Data Pricelist")) return 2;
  return 3;
}

const persen = (x: number) => `${(x * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

export function periksaSusun(s: SusunPricelist, h: HasilSusun): Temuan[] {
  const t: Temuan[] = h.galat.map((g) => ({ langkah: langkahGalat(g), jenis: "stop", id: g, en: g }));
  const cek = (langkah: number, id: string, en: string) => t.push({ langkah, jenis: "cek", id, en });

  // 1. Data (IRR)
  const alokasi = s.irr.skema.reduce((a, x) => a + (x.alokasi || 0), 0);
  if (s.irr.skema.length && Math.abs(alokasi - 1) > 0.0005) {
    cek(0, `Allocation berjumlah ${persen(alokasi)}, belum 100%.`,
           `Allocation adds up to ${persen(alokasi)}, not 100%.`);
  }

  // 3. Data Harga — termasuk susunan kolom Harga, yang diatur di sini.
  const dp = s.dataPricelist.kolom, pl = s.pricelist.kolom;
  if (!s.pricelist.judul.trim()) cek(2, "Judul Harga belum diisi.", "The Price List title is empty.");
  if (!s.pricelist.tanggal.trim()) cek(2, "Tanggal Berlaku belum diisi.", "The effective date is empty.");
  for (const k of dp) {
    const dariIni = pl.filter((p) => p.dari === k.nama);
    if (dariIni.length > 1) {
      const nama = dariIni.map((p) => p.nama).join(", ");
      cek(2, `Kolom Harga ${nama} semuanya mengambil harga ${k.nama}. Pastikan memang begitu; bila tidak, kolom Harga yang salah sumber harganya juga salah.`,
             `Price List columns ${nama} all take the price of ${k.nama}. Make sure that is intended; otherwise their prices are wrong.`);
    }
    if (k.skema && (k.kali ?? 1) !== 1 && tingkatNaik(k).some((x) => x.persen)) {
      cek(2, `${k.nama} memakai pengali ${persen(k.kali ?? 1)} dan juga kenaikan bertingkat %. Pastikan kenaikannya tidak terhitung dua kali.`,
             `${k.nama} uses a ${persen(k.kali ?? 1)} multiplier and also a tiered % increase. Make sure the increase is not counted twice.`);
    }
    const kali = k.kali ?? 1;
    if (kali < 0.8 || kali > 1.6) {
      cek(2, `Pengali ${k.nama} ${persen(kali)} tidak lazim. Periksa ketikannya.`,
             `${k.nama} multiplier ${persen(kali)} is unusual. Check the input.`);
    }
  }
  const tidakDipakai = dp.filter((k) => !pl.some((p) => p.dari === k.nama)).map((k) => k.nama);
  if (tidakDipakai.length) {
    cek(2, `Tidak tampil di Harga: ${tidakDipakai.join(", ")}. Abaikan bila memang tidak dijual.`,
           `Not shown in the Price List: ${tidakDipakai.join(", ")}. Ignore if intended.`);
  }
  const ganda = pl.map((p) => p.nama).filter((n, i, a) => a.indexOf(n) !== i);
  if (ganda.length) {
    cek(2, `Nama kolom Harga dipakai dua kali: ${[...new Set(ganda)].join(", ")}.`,
           `Price List column name used twice: ${[...new Set(ganda)].join(", ")}.`);
  }
  for (const p of pl) {
    if (p.kali < 0.8 || p.kali > 1.6) {
      cek(2, `Pengali kolom Harga ${p.nama} ${persen(p.kali)} tidak lazim. Periksa ketikannya.`,
             `Price List column ${p.nama} multiplier ${persen(p.kali)} is unusual. Check the input.`);
    }
  }

  // 5. Syarat dan Ketentuan: tiap kolom Harga punya blok cara bayarnya.
  const blok = new Set(s.tnc.caraBayar.map((c) => kunciTnc(c.judul)));
  const tanpaTnc = pl.filter((p) => !blok.has(kunciTnc(p.nama))).map((p) => p.nama);
  if (tanpaTnc.length) {
    cek(5, `Belum ada ketentuan pembayaran untuk: ${tanpaTnc.join(", ")}.`,
           `No payment terms yet for: ${tanpaTnc.join(", ")}.`);
  }
  return t;
}

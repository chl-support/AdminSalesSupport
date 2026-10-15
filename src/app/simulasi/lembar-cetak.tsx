"use client";

/**
 * Lembar cetak Simulasi / NPV — Konsumen dan Management — beserta penyusun
 * PDF-nya.
 *
 * Dipakai bersama oleh halaman pratinjau (/simulasi/cetak) dan tombol Unduh
 * PDF di layar Simulasi, supaya yang tercetak dan yang terunduh adalah lembar
 * yang sama persis. Bentuk keduanya disalin dari lembar cetak berkas
 * Simulation TOP, termasuk tanggal berbahasa Inggris dan format rupiah
 * akuntansinya.
 */

import { toPng } from "html-to-image";
import { PDFDocument } from "pdf-lib";

import { LogoProject } from "../logo";
import { BUNGA_NPV, type Hasil, type UnitHarga } from "@/lib/simulasi";

export type Jenis = "konsumen" | "management";

// ── Format angka dan tanggal, sebagaimana lembar Excel-nya ────────────────

export const angka = (n: number, desimal = 0) =>
  Math.round(n * 10 ** desimal) / 10 ** desimal === 0 ? "-"
    : n.toLocaleString("id-ID", { minimumFractionDigits: desimal,
                                  maximumFractionDigits: desimal });

/** Angka akuntansi: negatif dalam kurung, nol sebagai tanda pisah. */
const akuntansi = (n: number) => {
  const r = Math.round(n);
  if (r === 0) return "-";
  const s = Math.abs(r).toLocaleString("id-ID");
  return r < 0 ? `(${s})` : s;
};

const persen = (x: number, desimal = 2) =>
  `${(x * 100).toLocaleString("id-ID", { minimumFractionDigits: desimal,
                                         maximumFractionDigits: desimal })}%`;

const BULAN = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"];
const HARI = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
              "Saturday"];

/** "15-Oct-26", seperti format d-mmm-yy di lembarnya. */
export const tglPendek = (d: Date) =>
  `${d.getUTCDate()}-${BULAN[d.getUTCMonth()].slice(0, 3)}-` +
  String(d.getUTCFullYear()).slice(2);

/** "Thursday, 15 October 2026". */
const tglPanjang = (d: Date) =>
  `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ` +
  `${d.getUTCFullYear()}`;

const luas = (n: number | null, desimal: number) =>
  n == null ? "—" : n.toLocaleString("id-ID", { minimumFractionDigits: desimal,
                                                 maximumFractionDigits: 2 });

/** Sel rupiah: "Rp" rata kiri, angkanya rata kanan. */
function Rp({ n, tebal }: { n: number; tebal?: boolean }) {
  const isi = <><span>Rp</span><span>{angka(n)}</span></>;
  return <td className="rp">{tebal ? <b className="rp-isi">{isi}</b>
                                   : <span className="rp-isi">{isi}</span>}</td>;
}

/**
 * Nama cara bayar pada lembar Konsumen.
 *
 * Jadwal yang keluar dari pricelist apa adanya disebut dengan nama kolomnya.
 * Begitu ada yang diubah untuk konsumen ini — diskon, penambahan harga, atau
 * jadwal yang disunting tangan — yang dicetak bukan lagi cara bayar baku itu,
 * melainkan kesepakatan tersendiri, dan diberi nama "Special Payment".
 *
 * Namanya sendiri diringkas menurut permintaan bagian penjualan:
 *
 *   • mengandung KPR (atau KPA) → "Special Payment KPR", berapa pun DP dan
 *     cicilan uang mukanya; yang penting bagi konsumen pelunasannya lewat bank;
 *   • cicilan → "Special Payment Cicilan [n]x", dengan n dihitung dari
 *     jadwal yang benar-benar tercetak: seluruh baris kecuali booking fee,
 *     jadi angsuran terakhir maupun pelunasan ikut terhitung. Jadwal yang
 *     disunting karenanya menyebut angka yang sesuai dengan barisnya, bukan
 *     angka pada nama kolom pricelist yang sudah tidak berlaku lagi;
 *   • selain itu → nama kolomnya sendiri, mis. "Special Payment CASH KERAS".
 */
function caraBayarLembar(h: Hasil, barisTampil: { ket: string }[]): string {
  const khusus = h.diskon > 0 || h.tambahan > 0 || h.jadwalDisunting;
  if (!khusus) return h.skema;
  if (/\b(kpr|kpa)\b/i.test(h.skema)) return "Special Payment KPR";
  if (/cicilan|angsuran|installment|bertahap/i.test(h.skema)) {
    const n = barisTampil.filter((t) => !/booking/i.test(t.ket)).length;
    return `Special Payment Cicilan ${n}x`;
  }
  return `Special Payment ${h.skema}`;
}

// ── Lembar Konsumen ────────────────────────────────────────────────────────

export function LembarKonsumen({ h, unit, slug, nama, booking, bungaKpr, sembunyi }: {
  h: Hasil; unit: UnitHarga; slug: string; nama: string; booking: Date;
  /** Termin yang disembunyikan di layar Simulasi; tetap masuk total. */
  sembunyi?: boolean[];
  /** Bunga KPR setahun, sebagai pecahan — untuk judul blok angsuran. */
  bungaKpr: number;
}) {
  const tampil = h.termin.filter((_, i) => !sembunyi?.[i]);
  return (
    <div className="lembar-sim konsumen">
      <div className="ls-kepala">
        <LogoProject slug={slug} tinggi={46} alt={nama}
                     gantiTeks={nama.toUpperCase()} />
        <div className="ls-sub">Simulasi Hitungan Rumah</div>
      </div>

      <table className="ls-data"><tbody>
        <tr><td>Tanggal</td><td>: {tglPanjang(booking)}</td><td /><td /></tr>
        <tr className="ls-jeda"><td colSpan={4} /></tr>
        <tr><td>Tipe</td><td>: {unit.tipe}</td>
            <td>Luas Tanah</td><td>: {luas(unit.lt, 1)} M²</td></tr>
        <tr><td>Address</td><td>: {unit.alamat}</td>
            <td>Luas Bangunan</td><td>: {luas(unit.lb, 0)} M²</td></tr>
        <tr><td>No. Unit</td><td>: {unit.kode}</td><td /><td /></tr>
        <tr><td>Cara Bayar</td>
            <td>: {caraBayarLembar(h, tampil)}</td><td /><td /></tr>
        <tr><td>Harga Price List{h.skemaHarga !== h.skema && ` (PL ${h.skemaHarga})`}</td>
            <td>: Rp {angka(h.hargaPricelist)}</td><td /><td /></tr>
        {h.tambahan > 0 && (
          <tr><td>Penambahan Harga</td>
              <td>: Rp {angka(h.tambahan)}</td><td /><td /></tr>
        )}
        <tr><td>Diskon</td>
            <td>: Rp {angka(h.diskon)}</td>
            <td className="n">{persen(h.hargaPricelist ? h.diskon / h.hargaPricelist : 0)}</td>
            <td /></tr>
        <tr><td>Harga Transaksi</td>
            <td>: Rp {angka(h.hargaTransaksi)}</td><td /><td /></tr>
      </tbody></table>

      <table className="ls-tabel"><tbody>
        <tr>
          <th>No.</th><th>Keterangan</th><th>Jatuh Tempo</th>
          <th>Jumlah</th><th>Tagihan (DTP)</th><th>DTP (PPN)</th>
        </tr>
        {tampil.map((t, i) => (
          <tr key={i}>
            <td className="c">{i + 1}</td>
            <td>{t.ket}</td>
            <td className="c">{tglPendek(t.tgl)}</td>
            <Rp n={t.nilai} /><Rp n={t.tagihan} /><Rp n={t.dtp} />
          </tr>
        ))}
        <tr className="ls-total">
          <td colSpan={3} className="n"><b>TOTAL</b></td>
          <Rp n={h.jumlahNilai} tebal /><Rp n={h.jumlahTagihan} tebal />
          <Rp n={h.jumlahDtp} tebal />
        </tr>
      </tbody></table>

      {/* Hanya untuk cara bayar yang dilunasi bank: angsuran per bulan atas
          tagihan pelunasan KPR, pada tenor 5–25 tahun. */}
      {h.angsuran.length > 0 && (
        <table className="ls-kpr"><tbody>
          {h.angsuran.map((a, i) => (
            <tr key={a.tahun}>
              <td>{i === 0 ? `Simulasi KPR Bunga ${persen(bungaKpr)}` : ""}</td>
              <td className="n">{a.tahun} Tahun</td>
              <td>:</td>
              <td>Rp</td>
              <td className="n">{angka(a.perBulan)}</td>
              <td>per bulan</td>
            </tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
}

// ── Lembar Management ──────────────────────────────────────────────────────

export function LembarManagement({ h, cash, unit, slug, nama, sembunyi }: {
  h: Hasil; cash: Hasil; unit: UnitHarga; slug: string; nama: string;
  /** Termin sisi PERMINTAAN yang disembunyikan; tetap masuk total. */
  sembunyi?: boolean[];
}) {
  const kluster = nama.toUpperCase();
  const selisih = (a: number, b: number) => b ? (a - b) / b : 0;

  /** Baris identitas di atas tiap sisi. */
  const Identitas = ({ label }: { label: string }) => (
    <table className="lm-id"><tbody>
      <tr><td>Cluster</td><td>: <b>{kluster}</b></td>
          <td className="lm-label">{label}</td></tr>
      <tr><td>Unit</td><td>: <b>{unit.kode}</b></td><td /></tr>
      <tr><td>Tipe</td><td>: <b>{unit.tipe}</b></td><td /></tr>
    </tbody></table>
  );

  return (
    <div className="lembar-sim management">
      {/* Logo project di pojok kiri atas, sama dengan lembar Konsumen. Nama
          project tidak ditulis lagi di bawahnya: logo sudah menyebutnya, dan
          tanpa berkas logo namanya yang ditulis di tempat itu. */}
      <div className="lm-logo">
        <LogoProject slug={slug} tinggi={40} alt={nama} gantiTeks={kluster} />
      </div>

      <div className="lm-dua">
        {/* ── Kiri: pembanding — cara bayar yang sama, tanpa diskon, jadwal
            standar. ── */}
        <div className="lm-sisi kiri">
          <Identitas label={cash.skema} />
          <table className="lm-luas"><tbody>
            <tr><td rowSpan={2} className="c"><b>LUAS :</b></td>
                <td className="n">{luas(unit.lt, 2)}</td><td><b>M² (Tanah)</b></td></tr>
            <tr><td className="n">{luas(unit.lb, 2)}</td><td><b>M² (Bangunan)</b></td></tr>
          </tbody></table>
          <table className="lm-harga"><tbody>
            <tr><td>HARGA PRICE LIST</td><td /><td className="n"><b>{angka(cash.hargaPricelist)}</b></td></tr>
            <tr><td>&nbsp;</td><td /><td /></tr>
            <tr><td>&nbsp;</td><td /><td /></tr>
            <tr><td>&nbsp;</td><td /><td /></tr>
            <tr><td>&nbsp;</td><td /><td /></tr>
            <tr><td>INTEREST RATE</td><td /><td className="n">{persen(BUNGA_NPV, 0)}</td></tr>
          </tbody></table>
          <table className="lm-jadwal"><tbody>
            <tr><th>Keterangan</th><th>Hari</th><th>Tgl</th><th>VALUE</th><th>PV</th></tr>
            <tr className="lm-kosong"><td /><td /><td /><td /><td /></tr>
            {cash.termin.map((t, i) => (
              <tr key={i}>
                <td>{t.ket.toUpperCase()}</td>
                <td className="c">{t.hari || "-"}</td>
                <td className="c">{tglPendek(t.tgl)}</td>
                <td className="n">{angka(t.nilai)}</td>
                <td className="n">{angka(t.pv)}</td>
              </tr>
            ))}
            <tr className="lm-kosong"><td /><td /><td /><td /><td /></tr>
          </tbody></table>
          <table className="lm-jumlah"><tbody>
            <tr><td /><td className="n kotak"><b>{angka(cash.jumlahNilai)}</b></td>
                <td className="n kotak"><b>{angka(cash.jumlahPv)}</b></td></tr>
            <tr><td /><td className="n">{akuntansi(cash.jumlahNilai - cash.hargaTransaksi)}</td>
                <td className="n"><b>{persen(cash.rasioPv)}</b></td></tr>
          </tbody></table>
        </div>

        {/* ── Kanan: cara bayar yang diminta ── */}
        <div className="lm-sisi kanan">
          <Identitas label="PERMINTAAN" />
          <table className="lm-dtp"><tbody>
            <tr>
              <td>PPN DTP</td>
              <td>: <b>{persen(h.tarifDtp, 0)}</b> Rp</td>
              <td className="n">{angka(h.dasarDtp)}</td>
              <td className="biru">Rp</td>
              <td className="n biru">{angka(h.totalDtp)}</td>
            </tr>
          </tbody></table>
          <table className="lm-harga"><tbody>
            <tr><td>HARGA PRICE LIST{h.skemaHarga !== h.skema && ` (PL ${h.skemaHarga})`}</td>
                <td /><td className="n"><b>{angka(h.hargaPricelist)}</b></td></tr>
            {h.tambahan > 0 && (
              <tr><td>PENAMBAHAN HARGA</td>
                  <td /><td className="n">{angka(h.tambahan)}</td></tr>
            )}
            <tr><td>DISKON</td>
                <td className="n">{persen(h.hargaPricelist ? h.diskon / h.hargaPricelist : 0)}</td>
                <td className="n">{angka(h.diskon)}</td></tr>
            <tr><td>&nbsp;</td><td /><td /></tr>
            <tr><td>HARGA TRANSAKSI</td><td /><td className="n"><b>{angka(h.hargaTransaksi)}</b></td></tr>
            <tr><td>&nbsp;</td><td /><td /></tr>
            <tr><td>INTEREST RATE</td><td /><td className="n">{persen(BUNGA_NPV, 0)}</td></tr>
          </tbody></table>
          <table className="lm-jadwal"><tbody>
            <tr><th>Keterangan</th><th>Hari</th><th>Tgl</th><th>Nilai (VALUE)</th>
                <th>PV</th><th>Tagihan (DTP)</th><th>DTP (PPN)</th></tr>
            <tr className="lm-kosong"><td /><td /><td /><td /><td /><td /><td /></tr>
            {h.termin.filter((_, i) => !sembunyi?.[i]).map((t, i) => (
              <tr key={i}>
                <td>{t.ket.toUpperCase()}</td>
                <td className="c">{t.hari || "-"}</td>
                <td className="c">{tglPendek(t.tgl)}</td>
                <td className="n">{angka(t.nilai)}</td>
                <td className="n">{angka(t.pv)}</td>
                <td className="n">{angka(t.tagihan)}</td>
                <td className="n">{angka(t.dtp)}</td>
              </tr>
            ))}
            <tr className="lm-kosong"><td /><td /><td /><td /><td /><td /><td /></tr>
          </tbody></table>
          <table className="lm-jumlah kanan"><tbody>
            <tr><td /><td className="n kotak"><b>{angka(h.jumlahNilai)}</b></td>
                <td className="n kotak"><b>{angka(h.jumlahPv)}</b></td>
                <td className="n kotak"><b>{angka(h.jumlahTagihan)}</b></td>
                <td className="n kotak"><b>{angka(h.jumlahDtp)}</b></td></tr>
            <tr><td /><td className="n">{persen(selisih(h.jumlahNilai, cash.jumlahNilai))}</td>
                <td className="n">{persen(selisih(h.jumlahPv, cash.jumlahPv))}</td>
                <td className="n">{persen(selisih(h.jumlahTagihan, cash.jumlahNilai))}</td>
                <td /></tr>
            <tr className="lm-banding">
              <td className="n"><b>Perbandingan terhadap {cash.skema}</b></td>
              <td className="n kotak">{akuntansi(h.jumlahNilai - cash.jumlahNilai)}</td>
              <td className="n kotak">{akuntansi(h.jumlahPv - cash.jumlahPv)}</td>
              <td className="n kotak">{akuntansi(h.jumlahTagihan - cash.jumlahNilai)}</td>
              <td />
            </tr>
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

// ── PDF ────────────────────────────────────────────────────────────────────

/**
 * Susun satu lembar menjadi PDF A4 satu halaman — tegak untuk Konsumen,
 * melintang untuk Management — dan serahkan kepada peramban untuk diunduh.
 *
 * Lembarnya dipotret sebagai gambar beresolusi tinggi lalu diletakkan pada
 * halaman PDF, dikecilkan seperlunya agar muat dengan margin 10 mm. Bukan
 * disusun ulang huruf demi huruf: dengan begitu PDF-nya tidak dapat berbeda
 * dari pratinjau maupun cetakannya.
 */
export async function unduhPdf(el: HTMLElement, jenis: Jenis, namaBerkas: string) {
  // Lambang project harus sudah termuat; tanpa itu potretnya kosong di atas.
  await Promise.all([...el.querySelectorAll("img")].map((img) =>
    img.complete ? null : new Promise((ok) => {
      img.addEventListener("load", ok, { once: true });
      img.addEventListener("error", ok, { once: true });
    })));
  if (document.fonts?.ready) await document.fonts.ready;

  // Margin dan bayangan lembar hanya untuk tampilan di layar. Ikut terpotret,
  // margin "auto" yang menengahkan lembar menggeser isinya ke kanan dan
  // memotong tepinya.
  const png = await toPng(el, {
    pixelRatio: 3, backgroundColor: "#ffffff", cacheBust: true,
    width: el.offsetWidth, height: el.offsetHeight,
    style: { margin: "0", boxShadow: "none" },
  });
  const pdf = await PDFDocument.create();
  const [lebar, tinggi] = jenis === "management" ? [841.89, 595.28] : [595.28, 841.89];
  const margin = 28.35;                                  // 10 mm
  const page = pdf.addPage([lebar, tinggi]);
  const img = await pdf.embedPng(png);
  const skala = Math.min((lebar - 2 * margin) / img.width,
                         (tinggi - 2 * margin) / img.height);
  const w = img.width * skala, h = img.height * skala;
  page.drawImage(img, { x: (lebar - w) / 2, y: tinggi - margin - h, width: w, height: h });
  pdf.setTitle(namaBerkas.replace(/\.pdf$/i, ""));

  const blob = new Blob([await pdf.save() as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = namaBerkas;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nama berkas PDF, mis. "Simulasi NS-NR1-01 CASH KERAS - Konsumen.pdf". */
export const namaPdf = (kode: string, skema: string, jenis: Jenis) =>
  `Simulasi ${kode} ${skema} - ${jenis === "konsumen" ? "Konsumen" : "Management"}.pdf`
    .replace(/[\\/:*?"<>|]/g, "-");

// ── Jadwal suntingan, dibawa lewat alamat ke halaman pratinjau ─────────────

/** Satu baris jadwal suntingan: keterangan, tanggal YYYY-MM-DD, nilai, tersembunyi. */
export type BarisSunting = { ket: string; tgl: string; nilai: number; sembunyi: boolean };

export const kodeJadwal = (b: BarisSunting[]) =>
  JSON.stringify(b.map((x) => [x.ket, x.tgl, x.nilai, x.sembunyi ? 1 : 0]));

export function bacaJadwal(teks: string | null): BarisSunting[] | null {
  if (!teks) return null;
  try {
    const a = JSON.parse(teks);
    if (!Array.isArray(a) || !a.length) return null;
    return a.map((x: any) => ({ ket: String(x[0] ?? ""), tgl: String(x[1] ?? ""),
                                nilai: Number(x[2]) || 0, sembunyi: x[3] === 1 }));
  } catch { return null; }
}

/** "2026-10-15" sebagai tengah malam UTC; kosong atau keliru jatuh pada `cadangan`. */
export function tanggalIso(s: string, cadangan: Date): Date {
  const [th, bl, tg] = s.split("-").map(Number);
  return th && bl && tg ? new Date(Date.UTC(th, bl - 1, tg)) : cadangan;
}

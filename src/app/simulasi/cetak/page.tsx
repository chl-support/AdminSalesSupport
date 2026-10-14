"use client";

/**
 * Pratinjau & cetak Simulasi / NPV, dalam dua bentuk lembar:
 *
 *   - Konsumen: "Simulasi Hitungan Rumah" — data unit, harga, dan jadwal
 *     pembayaran beserta tagihan setelah PPN DTP. Tanpa nilai sekarang:
 *     yang dibaca konsumen adalah berapa dan kapan ia membayar.
 *   - Management: lembar NPV berdampingan — Cash Keras di kiri sebagai
 *     pembanding, cara bayar yang diminta di kanan — lengkap dengan PV,
 *     PPN DTP, dan selisihnya terhadap Cash Keras.
 *
 * Bentuk keduanya disalin dari lembar cetak berkas Simulation TOP,
 * termasuk tanggal berbahasa Inggris dan format rupiah akuntansinya, supaya
 * yang dicetak dari sini sama dengan yang selama ini diterima orang.
 *
 * Dibuka di tab tersendiri dari layar Simulasi / NPV; masukannya dibawa lewat
 * alamat. Angkanya dihitung dengan hitung() yang sama dengan layarnya, jadi
 * yang tercetak tidak dapat berbeda dari yang terlihat di sana.
 *
 * Tidak memakai useSearchParams — pada Next.js 16 ia menuntut Suspense dan
 * menggagalkan prerender statis (lihat juga klaim/pratinjau).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useKata } from "../../bahasa";
import { MemeriksaSesi } from "../../kerangka";
import { LogoProject } from "../../logo";
import { useSesi } from "../../session";
import { BUNGA_NPV, bentukSkema, hitung, type Hasil, type UnitHarga }
  from "@/lib/simulasi";

const KATA = {
  id: {
    konsumen: "Konsumen", management: "Management",
    cetak: "Cetak", tutup: "Tutup",
    memuat: "Memuat simulasi…",
    takAda: "Unit atau cara bayar ini tidak ada di pricelist yang berlaku.",
    catatan: "Lembar dicetak pada kertas A4; Konsumen tegak, Management melintang.",
  },
  en: {
    konsumen: "Customer", management: "Management",
    cetak: "Print", tutup: "Close",
    memuat: "Loading simulation…",
    takAda: "This unit or payment scheme is not in the price list in force.",
    catatan: "Printed on A4; Customer in portrait, Management in landscape.",
  },
};

type Jenis = "konsumen" | "management";
type Masukan = {
  jenis: Jenis; kode: string; skema: string; tanggal: string;
  diskon: number; bunga: number;
};

// ── Format angka dan tanggal, sebagaimana lembar Excel-nya ────────────────

const angka = (n: number, desimal = 0) =>
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
const tglPendek = (d: Date) =>
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

// ── Lembar Konsumen ────────────────────────────────────────────────────────

function LembarKonsumen({ h, unit, slug, nama, booking }: {
  h: Hasil; unit: UnitHarga; slug: string; nama: string; booking: Date;
}) {
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
        <tr><td>Cara Bayar</td><td>: {h.skema}</td><td /><td /></tr>
        <tr><td>Harga Price List</td>
            <td>: Rp {angka(h.hargaPricelist)}</td><td /><td /></tr>
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
        {h.termin.map((t, i) => (
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
    </div>
  );
}

// ── Lembar Management ──────────────────────────────────────────────────────

function LembarManagement({ h, cash, unit, nama }: {
  h: Hasil; cash: Hasil; unit: UnitHarga; nama: string;
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
      <h1 className="lm-judul">{kluster}</h1>

      <div className="lm-dua">
        {/* ── Kiri: Cash Keras, pembanding ── */}
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
            <tr><td>HARGA PRICE LIST</td><td /><td className="n"><b>{angka(h.hargaPricelist)}</b></td></tr>
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
            {h.termin.map((t, i) => (
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
              <td className="n"><b>Perbandingan terhadap Cash Keras</b></td>
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

// ── Halaman ────────────────────────────────────────────────────────────────

export default function CetakSimulasiPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);

  const [m, setM] = useState<Masukan | null>(null);
  const [unit, setUnit] = useState<UnitHarga | null | undefined>(undefined);
  const [skemaPl, setSkemaPl] = useState<string[]>([]);
  const [galat, setGalat] = useState<string | null>(null);

  // Masukan dibaca dari alamat setelah terpasang.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const num = (s: string | null, awal: number) => {
      const n = Number(String(s ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : awal;
    };
    setM({
      jenis: q.get("jenis") === "management" ? "management" : "konsumen",
      kode: q.get("kode") ?? "", skema: q.get("skema") ?? "",
      tanggal: q.get("tanggal") ?? "",
      diskon: num(q.get("diskon"), 0), bunga: num(q.get("bunga"), 4.65),
    });
  }, []);

  useEffect(() => {
    if (!sesi || !m) return;
    (async () => {
      const res = await fetch("/api/pricelist");
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setSkemaPl(b.berlaku?.skema ?? []);
      setUnit((b.berlaku?.unit ?? []).find((u: UnitHarga) => u.kode === m.kode) ?? null);
    })();
  }, [sesi, m]);

  const booking = useMemo(() => {
    const [th, bl, tg] = (m?.tanggal ?? "").split("-").map(Number);
    return th ? new Date(Date.UTC(th, (bl || 1) - 1, tg || 1)) : new Date();
  }, [m]);

  // Satu lembar, satu halaman. Cicilan 30x menghasilkan tiga puluh baris
  // lebih, dan lembar Management melintang tidak lagi muat pada A4. Tinggi
  // lembarnya diukur, lalu dikecilkan seperlunya saat dicetak — "Fit Sheet
  // on One Page" dari Excel, dikerjakan dari sini seperti rekap Overriding.
  const lembarRef = useRef<HTMLDivElement | null>(null);
  const [muat, setMuat] = useState(1);
  const tunai = skemaPl.find((s) => bentukSkema(s)?.jenis === "cash") ?? "";

  const hasil = useMemo(() => {
    if (!m || !unit || !(unit.harga[m.skema] > 0)) return null;
    return hitung({ unit, skema: m.skema, diskon: m.diskon / 100,
                    bungaKpr: m.bunga / 100, tanggal: booking });
  }, [m, unit, booking]);

  // Sisi kiri lembar Management: Cash Keras pada harga pricelist-nya, tanpa
  // diskon — begitulah lembar pembandingnya di berkas Excel.
  const cash = useMemo(() => {
    if (!unit || !(unit.harga[tunai] > 0)) return null;
    return hitung({ unit, skema: tunai, diskon: 0,
                    bungaKpr: (m?.bunga ?? 0) / 100, tanggal: booking });
  }, [unit, tunai, m, booking]);

  const jenis = m?.jenis ?? "konsumen";

  useLayoutEffect(() => {
    const el = lembarRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    // Tinggi halaman dikurangi margin 10 mm atas-bawah, dalam px CSS.
    const mm = 96 / 25.4;
    const tersedia = (jenis === "management" ? 190 : 277) * mm * 0.98;
    setMuat(Math.min(1, tersedia / el.offsetHeight));
  });

  if (memuat || !sesi) return <MemeriksaSesi />;

  const gantiJenis = (j: Jenis) => {
    if (!m) return;
    const q = new URLSearchParams(location.search);
    q.set("jenis", j);
    history.replaceState(null, "", `?${q}`);
    setM({ ...m, jenis: j });
  };
  const nama = sesi.project_name ?? "";

  return (
    <div className="cetak-sim">
      {/* Arah kertas mengikuti lembarnya: Management melebar ke samping. */}
      <style>{`@page { size: A4 ${jenis === "management" ? "landscape" : "portrait"};
                       margin: 10mm; }`}</style>

      <div className="cetak-sim-alat jangan-cetak">
        <div className="row" style={{ margin: 0 }}>
          <button className={jenis === "konsumen" ? "pri" : undefined}
                  onClick={() => gantiJenis("konsumen")}>{k.konsumen}</button>
          <button className={jenis === "management" ? "pri" : undefined}
                  onClick={() => gantiJenis("management")}>{k.management}</button>
        </div>
        <span className="hint" style={{ margin: 0 }}>{k.catatan}</span>
        <div className="row" style={{ margin: 0 }}>
          <button className="pri" disabled={!hasil}
                  onClick={() => window.print()}>{k.cetak}</button>
          <button onClick={() => window.close()}>{k.tutup}</button>
        </div>
      </div>

      <div ref={lembarRef} className="muat-halaman"
           style={{ ["--muat" as any]: muat }}>
      {galat ? <div className="banner stop">{galat}</div>
        : unit === undefined ? <p className="hint">{k.memuat}</p>
        : !hasil || (jenis === "management" && !cash)
          ? <div className="banner stop">{k.takAda}</div>
        : jenis === "konsumen"
          ? <LembarKonsumen h={hasil} unit={unit!} slug={sesi.project_slug ?? ""}
                            nama={nama} booking={booking} />
          : <LembarManagement h={hasil} cash={cash!} unit={unit!} nama={nama} />}
      </div>
    </div>
  );
}

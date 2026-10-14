"use client";

/**
 * Simulasi / NPV — salinan berkas "Simulation TOP Naraya" sebagai layar.
 *
 * Empat masukan di atas, dan seluruh sisanya turunan: harga tiap cara bayar,
 * jadwal pembayaran beserta PPN yang ditanggung pemerintah, nilai sekarang
 * arus kasnya, dan — bagi cara bayar yang berujung di bank — angsuran per
 * tenor. Perhitungannya duduk di src/lib/simulasi.ts; layar ini hanya
 * menyusunnya.
 *
 * Tanggal booking dapat diubah, tidak dipatok hari ini. Simulasi dibuat
 * sebelum konsumen datang, dan jadwal yang dihitung untuk hari ini akan
 * meleset sehari-dua begitu dicetak esok paginya.
 */

import { useMemo, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { formatRupiah } from "@/lib/money";
import { PRICELIST, SKEMA, unitHarga, type Skema } from "@/lib/pricelist-naraya";
import { BUNGA_NPV, hitung, lewatKpr } from "@/lib/simulasi";

const KATA = {
  id: {
    judul: "Simulasi / NPV",
    fTanggal: "Tanggal Booking",
    fUnit: "No. Unit",
    fSkema: "Cara Bayar",
    fDiskon: "Diskon (%)",
    fBunga: "Bunga KPR (%)",
    rTipe: "Tipe", rLt: "Luas Tanah", rLb: "Luas Bangunan",
    rPricelist: "Harga Price List", rDiskon: "Diskon",
    rTransaksi: "Harga Transaksi",
    hargaSemua: "Harga per Cara Bayar",
    kSkema: "Cara Bayar", kHarga: "Harga",
    jadwal: "Jadwal Pembayaran",
    kNo: "No.", kKet: "Keterangan", kTempo: "Jatuh Tempo", kHari: "Hari",
    kJumlah: "Jumlah", kPv: "Nilai Sekarang", kDtp: "DTP (PPN)",
    kTagihan: "Tagihan (DTP)",
    total: "TOTAL",
    npv: "Nilai Sekarang (NPV)",
    nBunga: "Bunga diskonto",
    nNominal: "Jumlah nominal",
    nPv: "Jumlah nilai sekarang",
    nRasio: "Nilai sekarang terhadap nominal",
    nSelisih: "Selisih terhadap nominal",
    dtpJudul: "PPN Ditanggung Pemerintah",
    dTarif: "Tarif yang berlaku",
    dDasar: "Dasar pengenaan",
    dPagu: "Pagu DTP",
    dTerpakai: "DTP terpakai",
    dLuar: "Jatuh tempo terakhir di luar periode DTP — tidak ada DTP.",
    banding: "Perbandingan terhadap Cash Keras",
    bNominal: "Selisih nominal",
    bPv: "Selisih nilai sekarang",
    bSama: "Cara bayar ini memang Cash Keras.",
    angsuran: "Simulasi Angsuran KPR",
    aTenor: "Tenor", aTahun: (n: number) => `${n} tahun`,
    aPerBulan: "Angsuran per bulan",
    aPokok: "Dihitung atas pokok",
    takAda: "Unit ini tidak ada di pricelist.",
  },
  en: {
    judul: "Simulation / NPV",
    fTanggal: "Booking Date",
    fUnit: "Unit No.",
    fSkema: "Payment Scheme",
    fDiskon: "Discount (%)",
    fBunga: "Mortgage Rate (%)",
    rTipe: "Type", rLt: "Land Area", rLb: "Building Area",
    rPricelist: "List Price", rDiskon: "Discount",
    rTransaksi: "Transaction Price",
    hargaSemua: "Price per Payment Scheme",
    kSkema: "Payment Scheme", kHarga: "Price",
    jadwal: "Payment Schedule",
    kNo: "No.", kKet: "Description", kTempo: "Due Date", kHari: "Days",
    kJumlah: "Amount", kPv: "Present Value", kDtp: "VAT Borne by Govt",
    kTagihan: "Billed (net of VAT)",
    total: "TOTAL",
    npv: "Net Present Value",
    nBunga: "Discount rate",
    nNominal: "Nominal total",
    nPv: "Present value total",
    nRasio: "Present value against nominal",
    nSelisih: "Difference against nominal",
    dtpJudul: "VAT Borne by Government",
    dTarif: "Applicable rate",
    dDasar: "Taxable base",
    dPagu: "Ceiling",
    dTerpakai: "Used",
    dLuar: "The final due date falls outside the programme period — no relief.",
    banding: "Compared with Cash Keras",
    bNominal: "Nominal difference",
    bPv: "Present value difference",
    bSama: "This scheme is Cash Keras.",
    angsuran: "Mortgage Instalment Simulation",
    aTenor: "Tenor", aTahun: (n: number) => `${n} years`,
    aPerBulan: "Monthly instalment",
    aPokok: "Computed on principal",
    takAda: "This unit is not in the price list.",
  },
};

/** Hari ini sebagai YYYY-MM-DD, untuk nilai awal kotak tanggalnya. */
const hariIni = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const persen = (n: number, desimal = 2) =>
  `${(n * 100).toLocaleString("id-ID", { minimumFractionDigits: desimal,
                                         maximumFractionDigits: desimal })}%`;

export default function SimulasiPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();

  const [tanggal, setTanggal] = useState(hariIni);
  const [kode, setKode] = useState(PRICELIST[0]?.kode ?? "");
  const [skema, setSkema] = useState<Skema>("CASH KERAS");
  const [diskon, setDiskon] = useState("0");
  const [bunga, setBunga] = useState("4.65");

  const unit = unitHarga(kode);
  // Tanggalnya dibaca sebagai tengah malam UTC, bukan waktu setempat: selisih
  // hari pada jadwal harus bulat, dan tanggal yang lahir di zona waktu lain
  // menggeser seluruh jadwal setengah hari.
  const booking = useMemo(() => {
    const [th, bl, tg] = tanggal.split("-").map(Number);
    return new Date(Date.UTC(th || 1970, (bl || 1) - 1, tg || 1));
  }, [tanggal]);

  const angka = (s: string) => {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const hasil = useMemo(() => unit && hitung({
    unit, skema, diskon: angka(diskon) / 100,
    bungaKpr: angka(bunga) / 100, tanggal: booking,
  }), [unit, skema, diskon, bunga, booking]);

  // Pembanding tetap Cash Keras, cara bayar yang paling ringkas jadwalnya dan
  // karena itu paling tinggi nilai sekarangnya — di situlah selisih cara bayar
  // lain terbaca sebagai biaya menunggu.
  const dasar = useMemo(() => unit && hitung({
    unit, skema: "CASH KERAS", diskon: angka(diskon) / 100,
    bungaKpr: angka(bunga) / 100, tanggal: booking,
  }), [unit, diskon, bunga, booking]);

  if (memuat || !sesi) return <MemeriksaSesi />;

  const tglTeks = (d: Date) =>
    d.toLocaleDateString(bahasa === "id" ? "id-ID" : "en-GB",
                         { day: "numeric", month: "short", year: "numeric",
                           timeZone: "UTC" });

  return (
    <Kerangka sesi={sesi} lebar judul={<div><h1>{k.judul}</h1></div>}>

      <div className="panel sp">
        <div className="filters">
          <div>
            <div className="lbl">{k.fTanggal}</div>
            <input type="date" value={tanggal}
                   onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div>
            <div className="lbl">{k.fUnit}</div>
            <select value={kode} onChange={(e) => setKode(e.target.value)}>
              {PRICELIST.map((u) => (
                <option key={u.kode} value={u.kode}>
                  {u.kode} — {u.alamat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="lbl">{k.fSkema}</div>
            <select value={skema}
                    onChange={(e) => setSkema(e.target.value as Skema)}>
              {SKEMA.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div className="lbl">{k.fDiskon}</div>
            <input value={diskon} inputMode="decimal"
                   onChange={(e) => setDiskon(e.target.value)} />
          </div>
          <div>
            <div className="lbl">{k.fBunga}</div>
            <input value={bunga} inputMode="decimal"
                   onChange={(e) => setBunga(e.target.value)} />
          </div>
        </div>
      </div>

      {!unit || !hasil || !dasar ? (
        <div className="banner stop">{k.takAda}</div>
      ) : (
        <>
          <div className="dua-kolom sp">
            <div className="panel">
              <h2>{unit.kode}</h2>
              <table className="tabel-ringkas"><tbody>
                <tr><td>{k.rTipe}</td><td className="n">{unit.tipe}</td></tr>
                <tr><td>{k.rLt}</td>
                    <td className="n">{unit.lt.toLocaleString("id-ID")} m²</td></tr>
                <tr><td>{k.rLb}</td>
                    <td className="n">{unit.lb.toLocaleString("id-ID")} m²</td></tr>
                <tr><td>{k.rPricelist}</td>
                    <td className="n">{formatRupiah(hasil.hargaPricelist)}</td></tr>
                <tr><td>{k.rDiskon}</td>
                    <td className="n">{formatRupiah(hasil.diskon)}</td></tr>
                <tr><td><b>{k.rTransaksi}</b></td>
                    <td className="n"><b>{formatRupiah(hasil.hargaTransaksi)}</b></td></tr>
              </tbody></table>
            </div>

            <div className="panel">
              <h2>{k.hargaSemua}</h2>
              <table className="tabel-ringkas"><tbody>
                <tr><th>{k.kSkema}</th><th>{k.kHarga}</th></tr>
                {SKEMA.map((s) => (
                  <tr key={s} className={s === skema ? "terpilih" : undefined}>
                    <td>{s}</td>
                    <td className="n">{formatRupiah(unit.harga[s])}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </div>

          <div className="panel sp">
            <h2>{k.jadwal}<span className="pill">{skema}</span></h2>
            <div className="tscroll">
              <table className="tabel-jadwal"><tbody>
                <tr>
                  <th style={{ width: 44 }}>{k.kNo}</th>
                  <th style={{ width: 170 }}>{k.kKet}</th>
                  <th style={{ width: 118 }}>{k.kTempo}</th>
                  <th style={{ width: 62 }}>{k.kHari}</th>
                  <th>{k.kJumlah}</th>
                  <th>{k.kPv}</th>
                  <th>{k.kDtp}</th>
                  <th>{k.kTagihan}</th>
                </tr>
                {hasil.termin.map((t, i) => (
                  <tr key={i}>
                    <td className="n">{i + 1}</td>
                    <td>{t.ket}</td>
                    <td>{tglTeks(t.tgl)}</td>
                    <td className="n">{t.hari}</td>
                    <td className="n">{formatRupiah(Math.round(t.nilai))}</td>
                    <td className="n">{formatRupiah(Math.round(t.pv))}</td>
                    <td className="n">{formatRupiah(t.dtp)}</td>
                    <td className="n">{formatRupiah(Math.round(t.tagihan))}</td>
                  </tr>
                ))}
                <tr className="baris-total">
                  <td colSpan={4}>{k.total}</td>
                  <td className="n">{formatRupiah(Math.round(hasil.jumlahNilai))}</td>
                  <td className="n">{formatRupiah(Math.round(hasil.jumlahPv))}</td>
                  <td className="n">{formatRupiah(hasil.jumlahDtp)}</td>
                  <td className="n">{formatRupiah(Math.round(hasil.jumlahTagihan))}</td>
                </tr>
              </tbody></table>
            </div>
          </div>

          <div className="dua-kolom sp">
            <div className="panel">
              <h2>{k.npv}</h2>
              <table className="tabel-ringkas"><tbody>
                <tr><td>{k.nBunga}</td>
                    <td className="n">{persen(BUNGA_NPV, 0)}</td></tr>
                <tr><td>{k.nNominal}</td>
                    <td className="n">{formatRupiah(Math.round(hasil.jumlahNilai))}</td></tr>
                <tr><td><b>{k.nPv}</b></td>
                    <td className="n"><b>{formatRupiah(Math.round(hasil.jumlahPv))}</b></td></tr>
                <tr><td>{k.nRasio}</td>
                    <td className="n">{persen(hasil.rasioPv)}</td></tr>
                <tr><td>{k.nSelisih}</td>
                    <td className="n">
                      {formatRupiah(Math.round(hasil.jumlahPv - hasil.jumlahNilai))}
                    </td></tr>
              </tbody></table>
            </div>

            <div className="panel">
              <h2>{k.dtpJudul}</h2>
              {hasil.tarifDtp === 0 ? (
                <p className="hint" style={{ textAlign: "left" }}>{k.dLuar}</p>
              ) : (
                <table className="tabel-ringkas"><tbody>
                  <tr><td>{k.dTarif}</td>
                      <td className="n">{persen(hasil.tarifDtp, 0)}</td></tr>
                  <tr><td>{k.dDasar}</td>
                      <td className="n">{formatRupiah(Math.round(hasil.dasarDtp))}</td></tr>
                  <tr><td>{k.dPagu}</td>
                      <td className="n">{formatRupiah(hasil.totalDtp)}</td></tr>
                  <tr><td><b>{k.dTerpakai}</b></td>
                      <td className="n"><b>{formatRupiah(hasil.jumlahDtp)}</b></td></tr>
                </tbody></table>
              )}
            </div>
          </div>

          <div className="dua-kolom">
            <div className="panel">
              <h2>{k.banding}</h2>
              {skema === "CASH KERAS" ? (
                <p className="hint" style={{ textAlign: "left" }}>{k.bSama}</p>
              ) : (
                <table className="tabel-ringkas"><tbody>
                  <tr><td>{k.bNominal}</td>
                      <td className="n">
                        {formatRupiah(Math.round(hasil.jumlahNilai - dasar.jumlahNilai))}
                      </td></tr>
                  <tr><td>{k.bPv}</td>
                      <td className="n">
                        {formatRupiah(Math.round(hasil.jumlahPv - dasar.jumlahPv))}
                      </td></tr>
                </tbody></table>
              )}
            </div>

            {lewatKpr(skema) && hasil.angsuran.length > 0 && (
              <div className="panel">
                <h2>{k.angsuran}</h2>
                <table className="tabel-ringkas"><tbody>
                  <tr><th>{k.aTenor}</th><th>{k.aPerBulan}</th></tr>
                  {hasil.angsuran.map((a) => (
                    <tr key={a.tahun}>
                      <td>{k.aTahun(a.tahun)}</td>
                      <td className="n">{formatRupiah(Math.round(a.perBulan))}</td>
                    </tr>
                  ))}
                </tbody></table>
                <p className="hint" style={{ textAlign: "left" }}>
                  {k.aPokok}{" "}
                  {formatRupiah(Math.round(
                    hasil.termin.find((t) => t.ket.startsWith("Pelunasan"))?.tagihan ?? 0))}
                  {" · "}{persen(angka(bunga) / 100)}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </Kerangka>
  );
}

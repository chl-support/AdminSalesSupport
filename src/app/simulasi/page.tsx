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
 * Unit dan cara bayarnya diambil dari pricelist yang berlaku untuk project
 * yang sedang dipilih. Pricelist itu diunggah di layar ini juga, lewat panel
 * Upload D-Pricelist di bagian atas (Admin Sales dan Admin IT).
 *
 * Tanggal booking dapat diubah, tidak dipatok hari ini. Simulasi dibuat
 * sebelum konsumen datang, dan jadwal yang dihitung untuk hari ini akan
 * meleset sehari-dua begitu dicetak esok paginya.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { PENGUNGGAH, UnggahPricelist } from "./unggah-pricelist";
import { LembarKonsumen, LembarManagement, namaPdf, unduhPdf, type Jenis }
  from "./lembar-cetak";
import { formatRupiah } from "@/lib/money";
import { BUNGA_NPV, bentukSkema, hitung, lewatKpr, type Skema,
         type UnitHarga } from "@/lib/simulasi";

type Pricelist = { nama: string; skema: Skema[]; unit: UnitHarga[] };

const KATA = {
  id: {
    judul: "Simulasi / NPV",
    fTanggal: "Tanggal Booking",
    fUnit: "No. Unit",
    fSkema: "Cara Bayar",
    fDiskon: "Diskon (%)",
    fBunga: "Bunga KPR (%)",
    cetakKonsumen: "Preview & Print Out — Konsumen",
    cetakManagement: "Preview & Print Out — Management",
    unduhKonsumen: "Unduh PDF — Konsumen",
    unduhManagement: "Unduh PDF — Management",
    menyusun: "Menyusun PDF…",
    gagalPdf: "PDF tidak dapat disusun. Coba lagi, atau pakai Preview & Print Out lalu Simpan sebagai PDF.",
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
    takAdaHarga: "Unit ini tidak punya harga untuk cara bayar tersebut.",
    belumAda: "Project ini belum punya pricelist. Unggah berkasnya lewat " +
              "panel Upload D-Pricelist di atas.",
    belumAdaBaca: "Project ini belum punya pricelist. Admin Sales atau Admin " +
                  "IT dapat mengunggahnya di layar ini.",
    memuatPl: "Memuat pricelist…",
    sumber: "Pricelist",
  },
  en: {
    judul: "Simulation / NPV",
    fTanggal: "Booking Date",
    fUnit: "Unit No.",
    fSkema: "Payment Scheme",
    fDiskon: "Discount (%)",
    fBunga: "Mortgage Rate (%)",
    cetakKonsumen: "Preview & Print Out — Customer",
    cetakManagement: "Preview & Print Out — Management",
    unduhKonsumen: "Download PDF — Customer",
    unduhManagement: "Download PDF — Management",
    menyusun: "Building PDF…",
    gagalPdf: "The PDF could not be built. Try again, or use Preview & Print Out and Save as PDF.",
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
    takAdaHarga: "This unit has no price for that payment scheme.",
    belumAda: "This project has no price list yet. Upload it with the " +
              "Upload D-Pricelist panel above.",
    belumAdaBaca: "This project has no price list yet. Admin Sales or Admin " +
                  "IT can upload it on this screen.",
    memuatPl: "Loading price list…",
    sumber: "Price list",
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
  const [pl, setPl] = useState<Pricelist | null | undefined>(undefined);
  const [galatPl, setGalatPl] = useState<string | null>(null);
  // Dinaikkan setiap kali pricelist baru tersimpan, supaya dibaca ulang.
  const [versiPl, setVersiPl] = useState(0);
  const [kode, setKode] = useState("");
  const [skema, setSkema] = useState<Skema>("");
  const [diskon, setDiskon] = useState("0");
  const [bunga, setBunga] = useState("4.65");

  useEffect(() => {
    if (!sesi) return;
    let batal = false;
    (async () => {
      const res = await fetch("/api/pricelist");
      const b = await res.json().catch(() => ({}));
      if (batal) return;
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalatPl(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      const p: Pricelist | null = b.berlaku ?? null;
      setGalatPl(null);
      setPl(p);
      if (p) {
        setKode((kd) => p.unit.some((u) => u.kode === kd) ? kd : (p.unit[0]?.kode ?? ""));
        setSkema((sk) => p.skema.includes(sk) ? sk
          : (p.skema.find((x) => bentukSkema(x)?.jenis === "cash") ?? p.skema[0] ?? ""));
      }
    })();
    return () => { batal = true; };
  }, [sesi, versiPl]);

  const unit = pl?.unit.find((u) => u.kode === kode) ?? null;
  // Pembanding: kolom cara bayar tunai pada pricelist-nya. Namanya ditulis
  // tiap project sendiri, jadi dicari dari bentuknya, bukan dari teksnya.
  const tunai = pl?.skema.find((x) => bentukSkema(x)?.jenis === "cash") ?? "";
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

  const hasil = useMemo(() => unit && unit.harga[skema] > 0 ? hitung({
    unit, skema, diskon: angka(diskon) / 100,
    bungaKpr: angka(bunga) / 100, tanggal: booking,
  }) : null, [unit, skema, diskon, bunga, booking]);

  // Pembanding tetap Cash Keras, cara bayar yang paling ringkas jadwalnya dan
  // karena itu paling tinggi nilai sekarangnya — di situlah selisih cara bayar
  // lain terbaca sebagai biaya menunggu.
  const dasar = useMemo(() => unit && unit.harga[tunai] > 0 ? hitung({
    unit, skema: tunai, diskon: angka(diskon) / 100,
    bungaKpr: angka(bunga) / 100, tanggal: booking,
  }) : null, [unit, tunai, diskon, bunga, booking]);

  // Unduh PDF: lembar cetaknya digambar di luar layar, dipotret, lalu
  // diunduh — lembar yang sama dengan halaman pratinjau, tanpa membuka tab.
  // Sisi kiri lembar Management adalah Cash Keras tanpa diskon, seperti di
  // halaman pratinjaunya.
  const [unduh, setUnduh] = useState<Jenis | null>(null);
  const [galatPdf, setGalatPdf] = useState(false);
  const lembarPdf = useRef<HTMLDivElement | null>(null);
  const cashPdf = useMemo(() => unit && unit.harga[tunai] > 0 ? hitung({
    unit, skema: tunai, diskon: 0, bungaKpr: angka(bunga) / 100, tanggal: booking,
  }) : null, [unit, tunai, bunga, booking]);
  useEffect(() => {
    if (!unduh) return;
    const el = lembarPdf.current?.firstElementChild as HTMLElement | null;
    if (!el) { setUnduh(null); return; }
    unduhPdf(el, unduh, namaPdf(kode, skema, unduh))
      .catch(() => setGalatPdf(true))
      .finally(() => setUnduh(null));
  }, [unduh, kode, skema]);

  if (memuat || !sesi) return <MemeriksaSesi />;

  const bolehUnggah = PENGUNGGAH.includes(sesi.role) && !!sesi.project_slug;
  const unggah = bolehUnggah && (
    <UnggahPricelist onTersimpan={() => setVersiPl((v) => v + 1)} />
  );

  if (galatPl || !pl) {
    return (
      <Kerangka sesi={sesi} lebar judul={<div><h1>{k.judul}</h1></div>}>
        {unggah}
        {galatPl ? <div className="banner stop">{galatPl}</div>
          : pl === undefined ? <p className="hint">{k.memuatPl}</p>
          : <div className="banner info">
              {bolehUnggah ? k.belumAda : k.belumAdaBaca}
            </div>}
      </Kerangka>
    );
  }

  const luas = (n: number | null) =>
    n == null ? "—" : `${n.toLocaleString("id-ID")} m²`;

  const tglTeks = (d: Date) =>
    d.toLocaleDateString(bahasa === "id" ? "id-ID" : "en-GB",
                         { day: "numeric", month: "short", year: "numeric",
                           timeZone: "UTC" });

  return (
    <Kerangka sesi={sesi} lebar judul={<div><h1>{k.judul}</h1></div>}>

      {unggah}

      <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
        {k.sumber}: <a href="/pricelist">{pl.nama}</a>
      </p>

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
              {pl.unit.map((u) => (
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
              {pl.skema.map((s) => (
                <option key={s} value={s} disabled={!((unit?.harga[s] ?? 0) > 0)}>{s}</option>
              ))}
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
        {/* Lembar cetak dibuka di tab tersendiri, membawa masukan di atas
            lewat alamatnya; angkanya dihitung ulang dengan hitung() yang sama. */}
        <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
          {(["konsumen", "management"] as const).map((jenis) => (
            <button key={jenis} disabled={!hasil}
                    onClick={() => window.open(`/simulasi/cetak?${new URLSearchParams({
                      jenis, kode, skema, tanggal,
                      diskon: String(angka(diskon)), bunga: String(angka(bunga)),
                    })}`, "_blank")}>
              {jenis === "konsumen" ? k.cetakKonsumen : k.cetakManagement}
            </button>
          ))}
          {(["konsumen", "management"] as const).map((jenis) => (
            <button key={"pdf-" + jenis}
                    disabled={!hasil || !!unduh || (jenis === "management" && !cashPdf)}
                    onClick={() => { setGalatPdf(false); setUnduh(jenis); }}>
              {unduh === jenis ? k.menyusun
                : jenis === "konsumen" ? k.unduhKonsumen : k.unduhManagement}
            </button>
          ))}
        </div>
        {galatPdf && <div className="banner stop">{k.gagalPdf}</div>}
        <div ref={lembarPdf} aria-hidden
             style={{ position: "fixed", left: -10000, top: 0 }}>
          {unduh === "konsumen" && hasil && unit && (
            <LembarKonsumen h={hasil} unit={unit} slug={sesi.project_slug ?? ""}
                            nama={sesi.project_name ?? ""} booking={booking}
                            bungaKpr={angka(bunga) / 100} />
          )}
          {unduh === "management" && hasil && cashPdf && unit && (
            <LembarManagement h={hasil} cash={cashPdf} unit={unit}
                              nama={sesi.project_name ?? ""} />
          )}
        </div>
      </div>

      {!unit || !hasil || !dasar ? (
        <div className="banner stop">{!unit ? k.takAda : k.takAdaHarga}</div>
      ) : (
        <>
          <div className="dua-kolom sp">
            <div className="panel">
              <h2>{unit.kode}</h2>
              <table className="tabel-ringkas"><tbody>
                <tr><td>{k.rTipe}</td><td className="n">{unit.tipe}</td></tr>
                <tr><td>{k.rLt}</td>
                    <td className="n">{luas(unit.lt)}</td></tr>
                <tr><td>{k.rLb}</td>
                    <td className="n">{luas(unit.lb)}</td></tr>
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
                {pl.skema.map((s) => (
                  <tr key={s} className={s === skema ? "terpilih" : undefined}>
                    <td>{s}</td>
                    <td className="n">
                      {unit.harga[s] > 0 ? formatRupiah(unit.harga[s]) : "—"}
                    </td>
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
              {skema === tunai ? (
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

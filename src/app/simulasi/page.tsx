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

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { PENGUNGGAH, UnggahPricelist } from "./unggah-pricelist";
import { LembarKonsumen, LembarManagement, kodeJadwal, namaPdf, tanggalIso,
         tglPendek, unduhPdf, angka as angkaLembar, type Jenis }
  from "./lembar-cetak";

/**
 * Satu baris jadwal yang sedang disunting. `teks` adalah nilai sebagaimana
 * diketik; selama belum diketik, nilai aslinya dipakai utuh — cicilan yang
 * tidak bulat tidak ikut dibulatkan hanya karena jadwalnya dibuka.
 */
type BarisUbah = {
  ket: string; tgl: string; nilaiAsli: number; teks: string | null;
  sembunyi: boolean; tambahan: boolean;
};

/** "1.234.567" atau "1234567,5" menjadi angka; kosong atau keliru menjadi 0. */
/**
 * Isian nilai ditulis ulang dengan titik ribuan selagi diketik: 6000000
 * menjadi 6.000.000. Hanya angka dan satu koma desimal yang dipertahankan.
 */
const rapikanRupiah = (s: string) => {
  const bersih = s.replace(/[^\d,]/g, "");
  const [bulat, ...pecahan] = bersih.split(",");
  const ribuan = bulat.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return pecahan.length ? `${ribuan},${pecahan.join("").slice(0, 2)}` : ribuan;
};
const bacaRupiah = (s: string) => {
  const n = Number(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const nilaiBaris = (b: BarisUbah) => b.teks == null ? b.nilaiAsli : bacaRupiah(b.teks);
const iso = (d: Date) => d.toISOString().slice(0, 10);
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
    eUbah: "Edit jadwal", eSelesai: "Selesai", eStandar: "Kembalikan jadwal standar",
    eTambah: "Tambah baris", eSisip: "+ Baris", eSembunyi: "Hide", eTampil: "Tampilkan",
    eHapus: "Hapus", eAksi: "Aksi", eDiubah: "Jadwal diubah",
    eBaru: "Pembayaran",
    eCatatan: "Keterangan, tanggal, dan nilai dapat diubah. Baris yang di-hide " +
      "tidak tampil di tabel maupun lembar cetak/PDF, tetapi tetap masuk total " +
      "dan NPV. Jadwal kembali ke standar bila unit, cara bayar, tanggal, atau " +
      "diskon diganti.",
    eSelisih: (tot: string, sel: string, h: string) =>
      `Total jadwal ${tot} berbeda ${sel} dari Harga Transaksi ${h}.`,
    sSimpan: "Simpan jadwal", sMenyimpan: "Menyimpan…",
    sCatatan: "Catatan (mis. nama konsumen)",
    sTersimpan: "Tersimpan", sBelum: "Belum disimpan",
    sBerhasil: (w: string) => `Jadwal tersimpan sebagai versi ${w}.`,
    sDibuka: (w: string, o: string) => `Membuka versi ${w} oleh ${o}.`,
    rJudul: "Riwayat jadwal tersimpan", rKosong:
      "Belum ada jadwal tersimpan untuk unit dan cara bayar ini.",
    rPada: "Disimpan", rOleh: "Oleh", rTgl: "Tgl Booking", rDisk: "Diskon",
    rBunga: "Bunga KPR", rCatatan: "Catatan", rTotal: "Total Nilai",
    rBaris: "Baris", rBuka: "Buka",
    kKet: "Keterangan", kTempo: "Tgl", kHari: "Hari",
    kJumlah: "Nilai (VALUE)", kPv: "PV", kDtp: "DTP (PPN)",
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
    eUbah: "Edit schedule", eSelesai: "Done", eStandar: "Restore standard schedule",
    eTambah: "Add row", eSisip: "+ Row", eSembunyi: "Hide", eTampil: "Show",
    eHapus: "Delete", eAksi: "Actions", eDiubah: "Schedule edited",
    eBaru: "Payment",
    eCatatan: "Description, date and amount can be changed. Hidden rows do " +
      "not appear in the table or the printed sheet/PDF, but still count in " +
      "the totals and NPV. The schedule resets when the unit, payment scheme, " +
      "date or discount changes.",
    eSelisih: (tot: string, sel: string, h: string) =>
      `Schedule total ${tot} differs by ${sel} from the Transaction Price ${h}.`,
    sSimpan: "Save schedule", sMenyimpan: "Saving…",
    sCatatan: "Note (e.g. customer name)",
    sTersimpan: "Saved", sBelum: "Not saved",
    sBerhasil: (w: string) => `Schedule saved as version ${w}.`,
    sDibuka: (w: string, o: string) => `Opened version ${w} by ${o}.`,
    rJudul: "Saved schedule history", rKosong:
      "No saved schedules for this unit and payment scheme yet.",
    rPada: "Saved", rOleh: "By", rTgl: "Booking Date", rDisk: "Discount",
    rBunga: "Mortgage Rate", rCatatan: "Note", rTotal: "Total Value",
    rBaris: "Rows", rBuka: "Open",
    kKet: "Description", kTempo: "Date", kHari: "Days",
    kJumlah: "Value", kPv: "PV", kDtp: "VAT Borne by Govt",
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

  const hasilStandar = useMemo(() => unit && unit.harga[skema] > 0 ? hitung({
    unit, skema, diskon: angka(diskon) / 100,
    bungaKpr: angka(bunga) / 100, tanggal: booking,
  }) : null, [unit, skema, diskon, bunga, booking]);

  // Jadwal suntingan. null = jadwal standar cara bayarnya. Disetel ulang
  // setiap kali dasar jadwalnya berganti: suntingan untuk unit atau cara
  // bayar lain tidak berlaku di sini.
  //
  // Suntingan melekat pada kuncinya — unit, cara bayar, tanggal, diskon. Bila
  // salah satunya diganti, layar kembali ke jadwal standar; membuka versi
  // tersimpan mengisi keempatnya sekaligus beserta barisnya.
  const kunciKini = `${kode}|${skema}|${tanggal}|${angka(diskon)}`;
  const [ubahKunci, setUbahKunci] =
    useState<{ kunci: string; baris: BarisUbah[] } | null>(null);
  const ubah = ubahKunci?.kunci === kunciKini ? ubahKunci.baris : null;
  const [modeUbah, setModeUbah] = useState(false);
  // Keterangan versi yang sedang tampil; null = ada suntingan yang belum disimpan.
  const [tersimpan, setTersimpan] = useState<string | null>(null);
  const setUbah = (f: BarisUbah[] | null |
                       ((u: BarisUbah[] | null) => BarisUbah[] | null)) => {
    setTersimpan(null);
    setUbahKunci((s) => {
      const kini = s?.kunci === kunciKini ? s.baris : null;
      const baru = typeof f === "function" ? f(kini) : f;
      return baru ? { kunci: kunciKini, baris: baru } : null;
    });
  };
  useEffect(() => {
    setModeUbah(false);
    // Suntingan untuk kunci lain dibuang, bukan disimpan diam-diam: kembali
    // ke unit yang sama menampilkan jadwal standar, dan versi yang memang
    // ingin dipakai lagi dibuka dari riwayat.
    setUbahKunci((s) => s && s.kunci !== kunciKini ? null : s);
  }, [kunciKini]);

  // Riwayat versi tersimpan untuk unit dan cara bayar ini.
  type Versi = {
    id: string; tanggal_booking: string; diskon: number; bunga: number;
    baris: { ket: string; tgl: string; nilai: number; sembunyi: boolean;
             tambahan: boolean }[];
    catatan: string | null; disimpan_oleh: string | null; disimpan_pada: string;
  };
  const [riwayat, setRiwayat] = useState<Versi[]>([]);
  const [versiRiwayat, setVersiRiwayat] = useState(0);
  const [catatan, setCatatan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesanSimpan, setPesanSimpan] = useState<{ ok: boolean; teks: string } | null>(null);
  useEffect(() => {
    if (!sesi || !kode || !skema) return;
    let batal = false;
    fetch(`/api/simulasi-jadwal?${new URLSearchParams({ kode, skema })}`)
      .then((r) => r.ok ? r.json() : { riwayat: [] })
      .then((b) => { if (!batal) setRiwayat(b.riwayat ?? []); })
      .catch(() => {});
    return () => { batal = true; };
  }, [sesi, kode, skema, versiRiwayat]);
  useEffect(() => { setPesanSimpan(null); }, [kunciKini]);

  const waktu = (s: string) => new Date(s).toLocaleString("id-ID",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const simpanJadwal = async () => {
    if (!ubah) return;
    setMenyimpan(true); setPesanSimpan(null);
    try {
      const res = await fetch("/api/simulasi-jadwal", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kode, skema, tanggal, diskon: angka(diskon), bunga: angka(bunga),
          catatan, baris: ubah.map((b) => ({
            ket: b.ket, tgl: b.tgl, nilai: nilaiBaris(b),
            sembunyi: b.sembunyi, tambahan: b.tambahan })),
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPesanSimpan({ ok: false, teks: b.detail ?? b.title ?? `HTTP ${res.status}` });
        return;
      }
      const w = waktu(new Date().toISOString());
      setTersimpan(w);
      setModeUbah(false);
      setPesanSimpan({ ok: true, teks: k.sBerhasil(w) });
      setVersiRiwayat((v) => v + 1);
    } catch (e: any) {
      setPesanSimpan({ ok: false, teks: String(e?.message ?? e) });
    } finally {
      setMenyimpan(false);
    }
  };

  const bukaVersi = (v: Versi) => {
    setTanggal(v.tanggal_booking);
    setDiskon(String(v.diskon));
    setBunga(String(v.bunga));
    setCatatan(v.catatan ?? "");
    setUbahKunci({
      kunci: `${kode}|${skema}|${v.tanggal_booking}|${v.diskon}`,
      baris: v.baris.map((b) => ({ ket: b.ket, tgl: b.tgl, nilaiAsli: b.nilai,
                                   teks: null, sembunyi: b.sembunyi,
                                   tambahan: b.tambahan })),
    });
    const w = waktu(v.disimpan_pada);
    setTersimpan(w);
    setModeUbah(false);
    // Dijadwalkan sesudah efek pengosongan pesan yang dipicu kunci baru.
    setTimeout(() => setPesanSimpan(
      { ok: true, teks: k.sDibuka(w, v.disimpan_oleh ?? "—") }), 0);
  };

  const hasil = useMemo(() => {
    if (!ubah || !unit || !hasilStandar) return hasilStandar;
    return hitung({
      unit, skema, diskon: angka(diskon) / 100, bungaKpr: angka(bunga) / 100,
      tanggal: booking,
      jadwalManual: ubah.map((b) => ({
        ket: b.ket, tgl: tanggalIso(b.tgl, booking), nilai: nilaiBaris(b) })),
    });
  }, [ubah, hasilStandar, unit, skema, diskon, bunga, booking]);
  const sembunyi = ubah?.map((b) => b.sembunyi);

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
                      ...(ubah ? { jadwal: kodeJadwal(ubah.map((b) => ({
                        ket: b.ket, tgl: b.tgl, nilai: nilaiBaris(b),
                        sembunyi: b.sembunyi }))) } : {}),
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
                            bungaKpr={angka(bunga) / 100} sembunyi={sembunyi} />
          )}
          {unduh === "management" && hasil && cashPdf && unit && (
            <LembarManagement h={hasil} cash={cashPdf} unit={unit}
                              nama={sesi.project_name ?? ""} sembunyi={sembunyi} />
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
            <h2>
              {k.jadwal}
              <span>
                <span className="pill">{skema}</span>
                {ubah && (tersimpan
                  ? <span className="pill ok">{k.sTersimpan} · {tersimpan}</span>
                  : <span className="pill warn">{k.sBelum}</span>)}
              </span>
            </h2>
            <div className="row" style={{ marginTop: 0 }}>
              {!modeUbah ? (
                <button onClick={() => {
                  setUbah((u) => u ?? hasilStandar!.termin.map((t) => ({
                    ket: t.ket, tgl: iso(t.tgl), nilaiAsli: t.nilai, teks: null,
                    sembunyi: false, tambahan: false })));
                  setModeUbah(true);
                }}>{k.eUbah}</button>
              ) : (
                <>
                  <button onClick={() => setUbah((u) => u && [...u, {
                    ket: k.eBaru, tgl: u[u.length - 1]?.tgl ?? tanggal,
                    nilaiAsli: 0, teks: "0", sembunyi: false, tambahan: true }])}>
                    {k.eTambah}
                  </button>
                  <button className="pri" onClick={() => setModeUbah(false)}>
                    {k.eSelesai}
                  </button>
                </>
              )}
              {ubah && (
                <button onClick={() => { setUbah(null); setModeUbah(false); }}>
                  {k.eStandar}
                </button>
              )}
            </div>
            {ubah && (
              <div className="row" style={{ marginTop: 0 }}>
                <input value={catatan} maxLength={200} placeholder={k.sCatatan}
                       aria-label={k.sCatatan} style={{ maxWidth: 320 }}
                       onChange={(e) => setCatatan(e.target.value)} />
                <button className="pri" disabled={menyimpan || !!tersimpan}
                        onClick={() => void simpanJadwal()}>
                  {menyimpan ? k.sMenyimpan : k.sSimpan}
                </button>
              </div>
            )}
            {pesanSimpan && (
              <div className={`banner ${pesanSimpan.ok ? "ok" : "stop"}`}>{pesanSimpan.teks}</div>
            )}
            {modeUbah && (
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>{k.eCatatan}</p>
            )}
            {Math.abs(hasil.jumlahNilai - hasil.hargaTransaksi) >= 1 && (
              <div className="banner warn">
                {k.eSelisih(formatRupiah(Math.round(hasil.jumlahNilai)),
                            formatRupiah(Math.round(hasil.jumlahNilai - hasil.hargaTransaksi)),
                            formatRupiah(Math.round(hasil.hargaTransaksi)))}
              </div>
            )}
            <div className="tscroll">
              {/* Susunan dan penulisannya sama dengan sisi PERMINTAAN pada
                  lembar Management: tanpa nomor, keterangan berhuruf besar,
                  tanggal 15-Oct-26, angka tanpa Rp, dan nol sebagai "-". */}
              <table className="tabel-jadwal"><tbody>
                <tr>
                  <th style={{ width: 170 }}>{k.kKet}</th>
                  <th style={{ width: 62 }}>{k.kHari}</th>
                  <th style={{ width: modeUbah ? 140 : 100 }}>{k.kTempo}</th>
                  <th>{k.kJumlah}</th>
                  <th>{k.kPv}</th>
                  <th>{k.kTagihan}</th>
                  <th>{k.kDtp}</th>
                  {modeUbah && <th style={{ width: 210 }}>{k.eAksi}</th>}
                </tr>
                {hasil.termin.map((t, i) => {
                  const b = ubah?.[i];
                  if (b?.sembunyi && !modeUbah) return null;
                  const ganti = (p: Partial<BarisUbah>) =>
                    setUbah((u) => u && u.map((x, j) => j === i ? { ...x, ...p } : x));
                  return (
                    <tr key={i} className={b?.sembunyi ? "baris-sembunyi" : undefined}>
                      <td>{modeUbah && b
                        ? <input value={b.ket} onChange={(e) => ganti({ ket: e.target.value })} />
                        : t.ket.toUpperCase()}</td>
                      <td className="n">{t.hari || "-"}</td>
                      <td>{modeUbah && b
                        ? <input type="date" value={b.tgl}
                                 onChange={(e) => ganti({ tgl: e.target.value })} />
                        : tglPendek(t.tgl)}</td>
                      <td className="n">{modeUbah && b
                        ? <input className="n" inputMode="decimal"
                                 value={b.teks ?? Math.round(b.nilaiAsli).toLocaleString("id-ID")}
                                 onChange={(e) => ganti({ teks: rapikanRupiah(e.target.value) })} />
                        : angkaLembar(t.nilai)}</td>
                      <td className="n">{angkaLembar(t.pv)}</td>
                      <td className="n">{angkaLembar(t.tagihan)}</td>
                      <td className="n">{angkaLembar(t.dtp)}</td>
                      {modeUbah && b && (
                        <td>
                          <span className="row" style={{ margin: 0, flexWrap: "nowrap" }}>
                            <button onClick={() => ganti({ sembunyi: !b.sembunyi })}>
                              {b.sembunyi ? k.eTampil : k.eSembunyi}
                            </button>
                            <button onClick={() => setUbah((u) => u && [
                              ...u.slice(0, i + 1),
                              { ket: k.eBaru, tgl: b.tgl, nilaiAsli: 0, teks: "0",
                                sembunyi: false, tambahan: true },
                              ...u.slice(i + 1)])}>{k.eSisip}</button>
                            {b.tambahan && (
                              <button onClick={() => setUbah((u) =>
                                u && u.length > 1 ? u.filter((_, j) => j !== i) : u)}>
                                {k.eHapus}
                              </button>
                            )}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr className="baris-total">
                  <td colSpan={3}>{k.total}</td>
                  <td className="n">{angkaLembar(hasil.jumlahNilai)}</td>
                  <td className="n">{angkaLembar(hasil.jumlahPv)}</td>
                  <td className="n">{angkaLembar(hasil.jumlahTagihan)}</td>
                  <td className="n">{angkaLembar(hasil.jumlahDtp)}</td>
                  {modeUbah && <td />}
                </tr>
              </tbody></table>
            </div>

            <h3 style={{ marginTop: 18 }}>{k.rJudul}</h3>
            {riwayat.length === 0 ? (
              <p className="hint" style={{ textAlign: "left" }}>{k.rKosong}</p>
            ) : (
              <div className="tscroll" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table className="tabel-ringkas" style={{ whiteSpace: "nowrap" }}><tbody>
                  <tr>
                    <th>{k.rPada}</th><th>{k.rOleh}</th><th>{k.rTgl}</th>
                    <th>{k.rDisk}</th><th>{k.rBunga}</th><th>{k.rCatatan}</th>
                    <th>{k.rBaris}</th><th>{k.rTotal}</th><th />
                  </tr>
                  {riwayat.map((v) => (
                    <tr key={v.id}>
                      <td>{waktu(v.disimpan_pada)}</td>
                      <td>{v.disimpan_oleh ?? "—"}</td>
                      <td>{tglPendek(tanggalIso(v.tanggal_booking, booking))}</td>
                      <td className="n">{v.diskon.toLocaleString("id-ID")}%</td>
                      <td className="n">{v.bunga.toLocaleString("id-ID")}%</td>
                      <td>{v.catatan ?? "—"}</td>
                      <td className="n">{v.baris.length}</td>
                      <td className="n">
                        {angkaLembar(v.baris.reduce((a, b) => a + b.nilai, 0))}
                      </td>
                      <td><button onClick={() => bukaVersi(v)}>{k.rBuka}</button></td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
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

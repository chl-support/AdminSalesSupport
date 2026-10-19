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
 * Upload D-Pricelist di bagian atas (Admin Sales dan Admin IT); tepat di
 * bawahnya tampil pricelist yang berlaku beserta riwayat unggahannya.
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
import { PanelPricelist } from "../pricelist/panel-pricelist";
import { PanelTarifDtp } from "./tarif-dtp";
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
  /**
   * Persentase yang diketik orang pada kolom %, apa adanya.
   *
   * Null berarti kolom itu mengikuti nilainya — yang ditampilkan dihitung
   * dari nilai baris. Begitu diketik, arahnya berbalik: nilainya yang
   * dihitung dari persen. Menyimpan apa yang diketik, bukan hasil hitungnya,
   * menjaga "29," tetap dapat dilanjutkan menjadi "29,45" tanpa melompat.
   */
  persenTeks?: string | null;
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
/** Angka persen: digit dan satu koma, mis. "9,45". Titik ribuan tak berarti. */
const rapikanPersen = (s: string) => {
  const [bulat, ...pecahan] = s.replace(/[^\d,.]/g, "").replace(/\./g, ",")
    .split(",");
  return pecahan.length ? `${bulat},${pecahan.join("").slice(0, 2)}` : bulat;
};
const bacaRupiah = (s: string) => {
  const n = Number(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const nilaiBaris = (b: BarisUbah) => b.teks == null ? b.nilaiAsli : bacaRupiah(b.teks);
const iso = (d: Date) => d.toISOString().slice(0, 10);
import { formatRupiah } from "@/lib/money";
import { BUNGA_NPV, bentukSkema, bulatRibu, hitung, lewatKpr, type Hasil,
         type Skema, type TarifDtp, type UnitHarga } from "@/lib/simulasi";

type Pricelist = { nama: string; skema: Skema[]; unit: UnitHarga[] };

const KATA = {
  id: {
    judul: "Simulasi / NPV",
    fTanggal: "Tanggal Booking",
    fUnit: "No. Unit",
    // PL Harga Dasar berdiri lebih dulu, lalu Cara Bayar — urutan yang
    // diminta bagian penjualan, dan urutan kerjanya juga: harga dasarnya
    // ditentukan, baru cara membayarnya disusun. `fPlSama` adalah pilihan
    // bawaan pada kotak Cara Bayar: jadwalnya mengikuti kolom harga itu.
    fSkema: "Cara Bayar",
    fPl: "PL Harga Dasar", fPlSama: "Sesuai PL Harga Dasar",
    fTambah: "Penambahan Harga",
    plBeda: (pl: string, sk: string) =>
      `Harga dari PL ${pl}, jadwal mengikuti ${sk}.`,
    fDiskon: "Diskon",
    fBunga: "Bunga KPR (%)",
    cetakKonsumen: "Preview & Print Out — Konsumen",
    cetakManagement: "Preview & Print Out — Management",
    unduhKonsumen: "Unduh PDF — Konsumen",
    unduhManagement: "Unduh PDF — Management",
    menyusun: "Menyusun PDF…",
    gagalPdf: "PDF tidak dapat disusun. Coba lagi, atau pakai Preview & Print Out lalu Simpan sebagai PDF.",
    rTipe: "Tipe", rLt: "Luas Tanah", rLb: "Luas Bangunan",
    rPricelist: "Harga Price List", rTambah: "Penambahan Harga",
    rDiskon: "Diskon",
    rTransaksi: "Harga Transaksi (Include PPN)",
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
    rJudul: "Riwayat Perubahan Jadwal", rKosong:
      "Belum ada perubahan jadwal yang disimpan untuk unit dan cara bayar ini.",
    rPada: "Disimpan", rOleh: "Oleh", rTgl: "Tgl Booking", rDisk: "Diskon",
    rBunga: "Bunga KPR", rCatatan: "Catatan", rTotal: "Total Nilai",
    rBuka: "Buka", rHapus: "Hapus", rHapusSemua: "Hapus Semua",
    rYakin: "Hapus versi ini?", rYakinSemua: (n: number) =>
      `Hapus seluruh ${n} versi untuk unit dan cara bayar ini?`,
    rYa: "Ya, Hapus", rBatal: "Batal",
    ksHarga: "Harga Transaksi (Include PPN)", ksTagihan: "Total Tagihan (DTP)",
    ksNpv: "Nilai Sekarang (NPV)", ksDtp: "DTP (PPN)",
    ksDiskon: (p: string) => `Diskon ${p}`,
    ksTagihanKet: "Dibayar konsumen setelah PPN DTP",
    ksNpvKet: (p: string) => `${p} dari nominal, bunga 12%`,
    ksDtpKet: (p: string) => `Tarif ${p}`, ksDtpLuar: "Di luar periode DTP",
    bJudul: "Perbandingan Jadwal",
    bSebelum: "Sebelum · jadwal standar", bSesudah: "Sesudah · versi tersimpan",
    bBaru: "Baru", bSembunyi: "Hide", bDiubah: "Diubah",
    bRingkas: "Ringkasan", bSelisih: "Selisih",
    bNilai: "Total Nilai", bTotPv: "Total PV", bTagihan: "Total Tagihan",
    bDtp: "Total DTP", bTutup: "Tutup",
    bKet: "Sel berwarna berubah dari jadwal standar. Baris Hide tidak tampil di " +
          "lembar cetak tetapi tetap dihitung.",
    kKet: "Keterangan", kTempo: "Tgl", kHari: "Hari",
    kPersen: "%",
    kJumlah: "Nilai (VALUE)", kPv: "PV", kDtp: "DTP (PPN)",
    kTagihan: "Tagihan (DTP)",
    total: "TOTAL",
    npv: "Nilai Sekarang (NPV)",
    nBunga: "Interest Rate",
    nNominal: "Jumlah nominal",
    nPv: "Jumlah nilai sekarang",
    nRasio: "Nilai sekarang terhadap nominal",
    nSelisih: "Selisih terhadap nominal",
    dtpJudul: "PPN Ditanggung Pemerintah",
    dTarif: "Tarif yang berlaku",
    dDasar: "Dasar pengenaan",
    dPagu: "DTP (PPN)",
    dTerpakai: "DTP terpakai",
    dLuar: "Jatuh tempo terakhir di luar periode DTP — tidak ada DTP.",
    banding: "Perbandingan terhadap Cash Keras",
    bNominal: "Selisih nominal",
    bPv: "Selisih nilai sekarang",
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
  },
  en: {
    judul: "Simulation / NPV",
    fTanggal: "Booking Date",
    fUnit: "Unit No.",
    fSkema: "Payment Scheme",
    fPl: "PL Base Price", fPlSama: "Same as PL Base Price",
    fTambah: "Price Addition",
    plBeda: (pl: string, sk: string) =>
      `Price from the ${pl} list, schedule follows ${sk}.`,
    fDiskon: "Discount",
    fBunga: "Mortgage Rate (%)",
    cetakKonsumen: "Preview & Print Out — Customer",
    cetakManagement: "Preview & Print Out — Management",
    unduhKonsumen: "Download PDF — Customer",
    unduhManagement: "Download PDF — Management",
    menyusun: "Building PDF…",
    gagalPdf: "The PDF could not be built. Try again, or use Preview & Print Out and Save as PDF.",
    rTipe: "Type", rLt: "Land Area", rLb: "Building Area",
    rPricelist: "List Price", rTambah: "Price Addition",
    rDiskon: "Discount",
    rTransaksi: "Transaction Price (Incl. VAT)",
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
    rJudul: "Schedule Change History", rKosong:
      "No saved schedule changes for this unit and payment scheme yet.",
    rPada: "Saved", rOleh: "By", rTgl: "Booking Date", rDisk: "Discount",
    rBunga: "Mortgage Rate", rCatatan: "Note", rTotal: "Total Value",
    rBuka: "Open", rHapus: "Delete", rHapusSemua: "Delete All",
    rYakin: "Delete this version?", rYakinSemua: (n: number) =>
      `Delete all ${n} versions for this unit and payment scheme?`,
    rYa: "Yes, Delete", rBatal: "Cancel",
    ksHarga: "Transaction Price (Incl. VAT)", ksTagihan: "Total Billed (net of VAT)",
    ksNpv: "Present Value (NPV)", ksDtp: "VAT Relief (DTP)",
    ksDiskon: (p: string) => `Discount ${p}`,
    ksTagihanKet: "Paid by the customer after VAT relief",
    ksNpvKet: (p: string) => `${p} of nominal, 12% rate`,
    ksDtpKet: (p: string) => `Rate ${p}`, ksDtpLuar: "Outside the relief period",
    bJudul: "Schedule Comparison",
    bSebelum: "Before · standard schedule", bSesudah: "After · saved version",
    bBaru: "New", bSembunyi: "Hidden", bDiubah: "Changed",
    bRingkas: "Summary", bSelisih: "Difference",
    bNilai: "Total Value", bTotPv: "Total PV", bTagihan: "Total Billed",
    bDtp: "Total VAT relief", bTutup: "Close",
    bKet: "Highlighted cells differ from the standard schedule. Hidden rows " +
          "are not printed but still count.",
    kKet: "Description", kTempo: "Date", kHari: "Days", kPersen: "%",
    kJumlah: "Value", kPv: "PV", kDtp: "VAT Borne by Govt",
    kTagihan: "Billed (net of VAT)",
    total: "TOTAL",
    npv: "Net Present Value",
    nBunga: "Interest Rate",
    nNominal: "Nominal total",
    nPv: "Present value total",
    nRasio: "Present value against nominal",
    nSelisih: "Difference against nominal",
    dtpJudul: "VAT Borne by Government",
    dTarif: "Applicable rate",
    dDasar: "Taxable base",
    dPagu: "VAT Relief (DTP)",
    dTerpakai: "Used",
    dLuar: "The final due date falls outside the programme period — no relief.",
    banding: "Compared with Cash Keras",
    bNominal: "Nominal difference",
    bPv: "Present value difference",
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
  // Kolom pricelist yang harganya dipakai sebagai dasar perhitungan. Selalu
  // terisi: tiap simulasi berangkat dari satu harga, dan harga itu harus ada
  // namanya.
  const [plDasar, setPlDasar] = useState<Skema>("");
  // Cara bayar yang menyusun jadwalnya. "" berarti mengikuti PL Harga Dasar —
  // keadaan yang paling sering, dan karena itu yang menjadi bawaannya.
  const [caraBayar, setCaraBayar] = useState<Skema>("");
  // Penambahan harga di luar pricelist, dalam rupiah. Ditulis dengan titik
  // ribuan seperti kolom Nilai (VALUE) pada jadwal, sebab angkanya berpuluh
  // juta dan deretan nol tanpa pemisah salah dibaca.
  const [tambah, setTambah] = useState("0");
  const [diskon, setDiskon] = useState("0");
  /**
   * Satuan kedua kotak itu, dipilih sendiri-sendiri.
   *
   * Kesepakatan datang dalam dua bentuk: "tambah 25 juta" dan "tambah 2%",
   * "diskon 5%" dan "diskon 50 juta" — dan yang memegang kesepakatan tidak
   * seharusnya menghitung ulang di kalkulator sebelum mengetiknya ke sini.
   * Bawaannya mengikuti yang paling sering: penambahan dalam rupiah, diskon
   * dalam persen.
   */
  const [satuanTambah, setSatuanTambah] = useState<"rp" | "persen">("rp");
  const [satuanDiskon, setSatuanDiskon] = useState<"rp" | "persen">("persen");
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
        setPlDasar((d) => p.skema.includes(d) ? d
          : (p.skema.find((x) => bentukSkema(x)?.jenis === "cash") ?? p.skema[0] ?? ""));
        // Cara bayar yang tidak ada di pricelist baru kembali mengikuti
        // PL Harga Dasar, bukan bertahan sebagai nama yang tidak ada kolomnya.
        setCaraBayar((c) => c && p.skema.includes(c) ? c : "");
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

  // Tabel Tarif PPN DTP yang berlaku, dari basis data. Selama belum termuat,
  // hitung() memakai daftar bawaannya.
  const [tarifDtp, setTarifDtp] = useState<TarifDtp[] | undefined>(undefined);
  useEffect(() => {
    if (!sesi) return;
    fetch("/api/tarif-dtp").then((r) => r.ok ? r.json() : null)
      .then((b) => { if (b?.tarif) setTarifDtp(b.tarif); }).catch(() => {});
  }, [sesi]);

  /**
   * Cara bayar yang benar-benar dipakai menyusun jadwal.
   *
   * Kotak Cara Bayar boleh dibiarkan "Sesuai PL Harga Dasar" — dan itulah
   * keadaan biasanya: jadwalnya mengikuti kolom harga yang dipilih. Yang
   * mengisinya dengan cara bayar lain meminta sesuatu yang memang terjadi di
   * lapangan: harga dari kolom Cash Keras, jadwal mengikuti KPR.
   */
  const skema = (caraBayar || plDasar) as Skema;
  // Kolom harga disebut terpisah hanya bila memang berbeda dari cara bayarnya;
  // bila sama, hitung() mengambil harga dari cara bayar itu sendiri.
  const skemaHarga = plDasar && plDasar !== skema && unit && unit.harga[plDasar] > 0
    ? plDasar : undefined;
  /**
   * Harga yang menjadi dasar kedua kotak itu: kolom PL Harga Dasar.
   *
   * Persen pada penambahan maupun diskon dihitung darinya, sama seperti kolom
   * % pada jadwal — bukan dari harga transaksi, yang justru hasil dari
   * keduanya.
   */
  const hargaDasar = (unit && plDasar ? unit.harga[plDasar] : 0) || 0;
  const nilaiTambah = satuanTambah === "rp"
    ? bacaRupiah(tambah)
    : bulatRibu(hargaDasar * angka(tambah) / 100);
  /**
   * Diskon selalu disimpan dan dicetak sebagai persen — begitulah bentuknya
   * di lembar cetak, pada versi jadwal tersimpan, dan pada alamat lembar
   * cetak. Yang mengetik rupiah hanya menempuh jalan lain menuju angka yang
   * sama.
   */
  const diskonPersen = satuanDiskon === "persen"
    ? angka(diskon)
    : (hargaDasar > 0 ? bacaRupiah(diskon) / hargaDasar * 100 : 0);
  const hasilStandar = useMemo(() => unit && unit.harga[skemaHarga ?? skema] > 0
    ? hitung({
        unit, skema, skemaHarga, tambahan: nilaiTambah,
        diskon: diskonPersen / 100,
        bungaKpr: angka(bunga) / 100, tanggal: booking, tarifDtp,
      }) : null,
    [unit, skema, skemaHarga, nilaiTambah, diskonPersen, bunga, booking, tarifDtp]);

  // Jadwal suntingan. null = jadwal standar cara bayarnya. Disetel ulang
  // setiap kali dasar jadwalnya berganti: suntingan untuk unit atau cara
  // bayar lain tidak berlaku di sini.
  //
  // Suntingan melekat pada kuncinya — unit, cara bayar, tanggal, diskon. Bila
  // salah satunya diganti, layar kembali ke jadwal standar; membuka versi
  // tersimpan mengisi keempatnya sekaligus beserta barisnya.
  const kunciKini =
    `${kode}|${skema}|${skemaHarga ?? ""}|${tanggal}|${nilaiTambah}|${diskonPersen}`;
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
    id: string; tanggal_booking: string; tambahan: number;
    diskon: number; bunga: number;
    baris: { ket: string; tgl: string; nilai: number; sembunyi: boolean;
             tambahan: boolean }[];
    catatan: string | null; disimpan_oleh: string | null; disimpan_pada: string;
    skema_harga: string | null;
  };
  const [riwayat, setRiwayat] = useState<Versi[]>([]);
  const [versiRiwayat, setVersiRiwayat] = useState(0);
  // Konfirmasi hapus riwayat: id versi, "semua", atau null.
  const [yakinHapus, setYakinHapus] = useState<string | null>(null);
  const hapusRiwayat = async (sasaran: string) => {
    const q = sasaran === "semua"
      ? new URLSearchParams({ kode, skema, semua: "1" })
      : new URLSearchParams({ id: sasaran });
    const res = await fetch(`/api/simulasi-jadwal?${q}`, { method: "DELETE" });
    const b = await res.json().catch(() => ({}));
    setYakinHapus(null);
    if (!res.ok) {
      setPesanSimpan({ ok: false, teks: b.detail ?? b.title ?? `HTTP ${res.status}` });
      return;
    }
    // Versi yang sedang tampil mungkin ikut terhapus: jadwal suntingannya
    // tetap di layar, tetapi kini terhitung belum disimpan.
    if (ubah) setTersimpan(null);
    setVersiRiwayat((v) => v + 1);
  };
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
          kode, skema, skemaHarga: skemaHarga ?? null,
          tanggal, tambahan: nilaiTambah,
          diskon: diskonPersen, bunga: angka(bunga),
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

  // Pop-up perbandingan: jadwal standar untuk masukan versi itu (sebelum)
  // berdampingan dengan versi tersimpannya (sesudah).
  const [banding, setBanding] = useState<{
    v: Versi; sebelum: Hasil; sesudah: Hasil;
  } | null>(null);

  const bukaVersi = (v: Versi) => {
    if (unit) {
      try {
        const tgl = tanggalIso(v.tanggal_booking, booking);
        const dasarV = { unit, skema, skemaHarga: v.skema_harga || undefined,
                         tambahan: v.tambahan ?? 0, diskon: v.diskon / 100,
                         bungaKpr: v.bunga / 100, tanggal: tgl, tarifDtp };
        setBanding({
          v, sebelum: hitung(dasarV),
          sesudah: hitung({ ...dasarV, jadwalManual: v.baris.map((b) => ({
            ket: b.ket, tgl: tanggalIso(b.tgl, tgl), nilai: b.nilai })) }),
        });
      } catch { setBanding(null); }
    }
    setTanggal(v.tanggal_booking);
    // Riwayat disaring menurut cara bayar efektifnya, jadi `skema` di sini
    // sudah sama dengan milik versi itu. Yang perlu dikembalikan tinggal
    // pembagiannya ke dua kotak: ada kolom harga tersendiri, atau tidak.
    setPlDasar((v.skema_harga || skema) as Skema);
    setCaraBayar(v.skema_harga ? skema : "");
    // Yang tersimpan rupiah untuk penambahan dan persen untuk diskon, jadi
    // satuannya ikut dikembalikan ke sana — bukan dibiarkan pada satuan yang
    // kebetulan sedang dipilih, yang akan membaca angka yang sama sebagai
    // angka yang lain sama sekali.
    setSatuanTambah("rp");
    setTambah(rapikanRupiah(String(Math.round(v.tambahan ?? 0))));
    setSatuanDiskon("persen");
    setDiskon(String(v.diskon));
    setBunga(String(v.bunga));
    setCatatan(v.catatan ?? "");
    setUbahKunci({
      kunci: `${kode}|${skema}|${v.skema_harga ?? ""}|${v.tanggal_booking}` +
             `|${v.tambahan ?? 0}|${v.diskon}`,
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
      unit, skema, skemaHarga, tambahan: nilaiTambah,
      diskon: diskonPersen / 100,
      bungaKpr: angka(bunga) / 100, tanggal: booking, tarifDtp,
      jadwalManual: ubah.map((b) => ({
        ket: b.ket, tgl: tanggalIso(b.tgl, booking), nilai: nilaiBaris(b) })),
    });
  }, [ubah, hasilStandar, unit, skema, skemaHarga, nilaiTambah, diskonPersen,
      bunga, booking, tarifDtp]);
  const sembunyi = ubah?.map((b) => b.sembunyi);

  /**
   * Porsi satu nilai terhadap harga pricelist yang dipilih.
   *
   * Pembandingnya harga pricelist, bukan harga transaksi: yang hendak dibaca
   * orang penjualan adalah "termin ini berapa persen dari PL", dan diskon
   * tidak mengubah pertanyaan itu. Dua angka di belakang koma karena termin
   * kecil seperti booking fee kerap di bawah satu persen, dan "1%" untuk dua
   * nilai yang berbeda menyembunyikan justru yang sedang dibandingkan.
   */
  const persenPl = (nilai: number) => {
    const pl = hasil?.hargaPricelist ?? 0;
    if (!(pl > 0)) return "-";
    return `${(nilai / pl * 100).toLocaleString("id-ID",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  };

  /** Persen tanpa tanda %, untuk ditampilkan di dalam kotak isian. */
  const persenAngka = (nilai: number) => {
    const pl = hasil?.hargaPricelist ?? 0;
    if (!(pl > 0)) return "";
    return (nilai / pl * 100).toLocaleString("id-ID",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const bacaPersen = (s: string) => {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  /**
   * Persen diketik, nilainya yang menyesuaikan.
   *
   * Aturannya dari bagian penjualan, dan letak barisnya yang menentukan:
   *
   *   • baris pertama (booking fee) — nilainya tetap, bukan turunan persen.
   *     Booking fee adalah angka bulat yang disepakati di muka (10.000.000),
   *     sama untuk unit mahal maupun murah, jadi persen di baris itu hanya
   *     melaporkan porsinya terhadap harga PL dan tidak dapat diketik; yang
   *     mengubahnya adalah kolom Nilai (VALUE) sendiri;
   *   • baris kedua ("Pembayaran 1") — nilai = harga PL × persen, dikurangi
   *     nilai booking fee. Persen pada baris itu memang mencakup booking fee
   *     yang sudah dibayar di muka, jadi tanpa pengurangan itu uangnya
   *     terhitung dua kali;
   *   • baris ketiga dan seterusnya — nilai = harga PL × persen.
   */
  const ubahPersen = (i: number, mentah: string) => {
    // Hanya angka dan satu koma: "29,45" ditulis orang Indonesia dengan koma,
    // dan titik ribuan tidak punya arti pada persen.
    const [bulat, ...pecahan] = mentah.replace(/[^\d,]/g, "").split(",");
    const teksPersen = pecahan.length
      ? `${bulat},${pecahan.join("").slice(0, 2)}` : bulat;

    setUbah((u) => {
      if (!u) return u;
      const pl = hasil?.hargaPricelist ?? 0;
      if (!(pl > 0)) {
        return u.map((x, j) => j === i ? { ...x, persenTeks: teksPersen } : x);
      }
      // Baris booking fee: persennya tidak menyetel nilainya.
      if (i === 0) {
        return u.map((x, j) => j === i ? { ...x, persenTeks: teksPersen } : x);
      }
      let nilai = pl * bacaPersen(teksPersen) / 100;
      if (i === 1) nilai -= nilaiBaris(u[0]);
      // Dibulatkan ke ribuan, seperti seluruh angka yang dihitung sendiri
      // oleh layar ini. Di bawah nol tidak dibulatkan diam-diam ke angka
      // lain: nol terbaca sebagai "persen ini lebih kecil daripada booking
      // fee-nya", dan itu memang yang perlu dilihat orang yang mengetiknya.
      const bulatRp = Math.max(0, bulatRibu(nilai));
      // Sama seperti kolom Nilai: begitu satu termin ditetapkan, termin di
      // bawahnya dibagi rata atas sisanya, dan jumlahnya kembali sama dengan
      // harga transaksi. Persen yang tadi diketik pada baris-baris itu ikut
      // dilepas — angkanya kini mengikuti nilai, bukan sebaliknya.
      return bagiSisa(u.map((x, j) => j === i
        ? { ...x, persenTeks: teksPersen, teks: bulatRp.toLocaleString("id-ID") }
        : x), i);
    });
  };

  /**
   * Nilai satu termin diketik; termin sesudahnya dibagi rata atas sisanya.
   *
   * Jadwal yang disunting hampir selalu berarti "yang ini sekian, sisanya
   * atur": orang menaikkan Pembayaran 1 lalu mengetik ulang satu per satu
   * baris di bawahnya sampai jumlahnya kembali pas — pekerjaan yang panjang,
   * dan yang salah hitungnya baru ketahuan dari peringatan selisih di atas
   * tabel. Jadi begitu sebuah nilai diketik, termin di bawahnya langsung
   * dihitungkan: sisanya dibagi rata, dan jumlah seluruh termin kembali sama
   * dengan harga transaksi — yaitu harga PL ketika tidak ada diskon maupun
   * penambahan harga.
   *
   * Yang di atasnya tidak disentuh: itu angka yang sudah disepakati, dan
   * membetulkan baris keempat tidak boleh menggeser baris kedua.
   *
   * Baris yang disembunyikan tidak ikut dibagi — tetapi nilainya tetap
   * dihitung ke dalam total, sama seperti pada lembar cetak.
   *
   * Pembulatannya jatuh pada baris terakhir: membagi tiga sisa yang tidak
   * habis dibagi tiga akan meninggalkan satu atau dua rupiah, dan selisih satu
   * rupiah pada lembar yang dicetak tetap selisih.
   */
  const bagiSisa = (baris: BarisUbah[], i: number): BarisUbah[] => {
    const target = Math.round(hasilStandar?.hargaTransaksi ?? 0);
    const sesudah = baris
      .map((x, j) => ({ x, j }))
      .filter(({ x, j }) => j > i && !x.sembunyi)
      .map(({ j }) => j);
    if (!sesudah.length || !(target > 0)) return baris;

    const diluar = baris.reduce(
      (t, x, j) => t + (sesudah.includes(j) ? 0 : nilaiBaris(x)), 0);
    const sisa = Math.max(0, Math.round(target - diluar));
    // Bulat ribuan, dan baris terakhir menanggung selisihnya — ia pun ikut
    // bulat selama sisanya bulat ribuan.
    const per = bulatRibu(sisa / sesudah.length);
    const hasilBaris = [...baris];
    sesudah.forEach((j, urut) => {
      const nilai = urut === sesudah.length - 1
        ? sisa - per * (sesudah.length - 1) : per;
      hasilBaris[j] = { ...hasilBaris[j], teks: nilai.toLocaleString("id-ID"),
                        persenTeks: null };
    });
    return hasilBaris;
  };

  const ubahNilai = (i: number, mentah: string) => {
    const teks = rapikanRupiah(mentah);
    setUbah((u) => u && bagiSisa(
      // Nilai yang diketik tangan membatalkan persen yang tadi diketik:
      // arahnya berbalik lagi, persen mengikuti nilai.
      u.map((x, j) => j === i ? { ...x, teks, persenTeks: null } : x), i));
  };

  // Pembanding tetap Cash Keras, cara bayar yang paling ringkas jadwalnya dan
  // karena itu paling tinggi nilai sekarangnya — di situlah selisih cara bayar
  // lain terbaca sebagai biaya menunggu.
  const dasar = useMemo(() => unit && unit.harga[tunai] > 0 ? hitung({
    unit, skema: tunai, tambahan: nilaiTambah, diskon: diskonPersen / 100,
    bungaKpr: angka(bunga) / 100, tanggal: booking, tarifDtp,
  }) : null, [unit, tunai, nilaiTambah, diskonPersen, bunga, booking, tarifDtp]);

  // Unduh PDF: lembar cetaknya digambar di luar layar, dipotret, lalu
  // diunduh — lembar yang sama dengan halaman pratinjau, tanpa membuka tab.
  // Sisi kiri lembar Management adalah cara bayar yang sama tanpa diskon dan
  // dengan jadwal standarnya, seperti di halaman pratinjaunya.
  const [unduh, setUnduh] = useState<Jenis | null>(null);
  const [galatPdf, setGalatPdf] = useState(false);
  const lembarPdf = useRef<HTMLDivElement | null>(null);
  const cashPdf = useMemo(() => unit && unit.harga[skema] > 0 ? hitung({
    unit, skema, diskon: 0, bungaKpr: angka(bunga) / 100, tanggal: booking, tarifDtp,
  }) : null, [unit, skema, bunga, booking, tarifDtp]);
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
  // Bagian pricelist di atas simulasi: unggah (bagi yang berwenang), lalu
  // pricelist yang berlaku beserta riwayatnya. Keduanya saling memberi tahu
  // lewat versiPl, sehingga simulasi di bawahnya ikut memakai yang terbaru.
  const naikkanVersi = () => setVersiPl((v) => v + 1);
  const unggah = (
    <>
      {bolehUnggah && <UnggahPricelist onTersimpan={naikkanVersi} />}
      {sesi.project_slug && (
        <PanelPricelist sesi={sesi} versi={versiPl} onBerubah={naikkanVersi} />
      )}
    </>
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
          {/* Dua kotak berurutan, dan urutannya mengikuti cara orang
              menyusun simulasi: harga dasarnya dulu, baru cara membayarnya.

              Keduanya sempat bertukar nama tanpa bertukar isi, dan akibatnya
              memilih "CICILAN 24x" pada kotak Cara Bayar hanya mengganti
              kolom harganya — jadwalnya tetap jadwal cash. Sekarang tiap
              nama melekat pada kotak yang memang mengerjakannya: PL Harga
              Dasar menentukan harga yang dipakai sebagai dasar perhitungan,
              Cara Bayar menyusun jadwal pembayarannya. */}
          <div>
            <div className="lbl">{k.fPl}</div>
            {/* Hanya kolom yang unit ini punya harganya: dari sinilah angka
                seluruh simulasi berangkat, dan kolom kosong tidak dapat
                menjadi dasar apa pun. */}
            <select value={plDasar}
                    onChange={(e) => setPlDasar(e.target.value as Skema)}>
              {pl.skema.map((s) => (
                <option key={s} value={s} disabled={!((unit?.harga[s] ?? 0) > 0)}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="lbl">{k.fSkema}</div>
            {/* Dibiarkan "Sesuai PL Harga Dasar", jadwalnya mengikuti kolom
                harga di sebelah kiri. Kolom yang unit ini tidak punya harganya
                tetap boleh dipilih di sini: yang diambil darinya bentuk
                jadwalnya, bukan harganya. */}
            <select value={caraBayar}
                    onChange={(e) => setCaraBayar(e.target.value as Skema)}>
              <option value="">{k.fPlSama}</option>
              {pl.skema.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Penambahan harga berdiri di kiri Diskon: keduanya menggeser
              harga transaksi, dan dibaca berurutan — ditambah dulu, baru
              dipotong. */}
          <div>
            <div className="lbl">{k.fTambah}</div>
            <span className="satuan">
              <input value={tambah} inputMode="decimal"
                     aria-label={k.fTambah}
                     onChange={(e) => setTambah(satuanTambah === "rp"
                       ? rapikanRupiah(e.target.value)
                       : rapikanPersen(e.target.value))} />
              {/* Ganti satuan tidak mengetik ulang angkanya: "25.000.000"
                  yang berpindah ke persen menjadi 25.000.000% — angka yang
                  tidak pernah dimaksudkan siapa pun. Kotaknya dikosongkan,
                  dan yang mengganti satuan mengetik angkanya sekali lagi
                  dalam satuan yang ia pilih. */}
              <select value={satuanTambah} aria-label={`${k.fTambah} — satuan`}
                      onChange={(e) => {
                        setSatuanTambah(e.target.value as "rp" | "persen");
                        setTambah("0");
                      }}>
                <option value="rp">Rp</option>
                <option value="persen">%</option>
              </select>
            </span>
          </div>
          <div>
            <div className="lbl">{k.fDiskon}</div>
            <span className="satuan">
              <input value={diskon} inputMode="decimal"
                     aria-label={k.fDiskon}
                     onChange={(e) => setDiskon(satuanDiskon === "rp"
                       ? rapikanRupiah(e.target.value)
                       : rapikanPersen(e.target.value))} />
              <select value={satuanDiskon} aria-label={`${k.fDiskon} — satuan`}
                      onChange={(e) => {
                        setSatuanDiskon(e.target.value as "rp" | "persen");
                        setDiskon("0");
                      }}>
                <option value="rp">Rp</option>
                <option value="persen">%</option>
              </select>
            </span>
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
                      ...(skemaHarga ? { pl: skemaHarga } : {}),
                      ...(nilaiTambah ? { tambah: String(nilaiTambah) } : {}),
                      diskon: String(diskonPersen), bunga: String(angka(bunga)),
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
                              slug={sesi.project_slug ?? ""} nama={sesi.project_name ?? ""} sembunyi={sembunyi} />
          )}
        </div>
      </div>

      {!unit || !hasil || !dasar ? (
        <div className="banner stop">{!unit ? k.takAda : k.takAdaHarga}</div>
      ) : (
        <>
          {/* Ringkasan: empat angka yang paling sering dicari, sebelum
              rinciannya. */}
          <div className="sim-ringkas sp">
            <div className="sim-kotak">
              <span className="lbl">{k.ksHarga}</span>
              <b>{formatRupiah(Math.round(hasil.hargaTransaksi))}</b>
              <small>{skemaHarga ? k.plBeda(skemaHarga, skema) : skema}{hasil.diskon > 0 &&
                ` · ${k.ksDiskon(persen(hasil.diskon / hasil.hargaPricelist))}`}</small>
            </div>
            <div className="sim-kotak">
              <span className="lbl">{k.ksTagihan}</span>
              <b>{formatRupiah(Math.round(hasil.jumlahTagihan))}</b>
              <small>{k.ksTagihanKet}</small>
            </div>
            <div className="sim-kotak utama">
              <span className="lbl">{k.ksNpv}</span>
              <b>{formatRupiah(Math.round(hasil.jumlahPv))}</b>
              <small>{k.ksNpvKet(persen(hasil.rasioPv))}</small>
            </div>
            <div className="sim-kotak">
              <span className="lbl">{k.ksDtp}</span>
              <b>{formatRupiah(hasil.jumlahDtp)}</b>
              <small>{hasil.tarifDtp === 0 ? k.ksDtpLuar
                : k.ksDtpKet(persen(hasil.tarifDtp, 0))}</small>
            </div>
          </div>

          <div className="dua-kolom sp">
            <div className="sim-tumpuk">
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
                  <tr><td>{k.rTambah}</td>
                      <td className="n">{formatRupiah(hasil.tambahan)}</td></tr>
                  <tr><td>{k.rDiskon}</td>
                      <td className="n">{formatRupiah(hasil.diskon)}</td></tr>
                  <tr><td><b>{k.rTransaksi}</b></td>
                      <td className="n"><b>{formatRupiah(hasil.hargaTransaksi)}</b></td></tr>
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

            <div className="panel">
              <h2>{k.hargaSemua}</h2>
              <table className="tabel-ringkas"><tbody>
                <tr><th>{k.kSkema}</th><th>{k.kHarga}</th></tr>
                {pl.skema.map((s) => (
                  <tr key={s} className={s === plDasar ? "terpilih" : undefined}>
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
                  {/* Porsi tiap termin terhadap harga pricelist yang dipilih.
                      Hanya di layar kerja: lembar cetak dan PDF-nya tidak
                      memuatnya — yang dibaca konsumen adalah nominalnya,
                      bukan cara jadwalnya disusun. */}
                  <th style={{ width: 72 }}>{k.kPersen}</th>
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
                      {/* Baris booking fee tanpa kotak isian: nilainya tetap,
                          jadi persennya di sana hanya laporan — lihat
                          `ubahPersen`. */}
                      <td className="n">{modeUbah && b && i > 0
                        ? <input className="n" inputMode="decimal"
                                 value={b.persenTeks ?? persenAngka(t.nilai)}
                                 onChange={(e) => ubahPersen(i, e.target.value)} />
                        : persenPl(t.nilai)}</td>
                      <td className="n">{modeUbah && b
                        ? <input className="n" inputMode="decimal"
                                 value={b.teks ?? Math.round(b.nilaiAsli).toLocaleString("id-ID")}
                                 onChange={(e) => ubahNilai(i, e.target.value)} />
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
                  <td className="n">{persenPl(hasil.jumlahNilai)}</td>
                  <td className="n">{angkaLembar(hasil.jumlahNilai)}</td>
                  <td className="n">{angkaLembar(hasil.jumlahPv)}</td>
                  <td className="n">{angkaLembar(hasil.jumlahTagihan)}</td>
                  <td className="n">{angkaLembar(hasil.jumlahDtp)}</td>
                  {modeUbah && <td />}
                </tr>
              </tbody></table>
            </div>

          </div>

          <div className="panel sp">
            <h2>
              {k.rJudul}
              {PENGUNGGAH.includes(sesi.role) && riwayat.length > 0 && (
                yakinHapus === "semua" ? (
                  <span className="row" style={{ margin: 0 }}>
                    <span className="hint" style={{ margin: 0 }}>
                      {k.rYakinSemua(riwayat.length)}</span>
                    <button className="pri" onClick={() => void hapusRiwayat("semua")}>
                      {k.rYa}</button>
                    <button onClick={() => setYakinHapus(null)}>{k.rBatal}</button>
                  </span>
                ) : (
                  <button onClick={() => setYakinHapus("semua")}>{k.rHapusSemua}</button>
                )
              )}
            </h2>
            {riwayat.length === 0 ? (
              <p className="hint" style={{ textAlign: "left" }}>{k.rKosong}</p>
            ) : (
              <div className="tscroll" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table className="tabel-ringkas" style={{ whiteSpace: "nowrap" }}><tbody>
                  <tr>
                    <th>{k.rPada}</th><th>{k.rOleh}</th><th>{k.rTgl}</th>
                    <th>{k.rDisk}</th><th>{k.rBunga}</th><th>{k.rCatatan}</th>
                    <th>{k.rTotal}</th><th />
                  </tr>
                  {riwayat.map((v) => (
                    <tr key={v.id}>
                      <td>{waktu(v.disimpan_pada)}</td>
                      <td>{v.disimpan_oleh ?? "—"}</td>
                      <td>{tglPendek(tanggalIso(v.tanggal_booking, booking))}</td>
                      <td className="n">{v.diskon.toLocaleString("id-ID")}%</td>
                      <td className="n">{v.bunga.toLocaleString("id-ID")}%</td>
                      {/* Catatan boleh panjang: dibungkus ke beberapa baris
                          dalam kolom yang sempit, bukan memanjangkan tabel. */}
                      <td className="riwayat-catatan">{v.catatan ?? "—"}</td>
                      <td className="n">
                        {angkaLembar(v.baris.reduce((a, b) => a + b.nilai, 0))}
                      </td>
                      <td>
                        {yakinHapus === v.id ? (
                          <span className="row" style={{ margin: 0, flexWrap: "nowrap",
                                                         justifyContent: "flex-end" }}>
                            <span className="hint" style={{ margin: 0 }}>{k.rYakin}</span>
                            <button className="pri" onClick={() => void hapusRiwayat(v.id)}>
                              {k.rYa}</button>
                            <button onClick={() => setYakinHapus(null)}>{k.rBatal}</button>
                          </span>
                        ) : (
                          <span className="row" style={{ margin: 0, flexWrap: "nowrap",
                                                         justifyContent: "flex-end" }}>
                            <button onClick={() => bukaVersi(v)}>{k.rBuka}</button>
                            {PENGUNGGAH.includes(sesi.role) && (
                              <button onClick={() => setYakinHapus(v.id)}>{k.rHapus}</button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
          </div>


          <div className={`dua-kolom${lewatKpr(skema) && hasil.angsuran.length > 0
                            ? "" : " tunggal"}`}>
            <div className="sim-tumpuk">
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
              {/* Untuk Cash Keras sendiri tidak ada yang dibandingkan, jadi
                  panelnya tidak ditampilkan sama sekali. */}
              {skema !== tunai && (
                <div className="panel">
                  <h2>{k.banding}</h2>
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
                </div>
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
      <PanelTarifDtp tarif={tarifDtp ?? []}
                     bolehUbah={PENGUNGGAH.includes(sesi.role)}
                     onTersimpan={setTarifDtp} />

      {banding && (() => {
        const { v, sebelum, sesudah } = banding;
        // Baris sesudah dicocokkan dengan baris standar menurut urutan baris
        // yang bukan tambahan — tambahan disisipkan di antaranya.
        let asal = -1;
        const pasangan = v.baris.map((b, i) => {
          const t = sesudah.termin[i];
          const s0 = b.tambahan ? null : sebelum.termin[++asal] ?? null;
          return { b, t, s0 };
        });
        const beda = (a: number, b: number) => Math.abs(a - b) >= 0.5;
        const baris = (label: string, x: number, y: number) => (
          <tr><td>{label}</td>
              <td className="n">{angkaLembar(x)}</td>
              <td className="n">{angkaLembar(y)}</td>
              <td className={`n ${beda(x, y) ? "banding-ubah" : ""}`}>
                {beda(x, y) ? (y - x > 0 ? "+" : "−") + angkaLembar(Math.abs(y - x)) : "-"}
              </td></tr>
        );
        return (
          <div className="tirai" onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBanding(null);
          }}>
            <div className="popup lebar" role="dialog" aria-modal="true"
                 aria-label={k.bJudul}
                 style={{ maxWidth: 1120 }}>
              <div className="popup-kepala">
                <h2>
                  {k.bJudul}
                  {v.catatan && <span className="pill">{v.catatan}</span>}
                </h2>
                <button className="tautan" aria-label={k.bTutup}
                        onClick={() => setBanding(null)}>✕</button>
              </div>
              <div className="popup-isi">
                <div className="banding-dua">
                  <div>
                    <h3>{k.bSebelum}</h3>
                    <div className="tscroll">
                      <table className="tabel-jadwal banding"><tbody>
                        <tr><th>{k.kKet}</th><th>{k.kTempo}</th>
                            <th>{k.kJumlah}</th><th>{k.kPv}</th></tr>
                        {sebelum.termin.map((t, i) => (
                          <tr key={i}>
                            <td>{t.ket.toUpperCase()}</td>
                            <td>{tglPendek(t.tgl)}</td>
                            <td className="n">{angkaLembar(t.nilai)}</td>
                            <td className="n">{angkaLembar(t.pv)}</td>
                          </tr>
                        ))}
                        <tr className="baris-total"><td colSpan={2}>{k.total}</td>
                          <td className="n">{angkaLembar(sebelum.jumlahNilai)}</td>
                          <td className="n">{angkaLembar(sebelum.jumlahPv)}</td></tr>
                      </tbody></table>
                    </div>
                  </div>
                  <div>
                    <h3>{k.bSesudah}</h3>
                    <div className="tscroll">
                      <table className="tabel-jadwal banding"><tbody>
                        <tr><th>{k.kKet}</th><th>{k.kTempo}</th>
                            <th>{k.kJumlah}</th><th>{k.kPv}</th><th /></tr>
                        {pasangan.map(({ b, t, s0 }, i) => {
                          const ubahKet = s0 && s0.ket !== t.ket;
                          const ubahTgl = s0 && s0.tgl.getTime() !== t.tgl.getTime();
                          const ubahNilai = s0 && beda(s0.nilai, t.nilai);
                          return (
                            <tr key={i} className={[b.tambahan && "banding-baru",
                                                    b.sembunyi && "baris-sembunyi"]
                                                   .filter(Boolean).join(" ") || undefined}>
                              <td className={ubahKet ? "banding-ubah" : undefined}>
                                {t.ket.toUpperCase()}</td>
                              <td className={ubahTgl ? "banding-ubah" : undefined}>
                                {tglPendek(t.tgl)}</td>
                              <td className={`n ${ubahNilai ? "banding-ubah" : ""}`}>
                                {angkaLembar(t.nilai)}</td>
                              <td className="n">{angkaLembar(t.pv)}</td>
                              <td>
                                {b.tambahan && <span className="pill ok">{k.bBaru}</span>}
                                {b.sembunyi && <span className="pill">{k.bSembunyi}</span>}
                                {(ubahKet || ubahTgl || ubahNilai) &&
                                  <span className="pill warn">{k.bDiubah}</span>}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="baris-total"><td colSpan={2}>{k.total}</td>
                          <td className="n">{angkaLembar(sesudah.jumlahNilai)}</td>
                          <td className="n">{angkaLembar(sesudah.jumlahPv)}</td>
                          <td /></tr>
                      </tbody></table>
                    </div>
                  </div>
                </div>

                <h3 style={{ marginTop: 16 }}>{k.bRingkas}</h3>
                <div className="tscroll">
                  <table className="tabel-jadwal banding"><tbody>
                    <tr><th /><th>{k.bSebelum}</th><th>{k.bSesudah}</th>
                        <th>{k.bSelisih}</th></tr>
                    {baris(k.bNilai, sebelum.jumlahNilai, sesudah.jumlahNilai)}
                    {baris(k.bTotPv, sebelum.jumlahPv, sesudah.jumlahPv)}
                    {baris(k.bTagihan, sebelum.jumlahTagihan, sesudah.jumlahTagihan)}
                    {baris(k.bDtp, sebelum.jumlahDtp, sesudah.jumlahDtp)}
                  </tbody></table>
                </div>
                <p className="hint" style={{ textAlign: "left" }}>{k.bKet}</p>
                <div className="row" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
                  <button className="pri" onClick={() => setBanding(null)}>{k.bTutup}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </Kerangka>
  );
}

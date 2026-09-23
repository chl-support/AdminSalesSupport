"use client";

/**
 * Pengajuan Fee — data penjualan dengan keempat jenis fee pada baris yang sama.
 *
 * Sebelumnya layar ini dibuka satu jenis pada satu waktu, lewat daftar pilihan
 * di atasnya. Bentuk itu memaksa orang membuka empat kali layar yang sama untuk
 * menjawab satu pertanyaan yang selalu muncul bersamaan — unit ini sudah
 * diklaim apa saja, dan yang mana yang masih bisa diajukan. Empat kali membuka
 * juga berarti empat kali mengetik ulang penyaringnya.
 *
 * Karena itu kolom Klaim memuat keempatnya bertumpuk, masing-masing dengan
 * keadaannya sendiri: tombol bila dapat diajukan, nomor klaim bila sudah, dan
 * diam bila belum memenuhi syarat. Sebabnya tidak ditulis empat kali di sana —
 * ia ada di kolom Keterangan paling kanan, karena prasyaratnya melekat pada
 * unitnya, bukan pada jenis fee-nya.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { JENIS, namaJenis, type Jenis } from "./jenis";
import { KATEGORI_JENIS, kategoriAwal, namaKategori } from "@/lib/kategori";

/**
 * Ambang penerimaan yang membuka pengajuan, disalin dari server.
 *
 * Yang menentukan tombolnya muncul atau tidak tetap jawaban server; angka ini
 * hanya dipakai menuliskan kalimatnya di kolom Keterangan.
 */
const AMBANG = 0.20;

/**
 * Angka rupiah tanpa lambangnya.
 *
 * "Rp" disebut sekali di kepala kolom, bukan diulang pada tiap baris. Lambang
 * yang berulang di setiap sel membuat mata harus melewatinya puluhan kali untuk
 * membandingkan dua angka yang sebenarnya berdampingan.
 */
const rp = (n?: number | null) => (n ?? 0).toLocaleString("id-ID");

/**
 * Nilai kontrak tanpa PPN.
 *
 * Tarifnya berganti 1 April 2022: penjualan sebelum tanggal itu memakai 10%,
 * sejak tanggal itu 11%. Yang menentukan tarifnya adalah tanggal kontraknya,
 * bukan tanggal layar ini dibuka — nilai exclude sebuah kontrak 2021 tidak
 * berubah hanya karena dilihat hari ini.
 *
 * Tanggal kontrak yang kosong dianggap sesudah peralihan: seluruh penjualan
 * yang berjalan sekarang memang di atas 2022, dan memakai 10% untuk baris yang
 * tanggalnya belum terisi akan melebihkan nilai exclude-nya.
 */
const PERALIHAN_PPN = "2022-04-01";

function tanpaPpn(incl?: number | null, tglKontrak?: string | null): number {
  const nilai = Number(incl ?? 0);
  if (!nilai) return 0;
  const tgl = tglKontrak ? String(tglKontrak).slice(0, 10) : "";
  const tarif = tgl && tgl < PERALIHAN_PPN ? 1.10 : 1.11;
  return Math.round(nilai / tarif);
}

/**
 * Sebab yang melekat pada unitnya, bukan pada jenis fee-nya.
 *
 * Unit yang dibatalkan, dipindahkan, atau milik management tidak menghasilkan
 * insentif apa pun — jadi ia menjelaskan keempat kolom fee sekaligus, dan
 * ditulis sekali di kolom Keterangan alih-alih empat kali.
 */
const SEBAB_UNIT = {
  id: {
    unit_cancelled: "Unit sudah dibatalkan.",
    unit_moved: "Unit sudah dipindahkan ke unit lain.",
    unit_management: "Unit management — tidak menghasilkan insentif.",
  } as Record<string, string>,
  en: {
    unit_cancelled: "The unit has been cancelled.",
    unit_moved: "The unit has been moved to another unit.",
    unit_management: "Management unit — it earns no incentive.",
  } as Record<string, string>,
};

const KODE_UNIT = ["unit_cancelled", "unit_moved", "unit_management"];

const KATA = {
  id: {
    judul: "Pengajuan Fee",
    pengantar: "Proses Pengajuan Fee Dapat Dilakukan Setelah Penerimaan " +
               "Mencapai Minimal 20% Dari Nilai Kontrak. Fee Yang Memenuhi " +
               "Syarat Dapat Langsung Diajukan.",
    dapatDiklaim: (n: number) => `${n} dapat diklaim`,
    penjualan: (n: number) => `${n} penjualan`,
    galatBaca: "Data penjualan tidak dapat dibaca",
    cari: "Cari (Unit, Konsumen, Sales)",
    // Contohnya diambil dari unit pertama project ini, bukan kode tetap.
    // "mis. BIOBA2" pada project Naraya menyuruh orang mencari kode yang tidak
    // akan pernah ada di sana.
    contohCari: (kode: string) => `mis. ${kode}`,
    tampilkan: "Tampilkan",
    semuaPenjualan: "semua penjualan",
    yangBisa: "yang ada fee dapat diklaim",
    yangSudah: "yang sudah ada klaimnya",
    yangBelum: "yang belum dapat diklaim sama sekali",
    dataPenjualan: "Data penjualan",
    barisDitampilkan: (n: number) => `${n} baris ditampilkan`,
    thUnit: "Unit", thPembeli: "Konsumen", thPenerima: "Sales",
    thKoordinator: "Sales Koordinator",
    thSkema: "Skema Cara Bayar",
    thNilai: "Nilai Kontrak", thInclude: "(Include PPN)",
    thNilaiExcl: "Nilai Kontrak", thExclude: "(Exclude PPN)",
    thPenerimaan: "Penerimaan s/d Bulan Ini", thPersen: "Persentase Lunas",
    thKlaim: "Klaim", thKeterangan: "Keterangan",
    ajukanTerpilih: (n: number) => `Ajukan ${n} fee`,
    ajukanKosong: "Klaim",
    mengajukan: "Mengajukan…",
    gagalAjukan: "Sebagian pengajuan tidak dapat dibuat",
    dialogNama: "Penjelasan pengajuan",
    dialogJudul: (kode: string) => `Ajukan fee untuk unit ${kode}`,
    dialogPengantar:
      "Penjelasan ini tercetak pada Form Pengajuan masing-masing fee, jadi ia " +
      "dibaca yang menandatangani — bukan catatan internal. Boleh dikosongkan.",
    dialogContoh: "mis. Full Payment. Pembayaran sudah mencapai 20%.",
    dialogSamakan: "Samakan untuk semua",
    katJudul: "Kategori penerima", katNama: "Nama terdaftar",
    katKosong: "Belum ada nama terdaftar pada kategori ini.",
    katPetunjuk:
      "Kategorinya ditetapkan di layar Data Marketing. Nama yang belum " +
      "selesai mendaftarkan tanda tangannya tidak muncul di sini.",
    tfJudul: "Tujuan transfer",
    bukuJudul: "Buku rekening",
    bukuTombol: "Unggah buku rekening",
    bukuGanti: "Ganti berkas",
    bukuPetunjuk:
      "Foto atau pindaian halaman depan buku rekening. Ikut terlampir pada " +
      "pengajuannya sebagai bukti rekening; isian di atas tetap diketik " +
      "sendiri.",
    tfNama: "Nama penerima", tfJenis: "Atas nama",
    tfBadan: "Badan Usaha (PT)", tfPribadi: "Pribadi (Perorangan)",
    tfBank: "Bank", tfRekening: "No. rekening", tfCabang: "Kantor cabang",
    tfCatatan:
      "Atas nama siapa rekeningnya menentukan PPh 23 atau PPh 21, jadi " +
      "periksa sebelum diajukan.",
    untukSiapa: (nama: string, peran: string) => `${peran}: ${nama}`,
    dialogAjukan: "Ajukan",
    dialogBatal: "Batal",
    dialogTutup: "Tutup",
    belumTercatat: "belum tercatat",
    dariKontrak: (p: string) => `${p}% dari kontrak`,
    belum: "belum",
    syaratLengkap: "Syarat terpenuhi",
    penerimaanKurang: (p: number) =>
      `Penerimaan baru ${p.toFixed(1)}%, syaratnya ${AMBANG * 100}%`,
    belumMenyebut: (sumber: string) => `Data penjualan belum menyebut ${sumber}.`,
    belumAktif: (nama: string, status: string) =>
      `${nama} berstatus ${status}, belum aktif.`,
    takAdaCocok: "Tidak ada penjualan yang cocok dengan penyaringan ini.",
    memuat: "Memuat…",
    // Tautannya berlaku terbatas, jadi menerbitkan ulang memang perlu —
    // bukan tanda ada yang salah.
  },
  en: {
    judul: "Fee Submission",
    pengantar: "Fee submission can proceed once receipts reach at least 20% " +
               "of the contract value. Fees that meet the requirement can be " +
               "submitted directly.",
    dapatDiklaim: (n: number) => `${n} claimable`,
    penjualan: (n: number) => `${n} sales`,
    galatBaca: "Sales data could not be read",
    cari: "Search (Unit, Customer, Sales)",
    contohCari: (kode: string) => `e.g. ${kode}`,
    tampilkan: "Show",
    semuaPenjualan: "all sales",
    yangBisa: "with a claimable fee",
    yangSudah: "with an existing claim",
    yangBelum: "with nothing claimable yet",
    dataPenjualan: "Sales data",
    barisDitampilkan: (n: number) => `${n} rows shown`,
    thUnit: "Unit", thPembeli: "Customer", thPenerima: "Sales",
    thKoordinator: "Sales Coordinator",
    thSkema: "Payment Scheme",
    thNilai: "Contract Value", thInclude: "(VAT included)",
    thNilaiExcl: "Contract Value", thExclude: "(VAT excluded)",
    thPenerimaan: "Received to Date", thPersen: "Paid Percentage",
    thKlaim: "Claim", thKeterangan: "Notes",
    ajukanTerpilih: (n: number) => `Submit ${n} fees`,
    ajukanKosong: "Claim",
    mengajukan: "Submitting…",
    gagalAjukan: "Some submissions could not be created",
    dialogNama: "Submission notes",
    dialogJudul: (kode: string) => `Submit fees for unit ${kode}`,
    dialogPengantar:
      "These notes are printed on each fee's submission form, so whoever " +
      "signs it will read them — they are not internal remarks. May be left " +
      "blank.",
    dialogContoh: "e.g. Full payment. Payments have reached 20%.",
    dialogSamakan: "Use for all",
    katJudul: "Recipient category", katNama: "Registered name",
    katKosong: "No registered name in this category yet.",
    katPetunjuk:
      "Categories are set on the Marketing Data screen. Names that have not " +
      "finished signature enrolment do not appear here.",
    tfJudul: "Transfer destination",
    bukuJudul: "Bank passbook",
    bukuTombol: "Upload passbook",
    bukuGanti: "Replace file",
    bukuPetunjuk:
      "A photo or scan of the passbook's front page. It is attached to the " +
      "submission as proof of the account; the fields above are still typed " +
      "in by hand.",
    tfNama: "Recipient name", tfJenis: "Held by",
    tfBadan: "Company (PT)", tfPribadi: "Individual",
    tfBank: "Bank", tfRekening: "Account number", tfCabang: "Branch",
    tfCatatan:
      "Whether the account is held by a company or an individual decides " +
      "PPh 23 or PPh 21, so check it before submitting.",
    untukSiapa: (nama: string, peran: string) => `${peran}: ${nama}`,
    dialogAjukan: "Submit",
    dialogBatal: "Cancel",
    dialogTutup: "Close",
    belumTercatat: "not recorded yet",
    dariKontrak: (p: string) => `${p}% of contract`,
    belum: "not yet",
    syaratLengkap: "Requirement met",
    penerimaanKurang: (p: number) =>
      `Received is only ${p.toFixed(1)}%, the requirement is ${AMBANG * 100}%`,
    belumMenyebut: (sumber: string) =>
      `The sales data does not name a ${sumber} yet.`,
    belumAktif: (nama: string, status: string) =>
      `${nama} is ${status}, not active yet.`,
    takAdaCocok: "No sales match this filter.",
    memuat: "Loading…",
  },
};

/** Keadaan satu unit untuk satu jenis fee, sebagaimana dikirim server. */
type Fee = {
  eligible: boolean;
  missing_requirements: string[];
  missing_codes: string[];
  recipient: { id: string | null; name: string | null;
               status: string | null; source: string; type: string | null;
               category: string | null;
               bank?: { holder_name: string | null; holder_type: string | null;
                        bank_name: string | null; account_number: string | null;
                        branch: string | null } | null };
  marketing_missing: boolean; marketing_inactive: boolean;
  claimable: boolean;
  claim: { id: string; claim_number: string; status: string;
           net_amount: number; recipient_role: string } | null;
};

type Unit = {
  id: string; code: string; project_name: string; cluster_code: string;
  buyer_name: string | null; unit_type: string | null;
  payment_scheme: string | null; contract_date: string | null;
  contract_value_incl_vat: number; received_amount: number; status: string;
  agency_name: string | null;
  fees: Record<Jenis, Fee>;
};

/** Nama yang terdaftar, untuk pemilih di bawah kategori. */
type Orang = {
  id: string; full_name: string; category: string | null;
  holder_name: string | null; bank_name: string | null;
  account_number: string | null; branch: string | null;
  holder_type: string | null;
};

/** Isi berkas sebagai data URL, bentuk yang diterima endpoint lampiran. */
function keBase64(berkas: File): Promise<string> {
  return new Promise((selesai, gagal) => {
    const baca = new FileReader();
    baca.onload = () => selesai(String(baca.result ?? ""));
    baca.onerror = () => gagal(baca.error ?? new Error("gagal membaca berkas"));
    baca.readAsDataURL(berkas);
  });
}

type Saring = "semua" | "bisa" | "sudah" | "belum_syarat";

export default function PengajuanFeePage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);

  const [units, setUnits] = useState<Unit[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Saring>("semua");
  /**
   * Fee yang dicentang, sebagai kunci "<unit>:<jenis>".
   *
   * Disimpan datar, bukan bertingkat per unit: yang dibaca selalu "apakah
   * kotak ini tercentang", dan peta bertingkat memaksa tiap pembacaan
   * memeriksa dulu apakah unitnya sudah punya entri.
   */
  const [pilih, setPilih] = useState<Record<string, boolean>>({});
  const [mengajukan, setMengajukan] = useState<string | null>(null);
  /**
   * Unit yang sedang disiapkan pengajuannya, beserta penjelasan tiap fee.
   *
   * Penjelasannya per fee, bukan satu untuk semua: pada formulir aslinya ia
   * berjudul "PENJELASAN PENGAJUAN <jenis>", dan alasan Komisi dapat diajukan
   * memang tidak sama dengan alasan Closing Fee.
   */
  const [siapkan, setSiapkan] =
    useState<{ unit: Unit; jenis: Jenis[] } | null>(null);
  const [penjelasan, setPenjelasan] = useState<Record<string, string>>({});
  /**
   * Tujuan transfer per fee, bukan satu untuk seluruh unit.
   *
   * Overriding dibayarkan kepada tingkat di atas yang menjual — orang lain,
   * dengan rekening lain. Satu isian untuk seluruh unit akan mengirim
   * Overriding ke rekening Sales-nya.
   */
  const [transfer, setTransfer] = useState<Record<string, any>>({});
  /**
   * Kategori penerima dan nama yang dipilih, per jenis fee.
   *
   * Dulu tidak ada yang dipilih: penerima sebuah fee selalu marketing yang
   * tertulis pada data penjualan, dan dialog ini hanya memberitahukannya.
   * Markom, Sales Manager, Sales Koordinator, dan BGB tidak pernah tertulis di
   * sana — fee yang jatuh kepada mereka karena itu tidak punya jalan diajukan.
   */
  const [kategori, setKategori] = useState<Record<string, string>>({});
  const [penerima, setPenerima] = useState<Record<string, string>>({});
  /** Nama yang terdaftar di project ini, sumber pemilih nama di atas. */
  const [orang, setOrang] = useState<Orang[]>([]);
  /**
   * Buku rekening yang diunggah per jenis fee.
   *
   * Disimpan untuk dilampirkan ke klaimnya begitu klaimnya jadi — Komisi
   * memang menuntut salinan rekening pada checklist dokumennya, dan yang
   * barusan diunggah adalah berkas itu juga.
   *
   * Isinya tidak dibaca. Sempat dicoba: tiga kolom tujuan transfer diisikan
   * dari hasil OCR berkasnya. Pada foto buku rekening yang sebenarnya — layar
   * ponsel, miring, dengan latar meja — yang terbaca justru nama kantor
   * cabang sebagai nama penerima. Kolom yang terisi salah lebih berbahaya
   * daripada kolom kosong: yang kosong terlihat, yang terisi dianggap sudah
   * benar dan tidak dibaca ulang. Jadi ketiganya diketik sendiri.
   */
  const [buku, setBuku] = useState<Record<string, {
    nama: string; base64: string; tipe: string;
  }>>({});

  /**
   * Nama yang terisi sendiri pada sebuah kategori.
   *
   * Yang tercatat pada data penjualan didahulukan bila ia memang berada di
   * kategori itu; kalau tidak, satu-satunya nama di sana. Lebih dari satu nama
   * yang sama-sama mungkin dibiarkan kosong: menebak salah satunya berarti
   * menawarkan untuk mentransfer kepada orang yang belum tentu benar, dan
   * pilihan yang sudah terisi hampir tidak pernah dibaca ulang.
   */
  const namaAwal = (calon: Orang[], idTercatat: string | null) => {
    if (idTercatat && calon.some((o) => o.id === idTercatat)) return idTercatat;
    return calon.length === 1 ? calon[0].id : "";
  };

  /** Nama terdaftar pada satu kategori, urut nama. */
  const orangKategori = useCallback(
    (kat: string) => orang.filter((o) => (o.category ?? "sales_inhouse") === kat),
    [orang]);

  /**
   * Isian tujuan transfer dari rekening seseorang yang sudah tercatat.
   *
   * Rekening terakhirnya, bukan kosong: orang yang sama hampir selalu dibayar
   * ke rekening yang sama, dan mengetiknya ulang tiap pengajuan adalah tempat
   * salah ketik nomor rekening lahir.
   */
  const transferDari = (o: Orang | null | undefined, namaCadangan?: string | null) => ({
    holder_name: o?.holder_name ?? o?.full_name ?? namaCadangan ?? "",
    bank_name: o?.bank_name ?? "",
    account_number: o?.account_number ?? "",
    branch: o?.branch ?? "",
    holder_type: o?.holder_type === "company" ? "company" : "individual",
  });

  /**
   * Isian awal tujuan transfer: rekening orang yang terpilih.
   *
   * Mengikuti nama yang terpilih di atasnya, bukan marketing yang tercatat
   * pada data penjualan. Keduanya sama untuk sebagian besar fee, tetapi tidak
   * untuk Overriding — di sana rekening yang tercatat pada unit adalah
   * rekening yang menjual, dan mengisikannya berarti menawarkan untuk
   * mentransfer ke orang yang salah.
   *
   * Yang belum memilih nama mendapat kolom kosong, bukan rekening siapa pun.
   */
  const bawaanTransfer = (u: Unit, daftar: Jenis[],
                          dipilih: Record<string, string> = {}) =>
    Object.fromEntries(daftar.map((slug) => {
      const o = orang.find((x) => x.id === dipilih[slug]);
      if (o) return [slug, transferDari(o)];
      if (dipilih[slug] === "") return [slug, transferDari(null)];
      const b = u.fees[slug]?.recipient?.bank;
      return [slug, {
        holder_name: b?.holder_name ?? u.fees[slug]?.recipient?.name ?? "",
        bank_name: b?.bank_name ?? "",
        account_number: b?.account_number ?? "",
        branch: b?.branch ?? "",
        holder_type: b?.holder_type === "company" ? "company" : "individual",
      }];
    }));

  /**
   * Kategori dan nama yang terpilih lebih dulu saat dialognya dibuka.
   *
   * Yang tercatat pada data penjualan didahulukan selama jenis fee itu memang
   * boleh jatuh kepadanya. Overriding tidak pernah jatuh kepada yang menjual,
   * jadi di sana yang terpilih adalah kategori sah yang pertama — dan namanya
   * dikosongkan sampai orangnya dipilih, bukan diisi orang yang kebetulan
   * berada di urutan teratas.
   */
  const bawaanPenerima = (u: Unit, daftar: Jenis[]) => {
    const kat: Record<string, string> = {};
    const pen: Record<string, string> = {};
    for (const slug of daftar) {
      const r = u.fees[slug]?.recipient;
      const awal = kategoriAwal(slug, r?.category ?? null);
      if (!awal) continue;
      kat[slug] = awal;
      pen[slug] = namaAwal(orangKategori(awal), r?.id ?? null);
    }
    return { kat, pen };
  };

  const toggle = (unitId: string, jenis: Jenis) =>
    setPilih((lama) => {
      const kunci = `${unitId}:${jenis}`;
      const baru = { ...lama };
      if (baru[kunci]) delete baru[kunci]; else baru[kunci] = true;
      return baru;
    });

  const terpilihPada = (unitId: string) =>
    JENIS.filter((j) => pilih[`${unitId}:${j.slug}`]).map((j) => j.slug);

  const muat = useCallback(async () => {
    setBusy(true);
    setGalat(null);
    try {
      // Satu panggilan untuk keempat jenis. Empat panggilan terpisah akan tiba
      // pada saat yang berbeda, dan klaim yang dibuat orang lain di sela-selanya
      // membuat satu baris menyebut dua keadaan sekaligus.
      const res = await fetch("/api/units?eligible_for=all");
      if (res.status === 401) { location.href = "/login"; return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? body.title ?? `HTTP ${res.status}`);
      setUnits(body);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Nama yang terdaftar, dibaca sekali untuk seluruh layar.
   *
   * Bukan tiap kali dialognya dibuka: daftarnya sama untuk setiap unit, dan
   * memuatnya ulang pada setiap klik membuat pemilih namanya kosong sekejap
   * tepat saat orang hendak memilih.
   *
   * Gagalnya tidak menghentikan layar. Yang hilang hanya pemilih namanya;
   * daftar penjualan di belakangnya tetap terbaca, dan galatnya muncul saat
   * dialognya dibuka — di sanalah ia berarti.
   */
  const muatOrang = useCallback(async () => {
    try {
      const res = await fetch("/api/marketings/kategori");
      if (!res.ok) return;
      const b = await res.json().catch(() => ({}));
      setOrang(b.marketings ?? []);
    } catch { /* biar — pemilihnya kosong, dan itu terlihat */ }
  }, []);

  /**
   * Simpan buku rekening yang diunggah, untuk dilampirkan pada klaimnya.
   *
   * Hanya disimpan — tidak dibaca. Lihat alasannya pada keterangan state
   * `buku` di atas.
   */
  const simpanBuku = async (slug: string, berkas: File) => {
    const isi = await keBase64(berkas);
    setBuku((lama) => ({ ...lama,
      [slug]: { nama: berkas.name, base64: isi, tipe: berkas.type } }));
  };

  // Menunggu sesi lebih dulu: memanggil /api/units sebelum identitasnya pasti
  // hanya menghasilkan 401 dan pengalihan yang tidak perlu.
  useEffect(() => { if (sesi) { void muat(); void muatOrang(); } },
            [sesi, muat, muatOrang]);

  /**
   * Ajukan seluruh fee yang dicentang pada satu unit.
   *
   * Setelah jadi, layar berpindah ke Approval / Persetujuan — bukan membuka
   * jendela pratinjau. Yang mengajukan empat fee sekaligus lebih dulu perlu
   * melihat apa yang barusan ia buat sebagai daftar; pratinjau formulirnya
   * dibuka dari sana, per dokumen, saat memang mau diperiksa.
   *
   * Pengajuannya berurutan, bukan serentak. Keempatnya menyentuh unit yang
   * sama, dan mengirim empat permintaan sekaligus membuat pemeriksaan
   * anti-duplikat saling berlomba.
   */
  const ajukan = async (u: Unit, jenisTerpilih: Jenis[],
                        catatan: Record<string, string>,
                        tujuan: Record<string, any>) => {
    if (!jenisTerpilih.length) return;

    setMengajukan(u.id);
    setGalat(null);

    const dibuat: string[] = [];
    const gagal: string[] = [];
    try {
      for (const slug of jenisTerpilih) {
        const f = u.fees[slug];
        // Penerimanya yang dipilih pada dialog, bukan lagi yang tercatat pada
        // data penjualan. Yang tercatat itu tetap menjadi pilihan awalnya —
        // ia benar pada sebagian besar pengajuan — tetapi Markom, Sales
        // Manager, Sales Koordinator, dan BGB tidak pernah tertulis di sana.
        const kat = kategori[slug] ?? "";
        const idPenerima = penerima[slug] || f?.recipient?.id;
        if (!idPenerima) {
          gagal.push(`${namaJenis(slug, bahasa)}: ${k.katKosong}`);
          continue;
        }
        const res = await fetch("/api/claims", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unit_id: u.id,
            marketing_id: idPenerima,
            claim_type: slug,
            // Peran penerima = kategori yang dipilih. Keduanya memang satu hal
            // yang sama, dan kodenya pun sama persis dengan enum
            // recipient_role — lihat @/lib/kategori.
            recipient_role: kat ||
              (slug === "overriding" ? "sales_manager_inhouse"
                : f?.recipient?.type === "agent" ? "agent" : "sales_inhouse"),
            // Tingkat overriding hanya disebut bila kategorinya memang tingkat
            // itu. Menyebut 'sales_manager_inhouse' untuk Overriding yang
            // jatuh kepada Markom akan mencari tarif dengan dua syarat yang
            // saling bertentangan, dan tidak menemukan satu pun.
            overriding_level: slug === "overriding" &&
                              kat === "sales_manager_inhouse"
              ? "sales_manager_inhouse" : null,
            notes: (catatan[slug] ?? "").trim() || null,
            transfer: tujuan[slug] ?? null,
          }),
        });
        if (res.status === 401) { location.href = "/login"; return; }
        const b = await res.json().catch(() => ({}));
        if (!res.ok) {
          gagal.push(`${namaJenis(slug, bahasa)}: ${b.detail ?? b.title ?? res.status}`);
          continue;
        }
        dibuat.push(b.id);

        // Buku rekening yang tadi dibaca ikut menempel pada klaimnya. Ia
        // memang dokumen yang diminta checklist Komisi, dan yang barusan
        // diunggah adalah berkas itu juga — memintanya sekali lagi di layar
        // berikutnya berarti meminta berkas yang sama dua kali.
        //
        // Gagalnya tidak membatalkan klaim yang sudah jadi: lampirannya masih
        // dapat diunggah dari layar pratinjau, klaimnya tidak dapat dibuat
        // ulang.
        const bk = buku[slug];
        if (bk) {
          try {
            await fetch(`/api/claims/${b.id}/documents`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                checklist_item: "bank_account",
                file_name: bk.nama, content_base64: bk.base64,
              }),
            });
          } catch { /* biar — lihat alasannya di atas */ }
        }
      }

      if (gagal.length) setGalat(`${k.gagalAjukan} — ${gagal.join(" · ")}`);

      setPilih((lama) => {
        const baru = { ...lama };
        for (const slug of jenisTerpilih) delete baru[`${u.id}:${slug}`];
        return baru;
      });
      setSiapkan(null);
      setPenjelasan({});
      setTransfer({});
      setKategori({});
      setPenerima({});
      setBuku({});

      // Berpindah hanya bila memang ada yang jadi. Kalau seluruhnya gagal,
      // yang perlu dibaca adalah pesan galatnya di layar ini — bukan daftar
      // kosong di layar lain.
      if (dibuat.length && !gagal.length) { location.href = "/persetujuan"; return; }
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setMengajukan(null); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  const q = cari.trim().toLowerCase();
  const adaKlaim = (u: Unit) => JENIS.some((j) => u.fees[j.slug]?.claim);
  const adaBisa = (u: Unit) => JENIS.some((j) => u.fees[j.slug]?.claimable);

  /**
   * Contoh pada kotak cari: kode unit pertama pada project ini.
   *
   * Diambil dari datanya sendiri supaya tidak pernah menyebut kode dari
   * project lain. Saat daftarnya masih kosong, kotaknya dibiarkan tanpa
   * contoh — menebak bentuk kodenya berarti mengarang.
   */
  const contoh = units[0]?.code ?? "";

  const terlihat = units.filter((u) => {
    // Yang dicari sama dengan yang disebut judul kotaknya: unit, konsumen,
    // dan nama Sales beserta koordinatornya. Menyaring diam-diam atas kolom
    // yang tidak disebut membuat hasil pencarian tidak dapat dijelaskan.
    if (q && ![u.code, u.buyer_name,
               u.fees.closing_fee?.recipient?.name,
               u.fees.overriding?.recipient?.name]
                .some((v) => v?.toLowerCase().includes(q))) return false;
    if (saring === "bisa") return adaBisa(u);
    if (saring === "sudah") return adaKlaim(u);
    if (saring === "belum_syarat") return !adaKlaim(u) && !adaBisa(u);
    return true;
  });

  // Dihitung per pasangan unit–jenis, bukan per unit: satu unit dapat memenuhi
  // syarat Closing Fee tetapi belum Overriding, dan menghitungnya sebagai satu
  // akan menyebut lebih sedikit pekerjaan daripada yang sebenarnya menunggu.
  const bisa = units.reduce(
    (n, u) => n + JENIS.filter((j) => u.fees[j.slug]?.claimable).length, 0);

  return (
    <Kerangka sesi={sesi} lebar judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      <div className="row sp">
        <span className="pill">{k.dapatDiklaim(bisa)}</span>
        <span className="pill">{k.penjualan(units.length)}</span>
      </div>

      {galat && (
        <div className="banner stop">
          <b>{k.galatBaca}</b>
          {galat}
        </div>
      )}

      <div className="panel sp">
        <div className="filters">
          <div>
            <div className="lbl">{k.cari}</div>
            <input value={cari}
                   placeholder={contoh ? k.contohCari(contoh) : ""}
                   onChange={(e) => setCari(e.target.value)} />
          </div>
          <div>
            <div className="lbl">{k.tampilkan}</div>
            <select value={saring}
                    onChange={(e) => setSaring(e.target.value as Saring)}>
              <option value="semua">{k.semuaPenjualan}</option>
              <option value="bisa">{k.yangBisa}</option>
              <option value="sudah">{k.yangSudah}</option>
              <option value="belum_syarat">{k.yangBelum}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          {k.dataPenjualan}
          <span className="pill">{k.barisDitampilkan(terlihat.length)}</span>
        </h2>

        <div className="tscroll">
          <table className="tabel-penjualan">
            <tbody>
              <tr>
                <th className="sel-unit">{k.thUnit}</th>
                <th>{k.thPembeli}</th>
                <th className="sel-penerima">{k.thPenerima}</th>
                <th className="sel-penerima">{k.thKoordinator}</th>
                <th className="sel-skema">{k.thSkema}</th>
                {/* Keterangan PPN di kepala kolom, pada barisnya sendiri:
                    dua kolom bernama "Nilai Kontrak" berdampingan hanya dapat
                    dibedakan dari baris keduanya. */}
                <th>{k.thNilai}<br /><span className="satuan">{k.thInclude}</span></th>
                <th>
                  {k.thNilaiExcl}<br /><span className="satuan">{k.thExclude}</span>
                </th>
                <th>{k.thPenerimaan}</th>
                <th>{k.thPersen}</th>
                <th className="sel-fee">{k.thKlaim}</th>
                <th className="sel-ket">{k.thKeterangan}</th>
              </tr>

              {terlihat.map((u) => {
                // Penerima berbeda antar jenis: Overriding membayar tingkat di
                // atas yang menjual. Keduanya disebut supaya kolom ini tidak
                // diam-diam hanya mewakili tiga dari empat baris di sebelahnya.
                const sales = u.fees.closing_fee?.recipient;
                const atas = u.fees.overriding?.recipient;
                // Satu syarat saja: penerimaan sudah mencapai ambangnya.
                // Persentasenya dihitung di sini juga, bukan hanya dinilai
                // lulus-tidaknya — yang belum cukup perlu tahu tinggal berapa.
                const persen = u.contract_value_incl_vat
                  ? (u.received_amount / u.contract_value_incl_vat) * 100 : 0;
                const cukup = u.contract_value_incl_vat > 0 &&
                              persen >= AMBANG * 100;
                // Sebab yang melekat pada unitnya diambil dari jenis mana pun —
                // ia sama untuk keempatnya.
                const sebabUnit = (u.fees.closing_fee?.missing_codes ?? [])
                  .filter((c) => KODE_UNIT.includes(c));

                return (
                  <tr key={u.id}>
                    <td className="sel-unit"><b>{u.code}</b></td>
                    <td>{u.buyer_name ?? "—"}</td>
                    {/* Sales dan koordinatornya berdiri di kolom masing-masing.
                        Dua nama bertumpuk dalam satu kolom tidak menyebut siapa
                        yang mana, dan yang membacanya harus hafal urutannya. */}
                    <td className="sel-penerima">
                      {sales?.name ?? (
                        <span style={{ color: "var(--mut)" }}>{k.belumTercatat}</span>
                      )}
                    </td>
                    <td className="sel-penerima">
                      {atas?.name && atas.id !== sales?.id ? atas.name : (
                        <span style={{ color: "var(--mut)" }}>—</span>
                      )}
                    </td>
                    <td className="sel-skema">{u.payment_scheme ?? "—"}</td>
                    <td className="n">{rp(u.contract_value_incl_vat)}</td>
                    <td className="n">
                      {rp(tanpaPpn(u.contract_value_incl_vat, u.contract_date))}
                    </td>
                    <td className="n">{rp(u.received_amount)}</td>
                    {/* Persentase lunas berdiri sebagai kolom tersendiri:
                        Komisi dihitung dari persentase pembayaran, jadi ia
                        angka yang dibaca, bukan keterangan di bawah angka
                        lain. */}
                    <td className="n">
                      {u.contract_value_incl_vat
                        ? `${persen.toFixed(1)}%`
                        : <span style={{ color: "var(--mut)" }}>—</span>}
                    </td>

                    {/* Keempat jenis fee, masing-masing dengan keadaannya. */}
                    <td className="sel-fee">
                      <div className="fee-kolom">
                        {JENIS.map((j) => {
                          const f = u.fees[j.slug];
                          const kunci = `${u.id}:${j.slug}`;
                          return (
                            <div key={j.slug} className="fee-baris">
                              {/* Kotak centang hanya untuk yang memang dapat
                                  diajukan. Kotak yang dapat dicentang tetapi
                                  tidak menghasilkan apa-apa saat tombolnya
                                  ditekan adalah janji yang tidak ditepati. */}
                              <label className="fee-pilih">
                                <input type="checkbox"
                                       disabled={!f?.claimable}
                                       checked={Boolean(pilih[kunci])}
                                       onChange={() => toggle(u.id, j.slug)} />
                                <span className="fee-nama">
                                  {namaJenis(j.slug, bahasa)}
                                </span>
                              </label>
                              {f?.claim ? (
                                <span className="fee-keadaan">
                                  <span className="pill ok">
                                    {f.claim.claim_number}
                                  </span>
                                  <span className="fee-status">
                                    {f.claim.status}
                                  </span>
                                </span>
                              ) : f?.claimable ? null : (
                                <span className="fee-belum">{k.belum}</span>
                              )}
                            </div>
                          );
                        })}

                        {/* Satu tombol untuk seluruh yang dicentang. Tombol per
                            fee memaksa empat kali bolak-balik untuk satu unit,
                            padahal keempatnya diajukan bersamaan. */}
                        <div className="fee-kaki">
                          <button className="pri"
                                  disabled={!terpilihPada(u.id).length ||
                                            mengajukan !== null}
                                  onClick={() => {
                                    const daftar = terpilihPada(u.id);
                                    const { kat, pen } = bawaanPenerima(u, daftar);
                                    setPenjelasan({});
                                    setTransfer(bawaanTransfer(u, daftar, pen));
                                    setKategori(kat);
                                    setPenerima(pen);
                                    setBuku({});
                                    setSiapkan({ unit: u, jenis: daftar });
                                  }}>
                            {mengajukan === u.id ? k.mengajukan
                              : terpilihPada(u.id).length
                                ? k.ajukanTerpilih(terpilihPada(u.id).length)
                                : k.ajukanKosong}
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Keterangan: prasyarat yang melekat pada unitnya, ditulis
                        sekali. Menaruhnya di sebelah tiap jenis fee berarti
                        kalimat yang sama diulang sampai empat kali pada satu
                        baris, dan yang membacanya berhenti membacanya. */}
                    <td className="sel-ket">
                      {sebabUnit.map((c) => (
                        <div key={c} className="pill stop"
                             style={{ marginBottom: 4 }}>
                          {SEBAB_UNIT[bahasa][c]}
                        </div>
                      ))}

                      {/* Saat unitnya sendiri yang menghalangi — dibatalkan,
                          dipindahkan, unit management — keadaan penerimaannya
                          tidak disebut. Angka yang sudah memenuhi syarat
                          berdampingan dengan unit yang dibatalkan terbaca
                          seolah tinggal selangkah lagi, padahal tidak ada
                          langkah yang tersisa. */}
                      {sebabUnit.length === 0 && (
                        cukup ? (
                          <span className="pill ok">{k.syaratLengkap}</span>
                        ) : (
                          <span className="pill warn">
                            {k.penerimaanKurang(persen)}
                          </span>
                        )
                      )}

                      <ul className="syarat-daftar">
                        {u.fees.closing_fee?.marketing_missing && (
                          <li className="tidak">
                            <span aria-hidden="true">✕</span>{" "}
                            {k.belumMenyebut(sales?.source ?? "Sales")}
                          </li>
                        )}
                        {u.fees.closing_fee?.marketing_inactive && (
                          <li className="tidak">
                            <span aria-hidden="true">✕</span>{" "}
                            {k.belumAktif(sales?.name ?? "—",
                                          sales?.status ?? "—")}
                          </li>
                        )}
                      </ul>
                    </td>
                  </tr>
                );
              })}

              {!terlihat.length && !busy && (
                <tr>
                  <td colSpan={11} style={{ color: "var(--mut)" }}>
                    {k.takAdaCocok}
                  </td>
                </tr>
              )}
              {busy && (
                <tr>
                  <td colSpan={11} style={{ color: "var(--mut)" }}>{k.memuat}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Penjelasan pengajuan diisi sebelum jendela pratinjau terbuka.
          Jendelanya dibuka dari tombol di dalam dialog ini — tekanan jari itu
          yang mengizinkan window.open; dibuka dari proses yang berjalan
          sesudahnya, ia diblokir sebagai pop-up. */}
      {siapkan && (
        <div className="tirai"
             onMouseDown={(e) => {
               if (e.target === e.currentTarget && !mengajukan) setSiapkan(null);
             }}>
          <div className="popup lebar" role="dialog" aria-modal="true"
               aria-label={k.dialogNama} style={{ maxWidth: 560 }}>
            <div className="popup-kepala">
              <h2>
                {k.dialogJudul(siapkan.unit.code)}
                <span className="pill">
                  {k.ajukanTerpilih(siapkan.jenis.length)}
                </span>
              </h2>
              <button className="tautan" aria-label={k.dialogTutup}
                      disabled={Boolean(mengajukan)}
                      onClick={() => setSiapkan(null)}>✕</button>
            </div>

            <div className="popup-isi">
              <p className="hint" style={{ textAlign: "left", margin: "0 0 12px" }}>
                {k.dialogPengantar}
              </p>

              {siapkan.jenis.map((slug, i) => {
                const pen = siapkan.unit.fees[slug]?.recipient;
                const tf = transfer[slug] ?? {};
                const ubah = (kolom: string, nilai: string) =>
                  setTransfer({ ...transfer,
                                [slug]: { ...tf, [kolom]: nilai } });
                const kat = kategori[slug] ?? "";
                const calon = orangKategori(kat);
                return (
                  <div key={slug} className="blok-fee">
                    <h4>{namaJenis(slug, bahasa)}</h4>

                    {/* Kategori lebih dulu, nama di bawahnya. Urutannya bukan
                        selera: kategorinya yang menentukan nama siapa saja
                        yang boleh muncul, dan daftar nama yang berdiri di atas
                        pemilih kategorinya akan berubah isi setelah dibaca. */}
                    <div className="filters rapat">
                      <div>
                        <div className="lbl">{k.katJudul}</div>
                        <select value={kat}
                                onChange={(e) => {
                                  const baru = e.target.value;
                                  const isi = orangKategori(baru);
                                  // Nama ikut berpindah bersama kategorinya.
                                  // Dibiarkan, yang tertinggal adalah nama dari
                                  // kategori sebelumnya — dan tujuan transfer
                                  // di bawahnya tetap menunjuk rekeningnya.
                                  const dipilih = namaAwal(isi, pen?.id ?? null);
                                  setKategori({ ...kategori, [slug]: baru });
                                  setPenerima({ ...penerima, [slug]: dipilih });
                                  setTransfer({ ...transfer,
                                    [slug]: transferDari(
                                      isi.find((o) => o.id === dipilih)) });
                                }}>
                          {(KATEGORI_JENIS[slug] ?? []).map((kd) => (
                            <option key={kd} value={kd}>
                              {namaKategori(kd, bahasa)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="lbl">{k.katNama}</div>
                        {calon.length ? (
                          <select value={penerima[slug] ?? ""}
                                  onChange={(e) => {
                                    const id = e.target.value;
                                    setPenerima({ ...penerima, [slug]: id });
                                    setTransfer({ ...transfer,
                                      [slug]: transferDari(
                                        calon.find((o) => o.id === id)) });
                                  }}>
                            <option value="">—</option>
                            {calon.map((o) => (
                              <option key={o.id} value={o.id}>{o.full_name}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="hint" style={{ textAlign: "left", margin: 0 }}>
                            {k.katKosong}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="lbl">{k.dialogNama}</div>
                    <textarea value={penjelasan[slug] ?? ""}
                              placeholder={k.dialogContoh}
                              style={{ width: "100%", minHeight: 52 }}
                              onChange={(e) => setPenjelasan(
                                { ...penjelasan, [slug]: e.target.value })} />
                    {/* Menyalin penjelasan pertama ke sisanya. Keempatnya
                        sering sama persis, dan mengetiknya empat kali membuat
                        orang menyingkatnya sampai tidak lagi menjelaskan apa
                        pun. Tujuan transfer sengaja tidak ikut disalin:
                        penerimanya memang berbeda orang. */}
                    {i === 0 && siapkan.jenis.length > 1 && (
                      <button style={{ marginTop: 6, padding: "2px 8px" }}
                              disabled={!(penjelasan[slug] ?? "").trim()}
                              onClick={() => setPenjelasan(
                                Object.fromEntries(siapkan.jenis.map(
                                  (j) => [j, penjelasan[slug] ?? ""])))}>
                        {k.dialogSamakan}
                      </button>
                    )}

                    <div className="lbl" style={{ marginTop: 12 }}>
                      {k.tfJudul}
                    </div>

                    <div className="filters rapat">
                      <div>
                        <div className="lbl">{k.tfNama}</div>
                        <input value={tf.holder_name ?? ""}
                               onChange={(e) => ubah("holder_name", e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">{k.tfJenis}</div>
                        <select value={tf.holder_type ?? "individual"}
                                onChange={(e) => ubah("holder_type", e.target.value)}>
                          <option value="company">{k.tfBadan}</option>
                          <option value="individual">{k.tfPribadi}</option>
                        </select>
                      </div>
                      <div>
                        <div className="lbl">{k.tfBank}</div>
                        <input value={tf.bank_name ?? ""}
                               onChange={(e) => ubah("bank_name", e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">{k.tfRekening}</div>
                        <input value={tf.account_number ?? ""} inputMode="numeric"
                               onChange={(e) => ubah("account_number", e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">{k.tfCabang}</div>
                        <input value={tf.branch ?? ""}
                               onChange={(e) => ubah("branch", e.target.value)} />
                      </div>
                    </div>

                    {/* Buku rekening: di bawah isian yang diketik, bukan di
                        atasnya. Ia bukan sumber isian itu — hanya bukti yang
                        ikut terlampir — dan yang berdiri lebih dulu di layar
                        terbaca sebagai langkah pertama yang harus dikerjakan
                        sebelum yang di bawahnya. */}
                    <div className="lbl" style={{ marginTop: 12 }}>
                      {k.bukuJudul}
                    </div>
                    <div className="row" style={{ margin: "4px 0 0" }}>
                      <label className="tombol-berkas">
                        {buku[slug] ? k.bukuGanti : k.bukuTombol}
                        <input type="file" hidden
                               accept="image/*,application/pdf"
                               onChange={(e) => {
                                 const f = e.target.files?.[0];
                                 // Nilainya dikosongkan supaya berkas yang sama
                                 // dapat dipilih dua kali berturut-turut —
                                 // yang pertama kurang terbaca, yang kedua
                                 // setelah difoto ulang dengan nama yang sama.
                                 e.target.value = "";
                                 if (f) void simpanBuku(slug, f);
                               }} />
                      </label>
                      {buku[slug] && (
                        <span className="hint" style={{ margin: 0 }}>
                          {buku[slug].nama}
                        </span>
                      )}
                    </div>
                    <p className="hint" style={{ textAlign: "left", margin: "6px 0 0" }}>
                      {k.bukuPetunjuk}
                    </p>
                  </div>
                );
              })}

              <p className="hint" style={{ textAlign: "left" }}>
                {k.tfCatatan}
              </p>
            </div>

            <div className="popup-kaki">
              <div className="row">
                <button className="pri" disabled={Boolean(mengajukan)}
                        onClick={() => void ajukan(siapkan.unit, siapkan.jenis,
                                                   penjelasan, transfer)}>
                  {mengajukan ? k.mengajukan : k.dialogAjukan}
                </button>
                <button disabled={Boolean(mengajukan)}
                        onClick={() => setSiapkan(null)}>{k.dialogBatal}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Kerangka>
  );
}

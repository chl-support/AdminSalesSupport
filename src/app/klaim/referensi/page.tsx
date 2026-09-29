"use client";

/**
 * Referensi Pengajuan — memo yang menjadi dasar pengajuan fee.
 *
 * Satu layar, dua bagian. Di atas kotak seret-dan-lepas yang menerima
 * beberapa berkas memo sekaligus; tiap berkas dibaca sendiri — teksnya bila
 * ada, OCR bila pindaian — lalu tersimpan sebagai memo beserta rincian
 * tabel skemanya. Di bawahnya seluruh baris rincian itu berdiri sebagai satu
 * rekapitulasi: nomor memo, tanggal, perihal, periode program, skema,
 * kategori, nilai komisi, keterangan.
 *
 * Baris hasil bacaan berhenti sebagai USULAN. OCR salah baca satu digit tanpa
 * memberi tanda apa pun, dan angka pada kolom ini menentukan berapa uang
 * keluar — jadi ia baru menjadi acuan setelah ada orang yang memeriksanya dan
 * menekan "Berlakukan". Di sanalah barisnya diterjemahkan menjadi skema
 * insentif, jalur yang sudah dipakai seluruh perhitungan.
 *
 * Yang menolak pengajuan bukan layar ini melainkan kuncinya — setelan
 * `skema_wajib`. Selama menyala, klaim tanpa skema yang berlaku pada tanggal
 * kontraknya tidak dapat dihitung sama sekali. Kuncinya dibuka dan ditutup
 * Admin IT, untuk keadaan yang memang tidak dapat menunggu memonya.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../../bahasa";
import { bedahSkema } from "@/lib/memo-skema";
import { KATEGORI_JENIS, namaKategori } from "@/lib/kategori";
import { bacaPindaian, kataTeksPdf, type Kemajuan } from "../../memo/ocr";
import { pasangBerkas, periksaUkuran, perluDipecah, titipBerkas }
  from "../../memo/kirim";
import { Kerangka, MemeriksaSesi } from "../../kerangka";
import { useSesi } from "../../session";
import { namaJenis } from "../jenis";

const JENIS = ["closing_fee", "commission", "cash_reward",
               "continuity_reward", "overriding"] as const;

const KATA = {
  id: {
    judul: "Referensi Pengajuan",
    pengantar:
      "Memo Yang Menjadi Dasar Pengajuan Fee. Baris Yang Sudah Diberlakukan " +
      "Menjadi Acuan Nilai; Yang Belum, Belum Mengikat Apa Pun.",
    galat: "Tidak dapat dikerjakan",
    unggahJudul: "UNGGAH MEMO",
    seret: "Unggah Referensi Memo",
    pilih: "Pilih File",
    jenisBerkas: "PDF, Word, Excel, atau gambar · Maks. 10 MB per file",
    membaca: (n: string) => `Membaca ${n}…`,
    ocrSiap: "Menyiapkan pembaca tulisan…",
    ocrGambar: (h: number, d: number) => `Menggambar halaman ${h} dari ${d}…`,
    ocrBaca: (p: number) => `Membaca tulisan… ${p}%`,
    menitip: (p: number) => `Mengirim berkas… ${p}%`,
    menyimpan: (n: string) => `Menyimpan ${n}…`,
    selesai: (n: number, b: number) =>
      `${n} memo tersimpan, ${b} baris skema terbaca.`,
    sebagian: (n: number, g: number) =>
      `${n} memo tersimpan, ${g} berkas gagal.`,
    takAdaBaris:
      "Berkasnya tersimpan, tetapi tabel skemanya tidak terbaca. Buka Memo " +
      "Approval untuk memeriksa dan membetulkannya.",

    tabel: "Ringkasan Memo",
    kNo: "No.", kNoMemo: "No. Memo", kTanggal: "Tanggal", kPerihal: "Perihal",
    kPeriode: "Periode Program", kSkema: "Skema", kKategori: "Kategori",
    kNilai: "Nilai Komisi", kKeterangan: "Keterangan",
    kKeadaan: "Keadaan", kTindakan: "Tindakan",
    usulan: "Usulan", berlaku: "Berlaku",
    kosong: "Belum ada memo pada project ini. Unggah memonya di atas.",
    memuat: "Memuat…",
    berlakukan: "Berlakukan", cabut: "Cabut",
    // Angkanya tetap di belakang sebutannya: kotak penghitung tanpa
    // angkanya hanya menyebut ada dua keadaan, bukan berapa banyak yang
    // ada pada masing-masing — dan itulah satu-satunya hal yang dicari
    // orang saat meliriknya.
    pBerlaku: (n: number) => `✅ Referensi Aktif · ${n}`,
    pUsulan: (n: number) => `📋 Referensi Tersedia · ${n}`,

    kunciJudul: "Kunci pengajuan fee",
    kunciNyalakan: "Kunci", kunciLonggarkan: "Longgarkan",
    kunciBerubah: (on: boolean): string =>
      on ? "Kunci dinyalakan." : "Kunci dilonggarkan.",

    dJudul: "Berlakukan baris rujukan",
    dPengantar:
      "Periksa angkanya terhadap memo aslinya sebelum diberlakukan. Yang " +
      "ditulis di sini yang dipakai menghitung, bukan hasil bacaan mesin.",
    dBaris: "Baris memo", dJenis: "Jenis fee", dKategori: "Kategori penerima",
    dCara: "Cara hitung", dPersen: "Persentase (%)",
    dNominal: "Nominal tetap (Rp)", dBersih: "Nominal ini nilai bersih",
    dDasar: "Dasar perhitungan",
    dInclude: "Nilai kontrak (include PPN)",
    dExclude: "Nilai kontrak (exclude PPN)",
    dDari: "Berlaku dari", dSampai: "Berlaku sampai",
    dPersenPilih: "Persentase", dNominalPilih: "Nominal tetap",
    dSimpan: "Berlakukan", dBatal: "Batal",
    dTanggalWajib: "Berlaku dari harus diisi.",
    berlakuKabar: "Baris diberlakukan sebagai skema insentif.",
    cabutKabar: "Pemberlakuan dicabut; barisnya kembali menjadi usulan.",
    cabutTanya: "Cabut pemberlakuan baris ini?",
  },
  en: {
    judul: "Submission Reference",
    pengantar:
      "The memos fee submissions rest on. Rows already in force set the " +
      "rates; rows not yet in force bind nothing.",
    galat: "This could not be done",
    unggahJudul: "UPLOAD MEMOS",
    seret: "Upload memo reference",
    pilih: "Choose files",
    jenisBerkas: "PDF, Word, Excel or image · 10 MB per file at most",
    membaca: (n: string) => `Reading ${n}…`,
    ocrSiap: "Preparing the text reader…",
    ocrGambar: (h: number, d: number) => `Rendering page ${h} of ${d}…`,
    ocrBaca: (p: number) => `Reading text… ${p}%`,
    menitip: (p: number) => `Uploading… ${p}%`,
    menyimpan: (n: string) => `Saving ${n}…`,
    selesai: (n: number, b: number) =>
      `${n} memos saved, ${b} scheme rows read.`,
    sebagian: (n: number, g: number) => `${n} memos saved, ${g} files failed.`,
    takAdaBaris:
      "The file was saved, but its scheme table could not be read. Open Memo " +
      "Approval to check and correct it.",

    tabel: "Memo Summary",
    kNo: "No.", kNoMemo: "Memo no.", kTanggal: "Date", kPerihal: "Subject",
    kPeriode: "Programme period", kSkema: "Scheme", kKategori: "Category",
    kNilai: "Commission value", kKeterangan: "Remarks",
    kKeadaan: "State", kTindakan: "Action",
    usulan: "Proposed", berlaku: "In force",
    kosong: "No memos on this project yet. Upload them above.",
    memuat: "Loading…",
    berlakukan: "Put in force", cabut: "Withdraw",
    pBerlaku: (n: number) => `✅ Active reference · ${n}`,
    pUsulan: (n: number) => `📋 Available reference · ${n}`,

    kunciJudul: "Fee submission lock",
    kunciNyalakan: "Lock", kunciLonggarkan: "Loosen",
    kunciBerubah: (on: boolean): string =>
      on ? "Lock turned on." : "Lock loosened.",

    dJudul: "Put a reference row in force",
    dPengantar:
      "Check the figures against the memo itself first. What is typed here " +
      "is what the calculation uses — not what the machine read.",
    dBaris: "Memo row", dJenis: "Fee type", dKategori: "Recipient category",
    dCara: "How it is computed", dPersen: "Percentage (%)",
    dNominal: "Flat amount (Rp)", dBersih: "This amount is the net figure",
    dDasar: "Calculation basis",
    dInclude: "Contract value (incl. VAT)",
    dExclude: "Contract value (excl. VAT)",
    dDari: "In force from", dSampai: "In force until",
    dPersenPilih: "Percentage", dNominalPilih: "Flat amount",
    dSimpan: "Put in force", dBatal: "Cancel",
    dTanggalWajib: "\"In force from\" is required.",
    berlakuKabar: "The row is now an incentive scheme.",
    cabutKabar: "Withdrawn; the row is a proposal again.",
    cabutTanya: "Withdraw this row from force?",
  },
};

type Baris = {
  id: string; memo_id: string;
  no_memo: string | null; tanggal: string | null; perihal: string | null;
  periode_awal: string | null; periode_akhir: string | null;
  skema: string; kategori: string | null; nilai: string | null;
  keterangan: string | null;
  scheme_id: string | null;
  diberlakukan_oleh: string | null; diberlakukan_pada: string | null;
  claim_type: string | null; recipient_role: string | null;
  percentage: string | null; flat_amount: string | null;
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
               "Agustus", "September", "Oktober", "November", "Desember"];

const tglPanjang = (v?: string | null) => {
  if (!v) return "—";
  const [th, bl, hr] = v.slice(0, 10).split("-").map(Number);
  if (!th || !bl || !hr) return v.slice(0, 10);
  return `${hr} ${BULAN[bl - 1] ?? bl} ${th}`;
};

/** "1 Jan 2026 – 31 Mar 2026", atau tanda pisah bila keduanya kosong. */
const periode = (a?: string | null, b?: string | null) =>
  !a && !b ? "—" : `${tglPanjang(a)} – ${b ? tglPanjang(b) : "seterusnya"}`;

/**
 * "Skema Komisi Agent" menjadi "Komisi Agent", untuk kolom yang sudah
 * berjudul Skema.
 *
 * Hanya di kolom itu. Kata "Skema" yang berulang pada tiap barisnya tidak
 * menambah keterangan apa pun — judul kolomnya sudah mengatakannya — dan pada
 * kolom sesempit ini satu kata yang mubazir menambah satu baris lipatan.
 *
 * Yang tersimpan tidak disentuh. Judul utuhnya tetap dipakai di tempat yang
 * tidak punya kepala kolom untuk menerangkannya: dialog pemberlakuan, dan
 * penebakan jenis fee yang mencocokkan kata pada judul itu.
 *
 * Yang seluruhnya berbunyi "Skema" dibiarkan apa adanya — memangkasnya
 * menyisakan sel kosong, dan sel kosong tidak menyebut apa pun.
 */
const tanpaKataSkema = (v: string) => {
  const sisa = v.replace(/^\s*skema\s+/i, "").trim();
  return sisa || v;
};

/** Persen dari pecahan desimal tersimpan: "0.025" menjadi "2,5%". */
const persenTampil = (v?: string | null) => {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `${(n * 100).toLocaleString("id-ID", { maximumFractionDigits: 4 })}%`;
};

const rupiah = (v?: string | null) => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? `Rp ${n.toLocaleString("id-ID")}` : null;
};

/** Angka persen yang tertulis pada memo, untuk mengisi awal isian dialog. */
function persenDariNilai(nilai?: string | null): string {
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(nilai ?? "");
  return m ? m[1].replace(".", ",") : "";
}

/** Nominal rupiah yang tertulis pada memo, bila bukan persen. */
function nominalDariNilai(nilai?: string | null): string {
  if (!nilai || /%/.test(nilai)) return "";
  const m = /(\d[\d.]{5,})/.exec(nilai.replace(/\s/g, ""));
  return m ? m[1].replace(/\./g, "") : "";
}

export default function ReferensiPengajuanPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();

  const [baris, setBaris] = useState<Baris[]>([]);
  const [kunci, setKunci] = useState(false);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [kemajuan, setKemajuan] = useState<string | null>(null);
  const [seret, setSeret] = useState(false);
  /** Baris yang sedang diperiksa di dialog pemberlakuan. */
  const [dialog, setDialog] = useState<Baris | null>(null);

  const bolehBerlaku = ["admin_sales", "admin_system"]
    .includes(sesi?.role ?? "");
  const bolehKunci = sesi?.role === "admin_system";

  const muat = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/rujukan");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setBaris(Array.isArray(b?.baris) ? b.baris : []);
      setKunci(Boolean(b?.kunci));
      setGalat(null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  /**
   * Satu berkas: dibaca, lalu disimpan sebagai memo beserta rincian skemanya.
   *
   * Dijalankan berurutan, bukan serentak. OCR memakai seluruh inti prosesor
   * yang ada, dan lima berkas yang dibaca bersamaan membuat kelimanya selesai
   * lebih lambat daripada satu per satu — sambil membuat peramban berhenti
   * menjawab sama sekali.
   */
  const prosesBerkas = async (f: File): Promise<number> => {
    setKemajuan(k.membaca(f.name));

    // Berkas besar dititipkan sepotong demi sepotong; yang menyeberang
    // sesudahnya hanya pengenalnya, jadi satu memo sekali saja lewat jaringan.
    let titipan: string | null = null;
    if (perluDipecah(f)) {
      titipan = await titipBerkas(f, ({ terkirim, dari }) =>
        setKemajuan(k.menitip(Math.round((terkirim / dari) * 100))));
    }

    const fdBaca = new FormData();
    pasangBerkas(fdBaca, f, titipan);
    const resBaca = await fetch("/api/memos/baca",
                                { method: "POST", body: fdBaca });
    if (resBaca.status === 401) { location.href = "/login"; return 0; }
    const hasil = await resBaca.json().catch(() => ({}));
    if (!resBaca.ok) {
      throw new Error(hasil.detail ?? hasil.title ?? `HTTP ${resBaca.status}`);
    }
    const kolom = hasil.kolom ?? {};

    // Tabel skemanya dibedah dari kotak letak tiap kata. Dua sumbernya, dan
    // yang murah dicoba lebih dulu: PDF yang lahir digital sudah membawa
    // huruf beserta koordinatnya, sehingga OCR di sana hanya menebak ulang
    // apa yang sudah tertulis — belasan detik, dengan kesalahan baca.
    // Pindaian tidak punya lapisan itu, dan baru di sanalah OCR dijalankan.
    let rinci = bedahSkema((await kataTeksPdf(f)).kata);
    if (!rinci.length) {
      const pindai = await bacaPindaian(f, (m: Kemajuan) => {
        if (m.tahap === "menyiapkan") setKemajuan(k.ocrSiap);
        else if (m.tahap === "menggambar")
          setKemajuan(k.ocrGambar(m.halaman ?? 1, m.dari ?? 1));
        else if (m.tahap === "membaca") setKemajuan(k.ocrBaca(m.persen ?? 0));
      });
      rinci = bedahSkema(pindai.kata);
    }

    setKemajuan(k.menyimpan(f.name));
    const fd = new FormData();
    pasangBerkas(fd, f, titipan);
    fd.append("judul", kolom.judul ?? f.name);
    for (const [medan, nilai] of Object.entries({
      nomor: kolom.nomor, tanggal_memo: kolom.tanggal_memo,
      berlaku_dari: kolom.berlaku_dari, berlaku_sampai: kolom.berlaku_sampai,
      dari: kolom.dari, kepada: kolom.kepada,
      nilai_skema: kolom.nilai_skema, dokumen_wajib: kolom.dokumen_wajib,
      diajukan_oleh: kolom.diajukan_oleh,
      diketahui_oleh: kolom.diketahui_oleh,
      disetujui_oleh: kolom.disetujui_oleh,
    })) {
      if (typeof nilai === "string" && nilai.trim()) fd.append(medan, nilai);
    }
    if (rinci.length) fd.append("skema", JSON.stringify(rinci));

    const res = await fetch("/api/memos", { method: "POST", body: fd });
    if (res.status === 401) { location.href = "/login"; return 0; }
    const b = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(b.detail ?? b.title ?? `HTTP ${res.status}`);
    return rinci.length;
  };

  const terima = async (daftar: File[]) => {
    if (!daftar.length) return;
    setBusy(true); setGalat(null); setKabar(null);
    let tersimpan = 0, barisBaru = 0;
    const gagal: string[] = [];
    try {
      for (const f of daftar) {
        // Ukurannya diperiksa sebelum apa pun dikirim: menolak di sini
        // menyebut nama berkasnya, sedangkan menolak di server menyebut
        // permintaan yang tidak dikenali siapa pun.
        const salah = periksaUkuran(f);
        if (salah) { gagal.push(`${f.name}: ${salah}`); continue; }
        try {
          barisBaru += await prosesBerkas(f);
          tersimpan++;
        } catch (e: any) {
          gagal.push(`${f.name}: ${String(e?.message ?? e)}`);
        }
      }
      setKemajuan(null);
      if (gagal.length) setGalat(gagal.join(" · "));
      if (tersimpan) {
        setKabar(gagal.length ? k.sebagian(tersimpan, gagal.length)
                              : k.selesai(tersimpan, barisBaru));
        if (!barisBaru) setGalat(k.takAdaBaris);
      }
      await muat();
    } finally { setBusy(false); setKemajuan(null); }
  };

  const ubahKunci = async (nyala: boolean) => {
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "skema_wajib", value: String(nyala) }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKunci(nyala);
      setKabar(k.kunciBerubah(nyala));
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  const cabut = async (b: Baris) => {
    if (!confirm(k.cabutTanya)) return;
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/rujukan/${b.id}`, { method: "DELETE" });
      if (res.status === 401) { location.href = "/login"; return; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(j.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.cabutKabar);
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  const jumlahBerlaku = baris.filter((b) => b.scheme_id).length;

  /**
   * Baris dikelompokkan menurut nomor memonya.
   *
   * Satu memo lazimnya memuat beberapa tabel skema — Komisi Inhouse, Cash
   * Reward, Overriding — dan masing-masing menjadi satu baris di sini.
   * Dibiarkan berdiri sendiri-sendiri, satu memo memenuhi lima baris yang
   * mengulang nomor, tanggal dan perihal yang sama persis, sehingga yang
   * mencari satu memo harus membaca kolom yang berulang untuk memastikan
   * kelimanya memang memo yang sama.
   *
   * Yang nomornya belum terbaca dikunci pada memo_id-nya, bukan disatukan
   * sebagai "tanpa nomor": dua memo berbeda yang sama-sama gagal terbaca
   * nomornya bukan satu memo, dan menyatukannya akan menggabungkan skema
   * yang tidak berhubungan.
   */
  const kelompok: { kunci: string; baris: Baris[] }[] = [];
  {
    const peta = new Map<string, { kunci: string; baris: Baris[] }>();
    for (const b of baris) {
      const kunci = b.no_memo?.trim() || `memo:${b.memo_id}`;
      let g = peta.get(kunci);
      if (!g) { g = { kunci, baris: [] }; peta.set(kunci, g); kelompok.push(g); }
      g.baris.push(b);
    }
  }

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>
      {galat && <div className="banner stop"><b>{k.galat}</b>{galat}</div>}
      {kabar && <div className="banner ok">{kabar}</div>}

      {/* Banner kunci dihapus atas permintaan: ia memakan tiga baris di kepala
          layar untuk menyebut satu setelan yang jarang berubah.

          Yang TIDAK ikut dihapus: saklarnya, bagi Admin IT. Membuang banner
          berarti membuang tampilannya; membuang saklarnya berarti membuang
          satu-satunya tempat setelan itu dapat diubah, sementara kuncinya
          sendiri tetap bekerja menolak pengajuan di belakang layar — setelan
          yang menolak pekerjaan orang tetapi tidak dapat dijangkau siapa pun
          adalah yang paling mahal untuk ditelusuri. Jadi ia tinggal sebagai
          satu baris kecil, hanya terlihat oleh yang berhak mengubahnya. */}
      {bolehKunci && (
        <div className="baris-kunci sp">
          <span>{k.kunciJudul}</span>
          <button disabled={busy} onClick={() => void ubahKunci(!kunci)}>
            {kunci ? k.kunciLonggarkan : k.kunciNyalakan}
          </button>
        </div>
      )}

      <div className="panel sp">
        <h2>{k.unggahJudul}</h2>
        {/* Seret-dan-lepas, dan tetap ada tombolnya: yang memakai papan ketik
            atau pembaca layar tidak dapat menyeret apa pun. */}
        <label className={`kotak-seret${seret ? " aktif" : ""}`}
               onDragOver={(e) => { e.preventDefault(); setSeret(true); }}
               onDragLeave={() => setSeret(false)}
               onDrop={(e) => {
                 e.preventDefault(); setSeret(false);
                 void terima([...e.dataTransfer.files]);
               }}>
          {/* Lambang berkas dengan panah naik. Digambar sebagai SVG sebaris,
              bukan emoji: emoji dilukis tiap sistem dengan gayanya
              sendiri-sendiri, dan yang di sini harus mengikuti warna kotaknya
              saat kotaknya disentuh. */}
          <svg className="ikon-unggah" viewBox="0 0 24 24" aria-hidden="true"
               fill="none" stroke="currentColor" strokeWidth="1.6"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3v5h5" />
            <path d="M19 12V9l-6-6H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
            <path d="M18 22v-7" /><path d="m15 18 3-3 3 3" />
          </svg>
          <b>{k.seret}</b>
          {/* Kalimat "seret dan lepaskan…" sengaja tidak ada: kotak bergaris
              putus-putus yang menyala saat berkas dilewatkan di atasnya sudah
              menyatakan dirinya sendiri, dan tombolnya menyatakan sisanya. */}
          <span className="tombol-berkas pri">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"
                 stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                 strokeLinejoin="round">
              <path d="M12 16V4" /><path d="m7 9 5-5 5 5" />
              <path d="M5 20h14" />
            </svg>
            {k.pilih}
          </span>
          <input type="file" multiple hidden disabled={busy}
                 onChange={(e) => {
                   const daftar = [...(e.target.files ?? [])];
                   e.target.value = "";
                   void terima(daftar);
                 }} />
          <span className="meta">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                 strokeLinejoin="round">
              <path d="M14 3v5h5" />
              <path d="M19 9v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6z" />
            </svg>
            {k.jenisBerkas}
          </span>
        </label>
        {kemajuan && <p className="hint" style={{ textAlign: "left" }}>
          {kemajuan}
        </p>}
      </div>

      <div className="panel">
        <h2>
          {k.tabel}
          <span className="pil-sirkulasi">
            <span className="pill ok">{k.pBerlaku(jumlahBerlaku)}</span>
            <span className="pill">
              {k.pUsulan(baris.length - jumlahBerlaku)}
            </span>
          </span>
        </h2>

        <div className="tscroll">
          <table className="tabel-rujukan"><tbody>
            <tr>
              <th style={{ width: 40 }}>{k.kNo}</th>
              <th>{k.kNoMemo}</th>
              <th>{k.kTanggal}</th>
              <th>{k.kPerihal}</th>
              <th>{k.kPeriode}</th>
              <th>{k.kSkema}</th>
              <th>{k.kKategori}</th>
              <th>{k.kNilai}</th>
              <th>{k.kKeterangan}</th>
              {bolehBerlaku && <th style={{ width: 110 }}>{k.kTindakan}</th>}
            </tr>

            {kelompok.map((g, i) => (
              /* Satu memo menempati beberapa baris tabel, bukan satu baris
                 yang isinya ditumpuk sendiri-sendiri. Kolom milik memonya —
                 nomor, tanggal, perihal, periode — membentang lewat rowSpan,
                 dan kolom Skema membentang menaungi kategori yang berasal
                 dari tabel yang sama padanya.

                 rowSpan, bukan tumpukan div di dalam sel: empat kolom yang
                 masing-masing menumpuk isinya sendiri akan berbeda tinggi
                 begitu Keterangan lebih panjang daripada Nilai, sehingga
                 kategori ketiga berhadapan dengan keterangan kedua — dan yang
                 membacanya tidak punya cara mengetahui bahwa keduanya sudah
                 tidak sebaris. Peramban yang menyejajarkannya, bukan angka
                 tinggi yang ditebak.

                 Keadaan dan Tindakan kembali berdiri per kategori. Mana yang
                 sudah diberlakukan dan mana yang belum adalah hal yang paling
                 dicari di layar ini, dan menyembunyikannya di balik satu
                 kategori yang sedang dibuka membuat yang memeriksa harus
                 menekan satu per satu hanya untuk tahu masih ada yang
                 tertinggal. */
              <Kotak key={g.kunci} no={i + 1} baris={g.baris} k={k}
                     bahasa={bahasa} busy={busy} bolehBerlaku={bolehBerlaku}
                     cabut={cabut}
                     berlakukan={(b) => { setDialog(b); setGalat(null); }} />
            ))}

            {!baris.length && !busy && (
              <tr>
                <td colSpan={bolehBerlaku ? 10 : 9}
                    style={{ color: "var(--mut)" }}>{k.kosong}</td>
              </tr>
            )}
            {busy && !baris.length && (
              <tr><td colSpan={bolehBerlaku ? 10 : 9}
                      style={{ color: "var(--mut)" }}>{k.memuat}</td></tr>
            )}
          </tbody></table>
        </div>
      </div>

      {dialog && (
        <DialogBerlaku baris={dialog} k={k} bahasa={bahasa}
                       tutup={() => setDialog(null)}
                       selesai={async () => {
                         setDialog(null);
                         setKabar(k.berlakuKabar);
                         await muat();
                       }}
                       galat={setGalat} />
      )}
    </Kerangka>
  );
}

/**
 * Satu memo, sebanyak baris tabel yang dimilikinya.
 *
 * Skema dibentangkan menaungi kategori yang berasal dari tabel yang sama
 * padanya — dan yang dibandingkan adalah RUNTUN yang berurutan, bukan seluruh
 * nama yang sama di mana pun letaknya. Sebuah memo boleh menyebut satu nama
 * skema dua kali pada bagian yang berjauhan; disatukan lewat rowSpan, kedua
 * bagian itu akan tampak sebagai satu blok, dan kategori di antaranya ikut
 * tersedot ke dalamnya.
 */
function Kotak({ no, baris, k, bahasa, busy, bolehBerlaku, cabut, berlakukan }: {
  no: number; baris: Baris[]; k: any; bahasa: "id" | "en"; busy: boolean;
  bolehBerlaku: boolean;
  cabut: (b: Baris) => Promise<void> | void;
  berlakukan: (b: Baris) => void;
}) {
  const memo = baris[0];

  /**
   * Kategori yang sedang dibuka penuh, menurut id barisnya.
   *
   * Nilai dan Keterangan berisi kalimat panjang hasil OCR — satu di antaranya
   * enam baris, dan sebuah memo memuat sebelas kategori. Ditampilkan utuh
   * seluruhnya, satu memo menghabiskan beberapa layar penuh dan yang mencari
   * satu kategori harus menggulir melewati sepuluh kalimat yang tidak sedang
   * ia cari. Jadi keduanya dipendekkan dua baris, dan terbuka penuh ketika
   * kategorinya dipilih.
   *
   * Berdiri sendiri-sendiri, bukan satu yang terbuka bergantian: yang
   * membandingkan syarat pembayaran dua kategori perlu melihat keduanya
   * sekaligus, dan aturan "hanya satu boleh terbuka" justru menghalangi
   * pekerjaan yang paling lazim di layar ini.
   */
  const [buka, setBuka] = useState<Record<string, boolean>>({});

  /**
   * Runtun skema yang berurutan. Satu runtun menjadi satu blok yang dapat
   * diringkas.
   *
   * Yang dibandingkan runtun, bukan seluruh nama yang sama di mana pun
   * letaknya: sebuah memo boleh menyebut satu nama skema dua kali pada bagian
   * yang berjauhan, dan menyatukannya akan menyedot kategori di antaranya ke
   * dalam blok yang salah.
   */
  const grup: Baris[][] = [];
  for (let i = 0; i < baris.length;) {
    let j = i;
    while (j < baris.length && baris[j].skema === baris[i].skema) j++;
    grup.push(baris.slice(i, j));
    i = j;
  }

  /**
   * Skema yang sedang dibuka, menurut id baris pertamanya.
   *
   * Tertutup pada mulanya. Sebuah memo memuat sebelas kategori dengan kalimat
   * panjang di dua kolomnya; dibuka seluruhnya sejak awal, yang mencari satu
   * skema harus menggulir melewati sepuluh kategori yang tidak sedang ia cari
   * — dan itulah yang membuat tabelnya terbaca semrawut. Diringkas, memo yang
   * sama menempati empat baris.
   */
  const [bukaSkema, setBukaSkema] = useState<Record<string, boolean>>({});
  const kunciGrup = (gr: Baris[]) => gr[0].id;

  // Tinggi bentangan kolom memo dihitung dari baris yang BENAR-BENAR
  // digambar, bukan dari jumlah kategorinya: rowSpan yang melebihi barisnya
  // akan menarik baris memo berikutnya masuk ke dalam bentangan ini.
  const totalBaris = grup.reduce(
    (n, gr) => n + (bukaSkema[kunciGrup(gr)] ? gr.length : 1), 0);

  let sudahDigambar = 0;

  return (
    <>
      {grup.map((gr, gi) => {
        const kunci = kunciGrup(gr);
        const terbuka = !!bukaSkema[kunci];

        /* Sel Skema: tombol pembuka, membentang setinggi kategorinya saat
           terbuka. Segitiganya selalu ada di sini — berbeda dari sel
           Kategori, blok skema memang selalu punya isi yang disembunyikan,
           jadi tandanya tidak pernah menjanjikan yang tidak ada. */
        const selSkema = (
          <td rowSpan={terbuka ? gr.length : 1} className="sel-skema">
            <button type="button" className="buka-kategori"
                    aria-expanded={terbuka}
                    onClick={() => setBukaSkema((s) =>
                      ({ ...s, [kunci]: !s[kunci] }))}>
              <span className="tanda">{terbuka ? "▾" : "▸"}</span>
              {tanpaKataSkema(gr[0].skema)}
            </button>
          </td>
        );

        if (!terbuka) {
          const pertama = sudahDigambar === 0;
          sudahDigambar += 1;
          return (
            <tr key={`${kunci}:ringkas`}
                className={pertama ? "kepala-memo" : undefined}>
              {pertama && (
                <>
                  <td className="n" rowSpan={totalBaris}>{no}</td>
                  <td rowSpan={totalBaris}>{memo.no_memo ?? "—"}</td>
                  <td rowSpan={totalBaris}>{tglPanjang(memo.tanggal)}</td>
                  <td rowSpan={totalBaris}>{memo.perihal ?? "—"}</td>
                  <td rowSpan={totalBaris}>
                    {periode(memo.periode_awal, memo.periode_akhir)}
                  </td>
                </>
              )}
              {selSkema}
              {/* Sengaja dikosongkan, bukan diisi ringkasan karangan seperti
                  "3 kategori": isinya tidak hilang, hanya sedang tidak
                  digambar, dan kalimat pengganti yang tidak ada pada memonya
                  akan terbaca sebagai isi memo itu sendiri. */}
              <td className="sel-kategori" />
              <td />
              <td />
              {bolehBerlaku && <td />}
            </tr>
          );
        }

        return gr.map((b, ri) => {
          const pertama = sudahDigambar === 0;
          sudahDigambar += 1;
          return (
            <tr key={b.id} className={pertama ? "kepala-memo" : undefined}>
              {pertama && (
                <>
                  <td className="n" rowSpan={totalBaris}>{no}</td>
                  <td rowSpan={totalBaris}>{memo.no_memo ?? "—"}</td>
                  <td rowSpan={totalBaris}>{tglPanjang(memo.tanggal)}</td>
                  <td rowSpan={totalBaris}>{memo.perihal ?? "—"}</td>
                  <td rowSpan={totalBaris}>
                    {periode(memo.periode_awal, memo.periode_akhir)}
                  </td>
                </>
              )}
              {ri === 0 && selSkema}
              {/* Kategorinya sendiri yang menjadi tombolnya — bukan tautan
                  "selengkapnya" di kaki kalimat yang terpotong. Yang dipilih
                  orang adalah kategorinya, dan dua kalimat panjang di
                  sebelahnya adalah rincian dari pilihan itu. */}
              <td className="sel-kategori">
                <button type="button" className="buka-kategori"
                        aria-expanded={!!buka[b.id]}
                        onClick={() => setBuka((s) =>
                          ({ ...s, [b.id]: !s[b.id] }))}>
                  <span className="tanda">{buka[b.id] ? "▾" : "▸"}</span>
                  {b.kategori ?? "—"}
                </button>
              </td>
              {/* Rinciannya tidak digambar sampai kategorinya ditekan, bukan
                  dipendekkan dua baris. Potongan dua baris masih memenuhi
                  kolomnya dengan kalimat yang belum tentu sedang dibaca, dan
                  itulah yang membuat tabelnya terbaca semrawut. Isinya tidak
                  hilang; ia kembali utuh begitu kategorinya dipilih. */}
              <td>{buka[b.id] ? (b.nilai ?? "—") : null}</td>
              <td>{buka[b.id] ? (b.keterangan ?? "—") : null}</td>
              {bolehBerlaku && (
                <td>
                  {b.scheme_id ? (
                    <button disabled={busy} onClick={() => void cabut(b)}>
                      {k.cabut}
                    </button>
                  ) : (
                    <button className="pri" disabled={busy}
                            onClick={() => berlakukan(b)}>
                      {k.berlakukan}
                    </button>
                  )}
                </td>
              )}
            </tr>
          );
        });
      })}
    </>
  );
}

/**
 * Dialog pemeriksaan sebelum sebuah baris menjadi tarif.
 *
 * Isiannya diisi awal dari yang terbaca pada memo — jenis fee ditebak dari
 * judul tabelnya, persentase dari nilainya, masa berlaku dari periode
 * programnya — tetapi seluruhnya dapat diubah. Tebakan yang tidak dapat
 * dibantah adalah tebakan yang menjadi angka pembayaran tanpa ada yang
 * pernah menyetujuinya.
 */
function DialogBerlaku({ baris, k, bahasa, tutup, selesai, galat }: {
  baris: any; k: any; bahasa: "id" | "en";
  tutup: () => void; selesai: () => Promise<void>;
  galat: (s: string | null) => void;
}) {
  const teks = `${baris.skema} ${baris.kategori ?? ""}`.toLowerCase();
  // Urutannya bukan selera: judul tabel memo lazim menyebut dua hal sekaligus
  // — "Skema Komisi & Reward Sales Inhouse" — dan yang dicocokkan lebih dulu
  // yang menang. Komisi karena itu diperiksa sebelum reward, sebab tabel
  // berjudul demikian hampir selalu berisi komisi.
  const tebakJenis =
    /overid|overrid/.test(teks) ? "overriding"
    : /closing/.test(teks) ? "closing_fee"
    : /continuity/.test(teks) ? "continuity_reward"
    : /komisi|commission/.test(teks) ? "commission"
    : /reward/.test(teks) ? "cash_reward"
    : "commission";
  const tebakKategori =
    /agent/.test(teks) ? "agent"
    : /manager/.test(teks) ? "sales_manager_inhouse"
    : /koordinator|coordinator/.test(teks) ? "sales_coordinator"
    : /markom/.test(teks) ? "markom"
    : /bgb/.test(teks) ? "bgb"
    : "sales_inhouse";

  const [jenis, setJenis] = useState(tebakJenis);
  const [kategori, setKategori] = useState(tebakKategori);
  const [cara, setCara] = useState(
    persenDariNilai(baris.nilai) || !nominalDariNilai(baris.nilai)
      ? "persen" : "nominal");
  const [persen, setPersen] = useState(persenDariNilai(baris.nilai));
  const [nominalIsi, setNominalIsi] = useState(nominalDariNilai(baris.nilai));
  const [bersih, setBersih] = useState(false);
  const [dasar, setDasar] = useState("contract_value_incl_vat");
  const [dari, setDari] = useState(baris.periode_awal ?? "");
  const [sampai, setSampai] = useState(baris.periode_akhir ?? "");
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  const simpan = async () => {
    if (!dari) { setPesan(k.dTanggalWajib); return; }
    setBusy(true); setPesan(null); galat(null);
    try {
      const res = await fetch(`/api/rujukan/${baris.id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claim_type: jenis,
          recipient_role: kategori,
          overriding_level: jenis === "overriding" ? kategori : null,
          basis: dasar,
          percentage: cara === "persen" ? persen : null,
          flat_amount: cara === "nominal" ? nominalIsi : null,
          flat_amount_is_net: cara === "nominal" && bersih,
          effective_from: dari,
          effective_to: sampai || null,
        }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setPesan(b.detail ?? `HTTP ${res.status}`); return; }
      await selesai();
    } catch (e: any) {
      setPesan(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  return (
    <div className="popup-latar"
         onClick={(e) => { if (e.target === e.currentTarget && !busy) tutup(); }}>
      <div className="popup" role="dialog" aria-modal="true"
           style={{ maxWidth: 560 }}>
        <div className="popup-kepala">
          <h3>{k.dJudul}</h3>
          <button className="tautan" onClick={tutup} disabled={busy}>✕</button>
        </div>

        <div className="popup-isi">
          <p className="hint" style={{ textAlign: "left", margin: "0 0 12px" }}>
            {k.dPengantar}
          </p>
          {pesan && <div className="banner stop">{pesan}</div>}

          <div className="lbl">{k.dBaris}</div>
          <p style={{ margin: "2px 0 12px" }}>
            <b>{baris.skema}</b>
            <br />{baris.kategori ?? "—"} — {baris.nilai ?? "—"}
            {baris.keterangan ? <><br />
              <span className="meta">{baris.keterangan}</span></> : null}
          </p>

          <div className="filters rapat">
            <div>
              <div className="lbl">{k.dJenis}</div>
              <select value={jenis} onChange={(e) => setJenis(e.target.value)}>
                {JENIS.map((j) => (
                  <option key={j} value={j}>{namaJenis(j as any, bahasa)}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="lbl">{k.dKategori}</div>
              <select value={kategori}
                      onChange={(e) => setKategori(e.target.value)}>
                {(KATEGORI_JENIS[jenis] ?? []).map((kd) => (
                  <option key={kd} value={kd}>{namaKategori(kd, bahasa)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="filters rapat" style={{ marginTop: 10 }}>
            <div>
              <div className="lbl">{k.dCara}</div>
              <select value={cara} onChange={(e) => setCara(e.target.value)}>
                <option value="persen">{k.dPersenPilih}</option>
                <option value="nominal">{k.dNominalPilih}</option>
              </select>
            </div>
            <div>
              <div className="lbl">
                {cara === "persen" ? k.dPersen : k.dNominal}
              </div>
              {cara === "persen" ? (
                <input value={persen} inputMode="decimal"
                       onChange={(e) => setPersen(e.target.value)} />
              ) : (
                <input value={nominalIsi} inputMode="numeric"
                       onChange={(e) => setNominalIsi(e.target.value)} />
              )}
            </div>
          </div>

          {cara === "nominal" && (
            <label className="row" style={{ marginTop: 8, gap: 6 }}>
              <input type="checkbox" checked={bersih}
                     onChange={(e) => setBersih(e.target.checked)} />
              <span>{k.dBersih}</span>
            </label>
          )}

          <div className="lbl" style={{ marginTop: 12 }}>{k.dDasar}</div>
          <select value={dasar} onChange={(e) => setDasar(e.target.value)}>
            <option value="contract_value_incl_vat">{k.dInclude}</option>
            <option value="contract_value_excl_vat">{k.dExclude}</option>
          </select>

          <div className="filters rapat" style={{ marginTop: 12 }}>
            <div>
              <div className="lbl">{k.dDari}</div>
              <input type="date" value={dari}
                     onChange={(e) => setDari(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.dSampai}</div>
              <input type="date" value={sampai} min={dari || undefined}
                     onChange={(e) => setSampai(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="popup-kaki">
          <div className="row">
            <button className="pri" disabled={busy} onClick={() => void simpan()}>
              {k.dSimpan}
            </button>
            <button disabled={busy} onClick={tutup}>{k.dBatal}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

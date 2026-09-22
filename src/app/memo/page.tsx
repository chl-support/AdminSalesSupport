"use client";

/**
 * Memo Approval — berkas memo sebagai lampiran rujukan.
 *
 * Yang disimpan di sini tidak dibaca sistem: tarif yang dipakai menghitung
 * tetap berasal dari skema insentif. Memo ini dasar tertulisnya, yang dapat
 * dibuka saat ada yang mempertanyakan sebuah angka — tanpa mencari-cari di
 * percakapan atau surel, dan tanpa bergantung pada satu orang yang kebetulan
 * menyimpannya.
 *
 * Karena itu tidak ada tombol "setujui" di layar ini. Tombol persetujuan yang
 * tidak menggerakkan apa pun justru berbahaya: orang akan mengira perhitungan
 * pada layar berikutnya sudah mengikuti memo yang baru saja disetujui.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { tebakKolom, cocokkanNama } from "@/lib/memo-tebak";
import { bedahSkema, ringkasSkema } from "@/lib/memo-skema";
import type { BarisSkema, KataOCR } from "@/lib/memo-skema";
import { bacaPindaian, type Kemajuan } from "./ocr";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const KATA = {
  id: {
    judul: "Memo Approval",
    pengantar:
      "Memo Skema Dan Persetujuan Tersimpan Sebagai Dasar Tertulis Sesuai " +
      "Project Terkait. Perhitungan Tarif Tetap Mengacu Pada Skema Insentif.",
    galat: "Tidak dapat dikerjakan",
    unggahJudul: "UNGGAH MEMO",
    fJudul: "Judul", cJudul: "mis. Skema Komisi Triwulan I",
    fNomor: "Nomor memo", cNomor: "mis. 002/SBL-BD/SM/XI/2025",
    fDari: "Berlaku dari", fSampai: "Berlaku sampai",
    fKeterangan: "Keterangan",
    cKeterangan: "Catatan singkat: apa yang diatur memo ini.",
    fBerkas: "Berkas (PDF, gambar, Excel, atau Word — maksimal 10 MB)",
    unggah: "Unggah memo", mengunggah: "Mengunggah…",
    tersimpan: (j: string) => `Memo "${j}" tersimpan.`,
    dihapus: (j: string) =>
      `Memo "${j}" dihapus. Judulnya tetap tercatat pada jejak audit.`,
    daftar: "Dokumentasi Memo",
    pBaru: (n: number) => `📥 ${n} Dokumen Baru Diunggah`,
    pArsip: (n: number) => `🗄️ ${n} Dokumen Terarsip`,
    fTanggal: "Tanggal memo",
    kNo: "No", kNomor: "Nomor Memo", kTanggal: "Tanggal Memo",
    kDari: "Pengajuan (Dari)", kPerihal: "Perihal / Program",
    kPeriode: "Periode Program",
    kBerkas: "Berkas", kLampiran: "Lampiran", kTindakan: "Tindakan",
    seterusnya: "seterusnya", hapus: "Hapus",
    kosong: "Belum ada memo pada project ini.",
    membaca: "Membaca berkas…",
    ocrSiap: "Menyiapkan pembaca tulisan…",
    ocrGambar: (h: number, n: number) => `Menggambar halaman ${h} dari ${n}…`,
    ocrBaca: (persen: number) => `Membaca tulisan pada pindaian… ${persen}%`,
    ocrHasil: (n: number) =>
      `${n} kolom lagi terisi dari tulisan di dalam pindaiannya. Hasil ` +
      `pembacaan gambar tidak selalu tepat — periksa sebelum menyimpan.`,
    ocrKosong:
      "Tulisan pada pindaian ini tidak terbaca. Kolom yang dibaca dari memo " +
      "akan kosong pada rekapitulasi.",
    terbacaIsi: (n: number) =>
      `${n} kolom terisi dari isi memo. Periksa sebelum menyimpan.`,
    terbacaNama: (n: number) =>
      `Memo ini berupa pindaian — tidak ada teks yang dapat dibaca di ` +
      `dalamnya. ${n} kolom terisi dari nama berkasnya; tulisan di dalam ` +
      `lembarnya sedang dibaca.`,
    takTerbaca:
      "Tidak ada yang dapat dibaca dari berkas ini. Memonya tetap dapat " +
      "diunggah; kolom yang dibaca dari memo akan kosong.",
    unduhRekap: "Unduh rekap (.xlsx)",
    nLampiran: (n: number) => `${n} lampiran`,
    takAdaLampiran: "Belum ada lampiran",
    tambahLampiran: "Tambah lampiran",
    tutupLampiran: "Tutup",
    fLabel: "Keterangan lampiran (boleh kosong)",
    cLabel: "mis. Kwitansi, Form Referensi, Dokumen transaksi sewa",
    fLampiran: "Berkas lampiran (PDF, gambar, Excel, atau Word — maksimal 10 MB)",
    lampirkan: "Lampirkan", melampirkan: "Melampirkan…",
    lampiranTersimpan: (f: string) => `Lampiran "${f}" tersimpan.`,
    lampiranDihapus: (f: string) =>
      `Lampiran "${f}" dihapus. Namanya tetap tercatat pada jejak audit.`,
  },
  en: {
    judul: "Approval Memo",
    pengantar:
      "The written basis for the project concerned; rates still refer to the " +
      "Incentive Scheme",
    galat: "Could not be completed",
    unggahJudul: "UPLOAD MEMO",
    fJudul: "Title", cJudul: "e.g. Commission Scheme Q1",
    fNomor: "Memo number", cNomor: "e.g. 002/SBL-BD/SM/XI/2025",
    fDari: "Valid from", fSampai: "Valid until",
    fKeterangan: "Notes",
    cKeterangan: "A short note: what this memo governs.",
    fBerkas: "File (PDF, image, Excel, or Word — 10 MB maximum)",
    unggah: "Upload memo", mengunggah: "Uploading…",
    tersimpan: (j: string) => `Memo "${j}" saved.`,
    dihapus: (j: string) =>
      `Memo "${j}" deleted. Its title remains in the audit trail.`,
    daftar: "Memo documentation",
    pBaru: (n: number) => `📥 ${n} newly uploaded documents`,
    pArsip: (n: number) => `🗄️ ${n} archived documents`,
    fTanggal: "Memo date",
    kNo: "No", kNomor: "Memo number", kTanggal: "Memo date",
    kDari: "Submitted by", kPerihal: "Subject / programme",
    kPeriode: "Programme period",
    kBerkas: "File", kLampiran: "Attachments", kTindakan: "Action",
    seterusnya: "onwards", hapus: "Delete",
    kosong: "No memos on this project yet.",
    membaca: "Reading the file…",
    ocrSiap: "Preparing the text reader…",
    ocrGambar: (h: number, n: number) => `Rendering page ${h} of ${n}…`,
    ocrBaca: (persen: number) => `Reading the scan… ${persen}%`,
    ocrHasil: (n: number) =>
      `${n} more fields filled from the text inside the scan. Reading an ` +
      `image is never exact — check before saving.`,
    ocrKosong:
      "No text could be read from this scan. The fields read from the memo " +
      "will be empty on the recap.",
    terbacaIsi: (n: number) =>
      `${n} fields filled from the memo's contents. Check before saving.`,
    terbacaNama: (n: number) =>
      `This memo is a scan — there is no readable text inside it. ${n} ` +
      `fields were filled from the file name; the text inside the sheet is ` +
      `being read now.`,
    takTerbaca:
      "Nothing could be read from this file. The memo can still be uploaded; " +
      "the fields read from the memo will be empty.",
    unduhRekap: "Download recap (.xlsx)",
    nLampiran: (n: number) => `${n} attachments`,
    takAdaLampiran: "No attachments yet",
    tambahLampiran: "Add attachment",
    tutupLampiran: "Close",
    fLabel: "Attachment label (optional)",
    cLabel: "e.g. Receipt, Referral form, Lease transaction document",
    fLampiran: "Attachment file (PDF, image, Excel, or Word — 10 MB maximum)",
    lampirkan: "Attach", melampirkan: "Attaching…",
    lampiranTersimpan: (f: string) => `Attachment "${f}" saved.`,
    lampiranDihapus: (f: string) =>
      `Attachment "${f}" deleted. Its name remains in the audit trail.`,
  },
};

type Memo = {
  id: string; nomor: string | null; judul: string; keterangan: string | null;
  berlaku_dari: string | null; berlaku_sampai: string | null;
  tanggal_memo: string | null; dari: string | null; kepada: string | null;
  nilai_skema: string | null; dokumen_wajib: string | null;
  diajukan_oleh: string | null; diketahui_oleh: string | null;
  disetujui_oleh: string | null;
  file_name: string; content_type: string; size_bytes: number;
  uploaded_by: string; uploaded_at: string;
};

type Lampiran = {
  id: string; memo_id: string; label: string | null; file_name: string;
  content_type: string; size_bytes: number;
  uploaded_by: string; uploaded_at: string;
};

const tgl = (v?: string | null) => (v ? String(v).slice(0, 10) : "—");
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

const BULAN = {
  id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
       "Agustus", "September", "Oktober", "November", "Desember"],
  en: ["January", "February", "March", "April", "May", "June", "July",
       "August", "September", "October", "November", "December"],
};

/** "30 Juli 2026" — bukan "2026-07-30". Rekapitulasi ini dibaca orang, bukan
 *  mesin, dan tanggal berformat mesin memaksa pembacanya menerjemahkan. */
function tglPanjang(v: string | null, b: "id" | "en") {
  if (!v) return null;
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return b === "id" ? `${d} ${BULAN.id[m - 1]} ${y}`
                    : `${d} ${BULAN.en[m - 1]} ${y}`;
}

/**
 * "Agustus s.d. Desember 2026" — tahunnya ditulis sekali bila sama.
 *
 * Periode program dibaca sebagai rentang bulan, bukan sebagai dua tanggal.
 * Tanggal awal dan akhir yang persis jarang menjadi pertanyaan; yang
 * ditanyakan "berlaku bulan apa sampai bulan apa".
 */
function periode(dari: string | null, sampai: string | null, b: "id" | "en",
                 seterusnya: string) {
  if (!dari && !sampai) return null;
  const pecah = (v: string | null) => {
    if (!v) return null;
    const [y, m] = String(v).slice(0, 10).split("-").map(Number);
    return y && m ? { y, nama: BULAN[b][m - 1] } : null;
  };
  const a = pecah(dari), z = pecah(sampai);
  const sd = b === "id" ? "s.d." : "to";
  if (a && z) {
    return a.y === z.y ? `${a.nama} ${sd} ${z.nama} ${z.y}`
                       : `${a.nama} ${a.y} ${sd} ${z.nama} ${z.y}`;
  }
  if (a) return `${a.nama} ${a.y} ${sd} ${seterusnya}`;
  return `${sd} ${z!.nama} ${z!.y}`;
}

export default function MemoPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();
  const [daftar, setDaftar] = useState<Memo[]>([]);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const [berkas, setBerkas] = useState<File | null>(null);
  const [judul, setJudul] = useState("");
  const [nomor, setNomor] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [tanggalMemo, setTanggalMemo] = useState("");
  const [dariSiapa, setDariSiapa] = useState("");
  const [kepada, setKepada] = useState("");
  const [nilai, setNilai] = useState("");
  // Rincian kolom Nilai / Skema Fee, hasil pembedahan tabel di dalam memonya.
  const [skema, setSkema] = useState<BarisSkema[]>([]);
  // Dokumen pendukung wajib tidak lagi punya kotak isian di layar — isinya
  // dibaca dari memonya sendiri, bukan diketik. Nilainya tetap disimpan dan
  // tetap tampil pada rekapitulasi.
  const [dokumen, setDokumen] = useState("");
  const [diajukan, setDiajukan] = useState("");
  const [diketahui, setDiketahui] = useState("");
  const [disetujui, setDisetujui] = useState("");

  // Lampiran: daftarnya, baris mana yang sedang terbuka, dan isian unggahnya.
  const [lampiran, setLampiran] = useState<Lampiran[]>([]);
  // Nama yang ejaannya sudah dipastikan benar — pengguna sistem, dan penanda
  // tangan memo yang sudah tersimpan pada seluruh project. Lihat namaDikenal()
  // di @/lib/memo.
  const [namaDikenal, setNamaDikenal] = useState<string[]>([]);
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [lBerkas, setLBerkas] = useState<File | null>(null);
  const [lLabel, setLLabel] = useState("");
  const [membaca, setMembaca] = useState(false);
  const [kemajuan, setKemajuan] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const res = await fetch("/api/memos");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setDaftar(b.memos ?? []);
      setNamaDikenal(b.nama ?? []);
      setLampiran(b.lampiran ?? []);
      setGalat(null);
    } catch (e: any) { setGalat(String(e?.message ?? e)); }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  const unggah = async () => {
    if (!berkas) return;
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const fd = new FormData();
      fd.append("file", berkas);
      // Judul kosong diisi nama berkasnya, bukan ditolak: yang mengunggah
      // sedang memegang berkasnya, dan namanya biasanya sudah menjelaskan.
      fd.append("judul", judul.trim() || berkas.name);
      fd.append("nomor", nomor);
      fd.append("keterangan", keterangan);
      fd.append("berlaku_dari", dari);
      fd.append("berlaku_sampai", sampai);
      fd.append("tanggal_memo", tanggalMemo);
      fd.append("dari", dariSiapa);
      fd.append("kepada", kepada);
      fd.append("nilai_skema", nilai);
      fd.append("dokumen_wajib", dokumen);
      fd.append("diajukan_oleh", diajukan);
      fd.append("diketahui_oleh", diketahui);
      fd.append("disetujui_oleh", disetujui);
      if (skema.length) fd.append("skema", JSON.stringify(skema));
      const res = await fetch("/api/memos", { method: "POST", body: fd });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.tersimpan(b.judul));
      setBerkas(null); setJudul(""); setNomor(""); setKeterangan("");
      setDari(""); setSampai(""); setTanggalMemo(""); setDariSiapa("");
      setKepada(""); setNilai(""); setDokumen(""); setDiajukan("");
      setDiketahui(""); setDisetujui(""); setSkema([]);
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  const hapus = async (m: Memo) => {
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/memos/${m.id}`, { method: "DELETE" });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.dihapus(m.judul));
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  /**
   * Berkas yang baru dipilih dibaca, lalu kolom yang masih kosong diisi.
   *
   * Hanya yang kosong. Yang sudah diketik orangnya tidak ditimpa: ia sudah
   * membaca memonya dan memutuskan, dan tebakan mesin tidak lebih tahu.
   */
  const bacaBerkas = async (f: File) => {
    setMembaca(true); setGalat(null); setKabar(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/memos/baca", { method: "POST", body: fd });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }

      const kolom = b.kolom ?? {};

      // Apa yang sudah terisi dicatat di sini, bukan dibaca ulang dari state
      // React: setState belum tercermin pada variabel yang sedang dipakai di
      // dalam fungsi ini, jadi tahap OCR akan mengira seluruh kolom masih
      // kosong dan menimpa yang baru saja diisi dari nama berkasnya.
      const sudah = new Set<string>();
      const isi = (kunci: string, nilai: string | undefined, kini: string,
                   pasang: (v: string) => void) => {
        // Penandanya ditulis apa adanya, bukan diambil dari nama fungsinya:
        // nama fungsi hilang begitu berkasnya diminifikasi, dan seluruh kolom
        // akan berbagi satu penanda kosong yang sama.
        if (!nilai || kini.trim() || sudah.has(kunci)) return false;
        pasang(nilai); sudah.add(kunci); return true;
      };
      let n = 0;
      n += +isi("judul", kolom.judul, judul, setJudul);
      n += +isi("nomor", kolom.nomor, nomor, setNomor);
      n += +isi("tanggal_memo", kolom.tanggal_memo, tanggalMemo, setTanggalMemo);
      n += +isi("berlaku_dari", kolom.berlaku_dari, dari, setDari);
      n += +isi("berlaku_sampai", kolom.berlaku_sampai, sampai, setSampai);
      n += +isi("dari", kolom.dari, dariSiapa, setDariSiapa);
      n += +isi("kepada", kolom.kepada, kepada, setKepada);
      n += +isi("nilai_skema", kolom.nilai_skema, nilai, setNilai);
      n += +isi("dokumen_wajib", kolom.dokumen_wajib, dokumen, setDokumen);
      n += +isi("diajukan_oleh", kolom.diajukan_oleh, diajukan, setDiajukan);
      n += +isi("diketahui_oleh", kolom.diketahui_oleh, diketahui, setDiketahui);
      n += +isi("disetujui_oleh", kolom.disetujui_oleh, disetujui, setDisetujui);

      // Memo berteks sudah memberikan seluruh kolomnya; OCR pada berkas yang
      // hurufnya sudah terbaca hanya membuang sepuluh detik. Penyalinan dari
      // memo sebelumnya tetap dijalankan di bawah, untuk kolom yang memang
      // tidak disebut memonya.
      const berteks = b.sumber === "isi";
      let m = 0;
      let teks = "";
      let kataOCR: KataOCR[] = [];

      if (!berteks) {
        // Berkasnya pindaian: nama berkas sudah memberi nomor, perihal, dan
        // periodenya, tetapi kolom sisanya hanya ada di dalam lembar memonya.
        // Tulisannya dibaca di sini, di peramban — lihat ./ocr.
        setKabar(b.sumber === "nama" ? k.terbacaNama(n) : k.takTerbaca);
        const pindai = await bacaPindaian(f, (m: Kemajuan) => {
          if (m.tahap === "menyiapkan") setKemajuan(k.ocrSiap);
          else if (m.tahap === "menggambar")
            setKemajuan(k.ocrGambar(m.halaman ?? 1, m.dari ?? 1));
          else if (m.tahap === "membaca")
            setKemajuan(k.ocrBaca(m.persen ?? 0));
          else setKemajuan(null);
        });
        teks = pindai.teks;
        kataOCR = pindai.kata;
      }

      // Kolom "Nilai / Skema Fee" di dalam memonya bukan satu kalimat
      // melainkan beberapa tabel berkategori. Dibedah menjadi baris di sini,
      // lalu ditampilkan untuk diperiksa sebelum ikut tersimpan.
      const rinci = bedahSkema(kataOCR);
      if (rinci.length) {
        setSkema(rinci);
        // Kolom Nilai / Skema Fee yang lama tetap diisi ringkasannya, supaya
        // rekapitulasi menyamping tetap terbaca dalam satu baris tanpa harus
        // membuka rinciannya.
        isi("nilai_skema", ringkasSkema(rinci), nilai, setNilai);
      }

      const dariGambar = tebakKolom(teks);

      // Ejaan nama hasil OCR sering meleset satu dua huruf ("Allmonk" untuk
      // "Al Imron"). Hasil bacaan mesin dipadankan ke nama yang ejaannya
      // sudah dipastikan benar; yang tidak mirip dengan satu pun di antaranya
      // dibiarkan apa adanya.
      //
      // Acuannya bukan memo project ini saja. Memo pertama sebuah project
      // tidak punya pendahulu, dan justru di situlah ejaan OCR masuk mentah
      // ke basis data — persis yang terjadi pada "Allmonk". Daftarnya datang
      // dari server: nama pengguna sistem, ditambah penanda tangan seluruh
      // memo yang sudah tersimpan, lintas project.
      dariGambar.diajukan_oleh =
        cocokkanNama(dariGambar.diajukan_oleh, namaDikenal);
      dariGambar.diketahui_oleh =
        cocokkanNama(dariGambar.diketahui_oleh, namaDikenal);
      dariGambar.disetujui_oleh =
        cocokkanNama(dariGambar.disetujui_oleh, namaDikenal);
      m += +isi("judul", dariGambar.judul, judul, setJudul);
      m += +isi("nomor", dariGambar.nomor, nomor, setNomor);
      m += +isi("tanggal_memo", dariGambar.tanggal_memo, tanggalMemo, setTanggalMemo);
      m += +isi("berlaku_dari", dariGambar.berlaku_dari, dari, setDari);
      m += +isi("berlaku_sampai", dariGambar.berlaku_sampai, sampai, setSampai);
      m += +isi("dari", dariGambar.dari, dariSiapa, setDariSiapa);
      m += +isi("kepada", dariGambar.kepada, kepada, setKepada);
      m += +isi("nilai_skema", dariGambar.nilai_skema, nilai, setNilai);
      m += +isi("dokumen_wajib", dariGambar.dokumen_wajib, dokumen, setDokumen);
      m += +isi("diajukan_oleh", dariGambar.diajukan_oleh, diajukan, setDiajukan);
      m += +isi("diketahui_oleh", dariGambar.diketahui_oleh, diketahui, setDiketahui);
      m += +isi("disetujui_oleh", dariGambar.disetujui_oleh, disetujui, setDisetujui);

      // Kolom yang tetap kosong DIBIARKAN kosong.
      //
      // Sebelumnya kolom sisa disalin dari memo terakhir project ini. Itu
      // dihapus atas permintaan: setiap memo harus mengacu pada berkas
      // lampirannya sendiri. Memo yang menyebut penyetuju lain, nilai skema
      // lain, atau dokumen wajib lain tidak boleh tertutup salinan memo
      // sebelumnya — kolom yang kosong adalah keterangan jujur bahwa memonya
      // memang tidak menyebutkannya, dan itu lebih baik daripada angka yang
      // tampak benar tetapi bukan milik memo ini.
      setKabar(berteks ? k.terbacaIsi(n) : (m ? k.ocrHasil(m) : k.ocrKosong));
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setMembaca(false); setKemajuan(null); }
  };

  /** Lampirkan satu berkas pada memo yang barisnya sedang terbuka. */
  const lampirkan = async (memoId: string) => {
    if (!lBerkas) return;
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const fd = new FormData();
      fd.append("file", lBerkas);
      fd.append("label", lLabel);
      const res = await fetch(`/api/memos/${memoId}/lampiran`,
                              { method: "POST", body: fd });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.lampiranTersimpan(b.file_name ?? lBerkas.name));
      setLBerkas(null); setLLabel("");
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  const hapusLampiran = async (f: Lampiran) => {
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/memos/lampiran/${f.id}`,
                              { method: "DELETE" });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.lampiranDihapus(f.file_name));
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  const bolehHapus = sesi.role === "admin_sales" || sesi.role === "admin_system";
  const lampiranDari = (memoId: string) =>
    lampiran.filter((f) => f.memo_id === memoId);

  /**
   * Memo yang diunggah pada hari ini.
   *
   * Dibandingkan menurut tanggal setempat, bukan UTC: yang mengunggah pada
   * pukul tujuh pagi WIB masih berada di tanggal kemarin menurut UTC, dan
   * unggahannya tidak akan terhitung sebagai unggahan hari ini.
   */
  const baruHariIni = daftar.filter((m) => {
    if (!m.uploaded_at) return false;
    const u = new Date(m.uploaded_at);
    if (Number.isNaN(u.getTime())) return false;
    const kini = new Date();
    return u.getFullYear() === kini.getFullYear() &&
           u.getMonth() === kini.getMonth() &&
           u.getDate() === kini.getDate();
  }).length;

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      {galat && (
        <div className="banner stop"><b>{k.galat}</b>{galat}</div>
      )}
      {kabar && <div className="banner ok">{kabar}</div>}

      <div className="panel sp">
        <div className="form-blok">
          <h3>{k.unggahJudul}</h3>
          <div className="filters">
            <div>
              <div className="lbl">{k.fJudul}</div>
              <input value={judul} placeholder={k.cJudul}
                     onChange={(e) => setJudul(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fNomor}</div>
              <input value={nomor} placeholder={k.cNomor}
                     onChange={(e) => setNomor(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fTanggal}</div>
              <input type="date" value={tanggalMemo}
                     onChange={(e) => setTanggalMemo(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fDari}</div>
              <input type="date" value={dari}
                     onChange={(e) => setDari(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.fSampai}</div>
              <input type="date" value={sampai}
                     onChange={(e) => setSampai(e.target.value)} />
            </div>
          </div>

          {/* Pengajuan (Dari), Kepada (Yth), Nilai / Skema Fee, dan ketiga
              nama penanda tangan tidak lagi punya kotak isian di sini.
              Keenamnya dibaca dari memonya sendiri, bukan diketik; kotak yang
              selalu terisi sendiri hanya memanjangkan formulir dan mengundang
              orang mengubah apa yang seharusnya mengikuti memonya. Nilainya
              tetap disimpan dan tetap tampil pada rekapitulasi. */}

          {/* Rincian skema fee tidak lagi ditampilkan di sini. Tabelnya
              tetap dibedah dari memonya dan tetap ikut tersimpan — yang
              dihilangkan tampilannya pada formulir, bukan pembedahannya.
              Hasilnya dilihat pada baris memonya di rekapitulasi, tempat
              seluruh memo dibandingkan berdampingan. */}

          <div className="lbl" style={{ marginTop: 12 }}>{k.fKeterangan}</div>
          <textarea value={keterangan} style={{ width: "100%", minHeight: 54 }}
                    placeholder={k.cKeterangan}
                    onChange={(e) => setKeterangan(e.target.value)} />

          <div className="lbl" style={{ marginTop: 12 }}>
            {k.fBerkas}
            {membaca && (
              <span className="sedang-baca">{kemajuan ?? k.membaca}</span>
            )}
          </div>
          {/* Memilih berkas sekaligus membacanya: kolom di atas terisi sendiri
              sejauh yang dapat dibaca, dan yang tidak terbaca tetap kosong
              menunggu diketik. */}
          <input type="file" style={{ width: "100%" }}
                 accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx"
                 onChange={(e) => {
                   const f = e.target.files?.[0] ?? null;
                   setBerkas(f);
                   if (f) void bacaBerkas(f);
                 }} />

          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="pri" disabled={!berkas || busy || membaca}
                    onClick={() => void unggah()}>
              {busy ? k.mengunggah : k.unggah}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          {k.daftar}
          <span>
            {/* Unduhan, bukan tombol: berkasnya dibangkitkan server dan
                langsung disimpan peramban, tanpa layar perantara. */}
            {daftar.length > 0 && (
              <a className="tautan-klaim" href="/api/memos/rekap"
                 style={{ marginRight: 8 }}>
                {k.unduhRekap}
              </a>
            )}
            <span className="pill">{k.pBaru(baruHariIni)}</span>
            <span className="pill">{k.pArsip(daftar.length)}</span>
          </span>
        </h2>

        {/* Rekapitulasi ke samping, mengikuti bentuk cetakannya: satu memo
            satu baris, sepuluh kolom. Lebarnya melampaui layar mana pun, jadi
            ia digulir di dalam bidangnya sendiri — bukan memaksa seluruh
            halaman ikut melebar. */}
        <div className="tscroll">
          <table className="rekap-memo"><tbody>
            <tr>
              <th>{k.kNo}</th><th>{k.kNomor}</th><th>{k.kTanggal}</th>
              <th>{k.kDari}</th><th>{k.kPerihal}</th><th>{k.kPeriode}</th>
              <th>{k.kBerkas}</th><th>{k.kLampiran}</th>
              {bolehHapus && <th>{k.kTindakan}</th>}
            </tr>

            {daftar.map((m, i) => (
              <tr key={m.id}>
                <td className="no">{i + 1}</td>
                <td className="nomor">{m.nomor ?? "—"}</td>
                <td>{tglPanjang(m.tanggal_memo, bahasa) ?? "—"}</td>
                <td>{m.dari ?? "—"}</td>
                <td>
                  {m.judul}
                  {m.keterangan && <span className="sisip">{m.keterangan}</span>}
                </td>
                <td>
                  {periode(m.berlaku_dari, m.berlaku_sampai, bahasa,
                           k.seterusnya) ?? "—"}
                </td>
                <td>
                  <a href={`/api/memos/${m.id}`} target="_blank" rel="noreferrer">
                    {m.file_name}
                  </a>
                  <span className="sisip">
                    {kb(m.size_bytes)} · {tgl(m.uploaded_at)} · {m.uploaded_by}
                  </span>
                </td>
                <td>
                  {/* Jumlahnya yang ditampilkan, bukan daftarnya: nama berkas
                      pendukung panjang-panjang, dan tiga di antaranya akan
                      menenggelamkan sembilan kolom lain di sebelahnya. Yang
                      ingin melihatnya membuka barisnya. */}
                  <button className="tombol-lampiran"
                          onClick={() => {
                            setTerbuka(terbuka === m.id ? null : m.id);
                            setLBerkas(null); setLLabel("");
                          }}>
                    {lampiranDari(m.id).length
                      ? k.nLampiran(lampiranDari(m.id).length)
                      : k.takAdaLampiran}
                    <span className="anak-panah">
                      {terbuka === m.id ? "▾" : "▸"}
                    </span>
                  </button>
                </td>
                {bolehHapus && (
                  <td>
                    <button disabled={busy} onClick={() => void hapus(m)}>
                      {k.hapus}
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {/* Baris lampiran menyisip tepat di bawah memonya, selebar
                tabel. Ditaruh di kolomnya sendiri, ia akan memaksa kolom itu
                selebar daftar berkasnya pada seluruh baris lain. */}
            {daftar.map((m) => terbuka === m.id && (
              <tr key={`${m.id}-lampiran`} className="terbuka">
                <td colSpan={bolehHapus ? 9 : 8}>
                  <div className="rincian lampiran-memo">
                    <b>{m.nomor ?? m.judul}</b>

                    {lampiranDari(m.id).length > 0 && (
                      <ul className="berkas-lampiran">
                        {lampiranDari(m.id).map((f) => (
                          <li key={f.id}>
                            <a href={`/api/memos/lampiran/${f.id}`}
                               target="_blank" rel="noreferrer">
                              {f.label ? `${f.label} — ` : ""}{f.file_name}
                            </a>
                            <span className="sisip">
                              {kb(f.size_bytes)} · {tgl(f.uploaded_at)} ·{" "}
                              {f.uploaded_by}
                            </span>
                            {bolehHapus && (
                              <button disabled={busy}
                                      onClick={() => void hapusLampiran(f)}>
                                {k.hapus}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="unggah-lampiran">
                      <div>
                        <div className="lbl">{k.fLabel}</div>
                        <input value={lLabel} placeholder={k.cLabel}
                               onChange={(e) => setLLabel(e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">{k.fLampiran}</div>
                        <input type="file"
                               accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx"
                               onChange={(e) =>
                                 setLBerkas(e.target.files?.[0] ?? null)} />
                      </div>
                      <button className="pri" disabled={!lBerkas || busy}
                              onClick={() => void lampirkan(m.id)}>
                        {busy ? k.melampirkan : k.lampirkan}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}

            {!daftar.length && (
              <tr>
                <td colSpan={bolehHapus ? 9 : 8} style={{ color: "var(--mut)" }}>
                  {k.kosong}
                </td>
              </tr>
            )}
          </tbody></table>
        </div>
      </div>
    </Kerangka>
  );
}

"use client";

/**
 * Approval / Persetujuan — rincian dokumen pengajuan.
 *
 * Ke sinilah pengajuan mendarat setelah dibuat dari layar Pengajuan Fee.
 * Sebelumnya layar ini hanya mengalihkan ke konsol klaim, dan pengajuan yang
 * baru dibuat langsung membuka jendela pratinjau — sehingga yang mengajukan
 * empat fee sekaligus mendapat jendela penuh formulir sebelum sempat melihat
 * apa yang barusan ia buat.
 *
 * Yang ditampilkan di sini rinciannya: nomor, jenis, unit, penerima, angka, dan
 * keadaannya. Pratinjau formulirnya ada di kolom paling kanan, dibuka sendiri
 * saat memang mau diperiksa.
 *
 * Satu tindakan memang ada di sini: mengirim tautan tanda tangan ke
 * Sales/Agent, di dalam kolom Status, hanya untuk Admin Sales. Tempatnya
 * memang di sini — yang dikirim adalah dokumen yang barusan dibaca pada baris
 * itu, dan sebelumnya tombolnya berada di layar Pengajuan Fee, satu layar
 * sebelum dokumennya ada.
 *
 * Tindakan lain atas klaim — meneruskan, menahan, menyetujui — tetap di konsol.
 * Dua layar yang sama-sama dapat menggerakkan klaim akan berbeda perilaku cepat
 * atau lambat, dan bedanya berupa klaim yang disetujui di satu layar tetapi
 * tidak di layar lain.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { JENIS, namaJenis } from "../klaim/jenis";
import { namaKategori } from "@/lib/kategori";
import { TAHAP, bolehBukaDokumen, bolehGerak, tahapDari } from "@/lib/tahap";
import { LANGKAH, keadaanLangkah, sebutanLangkah, warnaLangkah }
  from "@/lib/langkah";
// Pemecah berkas yang sudah terbukti pada memo. Mekanismenya tidak
// memo-spesifik — ia hanya menjaga agar satu permintaan tidak pernah melampaui
// batas fungsi serverless — dan menyalinnya ke sini berarti dua salinan yang
// akan berbeda perilaku begitu salah satunya diperbaiki.
import { BATAS_FULL_SIGN, periksaUkuran, perluDipecah, titipBerkas }
  from "../memo/kirim";
import { PilihBerkas } from "../pilih-berkas";
import { KodeQr } from "../kode-qr";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;
const tgl = (v?: string | null) => (v ? String(v).slice(0, 10) : "—");

/** "2026-09-21" menjadi "21/09/2026", sebagaimana tertulis pada acuannya. */
const tglPendek = (v?: string | null) => {
  const [y, b, h] = String(v ?? "").slice(0, 10).split("-");
  return y && b && h ? `${h}/${b}/${y}` : "—";
};

/**
 * "Diajukan oleh" sebagaimana diminta: nama orangnya, dengan nama masuknya
 * di dalam kurung. Nama lengkapnya dapat hilang bila akunnya sudah dihapus —
 * yang tersisa nama masuknya saja, dan itu tetap lebih berarti daripada
 * kolom kosong.
 */
const pengaju = (c: any) => {
  const nama = c.diajukan_oleh_nama, masuk = c.diajukan_oleh;
  if (!masuk) return "—";
  return nama ? `${nama} (${masuk})` : masuk;
};

/**
 * Kategori penerimanya — keenamnya, bukan hanya Sales Inhouse dan Agent.
 *
 * Yang dipakai adalah peran penerima pada klaimnya sendiri: itulah kategori
 * yang dipilih saat fee ini diajukan, dan ia tersimpan bersama klaimnya.
 * Membacanya dari data marketing yang sekarang akan menampilkan kategori
 * orangnya hari ini, bukan kategori yang berlaku saat pengajuannya dibuat —
 * dan klaim lama harus tetap menyebut apa yang benar saat itu.
 *
 * Klaim lama, dari sebelum kategorinya dapat dipilih, jatuh ke jenis
 * marketingnya seperti sebelumnya.
 */
const kategori = (c: any, k: { katAgent: string; katInhouse: string },
                  bahasa: "id" | "en" = "id") =>
  c.recipient_role ? namaKategori(c.recipient_role, bahasa)
  : c.marketing?.category ? namaKategori(c.marketing.category, bahasa)
  : c.marketing?.marketing_type === "agent" ? k.katAgent
  : c.marketing?.marketing_type === "inhouse" ? k.katInhouse
  : null;

const KATA = {
  id: {
    judul: "Manajemen Alur Kerja Dokumen",
    galat: "Data klaim tidak dapat dibaca",
    tampilkan: "Search",
    sUnit: "Unit", sJalan: "Diproses / Berlangsung", sSelesai: "Selesai",
    jumlah: (n: number) => `${n} klaim`,
    unduhRekap: "Download (.xlsx)",
    pDraf: (n: number) => `📝 Buat Pengajuan · ${n}`,
    pButuh: (n: number) => `📥 Kotak Masuk Persetujuan · ${n}`,
    pPantau: (n: number) => `⏱️ Pantau Alur · ${n}`,
    pArsip: (n: number) => `🗃️ Arsip Dokumen Selesai · ${n}`,
    tahapJudul: "Tahap peredaran",
    tahapBelum: "Belum beredar",
    tahapGerak: "Memindahkan…",
    tahapPindah: (t: string) => `Dokumen berpindah ke tahap "${t}".`,
    fsTombol: "Submit Dokumen Final",
    fsJudul: "Dokumen full sign",
    fsBerkas: "Berkas dokumen yang sudah lengkap tanda tangannya",
    fsKirim: "Unggah & Finalisasi", fsMengirim: "Mengunggah…",
    fsKemajuan: (n: number) => `Mengunggah… ${n}%`,
    fsTerlaluBesar:
      "Berkas ditolak karena terlalu besar untuk satu permintaan. " +
      "Perkecil dulu berkasnya, misalnya dengan memindai pada resolusi " +
      "yang lebih rendah.",
    fsSelesai: "Dokumen full sign tersimpan. Klaim maju ke Persetujuan Final.",
    fsCatatan: "Keasliannya tidak dicocokkan dengan dokumen terbitan sistem. " +
               "Jejak audit mencatat bahwa persetujuan ini berdasar berkas " +
               "yang diunggah.",
    fsLihat: "Lihat dokumen full sign",
    pjkTombol: "Verifikasi Pajak",
    pjkJudul: "Verifikasi Pajak",
    pjkPengantar:
      "Periksa angkanya sebelum dokumen ini berjalan. Yang disetujui di sini " +
      "terkunci dan tercetak pada formulir yang ditandatangani Sales/Agent.",
    pjkSistem: "Angka dari sistem",
    pjkBruto: "Jumlah komisi", pjkPpn: "PPN", pjkPph: "PPh",
    pjkBersih: "Dibayarkan",
    pjkKoreksiJudul: "Koreksi angka",
    pjkKoreksiCatatan:
      "Kosongkan yang tidak dikoreksi — yang kosong memakai angka sistem. " +
      "Nilai bersih dihitung ulang sendiri.",
    pjkAlasan: "Alasan (minimal 10 karakter, dibaca Sales/Agent sebelum tanda tangan)",
    pjkAlasanKembali: "Alasan pengembalian (dibaca Admin Sales)",
    pjkSetuju: "Setujui & kunci nilai",
    pjkSetujuKoreksi: "Setujui dengan koreksi",
    pjkKembalikan: "Kembalikan ke Admin Sales",
    pjkMengirim: "Menyimpan…",
    pjkSelesaiSetuju: "Nilai terkunci, dokumen berjalan ke Admin Sales.",
    pjkSelesaiKoreksi: "Koreksi tersimpan dan nilai terkunci.",
    pjkSelesaiKembali: "Dokumen dikembalikan ke Admin Sales.",
    ttdTombol: "Tinjau Tanda Tangan",
    ttdJudul: "Tinjau tanda tangan",
    ttdPengantar:
      "Goresan Sales/Agent tidak cukup mirip dengan spesimennya, jadi " +
      "dokumen ini berhenti untuk diperiksa orang. Bandingkan dengan " +
      "spesimen yang tersimpan sebelum memutuskan.",
    ttdSkor: "Skor kemiripan",
    ttdMemuat: "Memuat tanda tangannya…",
    ttdGoresan: "Goresan yang baru dibuat",
    ttdSpesimen: "Spesimen tersimpan",
    ttdTanpaSpesimen: "Belum ada spesimen tersimpan untuk dibandingkan.",
    ttdPerbesar: "Perbesar gambarnya",
    ttdTutupGambar: "Tutup",
    ttdPercobaan: (n: number) => `Percobaan ke-${n}`,
    ttdAmbang: (skor: number | null, ambang: number) =>
      `Skor ${skor ?? "—"} dari ambang ${ambang}`,
    ttdAlasan: "Alasan (minimal 10 karakter, tercatat pada jejak audit)",
    ttdSetuju: "Setujui tanda tangannya",
    ttdTolak: "Tolak klaimnya",
    ttdMengirim: "Menyimpan…",
    ttdSelesai: "Tanda tangan disetujui; dokumen lanjut ke crosscheck.",
    ttdSelesaiTolak: "Klaim ditolak.",
    ccTombol: "Crosscheck",
    ccJudul: "Crosscheck sebelum cetak",
    ccPengantar:
      "Dua pihak memeriksa dokumen yang sudah ditandatangani sebelum ia " +
      "dicetak. Dokumen baru dapat dicetak setelah keduanya selesai.",
    ccAdmin: "Admin Sales", ccFinance: "Finance",
    ccSudah: "Selesai", ccBelum: "Belum",
    ccSelesaikan: "Tandai selesai",
    ccMengirim: "Menyimpan…",
    ccBeres: (pihak: string) => `Crosscheck ${pihak} selesai.`,
    ccBeresSemua: "Kedua crosscheck selesai; dokumen siap dicetak.",
    fokusSatu: "Menampilkan satu pengajuan.",
    fokusSemua: "Tampilkan semuanya",
    hapTombol: "Hapus",
    hapJudul: "Hapus pengajuan",
    hapPengantar:
      "Untuk pengajuan yang terlanjur salah input — unit, penerima, atau " +
      "jenis feenya keliru. Yang terhapus beserta seluruh berkas, sesi tanda " +
      "tangan, dan instruksi transfernya yang belum dibayar. Jejak auditnya " +
      "tetap tersimpan.",
    hapAlasan: "Alasan (minimal 10 karakter, tercatat pada jejak audit)",
    hapKirim: "Hapus pengajuan ini", hapMengirim: "Menghapus…",
    hapSelesai: (no: string) => `Pengajuan ${no} dihapus.`,
    hapSudahBayar:
      "Pengajuan ini SUDAH DIBAYAR. Menghapusnya menghapus catatan atas uang " +
      "yang benar-benar keluar: baris pelunasannya ikut dilepas, dan rekap " +
      "pembayaran periode itu berkurang sebanyak nilai di atas — termasuk " +
      "bila periodenya sudah ditutup dan laporannya sudah dicetak.",
    byrTombol: "Input Data Pembayaran",
    byrJudul: "Pembayaran",
    byrTanggal: "Tanggal pembayaran",
    byrBukti: "Bukti transfer",
    byrAlasan: "Keterangan",
    byrKirim: "Input Data Pembayaran", byrMengirim: "Menyimpan…",
    byrSelesai: "Pembayaran tercatat beserta bukti transfernya.",
    batal: "Batal",
    daftar: "Pengajuan & Dokumen",
    thNo: "No.", thTanggal: "Tanggal Pengajuan", thUnit: "Unit",
    thPerihal: "Jenis Pengajuan", thIom: "No. IOM",
    // Satu kalimat untuk seluruh kotak yang diisi tangan — nomor IOM,
    // divisi, maupun tanggal. Tiga sebutan berbeda untuk satu perbuatan yang
    // sama membuat kolom-kolom yang berdampingan terbaca sebagai tiga jenis
    // isian yang berlainan, padahal ketiganya sama-sama diketik orang.
    isiData: "Isi Data",
    tambahBaris: "tambah", hapusKotak: "Hapus kotak ini",
    tegurJudul: "Isian belum dapat disimpan",
    tglTakLengkap:
      "Tanggalnya belum lengkap, jadi belum tersimpan. Isi hari, bulan dan "
      + "tahunnya (hh/bb/tttt), atau kosongkan kotaknya sama sekali.",
    hapusKotakTanya: (v: string) =>
      `Hapus "${v}" dari kolom ini? Isian di bawahnya naik satu kotak.`,
    thPengirim: "Divisi Pengirim", thPenerimaDiv: "Divisi Penerima",
    thDistribusi: "Tanggal Distribusi", thDiterima: "Tanggal Penerima",
    thKategori: "Kategori", thPenerima: "Penerima",
    // "Fee", bukan "Komisi": kolom ini memuat keempat jenis — Closing Fee,
    // Cash Reward, Continuity Reward, Komisi — dan Overriding. Menyebut
    // seluruhnya "Komisi" menamai kelompoknya dengan nama salah satu
    // anggotanya, dan baris Closing Fee lalu terbaca seolah salah kolom.
    thPengaju: "Diajukan Oleh", thBruto: "Jumlah Fee",
    thPpn: "PPN", thPph: "PPh", thBersih: "Fee Yang Dibayarkan",
    thTglBayar: "Tanggal Pembayaran",
    thStatus: "Status", thDokumen: "Tindakan",
    katInhouse: "Sales Inhouse", katAgent: "Agent",
    pratinjau: "Preview Dokumen",
    pratinjauTertutup:
      "Belum dikirim ke Pajak — dokumennya terbuka sendiri begitu Admin " +
      "Sales meneruskannya ke verifikasi pajak.",
    kosong: "Belum ada pengajuan pada project ini.",
    memuat: "Memuat…",
    kabarJudul: "Dokumen sudah dikirim ke tim pajak",
    kabarIsi: (n: number) =>
      `${n} dokumen pengajuan sudah dikirim ke tim pajak untuk diverifikasi. ` +
      "Bila sudah benar, dokumennya kembali ke Anda untuk dikirimkan " +
      "tautannya kepada Sales/Agent lewat WhatsApp.",
    kabarTutup: "Tutup",
    waKirim: "Kirim tautan WA", waMengirim: "Mengirim…",
    waUlang: "Kirim ulang tautan",
    waTanpaHp: "No. HP penerima belum tercatat",
    waTerbit: (hp: string) => `Tautan terbit untuk ${hp}.`,
    waBukaWa: "Buka WhatsApp", waSalin: "Salin pesan",
    waEmail: "Kirim Email",
    waTanpaEmail:
      "Surel belum terisi pada Data Marketing, jadi tautannya hanya dapat " +
      "dikirim lewat WhatsApp.",
    waHpKosong:
      "Nomor telepon belum terisi pada Data Marketing, jadi tautannya hanya " +
      "dapat dikirim lewat surel.",
    waUnduhQr: "Unduh QR",
    waLampirQr:
      "QR tidak dapat ikut terkirim sendiri lewat WhatsApp maupun surel — " +
      "unduh gambarnya lalu lampirkan, bila memang mau disertakan. Tautannya " +
      "sendiri sudah tertulis di dalam pesannya.",
    waSurelPerihal: (no: string) => `Tanda tangan dokumen ${no}`,
    waTersalin: "Pesan tersalin.",
    waKode: "Kode verifikasi:",
    waQr: "Pindai untuk membuka tautan",
    waQrGagal:
      "Kode QR tidak dapat dibuat di peramban ini. Pakai alamat tautan di atas.",
    waKodeCatatan: "Sampaikan kode lewat jalur terpisah dari tautannya.",
    waGagal: "Tautan tidak dapat diterbitkan",
    waJudul: "Tautan tanda tangan untuk Sales/Agent",
    waLihat: "Lihat tautannya",
    waAlamat: "Kata Sambutan",
    /**
     * Kata sambutan yang menyertai tautannya.
     *
     * Nama penerima dan nama project diisi dari pengajuannya sendiri, bukan
     * diketik ulang tiap kali: yang diketik ulang akan salah pada pengajuan
     * yang kesepuluh, dan yang menerimanya membaca namanya sendiri salah tulis
     * pada surat yang memintanya menandatangani sesuatu.
     */
    waSambutan: (penerima: string, project: string, tautan: string) =>
      `Dear Bapak/Ibu. ${penerima}\n\n` +
      `Selamat Pagi/Siang/Sore/Malam Bapak/Ibu. ${penerima}\n` +
      "Berikut terlampir Link untuk Form Pengajuan Fee yang perlu " +
      `Bapak/Ibu. ${penerima} isi untuk kami dapat proses.\n` +
      "Terima kasih.\n\n" +
      "Salam Hangat,\n" +
      `Admin ${project}\n\n` +
      tautan,
    waTutup: "Tutup",
    ringkasTutup: "Ringkas kembali",
    ringkasBuka: "Tampilkan seluruh langkah",
  },
  en: {
    judul: "Document Workflow Management",
    galat: "Claim data could not be read",
    tampilkan: "Search",
    sUnit: "Unit", sJalan: "In progress", sSelesai: "Completed",
    jumlah: (n: number) => `${n} claims`,
    unduhRekap: "Download (.xlsx)",
    pDraf: (n: number) => `📝 Drafting · ${n}`,
    pButuh: (n: number) => `📥 Need Approval · ${n}`,
    pPantau: (n: number) => `⏱️ In Progress / Tracking · ${n}`,
    pArsip: (n: number) => `🗃️ Approved / Archive · ${n}`,
    tahapJudul: "Circulation stage",
    tahapBelum: "Not circulating yet",
    tahapGerak: "Moving…",
    tahapPindah: (t: string) => `The document moved to "${t}".`,
    fsTombol: "Upload the fully signed document",
    fsJudul: "Fully signed document",
    fsBerkas: "The file of the document with every signature on it",
    fsKirim: "Upload and approve", fsMengirim: "Uploading…",
    fsKemajuan: (n: number) => `Uploading… ${n}%`,
    fsTerlaluBesar:
      "The file was rejected as too large for a single request. Shrink it " +
      "first, for instance by scanning at a lower resolution.",
    fsSelesai: "The signed document is stored. The claim moved to Final approval.",
    fsCatatan: "Its authenticity is not matched against the document the " +
               "system issued. The audit trail records that this approval " +
               "rests on an uploaded file.",
    fsLihat: "Open the signed document",
    pjkTombol: "Tax verification",
    pjkJudul: "Tax verification",
    pjkPengantar:
      "Check the figures before this document travels. What is approved here " +
      "is locked and printed on the form the Sales/Agent signs.",
    pjkSistem: "System figures",
    pjkBruto: "Commission", pjkPpn: "VAT", pjkPph: "Withholding tax",
    pjkBersih: "Payable",
    pjkKoreksiJudul: "Correct the figures",
    pjkKoreksiCatatan:
      "Leave blank what you are not correcting — blanks keep the system " +
      "figure. The net amount is recalculated automatically.",
    pjkAlasan: "Reason (at least 10 characters, read by the Sales/Agent before signing)",
    pjkAlasanKembali: "Reason for returning it (read by the Sales Admin)",
    pjkSetuju: "Approve & lock",
    pjkSetujuKoreksi: "Approve with correction",
    pjkKembalikan: "Return to the Sales Admin",
    pjkMengirim: "Saving…",
    pjkSelesaiSetuju: "Figures locked; the document moves on to the Sales Admin.",
    pjkSelesaiKoreksi: "The correction is saved and the figures are locked.",
    pjkSelesaiKembali: "The document has been returned to the Sales Admin.",
    ttdTombol: "Review the signature",
    ttdJudul: "Signature review",
    ttdPengantar:
      "The Sales/Agent's strokes are not close enough to their specimen, so " +
      "this document stopped for a person to look at. Compare it with the " +
      "stored specimen before deciding.",
    ttdSkor: "Similarity score",
    ttdMemuat: "Loading the signatures…",
    ttdGoresan: "The strokes just made",
    ttdSpesimen: "Stored specimens",
    ttdTanpaSpesimen: "There is no stored specimen to compare against.",
    ttdPerbesar: "Enlarge this image",
    ttdTutupGambar: "Close",
    ttdPercobaan: (n: number) => `Attempt ${n}`,
    ttdAmbang: (skor: number | null, ambang: number) =>
      `Score ${skor ?? "—"} against a threshold of ${ambang}`,
    ttdAlasan: "Reason (at least 10 characters, kept in the audit trail)",
    ttdSetuju: "Approve the signature",
    ttdTolak: "Reject the claim",
    ttdMengirim: "Saving…",
    ttdSelesai: "Signature approved; the document moves on to crosscheck.",
    ttdSelesaiTolak: "The claim has been rejected.",
    ccTombol: "Crosscheck",
    ccJudul: "Crosscheck before printing",
    ccPengantar:
      "Two parties check the signed document before it is printed. It can " +
      "only be printed once both are done.",
    ccAdmin: "Sales Admin", ccFinance: "Finance",
    ccSudah: "Done", ccBelum: "Not yet",
    ccSelesaikan: "Mark as done",
    ccMengirim: "Saving…",
    ccBeres: (pihak: string) => `The ${pihak} crosscheck is done.`,
    ccBeresSemua: "Both crosschecks are done; the document is ready to print.",
    fokusSatu: "Showing a single submission.",
    fokusSemua: "Show all of them",
    hapTombol: "Delete",
    hapJudul: "Delete the submission",
    hapPengantar:
      "For a submission entered wrongly — the wrong unit, recipient or fee " +
      "type. It goes together with its files, signing sessions and any " +
      "unpaid transfer instruction. The audit trail stays.",
    hapAlasan: "Reason (at least 10 characters, kept in the audit trail)",
    hapKirim: "Delete this submission", hapMengirim: "Deleting…",
    hapSelesai: (no: string) => `Submission ${no} has been deleted.`,
    hapSudahBayar:
      "This submission has ALREADY BEEN PAID. Deleting it removes the record " +
      "of money that actually left: its settlement lines go with it, and the " +
      "payment recap for that period drops by the amount above — even if the " +
      "period is closed and its report has been printed.",
    byrTombol: "Record the payment",
    byrJudul: "Payment",
    byrTanggal: "Payment date",
    byrBukti: "Transfer proof",
    byrAlasan: "Notes",
    byrKirim: "Record the payment", byrMengirim: "Saving…",
    byrSelesai: "The payment is recorded together with its transfer proof.",
    batal: "Cancel",
    daftar: "Submissions & documents",
    thNo: "No.", thTanggal: "Submitted on", thUnit: "Unit",
    thPerihal: "Submission type", thIom: "IOM no.",
    isiData: "Enter data",
    tambahBaris: "add", hapusKotak: "Remove this box",
    tegurJudul: "Entry not saved",
    tglTakLengkap:
      "That date is incomplete, so nothing was saved. Fill in the day, "
      + "month and year, or clear the box entirely.",
    hapusKotakTanya: (v: string) =>
      `Remove "${v}" from this column? Entries below move up one box.`,
    thPengirim: "Sending division", thPenerimaDiv: "Receiving division",
    thDistribusi: "Distributed on", thDiterima: "Received on",
    thKategori: "Category", thPengaju: "Submitted by",
    thPpn: "VAT", katInhouse: "In-house sales", katAgent: "Agent",
    thPenerima: "Recipient", thBruto: "Fee amount",
    thPph: "Withholding",
    thBersih: "Fee paid", thTglBayar: "Payment date",
    thStatus: "Status", thDokumen: "Action",
    pratinjau: "Review Document",
    pratinjauTertutup:
      "Not sent to Tax yet — it opens by itself once Admin Sales forwards it " +
      "to tax verification.",
    kosong: "No submissions on this project yet.",
    memuat: "Loading…",
    kabarJudul: "Sent to the tax team",
    kabarIsi: (n: number) =>
      `${n} submission documents were sent to the tax team for verification. ` +
      "Once correct, they come back to you so the link can be sent to the " +
      "Sales/Agent over WhatsApp.",
    kabarTutup: "Close",
    waKirim: "Send WhatsApp link", waMengirim: "Sending…",
    waUlang: "Re-send the link",
    waTanpaHp: "The recipient has no phone number on record",
    waTerbit: (hp: string) => `Link issued for ${hp}.`,
    waBukaWa: "Open WhatsApp", waSalin: "Copy the message",
    waEmail: "Send email",
    waTanpaEmail:
      "No email on Data Marketing, so the link can only go by WhatsApp.",
    waHpKosong:
      "No phone number on Data Marketing, so the link can only go by email.",
    waUnduhQr: "Download the QR",
    waLampirQr:
      "The QR cannot travel by itself through WhatsApp or email — download " +
      "the image and attach it if you want it included. The link itself is " +
      "already in the message.",
    waSurelPerihal: (no: string) => `Document signing ${no}`,
    waTersalin: "The message has been copied.",
    waKode: "Verification code:",
    waQr: "Scan to open the link",
    waQrGagal:
      "The QR code could not be drawn in this browser. Use the link address above.",
    waKodeCatatan: "Give the code through a channel separate from the link.",
    waGagal: "The link could not be issued",
    waJudul: "Signature link for the Sales/Agent",
    waLihat: "Show the link",
    waAlamat: "Greeting",
    waSambutan: (penerima: string, project: string, tautan: string) =>
      `Dear Bapak/Ibu. ${penerima}\n\n` +
      `Selamat Pagi/Siang/Sore/Malam Bapak/Ibu. ${penerima}\n` +
      "Berikut terlampir Link untuk Form Pengajuan Fee yang perlu " +
      `Bapak/Ibu. ${penerima} isi untuk kami dapat proses.\n` +
      "Terima kasih.\n\n" +
      "Salam Hangat,\n" +
      `Admin ${project}\n\n` +
      tautan,
    waTutup: "Close",
    ringkasTutup: "Collapse again",
    ringkasBuka: "Show every step",
  },
};

/**
 * Nomor untuk tautan wa.me, yang hanya menerima bentuk internasional.
 *
 * "08121234800" dikirim apa adanya akan membuka percakapan ke nomor yang tidak
 * ada. Awalan 0 diganti 62; yang sudah berawalan 62 atau +62 dibiarkan.
 */
function nomorWa(hp?: string | null): string {
  const bersih = String(hp ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  return bersih.startsWith("0") ? `62${bersih.slice(1)}` : bersih;
}

/**
 * Keadaan yang menunggu tautan tanda tangan dikirim.
 *
 * Yang sudah terkirim ikut, bukan hanya yang belum: tautannya berlaku terbatas
 * dan tidak tersimpan di mana pun setelah layar ditutup, jadi baris yang
 * kehilangan tombolnya begitu ditekan membawa serta tautan yang baru terbit —
 * sebelum sempat dibuka atau disalin.
 *
 * "Menunggu tanda tangan" pun ikut. Sales/Agent sudah membuka tautannya tetapi
 * belum menandatangani, dan pada keadaan itu tombolnya dulu hilang: tautannya
 * tidak dapat diperlihatkan lagi maupun diterbitkan ulang, sehingga klaimnya
 * menggantung di situ tanpa satu pun jalan untuk menindaklanjuti.
 */
/**
 * Menyamakan dua bentuk tanda tangan tersimpan menjadi satu alamat gambar.
 *
 * Goresan dari kanvas datang lengkap dengan awalan `data:`, sedangkan spesimen
 * yang dibangkitkan di server hanya base64 telanjang. Tanpa disamakan, separuh
 * gambarnya tampil sebagai ikon rusak — dan yang rusak justru sebagian, jadi
 * mudah dikira memang tidak ada tanda tangannya.
 */
const gambarTtd = (png?: string | null) =>
  !png ? null : png.startsWith("data:") ? png : `data:image/png;base64,${png}`;

const MENUNGGU_TAUTAN = ["tax_verified", "signature_link_sent",
                         "awaiting_signature"];

const SELESAI = ["completed", "paid", "rejected", "cancelled", "clawback"];

/**
 * Keempat kotak pada kepala panel, menurut keadaan pengajuannya.
 *
 * Susunannya sengaja saling lepas dan menutup seluruh keadaan: yang tidak
 * masuk tiga daftar di bawah jatuh ke "Pantau Alur". Dengan begitu keempat
 * angkanya selalu berjumlah tepat sebanyak pengajuan pada project ini — kotak
 * yang tidak menjumlah tidak akan terbaca sebagai salah, melainkan sebagai
 * berkas yang hilang, dan yang mencarinya tidak tahu harus mencari di mana.
 *
 * "Arsip" memakai daftar SELESAI yang sama dengan saringan Search, supaya satu
 * layar tidak memuat dua arti "selesai" yang berbeda.
 */
const DRAFTING = ["draft"];

/** Yang berhenti menunggu keputusan orang, bukan menunggu langkah berikutnya. */
const BUTUH_PERSETUJUAN = [
  "submitted", "pending_admin_review", "pending_tax_verification",
  "signature_review_required", "circulating_head_finance",
  "circulating_management",
];

const kotakKeadaan = (s: string) =>
  SELESAI.includes(s) ? "arsip"
  : DRAFTING.includes(s) ? "draf"
  : BUTUH_PERSETUJUAN.includes(s) ? "butuh"
  : "pantau";

/**
 * Saringan: tiga tampilan, sesuai permintaan kantor.
 *
 * Sebelumnya pemilihnya memuat dua kelompok — empat ringkasan dan satu butir
 * untuk tiap status yang ada, lengkap dengan jumlahnya. Yang dipakai
 * sehari-hari ternyata hanya "mana yang masih jalan" dan "mana yang sudah
 * selesai", sedangkan selusin butir status di bawahnya membuat keduanya harus
 * dicari dulu.
 *
 * "" adalah keadaan awal: belum ada yang dipilih. Pemilihnya tampil kosong dan
 * tabelnya utuh, seperti membuka layar ini tanpa saringan sama sekali. Ia
 * sengaja tetap berada di dalam daftar, bukan disembunyikan sesudah dipilih —
 * tanpa itu, yang sudah memilih "Selesai" tidak punya jalan kembali ke tabel
 * penuh selain memuat ulang halaman.
 *
 * "unit" tidak menyaring apa pun; ia menyusun barisnya menurut kode unit,
 * supaya pengajuan atas unit yang sama berkumpul. Urutan itu hanya berlaku
 * padanya — keadaan awal pun tetap memakai urutan dari server, yaitu tanggal
 * pengajuan.
 *
 * Pembatasan "diam" (draft, submitted, pending_admin_review) melebur ke
 * "jalan": keduanya sama-sama belum selesai, dan pemisahannya tidak pernah
 * dipakai. Batas itu kini sama persis dengan yang dipakai kedua angka pada
 * kepala panel — "Progress" dan "Finish" — sehingga pemilih dan angkanya tidak
 * lagi dapat berbeda arti.
 */
type Saring = "" | "unit" | "jalan" | "selesai";

export default function PersetujuanPage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);
  const [klaim, setKlaim] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [saring, setSaring] = useState<Saring>("");
  /** Jumlah klaim yang baru saja dikirim ke pajak dari jendela pratinjau. */
  const [terkirim, setTerkirim] = useState<number | null>(null);
  /** Tautan yang sudah terbit pada layar ini, berkunci id klaim. */
  const [tautan, setTautan] = useState<Record<string, any>>({});
  const [mengirim, setMengirim] = useState<string | null>(null);
  /** Klaim yang tahapnya sedang dipindahkan. */
  const [gerak, setGerak] = useState<string | null>(null);
  /** Baris yang nomor IOM-nya sedang dikirim, supaya tidak ditulis ganda. */
  const [iomSimpan, setIomSimpan] = useState<string | null>(null);
  /**
   * Sel tanggal yang sedang dibuka, sebagai "<id klaim>:<medan>".
   *
   * Hanya satu yang terbuka sekaligus: sel yang sedang diketik adalah satu
   * sel, dan menyimpan seluruh keadaan per baris membuat sel tetangga ikut
   * berganti bentuk saat salah satunya diklik.
   */
  const [tglBuka, setTglBuka] = useState<string | null>(null);
  /**
   * Kotak perpindahan yang dibuka tangan, per klaim DAN per kolom —
   * kuncinya "<id klaim>:<medan>".
   *
   * Tidak disimpan ke server: kotak kosong yang dibuka lalu ditinggalkan bukan
   * catatan apa pun, dan menyimpannya berarti berkas yang tidak pernah
   * berpindah tetap membawa kotak kosong selamanya.
   */
  const [barisAlur, setBarisAlur] = useState<Record<string, number>>({});
  /**
   * Kotak tanggal yang isiannya ditolak, sebagai "<id klaim>:<medan>".
   *
   * Banner galat berdiri di kepala halaman, sedangkan yang mengetik sedang
   * berada jauh di bawah pada tabel yang digulir. Pemberitahuan yang hanya
   * ada di tempat yang tidak sedang dilihat bukan pemberitahuan; kotaknya
   * sendiri ikut ditandai.
   */
  const [tglGagal, setTglGagal] = useState<string | null>(null);
  /**
   * Teguran isian, terpisah dari `galat`.
   *
   * Banner galat berjudul "Data klaim tidak dapat dibaca" — kalimat yang
   * benar untuk permintaan yang gagal, dan menyesatkan untuk tanggal yang
   * diketik separuh: yang mengetiknya akan menyangka datanya rusak, bukan
   * ketikannya yang belum lengkap. Dijadikan satu keadaan tersendiri, bukan
   * dengan mengubah bentuk `galat` yang dipakai tiga puluh dua tempat lain.
   */
  const [tegur, setTegur] = useState<string | null>(null);

  /**
   * Baris yang kolom Statusnya sedang dibentangkan.
   *
   * Bawaannya tetap terbentang — keempat langkahnya terlihat, seperti
   * sebelum panah ini ada. Panahnya hanya tambahan: yang sedang menyapu
   * banyak baris dapat meringkas sebuah baris menjadi langkah yang sedang
   * berjalan saja, sebab empat langkah dengan kalimatnya masing-masing
   * membuat satu baris setinggi hampir dua ratus tujuh puluh piksel.
   *
   * Pilihannya per baris dan tidak tersimpan: ia mengatur tampilan sesaat,
   * bukan data.
   */
  const [ringkas, setRingkas] = useState<Record<string, boolean>>({});
  /** Klaim yang sedang diunggahkan dokumen full sign-nya. */
  const [fsUntuk, setFsUntuk] = useState<string | null>(null);
  const [fsBerkas, setFsBerkas] = useState<File | null>(null);
  /**
   * Berapa persen berkas full sign sudah terkirim.
   *
   * Pindaian sepuluh megabita berjalan berpuluh detik pada sambungan kantor,
   * dan tombol yang hanya bertuliskan "Mengunggah…" selama itu tidak dapat
   * dibedakan dari layar yang menggantung.
   */
  const [fsKemajuan, setFsKemajuan] = useState<number | null>(null);
  /** Klaim yang sedang dicatat pembayarannya. */
  /**
   * Klaim yang sedang diverifikasi tim pajak.
   *
   * Pemeriksaan pajak sebelumnya hanya ada di layar /konsol, yang butir
   * menunya dibuang atas permintaan kantor — sehingga tim pajak tidak punya
   * jalan ke pekerjaannya sendiri kecuali mengetik alamatnya. Kini ia berdiri
   * di layar tempat tim pajak memang membaca daftar pengajuan.
   */
  const [pjkUntuk, setPjkUntuk] = useState<string | null>(null);
  const [pjkBruto, setPjkBruto] = useState("");
  const [pjkPpn, setPjkPpn] = useState("");
  const [pjkPph, setPjkPph] = useState("");
  const [pjkAlasan, setPjkAlasan] = useState("");
  /**
   * Klaim yang tanda tangannya sedang ditinjau, dan yang sedang di-crosscheck.
   *
   * Keduanya dulu hanya ada di layar /konsol, yang tidak pernah punya butir
   * menu dan kini dibuang. Tanpa dipindahkan ke sini, klaim yang jatuh ke
   * pemeriksaan tanda tangan manual maupun yang sedang crosscheck tidak punya
   * satu pun layar tempat menindaklanjutinya — ia berhenti di sana selamanya,
   * terbaca statusnya tetapi tak tersentuh.
   */
  /**
   * Satu klaim yang diminta lewat ?klaim=<id>, bila ada.
   *
   * Sirkulasi Dokumen menunjuk kemari dari barisnya: tindakan atas sebuah
   * dokumen ada di layar ini, dan yang datang dari sana datang untuk satu
   * dokumen tertentu — bukan untuk seluruh daftar, tempat barisnya harus
   * dicari lagi.
   *
   * Dibaca dari location, bukan dari useSearchParams: yang terakhir menuntut
   * seluruh layar dibungkus <Suspense>, dan satu parameter opsional tidak
   * sepadan dengan itu.
   */
  const [fokus, setFokus] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("klaim");
    if (q) setFokus(q);
  }, []);
  const [ttdUntuk, setTtdUntuk] = useState<string | null>(null);
  const [ttdAlasan, setTtdAlasan] = useState("");
  /**
   * Goresan dan spesimen klaim yang sedang ditinjau.
   *
   * Kotaknya dulu hanya bertanya "setuju atau tolak" tanpa memperlihatkan apa
   * pun — yang ditinjau adalah tanda tangan, dan yang meninjau tidak pernah
   * melihatnya. Gambarnya berat, jadi diambil hanya ketika kotaknya dibuka,
   * bukan ikut dalam daftar klaim yang dimuat tiap kali layar ini dibuka.
   */
  const [ttdBukti, setTtdBukti] = useState<any>(null);
  /**
   * Gambar yang sedang diperbesar.
   *
   * Goresan di dalam kotak tinjauan tingginya 64 piksel — cukup untuk tahu ada
   * tanda tangannya, tidak cukup untuk memutuskan ia goresan orang yang sama.
   * Yang diminta di sana justru keputusan itu.
   */
  const [ttdZoom, setTtdZoom] = useState<string | null>(null);
  useEffect(() => {
    if (!ttdUntuk) { setTtdBukti(null); return; }
    let batal = false;
    void (async () => {
      try {
        const res = await fetch(`/api/claims/${ttdUntuk}/signature-attempts`);
        if (!res.ok) return;
        const b = await res.json();
        if (!batal) setTtdBukti(b);
      } catch { /* kotaknya tetap dapat dipakai tanpa gambarnya */ }
    })();
    return () => { batal = true; };
  }, [ttdUntuk]);
  const [ccUntuk, setCcUntuk] = useState<string | null>(null);
  /** Klaim yang sedang dihapus karena salah input. */
  const [hapUntuk, setHapUntuk] = useState<string | null>(null);
  const [hapAlasan, setHapAlasan] = useState("");
  const [byrUntuk, setByrUntuk] = useState<string | null>(null);
  const [byrTgl, setByrTgl] = useState("");
  const [byrBukti, setByrBukti] = useState<File | null>(null);
  /**
   * Keterangan bebas yang menyertai pembayaran.
   *
   * Dikirim sebagai backdate_reason, dan namanya di server tetap begitu:
   * settle() mewajibkannya hanya ketika tanggal transfernya mundur melampaui
   * toleransi, dan menolak dengan sebutan yang menyebut angka harinya sendiri.
   * Labelnya di layar sengaja tidak menyebut syarat itu — yang mengisi kotak
   * ini paling sering tidak sedang memundurkan tanggal, dan pesan penolakannya
   * sudah cukup jelas bagi yang memang sedang melakukannya.
   */
  const [byrAlasan, setByrAlasan] = useState("");
  /**
   * Klaim yang tautannya sedang diperlihatkan.
   *
   * Tautan, tombol WhatsApp, dan kodenya dulu digambar di dalam sel Status.
   * Sel itu lalu setinggi lima baris dan selebar alamat tautannya, dan satu
   * baris yang membengkak melebarkan seluruh tabel — sembilan kolom lain ikut
   * menanggung ruang yang hanya dibutuhkan satu sel.
   */
  const [lihatTautan, setLihatTautan] = useState<string | null>(null);
  /**
   * Kotak tabel setinggi sisa layar, diukur bukan ditebak.
   *
   * Tabelnya digulir di dalam kotaknya sendiri — itu yang membuat menggulir ke
   * bawah tidak menggerakkan seluruh halaman, dan yang menaruh penggeser
   * mendatarnya di tepi bawah kotak alih-alih di ujung bawah tabel. Tetapi
   * batas tingginya tidak dapat ditulis sebagai angka tetap di CSS: yang ada
   * di atas kotak ini — judul panel, kotak cari, deretan lencana — berubah
   * tingginya mengikuti isinya dan lebar layarnya, dan satu angka yang
   * dipatok akan menyisakan ruang kosong pada satu keadaan atau mendorong
   * tepi bawah kotak keluar layar pada keadaan lain. Yang terdorong keluar
   * justru penggeser mendatarnya — persis yang hendak didekatkan.
   *
   * Jadi diukur dari letak kotaknya sendiri terhadap dokumen (bukan terhadap
   * layar): jarak itu tidak berubah saat halamannya digulir, sehingga
   * tingginya tidak pernah tumbuh-menyusut mengejar gulirannya sendiri.
   */
  const kotakTabel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const ukur = () => {
      const el = kotakTabel.current;
      if (!el) return;
      const atas = el.getBoundingClientRect().top + window.scrollY;
      const sisa = window.innerHeight - atas - 16;
      // Di bawah 320px kotaknya terlalu pendek untuk dibaca; pada layar
      // sependek itu lebih baik halamannya yang digulir.
      el.style.maxHeight = `${Math.max(320, Math.round(sisa))}px`;
    };
    ukur();
    window.addEventListener("resize", ukur);
    return () => window.removeEventListener("resize", ukur);
  });

  const muat = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/claims");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setKlaim(Array.isArray(b) ? b : []);
      setGalat(null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  /**
   * Kabar dari jendela pratinjau.
   *
   * Jendela itu menutup diri begitu kirimannya berhasil, dan kabarnya ikut
   * tertutup bersamanya. Layar ini yang menampungnya: daftarnya dimuat ulang
   * supaya kolom Status menunjukkan keadaan barunya, dan pemberitahuannya
   * muncul di sini.
   *
   * Asal pesannya diperiksa. Tanpa itu, halaman mana pun yang sempat membuka
   * layar ini dapat mengirim pesan serupa dan memunculkan pemberitahuan palsu.
   */
  useEffect(() => {
    const dengar = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const pesan = e.data as { dari?: string; terkirimKePajak?: number } | null;
      if (!pesan || pesan.dari !== "pratinjau-klaim") return;
      const n = Number(pesan.terkirimKePajak);
      if (!Number.isFinite(n) || n <= 0) return;
      setTerkirim(n);
      void muat();
    };
    window.addEventListener("message", dengar);
    return () => window.removeEventListener("message", dengar);
  }, [muat]);

  /**
   * Terbitkan tautan tanda tangan, lalu siapkan pesan WhatsApp-nya.
   *
   * Yang dibuka bukan WhatsApp-nya langsung: tautannya ditampilkan lebih dulu
   * supaya Admin Sales melihat ke nomor mana ia akan terkirim. Kodenya sengaja
   * tidak ikut ke dalam pesan — kode dan tautan pada satu pesan yang sama
   * membuat siapa pun yang meneruskan pesan itu ikut membawa keduanya.
   */
  const kirimTautan = async (c: any) => {
    setMengirim(c.id); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/claims/${c.id}/signature-requests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: "{}" });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(`${k.waGagal} — ${b.detail ?? b.title ?? res.status}`);
        return;
      }
      setTautan((lama) => ({ ...lama, [c.id]: b }));
      setLihatTautan(c.id);
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setMengirim(null); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  /** Berkas menjadi data URL, bentuk yang diterima jalur lampiran. */
  const keDataUrl = (f: File) => new Promise<string>((selesai, gagal) => {
    const r = new FileReader();
    r.onload = () => selesai(String(r.result));
    r.onerror = () => gagal(new Error("Berkas tidak terbaca."));
    r.readAsDataURL(f);
  });

  /** Kelima catatan alur kerja dokumen yang diisi tangan. */
  /**
   * Keempat catatan perpindahan berkas bertempat empat.
   *
   * Satu berkas berpindah beberapa kali sebelum selesai, dan Tabel Sirkulasi
   * Dokumen di kantor menyediakan empat baris untuk itu. Keempat kolomnya
   * sejajar baris demi baris: satu baris adalah satu perpindahan utuh — dari
   * divisi mana, ke divisi mana, kapan dikirim, kapan diterima.
   *
   * Yang pertama tetap tanpa akhiran — kolomnya sudah terisi, dan menamainya
   * ulang berarti memindahkan data yang sudah ada tanpa sebab.
   *
   * Nomor memo tidak ikut: ia menyertai berkasnya, bukan satu perpindahannya.
   */
  const URUT_ALUR = [1, 2, 3, 4];
  type DasarAlur = "sender_division" | "handed_to"
                 | "distributed_at" | "received_at";
  const bernomor = (dasar: DasarAlur, n: number) =>
    (n === 1 ? dasar : `${dasar}_${n}`) as MedanAlur;

  type MedanAlur = "office_memo_no"
                 | "sender_division" | "sender_division_2"
                 | "sender_division_3" | "sender_division_4"
                 | "handed_to" | "handed_to_2" | "handed_to_3" | "handed_to_4"
                 | "distributed_at" | "distributed_at_2" | "distributed_at_3"
                 | "distributed_at_4"
                 | "received_at" | "received_at_2" | "received_at_3"
                 | "received_at_4";
  const TANGGAL_ALUR: MedanAlur[] = URUT_ALUR.flatMap((n) =>
    [bernomor("distributed_at", n), bernomor("received_at", n)]);
  const DASAR_ALUR: DasarAlur[] =
    ["sender_division", "handed_to", "distributed_at", "received_at"];

  /** Kotak terakhir yang terisi pada satu kolom; 0 bila kolomnya kosong. */
  const terisiAlur = (c: any, dasar: DasarAlur) => {
    let n = 0;
    for (const i of URUT_ALUR) if (c[bernomor(dasar, i)]) n = i;
    return n;
  };

  /**
   * Berapa kotak yang tampak pada satu kolom, pada satu baris tabel.
   *
   * Dihitung per kolom, sebagaimana diminta: menekan "+ tambah" pada Divisi
   * Pengirim menambah kotak di situ saja.
   *
   * Akibatnya perlu diketahui: kotak keempat kolom tidak lagi dijamin
   * sebaris. Kolom yang dibuka tiga kali berdampingan dengan kolom yang
   * dibuka sekali akan menaruh kotak kedua sebuah kolom sejajar dengan kotak
   * pertama tetangganya, sehingga "dari mana, ke mana, kapan" pada satu garis
   * mendatar belum tentu satu perpindahan yang sama. Yang mengisi keempatnya
   * berurutan tidak akan merasakannya; yang mengisi satu kolom saja lebih
   * dulu, lalu menyusul kolom lain kemudian, perlu menghitung sendiri.
   *
   * Sekurangnya satu kotak, supaya kolom yang masih kosong tetap punya tempat
   * mengetik tanpa harus menekan apa pun lebih dulu.
   */
  const barisTampak = (c: any, dasar: DasarAlur) =>
    Math.min(URUT_ALUR.length,
             Math.max(terisiAlur(c, dasar) || 1,
                      barisAlur[`${c.id}:${dasar}`] ?? 0));

  /**
   * Simpan satu isian alur kerja pada satu baris.
   *
   * Dikirim saat isiannya ditinggalkan, bukan pada tiap ketukan: satu
   * permintaan per huruf membuat urutan tibanya menentukan isi akhirnya.
   * Yang tidak berubah tidak dikirim sama sekali.
   *
   * Hanya medan yang disebut yang ikut dikirim, dan endpoint-nya hanya
   * menyentuh medan yang disebut — mengubah divisi pengirim karena itu tidak
   * menghapus tanggal yang sudah benar di sebelahnya.
   *
   * Hanya baris ini yang disegarkan, bukan seluruh tabel: memuat ulang
   * semuanya akan memindahkan baris lain di bawah jari yang sedang mengetik.
   */
  const simpanAlur = async (c: any, medan: MedanAlur, nilai: string,
                            grup?: any[]) => {
    if (nilai.trim() === String(c[medan] ?? "").trim()) return;
    const kunci = `${c.id}:${medan}`;
    // Bentuk tanggalnya diperiksa di sini juga, bukan hanya di server.
    // Endpoint-nya memang menolak yang bukan YYYY-MM-DD dengan 422, tetapi
    // penolakan yang datang sesudah satu perjalanan ke server terasa seperti
    // gangguan jaringan, bukan seperti isian yang salah.
    if (TANGGAL_ALUR.includes(medan) && nilai.trim()
        && !/^\d{4}-\d{2}-\d{2}$/.test(nilai.trim())) {
      setTglGagal(kunci); setTegur(k.tglTakLengkap);
      return;
    }
    setIomSimpan(c.id); setGalat(null);
    try {
      const res = await fetch(`/api/claims/${c.id}/sirkulasi`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ [medan]: nilai }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(j.detail ?? `HTTP ${res.status}`);
        if (TANGGAL_ALUR.includes(medan)) setTglGagal(kunci);
        await muat();
        return;
      }
      setTglGagal((s) => (s === kunci ? null : s));
      setTegur((s) => (tglGagal === kunci ? null : s));
      setKlaim((lama) => lama.map((x) => x.id === c.id
        ? { ...x, [medan]: j[medan] } : x));

      // Satu pengajuan beberapa unit berdiri sebagai satu baris, jadi isian
      // tangannya milik barisnya — bukan milik klaim yang kebetulan paling
      // atas. Nomor IOM dan catatan peredaran ditulis ke seluruh klaim dalam
      // pengajuan itu; kalau tidak, membuka saringan lain akan memperlihatkan
      // dua unit sepengajuan dengan nomor IOM yang berbeda.
      const lainnya = (grup ?? []).filter((x) => x.id !== c.id);
      for (const x of lainnya) {
        const r2 = await fetch(`/api/claims/${x.id}/sirkulasi`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ [medan]: nilai }),
        });
        if (!r2.ok) continue;
        const j2 = await r2.json().catch(() => ({}));
        setKlaim((lama) => lama.map((y) => y.id === x.id
          ? { ...y, [medan]: j2[medan] } : y));
      }
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setIomSimpan(null); }
  };

  /**
   * Hapus satu kotak perpindahan, dan naikkan yang di bawahnya.
   *
   * Sebuah kolom peredaran adalah daftar berurutan, bukan empat kotak lepas:
   * menghapus perpindahan kedua dari empat harus menyisakan tiga yang
   * berurutan, bukan tiga dengan lubang di tengahnya. Lubang itu akan terbaca
   * sebagai perpindahan yang belum dicatat, padahal justru baru dihapus.
   *
   * Yang berisi ditanya lebih dulu. Yang kosong ditutup tanpa bertanya dan
   * tanpa menyentuh server — tidak ada yang hilang, dan pertanyaan yang
   * jawabannya selalu "ya" mengajari orang menekan "ya" tanpa membaca.
   */
  const hapusKotak = async (c: any, dasar: DasarAlur, n: number,
                            grup?: any[]) => {
    const lama = URUT_ALUR.map((i) => String(c[bernomor(dasar, i)] ?? ""));
    const dibuang = lama[n - 1];
    // Ditanyakan dalam bentuk yang tertulis di kolomnya. Pertanyaan yang
    // menyebut "2026-09-24" sementara kolomnya menulis "24/09/2026" memaksa
    // yang membacanya mencocokkan sendiri dua bentuk tanggal, tepat pada saat
    // ia diminta memutuskan sesuatu yang tidak dapat dibatalkan.
    const tanggal = TANGGAL_ALUR.includes(bernomor(dasar, 1));
    if (dibuang && !confirm(
          k.hapusKotakTanya(tanggal ? tglPendek(dibuang) : dibuang))) return;

    const baru = lama.filter((_, i) => i !== n - 1);
    while (baru.length < lama.length) baru.push("");

    const ubah: Record<string, string> = {};
    URUT_ALUR.forEach((i) => {
      if (baru[i - 1] !== lama[i - 1]) ubah[bernomor(dasar, i)] = baru[i - 1];
    });

    // Menutup kotak kosong paling bawah tidak mengubah apa pun di basis data;
    // yang berubah hanya berapa kotak yang digambar.
    const kunci = `${c.id}:${dasar}`;
    if (!Object.keys(ubah).length) {
      setBarisAlur((s) => ({ ...s, [kunci]: Math.max(1, barisTampak(c, dasar) - 1) }));
      return;
    }

    setIomSimpan(c.id); setGalat(null);
    try {
      const res = await fetch(`/api/claims/${c.id}/sirkulasi`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(ubah),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(j.detail ?? `HTTP ${res.status}`); await muat(); return; }
      setKlaim((l) => l.map((x) => {
        if (x.id !== c.id) return x;
        const disalin: Record<string, any> = { ...x };
        for (const m of Object.keys(ubah)) disalin[m] = j[m] ?? null;
        return disalin;
      }));
      // Kotak yang dibuka tangan ikut menyusut, kalau tidak ia akan
      // menyisakan satu kotak kosong tepat di tempat yang baru dihapus.
      setBarisAlur((s) => kunci in s
        ? { ...s, [kunci]: Math.max(1, s[kunci] - 1) } : s);

      // Sama alasannya dengan simpanAlur: catatan peredaran milik barisnya.
      for (const x of (grup ?? []).filter((y) => y.id !== c.id)) {
        const r2 = await fetch(`/api/claims/${x.id}/sirkulasi`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(ubah),
        });
        if (!r2.ok) continue;
        const j2 = await r2.json().catch(() => ({}));
        setKlaim((l) => l.map((y) => {
          if (y.id !== x.id) return y;
          const disalin: Record<string, any> = { ...y };
          for (const m of Object.keys(ubah)) disalin[m] = j2[m] ?? null;
          return disalin;
        }));
      }
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setIomSimpan(null); }
  };

  /**
   * Satu sel isian alur kerja.
   *
   * Yang tidak berhak mengisi tetap membacanya — isinya memang untuk dibaca,
   * dan kotak isian yang mengundang lalu ditolak server lebih buruk daripada
   * tulisan biasa.
   *
   * Sel tanggal hanya menjadi <input type="date"> selama dibuka. Selebihnya ia
   * tulisan biasa berbentuk dd/mm/yyyy, sama seperti Tanggal Pengajuan dan
   * Tanggal Pembayaran di baris yang sama. Sebabnya: kotak tanggal bawaan
   * peramban menulis tanggalnya menurut bahasa peramban, bukan bahasa halaman \u2014
   * pada peramban berbahasa Inggris ia tampil 09/21/2026 sementara dua kolom di
   * sebelahnya menulis 28/09/2026. Hari dan bulan bertukar tempat dalam satu
   * baris tanpa penanda apa pun, dan yang membacanya tidak punya cara
   * mengetahui yang mana. Yang tersimpan tidak berubah: tetap "yyyy-mm-dd".
   */
  const isiAlur = (c: any, medan: MedanAlur, petunjuk?: string,
                   grup?: any[]) => {
    const tanggal = TANGGAL_ALUR.includes(medan);
    if (!bolehIom) {
      if (!c[medan]) return "\u2014";
      return tanggal ? tglPendek(c[medan]) : c[medan];
    }

    const kunci = `${c.id}:${medan}`;
    if (tanggal && tglBuka !== kunci) {
      return (
        <button type="button" className="isi-sirkulasi tgl-baca"
                disabled={iomSimpan === c.id}
                onClick={() => setTglBuka(kunci)}>
          {c[medan] ? tglPendek(c[medan])
                    : <span className="tgl-kosong">{k.isiData}</span>}
        </button>
      );
    }

    return (
      <input className={"isi-sirkulasi"
                        + (tglGagal === kunci ? " isi-salah" : "")}
             type={tanggal ? "date" : "text"}
             /* Kuncinya memuat nilainya sendiri supaya kotak ini lahir ulang
                ketika nilainya berubah dari luar — dan itu terjadi tiap kali
                satu kotak dihapus dan isi di bawahnya naik. Tanpa ini,
                defaultValue hanya dibaca sekali saat kotaknya pertama
                digambar: React memakai ulang simpul DOM yang sama, layar
                masih menampilkan isi yang sudah terhapus, dan yang menghapus
                baru tahu sesudah memuat ulang halaman. */
             key={`${medan}:${c[medan] ?? ""}`}
             defaultValue={c[medan] ?? ""}
             placeholder={tanggal ? undefined : petunjuk}
             disabled={iomSimpan === c.id}
             /* Kotaknya baru ada sesudah kliknya, jadi fokus dan pemilih
                tanggalnya dibuka di sini. showPicker() menolak bila aktivasi
                penggunanya sudah habis; itu bukan kegagalan yang perlu
                dilaporkan \u2014 mengetik tanggalnya tetap bisa. */
             /* Ditandai pada simpulnya sendiri, bukan dibandingkan dengan
                activeElement: React memanggil ref ini lagi pada tiap render,
                dan kotak yang isiannya ditolak akan merebut fokus kembali
                setiap kali orang mencoba berpindah — terkurung di satu kotak
                sampai isinya benar. Menahan simpanannya sudah cukup; memaksa
                fokusnya tidak. Tanda ini hilang sendiri saat kotaknya lahir
                ulang, yaitu ketika nilainya berubah. */
             ref={tanggal ? (el) => {
               if (!el || el.dataset.sudahFokus) return;
               el.dataset.sudahFokus = "1";
               el.focus();
               try { el.showPicker(); } catch { /* ketik saja */ }
             } : undefined}
             onBlur={(e) => {
               /* Tanggal yang diketik separuh — hari dan bulan terisi, tahun
                  belum — membuat peramban menjawab value:"" dengan
                  badInput:true. Disimpan apa adanya, isian itu menghapus
                  tanggal yang sudah benar dan tidak ada yang memberi tahu:
                  yang mengetiknya melihat kotak kosong dan mengira ketikannya
                  belum masuk. Jadi ditahan di sini, kotaknya dibiarkan
                  terbuka, dan salahnya disebut. */
               if (tanggal && e.target.validity.badInput) {
                 setTglGagal(kunci); setTegur(k.tglTakLengkap);
                 return;
               }
               if (tanggal) { setTglBuka(null); setTglGagal(null); setTegur(null); }
               void simpanAlur(c, medan, e.target.value, grup);
             }}
             onKeyDown={(e) => {
               if (e.key === "Enter") e.currentTarget.blur();
               /* Batal tanpa menyimpan: nilai semula dipulihkan lebih dulu,
                  sebab blur yang menyusul tetap membaca isi kotaknya. */
               if (e.key === "Escape" && tanggal) {
                 e.currentTarget.value = c[medan] ?? "";
                 e.currentTarget.blur();
               }
             }} />
    );
  };

  /**
   * Sel yang memuat kotak-kotak perpindahan pada satu kolom.
   *
   * Yang tampak hanya sebanyak yang terpakai pada kolom ini, ditambah yang
   * dibuka tangan lewat "+ tambah" dan dikurangi lagi lewat "−". Empat kotak
   * yang selalu digambar membuat pengajuan yang belum pernah berpindah
   * setinggi pengajuan yang sudah berpindah empat kali.
   *
   * Bagi yang hanya membaca, tidak ada kotak kosong sama sekali, dan tidak ada
   * tombolnya: ia tidak dapat mengisi, jadi tempat kosong hanya menyita ruang.
   */
  const isiEmpat = (c: any, dasar: DasarAlur, petunjuk?: string,
                    grup?: any[]) => {
    // Bentuknya dibaca dari TANGGAL_ALUR, bukan dari nama dasarnya: satu
    // perbandingan nama yang ditulis tangan akan diam-diam meleset begitu
    // kolom tanggal ketiga menyusul, dan tanggalnya tercetak sebagai teks ISO.
    const tanggal = TANGGAL_ALUR.includes(bernomor(dasar, 1));
    if (!bolehIom) {
      const ada = URUT_ALUR.map((n) => c[bernomor(dasar, n)]).filter(Boolean);
      if (!ada.length) return "—";
      return (
        <div className="alur-empat">
          {ada.map((v, i) => (
            <div key={i} className="alur-baris">
              {tanggal ? tglPendek(v) : v}
            </div>
          ))}
        </div>
      );
    }
    const tampak = barisTampak(c, dasar);
    return (
      <div className="alur-empat">
        {URUT_ALUR.slice(0, tampak).map((n) => (
          <div key={n} className="alur-baris">
            {isiAlur(c, bernomor(dasar, n), petunjuk, grup)}
            {/* Satu tombol hapus pada tiap kotak, sama di keempat kolom dan
                tanpa perkecualian — kotak yang berisi maupun yang kosong.
                Sebelumnya hanya kotak kosong berlebih yang dapat ditutup, dan
                tombol yang ada pada sebagian kotak saja membuat orang mencari
                tombol yang tidak pernah muncul di tempat yang ia butuhkan. */}
            <button type="button" className="alur-hapus"
                    title={k.hapusKotak} aria-label={k.hapusKotak}
                    disabled={iomSimpan === c.id
                              || (tampak === 1 && !c[bernomor(dasar, n)])}
                    onClick={() => void hapusKotak(c, dasar, n, grup)}>
              ×
            </button>
          </div>
        ))}
        {tampak < URUT_ALUR.length && (
          <div className="alur-tombol">
            <button type="button" className="alur-tambah"
                    onClick={() => setBarisAlur((s) =>
                      ({ ...s, [`${c.id}:${dasar}`]: tampak + 1 }))}>
              + {k.tambahBaris}
            </button>
          </div>
        )}
      </div>
    );
  };

  /**
   * Satu permintaan, seluruh klaim dalam pengajuan yang sama.
   *
   * Overiding atas tiga unit berdiri sebagai satu baris keputusan di layar
   * ini, jadi tombol pada baris itu harus menggerakkan ketiganya. Berurutan,
   * bukan serentak: tiap langkah menulis jejak audit dan membaca keadaan
   * terakhir klaimnya, dan permintaan yang berlomba membuat dua di antaranya
   * membaca keadaan yang sama sebelum salah satunya sempat menulis.
   *
   * Yang dikembalikan jawaban yang GAGAL bila ada — itulah yang perlu dibaca
   * orang — dan jawaban pertama bila seluruhnya berhasil.
   */
  const kirimSepengajuan = async (c: any, jalur: string, init: RequestInit) => {
    const daftar = c.batch_id
      ? klaim.filter((x) => x.batch_id === c.batch_id) : [c];
    let pertama: Response | null = null;
    let gagal: Response | null = null;
    for (const x of daftar) {
      const r = await fetch(`/api/claims/${x.id}${jalur}`, init);
      pertama ??= r;
      if (!r.ok && !gagal) gagal = r;
    }
    return (gagal ?? pertama)!;
  };

  const pindahTahap = async (c: any, n: number) => {
    setGerak(c.id); setGalat(null); setKabar(null);
    try {
      const res = await kirimSepengajuan(c, "/tahap", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tahap: n }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.tahapPindah(TAHAP.find((t) => t.n === n)?.nama ?? ""));
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setGerak(null); }
  };

  /**
   * Unggah dokumen full sign.
   *
   * Berkasnya dulu selalu dikirim utuh sebagai data URL di dalam satu badan
   * permintaan. Base64 membengkakkan berkas sepertiga, sehingga pindaian 10 MB
   * menjadi 13 MB di kawat — jauh di atas batas 4,5 MB yang berlaku bagi satu
   * permintaan, dan diputus di tepi jaringan sebelum mencapai kode server.
   * Yang sampai ke layar hanya "HTTP 413": kode telanjang tanpa keterangan,
   * yang tampak seperti datanya tidak terbaca padahal berkasnya tidak pernah
   * tiba.
   *
   * Kini berkas di atas satu megabita dititipkan sepotong demi sepotong lebih
   * dulu, lalu yang dikirim ke sini tinggal pengenal titipannya. Berkas kecil
   * tetap menempuh jalan lama — satu permintaan, tanpa perjalanan tambahan.
   */
  const unggahFullSign = async (c: any) => {
    if (!fsBerkas) return;
    // Ditolak di sini, sebelum satu bita pun terkirim. Mengunggah belasan
    // megabita hanya untuk diberi tahu bahwa ia terlalu besar adalah menit
    // yang terbuang percuma.
    const tolak = periksaUkuran(fsBerkas, BATAS_FULL_SIGN);
    if (tolak) { setGalat(tolak); return; }

    setGerak(c.id); setGalat(null); setKabar(null); setFsKemajuan(null);
    try {
      const titipan = perluDipecah(fsBerkas)
        ? await titipBerkas(fsBerkas, ({ terkirim, dari }) =>
            setFsKemajuan(Math.round((terkirim / dari) * 100)))
        : null;

      const res = await kirimSepengajuan(c, "/full-sign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          file_name: fsBerkas.name, content_type: fsBerkas.type,
          ...(titipan ? { unggah_id: titipan }
                      : { content_base64: await keDataUrl(fsBerkas) }),
        }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      // Jawaban 413 yang lolos ke sini datang dari tepi jaringan, bukan dari
      // kode server, dan berupa halaman HTML tanpa medan detail. "HTTP 413"
      // apa adanya tidak memberi tahu apa pun kepada yang membacanya.
      if (!res.ok) {
        setGalat(b.detail ?? (res.status === 413 ? k.fsTerlaluBesar
                                                 : `HTTP ${res.status}`));
        return;
      }
      setKabar(k.fsSelesai);
      setFsUntuk(null); setFsBerkas(null);
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setGerak(null); setFsKemajuan(null); }
  };

  /**
   * Kirim keputusan verifikasi pajak.
   *
   * Aturannya ditegakkan taxVerify() di server — alasan wajib, minimal
   * sepuluh karakter untuk koreksi, dan status harus memang sedang menunggu
   * verifikasi. Tidak diulang di sini; aturan yang ditulis dua kali akan
   * berbeda cepat atau lambat. Yang dikerjakan layar hanya mematikan tombol
   * yang sudah pasti ditolak, supaya orang tidak menekan tombol yang berakhir
   * galat.
   */
  const verifikasiPajak = async (c: any, keputusan: string) => {
    setGerak(c.id); setGalat(null); setKabar(null);
    try {
      const angka: Record<string, number> = {};
      const isi = (v: string) => Number(String(v).replace(/[^\d]/g, ""));
      if (keputusan === "approve_with_correction") {
        if (pjkBruto.trim()) angka.gross_amount = isi(pjkBruto);
        if (pjkPpn.trim()) angka.vat = isi(pjkPpn);
        if (pjkPph.trim()) angka.withholding_tax = isi(pjkPph);
      }
      const res = await kirimSepengajuan(c, "/tax-verification", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: keputusan,
          corrected_amounts: keputusan === "approve_with_correction"
            ? angka : undefined,
          reason: pjkAlasan.trim() || undefined,
        }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.detail ?? b.title ?? `HTTP ${res.status}`);
      setKabar(keputusan === "approve" ? k.pjkSelesaiSetuju
             : keputusan === "return" ? k.pjkSelesaiKembali
             : k.pjkSelesaiKoreksi);
      setPjkUntuk(null);
      setPjkBruto(""); setPjkPpn(""); setPjkPph(""); setPjkAlasan("");
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setGerak(null); }
  };

  /**
   * Tinjauan tanda tangan manual.
   *
   * Aturannya ditegakkan signatureReview() di server — alasan wajib, dan
   * hanya klaim yang memang berhenti pada pemeriksaan manual yang menerima
   * keputusan ini. Layar hanya memastikan tombolnya tidak muncul di tempat
   * yang pasti ditolak.
   */
  const tinjauTtd = async (c: any, keputusan: string) => {
    setGerak(c.id); setGalat(null); setKabar(null);
    try {
      const res = await kirimSepengajuan(c, "/signature-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: keputusan,
                               reason: ttdAlasan.trim() || undefined }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.detail ?? b.title ?? `HTTP ${res.status}`);
      setKabar(keputusan === "reject" ? k.ttdSelesaiTolak : k.ttdSelesai);
      setTtdUntuk(null); setTtdAlasan("");
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setGerak(null); }
  };

  /**
   * Menyelesaikan crosscheck satu pihak.
   *
   * Pihak keduanya selesai, server sendiri yang memajukan klaim ke "siap
   * cetak" — layar ini tidak memutuskannya, hanya membaca kabarnya.
   */
  const selesaikanCrosscheck = async (c: any, pihak: string) => {
    setGerak(c.id); setGalat(null); setKabar(null);
    try {
      const res = await kirimSepengajuan(c, "/crosscheck", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party: pihak, decision: "complete" }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.detail ?? b.title ?? `HTTP ${res.status}`);
      const beres = b.status && b.status !== "crosscheck_in_progress";
      setKabar(beres ? k.ccBeresSemua
                     : k.ccBeres(pihak === "finance" ? k.ccFinance : k.ccAdmin));
      if (beres) setCcUntuk(null);
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setGerak(null); }
  };

  /**
   * Menghapus pengajuan yang salah input.
   *
   * Aturannya ditegakkan hapusKlaim() di server — alasan wajib, dan pengajuan
   * yang uangnya sudah keluar ditolak. Yang dikerjakan layar hanya
   * menyembunyikan tombolnya pada baris yang sudah pasti ditolak, supaya
   * tidak ada yang menekan tombol yang berakhir galat.
   */
  const hapusKlaim = async (c: any) => {
    setGerak(c.id); setGalat(null); setKabar(null);
    try {
      const res = await kirimSepengajuan(c, "", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: hapAlasan.trim() }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.detail ?? b.title ?? `HTTP ${res.status}`);
      setKabar(k.hapSelesai(c.claim_number));
      setHapUntuk(null); setHapAlasan("");
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setGerak(null); }
  };

  const catatPembayaran = async (c: any) => {
    setGerak(c.id); setGalat(null); setKabar(null);
    try {
      const res = await kirimSepengajuan(c, "/pembayaran", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transfer_date: byrTgl,
          backdate_reason: byrAlasan || null,
          file_name: byrBukti?.name,
          content_type: byrBukti?.type,
          content_base64: byrBukti ? await keDataUrl(byrBukti) : null,
        }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.byrSelesai);
      setByrUntuk(null); setByrTgl(""); setByrBukti(null);
      setByrAlasan("");
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setGerak(null); }
  };

  /** Lampiran dokumen full sign sebuah klaim, bila sudah ada. */
  const dokFullSign = (c: any) =>
    (c.documents ?? []).find((d: any) => d.checklist_item === "dokumen_full_sign");

  /**
   * Klaim yang perjalanannya sudah tuntas: dokumen finalnya terkirim dan
   * pembayarannya tercatat.
   *
   * Pada baris seperti ini kolom Tindakan menyisakan satu tombol saja,
   * Preview Dokumen. Tombol "Lihat dokumen full sign" di sebelahnya menjadi
   * mubazir begitu klaimnya tuntas: layar pratinjau sudah memuat dokumen itu
   * beserta bukti transfer dan tanggal pembayarannya dalam satu blok, lengkap
   * dengan tautan lihat dan unduhnya masing-masing. Dua jalan ke berkas yang
   * sama membuat yang membacanya menduga keduanya berisi hal yang berbeda.
   *
   * Yang belum tuntas tidak kehilangan apa pun — tombolnya tetap di tempatnya
   * selama masih ada yang harus dikerjakan atas baris itu.
   */
  const tuntas = (c: any) => Boolean(c.tanggal_bayar) && Boolean(dokFullSign(c));

  const terlihat = klaim
    .filter((c) => {
      if (fokus) return c.id === fokus;
      if (saring === "selesai") return SELESAI.includes(c.status);
      if (saring === "jalan") return !SELESAI.includes(c.status);
      return true;
    })
    // Urutan bawaan dari server menurut tanggal pengajuan, dan itulah yang
    // dipakai seluruh tampilan lain, keadaan awal termasuk. Hanya "Unit" yang
    // menggantinya dengan urutan kode unit, supaya pengajuan atas unit yang
    // sama berdampingan — tanpa itu, pilihan ini tidak berbeda sama sekali
    // dari menampilkan seluruhnya.
    .sort((a, b) => saring !== "unit" ? 0
      : String(a.unit?.code ?? "").localeCompare(String(b.unit?.code ?? ""),
                                                 "id", { numeric: true }));

  /**
   * Baris dikelompokkan menurut pengajuannya, bukan menurut klaimnya.
   *
   * Overiding diajukan atas beberapa unit sekaligus — satu penerima, satu
   * periode, satu keputusan — tetapi tiap unit tetap klaim tersendiri, sebab
   * nilai, PPN dan PPh-nya dihitung per unit. Di layar ini ketiganya berdiri
   * sebagai SATU baris: kolom Unit memuat ketiga unitnya sebagai poin, kolom
   * uangnya menjumlahkan ketiganya, dan tombol apa pun pada baris itu berlaku
   * bagi ketiganya.
   *
   * Yang tidak punya penanda berdiri sendiri, sebagaimana sebelumnya.
   */
  const kelompok: any[][] = [];
  {
    const peta = new Map<string, any[]>();
    for (const c of terlihat) {
      const kunci = c.batch_id ? `b:${c.batch_id}` : `c:${c.id}`;
      let g = peta.get(kunci);
      if (!g) { g = []; peta.set(kunci, g); kelompok.push(g); }
      g.push(c);
    }
  }

  /**
   * Keempat angka pada kepala panel; susunannya ada pada kotakKeadaan.
   *
   * Dihitung dari SELURUH klaim project ini, bukan dari yang sedang tampil:
   * angka yang ikut berubah mengikuti saringan akan berbunyi "0" pada tiga
   * kotak begitu saringannya dipasang ke salah satu tampilan, padahal
   * pengajuannya tetap ada — hanya sedang tidak ditampilkan.
   */
  /**
   * Peran yang boleh menggerakkan tahap peredaran, dan yang boleh mencatat
   * pembayaran. Keduanya TIDAK sama, dan disamakan sekali di sini lalu
   * dipakai bersama, Admin Sales akan melihat tombol pembayaran yang pasti
   * ditolak endpoint-nya — tombol yang memberi harapan lalu galat.
   *
   * Daftarnya persis daftar yang diterima masing-masing endpoint.
   */
  const bolehTahap = ["admin_sales", "admin_system", "finance_manager",
                      "head_finance"].includes(sesi.role);
  /**
   * Yang boleh mengisi nomor IOM: sama dengan yang endpoint-nya terima.
   * Peran lain tetap membacanya — menyembunyikan isiannya hanya kerapian,
   * sedangkan yang menahannya sungguhan adalah requireRole di server.
   */
  const bolehIom = ["admin_sales", "admin_system"].includes(sesi.role);

  const bolehBayar = ["admin_sales", "finance_payment", "finance_manager",
                      "head_finance", "admin_system"].includes(sesi.role);
  // Persis daftar yang diterima /api/claims/[id]/tax-verification.
  const bolehPajak = ["finance_tax", "finance_manager"].includes(sesi.role);
  // Persis daftar yang diterima /api/claims/[id]/signature-review.
  const bolehTtd = sesi.role === "admin_sales";
  // Crosscheck: endpoint-nya hanya menuntut sesi yang sah, sebab pembagian
  // pihaknya urusan kantor dan bukan urusan pagar. Yang dipisah di sini hanya
  // siapa yang pantas menekan yang mana.
  const bolehCcAdmin = ["admin_sales", "admin_system"].includes(sesi.role);
  const bolehCcFinance = ["finance_manager", "finance_payment", "head_finance",
                          "admin_system"].includes(sesi.role);
  // Persis daftar yang diterima DELETE /api/claims/[id].
  const bolehHapus = ["admin_sales", "admin_system"].includes(sesi.role);
  /**
   * Pengajuan yang uangnya sudah keluar tidak dapat dihapus — endpoint-nya
   * menolaknya, dan tombol yang selalu berakhir galat lebih buruk daripada
   * tombol yang tidak ada.
   */
  const SUDAH_BAYAR = ["partially_paid", "paid", "completed"];
  /**
   * Yang uangnya sudah keluar hanya dapat dihapus Admin IT.
   *
   * Bukan soal kepercayaan: penghapusan seperti itu mengubah rekap pembayaran
   * periode yang mungkin sudah ditutup dan laporannya sudah dicetak. Ia jalan
   * darurat, dan jalan darurat tidak berdiri di tangan yang sehari-hari
   * memasukkan pengajuan.
   */
  const bolehHapusDibayar = sesi.role === "admin_system";

  // Satu lintasan, satu kotak per pengajuan: keempat angkanya berjumlah tepat
  // sebanyak klaim.length menurut susunan kotakKeadaan, bukan menurut empat
  // saringan terpisah yang dapat bertindih atau berlubang tanpa terlihat.
  const hitung = { draf: 0, butuh: 0, pantau: 0, arsip: 0 };
  for (const c of klaim) hitung[kotakKeadaan(c.status)] += 1;

  return (
    <Kerangka sesi={sesi} lebar judul={
      <div>
        <h1>{k.judul}</h1>
      </div>
    }>

      {galat && <div className="banner stop"><b>{k.galat}</b>{galat}</div>}
      {tegur && <div className="banner warn"><b>{k.tegurJudul}</b>{tegur}</div>}
      {kabar && <div className="banner ok">{kabar}</div>}
      {/* Jalan pulang dari ?klaim=: tanpa tombol ini, yang datang dari
          Sirkulasi Dokumen terkurung pada satu baris dan hanya dapat kembali
          ke daftar penuh dengan menyunting alamatnya. */}
      {fokus && (
        <div className="banner">
          {k.fokusSatu}{" "}
          <button className="tautan" onClick={() => {
            setFokus(null);
            history.replaceState(null, "", location.pathname);
          }}>{k.fokusSemua}</button>
        </div>
      )}

      <div className="panel sp">
        {/* "cari" hanya penanda gaya: sebutan "Search" di sini berdiri sendiri
            sebagai judul satu-satunya pemilih pada layar ini, bukan satu dari
            sederet label saringan seperti di layar lain, jadi ia dibaca lebih
            besar. Lihat .filters.cari. */}
        <div className="filters cari">
          <div>
            <div className="lbl">{k.tampilkan}</div>
            {/* Tiga pilihan, tanpa pengelompokan. Daftar status satu per satu
                beserta jumlahnya dulu berdiri di bawahnya; ia dibuang atas
                permintaan kantor — yang ditanyakan sehari-hari hanya mana yang
                masih berjalan dan mana yang sudah selesai.

                Butir kosong di puncak adalah keadaan awalnya: pemilihnya tampil
                kosong sampai ada yang dipilih. Ia tetap dapat dipilih kembali,
                sebab itulah satu-satunya jalan pulang ke tabel penuh. */}
            <select value={saring}
                    onChange={(e) => setSaring(e.target.value as Saring)}>
              <option value=""></option>
              <option value="unit">{k.sUnit}</option>
              <option value="jalan">{k.sJalan}</option>
              <option value="selesai">{k.sSelesai}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          {k.daftar}
          <span className="kepala-kotak">
            {/* Unduhan, bukan tombol: berkasnya dibangkitkan server dan
                langsung disimpan peramban, tanpa layar perantara. Sejajar
                dengan layar Dokumentasi Memo, yang sudah memakai bentuk ini. */}
            {terlihat.length > 0 && (
              <a className="tautan-klaim" href="/api/claims/rekap"
                 style={{ marginRight: 8 }}>
                {k.unduhRekap}
              </a>
            )}
            <span className="pill">{k.pDraf(hitung.draf)}</span>
            <span className="pill">{k.pButuh(hitung.butuh)}</span>
            <span className="pill">{k.pPantau(hitung.pantau)}</span>
            <span className="pill">{k.pArsip(hitung.arsip)}</span>
          </span>
        </h2>

        <div className="tscroll persetujuan" ref={kotakTabel}>
          <table className="tabel-penjualan"><tbody>
            <tr>
              <th className="sel-no">{k.thNo}</th>
              <th>{k.thTanggal}</th>
              <th className="sel-unit">{k.thUnit}</th>
              <th>{k.thPerihal}</th>
              <th>{k.thIom}</th>
              <th>{k.thKategori}</th>
              <th className="sel-penerima">{k.thPenerima}</th>
              <th>{k.thPengaju}</th>
              <th>{k.thBruto}</th>
              <th>{k.thPpn}</th>
              <th>{k.thPph}</th>
              <th>{k.thBersih}</th>
              <th>{k.thTglBayar}</th>
              <th>{k.thPengirim}</th>
              <th>{k.thPenerimaDiv}</th>
              <th>{k.thDistribusi}</th>
              <th>{k.thDiterima}</th>
              <th className="sel-keadaan">{k.thStatus}</th>
              <th style={{ width: 140 }}>{k.thDokumen}</th>
            </tr>

            {kelompok.map((g, i) => {
              // Klaim pertama mewakili keterangan yang memang sama bagi
              // seluruh kelompoknya: tanggal pengajuan, jenis, penerima,
              // pengaju, dan keadaannya.
              const c = g[0];
              const jml = (medan: string) =>
                g.reduce((t, x) => t + Number(x[medan] ?? 0), 0);
              /**
               * Satu pengajuan dapat membentang ke beberapa unit ATAU ke
               * beberapa jenis fee — tidak pernah keduanya sekaligus, sebab
               * penandanya memang dipisah di layar Pengajuan Fee.
               *
               * Overriding atas tiga unit: satu jenis, tiga unit. Closing Fee
               * bersama Cash Reward dan Komisi atas satu unit: satu unit, tiga
               * jenis. Yang berulang itulah yang ditulis sebagai poin; yang
               * tunggal tetap ditulis sekali, karena mengulang nama unit yang
               * sama tiga kali bukan keterangan, hanya kebisingan.
               */
              const unitUnik = [...new Set(
                g.map((x) => x.unit?.code).filter(Boolean))] as string[];
              /**
               * Nilai tiap jenis, bukan hanya namanya.
               *
               * Angkanya berdiri di kolom angkanya masing-masing — Jumlah
               * Komisi, PPN, PPh, dan yang dibayarkan — berbaris sejajar
               * dengan poin jenisnya. Menaruh angka di kolom Jenis Pengajuan
               * berarti satu kolom memuat dua hal, dan yang menjumlahkan ke
               * bawah harus memindahkan matanya ke kolom yang berbeda-beda.
               *
               * Urutannya mengikuti urutan jenis pada layar Pengajuan Fee,
               * bukan urutan jawaban server: baris yang sama harus tersusun
               * sama tiap kali dimuat, sebab keempat kolom angkanya dibaca
               * sebaris demi sebaris.
               */
              const URUT = JENIS.map((x) => x.slug) as string[];
              const perJenis: {
                jenis: any; gross: number; vat: number; pph: number; net: number;
              }[] = [];
              for (const x of g) {
                const ada = perJenis.find((y) => y.jenis === x.claim_type);
                const n = {
                  gross: Number(x.gross_amount ?? 0), vat: Number(x.vat ?? 0),
                  pph: Number(x.withholding_tax ?? 0),
                  net: Number(x.net_amount ?? 0),
                };
                if (ada) {
                  ada.gross += n.gross; ada.vat += n.vat;
                  ada.pph += n.pph; ada.net += n.net;
                } else perJenis.push({ jenis: x.claim_type, ...n });
              }
              perJenis.sort((a, b) =>
                URUT.indexOf(a.jenis) - URUT.indexOf(b.jenis));
              /** Kolom angka yang ikut berpoin, sejajar dengan jenisnya. */
              const kolomNilai = (ambil: (j: typeof perJenis[0]) => number,
                                  total: number, tebal = false) =>
                (perJenis.length > 1 ? (
                  <ul className="unit-grup nilai-grup">
                    {perJenis.map((j) => (
                      <li key={j.jenis}>{rp(ambil(j))}</li>
                    ))}
                  </ul>
                ) : tebal ? <b>{rp(total)}</b> : rp(total));
              return (
              <tr key={c.batch_id ? `b:${c.batch_id}` : c.id}>
                <td className="sel-no">{i + 1}</td>
                <td>{tglPendek(c.created_at)}</td>
                {/* Nomor unitnya — itulah yang dipakai orang untuk mengenali
                    pengajuan ini. Sebelumnya hanya ada di lembar rekap dan di
                    formulir pratinjau, sehingga dua pengajuan sejenis untuk
                    penerima yang sama tidak dapat dibedakan dari tabel. */}
                <td className="sel-unit">
                  {unitUnik.length > 1 ? (
                    <ul className="unit-grup">
                      {unitUnik.map((kode) => <li key={kode}>{kode}</li>)}
                    </ul>
                  ) : (unitUnik[0] ?? "—")}
                </td>
                {/* Beberapa jenis fee yang diajukan bersama atas satu unit
                    berdiri sebagai poin, masing-masing dengan nilainya —
                    jumlah seluruhnya tetap terbaca di kolom Jumlah Fee,
                    tetapi yang memeriksanya perlu tahu angka itu tersusun
                    dari apa saja. */}
                <td>
                  {perJenis.length > 1 ? (
                    <ul className="unit-grup">
                      {perJenis.map((j) => (
                        <li key={j.jenis}>{namaJenis(j.jenis, bahasa)}</li>
                      ))}
                    </ul>
                  ) : namaJenis(c.claim_type, bahasa)}
                </td>
                {/* Nomor Internal Office Memo. Terbit di luar sistem ini, jadi
                    diisi tangan di sini — dan hanya di sini, sejak layar
                    Sirkulasi Dokumen dibuang. Yang tidak berhak mengisinya
                    tetap membacanya: isinya memang untuk dibaca. */}
                <td>{isiAlur(c, "office_memo_no", k.isiData, g)}</td>
                <td>{kategori(c, k, bahasa) ?? "—"}</td>
                <td className="sel-penerima">{c.marketing?.full_name ?? "—"}</td>
                <td>{pengaju(c)}</td>
                <td className="n">{kolomNilai((j) => j.gross, jml("gross_amount"))}</td>
                <td className="n">{kolomNilai((j) => j.vat, jml("vat"))}</td>
                <td className="n">{kolomNilai((j) => j.pph, jml("withholding_tax"))}</td>
                <td className="n">
                  {kolomNilai((j) => j.net, jml("net_amount"), true)}
                </td>
                {/* Tanggal uang keluar menurut bukti bank, bukan tanggal
                    klaimnya disetujui: ia tersimpan di settlements, sebab satu
                    transfer dapat melunasi beberapa klaim sekaligus. Kosong
                    selama belum ada pelunasan yang tercatat — dan itu memang
                    keadaan sebagian besar baris pada layar ini. */}
                <td>{c.tanggal_bayar ? tglPendek(c.tanggal_bayar) : "—"}</td>
                {/* Kolom Status: keempat langkah perjalanan pengajuan
                    berdiri bersama, bukan satu keadaan saja. Yang membaca
                    ingin tahu sudah lewat mana dan tinggal apa — pertanyaan
                    yang dulu hanya terjawab dengan membuka jejak audit.

                    Yang sudah lewat hijau, yang sedang berjalan bertulisan
                    tebal berbingkai gelap, yang belum sampai redup, dan yang
                    tertahan merah. */}
                {/* Empat catatan peredaran dokumen. Tidak satu pun dapat
                    disusun sistem: divisi mana yang menyerahkan dan menerima,
                    serta kapan berkasnya berangkat dan sampai, hanya diketahui
                    orang yang memegangnya. Karena itu keempatnya diisi tangan.

                    Sebelumnya keempatnya ada di layar Sirkulasi Dokumen; sejak
                    layar itu dibuang, di sinilah tempatnya. Medan dan
                    endpoint-nya sama, jadi yang sudah pernah diisi tetap
                    terbaca. */}
                <td>{isiEmpat(c, "sender_division", k.isiData, g)}</td>
                <td>{isiEmpat(c, "handed_to", k.isiData, g)}</td>
                <td>{isiEmpat(c, "distributed_at", undefined, g)}</td>
                <td>{isiEmpat(c, "received_at", undefined, g)}</td>
                <td className="sel-keadaan">
                  {/* Panah peringkas. Hanya panah, tanpa tulisan: ia berdiri
                      di atas empat kotak yang semuanya bertulisan, dan tulisan
                      kelima akan ikut terbaca sebagai langkah. */}
                  <button className="kecilkan" type="button"
                          aria-expanded={!ringkas[c.id]}
                          title={ringkas[c.id] ? k.ringkasBuka : k.ringkasTutup}
                          aria-label={ringkas[c.id] ? k.ringkasBuka
                                                    : k.ringkasTutup}
                          onClick={() => setRingkas((r) =>
                            ({ ...r, [c.id]: !r[c.id] }))}>
                    <span aria-hidden="true">{ringkas[c.id] ? "\u25BE" : "\u25B4"}</span>
                  </button>

                  {LANGKAH.map((l, i) => {
                    const semua = keadaanLangkah(c.status);
                    const ling = semua[i];
                    // Yang diringkas menyisakan langkah yang sedang berjalan.
                    // Bila tidak ada yang berjalan — pengajuan sudah tuntas —
                    // yang disisakan langkah terakhir, supaya kolomnya tidak
                    // pernah kosong sama sekali.
                    if (ringkas[c.id]) {
                      const jalan = semua.findIndex((x) => x === "kini" ||
                                                           x === "stop");
                      if (i !== (jalan < 0 ? semua.length - 1 : jalan)) {
                        return null;
                      }
                    }
                    // Langkah ketiga menyebut kategori penerimanya yang
                    // sebenarnya — Sales Inhouse atau Agent — bukan
                    // "Sales/Agent" yang menyebut dua pihak sekaligus
                    // padahal hanya satu yang memegang dokumennya.
                    const kat = kategori(c, k, bahasa);
                    const ganti = (t: string) =>
                      kat ? t.replace("Sales/Agent", kat) : t;
                    // Langkah pertama menyebut Admin Sales, bukan Pajak,
                    // selama dokumennya memang belum dikirim ke sana — lihat
                    // sebutanLangkah().
                    const sebutan = sebutanLangkah(l, c.status);
                    return (
                      <div className="langkah-keadaan" key={l.n}>
                        <span className={`kotak-keadaan ${warnaLangkah(ling)}`}>
                          {ganti(bahasa === "en"
                            ? sebutan.pihak.en : sebutan.pihak.id)}
                        </span>
                        <div className={`menunggu ${warnaLangkah(ling)}`}>
                          {ganti(bahasa === "en"
                            ? sebutan.kerja.en : sebutan.kerja.id)}
                        </div>

                        {/* Pemilih tahap peredaran dokumen, di dalam langkah
                            keempat — langkah inilah yang menggambarkan
                            peredaran dokumen fisik, dan keempat pilihannya
                            adalah rinciannya. Hanya muncul setelah dokumennya
                            ditandatangani: peredaran fisik baru bermula
                            setelah tanda tangan ada.

                            Dua tahap terakhir tidak dapat dipilih dari sini:
                            keduanya membawa serta berkasnya masing-masing, dan
                            tombolnya ada di kolom Tindakan. */}
                        {/* Pemilihnya muncul bagi yang dapat menggerakkan
                            tahapnya MAUPUN yang dapat mencatat pembayarannya.
                            Sebelumnya hanya yang pertama: Finance Payment —
                            satu-satunya peran yang tugasnya memang mencatat
                            pembayaran — tidak melihat pemilihnya sama sekali,
                            sehingga "Pembayaran Selesai" tidak dapat dipilih
                            oleh orang yang justru memilikinya. */}
                        {l.n === 4 && (bolehTahap || bolehBayar) &&
                         bolehGerak(c.status) && (
                          <select className="pilih-tahap"
                                  disabled={gerak === c.id}
                                  value={tahapDari(c.status) ?? ""}
                                  onChange={(e) => {
                                    const n = Number(e.target.value);
                                    // "Pembayaran Selesai" tidak digerakkan
                                    // dari sini: ia menuntut tanggal transfer
                                    // dan bukti banknya, dan keduanya diisi di
                                    // kotak yang terbuka di kolom Tindakan.
                                    // Memindahkan statusnya lebih dulu akan
                                    // mencatat klaim lunas tanpa satu pun
                                    // bukti bahwa uangnya keluar.
                                    if (n === 4) {
                                      setByrUntuk(c.id); setByrTgl("");
                                      setByrBukti(null);
                                      return;
                                    }
                                    void pindahTahap(c, n);
                                  }}>
                            {TAHAP.map((t) => (
                              <option key={t.n} value={t.n}
                                      disabled={
                                        t.n === 3 ||
                                        t.n <= (tahapDari(c.status) ?? 0) ||
                                        // Tahap 1 dan 2 hanya bagi yang
                                        // memang menggerakkan peredaran
                                        // dokumennya.
                                        (t.n < 3 && !bolehTahap) ||
                                        // Pembayaran baru dapat dicatat setelah
                                        // Persetujuan Final, dan hanya oleh
                                        // yang memang berwenang mencatatnya —
                                        // endpoint-nya pun menolak peran lain.
                                        (t.n === 4 &&
                                         (!bolehBayar ||
                                          (tahapDari(c.status) ?? 0) !== 3))}>
                                {t.n}. {bahasa === "en" ? t.en : t.nama}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}

                </td>
                {/* Pratinjau dibuka di jendela tersendiri, sama seperti dari
                    layar Pengajuan Fee: yang dibuka adalah dokumen untuk
                    diperiksa dan dicetak, dan mencetaknya dari dalam layar ini
                    berarti ikut mencetak menu dan seluruh tabelnya. */}
                <td className="sel-tindakan">
                  {/* Pajak baru dapat membukanya sesudah dokumennya dikirim
                      kepadanya. Aturannya satu, di lib/tahap, dan ditegakkan
                      juga oleh route handler-nya — tombol yang mati di sini
                      bukan pagar, sebab alamatnya dapat diketik langsung.
                      Yang mati disebutkan sebabnya: tombol mati tanpa
                      keterangan terbaca sebagai layar yang rusak. */}
                  <button
                    disabled={!bolehBukaDokumen(sesi.role, c.status)}
                    title={bolehBukaDokumen(sesi.role, c.status)
                             ? undefined : k.pratinjauTertutup}
                    /* Seluruh formulir sepengajuan dibuka sekaligus: yang
                       diajukan bersama juga diperiksa dan dicetak bersama,
                       dan membukanya satu per satu berarti tiga jendela untuk
                       satu pekerjaan. */
                    onClick={() => window.open(
                            `/klaim/pratinjau?ids=${g.map((x) => x.id).join(",")}`,
                            "_blank")}>
                    {k.pratinjau}
                  </button>
                  {!bolehBukaDokumen(sesi.role, c.status) && (
                    <div className="sebab-tindakan">{k.pratinjauTertutup}</div>
                  )}

                  {/* Pengiriman tautan ke Sales/Agent, hanya untuk Admin Sales
                      — merekalah yang berhubungan dengan Sales/Agent, dan
                      endpoint-nya pun menolak peran lain. Muncul hanya pada
                      baris yang memang sedang menunggu tautannya.

                      Letaknya di kolom Tindakan bersama tombol lain, bukan
                      lagi di bawah keterangan tahap pada kolom Status. Kolom
                      Status menceritakan keadaan; yang dapat ditekan orang
                      berkumpul di satu tempat, supaya tidak ada tombol yang
                      harus dicari di antara kalimat.

                      Tautan yang sudah terbit tetap dapat dibuka, berapa pun
                      statusnya sekarang — termasuk setelah Sales/Agent
                      membukanya dan klaimnya berpindah ke "menunggu tanda
                      tangan". Dibuka kembali, bukan diterbitkan ulang:
                      menerbitkan ulang menggugurkan tautan yang sudah ada di
                      tangan Sales/Agent. */}
                  {sesi.role === "admin_sales" &&
                   MENUNGGU_TAUTAN.includes(c.status) && (
                    c.marketing?.phone ? (
                      <button disabled={mengirim !== null}
                              onClick={() => void kirimTautan(c)}>
                        {mengirim === c.id ? k.waMengirim
                          : c.status === "tax_verified" ? k.waKirim
                          : k.waUlang}
                      </button>
                    ) : (
                      <div className="menunggu"
                           style={{ color: "var(--stop)", margin: "0 0 6px" }}>
                        {k.waTanpaHp}
                      </div>
                    )
                  )}

                  {sesi.role === "admin_sales" && tautan[c.id] && (
                    <button onClick={() => setLihatTautan(c.id)}>
                      {k.waLihat}
                    </button>
                  )}

                  {/* Verifikasi pajak: hanya pada baris yang memang sedang
                      menunggunya, dan hanya bagi yang endpoint-nya menerima.
                      Tombol yang selalu berakhir 403 bukan pembatasan — itu
                      jebakan, dan yang menekannya mengira pekerjaannya sudah
                      dilakukan. */}
                  {bolehPajak && c.status === "pending_tax_verification" && (
                    <button className="pri" disabled={gerak === c.id}
                            onClick={() => {
                              setPjkUntuk(c.id);
                              setPjkBruto(""); setPjkPpn(""); setPjkPph("");
                              setPjkAlasan("");
                            }}>
                      {k.pjkTombol}
                    </button>
                  )}

                  {/* Tanda tangan yang jatuh ke pemeriksaan manual, dan
                      crosscheck sebelum cetak. Keduanya pindah kemari dari
                      layar /konsol yang dibuang; tanpa keduanya klaim berhenti
                      di dua tempat yang tidak punya tombol apa pun. */}
                  {bolehTtd && c.status === "signature_review_required" && (
                    <button className="pri" disabled={gerak === c.id}
                            onClick={() => { setTtdUntuk(c.id);
                                             setTtdAlasan(""); }}>
                      {k.ttdTombol}
                    </button>
                  )}

                  {(bolehCcAdmin || bolehCcFinance) &&
                   c.status === "crosscheck_in_progress" && (
                    <button disabled={gerak === c.id}
                            onClick={() => setCcUntuk(c.id)}>
                      {k.ccTombol}
                    </button>
                  )}

                  {/* Hapus, paling kanan dan paling akhir: pengajuan yang
                      terlanjur salah input. Bukan pembatalan alur — mesin
                      alur hanya mengenal pembatalan dari draft — melainkan
                      penghapusan barisnya beserta berkas dan sesi tanda
                      tangannya, dengan jejak audit yang tetap tinggal. */}
                  {bolehHapus &&
                   (bolehHapusDibayar || !SUDAH_BAYAR.includes(c.status)) && (
                    <button className="hapus-klaim" disabled={gerak === c.id}
                            onClick={() => { setHapUntuk(c.id);
                                             setHapAlasan(""); }}>
                      {k.hapTombol}
                    </button>
                  )}

                  {/* Dokumen full sign: tombol unggahnya muncul selama klaim
                      masih beredar, dan berganti menjadi tautan begitu
                      berkasnya ada — pratinjau yang dibuka setelah itu
                      memperlihatkan dokumen yang sudah lengkap tanda
                      tangannya.

                      Keduanya hilang begitu klaimnya tuntas; lihat tuntas(). */}
                  {tuntas(c) ? null : dokFullSign(c) ? (
                    <a className="tautan-klaim"
                       href={`/api/claims/${c.id}/documents/${dokFullSign(c).id}`}
                       target="_blank" rel="noreferrer">
                      {k.fsLihat}
                    </a>
                  ) : bolehTahap && bolehGerak(c.status) &&
                      (tahapDari(c.status) ?? 0) < 3 ? (
                    <button disabled={gerak === c.id}
                            onClick={() => { setFsUntuk(c.id); setFsBerkas(null); }}>
                      {k.fsTombol}
                    </button>
                  ) : null}

                  {/* Pembayaran: hanya setelah Persetujuan Final, dan hanya
                      selama belum tercatat lunas. */}
                  {bolehBayar && (tahapDari(c.status) ?? 0) === 3 && (
                    <button disabled={gerak === c.id}
                            onClick={() => { setByrUntuk(c.id); setByrTgl("");
                                             setByrBukti(null); }}>
                      {k.byrTombol}
                    </button>
                  )}
                </td>
              </tr>
              );
            })}

            {!terlihat.length && !busy && (
              <tr>
                <td colSpan={19} style={{ color: "var(--mut)" }}>{k.kosong}</td>
              </tr>
            )}
            {busy && (
              <tr>
                <td colSpan={19} style={{ color: "var(--mut)" }}>{k.memuat}</td>
              </tr>
            )}
          </tbody></table>
        </div>
      </div>

      {/* Tautannya diperlihatkan di pop-up, bukan di dalam selnya: alamat
          tautan sepanjang tujuh puluh karakter di dalam sel tabel melebarkan
          kolomnya, dan kolom yang melebar mendorong sembilan kolom lainnya. */}
      {/* Unggah dokumen full sign. Jendela tersendiri, bukan isian di dalam
          sel: selnya sempit, dan yang mengunggah perlu membaca catatan tentang
          keaslian dokumennya sebelum menekan tombolnya. */}
      {fsUntuk && (() => {
        const c = klaim.find((x) => x.id === fsUntuk);
        if (!c) return null;
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget) setFsUntuk(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.fsJudul} style={{ maxWidth: 460 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.fsJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 10px" }}>
                <b>{c.claim_number}</b> · {c.marketing?.full_name ?? "—"}
              </p>

              <div className="lbl">{k.fsBerkas}</div>
              <PilihBerkas style={{ width: "100%" }}
                           accept=".pdf,.jpg,.jpeg,.png,.webp"
                           onChange={(e) => setFsBerkas(e.target.files?.[0] ?? null)} />
              <p className="catatan-sunting">{k.fsCatatan}</p>

              <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button className="pri"
                        disabled={!fsBerkas || gerak === c.id}
                        onClick={() => void unggahFullSign(c)}>
                  {gerak !== c.id ? k.fsKirim
                    : fsKemajuan !== null ? k.fsKemajuan(fsKemajuan)
                    : k.fsMengirim}
                </button>
                <button disabled={gerak === c.id}
                        onClick={() => setFsUntuk(null)}>{k.batal}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Verifikasi pajak. Angka sistem berdiri di atas supaya yang memeriksa
          membaca yang diperiksanya lebih dulu, bukan mengetik koreksi atas
          angka yang tidak terlihat. */}
      {pjkUntuk && (() => {
        const c = klaim.find((x) => x.id === pjkUntuk);
        if (!c) return null;
        const angka = (v: string) => Number(String(v).replace(/[^\d]/g, ""));
        const adaKoreksi = Boolean(pjkBruto.trim() || pjkPpn.trim() || pjkPph.trim());
        const bruto = pjkBruto.trim() ? angka(pjkBruto) : Number(c.gross_amount ?? 0);
        const ppn = pjkPpn.trim() ? angka(pjkPpn) : Number(c.vat ?? 0);
        const pph = pjkPph.trim() ? angka(pjkPph) : Number(c.withholding_tax ?? 0);
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget && !gerak) setPjkUntuk(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.pjkJudul} style={{ maxWidth: 480 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.pjkJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 4px" }}>
                <b>{c.claim_number}</b> · {namaJenis(c.claim_type, bahasa)} ·{" "}
                {c.marketing?.full_name ?? "—"}
              </p>
              <p className="hint" style={{ textAlign: "left", margin: "0 0 10px" }}>
                {k.pjkPengantar}
              </p>

              <div className="lbl">{k.pjkSistem}</div>
              <table className="angka-pajak"><tbody>
                <tr><td>{k.pjkBruto}</td><td>{rp(c.gross_amount)}</td></tr>
                <tr><td>{k.pjkPpn}</td><td>{rp(c.vat)}</td></tr>
                <tr><td>{k.pjkPph}</td><td>{rp(c.withholding_tax)}</td></tr>
                <tr><td><b>{k.pjkBersih}</b></td>
                    <td><b>{rp(c.net_amount)}</b></td></tr>
              </tbody></table>

              <div className="lbl" style={{ marginTop: 12 }}>
                {k.pjkKoreksiJudul}
              </div>
              <div className="filters rapat">
                <div>
                  <div className="lbl">{k.pjkBruto}</div>
                  <input value={pjkBruto} inputMode="numeric"
                         placeholder={String(c.gross_amount ?? 0)}
                         onChange={(e) => setPjkBruto(e.target.value)} />
                </div>
                <div>
                  <div className="lbl">{k.pjkPpn}</div>
                  <input value={pjkPpn} inputMode="numeric"
                         placeholder={String(c.vat ?? 0)}
                         onChange={(e) => setPjkPpn(e.target.value)} />
                </div>
                <div>
                  <div className="lbl">{k.pjkPph}</div>
                  <input value={pjkPph} inputMode="numeric"
                         placeholder={String(c.withholding_tax ?? 0)}
                         onChange={(e) => setPjkPph(e.target.value)} />
                </div>
              </div>
              <p className="hint" style={{ textAlign: "left", margin: "6px 0 0" }}>
                {k.pjkKoreksiCatatan}
              </p>
              {adaKoreksi && (
                <div className="kode-tautan" style={{ marginTop: 6 }}>
                  {k.pjkBersih}: <b>{rp(bruto + ppn - pph)}</b>
                </div>
              )}

              <div className="lbl" style={{ marginTop: 12 }}>
                {adaKoreksi ? k.pjkAlasan : k.pjkAlasanKembali}
              </div>
              <textarea value={pjkAlasan} style={{ width: "100%", minHeight: 56 }}
                        onChange={(e) => setPjkAlasan(e.target.value)} />

              <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                {adaKoreksi ? (
                  <button className="pri"
                          disabled={gerak === c.id || pjkAlasan.trim().length < 10}
                          onClick={() => void verifikasiPajak(
                            c, "approve_with_correction")}>
                    {gerak === c.id ? k.pjkMengirim : k.pjkSetujuKoreksi}
                  </button>
                ) : (
                  <button className="pri" disabled={gerak === c.id}
                          onClick={() => void verifikasiPajak(c, "approve")}>
                    {gerak === c.id ? k.pjkMengirim : k.pjkSetuju}
                  </button>
                )}
                <button disabled={gerak === c.id || !pjkAlasan.trim()}
                        onClick={() => void verifikasiPajak(c, "return")}>
                  {k.pjkKembalikan}
                </button>
                <button disabled={gerak === c.id}
                        onClick={() => setPjkUntuk(null)}>{k.batal}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tinjauan tanda tangan manual. */}
      {ttdUntuk && (() => {
        const c = klaim.find((x) => x.id === ttdUntuk);
        if (!c) return null;
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget && !gerak) setTtdUntuk(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.ttdJudul} style={{ maxWidth: 460 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.ttdJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 4px" }}>
                <b>{c.claim_number}</b> · {namaJenis(c.claim_type, bahasa)} ·{" "}
                {c.marketing?.full_name ?? "—"}
              </p>
              <p className="hint" style={{ textAlign: "left", margin: "0 0 10px" }}>
                {k.ttdPengantar}
              </p>

              {c.signature_score != null && (
                <div className="kode-tautan">
                  {k.ttdSkor}: <b>{c.signature_score}</b>
                </div>
              )}

              {/* Yang ditinjau, diperlihatkan. Goresan tiap percobaan di
                  sebelah kiri beserta skornya, spesimen tersimpan di sebelah
                  kanan — membandingkan keduanya memang pekerjaan yang diminta
                  di sini, dan tanpa gambarnya pertanyaannya tidak dapat
                  dijawab. */}
              {!ttdBukti ? (
                <p className="hint" style={{ textAlign: "left" }}>
                  {k.ttdMemuat}
                </p>
              ) : (
                <div className="banding-ttd">
                  <div>
                    <div className="lbl">{k.ttdGoresan}</div>
                    {(ttdBukti.attempts ?? []).map((a: any) => (
                      <div key={a.id} className="petak-goresan">
                        <img src={gambarTtd(a.image_png)!} alt=""
                             title={k.ttdPerbesar}
                             onClick={() => setTtdZoom(gambarTtd(a.image_png))} />
                        <span>
                          {k.ttdPercobaan(a.attempt_number)} ·{" "}
                          {k.ttdAmbang(a.score,
                                       a.threshold_at_time ?? ttdBukti.threshold)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="lbl">{k.ttdSpesimen}</div>
                    {(() => {
                      const sp = (ttdBukti.baseline_specimens ?? []).length
                        ? ttdBukti.baseline_specimens
                        : ttdBukti.reference_signature?.reference_signature_png
                          ? [{ sequence: null,
                               image_png: ttdBukti.reference_signature
                                            .reference_signature_png }]
                          : [];
                      if (!sp.length) {
                        return <p className="hint" style={{ textAlign: "left" }}>
                          {k.ttdTanpaSpesimen}
                        </p>;
                      }
                      return sp.map((x: any, i: number) => (
                        <div key={i} className="petak-goresan">
                          <img src={gambarTtd(x.image_png)!} alt=""
                               title={k.ttdPerbesar}
                               onClick={() => setTtdZoom(gambarTtd(x.image_png))} />
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              <div className="lbl" style={{ marginTop: 12 }}>{k.ttdAlasan}</div>
              <textarea value={ttdAlasan} style={{ width: "100%", minHeight: 56 }}
                        onChange={(e) => setTtdAlasan(e.target.value)} />

              <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button className="pri"
                        disabled={gerak === c.id || ttdAlasan.trim().length < 10}
                        onClick={() => void tinjauTtd(c, "approve_manually")}>
                  {gerak === c.id ? k.ttdMengirim : k.ttdSetuju}
                </button>
                <button disabled={gerak === c.id || ttdAlasan.trim().length < 10}
                        onClick={() => void tinjauTtd(c, "reject")}>
                  {k.ttdTolak}
                </button>
                <button disabled={gerak === c.id}
                        onClick={() => setTtdUntuk(null)}>{k.batal}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Gambar yang diperbesar, di atas kotak tinjauan yang membukanya.

          Tirai tersendiri dengan lapisan lebih tinggi: kotak tinjauannya tetap
          terbuka di belakang, sehingga menutup gambarnya mengembalikan orang
          ke tempat ia berhenti — bukan ke daftar, dengan alasan yang sudah
          diketik ikut hilang.

          Ditutup dengan menekan di mana saja. Tidak ada yang dapat dilakukan
          di lapisan ini selain melihat, jadi setiap tekanan berarti sudah
          selesai melihat. */}
      {ttdZoom && (
        <div className="tirai zoom-ttd" onMouseDown={() => setTtdZoom(null)}>
          <img src={ttdZoom} alt="" />
          <button className="pri" onClick={() => setTtdZoom(null)}>
            {k.ttdTutupGambar}
          </button>
        </div>
      )}

      {/* Crosscheck sebelum cetak. Dua pihak, dua tombol — masing-masing
          hilang begitu pihaknya selesai, sehingga yang tersisa di layar
          selalu pekerjaan yang memang belum dikerjakan. */}
      {ccUntuk && (() => {
        const c = klaim.find((x) => x.id === ccUntuk);
        if (!c) return null;
        const baris = [
          { pihak: "admin_sales", nama: k.ccAdmin,
            sudah: c.crosscheck_admin === "completed", boleh: bolehCcAdmin },
          { pihak: "finance", nama: k.ccFinance,
            sudah: c.crosscheck_finance === "completed", boleh: bolehCcFinance },
        ];
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget && !gerak) setCcUntuk(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.ccJudul} style={{ maxWidth: 420 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.ccJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 4px" }}>
                <b>{c.claim_number}</b> · {namaJenis(c.claim_type, bahasa)} ·{" "}
                {c.marketing?.full_name ?? "—"}
              </p>
              <p className="hint" style={{ textAlign: "left", margin: "0 0 10px" }}>
                {k.ccPengantar}
              </p>

              <table className="angka-pajak"><tbody>
                {baris.map((b) => (
                  <tr key={b.pihak}>
                    <td>{b.nama}</td>
                    <td>
                      {b.sudah ? (
                        <span className="pill ok">{k.ccSudah}</span>
                      ) : b.boleh ? (
                        <button disabled={gerak === c.id}
                                onClick={() => void selesaikanCrosscheck(
                                  c, b.pihak)}>
                          {gerak === c.id ? k.ccMengirim : k.ccSelesaikan}
                        </button>
                      ) : (
                        <span className="pill warn">{k.ccBelum}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody></table>

              <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button disabled={gerak === c.id}
                        onClick={() => setCcUntuk(null)}>{k.batal}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Penghapusan pengajuan yang salah input. Alasan wajib, dan namanya
          disebut lengkap di dalam kotaknya: yang ditekan dari kolom yang
          berisi belasan baris mudah tertuju ke baris yang salah, dan
          penghapusan tidak punya jalan pulang. */}
      {hapUntuk && (() => {
        const c = klaim.find((x) => x.id === hapUntuk);
        if (!c) return null;
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget && !gerak) setHapUntuk(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.hapJudul} style={{ maxWidth: 440 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.hapJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 4px" }}>
                <b>{c.claim_number}</b> · {namaJenis(c.claim_type, bahasa)} ·{" "}
                {c.unit?.code ?? "—"} · {c.marketing?.full_name ?? "—"} ·{" "}
                {rp(c.net_amount)}
              </p>
              <p className="hint" style={{ textAlign: "left", margin: "0 0 10px" }}>
                {k.hapPengantar}
              </p>

              {SUDAH_BAYAR.includes(c.status) && (
                <div className="banner stop" style={{ marginBottom: 10 }}>
                  {k.hapSudahBayar}
                </div>
              )}

              <div className="lbl">{k.hapAlasan}</div>
              <textarea value={hapAlasan} style={{ width: "100%", minHeight: 56 }}
                        onChange={(e) => setHapAlasan(e.target.value)} />

              <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button className="hapus-klaim"
                        disabled={gerak === c.id || hapAlasan.trim().length < 10}
                        onClick={() => void hapusKlaim(c)}>
                  {gerak === c.id ? k.hapMengirim : k.hapKirim}
                </button>
                <button disabled={gerak === c.id}
                        onClick={() => setHapUntuk(null)}>{k.batal}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pencatatan pembayaran. Tanggal dan bukti transfernya wajib —
          aturannya ditegakkan settle() di server, tidak diulang di sini. */}
      {byrUntuk && (() => {
        const c = klaim.find((x) => x.id === byrUntuk);
        if (!c) return null;
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget) setByrUntuk(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.byrJudul} style={{ maxWidth: 460 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.byrJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 10px" }}>
                <b>{c.claim_number}</b> · {rp(c.net_amount)}
              </p>

              <div className="lbl">{k.byrTanggal}</div>
              <input type="date" value={byrTgl} style={{ width: "100%" }}
                     onChange={(e) => setByrTgl(e.target.value)} />

              <div className="lbl" style={{ marginTop: 10 }}>{k.byrBukti}</div>
              <PilihBerkas style={{ width: "100%" }}
                           accept=".pdf,.jpg,.jpeg,.png,.webp"
                           onChange={(e) => setByrBukti(e.target.files?.[0] ?? null)} />

              <div className="lbl" style={{ marginTop: 10 }}>{k.byrAlasan}</div>
              <input value={byrAlasan} style={{ width: "100%" }}
                     onChange={(e) => setByrAlasan(e.target.value)} />

              <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button className="pri"
                        disabled={!byrTgl || !byrBukti || gerak === c.id}
                        onClick={() => void catatPembayaran(c)}>
                  {gerak === c.id ? k.byrMengirim : k.byrKirim}
                </button>
                <button disabled={gerak === c.id}
                        onClick={() => setByrUntuk(null)}>{k.batal}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {lihatTautan && tautan[lihatTautan] && (() => {
        const t = tautan[lihatTautan];
        const c = klaim.find((x) => x.id === lihatTautan);
        const alamat = `${window.location.origin}/sign/${t.token}`;
        // Satu pesan untuk ketiga jalan — disalin, lewat WhatsApp, lewat
        // surel — supaya yang diterima penerima tidak bergantung pada lewat
        // mana ia dikirim.
        const sambutan = k.waSambutan(
          c?.marketing?.full_name ?? "Bapak/Ibu",
          sesi.project_name ?? "", alamat);
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget) setLihatTautan(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.waJudul} style={{ maxWidth: 420 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.waJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 10px" }}>
                <b>{c?.claim_number}</b> ·{" "}
                {c?.marketing?.full_name ?? "—"} ·{" "}
                {k.waTerbit(t.masked_phone)}
              </p>

              {/* Kata sambutan beserta tautannya di baris terakhir — satu
                  pesan utuh, siap disalin atau dikirim apa adanya. Nama
                  penerima dan nama project diisi dari pengajuannya sendiri.
                  white-space: pre-wrap pada .alamat-tautan yang menjaga
                  barisnya tetap seperti ditulis. */}
              <div className="lbl">{k.waAlamat}</div>
              <div className="alamat-tautan">{sambutan}</div>

              {/* Dua jalan mengirimkannya, keduanya mengambil tujuannya dari
                  Data Marketing: nomor WhatsApp dan surel orang yang sama.
                  Pesannya disusun di sini — sama untuk kedua jalan — supaya
                  yang diterima agent tidak bergantung pada lewat mana ia
                  dikirim.

                  Yang tidak punya tujuannya tidak ditawarkan: tombol yang
                  membuka percakapan ke nomor kosong hanya membuang satu
                  ketukan dan satu jendela, lalu meninggalkan orangnya menebak
                  apa yang salah. Sebabnya ditulis di bawahnya. */}
              <div className="row" style={{ margin: "10px 0" }}>
                {nomorWa(c?.marketing?.phone) && (
                  <a className="tombol-klaim kecil"
                     href={`https://wa.me/${nomorWa(c?.marketing?.phone)}` +
                           `?text=${encodeURIComponent(sambutan)}`}
                     target="_blank" rel="noreferrer">{k.waBukaWa}</a>
                )}
                {c?.marketing?.email && (
                  <a className="tombol-klaim kecil"
                     href={`mailto:${encodeURIComponent(c.marketing.email)}` +
                           `?subject=${encodeURIComponent(
                             k.waSurelPerihal(c?.claim_number ?? ""))}` +
                           `&body=${encodeURIComponent(
                             `${sambutan}\n\n${k.waKodeCatatan}`)}`}>
                    {k.waEmail}
                  </a>
                )}
                <button onClick={() => {
                  navigator.clipboard?.writeText(sambutan);
                  setKabar(k.waTersalin);
                }}>{k.waSalin}</button>
              </div>

              {!c?.marketing?.email && (
                <p className="hint" style={{ textAlign: "left", margin: "0 0 6px" }}>
                  {k.waTanpaEmail}
                </p>
              )}
              {!nomorWa(c?.marketing?.phone) && (
                <p className="hint" style={{ textAlign: "left", margin: "0 0 6px" }}>
                  {k.waHpKosong}
                </p>
              )}

              {/* QR berdiri tepat di atas kode verifikasi: ia jalan menuju
                  tautannya, dan kode verifikasi adalah hal lain yang sengaja
                  disampaikan lewat jalur terpisah. Menaruhnya di bawah kode
                  membuat keduanya terbaca sebagai satu hal. */}
              <KodeQr nilai={alamat} keterangan={k.waQr}
                      gagalTeks={k.waQrGagal} unduhTeks={k.waUnduhQr}
                      unduhNama={`qr-${c?.claim_number ?? "tautan"}.png`} />
              <p className="hint" style={{ textAlign: "left", margin: "0 0 8px" }}>
                {k.waLampirQr}
              </p>

              <div style={{ fontSize: 12.5 }}>
                {k.waKode} <b>{t.otp_demo}</b>
              </div>
              <p className="hint" style={{ textAlign: "left", margin: "4px 0 0" }}>
                {k.waKodeCatatan}
              </p>

              <button onClick={() => setLihatTautan(null)}>{k.waTutup}</button>
            </div>
          </div>
        );
      })()}

      {/* Pemberitahuan setelah jendela pratinjau menutup diri. Dibuat sebagai
          pop-up, bukan banner: jendela yang tiba-tiba hilang dari layar adalah
          perubahan besar, dan yang menekan "Kirim ke Pajak" perlu tahu bahwa
          hilangnya itu memang karena kirimannya berhasil. */}
      {terkirim !== null && (
        <div className="tirai"
             onMouseDown={(e) => {
               if (e.target === e.currentTarget) setTerkirim(null);
             }}>
          <div className="popup" role="dialog" aria-modal="true"
               aria-label={k.kabarJudul}>
            <h2 style={{ margin: "0 0 10px" }}>{k.kabarJudul}</h2>
            <p className="pengantar">{k.kabarIsi(terkirim)}</p>
            <button className="pri" onClick={() => setTerkirim(null)}>
              {k.kabarTutup}
            </button>
          </div>
        </div>
      )}
    </Kerangka>
  );
}

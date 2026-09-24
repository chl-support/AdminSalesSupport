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

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { namaJenis } from "../klaim/jenis";
import { namaKategori } from "@/lib/kategori";
import { TAHAP, bolehGerak, tahapDari } from "@/lib/tahap";
import { LANGKAH, keadaanLangkah, sebutanLangkah, warnaLangkah }
  from "@/lib/langkah";
// Pemecah berkas yang sudah terbukti pada memo. Mekanismenya tidak
// memo-spesifik — ia hanya menjaga agar satu permintaan tidak pernah melampaui
// batas fungsi serverless — dan menyalinnya ke sini berarti dua salinan yang
// akan berbeda perilaku begitu salah satunya diperbaiki.
import { BATAS_FULL_SIGN, periksaUkuran, perluDipecah, titipBerkas }
  from "../memo/kirim";

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
    judul: "Approval / Persetujuan",
    pengantar: "Rincian dokumen pengajuan pada project ini. Pratinjau " +
               "formulirnya dibuka dari kolom paling kanan.",
    galat: "Data klaim tidak dapat dibaca",
    tampilkan: "Search",
    sUnit: "Unit", sJalan: "Diproses / Berlangsung", sSelesai: "Selesai",
    jumlah: (n: number) => `${n} klaim`,
    unduhRekap: "Download (.xlsx)",
    pProgress: (n: number) => `🔄 ${n} Progress`,
    pFinish: (n: number) => `🏁 ${n} Finish`,
    tahapJudul: "Tahap peredaran",
    tahapBelum: "Belum beredar",
    tahapGerak: "Memindahkan…",
    tahapPindah: (t: string) => `Dokumen berpindah ke tahap "${t}".`,
    fsTombol: "Submit Dokumen Final",
    fsJudul: "Dokumen full sign",
    fsBerkas: "Berkas dokumen yang sudah lengkap tanda tangannya",
    fsKirim: "Unggah lalu setujui", fsMengirim: "Mengunggah…",
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
    thPerihal: "Perihal/Topik",
    thKategori: "Kategori", thPenerima: "Penerima",
    thPengaju: "Diajukan Oleh", thBruto: "Jumlah Komisi",
    thPpn: "PPN", thPph: "PPh", thBersih: "Komisi Yang Dibayarkan",
    thTglBayar: "Tanggal Pembayaran",
    thStatus: "Status", thDokumen: "Tindakan",
    katInhouse: "Sales Inhouse", katAgent: "Agent",
    pratinjau: "Preview Dokumen",
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
    waBukaWa: "Buka WhatsApp", waSalin: "Salin tautan",
    waTersalin: "Tautan tersalin.",
    waKode: "Kode verifikasi:",
    waKodeCatatan: "Sampaikan kode lewat jalur terpisah dari tautannya.",
    waGagal: "Tautan tidak dapat diterbitkan",
    waJudul: "Tautan tanda tangan untuk Sales/Agent",
    waLihat: "Lihat tautannya",
    waAlamat: "Alamat tautan",
    waTutup: "Tutup",
    ringkasTutup: "Ringkas kembali",
    ringkasBuka: "Tampilkan seluruh langkah",
  },
  en: {
    judul: "Approval Status",
    pengantar: "Submission details for this project. The form preview opens " +
               "from the rightmost column.",
    galat: "Claim data could not be read",
    tampilkan: "Search",
    sUnit: "Unit", sJalan: "In progress", sSelesai: "Completed",
    jumlah: (n: number) => `${n} claims`,
    unduhRekap: "Download (.xlsx)",
    pProgress: (n: number) => `🔄 ${n} Progress`,
    pFinish: (n: number) => `🏁 ${n} Finish`,
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
    thPerihal: "Subject / topic",
    thKategori: "Category", thPengaju: "Submitted by",
    thPpn: "VAT", katInhouse: "In-house sales", katAgent: "Agent",
    thPenerima: "Recipient", thBruto: "Commission amount",
    thPph: "Withholding",
    thBersih: "Commission paid", thTglBayar: "Payment date",
    thStatus: "Status", thDokumen: "Action",
    pratinjau: "Review Document",
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
    waBukaWa: "Open WhatsApp", waSalin: "Copy the link",
    waTersalin: "Link copied.",
    waKode: "Verification code:",
    waKodeCatatan: "Give the code through a channel separate from the link.",
    waGagal: "The link could not be issued",
    waJudul: "Signature link for the Sales/Agent",
    waLihat: "Show the link",
    waAlamat: "Link address",
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

  const pindahTahap = async (c: any, n: number) => {
    setGerak(c.id); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/claims/${c.id}/tahap`, {
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

      const res = await fetch(`/api/claims/${c.id}/full-sign`, {
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
      const res = await fetch(`/api/claims/${c.id}/tax-verification`, {
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
      const res = await fetch(`/api/claims/${c.id}/signature-review`, {
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
      const res = await fetch(`/api/claims/${c.id}/crosscheck`, {
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
      const res = await fetch(`/api/claims/${c.id}`, {
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
      const res = await fetch(`/api/claims/${c.id}/pembayaran`, {
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
   * Dua angka pada kepala panel: yang masih berjalan dan yang sudah selesai.
   *
   * Dihitung dari SELURUH klaim project ini, bukan dari yang sedang tampil:
   * angka yang ikut berubah mengikuti saringan akan berbunyi "0 Progress"
   * begitu saringannya dipasang ke "sudah selesai", padahal yang berjalan
   * tetap ada — hanya sedang tidak ditampilkan.
   *
   * Batas "selesai" memakai daftar SELESAI yang sama dengan saringannya.
   * Dibuatkan daftar kedua yang khusus untuk angka ini, satu layar akan
   * memuat dua arti "selesai" yang berbeda.
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

  const selesai = klaim.filter((c) => SELESAI.includes(c.status)).length;
  const jalan = klaim.length - selesai;

  return (
    <Kerangka sesi={sesi} lebar judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      {galat && <div className="banner stop"><b>{k.galat}</b>{galat}</div>}
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
        <div className="filters">
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
          <span>
            {/* Unduhan, bukan tombol: berkasnya dibangkitkan server dan
                langsung disimpan peramban, tanpa layar perantara. Sejajar
                dengan layar Dokumentasi Memo, yang sudah memakai bentuk ini. */}
            {terlihat.length > 0 && (
              <a className="tautan-klaim" href="/api/claims/rekap"
                 style={{ marginRight: 8 }}>
                {k.unduhRekap}
              </a>
            )}
            <span className="pill">{k.pProgress(jalan)}</span>
            <span className="pill">{k.pFinish(selesai)}</span>
          </span>
        </h2>

        <div className="tscroll persetujuan">
          <table className="tabel-penjualan"><tbody>
            <tr>
              <th className="sel-no">{k.thNo}</th>
              <th>{k.thTanggal}</th>
              <th className="sel-unit">{k.thUnit}</th>
              <th>{k.thPerihal}</th>
              <th>{k.thKategori}</th>
              <th className="sel-penerima">{k.thPenerima}</th>
              <th>{k.thPengaju}</th>
              <th>{k.thBruto}</th>
              <th>{k.thPpn}</th>
              <th>{k.thPph}</th>
              <th>{k.thBersih}</th>
              <th>{k.thTglBayar}</th>
              <th className="sel-keadaan">{k.thStatus}</th>
              <th style={{ width: 140 }}>{k.thDokumen}</th>
            </tr>

            {terlihat.map((c, i) => (
              <tr key={c.id}>
                <td className="sel-no">{i + 1}</td>
                <td>{tglPendek(c.created_at)}</td>
                {/* Nomor unitnya — itulah yang dipakai orang untuk mengenali
                    pengajuan ini. Sebelumnya hanya ada di lembar rekap dan di
                    formulir pratinjau, sehingga dua pengajuan sejenis untuk
                    penerima yang sama tidak dapat dibedakan dari tabel. */}
                <td className="sel-unit">{c.unit?.code ?? "—"}</td>
                <td>{namaJenis(c.claim_type, bahasa)}</td>
                <td>{kategori(c, k, bahasa) ?? "—"}</td>
                <td className="sel-penerima">{c.marketing?.full_name ?? "—"}</td>
                <td>{pengaju(c)}</td>
                <td className="n">{rp(c.gross_amount)}</td>
                <td className="n">{rp(c.vat)}</td>
                <td className="n">{rp(c.withholding_tax)}</td>
                <td className="n"><b>{rp(c.net_amount)}</b></td>
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
                  <button onClick={() => window.open(
                            `/klaim/pratinjau?ids=${c.id}`, "_blank")}>
                    {k.pratinjau}
                  </button>

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
            ))}

            {!terlihat.length && !busy && (
              <tr>
                <td colSpan={14} style={{ color: "var(--mut)" }}>{k.kosong}</td>
              </tr>
            )}
            {busy && (
              <tr>
                <td colSpan={14} style={{ color: "var(--mut)" }}>{k.memuat}</td>
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
              <input type="file" style={{ width: "100%" }}
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
                        <img src={gambarTtd(a.image_png)!} alt="" />
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
                          <img src={gambarTtd(x.image_png)!} alt="" />
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
              <input type="file" style={{ width: "100%" }}
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

              <div className="lbl">{k.waAlamat}</div>
              <div className="alamat-tautan">{alamat}</div>

              <div className="row" style={{ margin: "10px 0" }}>
                <a className="tombol-klaim kecil"
                   href={`https://wa.me/${nomorWa(c?.marketing?.phone)}` +
                         `?text=${encodeURIComponent(`${t.message}\n${alamat}`)}`}
                   target="_blank" rel="noreferrer">{k.waBukaWa}</a>
                <button onClick={() => {
                  navigator.clipboard?.writeText(alamat);
                  setKabar(k.waTersalin);
                }}>{k.waSalin}</button>
              </div>

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

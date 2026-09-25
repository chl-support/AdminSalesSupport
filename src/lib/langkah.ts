/**
 * Empat langkah perjalanan sebuah pengajuan, sebagaimana dilihat orang di
 * kolom Status.
 *
 * Sebelumnya kolom Status hanya menampilkan SATU keadaan — keadaan klaim saat
 * itu. Yang membaca tidak dapat melihat perjalanannya: sudah lewat mana, dan
 * masih menyisakan apa. Untuk itu ia harus membuka jejak audit, yang bukan
 * tempat orang mencari jawaban secepat itu.
 *
 * Karena itu keempat langkahnya kini berdiri bersama dalam satu baris, dan
 * masing-masing menyebut warnanya sendiri: yang sudah lewat hijau, yang sedang
 * berjalan bertulisan tebal, yang belum sampai redup, dan yang tertahan merah.
 *
 * Seperti ./tahap, berkas ini memetakan dua puluh empat status di basis data
 * ke empat langkah di layar — tanpa membuat status baru. Status resmi klaim
 * tetap satu dan tetap digerakkan mesin alur yang sama. Berkas ini pun sengaja
 * tidak menyentuh lapisan server: layar Approval memakainya, dan satu impor ke
 * mesin alur akan menyeret penggerak basis data ikut terbundel ke peramban.
 */

/**
 * Seluruh status yang dilewati sebuah pengajuan, menurut urutannya.
 *
 * Urutan inilah yang menentukan sebuah langkah sudah lewat atau belum —
 * dibandingkan, bukan ditebak dari nama statusnya. Status yang mengakhiri
 * perjalanan sebelum waktunya (ditolak, dibatalkan) sengaja TIDAK ada di sini:
 * ia tidak menempati urutan mana pun, dan ditangani tersendiri di bawah.
 */
const URUTAN = [
  "draft", "submitted", "pending_admin_review", "pending_tax_verification",
  "tax_verified", "signature_link_sent", "awaiting_signature",
  "signature_review_required", "signed", "crosscheck_in_progress",
  "ready_to_print", "printed", "circulating_head_finance",
  "circulating_management", "awaiting_scan_upload", "approved",
  "awaiting_settlement_date", "partially_paid", "paid", "completed",
];

/** Status yang menghentikan perjalanan, di langkah mana pun ia berada. */
const TERTAHAN = ["returned", "rejected", "cancelled", "clawback"];

export type NomorLangkah = 1 | 2 | 3 | 4;

export const LANGKAH: {
  n: NomorLangkah;
  /** Yang memegang dokumennya pada langkah ini. */
  pihak: { id: string; en: string };
  /** Yang dikerjakan pada langkah ini. */
  kerja: { id: string; en: string };
  /** Status terakhir yang masih termasuk langkah ini. */
  sampai: string;
}[] = [
  {
    n: 1,
    pihak: { id: "Pajak", en: "Tax" },
    kerja: { id: "Menunggu Verifikasi Data", en: "Awaiting data verification" },
    sampai: "pending_tax_verification",
  },
  {
    n: 2,
    pihak: { id: "Admin Sales", en: "Sales Admin" },
    kerja: { id: "Proses Kirim Link", en: "Sending the link" },
    sampai: "signature_link_sent",
  },
  {
    // "Sales/Agent" diganti kategori penerimanya yang sebenarnya oleh layar —
    // pada baris milik sales in-house, menyebut dua pihak sekaligus memaksa
    // yang membaca menengok kolom lain untuk tahu yang mana.
    n: 3,
    pihak: { id: "Sales/Agent", en: "Sales/Agent" },
    kerja: { id: "Sedang diproses Sales/Agent",
             en: "Being handled by the Sales/Agent" },
    sampai: "signed",
  },
  {
    n: 4,
    pihak: { id: "Admin Sales", en: "Sales Admin" },
    kerja: { id: "Cetak & Distribusi Dokumen",
             en: "Printing & document distribution" },
    sampai: "completed",
  },
];

/**
 * Status sebelum sebuah pengajuan benar-benar sampai ke tim pajak.
 *
 * Langkah pertama berjudul "Pajak — Menunggu Verifikasi Data", dan itu benar
 * hanya pada status terakhirnya. Klaim yang masih draft, baru terkirim, atau
 * sedang diperiksa Admin Sales tampil dengan tulisan yang sama persis —
 * sehingga yang membacanya mengira dokumennya sudah ada di tangan tim pajak,
 * padahal tim pajak tidak melihatnya sama sekali dan pemberitahuan saat
 * masuknya pun tidak menghitungnya.
 *
 * Keadaan itu nyata dan memakan waktu: yang menunggu jawaban pajak sebenarnya
 * sedang menunggu dirinya sendiri menekan "Kirim ke Pajak".
 */
const BELUM_KE_PAJAK = ["draft", "submitted", "pending_admin_review"];

/**
 * Sebutan langkah menurut status klaimnya.
 *
 * Hanya langkah pertama yang berubah, dan hanya sebelum klaimnya sampai ke
 * pajak. Sisanya mengikuti LANGKAH apa adanya.
 */
export function sebutanLangkah(
  l: (typeof LANGKAH)[number], status: string,
): { pihak: { id: string; en: string }; kerja: { id: string; en: string } } {
  if (l.n !== 1 || !BELUM_KE_PAJAK.includes(status)) {
    return { pihak: l.pihak, kerja: l.kerja };
  }
  return {
    pihak: { id: "Admin Sales", en: "Sales Admin" },
    kerja: status === "pending_admin_review"
      ? { id: "Menunggu diteruskan ke Pajak",
          en: "Awaiting forwarding to Tax" }
      : { id: "Belum dikirim ke Pajak", en: "Not sent to Tax yet" },
  };
}

export type Keadaan = "usai" | "kini" | "nanti" | "stop";

/**
 * Keadaan tiap langkah bagi sebuah status, berurutan dari langkah 1.
 *
 * Klaim yang tertahan diperlakukan tersendiri: ia berhenti di suatu tempat
 * tanpa menempati urutan mana pun, jadi langkah yang sudah dilewatinya tetap
 * hijau dan langkah tempatnya berhenti diberi merah. Tanpa itu, klaim yang
 * ditolak pada langkah terakhir akan tampil sama persis dengan klaim yang
 * baru mulai — keduanya tidak punya urutan.
 */
export function keadaanLangkah(status: string, sebelumnya?: string | null)
    : Keadaan[] {
  const stop = TERTAHAN.includes(status);
  // Klaim yang tertahan dinilai dari status sebelum ia tertahan, bila
  // diketahui. Bila tidak, ia dianggap berhenti di langkah pertama — itu yang
  // paling sedikit mengarang.
  const acuan = stop ? (sebelumnya ?? "draft") : status;
  const kini = URUTAN.indexOf(acuan);
  // Pengajuan yang sudah tuntas tidak menyisakan langkah yang sedang
  // berjalan: keempatnya sudah lewat, termasuk yang terakhir.
  const tuntas = acuan === URUTAN[URUTAN.length - 1];

  return LANGKAH.map((l) => {
    const batas = URUTAN.indexOf(l.sampai);
    if (kini < 0 || kini > batas) return "usai";
    if (tuntas) return "usai";
    // Hanya SATU langkah yang sedang berjalan — yang memuat status sekarang.
    // Sisanya di belakangnya belum tersentuh, dan menandainya ikut berjalan
    // membuat seluruh kolom tampak sedang dikerjakan sekaligus.
    if (kini >= URUTAN.indexOf(sebelumBatas(l.n))) {
      return stop ? "stop" : "kini";
    }
    return "nanti";
  });
}

/**
 * Status pertama yang termasuk sebuah langkah.
 *
 * Yakni status tepat sesudah batas langkah sebelumnya; langkah pertama mulai
 * dari status paling awal.
 */
function sebelumBatas(n: NomorLangkah): string {
  if (n === 1) return URUTAN[0];
  const sebelumnya = LANGKAH.find((x) => x.n === n - 1)!;
  return URUTAN[URUTAN.indexOf(sebelumnya.sampai) + 1];
}

/** Kelas CSS untuk sebuah keadaan langkah. */
export const warnaLangkah = (k: Keadaan) =>
  k === "usai" ? "usai" : k === "stop" ? "stop" : k === "kini" ? "kini" : "nanti";

/**
 * Yang memegang berkas pada sebuah status, disebut sebagaimana layar
 * menyebutnya.
 *
 * Bukan sekadar pihak langkahnya: langkah pertama berjudul "Pajak", padahal
 * empat status pertamanya masih di meja Admin Sales — draft, terkirim, dan
 * menunggu diteruskan. Menjumlahkan keempatnya sebagai "lama di Pajak"
 * menuduh bagian yang belum pernah memegang berkasnya.
 */
export function pihakStatus(status: string): { id: string; en: string } | null {
  const n = langkahDari(status);
  if (n === null) return null;
  const l = LANGKAH.find((x) => x.n === n)!;
  return sebutanLangkah(l, status).pihak;
}

/**
 * Langkah yang memuat sebuah status.
 *
 * Dipakai layar Sirkulasi untuk menjumlahkan lama sebuah pengajuan pada tiap
 * langkah: jejak audit menyimpan status, bukan langkah, dan yang ditanyakan
 * kantor "berkasnya lama di bagian mana" — bukan "lama pada status mana".
 *
 * Status yang menghentikan perjalanan tidak menempati langkah mana pun. Ia
 * memang bukan tempat berkasnya tertahan, melainkan akhir perjalanannya.
 */
export function langkahDari(status: string): NomorLangkah | null {
  if (TERTAHAN.includes(status)) return null;
  const i = URUTAN.indexOf(status);
  if (i < 0) return null;
  for (const l of LANGKAH) {
    if (i <= URUTAN.indexOf(l.sampai)) return l.n;
  }
  return null;
}

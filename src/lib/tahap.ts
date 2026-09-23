/**
 * Empat tahap peredaran dokumen, sebagaimana dilihat orang di layar.
 *
 * Basis data menyimpan dua puluh empat status; orang yang membuka layar
 * Approval hanya ingin tahu dokumennya sedang berada pada tahap yang mana.
 * Berkas ini memetakan yang satu ke yang lain — tanpa membuat status baru.
 * Status resmi klaim tetap satu, tetap digerakkan mesin alur yang sama, dan
 * tetap tercatat pada jejak audit.
 *
 * Yang TIDAK dikerjakan di sini: memindahkan klaim menembus aturan. Memilih
 * satu tahap berarti meminta klaim berjalan ke tahap itu lewat jalur yang
 * memang diizinkan; bila tidak ada jalurnya, permintaannya ditolak.
 *
 * Berkas ini sengaja tidak menyentuh apa pun dari lapisan server. Layar
 * Approval memakainya juga — untuk tahu tahap sebuah baris dan tombol apa
 * yang pantas muncul — dan satu impor ke mesin alur akan menyeret penggerak
 * basis data ikut terbundel ke peramban. Pencarian jalurnya, yang memang
 * memerlukan peta alur, ada di ./tahap-alur.
 */

export type NomorTahap = 1 | 2 | 3 | 4;

export const TAHAP: {
  n: NomorTahap; nama: string; en: string;
  /** Status yang dianggap sudah berada pada tahap ini. */
  status: string[];
  /** Status yang dituju bila tahap ini dipilih. */
  tuju: string;
}[] = [
  {
    n: 1, nama: "Distribusi Dokumen", en: "Document distribution",
    status: ["ready_to_print", "printed"],
    tuju: "printed",
  },
  {
    n: 2, nama: "Persetujuan Internal & Manajemen",
    en: "Internal & management approval",
    status: ["circulating_head_finance", "circulating_management",
             "awaiting_scan_upload"],
    tuju: "circulating_head_finance",
  },
  {
    n: 3, nama: "Persetujuan Final", en: "Final approval",
    status: ["approved", "awaiting_settlement_date"],
    tuju: "approved",
  },
  {
    n: 4, nama: "Pembayaran Selesai", en: "Payment completed",
    status: ["partially_paid", "paid", "completed"],
    tuju: "paid",
  },
];

/** Tahap sebuah status, atau null bila belum sampai tahap mana pun. */
export function tahapDari(status: string): NomorTahap | null {
  return TAHAP.find((t) => t.status.includes(status))?.n ?? null;
}

/**
 * Status yang boleh digerakkan lewat pemilih tahap.
 *
 * Hanya sesudah dokumennya ditandatangani dan disegel. Keempat tahap ini
 * memang menggambarkan peredaran dokumen FISIK, yang baru bermula setelah
 * tanda tangan ada.
 *
 * Pagar ini bukan kehati-hatian berlebihan. jalurKe("draft", "printed")
 * menemukan jalur yang sah menurut peta alur — tetapi jalur itu melewati
 * verifikasi pajak dan tanda tangan Sales/Agent, dan menempuhnya berarti
 * klaim tercatat sudah diverifikasi pajak serta sudah ditandatangani tanpa
 * seorang pun pernah memeriksa atau menandatanganinya. Pemilih tahap tidak
 * boleh menjadi jalan pintas melewati keduanya.
 */
const BOLEH_GERAK = [
  "signed", "crosscheck_in_progress", "ready_to_print", "printed",
  "circulating_head_finance", "circulating_management", "awaiting_scan_upload",
  "approved", "awaiting_settlement_date", "partially_paid", "paid",
];

export const bolehGerak = (status: string) => BOLEH_GERAK.includes(status);

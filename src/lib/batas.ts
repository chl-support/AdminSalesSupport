/**
 * Batas ukuran berkas, di satu tempat.
 *
 * Angkanya dulu tersalin di empat berkas — lampiran.ts, memo.ts, memo/kirim.ts,
 * dan schema.sql — dan salinan yang tersebar begitu selalu berakhir sama:
 * salah satunya dinaikkan, sisanya tertinggal, lalu berkas yang diterima satu
 * lapis ditolak lapis berikutnya. Yang ditolak belakangan adalah yang paling
 * mahal: berkasnya sudah terkirim utuh sebelum ada yang memberi tahu.
 *
 * Modul ini sengaja tidak mengimpor apa pun. Ia dibaca kode server maupun kode
 * layar, dan satu impor ke basis data di sini akan menyeret `pg` ke dalam
 * bundel peramban.
 *
 * Satu salinan tidak dapat ikut ke sini: CHECK pada db/schema.sql. SQL tidak
 * dapat membaca TypeScript, jadi angkanya tertulis di sana apa adanya — dan
 * tertulis pula di komentarnya bahwa ia harus bergerak bersama berkas ini.
 */

/**
 * Lampiran yang dikirim utuh dalam satu permintaan.
 *
 * Tiga megabita, dan alasannya bukan kolomnya melainkan jalannya: badan
 * permintaan di Vercel berhenti di 4,5 MB, sedangkan base64 membengkakkan
 * berkas sepertiga. Berkas 3 MB menjadi 4 MB di kawat — sudah mepet, dan apa
 * pun di atasnya diputus di tepi jaringan sebelum mencapai kode aplikasi.
 *
 * Yang ingin melampauinya tidak menaikkan angka ini, melainkan pindah ke
 * jalur bertahap. Lihat titipBerkas().
 */
export const BATAS_LANGSUNG = 3 * 1024 * 1024;

/** Berkas memo dan lampirannya. Memo skema kerap pindaian beberapa halaman. */
export const BATAS_MEMO = 10 * 1024 * 1024;

/**
 * Dokumen full sign.
 *
 * Dua puluh megabita. Pindaian yang memicu batas ini dinaikkan berukuran 9,94
 * MB untuk dua belas halaman — sekitar 830 KB per halaman, dan itu pindaian
 * yang wajar, bukan yang berlebihan. Pada batas sepuluh megabita, dokumen
 * tiga belas halaman dengan mutu yang sama sudah tertolak lagi: ruang yang
 * tersisa hanya enam puluh kilobita, kurang dari satu halaman.
 */
export const BATAS_FULL_SIGN = 20 * 1024 * 1024;

/**
 * Plafon ruang titipan berkas bertahap.
 *
 * Bukan aturan bagi satu fitur, melainkan atap bagi ruang titipannya: sebesar
 * konsumen terbesarnya, supaya tidak ada yang tertolak di tengah pengiriman
 * oleh batas yang bukan batasnya sendiri. Batas tiap fitur ditegakkan saat
 * berkasnya disimpan, bukan saat potongannya dititipkan.
 */
export const PLAFON_TITIPAN = Math.max(BATAS_MEMO, BATAS_FULL_SIGN);

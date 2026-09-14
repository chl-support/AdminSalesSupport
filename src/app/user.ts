/**
 * Identitas pengguna yang dipakai bersama antar menu konsol.
 *
 * Sebelum ada menu kedua, "Masuk sebagai" cukup hidup di state konsol. Begitu
 * jejak audit punya halamannya sendiri dan kewenangan mulai bergantung pada
 * peran, pilihan itu harus bertahan saat berpindah halaman — kalau tidak, setiap
 * perpindahan diam-diam mengembalikan pengguna ke admin dan layar menampilkan
 * kewenangan milik orang lain.
 *
 * Ini tetap identitas prototipe (header X-User, lihat lib/api.ts). Penyimpanan
 * di peramban tidak menambah maupun mengurangi wewenang: seluruh pemeriksaan
 * peran dijalankan di server.
 */

export const USERS: [string, string][] = [
  ["admin", "Admin Sales"],
  ["ratna", "Finance (Pajak)"],
  ["ratih", "Finance (Pembayaran)"],
  ["fmanager", "Finance Manager"],
  ["headfin", "Head Finance"],
  ["mgmt", "Management"],
  ["sysadmin", "Admin Sistem"],
];

const KUNCI = "klaim.pengguna";
const BAWAAN = "admin";

/**
 * Hanya boleh dipanggil setelah komponen terpasang.
 *
 * Membacanya saat render akan berbeda antara server dan peramban dan merusak
 * hidrasi; localStorage juga dapat melempar di mode penyamaran atau ketika data
 * situs diblokir, sehingga setiap aksesnya dibungkus try/catch.
 */
export function bacaPengguna(): string {
  try {
    const v = localStorage.getItem(KUNCI);
    if (v && USERS.some(([u]) => u === v)) return v;
  } catch {
    /* penyimpanan tidak tersedia — pakai bawaan */
  }
  return BAWAAN;
}

export function simpanPengguna(username: string): void {
  try {
    localStorage.setItem(KUNCI, username);
  } catch {
    /* penyimpanan tidak tersedia — pilihan berlaku untuk halaman ini saja */
  }
}

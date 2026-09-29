/**
 * Pengenal berkas lembar kerja.
 *
 * Berdiri sendiri, terpisah dari pembedahnya di memo-excel.ts, karena layar
 * unggah juga perlu mengenali jenis ini — sementara pembedahnya membawa
 * exceljs yang berukuran sekitar satu megabita. Disatukan, setiap orang yang
 * membuka layar Referensi Pengajuan ikut mengunduh pembedah yang hanya
 * dijalankan di server.
 */

/**
 * Apakah berkas ini lembar kerja yang dapat dibaca skemanya.
 *
 * Hanya .xlsx dan .xlsm. Format .xls yang lama berupa berkas biner tersendiri
 * yang tidak dikenali pembacanya, dan memaksanya masuk hanya menghasilkan
 * kegagalan yang tidak bisa dijelaskan kepada yang mengunggah.
 */
export function bisaDibacaExcel(nama: string, tipe = ""): boolean {
  if (/\.xls[xm]$/i.test(nama)) return true;
  return tipe === "application/vnd.openxmlformats-officedocument" +
                  ".spreadsheetml.sheet";
}

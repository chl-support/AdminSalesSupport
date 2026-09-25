"use client";

/**
 * Referensi Pengajuan.
 *
 * Butir menunya sudah berdiri, isinya belum diputuskan. Layar ini memakai
 * BelumSiap supaya menekan menunya berakhir di kerangka konsol yang berbahasa
 * sama dengan sisanya — bukan pada halaman 404 bawaan Next.js, yang terbaca
 * seperti sistemnya rusak.
 *
 * Tidak ada satu pun kalimat di sini yang menjanjikan layar ini akan berisi
 * apa, sebab itu memang belum ditentukan.
 */

import { BelumSiap } from "../../belum-siap";

export default function ReferensiPengajuanPage() {
  return <BelumSiap judul={{ id: "Referensi Pengajuan",
                             en: "Submission Reference" }} />;
}

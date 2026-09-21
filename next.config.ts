import type { NextConfig } from "next";

const config: NextConfig = {
  // `pg` dan `exceljs` memakai API Node dan tidak boleh dibundel untuk edge runtime.
  //
  // `pdfjs-dist` ikut di sini karena alasan yang berbeda: ia memuat berkasnya
  // sendiri saat berjalan — peta huruf standar dan modul pekerjanya — lewat
  // lintasan relatif terhadap dirinya. Dibundel, lintasan itu tidak lagi
  // menunjuk ke mana pun dan pembacaan PDF gagal diam-diam, mengembalikan teks
  // kosong seolah-olah berkasnya memang pindaian.
  serverExternalPackages: ["pg", "exceljs", "pdfjs-dist"],

  // db/schema.sql dibaca dari disk saat runtime oleh /api/admin/setup. Tanpa
  // disertakan di sini, file tracing Vercel tidak akan mengikutkannya dan
  // endpoint penyiapan gagal dengan ENOENT setelah deploy.
  outputFileTracingIncludes: {
    "/api/admin/setup": ["./db/schema.sql"],
  },
};

export default config;

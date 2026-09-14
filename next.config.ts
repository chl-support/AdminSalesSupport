import type { NextConfig } from "next";

const config: NextConfig = {
  // `pg` dan `exceljs` memakai API Node dan tidak boleh dibundel untuk edge runtime.
  serverExternalPackages: ["pg", "exceljs"],

  // db/schema.sql dibaca dari disk saat runtime oleh /api/admin/setup. Tanpa
  // disertakan di sini, file tracing Vercel tidak akan mengikutkannya dan
  // endpoint penyiapan gagal dengan ENOENT setelah deploy.
  outputFileTracingIncludes: {
    "/api/admin/setup": ["./db/schema.sql"],
  },
};

export default config;

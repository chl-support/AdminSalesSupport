import type { NextConfig } from "next";

const config: NextConfig = {
  // `pg` dan `exceljs` memakai API Node dan tidak boleh dibundel untuk edge runtime.
  serverExternalPackages: ["pg", "exceljs"],
};

export default config;

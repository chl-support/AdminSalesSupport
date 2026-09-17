import type { Metadata } from "next";
import "./globals.css";
import { PenyediaBahasa } from "./bahasa";

export const metadata: Metadata = {
  title: "CHL Sales Admin System",
  description:
    "Sistem klaim Closing Fee, Komisi, Cash Reward, dan Overriding dengan " +
    "verifikasi tanda tangan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang="id" hanya nilai awal; PenyediaBahasa menggantinya di peramban
    // begitu pilihan tersimpan terbaca.
    <html lang="id">
      <body><PenyediaBahasa>{children}</PenyediaBahasa></body>
    </html>
  );
}

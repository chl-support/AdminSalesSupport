import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHL Support — Klaim Insentif Marketing",
  description:
    "Sistem klaim Closing Fee, Komisi, Cash Reward, dan Overriding dengan " +
    "verifikasi tanda tangan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

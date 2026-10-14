import type { Metadata } from "next";
import "./globals.css";
import { PenyediaBahasa } from "./bahasa";
import { PenyediaMenu } from "./nav";

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
      {/* PenyediaMenu di sini, bukan di dalam kerangka tiap halaman:
          keadaan menu harus bertahan melintasi perpindahan layar.
          Terpasang di dalam kerangka, ia terpasang ulang tiap kali
          layarnya berganti — dan butir yang baru saja ditekan
          terlupakan persis pada perpindahan yang disebabkannya.

          Halaman di luar konsol ikut terbungkus, dan itu tidak apa:
          yang tidak memanggil <Nav> maupun <Kerangka> tidak pernah
          membaca isinya. */}
      <body>
        <PenyediaBahasa>
          <PenyediaMenu>{children}</PenyediaMenu>
        </PenyediaBahasa>
      </body>
    </html>
  );
}

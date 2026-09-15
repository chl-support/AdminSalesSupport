"use client";

/**
 * Navigasi antar menu konsol.
 *
 * Sengaja tidak dipasang di layout akar: layar tanda tangan agent (/sign/[token])
 * dibuka orang luar lewat tautan WhatsApp, dan menampilkan menu internal di sana
 * membocorkan struktur sistem sekaligus mengundang klik yang akan berakhir 401.
 * Halaman yang memang bagian dari konsol memanggilnya sendiri.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Menu, beserta peran yang boleh melihatnya.
 *
 * `peran: null` berarti terbuka untuk semua. Menyembunyikan menu hanya
 * kerapian — setiap endpoint di belakangnya tetap memeriksa perannya sendiri,
 * jadi mengetikkan alamatnya langsung tidak memberi akses apa pun.
 */
const MENU: { href: string; label: string; peran: string[] | null }[] = [
  // Ajukan klaim lebih dulu: itu yang dikerjakan tiap hari, sedangkan konsol
  // dibuka untuk menindaklanjuti klaim yang sudah ada.
  { href: "/klaim", label: "Ajukan klaim", peran: null },
  { href: "/konsol", label: "Konsol klaim", peran: null },
  { href: "/audit", label: "Jejak audit", peran: null },
  // Administrasi hanya untuk Admin Sistem. "Ganti sandi saya" tetap dapat
  // dicapai semua peran lewat tautan pada bilah pengguna — menyembunyikan
  // menunya tidak boleh ikut menutup satu-satunya jalan orang mengganti
  // sandinya sendiri.
  { href: "/admin", label: "Administrasi", peran: ["admin_system"] },
];

export function Nav({ peran }: { peran?: string }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {MENU.filter((m) => !m.peran || (peran && m.peran.includes(peran)))
           .map(({ href, label }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

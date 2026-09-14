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
  { href: "/", label: "Konsol klaim", peran: null },
  { href: "/klaim", label: "Ajukan klaim", peran: null },
  { href: "/audit", label: "Jejak audit", peran: null },
  // Administrasi terbuka bagi semua peran karena memuat "ganti sandi saya";
  // isinya sendiri yang menyesuaikan dengan peran pembukanya.
  { href: "/admin", label: "Administrasi", peran: null },
];

export function Nav({ peran }: { peran?: string }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {MENU.filter((m) => !m.peran || (peran && m.peran.includes(peran)))
           .map(({ href, label }) => {
        // "/" cocok persis saja, kalau tidak ia akan selalu terpilih.
        const active = href === "/" ? path === "/" : path.startsWith(href);
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

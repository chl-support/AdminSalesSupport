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

const MENU: [string, string][] = [
  ["/", "Konsol klaim"],
  ["/audit", "Jejak audit"],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {MENU.map(([href, label]) => {
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

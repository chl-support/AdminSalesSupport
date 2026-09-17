"use client";

/**
 * Navigasi konsol — kolom di sebelah kiri.
 *
 * Sebelumnya berupa deretan mendatar di kepala halaman. Bentuk itu tidak
 * menyisakan tempat untuk susunan bertingkat, dan susunan bertingkat memang
 * diperlukan: sebagian bab hanya wadah, isinya ada pada anaknya.
 *
 * Sengaja tidak dipasang di layout akar: layar tanda tangan agent
 * (/sign/[token]) dan layar pendaftaran spesimen (/daftar-ttd/[token]) dibuka
 * orang luar lewat tautan WhatsApp. Menampilkan menu internal di sana
 * membocorkan struktur sistem sekaligus mengundang klik yang akan berakhir 401.
 * Halaman yang memang bagian dari konsol memanggilnya lewat <Kerangka>.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

type Butir = {
  /** Kosong berarti bab ini hanya wadah: ia tidak punya layar sendiri. */
  href?: string;
  label: string; peran?: string[] | null; anak?: Butir[];
};

/**
 * Menu, beserta peran yang boleh melihatnya.
 *
 * `peran` kosong berarti terbuka untuk semua. Menyembunyikan menu hanya
 * kerapian — setiap endpoint di belakangnya tetap memeriksa perannya sendiri,
 * jadi mengetikkan alamatnya langsung tidak memberi akses apa pun.
 */
const MENU: Butir[] = [
  // Data Marketing hanya wadah: yang punya layar adalah anaknya. Menaruh layar
  // pada wadahnya sekaligus pada anaknya berarti dua tempat menampilkan hal
  // yang sama, dan yang satu cepat atau lambat tertinggal dari yang lain.
  {
    label: "Data Marketing", peran: ["admin_sales", "admin_system"],
    anak: [{ href: "/spesimen", label: "Spesimen Tanda Tangan" }],
  },
  // Jenis fee dipilih di dalam layarnya lewat daftar pilihan, bukan lewat empat
  // butir menu. Keduanya sekaligus berarti dua jalan menuju layar yang sama,
  // dan yang satu selalu lebih pendek — yang lain lalu hanya menambah panjang
  // kolom menu.
  { href: "/klaim", label: "Pengajuan Fee" },
  { href: "/memo", label: "Memo Approval" },
  { href: "/sirkulasi", label: "Sirkulasi Dokumen" },
  { href: "/konsol", label: "Approval / Persetujuan" },
  { href: "/laporan", label: "Report / Laporan" },
  { href: "/audit", label: "Jejak audit" },
  // Administrasi hanya untuk Admin IT.
  { href: "/admin", label: "Administrasi", peran: ["admin_system"] },
];

const boleh = (b: Butir, peran?: string) =>
  !b.peran || (peran ? b.peran.includes(peran) : false);

export function Nav({ peran }: { peran?: string }) {
  const path = usePathname();
  // Cocok persis, atau induk dari lintasan sekarang. `startsWith` telanjang
  // akan membuat "/klaim" terpilih bersamaan dengan "/klaim/komisi".
  const aktif = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <nav className="nav">
      {MENU.filter((m) => boleh(m, peran)).map((m) => (
        <div key={m.href ?? m.label} className="grup">
          {m.href ? (
            <Link href={m.href} className={aktif(m.href) ? "active" : ""}
                  aria-current={aktif(m.href) ? "page" : undefined}>
              {m.label}
            </Link>
          ) : (
            // Wadah tanpa layar ditulis sebagai teks, bukan tautan mati:
            // tautan yang tidak menuju ke mana-mana akan diklik berulang kali
            // sebelum orangnya menyimpulkan ia memang tidak berfungsi.
            <span className="wadah">{m.label}</span>
          )}
          {m.anak && (
            <div className="anak">
              {m.anak.filter((a) => boleh(a, peran)).map((a) => (
                <Link key={a.href} href={a.href!}
                      className={aktif(a.href!) ? "active" : ""}
                      aria-current={aktif(a.href!) ? "page" : undefined}>
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
